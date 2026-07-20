const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';

const { authenticateToken } = require('../middleware/auth');

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
