'use strict';
/* POST /api/wompi — pasarela de pago Wompi.
   1. Webhook de Wompi (evento "transaction.updated"): se valida la firma y se consulta la transacción.
   2. { accion: 'verificar', id }: el cliente vuelve de Wompi con ?id=… y la tienda pregunta el resultado.
   3. { accion: 'checkout', numero, ultimos4 }: genera un nuevo intento de pago (p. ej. si el anterior fue rechazado).
   En todos los casos el pedido solo pasa a "Pago confirmado" si Wompi dice APPROVED y el valor coincide. */
const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');
const { normalizeStatus, trackingOf } = require('../lib/pedidos');
const { wompiReady, checkoutUrl, getTransaction, validEvent, orderIdFromReference } = require('../lib/wompi');
const { sendWhatsApp, adminWhatsApp } = require('../lib/whatsapp');

const money = n => '$' + Number(n || 0).toLocaleString('es-CO');
const FINAL = ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'];

/* Aplica el resultado de una transacción de Wompi a su pedido */
async function applyTransaction(tx) {
  const numero = orderIdFromReference(tx && tx.reference);
  if (!numero) return { error: 'Referencia desconocida', status: 404 };
  const { data: o, error } = await supabase.from('orders').select('*').eq('id', numero).maybeSingle();
  if (error || !o) return { error: 'Pedido no encontrado', status: 404 };

  const c = o.customer || {};
  const pricing = o.pricing || c.pricing || {};
  const expected = Math.round(Number(pricing.pagarAhora != null ? pricing.pagarAhora : o.total) * 100);
  const status = normalizeStatus(o.status);
  const result = { numero, ultimos4: String(c.telefono || '').slice(-4), txStatus: tx.status, orderStatus: status };

  // Ya procesado antes (webhook y regreso del cliente llegan casi a la vez)
  if (c.wompi && c.wompi.transactionId === tx.id && c.wompi.status === tx.status) return result;
  // Un pedido ya pagado no se toca con intentos viejos
  if (c.wompi && c.wompi.status === 'APPROVED' && tx.status !== 'APPROVED') return result;

  const approved = tx.status === 'APPROVED' && tx.currency === 'COP' && Number(tx.amount_in_cents) === expected;
  if (tx.status === 'APPROVED' && !approved) {
    console.error(`Wompi: valor no coincide en ${numero}: ${tx.amount_in_cents} vs ${expected}`);
  }
  const now = new Date().toISOString();
  const wompi = {
    transactionId: tx.id, reference: tx.reference, status: approved || tx.status !== 'APPROVED' ? tx.status : 'REVISAR',
    metodo: tx.payment_method_type || '', valor: Number(tx.amount_in_cents) / 100, at: now
  };
  const update = { customer: { ...c, wompi } };
  const confirm = approved && status === 'Recibido';
  if (confirm) {
    const t = trackingOf(o);
    update.status = 'Pago confirmado';
    update.tracking = { ...t, history: [...t.history, { status: 'Pago confirmado', at: now, via: 'Wompi' }] };
  }
  let { error: ue } = await supabase.from('orders').update(update).eq('id', numero);
  if (ue && update.tracking && /tracking/i.test(ue.message) && /column/i.test(ue.message)) {
    const { tracking, ...rest } = update;
    ({ error: ue } = await supabase.from('orders').update({ ...rest, customer: { ...rest.customer, tracking } }).eq('id', numero));
  }
  if (ue) { console.error('Wompi: no se pudo actualizar', numero, ue.message); return { error: 'No se pudo actualizar el pedido', status: 500 }; }

  if (confirm) {
    result.orderStatus = 'Pago confirmado';
    await Promise.all([
      sendWhatsApp(adminWhatsApp(), `Pago aprobado en Wompi\nPedido ${numero} · ${money(wompi.valor)} · ${wompi.metodo}\n${c.nombre || ''} · ${c.direccion || ''}, ${c.barrio || ''} (Quibdó)`),
      c.telefono ? sendWhatsApp('+57' + c.telefono, `kAIRO: recibimos tu pago de ${money(wompi.valor)} para el pedido ${numero}. Ya lo estamos preparando.`) : false
    ]).catch(() => {});
  }
  return result;
}

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);
  if (!wompiReady()) return err(res, 'El pago en línea no está disponible en este momento.', 503);
  const b = req.body || {};

  /* 1. Webhook de Wompi */
  if (b.event) {
    if (!validEvent(b)) return err(res, 'Firma inválida', 401);
    if (b.event !== 'transaction.updated') return ok(res, { ok: true });
    const id = b.data && b.data.transaction && b.data.transaction.id;
    const tx = await getTransaction(id); // se confirma con la API, no solo con el aviso
    if (!tx) return err(res, 'Transacción no encontrada', 404);
    const r = await applyTransaction(tx);
    if (r.error && r.status === 500) return err(res, r.error, 500); // Wompi reintenta
    return ok(res, { ok: true });
  }

  /* 2. El cliente volvió de Wompi */
  if (b.accion === 'verificar') {
    const tx = await getTransaction(b.id);
    if (!tx) return err(res, 'No encontramos ese pago en Wompi.', 404);
    const r = FINAL.includes(tx.status) ? await applyTransaction(tx) : { numero: orderIdFromReference(tx.reference), txStatus: tx.status };
    if (r.error) return err(res, r.error, r.status || 400);
    return ok(res, { numero: r.numero, estado: tx.status, pedido: r.orderStatus || 'Recibido', metodo: tx.payment_method_type || '' });
  }

  /* 3. Nuevo intento de pago para un pedido existente */
  if (b.accion === 'checkout') {
    const numero = String(b.numero || '').trim().toUpperCase();
    const ultimos4 = String(b.ultimos4 || '').replace(/\D/g, '');
    if (!/^KS-\d{8}-\d{4}$/.test(numero) || !/^\d{4}$/.test(ultimos4)) return err(res, 'Pedido no válido', 400);
    const { data: o } = await supabase.from('orders').select('*').eq('id', numero).maybeSingle();
    const c = (o && o.customer) || {};
    if (!o || !String(c.telefono || '').endsWith(ultimos4)) return err(res, 'Pedido no encontrado', 404);
    if (normalizeStatus(o.status) !== 'Recibido') return err(res, 'Este pedido ya no está esperando el pago.', 409);
    if (c.wompi && c.wompi.status === 'APPROVED') return err(res, 'Este pedido ya fue pagado.', 409);
    const pricing = o.pricing || c.pricing || {};
    const { url } = checkoutUrl(req, { numero, amount: pricing.pagarAhora != null ? pricing.pagarAhora : o.total, customer: c });
    return ok(res, { checkoutUrl: url });
  }

  return err(res, 'Solicitud no válida', 400);
};
