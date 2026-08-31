// ============================================================
// admin/comprimir.js — Achica las fotos ANTES de subirlas
// ============================================================
// Pensado para el caso real: el dueño del local saca la foto del repuesto con
// el celular y la sube ahí mismo. Una cámara de 12 MP produce archivos de 6 a
// 12 MB, y el servidor rechaza todo lo que pase de 5 MB — antes con un
// "Error interno del servidor" que no le decía nada a nadie.
//
// Comprimir acá resuelve tres cosas a la vez:
//   1. La foto deja de superar el límite (una de 9 MB queda en ~400 KB).
//   2. Sube muchísimo más rápido con datos móviles, que es como va a trabajar.
//   3. Se gasta menos ancho de banda de ImageKit.
//
// Se hace en el navegador y no en el servidor a propósito: si se subiera
// entera para achicarla del otro lado, el problema de la subida lenta con
// datos móviles seguiría igual.
// ============================================================

// 1600px de lado mayor es de sobra para un catálogo: la foto se muestra en
// una tarjeta y, como mucho, en pantalla completa. Más resolución que eso es
// peso que nadie ve.
const MAX_LADO = 1600;
const CALIDAD = 0.85;

// Por debajo de esto no vale la pena recomprimir: se gana poco y se pierde
// calidad de una imagen que ya estaba bien.
const MINIMO_PARA_COMPRIMIR = 600 * 1024;

// ------------------------------------------------------------
// comprimirImagen(file) — devuelve un File más liviano
// ------------------------------------------------------------
// Ante cualquier problema devuelve el archivo original en vez de fallar: es
// preferible intentar subir la foto pesada (y que el servidor decida) a que
// la persona se quede sin poder cargar nada.
async function comprimirImagen(file) {
  try {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return file;

    // Los GIF pueden ser animados y el canvas se quedaría solo con el primer
    // cuadro, así que no se tocan.
    if (file.type === 'image/gif') return file;
    if (file.size < MINIMO_PARA_COMPRIMIR) return file;

    const bitmap = await crearBitmap(file);
    if (!bitmap) return file;

    let { width, height } = bitmap;
    if (width > MAX_LADO || height > MAX_LADO) {
      const escala = MAX_LADO / Math.max(width, height);
      width = Math.round(width * escala);
      height = Math.round(height * escala);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise(function(resolve) {
      canvas.toBlob(resolve, 'image/jpeg', CALIDAD);
    });
    if (!blob) return file;

    // Si comprimir no mejoró nada (pasa con imágenes ya optimizadas), se
    // queda la original.
    if (blob.size >= file.size) return file;

    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    return file;
  }
}

// createImageBitmap respeta la orientación EXIF, que importa: una foto sacada
// con el celular en vertical viene rotada en los metadatos, y dibujarla sin
// tener eso en cuenta la deja acostada. Si el navegador no lo soporta, se cae
// a <img>, que también aplica la orientación en los navegadores actuales.
async function crearBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      try { return await createImageBitmap(file); } catch (e2) { /* sigue abajo */ }
    }
  }
  return new Promise(function(resolve) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function() { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function() { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Para mostrarle a la persona cuánto se ahorró.
function pesoLegible(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}
