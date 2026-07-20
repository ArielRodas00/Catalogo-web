const test = require('node:test');
const assert = require('node:assert/strict');

const license = require('../licenseCheck');

test('getLicense: sin PANEL_CENTRAL_URL/CLIENTE_API_KEY es standalone (premium, activo)', function () {
  delete process.env.PANEL_CENTRAL_URL;
  delete process.env.CLIENTE_API_KEY;
  license._resetForTests();

  const result = license.getLicense();
  assert.equal(result.plan, 'premium');
  assert.equal(result.activo, true);
  assert.equal(result.estado, 'standalone');
});

test('getLicense: sin haber podido verificar nunca, degrada a basico pero sigue activo', function () {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  const result = license.getLicense();
  assert.equal(result.plan, 'basico');
  assert.equal(result.activo, true, 'nunca debe bloquear el sitio por falta de verificación');
  assert.equal(result.estado, 'sin_verificar');
});

test('checkLicense: guarda el resultado de una consulta exitosa y getLicense lo refleja', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  t.mock.method(globalThis, 'fetch', async function (url, options) {
    assert.equal(url, 'http://panel-central.test/api/licencia');
    assert.equal(options.headers['X-API-Key'], 'test-key');
    return {
      ok: true,
      json: async () => ({ activo: true, plan: 'premium', estado: 'activo' })
    };
  });

  await license.checkLicense();
  const result = license.getLicense();
  assert.deepEqual(
    { plan: result.plan, activo: result.activo, estado: result.estado },
    { plan: 'premium', activo: true, estado: 'activo' }
  );
});

test('checkLicense: una cuenta suspendida se refleja como activo:false (nunca lo inventa una falla de red)', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  t.mock.method(globalThis, 'fetch', async function () {
    return {
      ok: true,
      json: async () => ({ activo: false, plan: 'premium', estado: 'suspendido' })
    };
  });

  await license.checkLicense();
  const result = license.getLicense();
  assert.equal(result.activo, false);
  assert.equal(result.estado, 'suspendido');
});

test('checkLicense: si el Panel Central no responde, no rompe y getLicense sigue devolviendo un valor seguro', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  t.mock.method(globalThis, 'fetch', async function () {
    throw new Error('ECONNREFUSED');
  });

  await assert.doesNotReject(license.checkLicense());
  const result = license.getLicense();
  assert.equal(result.activo, true, 'una caída del Panel Central nunca debe bloquear el sitio del cliente');
});
