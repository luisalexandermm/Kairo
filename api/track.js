'use strict';
/* POST /api/track — seguimiento público de un pedido.
   Pide el número del pedido + los últimos 4 dígitos del celular, y nunca devuelve
   cédula, correo, teléfono ni la dirección completa.
   Con { reportarPago: "referencia" } el cliente informa que ya pagó por Nequi. */
const supabase = require('../lib/supabase');
const { ok, err, allowCors, cleanText } = require('../lib/helpers');
const { normalizeStatus, trackingOf, buildSteps } = require('../lib/pedidos');

/* Freno simple contra adivinar números (por instancia del servidor) */
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < 10 * 60e3);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 30;
}

const maskAddress = s => {
  const t = String(s || '');
  return t.length <= 8 ? t : t.slice(0, 8) + '…';
};

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  if (tooMany(ip)) return err(res, 'Demasiadas consultas. Espera unos minutos e intenta de nuevo.', 429);

  const b = req.body || {};
  const numero = String(b.numero || '').trim().toUpperCase();
  const ultimos4 = String(b.ultimos4 || '').replace(/\D/g, '');
  if (!/^KS-\d{8}-\d{4}$/.test(numero) || !/^\d{4}$/.test(ultimos4)) return err(res, 'Revisa el número del pedido y los 4 dígitos', 400);

  const { data: o, error } = await supabase.from('orders').select('*').eq('id', numero).maybeSingle();
  const tel = o && o.customer ? String(o.customer.telefono || '').replace(/\D/g, '') : '';
  if (error || !o || !tel.endsWith(ultimos4)) return err(res, 'No encontramos un pedido con ese número y esos dígitos.', 404);

  const status = normalizeStatus(o.status);
  const t = trackingOf(o);
  const pricing = o.pricing || o.customer.pricing || {};

  /* El cliente reporta su pago por Nequi */
  if (b.reportarPago != null) {
    const ref = cleanText(b.reportarPago, 60);
    if (ref.length < 3) return err(res, 'Escribe la referencia o el número del comprobante de Nequi', 400);
    if (status !== 'Recibido') return err(res, 'Este pedido ya no está esperando el pago.', 409);
    const at = new Date().toISOString();
    const tracking = { ...t, history: [...t.history, { status: 'Pago reportado', at, ref }] };
    const customer = { ...o.customer, pagoReportado: { ref, at } };
    let up = await supabase.from('orders').update({ customer, tracking, updated_at: at }).eq('id', numero);
    if (up.error && /tracking/i.test(up.error.message)) {
      up = await supabase.from('orders').update({ customer: { ...customer, tracking }, updated_at: at }).eq('id', numero);
    }
    if (up.error) return err(res, 'No se pudo registrar el reporte. Escríbenos por WhatsApp.', 500);
    return ok(res, { ok: true, reportadoEn: at });
  }

  const steps = buildSteps(o);
  const cur = steps.find(s => s.state === 'current') || steps[steps.length - 1];
  ok(res, {
    numero: o.id, createdAt: o.created_at,
    pago: o.customer.pago || '', ciudad: o.customer.ciudad || '',
    nombre: String(o.customer.nombre || '').split(' ')[0],
    direccion: maskAddress(o.customer.direccion),
    status, statusLabel: status === 'Cancelado' ? 'Cancelado' : cur.label,
    steps, guia: t.guia, transportadora: t.transportadora, nota: t.nota,
    pagoReportado: o.customer.pagoReportado ? { at: o.customer.pagoReportado.at } : null,
    items: (o.items || []).map(i => ({ brand: i.brand, name: i.name, size: i.size, color: i.color, qty: i.qty, price: i.price, listPrice: i.listPrice, image: i.image || '' })),
    discount: pricing.coupon ? pricing.coupon.discount : 0,
    couponCode: pricing.coupon ? pricing.coupon.code : '',
    promoSavings: pricing.promoSavings || 0,
    envio: pricing.envio != null ? pricing.envio : null,
    total: pricing.total != null ? pricing.total : o.total,
    totalConEnvio: pricing.totalConEnvio != null ? pricing.totalConEnvio : o.total,
    pagarAhora: pricing.pagarAhora || 0,
    saldoContraentrega: pricing.saldoContraentrega || 0
  });
};
