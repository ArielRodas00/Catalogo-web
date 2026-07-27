// ============================================================
// admin/images.js — Gestión de imágenes (principal y adicionales)
// Dropzone (arrastrar y soltar + selección múltiple + subida automática),
// el estándar actual para este tipo de UI — ver AUDITORIA.md.
// ============================================================

// Imágenes adicionales que están subiéndose ahora mismo (todavía no
// confirmadas por el servidor) — se muestran como miniaturas con spinner
// mezcladas con las ya confirmadas, y se sacan de acá cuando terminan.
let uploadingExtraImages = [];
let extraImagesProductId = null;

// ------------------------------------------------------------
// Dropzone genérico: click-to-browse (vía el <input> superpuesto) +
// arrastrar y soltar, con feedback visual (.dragover) mientras se arrastra.
// ------------------------------------------------------------
function setupDropzone(dropzoneId, inputId, onFiles) {
  const dropzone = document.getElementById(dropzoneId);
  const input = document.getElementById(inputId);
  if (!dropzone || !input) return;

  input.addEventListener('change', function() {
    if (input.files.length > 0) onFiles(Array.from(input.files));
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
    const files = Array.from(e.dataTransfer.files).filter(function(f) {
      return f.type.startsWith('image/');
    });
    if (files.length > 0) onFiles(files);
  });
}

function setupImageDropzones() {
  setupDropzone('main-image-dropzone', 'field-image-file', function(files) {
    uploadMainImageFile(files[0]); // la principal es una sola — si sueltan varias, se usa la primera
  });
  setupDropzone('extra-images-dropzone', 'new-image-files', function(files) {
    uploadImageFiles(extraImagesProductId, files);
  });
}

// ------------------------------------------------------------
// Imagen principal
// ------------------------------------------------------------
async function uploadMainImageFile(file) {
  if (!file) return;

  const preview = document.getElementById('image-preview');
  const uploadingIndicator = document.getElementById('main-image-uploading');
  uploadingIndicator.style.display = 'flex';

  try {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch('/api/products/upload-image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData
    });
    if (!res.ok) { showToast('Error al subir imagen', 'error'); return; }

    const data = await res.json();
    document.getElementById('field-image-url').value = data.url;
    document.getElementById('field-image-imagekit-file-id').value = data.fileId;
    preview.src = data.url;
    preview.style.display = 'block';
    showToast('Imagen subida ✓');
  } catch (_e) {
    showToast('Error de conexión al subir la imagen', 'error');
  } finally {
    uploadingIndicator.style.display = 'none';
  }
}

// ------------------------------------------------------------
// Imágenes adicionales
// ------------------------------------------------------------
async function loadProductImages(productId) {
  extraImagesProductId = productId;
  let images;
  try {
    const res = await fetch('/api/products/' + productId + '/images');
    images = await res.json();
  } catch (err) {
    showToast('Error al cargar imágenes');
    return;
  }
  renderImagesGrid(images);
}

// Combina las imágenes ya confirmadas por el servidor con las que todavía
// se están subiendo (uploadingExtraImages), para que el usuario vea de
// entrada la miniatura con spinner apenas suelta/elige el archivo, sin
// esperar a que termine de subir.
function renderImagesGrid(confirmedImages) {
  const container = document.getElementById('images-container');
  if (!container) return;

  container.innerHTML = '';

  confirmedImages.forEach(function(img) {
    const div = document.createElement('div');
    div.className = 'img-item';
    div.innerHTML =
      '<img src="' + escapeAttr(img.url) + '" alt="imagen">' +
      '<button onclick="deleteImage(' + img.id + ', ' + extraImagesProductId + ')" class="btn-delete-img" aria-label="Eliminar imagen" title="Eliminar imagen">' +
        '<span class="material-symbols-outlined" aria-hidden="true">delete</span>' +
      '</button>';
    container.appendChild(div);
  });

  uploadingExtraImages.forEach(function(item) {
    const div = document.createElement('div');
    div.className = 'img-item ' + (item.status === 'error' ? 'error' : 'uploading');
    if (item.status === 'error') {
      div.innerHTML =
        '<img src="' + escapeAttr(item.previewUrl) + '" alt="imagen">' +
        '<div class="img-item-error-icon" title="' + escapeAttr(item.errorMessage || 'Error al subir') + '">' +
          '<span class="material-symbols-outlined" aria-hidden="true">error</span>' +
        '</div>' +
        '<button onclick="retryUploadingImage(\'' + item.tempId + '\')" class="btn-delete-img" aria-label="Reintentar" title="Reintentar">' +
          '<span class="material-symbols-outlined" aria-hidden="true">refresh</span>' +
        '</button>';
    } else {
      div.innerHTML =
        '<img src="' + escapeAttr(item.previewUrl) + '" alt="imagen">' +
        '<div class="img-item-spinner"><span class="spinner" aria-hidden="true"></span></div>';
    }
    container.appendChild(div);
  });
}

async function deleteImage(imageId, productId) {
  const res = await fetch('/api/products/images/' + imageId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  });
  if (!res.ok) { showToast('Error al eliminar imagen', 'error'); return; }
  await loadProductImages(productId);
  showToast('Imagen eliminada ✓');
}

async function uploadImageUrl(productId) {
  const input = document.getElementById('new-image-url');
  const url   = input.value.trim();
  if (!url) return;

  const res = await fetch('/api/products/' + productId + '/images/url', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
    body:    JSON.stringify({ url: url, orden: 0 })
  });
  if (!res.ok) { showToast('Error al agregar imagen', 'error'); return; }

  input.value = '';
  await loadProductImages(productId);
  showToast('Imagen agregada ✓');
}

// Sube varias imágenes a la vez: cada una aparece de entrada como miniatura
// con spinner (uploadingExtraImages) y se va reemplazando por la real a
// medida que cada subida termina — no hace falta esperar a que terminen
// todas para ver la primera.
async function uploadImageFiles(productId, files) {
  if (!productId || !files || files.length === 0) return;

  const items = files.map(function(file) {
    return {
      tempId: 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      file: file,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading'
    };
  });
  uploadingExtraImages = uploadingExtraImages.concat(items);
  renderImagesGrid(await currentConfirmedImages(productId));

  // Secuencial, no en paralelo: el servidor calcula el "orden" de cada
  // imagen mirando el máximo ya guardado para ese producto (ver
  // routes/products.js) — subiendo de a una evitamos que dos subidas
  // simultáneas lean el mismo máximo y choquen entre sí.
  let successCount = 0;
  for (const item of items) {
    try {
      const formData = new FormData();
      formData.append('image', item.file);
      const res = await fetch('/api/products/' + productId + '/images/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: formData
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      successCount++;
      uploadingExtraImages = uploadingExtraImages.filter(function(i) { return i.tempId !== item.tempId; });
    } catch (_e) {
      item.status = 'error';
      item.errorMessage = 'No se pudo subir';
    }
    URL.revokeObjectURL(item.previewUrl);
    await loadProductImages(productId);
  }

  if (successCount === items.length) {
    showToast(successCount > 1 ? successCount + ' imágenes subidas ✓' : 'Imagen subida ✓');
  } else if (successCount > 0) {
    showToast(successCount + ' de ' + items.length + ' imágenes subidas — revisá las que fallaron', 'error');
  } else {
    showToast('No se pudo subir ninguna imagen', 'error');
  }
}

async function retryUploadingImage(tempId) {
  const item = uploadingExtraImages.find(function(i) { return i.tempId === tempId; });
  if (!item) return;
  uploadingExtraImages = uploadingExtraImages.filter(function(i) { return i.tempId !== tempId; });
  await uploadImageFiles(extraImagesProductId, [item.file]);
}

// Se llama al abrir/cerrar el modal de producto — evita que quede una
// miniatura "subiendo" de un producto anterior colgada en el siguiente.
function resetUploadingExtraImages() {
  uploadingExtraImages.forEach(function(item) { URL.revokeObjectURL(item.previewUrl); });
  uploadingExtraImages = [];
  extraImagesProductId = null;
}

async function currentConfirmedImages(productId) {
  try {
    const res = await fetch('/api/products/' + productId + '/images');
    return await res.json();
  } catch (_e) {
    return [];
  }
}
