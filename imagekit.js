// ============================================================
// imagekit.js — Almacenamiento de imágenes de producto
// ============================================================
// El filesystem de Render es efímero (se borra en cada redeploy) — guardar
// las fotos de producto ahí las pierde tarde o temprano (ver AUDITORIA.md,
// "El problema de las imágenes"). Se suben acá en su lugar: un servicio
// dedicado a almacenamiento + CDN de imágenes, con URL permanente.
//
// Se usa ImageKit.io en vez de Cloudinary porque, probando esta integración,
// la cuenta de Cloudinary del usuario quedó inaccesible (panel roto,
// reproducible desde dos redes distintas y con cuenta nueva) — no fue una
// decisión de features, fue una cuestión práctica de qué proveedor
// respondía. Ver AUDITORIA.md, "El problema de las imágenes" para el detalle.
//
// Una sola cuenta de ImageKit sirve para todos los clientes (arquitectura
// "1 deploy por cliente"): cada deploy define su propio IMAGEKIT_FOLDER
// para no mezclar las fotos de un cliente con las de otro dentro de la misma
// cuenta — no hace falta una cuenta de ImageKit por cliente, a diferencia
// de Render/Neon, donde sí importa el aislamiento de datos.
// ============================================================

const ImageKit = require('imagekit');

function isConfigured() {
  return !!(process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT);
}

let imagekit = null;
if (isConfigured()) {
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  });
}

// Sube un buffer en memoria (no pasa por disco en ningún momento) y devuelve
// { url, fileId }. url es la URL https permanente para guardar en la base;
// fileId hace falta para poder borrar la imagen más adelante.
async function uploadImage(buffer, originalName) {
  const folder = process.env.IMAGEKIT_FOLDER || 'catalogo';
  const fileName = Date.now() + '-' + (originalName || 'imagen');
  const result = await imagekit.upload({ file: buffer, fileName: fileName, folder: folder });
  return { url: result.url, fileId: result.fileId };
}

// Best-effort: si falla el borrado en ImageKit, no debe romper el borrado
// de la fila en la base (el que llama a esto ya decide qué hacer con la
// fila; acá solo se intenta no dejar el archivo huérfano consumiendo cuota).
async function deleteImage(fileId) {
  if (!fileId) return;
  try {
    await imagekit.deleteFile(fileId);
  } catch (err) {
    console.error('No se pudo borrar la imagen de ImageKit (fileId=' + fileId + '):', err.message);
  }
}

module.exports = { isConfigured, uploadImage, deleteImage };
