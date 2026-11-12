'use strict';
/* /api/push — el cliente activa o quita los avisos de sus pedidos en este dispositivo.
   GET  → { activo, publicKey }
   POST { accion: 'suscribir', sub, cliente, pedidos: [{numero, ultimos4}] }
   POST { accion: 'quitar', endpoint }
   Los pedidos agregados a mano solo se ligan si el número y los últimos 4 del celular coinciden. */
const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');
const { ORDER_RE, clienteHash } = require('../lib/pedidos');
const { PUBLIC_KEY, ADMIN, pushReady, endpointOk } = require('../lib/push');

const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < 10 * 60e3);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 30;
}
const b64url = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v);

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return ok(res, { activo: pushReady(), publicKey: pushReady() ? PUBLIC_KEY : '' });
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);
  if (!pushReady()) return err(res, 'Los avisos todavía no están activos en la tienda.', 503);
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  if (tooMany(ip)) return err(res, 'Demasiados intentos. Espera unos minutos.', 429);

  const b = req.body || {};
  if (b.accion === 'quitar') {
    if (!endpointOk(b.endpoint)) return err(res, 'Suscripción no válida', 400);
    // Nunca quita desde la tienda pública un dispositivo del panel
    await supabase.from('push_subs').delete().eq('endpoint', b.endpoint).or('cliente.is.null,cliente.neq.' + ADMIN).then(() => {}, () => {});
    return ok(res, { ok: true });
  }
  if (b.accion !== 'suscribir') return err(res, 'Acción no válida', 400);

  const s = b.sub || {}, keys = s.keys || {};
  if (!endpointOk(s.endpoint) || !b64url(keys.p256dh, 80, 120) || !b64url(keys.auth, 16, 40)) return err(res, 'Suscripción no válida', 400);
  const cliente = clienteHash(b.cliente) || null;

  // Pedidos agregados a mano: solo si número + últimos 4 coinciden
  const pedidosIn = (Array.isArray(b.pedidos) ? b.pedidos : []).slice(0, 25).map(x => ({
    numero: String((x && x.numero) || '').trim().toUpperCase(),
    ultimos4: String((x && x.ultimos4) || '').replace(/\D/g, '')
  })).filter(x => ORDER_RE.test(x.numero) && /^\d{4}$/.test(x.ultimos4));
  let pedidos = [];
  if (pedidosIn.length) {
    const { data } = await supabase.from('orders').select('id,customer').in('id', pedidosIn.map(x => x.numero));
    const byId = new Map((data || []).map(o => [o.id, o]));
    pedidos = pedidosIn.filter(x => {
      const o = byId.get(x.numero);
      return o && String((o.customer || {}).telefono || '').replace(/\D/g, '').endsWith(x.ultimos4);
    }).map(x => x.numero);
  }
  if (!cliente && !pedidos.length) return err(res, 'No hay pedidos para avisarte todavía.', 400);

  // Si este celular es también el de la tienda (recibe avisos de pedidos nuevos), no se le quita ese rol
  const { data: prev } = await supabase.from('push_subs').select('cliente,pedidos').eq('endpoint', s.endpoint).maybeSingle().then(r => r, () => ({ data: null }));
  const esTienda = prev && prev.cliente === ADMIN;
  const { error } = await supabase.from('push_subs').upsert({
    endpoint: s.endpoint, p256dh: keys.p256dh, auth: keys.auth,
    cliente: esTienda ? ADMIN : cliente,
    pedidos: esTienda ? [...new Set([...(prev.pedidos || []), ...pedidos])].slice(0, 50) : pedidos,
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });
  if (error) {
    console.error('[push] no se pudo guardar la suscripción:', error.message);
    return err(res, /push_subs/.test(error.message) ? 'Los avisos todavía no están listos en la tienda.' : 'No pudimos activar los avisos. Intenta de nuevo.', 500);
  }
  ok(res, { ok: true, pedidos: pedidos.length });
};
