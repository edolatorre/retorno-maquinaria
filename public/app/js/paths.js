function isAppSubdomain() {
  const h = window.location.hostname;
  return h.startsWith('app.') || h === 'app.localhost';
}

function getAppBase() {
  return isAppSubdomain() ? '' : '/app';
}

function appPath(p) {
  const base = getAppBase();
  const path = p.startsWith('/') ? p : `/${p}`;
  return `${base}${path}`;
}

function getAdminBase() {
  return isAppSubdomain() ? '/admin' : '/admin';
}

function adminPath(p) {
  const base = getAdminBase();
  const path = p.startsWith('/') ? p : `/${p}`;
  return `${base}${path}`;
}

function getAppOrigin() {
  if (isAppSubdomain()) return window.location.origin;
  const h = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  if (h === 'localhost' || h === '127.0.0.1') {
    return `${window.location.protocol}//app.localhost${port}`;
  }
  const domain = h.replace(/^www\./, '');
  return `${window.location.protocol}//app.${domain}`;
}
