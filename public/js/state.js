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

// ------------------------------------------------------------
// Escapado para prevenir XSS
// ------------------------------------------------------------
// Las dos viven acá porque state.js se carga antes que el resto de los
// módulos del catálogo (ver el orden de los <script> en views/index.html).
// Antes escapeAttr estaba definida por triplicado —en render.js, filters.js
// y modal.js, los tres cargados en la misma página—, con lo cual la última
// en cargarse pisaba a las otras. Eran idénticas, así que no había un bug,
// pero en una función de seguridad esa redundancia es una trampa: corregir
// una copia y no las demás dejaría el comportamiento dependiendo del orden
// de carga.

// Para texto dentro del HTML.
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Para valores dentro de un atributo. Escapa además la comilla simple,
// porque un atributo puede estar delimitado con ella.
function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}