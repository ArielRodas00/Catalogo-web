// ============================================================
// totp.js — Segundo factor (TOTP), el de Google Authenticator
// ============================================================
// Implementa RFC 6238 (TOTP) sobre RFC 4226 (HOTP) usando solo node:crypto.
//
// Por qué sin librería: se usaba `otplib`, y su plugin de base32 hace
// require() de `@scure/base`, que es ESM. Node 24 local lo tolera, pero el
// runtime de Vercel no: **tiró abajo el sitio entero con ERR_REQUIRE_ESM**,
// porque el fallo ocurre al cargar el módulo, antes de atender un solo
// request. Ver AUDITORIA.md.
//
// No es "criptografía casera": TOTP es un algoritmo público y corto que se
// apoya en HMAC-SHA1, que sí viene en node:crypto. Lo que sigue son ~60
// líneas verificadas contra otplib en los tests (mismo secreto y mismo
// instante deben dar el mismo código).
//
// El 2FA es OPCIONAL, pero acá es donde MÁS conviene activarlo: esta es la
// cuenta que ve y administra a todos los clientes, sus api_key y sus pagos.
//
// NOTA sobre la duplicación con el catálogo: este archivo es un espejo del
// que está en la raíz. No se comparte código a propósito — son dos apps con
// deploys, package.json y bases distintas, y el Panel Central se publica
// apuntando SOLO a este subdirectorio, así que un require() a un archivo de
// afuera no llegaría al paquete desplegado. Si se toca uno, tocar el otro.
// ============================================================

const crypto = require('crypto');
const QRCode = require('qrcode');

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITOS = 6;
const PERIODO_SEG = 30;

// Cuántas ventanas de 30s hacia atrás y adelante se aceptan. 1 tolera que el
// reloj del teléfono esté algo corrido, que es la causa más común de "mi
// código no funciona" — sin abrir una ventana grande de reintento.
const TOLERANCIA_VENTANAS = 1;

function aBase32(buffer) {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

function desdeBase32(secreto) {
  const limpio = String(secreto).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of limpio) {
    const idx = ALFABETO_BASE32.indexOf(c);
    if (idx === -1) throw new Error('Secreto base32 inválido');
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// HOTP (RFC 4226): HMAC-SHA1 del contador, truncado dinámicamente.
function generarHotp(claveBytes, contador) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));

  const hmac = crypto.createHmac('sha1', claveBytes).update(buf).digest();
  // El offset sale de los 4 bits bajos del último byte (truncado dinámico).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

function contadorActual(epochMs) {
  return Math.floor((epochMs != null ? epochMs : Date.now()) / 1000 / PERIODO_SEG);
}

// Secreto nuevo en base32 (el formato que esperan las apps de autenticación).
// 20 bytes = 160 bits, lo que recomienda el RFC 4226.
function generarSecreto() {
  return aBase32(crypto.randomBytes(20));
}

// Genera el código de este momento. Se exporta sobre todo para los tests y
// para poder verificar contra otra implementación.
function generar(secreto, epochMs) {
  return generarHotp(desdeBase32(secreto), contadorActual(epochMs));
}

// Verifica un código de 6 dígitos. Devuelve true/false y nunca lanza: un
// código con formato raro es simplemente inválido, no un error del servidor.
function verificar(token, secreto, epochMs) {
  if (!token || !secreto) return false;
  const limpio = String(token).replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(limpio)) return false;

  try {
    const clave = desdeBase32(secreto);
    const base = contadorActual(epochMs);
    const propuesto = Buffer.from(limpio);

    // Se comparan TODAS las ventanas sin cortar al primer acierto: salir
    // antes filtraría, por diferencia de tiempo, cuál de ellas coincidió.
    // timingSafeEqual evita además filtrar cuántos dígitos se acertaron.
    let coincide = false;
    for (let d = -TOLERANCIA_VENTANAS; d <= TOLERANCIA_VENTANAS; d++) {
      const esperado = Buffer.from(generarHotp(clave, base + d));
      if (esperado.length === propuesto.length && crypto.timingSafeEqual(esperado, propuesto)) {
        coincide = true;
      }
    }
    return coincide;
  } catch (err) {
    console.error('Error verificando el código 2FA:', err.message);
    return false;
  }
}

// URI otpauth:// — es lo que codifica el QR y lo que entienden Google
// Authenticator, Authy, 1Password, etc.
function generarUri(secreto, usuario, emisor) {
  const em = encodeURIComponent(emisor || 'Panel Central');
  const us = encodeURIComponent(usuario || 'admin');
  return 'otpauth://totp/' + em + ':' + us +
    '?secret=' + secreto +
    '&issuer=' + em +
    '&algorithm=SHA1&digits=' + DIGITOS + '&period=' + PERIODO_SEG;
}

// QR como data URI, listo para un <img src="...">. Se genera en el servidor
// para no sumar una librería de QR al frontend.
async function generarQr(secreto, usuario, emisor) {
  return QRCode.toDataURL(generarUri(secreto, usuario, emisor));
}

module.exports = { generarSecreto, generar, verificar, generarUri, generarQr };
