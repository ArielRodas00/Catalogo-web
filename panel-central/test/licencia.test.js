const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const licenciaRouter = require('../routes/licencia');
const { withServer } = require('./helpers/testServer');

function buildApp() {
  const app = express();
  app.use('/api/licencia', licenciaRouter);
  return app;
}

test('GET /api/licencia: rechaza sin X-API-Key', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/licencia');
    assert.equal(res.status, 401);
  });
});

test('GET /api/licencia: rechaza una key que no existe', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/licencia', {
      headers: { 'X-API-Key': 'key-que-no-existe' }
    });
    assert.equal(res.status, 403);
  });
});

test('GET /api/licencia: cliente activo devuelve activo:true y su plan', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, nombre: 'Villalba', slug: 'villalba', plan: 'premium', estado: 'activo' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/licencia', {
      headers: { 'X-API-Key': 'una-key-valida' }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.activo, true);
    assert.equal(body.plan, 'premium');
  });
});

test('GET /api/licencia: cliente suspendido devuelve activo:false', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, nombre: 'Villalba', slug: 'villalba', plan: 'premium', estado: 'suspendido' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/licencia', {
      headers: { 'X-API-Key': 'una-key-valida' }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.activo, false);
    assert.equal(body.estado, 'suspendido');
  });
});
