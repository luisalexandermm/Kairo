# kAIRO — Pendientes legales y riesgos (revisión del 25 de septiembre de 2026)

Esto no reemplaza la asesoría de un abogado. Antes de vender a gran escala, pide a un abogado colombiano de protección al consumidor y datos personales que revise las páginas legales.

## 🔴 Urgente (antes de publicar)

1. **Autenticidad de los productos.** El sitio decía “Nike, Jordan, Adidas y Timberland originales”. Quité esa frase porque no puedo verificarla. Si los productos NO son originales comprados a un distribuidor autorizado, venderlos con esas marcas es un riesgo penal (Código Penal, art. 306, usurpación de derechos de propiedad industrial) y de publicidad engañosa. Que se entreguen “sin caja” refuerza la sospecha. Si SÍ son originales, guarda facturas de compra de cada lote antes de volver a escribir “originales”.
2. **Datos del negocio.** Llena `public/js/negocio.js`: nombre o razón social del RUT, NIT, dirección física, correo, horario, plazo de entrega y días para cambio de talla. La Ley 1480 (art. 50) y la Ley 1581 exigen identificar al vendedor. No inventé ninguno.
3. **Rota tus claves de Supabase.** El .zip que me enviaste incluía el archivo `.env` con tu clave `service_role` real. Si ese .zip se compartió con alguien más, se subió a GitHub o a cualquier otro lugar, genera una clave nueva en Supabase → Settings → API. El .zip que te devuelvo NO incluye `.env`.
4. **Ejecuta `lib/migracion-legal-2026-09.sql`.** Crea la tabla de PQR y activa Row Level Security. Sin RLS, cualquiera con la clave pública “anon” de tu proyecto podría leer los pedidos (nombres, celulares, direcciones, cédulas).
5. **Contraseña del panel.** La contraseña inicial `kairo2026` está escrita en el README y en el esquema. Si nunca la cambiaste, cámbiala ya.
6. **`TOKEN_SECRET` en Vercel.** El código ya no usa el secreto por defecto (con él cualquiera podía fabricar sesiones de administrador). Si falta la variable, el panel no deja entrar.

## 🟠 Importante

7. **Promociones que el carrito no aplica.** El panel permite publicar promociones (“Segunda unidad al 30 %”, “Envío gratis desde $600.000”), pero el carrito no calcula esos descuentos. Publicar una promoción y no respetarla es publicidad engañosa (Ley 1480, arts. 29–33), y los términos dicen que se respetan. Solo publica promociones que vayas a aplicar a mano en WhatsApp, e incluye condiciones y fecha de fin en el texto.
8. **Descripciones en la base de datos.** Limpié las afirmaciones sin respaldo del catálogo de ejemplo (“la más alta de la línea”, “30 % más liviana”, “la bota original de Nueva York”, “Edición limitada”, “talla fiel”) en `lib/seed-db.js` y en la página. **Los productos que ya están en tu Supabase conservan el texto viejo**: edítalos desde el panel.
9. **Fotos de productos.** No puedo ver qué imágenes subiste a Supabase. Si son fotos oficiales de Nike, Adidas, etc. descargadas de internet, tienen derechos de autor. Lo más seguro es usar fotos tuyas de los pares reales. Las ilustraciones SVG del sitio y `img/logo.png` no presentan problema si el logo es tuyo.
10. **Costo de envío con Nequi/Daviplata.** El sitio no muestra cuánto cuesta el envío si el cliente paga por Nequi/Daviplata; dice que se confirma por WhatsApp antes de pagar. Lo ideal es publicar una tarifa fija o una tabla por ciudad.
11. **Facturación electrónica.** Si estás obligado a facturar (DIAN), cada venta necesita factura electrónica. Revísalo con tu contador.
12. **Registro Nacional de Bases de Datos (RNBD).** Solo es obligatorio para sociedades y entidades con activos totales superiores a 100.000 UVT (Decreto 090 de 2018). Un negocio pequeño normalmente no está obligado, pero confírmalo con tu contador.
13. **Twilio.** Si activas Twilio, el servidor envía el recibo por WhatsApp al celular que escriba el cliente. Ahora solo acepta celulares colombianos válidos, pero cualquiera podría crear pedidos falsos para gastar tu saldo de Twilio o enviar mensajes a números ajenos. Considera agregar un límite de pedidos por minuto (por ejemplo, con Vercel Firewall o Upstash).
14. **Plazos legales de PQR.** El panel marca en amarillo las solicitudes cercanas al límite: 15 días hábiles para PQR y 10 para consultas de datos personales.

## 🟢 Ya resuelto en esta versión

- Páginas: términos, datos personales, cookies, cambios/devoluciones/garantía y PQR con número de radicado (exigido por la Ley 2439 de 2024).
- Checkout: aviso de privacidad y dos casillas separadas y obligatorias (autorización de datos y aceptación de términos). El servidor rechaza pedidos sin ellas y guarda fecha y versión como prueba.
- Datos mínimos: se quitó el correo del checkout (no se usaba para nada); la cédula es opcional y explica para qué se pide; el servidor descarta cualquier otro campo que llegue.
- Cookies: el sitio no usa cookies ni analítica. Las fuentes de Google ahora se alojan en el propio sitio, así que no se envían datos del visitante a Google. **No hace falta banner de cookies.** Si algún día agregas Google Analytics, Meta Pixel o similares, necesitarás un banner con consentimiento previo.
- Reseñas: se eliminó la sección “Lo que dicen los clientes” (Mariana J., David R., Laura C.) y las 5 estrellas que tenía cada producto, porque no correspondían a opiniones reales verificables.
- Accesibilidad (WCAG 2.1 AA): enlace para saltar al contenido, foco atrapado y devuelto en ventanas emergentes, Escape para cerrar, errores de formulario en el campo con mensaje, textos alternativos, etiquetas claras en botones, contraste corregido (el rojo de botones y títulos pasó de 3,4:1 a más de 5:1; los bordes de campos cumplen 3:1) y respeto por “reducir movimiento”. Revisión automática con axe: 0 violaciones en todas las páginas.
- Seguridad: CORS cerrado, cabeceras de seguridad y CSP en `vercel.json`, datos escapados antes de mostrarse en la página, validación de tallas, colores y precios en el servidor.
- Enlaces rotos: se quitaron “Guía de tallas” (no existía) e Instagram con `href="#"` (se muestra solo si pones la URL en `negocio.js`).

## Normas revisadas

- Ley 1581 de 2012 y Decreto 1074 de 2015 (antes Decreto 1377 de 2013): protección de datos personales.
- Ley 1480 de 2011 (Estatuto del Consumidor): art. 47 retracto, art. 50 comercio electrónico, art. 51 reversión del pago, arts. 7–8 garantía.
- Ley 2439 de 2024: reembolso por retracto en 15 días calendario, PQR con radicado, entrega en máximo 30 días si no se pacta otro plazo.
- Decreto 587 de 2016: reversión del pago.
- Circular Externa SIC 005 de 2017: países con nivel adecuado de protección.
- Decreto 090 de 2018: quién debe registrar bases de datos en el RNBD.
