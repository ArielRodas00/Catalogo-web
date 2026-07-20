function errorHandler(err, req, res, _next) {
  console.error('[' + new Date().toISOString() + ']', err.message);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'El recurso ya existe' });
  }

  res.status(err.status || 500).json({
    error: err.status === 400 ? err.message : 'Error interno del servidor'
  });
}

module.exports = { errorHandler };
