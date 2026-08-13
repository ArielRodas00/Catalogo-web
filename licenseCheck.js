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
//
// Cómo se mantiene fresco el estado: con un refresco PEREZOSO disparado desde
// getLicense(), no con un setInterval. El motivo es que en un hosting
// serverless no hay un proceso de larga duración: un setInterval de 6hs
// prácticamente nunca llega a dispararse, y como branding.js también lee de
// getLicense(), el síntoma sería que al cliente se le caen el logo, los
// colores y las pestañas Premium de forma intermitente. El refresco perezoso
// funciona igual en un servidor siempre encendido que en serverless, así que
// no ata el proyecto a una plataforma. Ver AUDITORIA.md.
// ============================================================

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Espera mínima entre INTENTOS, independientemente de si salieron bien.
// Sin esto, un deploy cuyo chequeo falla siempre (Panel Central caído, o una
// CLIENTE_API_KEY mal configurada) nunca llena el cache, así que cada request
// dispararía un intento nuevo: una petición al Panel Central por cada visita
// al catálogo. Con el setInterval viejo eso no pasaba porque reintentaba cada
// 6hs. 5 minutos equilibra recuperarse rápido tras una caída con no
// castigar al Panel Central mientras el problema persiste.
const RETRY_INTERVAL_MS = 5 * 60 * 1000;

function isStandalone() {
  return !process.env.PANEL_CENTRAL_URL || !process.env.CLIENTE_API_KEY;
}

let lastGood = null; // { plan, activo, estado, checkedAt }

// Evita la estampida: si llegan muchos requests con el cache vencido, se
// dispara un solo chequeo y no uno por request.
let refreshing = false;

// El refresco en curso. En producción no se usa (es fire and forget), pero
// deja que los tests lo esperen en vez de dormir un rato arbitrario: sin
// esto, un refresco lanzado por un test termina durante el siguiente y le
// corrompe el estado.
let refreshPromise = null;

// Momento del último INTENTO (haya salido bien o mal). Es lo que evita
// martillar al Panel Central cuando el chequeo falla de forma persistente.
let lastAttemptAt = 0;

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

// Dispara un refresco en segundo plano si el cache está vencido. NO se espera
// (fire and forget) a propósito: getLicense() es síncrono y lo llaman rutas
// que están respondiendo un request — esperar acá agregaría la latencia del
// Panel Central a cada visita del catálogo.
function maybeRefresh() {
  if (refreshing) return;

  const ahora = Date.now();

  const vencido = !lastGood || (ahora - lastGood.checkedAt) >= CHECK_INTERVAL_MS;
  if (!vencido) return;

  // Aunque el cache esté vencido, respetamos la espera mínima entre intentos:
  // si el chequeo viene fallando, lastGood nunca se llena y sin este freno
  // cada request lanzaría una consulta nueva.
  if (ahora - lastAttemptAt < RETRY_INTERVAL_MS) return;

  lastAttemptAt = ahora;
  refreshing = true;
  // checkLicense() ya atrapa sus propios errores y nunca lanza; el finally
  // está igual para que un fallo inesperado no deje el flag trabado en true
  // y bloquee todos los refrescos futuros.
  refreshPromise = Promise.resolve()
    .then(checkLicense)
    .catch(function() { /* checkLicense ya loguea; acá solo evitamos un unhandled rejection */ })
    .finally(function() { refreshing = false; });
}

// Devuelve el estado de licencia a usar AHORA MISMO. Nunca lanza, nunca
// bloquea por una falla de red — degrada a Básico como mucho.
function getLicense() {
  if (isStandalone()) {
    return { plan: 'premium', activo: true, estado: 'standalone', branding: null };
  }

  // Mantiene el cache al día sin bloquear: devuelve el último valor conocido
  // y actualiza por detrás para el próximo request.
  maybeRefresh();

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
  // Solo el chequeo inicial, no bloqueante. Las actualizaciones posteriores
  // las dispara getLicense() por demanda (ver maybeRefresh): un setInterval
  // no sobrevive en serverless, donde no hay proceso de larga duración.
  checkLicense();
}

// Solo para tests: limpia el estado en memoria entre casos. Incluye el flag
// de refresco: si un test lo dejara en true, los siguientes no dispararían
// ningún chequeo y fallarían por una razón que no tiene que ver con lo que
// están probando.
function _resetForTests() {
  lastGood = null;
  refreshing = false;
  refreshPromise = null;
  lastAttemptAt = 0;
}

// Solo para tests: permite esperar el refresco disparado en segundo plano.
function _pendingRefresh() {
  return refreshPromise || Promise.resolve();
}

// Solo para tests: simula que ya pasó la espera mínima entre intentos, para
// poder probar el reintento sin dormir 5 minutos.
function _allowRetryNowForTests() {
  lastAttemptAt = 0;
}

module.exports = {
  startLicenseCheck,
  getLicense,
  checkLicense,
  _resetForTests,
  _pendingRefresh,
  _allowRetryNowForTests
};
