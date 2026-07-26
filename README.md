# PiezaExpress — Catálogo Multi-tenant para Repuestos de Motos

**[🔗 Ver demo en vivo](https://catalogo-web-j26x.onrender.com)** — catálogo público, sin login necesario.

Plataforma de catálogo online + pedidos por WhatsApp para pequeños comercios de repuestos de motos, con
panel de administración completo. Pensada como producto vendible a múltiples clientes: arquitectura
multi-tenant con marca configurable por variables de entorno, un "Panel Central" separado para gestionar
clientes/planes/pagos, y control de acceso a funciones (Métricas, Stock, Recepción) según el plan de cada
cliente (Básico/Premium).

El desarrollo se hizo con [Claude Code](https://claude.com/claude-code) como par de programación: diseño
de arquitectura, implementación full-stack, y verificación end-to-end con Playwright contra infraestructura
real (Postgres/Neon, deploys en Render) en cada paso — el detalle completo del proceso está en
[AUDITORIA.md](AUDITORIA.md).

## Capturas

| Catálogo público | Panel de administración |
|---|---|
| ![Catálogo](docs/screenshots/catalogo-home.png) | ![Admin](docs/screenshots/admin-productos.png) |

<details>
<summary>Ver versión mobile</summary>

![Catálogo mobile](docs/screenshots/catalogo-mobile.png)

</details>

## Arquitectura multi-tenant

```
Cliente A (Render + Neon propios) ─┐
Cliente B (Render + Neon propios) ─┼─→  Panel Central (Render + Neon propio)
Cliente C (Render + Neon propios) ─┘     - alta/baja de clientes, plan, pagos
                                          - GET /api/licencia (API key por cliente)
```

Cada cliente tiene su propio deploy (catálogo + base de datos), y consulta periódicamente al Panel Central
si su plan sigue activo. Si el Panel Central no responde, el catálogo del cliente **nunca se cae** — sigue
funcionando con el último estado conocido (caché de gracia de 48hs) en vez de depender de una conexión en
tiempo real. Detalle completo en [AUDITORIA.md](AUDITORIA.md), sección "Multi-tenant".

## Stack

- **Backend:** Node.js + Express 5 (CommonJS)
- **Base de datos:** PostgreSQL con pg (Pool)
- **Autenticacion:** JWT + bcrypt
- **Frontend:** HTML/CSS/JS vanilla
- **Seguridad:** helmet, rate-limiting, CSP configurable

## Requisitos

- Node.js 18+
- PostgreSQL 14+
- npm

## Instalacion

```bash
git clone <repo-url>
cd catalogo-backend
npm install
cp .env.example .env   # Configurar variables de entorno
psql -U postgres -d catalogo_db -f schema.sql
node server.js
```

## Variables de entorno (.env)

| Variable | Descripcion | Default |
|----------|-------------|---------|
| PORT | Puerto del servidor | 3000 |
| DB_HOST | Host PostgreSQL | localhost |
| DB_PORT | Puerto PostgreSQL | 5432 |
| DB_NAME | Nombre de la BD | catalogo_db |
| DB_USER | Usuario BD | postgres |
| DB_PASSWORD | Password BD | - |
| JWT_SECRET | Secreto JWT | - |
| JWT_EXPIRES_IN | Expiracion JWT | 8h |
| ADMIN_USERNAME | Usuario admin | admin |
| ADMIN_PASSWORD | Password admin | - |
| BASE_URL | URL base para SEO | http://localhost:3000 |
| NODE_ENV | Entorno | development |
| CORS_ORIGIN | Origen permitido (solo produccion) | - |
| STORE_NAME | Nombre de la tienda (title, meta, footer, logo del header) | PiezaExpress |
| STORE_NAME_ACCENT | Parte de STORE_NAME resaltada en el logo (vacio = sin resaltar) | Express |
| STORE_TAGLINE | Frase chica debajo del logo del header | repuestos al instante |
| STORE_LOGO_URL | Ruta/URL del logo (solo icono de pestana del navegador) | /favicon.svg |
| COLOR_PRIMARY | Color primario (botones, acentos) | #c1121f |
| COLOR_PRIMARY_HOVER | Color primario en hover | #e63946 |
| COLOR_ACCENT | Color de acento (headers oscuros) | #0d0d0d |
| PANEL_CENTRAL_URL | URL del Panel Central (ver panel-central/) | - |
| CLIENTE_API_KEY | API key de este cliente en el Panel Central | - |

Las variables de marca son opcionales: pensadas para reusar el mismo codigo en
varios clientes (arquitectura "1 deploy por cliente", ver AUDITORIA.md), cada
deploy define su propia marca sin tocar codigo. Si no se definen, el catalogo
se ve exactamente igual que hoy.

`PANEL_CENTRAL_URL`/`CLIENTE_API_KEY` tambien son opcionales: si no estan
definidas, este deploy corre "standalone" (todas las funciones sin
restriccion, el comportamiento de siempre). Si estan definidas, el catalogo
consulta periodicamente su licencia y las funciones Premium (metricas, por
ahora) dependen de que el plan sea Premium y el pago este al dia — ver
`licenseCheck.js` y `AUDITORIA.md` ("Multi-tenant — Paso 3") para el detalle
de como se maneja una caida de conexion (nunca bloquea el sitio completo).

Si el catalogo esta conectado al Panel Central, la marca (logo, colores,
nombre) tambien se puede cargar ahi en vez de en estas variables de entorno —
y si se carga en los dos lugares, gana el Panel Central. Ver AUDITORIA.md,
"Branding desde el Panel Central".

## Scripts disponibles

```bash
npm start       # Iniciar servidor
npm run dev     # Iniciar con hot-reload (Node 18+ --watch)
```

## Estructura del proyecto

```
catalogo-backend/
├── server.js              # Punto de entrada
├── db.js                  # Conexion PostgreSQL (Pool)
├── schema.sql             # Esquema de base de datos
├── routes/
│   ├── products.js        # CRUD productos + batch-stock
│   ├── auth.js            # Autenticacion
│   ├── metrics.js         # Metricas y dashboard
│   └── categories.js      # Categorias
├── middleware/
│   ├── auth.js            # Middleware JWT
│   ├── validate.js        # Validacion de productos
│   ├── logger.js          # Logging de requests
│   └── errorHandler.js    # Manejo de errores
└── public/
    ├── index.html         # Catalogo publico
    ├── admin.html         # Panel de administracion
    ├── styles.css         # Estilos del catalogo
    ├── admin.css          # Estilos del admin
    ├── js/                # Modulos frontend
    │   ├── main.js
    │   ├── render.js
    │   ├── filters.js
    │   ├── modal.js
    │   ├── carousel.js
    │   ├── state.js
    │   └── toast.js
    ├── storage.js         # API de datos
    ├── admin.js           # Logica del admin
    └── products.js        # (deprecado)
```

## API endpoints

### Productos
| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|:----:|
| GET | /api/products | Listar productos (paginado) | No |
| GET | /api/products/destacados | Destacados | No |
| GET | /api/products/promociones | Promociones | No |
| GET | /api/products/:id | Detalle producto | No |
| POST | /api/products | Crear producto | Si |
| PUT | /api/products/:id | Actualizar producto | Si |
| DELETE | /api/products/:id | Eliminar producto | Si |
| POST | /api/products/batch-stock | Recepcion masiva de stock | Si |

### Autenticacion
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | /api/auth/login | Iniciar sesion |
| GET | /api/auth/verify | Verificar token |

### Metricas
| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|:----:|
| GET | /api/metrics/dashboard | Dashboard metricas | Si |
| POST | /api/metrics/view/:id | Registrar vista | No |
| POST | /api/metrics/whatsapp/:id | Registrar click WhatsApp | No |
| POST | /api/metrics/search | Registrar busqueda | No |

### Categorias
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | /api/categories | Listar categorias con subcategorias |

## Deploy en Render + Neon

### Requisitos
- Cuenta en [render.com](https://render.com)
- Cuenta en [neon.tech](https://neon.tech)

### Pasos

1. **Crear base de datos en Neon**
   - Copiar la connection string: `postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

2. **Configurar en Render**
   - Crear Web Service conectando el repositorio de GitHub
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Agregar variable de entorno: `DATABASE_URL` con la string de Neon

3. **Inicializar la base de datos**
   - Ejecutar localmente: `npm run init-db` (con `DATABASE_URL` configurada)
   - O ejecutar en Render via shell: `node db-init.js`

4. **Variables de entorno en Render**
   | Variable | Valor |
   |----------|-------|
   | `DATABASE_URL` | Connection string de Neon |
   | `JWT_SECRET` | Generar una segura |
   | `ADMIN_USERNAME` | admin |
   | `ADMIN_PASSWORD` | Password robusta |
   | `CORS_ORIGIN` | URL de Render |

   Si este deploy es para un cliente distinto al original, sumar tambien las
   variables de marca (`STORE_NAME`, `STORE_LOGO_URL`, `COLOR_PRIMARY`, etc. —
   ver tabla completa arriba) para que el catalogo se vea con su identidad.
   | `BASE_URL` | URL de Render |
   | `NODE_ENV` | production |

### Importante
- Las imagenes subidas via Multer se pierden en cada redeploy de Render. Para produccion, migrar a Cloudinary o S3.
- Neon tiene un tier gratuito de 0.5GB.
- Render se duerme a los 15 min sin actividad (plan gratis).

## Versionado

```bash
git tag -a vX.Y.Z -m "mensaje"
git push origin vX.Y.Z
```

Ver CHANGELOG.md para historial completo.
