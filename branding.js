// ============================================================
// branding.js — Identidad de marca configurable por variables de entorno
// ============================================================
// Pensado para la arquitectura "1 deploy por cliente": el mismo código
// sirve para cualquier cliente, cada uno define su nombre/logo/colores
// via variables de entorno, sin tocar código ni el HTML.
//
// Los defaults son "PiezaExpress" — la identidad de producto/demo con la
// que se vende el catálogo antes de personalizarlo para un cliente puntual.
// ============================================================

const branding = {
  storeName: process.env.STORE_NAME || 'PiezaExpress',
  // Parte de storeName que se resalta con el color primario en el logo de
  // texto del header (ver buildWordmarkHtml). Vacío = todo el nombre en un
  // solo color.
  storeNameAccent: process.env.STORE_NAME_ACCENT !== undefined ? process.env.STORE_NAME_ACCENT : 'Express',
  storeTagline: process.env.STORE_TAGLINE !== undefined ? process.env.STORE_TAGLINE : 'repuestos al instante',
  // El logo como imagen quedó solo para el ícono de pestaña (favicon); el
  // header ahora usa el nombre como logo de texto (ver buildWordmarkHtml).
  logoUrl: process.env.STORE_LOGO_URL || '/favicon.svg',
  colorPrimary: process.env.COLOR_PRIMARY || '#c1121f',
  colorPrimaryHover: process.env.COLOR_PRIMARY_HOVER || '#e63946',
  colorAccent: process.env.COLOR_ACCENT || '#0d0d0d'
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Arma el HTML del logo de texto del header: si storeNameAccent es una
// substring real de storeName, esa parte queda en <span class="logo-accent">
// (coloreada con --color-primary vía CSS); el resto usa el color de texto
// normal. Si no matchea, se muestra el nombre entero sin resaltar nada.
function buildWordmarkHtml() {
  const name = branding.storeName;
  const accent = branding.storeNameAccent;

  if (accent && name.includes(accent)) {
    const idx = name.indexOf(accent);
    const before = name.slice(0, idx);
    const after = name.slice(idx + accent.length);
    return escapeHtml(before) +
      '<span class="logo-accent">' + escapeHtml(accent) + '</span>' +
      escapeHtml(after);
  }

  return escapeHtml(name);
}

// Bloque <style> con overrides de las variables CSS de marca. Se inyecta
// antes de </head>, así gana por orden de cascada sobre los defaults de
// styles.css/admin.css sin necesitar !important.
// Nota: admin.css todavía usa su propio nombre de variable (--primary-dark)
// en vez de --color-primary/-hover (deuda documentada en AUDITORIA.md,
// "unificar tokens de color") — se sobreescriben ambos por ahora.
function brandingStyleTag() {
  return '<style>:root{' +
    '--color-primary:' + branding.colorPrimary + ';' +
    '--color-primary-hover:' + branding.colorPrimaryHover + ';' +
    '--color-accent:' + branding.colorAccent + ';' +
    '--primary-dark:' + branding.colorPrimaryHover + ';' +
    '}</style>';
}

module.exports = { branding, brandingStyleTag, buildWordmarkHtml };
