---
name: code-verification
description: Checklist reutilizable para verificar código backend Node.js/Express con PostgreSQL
license: MIT
---

## Checklist de Verificación

### archivos y estructura
- [ ] package.json: dependencias necesarias y scripts útiles
- [ ] .env: variables de entorno documentadas en .env.example
- [ ] server.js: rutas organizadas y middlewares en orden correcto
- [ ] db.js: conexión a BD con pool y manejo de errores

### seguridad backend
- [ ] JWT: token se verifica en cada ruta protegida
- [ ] bcrypt: contraseñas hasheadas antes de guardar
- [ ] SQL injection: uso de placeholders ($1, $2) nunca concatenación directa
- [ ] Validación: inputs se validan en backend (no confiar del frontend)
- [ ] .env: secretos fuera del código, nunca hardcodeados
- [ ] CORS: configurado correctamente
- [ ] Multer: límite de tamaño y tipo de archivo validado

### API endpoints
- [ ] Verbos HTTP correctos (GET, POST, PUT, DELETE)
- [ ] Códigos de estado apropiados (200, 201, 401, 403, 404, 500)
- [ ] Paginación implementada en listas
- [ ] Filtros y búsqueda funcionando
- [ ] Respuestas consistentes (formato JSON)

### frontend (admin y público)
- [ ] Diseño responsive
- [ ] Manejo de errores visible para el usuario
- [ ] Carga de datos con feedback (loading)
- [ ] Navegación intuitiva
- [ ] Formularios con validación
- [ ] Imágenes optimizadas

### UX general
- [ ] Tiempos de carga aceptables
- [ ] Mensajes de error amigables
- [ ] Flujo completo funcional (registro → navegación → compra → seguimiento)
