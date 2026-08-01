// ============================================================
// admin/init.js — Bootstrap del panel (se carga último)
// ============================================================

async function initAdmin() {
  await renderAdminTable();
  await populateCategorySelect();
  setupImageDropzones();
  initTabs();
  initAdminViewToggle();
  checkPlanStatus();

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

// Muestra el aviso de suscripción vencida y oculta las pestañas Premium
// (Métricas/Stock/Recepción) si el plan no corresponde. Básico solo ve
// Productos — desde ahí igual puede marcar "sin stock" y editar cantidades
// a mano, solo pierde las herramientas de conveniencia (ver AUDITORIA.md).
async function checkPlanStatus() {
  try {
    const res = await fetch('/api/plan', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
    });
    if (!res.ok) return;
    const plan = await res.json();
    document.getElementById('suspended-banner').style.display = plan.activo ? 'none' : 'flex';

    const esPremium = plan.plan === 'premium' && plan.activo;
    const tabsPremium = document.querySelectorAll('.admin-tab[data-plan="premium"]');
    tabsPremium.forEach(function(tab) {
      tab.style.display = esPremium ? '' : 'none';
    });

    // Si la pestaña activa quedó oculta (ej. el plan bajó mientras el admin
    // ya estaba en Métricas), volvemos a Productos para no dejar la vista
    // en blanco.
    if (!esPremium) {
      const activeTab = document.querySelector('.admin-tab.active');
      if (activeTab && activeTab.getAttribute('data-plan') === 'premium') {
        document.querySelector('.admin-tab[data-tab="productos"]').click();
      }
    }
  } catch (err) {
    // Si falla la consulta, no tocamos nada (no queremos ocultar pestañas
    // de más por un problema de red del lado del admin, no del plan en sí).
  }
}

// Verificamos si hay sesión activa al cargar la página (debe ir al final:
// dispara initAdmin(), que depende de todo lo definido en los módulos anteriores)
checkAuth();
