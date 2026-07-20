// ============================================================
// admin/metrics.js — Panel de métricas (vistas, clicks, búsquedas)
// ============================================================

async function loadMetrics() {
  try {
    const period = document.getElementById('metrics-period').value;
    const token  = localStorage.getItem('admin_token');

    const res  = await fetch('/api/metrics/dashboard?period=' + period, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    window._lastMetricsData = data;

    // --- Cards de totales ---
    document.getElementById('total-vistas').textContent    = data.totales.vistas;
    document.getElementById('total-clicks').textContent    = data.totales.clicks;
    document.getElementById('total-busquedas').textContent = data.totales.busquedas;

    // Render progress bars for vistas
    renderProgressBars('vistas-bars', data.topVistas.slice(0, 5), 'vistas');

    // Render progress bars for clicks
    renderProgressBars('clicks-bars', data.topClicks.slice(0, 5), 'clicks');

    // Render progress bars for búsquedas
    renderProgressBars('busquedas-bars', data.topBusquedas.slice(0, 5), 'busquedas');
  } catch (err) {
    console.error('Error cargando métricas:', err);
  }
}

let metricsInterval = null;

function startMetricsAutoRefresh() {
  stopMetricsAutoRefresh();
  // Actualiza las métricas cada 15 segundos mientras
  // el admin esté mirando la pestaña de métricas
  metricsInterval = setInterval(loadMetrics, 15000);
}

function stopMetricsAutoRefresh() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

// Render progress bars with values
function renderProgressBars(containerId, data, type) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var maxVal = Math.max.apply(null, data.map(function(p) { return parseInt(p[type] || p.cantidad || 0); }));
  if (maxVal === 0) maxVal = 1;

  container.innerHTML = data.map(function(item) {
    var name = type === 'busquedas' ? escapeHTML(item.termino) : escapeHTML(item.name);
    var value = type === 'busquedas' ? item.cantidad : (parseInt(item[type]) || 0);
    var pct = Math.round((value / maxVal) * 100);

    return '<div class="metrics-bar-item">' +
      '<span class="metrics-bar-name">' + name + '</span>' +
      '<span class="metrics-bar-value">' + value + '</span>' +
      '<div class="metrics-bar-track">' +
        '<div class="metrics-bar-fill ' + type + '" style="width: ' + pct + '%"></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// Modal de métricas - Ver todos
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-ver-todos');
  if (!btn) return;

  var metric = btn.getAttribute('data-metric');
  var modal = document.getElementById('metrics-modal');
  var title = document.getElementById('metrics-modal-title');
  var body = document.getElementById('metrics-modal-body');

  // Get all metrics data from the last load
  var allData = window._lastMetricsData;
  if (!allData) return;

  var containerId = 'modal-bars-container';
  body.innerHTML = '<div id="' + containerId + '" class="metrics-bars"></div>';

  if (metric === 'vistas') {
    title.textContent = 'Todos los productos - Vistas';
    renderProgressBars(containerId, allData.topVistas, 'vistas');
  } else if (metric === 'clicks') {
    title.textContent = 'Todos los productos - Clicks WhatsApp';
    renderProgressBars(containerId, allData.topClicks, 'clicks');
  } else if (metric === 'busquedas') {
    title.textContent = 'Todas las búsquedas frecuentes';
    renderProgressBars(containerId, allData.topBusquedas, 'busquedas');
  }

  modal.style.display = 'flex';
});

// Close metrics modal
document.addEventListener('click', function(e) {
  if (e.target.id === 'metrics-modal' || e.target.id === 'metrics-modal-close') {
    document.getElementById('metrics-modal').style.display = 'none';
  }
});
