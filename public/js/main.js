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
  var btn = e.target.closest('.btn-detail');
  if (btn) openModal(btn.getAttribute('data-id'));
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

// Dropdown toggle para touch devices
function initDropdowns() {
  document.querySelectorAll('.dropdown-trigger').forEach(function(trigger) {
    trigger.addEventListener('click', function(e) {
      var dropdown = this.closest('.dropdown');
      var isOpen   = dropdown.classList.contains('open');

      // Cerrar otros dropdowns
      document.querySelectorAll('.dropdown.open').forEach(function(d) {
        if (d !== dropdown) d.classList.remove('open');
      });

      if (isOpen) {
        dropdown.classList.remove('open');
      } else {
        dropdown.classList.add('open');
      }
    });
  });

  // Cerrar dropdown al hacer click fuera
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown.open').forEach(function(d) {
        d.classList.remove('open');
      });
    }
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
  await initHighlightSections();
  await populateCategoryNav();
  await populateBrandNav();
  await renderProducts(1);
}

init().catch(function(err) { console.error('Error en inicialización:', err); });
