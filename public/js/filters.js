// ============================================================
// filters.js — Filtros, búsqueda y sidebar
// ============================================================
// Depende de: state.js, render.js, storage.js
// ============================================================

function escapeAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ------------------------------------------------------------
// getFilteredProducts() — delega filtrado al servidor
// ------------------------------------------------------------
async function getFilteredProducts() {
  try {
    const searchInput = document.querySelector('.search-input');
    const searchTerm   = searchInput.value.trim();
    const isSearching  = searchTerm !== '';

    const params = {
      // Si el usuario está buscando, ignoramos categoría/marca/subcategoría
      // para que la búsqueda sea siempre global
      category:     isSearching ? 'all' : (selectedCategories.length > 0 ? selectedCategories.join(',') : 'all'),
      subcategoria: isSearching ? 'all' : (selectedSubcategorias.length > 0 ? selectedSubcategorias.join(',') : 'all'),
      brand:        isSearching ? 'all' : (selectedBrands.length > 0 ? selectedBrands.join(',') : 'all'),
      search:       searchTerm,
      order:        currentOrder,
      page:         currentPage,
      limit:        PRODUCTS_PER_PAGE
    };

    if (onlyStock)     params.en_stock    = 'true';
    if (onlyOferta)    params.en_oferta   = 'true';
    if (onlyDestacado) params.destacado   = 'true';

    return await getProductsFiltered(params);
  } catch (e) {
    console.error('Error filtrando productos:', e);
    return { products: [], total: 0, totalPages: 1 };
  }
}


// ------------------------------------------------------------
// renderProducts() — decide qué vista mostrar
// ------------------------------------------------------------
async function renderProducts(page) {
  if (page === undefined) page = 1;
  currentPage = page;

  // Mostrar skeleton antes del fetch
  renderSkeletons(PRODUCTS_PER_PAGE);

  const searchInput = document.querySelector('.search-input');
  const result      = await getFilteredProducts();

  const hasFilter = selectedCategories.length > 0 ||
                    selectedBrands.length > 0 ||
                    selectedSubcategorias.length > 0 ||
                    currentFilter === "todos" ||
                    searchInput.value.trim() !== '';

  if (hasFilter) {
    showFilterView(result, page);
  } else {
    showHomeView(result, page);
  }

  // Actualizar chips de filtros activos
  renderActiveFilters();
}


// ------------------------------------------------------------
// populateCategoryNav() — dropdown de categorías con acordeón
// ------------------------------------------------------------
async function populateCategoryNav() {
  const categories   = await getCategories();
  const subcatRes    = await fetch('/api/categories');
  const subcatGroups = await subcatRes.json();
  const dropdownMenu = document.getElementById('menu-categorias');
  dropdownMenu.innerHTML = '';

  // "Todos los productos"
  const allItem = document.createElement('li');
  allItem.innerHTML = '<a href="#" class="cat-link">Todos los productos</a>';
  allItem.querySelector('a').addEventListener('click', function(e) {
    e.preventDefault();
    currentFilter       = "todos";
    currentBrand        = "all";
    currentSubcategoria = "all";
    selectedCategories  = [];
    selectedBrands      = [];
    selectedSubcategorias = [];
    renderProducts(1);
  });
  dropdownMenu.appendChild(allItem);

  categories.forEach(function(cat) {
    const label   = cat.charAt(0).toUpperCase() + cat.slice(1);
    const subcats = subcatGroups[cat] || [];
    const li      = document.createElement('li');
    li.className  = 'cat-item';

    if (subcats.length > 0) {
      li.innerHTML =
        '<div class="cat-header">' +
          '<a href="#" class="cat-link" data-category="' + escapeAttr(cat) + '">' + label + '</a>' +
          '<button class="cat-toggle">' +
            '<span class="material-symbols-outlined">expand_more</span>' +
          '</button>' +
        '</div>' +
        '<ul class="subcat-list" id="subcat-' + cat + '">' +
          subcats.map(function(sub) {
            const subLabel = sub.charAt(0).toUpperCase() + sub.slice(1);
            return '<li><a href="#" class="subcat-link" data-subcat="' + escapeAttr(sub) + '">' + subLabel + '</a></li>';
          }).join('') +
        '</ul>';

      li.querySelector('.cat-link').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        currentFilter        = cat;
        currentSubcategoria  = "all";
        currentBrand         = "all";
        selectedCategories   = [cat];
        selectedBrands       = [];
        selectedSubcategorias = [];
        renderProducts(1);
      });

      li.querySelector('.cat-toggle').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const subList = document.getElementById('subcat-' + cat);
        const icon    = this.querySelector('.material-symbols-outlined');
        const isOpen  = subList.classList.contains('open');

        document.querySelectorAll('.subcat-list.open').forEach(function(el) { el.classList.remove('open'); });
        document.querySelectorAll('.cat-toggle .material-symbols-outlined').forEach(function(el) { el.style.transform = ''; });

        if (!isOpen) {
          subList.classList.add('open');
          icon.style.transform = 'rotate(180deg)';
        }
      });

      li.querySelectorAll('.subcat-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var sub = this.getAttribute('data-subcat');
          currentSubcategoria   = sub;
          currentFilter         = "all";
          currentBrand          = "all";
          selectedSubcategorias = [sub];
          selectedCategories    = [];
          selectedBrands        = [];
          renderProducts(1);
        });
      });

    } else {
      li.innerHTML = '<a href="#" class="cat-link" data-category="' + escapeAttr(cat) + '">' + label + '</a>';
      li.querySelector('.cat-link').addEventListener('click', function(e) {
        e.preventDefault();
        currentFilter        = cat;
        currentSubcategoria  = "all";
        currentBrand         = "all";
        selectedCategories   = [cat];
        selectedBrands       = [];
        selectedSubcategorias = [];
        renderProducts(1);
      });
    }

    dropdownMenu.appendChild(li);
  });
}


// ------------------------------------------------------------
// populateBrandNav() — dropdown de marcas
// ------------------------------------------------------------
async function populateBrandNav() {
  const allProducts  = await getProducts();
  const dropdownMenu = document.getElementById('menu-marcas');
  dropdownMenu.innerHTML = '';

  const allBrands    = allProducts.map(function(p) { return p.brand; }).filter(function(b) { return b && b.trim() !== ''; });
  const uniqueBrands = [...new Set(allBrands)];

  if (uniqueBrands.length === 0) {
    const li = document.createElement('li');
    li.innerHTML = '<a href="#" style="color:#aaa; cursor:default">Sin marcas cargadas</a>';
    dropdownMenu.appendChild(li);
    return;
  }

  const allItem = document.createElement('li');
  allItem.innerHTML = '<a href="#" data-brand="all">Todas las marcas</a>';
  allItem.querySelector('a').addEventListener('click', function(e) {
    e.preventDefault();
    currentBrand        = "all";
    currentFilter       = "todos";
    currentSubcategoria = "all";
    selectedBrands      = [];
    selectedCategories  = [];
    selectedSubcategorias = [];
    renderProducts(1);
  });
  dropdownMenu.appendChild(allItem);

  uniqueBrands.forEach(function(brand) {
    const li    = document.createElement('li');
    const label = brand.charAt(0).toUpperCase() + brand.slice(1);
    li.innerHTML = '<a href="#" data-brand="' + escapeAttr(brand) + '">' + label + '</a>';
    li.querySelector('a').addEventListener('click', function(e) {
      e.preventDefault();
      currentBrand        = brand;
      currentFilter       = "todos";
      currentSubcategoria = "all";
      selectedBrands      = [brand];
      selectedCategories  = [];
      selectedSubcategorias = [];
      renderProducts(1);
    });
    dropdownMenu.appendChild(li);
  });
}


// ------------------------------------------------------------
// populateSidebar() — sidebar de filtros en vista filtrada
// ------------------------------------------------------------
async function populateSidebar(currentFiltered) {
  const allProducts = await getProducts();

  // Orden
  const orderSelect = document.getElementById('sidebar-order');
  if (orderSelect) {
    orderSelect.value = currentOrder;
  }

  // Título dinámico
  const catsTitleEl = document.getElementById('sidebar-cats-title');
  if (catsTitleEl) {
    catsTitleEl.textContent = currentFilter !== "all" && currentFilter !== "todos"
      ? 'Subcategorías' : 'Categorías';
  }

  const sidebarCatsSection = document.querySelector('.filter-sidebar .sidebar-section:nth-child(2)');
  const sidebarCats        = document.getElementById('sidebar-categories');

  if (currentFilter !== "all" && currentFilter !== "todos") {
    const subcatRes    = await fetch('/api/categories');
    const subcatGroups = await subcatRes.json();
    const subcats      = subcatGroups[currentFilter] || [];

    sidebarCats.innerHTML = '';

    // Botón volver
    const liBack = document.createElement('li');
    liBack.innerHTML =
      '<button class="sidebar-filter-link sidebar-back" data-filter="back">' +
        '<span class="material-symbols-outlined">arrow_back</span>' +
        'Todas las categorías' +
      '</button>';
    liBack.querySelector('.sidebar-back').addEventListener('click', function(e) {
      e.preventDefault();
      currentFilter       = "todos";
      currentSubcategoria = "all";
      selectedCategories  = [];
      selectedSubcategorias = [];
      renderProducts(1);
    });
    sidebarCats.appendChild(liBack);

    if (subcats.length > 0) {
      const liAll = document.createElement('li');
      liAll.innerHTML =
        '<button class="sidebar-filter-link' + (selectedSubcategorias.length === 0 ? ' active' : '') + '" data-filter="subcategoria" data-value="">' +
          'Todos' +
          '<span class="sidebar-check' + (selectedSubcategorias.length === 0 ? ' checked' : '') + '">✓</span>' +
          '<span class="sidebar-count">' + currentFiltered.length + '</span>' +
        '</button>';
      sidebarCats.appendChild(liAll);

      subcats.forEach(function(sub) {
        var count = allProducts.filter(function(p) { return p.category === currentFilter && p.subcategoria === sub; }).length;
        var li    = document.createElement('li');
        li.innerHTML =
          '<button class="sidebar-filter-link' + (selectedSubcategorias.indexOf(sub) !== -1 ? ' active' : '') + '" data-filter="subcategoria" data-value="' + escapeAttr(sub) + '">' +
            escapeHTML(sub) +
            '<span class="sidebar-check' + (selectedSubcategorias.indexOf(sub) !== -1 ? ' checked' : '') + '">✓</span>' +
            '<span class="sidebar-count">' + count + '</span>' +
          '</button>';
        sidebarCats.appendChild(li);
      });
    }

    if (sidebarCatsSection) sidebarCatsSection.style.display = 'block';

  } else {
    sidebarCats.innerHTML = '';
    var cats = [...new Set(allProducts.map(function(p) { return p.category; }))];

    cats.forEach(function(cat) {
      var count = currentFiltered.filter(function(p) { return p.category === cat; }).length;
      var li    = document.createElement('li');
      li.innerHTML =
        '<button class="sidebar-filter-link' + (selectedCategories.indexOf(cat) !== -1 ? ' active' : '') + '" data-filter="category" data-value="' + escapeAttr(cat) + '">' +
          escapeHTML(cat) +
          '<span class="sidebar-check' + (selectedCategories.indexOf(cat) !== -1 ? ' checked' : '') + '">✓</span>' +
          '<span class="sidebar-count">' + count + '</span>' +
        '</button>';
      sidebarCats.appendChild(li);
    });

    if (sidebarCatsSection) sidebarCatsSection.style.display = 'block';
  }

  // Marcas
  var sidebarBrands = document.getElementById('sidebar-brands');
  sidebarBrands.innerHTML = '';

  var brands = [...new Set(
    allProducts.map(function(p) { return p.brand; }).filter(function(b) { return b && b.trim() !== ''; })
  )];

  if (brands.length === 0) {
    sidebarBrands.innerHTML = '<li class="sidebar-empty">Sin marcas</li>';
  } else {
    // Botón "Todas las marcas" siempre visible
    var liAll = document.createElement('li');
    liAll.innerHTML =
      '<button class="sidebar-filter-link' + (selectedBrands.length === 0 ? ' active' : '') + '" data-filter="brand" data-value="__all__">' +
        'Todas las marcas' +
        '<span class="sidebar-check' + (selectedBrands.length === 0 ? ' checked' : '') + '">✓</span>' +
      '</button>';
    sidebarBrands.appendChild(liAll);

    brands.forEach(function(brand) {
      var count = currentFiltered.filter(function(p) { return p.brand === brand; }).length;
      var li    = document.createElement('li');
      li.innerHTML =
        '<button class="sidebar-filter-link' + (selectedBrands.indexOf(brand) !== -1 ? ' active' : '') + '" data-filter="brand" data-value="' + escapeAttr(brand) + '">' +
          escapeHTML(brand) +
          '<span class="sidebar-check' + (selectedBrands.indexOf(brand) !== -1 ? ' checked' : '') + '">✓</span>' +
          '<span class="sidebar-count">' + count + '</span>' +
        '</button>';
      sidebarBrands.appendChild(li);
    });
  }

  // Checkboxes
  var stockCheck     = document.getElementById('filter-only-stock');
  var ofertaCheck    = document.getElementById('filter-only-oferta');
  var destacadoCheck = document.getElementById('filter-only-destacado');

  if (stockCheck) {
    stockCheck.checked  = onlyStock;
    stockCheck.onchange = function() { onlyStock = this.checked; renderProducts(1); };
  }
  if (ofertaCheck) {
    ofertaCheck.checked  = onlyOferta;
    ofertaCheck.onchange = function() { onlyOferta = this.checked; renderProducts(1); };
  }
  if (destacadoCheck) {
    destacadoCheck.checked  = onlyDestacado;
    destacadoCheck.onchange = function() {
      onlyDestacado = this.checked;
      if (this.checked) {
        onlyStock  = false;
        onlyOferta = false;
        if (stockCheck) stockCheck.checked = false;
        if (ofertaCheck) ofertaCheck.checked = false;
      }
      renderProducts(1);
    };
  }

  // Update active filter count badge
  updateFilterBadge();
}

function updateFilterBadge() {
  var badge = document.getElementById('filter-active-badge');
  if (!badge) return;
  var count = selectedCategories.length + selectedBrands.length + selectedSubcategorias.length;
  if (onlyStock || onlyOferta || onlyDestacado) count++;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ------------------------------------------------------------
// Delegación: toggle de filtros en sidebar
// ------------------------------------------------------------
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.sidebar-filter-link');
  if (!btn) return;
  // No aplicar toggle para el botón "Volver"
  if (btn.getAttribute('data-filter') === 'back') return;
  e.preventDefault();

  var filter = btn.getAttribute('data-filter');
  var value = btn.getAttribute('data-value');

  if (filter === 'category') {
    if (value === '') { selectedCategories = []; }
    else { toggleFilterArray(selectedCategories, value); }
  } else if (filter === 'brand') {
    if (value === '' || value === '__all__') { selectedBrands = []; }
    else { toggleFilterArray(selectedBrands, value); }
  } else if (filter === 'subcategoria') {
    if (value === '') { selectedSubcategorias = []; }
    else { toggleFilterArray(selectedSubcategorias, value); }
  }

  // Sincronizar con variables legacy para compatibilidad
  currentFilter = selectedCategories.length > 0 ? selectedCategories[0] : 'all';
  currentBrand = selectedBrands.length > 0 ? selectedBrands[0] : 'all';
  currentSubcategoria = selectedSubcategorias.length > 0 ? selectedSubcategorias[0] : 'all';

  // Actualizar UI
  btn.classList.toggle('active');
  var check = btn.querySelector('.sidebar-check');
  if (check) check.classList.toggle('checked');

  // Recargar productos
  renderProducts(1);
  renderActiveFilters();
});

function toggleFilterArray(arr, value) {
  var index = arr.indexOf(value);
  if (index === -1) arr.push(value);
  else arr.splice(index, 1);
}

function updateSidebarSelection() {
  document.querySelectorAll('.sidebar-filter-link').forEach(function(btn) {
    var filter = btn.getAttribute('data-filter');
    var value = btn.getAttribute('data-value');
    if (filter === 'back') return;
    var isActive = false;

    if (filter === 'category') isActive = selectedCategories.indexOf(value) !== -1;
    else if (filter === 'brand') isActive = selectedBrands.indexOf(value) !== -1;
    else if (filter === 'subcategoria') isActive = selectedSubcategorias.indexOf(value) !== -1;

    // Para "Todos" (value vacío), activo si el array está vacío
    if (value === '' || value === '__all__') {
      if (filter === 'category') isActive = selectedCategories.length === 0;
      else if (filter === 'brand') isActive = selectedBrands.length === 0;
      else if (filter === 'subcategoria') isActive = selectedSubcategorias.length === 0;
    }

    btn.classList.toggle('active', isActive);
    var check = btn.querySelector('.sidebar-check');
    if (check) check.classList.toggle('checked', isActive);
  });
}

// ------------------------------------------------------------
// Inicializar listener global del order select
// ------------------------------------------------------------
(function initOrderSelect() {
  const orderSelect = document.getElementById('sidebar-order');
  if (orderSelect) {
    orderSelect.addEventListener('change', function() {
      currentOrder = this.value;
      renderProducts(1);
    });
  }
})();

// ------------------------------------------------------------
// renderActiveFilters() — chips de filtros activos removibles
// ------------------------------------------------------------
function renderActiveFilters() {
  var container = document.getElementById('active-filters');
  if (!container) return;
  var searchInput = document.querySelector('.search-input');
  var searchTerm = searchInput ? searchInput.value.trim() : '';
  var html = '';

  if (searchTerm) {
    html += '<span class="filter-chip">Búsqueda: ' + escapeHTML(searchTerm) + '<button class="filter-chip-remove" type="button" data-filter="search" data-value="">×</button></span>';
  }

  selectedCategories.forEach(function(cat) {
    html += '<span class="filter-chip">' + escapeHTML(cat) + '<button class="filter-chip-remove" type="button" data-filter="category" data-value="' + escapeAttr(cat) + '">×</button></span>';
  });

  selectedBrands.forEach(function(brand) {
    html += '<span class="filter-chip">' + escapeHTML(brand) + '<button class="filter-chip-remove" type="button" data-filter="brand" data-value="' + escapeAttr(brand) + '">×</button></span>';
  });

  selectedSubcategorias.forEach(function(sub) {
    html += '<span class="filter-chip">' + escapeHTML(sub) + '<button class="filter-chip-remove" type="button" data-filter="subcategoria" data-value="' + escapeAttr(sub) + '">×</button></span>';
  });

  if (html) {
    html += '<button class="filter-chip-clear" id="btn-clear-filters">Limpiar todo</button>';
  }
  container.innerHTML = html;
}

// Delegación de eventos para los × de los chips
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.filter-chip-remove');
  if (!btn) return;

  var filter = btn.getAttribute('data-filter');
  var value = btn.getAttribute('data-value');
  var searchInput = document.querySelector('.search-input');

  if (filter === 'search') { if (searchInput) searchInput.value = ''; }
  else if (filter === 'category') toggleFilterArray(selectedCategories, value);
  else if (filter === 'brand') toggleFilterArray(selectedBrands, value);
  else if (filter === 'subcategoria') toggleFilterArray(selectedSubcategorias, value);

  renderProducts(1);
  updateSidebarSelection();
});

function removeFromArray(arr, value) {
  var index = arr.indexOf(value);
  if (index !== -1) arr.splice(index, 1);
}

// Limpiar todos los filtros
document.addEventListener('click', function(e) {
  if (e.target.id === 'btn-clear-filters') {
    clearAllFilters();
  }
});

function clearAllFilters() {
  var searchInput = document.querySelector('.search-input');
  if (searchInput) searchInput.value = '';
  selectedCategories = [];
  selectedBrands = [];
  selectedSubcategorias = [];
  currentFilter = 'all';
  currentBrand = 'all';
  currentSubcategoria = 'all';
  onlyStock = false;
  onlyOferta = false;
  onlyDestacado = false;
  renderProducts(1);
  updateSidebarSelection();
}

// ------------------------------------------------------------
// Toggle vista grid / lista
// ------------------------------------------------------------
