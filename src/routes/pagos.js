const express = require('express');
const db = require('../db');
const config = require('../config');
const { authRequired, requireRole } = require('../middleware/auth');
const { ESTADOS, getSolicitudFull, releasePayment } = require('../services/solicitudService');
const khipu = require('../services/khipuService');
const { createCheckout, verifyExternalPayment } = require('../services/paymentService');
const { notifyPagoRecibido } = require('../services/emailService');

const router = express.Router();

function markPaid(pagoId, externalPaymentId) {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(pagoId);
  if (!pago || ['retenido', 'liberado'].includes(pago.estado)) return null;

  db.prepare(`
    UPDATE pagos SET estado = 'retenido', mp_payment_id = ?, paid_at = datetime('now') WHERE id = ?
  `).run(externalPaymentId || `sim-${pagoId}`, pagoId);

  db.prepare(`UPDATE solicitudes SET estado = ? WHERE id = ?`)
    .run(ESTADOS.PAGO_RETENIDO, pago.solicitud_id);

  const sol = getSolicitudFull(pago.solicitud_id);
  notifyPagoRecibido({
    cliente: { email: sol.cliente_email, nombre: sol.cliente_nombre },
    transportista: { email: sol.transportista_email, nombre: sol.transportista_nombre },
    solicitud: sol,
    monto: pago.monto
  }).catch(err => console.error('[email]', err.message));

  return db.prepare('SELECT * FROM pagos WHERE id = ?').get(pagoId);
}

router.get('/mis-pagos', authRequired, (req, res) => {
  let pagos;
  if (req.user.rol === 'cliente') {
    pagos = db.prepare(`
      SELECT p.*, s.tipo_maquina, s.marca, s.modelo, s.origen, s.destino, s.estado AS solicitud_estado,
        t.nombre AS transportista_nombre
      FROM pagos p
      JOIN solicitudes s ON s.id = p.solicitud_id
      JOIN users t ON t.id = p.transportista_id
      WHERE p.cliente_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  } else if (req.user.rol === 'transportista') {
    pagos = db.prepare(`
      SELECT p.*, s.tipo_maquina, s.marca, s.modelo, s.origen, s.destino, s.estado AS solicitud_estado,
        c.nombre AS cliente_nombre
      FROM pagos p
      JOIN solicitudes s ON s.id = p.solicitud_id
      JOIN users c ON c.id = p.cliente_id
      WHERE p.transportista_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  } else {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  res.json({ pagos });
});

router.post('/crear/:solicitudId', authRequired, requireRole('cliente'), async (req, res) => {
  try {
    const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ? AND user_id = ?')
      .get(req.params.solicitudId, req.user.id);
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (!['oferta_seleccionada', 'pago_pendiente'].includes(solicitud.estado)) {
      return res.status(400).json({ error: 'Debes seleccionar una oferta antes de pagar' });
    }

    const oferta = db.prepare('SELECT * FROM ofertas WHERE id = ? AND estado = ?')
      .get(solicitud.oferta_id, 'aceptada');
    if (!oferta) return res.status(400).json({ error: 'Oferta no válida' });

    let pago = db.prepare('SELECT * FROM pagos WHERE solicitud_id = ?').get(solicitud.id);
    if (!pago) {
      const comision = Math.round(oferta.valor * (config.comisionPct / 100));
      const result = db.prepare(`
        INSERT INTO pagos (solicitud_id, oferta_id, cliente_id, transportista_id, monto, comision, estado)
        VALUES (?, ?, ?, ?, ?, ?, 'pendiente')
      `).run(solicitud.id, oferta.id, req.user.id, oferta.transportista_id, oferta.valor, comision);
      pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(result.lastInsertRowid);
    }

    if (pago.estado === 'retenido') {
      return res.json({ pago, alreadyPaid: true });
    }

    const solFull = getSolicitudFull(solicitud.id);
    const checkout = await createCheckout({ solicitud: solFull, oferta, pagoId: pago.id });

    db.prepare('UPDATE pagos SET mp_preference_id = ? WHERE id = ?')
      .run(checkout.id, pago.id);
    db.prepare(`UPDATE solicitudes SET estado = ? WHERE id = ?`)
      .run(ESTADOS.PAGO_PENDIENTE, solicitud.id);

    res.json({
      pago,
      checkoutUrl: checkout.checkoutUrl,
      provider: checkout.provider,
      simulated: checkout.simulated,
      publicKey: config.mercadopago.publicKey
    });
  } catch (err) {
    console.error('[pagos]', err);
    res.status(500).json({ error: err.message || 'Error al crear pago' });
  }
});

router.post('/simular/:pagoId', authRequired, requireRole('cliente'), (req, res) => {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND cliente_id = ?')
    .get(req.params.pagoId, req.user.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  const updated = markPaid(pago.id, `sim-${pago.id}`);
  res.json({ pago: updated });
});

router.post('/webhook', express.json(), async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment' && data?.id) {
      const payment = await verifyExternalPayment('mercadopago', data.id);
      if (payment?.external_reference) {
        markPaid(Number(payment.external_reference), String(data.id));
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook MP]', err);
    res.status(200).send('OK');
  }
});

router.post('/khipu/webhook', express.urlencoded({ extended: true }), express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const notificationToken = req.query.notification_token || body.notification_token;
    const apiVersion = req.query.api_version || body.api_version;

    if (notificationToken && apiVersion === '1.3') {
      const payment = await khipu.getPayment(notificationToken);
      if (khipu.isPaymentDone(payment) && payment.transaction_id) {
        markPaid(Number(payment.transaction_id), payment.payment_id || notificationToken);
      }
      return res.status(200).send('OK');
    }

    const pagoId = body.transaction_id ? Number(body.transaction_id) : null;
    const paymentId = body.payment_id;

    if (pagoId && paymentId) {
      markPaid(pagoId, paymentId);
      return res.status(200).send('OK');
    }

    if (paymentId) {
      const payment = await khipu.getPayment(paymentId);
      if (khipu.isPaymentDone(payment) && payment.transaction_id) {
        markPaid(Number(payment.transaction_id), paymentId);
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook Khipu]', err);
    res.status(200).send('OK');
  }
});

router.get('/estado/:pagoId', authRequired, requireRole('cliente'), async (req, res) => {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND cliente_id = ?')
    .get(req.params.pagoId, req.user.id);
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

  if (pago.estado === 'pendiente' && pago.mp_preference_id && config.paymentProvider === 'khipu') {
    try {
      const payment = await khipu.getPayment(pago.mp_preference_id);
      if (khipu.isPaymentDone(payment)) {
        markPaid(pago.id, payment.payment_id || pago.mp_preference_id);
        const updated = db.prepare('SELECT * FROM pagos WHERE id = ?').get(pago.id);
        return res.json({ pago: updated });
      }
    } catch (err) {
      console.error('[pagos/estado]', err.message);
    }
  }

  res.json({ pago });
});

router.post('/confirmar-entrega/:solicitudId', authRequired, requireRole('cliente'), (req, res) => {
  const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ? AND user_id = ?')
    .get(req.params.solicitudId, req.user.id);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (solicitud.estado !== ESTADOS.ENTREGA_REPORTADA) {
    return res.status(400).json({ error: 'No hay entrega pendiente de confirmación' });
  }

  const pago = releasePayment(solicitud.id, { auto: false });
  const sol = getSolicitudFull(solicitud.id);

  res.json({ solicitud: sol, pago });
});

module.exports = router;
