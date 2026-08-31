// ============================================================
// admin/importar.js — Carga masiva de productos desde Excel/CSV
// ============================================================
// Depende de: utils.js (escapeHTML), toast.js (showToast)
//
// El flujo es a propósito en dos pasos: primero una vista previa que NO
// escribe nada, y recién después la importación. Quien sube 150 productos
// necesita ver qué va a entrar y qué filas están mal antes de tocar la base;
// descubrirlo después es mucho peor que descubrirlo antes.
// ============================================================

(function() {
  const modal      = document.getElementById('import-modal');
  if (!modal) return;

  const btnAbrir     = document.getElementById('btn-import');
  const btnCerrar    = document.getElementById('import-close');
  const btnCancelar  = document.getElementById('import-cancelar');
  const btnConfirmar = document.getElementById('import-confirmar');
  const btnPlantilla = document.getElementById('btn-plantilla');
  const inputArchivo = document.getElementById('import-file');
  const inputWhats   = document.getElementById('import-whatsapp');
  const cajaResultado = document.getElementById('import-resultado');

  function abrir() {
    modal.style.display = 'flex';
    cajaResultado.style.display = 'none';
    cajaResultado.innerHTML = '';
    inputArchivo.value = '';
    btnConfirmar.disabled = true;
  }

  function cerrar() {
    modal.style.display = 'none';
  }

  function cuerpo() {
    const fd = new FormData();
    if (inputArchivo.files[0]) fd.append('archivo', inputArchivo.files[0]);
    if (inputWhats.value.trim()) fd.append('whatsapp', inputWhats.value.trim());
    return fd;
  }

  // Lista de problemas, con el número de fila para poder ir directo a
  // corregirla en Excel.
  function listaErrores(errores, titulo) {
    if (!errores || errores.length === 0) return '';
    const items = errores.slice(0, 25).map(function(e) {
      return '<li><strong>Fila ' + e.fila + '</strong> ' +
        (e.nombre ? '(' + escapeHTML(e.nombre) + ') ' : '') +
        '— ' + escapeHTML(e.error || e.motivo) + '</li>';
    }).join('');
    const resto = errores.length > 25 ? '<li>…y ' + (errores.length - 25) + ' más</li>' : '';
    return '<p class="import-subtitulo">' + titulo + '</p><ul class="import-errores">' + items + resto + '</ul>';
  }

  // ------------------------------------------------------------
  // Vista previa — no escribe nada
  // ------------------------------------------------------------
  async function previsualizar() {
    if (!inputArchivo.files[0]) return;

    cajaResultado.style.display = 'block';
    cajaResultado.innerHTML = '<p>Revisando el archivo…</p>';
    btnConfirmar.disabled = true;

    try {
      const r = await fetch('/api/products/import/preview', {
        method: 'POST', credentials: 'include', body: cuerpo()
      });
      const data = await r.json();

      if (!r.ok) {
        cajaResultado.innerHTML = '<p class="import-error">' + escapeHTML(data.error || 'No se pudo leer el archivo') + '</p>';
        return;
      }

      const muestra = (data.muestra || []).map(function(p) {
        return '<tr><td>' + escapeHTML(p.name) + '</td>' +
          '<td>' + Number(p.price).toLocaleString('es-PY') + '</td>' +
          '<td>' + escapeHTML(p.category) + '</td></tr>';
      }).join('');

      cajaResultado.innerHTML =
        '<p class="import-resumen"><strong>' + data.validos + '</strong> productos listos para importar' +
          (data.errores.length ? ', <strong>' + data.errores.length + '</strong> con problemas' : '') +
          ' (de ' + data.totalFilas + ' filas).</p>' +
        (muestra ? '<table class="import-tabla"><thead><tr><th>Producto</th><th>Precio</th><th>Categoría</th></tr></thead><tbody>' + muestra + '</tbody></table>' : '') +
        listaErrores(data.errores, 'Estas filas no se van a importar:');

      // Solo se habilita si hay algo que importar. Las filas con problemas se
      // saltean, no bloquean al resto.
      btnConfirmar.disabled = data.validos === 0;
    } catch (e) {
      cajaResultado.innerHTML = '<p class="import-error">No se pudo revisar el archivo. Probá de nuevo.</p>';
    }
  }

  // ------------------------------------------------------------
  // Importación real
  // ------------------------------------------------------------
  async function importar() {
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Importando…';

    try {
      const r = await fetch('/api/products/import', {
        method: 'POST', credentials: 'include', body: cuerpo()
      });
      const data = await r.json();

      if (!r.ok) {
        cajaResultado.innerHTML = '<p class="import-error">' + escapeHTML(data.error || 'No se pudo importar') + '</p>' +
          listaErrores(data.errores, 'Problemas encontrados:');
        return;
      }

      cajaResultado.innerHTML =
        '<p class="import-resumen import-ok"><strong>' + data.creados + '</strong> productos importados.</p>' +
        listaErrores(data.salteados, 'Estos ya existían y no se volvieron a cargar:') +
        listaErrores(data.errores, 'Estas filas no se pudieron importar:');

      showToast(data.creados + ' productos importados', 'success');

      // Refrescar la lista para que se vean sin recargar la página.
      if (typeof loadProducts === 'function') loadProducts();
    } catch (e) {
      cajaResultado.innerHTML = '<p class="import-error">No se pudo importar. Probá de nuevo.</p>';
    } finally {
      btnConfirmar.textContent = 'Importar';
      btnConfirmar.disabled = false;
    }
  }

  // ------------------------------------------------------------
  // Descarga de la planilla de ejemplo
  // ------------------------------------------------------------
  async function descargarPlantilla() {
    try {
      const r = await fetch('/api/products/import/plantilla', { credentials: 'include' });
      if (!r.ok) { showToast('No se pudo descargar la planilla', 'error'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-productos.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast('No se pudo descargar la planilla', 'error');
    }
  }

  if (btnAbrir) btnAbrir.addEventListener('click', abrir);
  if (btnCerrar) btnCerrar.addEventListener('click', cerrar);
  if (btnCancelar) btnCancelar.addEventListener('click', cerrar);
  if (btnPlantilla) btnPlantilla.addEventListener('click', descargarPlantilla);
  if (inputArchivo) inputArchivo.addEventListener('change', previsualizar);
  if (btnConfirmar) btnConfirmar.addEventListener('click', importar);

  modal.addEventListener('click', function(e) { if (e.target === modal) cerrar(); });
})();
