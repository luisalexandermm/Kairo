'use strict';
/* POST /api/mis-pedidos — "Mis pedidos" del cliente, sin cuenta ni contraseña.
   Cada navegador/app guarda un identificador aleatorio (cliente) que se envía al comprar;
   en la base solo queda su hash (customer.clienteId). Con ese identificador se listan todos
   los pedidos hechos desde ese dispositivo.
   También acepta pedidos agregados a mano (número + últimos 4 del celular), por ejemplo
   los que se hicieron desde otro celular.
   Nunca devuelve cédula, correo, teléfono completo ni la dirección completa. */
const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');
const { clienteHash, publicOrder } = require('../lib/pedidos');

const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < 10 * 60e3);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 60;
}

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  if (tooMany(ip)) return err(res, 'Demasiadas consultas. Espera unos minutos e intenta de nuevo.', 429);

  const b = req.body || {};
  const hash = clienteHash(b.cliente);
  const extra = (Array.isArray(b.extra) ? b.extra : []).slice(0, 25).map(x => ({
    numero: String((x && x.numero) || '').trim().toUpperCase(),
    ultimos4: String((x && x.ultimos4) || '').replace(/\D/g, '')
  })).filter(x => /^KS-\d{8}-\d{4}$/.test(x.numero) && /^\d{4}$/.test(x.ultimos4));
  if (!hash && !extra.length) return ok(res, { orders: [], invalid: [] });

  const found = new Map();
  if (hash) {
    const { data, error } = await supabase.from('orders').select('*')
      .eq('customer->>clienteId', hash).order('created_at', { ascending: false }).limit(60);
    if (error) console.error('Mis pedidos (dispositivo):', error.message);
    (data || []).forEach(o => found.set(o.id, o));
  }

  const invalid = [];
  const pending = extra.filter(x => !found.has(x.numero));
  if (pending.length) {
    const { data, error } = await supabase.from('orders').select('*').in('id', pending.map(x => x.numero));
    if (error) console.error('Mis pedidos (agregados):', error.message);
    const byId = new Map((data || []).map(o => [o.id, o]));
    pending.forEach(x => {
      const o = byId.get(x.numero);
      const tel = o && o.customer ? String(o.customer.telefono || '').replace(/\D/g, '') : '';
      if (o && tel.endsWith(x.ultimos4)) found.set(o.id, o);
      else invalid.push(x.numero);
    });
  }

  const orders = [...found.values()]
    .sort((a, b2) => String(b2.created_at).localeCompare(String(a.created_at)))
    .map(publicOrder);
  ok(res, { orders, invalid });
};
