const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// GET /api/categories
router.get('/', async function(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category, subcategoria FROM productos ORDER BY category, subcategoria LIMIT 100'
    );

    const grouped = {};
    result.rows.forEach(function(row) {
      if (!grouped[row.category]) {
        grouped[row.category] = [];
      }
      if (row.subcategoria && row.subcategoria.trim() !== '') {
        grouped[row.category].push(row.subcategoria);
      }
    });

    res.json(grouped);
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/resumen
// Alimenta el mosaico de categorías de la portada: por cada categoría, cuántos
// productos tiene y una imagen representativa. Va aparte de GET / a propósito:
// esa ruta devuelve {categoria: [subcategorias]} y la consumen los filtros en
// tres lugares, así que cambiarle la forma los rompería.
//
// DISTINCT ON (category) se queda con la primera fila de cada categoría según
// el ORDER BY; el COUNT(*) OVER se calcula antes del DISTINCT, así que da el
// total real de la categoría y no 1. El ORDER BY elige como representante un
// producto que tenga imagen, esté en stock y sea destacado, en ese orden.
router.get('/resumen', async function(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (category)
         category,
         COUNT(*) OVER (PARTITION BY category)::int AS cantidad,
         image
       FROM productos
       WHERE category IS NOT NULL AND btrim(category) <> ''
       ORDER BY category,
                (image IS NULL OR btrim(image) = '') ASC,
                en_stock DESC,
                destacado DESC,
                created_at DESC
       LIMIT 50`
    );

    res.json(result.rows.map(function(row) {
      return {
        category: row.category,
        cantidad: row.cantidad,
        image: row.image || null
      };
    }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
