-- ============================================================
-- panel-central/schema.sql — super-admins, clientes y pagos
-- ============================================================

CREATE TABLE IF NOT EXISTS administradores (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  -- Qué producto es este cliente — separa la tabla en dos negocios distintos
  -- que comparten el mismo Panel Central. 'catalogo' es el default para no
  -- romper las filas ya cargadas antes de que este campo existiera.
  producto VARCHAR(20) NOT NULL DEFAULT 'catalogo' CHECK (producto IN ('catalogo', 'lavadero360')),
  plan VARCHAR(20) NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico', 'premium')),
  estado VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'vencido', 'suspendido')),
  api_key VARCHAR(64) UNIQUE NOT NULL,
  deploy_url VARCHAR(255),
  fecha_proximo_cobro DATE,
  notas TEXT,
  -- Solo para producto='lavadero360': el slug con el que ese dueño ya se
  -- registró en Lavadero360 (self-signup, ver signup.service.ts allá). El
  -- Panel Central NO crea la cuenta — la cuenta ya existe con su propio
  -- período de prueba; acá solo se administra el pago y el corte de acceso.
  -- Se sincroniza contra la API de Lavadero360 cuando cambia `estado`.
  lavadero360_org_slug VARCHAR(50),
  -- Marca del catálogo de este cliente, editable acá en vez de en variables de
  -- entorno de Render (ver AUDITORIA.md, "Branding desde el Panel Central").
  -- Todo NULL = el catálogo usa sus propios defaults/variables de entorno; lo
  -- que esté cargado acá pisa esos defaults.
  logo_type VARCHAR(10) NOT NULL DEFAULT 'texto' CHECK (logo_type IN ('texto', 'imagen')),
  store_name VARCHAR(150),
  store_name_accent VARCHAR(150),
  logo_image_data TEXT,
  logo_image_mime VARCHAR(50),
  favicon_url VARCHAR(500),
  color_primary VARCHAR(7),
  color_primary_hover VARCHAR(7),
  color_accent VARCHAR(7),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Migración idempotente para bases ya existentes (creadas antes de agregar
-- estas columnas) — CREATE TABLE IF NOT EXISTS de arriba no las agrega solo.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logo_type VARCHAR(10) NOT NULL DEFAULT 'texto' CHECK (logo_type IN ('texto', 'imagen'));
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS store_name VARCHAR(150);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS store_name_accent VARCHAR(150);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logo_image_data TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS logo_image_mime VARCHAR(50);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS favicon_url VARCHAR(500);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS color_primary VARCHAR(7);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS color_primary_hover VARCHAR(7);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS color_accent VARCHAR(7);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS producto VARCHAR(20) NOT NULL DEFAULT 'catalogo' CHECK (producto IN ('catalogo', 'lavadero360'));
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lavadero360_org_slug VARCHAR(50);

CREATE TABLE IF NOT EXISTS pagos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  monto NUMERIC(12, 2) NOT NULL CHECK (monto >= 0),
  moneda VARCHAR(3) NOT NULL DEFAULT 'PYG',
  metodo VARCHAR(30) NOT NULL DEFAULT 'transferencia',
  notas TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_slug ON clientes(slug);
CREATE INDEX IF NOT EXISTS idx_clientes_api_key ON clientes(api_key);
CREATE INDEX IF NOT EXISTS idx_clientes_producto ON clientes(producto);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente ON pagos(cliente_id);
