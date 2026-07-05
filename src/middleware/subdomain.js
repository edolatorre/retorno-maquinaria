function getHostname(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return host.split(':')[0].toLowerCase();
}

function isAppSubdomain(req) {
  const hostname = getHostname(req);
  if (hostname.startsWith('app.')) return true;
  if (hostname === 'app.localhost') return true;
  const extra = (process.env.APP_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
  return extra.includes(hostname);
}

module.exports = { isAppSubdomain, getHostname };
