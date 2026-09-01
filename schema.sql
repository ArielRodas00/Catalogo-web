-- ============================================================
-- schema.sql — Esquema de base de datos para catalogo-backend
-- ============================================================
-- PostgreSQL 14+
-- ============================================================

-- 1. Productos
CREATE TABLE IF NOT EXISTS productos (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  category        VARCHAR(100) NOT NULL,
  subcategoria    VARCHAR(100) DEFAULT '',
  brand           VARCHAR(100) DEFAULT '',
  image           TEXT DEFAULT '',
  -- fileId de ImageKit (ver imagekit.js) — solo se completa cuando la imagen
  -- principal se subió como archivo (POST /upload-image), no cuando se pegó
  -- una URL externa. No se usa hoy para borrar el archivo viejo al reemplazar
  -- la imagen (no implementado todavía, ver AUDITORIA.md).
  image_imagekit_file_id VARCHAR(255),
  description     TEXT DEFAULT '',
  whatsapp        VARCHAR(50) DEFAULT '',
  en_oferta       BOOLEAN DEFAULT false,
  precio_oferta   NUMERIC(12,2),
  en_stock        BOOLEAN DEFAULT true,
  destacado       BOOLEAN DEFAULT false,
  en_promocion    BOOLEAN DEFAULT false,
  fecha_fin_promo TIMESTAMPTZ,
  stock_cantidad  INTEGER DEFAULT 0,
  stock_minimo    INTEGER DEFAULT 5,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Administradores
CREATE TABLE IF NOT EXISTS administradores (
  id       SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL
);

-- 3. Vistas de productos (métricas)
CREATE TABLE IF NOT EXISTS producto_vistas (
  id          SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  fecha       TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Clicks en WhatsApp (métricas)
CREATE TABLE IF NOT EXISTS whatsapp_clicks (
  id          SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  fecha       TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Búsquedas (métricas)
CREATE TABLE IF NOT EXISTS busquedas (
  id      SERIAL PRIMARY KEY,
  termino VARCHAR(255) NOT NULL,
  fecha   TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Imágenes adicionales de productos
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id          SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  orden       INTEGER DEFAULT 0,
  -- fileId de ImageKit (ver imagekit.js) — solo se completa para imágenes
  -- subidas como archivo (POST .../images/upload), no para las cargadas por
  -- URL externa (POST .../images/url). Hace falta para poder borrar la
  -- imagen de ImageKit cuando se borra la fila.
  imagekit_file_id VARCHAR(255),
  CONSTRAINT uq_producto_imagenes_orden UNIQUE (producto_id, orden)
);

-- Migración idempotente para bases ya existentes.
ALTER TABLE producto_imagenes ADD COLUMN IF NOT EXISTS imagekit_file_id VARCHAR(255);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS image_imagekit_file_id VARCHAR(255);

-- ============================================================
-- Seguridad de las cuentas de administrador
-- ============================================================

-- Momento del último cambio de contraseña. El middleware de autenticación
-- rechaza cualquier token emitido ANTES de esta fecha: así, al cambiar la
-- contraseña se cierran todas las sesiones abiertas, que es justo lo que se
-- necesita si sospechás que alguien vio tu clave. Sin esto, un JWT robado
-- seguiría siendo válido hasta vencer (8hs) aunque cambies la contraseña.
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW();

-- Rol: 'admin' puede todo; 'editor' puede gestionar productos y stock pero no
-- tocar cuentas ni ver métricas del negocio. Por defecto 'admin' para no
-- cambiarle los permisos a nadie que ya exista.
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'admin';

-- Segundo factor (TOTP). Nulo = sin 2FA, que es el estado por defecto: es
-- opcional a propósito, porque para el dueño de un local puede ser fricción.
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255);
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS totp_activo BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- Auditoría: quién hizo qué y cuándo
-- ============================================================
-- El logger de requests registra método, URL y estado, pero no la identidad
-- de quien lo hizo. Sin esta tabla no hay forma de responder "quién borró
-- este producto", que es la primera pregunta cuando un cliente tiene más de
-- un empleado con acceso.
CREATE TABLE IF NOT EXISTS auditoria (
  id         SERIAL PRIMARY KEY,
  usuario    VARCHAR(100),
  usuario_id INTEGER,
  accion     VARCHAR(50)  NOT NULL,
  entidad    VARCHAR(50),
  entidad_id VARCHAR(50),
  detalle    TEXT,
  ip         VARCHAR(64),
  fecha      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON auditoria(entidad, entidad_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_productos_category ON productos(category);
CREATE INDEX IF NOT EXISTS idx_productos_brand ON productos(brand);
CREATE INDEX IF NOT EXISTS idx_productos_en_stock ON productos(en_stock);
CREATE INDEX IF NOT EXISTS idx_producto_vistas_fecha ON producto_vistas(fecha);
CREATE INDEX IF NOT EXISTS idx_whatsapp_clicks_fecha ON whatsapp_clicks(fecha);
CREATE INDEX IF NOT EXISTS idx_busquedas_termino ON busquedas(termino);
CREATE INDEX IF NOT EXISTS idx_producto_imagenes_producto ON producto_imagenes(producto_id);

-- Índices adicionales (auditoría)
CREATE INDEX IF NOT EXISTS idx_productos_created_at ON productos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productos_destacado ON productos(destacado) WHERE destacado = true;
CREATE INDEX IF NOT EXISTS idx_productos_promocion ON productos(en_promocion, fecha_fin_promo) WHERE en_promocion = true;
CREATE INDEX IF NOT EXISTS idx_producto_vistas_producto ON producto_vistas(producto_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_clicks_producto ON whatsapp_clicks(producto_id);
CREATE INDEX IF NOT EXISTS idx_productos_category_subcategoria ON productos(category, subcategoria);

-- ============================================================
-- Bloqueo por cuenta ante intentos fallidos
-- ============================================================
-- El límite de express-rate-limit cuenta POR IP y en la memoria del proceso.
-- En serverless eso es débil por partida doble: las instancias se reciclan (y
-- con ellas el contador), y un atacante con muchas IPs lo esquiva entero.
-- Este contador vive en la base y es POR CUENTA, así que no depende de la IP
-- ni de qué instancia atienda el request.
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;
