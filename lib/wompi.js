'use strict';
/* =====================================================================
   Pasarela de pago Wompi (Bancolombia): tarjeta, PSE, Nequi, Bancolombia.
   - El checkout se arma en el servidor con la firma de integridad, así el
     cliente no puede cambiar el valor ni la referencia.
   - El pago SOLO se da por bueno después de consultarlo en la API de Wompi
     (nunca por lo que diga la URL de regreso).
   Variables: WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET, WOMPI_EVENTS_SECRET, SITE_URL (opcional)
   ===================================================================== */
const crypto = require('crypto');

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

function wompiReady() {
  return !!(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET);
}

/* Llaves de pruebas (pub_test_…) → sandbox; llaves reales (pub_prod_…) → producción */
function apiBase() {
  return /^pub_test_/.test(process.env.WOMPI_PUBLIC_KEY || '') ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
}

/* Dirección pública de la tienda, para que Wompi devuelva al cliente */
function siteUrl(req) {
  const env = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const host = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'localhost:3000').split(',')[0].trim();
  const proto = String((req && req.headers && req.headers['x-forwarded-proto']) || (/^localhost|^127\./.test(host) ? 'http' : 'https')).split(',')[0].trim();
  return `${proto}://${host}`;
}

/* Cada intento de pago lleva una referencia nueva (Wompi no repite referencias):
   KS-AAAAMMDD-####-XXXX. Los primeros 16 caracteres son el número del pedido. */
function newReference(numero) {
  return `${numero}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
function orderIdFromReference(ref) {
  const m = /^(KS-\d{8}-\d{4})-[A-Z0-9]{4,8}$/.exec(String(ref || ''));
  return m ? m[1] : '';
}

/* URL del Web Checkout de Wompi para un pedido */
function checkoutUrl(req, { numero, amount, customer = {} }) {
  const amountInCents = Math.round(Number(amount) * 100);
  const reference = newReference(numero);
  const currency = 'COP';
  const p = new URLSearchParams({
    'public-key': process.env.WOMPI_PUBLIC_KEY,
    currency,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': sha256(`${reference}${amountInCents}${currency}${process.env.WOMPI_INTEGRITY_SECRET}`),
    'redirect-url': `${siteUrl(req)}/?wompi=1`
  });
  if (customer.correo) p.set('customer-data:email', customer.correo);
  if (customer.nombre) p.set('customer-data:full-name', customer.nombre);
  if (customer.telefono) { p.set('customer-data:phone-number', customer.telefono); p.set('customer-data:phone-number-prefix', '+57'); }
  return { url: `https://checkout.wompi.co/p/?${p.toString()}`, reference };
}

/* Consulta una transacción en Wompi (fuente de verdad) */
async function getTransaction(id) {
  if (!/^[A-Za-z0-9-]{6,64}$/.test(String(id || ''))) return null;
  const r = await fetch(`${apiBase()}/transactions/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j && j.data ? j.data : null;
}

/* Firma de los eventos (webhook) que manda Wompi */
function validEvent(body) {
  const secret = process.env.WOMPI_EVENTS_SECRET;
  const sig = body && body.signature;
  if (!secret || !sig || !Array.isArray(sig.properties) || !sig.checksum) return false;
  const value = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), body.data);
  const raw = sig.properties.map(value).join('') + String(body.timestamp) + secret;
  const expected = sha256(raw);
  const got = String(sig.checksum).toLowerCase();
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

module.exports = { wompiReady, apiBase, siteUrl, checkoutUrl, getTransaction, validEvent, orderIdFromReference };
