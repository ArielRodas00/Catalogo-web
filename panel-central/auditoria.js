// ============================================================
// auditoria.js — Registro de quién hizo qué
// ============================================================
// El logger de requests (middleware/logger.js) registra método, URL, estado y
// duración, pero no la identidad de quien lo hizo. Sin este registro no hay
// forma de responder "quién le cambió el plan a este cliente" ni "quién dio
// de baja esta cuenta", que son las preguntas que importan cuando se
// administra el dinero de un negocio.
//
// Principio de diseño: **auditar nunca debe romper la operación**. Si falla el
// INSERT en la tabla de auditoría, se loguea y se sigue — es preferible perder
// una línea de registro a que no se pueda dar de alta un cliente porque
// la auditoría tuvo un problema.
//
// NOTA sobre la duplicación con el catálogo: este archivo es un espejo del
// que está en la raíz. No se comparte código a propósito — son dos apps con
// deploys, package.json y bases distintas, y el Panel Central se publica
// apuntando SOLO a este subdirectorio, así que un require() a un archivo de
// afuera no llegaría al paquete desplegado. Si se toca uno, tocar el otro.
// ============================================================

const pool = require('./db');

// Extrae la IP real del cliente. Detrás de un proxy (Vercel, Render) la IP de
// la conexión es la del proxy, no la del visitante: la real viene en
// X-Forwarded-For, cuyo primer valor es el cliente original.
function ipDe(req) {
  // Defensivo con headers ausentes: esta función corre dentro de un registro
  // de auditoría, y auditar nunca puede tumbar la operación que audita.
  const fwd = req && req.headers ? req.headers['x-forwarded-for'] : null;
  if (fwd) return String(fwd).split(',')[0].trim().slice(0, 64);
  return ((req && req.ip) || '').slice(0, 64);
}

// Registra una acción. No se espera (fire and forget) a propósito: quien la
// llama está respondiendo un request y no debe pagar el costo de este INSERT.
//
// `usuarioExplicito` sirve para el login: ahí todavía no existe req.user
// (recién se está autenticando), pero igual queremos dejar registrado quién
// entró — o quién falló al intentarlo.
function registrar(req, accion, entidad, entidadId, detalle, usuarioExplicito) {
  const u = usuarioExplicito || (req && req.user) || {};
  const usuario = u.username || null;
  const usuarioId = u.id || null;

  pool.query(
    `INSERT INTO auditoria (usuario, usuario_id, accion, entidad, entidad_id, detalle, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      usuario,
      usuarioId,
      accion,
      entidad || null,
      entidadId != null ? String(entidadId) : null,
      detalle ? String(detalle).slice(0, 1000) : null,
      ipDe(req)
    ]
  ).catch(function(err) {
    console.error('No se pudo registrar en auditoría:', err.message);
  });
}

// Middleware que registra automáticamente toda escritura autenticada.
//
// Se hace como middleware y no llamando a registrar() en cada ruta a
// propósito: son más de diez rutas de escritura y la próxima que se agregue
// quedaría sin auditar si dependiéramos de acordarse. Las acciones de
// seguridad (login, cambio de contraseña, 2FA) sí se registran explícitamente
// en routes/auth.js, porque ahí el detalle importa más que la uniformidad.
function middleware(req, res, next) {
  const esEscritura = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!esEscritura) return next();

  res.on('finish', function() {
    // Sin usuario es una escritura pública (las métricas del catálogo): no
    // aporta nada al registro y lo llenaría de ruido.
    if (!req.user) return;

    // Las rutas de /api/auth ya se auditan con detalle donde ocurren.
    if ((req.baseUrl || '').startsWith('/api/auth')) return;

    const ruta = (req.baseUrl || '') + (req.route ? req.route.path : req.path);
    const entidad = (req.baseUrl || '').replace('/api/', '') || 'desconocida';
    const exito = res.statusCode < 400;

    registrar(
      req,
      req.method.toLowerCase() + (exito ? '' : '_fallido'),
      entidad,
      req.params && req.params.id ? req.params.id : null,
      ruta + ' -> ' + res.statusCode
    );
  });

  next();
}

// Devuelve las últimas entradas, para mostrarlas en el panel.
async function listar(limite) {
  const n = Math.min(Math.max(Number(limite) || 100, 1), 500);
  const result = await pool.query(
    `SELECT id, usuario, accion, entidad, entidad_id, detalle, ip, fecha
     FROM auditoria ORDER BY fecha DESC LIMIT $1`,
    [n]
  );
  return result.rows;
}

module.exports = { registrar, listar, middleware, ipDe };
