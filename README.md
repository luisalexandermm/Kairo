# kAIRO — tienda de tenis

Proyecto completo: página pública, panel de administración y base de datos. No necesita instalar nada con npm, solo Node.js.

## Cómo arrancarlo

1. Instala [Node.js](https://nodejs.org) (versión 18 o superior).
2. Abre una terminal dentro de la carpeta `kairo`.
3. Ejecuta:

   ```bash
   node server.js
   ```

4. Abre en el navegador:
   - Tienda: <http://localhost:3000>
   - Panel: <http://localhost:3000/admin.html>

Contraseña inicial del panel: **kairo2026** (cámbiala en Ajustes apenas entres).

## Qué hay en cada archivo

```
kairo/
├── server.js        Servidor web y API (sin dependencias externas)
├── store.js         Base de datos: usa SQLite y, si no está disponible, un archivo JSON
├── seed.js          Productos, promociones y ajustes con los que arranca la tienda
├── package.json
├── data/            Se crea sola: aquí vive la base de datos (kairo.db)
└── public/
    ├── index.html   La tienda que ven los clientes
    ├── admin.html   El panel de administración
    └── uploads/     Las imágenes que subes desde el panel
```

## Qué se puede hacer desde el panel

- **Productos**: crear, editar y eliminar modelos con marca, precio, precio de oferta, stock, etiqueta, descripción, tallas, colores e imagen. Si no subes imagen, se usa una silueta de color. Marca "Destacado en la portada" para que salga en el hero.
- **Promociones**: avisos con título, descripción, etiqueta corta y porcentaje de descuento. Los activos aparecen en la franja de promociones de la tienda.
- **Pedidos**: cada compra hecha en la tienda queda guardada con productos, tallas, colores, total y datos del cliente. Puedes cambiar el estado (Nuevo, Confirmado, Enviado, Entregado, Cancelado) y escribirle al cliente por WhatsApp.
- **Ajustes**: nombre de la tienda, número de WhatsApp de pedidos, palabra de fondo del hero, color inicial del hero, frase, nota de envío, logo del hero (puedes subir tu logo 3D en PNG) y contraseña del panel.

## La base de datos

`store.js` usa **SQLite** a través del módulo nativo de Node (`node:sqlite`, Node 22.5 o superior) y guarda todo en `data/kairo.db`. Si tu Node es más antiguo, cambia solo el archivo a `data/db.json` y todo sigue funcionando igual.

Tablas: `products`, `promos`, `orders`, `settings`. Para empezar de cero, borra los archivos de la carpeta `data/` y vuelve a arrancar el servidor: se cargan de nuevo los datos de ejemplo de `seed.js`.

Copia la carpeta `data/` cada cierto tiempo: ahí están tus productos y pedidos.

## Cómo funcionan los pedidos

El cliente arma su carrito, pulsa **Comprar** y llena el formulario de envío. Al enviarlo pasan dos cosas: el pedido se guarda en la base de datos (lo ves en el panel) y se abre WhatsApp con el mensaje ya redactado hacia el número configurado en Ajustes (por defecto **314 531 2045**).

Si abres `public/index.html` directamente con doble clic, sin el servidor, la tienda sigue funcionando con el catálogo de ejemplo y con WhatsApp, pero no guarda pedidos ni lee los cambios del panel.

## Notas

- Las sesiones del panel duran 12 horas y se pierden al recargar la página, así que tendrás que escribir la contraseña de nuevo. Es a propósito, para que nadie deje el panel abierto.
- El servidor escucha en el puerto 3000. Para cambiarlo: `PORT=8080 node server.js`.
- Para publicarlo en internet, sube la carpeta a cualquier servicio que corra Node (Railway, Render, un VPS) y usa `node server.js` como comando de arranque.
- Las siluetas de los zapatos son dibujos propios. Cuando subas las fotos reales de cada modelo desde el panel, reemplazan a la silueta.
