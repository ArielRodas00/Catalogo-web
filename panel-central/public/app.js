// ============================================================
// app.js — Panel Central: login, CRUD de clientes, pagos
// ============================================================

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getToken() {
  return localStorage.getItem('panel_token');
}

function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken() };
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('toast-visible');
  setTimeout(function() { toast.classList.remove('toast-visible'); }, 3000);
}

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------
async function checkAuth() {
  const token = getToken();
  if (!token) return showLogin();

  try {
    const res = await fetch('/api/auth/verify', { headers: authHeaders() });
    if (res.ok) {
      showPanel();
    } else {
      localStorage.removeItem('panel_token');
      showLogin();
    }
  } catch (_e) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('panel').style.display = 'none';
}

function showPanel() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('panel').style.display = 'block';
  loadClientes();
}

document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const username = document.getElementById('username-input').value;
  const password = document.getElementById('password-input').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('panel_token', data.token);
      document.getElementById('login-error').style.display = 'none';
      showPanel();
    } else {
      document.getElementById('login-error').textContent = data.error || 'Credenciales incorrectas.';
      document.getElementById('login-error').style.display = 'block';
    }
  } catch (_e) {
    document.getElementById('login-error').textContent = 'Error de conexión con el servidor.';
    document.getElementById('login-error').style.display = 'block';
  }
});

document.getElementById('btn-logout').addEventListener('click', function() {
  localStorage.removeItem('panel_token');
  showLogin();
});

// ------------------------------------------------------------
// Clientes — listado
// ------------------------------------------------------------
let clientesCache = [];

async function loadClientes() {
  try {
    const res = await fetch('/api/clientes', { headers: authHeaders() });
    clientesCache = await res.json();
    renderClientesTable();
  } catch (_e) {
    showToast('Error cargando clientes');
  }
}

function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_e) {
    return false;
  }
}

function badgeEstado(estado) {
  const labels = { activo: 'Activo', vencido: 'Vencido', suspendido: 'Suspendido' };
  return '<span class="badge badge-' + estado + '">' + labels[estado] + '</span>';
}

function badgePlan(plan) {
  const labels = { basico: 'Básico', premium: 'Premium' };
  return '<span class="badge badge-' + plan + '">' + labels[plan] + '</span>';
}

function clienteRowHTML(c, slugLabel) {
  const cobro = c.fecha_proximo_cobro
    ? new Date(c.fecha_proximo_cobro).toLocaleDateString('es-PY')
    : '—';
  const nombreCell = (c.deploy_url && isSafeHttpUrl(c.deploy_url))
    ? '<a href="' + escapeHTML(c.deploy_url) + '" target="_blank" rel="noopener noreferrer" class="cliente-link" title="Abrir el catálogo de este cliente">' +
        escapeHTML(c.nombre) + ' <span class="cliente-link-icon">↗</span></a>'
    : escapeHTML(c.nombre);
  return '<tr>' +
    '<td>' + nombreCell + '</td>' +
    '<td>' + escapeHTML(slugLabel) + '</td>' +
    '<td>' + badgePlan(c.plan) + '</td>' +
    '<td>' + badgeEstado(c.estado) + '</td>' +
    '<td>' + cobro + '</td>' +
    '<td>' +
      '<button class="btn-secondary btn-icon-small" onclick="openEditCliente(' + c.id + ')">Editar</button>' +
      '<button class="btn-secondary btn-icon-small" onclick="openPagos(' + c.id + ')">Pagos</button>' +
      '<button class="btn-danger btn-icon-small" onclick="confirmDeleteCliente(' + c.id + ')">Eliminar</button>' +
    '</td>' +
  '</tr>';
}

// Dos secciones separadas, no una tabla mezclada — ver product-section en
// styles.css. Cada una con su propio contador, así se entiende de un
// vistazo cuántos clientes tenés de cada producto.
function renderClientesTable() {
  document.getElementById('cliente-count').textContent =
    clientesCache.length + ' cliente' + (clientesCache.length !== 1 ? 's' : '');

  const catalogos = clientesCache.filter(function(c) { return c.producto !== 'lavadero360'; });
  const lavaderos = clientesCache.filter(function(c) { return c.producto === 'lavadero360'; });

  document.getElementById('catalogo-count').textContent =
    catalogos.length + ' cliente' + (catalogos.length !== 1 ? 's' : '');
  document.getElementById('lavadero360-count').textContent =
    lavaderos.length + ' cliente' + (lavaderos.length !== 1 ? 's' : '');

  const catalogoTbody = document.getElementById('catalogo-tbody');
  catalogoTbody.innerHTML = catalogos.length === 0
    ? '<tr><td colspan="6">Todavía no hay clientes de catálogo cargados.</td></tr>'
    : catalogos.map(function(c) { return clienteRowHTML(c, c.slug); }).join('');

  const lavaderoTbody = document.getElementById('lavadero360-tbody');
  lavaderoTbody.innerHTML = lavaderos.length === 0
    ? '<tr><td colspan="6">Todavía no hay clientes de Lavadero360 cargados.</td></tr>'
    : lavaderos.map(function(c) { return clienteRowHTML(c, c.lavadero360_org_slug || '—'); }).join('');
}

// ------------------------------------------------------------
// Modal alta/edición de cliente
// ------------------------------------------------------------
let editingId = null;

// Sincroniza un <input type="color"> (solo elige) con su <input type="text">
// hermano (el que realmente se envía — vacío = "usar default del catálogo",
// algo que type="color" no puede representar por sí solo).
function setupColorSync(pickerId, textId) {
  const picker = document.getElementById(pickerId);
  const text = document.getElementById(textId);
  picker.addEventListener('input', function() {
    text.value = picker.value;
  });
  text.addEventListener('input', function() {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) picker.value = text.value;
  });
}
setupColorSync('field-color-primary-picker', 'field-color-primary');
setupColorSync('field-color-primary-hover-picker', 'field-color-primary-hover');
setupColorSync('field-color-accent-picker', 'field-color-accent');

function updateLogoTypeUI() {
  const esImagen = document.getElementById('field-logo-type-imagen').checked;
  document.getElementById('row-logo-texto').style.display = esImagen ? 'none' : 'block';
  document.getElementById('row-logo-imagen').style.display = esImagen ? 'block' : 'none';
  document.getElementById('row-logo-imagen-sin-cliente').style.display =
    (esImagen && editingId === null) ? 'block' : 'none';
  document.getElementById('row-logo-imagen-upload').style.display =
    (esImagen && editingId !== null) ? 'block' : 'none';
}
document.getElementById('field-logo-type-texto').addEventListener('change', updateLogoTypeUI);
document.getElementById('field-logo-type-imagen').addEventListener('change', updateLogoTypeUI);

// Lavadero360 no usa marca de catálogo (branding.js allá no existe) ni
// api_key (no consulta licencia por polling, ver lavadero360Sync.js) — en
// cambio necesita el campo de slug para saber a qué cuenta apunta.
function updateProductoUI() {
  const esLavadero360 = document.getElementById('field-producto').value === 'lavadero360';
  document.getElementById('row-branding-section').style.display = esLavadero360 ? 'none' : 'block';
  document.getElementById('row-lavadero360-org-slug').style.display = esLavadero360 ? 'block' : 'none';
  if (esLavadero360) {
    document.getElementById('row-api-key').style.display = 'none';
  } else if (editingId !== null) {
    document.getElementById('row-api-key').style.display = 'block';
  }
}
document.getElementById('field-producto').addEventListener('change', updateProductoUI);

function resetBrandingFields() {
  document.getElementById('field-logo-type-texto').checked = true;
  document.getElementById('field-store-name').value = '';
  document.getElementById('field-store-name-accent').value = '';
  document.getElementById('field-favicon-url').value = '';
  ['field-color-primary', 'field-color-primary-hover', 'field-color-accent'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('logo-preview').style.display = 'none';
  document.getElementById('btn-quitar-logo').style.display = 'none';
  document.getElementById('logo-upload-hint').textContent = '';
  document.getElementById('field-logo-file').value = '';
  updateLogoTypeUI();
}

document.getElementById('btn-new-cliente').addEventListener('click', function() {
  editingId = null;
  document.getElementById('cliente-modal-title').textContent = 'Nuevo cliente';
  document.getElementById('cliente-form').reset();
  document.getElementById('field-id').value = '';
  document.getElementById('field-producto').value = 'catalogo';
  document.getElementById('field-lavadero360-org-slug').value = '';
  document.getElementById('row-estado').style.display = 'none';
  document.getElementById('row-api-key').style.display = 'none';
  resetBrandingFields();
  updateProductoUI();
  document.getElementById('cliente-modal-overlay').style.display = 'flex';
});

async function openEditCliente(id) {
  try {
    const res = await fetch('/api/clientes/' + id, { headers: authHeaders() });
    if (!res.ok) return showToast('Error cargando el cliente');
    const c = await res.json();

    editingId = c.id;
    document.getElementById('cliente-modal-title').textContent = 'Editar cliente';
    document.getElementById('field-id').value = c.id;
    document.getElementById('field-producto').value = c.producto || 'catalogo';
    document.getElementById('field-lavadero360-org-slug').value = c.lavadero360_org_slug || '';
    document.getElementById('field-nombre').value = c.nombre;
    document.getElementById('field-slug').value = c.slug;
    document.getElementById('field-plan').value = c.plan;
    document.getElementById('field-estado').value = c.estado;
    document.getElementById('field-deploy-url').value = c.deploy_url || '';
    document.getElementById('field-fecha-cobro').value = c.fecha_proximo_cobro
      ? c.fecha_proximo_cobro.slice(0, 10)
      : '';
    document.getElementById('field-notas').value = c.notas || '';
    document.getElementById('field-api-key').textContent = c.api_key;

    document.getElementById('field-store-name').value = c.store_name || '';
    document.getElementById('field-store-name-accent').value = c.store_name_accent || '';
    document.getElementById('field-favicon-url').value = c.favicon_url || '';
    document.getElementById('field-color-primary').value = c.color_primary || '';
    document.getElementById('field-color-primary-hover').value = c.color_primary_hover || '';
    document.getElementById('field-color-accent').value = c.color_accent || '';
    ['field-color-primary', 'field-color-primary-hover', 'field-color-accent'].forEach(function(id) {
      const val = document.getElementById(id).value;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) document.getElementById(id + '-picker').value = val;
    });

    document.getElementById('field-logo-type-texto').checked = c.logo_type !== 'imagen';
    document.getElementById('field-logo-type-imagen').checked = c.logo_type === 'imagen';
    document.getElementById('logo-upload-hint').textContent = '';
    document.getElementById('field-logo-file').value = '';
    if (c.logo_type === 'imagen' && c.logo_image_data) {
      const preview = document.getElementById('logo-preview');
      preview.src = 'data:' + c.logo_image_mime + ';base64,' + c.logo_image_data;
      preview.style.display = 'inline-block';
      document.getElementById('btn-quitar-logo').style.display = 'inline-block';
    } else {
      document.getElementById('logo-preview').style.display = 'none';
      document.getElementById('btn-quitar-logo').style.display = 'none';
    }
    updateLogoTypeUI();

    document.getElementById('row-estado').style.display = 'block';
    document.getElementById('row-api-key').style.display = 'block';
    updateProductoUI();
    document.getElementById('cliente-modal-overlay').style.display = 'flex';
  } catch (_e) {
    showToast('Error de conexión');
  }
}

document.getElementById('field-logo-file').addEventListener('change', async function() {
  const file = this.files[0];
  if (!file || editingId === null) return;

  const formData = new FormData();
  formData.append('logo', file);

  try {
    const res = await fetch('/api/clientes/' + editingId + '/logo', {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Logo actualizado ✓');
      const reader = new FileReader();
      reader.onload = function() {
        const preview = document.getElementById('logo-preview');
        preview.src = reader.result;
        preview.style.display = 'inline-block';
      };
      reader.readAsDataURL(file);
      document.getElementById('btn-quitar-logo').style.display = 'inline-block';
      document.getElementById('logo-upload-hint').textContent = '';
    } else {
      document.getElementById('logo-upload-hint').textContent = data.error || 'Error al subir el logo';
    }
  } catch (_e) {
    document.getElementById('logo-upload-hint').textContent = 'Error de conexión';
  }
});

document.getElementById('btn-quitar-logo').addEventListener('click', async function() {
  if (editingId === null) return;
  try {
    await fetch('/api/clientes/' + editingId + '/logo', { method: 'DELETE', headers: authHeaders() });
    showToast('Logo eliminado — vuelve al nombre en texto ✓');
    document.getElementById('logo-preview').style.display = 'none';
    document.getElementById('btn-quitar-logo').style.display = 'none';
    document.getElementById('field-logo-file').value = '';
    document.getElementById('field-logo-type-texto').checked = true;
    updateLogoTypeUI();
  } catch (_e) {
    showToast('Error de conexión');
  }
});

function closeClienteModal() {
  document.getElementById('cliente-modal-overlay').style.display = 'none';
  editingId = null;
}
document.getElementById('btn-cancel-cliente').addEventListener('click', closeClienteModal);
document.getElementById('btn-close-cliente-modal').addEventListener('click', closeClienteModal);
document.getElementById('cliente-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeClienteModal();
});

document.getElementById('btn-regenerar-key').addEventListener('click', async function() {
  if (!editingId) return;
  if (!confirm('¿Regenerar la API key? El deploy de este cliente va a necesitar la nueva key para seguir consultando su licencia.')) return;

  try {
    const res = await fetch('/api/clientes/' + editingId + '/regenerar-api-key', {
      method: 'POST',
      headers: authHeaders()
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('field-api-key').textContent = data.api_key;
      showToast('API key regenerada ✓');
    } else {
      showToast('Error: ' + data.error);
    }
  } catch (_e) {
    showToast('Error de conexión');
  }
});

document.getElementById('cliente-form').addEventListener('submit', async function(e) {
  e.preventDefault();

  const payload = {
    producto: document.getElementById('field-producto').value,
    nombre: document.getElementById('field-nombre').value.trim(),
    slug: document.getElementById('field-slug').value.trim().toLowerCase(),
    lavadero360_org_slug: document.getElementById('field-lavadero360-org-slug').value.trim().toLowerCase() || null,
    plan: document.getElementById('field-plan').value,
    deploy_url: document.getElementById('field-deploy-url').value.trim() || null,
    fecha_proximo_cobro: document.getElementById('field-fecha-cobro').value || null,
    notas: document.getElementById('field-notas').value.trim() || null,
    store_name: document.getElementById('field-store-name').value.trim() || null,
    store_name_accent: document.getElementById('field-store-name-accent').value.trim() || null,
    favicon_url: document.getElementById('field-favicon-url').value.trim() || null,
    color_primary: document.getElementById('field-color-primary').value.trim() || null,
    color_primary_hover: document.getElementById('field-color-primary-hover').value.trim() || null,
    color_accent: document.getElementById('field-color-accent').value.trim() || null
  };

  const isEditing = editingId !== null;
  if (isEditing) {
    payload.estado = document.getElementById('field-estado').value;
  }

  try {
    const res = await fetch('/api/clientes' + (isEditing ? '/' + editingId : ''), {
      method: isEditing ? 'PUT' : 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok) {
      if (data.sync_warning) {
        showToast('Guardado, pero no se pudo sincronizar con Lavadero360: ' + data.sync_warning);
      } else {
        showToast(isEditing ? 'Cliente actualizado ✓' : 'Cliente creado ✓');
      }
      closeClienteModal();
      await loadClientes();
    } else {
      showToast('Error: ' + data.error);
    }
  } catch (_e) {
    showToast('Error de conexión');
  }
});

// ------------------------------------------------------------
// Eliminar
// ------------------------------------------------------------
let deleteTargetId = null;

function confirmDeleteCliente(id) {
  const cliente = clientesCache.find(function(c) { return c.id === id; });
  if (!cliente) return;
  deleteTargetId = id;
  document.getElementById('delete-cliente-nombre').textContent = cliente.nombre;
  document.getElementById('confirm-modal').style.display = 'flex';
}

document.getElementById('btn-confirm-delete').addEventListener('click', async function() {
  if (deleteTargetId === null) return;
  try {
    await fetch('/api/clientes/' + deleteTargetId, { method: 'DELETE', headers: authHeaders() });
    showToast('Cliente eliminado ✓');
    await loadClientes();
  } catch (_e) {
    showToast('Error de conexión');
  }
  deleteTargetId = null;
  document.getElementById('confirm-modal').style.display = 'none';
});

document.getElementById('btn-cancel-delete').addEventListener('click', function() {
  deleteTargetId = null;
  document.getElementById('confirm-modal').style.display = 'none';
});

// ------------------------------------------------------------
// Pagos
// ------------------------------------------------------------
let pagosClienteId = null;

async function openPagos(id) {
  const cliente = clientesCache.find(function(c) { return c.id === id; });
  if (!cliente) return;

  pagosClienteId = id;
  document.getElementById('pagos-cliente-nombre').textContent = cliente.nombre;
  document.getElementById('pago-form').reset();
  document.getElementById('pagos-modal-overlay').style.display = 'flex';
  await loadPagos();
}

async function loadPagos() {
  try {
    const res = await fetch('/api/clientes/' + pagosClienteId + '/pagos', { headers: authHeaders() });
    const pagos = await res.json();
    const tbody = document.getElementById('pagos-tbody');

    if (pagos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay pagos registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = pagos.map(function(p) {
      const fecha = new Date(p.fecha).toLocaleDateString('es-PY');
      const monto = new Intl.NumberFormat('es-PY').format(p.monto);
      return '<tr>' +
        '<td>' + fecha + '</td>' +
        '<td>' + p.moneda + ' ' + monto + '</td>' +
        '<td>' + escapeHTML(p.metodo) + '</td>' +
        '<td>' + escapeHTML(p.notas || '') + '</td>' +
      '</tr>';
    }).join('');
  } catch (_e) {
    showToast('Error cargando pagos');
  }
}

document.getElementById('pago-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const payload = {
    monto: Number(document.getElementById('pago-monto').value),
    metodo: document.getElementById('pago-metodo').value,
    notas: document.getElementById('pago-notas').value.trim() || null
  };

  try {
    const res = await fetch('/api/clientes/' + pagosClienteId + '/pagos', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Pago registrado ✓');
      document.getElementById('pago-form').reset();
      await loadPagos();
    } else {
      showToast('Error: ' + data.error);
    }
  } catch (_e) {
    showToast('Error de conexión');
  }
});

function closePagosModal() {
  document.getElementById('pagos-modal-overlay').style.display = 'none';
  pagosClienteId = null;
}
document.getElementById('btn-close-pagos-modal').addEventListener('click', closePagosModal);
document.getElementById('pagos-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closePagosModal();
});

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------
checkAuth();
