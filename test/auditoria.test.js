const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const pool = require('../db');
const auditoria = require('../auditoria');

// Espera a que se resuelva el INSERT que registrar() dispara sin esperar
// (fire and forget). Sin esto los asserts correrían antes.
function tick() {
  return new Promise(function (r) { setImmediate(r); });
}

test('registrar: guarda usuario, acción y entidad', async function (t) {
  let params = null;
  t.mock.method(pool, 'query', async function (sql, valores) {
    params = valores;
    return { rows: [] };
  });

  auditoria.registrar(
    { headers: {}, ip: '1.2.3.4', user: { id: 7, username: 'admin' } },
    'borrar', 'productos', 42, 'un detalle'
  );
  await tick();

  assert.equal(params[0], 'admin', 'usuario');
  assert.equal(params[1], 7, 'usuario_id');
  assert.equal(params[2], 'borrar', 'accion');
  assert.equal(params[3], 'productos', 'entidad');
  assert.equal(params[4], '42', 'entidad_id como texto');
  assert.equal(params[5], 'un detalle');
});

test('registrar: acepta un usuario explícito (caso del login)', async function (t) {
  // En el login todavía no existe req.user —recién se está autenticando—
  // pero igual queremos registrar quién entró o quién falló al intentarlo.
  let params = null;
  t.mock.method(pool, 'query', async function (sql, valores) { params = valores; return { rows: [] }; });

  auditoria.registrar({ headers: {} }, 'login', 'sesion', 1, null, { id: 9, username: 'otro' });
  await tick();

  assert.equal(params[0], 'otro');
  assert.equal(params[1], 9);
});

test('registrar: NUNCA rompe la operación si falla el INSERT', async function (t) {
  // Es la propiedad de diseño del módulo: auditar es secundario, la operación
  // que se está auditando no puede caerse porque el registro falle.
  t.mock.method(pool, 'query', async function () { throw new Error('base caida'); });

  assert.doesNotThrow(function () {
    auditoria.registrar({ headers: {}, user: { id: 1, username: 'admin' } }, 'crear', 'productos', 1);
  });
  await tick();
});

test('registrar: recorta un detalle demasiado largo', async function (t) {
  let params = null;
  t.mock.method(pool, 'query', async function (sql, valores) { params = valores; return { rows: [] }; });

  auditoria.registrar({ headers: {} }, 'x', 'y', 1, 'a'.repeat(5000));
  await tick();

  assert.ok(params[5].length <= 1000, 'el detalle no debe crecer sin límite');
});

test('ipDe: prefiere X-Forwarded-For (la IP real detrás de un proxy)', function () {
  // En Vercel o Render la IP de la conexión es la del proxy; la del visitante
  // viene en este header, y el primer valor es el cliente original.
  assert.equal(
    auditoria.ipDe({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, ip: '10.0.0.1' }),
    '203.0.113.5'
  );
});

test('ipDe: cae a req.ip si no hay header', function () {
  assert.equal(auditoria.ipDe({ headers: {}, ip: '192.168.1.1' }), '192.168.1.1');
});

test('ipDe: no explota si faltan headers', function () {
  // Defensivo a propósito: esta función corre dentro del registro de
  // auditoría, y auditar no puede tumbar la operación que audita.
  assert.doesNotThrow(function () { auditoria.ipDe({}); });
  assert.doesNotThrow(function () { auditoria.ipDe(undefined); });
});

test('middleware: NO registra lecturas ni escrituras anónimas', async function (t) {
  let llamadas = 0;
  t.mock.method(pool, 'query', async function () { llamadas++; return { rows: [] }; });

  // GET: no es escritura
  const resGet = { on: function (ev, cb) { if (ev === 'finish') cb(); } };
  auditoria.middleware({ method: 'GET', headers: {}, user: { id: 1 } }, resGet, function () {});

  // POST sin usuario: es una métrica pública del catálogo, sería solo ruido
  const resAnon = { on: function (ev, cb) { if (ev === 'finish') cb(); }, statusCode: 200 };
  auditoria.middleware({ method: 'POST', headers: {}, baseUrl: '/api/metrics' }, resAnon, function () {});

  await tick();
  assert.equal(llamadas, 0);
});

test('middleware: registra una escritura autenticada', async function (t) {
  let accion = null;
  t.mock.method(pool, 'query', async function (sql, valores) { accion = valores[2]; return { rows: [] }; });

  const res = { on: function (ev, cb) { if (ev === 'finish') cb(); }, statusCode: 201 };
  auditoria.middleware(
    { method: 'POST', headers: {}, baseUrl: '/api/products', path: '/', params: {}, user: { id: 1, username: 'admin' } },
    res,
    function () {}
  );
  await tick();

  assert.equal(accion, 'post');
});

test('middleware: marca como fallida una escritura con error', async function (t) {
  let accion = null;
  t.mock.method(pool, 'query', async function (sql, valores) { accion = valores[2]; return { rows: [] }; });

  const res = { on: function (ev, cb) { if (ev === 'finish') cb(); }, statusCode: 500 };
  auditoria.middleware(
    { method: 'DELETE', headers: {}, baseUrl: '/api/products', path: '/1', params: { id: '1' }, user: { id: 1, username: 'admin' } },
    res,
    function () {}
  );
  await tick();

  assert.equal(accion, 'delete_fallido');
});

test('middleware: no duplica el registro de /api/auth (ya se audita allí)', async function (t) {
  let llamadas = 0;
  t.mock.method(pool, 'query', async function () { llamadas++; return { rows: [] }; });

  const res = { on: function (ev, cb) { if (ev === 'finish') cb(); }, statusCode: 200 };
  auditoria.middleware(
    { method: 'POST', headers: {}, baseUrl: '/api/auth', path: '/login', params: {}, user: { id: 1, username: 'admin' } },
    res,
    function () {}
  );
  await tick();

  assert.equal(llamadas, 0, 'routes/auth.js ya registra estos eventos con más detalle');
});
