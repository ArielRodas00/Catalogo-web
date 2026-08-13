const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { withServer } = require('./helpers/testServer');

// El endpoint vive en server.js, que al importarse levanta cosas (pool,
// licenseCheck). Como server.js ahora exporta la app y solo escucha si lo
// ejecutan directamente, se puede montar en un servidor de test sin que abra
// un puerto propio.
const app = require('../server');

test('GET /api/internal/refresh-license: sin CRON_SECRET el endpoint no existe', async function () {
  delete process.env.CRON_SECRET;

  await withServer(app, async function (base) {
    const res = await fetch(base + '/api/internal/refresh-license');
    // Un deploy que no usa cron no debe quedar con una ruta de más expuesta.
    assert.equal(res.status, 404);
  });
});

test('GET /api/internal/refresh-license: rechaza sin el secreto correcto', async function () {
  process.env.CRON_SECRET = 'secreto-de-prueba';

  await withServer(app, async function (base) {
    const sinHeader = await fetch(base + '/api/internal/refresh-license');
    assert.equal(sinHeader.status, 401, 'sin Authorization debe rechazar');

    const conSecretoMalo = await fetch(base + '/api/internal/refresh-license', {
      headers: { Authorization: 'Bearer otro-secreto' }
    });
    assert.equal(conSecretoMalo.status, 401, 'con el secreto equivocado debe rechazar');
  });

  delete process.env.CRON_SECRET;
});

test('GET /api/internal/refresh-license: con el secreto correcto refresca y responde el estado', async function () {
  process.env.CRON_SECRET = 'secreto-de-prueba';
  // Sin PANEL_CENTRAL_URL el deploy es standalone: checkLicense() no toca la
  // red, así que el test no depende de nada externo.
  delete process.env.PANEL_CENTRAL_URL;
  delete process.env.CLIENTE_API_KEY;

  await withServer(app, async function (base) {
    const res = await fetch(base + '/api/internal/refresh-license', {
      headers: { Authorization: 'Bearer secreto-de-prueba' }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.plan, 'premium', 'en standalone el plan es premium');
    assert.equal(body.estado, 'standalone');
  });

  delete process.env.CRON_SECRET;
});
