const express = require('express');
const router  = express.Router();
const { authenticateApiKey } = require('../middleware/apiKeyAuth');

// GET /api/licencia — la consulta el catálogo de CADA cliente (no un humano),
// autenticado con su propio X-API-Key. Devuelve si sigue activo y su plan,
// para que ese catálogo decida qué features mostrar.
router.get('/', authenticateApiKey, function(req, res) {
  const cliente = req.cliente;
  res.json({
    activo: cliente.estado === 'activo',
    plan: cliente.plan,
    estado: cliente.estado
  });
});

module.exports = router;
