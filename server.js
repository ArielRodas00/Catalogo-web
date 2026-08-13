require('dotenv').config({ quiet: true });

// JWT_SECRET se valida SIEMPRE, sin importar cómo esté configurada la base:
// antes solo se chequeaba en la rama de desarrollo local, así que un deploy
// de producción (que usa DATABASE_URL) podía arrancar sin él y recién fallar
// al intentar loguearse. Con "1 deploy por cliente" es un olvido realista.
if (!process.env.JWT_SECRET) {
  console.error('Falta la variable de entorno JWT_SECRET — el login no puede funcionar sin ella.');
  process.exit(1);
}

// Soporte para DATABASE_URL (Neon) o variables individuales (local)
if (process.env.DATABASE_URL) {
  console.log('Usando DATABASE_URL para conexion a BD');
} else {
  const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
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
const cookieParser = require('cookie-parser');
const pool    = require('./db');
const { getEffectiveBranding, brandingStyleTag, buildLogoInnerHtml, escapeHtml } = require('./branding');
const { startLicenseCheck, getLicense, checkLicense } = require('./licenseCheck');
const imageStorage = require('./imagekit');

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
      // blob: hace falta para las previews instantáneas de archivos recién
      // elegidos en el admin (URL.createObjectURL, antes de terminar de
      // subirse — ver public/admin/images.js).
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
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
// Necesario para leer la cookie de sesión del admin (ver authCookie.js).
// Express no parsea cookies por su cuenta.
app.use(cookieParser());
app.use(requestLogger);

// --- Marca configurable (env vars y/o Panel Central, ver branding.js):
// index.html y admin.html se sirven con los tokens __STORE_NAME__ /
// __STORE_LOGO_URL__ / __STORE_LOGO_INNER__ / __COLOR_PRIMARY__ /
// __BASE_URL__ reemplazados, y con las variables CSS de color inyectadas.
// Se recalcula en cada request (getEffectiveBranding() es barato, todo en
// memoria) para reflejar un cambio hecho en el Panel Central sin redeploy.
// Van ANTES de express.static para interceptar estas dos rutas puntuales;
// el resto de los archivos de public/ los sigue sirviendo el static normal.
function renderBrandedHtml(fileName, res) {
  const effective = getEffectiveBranding();
  const filePath = path.join(__dirname, 'public', fileName);
  let html = fs.readFileSync(filePath, 'utf8');
  // __STORE_NAME__ y __STORE_LOGO_URL__ pueden venir de un formulario web
  // (Panel Central, no solo de variables de entorno puestas a mano) y
  // aparecen en varios contextos HTML crudos (atributos, <title>, un bloque
  // JSON-LD) — se escapan acá. __STORE_LOGO_INNER__ ya viene escapado desde
  // adentro de branding.js; __COLOR_PRIMARY__ siempre es un hex validado
  // (por el Panel Central) o viene de una variable de entorno (mismo nivel
  // de confianza que el propio código del deploy), así que no hace falta.
  html = html
    .split('__STORE_NAME__').join(escapeHtml(effective.storeName))
    .split('__STORE_LOGO_URL__').join(escapeHtml(effective.faviconUrl))
    .split('__STORE_LOGO_INNER__').join(buildLogoInnerHtml(effective))
    .split('__COLOR_PRIMARY__').join(effective.colorPrimary)
    .split('__BASE_URL__').join(BASE_URL)
    .replace('</head>', brandingStyleTag(effective) + '</head>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
}

app.get(['/', '/index.html'], function(req, res) {
  renderBrandedHtml('index.html', res);
});

app.get('/admin.html', function(req, res) {
  // Defensa en profundidad junto al <meta name="robots"> del HTML: la
  // cabecera la respetan también los bots que no llegan a parsear la página.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
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
// El catálogo sí se indexa (es el objetivo del producto), pero el panel de
// administración no: aparecer en buscadores solo lo expone a escaneos
// automáticos sin ningún beneficio. Ver AUDITORIA.md, "Reducir la superficie
// de ataque del admin".
app.get('/robots.txt', function(req, res) {
  res.type('text/plain');
  res.send(
    'User-agent: *\n' +
    'Disallow: /admin.html\n' +
    'Allow: /\n' +
    'Sitemap: ' + BASE_URL + '/sitemap.xml\n'
  );
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

// GET /api/internal/refresh-license — lo llama el Cron de Vercel (ver
// vercel.json) para mantener el estado de licencia caliente. Es un refuerzo,
// no un requisito: getLicense() ya refresca por demanda cuando el cache vence
// (ver licenseCheck.js), así que si el cron no corre el sistema funciona igual.
//
// No usa authenticateToken porque no lo invoca un humano con sesión, sino la
// plataforma. Se protege con un secreto compartido, que es el patrón estándar
// de Vercel para cron. Si CRON_SECRET no está configurado, el endpoint no
// existe: así un deploy sin cron no queda con una ruta abierta de más.
app.get('/api/internal/refresh-license', async function(req, res) {
  if (!process.env.CRON_SECRET) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  if (req.headers['authorization'] !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // Acá sí esperamos el chequeo (a diferencia de getLicense, que nunca
  // bloquea): el único objetivo de este request es justamente refrescar, y
  // el cron no tiene a nadie esperando del otro lado.
  await checkLicense();
  const license = getLicense();
  res.json({ ok: true, plan: license.plan, estado: license.estado });
});

app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/categories', categoriesRouter);

app.use(errorHandler);

// Solo abrimos un puerto si nos ejecutan directamente (`node server.js`, que
// es como arrancan el desarrollo local y Render). Un hosting serverless
// importa este módulo y maneja el servidor por su cuenta: si llamáramos a
// listen() siempre, estaríamos abriendo un puerto que nadie usa.
if (require.main === module) {
  app.listen(PORT, function() {
    console.log('Servidor corriendo en http://localhost:' + PORT);
    if (!imageStorage.isConfigured()) {
      console.warn(
        'IMAGEKIT_* no configurado — la subida de imágenes de producto por archivo va a fallar ' +
        '(el filesystem del hosting es efímero, no hay fallback a disco a propósito; ver AUDITORIA.md).'
      );
    }
  });
}

startLicenseCheck();

// Necesario para que un hosting serverless pueda importar la app y usarla
// como handler. En Render no cambia nada: ahí se ejecuta `node server.js` y
// el bloque de arriba abre el puerto igual que siempre.
module.exports = app;

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
