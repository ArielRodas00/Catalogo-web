const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const cookieParser = require('cookie-parser');
const pool = require('../db');
const authRouter = require('../routes/auth');
const { COOKIE_NAME } = require('../authCookie');
const { withServer } = require('./helpers/testServer');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  return app;
}

// Extrae los atributos del Set-Cookie de la sesión, para poder afirmar sobre
// httpOnly/SameSite/Path sin depender del orden en que los emita Express.
function parseSessionCookie(res) {
  const raw = res.headers.getSetCookie
    ? res.headers.getSetCookie().find(function (c) { return c.startsWith(COOKIE_NAME + '='); })
    : res.headers.get('set-cookie');
  if (!raw) return null;
  const attrs = raw.split(';').map(function (p) { return p.trim(); });
  const value = attrs[0].slice(COOKIE_NAME.length + 1);
  const flags = attrs.slice(1).map(function (a) { return a.toLowerCase(); });
  return {
    raw: raw,
    value: value,
    httpOnly: flags.includes('httponly'),
    secure: flags.includes('secure'),
    sameSite: (flags.find(function (f) { return f.startsWith('samesite='); }) || '').split('=')[1],
    path: (flags.find(function (f) { return f.startsWith('path='); }) || '').split('=')[1]
  };
}

test('POST /api/auth/login: credenciales correctas setean la cookie httpOnly', async function (t) {
  const passwordHash = await bcrypt.hash('secreto123', 10);
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, username: 'admin', password: passwordHash }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secreto123' }),
      redirect: 'manual'
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.username, 'admin');

    // El token NO debe volver en el cuerpo: si volviera, el JavaScript del
    // panel lo tendría a mano y un XSS podría robarlo — que es exactamente
    // lo que este cambio evita. Ver AUDITORIA.md.
    assert.equal(body.token, undefined, 'el token no debe viajar en el cuerpo');

    const cookie = parseSessionCookie(res);
    assert.ok(cookie, 'debe emitir la cookie de sesión');
    assert.ok(cookie.value.length > 0, 'la cookie debe traer el token');
    assert.equal(cookie.httpOnly, true, 'debe ser httpOnly (el JS no la puede leer)');
    assert.equal(cookie.sameSite, 'strict', 'SameSite=Strict protege contra CSRF');
    assert.equal(cookie.path, '/');
  });
});

test('POST /api/auth/login: la cookie sirve para autenticarse (verify)', async function (t) {
  const passwordHash = await bcrypt.hash('secreto123', 10);
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, username: 'admin', password: passwordHash }] };
  });

  await withServer(buildApp(), async function (base) {
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secreto123' })
    });
    const cookie = parseSessionCookie(login);

    // Sin cookie: rechazado
    const sinCookie = await fetch(base + '/api/auth/verify');
    assert.equal(sinCookie.status, 401);

    // Con la cookie: autenticado, sin ningún header Authorization
    const conCookie = await fetch(base + '/api/auth/verify', {
      headers: { Cookie: COOKIE_NAME + '=' + cookie.value }
    });
    assert.equal(conCookie.status, 200);
    const body = await conCookie.json();
    assert.equal(body.valid, true);
    assert.equal(body.username, 'admin');
  });
});

test('POST /api/auth/logout: borra la cookie de sesión', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/logout', { method: 'POST' });
    assert.equal(res.status, 200);

    const cookie = parseSessionCookie(res);
    assert.ok(cookie, 'debe emitir un Set-Cookie que borre la sesión');
    // Al borrar, el valor queda vacío y con fecha de expiración pasada.
    assert.equal(cookie.value, '', 'la cookie debe quedar vacía');
    assert.match(cookie.raw, /Expires=Thu, 01 Jan 1970|Max-Age=0/i);
    // Debe repetir los mismos atributos, o el navegador la trata como otra
    // cookie distinta y no la borra (ver clearCookieOptions en authCookie.js).
    assert.equal(cookie.path, '/');
    assert.equal(cookie.httpOnly, true);
  });
});

test('POST /api/auth/login: contraseña incorrecta devuelve 401', async function (t) {
  const passwordHash = await bcrypt.hash('secreto123', 10);
  t.mock.method(pool, 'query', async function () {
    return { rows: [{ id: 1, username: 'admin', password: passwordHash }] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'incorrecta' })
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/auth/login: usuario inexistente devuelve 401', async function (t) {
  t.mock.method(pool, 'query', async function () {
    return { rows: [] };
  });

  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'noexiste', password: 'x' })
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/auth/login: falta username o password devuelve 400', async function () {
  await withServer(buildApp(), async function (base) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin' })
    });
    assert.equal(res.status, 400);
  });
});
