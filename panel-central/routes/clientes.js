const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const multer  = require('multer');
const pool    = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { validateCliente, validatePago } = require('../middleware/validate');

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Todas las rutas de clientes son solo para el super-admin logueado
router.use(authenticateToken);

// GET /api/clientes — sin el blob de logo_image_data (puede ser pesado y acá
// solo hace falta para armar la tabla, no para editar)
router.get('/', async function(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, nombre, slug, plan, estado, deploy_url, fecha_proximo_cobro, notas,
              logo_type, created_at, updated_at
       FROM clientes ORDER BY nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/clientes/:id — trae todo, incluida la marca, para el modal de edición
router.get('/:id', async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const result = await pool.query(
      `SELECT id, nombre, slug, plan, estado, api_key, deploy_url, fecha_proximo_cobro, notas,
              logo_type, store_name, store_name_accent, logo_image_data, logo_image_mime,
              favicon_url, color_primary, color_primary_hover, color_accent,
              created_at, updated_at
       FROM clientes WHERE id=$1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes — alta de cliente nuevo (genera su api_key)
router.post('/', validateCliente, async function(req, res, next) {
  try {
    const {
      nombre, slug, plan, deploy_url, fecha_proximo_cobro, notas,
      store_name, store_name_accent, favicon_url,
      color_primary, color_primary_hover, color_accent
    } = req.body;
    const apiKey = generateApiKey();

    const result = await pool.query(
      `INSERT INTO clientes (
         nombre, slug, plan, api_key, deploy_url, fecha_proximo_cobro, notas,
         store_name, store_name_accent, favicon_url,
         color_primary, color_primary_hover, color_accent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, nombre, slug, plan, estado, api_key, deploy_url, fecha_proximo_cobro, notas,
                 logo_type, store_name, store_name_accent, favicon_url,
                 color_primary, color_primary_hover, color_accent, created_at`,
      [
        nombre, slug, plan || 'basico', apiKey, deploy_url || null, fecha_proximo_cobro || null, notas || null,
        store_name || null, store_name_accent || null, favicon_url || null,
        color_primary || null, color_primary_hover || null, color_accent || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/clientes/:id — edición parcial (plan, estado, notas, etc.)
router.put('/:id', validateCliente, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const body = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMap = {
      nombre: 'nombre',
      slug: 'slug',
      plan: 'plan',
      estado: 'estado',
      deploy_url: 'deploy_url',
      fecha_proximo_cobro: 'fecha_proximo_cobro',
      notas: 'notas',
      store_name: 'store_name',
      store_name_accent: 'store_name_accent',
      favicon_url: 'favicon_url',
      color_primary: 'color_primary',
      color_primary_hover: 'color_primary_hover',
      color_accent: 'color_accent'
    };

    Object.keys(fieldMap).forEach(function(key) {
      if (body[key] !== undefined) {
        fields.push(fieldMap[key] + '=$' + paramCount);
        values.push(body[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    fields.push('updated_at=NOW()');
    values.push(id);

    const result = await pool.query(
      'UPDATE clientes SET ' + fields.join(', ') + ' WHERE id=$' + paramCount +
      ' RETURNING id, nombre, slug, plan, estado, deploy_url, fecha_proximo_cobro, notas,' +
      ' logo_type, store_name, store_name_accent, favicon_url,' +
      ' color_primary, color_primary_hover, color_accent, updated_at',
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes/:id/regenerar-api-key — por si la key se filtró
router.post('/:id/regenerar-api-key', async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const apiKey = generateApiKey();
    const result = await pool.query(
      'UPDATE clientes SET api_key=$1, updated_at=NOW() WHERE id=$2 RETURNING id, api_key',
      [apiKey, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// --- Logo como imagen (opcional — alternativa al logo de texto) ---
// Se guarda en la propia base del Panel Central (Postgres/Neon, persistente)
// en vez de en disco: el filesystem de Render es efímero (se borra en cada
// redeploy, ver AUDITORIA.md), así que un logo de cliente en disco desaparecería
// tarde o temprano. Migrar a Cloudinary/S3 quedó pospuesto (ver AUDITORIA.md),
// pero como estas imágenes son chicas (logos, no fotos de producto), guardarlas
// como base64 en una columna evita esa dependencia sin reabrir esa decisión.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = /^image\/(png|jpeg|webp|svg\+xml)$/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato no soportado (usá PNG, JPEG, WEBP o SVG)'));
    }
  }
});

// POST /api/clientes/:id/logo — sube/reemplaza el logo como imagen
router.post('/:id/logo', logoUpload.single('logo'), async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió el archivo (campo "logo")' });

    const base64 = req.file.buffer.toString('base64');
    const result = await pool.query(
      `UPDATE clientes
       SET logo_type='imagen', logo_image_data=$1, logo_image_mime=$2, updated_at=NOW()
       WHERE id=$3
       RETURNING id, logo_type, logo_image_mime`,
      [base64, req.file.mimetype, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clientes/:id/logo — vuelve al logo de texto (nombre/acento)
router.delete('/:id/logo', async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const result = await pool.query(
      `UPDATE clientes
       SET logo_type='texto', logo_image_data=NULL, logo_image_mime=NULL, updated_at=NOW()
       WHERE id=$1
       RETURNING id, logo_type`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    await pool.query('DELETE FROM clientes WHERE id=$1', [id]);
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (err) {
    next(err);
  }
});

// --- Pagos (registro manual — sin pasarela, se verifica por transferencia) ---

// GET /api/clientes/:id/pagos
router.get('/:id/pagos', async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const result = await pool.query(
      'SELECT id, monto, moneda, metodo, notas, fecha FROM pagos WHERE cliente_id=$1 ORDER BY fecha DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/clientes/:id/pagos — registrás manualmente un pago (ej. transferencia confirmada)
router.post('/:id/pagos', validatePago, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const { monto, moneda, metodo, notas } = req.body;

    const cliente = await pool.query('SELECT id FROM clientes WHERE id=$1', [id]);
    if (cliente.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const result = await pool.query(
      `INSERT INTO pagos (cliente_id, monto, moneda, metodo, notas)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, monto, moneda, metodo, notas, fecha`,
      [id, monto, moneda || 'PYG', metodo || 'transferencia', notas || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
