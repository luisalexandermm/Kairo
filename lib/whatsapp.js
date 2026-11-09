'use strict';
/* Avisos por WhatsApp con Twilio (solo si las variables están configuradas) */
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
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return r.ok;
}

const adminWhatsApp = () => process.env.ADMIN_WHATSAPP_TO || 'whatsapp:+573145312045';

module.exports = { sendWhatsApp, adminWhatsApp };
