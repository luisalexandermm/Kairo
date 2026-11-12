'use strict';
/* =====================================================================
   Notificaciones de la app (web push) para avisarle al cliente cada
   cambio de su pedido. Gratis: las entrega el propio navegador
   (Chrome/Android, Edge, Firefox y, en iPhone, la app instalada).

   - Llaves en Vercel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
     Sin ellas todo sigue funcionando, solo que no se envían avisos.
   - Suscripciones en la tabla push_subs (lib/migracion-avisos-2026-11.sql).
     Cada una se liga al dispositivo del cliente (hash, como "Mis pedidos")
     y a los pedidos que ese dispositivo agregó a mano.
   ===================================================================== */
const webpush = require('web-push');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contacto.maturanainnovate@gmail.com';

let configured = false;
function pushReady() {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  if (!configured) {
    try { webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY); configured = true; }
    catch (e) { console.error('[push] llaves VAPID no válidas:', e.message); return false; }
  }
  return true;
}

/* Solo se aceptan direcciones de los servicios de notificaciones de los navegadores
   (así nadie puede usar la tienda para hacer peticiones a otros sitios). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
function endpointOk(u) {
  try {
    const url = new URL(String(u || ''));
    return url.protocol === 'https:' && String(u).length <= 800 && PUSH_HOSTS.some(r => r.test(url.hostname));
  } catch { return false; }
}

/* Texto de cada aviso según el estado nuevo del pedido */
function mensaje(order, status, t) {
  const n = order.id;
  const guia = t.guia ? ` Guía ${t.guia}${t.transportadora ? ' (' + t.transportadora + ')' : ''}.` : '';
  switch (status) {
    case 'Pago confirmado': return { title: '¡Pago confirmado! 💚', body: `Recibimos el pago de tu pedido ${n}. Ya lo estamos alistando.` };
    case 'En preparación': return { title: 'Estamos preparando tu pedido 📦', body: `Tu pedido ${n} se está empacando para salir.` };
    case 'Enviado': return { title: '¡Tu pedido va en camino! 🚚', body: `El pedido ${n} ya salió.${guia} Toca para ver el seguimiento.` };
    case 'Entregado': return { title: '¡Pedido entregado! 🎉', body: `Tu pedido ${n} fue entregado. ¿Cómo te llegaron? Cuéntanos en Mis pedidos y ayuda a otros a elegir.` };
    case 'Cancelado': return { title: 'Tu pedido fue cancelado', body: `El pedido ${n} se canceló. Si tienes dudas, escríbenos por WhatsApp.` };
    default: return null;
  }
}

/* Avisa a todos los dispositivos del cliente. Devuelve cuántos avisos salieron.
   extra.soloGuia: el estado no cambió pero se agregó o cambió la guía. */
async function notifyOrder(supabase, order, status, tracking, extra = {}) {
  if (!pushReady()) return 0;
  let msg = mensaje(order, status, tracking);
  if (extra.soloGuia) msg = { title: 'Ya tienes número de guía 🚚', body: `Pedido ${order.id}: guía ${tracking.guia}${tracking.transportadora ? ' (' + tracking.transportadora + ')' : ''}. Toca para rastrearlo.` };
  if (!msg) return 0;
  const c = order.customer || {};
  const ultimos4 = String(c.telefono || '').replace(/\D/g, '').slice(-4);

  const [porDispositivo, porPedido] = await Promise.all([
    c.clienteId ? supabase.from('push_subs').select('*').eq('cliente', c.clienteId) : { data: [] },
    supabase.from('push_subs').select('*').contains('pedidos', [order.id])
  ].map(p => Promise.resolve(p).then(r => r, () => ({ data: [] }))));
  const subs = new Map();
  [...(porDispositivo.data || []), ...(porPedido.data || [])].forEach(s => subs.set(s.endpoint, s));
  if (!subs.size) return 0;

  return sendAll(supabase, [...subs.values()], {
    ...msg, tag: 'pedido-' + order.id, tipo: 'cliente',
    url: '/?pedido=' + encodeURIComponent(order.id) + '&c=' + ultimos4 + '#pedidos'
  });
}

/* Envía un aviso a varias suscripciones. Devuelve cuántos salieron. */
async function sendAll(supabase, subs, data) {
  const payload = JSON.stringify(data);
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3 * 86400, urgency: 'high' });
      sent++;
    } catch (e) {
      // 404/410: quitaron el permiso o desinstalaron; se borra la suscripción
      if (e.statusCode === 404 || e.statusCode === 410) await supabase.from('push_subs').delete().eq('endpoint', s.endpoint).then(() => {}, () => {});
      else console.error('[push] no se pudo enviar:', e.statusCode || '', e.message);
    }
  }));
  return sent;
}

/* Los dispositivos del panel se guardan con cliente = ADMIN (un hash real nunca se ve así) */
const ADMIN = 'ADMIN';
async function notifyAdmins(supabase, order) {
  if (!pushReady()) return 0;
  const { data } = await supabase.from('push_subs').select('*').eq('cliente', ADMIN).then(r => r, () => ({ data: [] }));
  if (!data || !data.length) return 0;
  const c = order.customer || {};
  const money = n => '$' + Number(n || 0).toLocaleString('es-CO');
  return sendAll(supabase, data, {
    title: '🛍️ Nuevo pedido ' + order.id,
    body: (c.nombre || 'Cliente') + ' · ' + money(order.total) + (c.ciudad ? ' · ' + c.ciudad : '') + '. Revisa el pago en tu Nequi.',
    tag: 'admin-' + order.id, tipo: 'admin', url: '/admin.html'
  });
}

/* ¿Está lista la tabla de avisos? (para mostrarlo en el panel) */
async function tablaLista(supabase) {
  const { error } = await supabase.from('push_subs').select('endpoint', { head: true, count: 'exact' }).limit(1).then(r => r, e => ({ error: e }));
  return !error;
}

module.exports = { PUBLIC_KEY, ADMIN, pushReady, endpointOk, notifyOrder, notifyAdmins, tablaLista, mensaje };
