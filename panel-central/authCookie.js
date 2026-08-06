// ============================================================
// authCookie.js — Configuración de la cookie de sesión del Panel Central
// ============================================================
// Espejo de authCookie.js del catálogo (son dos apps separadas, cada una con
// su propio deploy y su propio JWT_SECRET, así que no comparten código).
// Único cambio real: el nombre de la cookie, para que si alguna vez se sirven
// desde el mismo dominio no se pisen entre sí.
//
// Fuente única de verdad del nombre y las opciones: la setea routes/auth.js
// (login), la borra (logout) y la lee middleware/auth.js. Si estos tres
// lugares se desincronizan (por ejemplo, distinto `path`), el logout deja de
// borrar la cookie que creó el login y la sesión "no se cierra" — un bug
// silencioso y difícil de rastrear.
//
// Por qué cookie httpOnly y no localStorage (ver AUDITORIA.md): el token en
// localStorage lo puede leer cualquier JavaScript de la página, así que un
// XSS bastaba para robar la sesión del super-admin — que acá es más grave que
// en el catálogo, porque desde este panel se ven y administran TODOS los
// clientes, sus api_key y sus pagos.
// ============================================================

const COOKIE_NAME = 'panel_token';

// Ocho horas, alineado con el `expiresIn` del JWT en routes/auth.js.
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
    // request, un sitio malicioso podría disparar acciones en el panel desde
    // el navegador del super-admin. Con Strict el navegador no la manda en
    // requests originados en otro sitio, que es exactamente ese ataque.
    sameSite: 'strict',

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
