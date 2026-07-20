// ============================================================
// admin/tabs.js — Navegación entre pestañas del panel
// ============================================================

function initTabs() {
  document.querySelectorAll('.admin-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      const target = this.getAttribute('data-tab');

      // Actualizamos los tabs
      document.querySelectorAll('.admin-tab').forEach(function(t) {
        t.classList.remove('active');
      });
      this.classList.add('active');

      // Mostramos el panel correcto
      document.getElementById('panel-productos').style.display  = 'none';
      document.getElementById('panel-metricas').style.display   = 'none';
      document.getElementById('panel-stock').style.display      = 'none';
      document.getElementById('panel-recepcion').style.display  = 'none';
      stopMetricsAutoRefresh();

      if (target === 'productos') {
        document.getElementById('panel-productos').style.display = 'block';
      } else if (target === 'metricas') {
        document.getElementById('panel-metricas').style.display = 'block';
        loadMetrics();
        startMetricsAutoRefresh();
      } else if (target === 'stock') {
        document.getElementById('panel-stock').style.display = 'block';
        loadStockPanel();
      } else if (target === 'recepcion') {
        document.getElementById('panel-recepcion').style.display = 'block';
        showRecepcionPanel();
      }
    });
  });

  // Selector de período
  document.getElementById('metrics-period').addEventListener('change', loadMetrics);
}
