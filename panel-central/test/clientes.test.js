const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const clientesRouter = require('../routes/clientes');
const { errorHandler } = require('../middleware/errorHandler');
const { withServer } = require('./helpers/testServer');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/clientes', clientesRouter);
  app.use(errorHandler);
  return app;
}

function authToken() {
  return jwt.sign({ id: 1, username: 'superadmin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('GET /api/clientes: requiere autenticación', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes');
    assert.equal(res.status, 401);
  });
});

test('GET /api/clientes: devuelve la lista con el token del super-admin', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, nombre: 'Repuestos Villalba', slug: 'villalba', plan: 'basico', estado: 'activo' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes', {
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].slug, 'villalba');
  });
});

test('POST /api/clientes: rechaza sin nombre/slug', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ plan: 'premium' })
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/clientes: rechaza un plan inválido', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ nombre: 'Test', slug: 'test', plan: 'oro' })
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/clientes: crea el cliente y le genera una api_key', async function (t) {
  let insertedValues = null;
  t.mock.method(pool, 'query', async function (sql, values) {
    insertedValues = values;
    return {
      rows: [{
        id: 5, nombre: values[0], slug: values[1], plan: values[2],
        estado: 'activo', api_key: values[3]
      }]
    };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ nombre: 'Repuestos Villalba', slug: 'villalba', plan: 'basico' })
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.slug, 'villalba');
    assert.match(body.api_key, /^[a-f0-9]{64}$/, 'la api_key debe ser un hex de 64 caracteres');
    assert.equal(insertedValues[3], body.api_key);
  });
});

test('PUT /api/clientes/:id: edición parcial solo del estado', async function (t) {
  t.mock.method(pool, 'query', async function (sql, values) {
    assert.match(sql, /UPDATE clientes SET estado=\$1, updated_at=NOW\(\) WHERE id=\$2/);
    return { rows: [{ id: 5, estado: values[0] }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes/5', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ estado: 'suspendido' })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.estado, 'suspendido');
  });
});
