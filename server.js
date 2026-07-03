// ============================================================
// server.js — Servidor principal (Fase 2: con PostgreSQL)
// ============================================================

require('dotenv').config();
// Debe ser la primera línea para que las variables
// estén disponibles antes de que el resto del código las use

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const express = require('express');
const cors    = require('cors');
const pool    = require('./db');
// Importamos la conexión a PostgreSQL que creamos en db.js
// El ./ indica que es un archivo local (no un paquete de npm)

const app  = express();
const PORT = process.env.PORT || 3000;
// process.env.PORT lee el puerto del .env
// || 3000 es un valor por defecto si la variable no existe
// Útil cuando el servidor de producción define su propio PORT

// ------------------------------------------------------------
// MIDDLEWARES
// ------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ------------------------------------------------------------
// MIDDLEWARE DE AUTENTICACIÓN
// Verifica que el token JWT sea válido antes de permitir
// el acceso a las rutas protegidas del admin.
// ------------------------------------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // El token viene en el header: "Authorization: Bearer TOKEN"

  const token = authHeader && authHeader.split(' ')[1];
  // .split(' ')[1] extrae el token después de "Bearer "

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
    // 401 = Unauthorized
  }

  jwt.verify(token, process.env.JWT_SECRET, function(err, user) {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o vencido' });
      // 403 = Forbidden
    }
    req.user = user;
    // Guardamos los datos del admin en req.user
    next();
    // next() pasa al siguiente middleware o a la ruta
  });
}


// ------------------------------------------------------------
// RUTAS CRUD
// ------------------------------------------------------------

// GET — leer productos con filtros opcionales
// Acepta: ?category=&brand=&subcategoria=&search=&order=&page=&limit=&en_stock=&en_oferta=
app.get('/api/products', async function(req, res) {
  try {
    const {
      category, brand, subcategoria, search,
      order, page, limit, en_stock, en_oferta
    } = req.query;
    // req.query contiene los parámetros de la URL
    // ?category=cascos → req.query.category = "cascos"

    const conditions = [];
    // Array de condiciones SQL que vamos construyendo
    const values     = [];
    // Array de valores para los placeholders $1, $2...
    let   paramCount = 1;
    // Contador para los placeholders

    // --- Filtro por categoría ---
    if (category && category !== 'all' && category !== 'todos') {
      conditions.push('category = $' + paramCount);
      values.push(category);
      paramCount++;
    }

    // --- Filtro por subcategoría ---
    if (subcategoria && subcategoria !== 'all') {
      conditions.push('subcategoria = $' + paramCount);
      values.push(subcategoria);
      paramCount++;
    }

    // --- Filtro por marca ---
    if (brand && brand !== 'all') {
      conditions.push('brand = $' + paramCount);
      values.push(brand);
      paramCount++;
    }

    // --- Filtro por stock ---
    if (en_stock === 'true') {
      conditions.push('en_stock = true');
    }

    // --- Filtro por oferta ---
    if (en_oferta === 'true') {
      conditions.push('en_oferta = true');
    }

    // --- Búsqueda por nombre o descripción ---
    if (search && search.trim() !== '') {
      conditions.push(
        '(name ILIKE $' + paramCount +
        ' OR description ILIKE $' + paramCount +
        ' OR brand ILIKE $' + paramCount + ')'
      );
      // ILIKE = LIKE pero case-insensitive (ignora mayúsculas)
      // % antes y después = contiene el texto en cualquier posición
      values.push('%' + search.trim() + '%');
      paramCount++;
    }

    // --- Construimos el WHERE ---
    const where = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';
    // Si no hay condiciones, no agregamos WHERE

    // --- Ordenamiento ---
    let orderClause = 'ORDER BY created_at DESC';
    if (order === 'az')          orderClause = 'ORDER BY name ASC';
    if (order === 'za')          orderClause = 'ORDER BY name DESC';
    if (order === 'precio-asc')  orderClause = 'ORDER BY price ASC';
    if (order === 'precio-desc') orderClause = 'ORDER BY price DESC';

    // --- Paginación ---
    const pageNum   = parseInt(page)  || 1;
    const limitNum  = parseInt(limit) || 24;
    const offset    = (pageNum - 1) * limitNum;
    // OFFSET = cuántos registros saltamos
    // Página 1: offset 0, Página 2: offset 24, etc.

    // --- Query principal ---
    const dataQuery =
      'SELECT * FROM productos ' + where + ' ' +
      orderClause +
      ' LIMIT $' + paramCount +
      ' OFFSET $' + (paramCount + 1);

    values.push(limitNum, offset);

    // --- Query de conteo total (para la paginación) ---
    const countQuery = 'SELECT COUNT(*) FROM productos ' + where;
    const countValues = values.slice(0, values.length - 2);
    // Usamos los mismos valores pero sin limit y offset

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, values),
      pool.query(countQuery, countValues)
    ]);
    // Promise.all ejecuta ambas queries en paralelo
    // más eficiente que ejecutarlas una tras otra

    res.json({
      products:   dataResult.rows,
      total:      parseInt(countResult.rows[0].count),
      page:       pageNum,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum)
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST — crear
// POST — crear producto (protegida)
app.post('/api/products', authenticateToken, async function(req, res) {
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
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT — actualizar producto (protegida)
app.put('/api/products/:id', authenticateToken, async function(req, res) {
  try {
    const id = Number(req.params.id);
    const {
      name, price, category, subcategoria, brand,
      image, description, whatsapp,
      en_oferta, precio_oferta, en_stock,
      destacado, en_promocion, fecha_fin_promo,
      stock_cantidad, stock_minimo
    } = req.body;

    const result = await pool.query(
      `UPDATE productos SET
        name=$1, price=$2, category=$3, subcategoria=$4, brand=$5,
        image=$6, description=$7, whatsapp=$8,
        en_oferta=$9, precio_oferta=$10, en_stock=$11,
        destacado=$12, en_promocion=$13, fecha_fin_promo=$14,
        stock_cantidad=$15, stock_minimo=$16
        WHERE id=$17
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
        stock_minimo || 5,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// RUTAS DE AUTENTICACIÓN
// ============================================================

// POST /api/auth/login — iniciar sesión
app.post('/api/auth/login', async function(req, res) {
  try {
    const { username, password } = req.body;

    // Buscamos el admin en la base de datos
    const result = await pool.query(
      'SELECT * FROM administradores WHERE username=$1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
      // No revelamos si el usuario existe o no
      // por seguridad siempre el mismo mensaje
    }

    const admin = result.rows[0];

    // bcrypt.compare() compara la contraseña con el hash
    // Devuelve true si coinciden, false si no
    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Generamos el token JWT
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      // ^ payload: datos que guardamos en el token
      process.env.JWT_SECRET,
      // ^ clave secreta para firmar
      { expiresIn: process.env.JWT_EXPIRES_IN }
      // ^ opciones: cuándo vence
    );

    res.json({
      token: token,
      username: admin.username
      // Devolvemos el token al frontend
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/verify — verificar si el token es válido
app.get('/api/auth/verify', authenticateToken, function(req, res) {
  // Si llegamos acá, el token es válido
  // authenticateToken lo verificó antes
  res.json({ valid: true, username: req.user.username });
});

// ============================================================
// RUTAS DE MÉTRICAS
// ============================================================

// POST /api/metrics/view/:id — registra una vista de producto
app.post('/api/metrics/view/:id', async function(req, res) {
  try {
    const id = Number(req.params.id);
    await pool.query(
      'INSERT INTO producto_vistas (producto_id) VALUES ($1)',
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/metrics/whatsapp/:id — registra un click en WhatsApp
app.post('/api/metrics/whatsapp/:id', async function(req, res) {
  try {
    const id = Number(req.params.id);
    await pool.query(
      'INSERT INTO whatsapp_clicks (producto_id) VALUES ($1)',
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/metrics/search — registra una búsqueda
app.post('/api/metrics/search', async function(req, res) {
  try {
    const { termino } = req.body;
    if (!termino || termino.trim().length < 2) {
      return res.json({ ok: true });
      // No registramos búsquedas de menos de 2 caracteres
    }
    await pool.query(
      'INSERT INTO busquedas (termino) VALUES ($1)',
      [termino.trim().toLowerCase()]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/metrics/dashboard — resumen para el panel admin
app.get('/api/metrics/dashboard', authenticateToken, async function(req, res) {
  try {
    const { period } = req.query;
    // period = "7d", "30d", "90d" o "all"

    let dateFilter = '';
    if (period === '7d')  dateFilter = "AND fecha > NOW() - INTERVAL '7 days'";
    if (period === '30d') dateFilter = "AND fecha > NOW() - INTERVAL '30 days'";
    if (period === '90d') dateFilter = "AND fecha > NOW() - INTERVAL '90 days'";
    // INTERVAL es la forma de PostgreSQL de restar tiempo a una fecha

    // Total de vistas
    const totalVistas = await pool.query(
      'SELECT COUNT(*) FROM producto_vistas WHERE 1=1 ' + dateFilter
    );

    // Total de clicks WhatsApp
    const totalClicks = await pool.query(
      'SELECT COUNT(*) FROM whatsapp_clicks WHERE 1=1 ' + dateFilter
    );

    // Total de búsquedas
    const totalBusquedas = await pool.query(
      'SELECT COUNT(*) FROM busquedas WHERE 1=1 ' + dateFilter
    );

    // Top 10 productos más vistos
    const topVistas = await pool.query(`
      SELECT p.id, p.name, p.image, COUNT(v.id) as vistas
      FROM productos p
      LEFT JOIN producto_vistas v ON p.id = v.producto_id
      ${period !== 'all' ? 'AND v.fecha > NOW() - INTERVAL \'' + (period || '30') + '\'' : ''}
      GROUP BY p.id, p.name, p.image
      ORDER BY vistas DESC
      LIMIT 10
    `);

    // Top 10 productos más consultados por WhatsApp
    const topClicks = await pool.query(`
      SELECT p.id, p.name, p.image, COUNT(c.id) as clicks
      FROM productos p
      LEFT JOIN whatsapp_clicks c ON p.id = c.producto_id
      ${period !== 'all' ? 'AND c.fecha > NOW() - INTERVAL \'' + (period || '30') + '\'' : ''}
      GROUP BY p.id, p.name, p.image
      ORDER BY clicks DESC
      LIMIT 10
    `);

    // Top 10 búsquedas más frecuentes
    const topBusquedas = await pool.query(`
      SELECT termino, COUNT(*) as cantidad
      FROM busquedas
      WHERE 1=1 ` + dateFilter + `
      GROUP BY termino
      ORDER BY cantidad DESC
      LIMIT 10
    `);

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
    console.error(err.message);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET — categorías con sus subcategorías
app.get('/api/categories', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category, subcategoria 
      FROM productos 
      WHERE subcategoria IS NOT NULL AND subcategoria != ''
      ORDER BY category, subcategoria`
      // DISTINCT evita duplicados
      // Traemos solo los que tienen subcategoría
    );

    // Agrupamos por categoría
    const grouped = {};
    result.rows.forEach(function(row) {
      if (!grouped[row.category]) {
        grouped[row.category] = [];
      }
      grouped[row.category].push(row.subcategoria);
    });
    // grouped = { aceites: ['sintéticos', 'minerales'], ... }

    res.json(grouped);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET — productos destacados (para el carrusel)
app.get('/api/products/destacados', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM productos 
        WHERE destacado = true AND en_stock = true
        ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET — productos en promoción vigente
app.get('/api/products/promociones', async function(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM productos 
        WHERE en_promocion = true 
        AND en_stock = true
        AND (fecha_fin_promo IS NULL OR fecha_fin_promo > NOW())
        ORDER BY created_at DESC`
      // fecha_fin_promo > NOW() filtra las promociones vencidas
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE — eliminar producto (protegida)
app.delete('/api/products/:id', authenticateToken, async function(req, res) {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM productos WHERE id=$1', [id]);
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// --- Obtener imágenes de un producto ---
// GET /api/products/:id/images
app.get('/api/products/:id/images', async function(req, res) {
  try {
    const id     = Number(req.params.id);
    const result = await pool.query(
      'SELECT * FROM producto_imagenes WHERE producto_id=$1 ORDER BY orden ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- Agregar imagen por URL ---
// POST imagen por URL (protegida)
app.post('/api/products/:id/images/url', authenticateToken, async function(req, res) {
  try {
    const id    = Number(req.params.id);
    const { url, orden } = req.body;
    const result = await pool.query(
      'INSERT INTO producto_imagenes (producto_id, url, orden) VALUES ($1, $2, $3) RETURNING *',
      [id, url, orden || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- Subir imagen desde archivo ---
// POST /api/products/:id/images/upload
// Necesitamos multer para manejar archivos
const multer  = require('multer');
const path    = require('path');

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'public/uploads/');
    // Los archivos se guardan en public/uploads/
    // que el servidor ya sirve como estático
  },
  filename: function(req, file, cb) {
    // Nombre único: timestamp + extensión original
    const ext      = path.extname(file.originalname);
    const filename = Date.now() + ext;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  // Límite de 5MB por imagen
  fileFilter: function(req, file, cb) {
    // Solo aceptamos imágenes
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

// POST subir archivo (protegida)
app.post('/api/products/:id/images/upload', upload.single('image'), authenticateToken, async function(req, res) {

  try {
    const id  = Number(req.params.id);
    const url = '/uploads/' + req.file.filename;
    // La URL pública del archivo subido

    const result = await pool.query(
      'INSERT INTO producto_imagenes (producto_id, url, orden) VALUES ($1, $2, $3) RETURNING *',
      [id, url, 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- Eliminar una imagen ---
// DELETE imagen (protegida)
app.delete('/api/products/images/:imageId', authenticateToken, async function(req, res) {
  try {
    const imageId = Number(req.params.imageId);
    await pool.query('DELETE FROM producto_imagenes WHERE id=$1', [imageId]);
    res.json({ message: 'Imagen eliminada' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ------------------------------------------------------------
// ARRANCAR EL SERVIDOR
// ------------------------------------------------------------

app.listen(PORT, function() {
  console.log('Servidor corriendo en http://localhost:' + PORT);
});