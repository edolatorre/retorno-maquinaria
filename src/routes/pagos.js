const express = require('express');
const db = require('../db');
const config = require('../config');
const { authRequired, requireRole } = require('../middleware/auth');
const { ESTADOS, getSolicitudFull, releasePayment } = require('../services/solicitudService');
const { createPreference, getPayment } = require('../services/mercadopagoService');
const { notifyPagoRecibido } = require('../services/emailService');

const router = express.Router();

function markPaid(pagoId, mpPaymentId) {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(pagoId);
  if (!pago || ['retenido', 'liberado'].includes(pago.estado)) return null;

  db.prepare(`
    UPDATE pagos SET estado = 'retenido', mp_payment_id = ?, paid_at = datetime('now') WHERE id = ?
  `).run(mpPaymentId || `sim-${pagoId}`, pagoId);

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
    const preference = await createPreference({ solicitud: solFull, oferta, pagoId: pago.id });

    db.prepare('UPDATE pagos SET mp_preference_id = ? WHERE id = ?')
      .run(preference.id, pago.id);
    db.prepare(`UPDATE solicitudes SET estado = ? WHERE id = ?`)
      .run(ESTADOS.PAGO_PENDIENTE, solicitud.id);

    const checkoutUrl = preference.init_point || preference.sandbox_init_point;
    res.json({ pago, checkoutUrl, publicKey: config.mercadopago.publicKey, simulated: !!preference.simulated });
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
      const payment = await getPayment(data.id);
      if (payment?.external_reference && payment.status === 'approved') {
        markPaid(Number(payment.external_reference), String(data.id));
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook MP]', err);
    res.status(200).send('OK');
  }
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
