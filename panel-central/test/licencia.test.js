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

test('GET /api/licencia: sin marca cargada, devuelve branding con todo null (el catálogo usa sus defaults)', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, nombre: 'Villalba', slug: 'villalba', plan: 'basico', estado: 'activo', logo_type: 'texto' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/licencia', {
      headers: { 'X-API-Key': 'una-key-valida' }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.branding.logoType, 'texto');
    assert.equal(body.branding.colorPrimary, null);
    assert.equal(body.branding.logoImageDataUri, null);
  });
});

test('GET /api/licencia: con marca cargada (color + logo de imagen), la devuelve armada', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return {
      rows: [{
        id: 1, nombre: 'Villalba', slug: 'villalba', plan: 'premium', estado: 'activo',
        logo_type: 'imagen', logo_image_data: 'QUJD', logo_image_mime: 'image/png',
        store_name: 'Repuestos Villalba', store_name_accent: 'Villalba',
        favicon_url: 'https://villalba.com/favicon.svg',
        color_primary: '#0000ff', color_primary_hover: '#3333ff', color_accent: '#001133'
      }]
    };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/licencia', {
      headers: { 'X-API-Key': 'una-key-valida' }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.branding.logoType, 'imagen');
    assert.equal(body.branding.logoImageDataUri, 'data:image/png;base64,QUJD');
    assert.equal(body.branding.storeName, 'Repuestos Villalba');
    assert.equal(body.branding.colorPrimary, '#0000ff');
  });
});
