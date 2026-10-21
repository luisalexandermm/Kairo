'use strict';
/* POST /api/coupon — valida un cupón contra el carrito y devuelve el descuento.
   No reserva el cupón: el uso se descuenta solo cuando se registra el pedido. */
const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');
const { priceCart } = require('../lib/pricing');

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);
  const { code, items } = req.body || {};
  if (!String(code || '').trim()) return err(res, 'Escribe el código del cupón', 400);
  const r = await priceCart(supabase, items, code);
  if (r.error) return err(res, r.error, r.status || 400);
  ok(res, {
    code: r.coupon.code, description: r.coupon.description, type: r.coupon.type,
    discount: r.coupon.discount, freeShipping: r.coupon.freeShipping, // solo si el CUPÓN da envío gratis
    subtotal: r.subtotal, total: r.total
  });
};
