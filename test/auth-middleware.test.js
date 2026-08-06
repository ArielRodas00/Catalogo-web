const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';

const { authenticateToken } = require('../middleware/auth');
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

test('authenticateToken: rechaza si falta el header Authorization', function () {
  const req = { headers: {} };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('authenticateToken: rechaza un token con formato inválido', function () {
  const req = { headers: { authorization: 'Bearer token-no-valido' } };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: rechaza un token vencido', function () {
  const token = jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET, { expiresIn: -1 });
  const req = { headers: { authorization: 'Bearer ' + token } };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: acepta un token válido y expone req.user', function () {
  const token = jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = { headers: { authorization: 'Bearer ' + token } };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(req.user.username, 'admin');
});

// --- Cookie httpOnly: la vía normal del panel web (ver authCookie.js) ---

test('authenticateToken: acepta el token desde la cookie httpOnly', function () {
  const token = jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = { headers: {}, cookies: { [COOKIE_NAME]: token } };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () { called = true; });
  assert.equal(called, true, 'debe autenticar solo con la cookie, sin header');
  assert.equal(req.user.username, 'admin');
});

test('authenticateToken: rechaza una cookie con token inválido', function () {
  const req = { headers: {}, cookies: { [COOKIE_NAME]: 'no-es-un-jwt' } };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('authenticateToken: rechaza si no hay ni cookie ni header', function () {
  const req = { headers: {}, cookies: {} };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('authenticateToken: la cookie tiene prioridad sobre el header', function () {
  // Si llegan ambos, gana la sesión del navegador. Importa que sea
  // determinístico: si no, un header viejo podría pisar una sesión válida.
  const tokenCookie = jwt.sign({ id: 1, username: 'desde-cookie' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const tokenHeader = jwt.sign({ id: 2, username: 'desde-header' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = {
    headers: { authorization: 'Bearer ' + tokenHeader },
    cookies: { [COOKIE_NAME]: tokenCookie }
  };
  const res = mockRes();
  let called = false;
  authenticateToken(req, res, function () { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.username, 'desde-cookie');
});

test('authenticateToken: funciona si req.cookies no existe (sin cookie-parser)', function () {
  // Defensa contra un montaje sin cookie-parser: no debe explotar, debe
  // caer al header. Varios tests montan routers sueltos así.
  const token = jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = { headers: { authorization: 'Bearer ' + token } };
  const res = mockRes();
  let called = false;
  assert.doesNotThrow(function () {
    authenticateToken(req, res, function () { called = true; });
  });
  assert.equal(called, true);
});
