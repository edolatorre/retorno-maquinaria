const config = require('../config');

const V3_API_KEY_BASE = 'https://payment-api.khipu.com';
const V3_BASIC_BASE = 'https://khipu.com/api/3.0';

function hasCredentials() {
  return !!(config.khipu.apiKey || (config.khipu.receiverId && config.khipu.secret));
}

function getAuth() {
  if (config.khipu.apiKey) {
    return { base: V3_API_KEY_BASE, headers: { 'x-api-key': config.khipu.apiKey } };
  }
  if (config.khipu.receiverId && config.khipu.secret) {
    const token = Buffer.from(`${config.khipu.receiverId}:${config.khipu.secret}`).toString('base64');
    return { base: V3_BASIC_BASE, headers: { Authorization: `Basic ${token}` } };
  }
  return null;
}

async function khipuFetch(method, path, body) {
  const auth = getAuth();
  if (!auth) throw new Error('Khipu no configurado');

  const res = await fetch(`${auth.base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...auth.headers },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || data.errors?.[0]?.message || `Khipu HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function createPayment({ solicitud, oferta, pagoId }) {
  const subject = `Transporte ${solicitud.tipo_maquina} ${solicitud.marca}`.slice(0, 256);
  const amount = Math.round(oferta.valor);

  if (!hasCredentials()) {
    return {
      simulated: true,
      payment_id: `sim-${pagoId}-${Date.now()}`,
      payment_url: `${config.appUrl}/pago-simulado.html?solicitud=${solicitud.id}&pago=${pagoId}`
    };
  }

  const payload = {
    subject,
    amount,
    currency: 'CLP',
    transaction_id: String(pagoId),
    body: `Traslado ${solicitud.origen} → ${solicitud.destino}`.slice(0, 512),
    return_url: `${config.appUrl}/solicitud.html?id=${solicitud.id}&pago=ok`,
    cancel_url: `${config.appUrl}/solicitud.html?id=${solicitud.id}&pago=cancel`,
    notify_url: `${config.siteUrl}/api/pagos/khipu/webhook`,
    notify_api_version: '3.0'
  };

  const result = await khipuFetch('POST', '/v3/payments', payload);
  return { ...result, simulated: false };
}

async function getPayment(paymentId) {
  if (!hasCredentials() || String(paymentId).startsWith('sim-')) return null;
  return khipuFetch('GET', `/v3/payments/${paymentId}`);
}

function isPaymentDone(payment) {
  if (!payment) return false;
  const status = (payment.status || payment.payment_status || '').toLowerCase();
  return ['done', 'paid', 'completed', 'conciliated'].includes(status);
}

module.exports = {
  createPayment,
  getPayment,
  isPaymentDone,
  hasCredentials
};
