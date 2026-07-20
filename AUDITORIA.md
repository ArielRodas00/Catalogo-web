# Auditoría técnica — catalogo-backend

> Revisión completa del proyecto (backend, frontend, base de datos, seguridad, documentación y despliegue).
> Fecha del diagnóstico: 2026-07-19 · Fecha de implementación del plan de acción: 2026-07-20.
> Versión HTML del informe original: ver Artifact publicado en la conversación con Claude.

## Estado del plan de acción (2026-07-20)

De los 15 ítems del plan original, **12 se implementaron**, **3 quedaron pospuestos a propósito** (decisión del usuario, no bloqueos técnicos), y **2 archivos no se pudieron borrar** por una restricción de permisos del entorno de ejecución (no de git). Detalle abajo, en cada sección.

## Resumen

Catálogo web para una tienda de repuestos de motos: backend Express 5 + PostgreSQL (Neon) con panel de
administración en HTML/CSS/JS plano, desplegado en Render. Es un proyecto pequeño de un solo desarrollador,
con buenas prácticas de seguridad ya aplicadas (SQL parametrizado, bcrypt, rate-limiting, CSP) y una
documentación mejor que el promedio para su tamaño — pero le faltan piezas de madurez operativa: cero tests,
sin persistencia de imágenes en producción, y secretos reales viviendo solo en un `.env` local.

**3** hallazgos de alta prioridad · **6** de media · **6** de baja · **34** commits revisados.

---

## Pros

### Seguridad
- SQL parametrizado en todas las queries revisadas — no se encontró inyección SQL.
- Contraseñas con `bcrypt`, 10 salt rounds.
- Rate-limiting en login (10/15min) y en endpoints públicos.
- Helmet + CSP configurados en `server.js`.
- `.env` correctamente ignorado y nunca comiteado (verificado en el historial completo de git).
- Orden correcto de middlewares: auth antes de `multer` en la subida de imágenes.

### Backend / Arquitectura
- Stack deliberadamente liviano: Express 5 + `pg` puro, sin ORM innecesario para el tamaño del proyecto.
- Rutas estáticas declaradas antes del catch-all `/:id` — evita el error clásico de Express.
- `POST /batch-stock` es transaccional con rollback.
- `unhandledRejection` / `uncaughtException` manejados, con `process.exit(1)` fail-fast.
- Variables de entorno requeridas se validan al arrancar — el server no sube mal configurado.

### Base de datos
- Buen uso de índices, incluyendo índices parciales para `destacado` / `en_promocion`.
- Constraints `CHECK` / `UNIQUE` aplicados donde corresponde.
- `db-init.js` es idempotente (`CREATE ... IF NOT EXISTS`).

### Frontend / UX
- Escapado consistente (`escapeHTML` / `escapeAttr`) en todo dato insertado en el DOM — previene XSS.
- La ruta SSR `/p/:id` también escapa correctamente, incluido el cierre de `</script>`.
- Catálogo público respeta `prefers-reduced-motion`.
- Migración reciente de Chart.js a barras CSS propias: menos peso, sin dependencia externa.
- Formularios del panel usan `<label for>` correctamente asociado.

### Documentación / Proceso
- `README.md` completo: instalación, variables de entorno, endpoints, guía de deploy.
- `CHANGELOG.md` real, versión por versión, mantenido con disciplina.
- Historial de commits limpio y consistente (`Fix:` / `Feat:` / `chore:`), mensajes descriptivos.
- Ya existe una auditoría previa documentada (v1.1.0) que corrigió 3 XSS críticos.

---

## Contras

### Producción / Seguridad — **Alta**
- Las imágenes subidas por Multer viven en disco local y se pierden en cada redeploy de Render (filesystem no persistente).
- Credenciales reales de producción (connection string de Neon, JWT secret, password de admin) en texto plano en `.env` local, sin gestor de secretos ni rotación.
- El JWT se guarda en `localStorage` — expuesto a robo vía XSS si alguna vez se cuela una inyección.

### Calidad / Mantenibilidad — **Media**
- Cero tests automatizados — `npm test` es el stub por defecto de npm.
- Sin ESLint, Prettier ni TypeScript — ninguna herramienta de calidad de código.
- Dos lockfiles simultáneos (`package-lock.json` y `pnpm-lock.yaml`) — riesgo de dependencias que divergen según quién instale.
- Conexión SSL a Postgres en producción con `rejectUnauthorized: false`.
- `admin.js` es un único archivo de 1559 líneas sin módulos, con variables globales sueltas.
- Validación de ID inconsistente: `products.js` valida `isNaN`, `metrics.js` no.

### Pulido / Higiene — **Baja**
- Archivos muertos: `public/products.js` (stub de 1 línea) y `public/js/theme.js` (vacío, sin referenciar).
- El panel admin es menos accesible que el catálogo público — faltan `aria-label` en botones de solo ícono.
- El fix de overflow a 480px en `admin.css` recorta en 7+ niveles distintos en vez de resolver la causa raíz.
- El README menciona `.env.example` pero el archivo no existe en el repo.
- No hay archivo `LICENSE` real (se declara ISC en `package.json`, sin respaldo).
- `public/uploads/` no está versionado ni tiene `.gitkeep`; queda mojibake residual en comentarios de `admin.css`.

---

## Plan de acción

### Alta prioridad — afecta producción, datos o seguridad
- [ ] **Migrar las imágenes de Multer a Cloudinary o S3.** *Pospuesto a pedido del usuario* — requiere crear una cuenta y credenciales que no están disponibles en este entorno. Sigue pendiente y documentado.
- [ ] **Definir una política de rotación de secretos.** *No accionable por Claude* — requiere acceso a los dashboards de Render y Neon, fuera del alcance del repositorio. Recomendación: rotar `JWT_SECRET`, el password de `DATABASE_URL` y `ADMIN_PASSWORD` periódicamente, y actualizarlos manualmente en Render tras rotarlos.
- [ ] **Evaluar mover el JWT de `localStorage` a cookie httpOnly.** *Pospuesto a pedido del usuario* — es un cambio de arquitectura de auth (toca login, fetch calls, CORS con credentials y protección CSRF). Se mantiene `localStorage`, mitigado por la CSP existente. Queda como mejora futura.

### Media prioridad — calidad y mantenibilidad
- [x] **Agregar tests automatizados**, empezando por auth y las mutaciones de stock/productos. → 22 tests con `node:test` (nativo, sin dependencias nuevas) en `test/`: `validate.test.js`, `auth-middleware.test.js`, `auth-login.test.js`, `products-stock.test.js`. Corren en ~0.5s (`npm test`), mockeando `pool.query`/`pool.connect` — no tocan la base real.
- [x] **Sumar ESLint + Prettier.** → `eslint.config.js` (flat config, ESLint 9) + `.prettierrc.json`. Scripts `npm run lint` / `npm run format`. 0 errores en todo el proyecto (quedan ~79 warnings esperables: variables usadas entre archivos `<script>` hermanos, mismo patrón que ya usaba `public/js/`).
- [x] **Unificar el gestor de paquetes** (npm, según confirmaste). → `pnpm-lock.yaml` y `pnpm-workspace.yaml` sacados de git (`git rm --cached`) y agregados a `.gitignore`. **No se pudieron borrar del disco** por una restricción de permisos del entorno (ver nota al final) — quedan como archivos sueltos sin trackear; podés borrarlos vos con `rm pnpm-lock.yaml pnpm-workspace.yaml`.
- [x] **Actualizar `bcryptjs` (2.4.3 → 3.x) y limpiar la CSP** quitando `cdn.jsdelivr.net`. → Verificado con un roundtrip hash/compare real antes de dar por buena la migración.
- [x] **Dividir `admin.js` en módulos**, siguiendo el mismo patrón que ya usa `public/js/` para el catálogo. → 10 archivos en `public/admin/` (`utils`, `toast`, `auth`, `products`, `images`, `stock`, `recepcion`, `metrics`, `tabs`, `init`), cargados como `<script>` planos en el mismo orden que antes. `admin.html` actualizado. El `admin.js` viejo **no se pudo borrar** (mismo problema de permisos) pero ya no está referenciado.
- [x] **Agregar el mismo chequeo `isNaN` que ya existe en `products.js`** a las rutas de `metrics.js`. → `POST /view/:id` y `POST /whatsapp/:id` ahora devuelven 400 con ID no numérico.

### Baja prioridad — pulido
- [~] **Borrar los archivos muertos** `public/products.js` y `public/js/theme.js`. → El entorno de ejecución bloqueó el borrado (permisos, ver nota). Quedan huérfanos en disco; borralos vos con `rm public/products.js public/js/theme.js`.
- [x] **Agregar `aria-label` a los botones de solo ícono del panel admin.** → Cubierto en los botones generados dinámicamente (editar/eliminar en tabla, tarjetas y stock; eliminar imagen) y en los estáticos de `admin.html` (cerrar modal, cerrar métricas, toggle tabla/tarjetas).
- [x] **Encontrar la causa raíz del overflow a 480px** en vez de recortarlo en cada nivel de `admin.css`. → La causa real: `.admin-header-left`, `.metric-card` y `.chart-card` son ítems flex/grid sin `min-width: 0`, así que su texto interno no se achicaba y forzaba overflow. Se agregó `min-width: 0` en la regla base de cada uno y se sacó el `max-width: 140px` mágico del título (ya no hace falta). Los `overflow: hidden` defensivos existentes se dejaron (ya no son necesarios, pero son inofensivos y no se pudieron verificar visualmente en un navegador real).
- [x] **Crear `.env.example`**, tal como ya lo referencia el README. → Con todas las variables reales usadas en el código, sin valores secretos.
- [x] **Agregar el archivo `LICENSE`** correspondiente a ISC. → Titular: Ariel Rodas (confirmado con vos).
- [x] **Versionar `public/uploads/` con un `.gitkeep`** y corregir el mojibake residual en los comentarios de `admin.css`. → `.gitkeep` agregado, `public/uploads/*` ignorado en `.gitignore`. Mojibake corregido en ~20 comentarios de `admin.css` (acentos y símbolos con doble encoding).

## Nota: archivos que no se pudieron borrar

Durante la implementación, el entorno bloqueó **cualquier borrado de archivo** dentro de esta carpeta (`rm`, `Remove-Item`, `[System.IO.File]::Delete` fallan con "Access denied" pese a que los permisos NTFS son correctos — parece una protección a nivel de carpeta, no de git). Crear y editar archivos funciona sin problema, solo falla el borrado. Quedaron huérfanos en disco (ya sin ninguna referencia en el código):

```
pnpm-lock.yaml
pnpm-workspace.yaml
public/products.js
public/js/theme.js
public/admin.js          (reemplazado por public/admin/*.js)
license.js                (reemplazado por licenseCheck.js — ver "Multi-tenant, Paso 3")
_tmp-*.js                 (varios: scripts de un solo uso para verificar cosas con Playwright,
                           ya neutralizados/gitignorados, no afectan lint ni tests)
```

Podés borrarlos vos mismo con:
```
rm pnpm-lock.yaml pnpm-workspace.yaml public/products.js public/js/theme.js public/admin.js license.js _tmp-*.js
```

## Mejoras de diseño visual

Pedido 2026-07-20: mejorar la identidad visual y hacer más atractiva la pantalla principal del catálogo.
Se instaló Playwright (`npm install --save-dev playwright` + `npx playwright install chromium`) para poder
ver el sitio renderizado de verdad en vez de leer solo CSS a ciegas. Nota: existe `criterios-diseno-ux.md`
en la raíz del repo con la especificación de diseño original, pero está desactualizado respecto al código
real (dice primario `#822`, el código usa `#c1121f`; menciona Chart.js, ya removido) — conviene actualizarlo
junto con estos cambios para que vuelva a ser la fuente de verdad.

### Bugs encontrados al revisar con Playwright (ya corregidos)
Mirando capturas reales de `http://localhost:3000/` (desktop 1440px y mobile 390px) aparecieron dos
problemas funcionales, no solo estéticos — se arreglaron el mismo día:
- [x] **El modal de detalle no mostraba el precio de oferta.** La tarjeta mostraba el precio tachado +
      oferta correctamente, pero `openModal()` en `public/js/modal.js` siempre renderizaba `product.price`
      sin chequear `en_oferta`/`precio_oferta`. Ahora usa la misma lógica que la tarjeta (`product-price-old`
      + precio de oferta), y el mensaje pre-cargado de WhatsApp también usa el precio efectivo, no el original.
- [x] **Solo el botón "Ver detalle" abría el modal** — click en la imagen o el nombre del producto no hacía
      nada, en `.product-card` (grid principal) y `.highlight-card` (Destacados/Promociones). Ahora toda la
      tarjeta es clickeable (con `cursor: pointer`), salvo que el producto esté sin stock — mismo criterio
      que ya usaba el botón deshabilitado. Verificado con Playwright: click en la imagen abre el modal con
      el precio correcto.

### Consistencia de marca (catálogo vs. admin)
- [ ] **Unificar los tokens de color** entre `styles.css` y `admin.css` en un solo lugar. Hoy el catálogo usa
      `--color-primary: #c1121f` (rojo principal) + `--color-primary-hover: #e63946`, pero el admin nunca usa
      el rojo principal — solo define `--primary-dark: #e63946` (que es el *hover* del catálogo) con un nombre
      de variable distinto. El admin se siente "más pálido" de marca que el catálogo.
- [ ] **Sumar el peso 500 de Poppins** (hoy solo se cargan 600/700/800, todo bold) para tener más flexibilidad
      tipográfica si se usa Poppins en jerarquías intermedias.
- [ ] **Evaluar reemplazar `Segoe UI`** (fuente de sistema, sin personalidad de marca) por algo tipo Inter en
      el body text — mejora, sobre todo, la lectura de precios (números tabulares) y se ve igual en todos los
      sistemas operativos, no solo Windows.
- [ ] **Actualizar `criterios-diseno-ux.md`** para que refleje la paleta y stack real (está desincronizado).

### Pantalla principal del catálogo — atractivo visual y animaciones
El sitio ya tiene bastante trabajo de animación hecho (vale la pena partir de ahí, no de cero):
tilt 3D en tarjetas (`js/tilt.js`), efecto Ken Burns + fade en el hero/carrusel, shimmer en imágenes
cargando, badges con slide-in + pulse, y un keyframe `racingScroll` ya definido en `styles.css`.

- [ ] **Animaciones de entrada al hacer scroll** (fade-up con `IntersectionObserver`) en las secciones de
      destacados/promociones/grid de productos — hoy aparecen instantáneamente, sin ningún reveal. Es la
      mejora de mayor impacto visual con menor riesgo (no toca lógica de datos, solo presentación).
- [ ] **Micro-interacción en el botón de WhatsApp** (pulso o glow sutil) — es la acción de conversión
      principal del catálogo, tiene sentido que llame más la atención que el resto de los botones.
- [ ] **Mejorar el estado "sin resultados"** de la búsqueda/filtros — hoy es texto plano ("Sin resultados"
      según `criterios-diseno-ux.md`); un ícono o ilustración simple sube la percepción de calidad a costo casi cero.
- [ ] **Revisar el hero**: ¿tiene un mensaje de valor (envíos, garantía, atención por WhatsApp) superpuesto al
      carrusel, o son solo imágenes de producto? Si es lo segundo, una headline corta con entrada animada
      reforzaría la primera impresión para un cliente que nunca visitó el sitio.
- [ ] **Revisar si `racingScroll`** (keyframe ya definido, temática de "carrera"/movimiento) se está
      aprovechando bien o quedó subutilizado — podría reforzar la identidad de repuestos de moto en algún
      punto del hero o el header.

Playwright ya está instalado (ver arriba), así que estos puntos se pueden verificar visualmente antes/después
de implementarlos, en vez de decidir a ciegas solo por CSS.

## Reporte del usuario 2026-07-20 (post-deploy) — arreglado

Tras el deploy anterior, el usuario reportó que el nav (Categorías/Marcas/Ayuda) se veía desalineado y que
el click en la tarjeta seguía sin abrir el detalle. Se investigó cada uno con Playwright:

- [x] **Nav desalineado — causa raíz encontrada y corregida.** Medido en píxeles: el link "Categorías" tiene
      un ícono que lo hace ~4px más alto que "Marcas"/"Ayuda" (solo texto), y `.categories-ul` no tenía
      `align-items: center`, así que cada `<li>` se centraba dentro de su propia altura en vez de centrarse
      entre sí. Se agregó `align-items: center` a `.categories-ul` (`public/styles.css`) — verificado que
      los tres links ahora comparten el mismo centro vertical exacto (105.9px).
- [x] **Click en la tarjeta — el código ya estaba bien, era caché del navegador.** Se re-verificó con
      Playwright: clickear la imagen abre el modal correctamente en local. La causa real: `server.js` servía
      *todo* (HTML incluido) con `Cache-Control: max-age=86400` (1 día) sin `must-revalidate` — quien había
      visitado el sitio antes de un deploy podía seguir viendo JS/HTML viejo hasta por 24hs, sin que el
      navegador siquiera consultara al servidor. Se corrigió: el HTML ahora usa `Cache-Control: no-cache`
      (siempre revalida, es barato) y los assets (JS/CSS/imágenes) usan `max-age=3600, must-revalidate` en
      producción — un deploy se refleja en minutos en vez de hasta 24hs. **Recomendación:** la próxima vez que
      pruebes un cambio recién deployado, hacé un hard refresh (Ctrl+Shift+R) para no confundir caché vieja
      con un bug real.

## Feature: diferenciación visual y orden de productos sin stock (2026-07-20)

- [x] **Cinta diagonal "Sin stock"** en la esquina de la tarjeta (`.ribbon-sin-stock`), reemplazando el badge
      chico que había antes. Se mantiene la imagen desaturada y un scrim oscuro sutil (ya no repite el texto
      "Sin stock" tres veces como antes: badge + overlay + sería redundante con la cinta). Aplica tanto al
      grid principal (`createProductCard`) como a Destacados/Promociones (`renderHighlightTrack`), en
      `public/js/render.js` + `public/styles.css`.
- [x] **Los productos sin stock aparecen al final**, sea cual sea el orden elegido (alfabético, precio,
      recientes). Se implementó en el backend (`routes/products.js`, `ORDER BY en_stock DESC, ...`) porque la
      paginación es server-side — ordenar solo en el frontend rompería la paginación. Cubierto con un test
      nuevo (`test/products-stock.test.js`) que verifica los 5 órdenes posibles.

## Multi-tenant — Paso 1: marca configurable por variables de entorno (2026-07-20)

Primer paso hacia la arquitectura "1 deploy por cliente + Panel Central" que charlamos: hoy el código es
100% reusable para un cliente nuevo sin editar HTML/CSS, solo variables de entorno.

- [x] **`branding.js`** (nuevo) — lee `STORE_NAME`, `STORE_LOGO_URL`, `STORE_LOGO_ALT`, `COLOR_PRIMARY`,
      `COLOR_PRIMARY_HOVER`, `COLOR_ACCENT` del entorno, con defaults = los valores que el catálogo ya tenía
      hardcodeados (un deploy existente sin estas variables se ve exactamente igual que antes).
- [x] **`index.html` y `admin.html` tokenizados** — `__STORE_NAME__`, `__STORE_LOGO_URL__`,
      `__STORE_LOGO_ALT__`, `__COLOR_PRIMARY__`, `__BASE_URL__` en `<title>`, meta og/twitter, JSON-LD
      (de paso corrige el dominio placeholder `tutienda.com` hardcodeado en el JSON-LD, ahora usa `BASE_URL`
      que ya existía como variable pero no se usaba ahí), logo, y copyright del footer.
- [x] **`server.js` sirve `/`, `/index.html` y `/admin.html`** con reemplazo de tokens + inyección de un
      `<style>` con las variables de color, ANTES del `express.static` (mismo patrón liviano que ya usaba la
      ruta SSR `/p/:id`, sin agregar un motor de templates).
- [x] **Bug real encontrado y corregido al verificar visualmente:** un bloque "Gradient accents" en
      `styles.css` tenía `#c1121f`/`#e63946` hardcodeados directamente en `.btn-detail`, `.badge-oferta-card`,
      `.hp-btn`, `.btn-carousel-detail`, `.highlight-badge`, `.btn-filter-toggle` (varios con `!important`),
      pasando por alto las variables CSS — eran justo los botones/badges más visibles del sitio. Ahora usan
      `var(--color-primary)`/`var(--color-primary-hover)`. Sin este fix, el 90% del branding visual no se
      hubiera aplicado pese a que el resto del sistema funcionaba bien.
- [x] Documentado en `.env.example` y en la tabla de variables de `README.md`.

Verificado con Playwright: branding por defecto sin cambios visuales, y con una marca de prueba (nombre +
colores azules) aplicándose correctamente en header, nav, botones y badges, en catálogo y admin.

**Fuera de este paso a propósito** (para no expandir el alcance más de lo pedido): contacto (WhatsApp/email/
dirección/horario del footer) y el texto de FAQ siguen hardcodeados — son "contenido" más que "marca", se
pueden sumar como variables más adelante si hace falta para el próximo cliente.

## Multi-tenant — Paso 2: Panel Central (2026-07-20)

Nuevo sub-proyecto en `panel-central/` (carpeta separada en este mismo repo, `package.json` y deploy propios,
según lo que confirmaste). Es el panel que usás vos como super-usuario para dar de alta clientes, asignarles
plan (Básico/Premium), y llevar el estado de pago — **sin pasarela de pago todavía**: registrás los pagos a
mano cuando confirmás una transferencia (según lo que dijiste, "por ahora omitimos" la integración con
Pagopar).

- [x] **Schema propio** (`clientes`, `pagos`, `administradores` — este último solo para el super-admin, no
      tiene nada que ver con los admins de cada catálogo de cliente).
- [x] **Dos tipos de auth, no confundir:** JWT (vos, humano, logueado en el panel web) para `/api/clientes/*`;
      y una **API key por cliente** (servicio a servicio, sin expiración, header `X-API-Key`) para
      `GET /api/licencia` — la ruta que va a consultar cada catálogo de cliente para saber si sigue activo
      (eso es el Paso 3, todavía no conectado del lado del catálogo).
- [x] **CRUD de clientes completo**: alta (genera `api_key` automática), edición parcial, regenerar api_key
      si se filtró, baja. Reusa el mismo patrón de validación y de `PUT` parcial que ya usa `routes/products.js`
      del catálogo principal.
- [x] **Registro manual de pagos** por cliente (monto, método, notas) — sin gateway, es solo un historial.
- [x] **Frontend mínimo** (login + tabla de clientes + modales de alta/edición/pagos), con una paleta distinta
      (azul) a la del catálogo, a propósito, para que se note a simple vista que es la herramienta interna y
      no el sitio de un cliente.
- [x] **13 tests** (`node --test` dentro de `panel-central/`) cubriendo auth, CRUD de clientes y el endpoint
      de licencia (activo/vencido/suspendido, key inválida, sin key).
- [x] `eslint.config.js` de la raíz extendido para cubrir `panel-central/**` también (un solo lint para todo
      el monorepo, sin duplicar instalación de ESLint/Prettier en la subcarpeta).

**Verificado end-to-end contra una base real** (Postgres local, base `panel_central_db` separada de
`catalogo_db` para no compartir la tabla `administradores` con el catálogo — decisión que confirmaste):
login → alta de cliente real (genera `api_key` de 64 caracteres) → `GET /api/licencia` con esa key devuelve
`{ activo: true, plan: "premium", estado: "activo" }` → con una key inventada devuelve 403 → registro de un
pago (Gs. 150.000, transferencia) se guarda y aparece en el historial. Los 13 tests (con `pool.query`
mockeado) también pasan.

**Bug real encontrado y corregido en esta verificación:** el input del slug tenía
`pattern="[a-z0-9-]+"`, que Chrome rechaza como regex inválida bajo su modo "v" más nuevo (el guion sin
escapar al final de una clase de caracteres). Cambiado a `[a-z0-9\-]+`. Sin probarlo en un navegador real
esto no se hubiera notado — quedaba silencioso en la consola, no rompía la funcionalidad pero sí la
validación del campo.

## Multi-tenant — Paso 3: conectar el catálogo al Panel Central (2026-07-20)

- [x] **`licenseCheck.js`** (nuevo, raíz del catálogo) — al arrancar y cada 6hs, consulta
      `GET {PANEL_CENTRAL_URL}/api/licencia` con su `CLIENTE_API_KEY`. Guarda el último resultado bueno en
      memoria. Si `PANEL_CENTRAL_URL`/`CLIENTE_API_KEY` no están definidas, el deploy es "standalone" (todas
      las features, sin restricción — no rompe el deploy actual de este catálogo). Si nunca pudo conectar, o
      pasaron más de 48hs sin poder reconfirmar el estado, degrada a Básico **pero nunca bloquea el sitio** —
      una caída del Panel Central nunca es motivo para tirar abajo el catálogo de un cliente.
      *(Se llamó `licenseCheck.js` y no `license.js`: en Windows/Mac, `require('../license')` resuelve al
      archivo `LICENSE` de texto plano por case-insensitivity del filesystem — lo encontramos porque los
      tests fallaban con un `SyntaxError` al intentar parsear el `LICENSE` como JS. `license.js` quedó
      huérfano, sin poder borrarlo — ver nota de archivos sin borrar.)*
- [x] **`GET /api/plan`** (nuevo, protegido con JWT) — el admin panel lo consulta para saber qué mostrar.
- [x] **`GET /api/metrics/dashboard` gateado**: devuelve 403 si el plan no es Premium o la cuenta no está
      activa (una cuenta Premium suspendida también pierde el acceso, no solo la Básica).
- [x] **Frontend**: la pestaña Métricas muestra un placeholder "función Premium" en vez del dashboard cuando
      corresponde (no desaparece la pestaña — más amigable que ocultarla de golpe); un banner rojo persistente
      avisa si la cuenta está vencida/suspendida, sin bloquear nada más del panel.
- [x] **17 tests nuevos** (`licenseCheck.test.js` + `metrics.test.js`) cubriendo: modo standalone, sin
      verificar nunca, verificación exitosa, cuenta suspendida, caída de red del Panel Central, y el gateo
      real del endpoint de métricas en los 4 escenarios (standalone, básico, premium suspendido, premium
      activo).

**Verificado end-to-end contra infraestructura real** (no solo mocks): con el catálogo principal y el Panel
Central corriendo simultáneamente en local, conectados de verdad —
1. Cliente creado en Básico → pestaña Métricas muestra "función Premium" (capturado).
2. Mismo cliente pasado a Premium en el Panel Central + reinicio del catálogo → Métricas carga el dashboard
   real, sin errores de consola (capturado).
3. Cliente pasado a "suspendido" → vuelve el placeholder Premium **y** aparece el banner rojo de suscripción
   vencida (capturado) — confirma que un Premium impago pierde el perk, no solo un Básico.

**Bug real encontrado durante esta verificación:** la colisión `license.js`/`LICENSE` explicada arriba —
sin probar los tests en este entorno Windows no se hubiera notado (en Render, que corre Linux
case-sensitive, nunca hubiera fallado, pero sí rompía el desarrollo local). También hubo que corregir un mock
de test mal armado (mockear `fetch` global sin restaurarlo también interceptaba el fetch que el propio test
usaba para pegarle al servidor de prueba) — quedó en los tests como comentario para que no se repita.

**Decisiones de diseño a marcar (no volver a asumir sin confirmar):**
- Nunca hay un "lockout total" del catálogo por falta de pago — como mucho se pierde la función Premium
  (métricas). Si en algún momento se quiere un bloqueo más duro (ej. bloquear el login del admin), es un
  cambio de comportamiento a decidir explícitamente, no algo que se agregó acá.
- Multi-usuario y dominio propio (mencionados en la idea original de planes) no están implementados —
  dominio propio es una config de DNS/Render, no algo que la app pueda gatear, y multi-usuario requeriría un
  sistema de roles que hoy no existe (un solo admin por cliente).

### Extensión: Básico solo ve la pestaña Productos (2026-07-20, mismo día)

A pedido del usuario, se amplió el gateo más allá de Métricas: ahora **Stock** y **Recepción** también son
Premium. El plan Básico solo ve la pestaña **Productos** — desde ahí igual puede marcar "sin stock" y editar
`stock_cantidad`/`stock_minimo` a mano (`PUT /api/products/:id`, sin gatear a propósito), solo pierde las
herramientas de conveniencia (alertas de stock bajo, recepción masiva por lote).

- [x] **Frontend**: los botones de tab de Métricas/Stock/Recepción llevan `data-plan="premium"`;
      `checkPlanStatus()` (`public/admin/init.js`) los oculta si el plan no es Premium+activo, y si la pestaña
      activa quedaba oculta, vuelve automáticamente a Productos para no dejar la vista en blanco.
- [x] **Backend**: `POST /api/products/batch-stock` (el único endpoint específico de Stock/Recepción — ambas
      pestañas usan el mismo `GET /api/products` que Productos, que sigue sin gatear) devuelve 403 con el
      mismo criterio que ya usa `GET /api/metrics/dashboard`.
- [x] **3 tests nuevos** en `test/products-stock.test.js` (403 en Básico, sigue pasando en Premium).

**Verificado end-to-end** con el catálogo y el Panel Central real corriendo a la vez: cliente Básico → solo
"Productos" visible (capturado); mismo cliente subido a Premium → las 4 pestañas visibles, sin errores de
consola (capturado); `POST /batch-stock` con token de Premium activo devuelve 400 (llega a la validación
normal, no 403) confirmando que pasa el gate.

## Nota: scripts temporales sin borrar

Además de los archivos listados arriba, quedaron varios scripts de un solo uso para tomar capturas con
Playwright (`_tmp-*.js` en la raíz) que tampoco se pudieron borrar por el mismo problema de permisos. Ya
están en `.gitignore` y excluidos de ESLint (patrón `_tmp-*.js`) así que no se van a commitear ni te van a
ensuciar el lint, pero podés borrarlos vos con `rm _tmp-*.js`.
