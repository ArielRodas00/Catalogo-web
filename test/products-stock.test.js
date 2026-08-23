const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const license = require('../licenseCheck');
const productsRouter = require('../routes/products');
const { errorHandler } = require('../middleware/errorHandler');
const { withServer } = require('./helpers/testServer');
const { mockConSesion } = require('./helpers/authDb');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productsRouter);
  app.use(errorHandler);
  return app;
}

function authToken() {
  return jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('GET /api/products/:id: ID no numérico devuelve 400 sin tocar la BD', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/abc');
    assert.equal(res.status, 400);
  });
});

test('GET /api/products: los productos sin stock siempre van al final del orden elegido', async function (t) {
  const queries = [];
  t.mock.method(pool, 'query', async function (sql) {
    queries.push(sql);
    return { rows: [{ count: '0' }] };
  });

  await withServer(buildApp(), async function (base) {
    for (const order of ['az', 'za', 'precio-asc', 'precio-desc', 'reciente']) {
      queries.length = 0;
      const res = await fetch(base + '/api/products?order=' + order);
      assert.equal(res.status, 200);
      const dataQuery = queries.find(function (sql) { return sql.startsWith('SELECT id'); });
      assert.match(dataQuery, /ORDER BY en_stock DESC,/, 'orden "' + order + '" debe priorizar en_stock');
    }
  });
});

test('POST /api/products/batch-stock: requiere autenticación', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/batch-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: 1, quantity: 5 }] })
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/products/batch-stock: plan Básico devuelve 403 (recepción por lote es Premium)', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  const fetchMock = t.mock.method(globalThis, 'fetch', async function () {
    return { ok: true, json: async () => ({ activo: true, plan: 'basico', estado: 'activo' }) };
  });
  await license.checkLicense();
  fetchMock.mock.restore(); // el fetch REAL vuelve para pegarle al server de prueba
  mockConSesion(t); // la ruta pasa por authenticateToken, que consulta la sesión

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/batch-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ items: [{ id: 1, quantity: 5 }] })
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.plan, 'basico');
  });

  delete process.env.PANEL_CENTRAL_URL;
  delete process.env.CLIENTE_API_KEY;
  license._resetForTests();
});

test('POST /api/products/batch-stock: suma stock de un lote y confirma la transacción', async function (t) {
  const queries = [];
  const fakeClient = {
    query: async function (sql, params) {
      queries.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT') return {};
      return { rows: [{ id: params[1], name: 'Producto ' + params[1], stock_cantidad: params[0] }] };
    },
    release: function () {}
  };
  mockConSesion(t); // authenticateToken consulta la sesion con pool.query
  t.mock.method(pool, 'connect', async function () {
    return fakeClient;
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/batch-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authToken()
      },
      body: JSON.stringify({
        items: [
          { id: 1, quantity: 5 },
          { id: 2, quantity: 3 }
        ]
      })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.count, 2);
    assert.ok(queries.includes('BEGIN'));
    assert.ok(queries.includes('COMMIT'));
    assert.ok(!queries.includes('ROLLBACK'));
  });
});

test('POST /api/products/batch-stock: hace rollback si un producto no existe', async function (t) {
  const queries = [];
  const fakeClient = {
    query: async function (sql) {
      queries.push(sql);
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
      // Simula que ningún producto coincide con el UPDATE
      return { rows: [] };
    },
    release: function () {}
  };
  mockConSesion(t); // authenticateToken consulta la sesion con pool.query
  t.mock.method(pool, 'connect', async function () {
    return fakeClient;
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/batch-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authToken()
      },
      body: JSON.stringify({ items: [{ id: 999, quantity: 5 }] })
    });
    assert.equal(res.status, 500);
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(!queries.includes('COMMIT'));
  });
});

test('POST /api/products/batch-stock: rechaza más de 50 productos por lote', async function (t) {
  mockConSesion(t); // la ruta pasa por authenticateToken, que consulta la sesión
  const items = Array.from({ length: 51 }, function (_v, i) {
    return { id: i + 1, quantity: 1 };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/batch-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authToken()
      },
      body: JSON.stringify({ items: items })
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/products/batch-stock: rechaza un body sin array de items', async function (t) {
  mockConSesion(t); // la ruta pasa por authenticateToken, que consulta la sesión
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/batch-stock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + authToken()
      },
      body: JSON.stringify({ items: 'no-es-un-array' })
    });
    assert.equal(res.status, 400);
  });
});
