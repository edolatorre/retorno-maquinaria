const API = '/api';

function getToken() {
  return localStorage.getItem('retorno_token');
}

function getUser() {
  const raw = localStorage.getItem('retorno_user');
  return raw ? JSON.parse(raw) : null;
}

function setAuth(token, user) {
  localStorage.setItem('retorno_token', token);
  localStorage.setItem('retorno_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('retorno_token');
  localStorage.removeItem('retorno_user');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatMoney(val) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);
}

function statusLabel(estado) {
  const labels = {
    abierta: 'Abierta', en_oferta: 'Con ofertas', asignada: 'Asignada',
    completada: 'Completada', cancelada: 'Cancelada',
    pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada'
  };
  return labels[estado] || estado;
}

function showView(name) {
  document.getElementById('login-view').style.display = name === 'login' ? 'flex' : 'none';
  document.getElementById('admin-view').style.display = name === 'admin' ? 'flex' : 'none';
}

function showTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => { p.style.display = 'none'; });
  document.getElementById(`tab-${tab}`).style.display = 'block';
  document.querySelectorAll('#admin-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
}

async function loadStats() {
  const { stats } = await api('/admin/stats');
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card"><strong>${stats.usuarios}</strong><span>Usuarios</span></div>
    <div class="stat-card"><strong>${stats.clientes}</strong><span>Clientes</span></div>
    <div class="stat-card"><strong>${stats.transportistas}</strong><span>Transportistas</span></div>
    <div class="stat-card"><strong>${stats.solicitudes}</strong><span>Solicitudes</span></div>
    <div class="stat-card"><strong>${stats.ofertas}</strong><span>Ofertas</span></div>
    <div class="stat-card"><strong>${stats.solicitudes_abiertas}</strong><span>Activas</span></div>
  `;
}

async function loadUsers() {
  const { users } = await api('/admin/users');
  document.getElementById('users-body').innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.nombre}</strong></td>
      <td>${u.email}</td>
      <td><span class="role-badge role-${u.rol}">${u.rol}</span></td>
      <td>${u.empresa || '—'}</td>
      <td>${u.telefono || '—'}</td>
      <td>${u.num_solicitudes || 0}</td>
      <td>${formatDate(u.created_at?.slice(0, 10))}</td>
    </tr>
  `).join('');
}

async function loadSolicitudes() {
  const { solicitudes } = await api('/admin/solicitudes');
  document.getElementById('solicitudes-body').innerHTML = solicitudes.map(s => `
    <tr>
      <td>#${s.id}</td>
      <td><strong>${s.tipo_maquina}</strong><small>${s.marca} ${s.modelo}</small></td>
      <td>${s.cliente_nombre}<small>${s.cliente_email}</small></td>
      <td>${s.origen} → ${s.destino}</td>
      <td>${formatDate(s.fecha_retiro)}</td>
      <td>${s.num_ofertas || 0}</td>
      <td><span class="status-badge status-${s.estado}">${statusLabel(s.estado)}</span></td>
      <td><button class="btn btn-outline btn-sm" onclick="viewSolicitud(${s.id})">Ver</button></td>
    </tr>
  `).join('');
}

async function loadOfertas() {
  const { ofertas } = await api('/admin/ofertas');
  document.getElementById('ofertas-body').innerHTML = ofertas.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>#${o.solicitud_id}<small>${o.tipo_maquina} ${o.marca}</small></td>
      <td>${o.transportista_nombre}<small>${o.transportista_email}</small></td>
      <td>${o.cliente_nombre}</td>
      <td><strong style="color:var(--accent)">${formatMoney(o.valor)}</strong></td>
      <td>${formatDate(o.fecha_carga)}</td>
      <td>${formatDate(o.fecha_entrega)}</td>
      <td><span class="status-badge status-${o.estado}">${statusLabel(o.estado)}</span></td>
    </tr>
  `).join('');
}

async function viewSolicitud(id) {
  const { solicitud, ofertas } = await api(`/admin/solicitudes/${id}`);
  showTab('detail');
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-grid">
      <div class="form-card">
        <h2>${solicitud.tipo_maquina} — ${solicitud.marca} ${solicitud.modelo}</h2>
        <p>Solicitud #${solicitud.id} · <span class="status-badge status-${solicitud.estado}">${statusLabel(solicitud.estado)}</span></p>
        <div class="form-section">
          <h3>Maquinaria</h3>
          <p><strong>Peso:</strong> ${solicitud.peso}</p>
          <p><strong>Dimensiones:</strong> ${solicitud.dimensiones}</p>
        </div>
        <div class="form-section">
          <h3>Traslado</h3>
          <p><strong>Origen:</strong> ${solicitud.origen}</p>
          <p><strong>Destino:</strong> ${solicitud.destino}</p>
          <p><strong>Fecha retiro:</strong> ${formatDate(solicitud.fecha_retiro)}</p>
          ${solicitud.comentarios ? `<p><strong>Comentarios:</strong> ${solicitud.comentarios}</p>` : ''}
        </div>
      </div>
      <div class="form-card">
        <h3>Cliente</h3>
        <p><strong>${solicitud.cliente_nombre}</strong></p>
        <p>${solicitud.cliente_email}</p>
        <p>${solicitud.cliente_telefono || '—'}</p>
        <p>${solicitud.cliente_empresa || ''}</p>
      </div>
    </div>
    <div class="table-card">
      <div class="table-header"><h2>Ofertas (${ofertas.length})</h2></div>
      ${ofertas.length === 0 ? '<div class="empty-state"><p>Sin ofertas aún</p></div>' : `
        <table>
          <thead><tr><th>Transportista</th><th>Email</th><th>Valor</th><th>Carga</th><th>Entrega</th><th>Estado</th><th>Comentarios</th></tr></thead>
          <tbody>
            ${ofertas.map(o => `
              <tr>
                <td><strong>${o.transportista_nombre}</strong>${o.transportista_empresa ? `<br><small>${o.transportista_empresa}</small>` : ''}</td>
                <td>${o.transportista_email}</td>
                <td><strong style="color:var(--accent)">${formatMoney(o.valor)}</strong></td>
                <td>${formatDate(o.fecha_carga)}</td>
                <td>${formatDate(o.fecha_entrega)}</td>
                <td><span class="status-badge status-${o.estado}">${statusLabel(o.estado)}</span></td>
                <td>${o.comentarios || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

window.viewSolicitud = viewSolicitud;

async function initAdmin() {
  const user = getUser();
  if (!user || user.rol !== 'admin' || !getToken()) {
    showView('login');
    return;
  }

  try {
    showView('admin');
    document.getElementById('admin-name').textContent = user.nombre;
    await loadStats();
    await loadUsers();
    await loadSolicitudes();
    await loadOfertas();
  } catch (err) {
    clearAuth();
    showView('login');
    document.getElementById('login-alert').innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admin-login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const alertEl = document.getElementById('login-alert');
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: e.target.email.value,
          password: e.target.password.value
        })
      });
      if (data.user.rol !== 'admin') {
        throw new Error('Esta cuenta no tiene permisos de administrador');
      }
      setAuth(data.token, data.user);
      await initAdmin();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });

  document.getElementById('admin-logout')?.addEventListener('click', e => {
    e.preventDefault();
    clearAuth();
    showView('login');
  });

  document.querySelectorAll('#admin-nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      showTab(a.dataset.tab);
    });
  });

  document.getElementById('back-list')?.addEventListener('click', () => {
    showTab('solicitudes');
  });

  initAdmin();
});
