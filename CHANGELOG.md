# Changelog

## v1.4.1
### Bugfix: Filtros multi-seleccion
- Fix: marcas en sidebar ahora se obtienen del catalogo completo, no de productos filtrados
- Fix: checkmark de seleccion oculto cuando no esta seleccionado (color: transparent)
- Fix: boton "Todas las marcas" visible siempre, no solo cuando hay seleccion
- Fix: icono filter_list del boton Filtros resetea su scale a 1
- Fix: scale de Material Symbols en sidebar-check reseteado
- Fix: funciones duplicadas removeFromArray unificadas en toggleFilterArray

## v1.4.0 (Actual)
### Paleta Black + Racing Red y animaciones de motos
- Nueva paleta: rojo racing #c1121f, negro carbon #0d0d0d, fondo gris #f5f5f5
- Animacion: banda de cuadros animada debajo del hero (checkered flag)
- Animacion: speed sweep en tarjetas al hover (barrido rojo horizontal)
- Animacion: rev pulse en badges (1.5s)
- Animacion: racing stripe decorativa debajo del header
- Hero overlay mas suave para mejor visibilidad de imagenes
- Category badge en hero con fondo rojo y texto blanco
- Header rojo con boton de busqueda glassmorphism (blanco semi-transparente)
- Busqueda con border-radius 6px y hover glow
- 59 colores residuales actualizados a la nueva paleta

## v1.3.0
### Recepcion de mercaderia y mejoras en admin
- Nueva API POST /api/products/batch-stock para actualizacion masiva de stocks
- Nueva pestana Recepcion con buscador, tabla interactiva y confirmacion
- Integracion Stock -> Recepcion: checkboxes + boton Generar pedido a proveedor
- Cantidad sugerida automatica segun stock minimo
- Panel de Stock ahora tiene boton Recibir con precarga en Recepcion
- Iconos Material Symbols en todos los paneles (Metricas, Stock, Recepcion)
- Fix: error null en updateRecepcionSummary

## v1.2.1
### Fixes de estabilidad y UI responsive
- Fix: sidebar filtros responsive ahora se despliega justo debajo del boton
- Fix: query categorias ya no excluye productos sin subcategoria
- Fix: servidor reiniciado limpio (se mataron procesos zombies)

## v1.2.0
### Fase B - Modernizacion visual
- Tipografia display Poppins para titulos y precios
- Glassmorphism en sidebar y modal (backdrop-filter blur)
- Badges animados (slide-in + pulse en oferta)
- Variables CSS para consistencia de colores
- Touch target 44px en todos los botones mobile
- prefers-reduced-motion para accesibilidad
- Fallback @supports para navegadores sin backdrop-filter

## v1.1.1
### Fix crash del pool de PostgreSQL
- db.js: agregado pool.on('error') para capturar errores de conexiones idle
- server.js: helmet con contentSecurityPolicy: false (permitir imagenes externas)
- Prevencion de crash cada 30 segundos por errores no capturados del pool

## v1.1.0
### Auditoria completa - seguridad, performance y UX
- Seguridad: fix XSS en /p/:id (server.js), modal y admin (3 criticos)
- Seguridad: helmet headers, rate limiting GET/metricas, validacion URL
- DB: 6 indices nuevos, Promise.all en dashboard, SELECT * eliminado
- DB: Pool config, graceful shutdown, CHECK y UNIQUE constraints
- UX: touch targets 44px, hover feedback, try/catch en todos los fetch
- Limpieza: codigo muerto eliminado, CSS duplicado, path sin uso

## v1.0.0
### Initial commit
- Proyecto base con Express, PostgreSQL, autenticacion JWT
- CRUD de productos, categorias, metricas
- Panel de administracion con login
- Frontend vanilla JS con carrusel, filtros, modal
