// ============================================================
// totp.js — Segundo factor (TOTP), el de Google Authenticator
// ============================================================
// Envuelve a otplib para que el resto del código no dependa de su API. La v13
// cambió bastante respecto de la v12 (ya no existe `authenticator`, y hay que
// inyectar los plugins de crypto y base32 a mano), así que dejarlo aislado
// acá evita tener que tocar rutas si la librería vuelve a cambiar.
//
// El 2FA es OPCIONAL por diseño: al dueño de un local pedirle un código cada
// vez que entra puede ser fricción de más. Queda disponible para quien lo
// quiera, y muy recomendado en el Panel Central, donde se administran todos
// los clientes.
// ============================================================

const otplib = require('otplib');
const QRCode = require('qrcode');

const crypto = new otplib.NobleCryptoPlugin();
const base32 = new otplib.ScureBase32Plugin();
const totp = new otplib.TOTP({ crypto, base32 });

// Secreto nuevo, en base32 (el formato que esperan las apps de autenticación).
function generarSecreto() {
  return otplib.generateSecret({ crypto, base32 });
}

// URI otpauth:// — es lo que codifica el QR y lo que entienden Google
// Authenticator, Authy, 1Password, etc.
function generarUri(secreto, usuario, emisor) {
  return totp.toURI({
    secret: secreto,
    label: usuario,
    issuer: emisor || 'PiezaExpress'
  });
}

// QR como data URI, listo para poner en un <img src="...">. Se genera en el
// servidor para no sumar una librería de QR al frontend.
async function generarQr(secreto, usuario, emisor) {
  return QRCode.toDataURL(generarUri(secreto, usuario, emisor));
}

// Verifica un código de 6 dígitos contra el secreto.
// Devuelve true/false y nunca lanza: un código con formato raro es
// simplemente inválido, no un error del servidor.
async function verificar(token, secreto) {
  if (!token || !secreto) return false;
  const limpio = String(token).replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(limpio)) return false;

  try {
    const resultado = await totp.verify(limpio, { secret: secreto });
    return resultado && resultado.valid === true;
  } catch (err) {
    console.error('Error verificando el código 2FA:', err.message);
    return false;
  }
}

module.exports = { generarSecreto, generarUri, generarQr, verificar };
