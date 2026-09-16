const supabase = require('../lib/supabase');
const { ok, err, allowCors } = require('../lib/helpers');

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return err(res, 'Método no permitido', 405);

  const [{ data: products, error: pe }, { data: promos, error: me }, { data: settings, error: se }] =
    await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('position'),
      supabase.from('promos').select('*').eq('active', true).order('position'),
      supabase.from('settings').select('*').eq('id', 'app').single()
    ]);

  if (pe || me || se) return err(res, 'Error al leer la base de datos', 500);

  // Rename snake_case → camelCase for the store page
  const mapProduct = p => ({
    id: p.id, brand: p.brand, name: p.name,
    price: p.price, salePrice: p.sale_price,
    tag: p.tag, desc: p.description,
    sizes: p.sizes, colors: p.colors,
    image: p.image, shape: p.shape,
    shoeColor: p.shoe_color, bg: p.bg,
    stock: p.stock, active: p.active, featured: p.featured, position: p.position
  });

  const pub = { ...settings };
  delete pub.admin_password;

  ok(res, {
    settings: {
      storeName: pub.store_name, tagline: pub.tagline, whatsapp: pub.whatsapp,
      heroWord: pub.hero_word, heroTheme: pub.hero_theme, heroLogo: pub.hero_logo,
      heroHeadline: pub.hero_headline, shippingNote: pub.shipping_note
    },
    products: (products || []).map(mapProduct),
    promos: promos || []
  });
};
