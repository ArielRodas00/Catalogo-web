require('dotenv').config({ quiet: true });

// Soporte para DATABASE_URL (Neon) o variables individuales (local)
if (process.env.DATABASE_URL) {
  console.log('Usando DATABASE_URL para conexion a BD');
} else {
  const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
  const missing = REQUIRED_ENV.filter(function(key) { return !process.env[key]; });
  if (missing.length > 0) {
    console.error('Faltan variables de entorno:', missing.join(', '));
    process.exit(1);
  }
}

const fs      = require('fs');
const path    = require('path');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const pool    = require('./db');
const { branding, brandingStyleTag, buildWordmarkHtml } = require('./branding');
const { startLicenseCheck, getLicense } = require('./licenseCheck');

const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');
const { authenticateToken } = require('./middleware/auth');

const productsRouter   = require('./routes/products');
const authRouter       = require('./routes/auth');
const metricsRouter    = require('./routes/metrics');
const categoriesRouter = require('./routes/categories');

const app  = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN
    : ['http://localhost:3000', 'http://127.0.0.1:3000']
}));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// --- Marca configurable: index.html y admin.html se sirven con los tokens
// __STORE_NAME__ / __STORE_LOGO_URL__ / __STORE_WORDMARK__ / __STORE_TAGLINE__
// / __COLOR_PRIMARY__ / __BASE_URL__ reemplazados, y con las variables CSS de
// color inyectadas (branding.js). Van ANTES de express.static para
// interceptar estas dos rutas puntuales; el resto de los archivos de
// public/ los sigue sirviendo el static normal.
function renderBrandedHtml(fileName, res) {
  const filePath = path.join(__dirname, 'public', fileName);
  let html = fs.readFileSync(filePath, 'utf8');
  html = html
    .split('__STORE_NAME__').join(branding.storeName)
    .split('__STORE_LOGO_URL__').join(branding.logoUrl)
    .split('__STORE_WORDMARK__').join(buildWordmarkHtml())
    .split('__STORE_TAGLINE__').join(branding.storeTagline)
    .split('__COLOR_PRIMARY__').join(branding.colorPrimary)
    .split('__BASE_URL__').join(BASE_URL)
    .replace('</head>', brandingStyleTag() + '</head>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
}

app.get(['/', '/index.html'], function(req, res) {
  renderBrandedHtml('index.html', res);
});

app.get('/admin.html', function(req, res) {
  renderBrandedHtml('admin.html', res);
});

app.use(express.static('public', {
  etag: true,
  setHeaders: function(res, path) {
    if (path.endsWith('.html')) {
      // El HTML es el punto de entrada (referencia los <script>/<link> con nombre
      // fijo, sin cache-busting): si se cachea, un deploy nuevo puede no notarse
      // hasta que expire el cache. Siempre revalidamos con el servidor (barato,
      // son archivos chicos), el 304 evita re-descargar si no cambió.
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
    } else if (process.env.NODE_ENV === 'production') {
      // JS/CSS/imágenes: cache corto + must-revalidate, así un deploy se refleja
      // en minutos en vez de hasta 24hs para quien ya había visitado el sitio.
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// --- SEO: robots.txt ---
app.get('/robots.txt', function(req, res) {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: ' + BASE_URL + '/sitemap.xml\n');
});

// --- SEO: Sitemap.xml ---
app.get('/sitemap.xml', async function(req, res) {
  try {
    const result = await pool.query('SELECT id, name, created_at FROM productos ORDER BY id');
    const rows = result.rows;

    let urls = '';
    urls += '  <url><loc>' + BASE_URL + '/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n';

    rows.forEach(function(row) {
      urls += '  <url>' +
        '<loc>' + BASE_URL + '/p/' + row.id + '</loc>' +
        '<lastmod>' + new Date(row.created_at || new Date()).toISOString().slice(0, 10) + '</lastmod>' +
        '<changefreq>weekly</changefreq>' +
        '<priority>0.8</priority>' +
        '</url>\n';
    });

    res.type('application/xml');
    res.send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls +
      '</urlset>'
    );
  } catch (err) {
    console.error('Error generando sitemap:', err.message);
    res.status(500).type('text/plain').send('Error generando sitemap');
  }
});

// --- SEO: Product detail page (server-side for Google) ---
app.get('/p/:id', async function(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return next();

    const result = await pool.query('SELECT id, name, price, category, image, description, whatsapp, en_oferta, precio_oferta, en_stock, destacado, en_promocion, fecha_fin_promo, stock_cantidad, created_at FROM productos WHERE id=$1', [id]);
    if (result.rows.length === 0) return next();

    const p = result.rows[0];
    const safeName = (p.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeImage = (p.image || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeDesc = (p.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').slice(0, 300);
    const img = p.image ? '<meta property="og:image" content="' + safeImage + '">' : '';
    const desc = safeDesc;

    res.send(
      '<!DOCTYPE html><html lang="es"><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>' + safeName + ' | Catálogo</title>' +
      '<meta name="description" content="' + desc + '">' +
      img +
      '<meta property="og:title" content="' + safeName + '">' +
      '<meta property="og:description" content="' + desc + '">' +
      '<meta property="og:type" content="product">' +
      '<meta property="og:url" content="' + BASE_URL + '/p/' + id + '">' +
      '<meta name="twitter:card" content="summary_large_image">' +
      '<meta name="twitter:title" content="' + safeName + '">' +
        '<meta name="robots" content="index, follow">' +
        '<meta http-equiv="refresh" content="0;url=/?producto=' + id + '">' +
      '<link rel="canonical" href="' + BASE_URL + '/p/' + id + '">' +
      '<script type="application/ld+json">' +
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p.name,
        "description": p.description ? p.description.slice(0, 300) : undefined,
        "image": p.image || undefined,
        "category": p.category || undefined,
        "offers": {
          "@type": "Offer",
          "price": Number(p.price),
          "priceCurrency": "PYG",
          "availability": p.en_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
        }
      }).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--') +
      '</script>' +
      '</head><body>' +
      '<h1>' + safeName + '</h1>' +
      '<p>Redirigiendo al catálogo...</p>' +
      '</body></html>'
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/plan — el admin panel lo consulta para saber si mostrar las
// features Premium (métricas, etc). Devuelve el último estado conocido de
// license.js, nunca golpea al Panel Central en el momento (ver license.js).
app.get('/api/plan', authenticateToken, function(req, res) {
  res.json(getLicense());
});

app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/categories', categoriesRouter);

app.use(errorHandler);

app.listen(PORT, function() {
  console.log('Servidor corriendo en http://localhost:' + PORT);
});

startLicenseCheck();

process.on('SIGTERM', async function() {
  console.log('SIGTERM recibido. Cerrando pool...');
  await pool.end();
  process.exit(0);
});
process.on('SIGINT', async function() {
  console.log('SIGINT recibido. Cerrando pool...');
  await pool.end();
  process.exit(0);
});

process.on('unhandledRejection', function(reason, _promise) {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', function(err) {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});
