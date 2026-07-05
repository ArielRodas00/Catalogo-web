// ============================================================
// tilt.js — Efecto tilt 3D en tarjetas de producto (Mejora 2)
// ============================================================
// Dependencia: ninguna
// ============================================================

// Efecto tilt 3D al mover el mouse sobre las tarjetas (con throttle via rAF)
var ticking = false;
document.addEventListener('mousemove', function(e) {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function() {
    var card = e.target.closest('.product-card');
    if (card && !window.matchMedia('(hover: none)').matches) {
      var rect = card.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var centerX = rect.width / 2;
      var centerY = rect.height / 2;
      var rotateX = ((y - centerY) / centerY) * -5; // máx 5 grados
      var rotateY = ((x - centerX) / centerX) * 5;

      card.style.transform = 'perspective(800px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg)';
    }
    ticking = false;
  });
});

// Restaurar al salir de la tarjeta (mouseout burbujea, mouseleave no)
document.addEventListener('mouseout', function(e) {
  var card = e.target.closest('.product-card');
  if (!card) return;
  // Verificar si el mouse salió realmente de la tarjeta (no de un hijo interno)
  var related = e.relatedTarget;
  if (related && card.contains(related)) return;
  card.style.transform = '';
});
