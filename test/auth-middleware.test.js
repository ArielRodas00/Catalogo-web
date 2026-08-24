const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const { authenticateToken, requiereRol } = require('../middleware/auth');
const { COOKIE_NAME } = require('../authCookie');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (body) {
    res.body = body;
    return res;
  };
  return res;
}

// El middleware pasó a ser asíncrono (consulta la base para saber si la
// sesión sigue siendo válida tras un cambio de contraseña), así que hay que
// esperarlo antes de afirmar sobre el resultado.
async function correr(req) {
  const res = mockRes();
  let llamoNext = false;
  await authenticateToken(req, res, function () { llamoNext = true; });
  return { res, llamoNext };
}

// Por defecto la cuenta existe, sin cambios de contraseña posteriores.
function mockCuenta(t, fila) {
  return t.mock.method(pool, 'query', async function () {
    return { rows: fila === null ? [] : [Object.assign({ password_changed_at: null, rol: 'admin' }, fila)] };
  });
}

function token(payload, opts) {
  return jwt.sign(payload || { id: 1, username: 'admin' }, process.env.JWT_SECRET, opts || { expiresIn: '1h' });
}

test('authenticateToken: rechaza si falta el header Authorization', async function () {
  const { res, llamoNext } = await correr({ headers: {} });
  assert.equal(llamoNext, false);
  assert.equal(res.statusCode, 401);
});

test('authenticateToken: rechaza un token con formato inválido', async function () {
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer token-no-valido' } });
  assert.equal(llamoNext, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: rechaza un token vencido', async function () {
  const t = token({ id: 1, username: 'admin' }, { expiresIn: -1 });
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer ' + t } });
  assert.equal(llamoNext, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: acepta un token válido y expone req.user', async function (t) {
  mockCuenta(t);
  const req = { headers: { authorization: 'Bearer ' + token() } };
  const { llamoNext } = await correr(req);
  assert.equal(llamoNext, true);
  assert.equal(req.user.username, 'admin');
});

test('authenticateToken: acepta el token desde la cookie httpOnly', async function (t) {
  mockCuenta(t);
  const req = { headers: {}, cookies: { [COOKIE_NAME]: token() } };
  const { llamoNext } = await correr(req);
  assert.equal(llamoNext, true, 'debe autenticar solo con la cookie, sin header');
  assert.equal(req.user.username, 'admin');
});

test('authenticateToken: rechaza una cookie con token inválido', async function () {
  const { res, llamoNext } = await correr({ headers: {}, cookies: { [COOKIE_NAME]: 'no-es-un-jwt' } });
  assert.equal(llamoNext, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: rechaza si no hay ni cookie ni header', async function () {
  const { res, llamoNext } = await correr({ headers: {}, cookies: {} });
  assert.equal(llamoNext, false);
  assert.equal(res.statusCode, 401);
});

test('authenticateToken: la cookie tiene prioridad sobre el header', async function (t) {
  mockCuenta(t);
  const req = {
    headers: { authorization: 'Bearer ' + token({ id: 2, username: 'desde-header' }) },
    cookies: { [COOKIE_NAME]: token({ id: 1, username: 'desde-cookie' }) }
  };
  const { llamoNext } = await correr(req);
  assert.equal(llamoNext, true);
  assert.equal(req.user.username, 'desde-cookie');
});

test('authenticateToken: funciona si req.cookies no existe (sin cookie-parser)', async function (t) {
  mockCuenta(t);
  const req = { headers: { authorization: 'Bearer ' + token() } };
  const { llamoNext } = await correr(req);
  assert.equal(llamoNext, true);
});

// ============================================================
// Corte de sesiones al cambiar la contraseña
// ============================================================

test('authenticateToken: rechaza un token emitido ANTES del cambio de contraseña', async function (t) {
  // El token se emitió recién; la contraseña se cambió dentro de un minuto.
  mockCuenta(t, { password_changed_at: new Date(Date.now() + 60 * 1000) });
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, false, 'un token viejo no debe seguir sirviendo tras cambiar la clave');
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /cambio de contraseña/i);
});

test('authenticateToken: acepta un token emitido DESPUÉS del cambio de contraseña', async function (t) {
  mockCuenta(t, { password_changed_at: new Date(Date.now() - 60 * 60 * 1000) });
  const { llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, true);
});


test('authenticateToken: acepta un token emitido en el MISMO segundo que el cambio', async function (t) {
  // Bug real: el iat del JWT solo tiene precisión de segundos y
  // password_changed_at guarda milisegundos. Comparando en milisegundos, un
  // usuario que cambiaba su clave y volvía a entrar de inmediato quedaba
  // afuera con 'sesión cerrada' — el caso normal, no el borde.
  const ahora = Date.now();
  const iatSeg = Math.floor(ahora / 1000);
  // La contraseña se cambió 750ms DESPUÉS del segundo del token, pero dentro
  // del mismo segundo: el token es legítimo y debe aceptarse.
  mockCuenta(t, { password_changed_at: new Date(iatSeg * 1000 + 750) });
  const req = { headers: { authorization: 'Bearer ' + jwt.sign({ id: 1, username: 'admin', iat: iatSeg }, process.env.JWT_SECRET, { expiresIn: '1h' }) } };
  const { res, llamoNext } = await correr(req);
  assert.equal(llamoNext, true, 'no debe rechazar un token del mismo segundo (HTTP ' + res.statusCode + ')');
});

test('authenticateToken: rechaza si la cuenta ya no existe', async function (t) {
  mockCuenta(t, null);
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: ante un error de base falla CERRADO (503, no deja pasar)', async function (t) {
  t.mock.method(pool, 'query', async function () { throw new Error('conexion caida'); });
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, false, 'un control de autenticacion no puede fallar abierto');
  assert.equal(res.statusCode, 503);
});

test('authenticateToken: el rol sale de la base, no del token', async function (t) {
  // Aunque el token diga admin, si en la base es editor, manda la base: así
  // bajarle permisos a alguien tiene efecto inmediato y no cuando venza su sesión.
  mockCuenta(t, { rol: 'editor' });
  const req = { headers: { authorization: 'Bearer ' + token({ id: 1, username: 'admin', rol: 'admin' }) } };
  await correr(req);
  assert.equal(req.user.rol, 'editor');
});

// ============================================================
// Roles
// ============================================================

test('requiereRol: deja pasar al rol permitido', function () {
  const req = { user: { rol: 'admin' } };
  const res = mockRes();
  let paso = false;
  requiereRol('admin')(req, res, function () { paso = true; });
  assert.equal(paso, true);
});

test('requiereRol: bloquea al rol no permitido con 403', function () {
  const req = { user: { rol: 'editor' } };
  const res = mockRes();
  let paso = false;
  requiereRol('admin')(req, res, function () { paso = true; });
  assert.equal(paso, false);
  assert.equal(res.statusCode, 403);
});

test('requiereRol: sin rol asume admin (cuentas viejas, antes de la columna)', function () {
  const req = { user: { username: 'admin' } };
  const res = mockRes();
  let paso = false;
  requiereRol('admin')(req, res, function () { paso = true; });
  assert.equal(paso, true, 'no debe dejar afuera a una cuenta creada antes de que existieran los roles');
});
