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
    return { rows: [{ id: 9, producto_id: values[0], url: values[1], orden: values[2], imagekit_file_id: values[3] }] };
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
    assert.equal(insertedValues[3], 'file_abc123');
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
