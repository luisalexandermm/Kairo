-- ============================================================
--  kAIRO — esquema de base de datos
--  Pega esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Productos
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  brand       TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL DEFAULT '',
  price       BIGINT NOT NULL DEFAULT 0,
  sale_price  BIGINT,
  tag         TEXT DEFAULT '',
  description TEXT DEFAULT '',
  sizes       JSONB DEFAULT '[]',
  colors      JSONB DEFAULT '[]',
  image       TEXT DEFAULT '',
  shape       TEXT DEFAULT 's-low',
  category    TEXT DEFAULT 'Tenis',      -- Tenis | Sandalias | Chanclas | Botas
  gender      TEXT DEFAULT 'Unisex',     -- Hombre | Mujer | Unisex
  shoe_color  TEXT DEFAULT '#1d2733',
  bg          TEXT DEFAULT '#f3ece3',
  stock       INT DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  featured    BOOLEAN DEFAULT false,
  position    INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Promociones
CREATE TABLE IF NOT EXISTS promos (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  badge       TEXT DEFAULT '',
  discount    INT DEFAULT 0,
  scope       TEXT DEFAULT 'Todos',
  kind        TEXT DEFAULT 'informativa', -- descuento | envio | informativa
  scope_type  TEXT DEFAULT 'todo',
  scope_value TEXT DEFAULT '',
  min_subtotal BIGINT DEFAULT 0,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  conditions  TEXT DEFAULT '',
  active      BOOLEAN DEFAULT true,
  position    INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,           -- KS-AAAAMMDD-####
  customer    JSONB DEFAULT '{}',
  items       JSONB DEFAULT '[]',
  total       BIGINT DEFAULT 0,
  status      TEXT DEFAULT 'Recibido',    -- Recibido | Pago confirmado | En preparación | Enviado | Entregado | Cancelado
  pricing     JSONB,
  tracking    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Ajustes (una sola fila, id='app')
CREATE TABLE IF NOT EXISTS settings (
  id              TEXT PRIMARY KEY DEFAULT 'app',
  store_name      TEXT DEFAULT 'kAIRO',
  tagline         TEXT DEFAULT 'Sneaker Store',
  whatsapp        TEXT DEFAULT '573145312045',
  hero_word       TEXT DEFAULT 'SNEAKERS',
  hero_theme      TEXT DEFAULT 'indigo',
  hero_logo       TEXT DEFAULT '',
  hero_headline   TEXT DEFAULT 'Nike · Jordan · Adidas · Puma · New Balance',
  shipping_note   TEXT DEFAULT 'Envíos a toda Colombia · 2 a 5 días hábiles',
  admin_password  TEXT DEFAULT 'kairo2026',  -- ¡cámbiala desde el panel (Ajustes) apenas entres!
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fila de ajustes por defecto
INSERT INTO settings (id) VALUES ('app') ON CONFLICT (id) DO NOTHING;

-- Índices útiles
CREATE INDEX IF NOT EXISTS products_active  ON products (active, position);
CREATE INDEX IF NOT EXISTS products_brand   ON products (brand);
CREATE INDEX IF NOT EXISTS orders_status    ON orders (status, created_at DESC);

-- ------------------------------------------------------------
--  Tablas de PQR, cupones y anuncios, y seguridad (RLS):
--  ejecuta también, en este orden:
--    lib/migracion-legal-2026-09.sql
--    lib/migracion-promos-2026-10.sql
--    lib/migracion-pedidos-2026-10b.sql
-- ------------------------------------------------------------
