const express = require('express');
const db = require('../db');
const config = require('../config');
const { authRequired, requireRole } = require('../middleware/auth');
const { notifyNuevaOferta, notifyOfertaSeleccionada } = require('../services/emailService');
const { ESTADOS, getSolicitudFull } = require('../services/solicitudService');

const router = express.Router();

const ESTADOS_VALIDOS = Object.values(ESTADOS);

function getReportesSummary(solicitudId) {
  return db.prepare(`
    SELECT tipo, COUNT(*) as n FROM reportes WHERE solicitud_id = ? GROUP BY tipo
  `).all(solicitudId);
}

router.post('/', authRequired, requireRole('cliente'), (req, res) => {
  const { tipo_maquina, marca, modelo, peso, dimensiones, fecha_retiro, origen, destino, comentarios } = req.body;
  const required = { tipo_maquina, marca, modelo, peso, dimensiones, fecha_retiro, origen, destino };
  for (const [key, val] of Object.entries(required)) {
    if (!val || !String(val).trim()) {
      return res.status(400).json({ error: `El campo "${key}" es obligatorio` });
    }
  }

  const result = db.prepare(`
    INSERT INTO solicitudes (user_id, tipo_maquina, marca, modelo, peso, dimensiones, fecha_retiro, origen, destino, comentarios)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, tipo_maquina.trim(), marca.trim(), modelo.trim(), peso.trim(),
    dimensiones.trim(), fecha_retiro, origen.trim(), destino.trim(), comentarios?.trim() || null
  );

  res.status(201).json({ solicitud: db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(result.lastInsertRowid) });
});

router.get('/mis-solicitudes', authRequired, requireRole('cliente'), (req, res) => {
  const { estado } = req.query;
  let sql = `
    SELECT s.*, (SELECT COUNT(*) FROM ofertas o WHERE o.solicitud_id = s.id) AS num_ofertas,
      p.estado AS pago_estado, p.monto AS pago_monto
    FROM solicitudes s
    LEFT JOIN pagos p ON p.solicitud_id = s.id
    WHERE s.user_id = ?
  `;
  const params = [req.user.id];
  if (estado && estado !== 'todas') {
    sql += ' AND s.estado = ?';
    params.push(estado);
  }
  sql += ' ORDER BY s.created_at DESC';
  res.json({ solicitudes: db.prepare(sql).all(...params), estados: ESTADOS_VALIDOS });
});

router.get('/disponibles', authRequired, requireRole('transportista'), (req, res) => {
  const solicitudes = db.prepare(`
    SELECT s.*, u.nombre AS cliente_nombre, u.empresa AS cliente_empresa,
      (SELECT COUNT(*) FROM ofertas o WHERE o.solicitud_id = s.id AND o.transportista_id = ?) AS ya_oferte
    FROM solicitudes s
    JOIN users u ON u.id = s.user_id
    WHERE s.estado IN ('abierta', 'en_oferta')
    ORDER BY s.fecha_retiro ASC
  `).all(req.user.id);
  res.json({ solicitudes });
});

router.get('/asignadas', authRequired, requireRole('transportista'), (req, res) => {
  const { estado } = req.query;
  let sql = `
    SELECT s.*, u.nombre AS cliente_nombre, u.email AS cliente_email, u.telefono AS cliente_telefono,
      o.valor AS oferta_valor, p.estado AS pago_estado
    FROM solicitudes s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN ofertas o ON o.id = s.oferta_id
    LEFT JOIN pagos p ON p.solicitud_id = s.id
    WHERE s.transportista_id = ?
  `;
  const params = [req.user.id];
  if (estado && estado !== 'todas') {
    sql += ' AND s.estado = ?';
    params.push(estado);
  }
  sql += ' ORDER BY s.created_at DESC';
  res.json({ solicitudes: db.prepare(sql).all(...params), estados: ESTADOS_VALIDOS });
});

router.post('/:id/seleccionar-oferta/:ofertaId', authRequired, requireRole('cliente'), (req, res) => {
  const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (!['abierta', 'en_oferta'].includes(solicitud.estado)) {
    return res.status(400).json({ error: 'Esta solicitud ya no acepta selección de ofertas' });
  }

  const oferta = db.prepare('SELECT * FROM ofertas WHERE id = ? AND solicitud_id = ?')
    .get(req.params.ofertaId, solicitud.id);
  if (!oferta) return res.status(404).json({ error: 'Oferta no encontrada' });

  db.prepare(`UPDATE ofertas SET estado = 'rechazada' WHERE solicitud_id = ? AND id != ?`)
    .run(solicitud.id, oferta.id);
  db.prepare(`UPDATE ofertas SET estado = 'aceptada' WHERE id = ?`).run(oferta.id);
  db.prepare(`
    UPDATE solicitudes SET estado = ?, oferta_id = ?, transportista_id = ? WHERE id = ?
  `).run(ESTADOS.OFERTA_SELECCIONADA, oferta.id, oferta.transportista_id, solicitud.id);

  const sol = getSolicitudFull(solicitud.id);
  const cliente = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const transportista = db.prepare('SELECT * FROM users WHERE id = ?').get(oferta.transportista_id);

  notifyOfertaSeleccionada({ cliente, transportista, solicitud: sol, oferta }).catch(err => {
    console.error('[email]', err.message);
  });

  res.json({
    solicitud: sol,
    contacto: {
      transportista: {
        nombre: transportista.nombre, email: transportista.email,
        telefono: transportista.telefono, empresa: transportista.empresa, rut: transportista.rut
      }
    }
  });
});

router.get('/:id', authRequired, (req, res) => {
  const sol = getSolicitudFull(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (req.user.rol === 'cliente' && sol.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  if (req.user.rol === 'transportista' && sol.transportista_id !== req.user.id
      && !['abierta', 'en_oferta'].includes(sol.estado)) {
    const hasOffer = db.prepare('SELECT id FROM ofertas WHERE solicitud_id = ? AND transportista_id = ?')
      .get(sol.id, req.user.id);
    if (!hasOffer) return res.status(403).json({ error: 'Acceso denegado' });
  }

  const ofertas = db.prepare(`
    SELECT o.*, u.nombre AS transportista_nombre, u.empresa AS transportista_empresa, u.telefono AS transportista_telefono
    FROM ofertas o JOIN users u ON u.id = o.transportista_id
    WHERE o.solicitud_id = ? ORDER BY o.valor ASC
  `).all(sol.id);

  const pago = db.prepare('SELECT * FROM pagos WHERE solicitud_id = ?').get(sol.id);
  const reportes = db.prepare(`
    SELECT r.* FROM reportes r WHERE r.solicitud_id = ? ORDER BY r.created_at
  `).all(sol.id).map(r => ({
    ...r,
    fotos: db.prepare('SELECT id, filename FROM reporte_fotos WHERE reporte_id = ?').all(r.id)
      .map(f => ({ ...f, url: `/uploads/reportes/${f.filename}` }))
  }));

  let contacto = null;
  if (['oferta_seleccionada', 'pago_pendiente', 'pago_retenido', 'en_retiro', 'en_transito', 'entrega_reportada', 'completada'].includes(sol.estado)) {
    contacto = {
      cliente: { nombre: sol.cliente_nombre, email: sol.cliente_email, telefono: sol.cliente_telefono, empresa: sol.cliente_empresa, rut: sol.cliente_rut },
      transportista: sol.transportista_id ? {
        nombre: sol.transportista_nombre, email: sol.transportista_email,
        telefono: sol.transportista_telefono, empresa: sol.transportista_empresa, rut: sol.transportista_rut
      } : null
    };
  }

  res.json({ solicitud: sol, ofertas, pago, reportes, contacto, comisionPct: config.comisionPct });
});

router.post('/:id/ofertas', authRequired, requireRole('transportista'), (req, res) => {
  const { valor, fecha_carga, fecha_entrega, comentarios } = req.body;
  const solicitudId = req.params.id;

  if (!valor || !fecha_carga || !fecha_entrega) {
    return res.status(400).json({ error: 'Valor, fecha de carga y fecha de entrega son obligatorios' });
  }

  const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(solicitudId);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (!['abierta', 'en_oferta'].includes(solicitud.estado)) {
    return res.status(400).json({ error: 'Esta solicitud ya no acepta ofertas' });
  }

  const existing = db.prepare('SELECT id FROM ofertas WHERE solicitud_id = ? AND transportista_id = ?')
    .get(solicitudId, req.user.id);
  if (existing) return res.status(409).json({ error: 'Ya enviaste una oferta para esta solicitud' });

  const result = db.prepare(`
    INSERT INTO ofertas (solicitud_id, transportista_id, valor, fecha_carga, fecha_entrega, comentarios)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(solicitudId, req.user.id, Number(valor), fecha_carga, fecha_entrega, comentarios?.trim() || null);

  db.prepare("UPDATE solicitudes SET estado = 'en_oferta' WHERE id = ? AND estado = 'abierta'").run(solicitudId);

  const oferta = db.prepare('SELECT * FROM ofertas WHERE id = ?').get(result.lastInsertRowid);
  const cliente = db.prepare('SELECT id, email, nombre FROM users WHERE id = ?').get(solicitud.user_id);
  const transportista = db.prepare('SELECT id, nombre, empresa, telefono FROM users WHERE id = ?').get(req.user.id);

  notifyNuevaOferta({ cliente, solicitud, oferta, transportista }).catch(err => console.error('[email]', err.message));
  res.status(201).json({ oferta });
});

module.exports = router;
