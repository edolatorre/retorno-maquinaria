const db = require('../db');
const config = require('../config');

const ESTADOS = {
  ABIERTA: 'abierta',
  EN_OFERTA: 'en_oferta',
  OFERTA_SELECCIONADA: 'oferta_seleccionada',
  PAGO_PENDIENTE: 'pago_pendiente',
  PAGO_RETENIDO: 'pago_retenido',
  EN_RETIRO: 'en_retiro',
  EN_TRANSITO: 'en_transito',
  ENTREGA_REPORTADA: 'entrega_reportada',
  COMPLETADA: 'completada',
  CANCELADA: 'cancelada'
};

function getSolicitudFull(id) {
  return db.prepare(`
    SELECT s.*,
      c.nombre AS cliente_nombre, c.email AS cliente_email, c.telefono AS cliente_telefono,
      c.empresa AS cliente_empresa, c.rut AS cliente_rut,
      t.nombre AS transportista_nombre, t.email AS transportista_email,
      t.telefono AS transportista_telefono, t.empresa AS transportista_empresa, t.rut AS transportista_rut,
      o.valor AS oferta_valor, o.fecha_carga, o.fecha_entrega
    FROM solicitudes s
    JOIN users c ON c.id = s.user_id
    LEFT JOIN users t ON t.id = s.transportista_id
    LEFT JOIN ofertas o ON o.id = s.oferta_id
    WHERE s.id = ?
  `).get(id);
}

function releasePayment(solicitudId, { auto = false } = {}) {
  const pago = db.prepare('SELECT * FROM pagos WHERE solicitud_id = ?').get(solicitudId);
  if (!pago || pago.estado === 'liberado') return null;

  db.prepare(`
    UPDATE pagos SET estado = 'liberado', released_at = datetime('now') WHERE id = ?
  `).run(pago.id);

  db.prepare(`UPDATE solicitudes SET estado = ?, entrega_confirmada_at = datetime('now') WHERE id = ?`)
    .run(ESTADOS.COMPLETADA, solicitudId);

  const existing = db.prepare('SELECT id FROM facturas WHERE solicitud_id = ?').get(solicitudId);
  if (!existing) {
    const sol = getSolicitudFull(solicitudId);
    const numero = `F-${String(solicitudId).padStart(6, '0')}-${Date.now().toString().slice(-4)}`;
    db.prepare(`
      INSERT INTO facturas (solicitud_id, pago_id, numero, monto, rut_cliente, nombre_cliente)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(solicitudId, pago.id, numero, pago.monto, sol.cliente_rut, sol.cliente_nombre);
  }

  const sol = getSolicitudFull(solicitudId);
  const { notifyEntregaConfirmada } = require('./emailService');
  notifyEntregaConfirmada({
    transportista: { email: sol.transportista_email, nombre: sol.transportista_nombre },
    solicitud: sol,
    auto
  }).catch(() => {});

  return db.prepare('SELECT * FROM pagos WHERE id = ?').get(pago.id);
}

function processAutoConfirmations() {
  const pending = db.prepare(`
    SELECT id FROM solicitudes
    WHERE estado = ?
      AND auto_confirm_at IS NOT NULL
      AND auto_confirm_at <= datetime('now')
      AND entrega_confirmada_at IS NULL
  `).all(ESTADOS.ENTREGA_REPORTADA);

  for (const row of pending) {
    releasePayment(row.id, { auto: true });
    console.log(`[auto-confirm] Solicitud #${row.id} confirmada automáticamente`);
  }
  return pending.length;
}

function startAutoConfirmJob() {
  processAutoConfirmations();
  setInterval(processAutoConfirmations, 60 * 1000);
}

module.exports = {
  ESTADOS,
  getSolicitudFull,
  releasePayment,
  processAutoConfirmations,
  startAutoConfirmJob
};
