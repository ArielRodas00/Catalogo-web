// ============================================================
// main.js — Inicialización y event listeners globales
// ============================================================
// Depende de: state.js, storage.js, render.js,
//             filters.js, modal.js, carousel.js
// ============================================================

const searchInput = document.querySelector('.search-input');
const searchForm  = document.querySelector('.search-container');


// Buscador en tiempo real + registro de métricas
let searchTimeout;
let renderTimeout;
searchInput.addEventListener('input', function() {
  clearTimeout(renderTimeout);
  const value = this.value;
  renderTimeout = setTimeout(function() {
    renderProducts(1);
  }, 300);

  clearTimeout(searchTimeout);
  const termino = value.trim();
  if (termino.length >= 2) {
    searchTimeout = setTimeout(function() {
      fetch('/api/metrics/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ termino: termino })
      });
    }, 1000);
  }
});

searchForm.addEventListener('submit', function(e) {
  e.preventDefault();
  renderProducts(1);
});

function handleProductClick(e) {
  // Toda la tarjeta es clickeable (no solo el botón "Ver detalle"),
  // salvo que el producto esté sin stock (botón deshabilitado).
  var card = e.target.closest('.product-card');
  if (!card) return;
  var btn = card.querySelector('.btn-detail');
  if (btn && btn.disabled) return;
  openModal(card.getAttribute('data-id'));
}
productGrid.addEventListener('click', handleProductClick);
filteredGrid.addEventListener('click', handleProductClick);

document.querySelectorAll('.faq-question').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const item = this.closest('.faq-item');
    document.querySelectorAll('.faq-item.open').forEach(function(openItem) {
      if (openItem !== item) openItem.classList.remove('open');
    });
    item.classList.toggle('open');
  });
});

// Dropdowns: abrir/cerrar con click
function initDropdowns() {
  document.addEventListener('click', function(e) {
    var dropdown = e.target.closest('.dropdown');
    if (!dropdown) {
      // Cerrar todos si se clickea fuera
      document.querySelectorAll('.dropdown-menu.open').forEach(function(m) {
        m.classList.remove('open');
      });
      return;
    }

    var menu = dropdown.querySelector('.dropdown-menu');
    if (!menu) return;

    e.preventDefault();

    // Cerrar otros dropdowns
    document.querySelectorAll('.dropdown-menu.open').forEach(function(m) {
      if (m !== menu) m.classList.remove('open');
    });

    menu.classList.toggle('open');
  });
}

async function init() {
  currentFilter        = "all";
  currentBrand         = "all";
  currentSubcategoria  = "all";
  selectedCategories   = [];
  selectedBrands       = [];
  selectedSubcategorias = [];

  document.getElementById('btn-filter-toggle').addEventListener('click', function() {
    const sidebar = document.querySelector('.filter-sidebar');
    sidebar.classList.toggle('visible');
    this.classList.toggle('active');
  });

  document.getElementById('btn-back-home').addEventListener('click', function() {
      currentFilter        = "all";
      currentBrand         = "all";
      currentSubcategoria  = "all";
      selectedCategories   = [];
      selectedBrands       = [];
      selectedSubcategorias = [];
      onlyStock            = false;
      onlyOferta           = false;
      onlyDestacado        = false;
      searchInput.value    = '';
      renderProducts(1);
  });

  initDropdowns();
  await initCarousel();
  await initMosaicoCategorias();
  await initHighlightSections();
  await populateCategoryNav();
  await populateBrandNav();
  await renderProducts(1);
}

init().catch(function(err) { console.error('Error en inicialización:', err); });
