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

    const whatsappMsg  = encodeURIComponent('Hola! Me interesa: ' + product.name);
    const whatsappLink = 'https://wa.me/' + product.whatsapp + '?text=' + whatsappMsg;

    slide.innerHTML =
      '<div class="carousel-bg" style="background-image: url(\'' + encodeURI(product.image || '') + '\')"></div>' +
      '<div class="carousel-overlay"></div>' +
      '<div class="carousel-content">' +
        '<span class="carousel-category">' + product.category.toUpperCase() + '</span>' +
        '<h2 class="carousel-title">' + escapeHTML(product.name) + '</h2>' +
        '<p class="carousel-price">' + formatPrice(product.price) + '</p>' +
        '<div class="carousel-actions">' +
          '<button class="btn-carousel-detail" data-id="' + product.id + '">Ver detalle</button>' +
          '<a href="' + whatsappLink + '" target="_blank" class="btn-carousel-whatsapp">Consultar</a>' +
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

  document.getElementById('hero-carousel').addEventListener('mouseenter', function() { clearInterval(autoplay); });
  document.getElementById('hero-carousel').addEventListener('mouseleave', function() {
    autoplay = setInterval(function() { goToSlide(current + 1); }, 5000);
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
        currentFilter       = "todos";
        currentBrand        = "all";
        currentSubcategoria = "all";
        onlyOferta          = false;
        onlyStock           = false;
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
        currentFilter       = "todos";
        currentBrand        = "all";
        currentSubcategoria = "all";
        onlyStock           = false;
        onlyOferta          = false;
        onlyDestacado       = true;
        document.querySelector('.search-input').value = '';
        renderProducts(1);
      });
    }
  }
}
