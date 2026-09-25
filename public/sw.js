const CACHE = 'kairo-v3';
const APP_SHELL = ['/', '/index.html', '/admin.html', '/css/store.css', '/css/admin.css', '/css/fonts.css', '/css/legal.css', '/js/negocio.js', '/manifest.webmanifest', '/img/logo.png',
  '/terminos.html', '/privacidad.html', '/cookies.html', '/cambios-y-devoluciones.html', '/pqr.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;
  if (['document', 'style', 'script'].includes(event.request.destination)) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  })));
});
