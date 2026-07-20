# Panel Central

Panel de super-usuario para la arquitectura "1 deploy por cliente" del catálogo
(ver `../AUDITORIA.md`, sección Multi-tenant). No es un catálogo — es el
servicio que vos (el operador) usás para dar de alta clientes, asignarles un
plan (Básico/Premium), llevar el estado de pago, y registrar pagos recibidos
por transferencia.

Cada catálogo de cliente consulta `GET /api/licencia` acá (autenticado con su
propia API key) para saber si sigue activo y qué plan tiene — eso todavía no
está conectado del lado del catálogo (es el Paso 3 del roadmap).

## Stack

Mismo stack liviano que el catálogo: Express 5, PostgreSQL (`pg`, sin ORM),
JWT + bcrypt para el login del super-admin, helmet, rate-limiting. Es un
proyecto separado (su propio `package.json`, su propia base de datos) para
poder deployarlo como un servicio de Render independiente.

## Instalación

```bash
cd panel-central
npm install
cp .env.example .env
# completar .env con una base de datos propia (Neon nueva, distinta a la de
# cualquier cliente) y un JWT_SECRET/ADMIN_PASSWORD fuertes
npm run init-db
npm run dev
```

Login con `ADMIN_USERNAME`/`ADMIN_PASSWORD` en `http://localhost:4000`.

## Autenticación: dos tipos, no confundir

- **JWT (humano):** el super-admin logueado en el panel web. Protege
  `/api/clientes/*`.
- **API key (servicio a servicio):** cada cliente tiene una API key única
  (generada al crearlo, visible/regenerable desde su modal de edición). Su
  catálogo la manda en el header `X-API-Key` al pegarle a `GET /api/licencia`.
  No es un JWT, no expira, no identifica a una persona — identifica a un
  deploy.

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/login` | - | Login del super-admin |
| GET | `/api/auth/verify` | JWT | Verifica el token |
| GET | `/api/clientes` | JWT | Lista todos los clientes |
| GET | `/api/clientes/:id` | JWT | Detalle (incluye la API key) |
| POST | `/api/clientes` | JWT | Alta (genera API key) |
| PUT | `/api/clientes/:id` | JWT | Edición parcial (plan, estado, notas, etc.) |
| POST | `/api/clientes/:id/regenerar-api-key` | JWT | Por si la key se filtró |
| DELETE | `/api/clientes/:id` | JWT | Baja |
| GET | `/api/clientes/:id/pagos` | JWT | Historial de pagos |
| POST | `/api/clientes/:id/pagos` | JWT | Registrar un pago manual (transferencia, efectivo) |
| GET | `/api/licencia` | API key (`X-API-Key`) | La consulta el catálogo del cliente: `{ activo, plan, estado }` |

## Deploy

Mismo proceso que el catálogo principal (ver `../README.md`, sección Deploy):
Render (Web Service, root directory `panel-central/`) + Neon (proyecto nuevo,
solo para esta base — no reutilizar la de ningún cliente).
