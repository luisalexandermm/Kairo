# Punto Club — tienda + panel

> Antes se llamaba **kAIRO Sneakers**. El cambio de nombre es del 11 de noviembre de 2026.

Tienda en HTML/CSS/JS, funciones serverless en `api/` (Vercel) y base de datos en Supabase.

## Qué hay nuevo (29 de octubre de 2026)
- **Logos nuevos** en el encabezado, el ícono de la app (PWA), el favicon, el recibo y el panel.
- **Pantalla de carga con GSAP** (“Cargando tu experiencia · Punto Club · Arma tu estilo”): el tenis del logo se arma pieza por pieza mientras carga el catálogo. Reemplaza la intro 3D en la web y en la PWA. Respeta “reducir movimiento” y nunca bloquea más de 5 s.
  - Fuente: `src/loader.js` → `npm install && npm run build:loader` genera `public/js/loader.js`.
- **Pago por Nequi con QR** (`public/img/nequi-qr.png`, titular Luis Moreno, llave @3145312045): al confirmar el pedido se muestra el QR, el valor exacto y botones para copiar llave, valor y número de pedido. El cliente sube una foto JPG, PNG o WEBP del comprobante (obligatoria; ya no se pide número de referencia); se guarda en un bucket privado de Supabase y se abre desde el panel autenticado o, con enlace temporal, desde el seguimiento del pedido (número + últimos 4 dígitos), donde el cliente también puede descargarla.
- **La compra no se pierde**: el carrito y el pedido en curso se guardan en el navegador; si la página se recarga o el cliente cambia a la app de Nequi, al volver aparece otra vez la pantalla de pago. Mientras paga, se bloquea “jalar para recargar” y el navegador avisa antes de cerrar.
- **Números de pedido** `KS-AAAAMMDD-####`, **recibo** (`/recibo.html`) y **seguimiento** (`/seguimiento.html`) con número + últimos 4 dígitos del celular.
- **Panel → Pedidos**: estado por etapas (Recibido → Pago confirmado → En preparación → Enviado → Entregado), guía, transportadora, mensaje al cliente, recibo imprimible, enlace de seguimiento y WhatsApp.
- **“Sin caja”** en todas las tarjetas, el detalle, el carrito, el resumen de compra, el recibo y el mensaje de WhatsApp.
- **Hombre / Mujer**: tarjetas grandes con conteo, encabezado del género con sub-filtros por tipo (tenis, sandalias, chanclas, botas). Los filtros de género y categoría se combinan.

## Punto Club: nuevo nombre, envíos nacionales y pago solo por QR (11 de noviembre de 2026)
- **Nuevo nombre y logo.** kAIRO pasa a llamarse **Punto Club** en la tienda, la PWA (nombre, ícono, favicon), el panel, el recibo, los mensajes de WhatsApp y las páginas legales.
  - Logo: “PUNTO ● CLUB” con el punto lima de la marca y “SNEAKERS” debajo (`public/img/punto-club-negro.png` para fondos claros, `punto-club-blanco.png` para oscuros). Ícono de la app: una “P.” negra sobre lima.
  - Los íconos y favicons llevan el prefijo `pc-` (`pc-icon-192.png`, `pc-favicon.ico`…) y hay una copia de `favicon.ico` en la raíz de `public/`: al tener nombres nuevos, ni el navegador ni la app instalada ni Google pueden seguir usando los de kAIRO que tenían guardados.
  - Todo se genera con `node tools/generar-logos.js` (usa Chrome o Edge en modo headless y las fuentes de `public/fonts`). Para cambiar colores o proporciones, edita ese archivo y vuelve a correrlo.
  - Lo que **no** cambió a propósito: los buckets de Supabase (`kairo-images`, `kairo-comprobantes`) y las claves internas del navegador (`kairo.carrito.v1`, `kairo_token`…), para que no se pierdan fotos, carritos, favoritos ni “Mis pedidos”.
- **Números de pedido nuevos** `PC-AAAAMMDD-####`. Los pedidos viejos `KS-…` siguen funcionando en el seguimiento, el recibo y Mis pedidos.
- **Solo envíos nacionales** por transportadora, con **tarifa fija** (por defecto $25.000) que se edita en **Panel → Ajustes → Envío nacional**. Las promociones y cupones de envío gratis siguen aplicando.
  - El cliente escribe departamento (lista de los 32 + Bogotá), ciudad o municipio, dirección y barrio (opcional). La **cédula ahora es obligatoria** porque la pide la transportadora.
  - Se quitaron “Recoger en la tienda”, “Domicilio en Quibdó”, la contraentrega y “separar y pagar al recoger”. Los pedidos viejos con esas opciones se siguen viendo bien en el panel y en Mis pedidos.
  - El código de domicilios por barrio (`lib/domicilios.js`, `lib/barrios-quibdo.js`) se borró; si algún día vuelven las entregas en Quibdó, está en el historial de git (commit `133ceda`).
- **Pago solo por transferencia o QR a Nequi o llave Bre-B.** El cliente paga desde la app de cualquier banco. En **Panel → Ajustes → Cuentas para recibir pagos** solo se pueden elegir Nequi o Bre-B; las cuentas de otros bancos guardadas antes ya no se muestran.
- **Wompi sigue en pausa**: aunque tenga llaves en Vercel, la tienda no lo ofrece. Su código (`lib/wompi.js`, `api/wompi.js`) se dejó para los pedidos viejos y por si se reactiva (habría que volver a agregar `'Wompi'` a `PAGOS` en `api/orders.js` y quitar `wompi: false` en `api/catalog.js`).
- **Base de datos:** ejecuta `lib/migracion-punto-club-2026-11.sql` en el editor SQL de Supabase (agrega `settings.envio_nacional` y cambia el nombre de la tienda). Mientras no la ejecutes, el envío cuesta $25.000 y el panel avisa que falta.
- **Políticas:** los términos, la política de datos y la de cambios se ajustaron (sin contraentrega, cédula obligatoria) y `versionPoliticas` pasó a `2026-11-11` en `public/js/negocio.js`. Si cambias el valor del envío en el panel, cámbialo también en `envioNacional` de ese archivo (es el que aparece en los términos).

### Seguimiento animado, guía de la transportadora y avisos al celular (11 de noviembre de 2026)
- **Mis pedidos se anima**: cada etapa tiene su ilustración (la caja salta mientras se prepara, el camión avanza cuando va en camino, un check con ondas al entregar), la línea de tiempo se va llenando paso a paso y la barra de progreso crece. Si el pedido cambió desde la última vez, la tarjeta se marca con **Novedad** y sale un aviso. Todo respeta “reducir movimiento” del celular.
- **Número de guía para el cliente**: cuando marcas un pedido como Enviado, el cliente ve la transportadora, la guía con botón **Copiar** y un botón **Rastrear** a la página oficial (Servientrega y Coordinadora; verificadas). En el panel hay un campo opcional **Enlace de rastreo** para pegar el enlace exacto que te dé cualquier transportadora.
- **Avisos al celular (notificaciones de la app, gratis)**: el cliente toca **Activar avisos** (en Mis pedidos o al terminar la compra) y le llega una notificación cada vez que guardas un cambio de estado o una guía nueva, aunque tenga la app cerrada. En iPhone solo funcionan si instaló la app en la pantalla de inicio (iOS 16.4 o más nuevo). Al guardar, el panel te dice si la notificación salió o si el cliente no tiene avisos activos.
- **Botón de WhatsApp por estado**: cada pedido nacional tiene un botón verde con el mensaje ya escrito para su estado actual (pago confirmado, en preparación, enviado con guía y enlace, entregado, cancelado). Después de cambiar el estado, el panel lo resalta para que solo pulses Enviar.
- **Aviso de pedido nuevo para la tienda**: en **Panel → Resumen** toca **📲 Activar avisos en este celular** (en cada celular o computador donde quieras enterarte). Cada pedido nuevo llega como notificación del sistema, con sonido y vibración, aunque el panel esté cerrado o la pantalla bloqueada. Con el panel abierto, además suena el “ding-dong” cada 5 segundos hasta que toques la pantalla. Si falta algo por configurar, el Resumen te lo dice.
- **Para activarlo**: ejecuta `lib/migracion-avisos-2026-11.sql` en Supabase y pon en Vercel (Settings → Environment Variables) las variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` que quedaron en tu `.env`. Luego vuelve a publicar. Nunca subas la llave privada a GitHub.

### Opiniones de clientes (12 de noviembre de 2026)
- **Solo compradores verificados**: cuando un pedido queda **Entregado**, en “Mis pedidos” aparece **¿Cómo te llegó?** con un botón **Opinar** por cada producto. El cliente da estrellas (general, rapidez del envío y calidad), dice si llegó en buen estado y cómo le quedó la talla, escribe su comentario y puede subir hasta 3 fotos. Una opinión por producto y por pedido. El aviso de “Entregado” en el celular lo invita a opinar.
- **Se publican solas** en el detalle de cada producto: promedio, barras por estrellas, “% dice: talla justa”, “% le llegó en buen estado” y cada opinión con la etiqueta **Compra verificada**, su talla, color, fotos y tu respuesta.
- **Privacidad**: se muestra solo el nombre corto (“Ana G.”) y la ciudad, con autorización expresa del cliente. Nunca el nombre completo, celular, cédula ni dirección. Se actualizaron los términos (sección 10) y la política de datos; `versionPoliticas` pasó a `2026-11-12` en `public/js/negocio.js`.
- **Panel → Opiniones**: todas las opiniones con filtros (sin responder, 1–2 estrellas, ocultas), respuesta pública, ocultar/volver a publicar y eliminar (borra también las fotos). Oculta solo las ofensivas, con datos personales o que no hablen del producto: esconder las negativas puede considerarse publicidad engañosa.
- **Para activarlo**: ejecuta `lib/migracion-opiniones-2026-11.sql` en Supabase (crea la tabla `reviews` y el bucket público `punto-club-opiniones` para las fotos). Sin ella la tienda funciona igual y el producto dice que aún no hay opiniones.

### Panel: alarma de pedidos y estadísticas
- **Aviso de pedidos:** cuando entra un pedido nuevo suena una vez un “ding-dong” suave, aparece un aviso, el título de la pestaña muestra 🔔 y llega una notificación del navegador. El panel revisa pedidos cada 20 segundos aunque esté en otra pestaña. Se apaga o se prueba en **Resumen → Sonido de pedidos / Probar sonido**. El navegador solo deja sonar después de tocar el panel una vez.
- **Estadísticas:** ventas de hoy, últimos 7 días, este mes y este año, comparadas con el periodo anterior; gráfica de ventas por hora/día/mes, productos más vendidos y tallas más pedidas. Cuenta todos los pedidos menos los cancelados.
- **PQR:** si aparece “Could not find the table 'public.pqrs'”, ejecuta `lib/migracion-legal-2026-09.sql` en el editor SQL de Supabase.

## Instalación
1. En Supabase → SQL Editor ejecuta, en orden: `lib/schema.sql` (solo si es una base nueva), `lib/migracion-legal-2026-09.sql`, `lib/migracion-promos-2026-10.sql`, `lib/migracion-pedidos-2026-10b.sql` (también crea el bucket privado para las fotos de comprobantes), `lib/migracion-domicilios-2026-11.sql` (cuentas de pago) y `lib/migracion-punto-club-2026-11.sql` (envío nacional).
2. Copia `.env.example` a `.env` y llénalo. En Vercel pon las mismas variables.
3. `npm install` y `npm run dev` → http://localhost:3000 (panel en `/admin.html`).
4. Opcional y **solo en una base nueva**: `npm run seed` carga el catálogo de ejemplo (sobrescribe los productos que tengan los mismos IDs).

## Antes de publicar
- Llena los datos legales en `public/js/negocio.js` (aparecen como [COMPLETAR] hasta que lo hagas). Ver `PENDIENTES-LEGALES.md`.
- Cambia la contraseña del panel (Ajustes) y **rota la clave service de Supabase** si alguna vez estuvo en un zip o repositorio.
- El recibo no es factura electrónica de la DIAN.
