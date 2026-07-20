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
  plan VARCHAR(20) NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico', 'premium')),
  estado VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'vencido', 'suspendido')),
  api_key VARCHAR(64) UNIQUE NOT NULL,
  deploy_url VARCHAR(255),
  fecha_proximo_cobro DATE,
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_pagos_cliente ON pagos(cliente_id);
