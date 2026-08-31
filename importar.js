// ============================================================
// importar.js — Carga masiva de productos desde CSV
// ============================================================
// Cargar 150 repuestos de a uno por el formulario es inviable: son horas de
// trabajo tedioso y es lo primero que pide cualquier local con un catálogo
// real. Esto acepta el CSV que sale de Excel o Google Sheets.
//
// El parser de CSV es propio y no una dependencia. Son ~40 líneas para un
// formato estable desde hace décadas (RFC 4180), y el proyecto ya pagó el
// costo de sumar una librería chica: `otplib` arrastró un módulo ESM que
// tumbó producción entera. Ver AUDITORIA.md.
// ============================================================

// Columnas que entiende el importador. `name` es la única realmente
// obligatoria además de precio y categoría; el resto tiene un valor por
// defecto sensato para que armar el archivo sea lo más liviano posible.
const COLUMNAS = [
  'nombre', 'precio', 'categoria', 'subcategoria', 'marca',
  'imagen', 'descripcion', 'whatsapp', 'stock', 'stock_minimo',
  'en_oferta', 'precio_oferta', 'destacado'
];

// Alias en inglés y variantes con acento, porque el archivo lo va a armar una
// persona en Excel y no vale la pena que falle por "categoría" vs "categoria".
const ALIAS = {
  name: 'nombre', title: 'nombre', producto: 'nombre',
  price: 'precio', valor: 'precio',
  category: 'categoria', categoría: 'categoria', rubro: 'categoria',
  subcategory: 'subcategoria', subcategoría: 'subcategoria',
  brand: 'marca',
  image: 'imagen', foto: 'imagen', url_imagen: 'imagen',
  description: 'descripcion', descripción: 'descripcion', detalle: 'descripcion',
  cantidad: 'stock', stock_cantidad: 'stock',
  minimo: 'stock_minimo', mínimo: 'stock_minimo',
  oferta: 'en_oferta',
  featured: 'destacado'
};

// ------------------------------------------------------------
// parsearCsv() — texto CSV a array de objetos
// ------------------------------------------------------------
// Maneja lo que realmente aparece en un archivo salido de Excel: comas dentro
// de un campo entrecomillado, comillas escapadas duplicándolas ("") y saltos
// de línea dentro de un campo.
function parsearCsv(texto) {
  const filas = [];
  let campo = '';
  let fila = [];
  let dentroDeComillas = false;

  // Quita el BOM que Excel escribe al guardar como "CSV UTF-8". Sin esto la
  // primera columna se llamaría "﻿nombre" y no matchearía nunca.
  const s = String(texto).replace(/^﻿/, '');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (dentroDeComillas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; }  // comilla escapada
        else dentroDeComillas = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') { dentroDeComillas = true; continue; }
    if (c === ',' || c === ';') { fila.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    campo += c;
  }
  // Última fila si el archivo no termina en salto de línea
  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }

  if (filas.length === 0) return { encabezados: [], filas: [] };

  const encabezados = filas[0].map(function(h) {
    const limpio = String(h).trim().toLowerCase().replace(/\s+/g, '_');
    return ALIAS[limpio] || limpio;
  });

  const datos = [];
  for (let i = 1; i < filas.length; i++) {
    // Saltea filas totalmente vacías (Excel suele dejar varias al final)
    if (filas[i].every(function(v) { return String(v).trim() === ''; })) continue;
    const obj = {};
    encabezados.forEach(function(h, j) { obj[h] = filas[i][j] !== undefined ? String(filas[i][j]).trim() : ''; });
    obj._fila = i + 1; // número de fila real, para poder señalar el error
    datos.push(obj);
  }

  return { encabezados: encabezados, filas: datos };
}

// ------------------------------------------------------------
// Conversión de valores sueltos
// ------------------------------------------------------------

// Acepta "12.500", "12500", "12,500.50" y "Gs. 12.500". Una persona cargando
// precios en Paraguay escribe el punto como separador de miles, así que
// interpretarlo como decimal daría 12,5 en vez de 12.500.
function aNumero(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  let s = String(valor).replace(/[^\d.,-]/g, '').trim();
  if (s === '') return null;

  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;

  if (puntos > 0 && comas > 0) {
    // El último separador que aparece es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (comas > 1) {
    s = s.replace(/,/g, '');            // 1,234,567 → miles
  } else if (puntos > 1) {
    s = s.replace(/\./g, '');            // 1.234.567 → miles
  } else if (puntos === 1) {
    // Un solo punto: si tiene exactamente 3 dígitos después, son miles (12.500)
    const parte = s.split('.')[1];
    if (parte && parte.length === 3) s = s.replace('.', '');
  } else if (comas === 1) {
    const parte = s.split(',')[1];
    s = (parte && parte.length === 3) ? s.replace(',', '') : s.replace(',', '.');
  }

  const n = Number(s);
  return isNaN(n) ? null : n;
}

// "si", "sí", "x", "1", "true", "verdadero" → true. Vacío → el default.
function aBooleano(valor, porDefecto) {
  const s = String(valor === undefined ? '' : valor).trim().toLowerCase();
  if (s === '') return porDefecto;
  return ['si', 'sí', 'x', '1', 'true', 'verdadero', 'yes', 'y', 's'].includes(s);
}

// ------------------------------------------------------------
// normalizarFila() — una fila del CSV a un producto listo para insertar
// ------------------------------------------------------------
// Devuelve { producto } o { error } con un mensaje que le sirva a quien armó
// el archivo: dice qué columna está mal, no un código.
function normalizarFila(fila, opciones) {
  const opts = opciones || {};
  const nombre = String(fila.nombre || '').trim();

  if (!nombre) return { error: 'falta el nombre' };
  if (nombre.length > 255) return { error: 'el nombre supera los 255 caracteres' };

  const precio = aNumero(fila.precio);
  if (precio === null) return { error: 'el precio está vacío o no es un número' };
  if (precio < 0) return { error: 'el precio no puede ser negativo' };

  const categoria = String(fila.categoria || '').trim();
  if (!categoria) return { error: 'falta la categoría' };

  // El WhatsApp es el mismo para todo el local, así que se toma el de la
  // pantalla de importación y la columna del archivo es opcional. Pedirlo en
  // cada fila sería hacerle repetir 150 veces el mismo número.
  const whatsapp = String(fila.whatsapp || opts.whatsappPorDefecto || '').trim();
  if (!whatsapp) return { error: 'falta el WhatsApp (cargalo en la pantalla o agregá la columna)' };
  if (!/^\+?[0-9]{4,20}$/.test(whatsapp)) {
    return { error: 'el WhatsApp debe tener solo dígitos (entre 4 y 20, con + opcional)' };
  }

  // La imagen es opcional a propósito: quien carga 150 repuestos rara vez
  // tiene las 150 fotos subidas de antemano. Se importa el catálogo completo
  // y las fotos se agregan después desde el panel, producto por producto.
  const imagen = String(fila.imagen || '').trim();
  if (imagen && !/^https?:\/\//i.test(imagen)) {
    return { error: 'la imagen debe ser una URL que empiece con http:// o https://' };
  }

  const enOferta = aBooleano(fila.en_oferta, false);
  const precioOferta = aNumero(fila.precio_oferta);
  if (enOferta && precioOferta === null) {
    return { error: 'está marcado en oferta pero no tiene precio_oferta' };
  }
  if (precioOferta !== null && precioOferta >= precio) {
    return { error: 'el precio_oferta tiene que ser menor que el precio' };
  }

  const stock = aNumero(fila.stock);
  const stockMinimo = aNumero(fila.stock_minimo);

  return {
    producto: {
      name: nombre,
      price: precio,
      category: categoria,
      subcategoria: String(fila.subcategoria || '').trim(),
      brand: String(fila.marca || '').trim(),
      image: imagen,
      description: String(fila.descripcion || '').trim(),
      whatsapp: whatsapp,
      en_oferta: enOferta,
      precio_oferta: precioOferta,
      // Sin dato de stock asumimos que está disponible: un catálogo recién
      // importado que muestra todo "sin stock" no le sirve a nadie.
      en_stock: stock === null ? true : stock > 0,
      destacado: aBooleano(fila.destacado, false),
      stock_cantidad: stock === null ? 0 : Math.max(0, Math.round(stock)),
      stock_minimo: stockMinimo === null ? 5 : Math.max(0, Math.round(stockMinimo))
    }
  };
}

// ------------------------------------------------------------
// analizar() — valida todo el archivo SIN tocar la base
// ------------------------------------------------------------
// Se usa para la vista previa: quien importa ve qué va a entrar y qué filas
// tienen problemas ANTES de escribir nada.
function analizar(textoCsv, opciones) {
  const { encabezados, filas } = parsearCsv(textoCsv);

  if (filas.length === 0) {
    return { validos: [], errores: [], encabezados: encabezados, totalFilas: 0 };
  }

  const validos = [];
  const errores = [];
  const nombresVistos = new Set();

  for (const fila of filas) {
    const r = normalizarFila(fila, opciones);
    if (r.error) {
      errores.push({ fila: fila._fila, nombre: fila.nombre || '(sin nombre)', error: r.error });
      continue;
    }
    // Duplicados dentro del propio archivo: se avisa en vez de cargar dos
    // veces el mismo repuesto, que después hay que borrar a mano.
    const clave = r.producto.name.toLowerCase();
    if (nombresVistos.has(clave)) {
      errores.push({ fila: fila._fila, nombre: r.producto.name, error: 'está repetido en el archivo' });
      continue;
    }
    nombresVistos.add(clave);
    validos.push({ fila: fila._fila, producto: r.producto });
  }

  return { validos: validos, errores: errores, encabezados: encabezados, totalFilas: filas.length };
}

// Encabezado de ejemplo para el archivo modelo que se descarga del panel.
function plantillaCsv() {
  return [
    COLUMNAS.join(','),
    'Filtro de aceite Honda CG 150,45000,Filtros,Aceite,Honda,,Filtro original para CG 150 Titan,,12,5,,,',
    'Pastillas de freno delanteras,120000,Frenos,Pastillas,Yamaha,,Juego completo delantero,,6,2,si,95000,si'
  ].join('\n');
}

module.exports = {
  parsearCsv,
  normalizarFila,
  analizar,
  plantillaCsv,
  aNumero,
  aBooleano,
  COLUMNAS
};
