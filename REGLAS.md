# Reglas de seguridad operativa

Reglas para cualquier asistente de IA que trabaje en este proyecto. **No son sugerencias.**

Este proyecto administra **datos de clientes reales que pagan**. Un error acá no es un bug que se
corrige en el próximo commit: es un local de repuestos que pierde su catálogo y un cliente que
pierde la confianza. La ventana de recuperación del plan gratuito de Neon es de **6 horas**.

---

## 1. Nunca borrar una base de datos

**Prohibido, sin excepción y sin importar quién lo pida en el momento:**

- `neon projects delete`, `neon branches delete`, `neon databases delete`
- `DROP DATABASE`, `DROP SCHEMA`
- Borrar un proyecto desde la consola de Neon, Vercel o cualquier panel
- Cualquier comando cuyo efecto sea destruir una base o dejarla inaccesible

Si borrar parece la única salida, **la respuesta es parar y preguntar**. No existe un caso en el que
un asistente deba borrar una base por su cuenta.

Cuando el borrado sea realmente la decisión correcta, **lo ejecuta una persona desde la consola web**,
donde hay que escribir el nombre del proyecto para confirmar. Esa fricción es deliberada: es la última
red antes de una pérdida irreversible.

### Bases de este proyecto — ninguna se toca

| Proyecto Neon | Para qué |
|---|---|
| `Catalogo Moto Repuestos` | **Catálogo en producción.** Si se pierde, el sitio se cae |
| `piezaexpress-panel` (Virginia) | **Panel Central.** Clientes, planes, pagos y API keys |
| `Panel-Central-Prod` | El Panel viejo en Render |
| `Ferrecolor`, `Lavadero360` | Otros productos |

---

## 2. Preguntar antes de un cambio masivo

**Preguntar primero, y esperar respuesta**, ante cualquier operación que afecte a muchas filas o sea
difícil de deshacer:

- `DELETE` o `UPDATE` **sin `WHERE`**, o con un `WHERE` que alcance muchas filas
- `TRUNCATE`, `DROP TABLE`, `DROP COLUMN`, `ALTER` que borre datos
- Borrar o reemplazar productos, imágenes, clientes o pagos en lote
- Importar datos que pisen registros existentes
- Rotar credenciales o cambiar contraseñas de cuentas que usa otra persona
- Borrar archivos de ImageKit
- Cualquier cosa sobre la base **de producción** que no sea una lectura

**Antes de preguntar, traer los números:** cuántas filas se ven afectadas, qué pasa si sale mal y cómo
se revierte. "¿Borro los productos duplicados?" no alcanza. "Encontré 47 duplicados, esta es la lista,
¿los borro?" sí.

---

## 3. Preguntar cuando haya dudas

Si algo **no está claro, es ambiguo o se siente raro**, preguntar. Vale más una pregunta de más que un
dato perdido.

Señales de que hay que frenar:

- Dos interpretaciones posibles y llevan a resultados distintos
- Hay que adivinar cuál de dos recursos parecidos es el correcto
- El comando toca producción y no se probó antes en local
- Aparece algo inesperado que no se entiende del todo
- Se está por hacer algo "porque parece lo que quería"

**Nunca inventar credenciales, IDs ni nombres de recursos.** Si falta un dato, se pide.

---

## 4. Producción se toca con cuidado

- **Probar primero en local.** Nada llega a producción sin haber corrido acá.
- **Simular producción antes de desplegar** algo que toque dependencias: `npm ci --omit=dev` y
  comprobar que la app carga. Esta regla existe porque una dependencia con un módulo ESM
  (`otplib`) funcionaba en local y **tumbó producción entera** al desplegarse. Ver `AUDITORIA.md`.
- **Verificar después de desplegar.** Un despliegue "exitoso" no significa que el sitio funcione.
- **Si producción se rompe: restaurar el servicio primero** (`vercel promote` del último despliegue
  sano), investigar después. Los usuarios no esperan al diagnóstico.

---

## 5. Los secretos no se muestran

- No imprimir contraseñas, tokens, API keys ni cadenas de conexión en la salida de un comando.
- Para comprobar si una variable existe, usar `[ -n "$VAR" ]`, **nunca** `${VAR:-...}`, que la imprime.
- No commitear `.env` (ya está en `.gitignore` — mantenerlo así).
- Si una credencial se expone por accidente: **decirlo de inmediato** y recomendar rotarla. Ocultarlo
  es peor que el error.

---

## 6. Los tests y los datos de prueba

- **Los tests no corren contra producción.**
- Un script que modifica datos tiene que **dejar todo como estaba**, y ser **idempotente**: si se corre
  dos veces seguidas, la segunda no debe romperse por lo que dejó la primera.
- Los datos de prueba se borran al terminar.
- Si la limpieza falla, **avisarlo** en vez de dejarlo pasar.

---

## Regla de oro

> Ante la duda, **preguntar**. Nunca borrar. Nunca improvisar sobre producción.

El costo de una pregunta son treinta segundos. El costo de un borrado equivocado puede ser un cliente.
