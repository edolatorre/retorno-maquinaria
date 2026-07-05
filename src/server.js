const path = require('path');
const fs = require('fs');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

require('./db');
const { runSeed } = require('./seed');
runSeed();

const config = require('./config');
const { isAppSubdomain } = require('./middleware/subdomain');
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

function serveStaticDir(rootDir) {
  const root = path.resolve(rootDir);
  return (req, res) => {
    let rel = decodeURIComponent(req.path.replace(/^\//, ''));
    if (!rel) rel = 'index.html';
    const filePath = path.resolve(root, rel);
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      return res.status(403).type('text/plain').send('Forbidden');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
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

app.use('/admin', serveStaticDir(adminDir));

app.use((req, res, next) => {
  if (!isAppSubdomain(req) || req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
  return serveStaticDir(appDir)(req, res);
});

app.use('/app', serveStaticDir(appDir));
app.use(express.static(siteDir, { index: 'index.html' }));

startAutoConfirmJob();

app.listen(config.port, () => {
  console.log('');
  console.log('  Retorno Maquinaria');
  console.log('  ─────────────────────────────────────');
  console.log(`  Sitio:   ${config.siteUrl}`);
  console.log(`  App:     ${config.appUrl}`);
  console.log(`  Admin:   ${config.siteUrl}/admin/`);
  console.log(`  MP:      ${config.mercadopago.accessToken ? 'configurado' : 'modo simulado'}`);
  console.log('');
});
