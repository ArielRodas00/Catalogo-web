# Qué hacer cuando el primer cliente pague

Lista de lo que quedó pendiente **a propósito** hasta tener el primer cliente pago. No es deuda técnica
olvidada: son cosas que cuestan plata o que no tenía sentido hacer antes de tener a quién entregarle.

Cuando llegue el momento, decir **"el cliente ya pagó"** y se arranca por acá.

---

## 1. Lo que tiene que hacer el dueño (cuesta plata)

### Vercel Pro — USD 20/mes
**Es obligatorio, no opcional.** El plan gratuito de Vercel **prohíbe el uso comercial** en sus términos.
En el momento en que se le cobra a un cliente, seguir en Hobby es una infracción.

Es el único costo fijo real del negocio. La base de datos se paga por uso y arranca en cero.

### Un dominio — ~USD 3/año
`piezaexpress.com` **ya está tomado**. Precios consultados (Vercel, primer año):

| Dominio | Precio |
|---|---|
| `piezaexpress.store` / `.online` / `.site` | USD 1,99 |
| **`piezaexpress.shop`** ← recomendado | USD 2,99 |
| `piezaexpress.app` | USD 9,99 |
| `piezaexpress.net` | USD 13,50 |

**Mirar el precio de RENOVACIÓN antes de comprar**: los dominios baratos suelen renovar bastante más caro
el segundo año.

Dos motivos por los que el dominio no es opcional:
1. **Malwarebytes bloquea `*.vercel.app`** (confirmado por el usuario). Si un cliente del local ve una
   advertencia roja de seguridad, se terminó la venta.
2. Credibilidad: `piezaexpress.shop` vende más que `piezaexpress-catalogo.vercel.app`.

---

## 2. Lo que hago yo, en este orden

### a) Conectar el dominio
- Asignarlo al proyecto en Vercel.
- **Actualizar la variable `BASE_URL`.** Si se olvida, el `sitemap.xml` le sigue dando a Google las
  direcciones viejas de `vercel.app` y se arruina todo el trabajo de posicionamiento. Es una línea, pero
  es la que más fácil se pasa por alto.
- Los subdominios por cliente (`jjmotos.piezaexpress.shop`) salen del mismo dominio: **uno solo alcanza
  para todos los clientes**, no hay que comprar uno por cada uno.

### b) Los dos huecos de posicionamiento (detectados, no corregidos)
Se dejaron pendientes porque no servían de nada sin dominio:

1. **Falta un `<h1>`** en la portada. Es de las señales más básicas que mira Google para entender de qué
   trata la página.
2. **Faltan los datos del negocio** (dirección, teléfono, horarios) en formato que Google entienda
   (`LocalBusiness`). Sin eso no lo reconoce como un local físico, que es justo lo que importa cuando
   alguien busca el nombre del local.

Los dos son cambios chicos.

### c) Dar de alta el catálogo del cliente
Su propio catálogo separado, que es el modelo del producto:
1. Base nueva en Neon, **región Virginia (`aws-us-east-1`)** — la misma donde corren las funciones.
2. Proyecto nuevo en Vercel apuntando a este repositorio.
3. Registro del cliente en el Panel Central (genera su `api_key`).
4. Variables de entorno, incluidas `PANEL_CENTRAL_URL` y `CLIENTE_API_KEY` para que el corte de servicio
   funcione.
5. Marca del local (nombre, colores, logo) desde el Panel Central.
6. Su cuenta de admin, con una contraseña que **él** cambie en el primer ingreso.
7. Cargar sus productos con el importador de CSV.

### d) Google Search Console
Avisarle a Google que existe el dominio y mandarle el sitemap. Es gratis y acelera el indexado de semanas
a días. **Conviene hacerlo el mismo día que se conecta el dominio.**

---

## 3. Seguridad, antes de que haya datos de un cliente real

### Rotar credenciales
Varias se compartieron por chat durante el desarrollo, y **la contraseña del admin del catálogo llegó a
quedar en un commit de un repositorio público** (ver `AUDITORIA.md`). Hay que rotar:

- La contraseña del admin del catálogo *(urgente — ya está expuesta)*
- La contraseña del super-admin del Panel Central
- La cadena de conexión de la base del Panel Central
- Las claves de ImageKit

### Backups
**Es el único riesgo irreversible que queda.** El plan gratuito de Neon da **6 horas** de ventana para
recuperar. Si se borra algo un viernes y se descubre el lunes, no se recupera.

Dos caminos:
- **Pagar Neon** para tener 7 a 30 días de recuperación. Cero código, cuesta plata.
- **Una GitHub Action programada** que haga `pg_dump` a diario. Gratis, y se puede implementar entero.

---

## 4. Lo que NO hace falta

Para que no se pierda tiempo revisándolo:

- **Capacidad**: entran ~590.000 productos en el plan gratuito de Neon. Los 150 del cliente ocupan 130 KB.
- **Imágenes**: 3 GB gratis en ImageKit ≈ 7.500 fotos, y ~7.400 visitas por día de tráfico.
- **Cambiar a Supabase**: no. Pausa los proyectos tras una semana de inactividad y hay que despausarlos a
  mano — el catálogo del cliente quedaría caído. Ver `AUDITORIA.md`.
- **Multi-inquilino** (un solo despliegue para todos los clientes): no hace falta. Con un despliegue por
  cliente y subdominios se resuelve sin tocar código.
