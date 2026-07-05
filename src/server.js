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

app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(adminDir, 'index.html')));
app.use('/admin', express.static(adminDir, { index: false, redirect: false }));

app.use((req, res, next) => {
  if (!isAppSubdomain(req) || req.path.startsWith('/api') || req.path.startsWith('/admin')) return next();
  if (req.path === '/' || req.path === '') return res.sendFile(path.join(appDir, 'index.html'));
  const file = path.join(appDir, req.path.replace(/^\//, ''));
  const resolved = path.resolve(file);
  if (resolved.startsWith(path.resolve(appDir)) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return res.sendFile(resolved);
  }
  res.sendFile(path.join(appDir, 'index.html'));
});

app.get(['/app', '/app/'], (req, res) => res.sendFile(path.join(appDir, 'index.html')));
app.use('/app', express.static(appDir, { index: false, redirect: false }));
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
