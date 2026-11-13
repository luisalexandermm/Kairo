/* =====================================================================
   Punto Club — lógica de la tienda
   - Catálogo, filtros por género / categoría / marca / búsqueda
   - Carrito y cupón (guardados en este navegador)
   - Compra → número de pedido → pago por Nequi (QR) → listo
   - El pedido en curso sobrevive a recargas y a cambiar a la app de Nequi
   ===================================================================== */
(function () {
  'use strict';
  var N = window.NEGOCIO || {};
  var WA = N.whatsapp || '573145312045';
  var CATS = ['Tenis', 'Sandalias', 'Chanclas', 'Botas'];
  var CAT_ICON = { Todo: 'i-bolt', Nuevo: 'i-spark', Tenis: 'i-sneaker', Sandalias: 'i-sandal', Chanclas: 'i-flip', Botas: 'i-boot' };
  var BRANDS_DEFAULT = ['Nike', 'Jordan', 'Adidas', 'Puma', 'New Balance', 'Converse', 'Vans'];
  // Las claves internas conservan el prefijo "kairo." a propósito: así nadie pierde su carrito, favoritos ni "Mis pedidos" con el cambio de nombre.
  var K_CART = 'kairo.carrito.v1', K_ORDER = 'kairo.pedido.v1';
  var K_CLIENTE = 'kairo.cliente.v1', K_MIS = 'kairo.mispedidos.v1', K_FAV = 'kairo.favoritos.v1', K_PERFIL = 'kairo.perfil.v1';

  var S = {
    products: [], promos: [], ann: [], settings: {},
    f: { gender: 'Todos', cat: 'Todo', brand: 'Todos', q: '' },
    cart: [], coupon: null,           // coupon: {code, discount, freeShipping, description}
    sel: null,                        // producto abierto en el detalle
    order: null,                      // pedido en curso (después de confirmarlo)
    loaded: false
  };

  /* ---------------- utilidades ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var safeUrl = function (u) { u = String(u || '').trim(); return /^(https:\/\/|\/(?!\/))/.test(u) ? u : ''; };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Tablet y PC: animaciones de entrada al hacer scroll (el móvil queda liviano) */
  var FX = !reduceMotion && window.matchMedia && matchMedia('(min-width: 700px)').matches && 'IntersectionObserver' in window;
  if (FX) document.documentElement.classList.add('fx');
  var io = FX ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function reveal(nodes, cols) {
    if (!io) return;
    Array.prototype.forEach.call(nodes, function (n, k) {
      n.classList.add('rv'); n.style.setProperty('--d', (k % (cols || 4)) * 80 + 'ms'); io.observe(n);
    });
  }
  // Al terminar se quitan las clases para que el hover de las tarjetas vuelva a funcionar
  document.addEventListener('animationend', function (e) {
    if (e.animationName === 'rvIn') { e.target.classList.remove('rv', 'in'); e.target.style.removeProperty('--d'); }
  });
  function toast(m) {
    var t = $('toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  async function api(path, body) {
    var r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    var ct = r.headers.get('content-type') || '';
    var d = ct.indexOf('application/json') > -1 ? await r.json() : {};
    if (!r.ok) { var e = new Error(d.error || 'No se pudo completar la operación'); e.status = r.status; throw e; }
    return d;
  }
  var priceOf = function (p) { return p.salePrice && p.salePrice < p.price ? p.salePrice : p.price; };
  function art(p, cls, color) {
    var img = safeUrl((color && color.image) || p.image);
    if (img) return '<img class="' + cls + '" src="' + esc(img) + '" alt="" loading="lazy" decoding="async">';
    var shape = p.category === 'Sandalias' ? 's-sandal' : p.category === 'Chanclas' ? 's-slide' : (p.shape || 's-low');
    var c = (color && color.h) || p.shoeColor || '#1d2733';
    return '<svg class="' + cls + '" viewBox="0 0 260 140" style="color:' + esc(c) + '" aria-hidden="true"><use href="#' + esc(shape) + '"/></svg>';
  }
  function luminance(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
    var n = parseInt(m[1], 16), ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2];
  }
  function shade(hex, k) { // k<0 oscurece, k>0 aclara
    var n = parseInt(String(hex).slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    var f = function (v) { return Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k); };
    return '#' + [f(r), f(g), f(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  /* ---------------- capas (detalle, carrito, compra) con foco atrapado ---------------- */
  var stack = [];
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
  function setBackgroundInert(on) {
    ['app', 'bnav'].forEach(function (id) { var el = $(id); if (!el) return; if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
  }
  var skipPop = 0;
  function openLayer(el, focusEl, replace) {
    if (stack.indexOf(el) > -1) return;
    stack.forEach(function (x) { x.setAttribute('inert', ''); });
    stack.push(el);
    // Cada ventana nueva queda encima de la anterior (antes todas tenían la misma capa y, por ejemplo,
    // el detalle del tenis o la compra se abrían DETRÁS de Favoritos y no se podía comprar desde ahí)
    el.style.zIndex = String(90 + stack.length * 2);
    el._opener = document.activeElement;
    el.classList.add('open');
    $('overlay').classList.add('open');
    document.body.classList.add('locked');
    setBackgroundInert(true);
    try { history[replace ? 'replaceState' : 'pushState']({ kairoLayer: el.id }, ''); } catch (e) { }
    setTimeout(function () { (focusEl || el.querySelector(FOCUSABLE) || el).focus(); }, 60);
  }
  function closeLayer(el, fromPop, keepHistory) {
    var i = stack.indexOf(el); if (i < 0) return false;
    if (el.id === 'coSheet' && !confirmLeavePayment()) return false;
    stack.splice(i, 1);
    el.classList.remove('open');
    // La capa se quita cuando termina la animación de cierre, para que no salte por detrás de las otras
    setTimeout(function () { if (stack.indexOf(el) < 0) el.style.zIndex = ''; }, 400);
    if (stack.length) stack[stack.length - 1].removeAttribute('inert');
    else { $('overlay').classList.remove('open'); document.body.classList.remove('locked'); setBackgroundInert(false); }
    if (!fromPop && !keepHistory) { try { if (history.state && history.state.kairoLayer === el.id) { skipPop++; history.back(); } } catch (e) { } }
    var back = el._opener; if (!keepHistory && back && document.contains(back) && !back.closest('[inert]')) back.focus();
    if (el.id === 'coSheet') afterCheckoutClosed();
    return true;
  }
  function topLayer() { return stack[stack.length - 1]; }
  // Botón "atrás" del celular: cierra la capa de arriba en vez de salir de la tienda
  window.addEventListener('popstate', function () {
    if (skipPop) { skipPop--; return; }
    var t = topLayer(); if (!t) return;
    if (!closeLayer(t, true)) { try { history.pushState({ kairoLayer: t.id }, ''); } catch (e) { } }
  });
  document.addEventListener('keydown', function (e) {
    var t = topLayer(); if (!t) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(t); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(t.querySelectorAll(FOCUSABLE), function (x) { return x.offsetParent !== null || x === document.activeElement; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  $('overlay').addEventListener('click', function () { var t = topLayer(); if (t) closeLayer(t); });
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeLayer(b.closest('.sheet')); }); });

  /* ---------------- filtros ---------------- */
  function genderMatch(p, g) { return g === 'Todos' || p.gender === g || p.gender === 'Unisex'; }
  function catMatch(p, c) { return c === 'Todo' || (c === 'Nuevo' ? p.isNew : p.category === c); }
  function visible() {
    var f = S.f, q = norm(f.q);
    return S.products.filter(function (p) {
      if (!genderMatch(p, f.gender) || !catMatch(p, f.cat)) return false;
      if (f.brand !== 'Todos' && p.brand !== f.brand) return false;
      if (q) {
        var hay = norm([p.brand, p.name, p.category, p.gender, p.tag, p.desc].join(' '));
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; });
      }
      return true;
    });
  }
  function setFilter(patch, scroll) {
    Object.assign(S.f, patch);
    renderChips(); renderGenders(); renderGrid();
    $('searchBtn').classList.toggle('has-q', !!S.f.q && !searchIsOpen());
    if (scroll) {
      var c = $('catalogo');
      c.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      c.focus({ preventScroll: true });
    }
  }

  function renderChips() {
    var list = ['Todo', 'Nuevo'].concat(CATS);
    var hasNew = S.products.some(function (p) { return p.isNew; });
    $('catChips').innerHTML = list.filter(function (c) { return c !== 'Nuevo' || hasNew; }).map(function (c) {
      var n = c === 'Todo' ? '' : S.products.filter(function (p) { return genderMatch(p, S.f.gender) && catMatch(p, c); }).length;
      if (c !== 'Todo' && c !== 'Nuevo' && !n && S.loaded) return '';
      return '<button type="button" class="chip" data-cat="' + c + '" aria-pressed="' + (S.f.cat === c) + '"><svg aria-hidden="true"><use href="#' + CAT_ICON[c] + '"/></svg>' + (c === 'Todo' ? 'Todo' : c) + '</button>';
    }).join('');
  }
  $('catChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]'); if (!b) return;
    setFilter({ cat: b.dataset.cat }, true);
  });

  function genderStats(g) {
    var list = S.products.filter(function (p) { return genderMatch(p, g); });
    var cats = CATS.filter(function (c) { return list.some(function (p) { return p.category === c; }); });
    // Fotos para la "pasarela" de la tarjeta: primero los del género (destacados antes), luego los unisex
    // (con foto antes que los dibujados; si no hay foto se usa la silueta del catálogo)
    var rank = function (p) { return (safeUrl(p.image) ? 0 : 4) + (p.gender === g ? 0 : 2) + (p.featured ? 0 : 1); };
    var pics = list.slice().sort(function (a, b) { return rank(a) - rank(b); }).slice(0, 4);
    var off = 0;
    list.forEach(function (p) { if (p.salePrice && p.salePrice < p.price) off = Math.max(off, Math.round((1 - p.salePrice / p.price) * 100)); });
    return {
      n: list.length, cats: cats, pics: pics, pic: pics[0] || list[0], off: off,
      count: function (c) { return list.filter(function (p) { return p.category === c; }).length; },
      min: list.length ? Math.min.apply(null, list.map(priceOf)) : 0,
      nNew: list.filter(function (p) { return p.isNew; }).length
    };
  }
  function renderGenders() {
    $('genders').innerHTML = ['Hombre', 'Mujer'].map(function (g) {
      var st = genderStats(g), on = S.f.gender === g, him = g === 'Hombre', low = g.toLowerCase();
      var n = st.pics.length;
      var stage = st.pics.map(function (p, i) { return '<span class="gcard__shoe" style="--i:' + i + '">' + art(p, '', null) + '</span>'; }).join('');
      var badge = st.off ? 'Hasta -' + st.off + '%' : st.nNew ? st.nNew + (st.nNew === 1 ? ' nuevo' : ' nuevos') : '';
      var meta = !S.loaded ? 'Cargando…' : st.n + (st.n === 1 ? ' modelo' : ' modelos') + (st.min ? ' · desde <b>' + money(st.min) + '</b>' : '');
      return '<div class="gcard gcard--' + (him ? 'h' : 'm') + (on ? ' is-on' : '') + (n > 1 ? ' gcard--run gcard--n' + n : '') + '" style="--n:' + Math.max(n, 1) + '">' +
        '<span class="gcard__glow" aria-hidden="true"></span>' +
        '<span class="gcard__word" aria-hidden="true">' + (him ? 'ÉL' : 'ELLA') + '</span>' +
        (badge && S.loaded ? '<span class="gcard__badge" aria-hidden="true">' + badge + '</span>' : '') +
        '<div class="gcard__top"><span class="gcard__eyebrow">' + (him ? 'Para él' : 'Para ella') + '</span>' +
        '<h3>' + g + '</h3><p class="gcard__meta">' + meta + '</p></div>' +
        '<span class="gcard__stage" aria-hidden="true"><span class="gcard__float">' + stage + '</span></span>' +
        (st.cats.length ? '<div class="gcard__pills" role="group" aria-label="Ver ' + low + ' por tipo">' + st.cats.map(function (c) {
          return '<button type="button" class="gcard__pill" data-gpick="' + c + '" data-g="' + g + '" aria-label="' + c + ' para ' + low + ', ' + st.count(c) + ' modelos">' + c + '<b aria-hidden="true">' + st.count(c) + '</b></button>';
        }).join('') + '</div>' : '') +
        '<div class="gcard__foot">' +
        (n > 1 ? '<span class="gcard__thumbs" aria-hidden="true">' + st.pics.map(function (p, i) { return '<span class="gcard__thumb" style="--i:' + i + '">' + art(p, '', null) + '</span>'; }).join('') +
          (st.n > n ? '<span class="gcard__thumb gcard__more">+' + (st.n - n) + '</span>' : '') + '</span>' : '') +
        '<button type="button" class="gcard__cta" data-gender="' + g + '" aria-pressed="' + on + '">' + (on ? 'Viendo ' + low : 'Ver ' + low) + '<svg aria-hidden="true"><use href="#i-arrow"/></svg></button>' +
        '</div></div>';
    }).join('');
  }
  $('genders').addEventListener('click', function (e) {
    var pk = e.target.closest('[data-gpick]');
    if (pk) { $('q').value = ''; setFilter({ gender: pk.dataset.g, cat: pk.dataset.gpick, brand: 'Todos', q: '' }, true); return; }
    var b = e.target.closest('[data-gender]'); if (!b) return;
    var g = b.dataset.gender;
    setFilter({ gender: S.f.gender === g ? 'Todos' : g, cat: 'Todo' }, S.f.gender !== g);
  });
  // PC con mouse: la tarjeta se inclina en 3D, el tenis hace parallax y un brillo sigue al puntero
  if (FX && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $('genders').addEventListener('pointermove', function (e) {
      var c = e.target.closest('.gcard'); if (!c) return;
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg'); c.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
      c.style.setProperty('--tx', (x * -18).toFixed(1) + 'px'); c.style.setProperty('--ty', (y * -12).toFixed(1) + 'px');
      c.style.setProperty('--px', ((x + .5) * 100).toFixed(1) + '%'); c.style.setProperty('--py', ((y + .5) * 100).toFixed(1) + '%');
    });
    $('genders').addEventListener('pointerout', function (e) {
      var c = e.target.closest('.gcard'); if (!c || c.contains(e.relatedTarget)) return;
      ['--rx', '--ry', '--tx', '--ty', '--px', '--py'].forEach(function (k) { c.style.removeProperty(k); });
    });
  }
  document.querySelectorAll('[data-goto-gender]').forEach(function (b) {
    b.addEventListener('click', function () { setFilter({ gender: b.dataset.gotoGender, cat: 'Todo', brand: 'Todos', q: '' }, true); $('q').value = ''; });
  });
  document.querySelectorAll('[data-goto-cat]').forEach(function (b) {
    b.addEventListener('click', function () { setFilter({ cat: b.dataset.gotoCat, brand: 'Todos', q: '' }, true); $('q').value = ''; });
  });

  /* ---------------- grilla ---------------- */
  function cardHTML(p) {
    var sale = p.salePrice && p.salePrice < p.price;
    var pct = sale ? Math.round((1 - p.salePrice / p.price) * 100) : 0;
    var fav = isFav(p.id);
    return '<article class="card" style="--tint:' + esc(p.bg || '#e2f0e8') + '">' +
      '<div class="card__media">' + art(p, 'card__shoe') +
      '<div class="card__tags">' + (p.isNew ? '<span class="tag tag--new">Nuevo</span>' : '') + (sale ? '<span class="tag tag--off">-' + pct + '%</span>' : '') + (p.tag ? '<span class="tag">' + esc(p.tag) + '</span>' : '') + '</div>' +
      '<button type="button" class="card__fav" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '" aria-label="Guardar ' + esc(p.brand + ' ' + p.name) + ' en favoritos"><svg aria-hidden="true"><use href="#' + (fav ? 'i-heart-on' : 'i-heart') + '"/></svg></button></div>' +
      '<div class="card__body"><span class="card__brand">' + esc(p.brand) + '</span><h3>' + esc(p.name) + '</h3>' +
      '<span class="card__meta">' + esc(p.category) + ' · ' + esc(p.gender) + '</span>' +
      '<span class="nobox"><svg aria-hidden="true"><use href="#i-nobox"/></svg>Sin caja</span>' +
      '<div class="card__row"><span class="price">' + (sale ? '<s><span class="sr-only">Antes </span>' + money(p.price) + '</s><span class="sr-only">Ahora </span>' : '') + money(priceOf(p)) + '</span>' +
      '<button type="button" class="plus" data-open="' + esc(p.id) + '" aria-label="Elegir talla de ' + esc(p.brand + ' ' + p.name) + '"><svg aria-hidden="true"><use href="#i-plus"/></svg></button></div></div>' +
      '<button type="button" class="card__open" data-open="' + esc(p.id) + '" tabindex="-1" aria-hidden="true"></button>' +
      '</article>';
  }
  function skeletonHTML(n) {
    var h = '';
    for (var k = 0; k < n; k++) h += '<div class="card card--skel" aria-hidden="true"><div class="card__media"></div><div class="card__body"><i></i><i></i><i></i></div></div>';
    return h;
  }
  function renderGrid() {
    var f = S.f, list = visible(), g = $('grid');
    // Encabezado del género elegido, con sub-filtros por categoría
    if (f.gender !== 'Todos') {
      var st = genderStats(f.gender);
      $('gHead').innerHTML = '<div class="ghead"><div class="ghead__top"><div><h2>' + f.gender + '</h2><p>' + (f.gender === 'Mujer' ? 'Tenis, sandalias y chanclas para ella, más los modelos unisex.' : 'Tenis, chanclas y botas para él, más los modelos unisex.') + '</p></div>' +
        '<button type="button" class="link-btn" data-gclear>Ver todo</button></div>' +
        '<div class="pills" role="group" aria-label="Tipo de calzado para ' + f.gender.toLowerCase() + '">' +
        ['Todo'].concat(st.cats).map(function (c) { return '<button type="button" class="pill" data-gcat="' + c + '" aria-pressed="' + (f.cat === c) + '">' + c + '</button>'; }).join('') +
        '</div></div>';
      $('catHead').hidden = true;
    } else { $('gHead').innerHTML = ''; $('catHead').hidden = false; }
    var parts = [];
    if (f.cat !== 'Todo') parts.push(f.cat);
    if (f.brand !== 'Todos') parts.push(f.brand);
    if (f.q) parts.push('“' + f.q + '”');
    $('resultCount').textContent = S.loaded ? list.length + (list.length === 1 ? ' modelo' : ' modelos') + (parts.length ? ' · ' + parts.join(' · ') : '') : '';
    $('clearFilters').hidden = !(f.gender !== 'Todos' || f.cat !== 'Todo' || f.brand !== 'Todos' || f.q);
    g.setAttribute('aria-busy', S.loaded ? 'false' : 'true');
    if (!S.loaded) { if (!g.querySelector('#retry')) g.innerHTML = skeletonHTML(6); return; }
    if (!list.length) { g.innerHTML = '<p class="empty">No encontramos modelos con esos filtros. <button type="button" class="link-btn" data-gclear>Ver todo el catálogo</button></p>'; return; }
    g.innerHTML = list.map(cardHTML).join('');
    reveal(g.children, matchMedia('(min-width: 980px)').matches ? 4 : 3);
  }
  document.addEventListener('click', function (e) {
    var fv = e.target.closest('[data-fav]');
    if (fv) { var on = toggleFav(fv.dataset.fav); toast(on ? 'Guardado en favoritos' : 'Quitado de favoritos'); return; }
    if (e.target.closest('[data-open-orders]')) { openOrders(); return; }
    if (e.target.closest('[data-open-favs]')) { openFavs(); return; }
    var o = e.target.closest('[data-open]'); if (o) { openProduct(o.dataset.open); return; }
    var gc = e.target.closest('[data-gcat]'); if (gc) { setFilter({ cat: gc.dataset.gcat }); return; }
    if (e.target.closest('[data-gclear]') || e.target.closest('#clearFilters')) { $('q').value = ''; $('qClear').hidden = true; setFilter({ gender: 'Todos', cat: 'Todo', brand: 'Todos', q: '' }, true); }
  });

  /* ---------------- búsqueda ---------------- */
  var qT;
  $('q').addEventListener('input', function () {
    clearTimeout(qT); var v = this.value.trim(); $('qClear').hidden = !v;
    qT = setTimeout(function () { setFilter({ q: v }); }, 180);
  });
  /* En el celular el buscador es un panel que se abre con la lupa del encabezado.
     Se cierra con la X, con Escape, al buscar (Enter) o al tocar fuera de él. */
  var compactMq = window.matchMedia('(max-width: 699px)');
  function searchIsOpen() { return $('hdr').classList.contains('search-open'); }
  function setSearch(open) {
    $('hdr').classList.toggle('search-open', open);
    $('searchBtn').setAttribute('aria-expanded', String(open));
    $('searchBtn').classList.toggle('has-q', !open && !!S.f.q);
    if (open) $('q').focus({ preventScroll: true });
    else if (document.activeElement === $('q')) $('q').blur();
  }
  function clearSearch() { clearTimeout(qT); $('q').value = ''; $('qClear').hidden = true; if (S.f.q) setFilter({ q: '' }); }
  $('q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(qT); setFilter({ q: this.value.trim() }, true); if (compactMq.matches) setSearch(false); }
    else if (e.key === 'Escape' && compactMq.matches) { e.preventDefault(); setSearch(false); $('searchBtn').focus(); }
  });
  $('qClear').addEventListener('click', function () { clearSearch(); $('q').focus(); });
  $('qClose').addEventListener('click', function () { clearSearch(); setSearch(false); $('searchBtn').focus(); });
  $('searchBtn').addEventListener('click', function () { setSearch(!searchIsOpen()); });
  document.addEventListener('pointerdown', function (e) {
    if (!searchIsOpen() || e.target.closest('#searchForm') || e.target.closest('#searchBtn')) return;
    if (!$('q').value.trim()) clearSearch();
    setSearch(false);
  });
  var onMq = function () { if (!compactMq.matches && searchIsOpen()) setSearch(false); };
  if (compactMq.addEventListener) compactMq.addEventListener('change', onMq); else if (compactMq.addListener) compactMq.addListener(onMq);

  /* ---------------- marcas ---------------- */
  function renderBrands() {
    var set = BRANDS_DEFAULT.slice();
    S.products.forEach(function (p) { if (p.brand && set.indexOf(p.brand) < 0) set.push(p.brand); });
    var ul = function (hidden) { return '<ul' + (hidden ? ' aria-hidden="true"' : '') + '>' + set.map(function (b) { return '<li><button type="button" data-brand="' + esc(b) + '"' + (hidden ? ' tabindex="-1"' : '') + '>' + esc(b) + '</button></li>'; }).join('') + '<li><button type="button" data-brand="Todos"' + (hidden ? ' tabindex="-1"' : '') + '>Ver todo</button></li></ul>'; };
    $('brandsTrack').innerHTML = ul(false) + ul(true);
  }
  $('brandsTrack').addEventListener('click', function (e) {
    var b = e.target.closest('[data-brand]'); if (!b) return;
    setFilter({ brand: b.dataset.brand, gender: 'Todos', cat: 'Todo' }, true);
  });
  $('brandsPause').addEventListener('click', function () {
    var p = $('brands').classList.toggle('paused');
    this.setAttribute('aria-pressed', p); this.setAttribute('aria-label', p ? 'Reanudar la banda de marcas' : 'Pausar la banda de marcas');
    this.innerHTML = '<svg aria-hidden="true"><use href="#' + (p ? 'i-play' : 'i-pause') + '"/></svg>';
  });

  /* ---------------- carrusel ---------------- */
  var car = { i: 0, n: 0, timer: null, playing: !reduceMotion };
  function slideHTML(s, i, n) {
    var bg = s.color || '#0e4d38', dark = luminance(bg) > 0.2;
    var grad = dark ? 'linear-gradient(135deg,' + bg + ' 0%,' + shade(bg, 0.35) + ' 100%)' : 'linear-gradient(135deg,' + shade(bg, -0.25) + ' 0%,' + bg + ' 60%,' + shade(bg, 0.12) + ' 130%)';
    return '<div class="slide' + (dark ? ' ink-dark' : '') + (i === 0 ? ' is-active' : '') + '" role="group" aria-roledescription="diapositiva" aria-label="' + (i + 1) + ' de ' + n + '" style="--slide-bg:' + grad + '">' +
      '<span class="slide__ghost" aria-hidden="true">PUNTO</span>' +
      '<div class="slide__txt">' + (s.eyebrow ? '<span class="slide__eyebrow">' + esc(s.eyebrow) + '</span>' : '') + '<h2>' + esc(s.title) + '</h2>' + (s.subtitle ? '<p>' + esc(s.subtitle) + '</p>' : '') +
      (s.button ? '<button type="button" class="btn ' + (dark ? 'btn-primary' : 'btn-light') + '" data-slide="' + i + '">' + esc(s.button) + '</button>' : '') + '</div>' +
      '<div class="slide__art" aria-hidden="true">' + (s.photo ? '<img class="photo-banner" src="' + esc(s.photo) + '" alt="">' : s.product ? art(s.product, '') : '') + '</div></div>';
  }
  var SLIDES = [];
  function renderHero() {
    var banners = S.ann.filter(function (a) { return a.kind === 'banner'; });
    SLIDES = banners.map(function (a) {
      var prod = a.linkType === 'producto' ? S.products.find(function (p) { return p.id === a.linkValue; }) : null;
      return { title: a.title, subtitle: a.subtitle, button: a.buttonText || (a.linkType !== 'ninguno' ? 'Ver más' : ''), color: a.color, photo: safeUrl(a.image), product: prod, link: { type: a.linkType, value: a.linkValue } };
    });
    var feats = S.products.filter(function (p) { return p.featured; }).slice(0, 3);
    if (!SLIDES.length) {
      SLIDES.push({ eyebrow: 'Punto Club', title: 'Arma tu estilo.', subtitle: 'Tenis, sandalias y chanclas para hombre y mujer, con envío a toda Colombia.', button: 'Ver catálogo', color: '#0e4d38', product: feats[0] || S.products[0], link: { type: 'ninguno' } });
      feats.slice(1).forEach(function (p) { SLIDES.push({ eyebrow: p.brand, title: p.name, subtitle: (p.salePrice ? 'Ahora ' + money(p.salePrice) + ' · ' : 'Desde ' + money(p.price) + ' · ') + 'Se entrega sin caja', button: 'Elegir talla', color: p.gender === 'Mujer' ? '#1f8a62' : '#0a2a20', product: p, link: { type: 'producto', value: p.id } }); });
    }
    car.n = SLIDES.length; car.i = 0;
    $('slides').innerHTML = SLIDES.map(function (s, i) { return slideHTML(s, i, SLIDES.length); }).join('');
    $('carCtrl').innerHTML = SLIDES.length > 1 ? SLIDES.map(function (_, i) { return '<button type="button" class="dot" data-dot="' + i + '" aria-label="Ver diapositiva ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + '></button>'; }).join('') +
      '<button type="button" class="car-pause" id="carPause" aria-label="' + (car.playing ? 'Pausar' : 'Reproducir') + ' el carrusel"><svg aria-hidden="true"><use href="#' + (car.playing ? 'i-pause' : 'i-play') + '"/></svg></button>' : '';
    $('carPrev').hidden = $('carNext').hidden = SLIDES.length < 2;
    restartCarousel();
  }
  // La diapositiva activa recibe .is-active: en tablet y PC eso dispara su animación de entrada
  function markSlide(i) {
    Array.prototype.forEach.call($('slides').children, function (s, k) { s.classList.toggle('is-active', k === i); });
    document.querySelectorAll('[data-dot]').forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
  }
  function goSlide(i, focus) {
    car.i = (i + car.n) % car.n;
    var el = $('slides'); el.scrollTo({ left: el.clientWidth * car.i, behavior: reduceMotion ? 'auto' : 'smooth' });
    markSlide(car.i);
    if (focus) { var b = el.children[car.i] && el.children[car.i].querySelector('button'); if (b) b.focus({ preventScroll: true }); }
  }
  $('carPrev').addEventListener('click', function () { goSlide(car.i - 1); restartCarousel(); });
  $('carNext').addEventListener('click', function () { goSlide(car.i + 1); restartCarousel(); });
  function restartCarousel() {
    clearInterval(car.timer);
    if (car.playing && car.n > 1) car.timer = setInterval(function () { if (!document.hidden && !stack.length) goSlide(car.i + 1); }, 6000);
  }
  $('carCtrl').addEventListener('click', function (e) {
    var d = e.target.closest('[data-dot]');
    if (d) { goSlide(Number(d.dataset.dot)); car.playing = false; updPause(); restartCarousel(); return; }
    if (e.target.closest('#carPause')) { car.playing = !car.playing; updPause(); restartCarousel(); }
  });
  function updPause() { var b = $('carPause'); if (!b) return; b.setAttribute('aria-label', (car.playing ? 'Pausar' : 'Reproducir') + ' el carrusel'); b.innerHTML = '<svg aria-hidden="true"><use href="#' + (car.playing ? 'i-pause' : 'i-play') + '"/></svg>'; }
  var scT;
  $('slides').addEventListener('scroll', function () {
    clearTimeout(scT); var el = this;
    scT = setTimeout(function () { var i = Math.round(el.scrollLeft / el.clientWidth); if (i !== car.i) { car.i = i; markSlide(i); } }, 120);
  });
  $('slides').addEventListener('focusin', function () { car.playing = false; updPause(); restartCarousel(); });
  $('slides').addEventListener('click', function (e) {
    var b = e.target.closest('[data-slide]'); if (!b) return;
    followLink(SLIDES[Number(b.dataset.slide)].link);
  });
  function followLink(l) {
    if (!l || l.type === 'ninguno') { setFilter({ gender: 'Todos', cat: 'Todo', brand: 'Todos' }, true); return; }
    if (l.type === 'producto') return openProduct(l.value);
    if (l.type === 'marca') return setFilter({ brand: l.value, gender: 'Todos', cat: 'Todo' }, true);
    if (l.type === 'categoria') return setFilter({ cat: CATS.indexOf(l.value) > -1 ? l.value : 'Todo' }, true);
    if (l.type === 'genero') return setFilter({ gender: ['Hombre', 'Mujer'].indexOf(l.value) > -1 ? l.value : 'Todos', cat: 'Todo' }, true);
    if (l.type === 'url') { var u = safeUrl(l.value); if (u) location.href = u; }
  }

  /* ---------------- ofertas, cupones y avisos como notificaciones dentro de la app ----------------
     Cupones públicos, promociones y avisos aparecen como notificaciones flotantes arriba de la
     pantalla: una a la vez, una vez por visita, y se van solas. No ocupan espacio en la página.
     Tocar una abre su detalle (con condiciones). Lo marcado como "ventana al entrar" sale en la
     ventana grande y ya no se repite como notificación en esa visita. */
  var K_CUP = 'kairo.cupon.v1', K_POP = 'kairo.ventana.v1', K_NOTI = 'kairo.notis.v1';
  function cupValue(c) { return c.type === 'porcentaje' ? c.value + '%' : c.type === 'valor' ? money(c.value) : 'Envío'; }
  function cupUnit(c) { return c.type === 'envio' ? 'gratis' : 'de descuento'; }
  function cupRules(c) {
    var r = [];
    if (c.scopeLabel) r.push('Solo para ' + c.scopeLabel);
    if (c.minSubtotal) r.push((c.scopeLabel ? 'Desde ' : 'En compras desde ') + money(c.minSubtotal) + (c.scopeLabel ? ' en esos productos' : ''));
    if (c.type === 'porcentaje' && c.maxDiscount) r.push('Descuento máximo ' + money(c.maxDiscount));
    if (c.endsAt) r.push('Vence el ' + new Date(c.endsAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }));
    return r;
  }
  function useCoupon(code) {
    closePopup(); hideNoti();
    if (S.coupon && S.coupon.code === code) { openCart(); return; }
    $('couponIn').value = code;
    if (S.cart.length) { store.del(K_CUP); applyCoupon(code); openCart(); return; }
    store.set(K_CUP, code);
    toast('Cupón ' + code + ' guardado: se aplica solo cuando agregues productos al carrito 🛍️');
  }
  function applyPendingCoupon() {
    var pend = store.get(K_CUP);
    if (!pend || S.coupon || !S.cart.length) return;
    store.del(K_CUP); $('couponIn').value = pend;
    applyCoupon(pend).then(function () { if (stack.indexOf($('coSheet')) > -1 && !$('coStep1').hidden) renderCheckoutSummary(); });
  }

  /* --- Cola de notificaciones --- */
  var notiT = null, notiHideT = null, notiCur = null, notiStarted = false, notiLeft = 0, notiAt = 0, popKey = '';
  var NOTI_MS = 7000;
  function notiSeen() { try { return JSON.parse(sessionStorage.getItem(K_NOTI) || '{}'); } catch (e) { return {}; } }
  function markNoti(k) { var s = notiSeen(); s[k] = 1; try { sessionStorage.setItem(K_NOTI, JSON.stringify(s)); } catch (e) { } }
  function notiQueue() {
    var seen = notiSeen(), q = [];
    S.ann.filter(function (a) { return a.kind === 'barra'; }).forEach(function (a) { q.push({ k: 'a:' + a.id, a: a }); });
    (S.coupons || []).forEach(function (c) { q.push({ k: 'c:' + c.code, c: c }); });
    S.promos.forEach(function (p) { q.push({ k: 'p:' + p.id, p: p }); });
    return q.filter(function (x) { return !seen[x.k] && x.k !== popKey; });
  }
  function startNotis() { if (notiStarted) return; notiStarted = true; scheduleNoti(3500); }
  function scheduleNoti(ms) { clearTimeout(notiT); notiT = setTimeout(nextNoti, ms); }
  function notiBusy() {
    return stack.length || isPaying || !$('popx').hidden || document.documentElement.classList.contains('k-loading') || document.visibilityState !== 'visible';
  }
  function nextNoti() {
    if (notiCur) return;
    var q = notiQueue(); if (!q.length) return;
    if (notiBusy()) { scheduleNoti(3000); return; } // espera a que el cliente termine lo que hace
    showNoti(q[0]);
  }
  function notiData(it) {
    if (it.c) { var c = it.c; return { img: safeUrl(c.image), ico: 'i-ticket', kick: '🎁 Cupón para ti', title: cupValue(c) + ' ' + cupUnit(c), text: (c.description ? c.description + ' · ' : '') + 'Código ' + c.code, btn: 'Usar', act: 'data-cup-use="' + esc(c.code) + '"' }; }
    if (it.p) { var p = it.p; return { img: safeUrl(p.image), ico: 'i-spark', kick: p.badge || 'Promoción', title: p.title, text: p.description || (p.endsAt ? 'Hasta el ' + fmtDate(p.endsAt) : ''), btn: 'Ver', act: 'data-noti-open' }; }
    var a = it.a, link = a.linkType && a.linkType !== 'ninguno';
    return { img: '', ico: 'i-bell', kick: 'Aviso', title: a.title, text: a.subtitle || '', btn: link ? (a.buttonText || 'Ver') : '', act: link ? 'data-noti-link' : '' };
  }
  function showNoti(it) {
    var d = notiData(it); notiCur = it; markNoti(it.k);
    $('notiBox').innerHTML = '<article class="noti__card" style="--ms:' + NOTI_MS + 'ms">' +
      '<button type="button" class="noti__main" data-noti-open aria-label="' + esc(d.kick + ': ' + d.title + '. Ver detalle') + '">' +
      (d.img ? '<span class="noti__pic"><img src="' + esc(d.img) + '" alt=""></span>' : '<span class="noti__pic noti__pic--ico"><svg aria-hidden="true"><use href="#' + d.ico + '"/></svg></span>') +
      '<span class="noti__txt"><small>' + esc(d.kick) + '</small><b>' + esc(d.title) + '</b>' + (d.text ? '<span>' + esc(d.text) + '</span>' : '') + '</span></button>' +
      (d.btn ? '<button type="button" class="btn btn-lime btn-sm noti__btn" ' + d.act + '>' + esc(d.btn) + '</button>' : '') +
      '<button type="button" class="noti__x" data-noti-x aria-label="Cerrar notificación"><svg aria-hidden="true"><use href="#i-close"/></svg></button>' +
      '<i class="noti__bar" aria-hidden="true"></i></article>';
    $('notiBox').hidden = false;
    requestAnimationFrame(function () { $('notiBox').classList.add('on'); });
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { } }
    notiLeft = NOTI_MS; resumeNoti();
  }
  function resumeNoti() { if (!notiCur) return; clearTimeout(notiHideT); notiAt = Date.now(); notiHideT = setTimeout(hideNoti, notiLeft); $('notiBox').classList.remove('paused'); }
  function pauseNoti() { if (!notiCur) return; clearTimeout(notiHideT); notiLeft = Math.max(1500, notiLeft - (Date.now() - notiAt)); $('notiBox').classList.add('paused'); }
  function hideNoti() {
    if (!notiCur) return;
    clearTimeout(notiHideT); notiCur = null;
    $('notiBox').classList.remove('on', 'paused');
    setTimeout(function () { if (!notiCur) { $('notiBox').hidden = true; $('notiBox').innerHTML = ''; } }, 300);
    scheduleNoti(9000); // la siguiente, con calma
  }
  // Pasar el dedo o el mouse encima la pausa; deslizar hacia arriba la cierra
  var notiY = null;
  $('notiBox').addEventListener('pointerenter', pauseNoti);
  $('notiBox').addEventListener('pointerleave', function () { notiY = null; resumeNoti(); });
  $('notiBox').addEventListener('focusin', pauseNoti);
  $('notiBox').addEventListener('focusout', resumeNoti);
  $('notiBox').addEventListener('pointerdown', function (e) { notiY = e.clientY; pauseNoti(); });
  $('notiBox').addEventListener('pointermove', function (e) {
    if (notiY == null) return; var dy = e.clientY - notiY;
    if (dy < 0) $('notiBox').style.transform = 'translate(-50%,' + dy + 'px)';
    if (dy < -45) { notiY = null; $('notiBox').style.transform = ''; hideNoti(); }
  });
  $('notiBox').addEventListener('pointerup', function () { notiY = null; $('notiBox').style.transform = ''; });

  /* Ventana al entrar */
  var popShown = false, popPrevFocus = null;
  function maybePopup() {
    if (popShown || !S.loaded || stack.length || (S.order && S.order.step === 'pago')) return;
    var seen = store.get(K_POP) || {};
    var cands = (S.coupons || []).filter(function (c) { return c.popup; }).map(function (c) { return { k: 'c:' + c.code, c: c }; })
      .concat(S.promos.filter(function (p) { return p.popup; }).map(function (p) { return { k: 'p:' + p.id, p: p }; }));
    var it = cands.find(function (x) { return !seen[x.k]; }); if (!it) return;
    seen[it.k] = Date.now(); store.set(K_POP, seen); popShown = true; popKey = it.k;
    openPopup(it);
  }
  function openPopup(it) {
    var c = it.c, p = it.p, img = safeUrl((c || p).image);
    $('popxCard').innerHTML = '<button type="button" class="popx__x" data-popx-close aria-label="Cerrar"><svg aria-hidden="true"><use href="#i-close"/></svg></button>' +
      (img ? '<div class="popx__pic"><img src="' + esc(img) + '" alt=""></div>' : '<div class="popx__pic popx__pic--plain" aria-hidden="true"><svg><use href="#' + (c ? 'i-ticket' : 'i-spark') + '"/></svg></div>') +
      '<div class="popx__body">' + (c
        ? '<span class="popx__kick">🎁 Un regalo para ti</span><h2 id="popxT"><b>' + esc(cupValue(c)) + '</b> ' + cupUnit(c) + '</h2>' + (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
          '<p class="popx__rules">' + cupRules(c).map(esc).join(' · ') + '</p><div class="popx__code"><span>Código</span><b>' + esc(c.code) + '</b></div>' +
          '<button type="button" class="btn btn-lime btn-block" data-cup-use="' + esc(c.code) + '">' + (S.coupon && S.coupon.code === c.code ? '✓ Ya está aplicado · ver carrito' : 'Usar cupón') + '</button>'
        : (p.badge ? '<span class="popx__kick">' + esc(p.badge) + '</span>' : '') + '<h2 id="popxT">' + esc(p.title) + '</h2>' + (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
          (p.endsAt ? '<p class="popx__rules">Hasta el ' + fmtDate(p.endsAt) + '</p>' : '') +
          '<button type="button" class="btn btn-lime btn-block" data-promo-go="' + esc(p.id) + '">' + (p.kind === 'informativa' ? 'Entendido' : 'Ver productos') + '</button>') +
      '<button type="button" class="link-btn popx__later" data-popx-close>Ahora no</button>' +
      ((c || p).conditions ? '<details><summary>Ver condiciones</summary><p>' + esc((c || p).conditions) + '</p></details>' : '') + '</div>';
    popPrevFocus = document.activeElement;
    $('popx').hidden = false;
    requestAnimationFrame(function () { $('popx').classList.add('on'); });
    document.documentElement.classList.add('popx-open');
    setTimeout(function () { var b = $('popxCard').querySelector('.btn'); if (b) b.focus(); }, 60);
  }
  function closePopup() {
    if ($('popx').hidden) return;
    $('popx').classList.remove('on'); document.documentElement.classList.remove('popx-open');
    setTimeout(function () { $('popx').hidden = true; $('popxCard').innerHTML = ''; }, 220);
    if (popPrevFocus && popPrevFocus.focus) try { popPrevFocus.focus({ preventScroll: true }); } catch (e) { }
  }
  document.addEventListener('keydown', function (e) {
    if ($('popx').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); return; }
    if (e.key === 'Tab') { // el foco no sale de la ventana
      var f = [].slice.call($('popxCard').querySelectorAll('button, a[href], summary')); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-popx-close]')) { closePopup(); return; }
    if (e.target.closest('[data-noti-x]')) { hideNoti(); return; }
    var u = e.target.closest('[data-cup-use]'); if (u) { useCoupon(u.dataset.cupUse); return; }
    if (e.target.closest('[data-noti-open]') && notiCur) {
      var it = notiCur; hideNoti();
      if (it.a) { if (it.a.linkType && it.a.linkType !== 'ninguno') followLink({ type: it.a.linkType, value: it.a.linkValue }); }
      else openPopup(it);
      return;
    }
    if (e.target.closest('[data-noti-link]') && notiCur) { var a = notiCur.a; hideNoti(); followLink({ type: a.linkType, value: a.linkValue }); return; }
    var g = e.target.closest('[data-promo-go]');
    if (g) {
      closePopup();
      var p = S.promos.find(function (x) { return x.id === g.dataset.promoGo; }); if (!p || p.kind === 'informativa') return;
      followLink(p.kind === 'descuento' && p.scopeType && p.scopeType !== 'todo' ? { type: p.scopeType, value: p.scopeValue } : { type: 'ninguno' });
    }
  });

  /* ---------------- barra superior, promos y dinámicas ---------------- */
  function fmtDate(d) { return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function renderNotices() {
    // La barra de aviso, los cupones y las promociones salen como notificaciones (ver arriba), no en la página
    $('topbar').hidden = true;

    var dins = S.ann.filter(function (a) { return a.kind === 'dinamica'; });
    $('dinSec').hidden = !dins.length;
    $('dinRow').innerHTML = dins.map(function (a) {
      return '<article class="promo promo--din"><span class="promo__badge">Dinámica</span><h3>' + esc(a.title) + '</h3>' + (a.subtitle ? '<p>' + esc(a.subtitle) + '</p>' : '') +
        (a.endsAt ? '<span class="until">Participa hasta el ' + fmtDate(a.endsAt) + '</span>' : '') +
        (a.coljuegosRef ? '<p>Autorización Coljuegos: ' + esc(a.coljuegosRef) + '</p>' : '') +
        '<details><summary>Leer las bases</summary><p style="white-space:pre-line">' + esc(a.conditions) + '</p></details></article>';
    }).join('');
  }

  /* ---------------- detalle del producto ---------------- */
  function openProduct(id) {
    var p = S.products.find(function (x) { return x.id === id; }); if (!p) return;
    S.sel = { p: p, size: null, color: (p.colors || [])[0] || null, qty: 1 };
    var sale = p.salePrice && p.salePrice < p.price;
    $('pdBrand').textContent = p.brand;
    $('pdName').textContent = p.name;
    $('pdMeta').textContent = p.category + ' · ' + p.gender + (p.tag ? ' · ' + p.tag : '');
    var seg2 = S.promos.filter(function (pr) { return pr.kind === 'segunda' && scopeMatch(pr, p); })[0];
    $('pdPrice').innerHTML = '<b>' + money(priceOf(p)) + '</b>' + (sale ? '<s><span class="sr-only">Antes </span>' + money(p.price) + '</s>' : '') + (p.promo ? '<span class="pd__promo">' + esc(p.promo.title) + '</span>' : '') +
      (seg2 ? '<span class="pd__promo">2.ª unidad -' + seg2.discount + '%</span>' : '');
    $('pdDesc').textContent = p.desc || '';
    $('pdMedia').style.setProperty('--tint', p.bg || '#e2f0e8');
    $('pdMedia').innerHTML = art(p, '', S.sel.color);
    $('pdSizes').innerHTML = (p.sizes || []).map(function (s) { return '<button type="button" class="size" data-size="' + esc(s) + '" aria-pressed="false">' + esc(s) + '</button>'; }).join('');
    $('pdColors').innerHTML = (p.colors || []).map(function (c, i) { return '<button type="button" class="color" data-color="' + i + '" aria-pressed="' + (i === 0) + '"><i style="background:' + esc(c.h) + '" aria-hidden="true"></i>' + esc(c.n) + '</button>'; }).join('');
    $('pdColorLbl').hidden = !(p.colors || []).length;
    $('pdSizeHint').textContent = 'Elige una';
    $('pdColorHint').textContent = S.sel.color ? S.sel.color.n : '';
    $('pdQty').textContent = '1';
    $('pdErr').hidden = true;
    syncFavUI();
    loadReviews(p.id);
    var out = Number(p.stock) === 0;
    $('pdAdd').disabled = out; $('pdBuy').disabled = out;
    if (out) { $('pdErr').hidden = false; $('pdErr').textContent = 'Agotado por ahora. Escríbenos por WhatsApp y te avisamos.'; }
    openLayer($('pdSheet'));
  }
  $('pdSizes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-size]'); if (!b) return;
    S.sel.size = Number(b.dataset.size);
    this.querySelectorAll('.size').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    $('pdSizeHint').textContent = 'Talla ' + S.sel.size; $('pdErr').hidden = true;
  });
  $('pdColors').addEventListener('click', function (e) {
    var b = e.target.closest('[data-color]'); if (!b) return;
    S.sel.color = S.sel.p.colors[Number(b.dataset.color)];
    this.querySelectorAll('.color').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    $('pdColorHint').textContent = S.sel.color.n;
    $('pdMedia').innerHTML = art(S.sel.p, '', S.sel.color);
  });
  $('pdMinus').addEventListener('click', function () { S.sel.qty = Math.max(1, S.sel.qty - 1); $('pdQty').textContent = S.sel.qty; });
  $('pdPlusQ').addEventListener('click', function () { S.sel.qty = Math.min(9, S.sel.qty + 1); $('pdQty').textContent = S.sel.qty; });
  function addSel(buyNow) {
    if (!S.sel.size) { $('pdErr').textContent = 'Elige una talla para continuar.'; $('pdErr').hidden = false; var f = $('pdSizes').querySelector('button'); if (f) f.focus(); return; }
    var p = S.sel.p, color = S.sel.color ? S.sel.color.n : '';
    var key = p.id + '|' + S.sel.size + '|' + color;
    var it = S.cart.find(function (i) { return i.key === key; });
    if (it) it.qty = Math.min(9, it.qty + S.sel.qty);
    else S.cart.push({ key: key, id: p.id, size: S.sel.size, color: color, qty: S.sel.qty });
    saveCart(); renderCart();
    if (buyNow) { closeLayer($('pdSheet'), false, true); openCheckout(true); }
    else { closeLayer($('pdSheet')); toast(p.name + ' (talla ' + S.sel.size + ') añadido al carrito'); bumpCart(); }
  }
  function bumpCart() {
    [$('cartBtn'), $('bnCart')].forEach(function (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { }
  }
  $('pdFav').addEventListener('click', function () { if (!S.sel) return; var on = toggleFav(S.sel.p.id); toast(on ? 'Guardado en favoritos' : 'Quitado de favoritos'); });
  $('pdAdd').addEventListener('click', function () { addSel(false); });
  $('pdBuy').addEventListener('click', function () { addSel(true); });

  /* ---------------- carrito ---------------- */
  function saveCart() { if (S.cart.length) store.set(K_CART, { items: S.cart, coupon: S.coupon ? S.coupon.code : '', at: Date.now() }); else store.del(K_CART); }
  function cartLines() {
    return S.cart.map(function (i) { var p = S.products.find(function (x) { return x.id === i.id; }); return p ? Object.assign({ p: p, price: priceOf(p) }, i) : null; }).filter(Boolean);
  }
  /* ¿La promoción o cupón aplica a este producto? (igual que lib/pricing.js) */
  function plano(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function scopeMatch(pr, p) {
    var t = pr.scopeType || 'todo', v = String(pr.scopeValue || '').trim().toLowerCase();
    if (t === 'todo') return true;
    if (t === 'marca') return String(p.brand || '').toLowerCase() === v;
    if (t === 'categoria') return String(p.category || '').toLowerCase() === v;
    if (t === 'genero') return String(p.gender || '').toLowerCase() === v || (v !== 'unisex' && String(p.gender || '').toLowerCase() === 'unisex');
    if (t === 'producto') return String(p.id) === String(pr.scopeValue || '').trim();
    if (t === 'nombre') { var w = plano(pr.scopeValue); return !!w && (' ' + plano(p.brand + ' ' + p.name) + ' ').indexOf(' ' + w + ' ') > -1; }
    return false;
  }
  /* Segunda unidad con descuento: pares de mayor a menor precio, la 2.ª de cada par lleva el % */
  function segundaCalc(lines) {
    var used = lines.map(function () { return 0; }), savings = 0, titles = [];
    S.promos.filter(function (pr) { return pr.kind === 'segunda' && pr.discount > 0; }).sort(function (a, b) { return b.discount - a.discount; }).forEach(function (pr) {
      var pct = Math.min(90, pr.discount), units = [];
      lines.forEach(function (l, i) { if (scopeMatch(pr, l.p)) for (var k = used[i]; k < l.qty; k++) units.push({ i: i, price: l.price }); });
      units.sort(function (a, b) { return b.price - a.price; });
      var pares = units.length - units.length % 2;
      for (var k = 0; k < pares; k++) { used[units[k].i]++; if (k % 2 === 1) savings += Math.round(units[k].price * pct / 100 / 100) * 100; }
      if (pares) titles.push(pr.title);
    });
    return { savings: savings, title: titles.join(' + ') };
  }
  function calc() {
    var lines = cartLines();
    var list = lines.reduce(function (s, l) { return s + l.p.price * l.qty; }, 0);
    var seg = segundaCalc(lines);
    var sub = lines.reduce(function (s, l) { return s + l.price * l.qty; }, 0) - seg.savings;
    var disc = S.coupon ? Math.min(S.coupon.discount || 0, sub) : 0;
    var shipPromo = S.promos.filter(function (p) { return p.kind === 'envio' && sub >= (p.minSubtotal || 0); })[0];
    var free = !!(S.coupon && S.coupon.freeShipping) || !!shipPromo;
    // Envío nacional: tarifa fija (se configura en el panel)
    var envio = free ? 0 : ENVIO;
    var total = Math.max(0, sub - disc);
    return { lines: lines, list: list, sub: sub, save: list - sub, seg: seg, disc: disc, free: free, shipPromo: shipPromo, envio: envio, total: total, totalConEnvio: total + envio, count: lines.reduce(function (s, l) { return s + l.qty; }, 0) };
  }
  function totalsHTML(c, pago) {
    var h = '<div><span>Productos</span><span>' + money(c.list) + '</span></div>';
    if (c.save - c.seg.savings > 0) h += '<div class="save"><span>Promociones</span><span>-' + money(c.save - c.seg.savings) + '</span></div>';
    if (c.seg.savings) h += '<div class="save"><span>' + esc(c.seg.title) + '</span><span>-' + money(c.seg.savings) + '</span></div>';
    if (c.disc) h += '<div class="save"><span>Cupón ' + esc(S.coupon.code) + '</span><span>-' + money(c.disc) + '</span></div>';
    var promoTxt = c.shipPromo && !(S.coupon && S.coupon.freeShipping) ? ' (' + esc(c.shipPromo.title) + ')' : '';
    h += '<div><span>Envío nacional' + promoTxt + '</span><span>' + (c.envio ? money(c.envio) : 'Gratis') + '</span></div>';
    h += '<div class="grand"><span>Total</span><span>' + money(c.totalConEnvio) + '</span></div>';
    if (pago) h += '<div><span>Pagas ahora por transferencia o QR</span><span>' + money(c.totalConEnvio) + '</span></div>';
    return h;
  }
  function renderCart() {
    var c = calc();
    $('cartItems').innerHTML = c.lines.length ? c.lines.map(function (l) {
      return '<div class="ci"><div class="ci__thumb" style="--tint:' + esc(l.p.bg || '#e2f0e8') + '">' + art(l.p, '', (l.p.colors || []).find(function (x) { return x.n === l.color; })) + '</div>' +
        '<div><h3>' + esc(l.p.brand + ' ' + l.p.name) + '</h3><small>Talla ' + esc(l.size) + (l.color ? ' · ' + esc(l.color) : '') + ' · Sin caja</small>' +
        '<div class="qty" role="group" aria-label="Cantidad de ' + esc(l.p.name) + '"><button type="button" data-q="-1" data-k="' + esc(l.key) + '" aria-label="Quitar uno">−</button><span aria-live="polite">' + l.qty + '</span><button type="button" data-q="1" data-k="' + esc(l.key) + '" aria-label="Agregar uno">+</button></div></div>' +
        '<div><div class="ci__price">' + money(l.price * l.qty) + '</div><button type="button" class="ci__rm" data-rm="' + esc(l.key) + '">Quitar<span class="sr-only"> ' + esc(l.p.name) + '</span></button></div></div>';
    }).join('') : '<p class="cart-empty">Tu carrito está vacío.<br>Elige un modelo del catálogo.</p>';
    $('cartFoot').hidden = !c.lines.length;
    $('cartTotals').innerHTML = totalsHTML(c);
    $('toCheckout').disabled = !c.lines.length;
    [$('cartBadge'), $('bnBadge')].forEach(function (b) { b.textContent = c.count; b.hidden = !c.count; });
    var lbl = 'Abrir carrito, ' + c.count + (c.count === 1 ? ' producto' : ' productos');
    $('cartBtn').setAttribute('aria-label', lbl); $('bnCart').setAttribute('aria-label', lbl);
  }
  $('cartItems').addEventListener('click', function (e) {
    var q = e.target.closest('[data-q]'), rm = e.target.closest('[data-rm]');
    if (q) { var it = S.cart.find(function (i) { return i.key === q.dataset.k; }); if (it) { it.qty = Math.max(0, Math.min(9, it.qty + Number(q.dataset.q))); if (!it.qty) S.cart.splice(S.cart.indexOf(it), 1); } }
    else if (rm) S.cart = S.cart.filter(function (i) { return i.key !== rm.dataset.rm; });
    else return;
    saveCart(); renderCart(); revalidateCoupon();
    if (!S.cart.length) setTimeout(function () { $('cartSheet').querySelector('[data-close]').focus(); }, 30);
  });
  function openCart() { renderCart(); openLayer($('cartSheet')); applyPendingCoupon(); }
  $('cartBtn').addEventListener('click', openCart);
  $('bnCart').addEventListener('click', openCart);

  /* cupón */
  function itemsPayload() { return S.cart.map(function (i) { var p = S.products.find(function (x) { return x.id === i.id; }); return { id: i.id, size: i.size, color: i.color, qty: i.qty, name: p ? p.name : i.id }; }); }
  async function applyCoupon(code, quiet) {
    var msg = $('couponMsg');
    if (!code) { S.coupon = null; msg.textContent = ''; saveCart(); renderCart(); return; }
    $('couponBtn').disabled = true;
    try {
      var d = await api('/api/coupon', { code: code, items: itemsPayload() });
      S.coupon = { code: d.code, discount: d.discount, freeShipping: d.freeShipping, description: d.description };
      msg.className = 'coupon-msg ok';
      msg.textContent = 'Cupón ' + d.code + ' aplicado' + (d.discount ? ': -' + money(d.discount) : '') + (d.freeShipping ? ' · envío gratis' : '') + '.';
    } catch (e) {
      S.coupon = null;
      msg.className = 'coupon-msg bad';
      msg.textContent = e instanceof TypeError ? 'No pudimos validar el cupón. Revisa tu conexión.' : e.message;
      if (quiet) msg.textContent = 'El cupón ' + code + ' ya no aplica a este carrito: ' + msg.textContent;
    } finally { $('couponBtn').disabled = false; saveCart(); renderCart(); }
  }
  function revalidateCoupon() { if (S.coupon && S.cart.length) applyCoupon(S.coupon.code, true); else if (!S.cart.length) { S.coupon = null; $('couponMsg').textContent = ''; } }
  $('couponForm').addEventListener('submit', function (e) { e.preventDefault(); applyCoupon($('couponIn').value.trim().toUpperCase()); });

  /* ---------------- compra ---------------- */
  var coSteps = ['Datos de envío', 'Pago', 'Pedido registrado'];
  function showStep(n) {
    [1, 2, 3].forEach(function (k) { $('coStep' + k).hidden = k !== n; });
    $('coSheet').querySelectorAll('.steps li').forEach(function (li, k) { li.classList.toggle('on', k < n); });
    $('coTitle').textContent = coSteps[n - 1];
    $('coStepTxt').textContent = 'Paso ' + n + ' de 3: ' + coSteps[n - 1].toLowerCase();
    $('coSheet').querySelector('.sheet__body:not([hidden])').scrollTop = 0;
    paying(n === 2);
  }
  function currentPago() { var r = document.querySelector('input[name="pago"]:checked'); return r ? r.value : 'Nequi'; }
  function renderCheckoutSummary() {
    var c = calc();
    $('coSummary').innerHTML = c.lines.map(function (l) { return '<div><span>' + esc(l.p.brand + ' ' + l.p.name) + ' · T' + esc(l.size) + (l.color ? ' · ' + esc(l.color) : '') + ' ×' + l.qty + '</span><span>' + money(l.price * l.qty) + '</span></div>'; }).join('') +
      '<div><span>Empaque</span><span>Sin caja</span></div>';
    $('coTotals').innerHTML = totalsHTML(c, currentPago());
    $('payNequiTxt').textContent = 'Desde la app de cualquier banco (Nequi, Bancolombia, Daviplata…). Pagas ' + money(c.totalConEnvio) + ' ahora.';
    $('envioTxt').textContent = c.free ? 'gratis en este pedido' : money(ENVIO);
  }
  document.querySelectorAll('input[name="pago"]').forEach(function (r) { r.addEventListener('change', renderCheckoutSummary); });
  function openCheckout(replace) {
    if (stack.indexOf($('cartSheet')) > -1) { closeLayer($('cartSheet'), false, true); replace = true; }
    if (S.order) { resumeOrder(replace); return; }
    if (!S.cart.length) return;
    applyPendingCoupon();
    prefillProfile();
    renderCheckoutSummary(); showStep(1);
    $('orderErr').hidden = true;
    openLayer($('coSheet'), $('fNombre'), replace === true);
  }
  $('toCheckout').addEventListener('click', function () { openCheckout(); });
  /* ---------------- envío nacional: tarifa fija para toda Colombia ---------------- */
  // El valor real llega del servidor (/api/catalog → settings.envio); se configura en el panel.
  var ENVIO = 25000;
  var DEPTOS = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'];
  function renderDeptos() {
    var cur = $('fDepto').value;
    $('fDepto').innerHTML = '<option value="">Elige uno</option>' + DEPTOS.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('');
    if (cur) $('fDepto').value = cur;
  }
  $('fDepto').addEventListener('change', function () { fieldErr('fDepto', ''); });
  renderDeptos();

  function fieldErr(id, msg) { var i = $(id), e = $(id + '-e'); i.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } return !msg; }
  function telDigits(v) { var d = String(v || '').replace(/\D/g, ''); if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2); return d; }
  var sending = false;
  $('orderForm').addEventListener('submit', async function (e) {
    e.preventDefault(); if (sending) return;
    var v = function (id) { return $(id).value.trim(); };
    var checks = [
      ['fNombre', v('fNombre').length >= 3 ? '' : 'Escribe tu nombre y apellido.'],
      ['fTel', /^3\d{9}$/.test(telDigits(v('fTel'))) ? '' : 'Escribe un celular de 10 dígitos que empiece por 3.'],
      ['fCed', v('fCed').replace(/[^\dA-Za-z]/g, '').length >= 5 ? '' : 'Escribe tu cédula: la transportadora la pide para entregar.'],
      ['fCorreo', !v('fCorreo') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('fCorreo')) ? '' : 'Revisa el correo (ejemplo: nombre@correo.com).'],
      ['fDepto', v('fDepto') ? '' : 'Elige el departamento de entrega.'],
      ['fCiudad', v('fCiudad').length >= 3 ? '' : 'Escribe la ciudad o municipio.'],
      ['fDir', v('fDir').length >= 5 ? '' : 'Escribe la dirección de entrega.']
    ];
    var firstBad = null;
    checks.forEach(function (c) { if (!fieldErr(c[0], c[1]) && !firstBad) firstBad = $(c[0]); });
    var cErr = !$('cTerm').checked ? 'Para continuar acepta los términos y condiciones.' : !$('cDatos').checked ? 'Para continuar autoriza el tratamiento de tus datos para gestionar el pedido.' : '';
    $('consent-e').textContent = cErr; $('consent-e').hidden = !cErr;
    if (cErr && !firstBad) firstBad = !$('cTerm').checked ? $('cTerm') : $('cDatos');
    if (firstBad) { firstBad.focus(); return; }

    sending = true; $('orderBtn').disabled = true; $('orderBtn').textContent = 'Guardando tu pedido…'; $('orderErr').hidden = true;
    var pago = currentPago();
    var customer = { nombre: v('fNombre'), telefono: telDigits(v('fTel')), cedula: v('fCed'), correo: v('fCorreo'), direccion: v('fDir'), barrio: v('fBarrio'), ciudad: v('fCiudad'), departamento: v('fDepto'), notas: v('fNotas'), pago: pago, entrega: 'Nacional' };
    try {
      var d = await api('/api/orders', { items: itemsPayload(), coupon: S.coupon ? S.coupon.code : '', customer: customer, cliente: clienteId(), consent: { terminos: true, datos: true, version: N.versionPoliticas || '' } });
      if ($('cRecordar').checked) {
        var prev = store.get(K_PERFIL) || {};
        store.set(K_PERFIL, { nombre: customer.nombre, telefono: customer.telefono, cedula: customer.cedula, correo: customer.correo, direccion: customer.direccion || prev.direccion || '', barrio: customer.barrio || prev.barrio || '', ciudad: customer.ciudad, departamento: customer.departamento, entrega: customer.entrega });
      }
      else store.del(K_PERFIL);
      rememberOrder(d.numero, customer.telefono.slice(-4));
      S.order = {
        numero: d.numero, ultimos4: customer.telefono.slice(-4), nombre: customer.nombre.split(' ')[0], ciudad: customer.ciudad,
        pago: d.pago, entrega: customer.entrega, pricing: d.pricing, items: d.items.map(function (i) { return { brand: i.brand, name: i.name, size: i.size, color: i.color, qty: i.qty, price: i.price }; }),
        createdAt: d.createdAt, step: 'pago', at: Date.now()
      };
      store.set(K_ORDER, S.order);
      if (d.checkoutUrl) wompiUrl = d.checkoutUrl;
      S.cart = []; S.coupon = null; saveCart(); renderCart(); $('couponIn').value = ''; $('couponMsg').textContent = '';
      $('orderForm').reset(); renderCheckoutSummary();
      // Separado (pagar al recoger) o sin nada que pagar ahora: directo a "listo"
      if (!d.pricing.pagarAhora) {
        S.order.step = 'separado'; store.set(K_ORDER, S.order); MP.stale = true;
        renderDone(); showStep(3); setTimeout(function () { $('doneTitle').focus(); }, 50);
        return;
      }
      renderPayment(); showStep(2);
      setTimeout(function () { $('payTitle').setAttribute('tabindex', '-1'); $('payTitle').focus(); }, 50);
      if (S.order.pago === 'Wompi') goWompi();
    } catch (err) {
      $('orderErr').textContent = err instanceof TypeError ? 'No hay conexión. Tu carrito sigue guardado: revisa tu internet e intenta de nuevo.' : err.message;
      $('orderErr').hidden = false; $('orderErr').focus && $('orderErr').setAttribute('tabindex', '-1'); $('orderErr').focus();
      if (err.status === 400 && /cup[oó]n/i.test(err.message)) { S.coupon = null; saveCart(); renderCheckoutSummary(); }
    } finally { sending = false; $('orderBtn').disabled = false; $('orderBtn').textContent = 'Confirmar pedido e ir a pagar'; }
  });

  /* ---------------- pago Nequi ---------------- */
  function payValue() { var o = S.order; return o.pricing.pagarAhora != null ? o.pricing.pagarAhora : o.pricing.totalConEnvio; }
  function renderPayment() {
    var o = S.order, val = payValue();
    $('payNo').textContent = o.numero;
    var online = o.pago === 'Wompi';
    $('payWompi').hidden = !online; $('payNequi').hidden = online;
    $('payTitle').textContent = online ? 'Paga en línea' : o.pago === 'Contraentrega' ? 'Paga el domicilio' : 'Paga por transferencia o QR';
    if (!online) renderAccounts();
    if (online) renderWompiState(o.wompiEstado || '');
    $('payAmount').innerHTML = money(val) + '<small>' + (o.pago === 'Contraentrega' ? 'Valor del domicilio. El resto (' + money(o.pricing.saldoContraentrega) + ') lo pagas al recibir.' : o.entrega === 'Recoger' ? 'Total de tu pedido (lo recoges en la tienda)' : o.entrega === 'Domicilio' ? 'Total de tu pedido con domicilio' : 'Total de tu pedido con envío') + '</small>';
    $('payVal').textContent = money(val);
    $('payMsg').textContent = o.numero;
    $('payCodNote').hidden = o.pago !== 'Contraentrega';
    $('payCodNote').textContent = o.pricing.freeShipping ? 'Tu pedido tiene domicilio gratis: este valor se descuenta de lo que pagas al recibir.' : 'Este pago cubre el domicilio y confirma tu pedido contraentrega.';
    if ($('payWa')) $('payWa').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola Punto Club, pagué mi pedido ' + o.numero + ' por ' + money(val) + '. Te envío el comprobante.');
    $('fReceipt').value = ''; fieldErr('fReceipt', ''); $('fReceipt-status').textContent = '';
    showReceiptPreview(null);
    if (N.pintar) N.pintar();
  }
  /* ---------------- pago en línea (Wompi) ---------------- */
  var wompiUrl = '';
  var WOMPI_TXT = {
    '': ['Te llevamos a la página segura de Wompi para pagar con tarjeta, PSE, Nequi o Bancolombia.', 'Pagar en línea'],
    PENDING: ['Tu pago está en proceso. Si ya lo completaste, espera unos segundos y revisa el estado.', 'Pagar de nuevo'],
    DECLINED: ['El pago fue rechazado. No se te cobró nada: puedes intentarlo de nuevo con otro medio.', 'Intentar de nuevo'],
    VOIDED: ['El pago fue anulado. Puedes intentarlo de nuevo.', 'Intentar de nuevo'],
    ERROR: ['Hubo un error con el pago. No se te cobró nada: puedes intentarlo de nuevo.', 'Intentar de nuevo']
  };
  function renderWompiState(estado) {
    var t = WOMPI_TXT[estado] || WOMPI_TXT[''];
    $('wompiMsg').textContent = t[0];
    $('wompiBtn').lastChild.textContent = t[1];
    $('wompiBtn').disabled = false;
    $('wompiCheck').hidden = !(S.order && S.order.wompiTx);
  }
  async function goWompi() {
    var b = $('wompiBtn'); b.disabled = true;
    try {
      var url = wompiUrl;
      if (!url) url = (await api('/api/wompi', { accion: 'checkout', numero: S.order.numero, ultimos4: S.order.ultimos4 })).checkoutUrl;
      wompiUrl = '';
      paying(false); // sin aviso de "salir de la página": vamos a Wompi y volvemos
      location.href = url;
    } catch (err) {
      b.disabled = false;
      toast(err instanceof TypeError ? 'No hay conexión. Intenta de nuevo.' : err.message);
      if (err.status === 409) checkWompi();
    }
  }
  $('wompiBtn').addEventListener('click', goWompi);
  async function verifyWompi(id) {
    try {
      var r = await api('/api/wompi', { accion: 'verificar', id: id });
      var mine = S.order && S.order.numero === r.numero;
      if (r.estado === 'APPROVED' || r.pedido !== 'Recibido') {
        MP.stale = true;
        if (!mine) { toast('Pago aprobado para el pedido ' + r.numero + '.'); if (hasHistory()) fetchOrders(); return; }
        S.order.step = 'pagado'; S.order.wompiEstado = 'APPROVED'; store.set(K_ORDER, S.order);
        resumeOrder();
        return;
      }
      if (!mine) { toast('El pago del pedido ' + r.numero + ' quedó ' + (r.estado === 'PENDING' ? 'en proceso.' : 'rechazado.')); return; }
      S.order.wompiEstado = r.estado; S.order.wompiTx = id; store.set(K_ORDER, S.order);
      resumeOrder();
    } catch (err) {
      toast(err instanceof TypeError ? 'No hay conexión para revisar tu pago. Intenta de nuevo.' : err.message);
      if (S.order && S.order.step === 'pago') resumeOrder();
    }
  }
  function checkWompi() {
    if (S.order && S.order.wompiTx) { if (stack.indexOf($('coSheet')) > -1) closeLayer($('coSheet'), false, true); verifyWompi(S.order.wompiTx); }
  }
  $('wompiCheck').addEventListener('click', checkWompi);

  /* ---------------- cuentas para pagar (Nequi, Bancolombia, Daviplata…) ---------------- */
  // Si el panel no tiene cuentas, se usa la cuenta Nequi de negocio.js con el QR de /img/nequi-qr.png
  var CUENTAS = [{ banco: 'Nequi', titular: N.nequiTitular || '', tipo: 'Llave Bre-B', numero: N.nequiLlave || '', qr: '/img/nequi-qr.png' }];
  function acctName(a) { return a.banco === 'Otro' ? (a.nombre || 'Otra cuenta') : a.banco; }
  function renderAccounts() {
    var i = Math.min(S.acct || 0, CUENTAS.length - 1), a = CUENTAS[i];
    S.acct = i;
    $('acctTabs').innerHTML = CUENTAS.map(function (c, k) {
      return '<button type="button" role="radio" aria-checked="' + (k === i) + '" data-acct="' + k + '">' + esc(acctName(c)) + '</button>';
    }).join('');
    $('acctTabs').hidden = $('acctQ').hidden = CUENTAS.length < 2;
    var qr = safeUrl(a.qr);
    $('acctQrBox').hidden = $('qrSave').hidden = !qr;
    if (qr) {
      $('acctQr').src = qr; $('acctQr').alt = 'Código QR de ' + acctName(a) + ' a nombre de ' + (a.titular || 'Punto Club');
      $('qrSave').href = qr; $('qrSave').download = 'QR-' + acctName(a).replace(/[^\w-]+/g, '') + '-PuntoClub.png';
    }
    $('acctTitular').textContent = $('acctTitular2').textContent = a.titular || 'Punto Club';
    $('acctNumRow').hidden = !a.numero;
    $('acctTipo').textContent = a.tipo || 'Número';
    $('payKey').textContent = a.numero || '';
  }
  $('acctTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-acct]'); if (!b) return;
    S.acct = Number(b.dataset.acct); renderAccounts();
    var nb = $('acctTabs').querySelector('[data-acct="' + S.acct + '"]'); if (nb) nb.focus();
  });

  function receiptData(file, maxBytes, maxDim) {
    maxBytes = maxBytes || 1800 * 1024; maxDim = maxDim || 1600;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error('Elige una imagen JPG, PNG o WEBP.'));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error('La foto original debe pesar menos de 12 MB.'));
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), image = new Image();
      image.onload = async function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
        var width = Math.max(1, Math.round(image.naturalWidth * scale));
        var height = Math.max(1, Math.round(image.naturalHeight * scale));
        var canvas = document.createElement('canvas'), context = canvas.getContext('2d');
        if (!context) { reject(new Error('No se pudo preparar la foto en este navegador.')); return; }
        try {
          for (var attempt = 0; attempt < 7; attempt++) {
            canvas.width = width; canvas.height = height;
            context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            for (var quality of [0.82, 0.72, 0.62, 0.52]) {
              var blob = await new Promise(function (done) { canvas.toBlob(done, 'image/jpeg', quality); });
              if (blob && blob.size <= maxBytes) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result); };
                reader.onerror = function () { reject(new Error('No se pudo leer la foto.')); };
                reader.readAsDataURL(blob);
                return;
              }
            }
            width = Math.round(width * 0.8); height = Math.round(height * 0.8);
          }
          reject(new Error('No se pudo reducir la foto a un tamaño permitido.'));
        } catch (error) { reject(error); }
      };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la foto. Prueba con JPG, PNG o WEBP.')); };
      image.src = url;
    });
  }
  /* Vista previa de la foto elegida, antes de enviarla */
  var previewUrl = '';
  function showReceiptPreview(file) {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
    if (file && /^image\//.test(file.type)) { previewUrl = URL.createObjectURL(file); $('fReceiptPreview').src = previewUrl; }
    else $('fReceiptPreview').removeAttribute('src');
    $('fReceiptPreview').hidden = !previewUrl;
  }
  $('fReceipt').addEventListener('change', function () {
    var file = this.files && this.files[0];
    fieldErr('fReceipt', '');
    $('fReceipt-status').textContent = file ? 'Foto seleccionada: ' + file.name : '';
    showReceiptPreview(file);
  });
  /* La foto enviada solo se guarda en memoria (no en localStorage, por su tamaño) */
  var sentProof = '';
  var COPY = { key: function () { var a = CUENTAS[S.acct || 0]; return a ? a.numero : ''; }, val: function () { return String(Math.round(payValue())); }, msg: function () { return S.order ? S.order.numero : ''; } };
  $('coStep2').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var txt = COPY[b.dataset.copy]();
    try { await navigator.clipboard.writeText(txt); } catch (x) {
      var t = document.createElement('textarea'); t.value = txt; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (y) { } t.remove();
    }
    b.textContent = 'Copiado'; toast('Copiado: ' + txt); setTimeout(function () { b.textContent = 'Copiar'; }, 1800);
  });
  $('refForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var file = $('fReceipt').files && $('fReceipt').files[0];
    if (!fieldErr('fReceipt', file ? '' : 'Sube la foto o captura del comprobante de pago.')) { $('fReceipt').focus(); return; }
    $('refBtn').disabled = true;
    try {
      $('fReceipt-status').textContent = 'Preparando y enviando la foto…';
      var comprobante = await receiptData(file);
      var result = await api('/api/track', { numero: S.order.numero, ultimos4: S.order.ultimos4, reportarPago: true, comprobante: comprobante });
      sentProof = comprobante;
      S.order.comprobante = result.comprobanteRecibido;
      S.order.step = 'reportado'; store.set(K_ORDER, S.order);
      MP.stale = true;
      renderDone(); showStep(3); $('doneTitle').focus();
    } catch (err) {
      $('fReceipt-status').textContent = err instanceof TypeError ? 'No hay conexión. Tu pedido está guardado; intenta enviar la foto de nuevo.' : err.message;
      if (err.status === 409) { S.order.step = 'reportado'; store.set(K_ORDER, S.order); renderDone(); showStep(3); }
    } finally { $('refBtn').disabled = false; }
  });
  function orderLinks(o) { var q = '?pedido=' + encodeURIComponent(o.numero) + '&c=' + encodeURIComponent(o.ultimos4); return { recibo: '/recibo.html' + q, seg: '/seguimiento.html' + q }; }
  function renderDone() {
    var o = S.order, l = orderLinks(o);
    $('doneNo').textContent = o.numero;
    var recoge = o.entrega === 'Recoger', saldo = o.pricing && o.pricing.saldoContraentrega != null ? o.pricing.saldoContraentrega : 0;
    $('doneTitle').textContent = o.step === 'pagado' ? '¡Pago aprobado!' : o.step === 'separado' && recoge ? '¡Te lo separamos!' : '¡Recibimos tu pedido!';
    if (o.step === 'pagado') $('doneTxt').textContent = 'Gracias, ' + o.nombre + '. Tu pago en línea fue aprobado y ya estamos preparando tu pedido' + (recoge ? ' para que lo recojas en la tienda' : ' para enviarlo') + '. Te escribimos por WhatsApp.';
    else if (o.step === 'separado') $('doneTxt').textContent = 'Gracias, ' + o.nombre + '. ' + (recoge ? 'Tu pedido queda separado a tu nombre. Pagas ' + money(saldo) + ' cuando lo recojas en la tienda.' : 'Tu pedido quedó registrado. Pagas ' + money(saldo) + ' al recibirlo.') + ' Te escribimos por WhatsApp cuando esté listo.';
    else $('doneTxt').textContent = 'Gracias, ' + o.nombre + '. Recibimos ' + (o.comprobante ? 'la foto del comprobante de tu pago' : 'tu pedido') + '. Cuando verifiquemos el pago, tu pedido pasa a “Pago confirmado” y te escribimos por WhatsApp.';
    $('doneReceipt').href = l.recibo;
    $('doneProof').hidden = !sentProof;
    if (sentProof) { $('doneProofImg').src = sentProof; $('doneProofDl').href = sentProof; $('doneProofDl').download = 'Comprobante-' + o.numero + '.jpg'; }
    $('doneWa').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola Punto Club, tengo una pregunta sobre mi pedido ' + o.numero);
    renderPushSlots();
  }
  $('doneClose').addEventListener('click', function () { finishOrder(); closeLayer($('coSheet')); });
  $('doneTrack').addEventListener('click', function () {
    var num = S.order ? S.order.numero : '';
    finishOrder(); closeLayer($('coSheet'), false, true);
    openOrders(num, true);
  });
  function finishOrder() { S.order = null; sentProof = ''; store.del(K_ORDER); paying(false); renderResume(); }

  /* Mientras se paga: sin "jalar para recargar" y aviso antes de cerrar o recargar */
  var isPaying = false;
  function paying(on) { isPaying = !!on; document.documentElement.classList.toggle('paying', isPaying); }
  window.addEventListener('beforeunload', function (e) {
    var formOpen = stack.indexOf($('coSheet')) > -1 && !$('coStep1').hidden && $('fNombre').value;
    if (isPaying || formOpen) { e.preventDefault(); e.returnValue = ''; return ''; }
  });
  function confirmLeavePayment() {
    if (!isPaying) return true;
    return window.confirm('¿Salir del pago? Tu pedido ' + S.order.numero + ' queda guardado y puedes volver a esta pantalla desde el aviso de arriba.');
  }
  function afterCheckoutClosed() { paying(false); renderResume(); }

  /* Aviso para retomar un pedido pendiente */
  function renderResume() {
    var bar = $('resumeBar'), o = S.order;
    renderInstall();
    if (!o || stack.indexOf($('coSheet')) > -1) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = '<div class="wrap"><span><b>Pedido ' + esc(o.numero) + '</b> · ' + (o.step === 'pago' ? 'pendiente de pago' : o.step === 'pagado' ? 'pago aprobado' : o.step === 'separado' ? (o.entrega === 'Recoger' ? 'separado' : 'registrado') : 'pago reportado') + '</span>' +
      '<button type="button" class="btn btn-lime" id="resumeBtn">' + (o.step === 'pago' ? 'Continuar con el pago' : 'Ver pedido') + '</button>' +
      '<button type="button" class="link-btn" id="resumeX">' + (o.step === 'pago' ? 'Ya no lo quiero' : 'Cerrar') + '</button></div>';
    $('resumeBtn').addEventListener('click', function () { resumeOrder(); });
    $('resumeX').addEventListener('click', function () {
      if (o.step === 'pago' && !confirm('Se quitará el aviso de este navegador. Si ya pagaste, no lo hagas: escríbenos por WhatsApp con el número ' + o.numero + '. ¿Quitar el aviso?')) return;
      finishOrder();
    });
  }
  function resumeOrder(replace) {
    if (!S.order) return;
    $('payTitle').setAttribute('tabindex', '-1');
    if (S.order.step === 'pago') { renderPayment(); showStep(2); openLayer($('coSheet'), $('payTitle'), replace === true); }
    else { renderDone(); showStep(3); openLayer($('coSheet'), $('doneTitle'), replace === true); }
    renderResume();
  }

  /* ---------------- datos de envío recordados (solo en este dispositivo) ---------------- */
  function prefillProfile() {
    var p = store.get(K_PERFIL); if (!p) return;
    // Los datos guardados antes del envío nacional eran de Quibdó: solo se reusa la dirección si ya trae ciudad
    var map = { fNombre: 'nombre', fTel: 'telefono', fCed: 'cedula', fCorreo: 'correo' };
    if (p.ciudad) { map.fDir = 'direccion'; map.fBarrio = 'barrio'; map.fCiudad = 'ciudad'; }
    Object.keys(map).forEach(function (id) { if (!$(id).value.trim() && p[map[id]]) $(id).value = p[map[id]]; });
    if (p.departamento && !$('fDepto').value && DEPTOS.indexOf(p.departamento) > -1) $('fDepto').value = p.departamento;
  }

  /* ---------------- opiniones de clientes ----------------
     En cada producto: promedio, cómo queda la talla, si llegó bien y las opiniones con fotos.
     Solo opinan compradores con el pedido Entregado (desde "Mis pedidos"). */
  var REV = {};          // opiniones ya cargadas por producto (por esta visita)
  var AJUSTE_TXT = { pequena: 'Queda pequeña', justa: 'Talla justa', grande: 'Queda grande' };
  function starsHTML(n, cls) {
    var r = Math.round(Number(n) * 2) / 2, h = '';
    for (var i = 1; i <= 5; i++) h += '<svg class="' + (Math.round(Number(n)) >= i ? 'on' : '') + '" aria-hidden="true"><use href="#i-star"/></svg>';
    return '<span class="stars' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + String(r).replace('.', ',') + ' de 5 estrellas">' + h + '</span>';
  }
  async function loadReviews(pid) {
    var box = $('pdReviews'); if (!box) return;
    if (REV[pid]) { renderReviews(pid); return; }
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = '<h4 id="pdRevT">Opiniones</h4><p class="rv-empty">Cargando opiniones…</p>';
    try { REV[pid] = await api('/api/opiniones?producto=' + encodeURIComponent(pid)); }
    catch (e) { REV[pid] = null; box.innerHTML = '<h4 id="pdRevT">Opiniones</h4><p class="rv-empty">No pudimos cargar las opiniones ahora.</p>'; box.removeAttribute('aria-busy'); return; }
    if (S.sel && S.sel.p && S.sel.p.id === pid) renderReviews(pid);
  }
  function renderReviews(pid) {
    var box = $('pdReviews'), d = REV[pid]; if (!box || !d) return;
    box.removeAttribute('aria-busy');
    var r = d.resumen || {}, list = d.opiniones || [];
    if (!r.total) {
      box.innerHTML = '<h4 id="pdRevT">Opiniones</h4><p class="rv-empty">Todavía no hay opiniones de este modelo. Si lo compraste, opina desde <button type="button" class="link-btn" data-open-orders>Mis pedidos</button> cuando te llegue.</p>';
      return;
    }
    var aj = r.ajuste || {}, ajTot = (aj.pequena || 0) + (aj.justa || 0) + (aj.grande || 0);
    var ajTop = ajTot ? ['justa', 'pequena', 'grande'].sort(function (a, b) { return (aj[b] || 0) - (aj[a] || 0); })[0] : '';
    var dist = (r.distribucion || []).map(function (n, i) { return { e: i + 1, n: n }; }).reverse();
    box.innerHTML = '<h4 id="pdRevT">Opiniones <span>(' + r.total + ')</span></h4>' +
      '<div class="rv-sum"><div class="rv-avg"><b>' + String(r.promedio).replace('.', ',') + '</b>' + starsHTML(r.promedio) + '<small>' + r.total + (r.total === 1 ? ' opinión' : ' opiniones') + '</small></div>' +
      '<ul class="rv-bars" aria-label="Opiniones por estrellas">' + dist.map(function (x) { var pct = r.total ? Math.round(x.n / r.total * 100) : 0; return '<li><span>' + x.e + '★</span><i aria-hidden="true"><b style="--w:' + pct + '%"></b></i><span>' + x.n + '</span></li>'; }).join('') + '</ul></div>' +
      '<div class="rv-facts">' + (ajTop ? '<span>👟 <b>' + Math.round((aj[ajTop] || 0) / ajTot * 100) + '%</b> dice: ' + AJUSTE_TXT[ajTop].toLowerCase() + '</span>' : '') +
      (r.llegoBien != null ? '<span>📦 <b>' + r.llegoBien + '%</b> le llegó en buen estado</span>' : '') + '</div>' +
      '<ul class="rv-list">' + list.map(reviewHTML).join('') + '</ul>';
  }
  /* Cada opinión muestra SOLO: nombre corto, estrellas, comentario y sus fotos o video */
  function reviewHTML(o) {
    var vid = safeHttps(o.video);
    return '<li class="rv"><div class="rv__top">' + starsHTML(o.rating) + '<span class="rv__ok"><svg aria-hidden="true"><use href="#i-check"/></svg>Compra verificada</span></div>' +
      '<p class="rv__who"><b>' + esc(o.nombre) + '</b></p>' +
      '<p class="rv__txt">' + esc(o.comentario) + '</p>' +
      (vid ? '<video class="rv__video" src="' + esc(vid) + '" controls playsinline preload="metadata" aria-label="Video de ' + esc(o.nombre) + '"></video>' : '') +
      ((o.fotos || []).length ? '<div class="rv__pics">' + o.fotos.map(function (u, i) { var s = safeHttps(u); return s ? '<a href="' + esc(s) + '" target="_blank" rel="noopener"><img src="' + esc(s) + '" alt="Foto ' + (i + 1) + ' de ' + esc(o.nombre) + '" loading="lazy" decoding="async"></a>' : ''; }).join('') + '</div>' : '') +
      (o.respuesta ? '<div class="rv__reply"><b>Respuesta de Punto Club</b><p>' + esc(o.respuesta) + '</p></div>' : '') + '</li>';
  }
  function safeHttps(u) { u = String(u || ''); return u.indexOf('https://') === 0 && !/[\s"'<>]/.test(u) ? u : ''; }

  /* --- Formulario de opinión (dentro del detalle de un pedido entregado en "Mis pedidos") --- */
  var revFotos = [];   // fotos ya reducidas, listas para enviar
  var revVideo = null; // archivo de video elegido (se sube directo a Supabase al publicar)
  var VID_TIPOS = ['video/mp4', 'video/quicktime', 'video/webm'];
  /* Sube el video con el permiso temporal del servidor, mostrando el porcentaje */
  function subirVideo(url, file, onPct) {
    return new Promise(function (ok, no) {
      var x = new XMLHttpRequest(), fd = new FormData();
      fd.append('cacheControl', '3600'); fd.append('', file);
      x.open('PUT', url); x.setRequestHeader('x-upsert', 'false');
      x.upload.onprogress = function (e) { if (e.lengthComputable) onPct(Math.round(e.loaded / e.total * 100)); };
      x.onload = function () { x.status >= 200 && x.status < 300 ? ok() : no(new Error('No se pudo subir el video (' + x.status + '). Intenta de nuevo o publica sin video.')); };
      x.onerror = function () { no(new Error('Se cortó la conexión subiendo el video. Intenta de nuevo con buena señal.')); };
      x.send(fd);
    });
  }
  function reviewSecHTML(o) {
    if (o.status !== 'Entregado' || !Array.isArray(o.opinados)) return '';
    var pend = o.items.filter(function (i) { return o.opinados.indexOf(i.id) < 0; });
    return '<section class="od-sec od-rev"><h4>¿Cómo te llegó?</h4>' +
      (pend.length ? '<p class="hint">Tu opinión ayuda a otros a elegir talla y modelo. Se publica solo con tu nombre corto.</p>' : '<p class="hint">¡Gracias por opinar! Tu opinión ya se ve en la tienda.</p>') +
      o.items.map(function (i) {
        var done = o.opinados.indexOf(i.id) > -1;
        return '<div class="od-item"><span class="oc__th">' + itemArt(i) + '</span><div><b>' + esc(i.brand + ' ' + i.name) + '</b><small>Talla ' + esc(i.size) + (i.color ? ' · ' + esc(i.color) : '') + '</small></div>' +
          (done ? '<span class="rv-done"><svg aria-hidden="true"><use href="#i-check"/></svg>Opinaste</span>' : '<button type="button" class="btn btn-lime btn-sm" data-review="' + esc(o.numero) + '|' + esc(i.id) + '"><svg aria-hidden="true"><use href="#i-star"/></svg>Opinar</button>') + '</div>';
      }).join('') + '<div id="revFormBox"></div></section>';
  }
  function starInput(name, label, req) {
    var h = '<fieldset class="rv-in"><legend>' + label + (req ? ' *' : '') + '</legend><div class="rv-stars">';
    for (var i = 5; i >= 1; i--) h += '<input type="radio" id="' + name + i + '" name="' + name + '" value="' + i + '"' + (req ? ' required' : '') + '><label for="' + name + i + '" title="' + i + (i === 1 ? ' estrella' : ' estrellas') + '"><svg aria-hidden="true"><use href="#i-star"/></svg><span class="sr-only">' + i + (i === 1 ? ' estrella' : ' estrellas') + '</span></label>';
    return h + '</div></fieldset>';
  }
  function chips(name, legend, opts) {
    return '<fieldset class="rv-in"><legend>' + legend + '</legend><div class="rv-chips">' + opts.map(function (o) {
      return '<label><input type="radio" name="' + name + '" value="' + o[0] + '"><span>' + o[1] + '</span></label>';
    }).join('') + '</div></fieldset>';
  }
  function openReviewForm(key) {
    var parts = key.split('|'), o = MP.list.find(function (x) { return x.numero === parts[0]; }); if (!o) return;
    var it = o.items.find(function (i) { return String(i.id) === parts[1]; }); if (!it) return;
    revFotos = []; revVideo = null;
    var box = $('revFormBox'); if (!box) return;
    box.innerHTML = '<form id="revForm" class="rv-form" novalidate data-num="' + esc(o.numero) + '" data-pid="' + esc(it.id) + '">' +
      '<h5>Tu opinión de ' + esc(it.brand + ' ' + it.name) + '</h5>' +
      starInput('rvRating', 'Calificación general', true) +
      chips('rvBien', '¿Llegó en buen estado?', [['si', 'Sí, perfecto'], ['no', 'Llegó con un problema']]) +
      chips('rvAjuste', '¿Cómo te quedó la talla?', [['pequena', 'Pequeña'], ['justa', 'Justa'], ['grande', 'Grande']]) +
      starInput('rvEnvio', 'Rapidez del envío') + starInput('rvCalidad', 'Calidad del zapato') +
      '<div class="field"><label for="rvTxt">Cuéntanos tu experiencia *</label><textarea id="rvTxt" maxlength="1000" rows="4" placeholder="¿Cómo te llegaron? ¿Qué tal la calidad y la comodidad?" aria-describedby="rvTxt-e"></textarea><p class="err" id="rvTxt-e" hidden></p></div>' +
      '<div class="field"><label for="rvPics">Fotos de tus zapatos (opcional, máximo 3)</label><input id="rvPics" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="rvPics-h"><p class="hint" id="rvPics-h">Se reducen antes de enviarse. No subas fotos con tu cara, documentos o direcciones.</p><div class="rv-prev" id="rvPrev"></div></div>' +
      '<div class="field"><label for="rvVid">Video (opcional)</label><input id="rvVid" type="file" accept="video/mp4,video/quicktime,video/webm" aria-describedby="rvVid-h"><p class="hint" id="rvVid-h">MP4, MOV o WEBM, máximo 30 MB (unos 20 a 30 segundos). Muestra cómo te quedaron, sin datos personales.</p><div class="rv-vprev" id="rvVPrev"></div></div>' +
      '<label class="consent"><input type="checkbox" id="rvOk"><span>Autorizo publicar esta opinión, mis fotos y mi video en la tienda con mi nombre corto (<b>' + esc(nombreCorto(o.nombre)) + '</b>). *</span></label>' +
      '<p class="form-err" id="rvErr" role="alert" hidden></p>' +
      '<div class="rv-actions"><button type="submit" class="btn btn-primary" id="rvBtn">Publicar opinión</button><button type="button" class="btn btn-light" data-review-cancel>Cancelar</button></div></form>';
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(function () { var f = $('rvRating5'); if (f) f.focus({ preventScroll: true }); }, 350);
  }
  function nombreCorto(n) { var p = String(n || '').trim().split(/\s+/); return p[0] ? p[0] + (p.length > 1 ? ' ' + p[p.length - 1].charAt(0) + '.' : '') : 'Cliente'; }
  function renderRevPrev() {
    var p = $('rvPrev'); if (!p) return;
    p.innerHTML = revFotos.map(function (src, i) { return '<span><img src="' + src + '" alt="Foto ' + (i + 1) + ' elegida"><button type="button" data-rmpic="' + i + '" aria-label="Quitar foto ' + (i + 1) + '">×</button></span>'; }).join('');
  }
  $('ordersSheet').addEventListener('change', function (e) {
    if (e.target.id !== 'rvVid') return;
    var f = e.target.files && e.target.files[0];
    var vp = $('rvVPrev'); if (vp && vp.querySelector('video')) URL.revokeObjectURL(vp.querySelector('video').src);
    revVideo = null; if (vp) vp.innerHTML = '';
    if (!f) return;
    if (VID_TIPOS.indexOf(f.type) < 0) { toast('El video debe ser MP4, MOV o WEBM'); e.target.value = ''; return; }
    if (f.size > 30 * 1024 * 1024) { toast('El video pesa ' + Math.round(f.size / 1048576) + ' MB. El máximo es 30 MB: grábalo más corto.'); e.target.value = ''; return; }
    revVideo = f;
    vp.innerHTML = '<video src="' + URL.createObjectURL(f) + '" controls playsinline muted preload="metadata"></video><button type="button" class="link-btn" data-rmvid>Quitar video</button>';
  });
  $('ordersSheet').addEventListener('change', async function (e) {
    if (e.target.id !== 'rvPics') return;
    var files = [].slice.call(e.target.files || []), room = 3 - revFotos.length;
    if (files.length > room) toast('Puedes subir máximo 3 fotos');
    for (var i = 0; i < Math.min(room, files.length); i++) {
      try { revFotos.push(await receiptData(files[i], 700 * 1024, 1280)); } catch (x) { toast(x.message || 'No pudimos usar una de las fotos'); }
    }
    e.target.value = ''; renderRevPrev();
  });
  $('ordersSheet').addEventListener('click', function (e) {
    var rv = e.target.closest('[data-review]');
    if (rv) { openReviewForm(rv.dataset.review); return; }
    if (e.target.closest('[data-review-cancel]')) { var b = $('revFormBox'); if (b) b.innerHTML = ''; revFotos = []; revVideo = null; return; }
    if (e.target.closest('[data-rmvid]')) { revVideo = null; $('rvVPrev').innerHTML = ''; $('rvVid').value = ''; return; }
    var rm = e.target.closest('[data-rmpic]');
    if (rm) { revFotos.splice(Number(rm.dataset.rmpic), 1); renderRevPrev(); }
  });
  $('ordersSheet').addEventListener('submit', async function (e) {
    if (e.target.id !== 'revForm') return;
    e.preventDefault();
    var f = e.target, val = function (n) { var r = f.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ''; };
    var txt = $('rvTxt').value.trim(), msg = '';
    if (!val('rvRating')) msg = 'Elige de 1 a 5 estrellas en la calificación general.';
    else if (txt.length < 10) { fieldErr('rvTxt', 'Cuéntanos un poco más (mínimo 10 letras).'); $('rvTxt').focus(); return; }
    else if (!$('rvOk').checked) msg = 'Marca la autorización para poder publicar tu opinión.';
    fieldErr('rvTxt', '');
    if (msg) { $('rvErr').textContent = msg; $('rvErr').hidden = false; return; }
    $('rvErr').hidden = true;
    var o = MP.list.find(function (x) { return x.numero === f.dataset.num; }); if (!o) return;
    var btn = $('rvBtn'); btn.disabled = true; btn.textContent = revFotos.length ? 'Subiendo fotos…' : 'Publicando…';
    try {
      var rutaVideo = '';
      if (revVideo) {
        btn.textContent = 'Preparando el video…';
        var perm = await api('/api/opiniones', { accion: 'video', numero: o.numero, ultimos4: o.ultimos4, productId: f.dataset.pid, tipo: revVideo.type, tamano: revVideo.size });
        await subirVideo(perm.url, revVideo, function (p) { btn.textContent = 'Subiendo video… ' + p + '%'; });
        rutaVideo = perm.ruta; btn.textContent = 'Publicando…';
      }
      await api('/api/opiniones', { video: rutaVideo,
        numero: o.numero, ultimos4: o.ultimos4, productId: f.dataset.pid, autorizo: true,
        rating: Number(val('rvRating')), envio: Number(val('rvEnvio')) || null, calidad: Number(val('rvCalidad')) || null,
        llegoBien: val('rvBien') ? val('rvBien') === 'si' : null, tallaAjuste: val('rvAjuste') || null,
        comentario: txt, fotos: revFotos
      });
      (o.opinados = o.opinados || []).push(f.dataset.pid);
      delete REV[f.dataset.pid]; revFotos = []; revVideo = null;
      saveMis(); renderOrderDetail(o.numero, true);
      toast('¡Gracias! Tu opinión ya está publicada ⭐');
    } catch (err) {
      if (err.status === 409 && /Ya opinaste/.test(err.message)) { (o.opinados = o.opinados || []).push(f.dataset.pid); renderOrderDetail(o.numero, true); }
      $('rvErr').textContent = err instanceof TypeError ? 'Sin conexión. Revisa tu internet e intenta de nuevo.' : err.message; $('rvErr').hidden = false;
      btn.disabled = false; btn.textContent = 'Publicar opinión';
    }
  });

  /* ---------------- favoritos ---------------- */
  var favs = (store.get(K_FAV) || []).filter(function (x) { return typeof x === 'string'; }).slice(0, 100);
  function isFav(id) { return favs.indexOf(id) > -1; }
  function toggleFav(id) {
    var i = favs.indexOf(id), on = i < 0;
    if (on) favs.unshift(id); else favs.splice(i, 1);
    store.set(K_FAV, favs); syncFavUI();
    if (on && navigator.vibrate) try { navigator.vibrate(8); } catch (e) { }
    return on;
  }
  function favProducts() { return favs.map(function (id) { return S.products.find(function (p) { return p.id === id; }); }).filter(Boolean); }
  function syncFavUI() {
    var n = S.loaded ? favProducts().length : favs.length;
    [$('favBadge'), $('bnFavBadge')].forEach(function (b) { b.textContent = n; b.hidden = !n; });
    document.querySelectorAll('[data-fav]').forEach(function (b) {
      var on = isFav(b.dataset.fav);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('use').setAttribute('href', on ? '#i-heart-on' : '#i-heart');
    });
    if (S.sel) {
      var on = isFav(S.sel.p.id);
      $('pdFav').setAttribute('aria-pressed', String(on));
      $('pdFav').setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Guardar en favoritos');
      $('pdFav').innerHTML = '<svg aria-hidden="true"><use href="#' + (on ? 'i-heart-on' : 'i-heart') + '"/></svg>';
    }
    if (stack.indexOf($('favSheet')) > -1) renderFavs();
  }
  function renderFavs() {
    var list = favProducts();
    $('favCount').textContent = list.length ? list.length + (list.length === 1 ? ' modelo guardado' : ' modelos guardados') : '';
    $('favList').innerHTML = list.length ? '<div class="grid grid--sheet">' + list.map(cardHTML).join('') + '</div>' :
      '<div class="empty-state"><span class="empty-state__ico"><svg aria-hidden="true"><use href="#i-heart"/></svg></span><h3>Aún no tienes favoritos</h3><p>Toca el corazón de cualquier modelo para guardarlo aquí y encontrarlo rápido.</p><button type="button" class="btn btn-primary" data-go-shop>Explorar el catálogo</button></div>';
  }
  function openFavs() { renderFavs(); openLayer($('favSheet')); }
  $('favBtn').addEventListener('click', openFavs);
  $('favList').addEventListener('click', function (e) { if (e.target.closest('[data-go-shop]')) { closeLayer($('favSheet')); goShop(); } });

  /* ---------------- mis pedidos (guardados automáticamente, sin cuenta) ---------------- */
  function clienteId() {
    var c = store.get(K_CLIENTE);
    if (c && typeof c.id === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(c.id)) return c.id;
    var a = new Uint8Array(18);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var k = 0; k < a.length; k++) a[k] = Math.floor(Math.random() * 256);
    var id = btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    store.set(K_CLIENTE, { id: id, at: Date.now() });
    return id;
  }
  var misSaved = store.get(K_MIS) || {};
  var MP = {
    list: Array.isArray(misSaved.cache) ? misSaved.cache : [],
    extra: Array.isArray(misSaved.extra) ? misSaved.extra.filter(function (x) { return x && x.numero && x.ultimos4; }) : [],
    tab: 'todos', open: '', loading: false, fetchedAt: 0, stale: false, err: '', changed: {}
  };
  /* ---------------- avisos del pedido en el celular (web push) ----------------
     El cliente los activa una vez; luego le llega una notificación con cada cambio
     (pago confirmado, en preparación, enviado con guía, entregado), aunque la app esté cerrada. */
  var K_AVISOS = 'kairo.avisos.v1', PUSH_KEY = '';
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  // 'on' | 'off' | 'denied' | 'ios' (iPhone sin instalar la app) | 'na' (no disponible)
  function pushState() {
    if (!PUSH_KEY) return 'na';
    if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios' : 'na';
    if (Notification.permission === 'denied') return 'denied';
    return store.get(K_AVISOS) && Notification.permission === 'granted' ? 'on' : 'off';
  }
  function b64ToBytes(k) {
    var s = atob((k + '==='.slice((k.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function pushSig() { return MP.extra.map(function (x) { return x.numero; }).sort().join(',') + '|' + ((store.get(K_CLIENTE) || {}).id ? 1 : 0); }
  function swReady() { return Promise.race([navigator.serviceWorker.ready, new Promise(function (_, no) { setTimeout(function () { no(new Error('sw')); }, 8000); })]); }
  var pushBusy = false;
  async function enablePush(quiet) {
    if (pushBusy) return; pushBusy = true;
    try {
      var perm = Notification.permission === 'granted' ? 'granted' : quiet ? Notification.permission : await Notification.requestPermission();
      if (perm !== 'granted') { if (!quiet) toast(perm === 'denied' ? 'Bloqueaste los avisos. Puedes activarlos en los ajustes del navegador.' : 'Los avisos quedaron sin activar.'); return; }
      var reg = await swReady();
      var sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(PUSH_KEY) });
      await api('/api/push', { accion: 'suscribir', sub: sub.toJSON(), cliente: (store.get(K_CLIENTE) || {}).id ? clienteId() : '', pedidos: MP.extra });
      store.set(K_AVISOS, { at: Date.now(), sig: pushSig() });
      if (!quiet) toast('¡Listo! Te avisaremos en este celular cada vez que tu pedido avance.');
    } catch (e) {
      if (!quiet) toast(e && e.status ? e.message : 'No pudimos activar los avisos en este navegador.');
    } finally { pushBusy = false; renderPushSlots(); }
  }
  async function disablePush() {
    try {
      var reg = await swReady(), sub = await reg.pushManager.getSubscription();
      if (sub) { api('/api/push', { accion: 'quitar', endpoint: sub.endpoint }).catch(function () { }); await sub.unsubscribe(); }
    } catch (e) { }
    store.del(K_AVISOS); toast('Avisos desactivados en este celular'); renderPushSlots();
  }
  /* Con la tienda abierta, el aviso que llega por push suena con una campanita y actualiza "Mis pedidos".
     (Con la app cerrada, suena el sonido normal de notificaciones del celular.) */
  var chimeCtx = null;
  ['pointerdown', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!chimeCtx && C) { try { chimeCtx = new C(); } catch (e) { } }
      if (chimeCtx && chimeCtx.state === 'suspended') chimeCtx.resume().catch(function () { });
    }, { capture: true, passive: true });
  });
  function chime() {
    var c = chimeCtx; if (!c || c.state !== 'running') return;
    var t0 = c.currentTime + 0.03;
    [[988, 0], [1319, 0.14], [1568, 0.28]].forEach(function (n) {
      var o = c.createOscillator(), g = c.createGain(), s = t0 + n[1];
      o.type = 'sine'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.35, s + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.7);
      o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + 0.75);
    });
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
    if (!e.data || e.data.tipo !== 'push' || e.data.admin) return;
    chime();
    if (navigator.vibrate) { try { navigator.vibrate([150, 60, 150]); } catch (x) { } }
    fetchOrders();
  });
  // Si ya estaban activos y el cliente agregó pedidos nuevos, se actualiza la suscripción en silencio
  function syncPush() { var a = store.get(K_AVISOS); if (pushState() === 'on' && (!a || a.sig !== pushSig())) enablePush(true); }
  function pushCardHTML(compact) {
    var st = pushState();
    if (st === 'on') return '<p class="push-on"><svg aria-hidden="true"><use href="#i-bell"/></svg><span>Avisos activados en este celular</span><button type="button" class="link-btn" data-push-off>Desactivar</button></p>';
    if (st === 'off') return '<div class="push-card' + (compact ? ' push-card--compact' : '') + '"><span class="push-card__ico" aria-hidden="true"><svg><use href="#i-bell"/></svg></span><div><b>Te avisamos cada paso</b><p>Recibe una notificación cuando confirmemos tu pago, despachemos tu pedido y te enviemos la guía.</p></div><button type="button" class="btn btn-lime btn-sm" data-push-on>Activar avisos</button></div>';
    if (st === 'denied') return '<p class="push-off">Los avisos están bloqueados en este navegador. Actívalos en los ajustes del sitio si quieres recibirlos.</p>';
    if (st === 'ios') return '<p class="push-off"><svg aria-hidden="true"><use href="#i-bell"/></svg><span>En iPhone, para recibir avisos de tu pedido instala la app: toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.</span></p>';
    return '';
  }
  function renderPushSlots() {
    document.querySelectorAll('[data-push-slot]').forEach(function (el) { el.innerHTML = pushCardHTML(el.hasAttribute('data-compact')); });
    var dp = $('donePush'); if (dp) dp.innerHTML = pushCardHTML(true);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-push-on]')) enablePush(false);
    else if (e.target.closest('[data-push-off]')) disablePush();
    var cg = e.target.closest('[data-copy-guia]');
    if (cg) {
      var g = cg.getAttribute('data-copy-guia');
      (navigator.clipboard ? navigator.clipboard.writeText(g) : Promise.reject()).then(function () { toast('Guía ' + g + ' copiada'); cg.classList.add('copied'); setTimeout(function () { cg.classList.remove('copied'); }, 1600); }, function () { window.prompt('Copia tu número de guía:', g); });
    }
  });

  function saveMis() { store.set(K_MIS, { extra: MP.extra.slice(0, 25), cache: MP.list.slice(0, 30), at: Date.now() }); }
  function rememberOrder(numero, ultimos4) {
    if (!numero || !/^\d{4}$/.test(ultimos4 || '')) return;
    MP.extra = MP.extra.filter(function (x) { return x.numero !== numero; });
    MP.extra.unshift({ numero: numero, ultimos4: ultimos4 });
    MP.stale = true; saveMis();
  }
  function hasHistory() { return MP.list.length || MP.extra.length || !!(store.get(K_CLIENTE) || {}).id; }

  var TABS = [['todos', 'Todos'], ['pagar', 'Por pagar'], ['proceso', 'En proceso'], ['enviado', 'Enviados'], ['entregado', 'Entregados']];
  function stage(o) {
    if (o.status === 'Cancelado') return 'cancelado';
    if (o.status === 'Recibido') return o.pagoReportado || o.pago === 'En tienda' || (o.pricing && o.pricing.pagarAhora === 0) ? 'proceso' : 'pagar';
    if (o.status === 'Enviado') return 'enviado';
    if (o.status === 'Entregado') return 'entregado';
    return 'proceso';
  }
  var STAGE_TXT = { pagar: 'Por pagar', proceso: 'En proceso', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
  function isActive(o) { var s = stage(o); return s !== 'entregado' && s !== 'cancelado'; }
  function fmtShort(d) { return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtTime(d) { return new Date(d).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
  function itemArt(i) {
    var p = S.products.find(function (x) { return x.id === i.id; });
    if (p) return art(p, '', (p.colors || []).find(function (c) { return c.n === i.color; }));
    var img = safeUrl(i.image);
    return img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' : '<svg viewBox="0 0 260 140" style="color:#1d2733" aria-hidden="true"><use href="#s-low"/></svg>';
  }
  function progress(o) {
    if (o.status === 'Cancelado') return 0;
    var done = (o.steps || []).filter(function (s) { return s.state === 'done' || s.state === 'current'; }).length;
    return Math.round(done / Math.max(1, (o.steps || []).length) * 100);
  }
  var PAGO_TXT = { Wompi: 'En línea (Wompi)', Nequi: 'Transferencia o QR', Contraentrega: 'Contraentrega', 'En tienda': 'Al recoger en la tienda' };
  function stageHint(o) {
    var s = stage(o);
    if (s === 'pagar' && o.pago === 'Wompi') return 'Paga ' + money(o.pricing.pagarAhora) + ' en línea para confirmarlo.';
    if (s === 'pagar') return o.pago === 'Contraentrega' ? 'Paga ' + money(o.pricing.pagarAhora) + ' del domicilio por transferencia o QR para confirmarlo.' : 'Paga ' + money(o.pricing.pagarAhora) + ' por transferencia o QR para confirmarlo.';
    if (s === 'proceso' && o.status === 'Recibido' && o.pago === 'En tienda') return 'Separado. Pagas ' + money(o.pricing.saldoContraentrega) + ' al recogerlo en la tienda.';
    if (s === 'proceso' && o.status === 'Recibido' && !o.pagoReportado) return 'Recibimos tu pedido. Pagas ' + money(o.pricing.saldoContraentrega) + ' al recibirlo.';
    if (s === 'proceso' && o.status === 'Recibido') return 'Recibimos tu comprobante. Lo estamos verificando.';
    if (s === 'proceso') return o.statusLabel + '. Te avisamos cuando salga.';
    if (s === 'enviado') return o.guia ? 'Guía ' + o.guia + (o.transportadora ? ' · ' + o.transportadora : '') : 'Tu pedido va en camino.';
    if (s === 'entregado') return Array.isArray(o.opinados) && o.opinados.length < o.items.length ? '¡Entregado! Cuéntanos cómo te llegaron ⭐' : '¡Entregado! Esperamos que lo disfrutes.';
    return 'Este pedido fue cancelado.';
  }
  function updOrdBadge() {
    var n = MP.list.filter(isActive).length;
    var b = $('bnOrdBadge'); b.textContent = n; b.hidden = !n;
  }

  async function fetchOrders(addedNum) {
    if (MP.loading) return;
    MP.loading = true; MP.err = '';
    if (stack.indexOf($('ordersSheet')) > -1 && !MP.open) renderOrders();
    $('ordRefresh').classList.add('spin');
    try {
      var d = await api('/api/mis-pedidos', { cliente: (store.get(K_CLIENTE) || {}).id ? clienteId() : '', extra: MP.extra });
      var invalid = d.invalid || [];
      MP.extra = MP.extra.filter(function (x) { return invalid.indexOf(x.numero) < 0; });
      var antes = {}; MP.list.forEach(function (o) { antes[o.numero] = o.status + '|' + (o.guia || ''); });
      MP.list = d.orders || []; MP.fetchedAt = Date.now(); MP.stale = false;
      var cambios = MP.list.filter(function (o) { return antes[o.numero] && antes[o.numero] !== o.status + '|' + (o.guia || ''); });
      cambios.forEach(function (o) { MP.changed[o.numero] = 1; });
      if (cambios.length === 1) toast('Tu pedido ' + cambios[0].numero + ': ' + cambios[0].statusLabel + (cambios[0].guia && cambios[0].status === 'Enviado' ? ' · guía ' + cambios[0].guia : ''));
      else if (cambios.length > 1) toast(cambios.length + ' de tus pedidos tienen novedades');
      saveMis();
      if (addedNum && invalid.indexOf(addedNum) > -1) MP.err = 'No encontramos el pedido ' + addedNum + ' con esos 4 dígitos. Revisa los datos.';
      else if (addedNum) toast('Pedido ' + addedNum + ' agregado');
    } catch (e) {
      MP.err = e instanceof TypeError ? 'Sin conexión: te mostramos lo último que guardamos.' : e.message;
    } finally {
      MP.loading = false; $('ordRefresh').classList.remove('spin');
      updOrdBadge(); syncPush();
      if (stack.indexOf($('ordersSheet')) > -1) {
        // Si se pidió abrir un pedido (enlace o recién agregado) y ya llegó, se muestra su detalle
        var want = MP.pendingOpen; MP.pendingOpen = '';
        if (want && !MP.open && MP.list.some(function (o) { return o.numero === want; })) renderOrderDetail(want);
        else if (MP.open) renderOrderDetail(MP.open, true);
        else renderOrders();
      }
    }
  }

  function orderCardHTML(o) {
    var s = stage(o), n = o.items.reduce(function (t, i) { return t + (i.qty || 1); }, 0);
    var thumbs = o.items.slice(0, 4).map(function (i) { return '<span class="oc__th">' + itemArt(i) + '</span>'; }).join('') + (o.items.length > 4 ? '<span class="oc__th oc__more">+' + (o.items.length - 4) + '</span>' : '');
    return '<article class="oc oc--' + s + (MP.changed[o.numero] ? ' oc--changed' : '') + '">' +
      (MP.changed[o.numero] ? '<span class="oc__new">Novedad</span>' : '') +
      '<button type="button" class="oc__hit" data-ord="' + esc(o.numero) + '" aria-label="Ver detalle del pedido ' + esc(o.numero) + '"></button>' +
      '<div class="oc__top"><div><b>' + esc(o.numero) + '</b><small>' + esc(fmtShort(o.createdAt)) + ' · ' + n + (n === 1 ? ' producto' : ' productos') + '</small></div><span class="st st--' + s + '">' + STAGE_TXT[s] + '</span></div>' +
      '<div class="oc__thumbs" aria-hidden="true">' + thumbs + '</div>' +
      (s !== 'cancelado' ? '<div class="oc__bar" aria-hidden="true"><i style="--w:' + progress(o) + '%"></i></div>' : '') +
      '<p class="oc__hint">' + esc(stageHint(o)) + '</p>' +
      '<div class="oc__row"><span class="oc__total">Total <b>' + money(o.pricing.totalConEnvio) + '</b></span>' +
      (s === 'pagar' ? '<button type="button" class="btn btn-primary btn-sm" data-pay="' + esc(o.numero) + '">Pagar ahora</button>' : '<span class="oc__go">Ver detalle<svg aria-hidden="true"><use href="#i-arrow"/></svg></span>') +
      '</div></article>';
  }
  function renderOrders() {
    $('ordBack').hidden = true; $('ordDetail').hidden = true; $('ordList').hidden = false; $('ordTabs').hidden = false;
    $('ordTitle').textContent = 'Mis pedidos';
    var prof = store.get(K_PERFIL), name = (prof && prof.nombre ? prof.nombre.split(' ')[0] : '') || (MP.list[0] && MP.list[0].nombre) || '';
    $('ordHello').textContent = name ? 'Hola, ' + name : '';
    var counts = {}; MP.list.forEach(function (o) { var s = stage(o); counts[s] = (counts[s] || 0) + 1; });
    $('ordTabs').innerHTML = TABS.map(function (t) {
      var c = t[0] === 'todos' ? MP.list.length : counts[t[0]] || 0;
      return '<button type="button" role="tab" class="otab" data-tab="' + t[0] + '" aria-selected="' + (MP.tab === t[0]) + '">' + t[1] + (c ? ' <span>' + c + '</span>' : '') + '</button>';
    }).join('');
    var list = MP.list.filter(function (o) { return MP.tab === 'todos' || stage(o) === MP.tab; });
    var h = MP.err ? '<p class="ord-msg" role="alert">' + esc(MP.err) + '</p>' : '';
    if (MP.loading && !MP.list.length) h += '<div class="oc oc--skel" aria-hidden="true"></div><div class="oc oc--skel" aria-hidden="true"></div><p class="sr-only">Cargando tus pedidos…</p>';
    else if (!MP.list.length) h += '<div class="empty-state"><span class="empty-state__ico"><svg aria-hidden="true"><use href="#i-box"/></svg></span><h3>Aún no tienes pedidos</h3><p>Cuando compres, tu pedido aparece aquí automáticamente y puedes seguirlo paso a paso.</p><button type="button" class="btn btn-primary" data-go-shop>Ir a comprar</button></div>';
    else if (!list.length) h += '<p class="ord-empty">No tienes pedidos en “' + esc(TABS.filter(function (t) { return t[0] === MP.tab; })[0][1]) + '”.</p>';
    else h += list.map(orderCardHTML).join('');
    if (MP.list.some(isActive)) h = '<div data-push-slot data-compact>' + pushCardHTML(true) + '</div>' + h;
    h += '<details class="ord-add"' + (MP.err && /4 dígitos/.test(MP.err) ? ' open' : '') + '><summary>¿Compraste desde otro celular? Agrega tu pedido</summary>' +
      '<form id="ordAddForm" novalidate><div class="row2"><div class="field"><label for="oaNum">Número de pedido</label><input id="oaNum" autocapitalize="characters" autocomplete="off" maxlength="20" placeholder="PC-20261112-4821"></div>' +
      '<div class="field"><label for="oaCel">Últimos 4 del celular</label><input id="oaCel" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="2045"></div></div>' +
      '<p class="err" id="oaErr" hidden></p><button type="submit" class="btn btn-line btn-block">Agregar a mis pedidos</button></form></details>';
    $('ordList').innerHTML = h;
  }
  function renderOrderDetail(num, keepScroll) {
    var o = MP.list.find(function (x) { return x.numero === num; });
    if (!o) { MP.open = ''; renderOrders(); return; }
    MP.open = num; delete MP.changed[num];
    var s = stage(o), l = { recibo: '/recibo.html?pedido=' + encodeURIComponent(o.numero) + '&c=' + encodeURIComponent(o.ultimos4) };
    $('ordBack').hidden = false; $('ordTabs').hidden = true; $('ordList').hidden = true; $('ordDetail').hidden = false;
    $('ordTitle').textContent = 'Pedido ' + o.numero; $('ordHello').textContent = fmtShort(o.createdAt);
    var steps = (o.steps || []).map(function (st, i) {
      return '<li class="' + st.state + '" style="--i:' + i + '"><span class="dot" aria-hidden="true"></span><b>' + esc(st.label) + '</b>' + (st.at ? '<small>' + esc(fmtTime(st.at)) + '</small>' : '') +
        (st.state === 'current' ? '<span class="sr-only"> (estado actual)</span>' : st.state === 'done' ? '<span class="sr-only"> (completado)</span>' : '') + '</li>';
    }).join('');
    var p = o.pricing, items = o.items.map(function (i) {
      return '<div class="od-item"><span class="oc__th">' + itemArt(i) + '</span><div><b>' + esc(i.brand + ' ' + i.name) + '</b><small>Talla ' + esc(i.size) + (i.color ? ' · ' + esc(i.color) : '') + ' · ×' + i.qty + '</small></div><span>' + money(i.price * i.qty) + '</span></div>';
    }).join('');
    var wa = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola Punto Club, pregunto por mi pedido ' + o.numero);
    $('ordDetail').innerHTML =
      '<div class="od-hero od-hero--' + s + '">' + stageArt(s) + '<span class="st st--' + s + '">' + STAGE_TXT[s] + '</span><h3>' + esc(o.statusLabel) + '</h3><p>' + esc(stageHint(o)) + '</p>' +
      (s !== 'cancelado' ? '<div class="oc__bar"><i style="--w:' + progress(o) + '%"></i></div>' : '') +
      (s === 'pagar' ? '<button type="button" class="btn btn-lime btn-block" data-pay="' + esc(o.numero) + '">Pagar ' + money(p.pagarAhora) + (o.pago === 'Wompi' ? ' en línea' : '') + '</button>' : '') + '</div>' +
      (s !== 'cancelado' ? '<section class="od-sec"><h4>Seguimiento</h4><ol class="tl" aria-label="Estados del pedido">' + steps + '</ol></section>' : '') +
      shipCardHTML(o) +
      (isActive(o) ? '<div data-push-slot>' + pushCardHTML(false) + '</div>' : '') +
      reviewSecHTML(o) +
      (o.nota ? '<div class="od-note"><b>Mensaje de la tienda:</b> ' + esc(o.nota) + '</div>' : '') +
      (o.pagoReportado && o.pagoReportado.hasComprobante ? '<section class="od-sec" id="odProof"><h4>Tu comprobante</h4><p class="hint">Cargando…</p></section>' : '') +
      '<section class="od-sec"><h4>Productos</h4>' + items +
      '<div class="totals od-tot">' + (p.promoSavings ? '<div class="save"><span>Promociones</span><span>-' + money(p.promoSavings) + '</span></div>' : '') +
      (p.discount ? '<div class="save"><span>Cupón ' + esc(p.couponCode) + '</span><span>-' + money(p.discount) + '</span></div>' : '') +
      (p.envio != null ? '<div><span>' + (o.entrega === 'Recoger' ? 'Recoger en tienda' : o.entrega === 'Domicilio' ? 'Domicilio' : 'Envío nacional') + '</span><span>' + (p.envio ? money(p.envio) : 'Gratis') + '</span></div>' : '') +
      '<div class="grand"><span>Total</span><span>' + money(p.totalConEnvio) + '</span></div>' +
      ((o.pago === 'Contraentrega' || o.pago === 'En tienda') && p.saldoContraentrega ? '<div><span>' + (o.pago === 'En tienda' ? 'Pagas al recoger' : 'Pagas al recibir') + '</span><span>' + money(p.saldoContraentrega) + '</span></div>' : '') + '</div>' +
      '<button type="button" class="btn btn-line btn-block" data-rebuy="' + esc(o.numero) + '"><svg aria-hidden="true"><use href="#i-repeat"/></svg>Comprar de nuevo</button></section>' +
      '<section class="od-sec"><h4>Entrega</h4><dl class="od-dl"><div><dt>Recibe</dt><dd>' + esc(o.nombre) + '</dd></div><div><dt>' + (o.entrega === 'Recoger' ? 'Entrega' : 'Dirección') + '</dt><dd>' + (o.entrega === 'Recoger' ? 'Recoge en la tienda' : esc(o.direccion) + ', ' + esc(o.ciudad) + (o.departamento ? ', ' + esc(o.departamento) : '')) + '</dd></div><div><dt>Pago</dt><dd>' + esc(PAGO_TXT[o.pago] || o.pago) + '</dd></div><div><dt>Empaque</dt><dd>Sin caja</dd></div></dl></section>' +
      '<div class="od-actions"><a class="btn btn-primary" href="' + esc(l.recibo) + '">Ver y descargar recibo</a><a class="btn btn-wa" href="' + esc(wa) + '" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-wa"/></svg>Preguntar por WhatsApp</a></div>';
    if (!keepScroll) { $('ordDetail').scrollTop = 0; $('ordDetail').focus({ preventScroll: true }); }
    if (o.pagoReportado && o.pagoReportado.hasComprobante) loadProof(o);
  }
  /* Ilustración animada de la etapa (solo decorativa) */
  function stageArt(s) {
    var ico = { pagar: 'i-lock', proceso: 'i-box', enviado: 'i-truck', entregado: 'i-check' }[s];
    if (!ico) return '';
    return '<div class="od-anim od-anim--' + s + '" aria-hidden="true"><span class="od-anim__road"></span><span class="od-anim__ico"><svg><use href="#' + ico + '"/></svg></span>' +
      (s === 'entregado' ? '<span class="od-anim__ring"></span><span class="od-anim__ring od-anim__ring--2"></span>' : '') + '</div>';
  }
  /* Tarjeta de envío: transportadora, número de guía para copiar y enlace de rastreo */
  function shipCardHTML(o) {
    if (!o.guia) {
      if (o.entrega !== 'Nacional' || stage(o) === 'cancelado' || stage(o) === 'entregado') return '';
      return '<section class="od-ship od-ship--wait"><span class="od-ship__ico" aria-hidden="true"><svg><use href="#i-truck"/></svg></span><div><b>Número de guía</b><p>Aparece aquí cuando despachemos tu pedido' + (pushState() === 'on' ? ', y te avisamos al celular.' : '.') + '</p></div></section>';
    }
    var carrier = o.transportadora || 'la transportadora';
    return '<section class="od-ship" aria-labelledby="odShipT"><div class="od-ship__top"><span class="od-ship__ico" aria-hidden="true"><svg><use href="#i-truck"/></svg></span><div><small id="odShipT">Tu envío va con</small><b>' + esc(carrier) + '</b></div></div>' +
      '<div class="od-ship__guia"><div><small>Número de guía</small><b>' + esc(o.guia) + '</b></div><button type="button" class="od-ship__copy" data-copy-guia="' + esc(o.guia) + '" aria-label="Copiar el número de guía ' + esc(o.guia) + '"><svg aria-hidden="true"><use href="#i-copy"/></svg><span>Copiar</span></button></div>' +
      (String(o.rastreo || '').indexOf('https://') === 0 ? '<a class="btn btn-primary btn-block" href="' + esc(o.rastreo) + '" target="_blank" rel="noopener">Rastrear en ' + esc(o.transportadora || 'la transportadora') + '<svg aria-hidden="true"><use href="#i-arrow"/></svg></a><p class="od-ship__hint">Si te pide el número, pega la guía que copiaste.</p>'
        : '<p class="od-ship__hint">Copia la guía y búscala en la página de ' + esc(carrier) + ' para ver dónde va tu paquete.</p>') + '</section>';
  }
  async function loadProof(o) {
    try {
      var d = await api('/api/track', { numero: o.numero, ultimos4: o.ultimos4 });
      var box = $('odProof'); if (!box || MP.open !== o.numero) return;
      var pr = d.pagoReportado;
      box.innerHTML = pr && pr.comprobanteUrl ? '<h4>Tu comprobante</h4><a href="' + esc(pr.comprobanteUrl) + '" target="_blank" rel="noopener"><img class="proof-img" src="' + esc(pr.comprobanteUrl) + '" alt="Foto del comprobante de pago que enviaste"></a><a class="btn btn-line btn-block" href="' + esc(pr.comprobanteDescarga || pr.comprobanteUrl) + '">Descargar comprobante</a>' : '<h4>Tu comprobante</h4><p class="hint">Lo recibimos. No pudimos mostrarlo ahora.</p>';
    } catch (e) { var b = $('odProof'); if (b) b.innerHTML = '<h4>Tu comprobante</h4><p class="hint">Lo recibimos. No pudimos mostrarlo ahora.</p>'; }
  }
  function openOrders(num, replace) {
    MP.open = '';
    if (stack.indexOf($('ordersSheet')) < 0) openLayer($('ordersSheet'), $('ordersSheet').querySelector('[data-close]'), replace === true);
    if (num && MP.list.some(function (o) { return o.numero === num; })) renderOrderDetail(num);
    else { MP.pendingOpen = num || ''; renderOrders(); }
    if (MP.stale || MP.pendingOpen || Date.now() - MP.fetchedAt > 20e3) fetchOrders();
  }
  $('ordTabs').addEventListener('click', function (e) { var t = e.target.closest('[data-tab]'); if (!t) return; MP.tab = t.dataset.tab; renderOrders(); });
  $('ordBack').addEventListener('click', function () { MP.open = ''; renderOrders(); var b = $('ordList').querySelector('[data-ord]'); if (b) b.focus(); });
  $('ordRefresh').addEventListener('click', function () { fetchOrders(); });
  $('ordersSheet').addEventListener('click', function (e) {
    var pay = e.target.closest('[data-pay]');
    if (pay) { payOrder(pay.dataset.pay); return; }
    var rb = e.target.closest('[data-rebuy]');
    if (rb) { rebuy(rb.dataset.rebuy); return; }
    if (e.target.closest('[data-go-shop]')) { closeLayer($('ordersSheet')); goShop(); return; }
    var op = e.target.closest('[data-ord]');
    if (op) renderOrderDetail(op.dataset.ord);
  });
  $('ordersSheet').addEventListener('submit', function (e) {
    if (e.target.id !== 'ordAddForm') return;
    e.preventDefault();
    var num = $('oaNum').value.trim().toUpperCase(), cel = $('oaCel').value.replace(/\D/g, '');
    var msg = !/^(PC|KS)-\d{8}-\d{4}$/.test(num) ? 'Escribe el número tal como aparece en tu recibo (PC-…).' : !/^\d{4}$/.test(cel) ? 'Escribe los últimos 4 dígitos de tu celular.' : '';
    if (msg) { $('oaErr').textContent = msg; $('oaErr').hidden = false; return; }
    rememberOrder(num, cel); MP.pendingOpen = num; fetchOrders(num);
  });
  function payOrder(num) {
    var o = MP.list.find(function (x) { return x.numero === num; }); if (!o) return;
    S.order = { numero: o.numero, ultimos4: o.ultimos4, nombre: o.nombre, ciudad: o.ciudad, pago: o.pago, entrega: o.entrega, pricing: o.pricing, items: o.items, createdAt: o.createdAt, step: 'pago', at: Date.now() };
    store.set(K_ORDER, S.order);
    closeLayer($('ordersSheet'), false, true);
    resumeOrder(true);
  }
  function rebuy(num) {
    var o = MP.list.find(function (x) { return x.numero === num; }); if (!o) return;
    var added = 0;
    o.items.forEach(function (i) {
      var p = S.products.find(function (x) { return x.id === i.id; });
      if (!p || Number(p.stock) === 0 || (p.sizes || []).map(Number).indexOf(Number(i.size)) < 0) return;
      var key = p.id + '|' + i.size + '|' + (i.color || '');
      var it = S.cart.find(function (c) { return c.key === key; });
      if (it) it.qty = Math.min(9, it.qty + (i.qty || 1)); else S.cart.push({ key: key, id: p.id, size: Number(i.size), color: i.color || '', qty: Math.min(9, i.qty || 1) });
      added++;
    });
    if (!added) { toast('Esos modelos ya no están disponibles. Mira el catálogo.'); return; }
    saveCart(); renderCart(); bumpCart();
    toast(added === o.items.length ? 'Agregamos tu pedido al carrito' : 'Agregamos ' + added + ' de ' + o.items.length + ' productos (los demás no están disponibles)');
    closeLayer($('ordersSheet'), false, true); openLayer($('cartSheet'), null, true);
  }

  /* ---------------- menú inferior ---------------- */
  function goShop() {
    var c = $('catalogo');
    c.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    c.focus({ preventScroll: true });
  }
  $('bnHome').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
  $('bnShop').addEventListener('click', goShop);
  $('bnFav').addEventListener('click', openFavs);
  $('bnOrders').addEventListener('click', function () { openOrders(); });
  var navT;
  function markNav() {
    var shop = $('catalogo').getBoundingClientRect().top < window.innerHeight * 0.45;
    [['bnHome', !shop], ['bnShop', shop]].forEach(function (x) { if (x[1]) $(x[0]).setAttribute('aria-current', 'page'); else $(x[0]).removeAttribute('aria-current'); });
  }
  window.addEventListener('scroll', function () { clearTimeout(navT); navT = setTimeout(markNav, 80); }, { passive: true });

  /* ---------------- ajustes ---------------- */
  function applySettings() {
    var s = S.settings || {};
    if (s.whatsapp && /^\d{10,13}$/.test(s.whatsapp)) WA = s.whatsapp;
    if (s.pagos && Array.isArray(s.pagos.cuentas) && s.pagos.cuentas.length) { CUENTAS = s.pagos.cuentas; if (S.order && !$('coStep2').hidden) renderAccounts(); }
    if (s.envio != null && isFinite(s.envio)) { ENVIO = Number(s.envio); renderCart(); if (stack.indexOf($('coSheet')) > -1) renderCheckoutSummary(); }
    if (Array.isArray(s.departamentos) && s.departamentos.length) { DEPTOS = s.departamentos; renderDeptos(); }
    // Wompi está en pausa: la tienda solo ofrece transferencia o QR (Nequi / Bre-B)
    if (typeof s.push === 'string' && s.push !== PUSH_KEY) { PUSH_KEY = s.push; renderPushSlots(); syncPush(); }
    var m = encodeURIComponent('Hola Punto Club, quiero hacer una consulta.');
    $('waHelp').href = 'https://wa.me/' + WA + '?text=' + m;
  }

  /* ---------------- carga ---------------- */
  function restore() {
    var c = store.get(K_CART);
    if (c && Array.isArray(c.items) && Date.now() - (c.at || 0) < 7 * 864e5) {
      S.cart = c.items.filter(function (i) { return i && i.id && i.size; }).slice(0, 20);
      if (c.coupon) S.coupon = { code: c.coupon, discount: 0, freeShipping: false };
    }
    var o = store.get(K_ORDER);
    if (o && o.numero && Date.now() - (o.at || 0) < 48 * 3600e3) S.order = o; else store.del(K_ORDER);
  }
  async function loadCatalog() {
    try {
      var d = await api('/api/catalog');
      S.products = (d.products || []).filter(function (p) { return p && p.id; });
      S.promos = d.promos || []; S.ann = d.announcements || []; S.settings = d.settings || {}; S.coupons = d.coupons || [];
      S.loaded = true;
      applySettings();
      S.cart = S.cart.filter(function (i) { return S.products.some(function (p) { return p.id === i.id; }); });
    } catch (e) {
      S.loaded = false;
      $('grid').innerHTML = '<div class="empty"><p>No pudimos cargar el catálogo. Revisa tu conexión.</p><button type="button" class="btn btn-primary" id="retry" style="margin-top:12px">Intentar de nuevo</button></div>';
      $('grid').setAttribute('aria-busy', 'false');
      $('retry').addEventListener('click', function () { this.disabled = true; loadCatalog(); });
      applySettings();
      if (window.KairoLoader) window.KairoLoader.done();
      return;
    }
    renderNotices(); renderBrands(); renderHero(); renderChips(); renderGenders(); renderGrid(); renderCart(); syncFavUI();
    if (stack.indexOf($('ordersSheet')) > -1) { if (MP.open) renderOrderDetail(MP.open, true); else renderOrders(); }
    if (S.coupon && S.cart.length) applyCoupon(S.coupon.code, true);
    if (window.KairoLoader) window.KairoLoader.done();
  }

  restore();
  renderChips(); renderGenders(); renderBrands(); renderCart(); renderGrid(); syncFavUI(); updOrdBadge();
  reveal(document.querySelectorAll('.perks li'));
  reveal(document.querySelectorAll('.cats, .sec-head, #genders, .promo-row, .help'), 1);
  loadCatalog();

  // Tablet y PC con mouse: el tenis del hero sigue suavemente al puntero
  if (FX && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var heroEl = document.querySelector('.hero');
    heroEl.addEventListener('pointermove', function (e) {
      var r = heroEl.getBoundingClientRect();
      heroEl.style.setProperty('--mx', ((e.clientX - r.left) / r.width - .5).toFixed(3));
      heroEl.style.setProperty('--my', ((e.clientY - r.top) / r.height - .5).toFixed(3));
    });
    heroEl.addEventListener('pointerleave', function () { heroEl.style.setProperty('--mx', 0); heroEl.style.setProperty('--my', 0); });
  }
  window.addEventListener('kairo:ready', function () {
    setTimeout(maybePopup, 2500);
    startNotis();
    renderResume();
    // Enlaces a un pedido (?pedido=PC-…&c=1234 o #pedidos, p. ej. desde WhatsApp o la vieja página de seguimiento)
    var qs = new URLSearchParams(location.search), lnkNum = String(qs.get('pedido') || '').toUpperCase().slice(0, 20), lnkCel = String(qs.get('c') || '').replace(/\D/g, '').slice(-4);
    var wantOrders = location.hash === '#pedidos' || !!lnkNum;
    if (lnkNum && /^(PC|KS)-\d{8}-\d{4}$/.test(lnkNum) && /^\d{4}$/.test(lnkCel)) rememberOrder(lnkNum, lnkCel);
    var wompiTx = qs.get('wompi') ? String(qs.get('id') || '').slice(0, 64) : '';
    if (wantOrders || qs.get('wompi')) { try { history.replaceState(null, '', location.pathname); } catch (e) { } }
    // Volvió de pagar en Wompi: se consulta el resultado real del pago
    if (wompiTx) { verifyWompi(wompiTx); return; }
    // Volvió después de una recarga o de cambiar a Nequi: lo llevamos directo al pago
    if (S.order && S.order.step === 'pago' && !stack.length) resumeOrder();
    else if (wantOrders && !stack.length) openOrders(/^(PC|KS)-\d{8}-\d{4}$/.test(lnkNum) ? lnkNum : '');
    else if (hasHistory()) fetchOrders();
  });
  if (!document.getElementById('kLoader')) setTimeout(function () { window.dispatchEvent(new Event('kairo:ready')); }, 0);

  var hdr = $('hdr');
  window.addEventListener('scroll', function () { hdr.classList.toggle('scrolled', scrollY > 10); }, { passive: true });

  /* ---------------- instalar la app ---------------- */
  var K_INSTALL = 'kairo.instalar.v1';
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var installEvt = null, appReady = false;
  // Dentro de la app instalada no hay acceso al panel: se entra desde el navegador
  if (standalone) { var adm = $('adminLink'); if (adm) adm.remove(); }
  function renderInstall() {
    var bar = $('installBar');
    var dismissed = Date.now() - ((store.get(K_INSTALL) || {}).at || 0) < 30 * 864e5;
    var canShow = appReady && !standalone && !dismissed && !S.order && !stack.length && (installEvt || isIOS);
    if (!canShow) { bar.hidden = true; bar.innerHTML = ''; return; }
    if (!bar.hidden) return;
    bar.hidden = false;
    bar.innerHTML = '<div class="wrap"><span><b>Instala Punto Club</b> · ' + (installEvt ? 'ábrela desde tu pantalla de inicio y sigue tus pedidos.' : 'toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.') + '</span>' +
      (installEvt ? '<button type="button" class="btn btn-lime" id="installBtn">Instalar</button>' : '') +
      '<button type="button" class="link-btn" id="installX">Ahora no</button></div>';
    if (installEvt) $('installBtn').addEventListener('click', function () {
      var e = installEvt; installEvt = null;
      e.prompt();
      e.userChoice.then(function (c) { if (c.outcome !== 'accepted') store.set(K_INSTALL, { at: Date.now() }); }).catch(function () { });
      renderInstall();
    });
    $('installX').addEventListener('click', function () { store.set(K_INSTALL, { at: Date.now() }); renderInstall(); });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; renderInstall(); });
  window.addEventListener('appinstalled', function () { installEvt = null; standalone = true; renderInstall(); });
  window.addEventListener('kairo:ready', function () { setTimeout(function () { appReady = true; renderInstall(); }, 8000); });
})();
