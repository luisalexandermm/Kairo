'use strict';
/* GET /api/catalog — productos (con el precio final ya calculado), promociones,
   anuncios (banners, barra superior, dinámicas) y ajustes públicos de la tienda. */
const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');
const { productPrice, isLive, ENVIO } = require('../lib/pricing');

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return err(res, 'Método no permitido', 405);

  const [{ data: products, error: pe }, { data: promos, error: me }, { data: settings, error: se }, ann] =
    await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('position'),
      supabase.from('promos').select('*').eq('active', true).order('position'),
      supabase.from('settings').select('*').eq('id', 'app').single(),
      // Si todavía no se ejecutó la migración de octubre, la tabla no existe: la tienda sigue funcionando.
      supabase.from('announcements').select('*').eq('active', true).order('position').then(r => r, () => ({ data: [] }))
    ]);

  if (pe || me || se) return err(res, 'Error al leer la base de datos', 500);
  const now = new Date();
  const livePromos = (promos || []).filter(p => isLive(p, now));

  // "Nuevo": los 4 productos más recientes agregados en los últimos 30 días
  const monthAgo = now.getTime() - 30 * 864e5;
  const newIds = new Set((products || [])
    .filter(p => p.created_at && new Date(p.created_at).getTime() > monthAgo)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 4).map(p => p.id));

  const mapProduct = p => {
    const pr = productPrice(p, livePromos, now);
    return {
      id: p.id, brand: p.brand, name: p.name,
      price: pr.list,
      salePrice: pr.final < pr.list ? pr.final : null,
      promo: pr.promo ? { title: pr.promo.title, pct: pr.promo.pct } : null,
      tag: p.tag, desc: p.description,
      category: p.category || (p.shape === 's-boot' ? 'Botas' : 'Tenis'),
      gender: p.gender || 'Unisex',
      sizes: p.sizes, colors: p.colors,
      image: p.image, shape: p.shape,
      shoeColor: p.shoe_color, bg: p.bg,
      stock: p.stock, featured: p.featured, position: p.position,
      isNew: newIds.has(p.id)
    };
  };

  const pubPromo = p => ({
    id: p.id, title: p.title, description: p.description, badge: p.badge,
    kind: p.kind || 'informativa', discount: p.kind === 'descuento' ? Number(p.discount) || 0 : 0,
    scopeType: p.scope_type || 'todo', scopeValue: p.scope_value || '',
    minSubtotal: Number(p.min_subtotal) || 0, endsAt: p.ends_at || null, conditions: p.conditions || ''
  });

  // Las dinámicas con azar sin número de autorización de Coljuegos nunca se publican.
  const pubAnn = (ann.data || [])
    .filter(a => isLive(a, now) && !(a.kind === 'dinamica' && a.has_chance && !String(a.coljuegos_ref || '').trim()))
    .map(a => ({
      id: a.id, kind: a.kind, title: a.title, subtitle: a.subtitle, buttonText: a.button_text,
      linkType: a.link_type, linkValue: a.link_value, image: a.image, color: a.color,
      conditions: a.conditions, coljuegosRef: a.coljuegos_ref || '', endsAt: a.ends_at || null
    }));

  ok(res, {
    settings: {
      storeName: settings.store_name, tagline: settings.tagline, whatsapp: settings.whatsapp,
      heroHeadline: settings.hero_headline, shippingNote: settings.shipping_note,
      anticipo: ENVIO
    },
    products: (products || []).map(mapProduct),
    promos: livePromos.map(pubPromo),
    announcements: pubAnn
  });
};
