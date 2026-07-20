const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const license = require('../licenseCheck');
const metricsRouter = require('../routes/metrics');
const { withServer } = require('./helpers/testServer');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/metrics', metricsRouter);
  return app;
}

function authToken() {
  return jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

test('GET /api/metrics/dashboard: deploy standalone (sin Panel Central) accede sin restricción', async function (t) {
  delete process.env.PANEL_CENTRAL_URL;
  delete process.env.CLIENTE_API_KEY;
  license._resetForTests();

  t.mock.method(pool, 'query', async function () {
    return { rows: [{ count: '0' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/metrics/dashboard', {
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    assert.notEqual(res.status, 403);
  });
});

test('GET /api/metrics/dashboard: plan Básico devuelve 403 con mensaje claro', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  const fetchMock = t.mock.method(globalThis, 'fetch', async function () {
    return { ok: true, json: async () => ({ activo: true, plan: 'basico', estado: 'activo' }) };
  });
  await license.checkLicense();
  fetchMock.mock.restore(); // el fetch REAL vuelve para pegarle al server de prueba

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/metrics/dashboard', {
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.plan, 'basico');
  });
});

test('GET /api/metrics/dashboard: Premium pero suspendido también devuelve 403', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  const fetchMock = t.mock.method(globalThis, 'fetch', async function () {
    return { ok: true, json: async () => ({ activo: false, plan: 'premium', estado: 'suspendido' }) };
  });
  await license.checkLicense();
  fetchMock.mock.restore();

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/metrics/dashboard', {
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    assert.equal(res.status, 403);
  });
});

test('GET /api/metrics/dashboard: Premium activo pasa el gate (llega a intentar consultar la BD)', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  const fetchMock = t.mock.method(globalThis, 'fetch', async function () {
    return { ok: true, json: async () => ({ activo: true, plan: 'premium', estado: 'activo' }) };
  });
  await license.checkLicense();
  fetchMock.mock.restore();

  t.mock.method(pool, 'query', async function () {
    return { rows: [{ count: '0' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/metrics/dashboard', {
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    assert.notEqual(res.status, 403);
  });
});
