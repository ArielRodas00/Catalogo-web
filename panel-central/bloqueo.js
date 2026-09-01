// ============================================================
// bloqueo.js — Bloqueo por cuenta ante intentos fallidos
// ============================================================
// El limitador de `express-rate-limit` cuenta **por IP** y en la memoria del
// proceso. En serverless eso es débil por dos motivos a la vez:
//
//   1. Las instancias se reciclan, y el contador se va con ellas.
//   2. Un atacante con muchas IPs (una botnet, o simplemente proxies) lo
//      esquiva por completo: cada IP arranca con su cuota entera.
//
// Este contador vive en la base y es **por cuenta**, así que no depende ni de
// la IP ni de qué instancia atienda el request. Los dos controles se suman:
// el de IP frena el ruido barato, este frena el ataque dirigido.
//
// NOTA sobre la duplicación con el catálogo: este archivo es un espejo del
// que está en la raíz. Son dos apps con deploys y bases distintas,
// y el Panel se publica apuntando solo a su subdirectorio, así que un
// require() a un archivo de afuera no llegaría al paquete desplegado. Si se
// toca uno, tocar el otro.
// ============================================================

const pool = require('./db');

// Cuántos fallos seguidos antes de bloquear. Se eligió 8 —y no 3— a
// conciencia: alguien que se equivoca de contraseña tres veces seguidas es un
// caso normal, y bloquearlo sería un problema de usabilidad que además invita
// a un ataque de denegación de servicio (bloquear la cuenta ajena a propósito).
const MAX_INTENTOS = 8;

// Cuánto dura el bloqueo. Suficiente para arruinar un ataque por fuerza bruta
// (8 intentos cada 15 minutos son ~768 por día) y tolerable para quien
// realmente olvidó su clave.
const MINUTOS_BLOQUEO = 15;

// ------------------------------------------------------------
// estaBloqueada() — ¿la cuenta está en penitencia ahora mismo?
// ------------------------------------------------------------
// Devuelve { bloqueada, minutosRestantes }.
function estaBloqueada(fila) {
  if (!fila || !fila.bloqueado_hasta) return { bloqueada: false, minutosRestantes: 0 };
  const hasta = new Date(fila.bloqueado_hasta).getTime();
  const ahora = Date.now();
  if (hasta <= ahora) return { bloqueada: false, minutosRestantes: 0 };
  return { bloqueada: true, minutosRestantes: Math.ceil((hasta - ahora) / 60000) };
}

// ------------------------------------------------------------
// registrarFallo() — suma un intento y bloquea si corresponde
// ------------------------------------------------------------
// Devuelve { bloqueada, intentos } para poder auditarlo.
async function registrarFallo(usuarioId) {
  try {
    const r = await pool.query(
      `UPDATE administradores
          SET intentos_fallidos = intentos_fallidos + 1,
              bloqueado_hasta = CASE
                WHEN intentos_fallidos + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval
                ELSE bloqueado_hasta
              END
        WHERE id = $1
        RETURNING intentos_fallidos, bloqueado_hasta`,
      [usuarioId, MAX_INTENTOS, String(MINUTOS_BLOQUEO)]
    );
    if (r.rows.length === 0) return { bloqueada: false, intentos: 0 };
    const fila = r.rows[0];
    return {
      bloqueada: estaBloqueada(fila).bloqueada,
      intentos: fila.intentos_fallidos
    };
  } catch (err) {
    // Igual que la auditoría: contar intentos no puede tumbar el login. Si
    // falla, queda el limitador por IP como red.
    console.error('No se pudo registrar el intento fallido:', err.message);
    return { bloqueada: false, intentos: 0 };
  }
}

// ------------------------------------------------------------
// limpiarIntentos() — se llama tras un login exitoso
// ------------------------------------------------------------
async function limpiarIntentos(usuarioId) {
  try {
    await pool.query(
      'UPDATE administradores SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1 AND (intentos_fallidos > 0 OR bloqueado_hasta IS NOT NULL)',
      [usuarioId]
    );
  } catch (err) {
    console.error('No se pudieron limpiar los intentos fallidos:', err.message);
  }
}

module.exports = { estaBloqueada, registrarFallo, limpiarIntentos, MAX_INTENTOS, MINUTOS_BLOQUEO };
