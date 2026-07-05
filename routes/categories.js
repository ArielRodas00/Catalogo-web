const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// GET /api/categories
router.get('/', async function(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category, subcategoria FROM productos ORDER BY category, subcategoria'
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

module.exports = router;
