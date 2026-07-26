function errorHandler(err, req, res, _next) {
  console.error('[' + new Date().toISOString() + ']', err.message);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'El recurso ya existe' });
  }

  // Errores de multer al subir el logo (tamaño/formato) — sin esto caen en el
  // 500 genérico de abajo y el admin no se entera de qué estuvo mal.
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El archivo es demasiado pesado (máximo 300KB)' });
  }
  if (err.message === 'Formato no soportado (usá PNG, JPEG, WEBP o SVG)') {
    return res.status(400).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    error: err.status === 400 ? err.message : 'Error interno del servidor'
  });
}

module.exports = { errorHandler };
