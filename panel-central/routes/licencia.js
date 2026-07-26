const express = require('express');
const router  = express.Router();
const { authenticateApiKey } = require('../middleware/apiKeyAuth');

// GET /api/licencia — la consulta el catálogo de CADA cliente (no un humano),
// autenticado con su propio X-API-Key. Devuelve si sigue activo y su plan
// (para decidir qué features mostrar) y su marca (para pisar los defaults del
// catálogo — ver AUDITORIA.md, "Branding desde el Panel Central"). Todos los
// campos de "branding" van con null cuando no están cargados, así el catálogo
// sabe que tiene que usar su propio default en vez de ese campo puntual.
router.get('/', authenticateApiKey, function(req, res) {
  const cliente = req.cliente;
  res.json({
    activo: cliente.estado === 'activo',
    plan: cliente.plan,
    estado: cliente.estado,
    branding: {
      logoType: cliente.logo_type,
      storeName: cliente.store_name || null,
      storeNameAccent: cliente.store_name_accent !== null && cliente.store_name_accent !== undefined
        ? cliente.store_name_accent
        : null,
      logoImageDataUri: cliente.logo_image_data
        ? 'data:' + cliente.logo_image_mime + ';base64,' + cliente.logo_image_data
        : null,
      faviconUrl: cliente.favicon_url || null,
      colorPrimary: cliente.color_primary || null,
      colorPrimaryHover: cliente.color_primary_hover || null,
      colorAccent: cliente.color_accent || null
    }
  });
});

module.exports = router;
