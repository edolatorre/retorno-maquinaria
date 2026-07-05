const path = require('path');
const fs = require('fs');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

require('./db');
const { runSeed } = require('./seed');
runSeed();

const config = require('./config');
const { isAppSubdomain, getHostname } = require('./middleware/subdomain');
const { startAutoConfirmJob } = require('./services/solicitudService');

const authRouter = require('./routes/auth');
const solicitudesRouter = require('./routes/solicitudes');
const adminRouter = require('./routes/admin');
const pagosRouter = require('./routes/pagos');
const reportesRouter = require('./routes/reportes');
const facturasRouter = require('./routes/facturas');

const app = express();
const appDir = path.join(__dirname, '..', 'public', 'app');
const adminDir = path.join(__dirname, '..', 'public', 'admin');
const siteDir = path.join(__dirname, '..', 'public', 'site');
const uploadsDir = path.join(__dirname, '..', 'uploads');

function serveStaticDir(rootDir, { spaFallback = false } = {}) {
  const root = path.resolve(rootDir);

  const trySend = (res, candidate) => {
    const filePath = path.resolve(root, candidate);
    if (!filePath.startsWith(root + path.sep) && filePath !== root) return false;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.sendFile(filePath);
      return true;
    }
    return false;
  };

  return (req, res) => {
    // Inside app.use('/mount', …), req.path is mount-relative (e.g. /index.html).
    // req.url is also mount-relative; use it as a fallback for edge proxies.
    let rel = decodeURIComponent((req.path || req.url || '/').split('?')[0].replace(/^\//, ''));
    if (!rel) rel = 'index.html';

    if (trySend(res, rel)) return;
    if (!path.extname(rel) && trySend(res, `${rel}.html`)) return;
    if (spaFallback && trySend(res, 'index.html')) return;

    res.status(404).type('text/plain').send('Not Found');
  };
}

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'retorno-maquinaria' }));

app.get('/api/config', (req, res) => {
  res.json({
    appUrl: config.appUrl,
    siteUrl: config.siteUrl,
    isAppSubdomain: isAppSubdomain(req),
    paymentProvider: config.paymentProvider,
    khipuConfigured: require('./services/khipuService').hasCredentials(),
    khipuMode: config.khipu.mode,
    mpPublicKey: config.mercadopago.publicKey,
    mpConfigured: !!config.mercadopago.accessToken
  });
});

app.use('/api/auth', authRouter);
app.use('/api/solicitudes', solicitudesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/facturas', facturasRouter);

app.get('/app', (req, res) => res.redirect('/app/index.html'));

// En localhost, /dashboard.html sin /app/ → redirigir a /app/...
app.use((req, res, next) => {
  if (isAppSubdomain(req)) return next();
  const host = getHostname(req);
  if (host !== 'localhost' && host !== '127.0.0.1') return next();
  const m = req.path.match(/^\/(dashboard|solicitud|pagos|facturacion|nueva-solicitud|pago-simulado|register|index)(\.html)?$/);
  if (m) return res.redirect('/app' + req.originalUrl);
  next();
});

app.use('/admin', serveStaticDir(adminDir));

app.use((req, res, next) => {
  if (!isAppSubdomain(req) || req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
  return serveStaticDir(appDir, { spaFallback: true })(req, res);
});

app.use('/app', serveStaticDir(appDir, { spaFallback: true }));
app.use(express.static(siteDir, { index: 'index.html' }));

startAutoConfirmJob();

app.listen(config.port, () => {
  console.log('');
  console.log('  Retorno Maquinaria');
  console.log('  ─────────────────────────────────────');
  console.log(`  Sitio:   ${config.siteUrl}`);
  console.log(`  App:     ${config.appUrl}`);
  console.log(`  Admin:   ${config.siteUrl}/admin/`);
  console.log(`  Pagos:   ${config.paymentProvider}${require('./services/paymentService').isConfigured() ? ' (configurado)' : ' (modo simulado)'}`);
  if (config.paymentProvider === 'khipu') {
    console.log(`  Khipu:   modo ${config.khipu.mode}`);
  } else {
    console.log(`  MP:      ${config.mercadopago.accessToken ? 'configurado' : 'modo simulado'}`);
  }
  console.log('');
});
