'use strict';
const supabase = require('../lib/supabase');
const { ok, err, allowCors, checkToken, slug } = require('../lib/helpers');

/* ------------------------------------------------------------------ */
/*  Column map: camelCase (front) ↔ snake_case (DB)                    */
/* ------------------------------------------------------------------ */
const PRODUCT_COLS = {
  brand: 'brand', name: 'name', price: 'price', salePrice: 'sale_price',
  tag: 'tag', desc: 'description', sizes: 'sizes', colors: 'colors',
  image: 'image', shape: 'shape', shoeColor: 'shoe_color', bg: 'bg',
  stock: 'stock', active: 'active', featured: 'featured', position: 'position'
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
  createdAt: p.created_at
});

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
      return ok(res, {
        storeName: data.store_name, tagline: data.tagline, whatsapp: data.whatsapp,
        heroWord: data.hero_word, heroTheme: data.hero_theme, heroLogo: data.hero_logo,
        heroHeadline: data.hero_headline, shippingNote: data.shipping_note,
        adminPassword: data.admin_password
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
      if (body.adminPassword)         update.admin_password = body.adminPassword;
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

  /* -------- PROMOS -------- */
  if (section === 'promos') {
    if (method === 'GET') {
      const { data, error } = await supabase.from('promos').select('*').order('position');
      if (error) return err(res, error.message, 500);
      return ok(res, data || []);
    }
    if (method === 'POST') {
      let newId = slug(body.title || 'promo') + '-' + Date.now().toString(36).slice(-4);
      const { count } = await supabase.from('promos').select('id', { count: 'exact', head: true });
      const row = { id: newId, title: body.title, description: body.description, badge: body.badge,
                    discount: Number(body.discount) || 0, scope: body.scope || 'Todos',
                    active: body.active !== false, position: (count || 0) + 1 };
      const { data, error } = await supabase.from('promos').insert(row).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, data, 201);
    }
    if (method === 'PUT' && id) {
      const { data, error } = await supabase.from('promos').update({
        title: body.title, description: body.description, badge: body.badge,
        discount: Number(body.discount) || 0, scope: body.scope,
        active: body.active !== false, updated_at: new Date().toISOString()
      }).eq('id', id).select().single();
      if (error) return err(res, error.message, 500);
      return ok(res, data);
    }
    if (method === 'DELETE' && id) {
      const { error } = await supabase.from('promos').delete().eq('id', id);
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

  return err(res, 'Ruta no encontrada', 404);
};
