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

function requireAuth() {
  if (!getToken()) {
    window.location.href = appPath('/');
    return false;
  }
  const user = getUser();
  if (user?.rol === 'admin') {
    window.location.href = adminPath('/');
    return false;
  }
  return true;
}

function redirectAfterLogin(user) {
  if (user.rol === 'admin') {
    window.location.href = adminPath('/');
  } else {
    window.location.href = appPath('/dashboard.html');
  }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Error en la solicitud');
  }
  return data;
}

function showAlert(el, message, type = 'error') {
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
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
    abierta: 'Abierta',
    en_oferta: 'Con ofertas',
    asignada: 'Asignada',
    completada: 'Completada',
    cancelada: 'Cancelada',
    pendiente: 'Pendiente',
    aceptada: 'Aceptada',
    rechazada: 'Rechazada'
  };
  return labels[estado] || estado;
}

function initSidebar(activePage) {
  const user = getUser();
  if (!user) return;

  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  if (nameEl) nameEl.textContent = user.nombre;
  if (roleEl) {
    const roles = { cliente: 'Cliente', transportista: 'Transportista', admin: 'Administrador' };
    roleEl.textContent = roles[user.rol] || user.rol;
  }

  document.querySelectorAll('.app-nav a').forEach(a => {
    if (a.dataset.page === activePage) a.classList.add('active');
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', e => {
      e.preventDefault();
      clearAuth();
      window.location.href = appPath('/');
    });
  }

  if (user.rol === 'transportista') {
    document.querySelectorAll('.cliente-only').forEach(el => { el.style.display = 'none'; });
  } else if (user.rol === 'cliente') {
    document.querySelectorAll('.transportista-only').forEach(el => { el.style.display = 'none'; });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const user = getUser();
    if (user && getToken()) {
      redirectAfterLogin(user);
      return;
    }

    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const alertEl = document.getElementById('alert');
      try {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: loginForm.email.value,
            password: loginForm.password.value
          })
        });
        setAuth(data.token, data.user);
        redirectAfterLogin(data.user);
      } catch (err) {
        showAlert(alertEl, err.message);
      }
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    const params = new URLSearchParams(window.location.search);
    const rolParam = params.get('rol');
    if (rolParam && ['cliente', 'transportista'].includes(rolParam)) {
      const radio = registerForm.querySelector(`input[name="rol"][value="${rolParam}"]`);
      if (radio) radio.checked = true;
    }

    registerForm.addEventListener('submit', async e => {
      e.preventDefault();
      const alertEl = document.getElementById('alert');
      const rol = registerForm.querySelector('input[name="rol"]:checked')?.value;
      if (!rol) {
        showAlert(alertEl, 'Selecciona si eres cliente o transportista');
        return;
      }
      try {
        const data = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: registerForm.email.value,
            password: registerForm.password.value,
            nombre: registerForm.nombre.value,
            telefono: registerForm.telefono.value,
            empresa: registerForm.empresa?.value || '',
            rut: registerForm.rut?.value || '',
            rol
          })
        });
        setAuth(data.token, data.user);
        redirectAfterLogin(data.user);
      } catch (err) {
        showAlert(alertEl, err.message);
      }
    });
  }

  const solicitudForm = document.getElementById('solicitud-form');
  if (solicitudForm) {
    if (!requireAuth()) return;
    initSidebar('nueva-solicitud');

    solicitudForm.addEventListener('submit', async e => {
      e.preventDefault();
      const alertEl = document.getElementById('alert');
      try {
        await api('/solicitudes', {
          method: 'POST',
          body: JSON.stringify({
            tipo_maquina: solicitudForm.tipo_maquina.value,
            marca: solicitudForm.marca.value,
            modelo: solicitudForm.modelo.value,
            peso: solicitudForm.peso.value,
            dimensiones: solicitudForm.dimensiones.value,
            fecha_retiro: solicitudForm.fecha_retiro.value,
            origen: solicitudForm.origen.value,
            destino: solicitudForm.destino.value,
            comentarios: solicitudForm.comentarios.value
          })
        });
        showAlert(alertEl, '¡Solicitud publicada! Los transportistas comenzarán a ofertar.', 'success');
        setTimeout(() => { window.location.href = appPath('/dashboard.html'); }, 1500);
      } catch (err) {
        showAlert(alertEl, err.message);
      }
    });
  }

  const dashboard = document.getElementById('dashboard');
  if (dashboard) {
    if (!requireAuth()) return;
    initSidebar('dashboard');
    loadDashboard();
  }
});

async function loadDashboard() {
  const user = getUser();
  const tbody = document.getElementById('solicitudes-body');
  const emptyEl = document.getElementById('empty-state');

  try {
    if (user.rol === 'cliente') {
      const { solicitudes } = await api('/solicitudes/mis-solicitudes');
      document.getElementById('stat-total').textContent = solicitudes.length;
      document.getElementById('stat-abiertas').textContent = solicitudes.filter(s => s.estado === 'abierta' || s.estado === 'en_oferta').length;
      document.getElementById('stat-ofertas').textContent = solicitudes.reduce((sum, s) => sum + (s.num_ofertas || 0), 0);

      if (solicitudes.length === 0) {
        emptyEl.style.display = 'block';
        tbody.innerHTML = '';
        return;
      }
      emptyEl.style.display = 'none';
      tbody.innerHTML = solicitudes.map(s => `
        <tr>
          <td><strong>${s.tipo_maquina}</strong><br><small style="color:var(--muted)">${s.marca} ${s.modelo}</small></td>
          <td>${s.origen} → ${s.destino}</td>
          <td>${formatDate(s.fecha_retiro)}</td>
          <td>${s.num_ofertas || 0}</td>
          <td><span class="status-badge status-${s.estado}">${statusLabel(s.estado)}</span></td>
          <td><a href="${appPath(`/solicitud.html?id=${s.id}`)}" class="btn btn-outline btn-sm">Ver</a></td>
        </tr>
      `).join('');
    } else {
      const { solicitudes } = await api('/solicitudes/disponibles');
      document.getElementById('stat-total').textContent = solicitudes.length;
      document.getElementById('stat-abiertas').textContent = solicitudes.filter(s => !s.ya_oferte).length;
      document.getElementById('stat-ofertas').textContent = solicitudes.filter(s => s.ya_oferte).length;

      if (solicitudes.length === 0) {
        emptyEl.style.display = 'block';
        tbody.innerHTML = '';
        return;
      }
      emptyEl.style.display = 'none';
      tbody.innerHTML = solicitudes.map(s => `
        <tr>
          <td><strong>${s.tipo_maquina}</strong><br><small style="color:var(--muted)">${s.marca} ${s.modelo} · ${s.peso}</small></td>
          <td>${s.origen} → ${s.destino}</td>
          <td>${formatDate(s.fecha_retiro)}</td>
          <td>${s.cliente_empresa || s.cliente_nombre}</td>
          <td>${s.ya_oferte ? '<span class="status-badge status-asignada">Ofertaste</span>' : '<span class="status-badge status-abierta">Disponible</span>'}</td>
          <td><a href="${appPath(`/solicitud.html?id=${s.id}`)}" class="btn btn-outline btn-sm">${s.ya_oferte ? 'Ver' : 'Ofertar'}</a></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    if (err.message.includes('autorizado') || err.message.includes('Token')) {
      clearAuth();
      window.location.href = appPath('/');
    }
  }
}

async function loadSolicitudDetail() {
  if (!requireAuth()) return;
  initSidebar('dashboard');

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) { window.location.href = appPath('/dashboard.html'); return; }

  const user = getUser();
  const detailEl = document.getElementById('solicitud-detail');
  const ofertasEl = document.getElementById('ofertas-section');
  const ofertaForm = document.getElementById('oferta-form');

  try {
    const { solicitud, ofertas } = await api(`/solicitudes/${id}`);

    detailEl.innerHTML = `
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
        </div>
        ${solicitud.comentarios ? `<div class="form-section"><h3>Comentarios</h3><p>${solicitud.comentarios}</p></div>` : ''}
      </div>
    `;

    if (user.rol === 'cliente') {
      ofertasEl.style.display = 'block';
      if (ofertas.length === 0) {
        ofertasEl.innerHTML = '<div class="empty-state"><p>Aún no hay ofertas. Recibirás un correo cuando llegue una nueva.</p></div>';
      } else {
        ofertasEl.innerHTML = `
          <div class="table-card" style="margin-top:1.5rem;">
            <div class="table-header"><h2>Ofertas recibidas (${ofertas.length})</h2></div>
            <table>
              <thead><tr><th>Transportista</th><th>Valor</th><th>Carga</th><th>Entrega</th><th>Comentarios</th></tr></thead>
              <tbody>
                ${ofertas.map(o => `
                  <tr>
                    <td><strong>${o.transportista_nombre}</strong>${o.transportista_empresa ? `<br><small style="color:var(--muted)">${o.transportista_empresa}</small>` : ''}</td>
                    <td><strong style="color:var(--accent)">${formatMoney(o.valor)}</strong></td>
                    <td>${formatDate(o.fecha_carga)}</td>
                    <td>${formatDate(o.fecha_entrega)}</td>
                    <td>${o.comentarios || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    if (user.rol === 'transportista' && ofertaForm) {
      ofertaForm.style.display = 'block';
      ofertaForm.addEventListener('submit', async e => {
        e.preventDefault();
        const alertEl = document.getElementById('alert');
        try {
          await api(`/solicitudes/${id}/ofertas`, {
            method: 'POST',
            body: JSON.stringify({
              valor: ofertaForm.valor.value,
              fecha_carga: ofertaForm.fecha_carga.value,
              fecha_entrega: ofertaForm.fecha_entrega.value,
              comentarios: ofertaForm.comentarios.value
            })
          });
          showAlert(alertEl, '¡Oferta enviada! El cliente recibirá un correo de notificación.', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
          showAlert(alertEl, err.message);
        }
      });
    }
  } catch (err) {
    detailEl.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

if (document.getElementById('solicitud-detail')) {
  document.addEventListener('DOMContentLoaded', loadSolicitudDetail);
}
