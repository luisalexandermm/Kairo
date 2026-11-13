-- ============================================================
--  Punto Club — fotos en cupones y promociones (noviembre 2026)
--  - Promociones y cupones pueden llevar una foto.
--  - Los cupones marcados como "públicos" se muestran en la tienda
--    (sección "Cupones para ti"); los demás siguen siendo secretos.
--  - "popup": se muestra en una ventana al entrar a la tienda.
--  Ejecútalo una vez en Supabase → SQL Editor. Se puede repetir sin daño.
-- ============================================================

alter table promos  add column if not exists image   text    default '';
alter table promos  add column if not exists popup   boolean default false;

alter table coupons add column if not exists image   text    default '';
alter table coupons add column if not exists publico boolean default false;
alter table coupons add column if not exists popup   boolean default false;
