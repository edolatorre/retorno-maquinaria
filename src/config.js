const port = Number(process.env.PORT) || 3001;

// Render expone la URL pública en RENDER_EXTERNAL_URL (ej. https://retorno-maquinaria.onrender.com)
const renderUrl = process.env.RENDER_EXTERNAL_URL;
const defaultLocal = `http://localhost:${port}`;

const siteUrl = process.env.SITE_URL || renderUrl || defaultLocal;
const appUrl = process.env.APP_URL || (renderUrl ? `${renderUrl}/app` : `http://app.localhost:${port}`);

module.exports = {
  port,
  isProduction: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET || 'retorno-dev-secret-change-in-production',
  appDomain: process.env.APP_DOMAIN || 'app.retorno.cl',
  siteDomain: process.env.SITE_DOMAIN || 'retorno.cl',
  siteUrl,
  appUrl,
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@retorno.cl',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    nombre: process.env.ADMIN_NOMBRE || 'Administrador'
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'Retorno Maquinaria <noreply@retorno.cl>'
  }
};
