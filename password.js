// ============================================================
// password.js — Fortaleza de contraseñas y hashing
// ============================================================
// Reemplaza a la validación mínima que había en middleware/validate.js.
// Salió de auditar la contraseña que estaba en uso: pasaba la validación sin
// problemas, pero seguía el patrón que un atacante prueba primero — una
// palabra del negocio escrita en leetspeak, el año actual y un sufijo típico.
// Larga y con símbolos, pero adivinable.
// ============================================================

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Se prioriza LARGO por sobre reglas de composición, siguiendo al NIST: exigir
// "una mayúscula, un número y un símbolo" empuja a claves tipo "Password1!",
// fáciles para una máquina y molestas para una persona. El largo sí encarece
// el ataque de verdad.
const PASSWORD_MIN = 12;

// Costo de bcrypt. Estaba en 10, que es el default de hace ~15 años. Cada +1
// duplica el tiempo por intento: pasar de 10 a 12 lo cuadruplica para el
// atacante, y para nosotros son ~200 ms una vez por login.
const BCRYPT_COST = 12;

// ------------------------------------------------------------
// Sustituciones de leetspeak
// ------------------------------------------------------------
// Un atacante desarma esto automáticamente: "C4t4l0g0" y "catalogo" le cuestan
// lo mismo. Nosotros hacemos la misma normalización antes de comparar, para
// que reemplazar letras por números no sirva para esquivar los chequeos.
const LEET = { '4': 'a', '@': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '5': 's', '$': 's', '7': 't', '8': 'b' };

function normalizar(texto) {
  return String(texto).toLowerCase().replace(/[4@01!35$78]/g, function(c) { return LEET[c] || c; });
}

// Palabras que, una vez normalizadas, no deberían aparecer en una contraseña
// de este sistema. Son las primeras que probaría alguien que sabe qué es esto.
const PALABRAS_PROHIBIDAS = [
  'catalogo', 'piezaexpress', 'pieza', 'repuesto', 'repuestos', 'moto', 'motos',
  'panel', 'central', 'admin', 'administrador', 'superadmin', 'password',
  'contrasena', 'clave', 'secure', 'seguro', 'login', 'acceso', 'qwerty',
  'asdf', 'letmein', 'welcome', 'bienvenido', 'paraguay', 'asuncion'
];

// Secuencias de teclado y de dígitos: no aportan entropía real aunque sean largas.
const SECUENCIAS = ['qwerty', 'asdfgh', 'zxcvbn', '123456', '098765', 'abcdef'];

// ------------------------------------------------------------
// validarPassword() — chequeos locales, sin red
// ------------------------------------------------------------
// Devuelve un array de errores; vacío significa que sirve.
function validarPassword(password, username) {
  const errores = [];

  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    errores.push('La contraseña debe tener al menos ' + PASSWORD_MIN + ' caracteres');
    return errores; // sin largo mínimo, el resto no aporta
  }

  if (password.length > 200) {
    // Un límite alto pero existente: bcrypt trunca a 72 bytes igual, y sin
    // tope alguien podría mandar megabytes para hacernos gastar CPU.
    errores.push('La contraseña es demasiado larga');
    return errores;
  }

  const norm = normalizar(password);

  for (const palabra of PALABRAS_PROHIBIDAS) {
    if (norm.includes(palabra)) {
      errores.push('No puede contener "' + palabra + '" (ni escrito con números, como "c4t4l0g0")');
      break;
    }
  }

  if (username && norm.includes(normalizar(username))) {
    errores.push('No puede contener tu nombre de usuario');
  }

  // Un año reciente al final es de los patrones más previsibles que hay.
  if (/(19|20)\d{2}/.test(password)) {
    errores.push('No uses un año: es de lo primero que se prueba');
  }

  for (const sec of SECUENCIAS) {
    if (norm.includes(sec)) {
      errores.push('No uses secuencias de teclado ni de números seguidos');
      break;
    }
  }

  // Todo un mismo carácter, o un patrón corto repetido ("abcabcabc").
  if (/^(.)\1+$/.test(password)) {
    errores.push('No puede ser un mismo carácter repetido');
  } else if (/^(.{1,3})\1{3,}$/.test(password)) {
    errores.push('No puede ser un grupo corto repetido');
  }

  // Muy pocos caracteres distintos = poca entropía real por más larga que sea.
  const distintos = new Set(password).size;
  if (distintos < 6) {
    errores.push('Usá más variedad de caracteres');
  }

  return errores;
}

// ------------------------------------------------------------
// estaFiltrada() — ¿aparece en filtraciones conocidas?
// ------------------------------------------------------------
// Consulta Have I Been Pwned con k-anonymity: se envían **solo los primeros 5
// caracteres** del SHA-1, y ellos devuelven todos los hashes que empiezan así
// (cientos). La comparación final se hace acá. La contraseña, ni su hash
// completo, salen nunca de este servidor.
//
// Esto es lo que atrapa el ataque que de verdad ocurre: credential stuffing
// con contraseñas de filtraciones reales, contra el que ninguna regla de
// composición sirve.
async function estaFiltrada(password) {
  const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefijo = sha1.slice(0, 5);
  const sufijo = sha1.slice(5);

  // Timeout corto: es un chequeo de apoyo, no puede colgar un cambio de clave.
  const control = new AbortController();
  const timer = setTimeout(function() { control.abort(); }, 3000);

  try {
    const r = await fetch('https://api.pwnedpasswords.com/range/' + prefijo, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'piezaexpress-catalogo' },
      signal: control.signal
    });
    if (!r.ok) return { filtrada: false, verificado: false };

    const texto = await r.text();
    for (const linea of texto.split('\n')) {
      const [hash, veces] = linea.trim().split(':');
      if (hash === sufijo) {
        return { filtrada: true, verificado: true, veces: parseInt(veces, 10) || 0 };
      }
    }
    return { filtrada: false, verificado: true };
  } catch (err) {
    // Falla ABIERTO a propósito, al revés que la autenticación: si el servicio
    // externo no responde, bloquear el cambio de contraseña sería peor que
    // dejar pasar una clave sin verificar. Alguien que quiere cambiar su clave
    // porque sospecha que se la vieron no puede quedar bloqueado por esto.
    return { filtrada: false, verificado: false };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// Hashing
// ------------------------------------------------------------

function hashear(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

function comparar(password, hash) {
  return bcrypt.compare(password, hash);
}

// ¿El hash guardado usa un costo menor al actual? Sirve para re-hashear al
// vuelo en el próximo login exitoso, así las contraseñas viejas se actualizan
// solas sin pedirle a nadie que la cambie.
function necesitaRehash(hash) {
  try {
    const costo = parseInt(String(hash).split('$')[2], 10);
    return !isNaN(costo) && costo < BCRYPT_COST;
  } catch (e) {
    return false;
  }
}

module.exports = {
  validarPassword,
  estaFiltrada,
  hashear,
  comparar,
  necesitaRehash,
  normalizar,
  PASSWORD_MIN,
  BCRYPT_COST
};
