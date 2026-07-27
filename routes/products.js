const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const multer  = require('multer');
const path    = require('path');
const { authenticateToken } = require('../middleware/auth');
const { validateProduct, sanitizeOrder } = require('../middleware/validate');
const { getLicense } = require('../licenseCheck');
const imageStorage = require('../imagekit');
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes. Intentalo de nuevo en 15 minutos.' }
});

const getLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

// GET /api/products — listar con filtros
router.get('/', getLimiter, async function(req, res, next) {
  try {
    const {
      category, brand, subcategoria, search,
      order, page, limit, en_stock, en_oferta, destacado
    } = req.query;

    const conditions = [];
    const values     = [];
    let   paramCount = 1;

    // Filtros multi-seleccion: soportar arrays separados por coma
    if (category && category !== 'all' && category !== 'todos') {
      const cats = category.split(',');
      const placeholders = cats.map(function(_, i) { return '$' + (paramCount + i); }).join(',');
      conditions.push('category IN (' + placeholders + ')');
      values.push.apply(values, cats);
      paramCount += cats.length;
    }

    if (subcategoria && subcategoria !== 'all') {
      const subs = subcategoria.split(',');
      const placeholders = subs.map(function(_, i) { return '$' + (paramCount + i); }).join(',');
      conditions.push('subcategoria IN (' + placeholders + ')');
      values.push.apply(values, subs);
      paramCount += subs.length;
    }

    if (brand && brand !== 'all') {
      const brands = brand.split(',');
      const placeholders = brands.map(function(_, i) { return '$' + (paramCount + i); }).join(',');
      conditions.push('brand IN (' + placeholders + ')');
      values.push.apply(values, brands);
      paramCount += brands.length;
    }

    if (en_stock === 'true') {
      conditions.push('en_stock = true');
    }

    if (en_oferta === 'true') {
      conditions.push('en_oferta = true');
    }

    if (destacado === 'true') {
      conditions.push('destacado = true');
    }

    if (search && search.trim() !== '') {
      conditions.push(
        '(name ILIKE $' + paramCount +
        ' OR description ILIKE $' + paramCount +
        ' OR brand ILIKE $' + paramCount + ')'
      );
      values.push('%' + search.trim() + '%');
      paramCount++;
    }

    const where = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // Los productos sin stock siempre van al final, sea cual sea el orden elegido.
    const ORDER_MAP = {
      'az':          'ORDER BY en_stock DESC, name ASC',
      'za':          'ORDER BY en_stock DESC, name DESC',
      'precio-asc':  'ORDER BY en_stock DESC, price ASC',
      'precio-desc': 'ORDER BY en_stock DESC, price DESC'
    };
    const orderKey = sanitizeOrder(order);

    // Validar que orderClause sea seguro antes de concatenar
    const safeOrderClause = ORDER_MAP[orderKey] || 'ORDER BY en_stock DESC, created_at DESC';
    if (!safeOrderClause.match(/^ORDER BY en_stock DESC, (created_at|name|price)\s+(DESC|ASC)$/i)) {
      return res.status(400).json({ error: 'Orden inválido' });
    }

    const pageNum   = parseInt(page)  || 1;
    const limitNum  = parseInt(limit) || 24;
    const offset    = (pageNum - 1) * limitNum;

    const dataQuery =
      'SELECT id, name, price, category, subcategoria, brand, image, description, whatsapp, en_oferta, precio_oferta, en_stock, destacado, en_promocion, fecha_fin_promo, stock_cantidad, stock_minimo, created_at FROM productos ' + where + ' ' +
      safeOrderClause +
      ' LIMIT $' + paramCount +
      ' OFFSET $' + (paramCount + 1);

    values.push(limitNum, offset);

    const countQuery = 'SELECT COUNT(*) FROM productos ' + where;
    // countValues: valores de filtros sin limit/offset
    const countValues = values.slice(0, values.length - 2);

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, values),
      pool.query(countQuery, countValues)
    ]);

    res.json({
      products:   dataResult.rows,
      total:      parseInt(countResult.rows[0].count),
      page:       pageNum,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum)
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/products/destacados
router.get('/destacados', getLimiter, async function(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, name, price, category, subcategoria, brand, image, whatsapp, en_oferta, precio_oferta, en_stock, destacado FROM productos WHERE destacado = true AND en_stock = true ORDER BY created_at DESC LIMIT 12'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/promociones
router.get('/promociones', getLimiter, async function(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, name, price, category, subcategoria, brand, image, whatsapp, en_oferta, precio_oferta, en_stock, destacado FROM productos WHERE en_promocion = true AND en_stock = true AND (fecha_fin_promo IS NULL OR fecha_fin_promo > NOW()) ORDER BY created_at DESC LIMIT 12'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — producto individual (DESPUÉS de rutas fijas)
router.get('/:id', getLimiter, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const result = await pool.query('SELECT id, name, price, category, subcategoria, brand, image, description, whatsapp, en_oferta, precio_oferta, en_stock, destacado, en_promocion, fecha_fin_promo, stock_cantidad, stock_minimo, created_at FROM productos WHERE id=$1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/products — crear (protegido)
router.post('/', apiLimiter, authenticateToken, validateProduct, async function(req, res, next) {
  try {
    const {
      name, price, category, subcategoria, brand,
      image, description, whatsapp,
      en_oferta, precio_oferta, en_stock,
      destacado, en_promocion, fecha_fin_promo,
      stock_cantidad, stock_minimo
    } = req.body;

    const result = await pool.query(
      `INSERT INTO productos 
        (name, price, category, subcategoria, brand,
         image, description, whatsapp,
         en_oferta, precio_oferta, en_stock,
         destacado, en_promocion, fecha_fin_promo,
         stock_cantidad, stock_minimo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        name, price, category, subcategoria || '', brand || '',
        image, description, whatsapp,
        en_oferta || false,
        precio_oferta || null,
        en_stock !== undefined ? en_stock : true,
        destacado || false,
        en_promocion || false,
        fecha_fin_promo || null,
        stock_cantidad || 0,
        stock_minimo || 5
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id — actualizar (protegido)
router.put('/:id', apiLimiter, authenticateToken, validateProduct, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    const body = req.body;

    // Construir UPDATE dinamico: solo campos presentes en el body
    const fields = [];
    const values = [];
    let paramCount = 1;

    const fieldMap = {
      name: 'name',
      price: 'price',
      category: 'category',
      subcategoria: 'subcategoria',
      brand: 'brand',
      image: 'image',
      description: 'description',
      whatsapp: 'whatsapp',
      en_oferta: 'en_oferta',
      precio_oferta: 'precio_oferta',
      en_stock: 'en_stock',
      destacado: 'destacado',
      en_promocion: 'en_promocion',
      fecha_fin_promo: 'fecha_fin_promo',
      stock_cantidad: 'stock_cantidad',
      stock_minimo: 'stock_minimo'
    };

    Object.keys(fieldMap).forEach(function(key) {
      if (body[key] !== undefined) {
        fields.push(fieldMap[key] + '=$' + paramCount);
        let val = body[key];
        if (key === 'subcategoria' || key === 'brand') val = val || '';
        if (key === 'precio_oferta' || key === 'fecha_fin_promo') val = val || null;
        if (key === 'en_oferta' || key === 'destacado' || key === 'en_promocion') val = val || false;
        if (key === 'stock_cantidad') val = val || 0;
        if (key === 'stock_minimo') val = val || 5;
        values.push(val);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(id);

    const result = await pool.query(
      'UPDATE productos SET ' + fields.join(', ') + ' WHERE id=$' + paramCount + ' RETURNING *',
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — eliminar (protegido)
router.delete('/:id', apiLimiter, authenticateToken, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM productos WHERE id=$1', [id]);
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (err) {
    next(err);
  }
});

// --- Imágenes ---

// GET /api/products/:id/images
router.get('/:id/images', getLimiter, async function(req, res, next) {
  try {
    const id     = Number(req.params.id);
    const result = await pool.query(
      'SELECT id, producto_id, url, orden FROM producto_imagenes WHERE producto_id=$1 ORDER BY orden',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/images/url (protegido)
router.post('/:id/images/url', apiLimiter, authenticateToken, async function(req, res, next) {
  try {
    const id    = Number(req.params.id);
    const { url, orden } = req.body;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (_e) {
      return res.status(400).json({ error: 'URL inválida' });
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'La URL debe ser http o https' });
    }

    const result = await pool.query(
      'INSERT INTO producto_imagenes (producto_id, url, orden) VALUES ($1, $2, $3) RETURNING *',
      [id, url, orden || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Multer en memoria (no en disco — el filesystem de Render es efímero, se
// borra en cada redeploy). El buffer va directo a ImageKit, nunca toca
// disco. Ver imagekit.js y AUDITORIA.md, "El problema de las imágenes".
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext     = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime    = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

// POST /api/products/:id/images/upload (protegido — auth ANTES de multer)
router.post('/:id/images/upload', apiLimiter, authenticateToken, upload.single('image'), async function(req, res, next) {
  try {
    if (!imageStorage.isConfigured()) {
      return res.status(503).json({
        error: 'Subida de imágenes no configurada (faltan las variables IMAGEKIT_* — ver README.md)'
      });
    }

    const id = Number(req.params.id);

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió el archivo' });
    }

    const { url, fileId } = await imageStorage.uploadImage(req.file.buffer, req.file.originalname);
    const result = await pool.query(
      'INSERT INTO producto_imagenes (producto_id, url, orden, imagekit_file_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, url, 0, fileId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/images/:imageId (protegido)
router.delete('/images/:imageId', apiLimiter, authenticateToken, async function(req, res, next) {
  try {
    const imageId = Number(req.params.imageId);
    const result = await pool.query(
      'DELETE FROM producto_imagenes WHERE id=$1 RETURNING imagekit_file_id',
      [imageId]
    );
    // Best-effort: si esta imagen se subió como archivo (tiene file_id), se
    // borra también de ImageKit para no dejarla huérfana consumiendo cuota.
    // Si se cargó por URL externa (POST .../images/url) no hay nada que
    // borrar ahí.
    if (result.rows.length > 0 && result.rows[0].imagekit_file_id) {
      await imageStorage.deleteImage(result.rows[0].imagekit_file_id);
    }
    res.json({ message: 'Imagen eliminada' });
  } catch (err) {
    next(err);
  }
});

// --- Batch: Recepción de mercadería ---
const batchLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

router.post('/batch-stock', authenticateToken, batchLimiter, async function(req, res, next) {
  try {
    const license = getLicense();
    if (license.plan !== 'premium' || !license.activo) {
      return res.status(403).json({
        error: 'La recepción de mercadería por lote es una función del plan Premium.',
        plan: license.plan,
        activo: license.activo
      });
    }

    const items = req.body.items;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de items' });
    }
    
    if (items.length > 50) {
      return res.status(400).json({ error: 'Máximo 50 productos por lote' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const item of items) {
        const id = Number(item.id);
        const quantity = Number(item.quantity);
        
        if (isNaN(id) || isNaN(quantity) || quantity < 0) {
          throw new Error('Datos inválidos para el producto ID: ' + item.id);
        }
        
        const result = await client.query(
          'UPDATE productos SET stock_cantidad = stock_cantidad + $1, en_stock = true WHERE id = $2 RETURNING id, name, stock_cantidad',
          [quantity, id]
        );
        
        if (result.rows.length === 0) {
          throw new Error('Producto ID ' + id + ' no encontrado');
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ message: 'Stock actualizado correctamente', count: items.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
