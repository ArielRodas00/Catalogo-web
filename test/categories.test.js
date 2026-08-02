const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const categoriesRouter = require('../routes/categories');
const { errorHandler } = require('../middleware/errorHandler');
const { withServer } = require('./helpers/testServer');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/categories', categoriesRouter);
  app.use(errorHandler);
  return app;
}

test('GET /resumen: devuelve categoría, cantidad e imagen para el mosaico', async function (t) {
  let sqlEjecutado = '';
  t.mock.method(pool, 'query', async function (sql) {
    sqlEjecutado = sql;
    return {
      rows: [
        { category: 'aceite', cantidad: 4, image: 'https://ik.imagekit.io/x/aceite.png' },
        { category: 'freno', cantidad: 2, image: 'https://ik.imagekit.io/x/freno.png' }
      ]
    };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/categories/resumen');
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.deepEqual(body, [
      { category: 'aceite', cantidad: 4, image: 'https://ik.imagekit.io/x/aceite.png' },
      { category: 'freno', cantidad: 2, image: 'https://ik.imagekit.io/x/freno.png' }
    ]);
  });

  // El conteo tiene que ser por categoría (window function), no el total:
  // sin el PARTITION BY, el DISTINCT ON dejaría cantidad=1 en todas.
  assert.match(sqlEjecutado, /COUNT\(\*\) OVER \(PARTITION BY category\)/);
  assert.match(sqlEjecutado, /DISTINCT ON \(category\)/);
  // Prefiere como representante un producto que tenga imagen
  assert.match(sqlEjecutado, /image IS NULL OR btrim\(image\) = ''/);
});

test('GET /resumen: normaliza a null la imagen ausente en vez de romper', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ category: 'casco', cantidad: 1, image: null }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/categories/resumen');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 1);
    assert.equal(body[0].image, null);
    assert.equal(body[0].cantidad, 1);
  });
});

test('GET /: sigue devolviendo el mapa {categoria: [subcategorias]} que usan los filtros', async function (t) {
  // Esta forma la consumen filters.js (x2) y storage.js: el endpoint del
  // mosaico se agregó aparte justamente para no cambiarla.
  t.mock.method(pool, 'query', async function () {
    return {
      rows: [
        { category: 'aceite', subcategoria: 'mineral' },
        { category: 'aceite', subcategoria: 'sintético' },
        { category: 'freno', subcategoria: null }
      ]
    };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/categories');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      aceite: ['mineral', 'sintético'],
      freno: []
    });
  });
});
