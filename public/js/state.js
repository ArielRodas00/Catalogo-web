// ============================================================
// state.js — Estado global de la aplicación
// ============================================================
// Todas las variables de estado en un solo lugar.
// Cualquier módulo puede leer y modificar estas variables.
// ============================================================

const PRODUCTS_PER_PAGE = 24;

let currentFilter       = "all";
let currentBrand        = "all";
let currentSubcategoria = "all";
let currentPage         = 1;
let currentOrder        = "reciente";
let onlyStock           = false;
let onlyOferta          = false;
let onlyDestacado       = false;
let isFilterView        = false;

// Función para formatear precios
function formatPrice(price) {
  return "Gs. " + new Intl.NumberFormat('es-PY').format(price);
}

// Helper para escapar HTML y prevenir XSS
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}