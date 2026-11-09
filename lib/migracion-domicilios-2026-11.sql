-- Domicilios en Quibdó por barrio (noviembre 2026)
-- Guarda la lista de barrios con su precio de domicilio (máximo $10.000) y el precio
-- para "otro barrio". Se edita desde el panel: Ajustes → Domicilios en Quibdó.
-- Ejecútalo una vez en el editor SQL de Supabase.
alter table settings add column if not exists domicilios jsonb default '{"barrios": [], "otro": 10000}'::jsonb;
update settings set domicilios = '{"barrios": [], "otro": 10000}'::jsonb where id = 'app' and domicilios is null;
