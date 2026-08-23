# Desplegar en Vercel

El código ya está preparado (ver `AUDITORIA.md`, sección "Preparación para migrar a Vercel"). Falta la parte
que requiere tu cuenta: crear los proyectos y cargar las variables.

Son **dos proyectos separados** en Vercel, desde el mismo repositorio de GitHub:

| Proyecto | Root Directory | Para qué |
|---|---|---|
| Catálogo | *(raíz, vacío)* | El sitio que ve el cliente final |
| Panel Central | `panel-central` | Donde administrás clientes, planes y pagos |

---

## Camino recomendado: desde el panel de Vercel

Es el más simple y el más seguro: **ningún secreto pasa por el chat ni por la terminal**, y cada push a
`main` despliega solo.

1. Entrá a [vercel.com/new](https://vercel.com/new) e importá el repositorio `ArielRodas00/Catalogo-web`.
2. Dejá el *Root Directory* vacío (es el catálogo). Vercel detecta Express solo, no hay build que configurar.
3. Cargá las variables de la tabla de abajo **antes** del primer deploy.
4. Repetí desde el paso 1 para un segundo proyecto, esta vez con *Root Directory* = `panel-central`.

> El plan Hobby (gratis) **prohíbe el uso comercial**, así que para vender el catálogo hace falta Pro
> (USD 20/mes, proyectos ilimitados).

---

## Variables del **catálogo**

### Obligatorias

| Variable | Valor | Nota |
|---|---|---|
| `DATABASE_URL` | La cadena *pooled* de Neon | La que incluye `-pooler` en el host |
| `JWT_SECRET` | El mismo que usás hoy en Render | Si lo cambiás, se cierran todas las sesiones abiertas |
| `NODE_ENV` | `production` | **Crítico**: de esto depende el flag `Secure` de la cookie de sesión |
| `DB_POOL_MAX` | `3` | Menos conexiones por instancia, para no agotar el límite de Neon |
| `IMAGEKIT_PUBLIC_KEY` | El de hoy | Sin esto no se pueden subir imágenes |
| `IMAGEKIT_PRIVATE_KEY` | El de hoy | |
| `IMAGEKIT_URL_ENDPOINT` | El de hoy | |
| `BASE_URL` | La URL nueva de Vercel | **Corregilo**: hoy en Render apunta a un dominio viejo y por eso el `sitemap.xml` publica URLs muertas |
| `CRON_SECRET` | Una cadena aleatoria nueva | Protege el endpoint que refresca la licencia. Generala con `openssl rand -hex 32` |

### Solo si el catálogo es de un cliente (multi-tenant)

| Variable | Nota |
|---|---|
| `PANEL_CENTRAL_URL` | URL del Panel Central. **Si la omitís, el deploy queda en modo standalone: plan Premium, sin depender de nada.** Ideal para el demo público |
| `CLIENTE_API_KEY` | La `api_key` que le generaste a ese cliente en el Panel Central |

### Opcionales

`CORS_ORIGIN`, `JWT_EXPIRES_IN` (por defecto 8h), `IMAGEKIT_FOLDER` (por defecto `catalogo`), y las de marca
por defecto: `STORE_NAME`, `STORE_NAME_ACCENT`, `STORE_TAGLINE`, `STORE_LOGO_URL`, `COLOR_PRIMARY`,
`COLOR_PRIMARY_HOVER`, `COLOR_ACCENT`. La marca cargada en el Panel Central pisa a estas últimas.

### Que **no** hacen falta

- `PORT` — lo maneja Vercel.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — solo se usan cuando no hay `DATABASE_URL`.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — solo los usa `db-init.js` para crear el admin la primera vez. La base
  ya existe, así que no van en el runtime.

---

## Variables del **Panel Central**

| Variable | Valor | Nota |
|---|---|---|
| `DATABASE_URL` | La cadena *pooled* de su base Neon | **Ojo**: tu `.env` local del Panel Central no tiene `DATABASE_URL` (usa `DB_HOST` y compañía apuntando a localhost). La de producción la tenés que copiar **desde Render** |
| `JWT_SECRET` | El de hoy | Es distinto del JWT del catálogo, y está bien que lo sea |
| `NODE_ENV` | `production` | Mismo motivo: la cookie `Secure` |
| `DB_POOL_MAX` | `3` | |

Opcionales: `LAVADERO360_API_URL` y `LAVADERO360_ADMIN_KEY` (solo si sincronizás con Lavadero360),
`JWT_EXPIRES_IN`.

El Panel Central **no lleva `vercel.json`**: no tiene cron y Express corre sin configuración.

---

## Después del primer deploy

1. **Probá la URL de preview antes de tocar Render.** Los dos pueden convivir sin problema.
2. **Regla de rate limiting en el WAF** (reemplaza al limitador en memoria, que no es confiable entre
   instancias). Hacelo por etapas: primero `log`, mirás el tráfico real en el panel, y recién después `deny`:

   ```bash
   vercel firewall rules add "Limite de login" \
     --condition '{"type":"path","op":"eq","value":"/api/auth/login"}' \
     --action rate_limit --rate-limit-window 900 --rate-limit-requests 10 \
     --rate-limit-keys ip --rate-limit-action log --yes
   ```

3. **Verificá el cron**: en el panel de Vercel, *Settings → Cron Jobs*, tiene que aparecer
   `/api/internal/refresh-license` cada 6hs. Es un refuerzo, no un requisito — el refresco por demanda
   funciona igual si el cron falla.
4. **Comprobá la cookie de sesión**: entrá al admin, y en las herramientas del navegador confirmá que
   `admin_token` tiene `HttpOnly`, `Secure` y `SameSite=Strict`. Si falta `Secure`, es que `NODE_ENV` no
   quedó en `production`.
5. Recién con todo verificado: apuntá el dominio y dá de baja los servicios de Render.

---

## Si preferís que lo maneje yo desde la terminal

Corré esto **vos** en tu terminal (abre el navegador para autorizar):

```bash
npm i -g vercel
vercel login
```

Una vez logueado, las credenciales quedan guardadas en tu equipo y puedo ejecutar `vercel link`,
`vercel env`, `vercel deploy` y las reglas del WAF sin que ningún secreto pase por el chat.
