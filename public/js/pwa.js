/* Registro del service worker de Punto Club (PWA), compartido por la tienda y las páginas
   de seguimiento, recibo y legales. El panel de administración no lo carga: se usa
   desde el navegador, por fuera de la app. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { }); });
}
