// ============================================================
// branding.js — Identidad de marca configurable por variables de entorno
// ============================================================
// Pensado para la arquitectura "1 deploy por cliente": el mismo código
// sirve para cualquier cliente, cada uno define su nombre/logo/colores
// via variables de entorno, sin tocar código ni el HTML.
//
// Los defaults son los valores que ya tenía el catálogo hardcodeados,
// para que un deploy existente sin estas variables no cambie visualmente.
// ============================================================

const branding = {
  storeName: process.env.STORE_NAME || 'Catálogo de Productos',
  logoUrl: process.env.STORE_LOGO_URL || '/logo.png',
  logoAlt: process.env.STORE_LOGO_ALT || process.env.STORE_NAME || 'Catálogo de Productos',
  colorPrimary: process.env.COLOR_PRIMARY || '#c1121f',
  colorPrimaryHover: process.env.COLOR_PRIMARY_HOVER || '#e63946',
  colorAccent: process.env.COLOR_ACCENT || '#0d0d0d'
};

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

module.exports = { branding, brandingStyleTag };
