require('dotenv').config({ quiet: true });

// JWT_SECRET se valida SIEMPRE, sin importar cómo esté configurada la base
// (antes solo se chequeaba en la rama de desarrollo local, así que un deploy
// de producción con DATABASE_URL podía arrancar sin él).
if (!process.env.JWT_SECRET) {
  console.error('Falta la variable de entorno JWT_SECRET — el login no puede funcionar sin ella.');
  process.exit(1);
}

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

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const pool    = require('./db');

const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');
const { authenticateToken, requiereRol } = require('./middleware/auth');
const auditoria = require('./auditoria');

const authRouter     = require('./routes/auth');
const clientesRouter = require('./routes/clientes');
const licenciaRouter = require('./routes/licencia');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));

const PORT = process.env.PORT || 4000;

app.use(cors({
  // GET /api/licencia lo llaman los catálogos de los clientes desde sus
  // propios dominios (server-to-server) — no restringimos origin acá, la
  // seguridad de esa ruta la da la API key, no CORS.
  origin: process.env.NODE_ENV === 'production'
    ? true
    : ['http://localhost:4000', 'http://127.0.0.1:4000']
}));
app.use(express.json({ limit: '1mb' }));
// Necesario para leer la cookie de sesión del super-admin (ver authCookie.js).
// Express no parsea cookies por su cuenta.
app.use(cookieParser());
// Un POST sin Content-Type deja req.body en undefined, y cualquier ruta que
// haga destructuring sobre el cuerpo lanza y termina en un 500. Es un pedido
// malformado: corresponde un 400 de la validacion de cada ruta, no un error
// del servidor. Con esto req.body siempre es un objeto.
app.use(function(req, res, next) {
  if (req.body === undefined) req.body = {};
  next();
});

app.use(requestLogger);
// Ruta ABSOLUTA a proposito: con la relativa, en Vercel el directorio de
// trabajo de la funcion no es la raiz del proyecto y express.static no
// encontraba la carpeta, asi que '/' devolvia 404 (los archivos sueltos si
// se veian, porque los sirve el CDN). Ver AUDITORIA.md.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders: function(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
    } else if (process.env.NODE_ENV === 'production') {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// Registra automáticamente toda escritura autenticada (ver auditoria.js).
// Va antes de los routers para poder engancharse a la respuesta.
app.use(auditoria.middleware);

app.use('/api/auth', authRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/licencia', licenciaRouter);

// GET /api/auditoria — historial de acciones. Solo rol admin: es el registro
// de quién tocó qué cliente y qué pago, información de control que no le
// corresponde a una cuenta de consulta.
app.get('/api/auditoria', authenticateToken, requiereRol('admin'), async function(req, res, next) {
  try {
    res.json(await auditoria.listar(req.query.limite));
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

// Solo abrimos un puerto si nos ejecutan directamente (`node server.js`, que
// es como arrancan el desarrollo local y Render). Un hosting serverless
// importa este módulo y maneja el servidor por su cuenta.
if (require.main === module) {
  app.listen(PORT, function() {
    console.log('Panel Central corriendo en http://localhost:' + PORT);
  });
}

// Necesario para que un hosting serverless pueda importar la app como handler.
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

process.on('unhandledRejection', function(reason) {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', function(err) {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});
