function errorHandler(err, req, res, _next) {
  console.error('[' + new Date().toISOString() + ']', err.message);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'El recurso ya existe' });
  }

  if (err.message === 'Solo se permiten imágenes') {
    return res.status(400).json({ error: 'Tipo de archivo no permitido' });
  }

  // Archivo más pesado que el límite de multer. Antes caía en el 500 genérico
  // y la persona veía "Error interno del servidor" sin saber que el problema
  // era el peso de la foto — el caso más común, porque una cámara de celular
  // de 12 MP genera archivos de 6 a 12 MB. El panel ahora las comprime antes
  // de subirlas (ver admin/comprimir.js); esto es el respaldo por si alguna
  // pasa igual, y el mensaje tiene que decir qué hacer.
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'La foto es muy pesada. Probá con una imagen más liviana o sacala con menos resolución.'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Se envió un archivo inesperado' });
  }

  res.status(err.status || 500).json({
    error: err.status === 400 ? err.message : 'Error interno del servidor'
  });
}

module.exports = { errorHandler };
