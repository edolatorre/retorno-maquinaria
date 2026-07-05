const TIMELINE = [
  { key: 'abierta', label: 'Publicada' },
  { key: 'en_oferta', label: 'Ofertas' },
  { key: 'oferta_seleccionada', label: 'Oferta elegida' },
  { key: 'pago_retenido', label: 'Pagado' },
  { key: 'en_transito', label: 'En tránsito' },
  { key: 'entrega_reportada', label: 'Entregada' },
  { key: 'completada', label: 'Completada' }
];

function renderTimeline(estado) {
  const order = TIMELINE.map(t => t.key);
  const idx = order.indexOf(estado === 'pago_pendiente' ? 'oferta_seleccionada' : estado);
  return `<div class="timeline">${TIMELINE.map((step, i) => {
    const done = i <= idx;
    const active = order[idx] === step.key || (estado === 'pago_pendiente' && step.key === 'oferta_seleccionada');
    return `<div class="timeline-step ${done ? 'done' : ''} ${active ? 'active' : ''}"><span>${i + 1}</span>${step.label}</div>`;
  }).join('')}</div>`;
}

function renderContacto(contacto) {
  if (!contacto) return '';
  const c = contacto.cliente;
  const t = contacto.transportista;
  return `<div class="form-card" style="margin-top:1rem;"><h3>📞 Datos de contacto</h3>
    <div class="two-col-contact">
      <div><strong>Cliente</strong><p>${c.nombre}<br>${c.email}<br>${c.telefono || '—'}<br>${c.empresa || ''}</p></div>
      ${t ? `<div><strong>Transportista</strong><p>${t.nombre}<br>${t.email}<br>${t.telefono || '—'}<br>${t.empresa || ''}</p></div>` : ''}
    </div></div>`;
}

function renderReportes(reportes) {
  if (!reportes?.length) return '';
  return `<div class="form-card" style="margin-top:1rem;"><h3>📋 Reportes</h3>
    ${reportes.map(r => `<div class="reporte-item">
      <strong>${r.tipo === 'retiro' ? '📸 Retiro' : '✅ Entrega'}</strong> — ${new Date(r.created_at).toLocaleString('es-CL')}
      ${r.detalles ? `<p><em>${r.detalles}</em></p>` : ''}
      ${r.comentarios ? `<p>${r.comentarios}</p>` : ''}
      ${r.receptor_nombre ? `<p>Recibió: ${r.receptor_nombre} ${r.receptor_rut ? `(${r.receptor_rut})` : ''}</p>` : ''}
      <div class="fotos-grid">${(r.fotos || []).map(f => `<a href="${f.url}" target="_blank"><img src="${f.url}" alt="foto"></a>`).join('')}</div>
    </div>`).join('')}
  </div>`;
}

async function apiForm(path, formData) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

async function loadSolicitudDetail() {
  if (!requireAuth()) return;
  initSidebar('dashboard');

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) { window.location.href = appPath('/dashboard.html'); return; }

  const user = getUser();
  const alertEl = document.getElementById('alert');
  if (params.get('pago') === 'ok') {
    showAlert(alertEl, 'Estamos verificando tu pago con Khipu. Puede tardar unos segundos.', 'success');
  }
  if (params.get('pago') === 'cancel') {
    showAlert(alertEl, 'Pago cancelado. Puedes intentarlo de nuevo cuando quieras.');
  }

  try {
    const data = await api(`/solicitudes/${id}`);
    const { solicitud, ofertas, pago, reportes, contacto, comisionPct, mi_oferta } = data;

    document.getElementById('timeline').innerHTML = renderTimeline(solicitud.estado);
    document.getElementById('solicitud-detail').innerHTML = `
      <div class="form-card">
        <h2>${solicitud.tipo_maquina} — ${solicitud.marca} ${solicitud.modelo}</h2>
        <p>#${solicitud.id} · <span class="status-badge status-${solicitud.estado}">${statusLabel(solicitud.estado)}</span></p>
        <p><strong>Ruta:</strong> ${solicitud.origen} → ${solicitud.destino}</p>
        <p><strong>Peso:</strong> ${solicitud.peso} · <strong>Dimensiones:</strong> ${solicitud.dimensiones}</p>
      </div>`;

    document.getElementById('contacto-section').innerHTML = renderContacto(contacto);
    document.getElementById('reportes-section').innerHTML = renderReportes(reportes);

    // Cliente: ofertas + seleccionar + pagar + confirmar
    if (user.rol === 'cliente') {
      renderOfertasCliente(ofertas, solicitud, comisionPct);
      renderPagoSection(solicitud, pago, comisionPct);
      if (params.get('pago') === 'ok' && pago?.estado === 'pendiente' && pago.id) {
        pollPagoEstado(pago.id, alertEl);
      }
      if (solicitud.estado === 'entrega_reportada') {
        document.getElementById('confirmar-section').style.display = 'block';
        document.getElementById('auto-confirm-info').textContent = solicitud.auto_confirm_at
          ? `Confirmación automática: ${new Date(solicitud.auto_confirm_at).toLocaleString('es-CL')}`
          : '';
        document.getElementById('btn-confirmar-entrega').onclick = async () => {
          if (!confirm('¿Confirmas que recibiste la máquina en buen estado?')) return;
          await api(`/pagos/confirmar-entrega/${id}`, { method: 'POST' });
          location.reload();
        };
      }
    }

    // Transportista: ofertar, ver oferta, reportes
    if (user.rol === 'transportista') {
      renderTransportistaOferta(mi_oferta, solicitud, id, alertEl);

      const ofertaForm = document.getElementById('oferta-form');
      if (['abierta', 'en_oferta'].includes(solicitud.estado) && !mi_oferta) {
        ofertaForm.style.display = 'block';
        ofertaForm.onsubmit = async e => {
          e.preventDefault();
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
            showAlert(alertEl, 'Oferta enviada', 'success');
            setTimeout(() => location.reload(), 1000);
          } catch (err) { showAlert(alertEl, err.message); }
        };
      }

      const puedeIniciar = solicitud.estado === 'pago_retenido' && !reportes.some(r => r.tipo === 'retiro');
      const iniciarSection = document.getElementById('iniciar-traslado-section');
      const retiroForm = document.getElementById('reporte-retiro-form');

      if (puedeIniciar && mi_oferta?.estado === 'aceptada') {
        iniciarSection.style.display = 'block';
        document.getElementById('btn-iniciar-traslado').onclick = () => {
          iniciarSection.style.display = 'none';
          retiroForm.style.display = 'block';
          retiroForm.scrollIntoView({ behavior: 'smooth' });
        };
        bindReporteForm('reporte-retiro-form', `/reportes/retiro/${id}`, alertEl);
      } else if (puedeIniciar) {
        retiroForm.style.display = 'block';
        bindReporteForm('reporte-retiro-form', `/reportes/retiro/${id}`, alertEl);
      }

      if (['en_transito', 'en_retiro'].includes(solicitud.estado) && !reportes.some(r => r.tipo === 'entrega')) {
        document.getElementById('reporte-entrega-form').style.display = 'block';
        bindReporteForm('reporte-entrega-form', `/reportes/entrega/${id}`, alertEl);
      }
    }
  } catch (err) {
    document.getElementById('solicitud-detail').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

function renderTransportistaOferta(miOferta, solicitud, solicitudId, alertEl) {
  const el = document.getElementById('transportista-oferta-section');
  if (!miOferta) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="form-card" style="margin-top:1rem;">
    <h3>Tu oferta</h3>
    <p><strong>Valor:</strong> ${formatMoney(miOferta.valor)} ·
      <span class="status-badge status-${miOferta.estado}">${statusLabel(miOferta.estado)}</span></p>
    <p><strong>Carga:</strong> ${formatDate(miOferta.fecha_carga)} · <strong>Entrega:</strong> ${formatDate(miOferta.fecha_entrega)}</p>
    ${miOferta.comentarios ? `<p>${miOferta.comentarios}</p>` : ''}
    ${miOferta.estado === 'pendiente' && ['abierta', 'en_oferta'].includes(solicitud.estado)
      ? `<button class="btn btn-outline btn-sm" id="btn-eliminar-oferta" style="margin-top:0.75rem;color:#ef4444;border-color:#ef4444;">Eliminar oferta</button>` : ''}
  </div>`;

  const btn = document.getElementById('btn-eliminar-oferta');
  if (btn) {
    btn.onclick = async () => {
      if (!confirm('¿Eliminar tu oferta?')) return;
      try {
        await api(`/solicitudes/${solicitudId}/oferta`, { method: 'DELETE' });
        showAlert(alertEl, 'Oferta eliminada', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch (err) { showAlert(alertEl, err.message); }
    };
  }
}

function renderOfertasCliente(ofertas, solicitud, comisionPct) {
  const el = document.getElementById('ofertas-section');
  if (!ofertas.length) {
    el.innerHTML = '<div class="empty-state"><p>Esperando ofertas de transportistas...</p></div>';
    return;
  }
  const canSelect = ['abierta', 'en_oferta'].includes(solicitud.estado);
  el.innerHTML = `<div class="table-card"><div class="table-header"><h2>Ofertas (${ofertas.length})</h2></div>
    <table><thead><tr><th>Transportista</th><th>Valor</th><th>Carga</th><th>Entrega</th><th>Estado</th><th></th></tr></thead>
    <tbody>${ofertas.map(o => `<tr>
      <td><strong>${o.transportista_nombre}</strong>${o.transportista_empresa ? `<br><small>${o.transportista_empresa}</small>` : ''}</td>
      <td><strong style="color:var(--accent)">${formatMoney(o.valor)}</strong></td>
      <td>${formatDate(o.fecha_carga)}</td><td>${formatDate(o.fecha_entrega)}</td>
      <td><span class="status-badge status-${o.estado}">${statusLabel(o.estado)}</span></td>
      <td>${canSelect && o.estado === 'pendiente' ? `<button class="btn btn-primary btn-sm btn-select" data-id="${o.id}">Seleccionar</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;

  el.querySelectorAll('.btn-select').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Seleccionar esta oferta? Las demás serán rechazadas.')) return;
      const alertEl = document.getElementById('alert');
      try {
        await api(`/solicitudes/${solicitud.id}/seleccionar-oferta/${btn.dataset.id}`, { method: 'POST' });
        location.reload();
      } catch (err) {
        showAlert(alertEl, err.message);
      }
    });
  });
}

function renderPagoSection(solicitud, pago, comisionPct) {
  const el = document.getElementById('pago-section');
  if (!['oferta_seleccionada', 'pago_pendiente', 'pago_retenido', 'en_transito', 'entrega_reportada', 'completada'].includes(solicitud.estado)) {
    el.innerHTML = '';
    return;
  }
  if (pago?.estado === 'retenido' || pago?.estado === 'liberado') {
    el.innerHTML = `<div class="form-card alert-success" style="margin-top:1rem;"><strong>✓ Pago ${pago.estado === 'liberado' ? 'liberado al transportista' : 'retenido en plataforma'}</strong> — ${formatMoney(pago.monto)}</div>`;
    return;
  }
  if (['oferta_seleccionada', 'pago_pendiente'].includes(solicitud.estado)) {
    el.innerHTML = `<div class="form-card" style="margin-top:1rem;">
      <h3>💳 Pagar traslado</h3>
      <p>Debes pagar antes de que el transportista retire la máquina. Comisión plataforma: ${comisionPct}%</p>
      <p style="color:var(--muted);font-size:0.85rem;margin-top:0.5rem;">Pago seguro con transferencia bancaria vía Khipu.</p>
      <button id="btn-pagar" class="btn btn-primary" style="margin-top:1rem;">Pagar con Khipu</button>
    </div>`;
    document.getElementById('btn-pagar').onclick = async () => {
      const btn = document.getElementById('btn-pagar');
      btn.disabled = true;
      btn.textContent = 'Redirigiendo a Khipu…';
      try {
        const { checkoutUrl } = await api(`/pagos/crear/${solicitud.id}`, { method: 'POST' });
        window.location.href = checkoutUrl;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Pagar con Khipu';
        showAlert(document.getElementById('alert'), err.message);
      }
    };
  }
}

async function pollPagoEstado(pagoId, alertEl, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const { pago } = await api(`/pagos/estado/${pagoId}`);
      if (pago?.estado === 'retenido') {
        showAlert(alertEl, '¡Pago confirmado! El transportista puede iniciar el retiro.', 'success');
        setTimeout(() => location.reload(), 1500);
        return;
      }
    } catch (_) {}
  }
  showAlert(alertEl, 'El pago sigue en verificación. Recarga la página en unos minutos o contacta soporte.');
}

function bindReporteForm(formId, path, alertEl) {
  const form = document.getElementById(formId);
  form.onsubmit = async e => {
    e.preventDefault();
    try {
      await apiForm(path, new FormData(form));
      showAlert(alertEl, 'Reporte subido. El cliente fue notificado por correo.', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch (err) { showAlert(alertEl, err.message); }
  };
}

if (document.getElementById('solicitud-detail')) {
  document.addEventListener('DOMContentLoaded', loadSolicitudDetail);
}
