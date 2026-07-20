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
