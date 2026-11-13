'use strict';
/* /api/admin/* — panel de administración (requiere token firmado). */
const supabase = require('../lib/supabase');
const { ok, err, allowCors, checkToken, slug, hashPassword, cleanText } = require('../lib/helpers');
const { STATUSES, normalizeStatus, trackingOf, linkOk } = require('../lib/pedidos');
const { notifyOrder, pushReady, endpointOk, tablaLista, ADMIN, PUBLIC_KEY } = require('../lib/push');
const { precioEnvio } = require('../lib/envios');
const { wompiReady } = require('../lib/wompi');
const { sanitize: sanitizeCuentas } = require('../lib/cuentas');

/* ------------------------------------------------------------------ */
/*  Productos: camelCase (panel) ↔ snake_case (base de datos)          */
/* ------------------------------------------------------------------ */
const PRODUCT_COLS = {
  brand: 'brand', name: 'name', price: 'price', salePrice: 'sale_price',
  tag: 'tag', desc: 'description', sizes: 'sizes', colors: 'colors',
  image: 'image', shape: 'shape', shoeColor: 'shoe_color', bg: 'bg',
  stock: 'stock', active: 'active', featured: 'featured', position: 'position',
  category: 'category', gender: 'gender'
};
const CATEGORIES = ['Tenis', 'Sandalias', 'Chanclas', 'Botas'];
const GENDERS = ['Hombre', 'Mujer', 'Unisex'];
const toDb = (obj, map) => {
  const r = {};
  for (const [k, v] of Object.entries(map)) if (k in obj) r[v] = obj[k];
  if ('category' in r && !CATEGORIES.includes(r.category)) r.category = 'Tenis';
  if ('gender' in r && !GENDERS.includes(r.gender)) r.gender = 'Unisex';
  if ('brand' in r) r.brand = cleanText(r.brand, 40);
  return r;
};
const prodToFront = p => ({
  id: p.id, brand: p.brand, name: p.name, price: p.price, salePrice: p.sale_price,
  tag: p.tag, desc: p.description, sizes: p.sizes, colors: p.colors,
  image: p.image, shape: p.shape, shoeColor: p.shoe_color, bg: p.bg,
  stock: p.stock, active: p.active, featured: p.featured, position: p.position,
  category: p.category || (p.shape === 's-boot' ? 'Botas' : 'Tenis'), gender: p.gender || 'Unisex',
  createdAt: p.created_at
});

/* ------------------------------------------------------------------ */
/*  Promociones, cupones y anuncios: CRUD genérico con validaciones     */
/* ------------------------------------------------------------------ */
const date = v => (v ? new Date(v).toISOString() : null);
/* Foto de promoción o cupón: solo de la tienda (/img/…) o https (bucket de Supabase) */
const imagenOk = v => { const s = String(v || '').trim(); return /^(https:\/\/[^\s"'<>]+|\/img\/[\w.-]+)$/.test(s) ? s.slice(0, 600) : ''; };
const CRUD = {
  promos: {
    table: 'promos', key: 'id', idFrom: b => slug(b.title || 'promo') + '-' + Date.now().toString(36).slice(-4),
    fields: {
      title: v => cleanText(v, 80), description: v => cleanText(v, 300), badge: v => cleanText(v, 30),
      kind: v => (['descuento', 'envio', 'informativa'].includes(v) ? v : 'informativa'),
      discount: v => Math.min(90, Math.max(0, Math.round(Number(v) || 0))),
      scope_type: v => (['todo', 'marca', 'categoria', 'genero', 'producto'].includes(v) ? v : 'todo'),
      scope_value: v => cleanText(v, 80), min_subtotal: v => Math.max(0, Math.round(Number(v) || 0)),
      starts_at: date, ends_at: date, conditions: v => cleanText(v, 1500), active: v => v !== false,
      image: v => imagenOk(v), popup: v => v === true
    },
    defaults: { kind: 'informativa', scope_type: 'todo', active: true },
    validate(r) {
      if (!r.title) return 'Escribe el título de la promoción';
      if (r.kind === 'descuento' && !r.discount) return 'Escribe el porcentaje de descuento (1 a 90)';
      if (r.kind !== 'informativa' && (!r.conditions || r.conditions.length < 15)) return 'Escribe las condiciones de la promoción (qué aplica, desde cuándo y hasta cuándo). Son obligatorias por la Ley 1480.';
      if (r.scope_type !== 'todo' && !r.scope_value) return 'Indica a qué marca, categoría, género o producto aplica';
      if (r.starts_at && r.ends_at && r.ends_at < r.starts_at) return 'La fecha final es anterior a la inicial';
    }
  },
  coupons: {
    table: 'coupons', key: 'code', idFrom: b => String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
    fields: {
      description: v => cleanText(v, 200),
      type: v => (['porcentaje', 'valor', 'envio'].includes(v) ? v : 'porcentaje'),
      value: v => Math.max(0, Math.round(Number(v) || 0)), max_discount: v => Math.max(0, Math.round(Number(v) || 0)),
      min_subtotal: v => Math.max(0, Math.round(Number(v) || 0)), max_uses: v => Math.max(0, Math.round(Number(v) || 0)),
      starts_at: date, ends_at: date, conditions: v => cleanText(v, 1500), active: v => v !== false,
      image: v => imagenOk(v), publico: v => v === true, popup: v => v === true
    },
    defaults: { type: 'porcentaje', active: true, uses: 0 },
    validate(r, isNew) {
      if (isNew && (!r.code || r.code.length < 3)) return 'El código debe tener al menos 3 letras o números';
      if (r.type === 'porcentaje' && (r.value < 1 || r.value > 90)) return 'El porcentaje debe estar entre 1 y 90';
      if (r.type === 'valor' && r.value < 1000) return 'El valor del cupón debe ser de al menos $1.000';
      if (r.popup && !r.publico) return 'Para mostrar el cupón en la ventana al entrar, marca también “Mostrar en la tienda”.';
      if (r.publico && (!r.conditions || r.conditions.length < 15)) return 'Un cupón que se muestra en la tienda necesita sus condiciones (mínimo de compra, vigencia, límite de usos). Ley 1480.';
      if (r.starts_at && r.ends_at && r.ends_at < r.starts_at) return 'La fecha final es anterior a la inicial';
    }
  },
  announcements: {
    table: 'announcements', key: 'id', idFrom: b => (b.kind || 'anuncio') + '-' + Date.now().toString(36),
    fields: {
      kind: v => (['banner', 'barra', 'dinamica'].includes(v) ? v : 'banner'),
      title: v => cleanText(v, 90), subtitle: v => cleanText(v, 220), button_text: v => cleanText(v, 30),
      link_type: v => (['ninguno', 'marca', 'categoria', 'genero', 'producto', 'url'].includes(v) ? v : 'ninguno'),
      link_value: v => cleanText(v, 200), image: v => cleanText(v, 600),
      color: v => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#0e4d38'),
      conditions: v => cleanText(v, 3000), has_chance: v => v === true, coljuegos_ref: v => cleanText(v, 60),
      starts_at: date, ends_at: date, active: v => v !== false, position: v => Math.round(Number(v) || 0)
    },
    defaults: { kind: 'banner', link_type: 'ninguno', active: true },
    validate(r) {
      if (!r.title) return 'Escribe el título';
      if (r.link_type === 'url' && r.link_value && !/^(https:\/\/|\/)/.test(r.link_value)) return 'El enlace debe empezar por https:// o por /';
      if (r.kind === 'dinamica') {
        if (!r.conditions || r.conditions.length < 40) return 'Escribe las bases de la dinámica: cómo participar, fechas, premio, cómo se elige al ganador y cómo se entrega.';
        if (r.has_chance && r.active && !r.coljuegos_ref) return 'Un sorteo o rifa (donde gana el azar) necesita autorización de Coljuegos. Escribe el número de autorización o déjala inactiva.';
      }
      if (r.starts_at && r.ends_at && r.ends_at < r.starts_at) return 'La fecha final es anterior a la inicial';
    }
  }
};

const faltaCol = e => /(image|popup|publico)/.test(e.message) && /column/i.test(e.message) ? 'Falta preparar la base: ejecuta lib/migracion-cupones-fotos-2026-11.sql en Supabase.' : '';

function cleanRow(body, cfg, isNew) {
  const row = {};
  for (const [k, fn] of Object.entries(cfg.fields)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const v = k in body ? body[k] : body[camel];
    if (v !== undefined) row[k] = fn(v);
    else if (isNew && k in cfg.defaults) row[k] = cfg.defaults[k];
  }
  if (isNew) for (const [k, v] of Object.entries(cfg.defaults)) if (!(k in row)) row[k] = v;
  return row;
}

/* ------------------------------------------------------------------ */
module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!checkToken(req.headers['x-admin-token'])) return err(res, 'Sesión vencida. Vuelve a entrar.', 401);

  const parts = (req.url || '').split('?')[0].replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [section, id, action] = parts;
  const method = req.method;
  const body = req.body || {};
  const nowIso = () => new Date().toISOString();

  /* -------- RESUMEN -------- */
  if (section === 'stats' && method === 'GET') {
    const [{ count: totalP }, { count: activeP }, { count: promos }, { count: orders }, { data: rows }, pq] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('promos').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('total,status'),
      supabase.from('pqrs').select('id', { count: 'exact', head: true }).eq('estado', 'Radicada').then(r => r, () => ({ count: 0 }))
    ]);
    const list = rows || [];
    const revenue = list.filter(r => r.status !== 'Cancelado').reduce((s, r) => s + (r.total || 0), 0);
    const newOrders = list.filter(r => normalizeStatus(r.status) === 'Recibido').length;
    return ok(res, { products: totalP, activeProducts: activeP, promos, orders, newOrders, revenue, pqrPending: pq.count || 0, storage: 'supabase' });
  }

  /* -------- OPINIONES DE CLIENTES -------- */
  if (section === 'opiniones') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) {
        if (/reviews/.test(error.message)) return ok(res, { lista: [], falta: 'Ejecuta lib/migracion-opiniones-2026-11.sql en Supabase para activar las opiniones.' });
        return err(res, error.message, 500);
      }
      return ok(res, { lista: data || [] });
    }
    if (method === 'PUT' && id) {
      const up = {};
      if (body.estado != null) { if (!['publicada', 'oculta'].includes(body.estado)) return err(res, 'Estado no válido', 400); up.estado = body.estado; }
      if (body.respuesta != null) { up.respuesta = cleanText(body.respuesta, 800) || null; up.respuesta_at = up.respuesta ? nowIso() : null; }
      const { data, error } = await supabase.from('reviews').update(up).eq('id', id).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, data);
    }
    if (method === 'DELETE' && id) {
      const { data: r } = await supabase.from('reviews').select('*').eq('id', id).maybeSingle();
      const { error } = await supabase.from('reviews').delete().eq('id', id);
      if (error) return err(res, error.message, 500);
      const { BUCKET, rutaDesdeUrl } = require('../lib/opiniones');
      const rutas = ((r && r.fotos) || []).concat(r && r.video ? [r.video] : []).map(rutaDesdeUrl).filter(Boolean);
      if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas).then(() => {}, () => {});
      return ok(res, { ok: true });
    }
    return err(res, 'Método no permitido', 405);
  }

  /* -------- AVISOS DE PEDIDOS NUEVOS EN LOS DISPOSITIVOS DE LA TIENDA -------- */
  if (section === 'push') {
    if (method === 'GET') return ok(res, { activo: pushReady(), publicKey: pushReady() ? PUBLIC_KEY : '', tabla: await tablaLista(supabase) });
    if (method !== 'POST') return err(res, 'Método no permitido', 405);
    if (!pushReady()) return err(res, 'Faltan las llaves VAPID en Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).', 503);
    const s = body.sub || {}, k = s.keys || {};
    const b64 = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v);
    if (body.accion === 'quitar') {
      if (!endpointOk(body.endpoint)) return err(res, 'Suscripción no válida', 400);
      await supabase.from('push_subs').delete().eq('endpoint', body.endpoint).eq('cliente', ADMIN);
      return ok(res, { ok: true });
    }
    if (!endpointOk(s.endpoint) || !b64(k.p256dh, 80, 120) || !b64(k.auth, 16, 40)) return err(res, 'Suscripción no válida', 400);
    const { error } = await supabase.from('push_subs').upsert({ endpoint: s.endpoint, p256dh: k.p256dh, auth: k.auth, cliente: ADMIN, pedidos: [], updated_at: nowIso() }, { onConflict: 'endpoint' });
    if (error) return err(res, /push_subs/.test(error.message) ? 'Falta preparar la base: ejecuta lib/migracion-avisos-2026-11.sql en Supabase.' : error.message, 500);
    return ok(res, { ok: true });
  }

  /* -------- AJUSTES -------- */
  if (section === 'settings') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 'app').single();
      if (error) return err(res, error.message, 500);
      return ok(res, {
        storeName: data.store_name, tagline: data.tagline, whatsapp: data.whatsapp,
        heroWord: data.hero_word, heroTheme: data.hero_theme, heroLogo: data.hero_logo,
        heroHeadline: data.hero_headline, shippingNote: data.shipping_note,
        envioNacional: precioEnvio(data.envio_nacional), envioListo: Object.prototype.hasOwnProperty.call(data, 'envio_nacional'),
        pagos: sanitizeCuentas(data.pagos), pagosListo: Object.prototype.hasOwnProperty.call(data, 'pagos'),
        wompi: { activo: wompiReady(), pruebas: /^pub_test_/.test(process.env.WOMPI_PUBLIC_KEY || ''), eventos: !!process.env.WOMPI_EVENTS_SECRET }
      });
    }
    if (method === 'PUT') {
      const update = { updated_at: nowIso() };
      const map = { storeName: 'store_name', tagline: 'tagline', whatsapp: 'whatsapp', heroWord: 'hero_word', heroTheme: 'hero_theme', heroLogo: 'hero_logo', heroHeadline: 'hero_headline', shippingNote: 'shipping_note' };
      for (const [k, col] of Object.entries(map)) if (body[k] != null) update[col] = cleanText(body[k], 300);
      if (body.pagos != null) update.pagos = sanitizeCuentas(body.pagos);
      if (body.envioNacional != null && body.envioNacional !== '') update.envio_nacional = precioEnvio(body.envioNacional);
      if (body.adminPassword) {
        if (String(body.adminPassword).length < 10) return err(res, 'La contraseña debe tener al menos 10 caracteres', 400);
        update.admin_password = hashPassword(body.adminPassword);
      }
      const { error } = await supabase.from('settings').update(update).eq('id', 'app');
      if (error && /envio_nacional/i.test(error.message)) return err(res, 'Falta preparar la base: ejecuta lib/migracion-punto-club-2026-11.sql en Supabase.', 500);
      if (error && /pagos/i.test(error.message)) return err(res, 'Falta preparar la base: ejecuta lib/migracion-domicilios-2026-11.sql en Supabase.', 500);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- SUBIR IMAGEN -------- */
  if (section === 'upload' && method === 'POST') {
    const { data: imageData, name: fileName } = body;
    const bucket = 'kairo-images';
    if (!imageData) return err(res, 'Envía la imagen', 400);
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i.exec(imageData);
    if (!m) return err(res, 'Formato de imagen no permitido (usa JPG, PNG, WEBP o GIF)', 400);
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) return err(res, 'La imagen pesa más de 5 MB', 400);
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[m[1].toLowerCase()];
    const path = `${slug(fileName || 'imagen')}-${Date.now().toString(36)}${ext}`;
    await supabase.storage.createBucket(bucket, { public: true }).catch(() => {});
    const { error: ue } = await supabase.storage.from(bucket).upload(path, buf, { contentType: m[1], upsert: false });
    if (ue) return err(res, 'Error al subir la imagen. Verifica el bucket kairo-images en Supabase: ' + ue.message, 500);
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return ok(res, { url: urlData.publicUrl }, 201);
  }

  /* -------- PRODUCTOS -------- */
  if (section === 'products') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('products').select('*').order('position');
      if (error) return err(res, error.message, 500);
      return ok(res, (data || []).map(prodToFront));
    }
    if (method === 'POST') {
      let newId = slug(`${body.brand || ''}-${body.name || ''}`) || 'producto-' + Date.now().toString(36);
      const { data: existing } = await supabase.from('products').select('id').eq('id', newId).maybeSingle();
      if (existing) newId += '-' + Date.now().toString(36).slice(-4);
      const row = { id: newId, ...toDb(body, PRODUCT_COLS), updated_at: nowIso() };
      if (!row.position) {
        const { count } = await supabase.from('products').select('id', { count: 'exact', head: true });
        row.position = (count || 0) + 1;
      }
      const { data, error } = await supabase.from('products').insert(row).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, prodToFront(data), 201);
    }
    if (method === 'PUT' && id) {
      const { data, error } = await supabase.from('products').update({ ...toDb(body, PRODUCT_COLS), updated_at: nowIso() }).eq('id', id).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, prodToFront(data));
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- PROMOCIONES / CUPONES / ANUNCIOS -------- */
  if (CRUD[section]) {
    const cfg = CRUD[section];
    if (method === 'GET') {
      const q = supabase.from(cfg.table).select('*');
      const { data, error } = await (cfg.key === 'id' ? q.order('position') : q.order('created_at', { ascending: false }));
      if (error) return err(res, /does not exist|relation|schema cache|could not find the table/i.test(error.message) ? 'Falta ejecutar la migración lib/migracion-promos-2026-10.sql en Supabase' : error.message, 500);
      return ok(res, data || []);
    }
    if (method === 'POST') {
      const row = cleanRow(body, cfg, true);
      row[cfg.key] = cfg.idFrom(body);
      if (cfg.key === 'id' && !('position' in row)) {
        const { count } = await supabase.from(cfg.table).select('id', { count: 'exact', head: true });
        row.position = (count || 0) + 1;
      }
      const v = cfg.validate(row, true);
      if (v) return err(res, v, 400);
      const { data, error } = await supabase.from(cfg.table).insert(row).select().single();
      if (error) return err(res, /duplicate|unique/i.test(error.message) ? 'Ya existe uno con ese código' : faltaCol(error) || error.message, error.code === '23505' ? 409 : 500);
      return ok(res, data, 201);
    }
    if (method === 'PUT' && id) {
      const { data: current, error: ce } = await supabase.from(cfg.table).select('*').eq(cfg.key, id).maybeSingle();
      if (ce || !current) return err(res, 'No existe', 404);
      const row = cleanRow(body, cfg, false);
      const v = cfg.validate({ ...current, ...row }, false);
      if (v) return err(res, v, 400);
      const { data, error } = await supabase.from(cfg.table).update({ ...row, updated_at: nowIso() }).eq(cfg.key, id).select().single();
      if (error) return err(res, faltaCol(error) || error.message, 500);
      return ok(res, data);
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from(cfg.table).delete().eq(cfg.key, id);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- PQR -------- */
  if (section === 'pqrs') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('pqrs').select('*').order('created_at', { ascending: false });
      if (error) return err(res, /does not exist|relation|schema cache|could not find the table/i.test(error.message) ? 'Falta crear la tabla de PQR: ejecuta lib/migracion-legal-2026-09.sql en el editor SQL de Supabase.' : error.message, 500);
      return ok(res, data || []);
    }
    if (method === 'PUT' && id) {
      const estado = ['Radicada', 'En trámite', 'Respondida', 'Cerrada'].includes(body.estado) ? body.estado : null;
      if (!estado) return err(res, 'Estado no válido', 400);
      const { data, error } = await supabase.from('pqrs').update({ estado, respuesta: cleanText(body.respuesta, 3000), updated_at: nowIso() }).eq('id', id).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, data);
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from('pqrs').delete().eq('id', id);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- PEDIDOS (estado + seguimiento) -------- */
  if (section === 'orders') {
    if (method === 'GET' && id && action === 'comprobante') {
      const { data: order, error } = await supabase.from('orders').select('customer').eq('id', id).maybeSingle();
      if (error || !order) return err(res, 'Pedido no encontrado', 404);
      const receiptPath = order.customer && order.customer.pagoReportado && order.customer.pagoReportado.comprobantePath;
      if (!receiptPath || !receiptPath.startsWith(`${id}/`)) return err(res, 'Este pedido no tiene una foto del comprobante.', 404);
      try {
        const { data, error: signedError } = await supabase.storage.from('kairo-comprobantes').createSignedUrl(receiptPath, 60);
        if (signedError) {
          console.error('No se pudo generar enlace del comprobante:', signedError.message);
          return err(res, 'No se pudo abrir la foto del comprobante.', 500);
        }
        return ok(res, { url: data.signedUrl });
      } catch (signedError) {
        console.error('No se pudo generar enlace del comprobante:', signedError.message);
        return err(res, 'No se pudo abrir la foto del comprobante.', 500);
      }
    }
    if (method === 'GET') {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) return err(res, error.message, 500);
      return ok(res, (data || []).map(o => ({
        ...o,
        customer: o.customer && o.customer.pagoReportado ? {
          ...o.customer,
          pagoReportado: {
            ref: o.customer.pagoReportado.ref,
            at: o.customer.pagoReportado.at,
            hasComprobante: !!o.customer.pagoReportado.comprobantePath
          }
        } : o.customer,
        status: normalizeStatus(o.status), tracking: trackingOf(o),
        pricing: o.pricing || (o.customer && o.customer.pricing) || null
      })));
    }
    if (method === 'PUT' && id) {
      const { data: o, error: ge } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (ge || !o) return err(res, 'Pedido no encontrado', 404);
      const t = trackingOf(o);
      const prev = normalizeStatus(o.status);
      const status = body.status != null ? (STATUSES.includes(body.status) ? body.status : null) : prev;
      if (!status) return err(res, 'Estado no válido', 400);
      const at = nowIso();
      const tracking = {
        history: status !== prev ? [...t.history, { status, at }] : t.history,
        guia: body.guia != null ? cleanText(body.guia, 60) : t.guia,
        transportadora: body.transportadora != null ? cleanText(body.transportadora, 60) : t.transportadora,
        nota: body.nota != null ? cleanText(body.nota, 400) : t.nota,
        link: body.link != null ? linkOk(body.link) : t.link
      };
      if (body.link && !tracking.link) return err(res, 'El enlace de rastreo debe empezar por https://', 400);
      if (status === 'Enviado' && !tracking.guia) return err(res, 'Para marcarlo como Enviado escribe el número de guía', 400);
      let up = await supabase.from('orders').update({ status, tracking, updated_at: at }).eq('id', id).select().single();
      if (up.error && /tracking/i.test(up.error.message)) {
        up = await supabase.from('orders').update({ status, customer: { ...o.customer, tracking }, updated_at: at }).eq('id', id).select().single();
      }
      if (up.error) return err(res, up.error.message, 500);
      const d = up.data;
      /* Aviso al celular del cliente: si cambió el estado, o si se agregó/cambió la guía */
      let avisos = null;
      const guiaNueva = tracking.guia && tracking.guia !== t.guia;
      if (pushReady() && (status !== prev || guiaNueva)) {
        try { avisos = await notifyOrder(supabase, d, status, tracking, { soloGuia: status === prev }); }
        catch (e) { console.error('[push] aviso del pedido', id, e.message); avisos = 0; }
      }
      return ok(res, { ...d, status: normalizeStatus(d.status), tracking: trackingOf(d), pricing: d.pricing || (d.customer && d.customer.pricing) || null, avisos });
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  return err(res, 'Ruta no encontrada', 404);
};
