'use strict';
/* =====================================================================
   Precios de Punto Club — una sola fuente de verdad.
   La tienda (catálogo), la validación de cupones y el pedido usan estas
   mismas funciones, así lo que el cliente ve es exactamente lo que se cobra.
   ===================================================================== */

/* Valor del envío. En contraentrega se paga por adelantado como "anticipo";
   en Nequi se suma al total a pagar. Debe coincidir con public/js/negocio.js */
const ANTICIPO_CONTRAENTREGA = 25000;
const ENVIO = ANTICIPO_CONTRAENTREGA;

/* ¿Está vigente? (activo + dentro de las fechas) */
function isLive(r, now = new Date()) {
  if (!r || r.active === false) return false;
  if (r.starts_at && new Date(r.starts_at) > now) return false;
  if (r.ends_at && new Date(r.ends_at) < now) return false;
  return true;
}

const norm = s => String(s || '').trim().toLowerCase();
const plano = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* ¿La promoción (o el cupón) aplica a este producto?
   scope_type: todo | marca | categoria | genero | producto | nombre
   "nombre": el modelo contiene esas palabras completas, p. ej. "SB" → Nike SB, Nike SB Dunk… */
function promoMatches(promo, p) {
  const v = norm(promo.scope_value);
  switch (promo.scope_type || 'todo') {
    case 'todo': return true;
    case 'marca': return norm(p.brand) === v;
    case 'categoria': return norm(p.category) === v;
    case 'genero': return norm(p.gender) === v || (v !== 'unisex' && norm(p.gender) === 'unisex');
    case 'producto': return String(p.id) === String(promo.scope_value).trim();
    case 'nombre': {
      const w = plano(promo.scope_value);
      return !!w && (' ' + plano(p.brand + ' ' + p.name) + ' ').includes(' ' + w + ' ');
    }
    default: return false;
  }
}

/* Texto corto de a qué aplica (para mensajes al cliente) */
function scopeLabel(r) {
  const t = r.scope_type || 'todo', v = String(r.scope_value || '').trim();
  if (t === 'todo' || !v) return 'toda la tienda';
  if (t === 'producto') return 'el producto de la promoción';
  if (t === 'nombre') return 'los modelos ' + v;
  return v;
}

/* "Segunda unidad con X% de descuento" (promociones de tipo "segunda").
   Con las unidades que aplican, ordenadas de mayor a menor precio, se arman pares
   (1.ª y 2.ª, 3.ª y 4.ª…) y la segunda de cada par —la de menor o igual precio— lleva el descuento.
   Se calcula sobre el precio final de cada unidad (después de ofertas y descuentos del producto).
   lines: [{ p: fila del producto, price: precio final por unidad, qty }]
   Devuelve { perLine: [ahorro por línea], savings, title } */
function segundaUnidad(lines, promos = [], now = new Date()) {
  const perLine = lines.map(() => 0), used = lines.map(() => 0), titles = [];
  const live = promos.filter(pr => pr.kind === 'segunda' && isLive(pr, now) && Number(pr.discount) > 0)
    .sort((a, b) => Number(b.discount) - Number(a.discount));
  for (const pr of live) {
    const pct = Math.min(90, Math.max(0, Number(pr.discount) || 0));
    const units = [];
    lines.forEach((l, i) => { if (promoMatches(pr, l.p)) for (let k = used[i]; k < l.qty; k++) units.push({ i, price: l.price }); });
    units.sort((a, b) => b.price - a.price);
    const pares = units.length - (units.length % 2);
    for (let k = 0; k < pares; k++) {
      used[units[k].i]++;
      if (k % 2 === 1) perLine[units[k].i] += Math.round(units[k].price * pct / 100 / 100) * 100;
    }
    if (pares) titles.push(pr.title);
  }
  const savings = perLine.reduce((s, x) => s + x, 0);
  return { perLine, savings, title: titles.join(' + ') };
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
  return { list, final, promo: best && promoPrice <= manual ? best : null, savings: list - final };
}

/* Envío gratis por promoción: la de menor mínimo que se cumpla */
function freeShippingPromo(subtotal, promos = [], now = new Date()) {
  return promos
    .filter(pr => pr.kind === 'envio' && isLive(pr, now) && subtotal >= (Number(pr.min_subtotal) || 0))
    .sort((a, b) => (a.min_subtotal || 0) - (b.min_subtotal || 0))[0] || null;
}

/* Valida un cupón. Devuelve { ok, error?, discount, freeShipping }
   base: valor de los productos a los que aplica el cupón. Si el cupón es para ciertos productos
   (scope_type distinto de "todo"), la compra mínima y el descuento se calculan SOLO sobre ellos,
   y si el carrito no tiene ninguno, el cupón no aplica. */
function evalCoupon(c, subtotal, now = new Date(), base = subtotal) {
  if (!c) return { ok: false, error: 'Ese cupón no existe. Revisa que esté bien escrito.' };
  if (c.active === false) return { ok: false, error: 'Ese cupón ya no está activo.' };
  if (c.starts_at && new Date(c.starts_at) > now) return { ok: false, error: 'Ese cupón todavía no está vigente.' };
  if (c.ends_at && new Date(c.ends_at) < now) return { ok: false, error: 'Ese cupón ya venció.' };
  if (Number(c.max_uses) > 0 && Number(c.uses) >= Number(c.max_uses)) return { ok: false, error: 'Ese cupón ya alcanzó su límite de usos.' };
  const scoped = c.scope_type && c.scope_type !== 'todo';
  if (scoped && base <= 0) return { ok: false, error: `Este cupón es solo para ${scopeLabel(c)}. Agrega uno al carrito para usarlo.` };
  const min = Number(c.min_subtotal) || 0;
  if (base < min) return { ok: false, error: scoped
    ? `Este cupón aplica para compras desde $${min.toLocaleString('es-CO')} en ${scopeLabel(c)} (llevas $${base.toLocaleString('es-CO')}).`
    : `Este cupón aplica para compras desde $${min.toLocaleString('es-CO')}.` };
  const v = Number(c.value) || 0;
  let discount = 0, freeShipping = false;
  if (c.type === 'porcentaje') {
    discount = Math.round(base * Math.min(100, v) / 100);
    if (Number(c.max_discount) > 0) discount = Math.min(discount, Number(c.max_discount));
  } else if (c.type === 'valor') {
    discount = Math.min(v, base);
  } else if (c.type === 'envio') {
    freeShipping = true;
  } else {
    return { ok: false, error: 'Cupón mal configurado.' };
  }
  return { ok: true, discount, freeShipping };
}

/* Calcula un carrito completo contra la base de datos.
   items: [{id, size, color, qty}] — lo que manda el navegador (no se confía en precios ni nombres). */
async function priceCart(supabase, items, couponCode, now = new Date()) {
  if (!Array.isArray(items) || !items.length) return { error: 'El pedido no tiene productos' };
  if (items.length > 20) return { error: 'El pedido tiene demasiados productos' };
  // Solo IDs con forma de slug: un valor raro (comas, paréntesis) rompería el filtro de la consulta
  const ids = [...new Set(items.map(i => String(i.id || '').trim()).filter(id => /^[A-Za-z0-9_-]{1,80}$/.test(id)))];
  if (!ids.length) return { error: 'Tu carrito tiene productos que ya no existen. Vacíalo y vuelve a agregarlos.' };

  /* Productos: si la conexión con Supabase falla (p. ej. la primera petición tras un rato sin uso),
     se reintenta dos veces antes de rendirse. El error real queda en los registros de Vercel. */
  const loadProducts = () => supabase.from('products').select('id,brand,name,price,sale_price,active,sizes,colors,category,gender,image').in('id', ids)
    .then(r => r, e => ({ data: null, error: { message: e && e.message ? e.message : String(e) } }));
  const [first, { data: promos, error: me }] = await Promise.all([
    loadProducts(),
    supabase.from('promos').select('*').eq('active', true).then(r => r, () => ({ data: [], error: null }))
  ]);
  let { data: dbProducts, error: pe } = first;
  for (let attempt = 1; pe && attempt <= 2; attempt++) {
    console.error(`[pricing] consulta de productos falló (intento ${attempt}):`, pe.message, '| ids:', ids.join(','));
    await new Promise(r => setTimeout(r, 300 * attempt));
    ({ data: dbProducts, error: pe } = await loadProducts());
  }
  if (pe) {
    console.error('[pricing] no se pudieron validar los productos:', pe.message);
    return { error: 'No pudimos conectar con la tienda para validar tu pedido. Espera unos segundos e intenta de nuevo; tu carrito sigue guardado.', status: 503 };
  }
  const promoList = me ? [] : (promos || []);
  const byId = Object.fromEntries((dbProducts || []).map(p => [p.id, p]));

  const out = [], rows = [];
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
    const colorObj = (p.colors || []).find(x => x && x.n === color);
    if (colorObj && Array.isArray(colorObj.sizes) && colorObj.sizes.length && !colorObj.sizes.map(Number).includes(size)) {
      return { error: `La talla ${size} no está disponible en color ${color} para ${p.name}. Elige otra talla o color.` };
    }
    const qty = Math.min(9, Math.max(1, Math.floor(Number(item.qty) || 1)));
    const pr = productPrice(p, promoList, now);
    subtotal += pr.final * qty;
    listSubtotal += pr.list * qty;
    out.push({ id: p.id, brand: p.brand, name: p.name, size, color, qty, price: pr.final, listPrice: pr.list, promo: pr.promo ? pr.promo.title : null, image: p.image || '' });
    rows.push({ p, price: pr.final, qty });
  }

  /* Segunda unidad con descuento: se resta del subtotal y queda anotada en cada línea */
  const seg = segundaUnidad(rows, promoList, now);
  seg.perLine.forEach((x, i) => { if (x) out[i].segunda = x; });
  subtotal -= seg.savings;

  let coupon = null;
  const code = String(couponCode || '').trim().toUpperCase().slice(0, 30);
  if (code) {
    const { data: c } = await supabase.from('coupons').select('*').eq('code', code).maybeSingle();
    // Cupón para ciertos productos: solo cuenta el valor de esos productos (ya con sus descuentos)
    const base = c && c.scope_type && c.scope_type !== 'todo'
      ? rows.reduce((s, l, i) => promoMatches(c, l.p) ? s + l.price * l.qty - seg.perLine[i] : s, 0)
      : subtotal;
    const r = evalCoupon(c, subtotal, now, base);
    if (!r.ok) return { error: r.error, couponError: true };
    coupon = { code, type: c.type, description: c.description || '', discount: r.discount, freeShipping: r.freeShipping, uses: Number(c.uses) || 0, scope: c.scope_type && c.scope_type !== 'todo' ? scopeLabel(c) : '' };
  }

  const shipPromo = freeShippingPromo(subtotal, promoList, now);
  const freeShipping = !!(coupon && coupon.freeShipping) || !!shipPromo;
  const discount = coupon ? coupon.discount : 0;
  return {
    items: out,
    listSubtotal,
    promoSavings: listSubtotal - subtotal,
    segunda: seg.savings ? { title: seg.title, savings: seg.savings } : null,
    subtotal,
    coupon,
    freeShipping,
    shippingPromo: shipPromo ? shipPromo.title : null,
    total: Math.max(0, subtotal - discount)
  };
}

module.exports = { ANTICIPO_CONTRAENTREGA, ENVIO, isLive, promoMatches, scopeLabel, segundaUnidad, productPrice, freeShippingPromo, evalCoupon, priceCart };
