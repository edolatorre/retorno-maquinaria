const express = require('express');
const db = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { notifyNuevaOferta } = require('../services/emailService');

const router = express.Router();

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
    req.user.id,
    tipo_maquina.trim(),
    marca.trim(),
    modelo.trim(),
    peso.trim(),
    dimensiones.trim(),
    fecha_retiro,
    origen.trim(),
    destino.trim(),
    comentarios?.trim() || null
  );

  const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ solicitud });
});

router.get('/mis-solicitudes', authRequired, requireRole('cliente'), (req, res) => {
  const solicitudes = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM ofertas o WHERE o.solicitud_id = s.id) AS num_ofertas
    FROM solicitudes s
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `).all(req.user.id);
  res.json({ solicitudes });
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

router.get('/:id', authRequired, (req, res) => {
  const solicitud = db.prepare(`
    SELECT s.*, u.nombre AS cliente_nombre, u.empresa AS cliente_empresa
    FROM solicitudes s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (req.user.rol === 'cliente' && solicitud.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const ofertas = db.prepare(`
    SELECT o.*, u.nombre AS transportista_nombre, u.empresa AS transportista_empresa, u.telefono AS transportista_telefono
    FROM ofertas o
    JOIN users u ON u.id = o.transportista_id
    WHERE o.solicitud_id = ?
    ORDER BY o.valor ASC
  `).all(solicitud.id);

  res.json({ solicitud, ofertas });
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

  const existing = db.prepare('SELECT id FROM ofertas WHERE solicitud_id = ? AND transportista_id = ?').get(solicitudId, req.user.id);
  if (existing) {
    return res.status(409).json({ error: 'Ya enviaste una oferta para esta solicitud' });
  }

  const result = db.prepare(`
    INSERT INTO ofertas (solicitud_id, transportista_id, valor, fecha_carga, fecha_entrega, comentarios)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(solicitudId, req.user.id, Number(valor), fecha_carga, fecha_entrega, comentarios?.trim() || null);

  db.prepare("UPDATE solicitudes SET estado = 'en_oferta' WHERE id = ? AND estado = 'abierta'").run(solicitudId);

  const oferta = db.prepare('SELECT * FROM ofertas WHERE id = ?').get(result.lastInsertRowid);

  const cliente = db.prepare('SELECT id, email, nombre FROM users WHERE id = ?').get(solicitud.user_id);
  const transportista = db.prepare('SELECT id, nombre, empresa, telefono FROM users WHERE id = ?').get(req.user.id);

  notifyNuevaOferta({ cliente, solicitud, oferta, transportista }).catch(err => {
    console.error('[email] Error al notificar oferta:', err.message);
  });

  res.status(201).json({ oferta });
});

module.exports = router;
