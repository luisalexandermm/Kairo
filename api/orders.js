const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');

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
  return `kAIRO - Recibo de pedido ${id}\n\n${lines}\n\nTotal: $${Number(total || 0).toLocaleString('es-CO')}\nPago: ${customer.pago || 'Por confirmar'}\nEntrega: ${customer.direccion || ''}, ${customer.ciudad || ''}\n\nGracias por tu compra. Te confirmaremos el despacho por este medio.`;
}

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
  const receipt = receiptText(id, items, total, customer || {});
  const adminNumber = process.env.ADMIN_WHATSAPP_TO || 'whatsapp:+573145312045';
  const customerNumber = String(customer?.telefono || '').replace(/\D/g, '');
  const [adminNotified, customerNotified] = await Promise.all([
    sendWhatsApp(adminNumber, `Nuevo pedido kAIRO\n\n${receipt}`),
    customerNumber ? sendWhatsApp('+' + (customerNumber.startsWith('57') ? customerNumber : '57' + customerNumber), receipt) : false
  ]).catch(() => [false, false]);
  ok(res, { ok: true, id, adminNotified, customerNotified }, 201);
};
