const config = require('../config');

let mpClient = null;

function getMpClient() {
  if (mpClient) return mpClient;
  if (!config.mercadopago.accessToken) return null;

  const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
  const client = new MercadoPagoConfig({ accessToken: config.mercadopago.accessToken });
  mpClient = {
    preference: new Preference(client),
    payment: new Payment(client)
  };
  return mpClient;
}

async function createPreference({ solicitud, oferta, pagoId }) {
  const mp = getMpClient();
  const title = `Transporte ${solicitud.tipo_maquina} ${solicitud.marca} ${solicitud.modelo}`;
  const unitPrice = Math.round(oferta.valor);

  if (!mp) {
    return {
      simulated: true,
      id: `sim-${pagoId}-${Date.now()}`,
      init_point: `${config.appUrl}/pago-simulado.html?solicitud=${solicitud.id}&pago=${pagoId}`,
      sandbox_init_point: `${config.appUrl}/pago-simulado.html?solicitud=${solicitud.id}&pago=${pagoId}`
    };
  }

  const result = await mp.preference.create({
    body: {
      items: [{
        id: String(pagoId),
        title: title.slice(0, 256),
        quantity: 1,
        unit_price: unitPrice,
        currency_id: 'CLP'
      }],
      external_reference: String(pagoId),
      back_urls: {
        success: `${config.appUrl}/solicitud.html?id=${solicitud.id}&pago=ok`,
        failure: `${config.appUrl}/solicitud.html?id=${solicitud.id}&pago=fail`,
        pending: `${config.appUrl}/solicitud.html?id=${solicitud.id}&pago=pending`
      },
      auto_return: 'approved',
      notification_url: `${config.siteUrl}/api/pagos/webhook`,
      statement_descriptor: 'RETORNO MAQ'
    }
  });

  return result;
}

async function getPayment(paymentId) {
  const mp = getMpClient();
  if (!mp) return null;
  return mp.payment.get({ id: paymentId });
}

module.exports = { createPreference, getPayment, getMpClient };
