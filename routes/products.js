const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const multer  = require('multer');
const path    = require('path');
const { authenticateToken } = require('../middleware/auth');
const { validateProduct, sanitizeOrder } = require('../middleware/validate');
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

    const ORDER_MAP = {
      'az':          'ORDER BY name ASC',
      'za':          'ORDER BY name DESC',
      'precio-asc':  'ORDER BY price ASC',
      'precio-desc': 'ORDER BY price DESC'
    };
    const orderKey = sanitizeOrder(order);
    const orderClause = ORDER_MAP[orderKey] || 'ORDER BY created_at DESC';

    const pageNum   = parseInt(page)  || 1;
    const limitNum  = parseInt(limit) || 24;
    const offset    = (pageNum - 1) * limitNum;

    const dataQuery =
      'SELECT id, name, price, category, subcategoria, brand, image, description, whatsapp, en_oferta, precio_oferta, en_stock, destacado, en_promocion, fecha_fin_promo, stock_cantidad, stock_minimo, created_at FROM productos ' + where + ' ' +
      orderClause +
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
      'SELECT id, name, price, category, subcategoria, brand, image, whatsapp, en_oferta, precio_oferta, en_stock, destacado FROM productos WHERE destacado = true AND en_stock = true ORDER BY created_at DESC'
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
      'SELECT id, name, price, category, subcategoria, brand, image, whatsapp, en_oferta, precio_oferta, en_stock, destacado FROM productos WHERE en_promocion = true AND en_stock = true AND (fecha_fin_promo IS NULL OR fecha_fin_promo > NOW()) ORDER BY created_at DESC'
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
    } catch (e) {
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

// Multer config
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function(req, file, cb) {
    const ext      = path.extname(file.originalname);
    const filename = Date.now() + ext;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
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
    const id  = Number(req.params.id);
    const url = '/uploads/' + req.file.filename;
    const result = await pool.query(
      'INSERT INTO producto_imagenes (producto_id, url, orden) VALUES ($1, $2, $3) RETURNING *',
      [id, url, 0]
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
    await pool.query('DELETE FROM producto_imagenes WHERE id=$1', [imageId]);
    res.json({ message: 'Imagen eliminada' });
  } catch (err) {
    next(err);
  }
});

// --- Batch: Recepción de mercadería ---
const batchLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

router.post('/batch-stock', authenticateToken, batchLimiter, async function(req, res, next) {
  try {
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
