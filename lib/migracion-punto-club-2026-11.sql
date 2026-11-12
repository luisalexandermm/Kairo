-- ============================================================
--  Punto Club — migración de noviembre 2026
--  - kAIRO pasa a llamarse Punto Club.
--  - Por ahora solo se hacen envíos nacionales con una tarifa fija
--    (se edita en el panel: Ajustes → Envío nacional).
--  Ejecútalo una vez en el editor SQL de Supabase.
--  Los buckets de imágenes (kairo-images, kairo-comprobantes) NO se renombran:
--  las fotos y comprobantes ya guardados siguen funcionando.
-- ============================================================

alter table settings add column if not exists envio_nacional integer default 25000;
update settings set envio_nacional = 25000 where id = 'app' and envio_nacional is null;

update settings set
  store_name    = 'Punto Club',
  tagline       = 'Sneakers',
  shipping_note = 'Envíos a toda Colombia'
where id = 'app';

alter table settings alter column store_name set default 'Punto Club';
