const path = require('path');
const fs = require('fs');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

require('./db');
const { runSeed } = require('./seed');
runSeed();

const config = require('./config');
const { isAppSubdomain } = require('./middleware/subdomain');

const authRouter = require('./routes/auth');
const solicitudesRouter = require('./routes/solicitudes');
const adminRouter = require('./routes/admin');

const app = express();
const appDir = path.join(__dirname, '..', 'public', 'app');
const adminDir = path.join(__dirname, '..', 'public', 'admin');
const siteDir = path.join(__dirname, '..', 'public', 'site');

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'retorno-maquinaria' }));

app.get('/api/config', (req, res) => {
  res.json({
    appUrl: config.appUrl,
    siteUrl: config.siteUrl,
    isAppSubdomain: isAppSubdomain(req)
  });
});

app.use('/api/auth', authRouter);
app.use('/api/solicitudes', solicitudesRouter);
app.use('/api/admin', adminRouter);

// Admin
app.get('/admin', (req, res) => res.redirect(301, '/admin/'));
app.get('/admin/', (req, res) => res.sendFile(path.join(adminDir, 'index.html')));
app.use('/admin', express.static(adminDir));

// Subdominio app.*
app.use((req, res, next) => {
  if (!isAppSubdomain(req) || req.path.startsWith('/api') || req.path.startsWith('/admin')) {
    return next();
  }
  if (req.path === '/' || req.path === '') {
    return res.sendFile(path.join(appDir, 'index.html'));
  }
  const file = path.join(appDir, req.path.replace(/^\//, ''));
  const resolved = path.resolve(file);
  if (resolved.startsWith(path.resolve(appDir)) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return res.sendFile(resolved);
  }
  res.sendFile(path.join(appDir, 'index.html'));
});

// App
app.get('/app', (req, res) => res.redirect(301, '/app/'));
app.use('/app', express.static(appDir, { index: 'index.html' }));

// Sitio marketing
app.use(express.static(siteDir, { index: 'index.html' }));

app.listen(config.port, () => {
  console.log('');
  console.log('  Retorno Maquinaria');
  console.log('  ─────────────────────────────────────');
  console.log(`  Sitio:   ${config.siteUrl}`);
  console.log(`  App:     ${config.appUrl}`);
  console.log(`  Admin:   ${config.siteUrl}/admin/`);
  console.log('');
});
