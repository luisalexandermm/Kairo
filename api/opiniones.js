'use strict';
/* /api/opiniones — opiniones de clientes.
   GET  ?producto=ID              → opiniones publicadas de ese producto + resumen
   POST { numero, ultimos4, productId, rating, envio, calidad, llegoBien, tallaAjuste,
          comentario, fotos: [dataURL], video: ruta, autorizo: true }
   POST { accion: 'video', numero, ultimos4, productId, tipo, tamano } → permiso temporal para
          subir el video directo a Supabase (los videos no caben por el servidor)
   Solo se acepta si el pedido existe, los 4 dígitos coinciden, está Entregado, el producto
   viene en el pedido y todavía no tiene opinión. Se publica de una vez (compra verificada). */
const { randomBytes } = require('crypto');
const supabase = require('../lib/supabase');
const { ok, err, allowCors, cleanText } = require('../lib/helpers');
const { ORDER_RE, normalizeStatus } = require('../lib/pedidos');
const O = require('../lib/opiniones');

const hits = new Map();
function tooMany(ip, max) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < 10 * 60e3);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}
const faltaTabla = e => e && /reviews/.test(e.message) && /(does not exist|schema cache|relation)/i.test(e.message);

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();

  /* -------- Leer las opiniones de un producto -------- */
  if (req.method === 'GET') {
    const producto = String((req.query && req.query.producto) || new URL(req.url, 'http://x').searchParams.get('producto') || '').trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(producto)) return err(res, 'Producto no válido', 400);
    const { data, error } = await supabase.from('reviews').select('*')
      .eq('product_id', producto).eq('estado', 'publicada').order('created_at', { ascending: false }).limit(200);
    if (error) { if (faltaTabla(error)) return ok(res, { resumen: O.resumen([]), opiniones: [] }); return err(res, 'No pudimos cargar las opiniones', 500); }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return ok(res, { resumen: O.resumen(data || []), opiniones: (data || []).slice(0, 50).map(O.publica) });
  }
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);
  if (tooMany(ip, 15)) return err(res, 'Demasiados intentos. Espera unos minutos.', 429);

  /* -------- Publicar una opinión -------- */
  const b = req.body || {};
  const numero = String(b.numero || '').trim().toUpperCase();
  const ultimos4 = String(b.ultimos4 || '').replace(/\D/g, '');
  const productId = String(b.productId || '').trim();
  if (!ORDER_RE.test(numero) || !/^\d{4}$/.test(ultimos4) || !/^[A-Za-z0-9_-]{1,80}$/.test(productId)) return err(res, 'Datos del pedido no válidos', 400);

  /* ¿Este pedido puede opinar sobre este producto? (existe, 4 dígitos, Entregado, producto incluido, sin opinión) */
  async function verificar() {
    const { data: o, error: oe } = await supabase.from('orders').select('id,status,customer,items').eq('id', numero).maybeSingle();
    const c = (o && o.customer) || {};
    if (oe || !o || !String(c.telefono || '').replace(/\D/g, '').endsWith(ultimos4)) return { error: ['No encontramos ese pedido.', 404] };
    if (normalizeStatus(o.status) !== 'Entregado') return { error: ['Podrás opinar cuando tu pedido aparezca como Entregado.', 409] };
    const item = (o.items || []).find(i => String(i.id) === productId);
    if (!item) return { error: ['Ese producto no está en tu pedido.', 400] };
    const { data: ya, error: ye } = await supabase.from('reviews').select('id').eq('order_id', numero).eq('product_id', productId).maybeSingle();
    if (ye) return { error: [faltaTabla(ye) ? 'Las opiniones todavía no están activas en la tienda.' : 'No pudimos guardar tu opinión.', 500] };
    if (ya) return { error: ['Ya opinaste sobre este producto. ¡Gracias!', 409] };
    return { o, c, item };
  }

  /* -------- Permiso temporal para subir un video directo a Supabase (no cabe por el servidor) -------- */
  if (b.accion === 'video') {
    const ext = O.VIDEO_TIPOS[String(b.tipo || '').toLowerCase()];
    if (!ext) return err(res, 'El video debe ser MP4, MOV o WEBM.', 400);
    if (!(Number(b.tamano) > 0) || Number(b.tamano) > O.MAX_VIDEO_BYTES) return err(res, 'El video debe pesar máximo 30 MB (unos 20 a 30 segundos).', 400);
    const v = await verificar();
    if (v.error) return err(res, v.error[0], v.error[1]);
    const ruta = `videos/${productId}/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
    const { data: s, error: se } = await supabase.storage.from(O.BUCKET).createSignedUploadUrl(ruta);
    if (se || !s) { console.error('[opiniones] permiso de video:', se && se.message); return err(res, 'No pudimos preparar la subida del video. Intenta de nuevo o publica sin video.', 500); }
    return ok(res, { ruta, url: s.signedUrl });
  }

  if (b.autorizo !== true) return err(res, 'Para publicar tu opinión debes autorizar que se muestre tu nombre corto.', 400);

  const rating = O.estrella(b.rating);
  if (!rating) return err(res, 'Elige de 1 a 5 estrellas.', 400);
  const comentario = cleanText(b.comentario, 1000);
  if (comentario.length < 10) return err(res, 'Cuéntanos un poco más (mínimo 10 letras).', 400);
  const fotosIn = Array.isArray(b.fotos) ? b.fotos : [];
  if (fotosIn.length > O.MAX_FOTOS) return err(res, 'Puedes subir máximo 3 fotos.', 400);
  const fotos = fotosIn.map(O.parseFoto);
  const malaFoto = fotos.find(f => f.error);
  if (malaFoto) return err(res, malaFoto.error, 400);

  const v = await verificar();
  if (v.error) return err(res, v.error[0], v.error[1]);
  const { c, item } = v;

  /* Video ya subido por el cliente con el permiso temporal: se comprueba que exista de verdad */
  let videoUrl = '';
  if (b.video) {
    if (!O.rutaVideoOk(b.video, productId)) return err(res, 'El video no es válido. Vuelve a subirlo.', 400);
    const carpeta = b.video.slice(0, b.video.lastIndexOf('/')), archivo = b.video.slice(b.video.lastIndexOf('/') + 1);
    const { data: hay } = await supabase.storage.from(O.BUCKET).list(carpeta, { search: archivo, limit: 1 });
    if (!hay || !hay.some(f => f.name === archivo)) return err(res, 'No encontramos tu video. Vuelve a subirlo.', 400);
    videoUrl = supabase.storage.from(O.BUCKET).getPublicUrl(b.video).data.publicUrl;
  }

  /* Fotos al bucket público (nombre aleatorio, sin datos del cliente) */
  const urls = [], subidas = [];
  for (const f of fotos) {
    const ruta = `${productId}/${Date.now()}-${randomBytes(8).toString('hex')}.${f.ext}`;
    const { error: ue } = await supabase.storage.from(O.BUCKET).upload(ruta, f.buffer, { contentType: f.mime, upsert: false });
    if (ue) {
      console.error('[opiniones] foto no subida:', ue.message);
      if (subidas.length) await supabase.storage.from(O.BUCKET).remove(subidas).then(() => {}, () => {});
      return err(res, 'No pudimos subir las fotos. Intenta de nuevo o publica tu opinión sin fotos.', 500);
    }
    subidas.push(ruta);
    urls.push(supabase.storage.from(O.BUCKET).getPublicUrl(ruta).data.publicUrl);
  }

  const row = {
    order_id: numero, product_id: productId, rating,
    envio: O.estrella(b.envio), calidad: O.estrella(b.calidad),
    llego_bien: typeof b.llegoBien === 'boolean' ? b.llegoBien : null,
    talla_ajuste: O.AJUSTES.includes(b.tallaAjuste) ? b.tallaAjuste : null,
    comentario, fotos: urls, video: videoUrl,
    nombre: O.nombrePublico(c.nombre), ciudad: '', // la ciudad ya no se guarda ni se publica
    talla: item.size != null ? String(item.size) : null, color: item.color || null
  };
  const { data: saved, error: se } = await supabase.from('reviews').insert(row).select().single();
  if (se) {
    if (subidas.length) await supabase.storage.from(O.BUCKET).remove(subidas).then(() => {}, () => {});
    if (/duplicate|unique/i.test(se.message)) return err(res, 'Ya opinaste sobre este producto. ¡Gracias!', 409);
    console.error('[opiniones] no guardada:', se.message);
    return err(res, faltaTabla(se) ? 'Las opiniones todavía no están activas en la tienda.' : 'No pudimos guardar tu opinión. Intenta de nuevo.', 500);
  }
  ok(res, { ok: true, opinion: O.publica(saved) }, 201);
};
