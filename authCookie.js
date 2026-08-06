// ============================================================
// authCookie.js — Configuración de la cookie de sesión del admin
// ============================================================
// Fuente única de verdad para el nombre y las opciones de la cookie: la
// setean routes/auth.js (login), la borran (logout) y la leen
// middleware/auth.js. Si estos tres lugares se desincronizan (por ejemplo,
// distinto `path`), el logout deja de borrar la cookie que el login creó y
// la sesión "no se cierra" — un bug silencioso y difícil de rastrear.
//
// Por qué cookie httpOnly y no localStorage (ver AUDITORIA.md):
// el token en localStorage lo puede leer cualquier JavaScript de la página,
// así que un XSS bastaba para robar la sesión del admin. Una cookie httpOnly
// el navegador la envía sola en cada request pero el JS no la puede leer.
// ============================================================

const COOKIE_NAME = 'admin_token';

// Ocho horas por defecto, alineado con el `expiresIn` del JWT en
// routes/auth.js. Se mantiene en milisegundos porque es lo que espera
// `maxAge` de res.cookie().
const DEFAULT_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function cookieOptions() {
  return {
    // El JS de la página no puede leerla: es todo el punto del cambio.
    httpOnly: true,

    // Solo viaja por HTTPS. En desarrollo (http://localhost) tiene que ir en
    // false o el navegador descarta la cookie y el login "no hace nada".
    secure: isProduction(),

    // Defensa contra CSRF: al viajar la cookie automáticamente en cada
    // request, un sitio malicioso podría disparar acciones en el admin desde
    // el navegador del dueño. Con Strict el navegador no la manda en
    // requests originados en otro sitio, que es exactamente ese ataque.
    sameSite: 'strict',

    // Toda la app (el admin llama a /api/* y a /admin.html).
    path: '/',

    maxAge: DEFAULT_MAX_AGE_MS
  };
}

// Para borrar hay que repetir los mismos atributos con los que se creó
// (menos maxAge), o el navegador la trata como otra cookie y no la borra.
function clearCookieOptions() {
  const opts = cookieOptions();
  delete opts.maxAge;
  return opts;
}

module.exports = { COOKIE_NAME, cookieOptions, clearCookieOptions };
