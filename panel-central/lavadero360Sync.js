// ============================================================
// lavadero360Sync.js — Sincroniza el estado de pago con Lavadero360
// ============================================================
// Cuando un cliente producto='lavadero360' cambia de `estado` acá, esto le
// avisa a la API de Lavadero360 (server-to-server, con LAVADERO360_ADMIN_KEY)
// para que corte o reactive el acceso al instante. La cuenta en sí NO la
// crea el Panel Central — ya existe (self-signup con período de prueba en
// Lavadero360), acá solo se administra el pago y el corte de acceso.
//
// Nunca revienta el guardado en el Panel Central si esto falla (Lavadero360
// caído, slug mal cargado, etc.) — se guarda igual acá y se devuelve un
// aviso para que quien lo cargó sepa que hace falta reintentar.
// ============================================================

const ESTADO_A_SUBSCRIPTION_STATUS = {
  activo: 'ACTIVE',
  vencido: 'PAST_DUE',
  suspendido: 'CANCELED'
};

function isConfigured() {
  return Boolean(process.env.LAVADERO360_API_URL && process.env.LAVADERO360_ADMIN_KEY);
}

async function syncLavadero360Subscription(orgSlug, estado) {
  if (!isConfigured()) {
    return { ok: false, reason: 'Lavadero360 no está configurado (faltan variables de entorno)' };
  }

  const status = ESTADO_A_SUBSCRIPTION_STATUS[estado];
  if (!status) {
    return { ok: false, reason: 'Estado desconocido: ' + estado };
  }

  try {
    const url = process.env.LAVADERO360_API_URL.replace(/\/$/, '') +
      '/admin/organizations/' + encodeURIComponent(orgSlug) + '/subscription';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': process.env.LAVADERO360_ADMIN_KEY
      },
      body: JSON.stringify({ status: status })
    });

    if (!res.ok) {
      const body = await res.json().catch(function() { return {}; });
      const reason = (body.error && body.error.message) || ('HTTP ' + res.status);
      return { ok: false, reason: reason };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Se llama después de guardar en la propia base del Panel Central — nunca
// antes: el registro acá es la fuente de verdad de "qué le vendiste a quién",
// la sincronización con Lavadero360 es un efecto secundario, no al revés.
async function maybeSyncLavadero360(clienteRow) {
  if (clienteRow.producto !== 'lavadero360' || !clienteRow.lavadero360_org_slug) {
    return null;
  }
  return syncLavadero360Subscription(clienteRow.lavadero360_org_slug, clienteRow.estado);
}

module.exports = { syncLavadero360Subscription, maybeSyncLavadero360, isConfigured };
