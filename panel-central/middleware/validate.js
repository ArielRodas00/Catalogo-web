const PLANES = ['basico', 'premium'];
const ESTADOS = ['activo', 'vencido', 'suspendido'];
const PRODUCTOS = ['catalogo', 'lavadero360'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9-]+$/;

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_e) {
    return false;
  }
}

function validateCliente(req, res, next) {
  const {
    nombre, slug, producto, plan, estado, lavadero360_org_slug,
    store_name, store_name_accent, favicon_url,
    color_primary, color_primary_hover, color_accent
  } = req.body;
  const errors = [];
  const isUpdate = req.method === 'PUT';

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim().length < 1) errors.push('El nombre es requerido');
  } else if (!isUpdate) {
    errors.push('El nombre es requerido');
  }

  if (slug !== undefined) {
    if (typeof slug !== 'string' || !SLUG.test(slug)) {
      errors.push('El slug debe tener solo minúsculas, números y guiones');
    }
  } else if (!isUpdate) {
    errors.push('El slug es requerido');
  }

  if (producto !== undefined && !PRODUCTOS.includes(producto)) {
    errors.push('Producto inválido (debe ser catalogo o lavadero360)');
  }

  if (plan !== undefined && !PLANES.includes(plan)) {
    errors.push('Plan inválido (debe ser basico o premium)');
  }

  if (estado !== undefined && !ESTADOS.includes(estado)) {
    errors.push('Estado inválido (debe ser activo, vencido o suspendido)');
  }

  // Solo tiene sentido para producto='lavadero360' — la cuenta ya existe en
  // Lavadero360 (self-signup) y esto la vincula por su slug, no la crea.
  if (
    lavadero360_org_slug !== undefined &&
    lavadero360_org_slug !== null &&
    lavadero360_org_slug !== '' &&
    !SLUG.test(lavadero360_org_slug)
  ) {
    errors.push('El slug de Lavadero360 debe tener solo minúsculas, números y guiones');
  }

  // Marca (todos opcionales — null/vacío significa "usar el default del catálogo")
  if (store_name !== undefined && store_name !== null && store_name.length > 150) {
    errors.push('El nombre de marca es demasiado largo');
  }
  if (store_name_accent !== undefined && store_name_accent !== null && store_name_accent.length > 150) {
    errors.push('El acento del nombre de marca es demasiado largo');
  }
  if (favicon_url !== undefined && favicon_url !== null && favicon_url !== '' && !isValidHttpUrl(favicon_url)) {
    errors.push('La URL del favicon debe ser http/https');
  }
  [['color_primary', color_primary], ['color_primary_hover', color_primary_hover], ['color_accent', color_accent]]
    .forEach(function([label, value]) {
      if (value !== undefined && value !== null && value !== '' && !HEX_COLOR.test(value)) {
        errors.push('El color ' + label + ' debe ser un hex de 6 dígitos (ej. #c1121f)');
      }
    });

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join('. ') });
  }

  next();
}

function validatePago(req, res, next) {
  const { monto } = req.body;
  if (monto === undefined || isNaN(Number(monto)) || Number(monto) < 0) {
    return res.status(400).json({ error: 'El monto debe ser un número positivo' });
  }
  next();
}

// La fortaleza de contraseña vive en password.js (una sola fuente de
// verdad). Se re-exporta acá porque varios módulos la importaban de este
// archivo antes de que aquel existiera.
const { validarPassword, PASSWORD_MIN } = require('../password');

module.exports = {
  validateCliente,
  validatePago,
  validarPassword,
  PASSWORD_MIN,
  PLANES,
  ESTADOS,
  PRODUCTOS
};
