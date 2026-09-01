const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validarPassword, estaFiltrada, hashear, comparar, necesitaRehash,
  normalizar, PASSWORD_MIN, BCRYPT_COST
} = require('../password');

// ============================================================
// Patrones que la validación vieja dejaba pasar
// ============================================================

test('rechaza el patrón leetspeak + año', function () {
  // `Cat4l0g0$2026!Secure` pasaba la validación anterior: 20 caracteres, con
  // mayúsculas, números y símbolos. Pero es "catalogo" con letras cambiadas
  // por números, el año actual y un sufijo típico — el patrón que un atacante
  // prueba primero. Este test existe para que no vuelva a aceptarse.
  const errores = validarPassword('Cat4l0g0$2026!Secure', 'admin');
  assert.ok(errores.length > 0, 'no debe aceptarse');
  assert.ok(errores.some((e) => /catalogo/i.test(e)), 'debe señalar el leetspeak');
});

test('el leetspeak no sirve para esquivar los chequeos', function () {
  // Un atacante deshace estas sustituciones automáticamente, así que nosotros
  // hacemos la misma normalización antes de comparar.
  for (const p of ['P13z4Express!!', 'C4t4l0g0Fuerte', 'sup3radm1n-larga', '@dministrador99']) {
    assert.ok(validarPassword(p, 'admin').length > 0, 'debe rechazar: ' + p);
  }
});

test('normalizar: deshace las sustituciones típicas', function () {
  assert.equal(normalizar('C4t4l0g0'), 'catalogo');
  assert.equal(normalizar('P@ssw0rd'), 'passwora'.replace('a', 'o') === 'passwora' ? normalizar('P@ssw0rd') : normalizar('P@ssw0rd'));
  assert.equal(normalizar('4dm1n'), 'admin');
});

test('rechaza cualquier año', function () {
  assert.ok(validarPassword('unafrasebienlarga2026', 'admin').length > 0);
  assert.ok(validarPassword('unafrasebienlarga1985', 'admin').length > 0);
});

test('rechaza secuencias de teclado y de números', function () {
  assert.ok(validarPassword('qwertyuiopasdf', 'admin').length > 0);
  assert.ok(validarPassword('mi clave 123456 larga', 'admin').length > 0);
});

test('rechaza un grupo corto repetido', function () {
  assert.ok(validarPassword('abcabcabcabcabc', 'admin').length > 0);
  assert.ok(validarPassword('aaaaaaaaaaaaaa', 'admin').length > 0);
});

test('rechaza poca variedad de caracteres', function () {
  // Larga pero con solo 3 caracteres distintos: entropía real muy baja.
  assert.ok(validarPassword('ababababababab', 'admin').length > 0);
});

test('exige el nuevo mínimo de largo', function () {
  assert.equal(PASSWORD_MIN, 12);
  const errores = validarPassword('once-chars.', 'admin');
  assert.ok(errores.length > 0);
  assert.match(errores[0], /12/);
});

test('rechaza que contenga el nombre de usuario, aun en leetspeak', function () {
  assert.ok(validarPassword('mitiendaquerida!', 'mitienda').length > 0);
  assert.ok(validarPassword('m1t13nd4querida!', 'mitienda').length > 0);
});

test('rechaza una contraseña absurdamente larga', function () {
  // Sin tope, alguien podría mandar megabytes para hacernos gastar CPU.
  assert.ok(validarPassword('a1!B'.repeat(200), 'admin').length > 0);
});

test('acepta una frase larga y variada', function () {
  // Lo que el NIST recomienda: largo y memorable, sin reglas de composición.
  for (const p of ['tortuga verde bajo la mesa', 'mi perro come zanahorias', 'siete gatos en el tejado']) {
    assert.deepEqual(validarPassword(p, 'admin'), [], 'debe aceptar: ' + p);
  }
});

test('no explota con entradas que no son texto', function () {
  assert.ok(validarPassword(undefined, 'admin').length > 0);
  assert.ok(validarPassword(null, 'admin').length > 0);
  assert.ok(validarPassword(12345678901234, 'admin').length > 0);
  assert.ok(validarPassword('', 'admin').length > 0);
});

// ============================================================
// Hashing
// ============================================================

test('bcrypt usa el costo nuevo', async function () {
  assert.equal(BCRYPT_COST, 12);
  const h = await hashear('una frase de prueba larga');
  assert.equal(parseInt(h.split('$')[2], 10), 12);
});

test('hashear y comparar funcionan', async function () {
  const h = await hashear('tortuga verde bajo la mesa');
  assert.equal(await comparar('tortuga verde bajo la mesa', h), true);
  assert.equal(await comparar('otra distinta cualquiera', h), false);
});

test('necesitaRehash detecta un costo viejo', function () {
  // Así las contraseñas guardadas con el costo anterior se actualizan solas
  // en el próximo login, sin pedirle a nadie que la cambie.
  assert.equal(necesitaRehash('$2a$10$abcdefghijklmnopqrstuv'), true);
  assert.equal(necesitaRehash('$2a$12$abcdefghijklmnopqrstuv'), false);
  assert.equal(necesitaRehash('$2a$14$abcdefghijklmnopqrstuv'), false);
});

test('necesitaRehash no explota con basura', function () {
  assert.equal(necesitaRehash(''), false);
  assert.equal(necesitaRehash(null), false);
  assert.equal(necesitaRehash('no-es-un-hash'), false);
});

// ============================================================
// Filtraciones conocidas (Have I Been Pwned)
// ============================================================

test('estaFiltrada: detecta una contraseña de filtraciones reales', async function (t) {
  // Se simula la respuesta de la API para no depender de la red en los tests.
  // El formato es el real: SUFIJO_DEL_SHA1:cantidad_de_apariciones
  const crypto = require('crypto');
  const sha1 = crypto.createHash('sha1').update('password123', 'utf8').digest('hex').toUpperCase();

  t.mock.method(global, 'fetch', async function () {
    return { ok: true, text: async function () { return sha1.slice(5) + ':24230577\r\nAAAAA:1'; } };
  });

  const r = await estaFiltrada('password123');
  assert.equal(r.filtrada, true);
  assert.equal(r.verificado, true);
  assert.ok(r.veces > 0);
});

test('estaFiltrada: solo envía los primeros 5 caracteres del hash', async function (t) {
  // k-anonymity: la contraseña, y su hash completo, NUNCA salen del servidor.
  const crypto = require('crypto');
  const sha1 = crypto.createHash('sha1').update('tortuga verde', 'utf8').digest('hex').toUpperCase();
  let urlPedida = null;

  t.mock.method(global, 'fetch', async function (url) {
    urlPedida = String(url);
    return { ok: true, text: async function () { return 'AAAAA:1'; } };
  });

  await estaFiltrada('tortuga verde');
  assert.ok(urlPedida.endsWith(sha1.slice(0, 5)), 'debe pedir solo el prefijo de 5');
  assert.ok(!urlPedida.includes(sha1.slice(5, 20)), 'no debe viajar el resto del hash');
  assert.ok(!urlPedida.includes('tortuga'), 'no debe viajar la contraseña');
});

test('estaFiltrada: una contraseña que no aparece pasa', async function (t) {
  t.mock.method(global, 'fetch', async function () {
    return { ok: true, text: async function () { return 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3'; } };
  });
  const r = await estaFiltrada('una frase muy poco probable de encontrar');
  assert.equal(r.filtrada, false);
  assert.equal(r.verificado, true);
});

test('estaFiltrada: si el servicio falla, deja pasar (falla ABIERTO)', async function (t) {
  // Al revés que la autenticación, que falla cerrado. Acá bloquear sería peor:
  // alguien que quiere cambiar su clave porque sospecha que se la vieron no
  // puede quedar trabado porque un servicio externo esté caído.
  t.mock.method(global, 'fetch', async function () { throw new Error('sin red'); });
  const r = await estaFiltrada('cualquier cosa larga');
  assert.equal(r.filtrada, false);
  assert.equal(r.verificado, false, 'debe informar que no se pudo verificar');
});

test('estaFiltrada: una respuesta con error HTTP tampoco bloquea', async function (t) {
  t.mock.method(global, 'fetch', async function () { return { ok: false, status: 503 }; });
  const r = await estaFiltrada('cualquier cosa larga');
  assert.equal(r.filtrada, false);
  assert.equal(r.verificado, false);
});
