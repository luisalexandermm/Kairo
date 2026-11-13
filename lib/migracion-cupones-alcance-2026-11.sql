-- ============================================================
--  Punto Club — cupones para ciertos productos (noviembre 2026)
--  Un cupón puede servir solo para una marca, categoría, género, un producto
--  o los modelos cuyo nombre contiene una palabra (p. ej. "SB" → Nike SB).
--  Si el carrito no tiene esos productos, el cupón no aplica, y el descuento y la
--  compra mínima se calculan solo sobre ellos.
--  Además, las promociones pueden ser de tipo "segunda" (segunda unidad con descuento).
--  Ejecútalo una vez en Supabase → SQL Editor. Se puede repetir sin daño.
-- ============================================================

alter table coupons add column if not exists scope_type  text default 'todo';
alter table coupons add column if not exists scope_value text default '';
