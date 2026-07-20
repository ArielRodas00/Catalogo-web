const PLANES = ['basico', 'premium'];
const ESTADOS = ['activo', 'vencido', 'suspendido'];

function validateCliente(req, res, next) {
  const { nombre, slug, plan, estado } = req.body;
  const errors = [];
  const isUpdate = req.method === 'PUT';

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || nombre.trim().length < 1) errors.push('El nombre es requerido');
  } else if (!isUpdate) {
    errors.push('El nombre es requerido');
  }

  if (slug !== undefined) {
    if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
      errors.push('El slug debe tener solo minúsculas, números y guiones');
    }
  } else if (!isUpdate) {
    errors.push('El slug es requerido');
  }

  if (plan !== undefined && !PLANES.includes(plan)) {
    errors.push('Plan inválido (debe ser basico o premium)');
  }

  if (estado !== undefined && !ESTADOS.includes(estado)) {
    errors.push('Estado inválido (debe ser activo, vencido o suspendido)');
  }

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

module.exports = { validateCliente, validatePago, PLANES, ESTADOS };
