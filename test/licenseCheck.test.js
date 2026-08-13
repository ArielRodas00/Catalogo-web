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

test('getLicense: sin haber podido verificar nunca, degrada a basico pero sigue activo', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  // Hace falta mockear fetch aunque el test no lo use directamente: sin cache,
  // getLicense() dispara un refresco en segundo plano, y sin mock eso sería
  // una petición de red real (lenta, y falla sin conexión).
  t.mock.method(globalThis, 'fetch', async function () {
    throw new Error('ECONNREFUSED');
  });

  const result = license.getLicense();
  assert.equal(result.plan, 'basico');
  assert.equal(result.activo, true, 'nunca debe bloquear el sitio por falta de verificación');
  assert.equal(result.estado, 'sin_verificar');

  await license._pendingRefresh();
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

// ============================================================
// Refresco perezoso (reemplaza al setInterval, ver AUDITORIA.md)
// ============================================================
// Es lo que mantiene vivo el plan y la marca del cliente en un hosting
// serverless, donde un setInterval de 6hs nunca llega a dispararse.

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

// Envejece artificialmente el cache: getLicense() no expone una forma de
// manipular checkedAt, así que se lo movemos hacia atrás vía el objeto que
// devuelve (es la misma referencia que guarda el módulo).
function envejecerCache(ms) {
  const actual = license.getLicense();
  actual.checkedAt -= ms;
}

async function cargarCacheInicial(t, respuesta) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();
  const mock = t.mock.method(globalThis, 'fetch', async function () {
    return { ok: true, json: async () => respuesta };
  });
  await license.checkLicense();
  mock.mock.resetCalls();
  return mock;
}

test('getLicense: con el cache fresco no dispara ningún chequeo', async function (t) {
  const mock = await cargarCacheInicial(t, { activo: true, plan: 'premium', estado: 'activo' });

  license.getLicense();
  license.getLicense();
  license.getLicense();

  assert.equal(mock.mock.callCount(), 0, 'no debe consultar al Panel Central si el cache está fresco');
});

test('getLicense: con el cache vencido dispara el refresco en segundo plano', async function (t) {
  const mock = await cargarCacheInicial(t, { activo: true, plan: 'premium', estado: 'activo' });
  envejecerCache(SEIS_HORAS_MS + 1000);

  license.getLicense();
  // El refresco es fire-and-forget: esperamos la promesa en curso en vez de
  // dormir un rato arbitrario, así el test es determinístico y no deja
  // trabajo colgando que termine durante el test siguiente.
  await license._pendingRefresh();

  assert.equal(mock.mock.callCount(), 1, 'debe refrescar cuando el cache venció');
});

test('getLicense: nunca bloquea, aunque el Panel Central tarde', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  // Un Panel Central que tarda 5 segundos en responder.
  t.mock.method(globalThis, 'fetch', function () {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ ok: true, json: async () => ({ activo: true, plan: 'premium', estado: 'activo' }) });
      }, 5000);
    });
  });

  const inicio = Date.now();
  const result = license.getLicense();
  const duracion = Date.now() - inicio;

  // Esta es LA propiedad que no se puede perder: getLicense() lo llaman rutas
  // que están respondiendo un request. Si esperara la red, cada visita al
  // catálogo cargaría con la latencia del Panel Central.
  assert.ok(duracion < 100, 'getLicense debe devolver al instante (tardó ' + duracion + 'ms)');
  assert.equal(result.activo, true, 'devuelve un valor seguro mientras refresca');
});

test('getLicense: muchos requests concurrentes disparan un solo chequeo (sin estampida)', async function (t) {
  const mock = await cargarCacheInicial(t, { activo: true, plan: 'premium', estado: 'activo' });
  envejecerCache(SEIS_HORAS_MS + 1000);

  // 50 visitas simultáneas con el cache vencido no deben generar 50 consultas
  // al Panel Central.
  for (let i = 0; i < 50; i++) license.getLicense();
  await license._pendingRefresh();

  assert.equal(mock.mock.callCount(), 1, 'debe consultar una sola vez, no una por request');
});

test('getLicense: mantiene la degradación a basico pasadas las 48hs', async function (t) {
  await cargarCacheInicial(t, { activo: true, plan: 'premium', estado: 'activo' });
  envejecerCache(49 * 60 * 60 * 1000);

  const result = license.getLicense();
  assert.equal(result.plan, 'basico', 'tras 48hs sin confirmar debe degradar');
  assert.equal(result.estado, 'desconocido');
  assert.equal(result.activo, true, 'pero el sitio sigue funcionando');
});

test('getLicense: en standalone no consulta la red ni con el cache vencido', async function (t) {
  delete process.env.PANEL_CENTRAL_URL;
  delete process.env.CLIENTE_API_KEY;
  license._resetForTests();

  const mock = t.mock.method(globalThis, 'fetch', async function () {
    throw new Error('no debería llamarse en standalone');
  });

  const result = license.getLicense();
  await license._pendingRefresh();

  assert.equal(result.plan, 'premium');
  assert.equal(mock.mock.callCount(), 0, 'un deploy standalone no depende del Panel Central');
});

test('si el chequeo falla siempre, no martilla al Panel Central en cada request', async function (t) {
  // Regresión real detectada al desplegar: con el chequeo fallando de forma
  // persistente (Panel Central caído, o CLIENTE_API_KEY mal configurada),
  // lastGood nunca se llena, así que el cache siempre está "vencido". Sin una
  // espera mínima entre intentos, cada visita al catálogo dispararía una
  // consulta nueva — con el setInterval viejo reintentaba cada 6hs.
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  const mock = t.mock.method(globalThis, 'fetch', async function () {
    throw new Error('ECONNREFUSED');
  });

  // 100 visitas seguidas con el chequeo fallando.
  for (let i = 0; i < 100; i++) {
    license.getLicense();
    await license._pendingRefresh();
  }

  assert.equal(mock.mock.callCount(), 1, 'debe reintentar con espera, no en cada request');
});

test('un fallo del refresco no deja el flag trabado (los siguientes siguen intentando)', async function (t) {
  process.env.PANEL_CENTRAL_URL = 'http://panel-central.test';
  process.env.CLIENTE_API_KEY = 'test-key';
  license._resetForTests();

  const mock = t.mock.method(globalThis, 'fetch', async function () {
    throw new Error('ECONNREFUSED');
  });

  // Sin cache: el primer getLicense dispara un refresco que falla.
  license.getLicense();
  await license._pendingRefresh();
  assert.equal(mock.mock.callCount(), 1);

  // Pasada la espera mínima entre intentos, tiene que volver a intentar. Si el
  // flag `refreshing` hubiera quedado trabado en true, este segundo intento no
  // dispararía nada y el deploy quedaría degradado a basico para siempre.
  license._allowRetryNowForTests();
  license.getLicense();
  await license._pendingRefresh();
  assert.equal(mock.mock.callCount(), 2, 'tras un fallo debe poder reintentar');
});
