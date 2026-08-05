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

// Ícono real de WhatsApp (SVG inline, logo oficial) — antes se usaba un
// ícono genérico de "chat" de Material Symbols que no representa la marca.
// Inline en vez de un ícono de fuente para no depender de que Material
// Symbols incluya un glifo de WhatsApp (no lo tiene, es un set genérico).
const WHATSAPP_ICON_SVG =
  '<svg class="icon-whatsapp" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.669.15-.198.297-.768.967-.94 1.165-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885zM20.51 3.488A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.433-8.413z"></path>' +
  '</svg>';

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

  const precio = getPriceInfo(product); // ver state.js

  const modalPriceHTML = precio.hasOferta
    ? '<p class="product-price-old">' + formatPrice(precio.oldPrice) + '</p>' +
      '<p class="modal-price">'       + formatPrice(precio.effectivePrice) + '</p>'
    : '<p class="modal-price">'       + formatPrice(precio.effectivePrice) + '</p>';

  const whatsappMessage = encodeURIComponent(
    'Hola! Me interesa el producto: ' + product.name + ' (Gs. ' + precio.effectivePrice + ')'
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
      '<a href="' + escapeAttr(whatsappLink) + '" target="_blank" rel="noopener" class="btn-whatsapp" onclick="registrarClickWhatsapp(' + Number(product.id) + ')">' +
        WHATSAPP_ICON_SVG +
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


