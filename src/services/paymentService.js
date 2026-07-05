const config = require('../config');
const khipu = require('./khipuService');
const mercadopago = require('./mercadopagoService');

async function createCheckout({ solicitud, oferta, pagoId }) {
  if (config.paymentProvider === 'mercadopago') {
    const preference = await mercadopago.createPreference({ solicitud, oferta, pagoId });
    return {
      provider: 'mercadopago',
      id: preference.id,
      checkoutUrl: preference.init_point || preference.sandbox_init_point,
      simulated: !!preference.simulated
    };
  }

  const payment = await khipu.createPayment({ solicitud, oferta, pagoId });
  return {
    provider: 'khipu',
    id: payment.payment_id,
    checkoutUrl: payment.payment_url,
    simulated: !!payment.simulated
  };
}

async function verifyExternalPayment(provider, externalId) {
  if (provider === 'mercadopago') {
    const payment = await mercadopago.getPayment(externalId);
    return payment?.status === 'approved' ? payment : null;
  }
  const payment = await khipu.getPayment(externalId);
  return khipu.isPaymentDone(payment) ? payment : null;
}

function isConfigured() {
  if (config.paymentProvider === 'mercadopago') {
    return !!config.mercadopago.accessToken;
  }
  return khipu.hasCredentials();
}

module.exports = { createCheckout, verifyExternalPayment, isConfigured };
