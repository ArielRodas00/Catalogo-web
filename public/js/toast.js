// ============================================================
// toast.js — Toast notifications para frontend público (Mejora 4)
// ============================================================
// Dependencia: ninguna
// ============================================================

/**
 * Muestra un toast en la esquina inferior derecha.
 * @param {string} message - Texto del toast
 * @param {string} type - 'info' | 'success'
 */
function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  if (!container) return;

  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;

  container.appendChild(toast);

  // Mostrar con animación
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      toast.classList.add('show');
    });
  });

  // Ocultar y remover después de 3 segundos
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

window.showToast = showToast;
