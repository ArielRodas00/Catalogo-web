// ============================================================
// carousel.js — Carrusel hero y secciones destacados/promociones
// ============================================================
// Depende de: state.js, render.js, modal.js
// ============================================================

// ------------------------------------------------------------
// initCarousel() — carrusel de productos destacados
// ------------------------------------------------------------
async function initCarousel() {
  let products;
  try {
    const res = await fetch('/api/products/destacados');
    products = await res.json();
  } catch (e) {
    console.error('Error cargando carrusel:', e);
    return;
  }

  const track   = document.getElementById('carousel-track');
  const dotsEl  = document.getElementById('carousel-dots');
  const btnPrev = document.getElementById('carousel-prev');
  const btnNext = document.getElementById('carousel-next');

  if (!products || products.length === 0) {
    document.getElementById('hero-carousel').style.display = 'none';
    return;
  }

  track.innerHTML  = '';
  dotsEl.innerHTML = '';

  let current = 0;

  products.forEach(function(product, index) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide' + (index === 0 ? ' active' : '');

    // Precio: mismo criterio que el resto del sitio (ver getPriceInfo en
    // state.js) — si el producto está en oferta se muestra el precio con
    // descuento, con el anterior tachado arriba.
    const precio = getPriceInfo(product);
    const carouselPriceHTML = precio.hasOferta
      ? '<p class="carousel-price-old">' + formatPrice(precio.oldPrice) + '</p>' +
        '<p class="carousel-price">' + formatPrice(precio.effectivePrice) + '</p>'
      : '<p class="carousel-price">' + formatPrice(precio.effectivePrice) + '</p>';

    const whatsappMsg  = encodeURIComponent(
      'Hola! Me interesa: ' + product.name + ' (Gs. ' + precio.effectivePrice + ')'
    );
    const whatsappLink = 'https://wa.me/' + product.whatsapp + '?text=' + whatsappMsg;

    // Layout dividido (texto | imagen) en vez de la foto como fondo a
    // pantalla completa: las fotos de producto son verticales y chicas
    // (ej. 272x475px), así que estirarlas a todo el ancho del hero las
    // ampliaba ~7x y solo dejaba ver una franja del medio, borrosa. Acá la
    // imagen va contenida en su propio panel, nunca se recorta ni se
    // pixela, y el texto no depende de la foto para ser legible.
    // Ver AUDITORIA.md.
    slide.innerHTML =
      '<div class="carousel-split">' +
        '<div class="carousel-info">' +
          '<span class="carousel-category">' + escapeHTML(product.category.toUpperCase()) + '</span>' +
          '<h2 class="carousel-title">' + escapeHTML(product.name) + '</h2>' +
          carouselPriceHTML +
          '<div class="carousel-actions">' +
            '<button class="btn-carousel-detail" data-id="' + product.id + '">Ver detalle</button>' +
            '<a href="' + whatsappLink + '" target="_blank" class="btn-carousel-whatsapp">Consultar</a>' +
          '</div>' +
        '</div>' +
        '<div class="carousel-media">' +
          '<img class="carousel-img" src="' + escapeAttr(product.image || '') + '" ' +
            'alt="' + escapeHTML(product.name) + '" loading="lazy">' +
        '</div>' +
      '</div>';

    track.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
    dot.addEventListener('click', function() { goToSlide(index); });
    dotsEl.appendChild(dot);
  });

  function goToSlide(index) {
    const slides = track.querySelectorAll('.carousel-slide');
    const dots   = dotsEl.querySelectorAll('.carousel-dot');
    if (slides.length === 0) return;

    const prev = current;
    current    = ((index % products.length) + products.length) % products.length;

    slides[prev].classList.remove('active');
    if (dots[prev]) dots[prev].classList.remove('active');
    slides[current].classList.add('active');
    if (dots[current]) dots[current].classList.add('active');
  }

  btnPrev.addEventListener('click', function(e) { e.stopPropagation(); goToSlide(current - 1); });
  btnNext.addEventListener('click', function(e) { e.stopPropagation(); goToSlide(current + 1); });

  let autoplay = setInterval(function() { goToSlide(current + 1); }, 5000);
  if (window._carouselInterval) clearInterval(window._carouselInterval);
  window._carouselInterval = autoplay;

  document.getElementById('hero-carousel').addEventListener('mouseenter', function() { clearInterval(autoplay); });
  document.getElementById('hero-carousel').addEventListener('mouseleave', function() {
    if (window._carouselInterval) clearInterval(window._carouselInterval);
    autoplay = setInterval(function() { goToSlide(current + 1); }, 5000);
    window._carouselInterval = autoplay;
  });

  track.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-carousel-detail');
    if (btn) openModal(Number(btn.getAttribute('data-id')));
  });
}


// ------------------------------------------------------------
// initHighlightSections() — secciones de promociones y destacados
// ------------------------------------------------------------
async function initHighlightSections() {
  let promociones, destacados;
  try {
    const resPromo = await fetch('/api/products/promociones');
    promociones = await resPromo.json();
  } catch (e) {
    console.error('Error cargando promociones:', e);
    promociones = [];
  }

  if (promociones.length > 0) {
    document.getElementById('section-promociones').style.display = 'block';
    renderHighlightTrack(
      document.getElementById('track-promociones'),
      promociones.slice(0, 8)
      // Mostramos máximo 8 productos en la sección
    );

    // Botón "Ver todos" → filtra por promociones
    const btnPromo = document.getElementById('btn-ver-mas-promociones');
    if (btnPromo) {
      btnPromo.style.display = promociones.length > 4 ? 'block' : 'none';
      btnPromo.addEventListener('click', function() {
        currentFilter        = "todos";
        currentBrand         = "all";
        currentSubcategoria  = "all";
        selectedCategories   = [];
        selectedBrands       = [];
        selectedSubcategorias = [];
        onlyOferta           = false;
        onlyStock            = false;
        document.querySelector('.search-input').value = '';
        // Mostramos todos los productos — las promos ya tienen badge 🔥
        renderProducts(1);
      });
    }
  }

  try {
    const resDesc = await fetch('/api/products/destacados');
    destacados = await resDesc.json();
  } catch (e) {
    console.error('Error cargando destacados:', e);
    destacados = [];
  }

  if (destacados.length > 0) {
    document.getElementById('section-destacados').style.display = 'block';
    renderHighlightTrack(
      document.getElementById('track-destacados'),
      destacados.slice(0, 8)
    );
    // Botón "Ver todos" → filtra solo destacados
    const btnDest = document.getElementById('btn-ver-mas-destacados');
    if (btnDest) {
      btnDest.style.display = destacados.length > 4 ? 'block' : 'none';
      btnDest.addEventListener('click', function() {
        currentFilter        = "todos";
        currentBrand         = "all";
        currentSubcategoria  = "all";
        selectedCategories   = [];
        selectedBrands       = [];
        selectedSubcategorias = [];
        onlyStock            = false;
        onlyOferta           = false;
        onlyDestacado        = true;
        document.querySelector('.search-input').value = '';
        renderProducts(1);
      });
    }
  }
}
