# Reglas Generales del Proyecto

## Stack
- Node.js con Express 5
- PostgreSQL con pg (Pool)
- Autenticación JWT + bcrypt
- Subida de archivos con multer

## Convenciones
- Usar CommonJS (require/module.exports)
- Funciones asíncronas con async/await
- Errores manejados con try/catch
- Variables de entorno desde .env (dotenv)
- Placeholders $1, $2... para queries SQL (nunca concatenar)

## Versionado
- Commits descriptivos en español
- Tags semánticos: v1.x.x
- README.md actualizado con instrucciones

## Estructura de rutas
- /api/products — CRUD de productos
- /api/auth — autenticación
- /api/categories — categorías
- /api/metrics — métricas y estadísticas

## Frontend
- HTML/CSS/JS vanilla en /public
- Admin panel en /public/admin.html
- Diseño responsive
- Sin frameworks JS pesados
