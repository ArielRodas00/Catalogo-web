// ============================================================
// admin/images.js — Galería unificada de imágenes de un producto
// ============================================================
// Una sola lista ordenada (galleryImages): la posición 0 es la imagen
// principal (productos.image), el resto es la galería (producto_imagenes).
// Arrastrar y soltar + selección múltiple + reordenar arrastrando las
// miniaturas — el estándar actual para este tipo de UI (ver AUDITORIA.md).
// ============================================================

// { tempId, url, fileId, previewUrl, status: 'uploading'|'ready'|'error' }
let galleryImages = [];
// null mientras se crea un producto nuevo (todavía sin id) — en ese caso los
// cambios se guardan recién al enviar el formulario completo. Con un id ya
// asignado (editando un producto existente), cada cambio se persiste solo.
let galleryProductId = null;

function resetGallery() {
  galleryImages.forEach(function(item) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  galleryImages = [];
  galleryProductId = null;
  renderGallery();
}

// Arma el estado inicial de la galería a partir de un producto ya guardado
// (su imagen principal + su galería en producto_imagenes).
async function loadGalleryForProduct(product) {
  galleryProductId = product.id;
  let extra = [];
  try {
    const res = await fetch('/api/products/' + product.id + '/images');
    extra = await res.json();
  } catch (_e) {
    extra = [];
  }
  galleryImages = [
    { tempId: 'main', url: product.image, fileId: product.image_imagekit_file_id || null, status: 'ready' }
  ].concat(extra.map(function(img) {
    return { tempId: 'g' + img.id, url: img.url, fileId: img.imagekit_file_id || null, status: 'ready' };
  }));
  renderGallery();
}

function renderGallery() {
  const container = document.getElementById('gallery-container');
  if (!container) return;
  container.innerHTML = '';

  galleryImages.forEach(function(item, index) {
    const div = document.createElement('div');
    const canDrag = item.status === 'ready';
    div.className = 'img-item' + (item.status === 'uploading' ? ' uploading' : item.status === 'error' ? ' error' : '');
    div.draggable = canDrag;
    div.dataset.index = String(index);

    let inner = '<img src="' + escapeAttr(item.previewUrl || item.url) + '" alt="imagen">';
    if (index === 0 && item.status === 'ready') {
      inner += '<span class="img-item-main-badge">Principal</span>';
    }
    if (item.status === 'uploading') {
      inner += '<div class="img-item-spinner"><span class="spinner" aria-hidden="true"></span></div>';
    } else if (item.status === 'error') {
      inner += '<div class="img-item-error-icon" title="No se pudo subir"><span class="material-symbols-outlined" aria-hidden="true">error</span></div>' +
        '<button onclick="removeGalleryImage(' + index + ')" class="btn-delete-img" aria-label="Quitar" title="Quitar">' +
          '<span class="material-symbols-outlined" aria-hidden="true">close</span>' +
        '</button>';
    } else {
      inner += '<button onclick="removeGalleryImage(' + index + ')" class="btn-delete-img" aria-label="Eliminar imagen" title="Eliminar imagen">' +
        '<span class="material-symbols-outlined" aria-hidden="true">delete</span>' +
      '</button>';
    }
    div.innerHTML = inner;
    container.appendChild(div);
  });

  setupGalleryDragReorder();
}

// ------------------------------------------------------------
// Dropzone: click-to-browse + arrastrar y soltar (selección múltiple)
// ------------------------------------------------------------
function setupImageDropzones() {
  const dropzone = document.getElementById('gallery-dropzone');
  const input = document.getElementById('gallery-files');
  if (!dropzone || !input) return;

  input.addEventListener('change', function() {
    if (input.files.length > 0) addGalleryFiles(Array.from(input.files));
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach(function(evt) {
    dropzone.addEventListener(evt, function(e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function(evt) {
    dropzone.addEventListener(evt, function(e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', function(e) {
    const files = Array.from(e.dataTransfer.files).filter(function(f) { return f.type.startsWith('image/'); });
    if (files.length > 0) addGalleryFiles(files);
  });
}

// ------------------------------------------------------------
// Reordenar arrastrando las miniaturas entre sí (drag & drop nativo)
// ------------------------------------------------------------
function setupGalleryDragReorder() {
  const container = document.getElementById('gallery-container');
  if (!container) return;
  let dragSrcIndex = null;

  container.querySelectorAll('.img-item[draggable="true"]').forEach(function(el) {
    el.addEventListener('dragstart', function() {
      dragSrcIndex = Number(el.dataset.index);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', function() {
      el.classList.remove('dragging');
    });
    el.addEventListener('dragover', function(e) { e.preventDefault(); });
    el.addEventListener('drop', function(e) {
      e.preventDefault();
      const targetIndex = Number(el.dataset.index);
      if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
      const [moved] = galleryImages.splice(dragSrcIndex, 1);
      galleryImages.splice(targetIndex, 0, moved);
      dragSrcIndex = null;
      renderGallery();
      persistGalleryIfEditing();
    });
  });
}

// ------------------------------------------------------------
// Agregar imágenes (archivo o URL)
// ------------------------------------------------------------
async function addGalleryFiles(files) {
  const items = files.map(function(file) {
    return {
      tempId: 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      file: file,
      previewUrl: URL.createObjectURL(file),
      url: null,
      fileId: null,
      status: 'uploading'
    };
  });
  galleryImages = galleryImages.concat(items);
  renderGallery();

  // Secuencial, no en paralelo — ver el mismo motivo documentado en
  // AUDITORIA.md para la subida de imágenes adicionales de antes.
  let successCount = 0;
  for (const item of items) {
    try {
      // Se achica antes de subir. El caso normal es una foto sacada con el
      // celular en el momento: sin esto, una cámara de 12 MP genera archivos
      // de 6 a 12 MB que el servidor rechaza, y además tardarían muchísimo
      // con datos móviles. Ver admin/comprimir.js.
      const archivo = await comprimirImagen(item.file);

      const formData = new FormData();
      formData.append('image', archivo);
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        // Sin headers: la sesión va en la cookie httpOnly, y el Content-Type
        // lo tiene que poner el navegador solo (necesita agregar el boundary
        // del multipart/form-data).
        body: formData
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      item.url = data.url;
      item.fileId = data.fileId;
      item.status = 'ready';
      successCount++;
      // Recién acá se suelta la preview local: ya tenemos la URL real que la
      // reemplaza. Hay que limpiar previewUrl además de liberarla, porque
      // renderGallery() la prioriza sobre url — si queda seteada, la
      // miniatura apuntaría a un blob ya revocado y se vería rota.
      URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = null;
    } catch (_e) {
      item.status = 'error';
      // En error se conserva la preview local (es lo único que hay para
      // mostrar qué archivo falló). Se libera al quitarla o al cerrar el
      // formulario — ver removeGalleryImage() y resetGallery().
    }
    renderGallery();
  }

  await persistGalleryIfEditing();

  if (successCount === items.length) {
    showToast(successCount > 1 ? successCount + ' imágenes subidas ✓' : 'Imagen subida ✓');
  } else if (successCount > 0) {
    showToast(successCount + ' de ' + items.length + ' imágenes subidas — revisá las que fallaron', 'error');
  } else {
    showToast('No se pudo subir ninguna imagen', 'error');
  }
}

function addGalleryImageUrl() {
  const input = document.getElementById('gallery-url-input');
  const url = input.value.trim();
  if (!url) return;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_e) {
    showToast('URL inválida', 'error');
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    showToast('La URL debe ser http o https', 'error');
    return;
  }

  galleryImages.push({ tempId: 'url_' + Date.now(), url: url, fileId: null, status: 'ready' });
  input.value = '';
  renderGallery();
  persistGalleryIfEditing();
  showToast('Imagen agregada ✓');
}

async function removeGalleryImage(index) {
  const remaining = galleryImages.filter(function(_item, i) { return i !== index; });
  if (remaining.filter(function(i) { return i.status !== 'error'; }).length === 0) {
    showToast('Tiene que quedar al menos una imagen', 'error');
    return;
  }
  const item = galleryImages[index];
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  galleryImages.splice(index, 1);
  renderGallery();
  await persistGalleryIfEditing();
  showToast('Imagen quitada ✓');
}

// Guarda el orden/composición actual en el servidor — solo si ya estamos
// editando un producto real (con id). Para uno nuevo, se persiste recién al
// guardar el formulario completo (ver products.js).
async function persistGalleryIfEditing() {
  if (galleryProductId === null) return;
  const confirmed = galleryImages.filter(function(i) { return i.status === 'ready'; });
  if (confirmed.length === 0) return;

  await fetch('/api/products/' + galleryProductId + '/images/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images: confirmed.map(function(i) { return { url: i.url, fileId: i.fileId }; })
    })
  });
}

// Para cuando se crea un producto nuevo: recién ahí existe un id, así que se
// asocia la galería completa (la principal ya quedó guardada en el POST de
// creación — ver products.js — pero volver a mandarla acá no hace daño y
// simplifica no tener casos especiales).
async function attachGalleryToNewProduct(productId) {
  galleryProductId = productId;
  await persistGalleryIfEditing();
}

// Devuelve { image, image_imagekit_file_id } de la primera imagen de la
// galería, para incluir en el payload del formulario (creación o edición).
function getGalleryMainImage() {
  const main = galleryImages.filter(function(i) { return i.status === 'ready'; })[0];
  if (!main) return null;
  return { image: main.url, image_imagekit_file_id: main.fileId || null };
}
