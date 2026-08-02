// ============================================================
// mosaico.js — Mosaico de categorías de la portada
// ============================================================
// Depende de: state.js, filters.js (selectedCategories, renderProducts),
//             render.js (escapeHTML), modal.js (escapeAttr)
// ============================================================
// Se arma solo con los datos que ya hay en la base: no hay que diseñar
// banners a mano. Cada baldosa sale de GET /api/categories/resumen
// (categoría + cuántos productos tiene + una imagen representativa) y al
// clickearla aplica el filtro de esa categoría, igual que el menú
// "Categorías" del nav.
// ============================================================

async function initMosaicoCategorias() {
  const section = document.getElementById('section-mosaico');
  const grid    = document.getElementById('mosaico-grid');
  if (!section || !grid) return;

  let categorias = [];
  try {
    const res = await fetch('/api/categories/resumen');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    categorias = await res.json();
  } catch (err) {
    // Si falla, la portada sigue funcionando sin el mosaico.
    console.error('No se pudo cargar el mosaico de categorías:', err);
    return;
  }

  // Con una sola categoría un "mosaico" no aporta nada visualmente.
  if (!Array.isArray(categorias) || categorias.length < 2) return;

  grid.innerHTML = categorias.map(function(cat, index) {
    const label = cat.category.charAt(0).toUpperCase() + cat.category.slice(1);
    const plural = cat.cantidad === 1 ? 'producto' : 'productos';

    // La primera baldosa ocupa el doble de ancho en escritorio: le da al
    // mosaico el ritmo irregular del ejemplo, sin diseñar nada a mano.
    const destacada = index === 0 ? ' mosaico-tile-lg' : '';

    const imagen = cat.image
      ? '<img class="mosaico-img" src="' + escapeAttr(cat.image) + '" alt="" loading="lazy">'
      : '';

    return '<button type="button" class="mosaico-tile' + destacada + '" data-categoria="' + escapeAttr(cat.category) + '">' +
             '<div class="mosaico-texto">' +
               '<span class="mosaico-nombre">' + escapeHTML(label) + '</span>' +
               '<span class="mosaico-cantidad">' + cat.cantidad + ' ' + plural + '</span>' +
               '<span class="mosaico-cta">Ver todo</span>' +
             '</div>' +
             '<div class="mosaico-media">' + imagen + '</div>' +
           '</button>';
  }).join('');

  grid.addEventListener('click', function(e) {
    const tile = e.target.closest('.mosaico-tile');
    if (!tile) return;

    const cat = tile.getAttribute('data-categoria');

    // Mismo estado que aplica el menú "Categorías" (ver filters.js)
    currentFilter         = cat;
    currentSubcategoria   = 'all';
    currentBrand          = 'all';
    selectedCategories    = [cat];
    selectedBrands        = [];
    selectedSubcategorias = [];
    renderProducts(1);

    // Sin esto el filtro se aplica más abajo y parece que no pasó nada.
    const destino = document.getElementById('filter-view');
    if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  section.style.display = '';
}
