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
public/logo.png            (reemplazado por public/favicon.svg — ver "Favicons", más abajo)
cloudinary.js              (reemplazado por imagekit.js — nunca se llegó a commitear, no afecta git)
_tmp-*.js                 (varios: scripts de un solo uso para verificar cosas con Playwright,
                           ya neutralizados/gitignorados, no afectan lint ni tests)
```

Podés borrarlos vos mismo con:
```
rm pnpm-lock.yaml pnpm-workspace.yaml public/products.js public/js/theme.js public/admin.js license.js cloudinary.js _tmp-*.js
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

## Rebranding: "PiezaExpress" como identidad de producto (2026-07-20)

A pedido del usuario, se cambió el logo del catálogo. Hasta ahora el header mostraba una imagen (`STORE_LOGO_URL`,
por defecto `/logo.png`) sin nombre de marca definido por código. El usuario compartió una captura de referencia
("Pieza" en negro + "Express" en rojo oscuro, con el tagline "repuestos al instante" debajo) y pidió usarla como
el nombre de venta del producto en sí — **"PiezaExpress"** es ahora la identidad por defecto con la que se vende
el catálogo, y se reemplaza por la marca real de cada cliente vía las variables de entorno ya existentes desde
"Multi-tenant, Paso 1" (`STORE_NAME`, etc.) cuando se hace un deploy para alguien.

**Decisión de diseño (no pedida explícitamente, adaptación propia):** la captura de referencia tenía el texto
sobre fondo blanco, pero el header real del catálogo tiene `background-color: var(--color-primary)` (rojo) —
poner el texto directo ahí habría perdido casi todo el contraste. Se resolvió envolviendo el wordmark en un
"chip" blanco/`--color-surface` (`.logo-container`, padding + `border-radius`) que se mantiene legible sin
importar el color primario del cliente, ya que el chip nunca es rojo.

- [x] `branding.js`: nuevos defaults `storeName: 'PiezaExpress'`, `storeNameAccent: 'Express'` (la parte del
      nombre que se pinta con `--color-primary`), `storeTagline: 'repuestos al instante'`. Se agregó
      `escapeHtml()` + `buildWordmarkHtml()` para armar el HTML del wordmark (separa `storeName` alrededor de
      `storeNameAccent` y envuelve esa parte en `<span class="logo-accent">`) escapando cualquier valor que
      venga de variables de entorno, no de código fijo.
- [x] `server.js` (`renderBrandedHtml`): reemplaza los tokens nuevos `__STORE_WORDMARK__` y `__STORE_TAGLINE__`;
      se sacó el reemplazo de `__STORE_LOGO_ALT__` (ya no se usa, el logo ya no es una imagen con `alt`).
- [x] `public/index.html`: el `<a class="logo-container">` del header pasó de `<img>` a dos `<span>` de texto
      (wordmark + tagline). `STORE_LOGO_URL` queda vivo solo para el ícono de la pestaña del navegador
      (favicon), documentado así en `README.md`/`.env.example`.
- [x] `public/styles.css`: rediseño de `.logo-container` (chip blanco, flex column, padding, border-radius),
      `.logo-wordmark` (negrita, Poppins), `.logo-wordmark .logo-accent` (color vía `var(--color-primary)` —
      se adapta solo si un cliente define otro color primario), `.logo-tagline` (gris chico, `:empty { display:
      none }` para cuando un cliente no define tagline). Ajustado también el bloque `@media (max-width: 560px)`.
- [x] `README.md` / `.env.example`: se documentaron `STORE_NAME_ACCENT` y `STORE_TAGLINE`, se sacó
      `STORE_LOGO_URL` como logo de header (ahora solo favicon), y se actualizó el default de `STORE_NAME` a
      "PiezaExpress" en la tabla de variables.

**Verificado**: `node --check` en `branding.js`/`server.js`, CSS balanceado, `npx eslint .` (0 errores, mismos
83 warnings preexistentes), `npm test` (48/48). Verificación visual con Playwright en `http://localhost:3000/`
desktop (1200px) y mobile (390px): el chip blanco se ve correctamente sobre el header rojo, "Pieza" en negro y
"Express" en rojo (`--color-primary`), tagline gris debajo, sin errores de consola en ninguno de los dos
viewports.

## Favicons (2026-07-20)

`public/logo.png` (el único uso que le quedaba era el ícono de pestaña del navegador, ver paso anterior) era
en realidad un ícono genérico blanco/transparente (un triángulo con una "S") que quedó de antes de todo el
sistema de marca — prácticamente invisible sobre fondo claro y sin ninguna relación con "PiezaExpress". Además
`panel-central/public/index.html` no tenía ningún favicon.

No hay herramienta de generación de imágenes en este entorno, así que se armaron a mano como SVG (vectorial,
liviano, se ve nítido en cualquier tamaño de pestaña sin necesitar múltiples archivos `.ico`/`.png`):

- [x] `public/favicon.svg` (NUEVO): cuadrado redondeado rojo (`#c1121f`, el mismo que `--color-primary` por
      default) con una "P" blanca en negrita — el monograma de "PiezaExpress". `branding.js`:
      `logoUrl` default cambió de `/logo.png` a `/favicon.svg` (documentado en `README.md`/`.env.example`).
      `public/index.html` y `public/admin.html`: el `<link rel="icon">` se sacó el `type="image/png"` fijo
      (ya no aplica si el default es SVG, y así tampoco se rompe si un cliente pisa `STORE_LOGO_URL` con un
      `.png` propio — el navegador detecta el tipo solo).
- [x] `panel-central/public/favicon.svg` (NUEVO): mismo patrón pero azul marino (`#1e3a5f`, el
      `--color-primary` de esa interfaz) con una "C" blanca (de "Central") — así se distingue de un vistazo
      del catálogo en la barra de pestañas del navegador. Agregado el `<link rel="icon">` que no existía.
- [x] `public/logo.png` queda huérfano (ver "Nota: archivos que no se pudieron borrar" arriba).

**Verificado**: `node --check`, `npx eslint .` (0 errores), `npm test` (48/48). Con el catálogo corriendo
localmente: `GET /favicon.svg` devuelve 200 con `Content-Type: image/svg+xml`, el token `__STORE_LOGO_URL__`
se reemplaza correctamente en `index.html` y `admin.html`, sin errores de CSP ni de consola. Capturas a 64px,
32px y 16px (tamaño real de pestaña) confirman que ambos monogramas quedan legibles y con buen contraste
incluso en el tamaño más chico.

## Branding desde el Panel Central (2026-07-26)

A pedido del usuario: poder cambiar logo y colores de cada cliente desde el Panel Central, en vez de
depender de variables de entorno en Render. Esto es una extensión del sistema de marca de `branding.js`
(ver "Multi-tenant, Paso 1"), no un rediseño — las variables de entorno siguen funcionando igual para
deploys standalone o mientras un cliente no tenga nada cargado en el Panel Central.

**Decisiones de diseño confirmadas con el usuario antes de implementar:**
- El "logo" puede ser **texto** (nombre de la tienda, como ya existía) o una **imagen subida**, a elección
  por cliente — para locales que no tienen un logo propio, el texto sigue siendo una opción válida, no un
  fallback de emergencia.
- Si un cliente tiene un valor cargado en el Panel Central Y en variables de entorno de Render al mismo
  tiempo, **gana el Panel Central** (Render queda como fallback de un cliente todavía no conectado, o como
  lo que se usa mientras el Panel Central esté abajo más de 48hs — mismo caché de gracia que ya tenía la
  licencia).

**Dónde se guarda la imagen del logo:** el filesystem de Render es efímero (se borra en cada redeploy, ver
la nota de Multer más abajo en este documento) — subir el logo ahí lo perdería tarde o temprano. En vez de
reabrir la migración a Cloudinary/S3 (pospuesta explícitamente por el usuario), el logo se guarda como
**base64 en una columna de la propia base de Postgres del Panel Central** (Neon, persistente). Es viable
porque son logos chicos (tope de 300KB), no fotos de producto — para eso sí haría falta Cloudinary/S3 en
algún momento, pero no para esto.

- [x] **`panel-central/schema.sql`**: nuevas columnas en `clientes` — `logo_type` ('texto'|'imagen'),
      `store_name`, `store_name_accent`, `logo_image_data`/`logo_image_mime` (el logo en sí), `favicon_url`,
      `color_primary`/`color_primary_hover`/`color_accent`. Todas opcionales (NULL = "usar el default del
      catálogo"). Se agregaron también como `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para migrar la base
      ya existente en producción sin perder los clientes ya cargados.
- [x] **`panel-central/routes/clientes.js`**: `GET`/`POST`/`PUT` de `/api/clientes` ahora leen/escriben estos
      campos (la lista, para no ser pesada, no trae el blob de imagen). Nuevos endpoints
      `POST /api/clientes/:id/logo` (sube el archivo con Multer en memoria, no en disco, lo convierte a
      base64 y marca `logo_type='imagen'`) y `DELETE /api/clientes/:id/logo` (vuelve a `logo_type='texto'`).
- [x] **`panel-central/middleware/validate.js`**: valida los colores como hex de 6 dígitos y `favicon_url`
      como http/https (mismo patrón que ya se usaba para el link a clientes, ver más abajo en este documento).
- [x] **`panel-central/middleware/apiKeyAuth.js`** y **`routes/licencia.js`**: `GET /api/licencia` ahora
      devuelve también un objeto `branding` (con todo en `null` si el cliente no cargó nada ahí).
- [x] **`panel-central/public/`** (`index.html`, `app.js`, `styles.css`): sección "Marca del catálogo" en el
      modal de cliente — radio texto/imagen, inputs de nombre/acento, favicon, 3 selectores de color
      (`<input type="color">` sincronizado con un `<input type="text">` hermano, porque `type="color"` no
      puede representar "sin valor" y acá vacío = "usar default"), y el upload/preview/quitar del logo. La
      subida de imagen solo está disponible editando un cliente ya creado (necesita su `id`).
- [x] **`licenseCheck.js`** (catálogo): el objeto cacheado de licencia ahora incluye `branding` tal cual lo
      manda el Panel Central; se cae a `branding: null` en standalone y cuando se degrada por no poder
      confirmar el estado (mismo criterio que ya se aplicaba a plan/activo).
- [x] **`branding.js`** (catálogo, reescrito): `getEffectiveBranding()` combina el override del Panel Central
      con los defaults de entorno de siempre. `buildLogoInnerHtml()` arma el `<img>` (si hay logo de imagen)
      o el wordmark de texto + tagline (si no). Import de `licenseCheck` sin desestructurar a propósito, para
      que los tests puedan mockear `licenseCheck.getLicense` con `t.mock.method`.
- [x] **`server.js`**: `renderBrandedHtml()` llama a `getEffectiveBranding()` en cada request (barato, todo en
      memoria) en vez de una sola vez al arrancar — así un cambio hecho en el Panel Central se refleja sin
      redeploy, en el próximo chequeo de licencia (o al reiniciar, que lo fuerza al toque).
- [x] **`public/index.html`**/**`styles.css`**: el header pasa a un único token `__STORE_LOGO_INNER__` (en vez
      de wordmark+tagline por separado), y se agregó `.logo-image` para el caso de logo subido.

**Verificado**: `npm test` (63/63 en el catálogo, incluye 6 tests nuevos de `branding.js`; 22/22 en
Panel Central, incluye validación de colores/URL y los endpoints de logo). `npx eslint .` (0 errores).
End-to-end real con Playwright: Panel Central y catálogo corriendo local a la vez, cliente de prueba con
colores verdes + nombre "Verduras El Sol" — el catálogo lo reflejó correctamente (capturado); logo subido
como imagen — el header pasó de wordmark a `<img>` sin errores de consola (capturado); interfaz del modal
en ambos modos (texto/imagen) y en "Nuevo cliente" (todo en blanco por default) revisada visualmente.

**Bug real encontrado y corregido durante la verificación**: el `POST /api/clientes` (alta de cliente) no
guardaba los campos de marca — solo se había extendido el `PUT`. Se detectó porque el color cargado al crear
el cliente de prueba no aparecía en `GET /api/licencia`; sin la verificación end-to-end real (no solo tests
unitarios con mocks) este bug hubiera llegado a producción.

## Fix de seguridad: escapado de storeName/faviconUrl (2026-07-26)

Antes de subir el feature de branding, el usuario preguntó explícitamente si había algún riesgo de seguridad.
Revisando en serio (no solo confirmando de palabra) encontré que `store_name`/`favicon_url` — que ahora pueden
venir de un formulario web del Panel Central, no solo de variables de entorno de confianza — se insertaban
crudos en varios lugares del HTML (`<title>`, meta tags, un bloque `<script type="application/ld+json">`, y
atributos como `href`/`aria-label`) sin escapar. El `escapeHtml()` de `branding.js` tampoco escapaba comillas,
así que ni siquiera hubiera cortado un intento de romper un atributo.

- [x] `escapeHtml()` ahora también escapa `"` y `'` (antes solo `&`/`<`/`>`).
- [x] Se exporta desde `branding.js` y se aplica en `server.js` a `effective.storeName` y
      `effective.faviconUrl` antes de insertarlos en el HTML (los demás tokens ya estaban cubiertos, sea
      porque `buildLogoInnerHtml()`/`buildWordmarkHtml()` ya escapaban internamente, sea porque
      `__COLOR_PRIMARY__` siempre es un hex validado por el Panel Central o viene de una variable de entorno
      del mismo nivel de confianza que el propio código).

**Verificado con un ataque real**, no solo en teoría: creé un cliente con `store_name` =
`Foo</script><script>alert(document.cookie)</script>`, conecté un catálogo local a ese cliente, y confirmé
que el HTML servido lo neutraliza correctamente (`Foo&lt;/script&gt;...`) en los 4 lugares donde aparece
(title, og:title, JSON-LD, aria-label/wordmark). Test nuevo en `test/branding.test.js` que fija este
comportamiento.

## Fix: el color primario no llegaba a todo el catálogo ni al admin (2026-07-26)

El usuario reportó, probando el feature de branding recién agregado, que cambiar `COLOR_PRIMARY` no se
reflejaba en todos lados: el efecto hover al pasar el mouse sobre una tarjeta de producto seguía siendo
siempre rojo, el fondo del badge de categoría en el detalle de producto quedaba "rojo clarito" fijo, y
(encontrado al investigar) **todo el panel de administración** seguía siempre rojo sin importar la marca
configurada.

**Causa raíz — dos variantes del mismo problema:**
1. Varias reglas CSS usaban `var(--color-primary)` para el texto pero un `rgba(193, 18, 31, ...)` o un hex
   claro (`#fce8e8`, `#f5d0d0`) hardcodeado para el fondo/sombra — quedaban "medio themeadas": el texto sí
   cambiaba, el fondo no. Afectaba `.modal-category` (detalle de producto), `.sidebar-filter-link.active` y
   `.filter-chip` (categorías/filtros activos), y el sweep de `.product-card::before` (el hover sobre las
   imágenes).
2. Bug más serio en `admin.css`: define su propia variable `--primary` (en vez de `--color-primary`, deuda ya
   documentada como "unificar tokens de color") y `brandingStyleTag()` **nunca la sobreescribía** — solo
   pisaba `--primary-dark`. Resultado: los ~38 usos de `var(--primary)` en el admin (botones, ícono de login,
   barras de métricas, checkboxes) quedaban permanentemente en rojo sin importar la marca del cliente.

**Fix:**
- [x] `branding.js`: nueva función `hexToRgbTriplet()` (hex → "R, G, B"). `brandingStyleTag()` ahora también
      inyecta `--color-primary-rgb`/`--primary-rgb` (mismo valor, los dos nombres — ver nota de "Nota: admin.css
      todavía usa su propio nombre de variable" más abajo) para poder componer `rgba(var(--...-rgb), alpha)`
      con la opacidad que haga falta en cada regla, en vez de una variable fija por cada nivel de opacidad.
      **Y ahora sí sobreescribe `--primary`**, no solo `--primary-dark`.
- [x] `public/styles.css` / `public/admin.css`: los `rgba(193, 18, 31, X)` y hex claros (`#fce8e8`, `#f5d0d0`)
      hardcodeados pasan a `rgba(var(--color-primary-rgb), X)` / `rgba(var(--primary-rgb), X)`. Los gradientes
      que mezclaban `var(--primary)` con un segundo color hardcodeado (`.btn-recibir-stock`,
      `.btn-solicitar-todo`, `.metrics-bar-fill.vistas`) pasan a usar `var(--primary-dark)` en el segundo stop.
      Los `accent-color: #c1121f` de los checkboxes de recepción pasan a `var(--primary)`.
- [x] Default agregado en el `:root` de ambos CSS: `--color-primary-rgb: 193, 18, 31;` / `--primary-rgb: 193, 18, 31;`
      (mismo valor que el hex por defecto, para que el CSS no rompa si por lo que sea no se inyecta el `<style>`).

**No tocado a propósito**: colores claramente semánticos y no ligados a la marca — el verde oficial de
WhatsApp (`.icon-whatsapp`, `.metrics-bar-fill.clicks`), el naranja/azul de los badges de "Destacado"/"Promo"
(`.badge-destacado-card`, `.badge-promo-card`), y el verde de "Generar pedido" (`.btn-generar-pedido`, una
acción positiva, no la marca del cliente).

**Verificado**: `npm test` (65/65, incluye un test nuevo que fija `--color-primary-rgb`/`--primary-rgb`),
`npx eslint .` (0 errores). Visual con Playwright y un verde de prueba (`#0a7d3c`): el badge de categoría en
el detalle de producto quedó con fondo verde clarito (capturado), y el panel de admin (ícono y botón de
login) pasó de rojo fijo a verde (capturado) — confirmando que el bug de `--primary` en el admin quedó
resuelto. Durante esta verificación encontré ~19 procesos de Node huérfanos acumulados de toda la
sesión (por cómo este entorno maneja los procesos en segundo plano) que generaban resultados inconsistentes
al probar — quedó como lección: si un cambio de color/env var "no se refleja" al probar localmente, matar
TODOS los procesos de node sueltos antes de sospechar del código.

## El problema de las imágenes: de Cloudinary a ImageKit.io (2026-07-27)

El usuario preguntó si el catálogo ya estaba en condiciones de venderse. La respuesta fue: técnicamente sí
para un primer cliente, pero con un problema real sin resolver — las imágenes de producto subidas por
archivo se pierden en cada redeploy de Render, porque el filesystem del servicio es efímero (`public/uploads/`
se borraba y se recreaba vacío en cada deploy). No es un caso límite: pasa en cualquier push de código, no
solo en cambios grandes.

**Intento 1 — Cloudinary**: se implementó completo (`cloudinary.js`, multer en memoria en vez de disco,
`producto_imagenes.cloudinary_public_id` para poder borrar el archivo al borrar la fila), con 5 tests nuevos.
Al momento de probarlo en vivo, la cuenta de Cloudinary del usuario resultó inaccesible — el panel devolvía
"Página no disponible" / "problemas técnicos al procesar su solicitud" de forma reproducible en dos redes
distintas (wifi y datos móviles) y en una cuenta nueva con otro email, descartando que fuera un problema de
red/navegador del usuario. El status público de Cloudinary no mostraba ninguna caída — parece haber sido algo
puntual de esa cuenta/región que no valía la pena seguir persiguiendo.

**Intento 2 — ImageKit.io**: mismo patrón exacto (storage + CDN de imágenes, SDK de Node con upload por
buffer y borrado por `fileId`), sin el problema de acceso. Se migró todo el código de Cloudinary a ImageKit
sin haber llegado a commitear la versión de Cloudinary (todo local, sin impacto en git):
- [x] `cloudinary.js` → `imagekit.js` (mismo diseño: `isConfigured()`, `uploadImage(buffer)`,
      `deleteImage(id)`, best-effort en el borrado). `cloudinary.js` queda vacío y sin referencias — no se
      pudo borrar (ver nota de archivos que no se pudieron borrar).
- [x] `producto_imagenes.cloudinary_public_id` → `imagekit_file_id` en `schema.sql` (con su
      `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para bases ya existentes).
- [x] `routes/products.js`: `POST /:id/images/upload` devuelve 503 con mensaje claro si `IMAGEKIT_*` no está
      configurado, en vez de fallar en silencio o (peor) volver a guardar en disco. `DELETE /images/:imageId`
      borra también el archivo en ImageKit si la imagen se subió por archivo (no si se cargó por URL externa).
- [x] `server.js`: warning en el arranque si `IMAGEKIT_*` no está configurado.
- [x] Variables nuevas: `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`,
      `IMAGEKIT_FOLDER` (opcional, para separar las imágenes de cada cliente dentro de la misma cuenta —
      igual que `CLOUDINARY_FOLDER` hubiera hecho).
- [x] 5 tests nuevos en `test/products-images.test.js` (auth requerida, 503 sin configurar, sube y guarda
      `url`+`file_id`, borra de ImageKit solo cuando corresponde).
- [x] `npm audit fix` de paso (sin romper nada): corrigió vulnerabilidades moderate/low en `body-parser`/`qs`
      que trajo la dependencia nueva. Quedó pendiente una vulnerabilidad high en la cadena de `eslint`
      (`brace-expansion`, vía `minimatch`) que requiere `--force` (bump mayor de eslint, cambio disruptivo) —
      es una devDependency, no viaja a producción, se deja para otro momento.

**Verificado end-to-end contra producción real** (no solo con mocks): tras correr la migración de schema
(`node db-init.js` con `DATABASE_URL` de producción — el primer intento de subida falló con
`column "imagekit_file_id" does not exist" hasta correrla), se subió una imagen real a un producto real,
se confirmó que la URL devuelta (`https://ik.imagekit.io/...`) carga de verdad (200), y se borró
inmediatamente después (fila de la base + archivo en ImageKit) para no dejar nada de prueba en producción.
`npm test`: 70/70. `npx eslint .`: 0 errores.

**Nota para cuando haya más clientes**: como esta es la misma cuenta de ImageKit para todos los clientes
(separados por `IMAGEKIT_FOLDER`), a medida que se sumen catálogos reales conviene vigilar el uso contra el
límite del plan gratis (~20-25GB de banda/mes) — mencionado en la conversación con el usuario, no bloqueante
para arrancar.

## Subir la imagen principal también por archivo (2026-07-27)

Después de armar la subida de "imágenes adicionales" por ImageKit, quedó una inconsistencia: la **imagen
principal** de un producto (`productos.image`) solo se podía cargar pegando una URL a mano — para poner un
archivo propio ahí, había que subirlo primero como "adicional", copiar la URL que devolvía, y recién ahí
pegarla en el campo de imagen principal. El usuario lo notó y pidió simplificarlo.

**Complejidad particular**: a diferencia de las imágenes adicionales (que ya tienen un producto al que
asociarse, vía `:id` en la URL), la imagen principal se tiene que poder subir **antes** de que el producto
exista (al crear uno nuevo) — no hay ID todavía. Por eso no alcanzaba con reusar `POST /:id/images/upload`.

- [x] **`routes/products.js`**: nuevo `POST /api/products/upload-image` — sube el archivo a ImageKit y
      devuelve `{ url, fileId }`, sin tocar la base de datos para nada (no sabe ni le importa a qué producto
      va a terminar asociada esa imagen). Mismo multer en memoria, mismo chequeo de `isConfigured()` → 503.
- [x] **`schema.sql`**: nueva columna `productos.image_imagekit_file_id` (con su `ALTER TABLE ADD COLUMN
      IF NOT EXISTS`) — igual que en `producto_imagenes`, para poder identificar si la imagen principal se
      subió como archivo o se pegó por URL. **No implementado todavía**: borrar el archivo viejo de ImageKit
      cuando se reemplaza la imagen principal (si se sube/pega una nueva, la vieja queda huérfana en
      ImageKit) — se dejó así a propósito para no sumar complejidad al `PUT` sin que se haya pedido; queda
      documentado acá para no asumir que ya está resuelto.
- [x] **`routes/products.js`** (`POST`/`PUT` de productos): aceptan el campo opcional
      `image_imagekit_file_id` y lo guardan junto con `image`.
- [x] **`public/admin.html`**: al lado del campo "Imagen principal", el mismo patrón de "Subir archivo" que
      ya existía para las adicionales (input de archivo + botón), y un input oculto para el `file_id`.
- [x] **`public/admin/images.js`**: nueva `uploadMainImageFile()` — sube por `POST /upload-image` y completa
      los campos de URL/file_id/preview como si el usuario hubiese pegado la URL a mano.
- [x] **`public/admin/products.js`**: el listener de `input` que ya existía sobre el campo de URL (para la
      preview) ahora también limpia el `file_id` oculto cuando el usuario tipea/pega una URL a mano — si no,
      quedaría un `file_id` de una subida anterior asociado a una URL que ya no le corresponde. La asignación
      programática de `.value` que hace `uploadMainImageFile()` no dispara ese evento, así que no se pisa a
      sí misma.

**Verificado con Playwright contra producción real** (este endpoint no toca la base, así que es seguro
probarlo ahí sin crear nada): se abrió "Nuevo producto", se subió un archivo real por el botón nuevo, se
confirmó que el campo de URL y el `file_id` oculto se completaron solos con una URL real de ImageKit
(`ik.imagekit.io`) y que la preview se mostró — sin errores de consola. Se canceló el formulario sin guardar
(para no crear un producto de prueba) y se borró el archivo subido de ImageKit con un script aparte, para no
dejar nada huérfano. `npm test`: 73/73 (8 tests nuevos en `test/products-images.test.js`). `npx eslint .`:
0 errores.

## Dropzone: arrastrar y soltar + selección múltiple (2026-07-27)

El usuario probó la subida de la imagen principal y notó que había que acordarse de apretar un botón
"Subir archivo" aparte después de elegir el archivo — si no, el formulario tiraba el error nativo de
"completá este campo" (la URL nunca se llenaba). Preguntó cuál es el estándar actual para este tipo de UI y
pidió implementarlo completo: arrastrar y soltar, selección múltiple, subida automática, miniaturas con
progreso — en vez de la versión mínima (que hubiera sido solo "múltiples archivos + subida automática").

- [x] **`public/admin.html`**: tanto la imagen principal como las adicionales pasan a una "dropzone"
      (`<div class="image-dropzone">` con un `<input type="file">` transparente superpuesto — técnica
      estándar) en vez de un `<input>` + botón separados. La de adicionales acepta `multiple`.
- [x] **`public/admin/images.js`** (reescrito): `setupDropzone()` genérico (click-to-browse vía el input +
      eventos `dragenter`/`dragover`/`dragleave`/`drop` con feedback visual `.dragover`), llamado una vez al
      iniciar el panel (`setupImageDropzones()` en `init.js`, mismo patrón que `setupImagePreview()`).
      `uploadMainImageFile()` ahora sube automáticamente apenas se elige/suelta un archivo (ya no depende de
      un click en un botón aparte — la causa real del problema reportado). `uploadImageFiles()` (antes
      `uploadImageFile`, singular) sube varias imágenes: cada una aparece de entrada como miniatura con
      spinner (`URL.createObjectURL`, preview instantánea sin esperar la subida real) y se va reemplazando
      por la real a medida que cada una termina — no hace falta esperar a que terminen todas para ver la
      primera. Si una falla, queda con un ícono de error y un botón de reintentar, sin bloquear las demás.
- [x] **`public/admin.css`**: estilos nuevos para `.image-dropzone` (con estado `.dragover`), la grilla
      `.images-container`/`.img-item` (que en realidad **nunca había tenido CSS propio** — se le agregó de
      paso, ver nota abajo) y el spinner.

**Dos bugs reales encontrados durante la verificación en vivo (no antes):**

1. **CSP bloqueaba las previews instantáneas**: `URL.createObjectURL()` genera URLs `blob:`, y el `imgSrc`
   del CSP (`server.js`) no incluía ese esquema — el navegador bloqueaba silenciosamente cada miniatura de
   "subiendo" (error visible solo en la consola). Se agregó `blob:` a `imgSrc`.
2. **`orden` hardcodeado en 0** en los dos endpoints que agregan imágenes adicionales
   (`POST /:id/images/upload` y `POST /:id/images/url`) — un bug que **ya existía antes de esta sesión**,
   simplemente nunca se había detectado porque nadie había probado agregar una *segunda* imagen adicional al
   mismo producto: la tabla tiene `UNIQUE (producto_id, orden)`, así que la segunda imagen siempre chocaba
   (409 Conflict). Con subida múltiple esto se volvió inevitable de encontrar. Se corrigió calculando
   `orden` con `(SELECT COALESCE(MAX(orden), -1) + 1 FROM producto_imagenes WHERE producto_id = $1)` en el
   propio `INSERT`, y de paso se cambió la subida de varios archivos de paralela a **secuencial** en el
   frontend, para que dos subidas al mismo producto nunca lean el mismo máximo al mismo tiempo.

**Verificado con Playwright contra producción real**: creado un producto de prueba, imagen principal subida
por dropzone (auto-upload confirmado), 3 imágenes adicionales elegidas de una sola vez → las 3 terminaron
subidas y confirmadas en la base (antes del fix, la 2ª y 3ª tiraban 409). Producto y las 4 imágenes de
ImageKit borrados al terminar. `npm test`: 75/75 (2 tests nuevos que fijan el cálculo dinámico de `orden`,
más el ajuste de un test existente al nuevo shape de parámetros del INSERT). `npx eslint .`: 0 errores.

**Lección de esta verificación**: un primer intento de probar esto localmente falló por timing — `initAdmin()`
tarda varios segundos en terminar contra producción (la consulta de productos es lenta), y estaba
interactuando con la dropzone antes de que sus listeners se conectaran. No era un bug del código.

## Fix: el precio "bajaba" según el nombre o si el producto tenía oferta (2026-07-27)

El usuario mandó una captura de "Todos los productos" donde el precio de cada tarjeta aparecía a una altura
distinta según la fila: unas tarjetas con el precio pegado arriba, otras más abajo, sin una línea recta.

**Causa**: `.product-name` ya reservaba altura fija para 2 líneas (`min-height`), pero **el precio no** —
cuando un producto tiene oferta se agregan dos elementos (precio tachado + precio vigente) en vez de uno
solo, y esa línea extra empujaba el precio vigente hacia abajo respecto a una tarjeta sin oferta. En las
tarjetas del carrusel superior (`.hp-name`/`.hp-price`) pasaba lo mismo, y encima el nombre ahí ni siquiera
tenía la reserva de 2 líneas que sí tenía `.product-name`.

- [x] **`public/js/render.js`**: los precios (en `createProductCard()` y `renderHighlightTrack()`) ahora se
      envuelven en un `<div class="product-price-wrap">` / `<div class="hp-price-wrap">`, tenga o no oferta
      el producto.
- [x] **`public/styles.css`**: esos wrappers son `flex column` con `justify-content: flex-end` y un
      `min-height` que alcanza para las 2 líneas (tachado + vigente) — así el precio vigente (último hijo)
      siempre queda pegado abajo del bloque, en la misma posición tenga o no tachado arriba. `.hp-name` suma
      el `min-height: 2.6em` que le faltaba (mismo que `.product-name`) para que el nombre tampoco corra el
      precio según ocupe 1 o 2 líneas.

**Verificado con Playwright contra producción real**: captura de "Todos los productos" con la misma mezcla
de productos con/sin oferta y nombres cortos/largos que mandó el usuario — los precios y los botones "Ver
detalle" quedan alineados en una línea recta en las 2 filas visibles, sin errores de consola. `npm test`:
75/75 (sin cambios de backend en este fix). `npx eslint .`: 0 errores.

## Galería unificada de imágenes en el admin (2026-08-01)

El usuario reportó que no podía subir más de una imagen a la vez. No era un bug: la subida múltiple existía
solo en "imágenes adicionales", y él estaba probando en "imagen principal" (que es una sola por definición).
Pero al explicarlo quedó claro que la separación entre "principal" y "adicionales" era artificial, así que
pidió unificarlas: **un solo lugar donde arrastrar varias imágenes y reordenarlas, y que la primera sea la
principal**.

**Modelo de datos: no cambia.** La principal sigue en `productos.image` y el resto en `producto_imagenes`
(es lo que consumen el catálogo, el carrusel y el modal). Lo que cambia es que el admin ahora las presenta
como **una sola lista ordenada** y traduce esa lista al modelo de siempre al guardar. Se evitó a propósito
migrar todo a `producto_imagenes` con un flag "es principal": hubiera obligado a tocar todas las vistas
públicas y sus queries, con mucho más riesgo, para el mismo resultado visible.

- [x] **`routes/products.js`**: nuevo `PUT /:id/images/reorder` — recibe `{ images: [{url, fileId}, ...] }`
      en el orden final; el primero pasa a `productos.image` y el resto reemplaza la galería. Corre en una
      transacción y **reconstruye la galería entera** (DELETE + INSERT) en vez de actualizar `orden` fila por
      fila, porque hacerlo de a una choca contra la restricción `UNIQUE (producto_id, orden)` de las filas que
      todavía no se movieron. Además borra de ImageKit los archivos que dejaron de estar en la lista, para no
      dejarlos huérfanos consumiendo cuota (fuera de la transacción, best-effort, igual que el borrado
      individual). `POST /:id/images/url` acepta ahora un `imagekit_file_id` opcional, para cuando esa "URL"
      es en realidad un archivo que el propio admin ya subió.
- [x] **`public/admin/images.js`** (reescrito): una sola lista `galleryImages` con estado por imagen
      (`uploading` / `ready` / `error`). Dropzone con selección múltiple, subida automática y secuencial, y
      **reordenar arrastrando las miniaturas** (drag & drop nativo). La primera muestra el badge "Principal".
      Editando un producto existente cada cambio se persiste solo; creando uno nuevo se guarda al enviar el
      formulario (recién ahí hay un `id` al que asociar la galería).
- [x] **`public/admin.html` / `admin.css` / `admin/products.js`**: se reemplazaron los dos bloques separados
      por la galería única. El campo de URL suelto y el `image-preview` dejaron de existir; el submit toma la
      principal de `getGalleryMainImage()`.
- [x] **6 tests nuevos** en `test/products-images.test.js` (auth, validación, promover una imagen de la
      galería a principal, orden secuencial, limpieza de huérfanos en ImageKit, rollback + 404).

**Bug encontrado al verificar en vivo (no lo agarraron los tests):** después de una subida exitosa las
miniaturas quedaban rotas. `renderGallery()` prioriza `previewUrl` (la preview local) sobre `url` (la real),
y el código liberaba el blob con `URL.revokeObjectURL()` pero **no limpiaba `previewUrl`** — así que la
miniatura seguía apuntando a un blob ya revocado (`ERR_FILE_NOT_FOUND` en consola). Corregido: en éxito se
libera *y* se limpia; en error se conserva la preview (es lo único que muestra qué archivo falló) y se
libera al quitarla o cerrar el formulario.

**Verificado end-to-end contra la base real**: se creó un producto subiendo 2 imágenes de una sola vez, se
confirmó que quedó la primera como principal y la segunda en la galería, se reordenó arrastrando y se
verificó **contra la base** que el nuevo principal quedó persistido, y se borró todo (producto + archivos en
ImageKit) al terminar. `npm test`: 79/79. `npx eslint .`: 0 errores. Cero errores de consola.

## Fix: el carrusel del hero no mostraba el precio de oferta (2026-08-01)

El usuario reportó que en el carrusel de arriba los precios "no concordaban" con los de abajo. Confirmado
consultando la API de producción: `GET /api/products/destacados` **sí** devolvía `en_oferta`/`precio_oferta`
correctamente (3 destacados en oferta: 40.000→35.000, 450.000→400.000, 30.000→20.000), pero `carousel.js`
renderizaba siempre `product.price`, ignorando la oferta. Bug puramente de frontend.

**Causa de fondo: la misma lógica estaba duplicada en 4 lugares.** Ya había pasado antes con el modal
(documentado más arriba); el carrusel simplemente quedó afuera cuando se corrigieron los demás.

- [x] **`public/js/state.js`**: nuevo `getPriceInfo(product)` — devuelve `{hasOferta, effectivePrice,
      oldPrice}`. Es el único lugar donde se decide qué precio corresponde mostrar.
- [x] **`carousel.js`, `modal.js`, `render.js`** (tarjetas y destacados): los 4 puntos pasan a usarlo. Cada
      vista mantiene su propio HTML/CSS, pero ninguna vuelve a decidir por su cuenta. El carrusel ahora
      muestra el precio anterior tachado como el resto del sitio, y su mensaje de WhatsApp usa el precio con
      descuento (antes mandaba el precio sin oferta).

**Verificado** recorriendo las 7 slides del carrusel y comparando contra lo que devuelve la API: las 3 en
oferta muestran tachado + precio nuevo, las otras 4 solo su precio. Sin errores de consola.

## Fix: las imágenes del hero se rompían al maximizar la ventana (2026-08-01)

El usuario mandó una captura del hero con la imagen enormemente ampliada y borrosa, mostrando solo una
franja del medio del envase.

**Causa, con números**: `.carousel-bg` usaba la foto del producto como `background-size: cover` en un hero
de ancho completo × 480px. La foto de esa captura mide **272×475 px**. En una ventana de 1920px, `cover` la
escala **7,06x** para cubrir el ancho → pixelado severo, y como queda 3354px de alto contra un contenedor de
480px, solo se ve el **14%** de la imagen. El problema es estructural: las fotos de producto son verticales,
chicas y con fondo blanco; no son fotos editoriales panorámicas.

Se le ofrecieron 3 opciones (dividido / fondo borroso + imagen nítida / bajar el alto sin recortar) y eligió
el **layout dividido**.

- [x] **`carousel.js` / `styles.css`**: cada slide pasa de "foto de fondo + texto encima" a dos paneles —
      texto sobre el color de marca a la izquierda, imagen `object-fit: contain` en su propio panel claro a
      la derecha. La imagen nunca se recorta ni se amplía más allá de su tamaño real. Se quitaron
      `.carousel-bg` y `.carousel-overlay` (ya no hay foto de fondo que oscurecer) y el `text-shadow` del
      título, que sobre un panel liso solo ensuciaba. El zoom sutil de entrada (Ken Burns) se movió del fondo
      a la imagen.
- [x] **Mobile**: en pantallas angostas los paneles se apilan, con el texto arriba para que nombre, precio y
      botones entren sin scrollear, y el hero se hizo más alto (420px) para que ambos respiren.
- [x] Se corrigió de paso que el badge de categoría se estiraba a todo el ancho del panel (le faltaba
      `align-self: flex-start` dentro del flex column).

**Verificado midiendo el escalado real de la imagen en el navegador**, con el mismo producto de la captura
del usuario: pasó de **7,06x de ampliación** a **0,87x** (se reduce en vez de ampliarse — siempre nítida) en
una ventana de 1920px, y a 0,32x en mobile. Capturas en 1920px y 390px sin errores de consola.

## Auditoría de seguridad completa (2026-08-01)

Pedida por el usuario tras hacer el repositorio **público**. Se revisó: historial de git, archivos sin
trackear, dependencias, autenticación/autorización, inyección SQL, XSS, y configuración de producción en
vivo. Resultado: **el proyecto no está comprometido**; se encontraron y corrigieron 2 problemas reales y 1
riesgo latente.

**Lo que se verificó y está correcto:**
- **Historial de git (53 commits)**: ningún `.env` fue commiteado nunca, y no aparece ninguno de los secretos
  reales de la sesión (contraseñas, connection strings de Neon, claves de ImageKit, API keys de clientes).
- **Archivos trackeados**: sin credenciales en duro. Ningún connection string real.
- **Dependencias**: Panel Central 0 vulnerabilidades. El catálogo reporta 2 moderadas en `uuid` (transitiva
  de `imagekit`), pero **no son alcanzables**: el aviso aplica a `v3/v5/v6` cuando se pasa un buffer, e
  ImageKit solo llama `uuid.v4()` sin buffer. Corregirlo exigiría bajar a `imagekit@1.5.0` (cambio
  disruptivo), peor remedio que la enfermedad. Revisar cuando ImageKit actualice su dependencia.
- **Autorización**: en el catálogo todas las escrituras exigen JWT; solo son públicas las lecturas y el
  registro de métricas (con rate limit). En el Panel Central, `/api/clientes/*` está protegido globalmente
  y **la `api_key` no se expone en el listado**, solo al abrir un cliente puntual.
- **Inyección SQL**: no hay interpolación de `req.query/body/params` en SQL. El único lugar que concatena
  (`metrics.js`) usa strings literales fijos elegidos por `switch` sobre un valor ya pasado por whitelist
  (`sanitizePeriod`), y el `ORDER BY` sale de un mapa fijo (`ORDER_MAP` + `sanitizeOrder`).
- **Producción en vivo**: CSP, HSTS (1 año, includeSubDomains), `nosniff`, `X-Frame-Options`,
  `Referrer-Policy`, y sin `x-powered-by`. Todos los endpoints protegidos responden 401 sin credenciales.
  No hay archivos sensibles servidos (`.env`, `.git/config`, `db.js` → 404).
- **Login**: bcrypt + rate limit de 10 intentos / 15 min en ambos servicios. Sin secreto JWT por defecto en
  el código (eso hubiera sido crítico).

### Corregido: XSS almacenado vía el campo `whatsapp`

El valor de `productos.whatsapp` se interpolaba **crudo** dentro del `href` del botón "Consultar"
(`carousel.js` y `modal.js`), y la validación del backend solo exigía "string de 5+ caracteres". Un valor
como `5959" onmouseover="alert(1)` cerraba el atributo antes de tiempo e inyectaba un manejador de eventos
ejecutable en el catálogo público. Requiere acceso de admin para inyectarlo, pero también un admin
distraído podía romper su propia página con una comilla suelta.

- [x] **`middleware/validate.js`**: `whatsapp` ahora exige solo dígitos con `+` opcional
      (`/^\+?[0-9]{4,20}$/`). Se verificó primero contra producción que los valores existentes (`0000`,
      `00000`) siguen siendo válidos, para no romper datos ya cargados.
- [x] **`carousel.js` / `modal.js`**: el `href` pasa por `escapeAttr()` (defensa en profundidad: no depende
      solo de la validación) y se agregó `rel="noopener"` a los enlaces con `target="_blank"`.
- [x] **Test de regresión** en `test/validate.test.js` con 4 payloads maliciosos y 3 números legítimos.

### Corregido: `JWT_SECRET` no se validaba al arrancar en producción

La comprobación de variables obligatorias vivía **solo en la rama de desarrollo local** (la que usa
`DB_HOST`/`DB_PORT`/...). Un deploy de producción, que usa `DATABASE_URL`, podía arrancar sin `JWT_SECRET`
y recién fallar al intentar loguearse. No es un bypass de autenticación (sin secreto, `jwt.sign` lanza y no
emite tokens: falla cerrado, no abierto), pero con el modelo "1 deploy por cliente" olvidarlo en un cliente
nuevo es un error realista que conviene que explote en el arranque y no en el primer login.

- [x] `server.js` y `panel-central/server.js`: `JWT_SECRET` se valida siempre, antes de cualquier otra cosa.
      Verificado que el proceso sale con código 1 y mensaje claro si falta.

### Corregido: backup de base de datos a un `git add .` de filtrarse

`backups-panel-central/*.sql.gz` **no estaba en `.gitignore`**. Ese dump contiene la tabla `clientes` con
la columna `api_key` (las claves en texto plano con las que cada catálogo se autentica) y los hashes de
contraseña del super-admin. No estaba filtrado (nunca se trackeó), pero un `git add .` lo hubiera subido a
un repositorio público.

- [x] `.gitignore`: se agregaron `backups*/`, `*.sql.gz`, `*.dump`, `*.sql.bak`, `scratch-*.js` e `Images/`.
      Verificado con `git check-ignore` que el backup y el script de reseteo de contraseña ya están
      protegidos.

### Pendientes (no bloqueantes, decisiones del usuario)

- **Rotar credenciales**: varias credenciales reales (Postgres local, connection string de Neon, claves de
  ImageKit, contraseñas de admin) se compartieron por chat durante el desarrollo. No están en el repo ni
  filtradas públicamente, pero conviene rotarlas al pasar a operación real con clientes que paguen.
- **JWT en `localStorage`**: sigue siendo la decisión tomada al inicio (migrar a cookie httpOnly quedó
  pospuesto explícitamente). Con el XSS de arriba corregido el riesgo baja, pero sigue siendo la mejora
  pendiente más relevante de autenticación.
- **Rate limiting en el Panel Central**: solo el login lo tiene; `/api/clientes/*` y `/api/licencia` no.
  Están protegidos por JWT y API key respectivamente, así que el riesgo es bajo.

### Pendiente (elegido, no implementado): mosaico de categorías

El usuario mostró la home de Nissei (mosaico de banners) y preguntó si se podía algo así. Se le explicó que
lo que hace que ese diseño funcione **no es el layout sino las imágenes**: son banners diseñados
(horizontales, alta resolución, con el texto incrustado), no fotos de producto. Con las fotos actuales el
mosaico volvería a romperse igual que el hero.

Eligió la opción **"mosaico de categorías"**: recuadros generados automáticamente a partir de los datos ya
cargados (una categoría por recuadro, con su color de marca y una foto representativa contenida), que
linkean a esa categoría filtrada. No requiere diseñar nada y le sirve igual a cualquier cliente al que se le
venda el catálogo. **Queda pendiente de implementar.** Punto de partida ya relevado: haría falta un endpoint
tipo `GET /api/categories/resumen` que devuelva por categoría su cantidad de productos y una imagen
representativa (hoy `GET /api/categories` solo devuelve `{categoria: [subcategorías]}` y lo consumen 3
lugares, así que conviene no cambiarle la forma).

*Actualización (2026-08-02): se llegó a implementar, verificar y desplegar (commit `22ce9ff`), pero el
usuario pidió revertirlo (`git revert`, commit `08927c0`) a favor de mejoras más simples y puntuales sobre
el carrusel existente — ver la sección siguiente. El código y el endpoint quedaron completamente removidos;
si se retoma en el futuro, la implementación revertida sirve de referencia en el historial de git.*

### Refinamientos del carrusel del hero (2026-08-02)

Tres ajustes puntuales sobre el layout dividido texto|imagen (ver más arriba), a partir de una captura del
usuario donde se veían dos problemas concretos y pidió además rellenar el espacio vacío del panel al
maximizar la ventana:

1. **Los puntos de navegación se perdían contra el fondo blanco.** Están centrados horizontalmente sobre
   todo el hero (`left: 50%`), así que en el layout dividido caen justo sobre el borde entre el panel oscuro
   y el panel blanco — la mitad de cada punto quedaba invisible según el ancho de ventana. Fix: una píldora
   semitransparente (`rgba(0,0,0,0.45)` + `backdrop-filter: blur`) detrás de los puntos, así tienen contraste
   sin importar qué color haya debajo. No se tocó su posición.

2. **Línea recta y agresiva entre el panel negro y el blanco.** Se agregó un degradé (`.carousel-media::before`,
   pseudo-elemento con `linear-gradient` de negro semitransparente a transparente) pegado al borde de
   `.carousel-media` que linda con el panel oscuro. Se ancló a `.carousel-media` (no a `.carousel-split`) a
   propósito: ese es siempre "el borde que toca el panel oscuro", sea el izquierdo en escritorio (columnas
   lado a lado) o el de arriba en mobile (paneles apilados) — el media query de 640px solo rota la dirección
   del degradé (`to right` → `to bottom`), sin duplicar lógica de posicionamiento.

3. **Características del producto debajo del precio, solo en escritorio.** Rellena el espacio libre del
   panel al maximizar la ventana (antes quedaba vacío entre el precio y los botones). Se arma con datos que
   ya existían en el producto, sin agregar ningún campo nuevo: marca y subcategoría como chips cortos con
   ícono (si están cargados), disponibilidad (`en_stock`), y la descripción recortada a ~140 caracteres si
   tiene. Oculto explícitamente en el media query mobile (`display:none` en `.carousel-features`): ahí el
   panel ya está justo de alto con título + precio + botones, y agregar más texto lo hubiera apretado.

Verificado con Playwright a 1920px de ancho (el caso que reportó el problema) y en mobile (390px): los
puntos miden con fondo opaco (`rgba(0,0,0,0.45)`) incluso cuando caen sobre el panel blanco, las
características aparecen en escritorio y se confirmó que están ocultas en mobile, y no hay errores de
consola en ningún caso.

## Reducir la superficie de ataque del admin (2026-08-06)

El usuario preguntó cómo hacer que el panel de administración sea menos atractivo para ataques. Al revisar
el estado real, el panel **estaba siendo anunciado activamente**, en tres frentes a la vez:

1. Un link visible `⚙ Administración` en el pie de página del catálogo público, que lo mostraba a cualquier
   visitante.
2. `robots.txt` con `Allow: /`, es decir, invitando explícitamente a Google y a cualquier bot a indexarlo.
3. `admin.html` sin ninguna etiqueta `robots`, así que nada impedía que apareciera en resultados de búsqueda.

Corregido:
- [x] **`public/index.html`**: se quitó el link del pie. El dueño entra escribiendo la URL o con un favorito;
      el link no aportaba nada y lo exponía a todos.
- [x] **`public/admin.html`**: `<meta name="robots" content="noindex, nofollow, noarchive">`.
- [x] **`server.js`**: `robots.txt` ahora emite `Disallow: /admin.html` (el catálogo sí se sigue indexando,
      que es el objetivo del producto), y la ruta `/admin.html` responde además con la cabecera
      `X-Robots-Tag: noindex, nofollow, noarchive` — defensa en profundidad, porque la cabecera la respetan
      también los bots que no llegan a parsear el HTML.
- [x] **`public/styles.css`**: `.footer-bottom` pasó de `justify-content: space-between` a `center`. Ese
      reparto tenía sentido con dos elementos (copyright + link al admin); al quedar uno solo, el texto se
      veía descolgado a la izquierda.

**Error cometido y corregido durante la implementación**: la primera versión dejaba un comentario HTML
explicando *por qué* se había quitado el link — y ese comentario nombraba la ruta `/admin.html`. Los
comentarios HTML se sirven al navegador, así que le estaba indicando al atacante exactamente lo que se
intentaba ocultar. Se quitó el comentario del HTML (la explicación vive acá, en AUDITORIA.md, que no se
sirve). Verificado después: **cero menciones a "admin" en el HTML público**.

Verificado con Playwright: el pie se sigue viendo bien (centrado, sin hueco), el admin sigue funcionando
entrando directo por `/admin.html` (login + panel + 10 productos listados), y no hay errores de consola.

### Nota honesta sobre el alcance de esta medida

Esto **no es seguridad real, es reducción de ruido**: baja mucho el tráfico de bots que escanean rutas
comunes, pero no detiene a alguien que ataque a propósito (la URL sigue siendo `/admin.html`). Lo que
realmente protege el panel es lo que ya existe —bcrypt, JWT, y el rate limit de 10 intentos cada 15
minutos— más las dos mejoras que quedan pendientes y que sí mueven la aguja:

- **Token en cookie httpOnly** en vez de `localStorage` (pendiente de larga data): hoy un XSS podría robar
  la sesión.
- **Login con Google (OAuth)**: elimina la contraseña por completo (nada que adivinar por fuerza bruta) y
  hereda el 2FA de la cuenta de Google. En el modelo "1 deploy por cliente" se resuelve con una sola app de
  Google para todos los deploys + una variable por deploy con el correo autorizado.

Se le presentaron ambas al usuario; eligió por ahora solo ocultar el panel.

## Sesión del admin en cookie httpOnly, en vez de localStorage (2026-08-06)

Era el pendiente de seguridad más viejo del proyecto (venía postergado explícitamente desde el inicio). El
token JWT del panel se guardaba en `localStorage`, que **cualquier JavaScript de la página puede leer**: un
XSS bastaba para robar la sesión del administrador sin conocer su contraseña. El XSS del campo `whatsapp`
que se corrigió el 2026-08-01 era explotable exactamente por esta vía.

Ahora el token viaja en una cookie `httpOnly`: el navegador la adjunta sola en cada request al mismo origen,
pero el JavaScript no la puede leer.

**Archivos nuevos**
- **`authCookie.js`**: fuente única de verdad del nombre y las opciones de la cookie. Existe a propósito para
  que los tres lugares que la tocan (login la setea, logout la borra, el middleware la lee) no se
  desincronicen: si por ejemplo el `path` difiere entre el login y el logout, el navegador las trata como
  cookies distintas y el "cerrar sesión" deja de funcionar — un bug silencioso y molesto de rastrear.
  Atributos: `httpOnly: true`, `secure` solo en producción (en `http://localhost` el navegador descartaría
  una cookie `Secure` y el login "no haría nada"), `sameSite: 'strict'` y `path: '/'`.

**Backend**
- **`middleware/auth.js`**: lee el token de la cookie y, si no está, cae al header `Authorization`. Mantener
  el header no debilita nada —para usarlo hay que tener ya un token válido— y deja funcionando a los tests y
  a cualquier cliente que no sea un navegador. La cookie tiene prioridad, con un test que lo fija.
- **`routes/auth.js`**: el login setea la cookie y **ya no devuelve el token en el cuerpo** (si lo devolviera,
  el JS del panel volvería a tenerlo a mano y el cambio no serviría de nada). Se agregó `POST /api/auth/logout`,
  que antes no existía: con la cookie httpOnly el frontend ya no puede borrarla por su cuenta, así que cerrar
  sesión pasó a ser responsabilidad del servidor.
- **`server.js`**: se agregó `cookie-parser` (Express no parsea cookies solo).

**CSRF**: al viajar la cookie automáticamente en cada request, un sitio malicioso podría disparar acciones en
el panel desde el navegador del dueño. Lo cubre `SameSite=Strict`, que le dice al navegador que no adjunte la
cookie en requests originados en otro sitio. Es la contrapartida obligatoria de este cambio, no un extra.

**Frontend** (`public/storage.js`, `public/admin/auth.js`, `images.js`, `init.js`, `metrics.js`,
`recepcion.js`): se eliminaron todos los `localStorage.getItem/setItem('admin_token')` y todos los headers
`Authorization` armados a mano. `authHeaders()` se mantuvo (aunque ya solo aporta el `Content-Type`) para no
tocar los ~10 lugares que la llaman y conservar un único punto donde cambiar headers comunes. En la subida de
imágenes se quitó el header por completo: el `Content-Type` del `multipart/form-data` lo tiene que poner el
navegador, porque necesita agregarle el *boundary*.

**Nota**: `public/admin.js` (un monolito de ~1300 líneas) todavía tiene el patrón viejo, pero **es código
muerto**: `admin.html` carga los módulos de `public/admin/*.js` y no lo referencia. Se dejó sin tocar a
propósito; conviene borrarlo en algún momento, pero no como parte de este cambio.

**Verificación**
- 87/87 tests (7 nuevos): que el login setea la cookie con `httpOnly`+`SameSite=Strict`+`path`, que **el token
  no viaja en el cuerpo**, que la cookie sola alcanza para autenticarse, que el logout la borra repitiendo los
  mismos atributos, que la cookie tiene prioridad sobre el header, y que el middleware no explota si se lo
  monta sin `cookie-parser`.
- End-to-end con Playwright, 16/16, incluida **la prueba que da sentido a todo el cambio**: estando logueado,
  `document.cookie` devuelve `""` y `localStorage` está vacío — es decir, el código que ejecutaría un XSS ya
  no encuentra nada que robar. Además: la sesión sobrevive a recargar, el logout borra la cookie del navegador
  y el servidor pasa a responder 401.
- Se verificó aparte que **el catálogo público sigue intacto** (comparte `storage.js` con el admin): carrusel,
  promociones, destacados, grilla, modal, buscador y cero errores de consola.
- Se confirmó que `NODE_ENV=production` está configurado en Render, así que en producción la cookie sale con
  `Secure` (solo viaja por HTTPS).

**Pendiente relacionado**: el Panel Central (`panel-central/`) sigue usando `localStorage` con el mismo patrón
y la misma exposición. El cambio equivalente ahí es prácticamente idéntico.

*Resuelto el mismo día — ver la sección siguiente.*

## Panel Central a cookie httpOnly, y limpieza de código muerto (2026-08-06)

### Panel Central

Se aplicó el mismo cambio que en el catálogo, y acá la exposición era **más grave**: desde este panel se
administran todos los clientes, sus `api_key` y sus pagos, así que robar esa sesión da acceso a todo el
negocio, no a un solo catálogo.

- **`panel-central/authCookie.js`** (nuevo): espejo del módulo del catálogo. Son dos apps separadas, con su
  propio deploy y su propio `JWT_SECRET`, así que no comparten código; el único cambio real es el nombre de
  la cookie (`panel_token`), para que si algún día se sirven desde el mismo dominio no se pisen.
- **`middleware/auth.js`**: lee la cookie, con el header `Authorization` como alternativa para clientes que
  no son navegador.
- **`routes/auth.js`**: el login setea la cookie y ya no devuelve el token; nuevo `POST /api/auth/logout`.
- **`server.js`**: se agregó `cookie-parser`.
- **`public/app.js`**: se eliminaron `getToken()` y todos los `localStorage`. `authHeaders()` quedó
  devolviendo `{}` para no tocar los ~10 lugares que la llaman (varios hacen
  `Object.assign({'Content-Type': ...}, authHeaders())`, que sigue funcionando igual).

Verificado: 24/24 tests (3 nuevos, mismos casos que el catálogo) y 13/13 end-to-end con Playwright, incluida
la prueba clave (`document.cookie` y `localStorage` vacíos estando logueado), que la sesión sobrevive a
recargar, que `GET /api/clientes` responde autenticado y que tras el logout el servidor devuelve 401.

### Código muerto eliminado

El entorno bloqueaba el borrado de archivos durante buena parte del desarrollo (`rm` fallaba con *Permission
denied*), así que varios archivos quedaron vaciados o con un comentario "esto ya no se usa" en vez de
borrados — incluido un `rm` que quedó anotado más arriba en este documento y nunca se pudo ejecutar. La
restricción ya no aplica, así que se eliminaron de verdad:

| Archivo | Estado |
|---|---|
| `public/admin.js` | 1559 líneas. Monolito reemplazado por los módulos de `public/admin/*.js`. **Se servía públicamente** (HTTP 200) aunque ningún HTML lo cargaba. |
| `public/products.js` | Datos hardcodeados de antes de la API; ya era solo un comentario. |
| `public/js/theme.js` | Archivo vacío. |
| `test/license.test.js` | Stub obsoleto; las pruebas reales están en `test/licenseCheck.test.js`. |
| `license.js` | Duplicado huérfano de `licenseCheck.js` (se renombró porque en filesystems *case-insensitive* `require('../license')` resolvía al archivo `LICENSE` de texto plano). |
| `cloudinary.js` | Reemplazado por `imagekit.js`. |

Antes de borrar se verificó archivo por archivo que ningún `<script src>` los cargara y que ningún
`require()` los referenciara — las coincidencias de un grep ingenuo eran engañosas (`admin/products.js` es
un módulo vivo, y las menciones a `license.js` eran comentarios explicando justamente el renombre).

También se limpiaron los ~52 scripts `_tmp-*.js` de depuración acumulados (estaban gitignorados) y se
actualizó el árbol de archivos del `README.md`, que además de listar los archivos borrados no incluía
`public/admin/`, `authCookie.js`, `branding.js`, `imagekit.js` ni `licenseCheck.js`.

Verificado después del borrado: 111/111 tests (87 catálogo + 24 Panel Central), y en el navegador que el
catálogo y el admin siguen funcionando y que los archivos eliminados ahora devuelven **404**.

## Preparación para migrar a Vercel (2026-08-06)

El usuario decidió pasar de Render a Vercel. El disparador fue el arranque en frío de 21 segundos del plan
gratuito de Render, pero el motivo de fondo es económico: Render cobra **USD 7 por servicio** y el proyecto
usa el modelo "un deploy por cliente", así que el costo crece linealmente; Vercel Pro son **USD 20/mes con
proyectos ilimitados**, lo que hace que el costo marginal por cliente tienda a cero y permite vender más
barato. El dato que definió el momento: **todavía no hay ningún cliente pagando**, así que migrar ahora no
tiene riesgo ni requiere coordinar downtime con nadie.

Se relevó qué rompería en serverless. Dos supuestos iniciales resultaron **falsos** al verificarlos contra la
documentación actual de Vercel, y conviene dejarlo escrito para no repetir el error: el límite de cuerpo de
request **ya no es 4,5 MB sino 100 MB** (las subidas de imágenes nunca estuvieron en riesgo), y **Fluid
Compute reutiliza instancias**, así que el pool de Postgres y el estado en memoria no se destruyen en cada
request como en el serverless clásico. De los cuatro problemas que se habían anticipado, quedaron tres, y
solo uno necesitaba código.

### 1. Chequeo de licencia: refresco perezoso en vez de `setInterval`

`licenseCheck.js` mantenía el estado con `setInterval` cada 6hs y un cache en memoria. En serverless no hay
proceso de larga duración, así que ese intervalo casi nunca se dispara. Como `branding.js` también lee de
`getLicense()`, el síntoma habría sido que **al cliente se le caen el logo, los colores y las pestañas
Premium de forma intermitente** — justo lo que sostiene el modelo de negocio.

Ahora `getLicense()` dispara el refresco por demanda cuando el cache venció, en segundo plano y sin
esperarlo. Se conservó la propiedad que ya tenía y no se podía perder: **nunca bloquea el request**. Un flag
evita la estampida (50 visitas con el cache vencido disparan un chequeo, no 50) y se mantuvo intacta la
degradación a Básico a las 48hs. Funciona igual en un servidor siempre encendido que en serverless, así que
**no ata el proyecto a ninguna plataforma** — decisión deliberada, porque ya se cambió de plataforma una vez
por economía.

**Regresión propia, detectada al verificar en producción** (y el mejor argumento para verificar cada cambio
donde realmente corre): con el chequeo fallando de forma persistente —Panel Central caído o
`CLIENTE_API_KEY` mal configurada, que es el estado actual de producción— `lastGood` nunca se llena, así que
el cache siempre está "vencido" y **cada request disparaba un intento nuevo**. Con tráfico real habría sido
una petición al Panel Central por cada visita al catálogo; el `setInterval` viejo no tenía ese problema
porque reintentaba cada 6hs. Se agregó una **espera mínima de 5 minutos entre intentos**, independiente de si
salieron bien, con un test que fija el caso: 100 visitas seguidas con el chequeo fallando disparan 1 sola
consulta.

También se eliminó una fuga de red en los tests: el caso de "degrada a básico" no mockeaba `fetch` y con el
refresco perezoso pasó a hacer una petición real (lenta, y falla sin conexión). Los tests ahora esperan el
refresco de forma determinística (`_pendingRefresh()`) en vez de dormir un rato arbitrario.

### 2. Rate limiting: sin código nuevo

Los 6 limitadores de `express-rate-limit` cuentan en la memoria del proceso, así que entre instancias el
límite de 10 intentos de login cada 15 minutos deja de ser confiable. La solución elegida es **el WAF de
Vercel** como capa principal (corre antes de la función, es consistente entre instancias y **el tráfico
bloqueado no se factura**), dejando los limitadores actuales tal cual como respaldo portable.

Se descartó un *store* de Postgres reutilizando Neon —que era la primera opción por no sumar
infraestructura— porque el paquete `@acpr/rate-limit-postgresql` **no se actualiza desde marzo de 2024** y
`express-rate-limit` ya va por la v8: demasiado riesgo de incompatibilidad en una pieza de seguridad.
También se descartó Redis (Upstash): está bien mantenido, pero suma un servicio que administrar, pagar y que
puede caerse, para un beneficio marginal a la escala actual.

### 3. Pool de Postgres: cero código

`db.js` ya lee `max: Number(process.env.DB_POOL_MAX) || 10`. Alcanza con usar la cadena de conexión
*pooled* de Neon y poner `DB_POOL_MAX=3` en las variables de entorno.

### El Panel Central no necesitó ningún cambio de lógica

Se verificó aparte, por ser donde se controlan los planes y los clientes que pagan: **no tiene ningún
`setInterval`** ni estado en memoria, y **no tiene trabajo en segundo plano posterior a la respuesta**. Se
sospechaba que `maybeSyncLavadero360()` fuera *fire and forget* —lo cual en serverless se corta cuando la
función se suspende, y habría requerido `waitUntil()`— pero `routes/clientes.js` hace `await` **antes** de
responder, así que el trabajo termina dentro del ciclo del request. Nada que corregir.

### Compatibilidad con ambos entornos

- **`server.js` y `panel-central/server.js`**: `app.listen()` quedó dentro de `if (require.main === module)` y
  ambos exportan la app. Así, ejecutar `node server.js` (desarrollo local y Render) abre el puerto igual que
  siempre, y un hosting serverless puede importar la app como handler sin abrir un puerto que nadie usa.
- **`vercel.json`** (raíz): declara el Cron que pega cada 6hs a `/api/internal/refresh-license`. El Panel
  Central **no lleva `vercel.json`**: no tiene cron y Express corre sin configuración, así que un archivo
  vacío solo sería ruido (el subdirectorio se configura en los ajustes del proyecto, no en un archivo).
- **`GET /api/internal/refresh-license`** (nuevo, en `server.js`): lo llama el Cron. Es un **refuerzo, no un
  requisito** — el refresco perezoso funciona igual si el cron no corre. No usa `authenticateToken` porque no
  lo invoca un humano con sesión sino la plataforma; se protege con `CRON_SECRET`, el patrón estándar de
  Vercel. **Si `CRON_SECRET` no está configurado, el endpoint devuelve 404**: un deploy sin cron no queda con
  una ruta abierta de más.

### Verificación

- **122/122 tests** (98 catálogo + 24 Panel Central), incluidos 13 del módulo de licencia y 3 del endpoint
  del cron. Los del módulo se corrieron 5 veces seguidas para descartar intermitencia, y con conteo de fugas
  de red en cero.
- Se confirmó que `node server.js` sigue arrancando normalmente en ambos proyectos tras el cambio de
  `require.main`.
- En el navegador: catálogo, admin (login, productos, plan) y Panel Central (login, clientes) funcionando, y
  el endpoint del cron devolviendo 404 sin `CRON_SECRET`.
- En producción (Render): 15 lecturas seguidas de `/api/plan` sin parpadeo, y el catálogo respondiendo normal.

### Pendiente

Los pasos que requieren la cuenta de Vercel (crear los proyectos, cargar variables, deploy de prueba, reglas
del WAF y el corte final) quedan para cuando el usuario habilite el acceso. **`BASE_URL` hay que corregirlo
al cargar las variables**: hoy apunta a un dominio viejo (`catalogo-backend.onrender.com`) y por eso el
`sitemap.xml` publica URLs muertas.

## Endurecimiento de seguridad: contraseñas, auditoría, roles y 2FA (2026-08-23)

A pedido del usuario, tras un repaso de qué medidas tenía el sistema y cuáles le faltaban. Se implementaron
las cinco que son código; las dos restantes (backups y rotación de credenciales) quedan anotadas al final
porque no dependen del repositorio.

### 1. Cambio de contraseña desde la aplicación

Era el hueco más molesto en la práctica: **no existía ningún endpoint**, así que cambiar una clave obligaba a
correr un script contra la base. Con clientes reales eso significa que cada "quiero cambiar mi contraseña"
—o peor, cada "creo que me la vieron"— dependía de que alguien la cambiara a mano.

`POST /api/auth/change-password` exige la contraseña actual **aunque la sesión ya esté abierta**: si alguien
se sienta frente a una sesión sin bloquear, no debería poder apropiarse de la cuenta.

### 2. Corte de sesiones al cambiar la contraseña

Cambiar la clave no servía de nada contra un token ya robado: el JWT seguía siendo válido hasta vencer (8hs).
Ahora `administradores.password_changed_at` marca el momento del cambio y `middleware/auth.js` **rechaza
cualquier token emitido antes**.

Cuesta una consulta por request autenticado, y se acepta a conciencia: solo la pagan las rutas del panel (el
catálogo público no pasa por ahí), es una búsqueda por clave primaria, y cachearla reintroduciría justo la
ventana que este control existe para cerrar. Ante un error de base **falla cerrado** (503): un control de
autenticación que deja pasar cuando falla no es un control.

### 3. Fortaleza de contraseña

`validarPassword()` en `middleware/validate.js`: mínimo 10 caracteres, rechaza claves comunes, que contengan
el nombre de usuario, o un mismo carácter repetido. Se priorizó **longitud por sobre reglas de composición**
siguiendo la guía del NIST: exigir "una mayúscula y un símbolo" empuja a claves tipo `Password1!`, fáciles
para una máquina y molestas para una persona.

### 4. Auditoría: quién hizo qué

El logger registraba método, URL y estado, pero no la identidad. Nueva tabla `auditoria` y módulo
`auditoria.js`. Se registra de dos formas:

- **Middleware automático** para toda escritura autenticada. Se hizo así, y no llamando a `registrar()` en
  cada ruta, porque son más de diez rutas de escritura y la próxima que se agregue quedaría sin auditar si
  dependiéramos de acordarse.
- **Llamadas explícitas** en `routes/auth.js` para los eventos de seguridad (login, login fallido, cambio de
  contraseña, 2FA), donde el detalle importa más que la uniformidad. Los **intentos fallidos también se
  registran**: una racha de ellos es la señal temprana de que alguien está probando contraseñas.

Principio de diseño: **auditar nunca puede romper la operación**. Si falla el INSERT, se loguea y se sigue.

### 5. Roles

Columna `rol` con dos valores: `admin` (todo) y `editor` (productos y stock, pero no cuentas ni métricas del
negocio). El rol se lee **siempre de la base, nunca del token**, para que bajarle permisos a alguien tenga
efecto en el próximo request y no cuando venza su sesión. Por defecto `admin`, para no cambiarle los permisos
a ninguna cuenta existente.

### 6. Segundo factor (TOTP)

Opcional a propósito: pedirle un código al dueño de un local cada vez que entra puede ser fricción de más.
`totp.js` envuelve a `otplib` (elegido sobre `speakeasy`, que no se actualiza desde 2022) para que el resto
del código no dependa de su API — la v13 cambió bastante respecto de la v12.

Dos decisiones que importan:
- **El 2FA no se activa al generar el QR**, sino al confirmar un código válido. Si se activara antes y el QR
  se escaneó mal, la cuenta quedaría inaccesible.
- **Desactivarlo exige la contraseña**, no solo la sesión: apagar el segundo factor es exactamente lo que
  intentaría alguien con una sesión robada.

### Un bug propio, encontrado por los tests

El registro de auditoría en el login usaba `Object.assign({}, req, { user })` para pasar el usuario. Eso
**no copia `headers`** de un request de Express, así que `ipDe()` explotaba y **el login entero devolvía 500
en vez de 401**. Se corrigió pasando el usuario como parámetro explícito en vez de clonar el request, y
`ipDe()` quedó defensivo ante headers ausentes. Los tests lo detectaron antes de que llegara a producción.

### Impacto en los tests existentes

Que `authenticateToken` pase a consultar la base rompió varios tests que probaban otra cosa detrás de una
ruta protegida: algunos fallaban con 503 y otros directamente **se colgaban** (intentaban conectar a una base
real). Se agregó el helper `test/helpers/authDb.js` (`mockConSesion`) que responde la consulta de sesión y
delega el resto, así ningún test necesita saber que la autenticación toca la base.

Un caso mereció cuidado: el test de `POST /upload-image` afirmaba "este endpoint no toca la base". Sigue
siendo cierto del endpoint, pero ahora la autenticación sí la consulta. En vez de borrar la afirmación se
la precisó: ahora cuenta solo las consultas que **no** son la de sesión.

### Verificación

- **144/144 tests** (120 catálogo + 24 Panel Central), con 13 nuevos de contraseña/TOTP y 17 del middleware
  (incluidos los de corte de sesión, cuenta borrada, fallo cerrado y roles).
- **22/22 end-to-end** contra un servidor real, con el ciclo completo: cambio de contraseña, que **la sesión
  anterior queda cerrada**, que la clave vieja deja de servir, que la auditoría registró quién hizo qué, y el
  alta y baja de 2FA generando códigos TOTP reales. La prueba restaura la contraseña original al terminar,
  pase lo que pase, y se verificó contra la base que quedó restaurada.
- Se confirmó que el catálogo público sigue intacto.

### Pendiente (no depende del repositorio)

- **Backups**: Neon en plan gratuito da solo 6hs de ventana para restaurar. Si alguien borra el catálogo y se
  detecta al día siguiente, no se recupera. Es el único riesgo irreversible de la lista.
- **Rotar credenciales**: varias se compartieron por chat durante el desarrollo. No están filtradas, pero
  conviene renovarlas antes de operar con clientes que paguen.
- **Regla de rate limiting en el WAF de Vercel**: el limitador en memoria funcionó en la verificación, pero
  solo porque los intentos cayeron en la misma instancia; no es confiable si el tráfico se reparte.

### Incidente: el 2FA tumbó producción (2026-08-23)

**Qué pasó.** El commit de seguridad se desplegó a Vercel y **el sitio entero devolvió 500**, no solo los
endpoints nuevos. Los logs de Vercel lo mostraron enseguida:

```
Error [ERR_REQUIRE_ESM]: require() of ES Module /var/task/node_modules/@scure/base/index.js
from /var/task/node_modules/@otplib/plugin-base32-scure/dist/index.cjs not supported
```

`otplib` (la librería de TOTP) arrastra un plugin que hace `require()` de un módulo **ESM**. Node 24 en local
lo tolera, pero el runtime de Vercel no. Y como el fallo ocurre **al cargar el módulo** —`server.js` requiere
`routes/auth.js`, que requiere `totp.js`, que requiere `otplib`— el proceso moría antes de atender un solo
request. De ahí que cayera todo el sitio y no únicamente el 2FA.

**Por qué no lo detectaron los tests ni la verificación local.** Todo se probó con Node 24 local, que sí
soporta `require()` de ESM. La diferencia estaba en el runtime, no en el código.

**Respuesta.** Primero restaurar el servicio: `vercel promote` del último despliegue sano (2hs antes),
confirmado con HTTP 200 en la home y en la API. Recién después, arreglar la causa.

**Arreglo.** Se eliminó la dependencia: `totp.js` ahora implementa TOTP (RFC 6238 sobre RFC 4226) con
`node:crypto`, que ya trae HMAC-SHA1. Son ~60 líneas y **no es criptografía casera**: es un algoritmo público
y corto que se apoya en primitivas estándar. Para que "no es casera" no sea una afirmación de fe, se verificó
de dos maneras independientes:

- **Los 4 vectores de prueba oficiales del RFC 6238** pasan exactamente.
- **Coincide con otplib** en 25/25 secretos aleatorios (y quedó un test permanente con 10).

`otplib` quedó como dependencia **solo de desarrollo**, justamente para poder seguir contrastando sin que
vuelva a producción. Se verificó que `qrcode` y todas sus dependencias son CommonJS, así que no repiten el
problema.

**Verificación específica del incidente**, además de los tests: se simuló el entorno de producción en un
directorio aparte con `npm ci --omit=dev`, y se confirmó que (a) ni `otplib` ni `@scure/base` se instalan, y
(b) `server.js` y `routes/auth.js` cargan sin `ERR_REQUIRE_ESM`. Esa simulación es justo el paso que faltó la
primera vez.

**Lección para el proyecto:** al agregar una dependencia nueva, probar la carga con solo las dependencias de
producción antes de desplegar. Una librería puede funcionar perfecto en local y romper el arranque en el
hosting.

### Bug: el panel perdía su marca en Vercel (plantillas dentro de public/)

Detectado por el usuario al notar que la pestaña del navegador del admin **no mostraba nombre ni favicon**.
Al revisar, el problema era mayor que lo cosmético: `/admin.html` servía el HTML **con los marcadores sin
reemplazar** (`__STORE_NAME__`, `__STORE_LOGO_URL__`) y **sin las variables CSS de color**, así que un cliente
con marca propia vería su panel con los colores por defecto. `/index.html` tenía el mismo problema (los 5
marcadores crudos); solo la ruta `/` funcionaba.

**Causa.** Las plantillas vivían en `public/`, la carpeta que Vercel publica como archivos estáticos. Los
headers lo confirmaron:

| Ruta | `X-Vercel-Cache` | Quién responde |
|---|---|---|
| `/` | `MISS` | La función (Express) → marcadores reemplazados |
| `/admin.html` | `HIT` | **El CDN** → HTML crudo, Express nunca se ejecuta |

En Render no pasaba porque ahí Express atiende todo; el CDN de Vercel gana sobre las rutas de Express cuando
existe un archivo con esa ruta exacta.

**Arreglo.** Se movieron `index.html` y `admin.html` a `views/`. Son **plantillas, no archivos estáticos**:
tenerlas en `public/` era el error de fondo, y este hosting simplemente lo puso en evidencia. `renderBrandedHtml()`
ahora lee de `views/` y el CDN ya no tiene nada que servir por esas rutas. Los assets reales (CSS, JS,
imágenes, favicon) siguen en `public/` y se sirven igual que antes.

Verificado en local sobre `/`, `/index.html` y `/admin.html`: cero marcadores crudos, título correcto,
favicon presente y color de marca aplicado en ambas páginas, más 12/12 en navegador incluyendo que el login
sigue funcionando y que los assets estáticos responden 200.

## Paridad de seguridad en el Panel Central (2026-08-24)

Salió de una auditoría de calidad pedida por el usuario. Al comparar ambas apps quedó a la vista un hueco que
no se había señalado: **las seis medidas de seguridad se habían implementado solo en el catálogo**. El Panel
Central —que es donde se ven y administran todos los clientes, sus `api_key` y sus pagos— tenía únicamente la
cookie httpOnly. Era la cuenta que más protección merece y la que menos tenía.

Se llevaron las seis: cambio de contraseña, corte de sesiones, fortaleza de clave, auditoría, roles y 2FA.
Archivos nuevos `panel-central/totp.js` y `panel-central/auditoria.js`, más los cambios en su `schema.sql`,
`middleware/auth.js`, `middleware/validate.js`, `routes/auth.js` y `server.js`.

**Sobre la duplicación**: los módulos son espejos de los del catálogo, y quedó anotado en cada archivo por
qué. Son dos apps con deploys, `package.json` y bases distintas, y el Panel Central se publica apuntando
**solo a su subdirectorio**, así que un `require()` a un archivo de afuera no llegaría al paquete desplegado.
Compartir código exigiría un paquete publicado o un monorepo, que es desproporcionado para dos apps chicas.
La contrapartida —tocar uno obliga a tocar el otro— está escrita en el encabezado de cada archivo.

### Bug encontrado al probar el ciclo completo: precisión de las fechas

Con todo implementado, el guion de punta a punta falló en cadena: tras cambiar la contraseña y volver a
entrar, **todo devolvía 403**. La causa estaba en el corte de sesiones, y **afectaba también al catálogo**:

- El `iat` de un JWT tiene precisión de **segundos** (se trunca hacia abajo).
- `password_changed_at` guarda **milisegundos**.

Comparando en milisegundos, un token emitido a las `10:00:00.900` se lee como `10:00:00.000`, que es
*anterior* a un cambio de contraseña hecho a las `10:00:00.750`. Resultado: quien cambiaba su clave y volvía
a entrar de inmediato quedaba afuera con "sesión cerrada" — **el camino normal, no un caso borde**.

Se corrigió comparando ambos lados en segundos, en las dos apps, con un test de regresión en cada una.

**Contrapartida asumida y documentada en el código**: queda una ventana de hasta 1 segundo en la que un token
emitido en ese mismo segundo sigue valiendo. Es aceptable porque el escenario que este control protege —una
sesión robada— usa un token de minutos u horas antes, no de la misma fracción de segundo en que la víctima
cambia la contraseña.

### Verificación

- **181 tests** (141 catálogo + 40 Panel Central), con 14 nuevos de seguridad del Panel y 1 de regresión por
  cada app para el bug de precisión.
- **18/18 end-to-end** contra el Panel Central corriendo: cambio de contraseña, corte de la sesión anterior,
  la clave vieja deja de servir, la auditoría registra quién hizo qué (28 entradas, con usuario e IP), la
  lista de clientes sigue accesible, y el alta y baja de 2FA con códigos TOTP reales.
- Al terminar se verificó contra la base que la contraseña, el rol y el estado de 2FA quedaron como estaban.

**Nota de método**: el guion de punta a punta se hizo **idempotente** (detecta si una corrida previa dejó la
contraseña temporal y se recupera solo). Las dos primeras corridas dejaron el estado sucio porque su limpieza
chocó con el propio rate limiter, y hubo que restaurar la contraseña a mano — un guion que muta estado tiene
que poder correr dos veces seguidas.

### Limpieza posterior a la auditoría de calidad

Los hallazgos menores de la auditoría, resueltos:

- **Código muerto eliminado**: `removeFromArray()` en `public/js/filters.js` (una función que nadie llamaba)
  e `isHomeVisible` en `public/js/render.js` (una variable que se calculaba y no se usaba). Se confirmó que
  ninguna tenía referencias en todo el proyecto antes de borrarlas.
- **`escapeAttr` deduplicada**: estaba definida por triplicado en `render.js`, `filters.js` y `modal.js`, los
  tres cargados en la misma página, así que la última en cargarse pisaba a las demás. Se verificó que eran
  **idénticas** —no había un bug de escapado— pero en una función de seguridad esa redundancia es una trampa:
  corregir una copia y no las otras dejaría el comportamiento dependiendo del orden de los `<script>`. Ahora
  vive sola en `state.js`, que se carga antes que el resto.
- **Convención de manejo de errores**: `/api/internal/refresh-license` era la única de 40 rutas async sin
  `try/catch`. No era un bug (Express 5 reenvía las promesas rechazadas al manejador de errores), pero rompía
  la convención del proyecto.
- **Tests del módulo de auditoría** (`test/auditoria.test.js`, 11 casos): faltaban pruebas unitarias de un
  módulo de seguridad recién agregado. Cubren que **nunca rompe la operación** si falla el INSERT, que
  extrae la IP real detrás de un proxy, que no registra lecturas ni escrituras anónimas, y que no duplica lo
  que `routes/auth.js` ya audita con más detalle.
- **Dependencias al día**: `express-rate-limit`, `helmet` y `pg` actualizados a su última versión menor.

Verificado con 10/10 en navegador que el catálogo, el modal y los filtros siguen funcionando tras mover la
función de escape, incluida una prueba de que escapa los 5 caracteres peligrosos desde su nueva ubicación.

**Estado final**: 192 tests (152 catálogo + 40 Panel Central), 0 errores de lint, y las 70 advertencias
restantes son todas falsos positivos del patrón de scripts clásicos con globales (funciones que ESLint no ve
usadas porque se llaman desde otro archivo).

## Importación masiva de productos (2026-08-24)

Contexto: el primer cliente real (un local de repuestos) entra esta semana. Va a cargar más de 150 productos,
y **estos locales llevan el stock en papel, no en computadora** — no hay ningún sistema del que exportar.
Cargar de a uno por el formulario son horas de trabajo, así que la lista se arma a mano en Excel y se sube.

Se agregó `importar.js` (lógica), tres endpoints en `routes/products.js` y la pantalla en el panel.

**El parser de CSV es propio, no una dependencia.** Son ~40 líneas para un formato estable desde 1978
(RFC 4180), y el proyecto ya pagó el costo de sumar una librería chica: `otplib` arrastró un módulo ESM que
tumbó producción entera. Maneja lo que realmente aparece en un archivo de Excel: comas dentro de campos
entrecomillados, comillas escapadas (`""`), saltos de línea dentro de un campo, el BOM de "CSV UTF-8" y el
punto y coma que usa Excel en español.

### Decisiones que salieron del contexto del cliente

- **El punto es separador de miles.** En Paraguay `12.500` son doce mil quinientos, no doce con cinco.
  Interpretarlo como decimal habría cargado todos los precios mil veces más baratos.
- **El WhatsApp se carga una vez en la pantalla, no por fila.** Es el mismo número para todo el local;
  pedirlo en cada fila sería hacérselo repetir 150 veces. La columna igual existe por si algún producto
  necesita otro número.
- **La imagen es opcional.** Quien carga 150 repuestos rara vez tiene las 150 fotos subidas de antemano. Se
  importa el catálogo completo y las fotos se agregan después.
- **Sin dato de stock, el producto queda DISPONIBLE.** Esto importa más de lo que parece: cuando `en_stock`
  es falso el catálogo muestra "Sin stock" **y deshabilita el botón de consultar**, así que el cliente final
  ni siquiera puede preguntar. Para un local que lleva el stock en papel, un valor mal cargado es una venta
  perdida. El default seguro es "disponible" y que la disponibilidad se resuelva en la conversación de
  WhatsApp, que es como estos locales ya trabajan.
- **Vista previa obligatoria antes de escribir.** El endpoint de preview no toca la base. Quien sube 150
  productos tiene que ver qué va a entrar y qué filas están mal *antes*, no después.
- **Reimportar no duplica.** Los nombres que ya existen se saltean y se informan, así corregir el archivo y
  volver a subirlo es seguro.
- **Todo o nada.** La inserción va en una transacción: un catálogo a medio cargar es peor que uno vacío,
  porque obliga a averiguar qué entró y qué no.
- **Los errores dicen fila y motivo**, para poder ir directo a corregir en Excel.

### Verificación

- **27 tests unitarios** del parser y la normalización, incluido el caso paraguayo de los miles y un intento
  de XSS por el campo WhatsApp (misma regla que el formulario, ver el incidente anterior en este documento).
- **16 end-to-end** contra el servidor con un CSV deliberadamente sucio: BOM, comas dentro de comillas,
  comillas escapadas, filas sin precio, sin nombre y duplicadas.
- **13 en navegador**: el flujo completo desde el panel, verificando que la vista previa no escribe nada,
  que señala la fila exacta con problema y que los precios con punto de miles se guardan bien.

## Fotos desde el celular (2026-08-31)

El primer cliente va a trabajar **mayormente desde el celular**: saca la foto del repuesto y la sube ahí
mismo. Al verificar ese flujo aparecieron dos problemas serios, ninguno visible hasta que se prueba con
tamaños reales.

### 1. Las fotos de celular no entraban

El límite de subida es 5 MB y una cámara de 12 MP genera archivos de 6 a 12 MB. Medido contra el servidor:

| Foto | Antes |
|---|---|
| 2 MB | entraba |
| 4 MB | entraba |
| 6 MB | **"Error interno del servidor"** |
| 9 MB | **"Error interno del servidor"** |

Peor que el fallo era el mensaje: un 500 genérico que no le dice a nadie que el problema es el peso.

**Arreglo: comprimir en el navegador antes de subir** (`public/admin/comprimir.js`). Se reescala a 1600px de
lado mayor con calidad 0,85. Medido: **una foto de 11,8 MB queda en 1 MB (92% menos) en 156 ms**.

Se hace en el navegador y no en el servidor a propósito: subir el archivo entero para achicarlo del otro
lado dejaría igual el problema real, que es la subida lenta con datos móviles.

Detalles que importan: se usa `createImageBitmap` con `imageOrientation: 'from-image'` porque una foto
sacada en vertical viene rotada en los metadatos EXIF y dibujarla sin eso la deja acostada; los GIF no se
tocan (el canvas se quedaría con el primer cuadro); las imágenes de menos de 600 KB se dejan como están; y
ante cualquier error se devuelve el archivo original en vez de fallar.

Como respaldo, el `errorHandler` ahora traduce `LIMIT_FILE_SIZE` a un **413 con un mensaje que dice qué
hacer**, en vez del 500 genérico.

### 2. El catálogo servía las fotos a tamaño completo

Más grave para el cliente, porque es silencioso: las miniaturas de 250px cargaban la imagen entera de
1600px. **El plan gratuito de ImageKit da 20 GB de tráfico al mes y corta la entrega al superarlos** — el
catálogo se quedaría literalmente sin fotos hasta el mes siguiente.

Se agregó `imagenOptimizada()` en `state.js`, que le pide a ImageKit el ancho que se va a ver
(`?tr=w-...,q-80,f-auto`). El `f-auto` además entrega WebP/AVIF donde el navegador lo soporta.

Anchos por lugar: tarjetas 400px, carrusel 900px, miniaturas de galería 150px, imagen del modal 800px,
pantalla completa 1600px.

Medido en el navegador, cargando la home entera hasta el final:

| | Peso por visita | Visitas que soportan los 20 GB |
|---|---|---|
| Antes | ~1,2 MB estimado | ~17.000/mes |
| **Ahora** | **94 KB** | **~222.000/mes (7.400 por día)** |

### Verificado

- **9/9** de compresión en navegador, incluida la subida real a ImageKit.
- **11/11** del panel en un teléfono (Pixel 5): entra el login, no se desborda, los botones son tocables y
  el selector de foto ofrece Cámara y Galería.
- **Varias fotos por producto: funciona.** Probadas 4 fotos de ~7 MP en un mismo producto: las 4 suben, se
  guardan con su orden y la galería las devuelve. No hay límite por producto en el código.
- 179 tests y 0 errores de lint. Cero imágenes rotas en el catálogo tras el cambio.
