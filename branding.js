// ============================================================
// branding.js — Identidad de marca configurable
// ============================================================
// Pensado para la arquitectura "1 deploy por cliente": el mismo código sirve
// para cualquier cliente. Hay dos formas de configurar la marca, en este
// orden de prioridad (ver AUDITORIA.md, "Branding desde el Panel Central"):
//
//   1. Panel Central: si el cliente tiene algo cargado ahí (nombre, logo,
//      colores), pisa todo lo de abajo. Se consulta vía licenseCheck.js,
//      con el mismo caché/gracia de 48hs que ya tiene la licencia — si el
//      Panel Central no responde, seguimos con el último valor conocido o,
//      en su defecto, con los defaults de acá.
//   2. Variables de entorno (esta misma tabla de siempre): el fallback de
//      toda la vida, y lo único que existe en un deploy "standalone".
//
// Los defaults son "PiezaExpress" — la identidad de producto/demo con la
// que se vende el catálogo antes de personalizarlo para un cliente puntual.
// ============================================================

// Import sin desestructurar a propósito: así los tests pueden mockear
// licenseCheck.getLicense (t.mock.method) y que este módulo lo vea, en vez de
// quedarse con una referencia a la función original capturada al cargar.
const licenseCheck = require('./licenseCheck');

const envDefaults = {
  storeName: process.env.STORE_NAME || 'PiezaExpress',
  // Parte de storeName que se resalta con el color primario en el logo de
  // texto del header (ver buildWordmarkHtml). Vacío = todo el nombre en un
  // solo color.
  storeNameAccent: process.env.STORE_NAME_ACCENT !== undefined ? process.env.STORE_NAME_ACCENT : 'Express',
  storeTagline: process.env.STORE_TAGLINE !== undefined ? process.env.STORE_TAGLINE : 'repuestos al instante',
  // Favicon (ícono de pestaña) — el logo del header en sí es texto, no imagen
  // (ver buildWordmarkHtml), salvo que el Panel Central cargue uno como imagen.
  logoUrl: process.env.STORE_LOGO_URL || '/favicon.svg',
  colorPrimary: process.env.COLOR_PRIMARY || '#c1121f',
  colorPrimaryHover: process.env.COLOR_PRIMARY_HOVER || '#e63946',
  colorAccent: process.env.COLOR_ACCENT || '#0d0d0d'
};

// Incluye comillas a propósito (no solo &/</>): storeName y faviconUrl ahora
// pueden venir de un formulario web (Panel Central), no solo de variables de
// entorno puestas a mano por quien deployea — así que hay que poder cortar
// un intento de escapar de un atributo href="..."/content="...", no solo de
// una etiqueta. Ver AUDITORIA.md, "Branding desde el Panel Central".
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Combina los defaults de entorno con lo que haya cargado el Panel Central
// para este cliente (si está conectado — ver licenseCheck.js). Se recalcula
// en cada request (es barato, todo en memoria) para reflejar cambios sin
// necesitar redeploy.
function getEffectiveBranding() {
  const license = licenseCheck.getLicense();
  const override = (license && license.branding) || {};

  return {
    storeName: override.storeName || envDefaults.storeName,
    storeNameAccent: override.storeNameAccent != null ? override.storeNameAccent : envDefaults.storeNameAccent,
    storeTagline: envDefaults.storeTagline,
    logoType: override.logoType === 'imagen' && override.logoImageDataUri ? 'imagen' : 'texto',
    logoImageDataUri: override.logoImageDataUri || null,
    faviconUrl: override.faviconUrl || envDefaults.logoUrl,
    colorPrimary: override.colorPrimary || envDefaults.colorPrimary,
    colorPrimaryHover: override.colorPrimaryHover || envDefaults.colorPrimaryHover,
    colorAccent: override.colorAccent || envDefaults.colorAccent
  };
}

// Arma el HTML del logo de texto del header: si storeNameAccent es una
// substring real de storeName, esa parte queda en <span class="logo-accent">
// (coloreada con --color-primary vía CSS); el resto usa el color de texto
// normal. Si no matchea, se muestra el nombre entero sin resaltar nada.
function buildWordmarkHtml(effective) {
  const name = effective.storeName;
  const accent = effective.storeNameAccent;

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

// Arma el HTML completo de adentro de .logo-container: una imagen subida
// desde el Panel Central, o el wordmark de texto + tagline de siempre.
function buildLogoInnerHtml(effective) {
  effective = effective || getEffectiveBranding();

  if (effective.logoType === 'imagen') {
    return '<img class="logo-image" src="' + escapeHtml(effective.logoImageDataUri) +
      '" alt="' + escapeHtml(effective.storeName) + '">';
  }

  return '<span class="logo-wordmark">' + buildWordmarkHtml(effective) + '</span>' +
    '<span class="logo-tagline">' + escapeHtml(effective.storeTagline) + '</span>';
}

// Bloque <style> con overrides de las variables CSS de marca. Se inyecta
// antes de </head>, así gana por orden de cascada sobre los defaults de
// styles.css/admin.css sin necesitar !important.
// Nota: admin.css todavía usa su propio nombre de variable (--primary-dark)
// en vez de --color-primary/-hover (deuda documentada en AUDITORIA.md,
// "unificar tokens de color") — se sobreescriben ambos por ahora.
function brandingStyleTag(effective) {
  effective = effective || getEffectiveBranding();
  return '<style>:root{' +
    '--color-primary:' + effective.colorPrimary + ';' +
    '--color-primary-hover:' + effective.colorPrimaryHover + ';' +
    '--color-accent:' + effective.colorAccent + ';' +
    '--primary-dark:' + effective.colorPrimaryHover + ';' +
    '}</style>';
}

module.exports = { getEffectiveBranding, brandingStyleTag, buildWordmarkHtml, buildLogoInnerHtml, escapeHtml };
