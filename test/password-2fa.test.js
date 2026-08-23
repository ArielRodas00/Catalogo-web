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
  // propósito (ver el comentario en middleware/validate.js).
  ['reparacion de motos 2026', 'CalleMburucuya471', 'kokue rape guasu'].forEach(function (p) {
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

test('totp: un código recién generado se valida', async function () {
  const secreto = totp.generarSecreto();
  const otplib = require('otplib');
  const instancia = new otplib.TOTP({
    crypto: new otplib.NobleCryptoPlugin(),
    base32: new otplib.ScureBase32Plugin()
  });
  const codigo = await instancia.generate({ secret: secreto });

  assert.equal(await totp.verificar(codigo, secreto), true);
});

test('totp: rechaza un código incorrecto', async function () {
  const secreto = totp.generarSecreto();
  assert.equal(await totp.verificar('000000', secreto), false);
});

test('totp: rechaza formatos inválidos sin lanzar', async function () {
  const secreto = totp.generarSecreto();
  for (const malo of ['', null, undefined, 'abcdef', '12345', '1234567', 'no-es-un-codigo']) {
    assert.equal(await totp.verificar(malo, secreto), false, 'debe rechazar: ' + JSON.stringify(malo));
  }
});

test('totp: sin secreto siempre es inválido', async function () {
  assert.equal(await totp.verificar('123456', null), false);
  assert.equal(await totp.verificar('123456', ''), false);
});

test('totp: un código de OTRO secreto no sirve', async function () {
  // Es la propiedad que hace útil al 2FA: el código depende del secreto.
  const otplib = require('otplib');
  const instancia = new otplib.TOTP({
    crypto: new otplib.NobleCryptoPlugin(),
    base32: new otplib.ScureBase32Plugin()
  });
  const secretoA = totp.generarSecreto();
  const secretoB = totp.generarSecreto();
  const codigoDeA = await instancia.generate({ secret: secretoA });

  assert.equal(await totp.verificar(codigoDeA, secretoB), false);
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
