// ============================================================
// licenseCheck.js — Chequeo de licencia contra el Panel Central
// (arquitectura multi-tenant "1 deploy por cliente", ver AUDITORIA.md)
// ============================================================
// Nota de nombre: se llama "licenseCheck" y no "license" a propósito — en
// Windows/Mac (filesystem case-insensitive), require('../license') resuelve
// al archivo LICENSE (texto plano) en vez de license.js. Ver AUDITORIA.md.
//
// Si PANEL_CENTRAL_URL / CLIENTE_API_KEY no están configurados, este deploy
// no es parte del sistema multi-tenant (standalone) y opera sin restricción
// de plan — no rompe despliegues existentes que no usen el Panel Central.
//
// Si SÍ están configurados: consulta periódicamente el estado real. Ante un
// corte de conexión (no una respuesta explícita de "suspendido"), nunca
// bloquea el sitio — solo pierde las features Premium después de 48hs sin
// poder confirmar el estado, para no castigar al cliente por una caída del
// lado del Panel Central en vez de un problema real de pago.
// ============================================================

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isStandalone() {
  return !process.env.PANEL_CENTRAL_URL || !process.env.CLIENTE_API_KEY;
}

let lastGood = null; // { plan, activo, estado, checkedAt }

async function checkLicense() {
  if (isStandalone()) return;

  try {
    const url = process.env.PANEL_CENTRAL_URL.replace(/\/$/, '') + '/api/licencia';
    const res = await fetch(url, {
      headers: { 'X-API-Key': process.env.CLIENTE_API_KEY }
    });

    if (!res.ok) {
      console.error('Chequeo de licencia respondió con status', res.status);
      return;
    }

    const data = await res.json();
    lastGood = {
      plan: data.plan,
      activo: data.activo,
      estado: data.estado,
      // Marca opcional del Panel Central (ver AUDITORIA.md, "Branding desde
      // el Panel Central") — null/ausente significa que ese cliente no tiene
      // nada cargado ahí, y branding.js debe usar sus propios defaults.
      branding: data.branding || null,
      checkedAt: Date.now()
    };
    console.log('Licencia verificada: plan=' + lastGood.plan + ' estado=' + lastGood.estado);
  } catch (err) {
    console.error('No se pudo contactar al Panel Central:', err.message);
  }
}

// Devuelve el estado de licencia a usar AHORA MISMO. Nunca lanza, nunca
// bloquea por una falla de red — degrada a Básico como mucho.
function getLicense() {
  if (isStandalone()) {
    return { plan: 'premium', activo: true, estado: 'standalone', branding: null };
  }

  if (lastGood && (Date.now() - lastGood.checkedAt) < GRACE_PERIOD_MS) {
    return lastGood;
  }

  // Nunca se pudo confirmar el estado, o pasaron más de 48hs sin poder
  // reconfirmarlo: degradamos a Básico (se pierden las features Premium)
  // pero el sitio sigue funcionando. La marca también se cae a los defaults
  // del catálogo — no tiene sentido mantener un color/logo "viejo" más
  // tiempo del que ya se sostiene el resto del estado de licencia.
  return { plan: 'basico', activo: true, estado: lastGood ? 'desconocido' : 'sin_verificar', branding: null };
}

function startLicenseCheck() {
  if (isStandalone()) {
    console.log('PANEL_CENTRAL_URL/CLIENTE_API_KEY no configurados — deploy standalone, sin restricción de plan.');
    return;
  }
  checkLicense(); // primer chequeo al arrancar, no bloqueante
  const interval = setInterval(checkLicense, CHECK_INTERVAL_MS);
  interval.unref(); // no debe mantener vivo el proceso por sí solo
}

// Solo para tests: limpia el estado en memoria entre casos.
function _resetForTests() {
  lastGood = null;
}

module.exports = { startLicenseCheck, getLicense, checkLicense, _resetForTests };
