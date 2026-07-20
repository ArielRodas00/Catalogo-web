const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { sanitizePeriod } = require('../middleware/validate');
const rateLimit = require('express-rate-limit');

const metricsLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

function buildDateFilter(columnRef, period) {
  switch (period) {
    case '7d':  return "AND " + columnRef + " > NOW() - INTERVAL '7 days'";
    case '30d': return "AND " + columnRef + " > NOW() - INTERVAL '30 days'";
    case '90d': return "AND " + columnRef + " > NOW() - INTERVAL '90 days'";
    case 'all': return '';
    default:    return "AND " + columnRef + " > NOW() - INTERVAL '30 days'";
  }
}

// POST /api/metrics/view/:id
router.post('/view/:id', metricsLimiter, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    await pool.query(
      'INSERT INTO producto_vistas (producto_id) VALUES ($1)',
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/metrics/whatsapp/:id
router.post('/whatsapp/:id', metricsLimiter, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    await pool.query(
      'INSERT INTO whatsapp_clicks (producto_id) VALUES ($1)',
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/metrics/search
router.post('/search', metricsLimiter, async function(req, res, next) {
  try {
    const { termino } = req.body;
    if (!termino || termino.trim().length < 2) {
      return res.json({ ok: true });
    }
    await pool.query(
      'INSERT INTO busquedas (termino) VALUES ($1)',
      [termino.trim().toLowerCase()]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/metrics/dashboard (protegido)
router.get('/dashboard', authenticateToken, async function(req, res, next) {
  try {
    const rawPeriod = req.query.period;
    const period = sanitizePeriod(rawPeriod);

    const dateFilter = buildDateFilter('fecha', period);
    const dateJoinFilter = buildDateFilter('v.fecha', period);
    const dateJoinClicks = buildDateFilter('c.fecha', period);

    const [totalVistas, totalClicks, totalBusquedas, topVistas, topClicks, topBusquedas] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM producto_vistas WHERE 1=1 ' + dateFilter),
      pool.query('SELECT COUNT(*) FROM whatsapp_clicks WHERE 1=1 ' + dateFilter),
      pool.query('SELECT COUNT(*) FROM busquedas WHERE 1=1 ' + dateFilter),
      pool.query('SELECT p.id, p.name, p.image, COUNT(v.id) as vistas FROM productos p LEFT JOIN producto_vistas v ON p.id = v.producto_id ' + (dateJoinFilter || '') + ' GROUP BY p.id, p.name, p.image ORDER BY vistas DESC LIMIT 10'),
      pool.query('SELECT p.id, p.name, p.image, COUNT(c.id) as clicks FROM productos p LEFT JOIN whatsapp_clicks c ON p.id = c.producto_id ' + (dateJoinClicks || '') + ' GROUP BY p.id, p.name, p.image ORDER BY clicks DESC LIMIT 10'),
      pool.query('SELECT termino, COUNT(*) as cantidad FROM busquedas WHERE 1=1 ' + dateFilter + ' GROUP BY termino ORDER BY cantidad DESC LIMIT 10')
    ]);

    res.json({
      totales: {
        vistas:    parseInt(totalVistas.rows[0].count),
        clicks:    parseInt(totalClicks.rows[0].count),
        busquedas: parseInt(totalBusquedas.rows[0].count)
      },
      topVistas:    topVistas.rows,
      topClicks:    topClicks.rows,
      topBusquedas: topBusquedas.rows
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
