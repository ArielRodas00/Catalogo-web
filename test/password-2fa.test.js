const test = require('node:test');
const assert = require('node:assert/strict');

const { validarPassword, PASSWORD_MIN } = require('../middleware/validate');
const totp = require('../totp');

// ============================================================
// Fortaleza de contraseña
// ============================================================

test('validarPassword: rechaza las más cortas que el mínimo', function () {
  const errores = validarPassword('corta1', 'admin');
  assert.ok(errores.length > 0);
  assert.match(errores[0], new RegExp(String(PASSWORD_MIN)));
});

test('validarPassword: rechaza contraseñas comunes', function () {
  ['password123', 'contrasena', '1234567890', 'admin12345'].forEach(function (p) {
    assert.ok(validarPassword(p, 'admin').length > 0, 'debe rechazar: ' + p);
  });
});

test('validarPassword: rechaza que contenga el nombre de usuario', function () {
  // El caso realista: el dueño de la tienda poniendo su propio usuario como clave.
  const errores = validarPassword('MiTiendaAdmin2026', 'mitienda');
  assert.ok(errores.some(function (e) { return /nombre de usuario/i.test(e); }));
});

test('validarPassword: rechaza un mismo carácter repetido', function () {
  assert.ok(validarPassword('aaaaaaaaaaaa', 'admin').length > 0);
});

test('validarPassword: acepta una contraseña razonable', function () {
  // Larga y sin patrones obvios; no se exigen símbolos ni mayúsculas a
  // propósito (ver password.js).
  //
  // Se quitó 'reparacion de motos 2026' de esta lista: la validación se
  // endureció y ahora la rechaza, con razón — contiene "moto" (una palabra
  // obvia para este sistema) y un año, que es de lo primero que se prueba.
  ['CalleMburucuya471', 'kokue rape guasu', 'tortuga verde bajo la mesa'].forEach(function (p) {
    assert.deepEqual(validarPassword(p, 'admin'), [], 'debe aceptar: ' + p);
  });
});

test('validarPassword: no explota con entradas que no son texto', function () {
  assert.ok(validarPassword(undefined, 'admin').length > 0);
  assert.ok(validarPassword(null, 'admin').length > 0);
  assert.ok(validarPassword(12345678901, 'admin').length > 0);
});

// ============================================================
// Segundo factor (TOTP)
// ============================================================

// TOTP se implementa a mano sobre node:crypto (ver totp.js): la librería que
// se usaba antes arrastraba una dependencia ESM que **tumbó el sitio entero**
// en Vercel. Estos dos tests son la garantía de que la implementación propia
// es correcta y no "casi correcta".

test('totp: pasa los vectores de prueba oficiales del RFC 6238', function () {
  // Secreto del RFC: la cadena '12345678901234567890' en base32.
  const secreto = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const vectores = [
    [59000, '287082'],
    [1111111109000, '081804'],
    [1234567890000, '005924'],
    [2000000000000, '279037']
  ];
  for (const [epochMs, esperado] of vectores) {
    assert.equal(totp.generar(secreto, epochMs), esperado, 'vector RFC en ' + epochMs);
  }
});

test('totp: coincide con otplib para los mismos secretos', async function () {
  // otplib quedó como dependencia SOLO de desarrollo, justamente para poder
  // contrastar sin arrastrarlo a producción.
  const otplib = require('otplib');
  const instancia = new otplib.TOTP({
    crypto: new otplib.NobleCryptoPlugin(),
    base32: new otplib.ScureBase32Plugin()
  });

  for (let i = 0; i < 10; i++) {
    const secreto = totp.generarSecreto();
    const mio = totp.generar(secreto);
    const deOtplib = await instancia.generate({ secret: secreto });
    assert.equal(mio, deOtplib, 'debe coincidir para el secreto ' + secreto);
  }
});

test('totp: un código recién generado se valida', function () {
  const secreto = totp.generarSecreto();
  assert.equal(totp.verificar(totp.generar(secreto), secreto), true);
});

test('totp: acepta un código de la ventana anterior (reloj corrido)', function () {
  // La causa más común de "mi código no funciona" es el reloj del teléfono
  // algo desfasado; se tolera una ventana de 30s hacia cada lado.
  const secreto = totp.generarSecreto();
  const ahora = Date.now();
  const codigoAnterior = totp.generar(secreto, ahora - 30000);
  assert.equal(totp.verificar(codigoAnterior, secreto, ahora), true);
});

test('totp: rechaza un código demasiado viejo', function () {
  const secreto = totp.generarSecreto();
  const ahora = Date.now();
  const codigoViejo = totp.generar(secreto, ahora - 5 * 60 * 1000);
  assert.equal(totp.verificar(codigoViejo, secreto, ahora), false);
});

test('totp: rechaza un código incorrecto', function () {
  const secreto = totp.generarSecreto();
  assert.equal(totp.verificar('000000', secreto), false);
});

test('totp: rechaza formatos inválidos sin lanzar', function () {
  const secreto = totp.generarSecreto();
  for (const malo of ['', null, undefined, 'abcdef', '12345', '1234567', 'no-es-un-codigo']) {
    assert.equal(totp.verificar(malo, secreto), false, 'debe rechazar: ' + JSON.stringify(malo));
  }
});

test('totp: sin secreto siempre es inválido', function () {
  assert.equal(totp.verificar('123456', null), false);
  assert.equal(totp.verificar('123456', ''), false);
});

test('totp: un código de OTRO secreto no sirve', function () {
  // Es la propiedad que hace útil al 2FA: el código depende del secreto.
  const secretoA = totp.generarSecreto();
  const secretoB = totp.generarSecreto();
  assert.equal(totp.verificar(totp.generar(secretoA), secretoB), false);
});

test('totp: genera un QR utilizable como <img src>', async function () {
  const secreto = totp.generarSecreto();
  const qr = await totp.generarQr(secreto, 'admin', 'PiezaExpress');
  assert.match(qr, /^data:image\/png;base64,/);
});

test('totp: la URI incluye el emisor y el usuario', function () {
  const uri = totp.generarUri(totp.generarSecreto(), 'admin', 'MiTienda');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /MiTienda/);
  assert.match(uri, /admin/);
});
