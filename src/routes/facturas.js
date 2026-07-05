const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  let facturas;
  if (req.user.rol === 'cliente') {
    facturas = db.prepare(`
      SELECT f.*, s.tipo_maquina, s.marca, s.modelo, s.origen, s.destino
      FROM facturas f
      JOIN solicitudes s ON s.id = f.solicitud_id
      WHERE s.user_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.id);
  } else if (req.user.rol === 'transportista') {
    facturas = db.prepare(`
      SELECT f.*, s.tipo_maquina, s.marca, s.modelo, s.origen, s.destino
      FROM facturas f
      JOIN solicitudes s ON s.id = f.solicitud_id
      WHERE s.transportista_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.id);
  } else if (req.user.rol === 'admin') {
    facturas = db.prepare(`
      SELECT f.*, s.tipo_maquina, s.marca, s.modelo, c.nombre AS cliente_nombre
      FROM facturas f
      JOIN solicitudes s ON s.id = f.solicitud_id
      JOIN users c ON c.id = s.user_id
      ORDER BY f.created_at DESC
    `).all();
  } else {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  res.json({ facturas });
});

router.get('/:id', authRequired, (req, res) => {
  const factura = db.prepare(`
    SELECT f.*, s.*, c.nombre AS cliente_nombre, c.email AS cliente_email, c.rut AS cliente_rut,
      t.nombre AS transportista_nombre, p.monto, p.comision, p.paid_at, p.released_at
    FROM facturas f
    JOIN solicitudes s ON s.id = f.solicitud_id
    JOIN users c ON c.id = s.user_id
    JOIN pagos p ON p.id = f.pago_id
    LEFT JOIN users t ON t.id = s.transportista_id
    WHERE f.id = ?
  `).get(req.params.id);

  if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

  if (req.user.rol === 'cliente' && factura.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  if (req.user.rol === 'transportista' && factura.transportista_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  res.json({ factura });
});

module.exports = router;
