// ============================================================
// admin.js — Lógica del panel de administrador (Fase 2)
// ============================================================
// Actualizado para usar async/await con el servidor
// ============================================================


// ------------------------------------------------------------
// SECCIÓN 1: AUTENTICACIÓN CON JWT
// ------------------------------------------------------------

// ============================================================
// MÉTRICAS
// ============================================================

let chartVistas = null;
let chartClicks = null;
// Guardamos referencias a los gráficos para destruirlos
// antes de recrearlos al cambiar el período

async function loadMetrics() {
  try {
    const period = document.getElementById('metrics-period').value;
    const token  = localStorage.getItem('admin_token');

    const res  = await fetch('/api/metrics/dashboard?period=' + period, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    window._lastMetricsData = data;

    // --- Cards de totales ---
    document.getElementById('total-vistas').textContent    = data.totales.vistas;
    document.getElementById('total-clicks').textContent    = data.totales.clicks;
    document.getElementById('total-busquedas').textContent = data.totales.busquedas;

  // --- Gráfico de vistas (top 5) ---
  const top5Vistas = data.topVistas.slice(0, 5);
  const labelsVistas = top5Vistas.map(function(p) { return p.name; });
  const dataVistas   = top5Vistas.map(function(p) { return parseInt(p.vistas); });

  if (chartVistas) chartVistas.destroy();
  // Destruimos el gráfico anterior antes de crear uno nuevo

  chartVistas = new Chart(document.getElementById('chart-vistas'), {
    type: 'bar',
    data: {
      labels:   labelsVistas,
      datasets: [{
        label:           'Vistas',
        data:            dataVistas,
        backgroundColor: 'rgba(193, 18, 31, 0.7)',
        borderColor:     'rgba(193, 18, 31, 1)',
        borderWidth:     1,
        borderRadius:    4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales:  {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { ticks: { font: { size: 11 } } }
      }
    }
  });

  // Tabla de vistas (top 5)
  renderMetricsTable(
    document.getElementById('table-vistas'),
    data.topVistas,
    'vistas',
    5
  );

  // --- Gráfico de clicks WhatsApp (top 5) ---
  const top5Clicks = data.topClicks.slice(0, 5);
  const labelsClicks = top5Clicks.map(function(p) { return p.name; });
  const dataClicks   = top5Clicks.map(function(p) { return parseInt(p.clicks); });

  if (chartClicks) chartClicks.destroy();

  chartClicks = new Chart(document.getElementById('chart-clicks'), {
    type: 'bar',
    data: {
      labels:   labelsClicks,
      datasets: [{
        label:           'Clicks WhatsApp',
        data:            dataClicks,
        backgroundColor: 'rgba(37, 211, 102, 0.7)',
        borderColor:     'rgba(37, 211, 102, 1)',
        borderWidth:     1,
        borderRadius:    4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales:  {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { ticks: { font: { size: 11 } } }
      }
    }
  });

  // Tabla de clicks (top 5)
  renderMetricsTable(
    document.getElementById('table-clicks'),
    data.topClicks,
    'clicks',
    5
  );

  // --- Tabla de búsquedas (top 5) ---
  renderMetricsTable(
    document.getElementById('table-busquedas'),
    data.topBusquedas,
    'busquedas',
    5
  );
  } catch (err) {
    console.error('Error cargando métricas:', err);
  }
}

function renderMetricsTable(table, data, field, limit) {
  const displayData = limit ? data.slice(0, limit) : data;
  table.innerHTML =
    '<tr><th>Producto</th><th style="text-align:right">' + (field === 'vistas' ? 'Vistas' : field === 'clicks' ? 'Clicks' : 'Búsquedas') + '</th></tr>' +
    displayData.map(function(p) {
      const name = field === 'busquedas' ? escapeHTML(p.termino) : escapeHTML(p.name);
      const value = field === 'busquedas' ? p.cantidad : (parseInt(p[field]) || 0);
      return '<tr>' +
        '<td class="td-product-name">' + name + '</td>' +
        '<td class="td-value">' + value + '</td>' +
      '</tr>';
    }).join('');
}

let metricsInterval = null;

function startMetricsAutoRefresh() {
  stopMetricsAutoRefresh();
  // Actualiza las métricas cada 15 segundos mientras
  // el admin esté mirando la pestaña de métricas
  metricsInterval = setInterval(loadMetrics, 15000);
}

function stopMetricsAutoRefresh() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

// Tabs del admin
function initTabs() {
  document.querySelectorAll('.admin-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      const target = this.getAttribute('data-tab');

      // Actualizamos los tabs
      document.querySelectorAll('.admin-tab').forEach(function(t) {
        t.classList.remove('active');
      });
      this.classList.add('active');

      // Mostramos el panel correcto
      document.getElementById('panel-productos').style.display  = 'none';
      document.getElementById('panel-metricas').style.display   = 'none';
      document.getElementById('panel-stock').style.display      = 'none';
      document.getElementById('panel-recepcion').style.display  = 'none';
      stopMetricsAutoRefresh();

      if (target === 'productos') {
        document.getElementById('panel-productos').style.display = 'block';
      } else if (target === 'metricas') {
        document.getElementById('panel-metricas').style.display = 'block';
        loadMetrics();
        startMetricsAutoRefresh();
      } else if (target === 'stock') {
        document.getElementById('panel-stock').style.display = 'block';
        loadStockPanel();
      } else if (target === 'recepcion') {
        document.getElementById('panel-recepcion').style.display = 'block';
        showRecepcionPanel();
      }
    });
  });

  // Selector de período
  document.getElementById('metrics-period').addEventListener('change', loadMetrics);
}

// Verificamos si hay un token válido al cargar la página
async function checkAuth() {
  const token = localStorage.getItem('admin_token');

  if (!token) {
    showLogin();
    return;
  }

  try {
    // Verificamos el token con el servidor
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (res.ok) {
      const data = await res.json();
      showPanel(data.username);
    } else {
      // Token inválido o vencido
      localStorage.removeItem('admin_token');
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-panel').style.display  = 'none';
}

function showPanel(username) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-panel').style.display  = 'block';
  initAdmin();
}

// Formulario de login
document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();

  const username = document.getElementById('username-input').value;
  const password = document.getElementById('password-input').value;

  try {
    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('admin_token', data.token);
      // Guardamos el token en localStorage
      document.getElementById('login-error').style.display = 'none';
      showPanel(data.username);
    } else {
      document.getElementById('login-error').style.display = 'block';
      document.getElementById('login-error').textContent   = data.error;
    }
  } catch (err) {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('login-error').textContent   = 'Error de conexión con el servidor';
  }
});

// Cerrar sesión
document.getElementById('btn-logout').addEventListener('click', function() {
  localStorage.removeItem('admin_token');
  // Eliminamos el token
  showLogin();
});


// ------------------------------------------------------------
// SECCIÓN 2: VARIABLES GLOBALES
// ------------------------------------------------------------
let editingId       = null;
let deleteTargetId  = null;
const ITEMS_PER_PAGE = 10;
let currentAdminPage = 1;


// ------------------------------------------------------------
// SECCIÓN 3: INICIALIZACIÓN
// ------------------------------------------------------------
async function initAdmin() {
  await renderAdminTable();
  await populateCategorySelect();
  setupImagePreview();
  initTabs();
  initAdminViewToggle();

  // Switch de oferta
  document.getElementById('field-en-oferta').addEventListener('change', function() {
    const row = document.getElementById('row-oferta');
    row.style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
      document.getElementById('field-precio-oferta').focus();
    } else {
      document.getElementById('field-precio-oferta').value = '';
    }
  });

  // Switch de promoción
  document.getElementById('field-en-promocion').addEventListener('change', function() {
    const row = document.getElementById('row-promocion');
    row.style.display = this.checked ? 'block' : 'none';
    if (!this.checked) {
      document.getElementById('field-fecha-fin').value = '';
    }
  });

  // → Listeners de filtros y buscador
  document.getElementById('admin-search').addEventListener('input', function() {
    renderAdminTable(1);
  });
  document.getElementById('admin-filter-stock').addEventListener('change', function() {
    renderAdminTable(1);
  });
  document.getElementById('admin-order').addEventListener('change', function() {
    renderAdminTable(1);
  });

  // Listeners de subcategorías (una sola vez, no en populateCategorySelect)
  document.getElementById('field-category').addEventListener('change', async function() {
    const allProducts = await getProducts();
    const selectedCat = this.value ||
      document.getElementById('field-new-category').value.trim().toLowerCase();
    await updateSubcatSelect(selectedCat, allProducts);
  });
  document.getElementById('field-new-category').addEventListener('input', async function() {
    const allProducts = await getProducts();
    const selectedCat = this.value.trim().toLowerCase();
    await updateSubcatSelect(selectedCat, allProducts);
  });
}


// ------------------------------------------------------------
// SECCIÓN 4: TABLA DE PRODUCTOS
// ------------------------------------------------------------

// Helper para escapar HTML y prevenir XSS
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderAdminTable(page) {
  if (page === undefined) page = 1;
  currentAdminPage = page;

  let all = await getProducts();

  // --- Filtro de búsqueda ---
  const searchText = document.getElementById('admin-search')
    ? document.getElementById('admin-search').value.toLowerCase().trim()
    : '';

  if (searchText !== '') {
    all = all.filter(function(p) {
      return p.name.toLowerCase().includes(searchText) ||
            p.category.toLowerCase().includes(searchText) ||
            (p.brand && p.brand.toLowerCase().includes(searchText));
    });
  }

  // --- Filtro de estado ---
  const filterStock = document.getElementById('admin-filter-stock')
    ? document.getElementById('admin-filter-stock').value
    : 'all';

  if (filterStock === 'stock')     all = all.filter(function(p) { return p.en_stock; });
  if (filterStock === 'nostock')   all = all.filter(function(p) { return !p.en_stock; });
  if (filterStock === 'destacado') all = all.filter(function(p) { return p.destacado; });
  if (filterStock === 'oferta')    all = all.filter(function(p) { return p.en_oferta; });
  if (filterStock === 'promocion') all = all.filter(function(p) { return p.en_promocion; });

  // --- Ordenamiento ---
  const order = document.getElementById('admin-order')
    ? document.getElementById('admin-order').value
    : 'reciente';

  if (order === 'az')          all.sort(function(a, b) { return a.name.localeCompare(b.name); });
  if (order === 'za')          all.sort(function(a, b) { return b.name.localeCompare(a.name); });
  if (order === 'precio-asc')  all.sort(function(a, b) { return a.price - b.price; });
  if (order === 'precio-desc') all.sort(function(a, b) { return b.price - a.price; });

  const tbody = document.getElementById('products-tbody');

  // --- Paginación ---
  const totalPages = Math.ceil(all.length / ITEMS_PER_PAGE);
  const start      = (page - 1) * ITEMS_PER_PAGE;
  const end        = start + ITEMS_PER_PAGE;
  const paginated  = all.slice(start, end);

  tbody.innerHTML = '';

  if (all.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="table-empty">No hay productos que coincidan.</td></tr>';
  } else {
    paginated.forEach(function(product) {
      const tr = document.createElement('tr');

      const precioHTML = (product.en_oferta && product.precio_oferta)
        ? '<span class="price-original">Gs. ' + new Intl.NumberFormat('es-PY').format(product.price) + '</span>' +
          '<span class="price-oferta">Gs. ' + new Intl.NumberFormat('es-PY').format(product.precio_oferta) + '</span>'
        : 'Gs. ' + new Intl.NumberFormat('es-PY').format(product.price);

      const estadoHTML =
        (!product.en_stock
          ? '<span class="badge badge-nostock">Sin stock</span>'
          : '<span class="badge badge-stock">En stock</span>') +
        (product.destacado    ? '<span class="badge badge-destacado">Destacado</span>' : '') +
        (product.en_oferta    ? '<span class="badge badge-oferta">Oferta</span>'       : '') +
        (product.en_promocion ? '<span class="badge badge-promo">Promoción</span>'     : '');

      const subcatHTML   = product.subcategoria
        ? '<span class="td-sub">/ ' + escapeHTML(product.subcategoria) + '</span>'
        : '';

      const nombreSeguro = encodeURIComponent(product.name);

      tr.innerHTML =
        '<td><img src="' + escapeAttr(product.image) + '" alt="' + escapeHTML(product.name) + '" class="table-thumb"></td>' +
        '<td class="td-name">'     + escapeHTML(product.name)     + '</td>' +
        '<td class="td-category">' + escapeHTML(product.category) + ' ' + subcatHTML + '</td>' +
        '<td class="td-price">'    + precioHTML        + '</td>' +
        '<td class="td-estado">'   + estadoHTML        + '</td>' +
        '<td class="td-actions">' +
          '<button class="btn-edit" onclick="openEditForm(' + product.id + ')">' +
            '<span class="material-symbols-outlined">edit</span>' +
          '</button>' +
          '<button class="btn-delete" onclick="confirmDelete(' + product.id + ', \'' + nombreSeguro + '\')">' +
            '<span class="material-symbols-outlined">delete</span>' +
          '</button>' +
        '</td>';

      tbody.appendChild(tr);
    });
  }

  renderAdminPagination(page, totalPages);

  document.getElementById('product-count').textContent =
    all.length + ' producto' + (all.length !== 1 ? 's' : '') + ' en total';

  // También renderizamos la vista de tarjetas con los mismos datos
  renderAdminCards(paginated);
}


// ------------------------------------------------------------
// renderAdminCards() — vista de tarjetas del admin
// ------------------------------------------------------------
function renderAdminCards(paginated) {
  const grid = document.getElementById('admin-cards-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (paginated.length === 0) {
    grid.innerHTML = '<p style="color:#aaa; padding:20px">No hay productos que coincidan.</p>';
    return;
  }

  paginated.forEach(function(product) {
    const card = document.createElement('div');
    card.className = 'admin-card';

    const precioHTML = (product.en_oferta && product.precio_oferta)
      ? '<span class="price-original">Gs. ' + new Intl.NumberFormat('es-PY').format(product.price) + '</span> ' +
        '<span class="admin-card-price">Gs. ' + new Intl.NumberFormat('es-PY').format(product.precio_oferta) + '</span>'
      : '<span class="admin-card-price">Gs. ' + new Intl.NumberFormat('es-PY').format(product.price) + '</span>';

    const badgesHTML =
      (!product.en_stock    ? '<span class="badge badge-nostock">Sin stock</span>'    : '<span class="badge badge-stock">En stock</span>') +
      (product.destacado    ? '<span class="badge badge-destacado">Destacado</span>'  : '') +
      (product.en_oferta    ? '<span class="badge badge-oferta">Oferta</span>'        : '') +
      (product.en_promocion ? '<span class="badge badge-promo">Promoción</span>'      : '');

    const nombreSeguro = encodeURIComponent(product.name);

    card.innerHTML =
      '<img src="' + escapeAttr(product.image) + '" alt="' + escapeHTML(product.name) + '" class="admin-card-image">' +
      '<div class="admin-card-body">' +
        '<p class="admin-card-category">' + escapeHTML(product.category) + '</p>' +
        '<h4 class="admin-card-name">' + escapeHTML(product.name) + '</h4>' +
        '<div>' + precioHTML + '</div>' +
        '<div class="admin-card-badges">' + badgesHTML + '</div>' +
        '<div class="admin-card-actions">' +
          '<button class="btn-edit" onclick="openEditForm(' + product.id + ')">' +
            '<span class="material-symbols-outlined">edit</span>' +
          '</button>' +
          '<button class="btn-delete" onclick="confirmDelete(' + product.id + ', \'' + nombreSeguro + '\')">' +
            '<span class="material-symbols-outlined">delete</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    grid.appendChild(card);
  });
}


// ------------------------------------------------------------
// Toggle tabla / tarjetas
// ------------------------------------------------------------
function initAdminViewToggle() {
  const btnTable = document.getElementById('btn-admin-view-table');
  const btnCards = document.getElementById('btn-admin-view-cards');
  const tableWrapper = document.getElementById('admin-table-wrapper');
  const cardsGrid     = document.getElementById('admin-cards-grid');

  if (!btnTable || !btnCards) return;

  btnTable.addEventListener('click', function() {
    btnTable.classList.add('active');
    btnCards.classList.remove('active');
    tableWrapper.style.display = 'block';
    cardsGrid.style.display    = 'none';
  });

  btnCards.addEventListener('click', function() {
    btnCards.classList.add('active');
    btnTable.classList.remove('active');
    tableWrapper.style.display = 'none';
    cardsGrid.style.display    = 'grid';
  });
}

function renderAdminPagination(current, total) {
  const container = document.getElementById('admin-pagination');
  container.innerHTML = '';
  if (total <= 1) return;

  const btnPrev = document.createElement('button');
  btnPrev.textContent = '←';
  btnPrev.disabled = (current === 1);
  btnPrev.addEventListener('click', function() { renderAdminTable(current - 1); });
  container.appendChild(btnPrev);

  for (let i = 1; i <= total; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    if (i === current) btn.classList.add('active');
    btn.addEventListener('click', function() { renderAdminTable(i); });
    container.appendChild(btn);
  }

  const btnNext = document.createElement('button');
  btnNext.textContent = '→';
  btnNext.disabled = (current === total);
  btnNext.addEventListener('click', function() { renderAdminTable(current + 1); });
  container.appendChild(btnNext);
}


// ------------------------------------------------------------
// SECCIÓN 5: FORMULARIO — ABRIR
// ------------------------------------------------------------
document.getElementById('btn-new-product').addEventListener('click', function() {
  openNewForm();
});

function openNewForm() {
  editingId = null;
  document.getElementById('form-title').textContent = 'Nuevo Producto';
  document.getElementById('product-form').reset();
  document.getElementById('image-preview').style.display  = 'none';
  document.getElementById('extra-images-section').style.display = 'none';

  document.getElementById('form-modal-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeFormModal() {
  document.getElementById('form-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('product-form').reset();
  editingId = null;
}

async function openEditForm(id) {
  const all     = await getProducts();
  const product = all.find(function(p) { return p.id === id; });
  if (!product) return;

  editingId = id;

  document.getElementById('form-title').textContent        = 'Editar Producto';
  document.getElementById('field-name').value              = product.name;
  document.getElementById('field-price').value             = product.price;
  document.getElementById('field-category').value          = product.category;
  document.getElementById('field-new-category').value      = '';
  document.getElementById('field-description').value       = product.description;
  document.getElementById('field-image-url').value         = product.image;
  document.getElementById('field-whatsapp').value          = product.whatsapp;
  document.getElementById('field-brand').value        = '';
  document.getElementById('field-brand-select').value = product.brand || '';
  // → Líneas nuevas del Bloque 1
// Cargamos las subcategorías relacionadas a la categoría del producto
  const allProds = await getProducts();
  await updateSubcatSelect(product.category, allProds);

  // Luego seleccionamos la subcategoría actual
  document.getElementById('field-subcategoria-select').value = product.subcategoria || '';
  document.getElementById('field-subcategoria').value        = '';

  document.getElementById('field-en-stock').checked        = product.en_stock !== false;
  document.getElementById('field-destacado').checked       = product.destacado || false;
  document.getElementById('field-en-oferta').checked       = product.en_oferta || false;
  document.getElementById('field-en-promocion').checked    = product.en_promocion || false;
  document.getElementById('field-stock-cantidad').value = product.stock_cantidad || 0;
  document.getElementById('field-stock-minimo').value   = product.stock_minimo || 5;

  document.getElementById('row-oferta').style.display =
    product.en_oferta ? 'block' : 'none';
  document.getElementById('field-precio-oferta').value =
    product.precio_oferta || '';

  document.getElementById('row-promocion').style.display =
    product.en_promocion ? 'block' : 'none';
  document.getElementById('field-fecha-fin').value =
    product.fecha_fin_promo
      ? new Date(product.fecha_fin_promo).toISOString().slice(0, 16)
      : '';
  // → Fin líneas nuevas

  const preview         = document.getElementById('image-preview');
  preview.src           = product.image;
  preview.style.display = 'block';

  document.getElementById('extra-images-section').style.display = 'block';
  await loadProductImages(id);

  document.getElementById('form-modal-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

document.getElementById('btn-cancel').addEventListener('click', closeFormModal);
document.getElementById('btn-close-form-modal').addEventListener('click', closeFormModal);

// Cerrar al hacer click fuera del formulario
document.getElementById('form-modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeFormModal();
});


// ------------------------------------------------------------
// SECCIÓN 6: FORMULARIO — GUARDAR
// ------------------------------------------------------------
document.getElementById('product-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  // async en el listener porque adentro usamos await

  const newCategory = document.getElementById('field-new-category').value.trim().toLowerCase();
  const selCategory = document.getElementById('field-category').value;
  const category    = newCategory !== '' ? newCategory : selCategory;

  if (!category) {
    showToast('Por favor seleccioná o escribí una categoría.');
    return;
  }

  // Marca: prioridad al input texto, sino usa el select
  const newBrand = document.getElementById('field-brand').value.trim().toLowerCase();
  const selBrand = document.getElementById('field-brand-select').value;
  const brand    = newBrand !== '' ? newBrand : selBrand;

  // Subcategoría: prioridad al input texto, sino usa el select
  const newSubcat = document.getElementById('field-subcategoria').value.trim().toLowerCase();
  const selSubcat = document.getElementById('field-subcategoria-select').value;
  const subcategoria = newSubcat !== '' ? newSubcat : selSubcat;

  const productData = {
    name:        document.getElementById('field-name').value.trim(),
    price:       Number(document.getElementById('field-price').value),
    category:    category,
    subcategoria: subcategoria,
    brand:        brand,
  image:          document.getElementById('field-image-url').value.trim(),
  description:    document.getElementById('field-description').value.trim(),
  whatsapp:       document.getElementById('field-whatsapp').value.trim(),
  en_stock:       document.getElementById('field-en-stock').checked,
  destacado:      document.getElementById('field-destacado').checked,
  en_oferta:      document.getElementById('field-en-oferta').checked,
  precio_oferta:  document.getElementById('field-en-oferta').checked
                    ? Number(document.getElementById('field-precio-oferta').value)
                    : null,
  en_promocion:   document.getElementById('field-en-promocion').checked,
    fecha_fin_promo: document.getElementById('field-en-promocion').checked
                      ? document.getElementById('field-fecha-fin').value || null
                      : null,
    stock_cantidad: Number(document.getElementById('field-stock-cantidad').value) || 0,
    stock_minimo:   Number(document.getElementById('field-stock-minimo').value) || 5
  };

  if (editingId === null) {
    await addProduct(productData);
    // await espera que el servidor confirme que guardó el producto
    showToast('Producto agregado correctamente ✓');
  } else {
    productData.id = editingId;
    try {
      await updateProduct(productData);
      showToast('Producto actualizado correctamente ✓');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      return;
    }
  }

  await renderAdminTable(currentAdminPage);
  await populateCategorySelect();
  closeFormModal();
});


// ------------------------------------------------------------
// SECCIÓN 7: ELIMINAR
// ------------------------------------------------------------
function confirmDelete(id, name) {
  deleteTargetId = id;
  document.getElementById('delete-product-name').textContent = decodeURIComponent(name);
  document.getElementById('confirm-modal').style.display     = 'flex';
}

document.getElementById('btn-confirm-delete').addEventListener('click', async function() {
  if (deleteTargetId !== null) {
    await deleteProduct(deleteTargetId);
    showToast('Producto eliminado ✓');
    await renderAdminTable(currentAdminPage);
    await populateCategorySelect();
    deleteTargetId = null;
  }
  document.getElementById('confirm-modal').style.display = 'none';
});

document.getElementById('btn-cancel-delete').addEventListener('click', function() {
  deleteTargetId = null;
  document.getElementById('confirm-modal').style.display = 'none';
});

const confirmOverlay = document.getElementById('confirm-modal');
if (confirmOverlay) {
  confirmOverlay.addEventListener('click', function(e) {
    if (e.target === confirmOverlay) {
      deleteTargetId = null;
      document.getElementById('confirm-modal').style.display = 'none';
    }
  });
}


// ------------------------------------------------------------
// SECCIÓN 8: CATEGORÍAS DINÁMICAS
// ------------------------------------------------------------
async function populateCategorySelect() {
  const allProducts = await getProducts();

  // --- Select de categorías ---
  const catSelect  = document.getElementById('field-category');
  const categories = [...new Set(allProducts.map(function(p) { return p.category; }))];

  catSelect.innerHTML = '<option value="">-- Seleccioná una categoría --</option>';
  categories.forEach(function(cat) {
    const option       = document.createElement('option');
    option.value       = cat;
    option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    catSelect.appendChild(option);
  });

  // --- Select de marcas ---
  const brandSelect = document.getElementById('field-brand-select');
  const brands      = [...new Set(
    allProducts
      .map(function(p) { return p.brand; })
      .filter(function(b) { return b && b.trim() !== ''; })
  )];

  brandSelect.innerHTML = '<option value="">-- Seleccioná una marca --</option>';
  brands.forEach(function(brand) {
    const option       = document.createElement('option');
    option.value       = brand;
    option.textContent = brand.charAt(0).toUpperCase() + brand.slice(1);
    brandSelect.appendChild(option);
  });

  // --- Select de subcategorías ---
  const subcatSelect = document.getElementById('field-subcategoria-select');
  subcatSelect.innerHTML = '<option value="">-- Primero seleccioná una categoría --</option>';
  subcatSelect.disabled  = true;
}

// Función que actualiza el select de subcategorías según la categoría
function updateSubcatSelect(category, allProducts) {
  const subcatSelect = document.getElementById('field-subcategoria-select');

  if (!category || category === '') {
    subcatSelect.innerHTML = '<option value="">-- Primero seleccioná una categoría --</option>';
    subcatSelect.disabled  = true;
    return;
  }

  // Filtramos subcategorías de la categoría seleccionada
  const subcats = [...new Set(
    allProducts
      .filter(function(p) { return p.category === category; })
      .map(function(p) { return p.subcategoria; })
      .filter(function(s) { return s && s.trim() !== ''; })
  )];

  if (subcats.length === 0) {
    subcatSelect.innerHTML = '<option value="">Sin subcategorías para esta categoría</option>';
    subcatSelect.disabled  = true;
    return;
  }

  subcatSelect.disabled  = false;
  subcatSelect.innerHTML = '<option value="">-- Seleccioná una subcategoría --</option>';

  subcats.forEach(function(sub) {
    const option       = document.createElement('option');
    option.value       = sub;
    option.textContent = sub.charAt(0).toUpperCase() + sub.slice(1);
    subcatSelect.appendChild(option);
  });
}


// ------------------------------------------------------------
// SECCIÓN 9: PREVIEW DE IMAGEN
// ------------------------------------------------------------
function setupImagePreview() {
  const urlInput = document.getElementById('field-image-url');
  const preview  = document.getElementById('image-preview');

  urlInput.addEventListener('input', function() {
    const url = this.value.trim();
    if (url) {
      preview.src           = url;
      preview.style.display = 'block';
      preview.onerror = function() {
        preview.style.display = 'none';
      };
    } else {
      preview.style.display = 'none';
    }
  });
}

// ------------------------------------------------------------
// SECCIÓN 10: GESTIÓN DE IMÁGENES EN EL ADMIN
// ------------------------------------------------------------
async function loadProductImages(productId) {
  let images;
  try {
    const res = await fetch('/api/products/' + productId + '/images');
    images = await res.json();
  } catch (err) {
    showToast('Error al cargar imágenes');
    return;
  }

  const container = document.getElementById('images-container');
  if (!container) return;

  container.innerHTML = '';

  images.forEach(function(img) {
    const div = document.createElement('div');
    div.className = 'img-item';
    div.innerHTML =
      '<img src="' + escapeAttr(img.url) + '" alt="imagen">' +
      '<button onclick="deleteImage(' + img.id + ', ' + productId + ')" class="btn-delete-img">' +
        '<span class="material-symbols-outlined">delete</span>' +
      '</button>';
    container.appendChild(div);
  });
}

async function deleteImage(imageId, productId) {
  const res = await fetch('/api/products/images/' + imageId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (!res.ok) { showToast('Error al eliminar imagen', 'error'); return; }
  await loadProductImages(productId);
  showToast('Imagen eliminada ✓');
}

async function uploadImageUrl(productId) {
  const input = document.getElementById('new-image-url');
  const url   = input.value.trim();
  if (!url) return;

  const res = await fetch('/api/products/' + productId + '/images/url', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
    body:    JSON.stringify({ url: url, orden: 0 })
  });
  if (!res.ok) { showToast('Error al agregar imagen', 'error'); return; }

  input.value = '';
  await loadProductImages(productId);
  showToast('Imagen agregada ✓');
}

async function uploadImageFile(productId) {
  const input = document.getElementById('new-image-file');
  if (!input.files[0]) return;

  const formData = new FormData();
  formData.append('image', input.files[0]);
  // FormData es la forma de enviar archivos por HTTP

  const res = await fetch('/api/products/' + productId + '/images/upload', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body:   formData
    // No ponemos Content-Type: el navegador lo setea automáticamente
    // con el boundary correcto para archivos
  });
  if (!res.ok) { showToast('Error al subir imagen', 'error'); return; }

  input.value = '';
  await loadProductImages(productId);
  showToast('Imagen subida ✓');
}


// ------------------------------------------------------------
// SECCIÓN 11: TOAST
// ------------------------------------------------------------
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent   = message;
  toast.style.display = 'block';
  toast.style.pointerEvents = 'none';
  toast.classList.add('toast-visible');
  setTimeout(function() {
    toast.classList.remove('toast-visible');
    toast.style.display = 'none';
  }, 3000);
}


// ------------------------------------------------------------
// SECCIÓN 12: INICIALIZACIÓN
// ------------------------------------------------------------
checkAuth();


// ------------------------------------------------------------
// SECCIÓN 13: CONTROL DE STOCK
// ------------------------------------------------------------
let currentStockTab = 'todos';

async function loadStockPanel() {
  const all = await getProducts();

  const sinStock  = all.filter(function(p) { return p.stock_cantidad === 0 || !p.en_stock; });
  const pocoStock = all.filter(function(p) {
    return p.stock_cantidad > 0 &&
           p.stock_cantidad <= (p.stock_minimo || 5) &&
           p.en_stock;
  });

  renderStockTable(all, sinStock, pocoStock);
  initStockTabs(all, sinStock, pocoStock);
  initStockCheckAll();
  initStockExport(all, sinStock, pocoStock);
}

function renderStockTable(all, sinStock, pocoStock) {
  const tbody  = document.getElementById('stock-tbody');
  const empty  = document.getElementById('stock-empty');
  const count  = document.getElementById('stock-count');
  const checkAll = document.getElementById('check-all-stock');

  let filtered;
  if (currentStockTab === 'sin-stock') {
    filtered = sinStock;
  } else if (currentStockTab === 'poco-stock') {
    filtered = pocoStock;
  } else {
    filtered = sinStock.concat(pocoStock);
  }

  // Remove duplicates (a product could be both sin-stock and poco-stock)
  const seen = new Set();
  filtered = filtered.filter(function(p) {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  document.getElementById('stock-count').textContent =
    filtered.length + ' producto' + (filtered.length !== 1 ? 's' : '');

  if (checkAll) checkAll.checked = false;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    document.getElementById('stock-empty').style.display = 'block';
    document.getElementById('table-stock').style.display = 'none';
    return;
  }

  document.getElementById('stock-empty').style.display = 'none';
  document.getElementById('table-stock').style.display = '';

  tbody.innerHTML = filtered.map(function(p) {
    const isSinStock = p.stock_cantidad === 0 || !p.en_stock;
    const isPocoStock = p.stock_cantidad > 0 && p.stock_cantidad <= (p.stock_minimo || 5);
    const sugerido = Math.max(0, (p.stock_minimo || 5) * 2 - (p.stock_cantidad || 0));

    const estadoHTML = isSinStock
      ? '<span class="badge badge-nostock">Sin stock</span>'
      : isPocoStock
        ? '<span class="badge badge-destacado">Poco stock</span>'
        : '<span class="badge badge-stock">En stock</span>';

    return '<tr>' +
      '<td><input type="checkbox" class="stock-check-item" data-id="' + p.id + '" data-name="' + escapeAttr(p.name) + '" data-category="' + escapeAttr(p.category) + '" data-brand="' + escapeAttr(p.brand || '') + '" data-stock="' + (p.stock_cantidad || 0) + '" data-minimo="' + (p.stock_minimo || 5) + '"></td>' +
      '<td class="td-name">' + escapeHTML(p.name) + '</td>' +
      '<td class="td-category">' + escapeHTML(p.category) + '</td>' +
      '<td>' + (p.stock_cantidad || 0) + '</td>' +
      '<td>' + (p.stock_minimo || 5) + '</td>' +
      '<td><input type="number" class="stock-qty-input" value="' + sugerido + '" min="0" data-id="' + p.id + '"></td>' +
      '<td>' + estadoHTML + '</td>' +
      '<td class="td-accion">' +
        '<button class="btn-edit" onclick="openEditForm(' + p.id + ')">' +
          '<span class="material-symbols-outlined">edit</span>' +
        '</button>' +
        '<button class="btn-recibir-stock" data-id="' + p.id + '" data-name="' + escapeAttr(p.name) + '">Recibir 📦</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

var _stockTabsInit = false;
function initStockTabs(all, sinStock, pocoStock) {
  if (_stockTabsInit) return;
  _stockTabsInit = true;
  document.querySelectorAll('.stock-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      currentStockTab = this.getAttribute('data-stock-tab');
      document.querySelectorAll('.stock-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      renderStockTable(all, sinStock, pocoStock);
    });
  });
}

function initStockCheckAll() {
  const checkAll = document.getElementById('check-all-stock');
  if (!checkAll) return;

  checkAll.addEventListener('change', function() {
    const checked = this.checked;
    document.querySelectorAll('.stock-check-item').forEach(function(cb) {
      cb.checked = checked;
    });
  });
}

function getSelectedStockItems() {
  const items = [];
  document.querySelectorAll('.stock-check-item:checked').forEach(function(cb) {
    const id = cb.getAttribute('data-id');
    const qtyInput = document.querySelector('.stock-qty-input[data-id="' + id + '"]');
    const cantidad = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
    items.push({
      id:       id,
      name:     cb.getAttribute('data-name'),
      category: cb.getAttribute('data-category'),
      brand:    cb.getAttribute('data-brand'),
      stock:    parseInt(cb.getAttribute('data-stock')) || 0,
      minimo:   parseInt(cb.getAttribute('data-minimo')) || 5,
      cantidad: cantidad
    });
  });
  return items;
}

var _stockExportInit = false;
function initStockExport(all, sinStock, pocoStock) {
  if (_stockExportInit) return;
  _stockExportInit = true;
  const btn     = document.getElementById('btn-export-stock');
  const btnPrev = document.getElementById('btn-preview-report');

  if (btn) {
    btn.addEventListener('click', function() {
      const selected = getSelectedStockItems();
      if (selected.length === 0) {
        showToast('Seleccioná al menos un producto para exportar.');
        return;
      }
      exportCSV(selected);
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', function() {
      const selected = getSelectedStockItems();
      if (selected.length === 0) {
        showToast('Seleccioná al menos un producto para exportar.');
        return;
      }
      showStockReportPreview(selected);
    });
  }
}

function exportCSV(selected) {
  const headers = ['Producto', 'Categoría', 'Marca', 'Stock actual', 'Stock mínimo', 'Cant. a pedir'];
  const rows = selected.map(function(item) {
    return '"' + item.name.replace(/"/g, '""') + '","' +
           item.category.replace(/"/g, '""') + '","' +
           (item.brand || '').replace(/"/g, '""') + '","' +
           item.stock + '","' + item.minimo + '","' + item.cantidad + '"';
  });

  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'pedido-proveedor-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(selected.length + ' producto' + (selected.length !== 1 ? 's' : '') + ' exportado(s) ✓');
}

function showStockReportPreview(selected) {
  const groups = {};
  selected.forEach(function(item) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });
  const catKeys = Object.keys(groups).sort();

  const totalItems = selected.length;
  const totalQty   = selected.reduce(function(sum, item) { return sum + item.cantidad; }, 0);
  const today      = new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' });

  var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<title>Pedido a Proveedor - ' + today + '</title>' +
    '<style>' +
    '  * { margin:0; padding:0; box-sizing:border-box; }' +
    '  body { font-family:"Segoe UI",sans-serif; background:#eee; padding:40px 20px; color:#333; }' +
    '  .report { max-width:900px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.1); overflow:hidden; }' +
    '  .report-header { background:#822; color:#fff; padding:32px; }' +
    '  .report-header h1 { font-size:1.5rem; margin-bottom:4px; }' +
    '  .report-header p { opacity:0.85; font-size:0.9rem; }' +
    '  .report-summary { display:flex; gap:24px; padding:24px 32px; background:#fafafa; border-bottom:1px solid #eee; }' +
    '  .summary-card { flex:1; }' +
    '  .summary-card .num { font-size:1.8rem; font-weight:800; color:#822; }' +
    '  .summary-card .label { font-size:0.82rem; color:#888; }' +
    '  .report-section { padding:24px 32px; border-bottom:1px solid #f0f0f0; }' +
    '  .report-section:last-child { border-bottom:none; }' +
    '  .cat-title { font-size:1.1rem; font-weight:700; color:#822; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #822; display:inline-block; }' +
    '  table { width:100%; border-collapse:collapse; font-size:0.88rem; }' +
    '  th { text-align:left; padding:10px 8px; background:#f7f8fa; color:#888; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #eee; }' +
    '  td { padding:10px 8px; border-bottom:1px solid #f5f5f5; }' +
    '  tr:last-child td { border-bottom:none; }' +
    '  .qty { font-weight:700; color:#822; text-align:center; font-size:1rem; }' +
    '  .report-footer { padding:20px 32px; text-align:center; color:#aaa; font-size:0.8rem; border-top:1px solid #eee; }' +
    '  .no-print { text-align:center; margin-top:16px; }' +
    '  .no-print button { padding:10px 24px; background:#822; color:#fff; border:none; border-radius:6px; font-size:0.9rem; font-weight:600; cursor:pointer; font-family:inherit; }' +
    '  .no-print button:hover { background:#a33; }' +
    '  @media print { body { background:#fff; padding:0; } .report { box-shadow:none; border-radius:0; } .no-print { display:none; } }' +
    '</style></head><body>' +
    '<div class="report">' +
    '<div class="report-header">' +
    '<h1>Pedido a Proveedor</h1>' +
    '<p>Generado el ' + today + '</p>' +
    '</div>' +
    '<div class="report-summary">' +
    '<div class="summary-card"><div class="num">' + totalItems + '</div><div class="label">Productos</div></div>' +
    '<div class="summary-card"><div class="num">' + totalQty + '</div><div class="label">Unidades a pedir</div></div>' +
    '<div class="summary-card"><div class="num">' + catKeys.length + '</div><div class="label">Categorias</div></div>' +
    '</div>';

  catKeys.forEach(function(cat) {
    var items = groups[cat];
    var subTotal = items.reduce(function(s, item) { return s + item.cantidad; }, 0);
    html += '<div class="report-section">' +
      '<div class="cat-title">' + cat.charAt(0).toUpperCase() + cat.slice(1) + ' (' + items.length + ' prod., ' + subTotal + ' uds.)</div>' +
      '<table><tr><th>Producto</th><th>Stock</th><th>Minimo</th><th style="text-align:center">A pedir</th></tr>';

    items.forEach(function(item) {
      html += '<tr>' +
        '<td>' + escapeHTML(item.name) + '</td>' +
        '<td>' + item.stock + '</td>' +
        '<td>' + item.minimo + '</td>' +
        '<td class="qty">' + item.cantidad + '</td>' +
        '</tr>';
    });

    html += '</table></div>';
  });

  html += '<div class="report-footer">Generado desde el panel de administracion - ' + today + '</div></div>' +
    '<div class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
    '</body></html>';

  // Abrir con blob URL para evitar bloqueo de popups
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var win  = window.open(url, '_blank');
  if (win) {
    win.onload = function() { setTimeout(function() { URL.revokeObjectURL(url); }, 10000); };
  } else {
    showToast('El navegador bloqueo la ventana. Permití popups para este sitio.');
  }
}

// ------------------------------------------------------------
// SECCIÓN 14: RECEPCIÓN DE MERCADERÍA
// ------------------------------------------------------------

var _recepcionInit = false;

function showRecepcionPanel() {
  document.getElementById('panel-recepcion').style.display = 'block';
  if (!_recepcionInit) {
    initRecepcion();
    _recepcionInit = true;
  }
}

function initRecepcion() {
  const searchInput = document.getElementById('recepcion-search');
  const tbody = document.getElementById('recepcion-tbody');
  const btnConfirmar = document.getElementById('btn-confirmar-recepcion');
  let allProducts = [];
  window._selectedItems = window._selectedItems || {};
  let searchTimeout = null;
  
  // Cargar todos los productos
  fetch('/api/products')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allProducts = data.products || [];
    })
    .catch(function(err) {
      console.error('Error cargando productos:', err);
    });
  
  // Búsqueda con debounce
  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
      const term = searchInput.value.trim().toLowerCase();
      if (term.length < 2) {
        tbody.innerHTML = '';
        btnConfirmar.disabled = true;
        document.getElementById('recepcion-empty').style.display = 'block';
        return;
      }
      
      const filtered = allProducts.filter(function(p) {
        return p.name && p.name.toLowerCase().includes(term);
      }).slice(0, 10); // max 10 resultados
      
      renderRecepcionResults(filtered);
    }, 300);
  });
  
  // Checkbox "Seleccionar todos"
  var checkAllRecepcion = document.getElementById('check-all-recepcion');
  if (checkAllRecepcion) {
    checkAllRecepcion.addEventListener('change', function() {
      var checked = this.checked;
      document.querySelectorAll('#recepcion-tbody .recepcion-check-item').forEach(function(cb) {
        cb.checked = checked;
      });
      updateRecepcionSummary();
    });
  }
  
  function renderRecepcionResults(products) {
    document.getElementById('recepcion-empty').style.display = 'none';
    
    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="recepcion-no-results">No se encontraron productos</td></tr>';
      return;
    }
    
    var html = '';
    products.forEach(function(p) {
      var currentQty = Number(p.stock_cantidad) || 0;
      var selected = window._selectedItems[p.id] || 0;
      var nuevo = currentQty + Number(selected);
      html += '<tr data-id="' + p.id + '">' +
        '<td><input type="checkbox" class="recepcion-check-item" checked data-id="' + p.id + '"></td>' +
        '<td class="td-producto">' +
          '<div class="recepcion-producto-info">' +
            (p.image ? '<img src="' + escapeAttr(p.image) + '" class="recepcion-thumb" onerror="this.style.display=\'none\'">' : '') +
            '<div>' +
              '<div class="recepcion-producto-name">' + escapeHTML(p.name) + '</div>' +
              '<div class="recepcion-producto-category">' + escapeHTML(p.category || '') + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td class="td-stock-actual">' + currentQty + '</td>' +
        '<td class="td-cantidad">' +
          '<input type="number" class="recepcion-qty-input" value="' + selected + '" min="0" max="999" data-id="' + p.id + '">' +
        '</td>' +
        '<td class="td-nuevo-stock">' + nuevo + '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
    
    // Event listeners en los inputs
    tbody.querySelectorAll('.recepcion-qty-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var id = this.getAttribute('data-id');
        var val = parseInt(this.value) || 0;
        if (val < 0) { val = 0; this.value = 0; }
        if (val > 999) { val = 999; this.value = 999; }
        window._selectedItems[id] = val;
        updateRecepcionSummary();
        
        // Actualizar preview del nuevo stock
        var row = this.closest('tr');
        var currentQty = parseInt(row.querySelector('.td-stock-actual').textContent) || 0;
        row.querySelector('.td-nuevo-stock').textContent = currentQty + val;
      });
    });
  }
  
  function updateRecepcionSummary() {
    var count = 0;
    var totalItems = 0;
    
    document.querySelectorAll('#recepcion-tbody .recepcion-check-item').forEach(function(cb) {
      if (cb.checked) {
        var id = cb.getAttribute('data-id');
        var qty = window._selectedItems[id] || 0;
        if (qty > 0) {
          count++;
          totalItems += qty;
        }
      }
    });
    
    var countEl = document.getElementById('recepcion-count');
    if (countEl) countEl.textContent = count;
    
    if (count > 0) {
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Confirmar Recepción (' + totalItems + ' unidades - ' + count + ' productos)';
    } else {
      btnConfirmar.disabled = true;
      btnConfirmar.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Confirmar Recepción (0)';
    }
  }  
  // Confirmar recepción
  btnConfirmar.addEventListener('click', function() {
    var items = [];
    document.querySelectorAll('#recepcion-tbody .recepcion-check-item:checked').forEach(function(cb) {
      var id = parseInt(cb.getAttribute('data-id'));
      var qty = window._selectedItems[id] || 0;
      if (qty > 0) {
        items.push({ id: id, quantity: qty });
      }
    });
    
    if (items.length === 0) return;
    
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = '⏳ Procesando...';
    
    fetch('/api/products/batch-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ items: items })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) {
        showToast('Error: ' + data.error, 'error');
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '✓ Confirmar Recepción (<span id="confirm-count">0</span>)';
        return;
      }
      showToast('✓ ' + data.count + ' productos actualizados correctamente');
      window._selectedItems = {};
      document.getElementById('recepcion-search').value = '';
      document.getElementById('recepcion-tbody').innerHTML = '';
      document.getElementById('recepcion-empty').style.display = 'block';
      updateRecepcionSummary();
      // Recargar stock panel si está abierto
      if (typeof loadStockPanel === 'function') loadStockPanel();
    })
    .catch(function(err) {
      showToast('Error de conexión', 'error');
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '✓ Confirmar Recepción (<span id="confirm-count">0</span>)';
    });
  });
  
  // Exponer funciones para uso desde fuera (ej. initPedidoGlobal)
  window.renderRecepcionResults = renderRecepcionResults;
  window.updateRecepcionSummary = updateRecepcionSummary;
}

// ------------------------------------------------------------
// Delegación: botón "Recibir" en stock → abre Recepción con producto precargado
// ------------------------------------------------------------
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-recibir-stock');
  if (!btn) return;

  var productId = btn.getAttribute('data-id');
  var productName = btn.getAttribute('data-name');

  // Cambiar a la pestaña Recepción
  var recepcionTab = document.querySelector('.admin-tab[data-tab="recepcion"]');
  if (recepcionTab) recepcionTab.click();

  // Esperar a que el panel se muestre y precargar el producto
  setTimeout(function() {
    var searchInput = document.getElementById('recepcion-search');
    if (searchInput) {
      searchInput.value = productName;
      searchInput.dispatchEvent(new Event('input'));
    }
  }, 200);
});

// Modal de métricas - Ver todos
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-ver-todos');
  if (!btn) return;

  var metric = btn.getAttribute('data-metric');
  var modal = document.getElementById('metrics-modal');
  var title = document.getElementById('metrics-modal-title');
  var body = document.getElementById('metrics-modal-body');

  // Get all metrics data from the last load
  var allData = window._lastMetricsData;
  if (!allData) return;

  if (metric === 'vistas') {
    title.textContent = 'Todos los productos - Vistas';
    renderMetricsTable(body.querySelector('table') || createMetricsModalTable(body), allData.topVistas, 'vistas');
  } else if (metric === 'clicks') {
    title.textContent = 'Todos los productos - Clicks WhatsApp';
    renderMetricsTable(body.querySelector('table') || createMetricsModalTable(body), allData.topClicks, 'clicks');
  } else if (metric === 'busquedas') {
    title.textContent = 'Todas las búsquedas frecuentes';
    renderMetricsTable(body.querySelector('table') || createMetricsModalTable(body), allData.topBusquedas, 'busquedas');
  }

  modal.style.display = 'flex';
});

function createMetricsModalTable(container) {
  container.innerHTML = '<table class="metrics-table" style="width:100%"></table>';
  return container.querySelector('table');
}

// Close metrics modal
document.addEventListener('click', function(e) {
  if (e.target.id === 'metrics-modal' || e.target.id === 'metrics-modal-close') {
    document.getElementById('metrics-modal').style.display = 'none';
  }
});

// ============================================================
// SECCIÓN 15: STOCK → RECEPCIÓN — PEDIDO GLOBAL A PROVEEDOR
// ============================================================
function initPedidoGlobal() {
  var checkAll = document.getElementById('check-all-stock');
  var btnGenerar = document.getElementById('btn-generar-pedido');
  if (!checkAll || !btnGenerar) return;

  // Seleccionar/deseleccionar todos
  checkAll.addEventListener('change', function() {
    var checked = this.checked;
    document.querySelectorAll('.stock-check-item').forEach(function(cb) {
      cb.checked = checked;
    });
    actualizarResumenPedido();
  });

  // Delegación: cambios en checkboxes individuales
  document.addEventListener('change', function(e) {
    if (e.target.classList.contains('stock-check-item')) {
      actualizarResumenPedido();
      // Si alguno está desmarcado, desmarcar "todos"
      if (!e.target.checked) {
        checkAll.checked = false;
      } else {
        // Verificar si todos están marcados
        var all = document.querySelectorAll('.stock-check-item');
        var allChecked = true;
        all.forEach(function(cb) { if (!cb.checked) allChecked = false; });
        checkAll.checked = allChecked;
      }
    }
  });

  // Click en "Generar pedido"
  btnGenerar.addEventListener('click', function() {
    var seleccionados = [];
    document.querySelectorAll('.stock-check-item:checked').forEach(function(cb) {
      seleccionados.push({
        id: parseInt(cb.getAttribute('data-id')),
        name: cb.getAttribute('data-name'),
        stock: parseInt(cb.getAttribute('data-stock')) || 0
      });
    });

    if (seleccionados.length === 0) return;

    // Cambiar a pestaña Recepción
    var recepcionTab = document.querySelector('.admin-tab[data-tab="recepcion"]');
    if (recepcionTab) recepcionTab.click();

    // Precargar TODOS los productos seleccionados en Recepción
    setTimeout(function() {
      var searchInput = document.getElementById('recepcion-search');
      var tbody = document.getElementById('recepcion-tbody');
      var recepcionEmpty = document.getElementById('recepcion-empty');

      if (!tbody) return;

      // Limpiar búsqueda actual y cargar productos directamente
      if (searchInput) searchInput.value = '';

      // Hacer fetch de productos para tener datos completos
      fetch('/api/products')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var allProducts = data.products || [];
          var idsSeleccionados = {};
          seleccionados.forEach(function(s) { idsSeleccionados[s.id] = true; });

          // Filtrar productos seleccionados
          var productos = allProducts.filter(function(p) {
            return idsSeleccionados[p.id];
          });

          // Inicializar selectedItems
          window._selectedItems = window._selectedItems || {};

          // Establecer cantidad sugerida para cada uno
          productos.forEach(function(p) {
            var currentQty = Number(p.stock_cantidad) || 0;
            // Sugerir cantidad mínima para alcanzar stock_minimo * 2
            var stockMin = Number(p.stock_minimo) || 5;
            var sugerido = Math.max(stockMin * 2 - currentQty, stockMin);
            window._selectedItems[p.id] = sugerido;
          });

          if (typeof window.renderRecepcionResults === 'function') {
            window.renderRecepcionResults(productos);
          }
          if (recepcionEmpty) recepcionEmpty.style.display = 'none';
          if (typeof window.updateRecepcionSummary === 'function') {
            window.updateRecepcionSummary();
          }
        })
        .catch(function(err) {
          console.error('Error cargando productos:', err);
        });
    }, 300);
  });

  function actualizarResumenPedido() {
    var count = document.querySelectorAll('.stock-check-item:checked').length;
    var btnGenerar = document.getElementById('btn-generar-pedido');
    var countEl = document.getElementById('pedido-count');
    if (btnGenerar) {
      btnGenerar.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (countEl) countEl.textContent = count;
  }

  // Boton "Solicitar todo el stock bajo"
  var btnSolicitarTodo = document.getElementById('btn-solicitar-todo');
  if (btnSolicitarTodo) {
    btnSolicitarTodo.addEventListener('click', function() {
      // Seleccionar todos los checkboxes
      document.querySelectorAll('.stock-check-item').forEach(function(cb) {
        cb.checked = true;
      });

      var count = document.querySelectorAll('.stock-check-item:checked').length;
      if (count === 0) {
        showToast('No hay productos con stock bajo para solicitar', 'error');
        return;
      }

      // Simular click en "Generar pedido"
      var btnGenerar = document.getElementById('btn-generar-pedido');
      if (btnGenerar) btnGenerar.click();

      showToast('⚠ Enviando ' + count + ' productos a Recepción...', 'info');
    });
  }
}

// Inicializar después de que se cargue el panel
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPedidoGlobal);
} else {
  initPedidoGlobal();
}