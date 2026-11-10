-- Domicilios en Quibdó por distancia del barrio (noviembre 2026)
-- Zonas Cerca / Distancia media / Lejos con su precio (mínimo $4.000, máximo $10.000)
-- y la lista de barrios asignados a cada zona. Se edita desde el panel: Ajustes → Domicilios en Quibdó.
-- Ejecútalo una vez en el editor SQL de Supabase.
alter table settings add column if not exists domicilios jsonb default '{"zonas": [{"id": "cerca", "precio": 4000}, {"id": "media", "precio": 7000}, {"id": "lejos", "precio": 10000}], "barrios": [], "otroZona": "lejos"}'::jsonb;
update settings set domicilios = '{"zonas": [{"id": "cerca", "precio": 4000}, {"id": "media", "precio": 7000}, {"id": "lejos", "precio": 10000}], "barrios": [], "otroZona": "lejos"}'::jsonb
  where id = 'app' and domicilios is null;

-- Cuentas para recibir pagos por transferencia o QR (Nequi, Bancolombia, Daviplata…).
-- Se editan desde el panel: Ajustes → Cuentas para recibir pagos.
alter table settings add column if not exists pagos jsonb default '{"cuentas": []}'::jsonb;
