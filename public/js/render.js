// ============================================================
// render.js — Renderizado de tarjetas, grids y paginación
// ============================================================
// Depende de: state.js
// ============================================================

function escapeAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Referencias al DOM
const productGrid  = document.querySelector('#home-products .product-grid');
const filteredGrid = document.getElementById('filtered-grid');

// ------------------------------------------------------------
// renderSkeletons() — placeholders grises con shimmer
// ------------------------------------------------------------
function renderSkeletons(count) {
  const gridHome = document.querySelector('#home-products .product-grid');
  const gridFilter = document.getElementById('filtered-grid');
  const isHomeVisible = document.getElementById('home-products') && document.getElementById('home-products').style.display !== 'none';
  const isFilterVisible = document.getElementById('filter-view') && document.getElementById('filter-view').style.display !== 'none';
  const grid = isFilterVisible ? gridFilter : gridHome;
  if (!grid) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += '<div class="skeleton-card">' +
      '<div class="skeleton-image"></div>' +
      '<div class="skeleton-body">' +
        '<div class="skeleton-line medium"></div>' +
        '<div class="skeleton-line short"></div>' +
      '</div>' +
    '</div>';
  }
  grid.innerHTML = html;
}

// ------------------------------------------------------------
// createProductCard() — crea una tarjeta de producto
// ------------------------------------------------------------
function createProductCard(product) {
  const card = document.createElement('div');
  card.classList.add('product-card');
  card.setAttribute('data-id', product.id);

  const badgesHTML =
    (product.en_oferta    ? '<span class="card-badge badge-oferta-card">Oferta</span>'          : '') +
    (product.destacado    ? '<span class="card-badge badge-destacado-card">⭐ Destacado</span>' : '') +
    (product.en_promocion ? '<span class="card-badge badge-promo-card">🔥 Promo</span>'        : '');

  // .product-price-wrap reserva una altura fija (ver CSS) para que el precio
  // vigente quede siempre a la misma altura entre tarjetas, tenga o no
  // oferta (la línea tachada de arriba no debe "empujar" el precio real).
  const cardPrecioHTML = (product.en_oferta && product.precio_oferta)
    ? '<div class="product-price-wrap">' +
        '<p class="product-price-old">' + formatPrice(product.price) + '</p>' +
        '<p class="product-price">'     + formatPrice(product.precio_oferta) + '</p>' +
      '</div>'
    : '<div class="product-price-wrap">' +
        '<p class="product-price">'     + formatPrice(product.price) + '</p>' +
      '</div>';

  card.innerHTML =
    '<div class="product-image-wrap product-img-wrap">' +
      '<img src="' + escapeAttr(product.image) + '" alt="' + escapeHTML(product.name) + '" loading="lazy" class="product-image product-img' + (!product.en_stock ? ' img-nostock' : '') + '" onload="this.classList.add(\'loaded\')">' +
      (!product.en_stock ? '<div class="card-stock-overlay"></div><div class="ribbon-sin-stock">Sin stock</div>' : '') +
      '<div class="card-badges">' + badgesHTML + '</div>' +
    '</div>' +
    '<div class="product-info">' +
      '<h3 class="product-name">' + escapeHTML(product.name) + '</h3>' +
      cardPrecioHTML +
      '<button class="btn-detail" data-id="' + product.id + '"' + (!product.en_stock ? ' disabled' : '') + '>' +
        (!product.en_stock ? 'Sin stock' : 'Ver detalle') +
      '</button>' +
    '</div>';

  return card;
}


// ------------------------------------------------------------
// renderHighlightTrack() — tarjetas horizontales con badges
// ------------------------------------------------------------
function renderHighlightTrack(track, products) {
  track.innerHTML = '';

  products.forEach(function(product) {
    const card = document.createElement('div');
    card.className = 'highlight-card';
    card.setAttribute('data-id', product.id);

    const badgesHTML =
      (product.en_oferta    ? '<span class="card-badge badge-oferta-card">Oferta</span>'          : '') +
      (product.en_promocion ? '<span class="card-badge badge-promo-card">🔥 Promo</span>'        : '');

    // .hp-price-wrap reserva una altura fija (ver CSS) — mismo motivo que
    // .product-price-wrap en createProductCard().
    const precioHTML = (product.en_oferta && product.precio_oferta)
      ? '<div class="hp-price-wrap">' +
          '<span class="hp-price-old">' + formatPrice(product.price) + '</span>' +
          '<span class="hp-price">'     + formatPrice(product.precio_oferta) + '</span>' +
        '</div>'
      : '<div class="hp-price-wrap">' +
          '<span class="hp-price">'     + formatPrice(product.price) + '</span>' +
        '</div>';

    card.innerHTML =
      '<div style="position:relative; overflow:hidden">' +
      '<img src="' + escapeAttr(product.image) + '" alt="' + escapeHTML(product.name) + '" loading="lazy" class="hp-image product-img' + (!product.en_stock ? ' img-nostock' : '') + '" onload="this.classList.add(\'loaded\')">' +
      (!product.en_stock ? '<div class="card-stock-overlay" style="height:140px"></div><div class="ribbon-sin-stock">Sin stock</div>' : '') +
      '<div class="card-badges">' + badgesHTML + '</div>' +
      '</div>' +
      '<div class="hp-info">' +
        '<p class="hp-name">' + escapeHTML(product.name) + '</p>' +
        precioHTML +
        '<button class="hp-btn" data-id="' + product.id + '"' + (!product.en_stock ? ' disabled' : '') + '>' +
          (!product.en_stock ? 'Sin stock' : 'Ver detalle') +
        '</button>' +
      '</div>';

    // Toda la tarjeta es clickeable (no solo el botón "Ver detalle"),
    // salvo que el producto esté sin stock (botón deshabilitado).
    card.addEventListener('click', function() {
      const hpBtn = card.querySelector('.hp-btn');
      if (hpBtn && hpBtn.disabled) return;
      openModal(product.id);
    });

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

  // Reset sidebar visibility para mobile/tablet (sin animación al cargar)
  const sidebar = document.querySelector('.filter-sidebar');
  if (sidebar) sidebar.classList.remove('visible');
  const toggle = document.getElementById('btn-filter-toggle');
  if (toggle) toggle.classList.remove('active');

  document.getElementById('hero-carousel').style.display       = 'none';
  document.getElementById('section-promociones').style.display = 'none';
  document.getElementById('section-destacados').style.display  = 'none';
  document.getElementById('home-products').style.display       = 'none';
  document.getElementById('filter-view').style.display         = 'block';

  const products   = result.products || [];
  const total      = result.total    || 0;
  const totalPages = result.totalPages || 1;

  // Título dinámico desde arrays multi-selección
  var searchInput = document.querySelector('.search-input');
  var titulo = 'Resultados';

  if (selectedCategories.length > 0) {
    titulo = selectedCategories.map(function(c) { return c.charAt(0).toUpperCase() + c.slice(1); }).join(', ');
  } else if (selectedSubcategorias.length > 0) {
    titulo = selectedSubcategorias.map(function(s) { return s.charAt(0).toUpperCase() + s.slice(1); }).join(', ');
  } else if (selectedBrands.length > 0) {
    titulo = 'Marcas: ' + selectedBrands.map(function(b) { return b.charAt(0).toUpperCase() + b.slice(1); }).join(', ');
  } else if (currentFilter === "todos") {
    titulo = 'Todos los productos';
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

  try {
    await populateSidebar(products);
  } catch (e) {
    console.error('Error poblando sidebar:', e);
  }
}
