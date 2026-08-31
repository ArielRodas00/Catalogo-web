const test = require('node:test');
const assert = require('node:assert/strict');

const { parsearCsv, normalizarFila, analizar, aNumero, aBooleano } = require('../importar');

const OPTS = { whatsappPorDefecto: '595981123456' };

// ============================================================
// Parser de CSV
// ============================================================

test('parsearCsv: lee un archivo simple', function () {
  const { filas } = parsearCsv('nombre,precio\nFiltro,45000\nBujía,12000');
  assert.equal(filas.length, 2);
  assert.equal(filas[0].nombre, 'Filtro');
  assert.equal(filas[1].precio, '12000');
});

test('parsearCsv: respeta las comas dentro de comillas', function () {
  // El caso clásico que rompe un split(',') ingenuo.
  const { filas } = parsearCsv('nombre,descripcion\n"Kit de frenos, completo","Incluye pastillas, discos y líquido"');
  assert.equal(filas[0].nombre, 'Kit de frenos, completo');
  assert.equal(filas[0].descripcion, 'Incluye pastillas, discos y líquido');
});

test('parsearCsv: entiende las comillas escapadas', function () {
  const { filas } = parsearCsv('nombre\n"Aro 17"" delantero"');
  assert.equal(filas[0].nombre, 'Aro 17" delantero');
});

test('parsearCsv: soporta saltos de línea dentro de un campo', function () {
  const { filas } = parsearCsv('nombre,descripcion\nFiltro,"Primera línea\nSegunda línea"');
  assert.equal(filas.length, 1, 'el salto interno no debe partir la fila');
  assert.match(filas[0].descripcion, /Primera línea\nSegunda línea/);
});

test('parsearCsv: quita el BOM que escribe Excel', function () {
  // Excel guardando como "CSV UTF-8" antepone un BOM; sin quitarlo la primera
  // columna se llamaría "﻿nombre" y no matchearía nunca.
  const { filas } = parsearCsv('﻿nombre,precio\nFiltro,45000');
  assert.equal(filas[0].nombre, 'Filtro');
});

test('parsearCsv: acepta punto y coma (Excel en español)', function () {
  const { filas } = parsearCsv('nombre;precio\nFiltro;45000');
  assert.equal(filas[0].nombre, 'Filtro');
  assert.equal(filas[0].precio, '45000');
});

test('parsearCsv: ignora las filas vacías del final', function () {
  const { filas } = parsearCsv('nombre,precio\nFiltro,45000\n,\n,\n');
  assert.equal(filas.length, 1);
});

test('parsearCsv: reconoce encabezados en inglés y con acento', function () {
  const { filas } = parsearCsv('name,price,categoría\nFiltro,45000,Filtros');
  assert.equal(filas[0].nombre, 'Filtro');
  assert.equal(filas[0].precio, '45000');
  assert.equal(filas[0].categoria, 'Filtros');
});

// ============================================================
// Conversión de números — el caso paraguayo
// ============================================================

test('aNumero: interpreta el punto como separador de miles', function () {
  // Clave para Paraguay: "12.500" son doce mil quinientos guaraníes, no 12,5.
  assert.equal(aNumero('12.500'), 12500);
  assert.equal(aNumero('1.234.567'), 1234567);
  assert.equal(aNumero('Gs. 45.000'), 45000);
});

test('aNumero: entiende decimales de verdad', function () {
  assert.equal(aNumero('12.5'), 12.5);
  assert.equal(aNumero('1.234,56'), 1234.56);
});

test('aNumero: devuelve null si está vacío o no es número', function () {
  assert.equal(aNumero(''), null);
  assert.equal(aNumero('   '), null);
  assert.equal(aNumero(undefined), null);
});

test('aBooleano: acepta las formas que escribe una persona', function () {
  for (const v of ['si', 'Sí', 'X', '1', 'true', 'VERDADERO']) {
    assert.equal(aBooleano(v, false), true, 'debe ser true: ' + v);
  }
  assert.equal(aBooleano('no', true), false);
  assert.equal(aBooleano('', true), true, 'vacío usa el valor por defecto');
});

// ============================================================
// Normalización de una fila
// ============================================================

test('normalizarFila: arma un producto completo', function () {
  const r = normalizarFila({
    nombre: 'Filtro de aceite', precio: '45.000', categoria: 'Filtros',
    marca: 'Honda', stock: '12'
  }, OPTS);
  assert.equal(r.error, undefined);
  assert.equal(r.producto.name, 'Filtro de aceite');
  assert.equal(r.producto.price, 45000);
  assert.equal(r.producto.brand, 'Honda');
  assert.equal(r.producto.stock_cantidad, 12);
  assert.equal(r.producto.en_stock, true);
});

test('normalizarFila: usa el WhatsApp de la pantalla si falta en la fila', function () {
  // Es el mismo número para todo el local: pedirlo en cada fila sería
  // hacérselo repetir 150 veces.
  const r = normalizarFila({ nombre: 'X', precio: '1000', categoria: 'Y' }, OPTS);
  assert.equal(r.producto.whatsapp, '595981123456');
});

test('normalizarFila: la imagen es opcional', function () {
  // Quien carga 150 repuestos rara vez tiene las 150 fotos subidas antes.
  const r = normalizarFila({ nombre: 'X', precio: '1000', categoria: 'Y' }, OPTS);
  assert.equal(r.error, undefined);
  assert.equal(r.producto.image, '');
});

test('normalizarFila: rechaza una imagen que no es URL', function () {
  const r = normalizarFila({ nombre: 'X', precio: '1000', categoria: 'Y', imagen: 'foto.jpg' }, OPTS);
  assert.match(r.error, /URL/);
});

test('normalizarFila: sin dato de stock asume disponible', function () {
  // Un catálogo recién importado que muestra todo "sin stock" no sirve.
  const r = normalizarFila({ nombre: 'X', precio: '1000', categoria: 'Y' }, OPTS);
  assert.equal(r.producto.en_stock, true);
});

test('normalizarFila: stock 0 marca sin stock', function () {
  const r = normalizarFila({ nombre: 'X', precio: '1000', categoria: 'Y', stock: '0' }, OPTS);
  assert.equal(r.producto.en_stock, false);
});

test('normalizarFila: exige nombre, precio y categoría', function () {
  assert.match(normalizarFila({ precio: '1', categoria: 'Y' }, OPTS).error, /nombre/);
  assert.match(normalizarFila({ nombre: 'X', categoria: 'Y' }, OPTS).error, /precio/);
  assert.match(normalizarFila({ nombre: 'X', precio: '1' }, OPTS).error, /categoría/);
});

test('normalizarFila: valida el WhatsApp igual que el formulario', function () {
  // Misma regla que middleware/validate.js: este campo termina dentro de un
  // href, y aceptar cualquier texto fue un XSS real. Ver AUDITORIA.md.
  const r = normalizarFila(
    { nombre: 'X', precio: '1000', categoria: 'Y', whatsapp: '5959" onmouseover="alert(1)' },
    OPTS
  );
  assert.match(r.error, /d[ií]gitos/i, 'no debe dejar pasar un valor con comillas');
});

test('normalizarFila: rechaza una oferta sin precio de oferta', function () {
  const r = normalizarFila({ nombre: 'X', precio: '1000', categoria: 'Y', en_oferta: 'si' }, OPTS);
  assert.match(r.error, /precio_oferta/);
});

test('normalizarFila: rechaza un precio de oferta mayor al normal', function () {
  const r = normalizarFila(
    { nombre: 'X', precio: '1000', categoria: 'Y', en_oferta: 'si', precio_oferta: '2000' },
    OPTS
  );
  assert.match(r.error, /menor/);
});

// ============================================================
// Análisis del archivo completo
// ============================================================

test('analizar: separa las filas válidas de las que tienen error', function () {
  const csv = [
    'nombre,precio,categoria',
    'Filtro,45000,Filtros',
    ',12000,Bujías',          // sin nombre
    'Pastillas,,Frenos',      // sin precio
    'Cadena,80000,Transmisión'
  ].join('\n');

  const r = analizar(csv, OPTS);
  assert.equal(r.validos.length, 2);
  assert.equal(r.errores.length, 2);
  assert.equal(r.totalFilas, 4);
});

test('analizar: señala el número de fila real del archivo', function () {
  // Para que quien armó el CSV pueda ir directo a corregirla en Excel.
  const csv = 'nombre,precio,categoria\nFiltro,45000,Filtros\n,12000,Bujías';
  const r = analizar(csv, OPTS);
  assert.equal(r.errores[0].fila, 3, 'la fila 3 del archivo, contando el encabezado');
});

test('analizar: detecta duplicados dentro del archivo', function () {
  const csv = 'nombre,precio,categoria\nFiltro,45000,Filtros\nfiltro,50000,Filtros';
  const r = analizar(csv, OPTS);
  assert.equal(r.validos.length, 1);
  assert.match(r.errores[0].error, /repetido/);
});

test('analizar: un archivo vacío no explota', function () {
  const r = analizar('', OPTS);
  assert.equal(r.validos.length, 0);
  assert.equal(r.totalFilas, 0);
});

test('analizar: un archivo con solo encabezados no explota', function () {
  const r = analizar('nombre,precio,categoria', OPTS);
  assert.equal(r.validos.length, 0);
  assert.equal(r.totalFilas, 0);
});
