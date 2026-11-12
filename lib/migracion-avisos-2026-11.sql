-- ============================================================
--  Punto Club — avisos de pedidos en el celular (noviembre 2026)
--  Guarda los dispositivos que activaron las notificaciones de la app.
--  Solo el servidor (clave service) lee y escribe esta tabla.
--  Ejecútalo una vez en el editor SQL de Supabase. No toca nada más.
-- ============================================================

create table if not exists push_subs (
  endpoint    text primary key,          -- dirección del servicio de notificaciones del navegador
  p256dh      text not null,             -- llaves para cifrar el aviso
  auth        text not null,
  cliente     text,                      -- hash del dispositivo (el mismo de "Mis pedidos")
  pedidos     text[] not null default '{}', -- pedidos agregados a mano en ese dispositivo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subs_cliente on push_subs (cliente);
create index if not exists push_subs_pedidos on push_subs using gin (pedidos);

-- Seguridad: nadie desde el navegador puede leerla (sin políticas = solo el servidor)
alter table push_subs enable row level security;
