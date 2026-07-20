// ============================================================
// admin/products.js — Tabla, formulario y categorías de productos
// ============================================================

let editingId       = null;
let deleteTargetId  = null;
const ITEMS_PER_PAGE = 10;
let currentAdminPage = 1;

// ------------------------------------------------------------
// Tabla de productos
// ------------------------------------------------------------
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
          '<button class="btn-edit" onclick="openEditForm(' + product.id + ')" aria-label="Editar ' + escapeAttr(product.name) + '" title="Editar">' +
            '<span class="material-symbols-outlined" aria-hidden="true">edit</span>' +
          '</button>' +
          '<button class="btn-delete" onclick="confirmDelete(' + product.id + ', \'' + nombreSeguro + '\')" aria-label="Eliminar ' + escapeAttr(product.name) + '" title="Eliminar">' +
            '<span class="material-symbols-outlined" aria-hidden="true">delete</span>' +
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
          '<button class="btn-edit" onclick="openEditForm(' + product.id + ')" aria-label="Editar ' + escapeAttr(product.name) + '" title="Editar">' +
            '<span class="material-symbols-outlined" aria-hidden="true">edit</span>' +
          '</button>' +
          '<button class="btn-delete" onclick="confirmDelete(' + product.id + ', \'' + nombreSeguro + '\')" aria-label="Eliminar ' + escapeAttr(product.name) + '" title="Eliminar">' +
            '<span class="material-symbols-outlined" aria-hidden="true">delete</span>' +
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
  btnPrev.setAttribute('aria-label', 'Página anterior');
  btnPrev.disabled = (current === 1);
  btnPrev.addEventListener('click', function() { renderAdminTable(current - 1); });
  container.appendChild(btnPrev);

  for (let i = 1; i <= total; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.setAttribute('aria-label', 'Página ' + i);
    if (i === current) btn.classList.add('active');
    btn.addEventListener('click', function() { renderAdminTable(i); });
    container.appendChild(btn);
  }

  const btnNext = document.createElement('button');
  btnNext.textContent = '→';
  btnNext.setAttribute('aria-label', 'Página siguiente');
  btnNext.disabled = (current === total);
  btnNext.addEventListener('click', function() { renderAdminTable(current + 1); });
  container.appendChild(btnNext);
}

// ------------------------------------------------------------
// Formulario — abrir
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
// Formulario — guardar
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
// Eliminar
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
// Categorías dinámicas
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
// Preview de imagen
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
