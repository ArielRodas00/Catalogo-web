// ============================================================
// render.js — Renderizado de tarjetas, grids y paginación
// ============================================================
// Depende de: state.js
// ============================================================

// Referencias al DOM
const productGrid  = document.querySelector('#home-products .product-grid');
const filteredGrid = document.getElementById('filtered-grid');

// ------------------------------------------------------------
// createProductCard() — crea una tarjeta de producto
// ------------------------------------------------------------
function createProductCard(product) {
  const card = document.createElement('div');
  card.classList.add('product-card');
  if (currentView === 'list') card.classList.add('product-card--list');

  const badgesHTML =
    (!product.en_stock    ? '<span class="card-badge badge-sin-stock">Sin stock</span>'        : '') +
    (product.en_oferta    ? '<span class="card-badge badge-oferta-card">Oferta</span>'          : '') +
    (product.destacado    ? '<span class="card-badge badge-destacado-card">⭐ Destacado</span>' : '') +
    (product.en_promocion ? '<span class="card-badge badge-promo-card">🔥 Promo</span>'        : '');

  const cardPrecioHTML = (product.en_oferta && product.precio_oferta)
    ? '<p class="product-price-old">' + formatPrice(product.price) + '</p>' +
      '<p class="product-price">'     + formatPrice(product.precio_oferta) + '</p>'
    : '<p class="product-price">'     + formatPrice(product.price) + '</p>';

  card.innerHTML =
    '<div class="product-image-wrap">' +
      '<img src="' + product.image + '" alt="' + product.name + '" class="product-image' + (!product.en_stock ? ' img-nostock' : '') + '">' +
      (!product.en_stock ? '<div class="card-stock-overlay">Sin stock</div>' : '') +
      '<div class="card-badges">' + badgesHTML + '</div>' +
    '</div>' +
    '<div class="product-info">' +
      '<h3 class="product-name">' + product.name + '</h3>' +
      cardPrecioHTML +
      '<button class="btn-detail" data-id="' + product.id + '"' + (!product.en_stock ? ' disabled' : '') + '>' +
        (!product.en_stock ? 'Sin stock' : 'Ver detalle') +
      '</button>' +
    '</div>';

  return card;
}


// ------------------------------------------------------------
// renderHighlightTrack() — tarjetas horizontales (sin badges)
// ------------------------------------------------------------
function renderHighlightTrack(track, products) {
  track.innerHTML = '';

  products.forEach(function(product) {
    const card = document.createElement('div');
    card.className = 'highlight-card';

    const precioHTML = (product.en_oferta && product.precio_oferta)
      ? '<span class="hp-price-old">' + formatPrice(product.price) + '</span>' +
        '<span class="hp-price">'     + formatPrice(product.precio_oferta) + '</span>'
      : '<span class="hp-price">'     + formatPrice(product.price) + '</span>';

    card.innerHTML =
      '<img src="' + product.image + '" alt="' + product.name + '" class="hp-image">' +
      '<div class="hp-info">' +
        '<p class="hp-name">' + product.name + '</p>' +
        precioHTML +
        '<button class="hp-btn" data-id="' + product.id + '">Ver detalle</button>' +
      '</div>';

    const hpBtn = card.querySelector('.hp-btn');
    if (hpBtn) {
      hpBtn.addEventListener('click', function() {
        openModal(Number(this.getAttribute('data-id')));
      });
    }

    track.appendChild(card);
  });
}


// ------------------------------------------------------------
// renderPaginationInto() — paginación en un contenedor dado
// ------------------------------------------------------------
function renderPaginationInto(container, current, total) {
  container.innerHTML = '';
  if (total <= 1) return;

  const btnPrev = document.createElement('button');
  btnPrev.innerHTML = '&larr; Anterior';
  btnPrev.className = 'page-btn';
  btnPrev.disabled  = current === 1;
  btnPrev.addEventListener('click', function() { renderProducts(current - 1); });
  container.appendChild(btnPrev);

  for (var i = 1; i <= total; i++) {
    (function(pageNum) {
      var isFirst  = pageNum === 1;
      var isLast   = pageNum === total;
      var isNearby = Math.abs(pageNum - current) <= 2;

      if (!isFirst && !isLast && !isNearby) {
        var last = container.lastElementChild;
        if (last && last.textContent !== '...') {
          var dots = document.createElement('span');
          dots.textContent = '...';
          dots.className   = 'page-dots';
          container.appendChild(dots);
        }
        return;
      }

      var btn = document.createElement('button');
      btn.textContent = pageNum;
      btn.className   = 'page-btn' + (pageNum === current ? ' active' : '');
      btn.addEventListener('click', function() { renderProducts(pageNum); });
      container.appendChild(btn);
    })(i);
  }

  const btnNext = document.createElement('button');
  btnNext.innerHTML = 'Siguiente &rarr;';
  btnNext.className = 'page-btn';
  btnNext.disabled  = current === total;
  btnNext.addEventListener('click', function() { renderProducts(current + 1); });
  container.appendChild(btnNext);
}


// ------------------------------------------------------------
// showHomeView() — vista de inicio
// ------------------------------------------------------------
function showHomeView(result, page) {
  isFilterView = false;

  document.getElementById('hero-carousel').style.display       = '';
  document.getElementById('section-promociones').style.display = '';
  document.getElementById('section-destacados').style.display  = '';
  document.getElementById('home-products').style.display       = '';
  document.getElementById('filter-view').style.display         = 'none';

  const products   = result.products || result;
  const totalPages = result.totalPages || 1;

  const grid = document.querySelector('#home-products .product-grid');
  grid.innerHTML = '';

  if (products.length === 0) {
    grid.innerHTML = '<p class="no-results">No se encontraron productos.</p>';
  } else {
    products.forEach(function(product) { grid.appendChild(createProductCard(product)); });
  }

  let paginationEl = document.getElementById('catalog-pagination');
  if (!paginationEl) {
    paginationEl           = document.createElement('div');
    paginationEl.id        = 'catalog-pagination';
    paginationEl.className = 'catalog-pagination';
    document.getElementById('home-products').appendChild(paginationEl);
  }
  renderPaginationInto(paginationEl, page, totalPages);
}


// ------------------------------------------------------------
// showFilterView() — vista filtrada con sidebar
// ------------------------------------------------------------
async function showFilterView(result, page) {
  isFilterView = true;

  document.getElementById('hero-carousel').style.display       = 'none';
  document.getElementById('section-promociones').style.display = 'none';
  document.getElementById('section-destacados').style.display  = 'none';
  document.getElementById('home-products').style.display       = 'none';
  document.getElementById('filter-view').style.display         = 'block';

  const products   = result.products || [];
  const total      = result.total    || 0;
  const totalPages = result.totalPages || 1;

  // Título dinámico
  const searchInput = document.querySelector('.search-input');
  let titulo = 'Resultados';
  if (currentFilter === "todos") {
    titulo = 'Todos los productos';
  } else if (currentFilter && currentFilter !== "all") {
    titulo = currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1);
  }
  if (currentSubcategoria && currentSubcategoria !== "all") {
    titulo = currentSubcategoria.charAt(0).toUpperCase() + currentSubcategoria.slice(1);
  }
  if (currentBrand && currentBrand !== "all") {
    titulo = 'Marca: ' + currentBrand.charAt(0).toUpperCase() + currentBrand.slice(1);
  }
  if (searchInput.value.trim() !== '') {
    titulo = 'Búsqueda: "' + searchInput.value.trim() + '"';
  }

  document.getElementById('filter-view-title').textContent   = titulo;
  document.getElementById('filter-result-count').textContent =
    total + ' producto' + (total !== 1 ? 's' : '');

  const grid = document.getElementById('filtered-grid');
  grid.innerHTML = '';
  grid.className = 'product-grid product-grid--3col';

  if (products.length === 0) {
    grid.innerHTML = '<p class="no-results">No se encontraron productos.</p>';
  } else {
    products.forEach(function(product) { grid.appendChild(createProductCard(product)); });
  }

  renderPaginationInto(document.getElementById('filtered-pagination'), page, totalPages);

  await populateSidebar(products);

  if (!isFilterView) {
    document.getElementById('filter-view').scrollIntoView({ behavior: 'smooth' });
  }
}
