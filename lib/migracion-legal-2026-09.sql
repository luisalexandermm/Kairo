-- ============================================================
--  kAIRO — actualización legal y de seguridad (septiembre 2026)
--  Ejecútalo UNA vez en: Supabase → SQL Editor → New query → Run
--  Es seguro ejecutarlo aunque ya tengas datos: no borra nada.
-- ============================================================

-- 1) Tabla de PQR (peticiones, quejas y reclamos) con número de radicado.
--    La Ley 2439 de 2024 exige que las quejas de comercio electrónico tengan
--    un número de radicado y se puedan rastrear.
CREATE TABLE IF NOT EXISTS pqrs (
  id           TEXT PRIMARY KEY,              -- número de radicado, ej. PQR-20260925-AB12C
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
CREATE INDEX IF NOT EXISTS pqrs_estado ON pqrs (estado, created_at DESC);

-- 2) Activar Row Level Security en TODAS las tablas.
--    La API del sitio usa la clave service_role, que no se ve afectada.
--    Sin esto, cualquiera que tenga la clave "anon" pública de tu proyecto
--    podría leer los pedidos (nombres, celulares, direcciones, cédulas).
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqrs     ENABLE ROW LEVEL SECURITY;
