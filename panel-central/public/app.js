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

function badgeEstado(estado) {
  const labels = { activo: 'Activo', vencido: 'Vencido', suspendido: 'Suspendido' };
  return '<span class="badge badge-' + estado + '">' + labels[estado] + '</span>';
}

function badgePlan(plan) {
  const labels = { basico: 'Básico', premium: 'Premium' };
  return '<span class="badge badge-' + plan + '">' + labels[plan] + '</span>';
}

function renderClientesTable() {
  const tbody = document.getElementById('clientes-tbody');
  document.getElementById('cliente-count').textContent =
    clientesCache.length + ' cliente' + (clientesCache.length !== 1 ? 's' : '');

  if (clientesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Todavía no hay clientes cargados.</td></tr>';
    return;
  }

  tbody.innerHTML = clientesCache.map(function(c) {
    const cobro = c.fecha_proximo_cobro
      ? new Date(c.fecha_proximo_cobro).toLocaleDateString('es-PY')
      : '—';
    return '<tr>' +
      '<td>' + escapeHTML(c.nombre) + '</td>' +
      '<td>' + escapeHTML(c.slug) + '</td>' +
      '<td>' + badgePlan(c.plan) + '</td>' +
      '<td>' + badgeEstado(c.estado) + '</td>' +
      '<td>' + cobro + '</td>' +
      '<td>' +
        '<button class="btn-secondary btn-icon-small" onclick="openEditCliente(' + c.id + ')">Editar</button>' +
        '<button class="btn-secondary btn-icon-small" onclick="openPagos(' + c.id + ')">Pagos</button>' +
        '<button class="btn-danger btn-icon-small" onclick="confirmDeleteCliente(' + c.id + ')">Eliminar</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

// ------------------------------------------------------------
// Modal alta/edición de cliente
// ------------------------------------------------------------
let editingId = null;

document.getElementById('btn-new-cliente').addEventListener('click', function() {
  editingId = null;
  document.getElementById('cliente-modal-title').textContent = 'Nuevo cliente';
  document.getElementById('cliente-form').reset();
  document.getElementById('field-id').value = '';
  document.getElementById('row-estado').style.display = 'none';
  document.getElementById('row-api-key').style.display = 'none';
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

    document.getElementById('row-estado').style.display = 'block';
    document.getElementById('row-api-key').style.display = 'block';
    document.getElementById('cliente-modal-overlay').style.display = 'flex';
  } catch (_e) {
    showToast('Error de conexión');
  }
}

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
    nombre: document.getElementById('field-nombre').value.trim(),
    slug: document.getElementById('field-slug').value.trim().toLowerCase(),
    plan: document.getElementById('field-plan').value,
    deploy_url: document.getElementById('field-deploy-url').value.trim() || null,
    fecha_proximo_cobro: document.getElementById('field-fecha-cobro').value || null,
    notas: document.getElementById('field-notas').value.trim() || null
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
      showToast(isEditing ? 'Cliente actualizado ✓' : 'Cliente creado ✓');
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
