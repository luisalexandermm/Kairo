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

## Pasarela de pago Wompi y entregas solo en Quibdó (9 de noviembre de 2026)
- **Por ahora los pedidos son solo para Quibdó**: el formulario ya no pregunta local/nacional; ciudad (Quibdó) y departamento (Chocó) vienen fijos y el servidor rechaza cualquier otra ciudad.
- **Pago por transferencia o QR en varias cuentas** (Nequi, Bancolombia, Daviplata…): se agregan en **Panel → Ajustes → Cuentas para recibir pagos**, cada una con titular, número y foto del QR. Al pagar, el cliente elige desde qué app paga y ve ese QR. Sin cuentas guardadas se usa la de `public/js/negocio.js`.
- **Por ahora NO se usa Wompi.** Sin sus llaves la opción no aparece en la tienda ni en el panel; los clientes pagan por Nequi (QR), contraentrega (domicilio) o al recoger (separar). El código queda listo por si algún día se activa:
- **Pago en línea con Wompi** (tarjeta, PSE, Nequi, Bancolombia). Es la opción por defecto cuando está configurada; Nequi con QR y contraentrega siguen disponibles.
  - El link de pago se firma en el servidor (`lib/wompi.js`), así el cliente no puede cambiar el valor.
  - El pedido pasa solo a **Pago confirmado** cuando Wompi responde `APPROVED` y el valor coincide (se consulta la API de Wompi; no se confía en la URL de regreso).
  - Si el pago se rechaza, el cliente puede intentarlo de nuevo desde la misma pantalla o desde Mis pedidos.
- **Configurar** (comercios.wompi.co → Desarrolladores): pon `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` y `SITE_URL` en Vercel, y en Wompi registra la URL de eventos `https://TU_DOMINIO/api/wompi`. Prueba primero con las llaves `pub_test_…` (sandbox) y luego cámbialas por las `pub_prod_…`.

### Recoger en la tienda o domicilio por barrio
- Al comprar, el cliente elige entre **Recoger en la tienda** (gratis) y **Domicilio en Quibdó** (precio según el barrio, **máximo $10.000**; el servidor nunca cobra más).
- Si recoge, puede **separar y pagar al recoger**: el pedido queda registrado sin pago adelantado. Si pide domicilio, la contraentrega cobra el valor del domicilio por Nequi y el resto al recibir.
- Los barrios y precios se editan en **Panel → Ajustes → Domicilios en Quibdó**. Antes ejecuta `lib/migracion-domicilios-2026-11.sql` en Supabase. Mientras no haya barrios guardados, se usa la lista de barrios de Quibdó de `lib/barrios-quibdo.js` (≈130 barrios por comuna: Comuna 3 cerca, Comunas 1, 2, 4 y 5 distancia media, Comuna 6 lejos), que puedes ajustar y guardar desde el panel.

## Instalación
1. En Supabase → SQL Editor ejecuta, en orden: `lib/schema.sql` (solo si es una base nueva), `lib/migracion-legal-2026-09.sql`, `lib/migracion-promos-2026-10.sql`, `lib/migracion-pedidos-2026-10b.sql` (también crea el bucket privado para las fotos de comprobantes).
2. Copia `.env.example` a `.env` y llénalo. En Vercel pon las mismas variables.
3. `npm install` y `npm run dev` → http://localhost:3000 (panel en `/admin.html`).
4. Opcional: `npm run seed` carga el catálogo de ejemplo.

## Antes de publicar
- Llena los datos legales en `public/js/negocio.js` (aparecen como [COMPLETAR] hasta que lo hagas). Ver `PENDIENTES-LEGALES.md`.
- Cambia la contraseña del panel (Ajustes) y **rota la clave service de Supabase** si alguna vez estuvo en un zip o repositorio.
- El recibo no es factura electrónica de la DIAN.
