-- ============================================================
--  kAIRO — migración legal (septiembre 2026)
--  Tabla de PQR (peticiones, quejas, reclamos, retracto, reversión, garantía)
--  Ejecútala una vez en Supabase → SQL Editor. Se puede repetir sin daño.
-- ============================================================
CREATE TABLE IF NOT EXISTS pqrs (
  id           TEXT PRIMARY KEY,          -- número de radicado PQR-AAAAMMDD-XXXXX
  tipo         TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  celular      TEXT DEFAULT '',
  correo       TEXT DEFAULT '',
  pedido       TEXT DEFAULT '',
  mensaje      TEXT NOT NULL,
  estado       TEXT DEFAULT 'Radicada',
  respuesta    TEXT DEFAULT '',
  autorizacion JSONB DEFAULT '{}',        -- prueba de la autorización de datos (Ley 1581)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pqrs ADD COLUMN IF NOT EXISTS respuesta TEXT DEFAULT '';
ALTER TABLE pqrs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS pqrs_estado ON pqrs (estado, created_at DESC);

-- Seguridad: la tienda solo habla con la base de datos desde el servidor (clave service_role).
-- Con RLS activo y sin políticas, nadie con la clave pública (anon) puede leer ni escribir.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqrs     ENABLE ROW LEVEL SECURITY;
