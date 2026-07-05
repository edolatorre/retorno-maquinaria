const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user) return null;

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
  return transporter;
}

function formatCLP(val) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();

  if (!transport) {
    console.log('[email] SMTP no configurado — simulando envío:');
    console.log(`  Para: ${to}`);
    console.log(`  Asunto: ${subject}`);
    console.log(`  ${text || html}`);
    return { simulated: true };
  }

  const info = await transport.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, '')
  });

  console.log(`[email] Enviado a ${to}: ${info.messageId}`);
  return info;
}

async function notifyNuevaOferta({ cliente, solicitud, oferta, transportista }) {
  const appUrl = config.appUrl;
  const solicitudUrl = `${appUrl}/solicitud.html?id=${solicitud.id}`;

  const subject = `Nueva oferta para tu ${solicitud.tipo_maquina} — Retorno Maquinaria`;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a2332;">
      <h2 style="color:#f59e0b;">🚜 Nueva oferta recibida</h2>
      <p>Hola <strong>${cliente.nombre}</strong>,</p>
      <p>Recibiste una nueva oferta para transportar tu maquinaria:</p>
      <table style="width:100%;border-collapse:collapse;margin:1rem 0;">
        <tr><td style="padding:8px 0;color:#666;">Máquina</td><td><strong>${solicitud.tipo_maquina} ${solicitud.marca} ${solicitud.modelo}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666;">Ruta</td><td>${solicitud.origen} → ${solicitud.destino}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Transportista</td><td>${transportista.nombre}${transportista.empresa ? ` (${transportista.empresa})` : ''}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Valor</td><td><strong style="color:#f59e0b;font-size:1.2em;">${formatCLP(oferta.valor)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#666;">Fecha carga</td><td>${formatDate(oferta.fecha_carga)}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">Fecha entrega</td><td>${formatDate(oferta.fecha_entrega)}</td></tr>
        ${oferta.comentarios ? `<tr><td style="padding:8px 0;color:#666;">Comentarios</td><td>${oferta.comentarios}</td></tr>` : ''}
      </table>
      <a href="${solicitudUrl}" style="display:inline-block;background:#f59e0b;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver oferta en la plataforma</a>
      <p style="color:#999;font-size:12px;margin-top:2rem;">Retorno Maquinaria — app.retorno.cl</p>
    </div>
  `;

  const text = `Nueva oferta de ${transportista.nombre}: ${formatCLP(oferta.valor)} para ${solicitud.tipo_maquina} ${solicitud.marca} ${solicitud.modelo}. Ver en ${solicitudUrl}`;

  return sendMail({ to: cliente.email, subject, html, text });
}

module.exports = { sendMail, notifyNuevaOferta };
