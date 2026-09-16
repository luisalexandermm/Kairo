const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);

  const { items, total, customer } = req.body || {};
  if (!items || !items.length) return err(res, 'El pedido no tiene productos', 400);

  const id = 'ord-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const { error } = await supabase.from('orders').insert({
    id, customer: customer || {}, items, total: Number(total) || 0, status: 'Nuevo'
  });

  if (error) return err(res, 'No se pudo guardar el pedido: ' + error.message, 500);
  ok(res, { ok: true, id }, 201);
};
