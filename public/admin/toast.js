// ============================================================
// admin/toast.js — Notificación tipo toast del panel
// ============================================================

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent   = message;
  toast.style.display = 'block';
  toast.style.pointerEvents = 'none';
  toast.classList.add('toast-visible');
  setTimeout(function() {
    toast.classList.remove('toast-visible');
    toast.style.display = 'none';
  }, 3000);
}
