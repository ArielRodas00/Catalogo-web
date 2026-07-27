const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const imageStorage = require('../imagekit');
const productsRouter = require('../routes/products');
const { errorHandler } = require('../middleware/errorHandler');
const { withServer } = require('./helpers/testServer');

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

function pngBlob() {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
}

test('POST /:id/images/upload: requiere autenticación', async function () {
  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('image', pngBlob(), 'foto.png');
    const res = await fetch(base + '/api/products/1/images/upload', { method: 'POST', body: formData });
    assert.equal(res.status, 401);
  });
});

test('POST /:id/images/upload: sin ImageKit configurado, devuelve 503 (no cae en disco en silencio)', async function (t) {
  t.mock.method(imageStorage, 'isConfigured', function () { return false; });
  let uploadCalled = false;
  t.mock.method(imageStorage, 'uploadImage', async function () {
    uploadCalled = true;
    return { url: 'no-deberia-llegar-aca', fileId: 'x' };
  });

  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('image', pngBlob(), 'foto.png');
    const res = await fetch(base + '/api/products/1/images/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    assert.equal(res.status, 503);
    assert.equal(uploadCalled, false, 'no debe intentar subir nada si no está configurado');
  });
});

test('POST /:id/images/upload: con ImageKit configurado, sube el archivo y guarda url + file_id', async function (t) {
  t.mock.method(imageStorage, 'isConfigured', function () { return true; });
  let receivedBuffer = null;
  t.mock.method(imageStorage, 'uploadImage', async function (buffer) {
    receivedBuffer = buffer;
    return { url: 'https://ik.imagekit.io/demo/catalogo/abc.png', fileId: 'file_abc123' };
  });
  let insertedValues = null;
  t.mock.method(pool, 'query', async function (sql, values) {
    insertedValues = values;
    // orden ya no es un parámetro (se calcula con una subquery en el SQL —
    // ver el test de "calcula orden dinámicamente" más abajo), por eso acá
    // solo hay 3 valores: producto_id, url, file_id.
    return { rows: [{ id: 9, producto_id: values[0], url: values[1], imagekit_file_id: values[2] }] };
  });

  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('image', pngBlob(), 'foto.png');
    const res = await fetch(base + '/api/products/1/images/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.url, 'https://ik.imagekit.io/demo/catalogo/abc.png');
    assert.equal(body.imagekit_file_id, 'file_abc123');
    assert.ok(Buffer.isBuffer(receivedBuffer), 'el archivo debe pasarse como buffer, nunca escribirse a disco');
    assert.equal(insertedValues[2], 'file_abc123');
  });
});

test('DELETE /images/:imageId: si la imagen tiene file_id, también la borra de ImageKit', async function (t) {
  let deletedFileId = null;
  t.mock.method(imageStorage, 'deleteImage', async function (fileId) {
    deletedFileId = fileId;
  });
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ imagekit_file_id: 'file_abc123' }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/images/9', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    assert.equal(res.status, 200);
    assert.equal(deletedFileId, 'file_abc123');
  });
});

// --- orden: nunca hardcodeado en 0 (bug real, ver AUDITORIA.md) ---
// Antes, subir una segunda imagen adicional al mismo producto chocaba con
// la restricción UNIQUE (producto_id, orden) porque orden quedaba siempre
// en 0. Ahora se calcula con un MAX(orden)+1 por producto.

test('POST /:id/images/upload: calcula "orden" dinámicamente, nunca lo hardcodea en 0', async function (t) {
  t.mock.method(imageStorage, 'isConfigured', function () { return true; });
  t.mock.method(imageStorage, 'uploadImage', async function () {
    return { url: 'https://ik.imagekit.io/demo/catalogo/x.png', fileId: 'file_x' };
  });
  let sqlUsed = null;
  t.mock.method(pool, 'query', async function (sql) {
    sqlUsed = sql;
    return { rows: [{ id: 9 }] };
  });

  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('image', pngBlob(), 'foto.png');
    await fetch(base + '/api/products/1/images/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    assert.match(sqlUsed, /COALESCE\(MAX\(orden\), -1\) \+ 1/);
    assert.doesNotMatch(sqlUsed, /VALUES \(\$1, \$2, 0,/, 'orden no debe seguir hardcodeado en 0');
  });
});

test('POST /:id/images/url: calcula "orden" dinámicamente, nunca lo hardcodea en 0', async function (t) {
  let sqlUsed = null;
  t.mock.method(pool, 'query', async function (sql) {
    sqlUsed = sql;
    return { rows: [{ id: 9 }] };
  });

  await withServer(buildApp(), async function (base) {
    await fetch(base + '/api/products/1/images/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify({ url: 'https://example.com/foto.png' })
    });
    assert.match(sqlUsed, /COALESCE\(MAX\(orden\), -1\) \+ 1/);
  });
});

// --- Imagen principal (subida suelta, sin producto asociado todavía) ---

test('POST /upload-image: requiere autenticación', async function () {
  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('image', pngBlob(), 'foto.png');
    const res = await fetch(base + '/api/products/upload-image', { method: 'POST', body: formData });
    assert.equal(res.status, 401);
  });
});

test('POST /upload-image: sin ImageKit configurado, devuelve 503', async function (t) {
  t.mock.method(imageStorage, 'isConfigured', function () { return false; });

  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('image', pngBlob(), 'foto.png');
    const res = await fetch(base + '/api/products/upload-image', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    assert.equal(res.status, 503);
  });
});

test('POST /upload-image: sube el archivo y devuelve url + fileId, sin tocar la base', async function (t) {
  t.mock.method(imageStorage, 'isConfigured', function () { return true; });
  t.mock.method(imageStorage, 'uploadImage', async function () {
    return { url: 'https://ik.imagekit.io/demo/catalogo/principal.png', fileId: 'file_principal1' };
  });
  let queryCalled = false;
  t.mock.method(pool, 'query', async function () {
    queryCalled = true;
    return { rows: [] };
  });

  await withServer(buildApp(), async function (base) {
    const formData = new FormData();
    formData.append('image', pngBlob(), 'foto.png');
    const res = await fetch(base + '/api/products/upload-image', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken() },
      body: formData
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.url, 'https://ik.imagekit.io/demo/catalogo/principal.png');
    assert.equal(body.fileId, 'file_principal1');
    assert.equal(queryCalled, false, 'este endpoint no debe tocar la base — solo sube y devuelve la url');
  });
});

test('DELETE /images/:imageId: si la imagen se cargó por URL externa (sin file_id), no llama a ImageKit', async function (t) {
  let deleteCalled = false;
  t.mock.method(imageStorage, 'deleteImage', async function () {
    deleteCalled = true;
  });
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ imagekit_file_id: null }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/products/images/10', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + authToken() }
    });
    assert.equal(res.status, 200);
    assert.equal(deleteCalled, false);
  });
});
