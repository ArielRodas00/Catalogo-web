const test = require('node:test');
const assert = require('node:assert/strict');

const licenseCheck = require('../licenseCheck');
const branding = require('../branding');

test('getEffectiveBranding: sin override del Panel Central, usa los defaults de entorno', function (t) {
  t.mock.method(licenseCheck, 'getLicense', function () {
    return { plan: 'premium', activo: true, estado: 'standalone', branding: null };
  });

  const effective = branding.getEffectiveBranding();
  assert.equal(effective.storeName, 'PiezaExpress');
  assert.equal(effective.logoType, 'texto');
  assert.equal(effective.logoImageDataUri, null);
  assert.equal(effective.colorPrimary, '#c1121f');
});

test('getEffectiveBranding: un color cargado en el Panel Central pisa el default', function (t) {
  t.mock.method(licenseCheck, 'getLicense', function () {
    return {
      plan: 'basico', activo: true, estado: 'activo',
      branding: { colorPrimary: '#0000ff', colorPrimaryHover: null, colorAccent: null,
        storeName: null, storeNameAccent: null, logoType: 'texto', logoImageDataUri: null, faviconUrl: null }
    };
  });

  const effective = branding.getEffectiveBranding();
  assert.equal(effective.colorPrimary, '#0000ff', 'el color cargado en el Panel Central gana');
  assert.equal(effective.colorPrimaryHover, '#e63946', 'sin override, sigue el default de entorno');
  assert.equal(effective.storeName, 'PiezaExpress', 'sin override de nombre, sigue el default');
});

test('getEffectiveBranding: nombre y acento overrideados arman el wordmark correcto', function (t) {
  t.mock.method(licenseCheck, 'getLicense', function () {
    return {
      plan: 'basico', activo: true, estado: 'activo',
      branding: { storeName: 'Repuestos Villalba', storeNameAccent: 'Villalba', logoType: 'texto',
        logoImageDataUri: null, faviconUrl: null, colorPrimary: null, colorPrimaryHover: null, colorAccent: null }
    };
  });

  const effective = branding.getEffectiveBranding();
  const inner = branding.buildLogoInnerHtml(effective);
  assert.match(inner, /Repuestos <span class="logo-accent">Villalba<\/span>/);
  assert.match(inner, /logo-tagline/);
});

test('getEffectiveBranding: logoType imagen sin logoImageDataUri no rompe, sigue en texto', function (t) {
  t.mock.method(licenseCheck, 'getLicense', function () {
    return {
      plan: 'basico', activo: true, estado: 'activo',
      branding: { logoType: 'imagen', logoImageDataUri: null, storeName: null, storeNameAccent: null,
        faviconUrl: null, colorPrimary: null, colorPrimaryHover: null, colorAccent: null }
    };
  });

  const effective = branding.getEffectiveBranding();
  assert.equal(effective.logoType, 'texto', 'sin imagen real, no debe quedar en un estado "imagen" roto');
});

test('buildLogoInnerHtml: con logo de imagen, arma un <img> en vez del wordmark', function (t) {
  t.mock.method(licenseCheck, 'getLicense', function () {
    return {
      plan: 'basico', activo: true, estado: 'activo',
      branding: { logoType: 'imagen', logoImageDataUri: 'data:image/png;base64,AAAA', storeName: 'Villalba',
        storeNameAccent: null, faviconUrl: null, colorPrimary: null, colorPrimaryHover: null, colorAccent: null }
    };
  });

  const effective = branding.getEffectiveBranding();
  const inner = branding.buildLogoInnerHtml(effective);
  assert.match(inner, /<img class="logo-image" src="data:image\/png;base64,AAAA" alt="Villalba">/);
});

test('escapeHtml: neutraliza comillas y ángulos, no solo &/</>', function () {
  // store_name y favicon_url ahora pueden venir de un formulario web (Panel
  // Central) y se splicean crudos en atributos HTML (href, content) y en un
  // bloque JSON-LD en server.js — hace falta cortar tanto un "> de atributo
  // como un </script> de script, no solo uno de los dos.
  assert.equal(
    branding.escapeHtml('https://evil.com/" onerror="alert(1)'),
    'https://evil.com/&quot; onerror=&quot;alert(1)'
  );
  assert.equal(
    branding.escapeHtml('Foo</script><script>alert(1)</script>'),
    'Foo&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

test('brandingStyleTag: refleja los colores efectivos (Panel Central u default)', function (t) {
  t.mock.method(licenseCheck, 'getLicense', function () {
    return {
      plan: 'basico', activo: true, estado: 'activo',
      branding: { colorPrimary: '#123456', colorPrimaryHover: null, colorAccent: null,
        storeName: null, storeNameAccent: null, logoType: 'texto', logoImageDataUri: null, faviconUrl: null }
    };
  });

  const tag = branding.brandingStyleTag(branding.getEffectiveBranding());
  assert.match(tag, /--color-primary:#123456;/);
});

test('brandingStyleTag: expone --color-primary-rgb y --primary(-rgb) para fondos/sombras tintados', function (t) {
  // Antes de este fix, admin.css nunca recibía un override de --primary (solo
  // de --primary-dark), así que el color primario del panel de admin quedaba
  // siempre fijo en rojo sin importar la marca configurada — y ni el catálogo
  // ni el admin tenían forma de tintar un fondo/sombra suave con el color de
  // marca (backgrounds como el de .modal-category quedaban hardcodeados en
  // rojo). Ver AUDITORIA.md.
  t.mock.method(licenseCheck, 'getLicense', function () {
    return {
      plan: 'basico', activo: true, estado: 'activo',
      branding: { colorPrimary: '#0a7d3c', colorPrimaryHover: null, colorAccent: null,
        storeName: null, storeNameAccent: null, logoType: 'texto', logoImageDataUri: null, faviconUrl: null }
    };
  });

  const tag = branding.brandingStyleTag(branding.getEffectiveBranding());
  assert.match(tag, /--color-primary-rgb:10, 125, 60;/);
  assert.match(tag, /--primary:#0a7d3c;/);
  assert.match(tag, /--primary-rgb:10, 125, 60;/);
});
