-- ============================================================
--  kAIRO — migración de octubre 2026
--  Categorías y géneros, promociones que sí descuentan, cupones,
--  anuncios (banners, barra superior y dinámicas) y desglose de precios del pedido.
--  Ejecútala una vez en Supabase → SQL Editor. Se puede repetir sin daño.
-- ============================================================

-- Productos: categoría y género
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Tenis';   -- Tenis | Sandalias | Chanclas | Botas
ALTER TABLE products ADD COLUMN IF NOT EXISTS gender   TEXT DEFAULT 'Unisex';  -- Hombre | Mujer | Unisex
UPDATE products SET category = 'Botas' WHERE shape = 's-boot' AND (category IS NULL OR category = 'Tenis');
CREATE INDEX IF NOT EXISTS products_cat ON products (category, gender);

-- Promociones con reglas
ALTER TABLE promos ADD COLUMN IF NOT EXISTS kind         TEXT DEFAULT 'informativa'; -- descuento | envio | informativa
ALTER TABLE promos ADD COLUMN IF NOT EXISTS scope_type   TEXT DEFAULT 'todo';        -- todo | marca | categoria | genero | producto
ALTER TABLE promos ADD COLUMN IF NOT EXISTS scope_value  TEXT DEFAULT '';
ALTER TABLE promos ADD COLUMN IF NOT EXISTS min_subtotal BIGINT DEFAULT 0;
ALTER TABLE promos ADD COLUMN IF NOT EXISTS starts_at    TIMESTAMPTZ;
ALTER TABLE promos ADD COLUMN IF NOT EXISTS ends_at      TIMESTAMPTZ;
ALTER TABLE promos ADD COLUMN IF NOT EXISTS conditions   TEXT DEFAULT '';

-- Cupones
CREATE TABLE IF NOT EXISTS coupons (
  code         TEXT PRIMARY KEY,
  description  TEXT DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'porcentaje', -- porcentaje | valor | envio
  value        BIGINT DEFAULT 0,
  max_discount BIGINT DEFAULT 0,
  min_subtotal BIGINT DEFAULT 0,
  max_uses     INT DEFAULT 0,                      -- 0 = sin límite
  uses         INT DEFAULT 0,
  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,
  conditions   TEXT DEFAULT '',
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Anuncios: banners del carrusel, barra superior y dinámicas
CREATE TABLE IF NOT EXISTS announcements (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL DEFAULT 'banner',   -- banner | barra | dinamica
  title         TEXT NOT NULL DEFAULT '',
  subtitle      TEXT DEFAULT '',
  button_text   TEXT DEFAULT '',
  link_type     TEXT DEFAULT 'ninguno',           -- ninguno | marca | categoria | genero | producto | url
  link_value    TEXT DEFAULT '',
  image         TEXT DEFAULT '',
  color         TEXT DEFAULT '#0e4d38',
  conditions    TEXT DEFAULT '',                  -- bases de la dinámica
  has_chance    BOOLEAN DEFAULT false,            -- ¿el ganador se elige al azar? (sorteo/rifa → Coljuegos)
  coljuegos_ref TEXT DEFAULT '',
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  active        BOOLEAN DEFAULT true,
  position      INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Desglose de precios guardado con cada pedido
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing JSONB;

ALTER TABLE coupons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
