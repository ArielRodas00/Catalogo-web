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
  
  if (whatsapp !== undefined) {
    if (typeof whatsapp !== 'string' || (whatsapp.trim().length < 5 && whatsapp.trim() !== '0000')) {
      errors.push('El número de WhatsApp debe tener al menos 5 caracteres');
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
