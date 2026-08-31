const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const multer  = require('multer');
const path    = require('path');
const { authenticateToken } = require('../middleware/auth');
const { validateProduct, sanitizeOrder } = require('../middleware/validate');
const { getLicense } = require('../licenseCheck');
const imageStorage = require('../imagekit');
const importar = require('../importar');
const auditoria = require('../auditoria');
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
      image, image_imagekit_file_id, description, whatsapp,
      en_oferta, precio_oferta, en_stock,
      destacado, en_promocion, fecha_fin_promo,
      stock_cantidad, stock_minimo
    } = req.body;

    const result = await pool.query(
      `INSERT INTO productos
        (name, price, category, subcategoria, brand,
         image, image_imagekit_file_id, description, whatsapp,
         en_oferta, precio_oferta, en_stock,
         destacado, en_promocion, fecha_fin_promo,
         stock_cantidad, stock_minimo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        name, price, category, subcategoria || '', brand || '',
        image, image_imagekit_file_id || null, description, whatsapp,
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
      image_imagekit_file_id: 'image_imagekit_file_id',
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
    // imagekit_file_id es opcional y de uso interno: lo manda el propio
    // frontend cuando esta "URL" en realidad es un archivo que ya se subió a
    // ImageKit vía POST /upload-image (galería unificada, ver
    // AUDITORIA.md) — así se puede borrar el archivo real más adelante. Si
    // es una URL externa de verdad (pegada a mano), queda null como siempre.
    const { url, imagekit_file_id } = req.body;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (_e) {
      return res.status(400).json({ error: 'URL inválida' });
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'La URL debe ser http o https' });
    }

    // orden se calcula siempre acá (nunca se toma del body): hardcodearlo en
    // 0 hacía que la segunda imagen de un mismo producto chocara con la
    // restricción UNIQUE (producto_id, orden) — bug real, ver AUDITORIA.md.
    const result = await pool.query(
      `INSERT INTO producto_imagenes (producto_id, url, orden, imagekit_file_id)
       VALUES ($1, $2, (SELECT COALESCE(MAX(orden), -1) + 1 FROM producto_imagenes WHERE producto_id = $1), $3)
       RETURNING *`,
      [id, url, imagekit_file_id || null]
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

// POST /api/products/upload-image — sube un archivo y devuelve su URL + file_id,
// sin asociarlo a ningún producto todavía. Existe para la imagen PRINCIPAL: a
// diferencia de las imágenes adicionales (producto_imagenes), la principal es
// un campo suelto (productos.image) que hace falta poder completar por archivo
// tanto al crear un producto (todavía sin id) como al editarlo.
router.post('/upload-image', apiLimiter, authenticateToken, upload.single('image'), async function(req, res, next) {
  try {
    if (!imageStorage.isConfigured()) {
      return res.status(503).json({
        error: 'Subida de imágenes no configurada (faltan las variables IMAGEKIT_* — ver README.md)'
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió el archivo' });
    }

    const { url, fileId } = await imageStorage.uploadImage(req.file.buffer, req.file.originalname);
    res.status(201).json({ url: url, fileId: fileId });
  } catch (err) {
    next(err);
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
    // orden se calcula siempre acá — hardcodearlo en 0 hacía que la segunda
    // imagen de un mismo producto chocara con la restricción UNIQUE
    // (producto_id, orden) — bug real, ver AUDITORIA.md.
    const result = await pool.query(
      `INSERT INTO producto_imagenes (producto_id, url, orden, imagekit_file_id)
       VALUES ($1, $2, (SELECT COALESCE(MAX(orden), -1) + 1 FROM producto_imagenes WHERE producto_id = $1), $3)
       RETURNING *`,
      [id, url, fileId]
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

// PUT /api/products/:id/images/reorder — galería unificada (principal +
// adicionales en un solo orden, ver AUDITORIA.md). El primer elemento del
// array pasa a ser la imagen principal (productos.image); el resto es la
// galería (producto_imagenes), en ese orden.
//
// Body: { images: [{ url, fileId }, ...] } — en el orden final deseado.
//
// La galería se reconstruye entera (se borra y se vuelve a insertar) en vez
// de actualizar el "orden" fila por fila: actualizar de a una corre el
// riesgo de chocar momentáneamente con la restricción UNIQUE
// (producto_id, orden) de otra fila que todavía no se movió (mismo tipo de
// bug que ya se corrigió en POST .../images/url — ver AUDITORIA.md).
router.put('/:id/images/reorder', apiLimiter, authenticateToken, async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { images } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Se requiere "images" (array) con al menos 1 imagen' });
    }
    for (const img of images) {
      if (!img || typeof img.url !== 'string' || !img.url) {
        return res.status(400).json({ error: 'Cada imagen necesita una url' });
      }
    }

    const [newMain, ...gallery] = images;

    const client = await pool.connect();
    let notFound = false;
    let orphanedFileIds = [];
    try {
      await client.query('BEGIN');

      const oldProductRes = await client.query(
        'SELECT image_imagekit_file_id FROM productos WHERE id=$1',
        [id]
      );
      if (oldProductRes.rows.length === 0) {
        notFound = true;
        await client.query('ROLLBACK');
      } else {
        // file_id que había antes (principal + galería) — lo que no aparezca
        // en la lista nueva se borra de ImageKit después de confirmar (si no,
        // quedaría huérfano consumiendo cuota — igual que ya hace el borrado
        // individual de una imagen).
        const oldGalleryRes = await client.query(
          'SELECT imagekit_file_id FROM producto_imagenes WHERE producto_id=$1',
          [id]
        );
        const oldFileIds = [oldProductRes.rows[0].image_imagekit_file_id]
          .concat(oldGalleryRes.rows.map(function(r) { return r.imagekit_file_id; }))
          .filter(Boolean);
        const newFileIds = new Set(images.map(function(i) { return i.fileId; }).filter(Boolean));
        orphanedFileIds = oldFileIds.filter(function(fid) { return !newFileIds.has(fid); });

        const productResult = await client.query(
          'UPDATE productos SET image=$1, image_imagekit_file_id=$2 WHERE id=$3 RETURNING *',
          [newMain.url, newMain.fileId || null, id]
        );

        await client.query('DELETE FROM producto_imagenes WHERE producto_id=$1', [id]);
        for (let i = 0; i < gallery.length; i++) {
          await client.query(
            'INSERT INTO producto_imagenes (producto_id, url, orden, imagekit_file_id) VALUES ($1,$2,$3,$4)',
            [id, gallery[i].url, i, gallery[i].fileId || null]
          );
        }
        await client.query('COMMIT');
        res.json(productResult.rows[0]);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    if (notFound) return res.status(404).json({ error: 'Producto no encontrado' });

    // Fuera de la transacción a propósito: no debe demorar ni romper la
    // respuesta si ImageKit tarda o falla (best-effort, igual que el borrado
    // individual de una imagen).
    for (const fid of orphanedFileIds) {
      await imageStorage.deleteImage(fid);
    }
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

// ============================================================
// Importación masiva desde CSV — ver importar.js
// ============================================================
// Cargar 150 repuestos de a uno por el formulario son horas de trabajo, y es
// lo primero que necesita un local con un catálogo real. Estos locales llevan
// el stock en papel, así que el archivo se arma a mano en Excel: el
// importador es deliberadamente tolerante con el formato.

// Multer aparte del de imágenes: acá el archivo es texto y chico, así que el
// límite es mucho menor. 2 MB alcanzan para varios miles de filas.
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || ext === '.txt' || file.mimetype === 'text/csv') cb(null, true);
    else cb(new Error('El archivo tiene que ser un CSV. Desde Excel: Archivo → Guardar como → CSV.'));
  }
});

// GET /api/products/import/plantilla — archivo de ejemplo para descargar.
// Sin esto, la primera pregunta siempre es "¿y qué columnas tiene que tener?".
router.get('/import/plantilla', authenticateToken, function(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.csv"');
  // El BOM hace que Excel abra el archivo con los acentos correctos.
  res.send('﻿' + importar.plantillaCsv());
});

// POST /api/products/import/preview — valida SIN escribir nada.
// Separado del import real a propósito: quien carga 150 productos tiene que
// poder ver qué va a entrar y qué filas están mal ANTES de tocar la base.
router.post('/import/preview', apiLimiter, authenticateToken, uploadCsv.single('archivo'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo CSV' });

  const analisis = importar.analizar(req.file.buffer.toString('utf8'), {
    whatsappPorDefecto: req.body.whatsapp
  });

  res.json({
    totalFilas: analisis.totalFilas,
    validos: analisis.validos.length,
    errores: analisis.errores,
    // Solo una muestra: con 150 productos, devolverlos todos sería un JSON
    // enorme para una vista previa que nadie lee entera.
    muestra: analisis.validos.slice(0, 10).map(function(v) { return v.producto; })
  });
});

// POST /api/products/import — inserta de verdad.
router.post('/import', batchLimiter, authenticateToken, uploadCsv.single('archivo'), async function(req, res, next) {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo CSV' });

  const analisis = importar.analizar(req.file.buffer.toString('utf8'), {
    whatsappPorDefecto: req.body.whatsapp
  });

  if (analisis.validos.length === 0) {
    return res.status(400).json({
      error: 'No hay ninguna fila válida para importar',
      errores: analisis.errores
    });
  }

  const client = await pool.connect();
  try {
    // Todo o nada: si algo falla a mitad de camino, un catálogo a medio cargar
    // es peor que uno vacío, porque hay que averiguar qué entró y qué no.
    await client.query('BEGIN');

    // Los nombres que ya existen se saltean en vez de duplicarse: reimportar
    // el mismo archivo (corregido, por ejemplo) no debe llenar el catálogo de
    // repetidos.
    const existentes = await client.query('SELECT LOWER(name) AS name FROM productos');
    const yaEstan = new Set(existentes.rows.map(function(r) { return r.name; }));

    const creados = [];
    const salteados = [];

    for (const item of analisis.validos) {
      const p = item.producto;
      if (yaEstan.has(p.name.toLowerCase())) {
        salteados.push({ fila: item.fila, nombre: p.name, motivo: 'ya existe en el catálogo' });
        continue;
      }
      const r = await client.query(
        `INSERT INTO productos
          (name, price, category, subcategoria, brand, image, description, whatsapp,
           en_oferta, precio_oferta, en_stock, destacado, stock_cantidad, stock_minimo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, name`,
        [p.name, p.price, p.category, p.subcategoria, p.brand, p.image, p.description,
         p.whatsapp, p.en_oferta, p.precio_oferta, p.en_stock, p.destacado,
         p.stock_cantidad, p.stock_minimo]
      );
      creados.push(r.rows[0]);
      yaEstan.add(p.name.toLowerCase());
    }

    await client.query('COMMIT');

    auditoria.registrar(req, 'importacion', 'productos', null,
      creados.length + ' creados, ' + salteados.length + ' salteados, ' + analisis.errores.length + ' con error');

    res.status(201).json({
      creados: creados.length,
      salteados: salteados,
      errores: analisis.errores,
      totalFilas: analisis.totalFilas
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
