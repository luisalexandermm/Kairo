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

module.exports = { STEPS, STATUSES, normalizeStatus, makeOrderNumber, trackingOf, buildSteps };
