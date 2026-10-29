/* Service worker de kAIRO (PWA).
   - Páginas y estilos: primero la red (siempre lo más nuevo), con copia por si no hay señal.
   - Imágenes, fuentes y scripts propios: copia local primero.
   - Nunca guarda nada de /api/ (precios, pedidos, panel).
   - No recarga la página por su cuenta: una actualización nunca interrumpe un pago. */
const CACHE = 'kairo-v10';
const APP_SHELL = [
  '/', '/index.html', '/css/fonts.css', '/css/store.css?v=8', '/js/negocio.js', '/js/loader.js', '/js/tienda.js?v=8',
  '/manifest.webmanifest', '/img/kairo-logo-negro.png', '/img/kairo-logo-blanco.png', '/img/nequi-qr.png',
  '/img/icon-192.png', '/img/favicon-96.png', '/seguimiento.html', '/recibo.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/admin')) return; // el panel siempre va directo a la red

  const fromNetwork = () => fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });

  if (req.mode === 'navigate' || req.destination === 'style' || req.destination === 'script') {
    event.respondWith(fromNetwork().catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(r => r || caches.match('/'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fromNetwork()));
});
