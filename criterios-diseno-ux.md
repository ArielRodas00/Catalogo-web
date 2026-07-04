# Criterios de Diseño y UX/UI — Catálogo Web

## 1. Identidad Visual

### Paleta de colores
- **Primario:** #822 (rojo ladrillo) — botones, encabezados, acentos
- **Fondo:** #eee (gris claro) — fondo general
- **Superficies:** #fff — tarjetas, modales, sidebar
- **Texto:** #222 / #333 / #555 / #888 — jerarquía tipográfica
- **Éxito:** #25D366 (WhatsApp), #27ae60 — acciones positivas
- **Peligro:** #c0392b — eliminar, errores

### Tipografía
- Fuente: `Segoe UI`, sans-serif (sistema)
- Jerarquía: h1 (2.5rem → 1.6rem) > h2 (1.3-1.4rem) > cuerpo (0.9-1rem) > small (0.78-0.85rem)
- Pesos: 400 (regular), 600 (semibold), 700 (bold), 800 (extrabold precios)

## 2. Layout y Responsive

### Breakpoints
| Dispositivo | Ancho | Columnas |
|-------------|-------|----------|
| Desktop     | >900px | 4 (grid) |
| Tablet      | 560-900px | 2 (grid) |
| Mobile      | <560px | 2 (grid compacto) |

### Comportamiento responsive
- Header: en mobile la búsqueda pasa abajo del logo (order: 3)
- Nav categorías: scroll horizontal en mobile (overflow-x: auto)
- Productos: 4 → 2 → 2 columnas
- Sidebar filtros: a la par en desktop, apilado en mobile (no sticky)
- Footer: 3 columnas → 1 columna

## 3. Componentes y Patrones

### Header
- Logo alineado a izquierda, búsqueda centrada, íconos a derecha
- Búsqueda con input + botón lupa, ancho 50% en desktop, 100% en mobile
- Nav secundario con categorías ancladas (sticky no, solo posicional)

### Hero / Carrusel
- Altura: 480px desktop, 320px mobile
- Efecto Ken Burns en imágenes de fondo (scale: 1.05 → 1)
- Gradiente oscuro a la izquierda para legibilidad
- Flechas de navegación + dots indicadores
- Transición suave de opacidad (0.7s)

### Tarjetas de producto
- Sombra sutil (0 2px 8px), hover eleva 4px con sombra más pronunciada
- Imagen: 200px alto, object-fit: contain, fondo gris claro
- Badges: esquina superior izquierda, apilados verticalmente
- Sin stock: overlay oscuro + imagen desaturada + botón deshabilitado
- Precio oferta: original tachado, oferta en color primario

### Modal de detalle
- Overlay oscuro (rgba 0,0,0,0.6), centrado con flex
- Máximo 700px ancho, 90vh alto con scroll interno
- Galería lateral izquierda (280px) con thumbs abajo
- Zoom a pantalla completa con transición suave
- Botón WhatsApp verde (#25D366) alineado abajo

### Sidebar de filtros
- Sticky en desktop (top: 16px), estático en mobile
- Secciones separadas con borde inferior
- Links activos con fondo rosa suave (#f5e6e6)
- Checkboxes con accent-color primario

### Admin panel
- Login limpio, centrado, con icono admin
- Tabs: Productos / Métricas / Stock
- Tabla de productos con: imagen, nombre, categoría, precio, estado, acciones
- Alternativa vista tarjetas para admin
- Formulario en modal con filas agrupadas (2 columnas)
- Switches visuales para estados (stock, destacado, oferta, promoción)
- Campos condicionales (precio oferta solo si "en oferta", fecha fin solo si "en promoción")
- Toast para feedback de acciones
- Modal de confirmación para eliminar

## 4. Navegación y Flujos

### Flujo público
1. Landing → carrusel destacados → promociones → todos los productos
2. Búsqueda → resultados filtrados con sidebar
3. Categoría → subcategoría (acordeón) → productos filtrados
4. Click producto → modal detalle → imágenes → WhatsApp

### Flujo admin
1. Login → token JWT (expiración controlada)
2. CRUD productos: crear/editar con formulario completo
3. Métricas: selector período → cards totales → gráficos (Chart.js)
4. Stock: productos sin stock + productos por debajo del mínimo
5. Confirmación antes de eliminar

## 5. Criterios de Calidad UX

### Feedback visual
- [ ] Loading states al cargar datos (indicador o esqueleto)
- [ ] Transiciones suaves en hover, apertura de modales, cambio de tabs
- [ ] Toast de confirmación en acciones admin (guardar, eliminar)
- [ ] Error visible en login fallido

### Prevención de errores
- [ ] Confirmación antes de eliminar (modal con nombre del producto)
- [ ] Validación de formularios en frontend (required, min, type)
- [ ] Validación en backend (nunca confiar solo del frontend)
- [ ] Placeholder descriptivo en inputs

### Accesibilidad
- [ ] Contraste suficiente entre texto y fondo
- [ ] Etiquetas label asociadas a inputs
- [ ] Navegación por teclado en formularios
- [ ] alt text en imágenes de producto

### Performance percibida
- [ ] Imágenes optimizadas (peso razonable)
- [ ] Paginación en listados (>20 productos)
- [ ] Carga bajo demanda de secciones (promociones, destacados)
- [ ] Fuse.js para búsqueda local con fuzzy matching

## 6. Estados de cada componente

| Componente | Normal | Hover | Activo | Vacío | Error | Cargando |
|------------|--------|-------|--------|-------|-------|----------|
| Botón primario | #822 bg | #a33 bg | - | - | - | disabled |
| Tarjeta | sombra 2px | translateY(-4px) | - | - | - | - |
| Modal | oculto | - | flex (active) | - | - | - |
| Input | borde #ddd | borde #822 | - | - | borde rojo | - |
| Sidebar link | color #444 | bg #f5f5f5 | bg #f5e6e6 | "Sin resultados" | - | - |
| Grid productos | 4 cols | - | - | "No hay productos" | error toast | spinner |

## 7. Convenciones de Código

### Backend (server.js)
- Verbos HTTP correctos: GET (leer), POST (crear), PUT (actualizar), DELETE (eliminar)
- Status codes: 200, 201, 401, 403, 404, 500
- Errores: objeto `{ error: "mensaje" }` — mensajes genéricos sin exponer internas
- Paginación: `{ products, total, page, totalPages }`
- Middleware authenticateToken en rutas protegidas (admin)

### Frontend (JS vanilla)
- Módulos: state.js, render.js, filters.js, modal.js, carousel.js, main.js
- products.js: datos mock (fallback si API falla)
- storage.js: localStorage para mejorar experiencia offline
- Naming consistente: camelCase, prefijos field- / btn- / sidebar-

## 8. Checklist de Verificación UX

- [ ] Todos los botones tienen feedback hover
- [ ] Los modales se cierran con botón X y click fuera
- [ ] Las imágenes tienen fondo gris mientras cargan
- [ ] Los formularios muestran error si falta campo requerido
- [ ] La paginación muestra página actual y total
- [ ] "Sin stock" se indica visualmente (no solo texto)
- [ ] Los enlaces WhatsApp abren en nueva pestaña
- [ ] El footer tiene info de contacto y FAQ funcional
- [ ] El admin panel requiere autenticación
- [ ] Las métricas se actualizan al cambiar período
- [ ] Eliminar producto pide confirmación
- [ ] El carrusel avanza automáticamente y con controles manuales

---

*Documento de criterios para verificar y mantener consistencia en el diseño y UX del catálogo web.*
