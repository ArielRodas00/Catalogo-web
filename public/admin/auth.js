// ============================================================
// admin/auth.js — Autenticación con JWT del panel
// ============================================================

// Verificamos si hay un token válido al cargar la página
async function checkAuth() {
  const token = localStorage.getItem('admin_token');

  if (!token) {
    showLogin();
    return;
  }

  try {
    // Verificamos el token con el servidor
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (res.ok) {
      const data = await res.json();
      showPanel(data.username);
    } else {
      // Token inválido o vencido
      localStorage.removeItem('admin_token');
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
      localStorage.setItem('admin_token', data.token);
      // Guardamos el token en localStorage
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

// Cerrar sesión
document.getElementById('btn-logout').addEventListener('click', function() {
  localStorage.removeItem('admin_token');
  // Eliminamos el token
  showLogin();
});
