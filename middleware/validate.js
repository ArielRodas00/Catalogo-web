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

module.exports = { validateProduct, sanitizeOrder, sanitizePeriod, VALID_ORDERS, VALID_PERIODS };
