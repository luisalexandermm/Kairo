-- ============================================================
--  kAIRO — migración del 29 de octubre de 2026
--  Seguimiento de pedidos (estados, guía, transportadora, nota al cliente)
--  y números de pedido legibles KS-AAAAMMDD-####.
--  Ejecútala una vez en Supabase → SQL Editor. Se puede repetir sin daño.
--  Sin esta migración funcionan los pedidos, pero no se podrán subir comprobantes.
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking JSONB DEFAULT '{}';
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'Recibido';
-- Estados antiguos → nuevos
UPDATE orders SET status = 'Recibido'        WHERE status = 'Nuevo';
UPDATE orders SET status = 'Pago confirmado' WHERE status = 'Confirmado';
CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at DESC);

-- Recibos de transferencia: bucket privado; solo el servidor puede firmar enlaces temporales.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kairo-comprobantes', 'kairo-comprobantes', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];
