const VALID_ORDERS = ['az', 'za', 'precio-asc', 'precio-desc', 'reciente'];
const VALID_PERIODS = ['7d', '30d', '90d', 'all'];

function validateProduct(req, res, next) {
  const { name, price, category, image, whatsapp } = req.body;

  const errors = [];
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    errors.push('El nombre es requerido');
  }
  if (price === undefined || isNaN(Number(price)) || Number(price) < 0) {
    errors.push('El precio debe ser un número positivo');
  }
  if (!category || typeof category !== 'string' || category.trim().length < 1) {
    errors.push('La categoría es requerida');
  }
  if (!image || typeof image !== 'string' || image.trim().length < 1) {
    errors.push('La imagen es requerida');
  }
  if (!whatsapp || typeof whatsapp !== 'string' || whatsapp.trim().length < 5) {
    errors.push('El número de WhatsApp es requerido (mín. 5 caracteres)');
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
