'use strict';
/* =====================================================================
   Pedidos de kAIRO: número legible, estados y seguimiento.
   ===================================================================== */

/* Etapas del pedido, en orden. "Cancelado" es aparte (corta el recorrido). */
const STEPS = [
  { key: 'Recibido',        label: 'Pedido recibido' },
  { key: 'Pago confirmado', label: 'Pago confirmado' },
  { key: 'En preparación',  label: 'En preparación' },
  { key: 'Enviado',         label: 'Enviado' },
  { key: 'Entregado',       label: 'Entregado' }
];
const STATUSES = [...STEPS.map(s => s.key), 'Cancelado'];

/* Estados que existían antes (Nuevo, Confirmado) se traducen a los nuevos */
function normalizeStatus(s) {
  if (s === 'Nuevo' || !s) return 'Recibido';
  if (s === 'Confirmado') return 'Pago confirmado';
  return STATUSES.includes(s) ? s : 'Recibido';
}

/* Número de pedido: KS-AAAAMMDD-#### (KS = kAIRO Sneakers). Fecha de Colombia. */
function makeOrderNumber(now = new Date()) {
  const co = new Date(now.getTime() - 5 * 3600e3); // UTC-5
  const ymd = co.toISOString().slice(0, 10).replace(/-/g, '');
  const n = String(Math.floor(1000 + Math.random() * 9000));
  return `KS-${ymd}-${n}`;
}

/* Lee el seguimiento guardado (columna tracking o, si no existe, dentro de customer) */
function trackingOf(order) {
  const t = order.tracking || (order.customer && order.customer.tracking) || {};
  return { history: Array.isArray(t.history) ? t.history : [], guia: t.guia || '', transportadora: t.transportadora || '', nota: t.nota || '' };
}

/* Recorrido para mostrar al cliente: done / current / todo */
function buildSteps(order) {
  const status = normalizeStatus(order.status);
  const t = trackingOf(order);
  const idx = STEPS.findIndex(s => s.key === status);
  const at = key => {
    const h = [...t.history].reverse().find(x => x.status === key);
    if (h) return h.at;
    return key === 'Recibido' ? order.created_at : null;
  };
  return STEPS.map((s, i) => ({
    key: s.key,
    label: s.key === 'Pago confirmado' && order.customer && order.customer.pago === 'Contraentrega' ? 'Anticipo de envío confirmado' : s.label,
    state: status === 'Cancelado' ? 'todo' : i < idx ? 'done' : i === idx ? (i === STEPS.length - 1 ? 'done' : 'current') : 'todo',
    at: i <= idx ? at(s.key) : null
  }));
}

/* Identificador anónimo del dispositivo del cliente ("Mis pedidos" sin cuenta).
   El navegador genera un valor aleatorio; en la base solo se guarda su hash. */
function clienteHash(v) {
  const s = String(v || '');
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(s)) return '';
  return require('crypto').createHash('sha256').update('kairo-cliente:' + s).digest('hex');
}

const maskAddress = s => {
  const t = String(s || '');
  return t.length <= 8 ? t : t.slice(0, 8) + '…';
};

/* Resumen público de un pedido para "Mis pedidos" (sin datos sensibles) */
function publicOrder(o) {
  const c = o.customer || {};
  const status = normalizeStatus(o.status);
  const t = trackingOf(o);
  const steps = buildSteps(o);
  const cur = steps.find(s => s.state === 'current') || steps[steps.length - 1];
  const pricing = o.pricing || c.pricing || {};
  return {
    numero: o.id, createdAt: o.created_at,
    ultimos4: String(c.telefono || '').replace(/\D/g, '').slice(-4),
    nombre: String(c.nombre || '').split(' ')[0],
    pago: c.pago || '', entrega: c.entrega || '', ciudad: c.ciudad || '', direccion: maskAddress(c.direccion),
    status, statusLabel: status === 'Cancelado' ? 'Cancelado' : cur.label,
    steps, guia: t.guia, transportadora: t.transportadora, nota: t.nota,
    pagoReportado: c.pagoReportado ? { at: c.pagoReportado.at, hasComprobante: !!c.pagoReportado.comprobantePath } : null,
    items: (o.items || []).map(i => ({ id: i.id, brand: i.brand, name: i.name, size: i.size, color: i.color, qty: i.qty, price: i.price, image: i.image || '' })),
    pricing: {
      promoSavings: pricing.promoSavings || 0,
      discount: pricing.coupon ? pricing.coupon.discount : 0,
      couponCode: pricing.coupon ? pricing.coupon.code : '',
      envio: pricing.envio != null ? pricing.envio : null,
      freeShipping: !!pricing.freeShipping,
      total: pricing.total != null ? pricing.total : o.total,
      totalConEnvio: pricing.totalConEnvio != null ? pricing.totalConEnvio : o.total,
      pagarAhora: pricing.pagarAhora || 0,
      saldoContraentrega: pricing.saldoContraentrega || 0
    }
  };
}

module.exports = { STEPS, STATUSES, normalizeStatus, makeOrderNumber, trackingOf, buildSteps, clienteHash, publicOrder };
