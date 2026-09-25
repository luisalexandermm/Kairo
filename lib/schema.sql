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
  hero_headline   TEXT DEFAULT 'Nike · Jordan · Adidas · Timberland',
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
