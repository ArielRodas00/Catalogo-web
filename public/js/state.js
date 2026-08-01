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
// Arrays para selección múltiple
let selectedCategories     = [];  // categorias seleccionadas (array)
let selectedBrands         = [];  // marcas seleccionadas (array)
let selectedSubcategorias  = [];  // subcategorias seleccionadas (array)
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

// Decide qué precio corresponde mostrar para un producto (y si hay que
// tachar el anterior). Vive acá, una sola vez, a propósito: esta misma
// lógica estaba duplicada en cada vista (tarjetas, carrusel de destacados,
// modal) y esa duplicación hizo que el carrusel del hero quedara mostrando
// el precio sin descuento mientras el resto del sitio sí mostraba el de
// oferta — ver AUDITORIA.md. Cada vista arma su propio HTML/CSS, pero la
// decisión de qué precio va se toma únicamente acá.
function getPriceInfo(product) {
  const hasOferta = !!(product.en_oferta && product.precio_oferta);
  return {
    hasOferta: hasOferta,
    effectivePrice: hasOferta ? product.precio_oferta : product.price,
    oldPrice: product.price
  };
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