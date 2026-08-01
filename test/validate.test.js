const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProduct, sanitizeOrder, sanitizePeriod } = require('../middleware/validate');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (body) {
    res.body = body;
    return res;
  };
  return res;
}

test('validateProduct: rechaza creación sin nombre', function () {
  const req = { method: 'POST', body: { price: 10, category: 'motor', image: 'x.jpg', whatsapp: '12345' } };
  const res = mockRes();
  let called = false;
  validateProduct(req, res, function () {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /nombre/i);
});

test('validateProduct: acepta creación con todos los campos requeridos', function () {
  const req = {
    method: 'POST',
    body: { name: 'Filtro de aceite', price: 25000, category: 'motor', image: 'x.jpg', whatsapp: '0981123456' }
  };
  const res = mockRes();
  let called = false;
  validateProduct(req, res, function () {
    called = true;
  });
  assert.equal(called, true);
});

test('validateProduct: en PUT permite edición parcial (solo precio)', function () {
  const req = { method: 'PUT', body: { price: 30000 } };
  const res = mockRes();
  let called = false;
  validateProduct(req, res, function () {
    called = true;
  });
  assert.equal(called, true);
});

test('validateProduct: rechaza precio negativo', function () {
  const req = { method: 'POST', body: { name: 'X', price: -5, category: 'motor', image: 'x.jpg', whatsapp: '12345' } };
  const res = mockRes();
  let called = false;
  validateProduct(req, res, function () {
    called = true;
  });
  assert.equal(called, false);
  assert.equal(res.statusCode, 400);
});

test('validateProduct: rechaza whatsapp muy corto salvo el placeholder "0000"', function () {
  const base = { name: 'X', price: 10, category: 'motor', image: 'x.jpg' };
  const resCorto = mockRes();
  let calledCorto = false;
  validateProduct(
    { method: 'POST', body: Object.assign({}, base, { whatsapp: '123' }) },
    resCorto,
    function () {
      calledCorto = true;
    }
  );
  assert.equal(calledCorto, false);

  const resPlaceholder = mockRes();
  let calledPlaceholder = false;
  validateProduct(
    { method: 'POST', body: Object.assign({}, base, { whatsapp: '0000' }) },
    resPlaceholder,
    function () {
      calledPlaceholder = true;
    }
  );
  assert.equal(calledPlaceholder, true);
});

test('validateProduct: rechaza un whatsapp que no sea solo dígitos (vector de XSS)', function () {
  // Este campo se interpola en el href del botón "Consultar" del catálogo.
  // Aceptar cualquier string permitía cerrar el atributo e inyectar un
  // manejador de eventos (XSS almacenado) — ver AUDITORIA.md.
  const base = { name: 'X', price: 10, category: 'motor', image: 'x.jpg' };

  const maliciosos = [
    '5959" onmouseover="alert(1)',
    '595981234567"><script>alert(1)</script>',
    'javascript:alert(1)',
    '0981-123-456'
  ];
  maliciosos.forEach(function (whatsapp) {
    let paso = false;
    validateProduct(
      { method: 'POST', body: Object.assign({}, base, { whatsapp: whatsapp }) },
      mockRes(),
      function () { paso = true; }
    );
    assert.equal(paso, false, 'debe rechazar: ' + whatsapp);
  });

  // Los números legítimos siguen entrando (incluido el formato internacional)
  ['595981234567', '+595981234567', '0000'].forEach(function (whatsapp) {
    let paso = false;
    validateProduct(
      { method: 'POST', body: Object.assign({}, base, { whatsapp: whatsapp }) },
      mockRes(),
      function () { paso = true; }
    );
    assert.equal(paso, true, 'debe aceptar: ' + whatsapp);
  });
});

test('sanitizeOrder: descarta valores no permitidos y devuelve "reciente"', function () {
  assert.equal(sanitizeOrder('precio-asc'), 'precio-asc');
  assert.equal(sanitizeOrder("'; DROP TABLE productos; --"), 'reciente');
  assert.equal(sanitizeOrder(undefined), 'reciente');
});

test('sanitizePeriod: descarta valores no permitidos y devuelve "30d"', function () {
  assert.equal(sanitizePeriod('7d'), '7d');
  assert.equal(sanitizePeriod('nunca'), '30d');
  assert.equal(sanitizePeriod(undefined), '30d');
});
