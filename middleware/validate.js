const VALID_ORDERS = ['az', 'za', 'precio-asc', 'precio-desc', 'reciente'];
const VALID_PERIODS = ['7d', '30d', '90d', 'all'];

function validateProduct(req, res, next) {
  const { name, price, category, image, whatsapp } = req.body;

  const errors = [];
  
  // En PUT (edicion), solo validar campos que esten presentes
  const isUpdate = req.method === 'PUT';
  
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 1) {
      errors.push('El nombre es requerido');
    }
  } else if (!isUpdate) {
    errors.push('El nombre es requerido');
  }
  
  if (price !== undefined) {
    if (isNaN(Number(price)) || Number(price) < 0) {
      errors.push('El precio debe ser un número positivo');
    }
  } else if (!isUpdate) {
    errors.push('El precio debe ser un número positivo');
  }
  
  if (category !== undefined) {
    if (typeof category !== 'string' || category.trim().length < 1) {
      errors.push('La categoría es requerida');
    }
  } else if (!isUpdate) {
    errors.push('La categoría es requerida');
  }
  
  if (image !== undefined) {
    if (typeof image !== 'string' || image.trim().length < 1) {
      errors.push('La imagen es requerida');
    }
  } else if (!isUpdate) {
    errors.push('La imagen es requerida');
  }
  
  // Solo dígitos (con un + opcional adelante). Antes se aceptaba cualquier
  // string de 5+ caracteres, y ese valor se interpola en el href del botón
  // "Consultar" del catálogo: un valor con comillas podía cerrar el atributo
  // e inyectar un manejador de eventos (XSS almacenado). Ver AUDITORIA.md.
  if (whatsapp !== undefined) {
    if (typeof whatsapp !== 'string' || !/^\+?[0-9]{4,20}$/.test(whatsapp.trim())) {
      errors.push('El número de WhatsApp debe tener solo dígitos (entre 4 y 20, con + opcional)');
    }
  } else if (!isUpdate) {
    errors.push('El número de WhatsApp es requerido');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('. ') });
  }

  next();
}

function sanitizeOrder(order) {
  return VALID_ORDERS.includes(order) ? order : 'reciente';
}

function sanitizePeriod(period) {
  return VALID_PERIODS.includes(period) ? period : '30d';
}

// Largo mínimo. Se prioriza longitud por sobre reglas de composición
// ("una mayúscula, un símbolo...") siguiendo la guía del NIST: esas reglas
// empujan a la gente a claves tipo "Password1!" —fáciles para una máquina,
// molestas para una persona— mientras que el largo sí encarece el ataque.
const PASSWORD_MIN = 10;

// Claves obvias que se prueban primero en cualquier ataque de diccionario.
// No pretende ser exhaustiva (para eso haría falta una lista de millones);
// corta el caso realista de alguien apurado poniendo lo primero que se le
// ocurre.
const PASSWORD_COMUNES = [
  'contrasena', 'contraseña', 'password', 'passw0rd', '1234567890', '0123456789',
  'qwertyuiop', 'administrador', 'adminadmin', 'catalogo123', 'micontrasena',
  'password123', 'admin12345', '1234512345'
];

// Devuelve un array de errores; vacío significa que la contraseña sirve.
// Se exporta como función pura (no como middleware) porque la usan tanto el
// cambio de contraseña como la creación de usuarios.
function validarPassword(password, username) {
  const errores = [];

  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    errores.push('La contraseña debe tener al menos ' + PASSWORD_MIN + ' caracteres');
    return errores; // sin largo mínimo, el resto de los chequeos no aporta
  }

  const normalizada = password.toLowerCase();

  if (PASSWORD_COMUNES.includes(normalizada)) {
    errores.push('Esa contraseña es demasiado común, elegí otra');
  }

  if (username && normalizada.includes(String(username).toLowerCase())) {
    errores.push('La contraseña no puede contener tu nombre de usuario');
  }

  // Un solo carácter repetido, o una secuencia trivial.
  if (/^(.)\1+$/.test(password)) {
    errores.push('La contraseña no puede ser un mismo carácter repetido');
  }

  return errores;
}

module.exports = {
  validateProduct,
  sanitizeOrder,
  sanitizePeriod,
  validarPassword,
  PASSWORD_MIN,
  VALID_ORDERS,
  VALID_PERIODS
};
