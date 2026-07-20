// ============================================================
// admin/stock.js — Control de stock
// ============================================================

let currentStockTab = 'todos';

async function loadStockPanel() {
  const all = await getProducts();

  const sinStock  = all.filter(function(p) { return p.stock_cantidad === 0 || !p.en_stock; });
  const pocoStock = all.filter(function(p) {
    return p.stock_cantidad > 0 &&
           p.stock_cantidad <= (p.stock_minimo || 5) &&
           p.en_stock;
  });

  renderStockTable(all, sinStock, pocoStock);
  initStockTabs(all, sinStock, pocoStock);
  initStockCheckAll();
  initStockExport(all, sinStock, pocoStock);
}

function renderStockTable(all, sinStock, pocoStock) {
  const tbody  = document.getElementById('stock-tbody');
  const empty  = document.getElementById('stock-empty');
  const count  = document.getElementById('stock-count');
  const checkAll = document.getElementById('check-all-stock');

  let filtered;
  if (currentStockTab === 'sin-stock') {
    filtered = sinStock;
  } else if (currentStockTab === 'poco-stock') {
    filtered = pocoStock;
  } else {
    filtered = sinStock.concat(pocoStock);
  }

  // Remove duplicates (a product could be both sin-stock and poco-stock)
  const seen = new Set();
  filtered = filtered.filter(function(p) {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  document.getElementById('stock-count').textContent =
    filtered.length + ' producto' + (filtered.length !== 1 ? 's' : '');

  if (checkAll) checkAll.checked = false;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    document.getElementById('stock-empty').style.display = 'block';
    document.getElementById('table-stock').style.display = 'none';
    return;
  }

  document.getElementById('stock-empty').style.display = 'none';
  document.getElementById('table-stock').style.display = '';

  tbody.innerHTML = filtered.map(function(p) {
    const isSinStock = p.stock_cantidad === 0 || !p.en_stock;
    const isPocoStock = p.stock_cantidad > 0 && p.stock_cantidad <= (p.stock_minimo || 5);
    const sugerido = Math.max(0, (p.stock_minimo || 5) * 2 - (p.stock_cantidad || 0));

    const estadoHTML = isSinStock
      ? '<span class="badge badge-nostock">Sin stock</span>'
      : isPocoStock
        ? '<span class="badge badge-destacado">Poco stock</span>'
        : '<span class="badge badge-stock">En stock</span>';

    return '<tr>' +
      '<td><input type="checkbox" class="stock-check-item" aria-label="Seleccionar ' + escapeAttr(p.name) + '" data-id="' + p.id + '" data-name="' + escapeAttr(p.name) + '" data-category="' + escapeAttr(p.category) + '" data-brand="' + escapeAttr(p.brand || '') + '" data-stock="' + (p.stock_cantidad || 0) + '" data-minimo="' + (p.stock_minimo || 5) + '"></td>' +
      '<td class="td-name">' + escapeHTML(p.name) + '</td>' +
      '<td class="td-category">' + escapeHTML(p.category) + '</td>' +
      '<td>' + (p.stock_cantidad || 0) + '</td>' +
      '<td>' + (p.stock_minimo || 5) + '</td>' +
      '<td><input type="number" class="stock-qty-input" aria-label="Cantidad a pedir de ' + escapeAttr(p.name) + '" value="' + sugerido + '" min="0" data-id="' + p.id + '"></td>' +
      '<td>' + estadoHTML + '</td>' +
      '<td class="td-accion">' +
        '<button class="btn-edit" onclick="openEditForm(' + p.id + ')" aria-label="Editar ' + escapeAttr(p.name) + '" title="Editar">' +
          '<span class="material-symbols-outlined" aria-hidden="true">edit</span>' +
        '</button>' +
        '<button class="btn-recibir-stock" data-id="' + p.id + '" data-name="' + escapeAttr(p.name) + '">Recibir 📦</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

var _stockTabsInit = false;
function initStockTabs(all, sinStock, pocoStock) {
  if (_stockTabsInit) return;
  _stockTabsInit = true;
  document.querySelectorAll('.stock-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      currentStockTab = this.getAttribute('data-stock-tab');
      document.querySelectorAll('.stock-tab').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      renderStockTable(all, sinStock, pocoStock);
    });
  });
}

function initStockCheckAll() {
  const checkAll = document.getElementById('check-all-stock');
  if (!checkAll) return;

  checkAll.addEventListener('change', function() {
    const checked = this.checked;
    document.querySelectorAll('.stock-check-item').forEach(function(cb) {
      cb.checked = checked;
    });
  });
}

function getSelectedStockItems() {
  const items = [];
  document.querySelectorAll('.stock-check-item:checked').forEach(function(cb) {
    const id = cb.getAttribute('data-id');
    const qtyInput = document.querySelector('.stock-qty-input[data-id="' + id + '"]');
    const cantidad = qtyInput ? parseInt(qtyInput.value) || 0 : 0;
    items.push({
      id:       id,
      name:     cb.getAttribute('data-name'),
      category: cb.getAttribute('data-category'),
      brand:    cb.getAttribute('data-brand'),
      stock:    parseInt(cb.getAttribute('data-stock')) || 0,
      minimo:   parseInt(cb.getAttribute('data-minimo')) || 5,
      cantidad: cantidad
    });
  });
  return items;
}

var _stockExportInit = false;
function initStockExport(all, sinStock, pocoStock) {
  if (_stockExportInit) return;
  _stockExportInit = true;
  const btn     = document.getElementById('btn-export-stock');
  const btnPrev = document.getElementById('btn-preview-report');

  if (btn) {
    btn.addEventListener('click', function() {
      const selected = getSelectedStockItems();
      if (selected.length === 0) {
        showToast('Seleccioná al menos un producto para exportar.');
        return;
      }
      exportCSV(selected);
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', function() {
      const selected = getSelectedStockItems();
      if (selected.length === 0) {
        showToast('Seleccioná al menos un producto para exportar.');
        return;
      }
      showStockReportPreview(selected);
    });
  }
}

function exportCSV(selected) {
  const headers = ['Producto', 'Categoría', 'Marca', 'Stock actual', 'Stock mínimo', 'Cant. a pedir'];
  const rows = selected.map(function(item) {
    return '"' + item.name.replace(/"/g, '""') + '","' +
           item.category.replace(/"/g, '""') + '","' +
           (item.brand || '').replace(/"/g, '""') + '","' +
           item.stock + '","' + item.minimo + '","' + item.cantidad + '"';
  });

  const csv = String.fromCharCode(0xFEFF) + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'pedido-proveedor-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(selected.length + ' producto' + (selected.length !== 1 ? 's' : '') + ' exportado(s) ✓');
}

function showStockReportPreview(selected) {
  const groups = {};
  selected.forEach(function(item) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  });
  const catKeys = Object.keys(groups).sort();

  const totalItems = selected.length;
  const totalQty   = selected.reduce(function(sum, item) { return sum + item.cantidad; }, 0);
  const today      = new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' });

  var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<title>Pedido a Proveedor - ' + today + '</title>' +
    '<style>' +
    '  * { margin:0; padding:0; box-sizing:border-box; }' +
    '  body { font-family:"Segoe UI",sans-serif; background:#eee; padding:40px 20px; color:#333; }' +
    '  .report { max-width:900px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.1); overflow:hidden; }' +
    '  .report-header { background:#822; color:#fff; padding:32px; }' +
    '  .report-header h1 { font-size:1.5rem; margin-bottom:4px; }' +
    '  .report-header p { opacity:0.85; font-size:0.9rem; }' +
    '  .report-summary { display:flex; gap:24px; padding:24px 32px; background:#fafafa; border-bottom:1px solid #eee; }' +
    '  .summary-card { flex:1; }' +
    '  .summary-card .num { font-size:1.8rem; font-weight:800; color:#822; }' +
    '  .summary-card .label { font-size:0.82rem; color:#888; }' +
    '  .report-section { padding:24px 32px; border-bottom:1px solid #f0f0f0; }' +
    '  .report-section:last-child { border-bottom:none; }' +
    '  .cat-title { font-size:1.1rem; font-weight:700; color:#822; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #822; display:inline-block; }' +
    '  table { width:100%; border-collapse:collapse; font-size:0.88rem; }' +
    '  th { text-align:left; padding:10px 8px; background:#f7f8fa; color:#888; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #eee; }' +
    '  td { padding:10px 8px; border-bottom:1px solid #f5f5f5; }' +
    '  tr:last-child td { border-bottom:none; }' +
    '  .qty { font-weight:700; color:#822; text-align:center; font-size:1rem; }' +
    '  .report-footer { padding:20px 32px; text-align:center; color:#aaa; font-size:0.8rem; border-top:1px solid #eee; }' +
    '  .no-print { text-align:center; margin-top:16px; }' +
    '  .no-print button { padding:10px 24px; background:#822; color:#fff; border:none; border-radius:6px; font-size:0.9rem; font-weight:600; cursor:pointer; font-family:inherit; }' +
    '  .no-print button:hover { background:#a33; }' +
    '  @media print { body { background:#fff; padding:0; } .report { box-shadow:none; border-radius:0; } .no-print { display:none; } }' +
    '</style></head><body>' +
    '<div class="report">' +
    '<div class="report-header">' +
    '<h1>Pedido a Proveedor</h1>' +
    '<p>Generado el ' + today + '</p>' +
    '</div>' +
    '<div class="report-summary">' +
    '<div class="summary-card"><div class="num">' + totalItems + '</div><div class="label">Productos</div></div>' +
    '<div class="summary-card"><div class="num">' + totalQty + '</div><div class="label">Unidades a pedir</div></div>' +
    '<div class="summary-card"><div class="num">' + catKeys.length + '</div><div class="label">Categorias</div></div>' +
    '</div>';

  catKeys.forEach(function(cat) {
    var items = groups[cat];
    var subTotal = items.reduce(function(s, item) { return s + item.cantidad; }, 0);
    html += '<div class="report-section">' +
      '<div class="cat-title">' + cat.charAt(0).toUpperCase() + cat.slice(1) + ' (' + items.length + ' prod., ' + subTotal + ' uds.)</div>' +
      '<table><tr><th>Producto</th><th>Stock</th><th>Minimo</th><th style="text-align:center">A pedir</th></tr>';

    items.forEach(function(item) {
      html += '<tr>' +
        '<td>' + escapeHTML(item.name) + '</td>' +
        '<td>' + item.stock + '</td>' +
        '<td>' + item.minimo + '</td>' +
        '<td class="qty">' + item.cantidad + '</td>' +
        '</tr>';
    });

    html += '</table></div>';
  });

  html += '<div class="report-footer">Generado desde el panel de administracion - ' + today + '</div></div>' +
    '<div class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
    '</body></html>';

  // Abrir con blob URL para evitar bloqueo de popups
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var win  = window.open(url, '_blank');
  if (win) {
    win.onload = function() { setTimeout(function() { URL.revokeObjectURL(url); }, 10000); };
  } else {
    showToast('El navegador bloqueo la ventana. Permití popups para este sitio.');
  }
}

// ------------------------------------------------------------
// SECCIÓN: STOCK → RECEPCIÓN — PEDIDO GLOBAL A PROVEEDOR
// ------------------------------------------------------------
function initPedidoGlobal() {
  var checkAll = document.getElementById('check-all-stock');
  var btnGenerar = document.getElementById('btn-generar-pedido');
  if (!checkAll || !btnGenerar) return;

  // Seleccionar/deseleccionar todos
  checkAll.addEventListener('change', function() {
    var checked = this.checked;
    document.querySelectorAll('.stock-check-item').forEach(function(cb) {
      cb.checked = checked;
    });
    actualizarResumenPedido();
  });

  // Delegación: cambios en checkboxes individuales
  document.addEventListener('change', function(e) {
    if (e.target.classList.contains('stock-check-item')) {
      actualizarResumenPedido();
      // Si alguno está desmarcado, desmarcar "todos"
      if (!e.target.checked) {
        checkAll.checked = false;
      } else {
        // Verificar si todos están marcados
        var all = document.querySelectorAll('.stock-check-item');
        var allChecked = true;
        all.forEach(function(cb) { if (!cb.checked) allChecked = false; });
        checkAll.checked = allChecked;
      }
    }
  });

  // Click en "Generar pedido"
  btnGenerar.addEventListener('click', function() {
    var seleccionados = [];
    document.querySelectorAll('.stock-check-item:checked').forEach(function(cb) {
      seleccionados.push({
        id: parseInt(cb.getAttribute('data-id')),
        name: cb.getAttribute('data-name'),
        stock: parseInt(cb.getAttribute('data-stock')) || 0
      });
    });

    if (seleccionados.length === 0) return;

    // Cambiar a pestaña Recepción
    var recepcionTab = document.querySelector('.admin-tab[data-tab="recepcion"]');
    if (recepcionTab) recepcionTab.click();

    // Precargar TODOS los productos seleccionados en Recepción
    setTimeout(function() {
      var searchInput = document.getElementById('recepcion-search');
      var tbody = document.getElementById('recepcion-tbody');
      var recepcionEmpty = document.getElementById('recepcion-empty');

      if (!tbody) return;

      // Limpiar búsqueda actual y cargar productos directamente
      if (searchInput) searchInput.value = '';

      // Hacer fetch de productos para tener datos completos
      fetch('/api/products')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var allProducts = data.products || [];
          var idsSeleccionados = {};
          seleccionados.forEach(function(s) { idsSeleccionados[s.id] = true; });

          // Filtrar productos seleccionados
          var productos = allProducts.filter(function(p) {
            return idsSeleccionados[p.id];
          });

          // Inicializar selectedItems
          window._selectedItems = window._selectedItems || {};

          // Establecer cantidad sugerida para cada uno
          productos.forEach(function(p) {
            var currentQty = Number(p.stock_cantidad) || 0;
            // Sugerir cantidad mínima para alcanzar stock_minimo * 2
            var stockMin = Number(p.stock_minimo) || 5;
            var sugerido = Math.max(stockMin * 2 - currentQty, stockMin);
            window._selectedItems[p.id] = sugerido;
          });

          if (typeof window.renderRecepcionResults === 'function') {
            window.renderRecepcionResults(productos);
          }
          if (recepcionEmpty) recepcionEmpty.style.display = 'none';
          if (typeof window.updateRecepcionSummary === 'function') {
            window.updateRecepcionSummary();
          }
        })
        .catch(function(err) {
          console.error('Error cargando productos:', err);
        });
    }, 300);
  });

  function actualizarResumenPedido() {
    var count = document.querySelectorAll('.stock-check-item:checked').length;
    var btnGenerar = document.getElementById('btn-generar-pedido');
    var countEl = document.getElementById('pedido-count');
    if (btnGenerar) {
      btnGenerar.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (countEl) countEl.textContent = count;
  }

  // Boton "Solicitar todo el stock bajo"
  var btnSolicitarTodo = document.getElementById('btn-solicitar-todo');
  if (btnSolicitarTodo) {
    btnSolicitarTodo.addEventListener('click', function() {
      // Seleccionar todos los checkboxes
      document.querySelectorAll('.stock-check-item').forEach(function(cb) {
        cb.checked = true;
      });

      var count = document.querySelectorAll('.stock-check-item:checked').length;
      if (count === 0) {
        showToast('No hay productos con stock bajo para solicitar', 'error');
        return;
      }

      // Simular click en "Generar pedido"
      var btnGenerar = document.getElementById('btn-generar-pedido');
      if (btnGenerar) btnGenerar.click();

      showToast('⚠ Enviando ' + count + ' productos a Recepción...', 'info');
    });
  }
}

// Inicializar después de que se cargue el panel
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPedidoGlobal);
} else {
  initPedidoGlobal();
}
