const express = require('express');
const db = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authRequired, requireRole('admin'));

router.get('/stats', (req, res) => {
  const stats = {
    usuarios: db.prepare('SELECT COUNT(*) AS n FROM users WHERE rol != \'admin\'').get().n,
    clientes: db.prepare('SELECT COUNT(*) AS n FROM users WHERE rol = \'cliente\'').get().n,
    transportistas: db.prepare('SELECT COUNT(*) AS n FROM users WHERE rol = \'transportista\'').get().n,
    solicitudes: db.prepare('SELECT COUNT(*) AS n FROM solicitudes').get().n,
    ofertas: db.prepare('SELECT COUNT(*) AS n FROM ofertas').get().n,
    solicitudes_abiertas: db.prepare("SELECT COUNT(*) AS n FROM solicitudes WHERE estado IN ('abierta','en_oferta')").get().n
  };
  res.json({ stats });
});

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, email, nombre, telefono, rol, empresa, rut, created_at,
      (SELECT COUNT(*) FROM solicitudes s WHERE s.user_id = users.id) AS num_solicitudes
    FROM users
    WHERE rol != 'admin'
    ORDER BY created_at DESC
  `).all();
  res.json({ users });
});

router.get('/solicitudes', (req, res) => {
  const solicitudes = db.prepare(`
    SELECT s.*, u.nombre AS cliente_nombre, u.email AS cliente_email, u.empresa AS cliente_empresa,
      (SELECT COUNT(*) FROM ofertas o WHERE o.solicitud_id = s.id) AS num_ofertas
    FROM solicitudes s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC
  `).all();
  res.json({ solicitudes });
});

router.get('/ofertas', (req, res) => {
  const ofertas = db.prepare(`
    SELECT o.*,
      s.tipo_maquina, s.marca, s.modelo, s.origen, s.destino,
      c.nombre AS cliente_nombre, c.email AS cliente_email,
      t.nombre AS transportista_nombre, t.email AS transportista_email, t.empresa AS transportista_empresa
    FROM ofertas o
    JOIN solicitudes s ON s.id = o.solicitud_id
    JOIN users c ON c.id = s.user_id
    JOIN users t ON t.id = o.transportista_id
    ORDER BY o.created_at DESC
  `).all();
  res.json({ ofertas });
});

router.get('/solicitudes/:id', (req, res) => {
  const solicitud = db.prepare(`
    SELECT s.*, u.nombre AS cliente_nombre, u.email AS cliente_email, u.empresa AS cliente_empresa, u.telefono AS cliente_telefono
    FROM solicitudes s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const ofertas = db.prepare(`
    SELECT o.*, u.nombre AS transportista_nombre, u.email AS transportista_email, u.empresa AS transportista_empresa, u.telefono AS transportista_telefono
    FROM ofertas o
    JOIN users u ON u.id = o.transportista_id
    WHERE o.solicitud_id = ?
    ORDER BY o.valor ASC
  `).all(solicitud.id);

  res.json({ solicitud, ofertas });
});

module.exports = router;
