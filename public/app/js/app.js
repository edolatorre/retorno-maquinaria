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
    window.location.href = appPath('/index.html');
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
    abierta: 'Abierta', en_oferta: 'Con ofertas', oferta_seleccionada: 'Oferta seleccionada',
    pago_pendiente: 'Pago pendiente', pago_retenido: 'Pago retenido', en_retiro: 'En retiro',
    en_transito: 'En tránsito', entrega_reportada: 'Entrega reportada', completada: 'Completada',
    cancelada: 'Cancelada', pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada',
    aprobado: 'Aprobado', retenido: 'Retenido', liberado: 'Liberado', reembolsado: 'Reembolsado',
    asignada: 'Asignada', emitida: 'Emitida'
  };
  return labels[estado] || estado;
}

const ESTADOS_FILTRO = [
  { v: 'todas', l: 'Todos los estados' },
  { v: 'abierta', l: 'Abierta' }, { v: 'en_oferta', l: 'Con ofertas' },
  { v: 'oferta_seleccionada', l: 'Oferta seleccionada' }, { v: 'pago_pendiente', l: 'Pago pendiente' },
  { v: 'pago_retenido', l: 'Pago retenido' }, { v: 'en_transito', l: 'En tránsito' },
  { v: 'entrega_reportada', l: 'Entrega reportada' }, { v: 'completada', l: 'Completada' }
];

function initSidebar(activePage) {
  if (typeof renderSidebar === 'function') renderSidebar();

  const user = getUser();
  if (!user) return;

  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = user.nombre;
  if (avatarEl && user.nombre) avatarEl.textContent = user.nombre.charAt(0).toUpperCase();
  if (roleEl) {
    const roles = { cliente: 'Cliente', transportista: 'Transportista', admin: 'Administrador' };
    roleEl.textContent = roles[user.rol] || user.rol;
  }

  document.querySelectorAll('.app-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === activePage);
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
    setupDashboardFilters();
    loadDashboard();
  }

  if (document.getElementById('pagos-page')) {
    if (!requireAuth()) return;
    initSidebar('pagos');
    loadPagos();
  }

  if (document.getElementById('facturacion-page')) {
    if (!requireAuth()) return;
    initSidebar('facturacion');
    loadFacturacion();
  }
});

function setupDashboardFilters() {
  const sel = document.getElementById('filtro-estado');
  if (!sel) return;
  sel.innerHTML = ESTADOS_FILTRO.map(e => `<option value="${e.v}">${e.l}</option>`).join('');
  sel.addEventListener('change', loadDashboard);
  document.getElementById('filtro-vista')?.addEventListener('change', () => {
    const vista = document.getElementById('filtro-vista')?.value;
    const filtroOferta = document.getElementById('filtro-oferta');
    if (filtroOferta) filtroOferta.style.display = vista === 'mis-ofertas' ? '' : 'none';
    loadDashboard();
  });
  document.getElementById('filtro-oferta')?.addEventListener('change', loadDashboard);

  const filtroVista = document.getElementById('filtro-vista');
  const filtroOferta = document.getElementById('filtro-oferta');
  if (filtroVista && getUser()?.rol === 'transportista') {
    filtroVista.value = 'disponibles';
    if (filtroOferta) filtroOferta.style.display = 'none';
  }
}

async function loadDashboard() {
  const user = getUser();
  const tbody = document.getElementById('solicitudes-body');
  const emptyEl = document.getElementById('empty-state');
  const thead = document.getElementById('table-head');
  const estado = document.getElementById('filtro-estado')?.value || 'todas';

  try {
    if (user.rol === 'cliente') {
      const { solicitudes } = await api(`/solicitudes/mis-solicitudes?estado=${estado}`);
      document.getElementById('stat-total').textContent = solicitudes.length;
      document.getElementById('stat-abiertas').textContent = solicitudes.filter(s => !['completada', 'cancelada'].includes(s.estado)).length;
      document.getElementById('stat-ofertas').textContent = solicitudes.reduce((sum, s) => sum + (s.num_ofertas || 0), 0);
      thead.innerHTML = '<tr><th>Maquinaria</th><th>Ruta</th><th>Retiro</th><th>Ofertas</th><th>Estado</th><th></th></tr>';
      renderRows(solicitudes, tbody, emptyEl, s => `
        <tr><td><strong>${s.tipo_maquina}</strong><br><small style="color:var(--muted)">${s.marca} ${s.modelo}</small></td>
        <td>${s.origen} → ${s.destino}</td><td>${formatDate(s.fecha_retiro)}</td><td>${s.num_ofertas || 0}</td>
        <td><span class="status-badge status-${s.estado}">${statusLabel(s.estado)}</span></td>
        <td><a href="${appPath(`/solicitud.html?id=${s.id}`)}" class="btn btn-outline btn-sm">Ver</a></td></tr>`);
    } else {
      const vista = document.getElementById('filtro-vista')?.value || 'disponibles';
      const filtroOferta = document.getElementById('filtro-oferta')?.value || 'todas';
      let endpoint;
      if (vista === 'mis-ofertas') {
        endpoint = `/solicitudes/mis-ofertas?estado_oferta=${filtroOferta}`;
      } else if (vista === 'asignadas') {
        endpoint = `/solicitudes/asignadas?estado=${estado}`;
      } else {
        endpoint = '/solicitudes/disponibles';
      }
      const { solicitudes } = await api(endpoint);
      document.getElementById('stat-total').textContent = solicitudes.length;
      document.getElementById('stat-abiertas').textContent = solicitudes.filter(s => {
        if (vista === 'mis-ofertas') return s.oferta_estado === 'pendiente' || s.oferta_estado === 'aceptada';
        if (vista === 'asignadas') return !['completada', 'cancelada'].includes(s.estado);
        return !s.ya_oferte;
      }).length;
      document.getElementById('stat-ofertas').textContent = vista === 'mis-ofertas'
        ? solicitudes.filter(s => s.oferta_estado === 'pendiente').length
        : solicitudes.length;

      if (vista === 'mis-ofertas') {
        thead.innerHTML = '<tr><th>Maquinaria</th><th>Cliente</th><th>Valor</th><th>Mi oferta</th><th>Solicitud</th><th></th></tr>';
        renderRows(solicitudes, tbody, emptyEl, s => {
          const btnLabel = s.oferta_estado === 'aceptada' && s.pago_estado === 'retenido' && !['en_transito', 'entrega_reportada', 'completada'].includes(s.estado)
            ? 'Iniciar traslado'
            : s.oferta_estado === 'aceptada' ? 'Gestionar' : 'Ver';
          return `<tr>
            <td><strong>${s.tipo_maquina}</strong><br><small>${s.marca} ${s.modelo}</small></td>
            <td>${s.cliente_nombre}</td>
            <td><strong style="color:var(--accent)">${formatMoney(s.oferta_valor)}</strong></td>
            <td><span class="status-badge status-${s.oferta_estado}">${statusLabel(s.oferta_estado)}</span></td>
            <td><span class="status-badge status-${s.estado}">${statusLabel(s.estado)}</span></td>
            <td style="white-space:nowrap;">
              <a href="${appPath(`/solicitud.html?id=${s.id}`)}" class="btn btn-outline btn-sm">${btnLabel}</a>
              ${s.oferta_estado === 'pendiente' ? `<button class="btn btn-outline btn-sm" style="margin-left:0.25rem;color:#ef4444;border-color:#ef4444;" onclick="eliminarOferta(${s.id})">Eliminar</button>` : ''}
            </td></tr>`;
        }, 'Aún no has enviado ofertas. Ve a "Disponibles" para ofertar en solicitudes abiertas.');
      } else if (vista === 'asignadas') {
        thead.innerHTML = '<tr><th>Maquinaria</th><th>Cliente</th><th>Ruta</th><th>Pago</th><th>Estado</th><th></th></tr>';
        renderRows(solicitudes, tbody, emptyEl, s => {
          const btnLabel = s.pago_estado === 'retenido' && s.estado === 'pago_retenido' ? 'Iniciar traslado' : 'Gestionar';
          return `<tr>
            <td><strong>${s.tipo_maquina}</strong><br><small>${s.marca} ${s.modelo}</small></td>
            <td>${s.cliente_nombre}</td><td>${s.origen} → ${s.destino}</td>
            <td>${s.pago_estado ? statusLabel(s.pago_estado) : '—'}</td>
            <td><span class="status-badge status-${s.estado}">${statusLabel(s.estado)}</span></td>
            <td><a href="${appPath(`/solicitud.html?id=${s.id}`)}" class="btn btn-outline btn-sm">${btnLabel}</a></td></tr>`;
        });
      } else {
        thead.innerHTML = '<tr><th>Maquinaria</th><th>Ruta</th><th>Retiro</th><th>Cliente</th><th>Mi oferta</th><th></th></tr>';
        renderRows(solicitudes, tbody, emptyEl, s => {
          const ofertó = !!s.ya_oferte && s.oferta_id;
          const ofertaCell = ofertó ? `
            <strong style="color:var(--accent)">${formatMoney(s.oferta_valor)}</strong><br>
            <small style="color:var(--muted)">Carga: ${formatDate(s.fecha_carga)} · Entrega: ${formatDate(s.fecha_entrega)}</small><br>
            <span class="status-badge status-${s.oferta_estado}">${statusLabel(s.oferta_estado)}</span>
          ` : '<span class="status-badge status-abierta">Sin oferta</span>';
          return `<tr>
            <td><strong>${s.tipo_maquina}</strong><br><small>${s.marca} ${s.modelo}</small></td>
            <td>${s.origen} → ${s.destino}</td><td>${formatDate(s.fecha_retiro)}</td>
            <td>${s.cliente_empresa || s.cliente_nombre}</td>
            <td>${ofertaCell}</td>
            <td style="white-space:nowrap;">
              <a href="${appPath(`/solicitud.html?id=${s.id}`)}" class="btn btn-outline btn-sm">${ofertó ? 'Ver' : 'Ofertar'}</a>
              ${ofertó && s.oferta_estado === 'pendiente' ? `<button class="btn btn-outline btn-sm" style="margin-left:0.25rem;color:#ef4444;border-color:#ef4444;" onclick="eliminarOferta(${s.id})">Eliminar</button>` : ''}
            </td></tr>`;
        });
      }
    }
  } catch (err) {
    if (err.message.includes('autorizado') || err.message.includes('Token')) {
      clearAuth(); window.location.href = appPath('/');
    }
  }
}

function renderRows(items, tbody, emptyEl, tpl, emptyMsg) {
  if (!items.length) {
    emptyEl.style.display = 'block';
    const msgEl = document.getElementById('empty-msg');
    if (msgEl && emptyMsg) msgEl.textContent = emptyMsg;
    tbody.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';
  tbody.innerHTML = items.map(tpl).join('');
}

async function loadPagos() {
  const { pagos } = await api('/pagos/mis-pagos');
  const tbody = document.getElementById('pagos-body');
  const empty = document.getElementById('empty-pagos');
  if (!pagos.length) { empty.style.display = 'block'; tbody.innerHTML = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = pagos.map(p => `<tr>
    <td><strong>${p.tipo_maquina}</strong> ${p.marca}</td>
    <td>${p.origen} → ${p.destino}</td>
    <td><strong style="color:var(--accent)">${formatMoney(p.monto)}</strong></td>
    <td><span class="status-badge status-${p.estado}">${statusLabel(p.estado)}</span></td>
    <td><span class="status-badge status-${p.solicitud_estado}">${statusLabel(p.solicitud_estado)}</span></td>
    <td><a href="${appPath(`/solicitud.html?id=${p.solicitud_id}`)}" class="btn btn-outline btn-sm">Ver</a></td>
  </tr>`).join('');
}

async function loadFacturacion() {
  const { facturas } = await api('/facturas');
  const tbody = document.getElementById('facturas-body');
  const empty = document.getElementById('empty-facturas');
  if (!facturas.length) { empty.style.display = 'block'; tbody.innerHTML = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = facturas.map(f => `<tr>
    <td><strong>${f.numero}</strong></td>
    <td><strong>${f.tipo_maquina}</strong> ${f.marca} ${f.modelo}</td>
    <td>${f.origen} → ${f.destino}</td>
    <td><strong style="color:var(--accent)">${formatMoney(f.monto)}</strong></td>
    <td>${formatDate(f.created_at?.slice(0, 10))}</td>
    <td><button class="btn btn-outline btn-sm" onclick="verFactura(${f.id})">Ver</button></td>
  </tr>`).join('');
}

window.eliminarOferta = async (solicitudId) => {
  if (!confirm('¿Eliminar tu oferta para esta solicitud?')) return;
  await api(`/solicitudes/${solicitudId}/oferta`, { method: 'DELETE' });
  loadDashboard();
};

window.verFactura = async (id) => {
  const { factura } = await api(`/facturas/${id}`);
  document.getElementById('factura-detalle').innerHTML = `<div class="form-card">
    <h2>Factura ${factura.numero}</h2>
    <p><strong>Cliente:</strong> ${factura.cliente_nombre} ${factura.cliente_rut ? `(${factura.cliente_rut})` : ''}</p>
    <p><strong>Maquinaria:</strong> ${factura.tipo_maquina} ${factura.marca} ${factura.modelo}</p>
    <p><strong>Ruta:</strong> ${factura.origen} → ${factura.destino}</p>
    <p><strong>Monto:</strong> ${formatMoney(factura.monto)}</p>
    <p><strong>Comisión plataforma:</strong> ${formatMoney(factura.comision || 0)}</p>
    <p><strong>Estado:</strong> ${statusLabel(factura.estado)}</p>
    <p><strong>Fecha:</strong> ${formatDate(factura.created_at?.slice(0, 10))}</p>
  </div>`;
};
