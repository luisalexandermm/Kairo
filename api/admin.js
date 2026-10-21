'use strict';
const supabase = require('../lib/supabase');
const { ok, err, allowCors, checkToken, slug, hashPassword } = require('../lib/helpers');

/* ------------------------------------------------------------------ */
/*  Column map: camelCase (front) ↔ snake_case (DB)                    */
/* ------------------------------------------------------------------ */
const PRODUCT_COLS = {
  brand: 'brand', name: 'name', price: 'price', salePrice: 'sale_price',
  tag: 'tag', desc: 'description', sizes: 'sizes', colors: 'colors',
  image: 'image', shape: 'shape', shoeColor: 'shoe_color', bg: 'bg',
  stock: 'stock', active: 'active', featured: 'featured', position: 'position',
  category: 'category', gender: 'gender'
};
const toDb = (obj, map) => {
  const r = {};
  for (const [k, v] of Object.entries(map)) {
    if (k in obj) r[v] = obj[k];
  }
  return r;
};
const prodToFront = p => ({
  id: p.id, brand: p.brand, name: p.name,
  price: p.price, salePrice: p.sale_price,
  tag: p.tag, desc: p.description,
  sizes: p.sizes, colors: p.colors,
  image: p.image, shape: p.shape,
  shoeColor: p.shoe_color, bg: p.bg,
  stock: p.stock, active: p.active, featured: p.featured, position: p.position,
  category: p.category || (p.shape === 's-boot' ? 'Botas' : 'Tenis'), gender: p.gender || 'Unisex',
  createdAt: p.created_at
});

/* ------------------------------------------------------------------ */
/*  Promociones, cupones y anuncios: columnas permitidas y validaciones */
/* ------------------------------------------------------------------ */
const MIGRACION = 'Falta ejecutar lib/migracion-promos-2026-10.sql en Supabase (SQL Editor).';
const txt = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const num = v => Math.max(0, Math.round(Number(v) || 0));
const date = v => (v ? new Date(v).toString() !== 'Invalid Date' ? new Date(v).toISOString() : null : null);
const bool = v => v !== false && v !== 'false';
const oneOf = (v, list, def) => (list.includes(v) ? v : def);

const CRUD = {
  promos: {
    table: 'promos', key: 'id', order: 'position', positioned: true, missing: MIGRACION,
    makeId: r => slug(r.title || 'promo') + '-' + Date.now().toString(36).slice(-4),
    cols: {
      title: v => txt(v, 120), description: v => txt(v, 400), badge: v => txt(v, 30),
      kind: v => oneOf(v, ['informativa', 'descuento', 'envio'], 'informativa'),
      discount: v => Math.min(90, num(v)),
      scope_type: v => oneOf(v, ['todo', 'marca', 'categoria', 'genero', 'producto'], 'todo'),
      scope_value: v => txt(v, 80), scope: v => txt(v, 80),
      min_subtotal: num, starts_at: date, ends_at: date, conditions: v => txt(v, 2000), active: bool
    },
    validate: r => {
      if (!r.title) return 'Ponle un título a la promoción';
      if (r.kind === 'descuento' && !r.discount) return 'Una promoción de descuento necesita un porcentaje mayor a 0';
      if (r.kind === 'descuento' && r.discount > 90) return 'El descuento máximo es 90 %';
      if (r.scope_type !== 'todo' && !r.scope_value) return 'Elige a qué marca, categoría, género o producto aplica';
      if (r.starts_at && r.ends_at && r.ends_at < r.starts_at) return 'La fecha de fin es anterior a la de inicio';
      if (r.kind !== 'informativa' && !r.conditions) return 'Escribe las condiciones de la promoción (lo exige el Estatuto del Consumidor)';
      r.scope = r.scope_type === 'todo' ? 'Todos' : r.scope_value;
    }
  },
  coupons: {
    table: 'coupons', key: 'code', order: 'created_at', asc: false, missing: MIGRACION,
    cols: {
      code: v => txt(v, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
      description: v => txt(v, 200),
      type: v => oneOf(v, ['porcentaje', 'valor', 'envio'], 'porcentaje'),
      value: num, max_discount: num, min_subtotal: num, max_uses: num,
      starts_at: date, ends_at: date, conditions: v => txt(v, 2000), active: bool
    },
    validate: (r, method) => {
      if (method === 'POST' && (!r.code || r.code.length < 3)) return 'El código debe tener al menos 3 letras o números';
      if (r.type === 'porcentaje' && (!r.value || r.value > 90)) return 'El porcentaje debe estar entre 1 y 90';
      if (r.type === 'valor' && !r.value) return 'Escribe cuántos pesos descuenta el cupón';
      if (r.starts_at && r.ends_at && r.ends_at < r.starts_at) return 'La fecha de fin es anterior a la de inicio';
    }
  },
  announcements: {
    table: 'announcements', key: 'id', order: 'position', positioned: true, missing: MIGRACION,
    makeId: r => r.kind + '-' + slug(r.title || 'anuncio').slice(0, 40) + '-' + Date.now().toString(36).slice(-4),
    cols: {
      kind: v => oneOf(v, ['banner', 'barra', 'dinamica'], 'banner'),
      title: v => txt(v, 140), subtitle: v => txt(v, 300), button_text: v => txt(v, 30),
      link_type: v => oneOf(v, ['ninguno', 'producto', 'categoria', 'marca', 'url', 'whatsapp'], 'ninguno'),
      link_value: v => txt(v, 300), image: v => txt(v, 600), color: v => (/^#[0-9a-f]{6}$/i.test(String(v)) ? v : ''),
      conditions: v => txt(v, 4000), has_chance: v => v === true || v === 'true', coljuegos_ref: v => txt(v, 80),
      starts_at: date, ends_at: date, active: bool, position: num
    },
    validate: r => {
      if (!r.title) return 'Escribe un título';
      if (r.link_type === 'url' && r.link_value && !/^https:\/\//.test(r.link_value) && !r.link_value.startsWith('/')) return 'El enlace debe empezar por https:// o por /';
      if (r.starts_at && r.ends_at && r.ends_at < r.starts_at) return 'La fecha de fin es anterior a la de inicio';
      if (r.kind === 'dinamica') {
        if (!r.conditions || r.conditions.length < 40) return 'Una dinámica necesita bases y condiciones completas (quién participa, cómo, premio, fechas y cómo se elige al ganador)';
        if (r.has_chance && !r.coljuegos_ref && r.active !== false) return 'Esta dinámica tiene sorteo o azar: necesitas la autorización de Coljuegos antes de publicarla. Guárdala inactiva o escribe el número de autorización.';
      }
    }
  }
};

function cleanRow(body, cfg, isNew) {
  const row = {};
  // En registros nuevos, los campos que no llegan toman su valor por defecto.
  for (const [k, fn] of Object.entries(cfg.cols)) if (k in body || isNew) row[k] = fn(body[k]);
  return row;
}

/* ------------------------------------------------------------------ */
module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  /* Auth */
  if (!checkToken(req.headers['x-admin-token'])) {
    return err(res, 'Sesión vencida. Vuelve a entrar.', 401);
  }

  const parts = (req.url || '').replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean);
  const section = parts[0];
  const id = parts[1];
  const method = req.method;
  const body = req.body || {};

  /* -------- STATS -------- */
  if (section === 'stats' && method === 'GET') {
    const [{ count: totalP }, { count: activeP }, { count: promos },
           { count: orders }, { count: newOrders }, { data: revenue }] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('promos').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'Nuevo'),
      supabase.from('orders').select('total').neq('status', 'Cancelado')
    ]);
    const total = (revenue || []).reduce((s, r) => s + (r.total || 0), 0);
    return ok(res, { products: totalP, activeProducts: activeP, promos, orders, newOrders, revenue: total, storage: 'supabase' });
  }

  /* -------- SETTINGS -------- */
  if (section === 'settings') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 'app').single();
      if (error) return err(res, error.message, 500);
      // No devolvemos admin_password: el panel no la necesita para nada y así no viaja al navegador
      return ok(res, {
        storeName: data.store_name, tagline: data.tagline, whatsapp: data.whatsapp,
        heroWord: data.hero_word, heroTheme: data.hero_theme, heroLogo: data.hero_logo,
        heroHeadline: data.hero_headline, shippingNote: data.shipping_note
      });
    }
    if (method === 'PUT') {
      const update = { updated_at: new Date().toISOString() };
      if (body.storeName     != null) update.store_name     = body.storeName;
      if (body.tagline       != null) update.tagline        = body.tagline;
      if (body.whatsapp      != null) update.whatsapp       = body.whatsapp;
      if (body.heroWord      != null) update.hero_word      = body.heroWord;
      if (body.heroTheme     != null) update.hero_theme     = body.heroTheme;
      if (body.heroLogo      != null) update.hero_logo      = body.heroLogo;
      if (body.heroHeadline  != null) update.hero_headline  = body.heroHeadline;
      if (body.shippingNote  != null) update.shipping_note  = body.shippingNote;
      if (body.adminPassword)         update.admin_password = hashPassword(body.adminPassword);
      const { error } = await supabase.from('settings').update(update).eq('id', 'app');
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- UPLOAD -------- */
  if (section === 'upload' && method === 'POST') {
    const { data: imageData, name: fileName, bucket = 'kairo-images' } = body;
    if (!imageData) return err(res, 'Envía el campo "data" con la imagen en base64', 400);
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(imageData);
    if (!m) return err(res, 'Formato de imagen inválido', 400);
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[m[1]] || '.png';
    const path = `${slug(fileName || 'imagen')}-${Date.now().toString(36)}${ext}`;
    const buf = Buffer.from(m[2], 'base64');
    // The service key can provision the storage bucket on first upload.
    await supabase.storage.createBucket(bucket, { public: true }).catch(() => {});
    const { data: up, error: ue } = await supabase.storage.from(bucket).upload(path, buf, {
      contentType: m[1], upsert: false
    });
    if (ue) return err(res, 'Error al subir la imagen. Verifica el bucket kairo-images en Supabase: ' + ue.message, 500);
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return ok(res, { url: urlData.publicUrl }, 201);
  }

  /* -------- PRODUCTS -------- */
  if (section === 'products') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('products').select('*').order('position');
      if (error) return err(res, error.message, 500);
      return ok(res, (data || []).map(prodToFront));
    }
    if (method === 'POST') {
      let newId = slug(`${body.brand || ''}-${body.name || ''}`) || 'producto-' + Date.now().toString(36);
      const { data: existing } = await supabase.from('products').select('id').eq('id', newId).single();
      if (existing) newId += '-' + Date.now().toString(36).slice(-4);
      const row = { id: newId, ...toDb(body, PRODUCT_COLS), updated_at: new Date().toISOString() };
      if (!row.position) {
        const { count } = await supabase.from('products').select('id', { count: 'exact', head: true });
        row.position = (count || 0) + 1;
      }
      const { data, error } = await supabase.from('products').insert(row).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, prodToFront(data), 201);
    }
    if (method === 'PUT' && id) {
      const update = { ...toDb(body, PRODUCT_COLS), updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from('products').update(update).eq('id', id).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, prodToFront(data));
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- PROMOS / CUPONES / ANUNCIOS (CRUD genérico con columnas permitidas) -------- */
  if (CRUD[section]) {
    const cfg = CRUD[section];
    if (method === 'GET') {
      const { data, error } = await supabase.from(cfg.table).select('*').order(cfg.order, { ascending: cfg.asc !== false });
      if (error) return err(res, cfg.missing || error.message, 500);
      return ok(res, data || []);
    }
    if (method === 'POST' || (method === 'PUT' && id)) {
      const row = cleanRow(body, cfg, method === 'POST');
      const problem = cfg.validate && cfg.validate(row, method);
      if (problem) return err(res, problem, 400);
      row.updated_at = new Date().toISOString();
      let q;
      if (method === 'POST') {
        if (cfg.makeId) row[cfg.key] = cfg.makeId(row);
        if (cfg.positioned) {
          const { count } = await supabase.from(cfg.table).select(cfg.key, { count: 'exact', head: true });
          row.position = (count || 0) + 1;
        }
        q = supabase.from(cfg.table).insert(row).select().single();
      } else {
        delete row[cfg.key];
        q = supabase.from(cfg.table).update(row).eq(cfg.key, decodeURIComponent(id)).select().single();
      }
      const { data, error } = await q;
      if (error) {
        if (/duplicate key/i.test(error.message)) return err(res, 'Ya existe un registro con ese código', 400);
        return err(res, cfg.missing && /does not exist|relation/i.test(error.message) ? cfg.missing : error.message, 500);
      }
      return ok(res, data, method === 'POST' ? 201 : 200);
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from(cfg.table).delete().eq(cfg.key, decodeURIComponent(id));
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- ORDERS -------- */
  if (section === 'orders') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) return err(res, error.message, 500);
      return ok(res, data || []);
    }
    if (method === 'PUT' && id) {
      const { data, error } = await supabase.from('orders').update({
        status: body.status, updated_at: new Date().toISOString()
      }).eq('id', id).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, data);
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  /* -------- PQR -------- */
  if (section === 'pqr') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('pqrs').select('*').order('created_at', { ascending: false });
      if (error) return err(res, 'No se pudo leer la tabla pqrs. ¿Ejecutaste lib/migracion-legal-2026-09.sql en Supabase?', 500);
      return ok(res, data || []);
    }
    if (method === 'PUT' && id) {
      const ESTADOS = ['Radicada', 'En trámite', 'Respondida', 'Cerrada'];
      const update = { updated_at: new Date().toISOString() };
      if (ESTADOS.includes(body.estado)) update.estado = body.estado;
      if (typeof body.respuesta === 'string') update.respuesta = body.respuesta.slice(0, 3000);
      const { data, error } = await supabase.from('pqrs').update(update).eq('id', id).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, data);
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from('pqrs').delete().eq('id', id);
      if (error) return err(res, error.message, 500);
      return ok(res, { ok: true });
    }
  }

  return err(res, 'Ruta no encontrada', 404);
};
