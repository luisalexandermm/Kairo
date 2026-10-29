-- ============================================================
--  kAIRO — migración del 29 de octubre de 2026
--  Seguimiento de pedidos (estados, guía, transportadora, nota al cliente)
--  y números de pedido legibles KS-AAAAMMDD-####.
--  Ejecútala una vez en Supabase → SQL Editor. Se puede repetir sin daño.
--  Si no la ejecutas, la tienda igual funciona: guarda el seguimiento dentro de "customer".
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking JSONB DEFAULT '{}';
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'Recibido';
-- Estados antiguos → nuevos
UPDATE orders SET status = 'Recibido'        WHERE status = 'Nuevo';
UPDATE orders SET status = 'Pago confirmado' WHERE status = 'Confirmado';
CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at DESC);
