'use strict';
/* =====================================================================
   Precios de kAIRO — una sola fuente de verdad.
   La tienda (catálogo), la validación de cupones y el pedido usan estas
   mismas funciones, así lo que el cliente ve es exactamente lo que se cobra.
   ===================================================================== */

const ANTICIPO_CONTRAENTREGA = 25000; // Debe coincidir con public/js/negocio.js

/* ¿Está vigente? (activo + dentro de las fechas) */
function isLive(r, now = new Date()) {
  if (!r || r.active === false) return false;
  if (r.starts_at && new Date(r.starts_at) > now) return false;
  if (r.ends_at && new Date(r.ends_at) < now) return false;
  return true;
}

const norm = s => String(s || '').trim().toLowerCase();

/* ¿La promoción aplica a este producto? */
function promoMatches(promo, p) {
  const v = norm(promo.scope_value);
  switch (promo.scope_type || 'todo') {
    case 'todo': return true;
    case 'marca': return norm(p.brand) === v;
    case 'categoria': return norm(p.category) === v;
    case 'genero': return norm(p.gender) === v || (v !== 'unisex' && norm(p.gender) === 'unisex');
    case 'producto': return String(p.id) === String(promo.scope_value).trim();
    default: return false;
  }
}

/* Precio final de un producto (fila de la base de datos) con las promociones vigentes.
   Se toma el MENOR entre: precio de oferta manual y precio con la mejor promoción de descuento. */
function productPrice(p, promos = [], now = new Date()) {
  const list = Number(p.price) || 0;
  const manual = Number(p.sale_price) > 0 && Number(p.sale_price) < list ? Number(p.sale_price) : list;
  let best = null;
  for (const pr of promos) {
    if (pr.kind !== 'descuento' || !isLive(pr, now) || !promoMatches(pr, p)) continue;
    const pct = Math.min(90, Math.max(0, Number(pr.discount) || 0));
    if (!pct) continue;
    if (!best || pct > best.pct) best = { id: pr.id, title: pr.title, pct };
  }
  const promoPrice = best ? Math.round(list * (1 - best.pct / 100) / 100) * 100 : list;
  const final = Math.min(manual, promoPrice);
  return {
    list,
    final,
    promo: best && promoPrice <= manual ? best : null,
    savings: list - final
  };
}

/* Envío gratis por promoción: la de menor mínimo que se cumpla */
function freeShippingPromo(subtotal, promos = [], now = new Date()) {
  return promos
    .filter(pr => pr.kind === 'envio' && isLive(pr, now) && subtotal >= (Number(pr.min_subtotal) || 0))
    .sort((a, b) => (a.min_subtotal || 0) - (b.min_subtotal || 0))[0] || null;
}

/* Valida un cupón contra un subtotal. Devuelve { ok, error?, discount, freeShipping } */
function evalCoupon(c, subtotal, now = new Date()) {
  if (!c) return { ok: false, error: 'Ese cupón no existe. Revisa que esté bien escrito.' };
  if (c.active === false) return { ok: false, error: 'Ese cupón ya no está activo.' };
  if (c.starts_at && new Date(c.starts_at) > now) return { ok: false, error: 'Ese cupón todavía no está vigente.' };
  if (c.ends_at && new Date(c.ends_at) < now) return { ok: false, error: 'Ese cupón ya venció.' };
  if (Number(c.max_uses) > 0 && Number(c.uses) >= Number(c.max_uses)) return { ok: false, error: 'Ese cupón ya alcanzó su límite de usos.' };
  const min = Number(c.min_subtotal) || 0;
  if (subtotal < min) return { ok: false, error: `Este cupón aplica para compras desde $${min.toLocaleString('es-CO')}.` };
  const v = Number(c.value) || 0;
  let discount = 0, freeShipping = false;
  if (c.type === 'porcentaje') {
    discount = Math.round(subtotal * Math.min(100, v) / 100);
    if (Number(c.max_discount) > 0) discount = Math.min(discount, Number(c.max_discount));
  } else if (c.type === 'valor') {
    discount = Math.min(v, subtotal);
  } else if (c.type === 'envio') {
    freeShipping = true;
  } else {
    return { ok: false, error: 'Cupón mal configurado.' };
  }
  return { ok: true, discount, freeShipping };
}

/* Calcula un carrito completo contra la base de datos.
   items: [{id, size, color, qty}] — lo que manda el navegador (no se confía en precios ni nombres).
   Devuelve { error } o { items, subtotal, listSubtotal, promoSavings, coupon, freeShipping, shippingPromo, total } */
async function priceCart(supabase, items, couponCode, now = new Date()) {
  if (!Array.isArray(items) || !items.length) return { error: 'El pedido no tiene productos' };
  if (items.length > 20) return { error: 'El pedido tiene demasiados productos' };
  const ids = [...new Set(items.map(i => String(i.id || '')))];
  const [{ data: dbProducts, error: pe }, { data: promos, error: me }] = await Promise.all([
    supabase.from('products').select('id,brand,name,price,sale_price,active,sizes,colors,category,gender,image').in('id', ids),
    supabase.from('promos').select('*').eq('active', true)
  ]);
  if (pe) return { error: 'No se pudieron validar los productos del pedido', status: 500 };
  const promoList = me ? [] : (promos || []);
  const byId = Object.fromEntries((dbProducts || []).map(p => [p.id, p]));

  const out = [];
  let subtotal = 0, listSubtotal = 0;
  for (const item of items) {
    const p = byId[item.id];
    if (!p || p.active === false) return { error: `El producto "${String(item.name || item.id).slice(0, 80)}" ya no está disponible` };
    const size = Number(item.size);
    if (Array.isArray(p.sizes) && p.sizes.length && !p.sizes.map(Number).includes(size)) {
      return { error: `La talla ${String(item.size).slice(0, 5)} no está disponible para ${p.name}` };
    }
    const colorNames = (p.colors || []).map(x => x && x.n).filter(Boolean);
    const color = String(item.color || '').slice(0, 60);
    if (colorNames.length && color && !colorNames.includes(color)) {
      return { error: `El color "${color}" no está disponible para ${p.name}` };
    }
    const qty = Math.min(9, Math.max(1, Math.floor(Number(item.qty) || 1)));
    const pr = productPrice(p, promoList, now);
    subtotal += pr.final * qty;
    listSubtotal += pr.list * qty;
    out.push({ id: p.id, brand: p.brand, name: p.name, size, color, qty, price: pr.final, listPrice: pr.list, promo: pr.promo ? pr.promo.title : null });
  }

  let coupon = null;
  const code = String(couponCode || '').trim().toUpperCase().slice(0, 30);
  if (code) {
    const { data: c } = await supabase.from('coupons').select('*').eq('code', code).maybeSingle();
    const r = evalCoupon(c, subtotal, now);
    if (!r.ok) return { error: r.error, couponError: true };
    coupon = { code, type: c.type, description: c.description || '', discount: r.discount, freeShipping: r.freeShipping, uses: Number(c.uses) || 0 };
  }

  const shipPromo = freeShippingPromo(subtotal, promoList, now);
  const freeShipping = !!(coupon && coupon.freeShipping) || !!shipPromo;
  const discount = coupon ? coupon.discount : 0;
  return {
    items: out,
    listSubtotal,
    promoSavings: listSubtotal - subtotal,
    subtotal,
    coupon,
    freeShipping,
    shippingPromo: shipPromo ? shipPromo.title : null,
    total: Math.max(0, subtotal - discount)
  };
}

module.exports = { ANTICIPO_CONTRAENTREGA, isLive, promoMatches, productPrice, freeShippingPromo, evalCoupon, priceCart };
