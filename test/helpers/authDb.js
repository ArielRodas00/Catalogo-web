// ============================================================
// authDb.js — Helper para tests que pasan por authenticateToken
// ============================================================
// Desde que el middleware corta las sesiones al cambiar la contraseña
// (ver middleware/auth.js), autenticarse implica una consulta a la tabla
// `administradores`. Los tests que sólo querían probar OTRA cosa detrás de
// una ruta protegida no tienen por qué saber eso, así que este helper
// responde esa consulta y delega todas las demás.
//
// Sin esto, cada test protegido fallaría con 503 — que es el
// comportamiento correcto del middleware (falla cerrado ante un error de
// base), pero no lo que el test está tratando de verificar.
// ============================================================

const pool = require('../../db');

// Reconoce la consulta que hace el middleware de autenticación.
function esConsultaDeSesion(sql) {
  return typeof sql === 'string' &&
    sql.includes('password_changed_at') &&
    sql.includes('administradores');
}

// Instala un mock de pool.query que:
//   - responde la consulta de sesión con una cuenta válida
//   - delega el resto en `handler` (lo que el test realmente quiere probar)
//
// `opciones.rol` permite probar permisos; por defecto 'admin'.
function mockConSesion(t, handler, opciones) {
  const rol = (opciones && opciones.rol) || 'admin';
  return t.mock.method(pool, 'query', async function (sql, params) {
    if (esConsultaDeSesion(sql)) {
      return { rows: [{ password_changed_at: null, rol: rol }] };
    }
    if (typeof handler === 'function') return handler(sql, params);
    return { rows: [] };
  });
}

module.exports = { mockConSesion, esConsultaDeSesion };
