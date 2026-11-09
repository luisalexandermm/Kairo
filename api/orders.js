'use strict';
/* POST /api/orders — registra un pedido.
   - Recalcula precios, promociones y cupón en el servidor (nunca confía en el navegador).
   - Asigna un número legible KS-AAAAMMDD-#### y arranca el seguimiento en "Recibido".
   - Guarda la prueba de la aceptación de términos y de la autorización de datos (Ley 1581). */
const supabase = require('../lib/supabase');
const { ok, err, allowCors, cleanText } = require('../lib/helpers');
const { priceCart, ENVIO } = require('../lib/pricing');
const { makeOrderNumber, clienteHash } = require('../lib/pedidos');
const { wompiReady, checkoutUrl } = require('../lib/wompi');
const { sendWhatsApp, adminWhatsApp } = require('../lib/whatsapp');

/* Wompi (tarjeta, PSE, Nequi, Bancolombia) solo aparece si sus llaves están configuradas */
const pagosDisponibles = () => (wompiReady() ? ['Wompi', 'Nequi', 'Contraentrega'] : ['Nequi', 'Contraentrega']);
/* Por ahora solo se hacen pedidos para entregar en Quibdó */
const CIUDAD = 'Quibdó', DEPARTAMENTO = 'Chocó';
const money = n => '$' + Number(n || 0).toLocaleString('es-CO');

/* Celular colombiano: 10 dígitos que empiezan por 3 (se acepta con 57 adelante) */
function celularColombia(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : '';
}

function receiptText(numero, items, customer, pricing) {
  const lines = items.map(i => `- ${i.brand} ${i.name} | Talla ${i.size}${i.color ? ' | ' + i.color : ''} x${i.qty} | ${money(i.price * i.qty)}`).join('\n');
  const extra = [];
  if (pricing.promoSavings) extra.push(`Ahorro por promociones: -${money(pricing.promoSavings)}`);
  if (pricing.coupon) extra.push(`Cupón ${pricing.coupon.code}: -${money(pricing.coupon.discount)}`);
  extra.push(`Envío: ${pricing.freeShipping ? 'gratis' : money(pricing.envio)}`);
  const pago = customer.pago === 'Wompi'
    ? `Pago en línea con Wompi: ${money(pricing.pagarAhora)}.`
    : customer.pago === 'Nequi'
    ? `Pago por Nequi: ${money(pricing.pagarAhora)} (QR o llave). Envíanos el comprobante.`
    : `Contraentrega: anticipo de envío ${money(pricing.pagarAhora)} por Nequi y saldo de ${money(pricing.saldoContraentrega)} al recibir.`;
  return `kAIRO Sneakers — Pedido ${numero}\n\n${lines}\n\n${extra.join('\n')}\nTotal: ${money(pricing.totalConEnvio)}\n${pago}\n` +
    `Entrega${customer.entrega ? ' ' + customer.entrega.toLowerCase() : ''}: ${customer.direccion}, ${customer.ciudad}\nTodos los productos se entregan sin caja.\n\n` +
    `Sigue tu pedido en la sección "Mis pedidos" de la tienda (número ${numero}).`;
}

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);

  const { items, customer: c = {}, consent = {}, coupon, cliente } = req.body || {};

  /* 1. Consentimiento (obligatorio, casillas sin marcar por defecto) */
  if (consent.terminos !== true) return err(res, 'Debes aceptar los términos y condiciones', 400);
  if (consent.datos !== true) return err(res, 'Debes autorizar el tratamiento de tus datos para poder enviar el pedido', 400);

  /* 2. Solo guardamos los datos necesarios para entregar el pedido */
  const customer = {
    nombre: cleanText(c.nombre, 120),
    telefono: celularColombia(c.telefono),
    cedula: cleanText(c.cedula, 20).replace(/[^\dA-Za-z]/g, ''),
    correo: cleanText(c.correo, 120),
    direccion: cleanText(c.direccion, 200),
    barrio: cleanText(c.barrio, 80),
    ciudad: CIUDAD,
    departamento: DEPARTAMENTO,
    notas: cleanText(c.notas, 500),
    pago: pagosDisponibles().includes(c.pago) ? c.pago : null,
    entrega: 'Local',
    empaque: 'Sin caja'
  };
  // Liga el pedido al dispositivo del cliente para "Mis pedidos" (solo se guarda el hash)
  const clienteId = clienteHash(cliente);
  if (clienteId) customer.clienteId = clienteId;
  if (!customer.nombre) return err(res, 'Escribe tu nombre completo', 400);
  if (!customer.telefono) return err(res, 'Escribe un celular colombiano válido (10 dígitos, empieza por 3)', 400);
  if (c.ciudad && !/^quibd[oó]$/i.test(cleanText(c.ciudad, 80))) return err(res, 'Por ahora solo hacemos entregas en Quibdó.', 400);
  if (!customer.direccion) return err(res, 'Escribe la dirección de entrega en Quibdó', 400);
  if (customer.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.correo)) return err(res, 'El correo no es válido', 400);
  if (!customer.pago) return err(res, 'Elige un método de pago', 400);

  /* 3. Precios reales */
  const r = await priceCart(supabase, items, coupon);
  if (r.error) return err(res, r.error, r.status || 400);

  const envio = r.freeShipping ? 0 : ENVIO;
  const totalConEnvio = r.total + envio;
  // Wompi y Nequi: se paga todo antes del envío. Contraentrega: se paga el anticipo del envío por Nequi y el resto al recibir.
  const pagarAhora = customer.pago === 'Contraentrega' ? ENVIO : totalConEnvio;
  const saldoContraentrega = customer.pago === 'Contraentrega' ? Math.max(0, totalConEnvio - ENVIO) : 0;
  const pricing = {
    listSubtotal: r.listSubtotal, promoSavings: r.promoSavings, subtotal: r.subtotal,
    coupon: r.coupon ? { code: r.coupon.code, description: r.coupon.description, discount: r.coupon.discount, freeShipping: r.coupon.freeShipping } : null,
    freeShipping: r.freeShipping, shippingPromo: r.shippingPromo,
    envio, total: r.total, totalConEnvio, pagarAhora, saldoContraentrega
  };
  customer.consent = {
    terminos: true, datos: true, marketing: consent.marketing === true,
    version: cleanText(consent.version, 20), fecha: new Date().toISOString()
  };
  const now = new Date().toISOString();
  const tracking = { history: [{ status: 'Recibido', at: now }], guia: '', transportadora: '', nota: '' };
  const items_ = r.items.map(({ image, ...i }) => ({ ...i, image, empaque: 'Sin caja' }));

  /* 4. Guardar (reintenta si el número ya existe; si faltan columnas nuevas, las guarda dentro de customer) */
  let numero, saved = false, lastError = null;
  for (let attempt = 0; attempt < 5 && !saved; attempt++) {
    numero = makeOrderNumber();
    let row = { id: numero, customer, items: items_, total: totalConEnvio, status: 'Recibido', pricing, tracking };
    let { error } = await supabase.from('orders').insert(row);
    if (error && /pricing|tracking/i.test(error.message) && /column/i.test(error.message)) {
      row = { id: numero, customer: { ...customer, pricing, tracking }, items: items_, total: totalConEnvio, status: 'Recibido' };
      ({ error } = await supabase.from('orders').insert(row));
    }
    if (!error) saved = true;
    else if (!/duplicate|unique/i.test(error.message)) { lastError = error; break; }
  }
  if (!saved) {
    console.error('Pedido no guardado:', lastError && lastError.message);
    return err(res, 'No se pudo guardar el pedido. Intenta de nuevo o escríbenos por WhatsApp.', 500);
  }

  /* 5. Uso del cupón (optimista: si dos pedidos llegan a la vez, se cuenta el último valor leído + 1) */
  if (r.coupon) {
    await supabase.from('coupons').update({ uses: r.coupon.uses + 1 }).eq('code', r.coupon.code).then(() => {}, () => {});
  }

  /* 6. Avisos por WhatsApp (si Twilio está configurado) */
  const receipt = receiptText(numero, items_, customer, pricing);
  const adminNumber = adminWhatsApp();
  const [adminNotified, customerNotified] = await Promise.all([
    sendWhatsApp(adminNumber, `Nuevo pedido kAIRO\n\n${receipt}`),
    sendWhatsApp('+57' + customer.telefono, receipt)
  ]).catch(() => [false, false]);

  /* 7. Pago en línea: link firmado al checkout de Wompi */
  const wompi = customer.pago === 'Wompi' ? checkoutUrl(req, { numero, amount: pagarAhora, customer }) : null;

  ok(res, {
    ok: true, id: numero, numero, createdAt: now,
    items: items_, pricing, pago: customer.pago,
    checkoutUrl: wompi ? wompi.url : null,
    adminNotified, customerNotified
  }, 201);
};
