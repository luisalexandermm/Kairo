# kAIRO Sneakers — tienda + panel

Tienda en HTML/CSS/JS, funciones serverless en `api/` (Vercel) y base de datos en Supabase.

## Qué hay nuevo (29 de octubre de 2026)
- **Logos nuevos** en el encabezado, el ícono de la app (PWA), el favicon, el recibo y el panel.
- **Pantalla de carga con GSAP** (“Cargando tu experiencia · KAIRO Sneakers · Arma tu estilo”): el tenis del logo se arma pieza por pieza mientras carga el catálogo. Reemplaza la intro 3D en la web y en la PWA. Respeta “reducir movimiento” y nunca bloquea más de 5 s.
  - Fuente: `src/loader.js` → `npm install && npm run build:loader` genera `public/js/loader.js`.
- **Pago por Nequi con QR** (`public/img/nequi-qr.png`, titular Luis Moreno, llave @3145312045): al confirmar el pedido se muestra el QR, el valor exacto y botones para copiar llave, valor y número de pedido. El cliente sube una foto JPG, PNG o WEBP del comprobante (obligatoria; ya no se pide número de referencia); se guarda en un bucket privado de Supabase y se abre desde el panel autenticado o, con enlace temporal, desde el seguimiento del pedido (número + últimos 4 dígitos), donde el cliente también puede descargarla.
- **La compra no se pierde**: el carrito y el pedido en curso se guardan en el navegador; si la página se recarga o el cliente cambia a la app de Nequi, al volver aparece otra vez la pantalla de pago. Mientras paga, se bloquea “jalar para recargar” y el navegador avisa antes de cerrar.
- **Números de pedido** `KS-AAAAMMDD-####`, **recibo** (`/recibo.html`) y **seguimiento** (`/seguimiento.html`) con número + últimos 4 dígitos del celular.
- **Panel → Pedidos**: estado por etapas (Recibido → Pago confirmado → En preparación → Enviado → Entregado), guía, transportadora, mensaje al cliente, recibo imprimible, enlace de seguimiento y WhatsApp.
- **“Sin caja”** en todas las tarjetas, el detalle, el carrito, el resumen de compra, el recibo y el mensaje de WhatsApp.
- **Hombre / Mujer**: tarjetas grandes con conteo, encabezado del género con sub-filtros por tipo (tenis, sandalias, chanclas, botas). Los filtros de género y categoría se combinan.

## Instalación
1. En Supabase → SQL Editor ejecuta, en orden: `lib/schema.sql` (solo si es una base nueva), `lib/migracion-legal-2026-09.sql`, `lib/migracion-promos-2026-10.sql`, `lib/migracion-pedidos-2026-10b.sql` (también crea el bucket privado para las fotos de comprobantes).
2. Copia `.env.example` a `.env` y llénalo. En Vercel pon las mismas variables.
3. `npm install` y `npm run dev` → http://localhost:3000 (panel en `/admin.html`).
4. Opcional: `npm run seed` carga el catálogo de ejemplo.

## Antes de publicar
- Llena los datos legales en `public/js/negocio.js` (aparecen como [COMPLETAR] hasta que lo hagas). Ver `PENDIENTES-LEGALES.md`.
- Cambia la contraseña del panel (Ajustes) y **rota la clave service de Supabase** si alguna vez estuvo en un zip o repositorio.
- El recibo no es factura electrónica de la DIAN.
