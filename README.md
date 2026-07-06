# Catalogo-backend

Catalogo web para tienda de repuestos de motos. Backend Node.js + Express + PostgreSQL con panel de administracion completo.

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
