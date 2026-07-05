const express = require('express');
const db = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { ESTADOS, getSolicitudFull } = require('../services/solicitudService');
const { notifyReporteRetiro, notifyReporteEntrega } = require('../services/emailService');

const router = express.Router();

function getReportes(solicitudId) {
  const reportes = db.prepare(`
    SELECT r.*, u.nombre AS transportista_nombre
    FROM reportes r
    JOIN users u ON u.id = r.transportista_id
    WHERE r.solicitud_id = ?
    ORDER BY r.created_at ASC
  `).all(solicitudId);

  return reportes.map(r => ({
    ...r,
    fotos: db.prepare('SELECT id, filename, filepath FROM reporte_fotos WHERE reporte_id = ?').all(r.id)
      .map(f => ({ ...f, url: `/uploads/reportes/${f.filename}` }))
  }));
}

router.get('/solicitud/:id', authRequired, (req, res) => {
  const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(req.params.id);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (req.user.rol === 'cliente' && solicitud.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  if (req.user.rol === 'transportista' && solicitud.transportista_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  res.json({ reportes: getReportes(solicitud.id) });
});

router.post('/retiro/:solicitudId', authRequired, requireRole('transportista'), upload.array('fotos', 10), (req, res) => {
  try {
    const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ? AND transportista_id = ?')
      .get(req.params.solicitudId, req.user.id);

    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (solicitud.estado !== ESTADOS.PAGO_RETENIDO) {
      return res.status(400).json({ error: 'El pago debe estar confirmado antes de iniciar retiro' });
    }

    const existing = db.prepare(`SELECT id FROM reportes WHERE solicitud_id = ? AND tipo = 'retiro'`).get(solicitud.id);
    if (existing) return res.status(409).json({ error: 'Ya existe un reporte de retiro' });

    if (!req.files?.length) return res.status(400).json({ error: 'Debes subir al menos una foto' });

    const { comentarios, detalles } = req.body;
    const result = db.prepare(`
      INSERT INTO reportes (solicitud_id, transportista_id, tipo, comentarios, detalles)
      VALUES (?, ?, 'retiro', ?, ?)
    `).run(solicitud.id, req.user.id, comentarios?.trim() || null, detalles?.trim() || null);

    const insertFoto = db.prepare('INSERT INTO reporte_fotos (reporte_id, filename, filepath) VALUES (?, ?, ?)');
    for (const file of req.files) {
      insertFoto.run(result.lastInsertRowid, file.filename, file.path);
    }

    db.prepare(`UPDATE solicitudes SET estado = ? WHERE id = ?`).run(ESTADOS.EN_TRANSITO, solicitud.id);

    const reporte = db.prepare('SELECT * FROM reportes WHERE id = ?').get(result.lastInsertRowid);
    const sol = getSolicitudFull(solicitud.id);

    notifyReporteRetiro({
      cliente: { email: sol.cliente_email, nombre: sol.cliente_nombre },
      solicitud: sol,
      reporte,
      fotosCount: req.files.length
    }).catch(err => console.error('[email]', err.message));

    res.status(201).json({ reporte, reportes: getReportes(solicitud.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/entrega/:solicitudId', authRequired, requireRole('transportista'), upload.array('fotos', 10), (req, res) => {
  try {
    const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ? AND transportista_id = ?')
      .get(req.params.solicitudId, req.user.id);

    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (![ESTADOS.EN_TRANSITO, ESTADOS.EN_RETIRO].includes(solicitud.estado)) {
      return res.status(400).json({ error: 'La máquina debe estar en tránsito para reportar entrega' });
    }

    const existing = db.prepare(`SELECT id FROM reportes WHERE solicitud_id = ? AND tipo = 'entrega'`).get(solicitud.id);
    if (existing) return res.status(409).json({ error: 'Ya existe un reporte de entrega' });

    const { comentarios, detalles, receptor_nombre, receptor_rut, receptor_telefono, receptor_email } = req.body;
    if (!receptor_nombre?.trim()) return res.status(400).json({ error: 'Nombre del receptor es obligatorio' });
    if (!req.files?.length) return res.status(400).json({ error: 'Debes subir proof of delivery (fotos)' });

    const result = db.prepare(`
      INSERT INTO reportes (solicitud_id, transportista_id, tipo, comentarios, detalles,
        receptor_nombre, receptor_rut, receptor_telefono, receptor_email)
      VALUES (?, ?, 'entrega', ?, ?, ?, ?, ?, ?)
    `).run(
      solicitud.id, req.user.id,
      comentarios?.trim() || null, detalles?.trim() || null,
      receptor_nombre.trim(), receptor_rut?.trim() || null,
      receptor_telefono?.trim() || null, receptor_email?.trim() || null
    );

    const insertFoto = db.prepare('INSERT INTO reporte_fotos (reporte_id, filename, filepath) VALUES (?, ?, ?)');
    for (const file of req.files) {
      insertFoto.run(result.lastInsertRowid, file.filename, file.path);
    }

    const autoConfirmAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`
      UPDATE solicitudes SET estado = ?, auto_confirm_at = ? WHERE id = ?
    `).run(ESTADOS.ENTREGA_REPORTADA, autoConfirmAt, solicitud.id);

    const reporte = db.prepare('SELECT * FROM reportes WHERE id = ?').get(result.lastInsertRowid);
    const sol = getSolicitudFull(solicitud.id);

    notifyReporteEntrega({
      cliente: { email: sol.cliente_email, nombre: sol.cliente_nombre },
      solicitud: sol,
      reporte,
      autoConfirmAt
    }).catch(err => console.error('[email]', err.message));

    res.status(201).json({ reporte, reportes: getReportes(solicitud.id), auto_confirm_at: autoConfirmAt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
