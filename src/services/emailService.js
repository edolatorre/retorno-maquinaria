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
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();
  if (!transport) {
    console.log('[email] Simulado →', to, '|', subject);
    if (text) console.log(' ', text.slice(0, 200));
    return { simulated: true };
  }
  return transport.sendMail({ from: config.smtp.from, to, subject, html, text: text || html.replace(/<[^>]+>/g, '') });
}

function solicitudUrl(id) {
  return `${config.appUrl}/solicitud.html?id=${id}`;
}

async function notifyNuevaOferta({ cliente, solicitud, oferta, transportista }) {
  return sendMail({
    to: cliente.email,
    subject: `Nueva oferta — ${solicitud.tipo_maquina} ${solicitud.marca}`,
    html: `<p>Hola ${cliente.nombre}, recibiste una oferta de <strong>${transportista.nombre}</strong> por <strong>${formatCLP(oferta.valor)}</strong>.</p><p><a href="${solicitudUrl(solicitud.id)}">Ver solicitud</a></p>`,
    text: `Nueva oferta de ${transportista.nombre}: ${formatCLP(oferta.valor)}`
  });
}

async function notifyOfertaSeleccionada({ cliente, transportista, solicitud, oferta }) {
  const contactoCliente = `${cliente.nombre} · ${cliente.email} · ${cliente.telefono || '—'} · ${cliente.empresa || ''}`;
  const contactoTransportista = `${transportista.nombre} · ${transportista.email} · ${transportista.telefono || '—'} · ${transportista.empresa || ''}`;

  await sendMail({
    to: cliente.email,
    subject: `Oferta seleccionada — realiza el pago`,
    html: `<p>Seleccionaste la oferta de <strong>${transportista.nombre}</strong> (${formatCLP(oferta.valor)}).</p>
      <p><strong>Contacto transportista:</strong> ${contactoTransportista}</p>
      <p>Realiza el pago para confirmar el traslado: <a href="${solicitudUrl(solicitud.id)}">Pagar ahora</a></p>`,
    text: `Contacto transportista: ${contactoTransportista}. Paga en ${solicitudUrl(solicitud.id)}`
  });

  await sendMail({
    to: transportista.email,
    subject: `¡Te eligieron! — ${solicitud.tipo_maquina} ${solicitud.marca}`,
    html: `<p>El cliente <strong>${cliente.nombre}</strong> seleccionó tu oferta.</p>
      <p><strong>Contacto cliente:</strong> ${contactoCliente}</p>
      <p>El traslado se confirma cuando el cliente complete el pago.</p>`,
    text: `Contacto cliente: ${contactoCliente}`
  });
}

async function notifyPagoRecibido({ cliente, transportista, solicitud, monto }) {
  await sendMail({
    to: cliente.email,
    subject: `Pago confirmado — traslado autorizado`,
    html: `<p>Tu pago de <strong>${formatCLP(monto)}</strong> fue recibido. El transportista puede iniciar el retiro.</p>`
  });
  await sendMail({
    to: transportista.email,
    subject: `Pago recibido — puedes retirar la máquina`,
    html: `<p>El cliente pagó <strong>${formatCLP(monto)}</strong>. Ingresa a la plataforma e inicia el reporte de retiro.</p>
      <p><a href="${solicitudUrl(solicitud.id)}">Ir a la solicitud</a></p>`
  });
}

async function notifyReporteRetiro({ cliente, solicitud, reporte, fotosCount }) {
  return sendMail({
    to: cliente.email,
    subject: `Reporte de retiro subido — ${solicitud.tipo_maquina}`,
    html: `<p>El transportista inició el retiro y subió un reporte con <strong>${fotosCount} foto(s)</strong>.</p>
      ${reporte.detalles ? `<p><strong>Detalles:</strong> ${reporte.detalles}</p>` : ''}
      ${reporte.comentarios ? `<p><strong>Comentarios:</strong> ${reporte.comentarios}</p>` : ''}
      <p><a href="${solicitudUrl(solicitud.id)}">Ver reporte</a></p>`,
    text: `Reporte de retiro subido con ${fotosCount} fotos.`
  });
}

async function notifyReporteEntrega({ cliente, solicitud, reporte, autoConfirmAt }) {
  return sendMail({
    to: cliente.email,
    subject: `Reporte de entrega — confirma recepción en 24h`,
    html: `<p>Se registró la entrega de tu maquinaria.</p>
      <p><strong>Recibió:</strong> ${reporte.receptor_nombre} (${reporte.receptor_rut || '—'})</p>
      <p>Tienes <strong>24 horas</strong> para confirmar el recibo. Si no confirmas antes del ${formatDate(autoConfirmAt?.slice(0, 10))}, el pago se liberará automáticamente al transportista.</p>
      <p><a href="${solicitudUrl(solicitud.id)}">Confirmar recepción</a></p>`
  });
}

async function notifyEntregaConfirmada({ transportista, solicitud, auto }) {
  return sendMail({
    to: transportista.email,
    subject: auto ? `Pago liberado automáticamente` : `Entrega confirmada — pago liberado`,
    html: `<p>El traslado #${solicitud.id} fue completado${auto ? ' (confirmación automática tras 24h)' : ''}. El pago fue liberado a tu favor.</p>`
  });
}

module.exports = {
  sendMail,
  notifyNuevaOferta,
  notifyOfertaSeleccionada,
  notifyPagoRecibido,
  notifyReporteRetiro,
  notifyReporteEntrega,
  notifyEntregaConfirmada
};
