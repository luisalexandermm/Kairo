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
  active      BOOLEAN DEFAULT true,
  position    INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  customer    JSONB DEFAULT '{}',
  items       JSONB DEFAULT '[]',
  total       BIGINT DEFAULT 0,
  status      TEXT DEFAULT 'Nuevo',
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
  hero_headline   TEXT DEFAULT 'Nike · Jordan · Adidas · Puma',
  shipping_note   TEXT DEFAULT 'Envíos a toda Colombia · 2 a 5 días hábiles',
  admin_password  TEXT DEFAULT 'kairo2026',  -- ⚠️ cámbiala en el panel el primer día
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fila de ajustes por defecto
INSERT INTO settings (id) VALUES ('app') ON CONFLICT (id) DO NOTHING;

-- PQR (peticiones, quejas y reclamos) con número de radicado
CREATE TABLE IF NOT EXISTS pqrs (
  id           TEXT PRIMARY KEY,
  tipo         TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  celular      TEXT DEFAULT '',
  correo       TEXT DEFAULT '',
  pedido       TEXT DEFAULT '',
  mensaje      TEXT NOT NULL,
  estado       TEXT DEFAULT 'Radicada',
  respuesta    TEXT DEFAULT '',
  autorizacion JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: nadie con la clave pública "anon" puede leer ni escribir.
-- La API usa la clave service_role, que sí tiene acceso.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqrs     ENABLE ROW LEVEL SECURITY;

-- Índices útiles
CREATE INDEX IF NOT EXISTS products_active  ON products (active, position);
CREATE INDEX IF NOT EXISTS products_brand   ON products (brand);
CREATE INDEX IF NOT EXISTS orders_status    ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS pqrs_estado      ON pqrs (estado, created_at DESC);


-- ============================================================
--  kAIRO — categorías, promociones con descuento real, cupones,
--  anuncios y dinámicas (octubre 2026)
--  Ejecútalo UNA vez en: Supabase → SQL Editor → New query → Run
--  Requiere haber ejecutado antes lib/migracion-legal-2026-09.sql
--  Es seguro ejecutarlo con datos: no borra nada.
-- ============================================================

-- 1) Productos: categoría y género (las marcas ya son texto libre)
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Tenis';   -- Tenis, Sandalias, Chanclas, Botas…
ALTER TABLE products ADD COLUMN IF NOT EXISTS gender   TEXT DEFAULT 'Unisex';  -- Hombre, Mujer, Unisex
UPDATE products SET category = 'Botas' WHERE shape = 's-boot' AND (category IS NULL OR category = 'Tenis');
CREATE INDEX IF NOT EXISTS products_category ON products (category);

-- 2) Promociones: tipo, alcance, vigencia y condiciones
--    kind: 'informativa' (solo aviso), 'descuento' (baja el precio en la tienda y en el pedido),
--          'envio' (envío gratis desde un valor mínimo)
--    Las promociones que ya existían quedan como 'informativa' para que ninguna empiece
--    a descontar sola sin que tú lo decidas.
ALTER TABLE promos ADD COLUMN IF NOT EXISTS kind         TEXT DEFAULT 'informativa';
ALTER TABLE promos ADD COLUMN IF NOT EXISTS scope_type   TEXT DEFAULT 'todo';   -- todo, marca, categoria, genero, producto
ALTER TABLE promos ADD COLUMN IF NOT EXISTS scope_value  TEXT DEFAULT '';
ALTER TABLE promos ADD COLUMN IF NOT EXISTS min_subtotal BIGINT DEFAULT 0;
ALTER TABLE promos ADD COLUMN IF NOT EXISTS starts_at    TIMESTAMPTZ;
ALTER TABLE promos ADD COLUMN IF NOT EXISTS ends_at      TIMESTAMPTZ;
ALTER TABLE promos ADD COLUMN IF NOT EXISTS conditions   TEXT DEFAULT '';
UPDATE promos SET kind = 'informativa' WHERE kind IS NULL;

-- 3) Cupones
CREATE TABLE IF NOT EXISTS coupons (
  code          TEXT PRIMARY KEY,               -- en MAYÚSCULAS, ej. KAIRO10
  description   TEXT DEFAULT '',
  type          TEXT NOT NULL DEFAULT 'porcentaje', -- porcentaje, valor, envio
  value         BIGINT NOT NULL DEFAULT 0,      -- % o pesos según el tipo
  max_discount  BIGINT DEFAULT 0,               -- tope en pesos para cupones de %, 0 = sin tope
  min_subtotal  BIGINT DEFAULT 0,
  max_uses      INT DEFAULT 0,                  -- 0 = ilimitado
  uses          INT DEFAULT 0,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  conditions    TEXT DEFAULT '',
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Anuncios: banners de la portada, barra superior y dinámicas
CREATE TABLE IF NOT EXISTS announcements (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL DEFAULT 'banner', -- banner, barra, dinamica
  title         TEXT NOT NULL DEFAULT '',
  subtitle      TEXT DEFAULT '',
  button_text   TEXT DEFAULT '',
  link_type     TEXT DEFAULT 'ninguno',         -- ninguno, producto, categoria, marca, url, whatsapp
  link_value    TEXT DEFAULT '',
  image         TEXT DEFAULT '',
  color         TEXT DEFAULT '',
  conditions    TEXT DEFAULT '',                -- bases y condiciones (obligatorias en dinámicas)
  has_chance    BOOLEAN DEFAULT false,          -- ¿el ganador se elige por sorteo/azar?
  coljuegos_ref TEXT DEFAULT '',                -- número de autorización de Coljuegos si hay azar
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  active        BOOLEAN DEFAULT true,
  position      INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS announcements_kind ON announcements (kind, active, position);

-- 5) Pedidos: detalle del precio (subtotal, descuentos, cupón, envío)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing JSONB DEFAULT '{}';

-- 6) Seguridad: las tablas nuevas tampoco se pueden leer con la clave pública "anon"
ALTER TABLE coupons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
