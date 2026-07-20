// ============================================================
// admin/init.js — Bootstrap del panel (se carga último)
// ============================================================

async function initAdmin() {
  await renderAdminTable();
  await populateCategorySelect();
  setupImagePreview();
  initTabs();
  initAdminViewToggle();

  // Switch de oferta
  document.getElementById('field-en-oferta').addEventListener('change', function() {
    const row = document.getElementById('row-oferta');
    row.style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
      document.getElementById('field-precio-oferta').focus();
    } else {
      document.getElementById('field-precio-oferta').value = '';
    }
  });

  // Switch de promoción
  document.getElementById('field-en-promocion').addEventListener('change', function() {
    const row = document.getElementById('row-promocion');
    row.style.display = this.checked ? 'block' : 'none';
    if (!this.checked) {
      document.getElementById('field-fecha-fin').value = '';
    }
  });

  // → Listeners de filtros y buscador
  document.getElementById('admin-search').addEventListener('input', function() {
    renderAdminTable(1);
  });
  document.getElementById('admin-filter-stock').addEventListener('change', function() {
    renderAdminTable(1);
  });
  document.getElementById('admin-order').addEventListener('change', function() {
    renderAdminTable(1);
  });

  // Listeners de subcategorías (una sola vez, no en populateCategorySelect)
  document.getElementById('field-category').addEventListener('change', async function() {
    const allProducts = await getProducts();
    const selectedCat = this.value ||
      document.getElementById('field-new-category').value.trim().toLowerCase();
    await updateSubcatSelect(selectedCat, allProducts);
  });
  document.getElementById('field-new-category').addEventListener('input', async function() {
    const allProducts = await getProducts();
    const selectedCat = this.value.trim().toLowerCase();
    await updateSubcatSelect(selectedCat, allProducts);
  });
}

// Verificamos si hay sesión activa al cargar la página (debe ir al final:
// dispara initAdmin(), que depende de todo lo definido en los módulos anteriores)
checkAuth();
