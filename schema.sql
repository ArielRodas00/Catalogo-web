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
  CONSTRAINT uq_producto_imagenes_orden UNIQUE (producto_id, orden)
);

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
