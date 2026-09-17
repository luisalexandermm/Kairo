# kAIRO — Tienda de tenis · Vercel + Supabase

Proyecto completo: tienda pública, panel de administración y base de datos en la nube.
Los cambios del panel se ven al instante en todos los dispositivos.

---

## PASO 1 — Crea las tablas en Supabase

1. Entra a https://supabase.com y abre tu proyecto.
2. Ve a **SQL Editor → New query**.
3. Pega todo el contenido del archivo `lib/schema.sql` y haz clic en **Run**.
4. Verás que se crean las tablas: `products`, `promos`, `orders`, `settings`.

---

## PASO 2 — Crea un bucket de imágenes en Supabase

1. Ve a **Storage → New bucket**.
2. Nombre: `kairo-images`
3. Activa **Public bucket** (para que las URLs sean públicas).
4. Guarda.

---
## PASO 3 — Obtén tus credenciales de Supabase

1. Ve a **Settings → API** en tu proyecto Supabase.
2. Copia:
   - **Project URL** → la necesitas como `SUPABASE_URL`
   - **service_role** key → la necesitas como `SUPABASE_SERVICE_KEY`
     ⚠️ Esta clave tiene acceso total. Nunca la pongas en el navegador.

---

## PASO 4 — Sube los productos de ejemplo (opcional)

Si quieres los 12 productos iniciales en la base de datos:

   ```
   SUPABASE_URL=https://TU_PROYECTO.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   TOKEN_SECRET=cualquier-texto-largo-secreto
   ```
2. En la terminal, dentro de la carpeta `kairo/`:
   ```bash
   node lib/seed-db.js
   ```

---
## PASO 5 — Sube el proyecto a GitHub

```bash
git init
git add .
git commit -m "kAIRO v1"
git remote add origin https://github.com/TU_USUARIO/kairo.git
git push -u origin main
```

---


1. Entra a https://vercel.com y haz clic en **Add New Project**.
2. Importa tu repositorio de GitHub.
3. En **Environment Variables** agrega las tres variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `TOKEN_SECRET` (cualquier texto largo y aleatorio)
4. Haz clic en **Deploy**.
5. Vercel te da una URL pública. ¡Listo!

### Notificaciones y recibos por WhatsApp

La tienda guarda cada pedido, muestra un recibo al cliente y permite imprimirlo/guardarlo como PDF. Para que además Twilio envíe automáticamente el aviso al negocio (`3145312045`) y el recibo al cliente, agrega en Vercel las variables `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` y `ADMIN_WHATSAPP_TO`. En pruebas, configura primero el WhatsApp Sandbox de Twilio; en producción necesitas un remitente de WhatsApp aprobado por Meta/Twilio.

La tienda y el panel son instalables desde Chrome Android mediante **Añadir a pantalla de inicio**. El panel muestra avisos del navegador mientras permanece abierto y sincroniza pedidos nuevos cada 30 segundos.
---

## PASO 7 — Primeras acciones en el panel

1. Abre `https://TU-SITIO.vercel.app/admin.html`
2. Contraseña inicial: **kairo2026**
3. Ve a **Ajustes** y cambia la contraseña.
4. Ve a **Ajustes** y pon tu número de WhatsApp real (formato: 573XXXXXXXXX).
5. Ve a **Productos** y agrega fotos reales a cada par.

---

npm run dev

```bash
# 1. Instala dependencias
npm install
# 2. Crea el archivo .env con tus credenciales
cp .env.example .env
# Edita .env con tu editor

# 3. Arranca el servidor local
node dev-server.js
# Tienda  → http://localhost:3000
# Panel   → http://localhost:3000/admin.html
```

---

## Estructura del proyecto

```
kairo/
├── api/
│   ├── catalog.js      GET /api/catalog — productos+promos+ajustes (público)
│   ├── login.js        POST /api/login  — autenticación del panel
│   ├── orders.js       POST /api/orders — guarda pedidos desde la tienda
│   └── admin.js        /api/admin/*     — CRUD completo (requiere token)
├── lib/
│   ├── supabase.js     cliente Supabase compartido
│   ├── helpers.js      utilidades HTTP y tokens HMAC
│   ├── env.js          carga .env en desarrollo local
│   ├── schema.sql      SQL para crear las tablas (ejecutar 1 sola vez)
│   └── seed-db.js      carga los 12 productos de ejemplo
├── public/
│   ├── admin.html      el panel de administración
│   └── uploads/        (vacía — las imágenes van a Supabase Storage)
├── dev-server.js       servidor local de desarrollo
├── vercel.json         rutas para Vercel
├── .env.example        plantilla de variables de entorno
└── .gitignore
```

---


| Sección | Qué puedes hacer |
|---------|-----------------|
| **Productos** | Crear, editar, eliminar. Marca, nombre, precio, precio de oferta, stock, tallas, colores, imagen, visible/oculto, destacado en hero |
| **Promociones** | Crear banners de promoción que aparecen en la tienda |
| **Pedidos** | Ver todos los pedidos, cambiar estado, escribir al cliente por WhatsApp |
| **Ajustes** | Nombre de la tienda, WhatsApp, logo del hero, colores, contraseña |

---

## Cómo funciona el login del panel (bug corregido)

El problema anterior era que el body se enviaba sin `Content-Type: application/json`,
por lo que el servidor no podía parsear la contraseña.

Ahora el login usa:
```js
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: pass })
})
```
Y el servidor responde con un token HMAC firmado que no necesita sesión compartida
(funciona perfecto en Vercel serverless donde cada función es stateless).

---

## Preguntas frecuentes

**¿Cuánto cuesta?**
Vercel gratuito + Supabase gratuito = $0/mes para una tienda pequeña.

**¿Los cambios del admin se ven de inmediato?**
Sí. La tienda llama a `/api/catalog` cada vez que se carga, así que
cualquier cambio del panel se ve en la próxima visita (o al recargar).

**¿Dónde quedan las imágenes de los productos?**
En Supabase Storage, bucket `kairo-images`. Las URLs son públicas y permanentes.

**¿Puedo cambiar la contraseña del panel?**
Sí, en el panel → Ajustes → Cambiar contraseña.
