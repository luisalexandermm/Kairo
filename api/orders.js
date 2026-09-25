'use strict';
const supabase = require('../lib/supabase');
const { ok, err, allowCors, cleanText } = require('../lib/helpers');

/* Anticipo de envío en contraentrega. Debe coincidir con public/js/negocio.js */
const ANTICIPO_CONTRAENTREGA = 25000;
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

function receiptText(id, items, total, customer) {
  const lines = (items || []).map(i => `- ${i.brand} ${i.name} | T${i.size} | ${i.color} x${i.qty} | $${Number(i.price * i.qty || 0).toLocaleString('es-CO')}`).join('\n');
  return `kAIRO - Recibo de pedido ${id}\n\n${lines}\n\nTotal productos: $${Number(total || 0).toLocaleString('es-CO')}\nPago: ${customer.pago || 'Por confirmar'}\nEntrega: ${customer.direccion || ''}, ${customer.ciudad || ''}\n\nGracias por tu compra. Te confirmaremos el despacho por este medio.`;
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
  if (!Array.isArray(items) || !items.length) return err(res, 'El pedido no tiene productos', 400);
  if (items.length > 20) return err(res, 'El pedido tiene demasiados productos', 400);

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

  // Recalculamos precio, nombre y marca de cada producto contra la base de datos: nunca confiamos
  // en lo que llega desde el navegador, porque se puede manipular.
  const ids = [...new Set(items.map(i => String(i.id || '')))];
  const { data: dbProducts, error: productsError } = await supabase
    .from('products').select('id,brand,name,price,sale_price,active,sizes,colors').in('id', ids);
  if (productsError) return err(res, 'No se pudieron validar los productos del pedido', 500);
  const productById = Object.fromEntries((dbProducts || []).map(p => [p.id, p]));

  let total = 0;
  const verifiedItems = [];
  for (const item of items) {
    const product = productById[item.id];
    if (!product || product.active === false) {
      return err(res, `El producto "${cleanText(item.name || item.id, 80)}" ya no está disponible`, 400);
    }
    const size = Number(item.size);
    if (Array.isArray(product.sizes) && product.sizes.length && !product.sizes.map(Number).includes(size)) {
      return err(res, `La talla ${cleanText(item.size, 5)} no está disponible para ${product.name}`, 400);
    }
    const colorNames = (product.colors || []).map(x => x && x.n).filter(Boolean);
    const color = cleanText(item.color, 60);
    if (colorNames.length && color && !colorNames.includes(color)) {
      return err(res, `El color "${color}" no está disponible para ${product.name}`, 400);
    }
    const qty = Math.min(9, Math.max(1, Math.floor(Number(item.qty) || 1)));
    const realPrice = (product.sale_price && product.sale_price > 0) ? product.sale_price : product.price;
    total += realPrice * qty;
    verifiedItems.push({ id: product.id, brand: product.brand, name: product.name, size, color, qty, price: realPrice });
  }

  const now = new Date().toISOString();
  customer.shippingAdvance = customer.pago === 'Contraentrega' ? ANTICIPO_CONTRAENTREGA : 0;
  customer.balanceDue = customer.pago === 'Contraentrega' ? total : 0;
  customer.packaging = 'Sin caja por el momento';
  /* Prueba de la autorización (Decreto 1074 de 2015: el responsable debe poder demostrarla). */
  customer.consent = { datos: true, terminos: true, version: cleanText(consent.version, 20), fecha: now };

  const id = 'ord-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const { error } = await supabase.from('orders').insert({
    id, customer, items: verifiedItems, total, status: 'Nuevo'
  });

  if (error) {
    console.error('Pedido no guardado:', error.message);
    return err(res, 'No se pudo guardar el pedido. Intenta de nuevo o escríbenos por WhatsApp.', 500);
  }

  const receipt = receiptText(id, verifiedItems, total, customer);
  const adminNumber = process.env.ADMIN_WHATSAPP_TO || 'whatsapp:+573145312045';
  const [adminNotified, customerNotified] = await Promise.all([
    sendWhatsApp(adminNumber, `Nuevo pedido kAIRO\n\n${receipt}`),
    sendWhatsApp('+57' + telefono, receipt)
  ]).catch(() => [false, false]);
  ok(res, { ok: true, id, total, adminNotified, customerNotified }, 201);
};
