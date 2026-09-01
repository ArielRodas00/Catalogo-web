// ============================================================
// cuenta.js — Cambio de contraseña y verificación en dos pasos
// ============================================================
// Depende de: app.js (showToast). Espejo del de public/admin/ del catálogo.
//
// Los endpoints existían desde antes pero no tenían interfaz: para cambiar una
// contraseña había que usar curl. No sirve para un cliente real — quien
// sospecha que le vieron la clave tiene que poder cambiarla solo, en el
// momento, sin llamar a nadie.
// ============================================================

(function() {
  const modal = document.getElementById('cuenta-modal-overlay');
  if (!modal) return;

  const btnAbrir  = document.getElementById('btn-cuenta');
  const btnCerrar = document.getElementById('btn-close-cuenta-modal');

  const formPass = document.getElementById('form-password');
  const msgPass  = document.getElementById('pass-msg');

  const estado2fa = document.getElementById('dosfa-estado');
  const vistaOff   = document.getElementById('dosfa-off');
  const vistaSetup = document.getElementById('dosfa-setup');
  const vistaOn    = document.getElementById('dosfa-on');

  function mensaje(el, texto, tipo) {
    el.textContent = texto;
    el.className = 'cuenta-msg cuenta-msg--' + (tipo || 'error');
    el.style.display = 'block';
  }
  function limpiar(el) { el.style.display = 'none'; el.textContent = ''; }

  // ------------------------------------------------------------
  // Abrir / cerrar
  // ------------------------------------------------------------
  function abrir() {
    modal.style.display = 'flex';
    limpiar(msgPass);
    formPass.reset();
    cargarEstado2fa();
  }
  function cerrar() { modal.style.display = 'none'; }

  // ------------------------------------------------------------
  // Cambio de contraseña
  // ------------------------------------------------------------
  formPass.addEventListener('submit', async function(e) {
    e.preventDefault();
    limpiar(msgPass);

    const actual  = document.getElementById('pass-actual').value;
    const nueva   = document.getElementById('pass-nueva').value;
    const repetir = document.getElementById('pass-repetir').value;

    // Se compara acá antes de mandar: es un error del formulario, no algo que
    // el servidor tenga que decidir, y así el aviso es inmediato.
    if (nueva !== repetir) {
      mensaje(msgPass, 'Las dos contraseñas nuevas no coinciden.');
      return;
    }

    const btn = document.getElementById('btn-guardar-pass');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordActual: actual, passwordNueva: nueva })
      });
      const data = await r.json();

      if (!r.ok) {
        mensaje(msgPass, data.error || 'No se pudo cambiar la contraseña.');
        return;
      }

      // El servidor invalida la sesión al cambiar la clave (ver
      // middleware/auth.js), así que no tiene sentido dejar el panel abierto:
      // el próximo click daría un error incomprensible. Se avisa y se recarga.
      mensaje(msgPass, 'Listo. Vas a tener que entrar de nuevo con la contraseña nueva.', 'ok');
      showToast('Contraseña cambiada', 'success');
      setTimeout(function() { window.location.reload(); }, 2200);
    } catch (err) {
      mensaje(msgPass, 'No se pudo conectar. Probá de nuevo.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cambiar contraseña';
    }
  });

  // ------------------------------------------------------------
  // Estado del segundo factor
  // ------------------------------------------------------------
  function mostrar(cual) {
    vistaOff.style.display   = cual === 'off'   ? 'block' : 'none';
    vistaSetup.style.display = cual === 'setup' ? 'block' : 'none';
    vistaOn.style.display    = cual === 'on'    ? 'block' : 'none';
  }

  async function cargarEstado2fa() {
    estado2fa.textContent = 'Consultando…';
    mostrar(null);
    try {
      const r = await fetch('/api/auth/2fa/estado', { credentials: 'include' });
      const d = await r.json();
      if (d.activo) {
        estado2fa.textContent = 'Activada';
        mostrar('on');
      } else {
        estado2fa.textContent = 'Desactivada';
        mostrar('off');
      }
    } catch (e) {
      estado2fa.textContent = 'No se pudo consultar el estado.';
    }
  }

  // ------------------------------------------------------------
  // Activar: primero el QR, y recién se activa al confirmar un código
  // ------------------------------------------------------------
  // El servidor no activa nada en este paso a propósito: si activara acá y el
  // QR se escaneó mal, la cuenta quedaría inaccesible.
  document.getElementById('btn-2fa-activar').addEventListener('click', async function() {
    try {
      const r = await fetch('/api/auth/2fa/setup', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) { showToast(d.error || 'No se pudo generar el código', 'error'); return; }

      document.getElementById('dosfa-qr').src = d.qr;
      document.getElementById('dosfa-secreto').textContent = d.secreto;
      limpiar(document.getElementById('dosfa-msg'));
      document.getElementById('form-2fa').reset();
      mostrar('setup');
    } catch (e) {
      showToast('No se pudo conectar', 'error');
    }
  });

  document.getElementById('btn-2fa-cancelar').addEventListener('click', function() {
    cargarEstado2fa();
  });

  document.getElementById('form-2fa').addEventListener('submit', async function(e) {
    e.preventDefault();
    const msg = document.getElementById('dosfa-msg');
    limpiar(msg);
    const codigo = document.getElementById('dosfa-codigo').value.trim();

    try {
      const r = await fetch('/api/auth/2fa/activate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigo })
      });
      const d = await r.json();
      if (!r.ok) { mensaje(msg, d.error || 'El código no es válido.'); return; }

      showToast('Verificación en dos pasos activada', 'success');
      cargarEstado2fa();
    } catch (e) {
      mensaje(msg, 'No se pudo conectar. Probá de nuevo.');
    }
  });

  // ------------------------------------------------------------
  // Desactivar: pide la contraseña, no alcanza con la sesión abierta
  // ------------------------------------------------------------
  // Es lo primero que intentaría alguien que se sentó frente a una sesión sin
  // bloquear, así que se re-confirma la identidad.
  document.getElementById('form-2fa-off').addEventListener('submit', async function(e) {
    e.preventDefault();
    const msg = document.getElementById('dosfa-msg-off');
    limpiar(msg);

    try {
      const r = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('dosfa-pass').value })
      });
      const d = await r.json();
      if (!r.ok) { mensaje(msg, d.error || 'No se pudo desactivar.'); return; }

      document.getElementById('form-2fa-off').reset();
      showToast('Verificación en dos pasos desactivada', 'success');
      cargarEstado2fa();
    } catch (e) {
      mensaje(msg, 'No se pudo conectar. Probá de nuevo.');
    }
  });

  if (btnAbrir) btnAbrir.addEventListener('click', abrir);
  if (btnCerrar) btnCerrar.addEventListener('click', cerrar);
  modal.addEventListener('click', function(e) { if (e.target === modal) cerrar(); });
})();
