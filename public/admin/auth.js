// ============================================================
// admin/auth.js — Autenticación del panel (cookie httpOnly)
// ============================================================
// La sesión vive en una cookie httpOnly que setea el servidor al hacer
// login: este archivo nunca ve ni guarda el token. El navegador la adjunta
// solo en cada petición al mismo origen. Antes el token se guardaba en
// localStorage, donde cualquier XSS podía leerlo — ver AUDITORIA.md.
// ============================================================

// Al cargar la página no hay forma (ni necesidad) de "mirar si hay token":
// la única fuente de verdad es el servidor, así que le preguntamos.
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/verify');

    if (res.ok) {
      const data = await res.json();
      showPanel(data.username);
    } else {
      // Sin cookie, o vencida/inválida: el servidor ya la considera inválida,
      // no hay nada que limpiar del lado del navegador.
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-panel').style.display  = 'none';
}

function showPanel(username) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-panel').style.display  = 'block';
  initAdmin();
}

// Formulario de login
document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();

  const username = document.getElementById('username-input').value;
  const password = document.getElementById('password-input').value;

  try {
    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      // No recibimos ningún token: vino en la cookie httpOnly de la respuesta
      // y el navegador ya la guardó por su cuenta.
      document.getElementById('login-error').style.display = 'none';
      showPanel(data.username);
    } else {
      document.getElementById('login-error').style.display = 'block';
      document.getElementById('login-error').textContent   = data.error;
    }
  } catch (err) {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('login-error').textContent   = 'Error de conexión con el servidor';
  }
});

// Cerrar sesión — ahora lo tiene que hacer el servidor: el JavaScript no
// puede borrar una cookie httpOnly.
document.getElementById('btn-logout').addEventListener('click', async function() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    // Si falla la red igual devolvemos al login: la cookie sigue viva pero el
    // usuario ve la pantalla de acceso, y el token vence solo en 8hs.
  }
  showLogin();
});
