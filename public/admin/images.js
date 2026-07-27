// ============================================================
// admin/images.js — Gestión de imágenes adicionales por producto
// ============================================================

async function loadProductImages(productId) {
  let images;
  try {
    const res = await fetch('/api/products/' + productId + '/images');
    images = await res.json();
  } catch (err) {
    showToast('Error al cargar imágenes');
    return;
  }

  const container = document.getElementById('images-container');
  if (!container) return;

  container.innerHTML = '';

  images.forEach(function(img) {
    const div = document.createElement('div');
    div.className = 'img-item';
    div.innerHTML =
      '<img src="' + escapeAttr(img.url) + '" alt="imagen">' +
      '<button onclick="deleteImage(' + img.id + ', ' + productId + ')" class="btn-delete-img" aria-label="Eliminar imagen" title="Eliminar imagen">' +
        '<span class="material-symbols-outlined" aria-hidden="true">delete</span>' +
      '</button>';
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

// Imagen principal (no asociada todavía a ningún producto — ver
// POST /api/products/upload-image en routes/products.js): sube el archivo,
// y con la URL/file_id que devuelve completa los campos del formulario, como
// si el usuario hubiese pegado esa URL a mano.
async function uploadMainImageFile() {
  const input = document.getElementById('field-image-file');
  if (!input.files[0]) return;

  const formData = new FormData();
  formData.append('image', input.files[0]);

  const res = await fetch('/api/products/upload-image', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body:   formData
  });
  if (!res.ok) { showToast('Error al subir imagen', 'error'); return; }

  const data = await res.json();
  document.getElementById('field-image-url').value = data.url;
  document.getElementById('field-image-imagekit-file-id').value = data.fileId;
  const preview = document.getElementById('image-preview');
  preview.src = data.url;
  preview.style.display = 'block';

  input.value = '';
  showToast('Imagen subida ✓');
}

async function uploadImageFile(productId) {
  const input = document.getElementById('new-image-file');
  if (!input.files[0]) return;

  const formData = new FormData();
  formData.append('image', input.files[0]);
  // FormData es la forma de enviar archivos por HTTP

  const res = await fetch('/api/products/' + productId + '/images/upload', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + getToken() },
    body:   formData
    // No ponemos Content-Type: el navegador lo setea automáticamente
    // con el boundary correcto para archivos
  });
  if (!res.ok) { showToast('Error al subir imagen', 'error'); return; }

  input.value = '';
  await loadProductImages(productId);
  showToast('Imagen subida ✓');
}
