-- ============================================================
--  Punto Club — opiniones de clientes (noviembre 2026)
--  Solo pueden opinar compradores con el pedido Entregado (compra verificada),
--  una opinión por cada producto del pedido. Se publican solas; desde el panel
--  se pueden ocultar (solo si son ofensivas o tienen datos personales) y responder.
--  Ejecútalo una vez en Supabase → SQL Editor. Se puede repetir sin daño.
-- ============================================================

create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     text not null references orders(id) on delete cascade,
  product_id   text not null,
  rating       smallint not null check (rating between 1 and 5),   -- calificación general
  envio        smallint check (envio between 1 and 5),             -- rapidez del envío
  calidad      smallint check (calidad between 1 and 5),           -- calidad del zapato
  llego_bien   boolean,                                            -- ¿llegó en buen estado?
  talla_ajuste text check (talla_ajuste in ('pequena', 'justa', 'grande')),
  comentario   text not null default '',
  fotos        text[] not null default '{}',                       -- enlaces públicos (máx. 3)
  nombre       text not null default '',                           -- "Ana P." (nunca el nombre completo)
  ciudad       text not null default '',
  talla        text,
  color        text,
  estado       text not null default 'publicada' check (estado in ('publicada', 'oculta')),
  respuesta    text,                                               -- respuesta pública de la tienda
  respuesta_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (order_id, product_id)
);

create index if not exists reviews_producto on reviews (product_id, estado, created_at desc);
create index if not exists reviews_creadas on reviews (created_at desc);

-- Seguridad: solo el servidor lee y escribe (la tienda las pide a /api/opiniones)
alter table reviews enable row level security;

-- Fotos de las opiniones: bucket público (se muestran en la tienda), máx. 1 MB, solo imágenes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('punto-club-opiniones', 'punto-club-opiniones', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
