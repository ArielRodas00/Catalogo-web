// ============================================================
// filters.js — Filtros, búsqueda y sidebar
// ============================================================
// Depende de: state.js, render.js, storage.js
// ============================================================

// ------------------------------------------------------------
// getFilteredProducts() — delega filtrado al servidor
// ------------------------------------------------------------
async function getFilteredProducts() {
  const searchInput = document.querySelector('.search-input');
  const searchTerm   = searchInput.value.trim();
  const isSearching  = searchTerm !== '';

  const params = {
    // Si el usuario está buscando, ignoramos categoría/marca/subcategoría
    // para que la búsqueda sea siempre global
    category:     isSearching ? 'all' : currentFilter,
    subcategoria: isSearching ? 'all' : currentSubcategoria,
    brand:        isSearching ? 'all' : currentBrand,
    search:       searchTerm,
    order:        currentOrder,
    page:         currentPage,
    limit:        PRODUCTS_PER_PAGE
  };

  if (onlyStock)  params.en_stock  = 'true';
  if (onlyOferta) params.en_oferta = 'true';

  return await getProductsFiltered(params);
}


// ------------------------------------------------------------
// renderProducts() — decide qué vista mostrar
// ------------------------------------------------------------
async function renderProducts(page) {
  if (page === undefined) page = 1;
  currentPage = page;

  const searchInput = document.querySelector('.search-input');
  const result      = await getFilteredProducts();

  const hasFilter = currentFilter !== "all" ||
                    currentBrand  !== "all" ||
                    currentSubcategoria !== "all" ||
                    searchInput.value.trim() !== '' ||
                    currentFilter === "todos";

  if (hasFilter) {
    showFilterView(result, page);
  } else {
    showHomeView(result, page);
  }
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
          '<a href="#" class="cat-link" data-category="' + cat + '">' + label + '</a>' +
          '<button class="cat-toggle">' +
            '<span class="material-symbols-outlined">expand_more</span>' +
          '</button>' +
        '</div>' +
        '<ul class="subcat-list" id="subcat-' + cat + '">' +
          subcats.map(function(sub) {
            const subLabel = sub.charAt(0).toUpperCase() + sub.slice(1);
            return '<li><a href="#" class="subcat-link" data-subcat="' + sub + '">' + subLabel + '</a></li>';
          }).join('') +
        '</ul>';

      li.querySelector('.cat-link').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        currentFilter       = cat;
        currentSubcategoria = "all";
        currentBrand        = "all";
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
          currentSubcategoria = this.getAttribute('data-subcat');
          currentFilter       = "all";
          currentBrand        = "all";
          renderProducts(1);
        });
      });

    } else {
      li.innerHTML = '<a href="#" class="cat-link" data-category="' + cat + '">' + label + '</a>';
      li.querySelector('.cat-link').addEventListener('click', function(e) {
        e.preventDefault();
        currentFilter       = cat;
        currentSubcategoria = "all";
        currentBrand        = "all";
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
    renderProducts(1);
  });
  dropdownMenu.appendChild(allItem);

  uniqueBrands.forEach(function(brand) {
    const li    = document.createElement('li');
    const label = brand.charAt(0).toUpperCase() + brand.slice(1);
    li.innerHTML = '<a href="#" data-brand="' + brand + '">' + label + '</a>';
    li.querySelector('a').addEventListener('click', function(e) {
      e.preventDefault();
      currentBrand        = brand;
      currentFilter       = "todos";
      currentSubcategoria = "all";
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
    orderSelect.value    = currentOrder;
    orderSelect.onchange = function() { currentOrder = this.value; renderProducts(1); };
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
      '<a href="#" class="sidebar-filter-link sidebar-back">' +
        '<span class="material-symbols-outlined">arrow_back</span>' +
        'Todas las categorías' +
      '</a>';
    liBack.querySelector('a').addEventListener('click', function(e) {
      e.preventDefault();
      currentFilter       = "todos";
      currentSubcategoria = "all";
      renderProducts(1);
    });
    sidebarCats.appendChild(liBack);

    if (subcats.length > 0) {
      const liAll = document.createElement('li');
      liAll.innerHTML =
        '<a href="#" class="sidebar-filter-link' + (currentSubcategoria === "all" ? ' active' : '') + '">' +
          'Todos<span class="sidebar-count">' + currentFiltered.length + '</span>' +
        '</a>';
      liAll.querySelector('a').addEventListener('click', function(e) {
        e.preventDefault();
        currentSubcategoria = "all";
        renderProducts(1);
      });
      sidebarCats.appendChild(liAll);

      subcats.forEach(function(sub) {
        const count = allProducts.filter(function(p) { return p.category === currentFilter && p.subcategoria === sub; }).length;
        const li    = document.createElement('li');
        li.innerHTML =
          '<a href="#" class="sidebar-filter-link' + (currentSubcategoria === sub ? ' active' : '') + '" data-subcat="' + sub + '">' +
            sub.charAt(0).toUpperCase() + sub.slice(1) +
            '<span class="sidebar-count">' + count + '</span>' +
          '</a>';
        li.querySelector('a').addEventListener('click', function(e) {
          e.preventDefault();
          currentSubcategoria = this.getAttribute('data-subcat');
          renderProducts(1);
        });
        sidebarCats.appendChild(li);
      });
    }

    if (sidebarCatsSection) sidebarCatsSection.style.display = 'block';

  } else {
    sidebarCats.innerHTML = '';
    const cats = [...new Set(allProducts.map(function(p) { return p.category; }))];

    cats.forEach(function(cat) {
      const count = currentFiltered.filter(function(p) { return p.category === cat; }).length;
      const li    = document.createElement('li');
      li.innerHTML =
        '<a href="#" class="sidebar-filter-link" data-category="' + cat + '">' +
          cat.charAt(0).toUpperCase() + cat.slice(1) +
          '<span class="sidebar-count">' + count + '</span>' +
        '</a>';
      li.querySelector('.sidebar-filter-link').addEventListener('click', function(e) {
        e.preventDefault();
        currentFilter       = this.getAttribute('data-category');
        currentSubcategoria = "all";
        currentBrand        = "all";
        renderProducts(1);
      });
      sidebarCats.appendChild(li);
    });

    if (sidebarCatsSection) sidebarCatsSection.style.display = 'block';
  }

  // Marcas
  const sidebarBrands = document.getElementById('sidebar-brands');
  sidebarBrands.innerHTML = '';

  const brands = [...new Set(
    currentFiltered.map(function(p) { return p.brand; }).filter(function(b) { return b && b.trim() !== ''; })
  )];

  if (brands.length === 0) {
    sidebarBrands.innerHTML = '<li class="sidebar-empty">Sin marcas</li>';
  } else {
    if (currentBrand !== "all") {
      const liAll = document.createElement('li');
      liAll.innerHTML = '<a href="#" class="sidebar-filter-link">Todas las marcas</a>';
      liAll.querySelector('a').addEventListener('click', function(e) {
        e.preventDefault();
        currentBrand = "all";
        renderProducts(1);
      });
      sidebarBrands.appendChild(liAll);
    }

    brands.forEach(function(brand) {
      const count = currentFiltered.filter(function(p) { return p.brand === brand; }).length;
      const li    = document.createElement('li');
      li.innerHTML =
        '<a href="#" class="sidebar-filter-link' + (currentBrand === brand ? ' active' : '') + '" data-brand="' + brand + '">' +
          brand.charAt(0).toUpperCase() + brand.slice(1) +
          '<span class="sidebar-count">' + count + '</span>' +
        '</a>';
      li.querySelector('a').addEventListener('click', function(e) {
        e.preventDefault();
        currentBrand = this.getAttribute('data-brand');
        renderProducts(1);
      });
      sidebarBrands.appendChild(li);
    });
  }

  // Checkboxes
  const stockCheck  = document.getElementById('filter-only-stock');
  const ofertaCheck = document.getElementById('filter-only-oferta');

  if (stockCheck) {
    stockCheck.checked  = onlyStock;
    stockCheck.onchange = function() { onlyStock = this.checked; renderProducts(1); };
  }
  if (ofertaCheck) {
    ofertaCheck.checked  = onlyOferta;
    ofertaCheck.onchange = function() { onlyOferta = this.checked; renderProducts(1); };
  }
}

// ------------------------------------------------------------
// Toggle vista grid / lista
// ------------------------------------------------------------
