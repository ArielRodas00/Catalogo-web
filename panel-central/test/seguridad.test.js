const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const { authenticateToken, requiereRol } = require('../middleware/auth');
const { validarPassword, PASSWORD_MIN } = require('../middleware/validate');
const totp = require('../totp');
const { COOKIE_NAME } = require('../authCookie');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = function (c) { res.statusCode = c; return res; };
  res.json = function (b) { res.body = b; return res; };
  return res;
}

async function correr(req) {
  const res = mockRes();
  let llamoNext = false;
  await authenticateToken(req, res, function () { llamoNext = true; });
  return { res, llamoNext };
}

function mockCuenta(t, fila) {
  return t.mock.method(pool, 'query', async function () {
    return { rows: fila === null ? [] : [Object.assign({ password_changed_at: null, rol: 'admin' }, fila)] };
  });
}

function token(payload, opts) {
  return jwt.sign(payload || { id: 1, username: 'superadmin' }, process.env.JWT_SECRET, opts || { expiresIn: '1h' });
}

// ============================================================
// Corte de sesiones al cambiar la contraseña
// ============================================================
// Acá importa más que en el catálogo: esta cuenta ve y administra a TODOS los
// clientes, sus api_key y sus pagos.

test('authenticateToken: rechaza un token emitido ANTES del cambio de contraseña', async function (t) {
  mockCuenta(t, { password_changed_at: new Date(Date.now() + 60 * 1000) });
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, false, 'un token viejo no debe seguir sirviendo tras cambiar la clave');
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /cambio de contraseña/i);
});

test('authenticateToken: acepta un token emitido DESPUÉS del cambio', async function (t) {
  mockCuenta(t, { password_changed_at: new Date(Date.now() - 60 * 60 * 1000) });
  const { llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, true);
});

test('authenticateToken: acepta un token emitido en el MISMO segundo que el cambio', async function (t) {
  // Bug real detectado al probar el ciclo completo: el iat del JWT solo tiene
  // precisión de segundos y password_changed_at guarda milisegundos.
  // Comparando en milisegundos, quien cambiaba su clave y volvía a entrar de
  // inmediato quedaba afuera con "sesión cerrada" — el caso normal.
  const iatSeg = Math.floor(Date.now() / 1000);
  mockCuenta(t, { password_changed_at: new Date(iatSeg * 1000 + 750) });
  const req = {
    headers: {
      authorization: 'Bearer ' + jwt.sign(
        { id: 1, username: 'superadmin', iat: iatSeg },
        process.env.JWT_SECRET, { expiresIn: '1h' }
      )
    }
  };
  const { res, llamoNext } = await correr(req);
  assert.equal(llamoNext, true, 'no debe rechazar un token del mismo segundo (HTTP ' + res.statusCode + ')');
});

test('authenticateToken: acepta la cookie httpOnly', async function (t) {
  mockCuenta(t);
  const req = { headers: {}, cookies: { [COOKIE_NAME]: token() } };
  const { llamoNext } = await correr(req);
  assert.equal(llamoNext, true);
  assert.equal(req.user.username, 'superadmin');
});

test('authenticateToken: rechaza si la cuenta ya no existe', async function (t) {
  mockCuenta(t, null);
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: ante un error de base falla CERRADO (503)', async function (t) {
  t.mock.method(pool, 'query', async function () { throw new Error('conexion caida'); });
  const { res, llamoNext } = await correr({ headers: { authorization: 'Bearer ' + token() } });
  assert.equal(llamoNext, false, 'un control de autenticacion no puede fallar abierto');
  assert.equal(res.statusCode, 503);
});

test('authenticateToken: el rol sale de la base, no del token', async function (t) {
  mockCuenta(t, { rol: 'editor' });
  const req = { headers: { authorization: 'Bearer ' + token({ id: 1, username: 'superadmin', rol: 'admin' }) } };
  await correr(req);
  assert.equal(req.user.rol, 'editor');
});

// ============================================================
// Roles
// ============================================================

test('requiereRol: bloquea al rol no permitido', function () {
  const res = mockRes();
  let paso = false;
  requiereRol('admin')({ user: { rol: 'editor' } }, res, function () { paso = true; });
  assert.equal(paso, false);
  assert.equal(res.statusCode, 403);
});

test('requiereRol: sin rol asume admin (cuentas previas a la columna)', function () {
  const res = mockRes();
  let paso = false;
  requiereRol('admin')({ user: { username: 'superadmin' } }, res, function () { paso = true; });
  assert.equal(paso, true, 'no debe dejar afuera a una cuenta creada antes de que existieran los roles');
});

// ============================================================
// Fortaleza de contraseña
// ============================================================

test('validarPassword: rechaza las más cortas que el mínimo', function () {
  const errores = validarPassword('corta1', 'superadmin');
  assert.ok(errores.length > 0);
  assert.match(errores[0], new RegExp(String(PASSWORD_MIN)));
});

test('validarPassword: rechaza las comunes y las que contienen el usuario', function () {
  assert.ok(validarPassword('password123', 'superadmin').length > 0);
  assert.ok(validarPassword('superadmin2026', 'superadmin').length > 0);
});

test('validarPassword: acepta una contraseña razonable', function () {
  // Se cambió el ejemplo: 'panel de control 2026' ahora se rechaza, con razón
  // —contiene "panel" (palabra obvia para este sistema) y un año, que es de lo
  // primero que prueba un atacante. Ver password.js.
  assert.deepEqual(validarPassword('tortuga verde bajo la mesa', 'superadmin'), []);
  assert.deepEqual(validarPassword('kokue rape guasu', 'superadmin'), []);
});

test('validarPassword: rechaza el patrón que antes pasaba', function () {
  // Larga, con mayúsculas, números y símbolos — y aun así predecible.
  const errores = validarPassword('P4n3lC3ntr4l$2026!', 'superadmin');
  assert.ok(errores.length > 0, 'no debe aceptarse');
});

// ============================================================
// Segundo factor
// ============================================================

test('totp: pasa los vectores oficiales del RFC 6238', function () {
  // Misma implementación propia que el catálogo (ver la nota de duplicación
  // en totp.js). Estos vectores son la garantía de que es correcta.
  const secreto = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const vectores = [[59000, '287082'], [1111111109000, '081804'], [2000000000000, '279037']];
  for (const [epochMs, esperado] of vectores) {
    assert.equal(totp.generar(secreto, epochMs), esperado, 'vector RFC en ' + epochMs);
  }
});

test('totp: verifica el código propio y rechaza uno ajeno', function () {
  const a = totp.generarSecreto();
  const b = totp.generarSecreto();
  assert.equal(totp.verificar(totp.generar(a), a), true);
  assert.equal(totp.verificar(totp.generar(a), b), false);
});

test('totp: rechaza formatos inválidos sin lanzar', function () {
  const secreto = totp.generarSecreto();
  for (const malo of ['', null, undefined, 'abcdef', '12345', '1234567']) {
    assert.equal(totp.verificar(malo, secreto), false, 'debe rechazar: ' + JSON.stringify(malo));
  }
});
