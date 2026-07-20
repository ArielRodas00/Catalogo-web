const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const authRouter = require('../routes/auth');
const { withServer } = require('./helpers/testServer');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

test('POST /api/auth/login: credenciales correctas devuelve token', async function (t) {
  const passwordHash = await bcrypt.hash('secreto123', 10);
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, username: 'admin', password: passwordHash }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secreto123' })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.token);
    assert.equal(body.username, 'admin');
  });
});

test('POST /api/auth/login: contraseña incorrecta devuelve 401', async function (t) {
  const passwordHash = await bcrypt.hash('secreto123', 10);
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, username: 'admin', password: passwordHash }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'incorrecta' })
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/auth/login: usuario inexistente devuelve 401', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'noexiste', password: 'x' })
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/auth/login: falta username o password devuelve 400', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin' })
    });
    assert.equal(res.status, 400);
  });
});
