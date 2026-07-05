const NAV_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  nueva: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  pagos: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  facturacion: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>'
};

function renderSidebar() {
  const sidebar = document.querySelector('.app-sidebar');
  if (!sidebar) return;

  const base = typeof appPath === 'function' ? appPath : p => p;

  sidebar.innerHTML = `
    <a href="${base('/index.html')}" class="app-logo">
      <div class="app-logo-icon">🚜</div>
      Retorno
    </a>
    <div class="nav-section-label">Menú</div>
    <nav class="app-nav">
      <a href="${base('/dashboard.html')}" data-page="dashboard">
        <span class="nav-icon">${NAV_ICONS.dashboard}</span>
        Solicitudes
      </a>
      <a href="${base('/nueva-solicitud.html')}" data-page="nueva-solicitud" class="cliente-only">
        <span class="nav-icon">${NAV_ICONS.nueva}</span>
        Nueva solicitud
      </a>
      <a href="${base('/pagos.html')}" data-page="pagos">
        <span class="nav-icon">${NAV_ICONS.pagos}</span>
        Pagos
      </a>
      <a href="${base('/facturacion.html')}" data-page="facturacion" class="transportista-only">
        <span class="nav-icon">${NAV_ICONS.facturacion}</span>
        Facturación
      </a>
    </nav>
    <div class="app-user">
      <div class="app-user-card">
        <div class="app-user-avatar" id="user-avatar">?</div>
        <div class="app-user-info">
          <div class="app-user-name" id="user-name">—</div>
          <div class="app-user-role" id="user-role">—</div>
        </div>
      </div>
      <a href="#" id="logout-btn" class="app-user-logout">Cerrar sesión</a>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.app-sidebar')) renderSidebar();
});
