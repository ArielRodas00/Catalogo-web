// ============================================================
// admin/recepcion.js — Recepción de mercadería
// ============================================================

var _recepcionInit = false;

function showRecepcionPanel() {
  document.getElementById('panel-recepcion').style.display = 'block';
  if (!_recepcionInit) {
    initRecepcion();
    _recepcionInit = true;
  }
}

function initRecepcion() {
  const searchInput = document.getElementById('recepcion-search');
  const tbody = document.getElementById('recepcion-tbody');
  const btnConfirmar = document.getElementById('btn-confirmar-recepcion');
  let allProducts = [];
  window._selectedItems = window._selectedItems || {};
  let searchTimeout = null;

  // Cargar todos los productos
  fetch('/api/products')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allProducts = data.products || [];
    })
    .catch(function(err) {
      console.error('Error cargando productos:', err);
    });

  // Búsqueda con debounce
  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
      const term = searchInput.value.trim().toLowerCase();
      if (term.length < 2) {
        tbody.innerHTML = '';
        btnConfirmar.disabled = true;
        document.getElementById('recepcion-empty').style.display = 'block';
        return;
      }

      const filtered = allProducts.filter(function(p) {
        return p.name && p.name.toLowerCase().includes(term);
      }).slice(0, 10); // max 10 resultados

      renderRecepcionResults(filtered);
    }, 300);
  });

  // Checkbox "Seleccionar todos"
  var checkAllRecepcion = document.getElementById('check-all-recepcion');
  if (checkAllRecepcion) {
    checkAllRecepcion.addEventListener('change', function() {
      var checked = this.checked;
      document.querySelectorAll('#recepcion-tbody .recepcion-check-item').forEach(function(cb) {
        cb.checked = checked;
      });
      updateRecepcionSummary();
    });
  }

  function renderRecepcionResults(products) {
    document.getElementById('recepcion-empty').style.display = 'none';

    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="recepcion-no-results">No se encontraron productos</td></tr>';
      return;
    }

    var html = '';
    products.forEach(function(p) {
      var currentQty = Number(p.stock_cantidad) || 0;
      var selected = window._selectedItems[p.id] || 0;
      var nuevo = currentQty + Number(selected);
      html += '<tr data-id="' + p.id + '">' +
        '<td><input type="checkbox" class="recepcion-check-item" checked data-id="' + p.id + '" aria-label="Seleccionar ' + escapeAttr(p.name) + '"></td>' +
        '<td class="td-producto">' +
          '<div class="recepcion-producto-info">' +
            (p.image ? '<img src="' + escapeAttr(p.image) + '" class="recepcion-thumb" onerror="this.style.display=\'none\'">' : '') +
            '<div>' +
              '<div class="recepcion-producto-name">' + escapeHTML(p.name) + '</div>' +
              '<div class="recepcion-producto-category">' + escapeHTML(p.category || '') + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td class="td-stock-actual">' + currentQty + '</td>' +
        '<td class="td-cantidad">' +
          '<input type="number" class="recepcion-qty-input" value="' + selected + '" min="0" max="999" data-id="' + p.id + '" aria-label="Cantidad recibida de ' + escapeAttr(p.name) + '">' +
        '</td>' +
        '<td class="td-nuevo-stock">' + nuevo + '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;

    // Event listeners en los inputs
    tbody.querySelectorAll('.recepcion-qty-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var id = this.getAttribute('data-id');
        var val = parseInt(this.value) || 0;
        if (val < 0) { val = 0; this.value = 0; }
        if (val > 999) { val = 999; this.value = 999; }
        window._selectedItems[id] = val;
        updateRecepcionSummary();

        // Actualizar preview del nuevo stock
        var row = this.closest('tr');
        var currentQty = parseInt(row.querySelector('.td-stock-actual').textContent) || 0;
        row.querySelector('.td-nuevo-stock').textContent = currentQty + val;
      });
    });
  }

  function updateRecepcionSummary() {
    var count = 0;
    var totalItems = 0;

    document.querySelectorAll('#recepcion-tbody .recepcion-check-item').forEach(function(cb) {
      if (cb.checked) {
        var id = cb.getAttribute('data-id');
        var qty = window._selectedItems[id] || 0;
        if (qty > 0) {
          count++;
          totalItems += qty;
        }
      }
    });

    var countEl = document.getElementById('recepcion-count');
    if (countEl) countEl.textContent = count;

    if (count > 0) {
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Confirmar Recepción (' + totalItems + ' unidades - ' + count + ' productos)';
    } else {
      btnConfirmar.disabled = true;
      btnConfirmar.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Confirmar Recepción (0)';
    }
  }
  // Confirmar recepción
  btnConfirmar.addEventListener('click', function() {
    var items = [];
    document.querySelectorAll('#recepcion-tbody .recepcion-check-item:checked').forEach(function(cb) {
      var id = parseInt(cb.getAttribute('data-id'));
      var qty = window._selectedItems[id] || 0;
      if (qty > 0) {
        items.push({ id: id, quantity: qty });
      }
    });

    if (items.length === 0) return;

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = '⏳ Procesando...';

    fetch('/api/products/batch-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ items: items })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) {
        showToast('Error: ' + data.error, 'error');
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '✓ Confirmar Recepción (<span id="confirm-count">0</span>)';
        return;
      }
      showToast('✓ ' + data.count + ' productos actualizados correctamente');
      window._selectedItems = {};
      document.getElementById('recepcion-search').value = '';
      document.getElementById('recepcion-tbody').innerHTML = '';
      document.getElementById('recepcion-empty').style.display = 'block';
      updateRecepcionSummary();
      // Recargar stock panel si está abierto
      if (typeof loadStockPanel === 'function') loadStockPanel();
    })
    .catch(function(err) {
      showToast('Error de conexión', 'error');
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '✓ Confirmar Recepción (<span id="confirm-count">0</span>)';
    });
  });

  // Exponer funciones para uso desde fuera (ej. initPedidoGlobal)
  window.renderRecepcionResults = renderRecepcionResults;
  window.updateRecepcionSummary = updateRecepcionSummary;
}

// ------------------------------------------------------------
// Delegación: botón "Recibir" en stock → abre Recepción con producto precargado
// ------------------------------------------------------------
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-recibir-stock');
  if (!btn) return;

  var productId = btn.getAttribute('data-id');
  var productName = btn.getAttribute('data-name');

  // Cambiar a la pestaña Recepción
  var recepcionTab = document.querySelector('.admin-tab[data-tab="recepcion"]');
  if (recepcionTab) recepcionTab.click();

  // Esperar a que el panel se muestre y precargar el producto
  setTimeout(function() {
    var searchInput = document.getElementById('recepcion-search');
    if (searchInput) {
      searchInput.value = productName;
      searchInput.dispatchEvent(new Event('input'));
    }
  }, 200);
});
