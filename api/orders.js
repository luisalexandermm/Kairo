'use strict';
const supabase = require('../lib/supabase');
const { ok, err, allowCors, cleanText } = require('../lib/helpers');
const { priceCart, ANTICIPO_CONTRAENTREGA: ANTICIPO } = require('../lib/pricing');

const PAGOS = ['Contraentrega', 'Nequi / Daviplata'];

async function sendWhatsApp(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from || !to) return false;
  const params = new URLSearchParams({
    From: `whatsapp:${from.replace(/^whatsapp:/, '')}`,
    To: `whatsapp:${to.replace(/^whatsapp:/, '')}`,
    Body: body
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return response.ok;
}

function receiptText(id, items, total, customer, pricing = {}) {
  const lines = (items || []).map(i => `- ${i.brand} ${i.name} | T${i.size} | ${i.color} x${i.qty} | $${Number(i.price * i.qty || 0).toLocaleString('es-CO')}`).join('\n');
  return `kAIRO - Recibo de pedido ${id}\n\n${lines}\n\nTotal productos: $${Number(total || 0).toLocaleString('es-CO')}${pricing.coupon ? ' (cupón ' + pricing.coupon.code + ')' : ''}${pricing.freeShipping ? '\nEnvío: gratis' : ''}\nPago: ${customer.pago || 'Por confirmar'}\nEntrega: ${customer.direccion || ''}, ${customer.ciudad || ''}\n\nGracias por tu compra. Te confirmaremos el despacho por este medio.`;
}

/* Celular colombiano: 10 dígitos que empiezan por 3 (se acepta con o sin 57 adelante). */
function celularColombia(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : null;
}

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);

  const { items, customer: c = {}, consent } = req.body || {};

  /* Autorización de datos y aceptación de términos: obligatorias y separadas (Ley 1581 de 2012). */
  if (!consent || consent.datos !== true || consent.terminos !== true) {
    return err(res, 'Debes autorizar el tratamiento de datos y aceptar los términos', 400);
  }

  /* Solo guardamos los campos necesarios para entregar el pedido (principio de finalidad).
     Cualquier otro campo que llegue desde el navegador se descarta. */
  const telefono = celularColombia(c.telefono);
  const customer = {
    nombre: cleanText(c.nombre, 120),
    telefono,
    cedula: cleanText(c.cedula, 20).replace(/[^\dA-Za-z-]/g, ''),
    direccion: cleanText(c.direccion, 200),
    barrio: cleanText(c.barrio, 160),
    ciudad: cleanText(c.ciudad, 80),
    departamento: cleanText(c.departamento, 80),
    notas: cleanText(c.notas, 500),
    pago: PAGOS.includes(c.pago) ? c.pago : null
  };
  if (!customer.nombre || !customer.direccion || !customer.ciudad) return err(res, 'Faltan datos obligatorios de envío', 400);
  if (!telefono) return err(res, 'Escribe un celular colombiano de 10 dígitos (ej. 300 123 4567)', 400);
  if (!customer.pago) return err(res, 'Elige un método de pago', 400);

  // Precio, nombre, marca, promociones y cupón se recalculan contra la base de datos:
  // nunca confiamos en lo que llega desde el navegador.
  const r = await priceCart(supabase, items, req.body.coupon);
  if (r.error) return err(res, r.error, r.status || 400);
  const verifiedItems = r.items;
  const total = r.total;

  const now = new Date().toISOString();
  customer.shippingAdvance = customer.pago === 'Contraentrega' && !r.freeShipping ? ANTICIPO : 0;
  customer.balanceDue = customer.pago === 'Contraentrega' ? total : 0;
  customer.packaging = 'Sin caja por el momento';
  /* Prueba de la autorización (Decreto 1074 de 2015: el responsable debe poder demostrarla). */
  customer.consent = { datos: true, terminos: true, version: cleanText(consent.version, 20), fecha: now };

  const id = 'ord-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const pricing = {
    listSubtotal: r.listSubtotal, promoSavings: r.promoSavings, subtotal: r.subtotal,
    coupon: r.coupon ? { code: r.coupon.code, discount: r.coupon.discount, freeShipping: r.coupon.freeShipping } : null,
    freeShipping: r.freeShipping, shippingPromo: r.shippingPromo,
    shipping: r.freeShipping ? 0 : (customer.pago === 'Contraentrega' ? ANTICIPO : null),
    total
  };
  let { error } = await supabase.from('orders').insert({
    id, customer, items: verifiedItems, total, status: 'Nuevo', pricing
  });
  // Si aún no existe la columna "pricing" (migración de octubre sin ejecutar), guardamos sin ella.
  if (error && /pricing/i.test(error.message)) {
    customer.pricing = pricing;
    ({ error } = await supabase.from('orders').insert({ id, customer, items: verifiedItems, total, status: 'Nuevo' }));
  }

  if (error) {
    console.error('Pedido no guardado:', error.message);
    return err(res, 'No se pudo guardar el pedido. Intenta de nuevo o escríbenos por WhatsApp.', 500);
  }

  // Cuenta un uso del cupón. Se compara con el número de usos leído para no pisar
  // otro pedido que haya usado el mismo cupón al mismo tiempo.
  if (r.coupon) {
    const { data: upd } = await supabase.from('coupons')
      .update({ uses: r.coupon.uses + 1, updated_at: now })
      .eq('code', r.coupon.code).eq('uses', r.coupon.uses).select('code');
    if (!upd || !upd.length) {
      const { data: cur } = await supabase.from('coupons').select('uses').eq('code', r.coupon.code).maybeSingle();
      if (cur) await supabase.from('coupons').update({ uses: (Number(cur.uses) || 0) + 1, updated_at: now }).eq('code', r.coupon.code);
    }
  }

  const receipt = receiptText(id, verifiedItems, total, customer, pricing);
  const adminNumber = process.env.ADMIN_WHATSAPP_TO || 'whatsapp:+573145312045';
  const [adminNotified, customerNotified] = await Promise.all([
    sendWhatsApp(adminNumber, `Nuevo pedido kAIRO\n\n${receipt}`),
    sendWhatsApp('+57' + telefono, receipt)
  ]).catch(() => [false, false]);
  ok(res, { ok: true, id, total, pricing, adminNotified, customerNotified }, 201);
};
