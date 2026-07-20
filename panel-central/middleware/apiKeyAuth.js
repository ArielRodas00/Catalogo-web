// ============================================================
// apiKeyAuth.js — Autenticación de servicio a servicio.
// La usa el catálogo de CADA cliente para consultar su propia licencia
// (GET /api/licencia), no es para usuarios humanos (eso es auth.js/JWT).
// ============================================================

const pool = require('../db');

async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key requerida (header X-API-Key)' });
  }

  try {
    const result = await pool.query(
      'SELECT id, nombre, slug, plan, estado FROM clientes WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'API key inválida' });
    }

    req.cliente = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticateApiKey };
