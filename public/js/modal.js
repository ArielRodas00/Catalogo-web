// ============================================================
// modal.js — Modal de detalle de producto y fullscreen
// ============================================================
// Depende de: state.js, storage.js
// ============================================================

const modal        = document.getElementById('product-modal');
const modalContent = document.getElementById('modal-body');
const modalClose   = document.getElementById('modal-close');

function escapeAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ------------------------------------------------------------
// registrarClickWhatsapp() — registra un click en WhatsApp
// ------------------------------------------------------------
function registrarClickWhatsapp(productId) {
  fetch('/api/metrics/whatsapp/' + productId, { method: 'POST' });
}


// ------------------------------------------------------------
// openModal() — abre el modal con el detalle del producto
// ------------------------------------------------------------
async function openModal(productId) {
  const allProducts = await getProducts();
  const product     = allProducts.find(function(p) {
    return p.id === Number(productId);
  });
  if (!product) return;

  // Registramos la vista
  fetch('/api/metrics/view/' + product.id, { method: 'POST' });

  // JSON-LD structured data for SEO (product detail)
  var ld = document.getElementById('seo-product');
  if (!ld) {
    ld = document.createElement('script');
    ld.id = 'seo-product';
    ld.type = 'application/ld+json';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.name,
    "description": product.description ? product.description.slice(0, 300) : '',
    "image": product.image || undefined,
    "category": product.category || undefined,
    "offers": {
      "@type": "Offer",
      "price": Number(product.price),
      "priceCurrency": "PYG",
      "availability": product.en_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
    }
  });

  // Cargamos imágenes adicionales
  let extraImages = [];
  try {
    const imagesRes = await fetch('/api/products/' + product.id + '/images');
    if (imagesRes.ok) {
      extraImages = await imagesRes.json();
    }
  } catch (e) {
    console.error('Error cargando imágenes adicionales:', e);
  }
  const allImages   = [{ url: product.image }].concat(extraImages);

  let currentImageIndex = 0;

  const hasOferta   = product.en_oferta && product.precio_oferta;
  const effectivePrice = hasOferta ? product.precio_oferta : product.price;

  const modalPriceHTML = hasOferta
    ? '<p class="product-price-old">' + formatPrice(product.price) + '</p>' +
      '<p class="modal-price">'       + formatPrice(product.precio_oferta) + '</p>'
    : '<p class="modal-price">'       + formatPrice(product.price) + '</p>';

  const whatsappMessage = encodeURIComponent(
    'Hola! Me interesa el producto: ' + product.name + ' (Gs. ' + effectivePrice + ')'
  );
  const whatsappLink = 'https://wa.me/' + product.whatsapp + '?text=' + whatsappMessage;

  const thumbnailsHTML = allImages.map(function(img, index) {
    return '<img src="' + escapeAttr(img.url) + '" ' +
      'class="thumbnail' + (index === 0 ? ' active' : '') + '" ' +
      'data-index="' + index + '" alt="Imagen ' + (index + 1) + '">';
  }).join('');

  const showArrows = allImages.length > 1;

  modalContent.innerHTML =
    '<div class="modal-gallery">' +
      '<div class="gallery-main">' +
        (showArrows ? '<button class="gallery-arrow arrow-left" id="arrow-left">&#8592;</button>' : '') +
        '<img src="' + escapeAttr(allImages[0].url) + '" class="gallery-main-img" id="gallery-main-img" alt="' + escapeHTML(product.name) + '">' +
        (showArrows ? '<button class="gallery-arrow arrow-right" id="arrow-right">&#8594;</button>' : '') +
      '</div>' +
      (allImages.length > 1 ? '<div class="gallery-thumbs" id="gallery-thumbs">' + thumbnailsHTML + '</div>' : '') +
    '</div>' +
    '<div class="modal-info">' +
      '<div class="modal-tags">' +
        '<span class="modal-category">' + escapeHTML(product.category.toUpperCase()) + '</span>' +
        (product.subcategoria && product.subcategoria.trim() !== ''
          ? '<span class="modal-subcategory">' + escapeHTML(product.subcategoria.toUpperCase()) + '</span>' : '') +
        (product.brand && product.brand.trim() !== ''
          ? '<span class="modal-brand">' + escapeHTML(product.brand.toUpperCase()) + '</span>' : '') +
      '</div>' +
      '<h2 class="modal-name">' + escapeHTML(product.name) + '</h2>' +
      modalPriceHTML +
      '<p class="modal-description">' + escapeHTML(product.description) + '</p>' +
      '<a href="' + whatsappLink + '" target="_blank" class="btn-whatsapp" onclick="registrarClickWhatsapp(' + product.id + ')">' +
        '<span class="material-symbols-outlined">chat</span>' +
        'Consultar por WhatsApp' +
      '</a>' +
    '</div>';

  // Toast al hacer click en WhatsApp
  var waBtn = document.querySelector('#modal-body .btn-whatsapp');
  if (waBtn) {
    waBtn.addEventListener('click', function() {
      showToast('Abriendo WhatsApp...', 'success');
    });
  }

  // Fullscreen al hacer click en la imagen principal
  document.getElementById('gallery-main-img').addEventListener('click', function() {
    openFullscreen(allImages[currentImageIndex].url, product.name);
  });

  // Función para cambiar imagen activa
  function setImage(index) {
    currentImageIndex = index;
    const mainImg     = document.getElementById('gallery-main-img');
    mainImg.src       = allImages[index].url;
    document.querySelectorAll('.thumbnail').forEach(function(thumb, i) {
      thumb.classList.toggle('active', i === index);
    });
  }

  if (showArrows) {
    document.getElementById('arrow-left').addEventListener('click', function(e) {
      e.stopPropagation();
      setImage((currentImageIndex - 1 + allImages.length) % allImages.length);
    });
    document.getElementById('arrow-right').addEventListener('click', function(e) {
      e.stopPropagation();
      setImage((currentImageIndex + 1) % allImages.length);
    });
  }

  if (allImages.length > 1) {
    document.querySelectorAll('.thumbnail').forEach(function(thumb) {
      thumb.addEventListener('click', function() {
        setImage(Number(this.getAttribute('data-index')));
      });
    });
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}


// ------------------------------------------------------------
// closeModal()
// ------------------------------------------------------------
function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
  modalContent.innerHTML = '';
}


// ------------------------------------------------------------
// openFullscreen() — imagen en pantalla completa
// ------------------------------------------------------------
function openFullscreen(imageUrl, altText) {
  const overlay = document.createElement('div');
  overlay.id    = 'fullscreen-overlay';
  overlay.innerHTML =
    '<div class="fullscreen-inner">' +
      '<button class="fullscreen-close" id="fullscreen-close">' +
        '<span class="material-symbols-outlined">close</span>' +
      '</button>' +
      '<img src="' + escapeAttr(imageUrl) + '" alt="' + escapeAttr(altText) + '" class="fullscreen-img" id="fullscreen-img">' +
    '</div>';

  document.body.appendChild(overlay);

  requestAnimationFrame(function() { overlay.classList.add('fullscreen-visible'); });

  const img      = overlay.querySelector('#fullscreen-img');
  let   isZoomed = false;

  // Click en la imagen → zoom in/out
  img.addEventListener('click', function(e) {
    e.stopPropagation();
    isZoomed = !isZoomed;
    img.style.transform  = isZoomed ? 'scale(1.8)' : 'scale(1)';
    img.style.transition = 'transform 0.3s ease';
    img.classList.toggle('zoomed', isZoomed);
  });

  // Click en el overlay (fondo oscuro) → cerrar
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay || e.target.closest('.fullscreen-close')) {
      closeFullscreen(overlay);
    }
  });

  // Click en fullscreen-inner pero fuera de la imagen → cerrar
  overlay.querySelector('.fullscreen-inner').addEventListener('click', function(e) {
    if (e.target === this) {
      closeFullscreen(overlay);
    }
  });

  // Escape → cerrar fullscreen
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      closeFullscreen(overlay);
      document.removeEventListener('keydown', onKeyDown);
    }
  }
  document.addEventListener('keydown', onKeyDown);
}

function closeFullscreen(overlay) {
  overlay.classList.remove('fullscreen-visible');
  setTimeout(function() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }, 300);
}


// ------------------------------------------------------------
// Event listeners del modal
// ------------------------------------------------------------
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    // Solo cerramos el modal si NO hay fullscreen abierto
    const fullscreen = document.getElementById('fullscreen-overlay');
    if (!fullscreen) closeModal();
  }
});


