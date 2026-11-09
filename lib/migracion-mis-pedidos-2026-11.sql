-- "Mis pedidos" (noviembre 2026)
-- Los pedidos nuevos guardan customer.clienteId (hash del identificador anónimo del dispositivo).
-- No requiere columnas nuevas; este índice solo acelera la consulta de /api/mis-pedidos.
-- Ejecútalo una vez en el editor SQL de Supabase (es opcional pero recomendado).
create index if not exists orders_cliente_id_idx on orders ((customer->>'clienteId'));
