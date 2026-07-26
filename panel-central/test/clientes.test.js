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

// --- Marca (ver AUDITORIA.md, "Branding desde el Panel Central") ---

test('PUT /api/clientes/:id: rechaza un color que no es hex de 6 dígitos', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes/5', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ color_primary: 'azul' })
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/clientes/:id: rechaza un favicon_url que no es http/https', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes/5', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ favicon_url: 'javascript:alert(1)' })
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/clientes/:id: acepta un color hex válido y lo guarda', async function (t) {
  t.mock.method(pool, 'query', async function (sql, values) {
    assert.match(sql, /color_primary=\$1/);
    return { rows: [{ id: 5, color_primary: values[0] }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes/5', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ color_primary: '#0000ff' })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.color_primary, '#0000ff');
  });
});

test('POST /api/clientes/:id/logo: sube un logo y lo guarda como base64', async function (t) {
  let updateValues = null;
  t.mock.method(pool, 'query', async function (sql, values) {
    updateValues = values;
    return { rows: [{ id: 5, logo_type: 'imagen', logo_image_mime: values[1] }] };
  });

  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    const bytes = new Uint8Array([137, 80, 78, 71]); // firma PNG, no hace falta un PNG real para el test
    formData.append('logo', new Blob([bytes], { type: 'image/png' }), 'logo.png');

    const res = await fetch(base + '/api/clientes/5/logo', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.logo_type, 'imagen');
    assert.equal(updateValues[1], 'image/png');
    assert.equal(updateValues[0], Buffer.from(bytes).toString('base64'));
  });
});

test('POST /api/clientes/:id/logo: rechaza un formato no soportado', async function () {
  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('logo', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'logo.pdf');

    const res = await fetch(base + '/api/clientes/5/logo', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/clientes/:id/logo: rechaza un archivo mas pesado que el limite', async function () {
  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    const big = new Uint8Array(301 * 1024);
    formData.append('logo', new Blob([big], { type: 'image/png' }), 'logo.png');

    const res = await fetch(base + '/api/clientes/5/logo', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    assert.equal(res.status, 400);
  });
});

test('DELETE /api/clientes/:id/logo: vuelve el cliente a logo de texto', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 5, logo_type: 'texto' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/clientes/5/logo', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.logo_type, 'texto');
  });
});
