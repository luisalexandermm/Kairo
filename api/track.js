'use strict';
/* POST /api/track — seguimiento público de un pedido.
   Pide el número del pedido + los últimos 4 dígitos del celular, y nunca devuelve
   cédula, correo, teléfono ni la dirección completa.
   Con { reportarPago: true, comprobante: "data:image/..." } el cliente informa que ya pagó
   por Nequi subiendo la foto del comprobante. */
const supabase = require('../lib/supabase');
const { ok, err, allowCors, cleanText } = require('../lib/helpers');
const { normalizeStatus, trackingOf, buildSteps } = require('../lib/pedidos');
const { randomBytes } = require('crypto');

const RECEIPT_BUCKET = 'kairo-comprobantes';
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const RECEIPT_TYPES = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' }
};

async function removeReceipt(path, context) {
  if (!path) return;
  try {
    const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
    if (error) console.error(context, error.message);
  } catch (error) {
    console.error(context, error.message);
  }
}

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
    const ref = typeof b.reportarPago === 'string' ? cleanText(b.reportarPago, 60) : '';
    if (status !== 'Recibido') return err(res, 'Este pedido ya no está esperando el pago.', 409);
    if (!b.comprobante) return err(res, 'Sube la foto del comprobante de pago.', 400);

    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(b.comprobante));
    if (!match) return err(res, 'La foto debe estar en formato JPG, PNG o WEBP.', 400);
    if (match[2].length > Math.ceil(MAX_RECEIPT_BYTES / 3) * 4) return err(res, 'La foto debe pesar máximo 2 MB.', 400);
    const mime = RECEIPT_TYPES[match[1].toLowerCase()].mime;
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > MAX_RECEIPT_BYTES) return err(res, 'La foto debe pesar máximo 2 MB.', 400);
    const validSignature = mime === 'image/jpeg'
      ? image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
      : mime === 'image/png'
        ? image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
    if (!validSignature) return err(res, 'El archivo no parece ser una imagen válida.', 400);

    const ext = RECEIPT_TYPES[match[1].toLowerCase()].ext;
    const uploadedPath = `${numero}/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
    try {
      const { error: uploadError } = await supabase.storage.from(RECEIPT_BUCKET).upload(uploadedPath, image, {
        contentType: mime, upsert: false
      });
      if (uploadError) {
        console.error('Comprobante no subido:', uploadError.message);
        return err(res, 'No se pudo subir la foto. Intenta de nuevo o envíanos el comprobante por WhatsApp.', 500);
      }
    } catch (uploadError) {
      console.error('Comprobante no subido:', uploadError.message);
      return err(res, 'No se pudo subir la foto. Intenta de nuevo o envíanos el comprobante por WhatsApp.', 500);
    }

    const at = new Date().toISOString();
    const tracking = { ...t, history: [...t.history, { status: 'Pago reportado', at, ...(ref ? { ref } : {}) }] };
    const previousPath = o.customer.pagoReportado && o.customer.pagoReportado.comprobantePath;
    const customer = {
      ...o.customer,
      pagoReportado: {
        ...o.customer.pagoReportado,
        ref, at,
        ...(uploadedPath ? { comprobantePath: uploadedPath, comprobanteMime: mime } : {})
      }
    };
    let up;
    try {
      up = await supabase.from('orders').update({ customer, tracking, updated_at: at }).eq('id', numero);
      if (up.error && /tracking/i.test(up.error.message)) {
        up = await supabase.from('orders').update({ customer: { ...customer, tracking }, updated_at: at }).eq('id', numero);
      }
    } catch (updateError) {
      console.error('Reporte de pago no guardado:', updateError.message);
      await removeReceipt(uploadedPath, 'Comprobante huérfano no eliminado:');
      return err(res, 'No se pudo registrar el reporte. Escríbenos por WhatsApp.', 500);
    }
    if (up.error) {
      await removeReceipt(uploadedPath, 'Comprobante huérfano no eliminado:');
      return err(res, 'No se pudo registrar el reporte. Escríbenos por WhatsApp.', 500);
    }
    if (uploadedPath && previousPath && previousPath !== uploadedPath) await removeReceipt(previousPath, 'Comprobante anterior no eliminado:');
    return ok(res, { ok: true, reportadoEn: at, comprobanteRecibido: !!(uploadedPath || previousPath) });
  }

  const steps = buildSteps(o);
  const cur = steps.find(s => s.state === 'current') || steps[steps.length - 1];

  /* Enlaces temporales para que el cliente vea y descargue la foto que subió */
  const receiptPath = o.customer.pagoReportado && o.customer.pagoReportado.comprobantePath;
  let comprobanteUrl = '';
  let comprobanteDescarga = '';
  if (receiptPath && receiptPath.startsWith(`${numero}/`)) {
    try {
      const bucket = supabase.storage.from(RECEIPT_BUCKET);
      const [view, download] = await Promise.all([
        bucket.createSignedUrl(receiptPath, 600),
        bucket.createSignedUrl(receiptPath, 600, { download: `Comprobante-${numero}.${receiptPath.split('.').pop()}` })
      ]);
      if (view.error || download.error) console.error('No se pudo firmar el comprobante:', (view.error || download.error).message);
      else { comprobanteUrl = view.data.signedUrl; comprobanteDescarga = download.data.signedUrl; }
    } catch (signError) {
      console.error('No se pudo firmar el comprobante:', signError.message);
    }
  }

  ok(res, {
    numero: o.id, createdAt: o.created_at,
    pago: o.customer.pago || '', ciudad: o.customer.ciudad || '',
    nombre: String(o.customer.nombre || '').split(' ')[0],
    direccion: maskAddress(o.customer.direccion),
    status, statusLabel: status === 'Cancelado' ? 'Cancelado' : cur.label,
    steps, guia: t.guia, transportadora: t.transportadora, nota: t.nota,
    pagoReportado: o.customer.pagoReportado ? {
      at: o.customer.pagoReportado.at,
      hasComprobante: !!o.customer.pagoReportado.comprobantePath,
      comprobanteUrl, comprobanteDescarga
    } : null,
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
