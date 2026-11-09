/* =====================================================================
   kAIRO Sneakers — lógica de la tienda
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
      '<span class="slide__ghost" aria-hidden="true">kAIRO</span>' +
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
      SLIDES.push({ eyebrow: 'kAIRO Sneakers', title: 'Arma tu estilo.', subtitle: 'Tenis, sandalias y chanclas para hombre y mujer, con envío a toda Colombia.', button: 'Ver catálogo', color: '#0e4d38', product: feats[0] || S.products[0], link: { type: 'ninguno' } });
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

  /* ---------------- barra superior, promos y dinámicas ---------------- */
  function fmtDate(d) { return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function renderNotices() {
    var bar = S.ann.find(function (a) { return a.kind === 'barra'; });
    if (bar) {
      $('topbarIn').innerHTML = '<span>' + esc(bar.title) + (bar.subtitle ? ' — ' + esc(bar.subtitle) : '') + '</span>' + (bar.linkType && bar.linkType !== 'ninguno' ? ' <button type="button" class="tb-link" id="tbLink">' + esc(bar.buttonText || 'Ver') + '</button>' : '');
      $('topbar').hidden = false;
      var l = $('tbLink'); if (l) l.addEventListener('click', function () { followLink({ type: bar.linkType, value: bar.linkValue }); });
    } else $('topbar').hidden = true;

    $('promosSec').hidden = !S.promos.length;
    $('promoRow').innerHTML = S.promos.map(function (p) {
      return '<article class="promo">' + (p.badge ? '<span class="promo__badge">' + esc(p.badge) + '</span>' : '') + '<h3>' + esc(p.title) + '</h3>' + (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
        (p.endsAt ? '<span class="until">Hasta el ' + fmtDate(p.endsAt) + '</span>' : '') +
        (p.conditions ? '<details><summary>Ver condiciones</summary><p>' + esc(p.conditions) + '</p></details>' : '') + '</article>';
    }).join('');

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
    $('pdPrice').innerHTML = '<b>' + money(priceOf(p)) + '</b>' + (sale ? '<s><span class="sr-only">Antes </span>' + money(p.price) + '</s>' : '') + (p.promo ? '<span class="pd__promo">' + esc(p.promo.title) + '</span>' : '');
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
  function calc() {
    var lines = cartLines();
    var list = lines.reduce(function (s, l) { return s + l.p.price * l.qty; }, 0);
    var sub = lines.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
    var disc = S.coupon ? Math.min(S.coupon.discount || 0, sub) : 0;
    var shipPromo = S.promos.filter(function (p) { return p.kind === 'envio' && sub >= (p.minSubtotal || 0); })[0];
    var free = !!(S.coupon && S.coupon.freeShipping) || !!shipPromo;
    var modo = currentEntrega(), dom = domicilioPrecio();
    // envio = null mientras no se sepa (todavía no elige cómo recibir o no elige barrio)
    var envio = modo === 'Recoger' ? 0 : dom == null ? null : free ? 0 : dom;
    var total = Math.max(0, sub - disc);
    return { lines: lines, list: list, sub: sub, save: list - sub, disc: disc, free: free, shipPromo: shipPromo, modo: modo, dom: dom, envio: envio, total: total, totalConEnvio: total + (envio || 0), count: lines.reduce(function (s, l) { return s + l.qty; }, 0) };
  }
  function totalsHTML(c, pago) {
    var h = '<div><span>Productos</span><span>' + money(c.list) + '</span></div>';
    if (c.save) h += '<div class="save"><span>Promociones</span><span>-' + money(c.save) + '</span></div>';
    if (c.disc) h += '<div class="save"><span>Cupón ' + esc(S.coupon.code) + '</span><span>-' + money(c.disc) + '</span></div>';
    var promoTxt = c.shipPromo && !(S.coupon && S.coupon.freeShipping) ? ' (' + esc(c.shipPromo.title) + ')' : '';
    if (c.modo === 'Recoger') h += '<div><span>Recoger en la tienda</span><span>Gratis</span></div>';
    else if (c.envio == null) h += '<div><span>Domicilio</span><span>' + (c.modo === 'Domicilio' ? 'Elige tu barrio' : 'Gratis si recoges · hasta ' + money(DOM.max)) + '</span></div>';
    else h += '<div><span>Domicilio' + promoTxt + '</span><span>' + (c.envio ? money(c.envio) : 'Gratis') + '</span></div>';
    h += '<div class="grand"><span>Total</span><span>' + money(c.totalConEnvio) + '</span></div>';
    if (pago === 'Wompi') h += '<div><span>Pagas ahora en línea</span><span>' + money(c.totalConEnvio) + '</span></div>';
    else if (pago === 'Contraentrega' && c.dom != null) h += '<div><span>Pagas ahora por Nequi (domicilio)</span><span>' + money(Math.min(c.dom, c.totalConEnvio)) + '</span></div><div><span>Pagas al recibir</span><span>' + money(Math.max(0, c.totalConEnvio - c.dom)) + '</span></div>';
    else if (pago === 'En tienda') h += '<div><span>Pagas al recoger en la tienda</span><span>' + money(c.totalConEnvio) + '</span></div>';
    else if (pago === 'Nequi') h += '<div><span>Pagas ahora por Nequi</span><span>' + money(c.totalConEnvio) + '</span></div>';
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
  function openCart() { renderCart(); openLayer($('cartSheet')); }
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
    $('payWompiTxt').textContent = 'Pagas ' + money(c.totalConEnvio) + ' con tarjeta, PSE, Nequi o Bancolombia.';
    $('payNequiTxt').textContent = 'Pagas ' + money(c.totalConEnvio) + ' ahora con el QR que te mostramos.';
    $('payCodTxt').textContent = c.dom == null ? 'Pagas el domicilio por Nequi y el resto al recibir.' : 'Pagas ' + money(Math.min(c.dom, c.totalConEnvio)) + ' del domicilio por Nequi y ' + money(Math.max(0, c.totalConEnvio - c.dom)) + ' al recibir.';
    $('payTiendaTxt').textContent = 'No pagas nada ahora: pagas ' + money(c.totalConEnvio) + ' cuando lo recojas.';
  }
  document.querySelectorAll('input[name="pago"]').forEach(function (r) { r.addEventListener('change', renderCheckoutSummary); });
  function openCheckout(replace) {
    if (stack.indexOf($('cartSheet')) > -1) { closeLayer($('cartSheet'), false, true); replace = true; }
    if (S.order) { resumeOrder(replace); return; }
    if (!S.cart.length) return;
    prefillProfile();
    renderCheckoutSummary(); showStep(1);
    $('orderErr').hidden = true;
    syncEntrega();
    openLayer($('coSheet'), document.querySelector('input[name="entrega"]'), replace === true);
  }
  $('toCheckout').addEventListener('click', function () { openCheckout(); });
  /* ---------------- cómo recibe: recoger en la tienda o domicilio en Quibdó ---------------- */
  // Barrios y precios del domicilio (se configuran en el panel; máximo $10.000)
  var DOM = { barrios: [], otro: 10000, max: 10000 };
  function currentEntrega() { var r = document.querySelector('input[name="entrega"]:checked'); return r ? r.value : ''; }
  function barrioActual() { var sel = $('fBarrioSel').value; return sel === '__otro' ? $('fBarrio').value.trim() : sel; }
  function domicilioPrecio() {
    if (currentEntrega() !== 'Domicilio') return null;
    var sel = $('fBarrioSel').value; if (!sel) return null;
    var b = DOM.barrios.find(function (x) { return x.nombre === sel; });
    return b ? b.precio : DOM.otro;
  }
  function renderBarrios() {
    var cur = $('fBarrioSel').value;
    $('fBarrioSel').innerHTML = '<option value="">Elige tu barrio</option>' +
      DOM.barrios.map(function (b) { return '<option value="' + esc(b.nombre) + '">' + esc(b.nombre) + ' · ' + (b.precio ? money(b.precio) : 'Gratis') + '</option>'; }).join('') +
      '<option value="__otro">' + (DOM.barrios.length ? 'Otro barrio' : 'Mi barrio') + ' · ' + (DOM.otro ? money(DOM.otro) : 'Gratis') + '</option>';
    if (cur && [].some.call($('fBarrioSel').options, function (o) { return o.value === cur; })) $('fBarrioSel').value = cur;
    var precios = DOM.barrios.map(function (b) { return b.precio; }).concat([DOM.otro]);
    var min = Math.min.apply(null, precios), max = Math.max.apply(null, precios);
    $('domDesde').textContent = min === max ? (max ? 'Domicilio ' + money(max) + '.' : 'Domicilio gratis.') : 'Según tu barrio: de ' + money(min) + ' a ' + money(max) + '.';
    $('fBarrioSel-h').textContent = 'El domicilio cuesta máximo ' + money(DOM.max) + '.';
  }
  function syncEntrega() {
    var m = currentEntrega();
    $('pickupNote').hidden = m !== 'Recoger';
    $('domFields').hidden = m !== 'Domicilio';
    $('fBarrioOtroBox').hidden = $('fBarrioSel').value !== '__otro';
    // Contraentrega solo con domicilio; "separar y pagar al recoger" solo si recoge
    [['payCodOpt', m === 'Domicilio'], ['payTiendaOpt', m === 'Recoger']].forEach(function (x) {
      var lbl = $(x[0]), inp = lbl.querySelector('input');
      lbl.hidden = !x[1]; inp.disabled = !x[1]; if (!x[1]) inp.checked = false;
    });
    if (!document.querySelector('input[name="pago"]:checked')) {
      var first = [].find.call(document.querySelectorAll('input[name="pago"]'), function (i) { return !i.disabled; });
      if (first) first.checked = true;
    }
    if (N.pintar && m === 'Recoger') N.pintar();
    renderCheckoutSummary();
  }
  document.querySelectorAll('input[name="entrega"]').forEach(function (r) { r.addEventListener('change', function () { fieldErr('fEntrega', ''); syncEntrega(); }); });
  $('fBarrioSel').addEventListener('change', function () { fieldErr('fBarrioSel', ''); syncEntrega(); if (this.value === '__otro') $('fBarrio').focus(); });
  renderBarrios();

  function fieldErr(id, msg) { var i = $(id), e = $(id + '-e'); i.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } return !msg; }
  function telDigits(v) { var d = String(v || '').replace(/\D/g, ''); if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2); return d; }
  var sending = false;
  $('orderForm').addEventListener('submit', async function (e) {
    e.preventDefault(); if (sending) return;
    var v = function (id) { return $(id).value.trim(); };
    var dom = currentEntrega() === 'Domicilio', otro = $('fBarrioSel').value === '__otro';
    var checks = [
      ['fEntrega', currentEntrega() ? '' : 'Elige si recoges en la tienda o quieres domicilio.'],
      ['fNombre', v('fNombre').length >= 3 ? '' : 'Escribe tu nombre y apellido.'],
      ['fTel', /^3\d{9}$/.test(telDigits(v('fTel'))) ? '' : 'Escribe un celular de 10 dígitos que empiece por 3.'],
      ['fCorreo', !v('fCorreo') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('fCorreo')) ? '' : 'Revisa el correo (ejemplo: nombre@correo.com).'],
      ['fBarrioSel', !dom || $('fBarrioSel').value ? '' : 'Elige tu barrio para calcular el domicilio.'],
      ['fBarrio', !dom || !otro || v('fBarrio').length >= 3 ? '' : 'Escribe el nombre de tu barrio.'],
      ['fDir', !dom || v('fDir').length >= 5 ? '' : 'Escribe la dirección de entrega.']
    ];
    var firstBad = null;
    checks.forEach(function (c) { if (!fieldErr(c[0], c[1]) && !firstBad) firstBad = c[0] === 'fEntrega' ? document.querySelector('input[name="entrega"]') : $(c[0]); });
    var cErr = !$('cTerm').checked ? 'Para continuar acepta los términos y condiciones.' : !$('cDatos').checked ? 'Para continuar autoriza el tratamiento de tus datos para gestionar el pedido.' : '';
    $('consent-e').textContent = cErr; $('consent-e').hidden = !cErr;
    if (cErr && !firstBad) firstBad = !$('cTerm').checked ? $('cTerm') : $('cDatos');
    if (firstBad) { firstBad.focus(); return; }

    sending = true; $('orderBtn').disabled = true; $('orderBtn').textContent = 'Guardando tu pedido…'; $('orderErr').hidden = true;
    var pago = currentPago();
    var customer = { nombre: v('fNombre'), telefono: telDigits(v('fTel')), cedula: v('fCed'), correo: v('fCorreo'), direccion: dom ? v('fDir') : '', barrio: dom ? barrioActual() : '', ciudad: 'Quibdó', departamento: 'Chocó', notas: v('fNotas'), pago: pago, entrega: currentEntrega() };
    try {
      var d = await api('/api/orders', { items: itemsPayload(), coupon: S.coupon ? S.coupon.code : '', customer: customer, cliente: clienteId(), consent: { terminos: true, datos: true, version: N.versionPoliticas || '' } });
      if ($('cRecordar').checked) {
        var prev = store.get(K_PERFIL) || {};
        store.set(K_PERFIL, { nombre: customer.nombre, telefono: customer.telefono, cedula: customer.cedula, correo: customer.correo, direccion: customer.direccion || prev.direccion || '', barrio: customer.barrio || prev.barrio || '', entrega: customer.entrega });
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
      $('orderForm').reset(); syncEntrega();
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
    $('payTitle').textContent = online ? 'Paga en línea' : o.pago === 'Contraentrega' ? 'Paga el domicilio' : 'Paga con Nequi';
    if (online) renderWompiState(o.wompiEstado || '');
    $('payAmount').innerHTML = money(val) + '<small>' + (o.pago === 'Contraentrega' ? 'Valor del domicilio. El resto (' + money(o.pricing.saldoContraentrega) + ') lo pagas al recibir.' : o.entrega === 'Recoger' ? 'Total de tu pedido (lo recoges en la tienda)' : 'Total de tu pedido con domicilio') + '</small>';
    $('payVal').textContent = money(val);
    $('payMsg').textContent = o.numero;
    $('payCodNote').hidden = o.pago !== 'Contraentrega';
    $('payCodNote').textContent = o.pricing.freeShipping ? 'Tu pedido tiene domicilio gratis: este valor se descuenta de lo que pagas al recibir.' : 'Este pago cubre el domicilio y confirma tu pedido contraentrega.';
    $('payWa').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola kAIRO, pagué mi pedido ' + o.numero + ' por ' + money(val) + '. Te envío el comprobante.');
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

  function receiptData(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error('Elige una imagen JPG, PNG o WEBP.'));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error('La foto original debe pesar menos de 12 MB.'));
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), image = new Image();
      image.onload = async function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
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
              if (blob && blob.size <= 1800 * 1024) {
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
  var COPY = { key: function () { return N.nequiLlave || ''; }, val: function () { return String(Math.round(payValue())); }, msg: function () { return S.order ? S.order.numero : ''; } };
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
    if (!fieldErr('fReceipt', file ? '' : 'Sube la foto o captura del comprobante de Nequi.')) { $('fReceipt').focus(); return; }
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
    if (o.step === 'pagado') $('doneTxt').textContent = 'Gracias, ' + o.nombre + '. Tu pago en línea fue aprobado y ya estamos preparando tu pedido' + (recoge ? ' para que lo recojas en la tienda' : ' para llevarlo a tu casa en Quibdó') + '. Te escribimos por WhatsApp.';
    else if (o.step === 'separado') $('doneTxt').textContent = 'Gracias, ' + o.nombre + '. ' + (recoge ? 'Tu pedido queda separado a tu nombre. Pagas ' + money(saldo) + ' cuando lo recojas en la tienda.' : 'Tu pedido quedó registrado. Pagas ' + money(saldo) + ' al recibirlo.') + ' Te escribimos por WhatsApp cuando esté listo.';
    else $('doneTxt').textContent = 'Gracias, ' + o.nombre + '. Recibimos ' + (o.comprobante ? 'la foto del comprobante de tu pago' : 'tu pedido') + '. Cuando verifiquemos el pago, tu pedido pasa a “Pago confirmado” y te escribimos por WhatsApp.';
    $('doneReceipt').href = l.recibo;
    $('doneProof').hidden = !sentProof;
    if (sentProof) { $('doneProofImg').src = sentProof; $('doneProofDl').href = sentProof; $('doneProofDl').download = 'Comprobante-' + o.numero + '.jpg'; }
    $('doneWa').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola kAIRO, tengo una pregunta sobre mi pedido ' + o.numero);
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
    var map = { fNombre: 'nombre', fTel: 'telefono', fCed: 'cedula', fCorreo: 'correo', fDir: 'direccion' };
    Object.keys(map).forEach(function (id) { if (!$(id).value.trim() && p[map[id]]) $(id).value = p[map[id]]; });
    if (p.barrio && !$('fBarrioSel').value) {
      var listed = DOM.barrios.some(function (b) { return b.nombre === p.barrio; });
      $('fBarrioSel').value = listed ? p.barrio : '__otro';
      if (!listed) $('fBarrio').value = p.barrio;
    }
    if ((p.entrega === 'Recoger' || p.entrega === 'Domicilio') && !currentEntrega()) document.querySelector('input[name="entrega"][value="' + p.entrega + '"]').checked = true;
  }

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
    tab: 'todos', open: '', loading: false, fetchedAt: 0, stale: false, err: ''
  };
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
  var PAGO_TXT = { Wompi: 'En línea (Wompi)', Nequi: 'Nequi', Contraentrega: 'Contraentrega', 'En tienda': 'Al recoger en la tienda' };
  function stageHint(o) {
    var s = stage(o);
    if (s === 'pagar' && o.pago === 'Wompi') return 'Paga ' + money(o.pricing.pagarAhora) + ' en línea para confirmarlo.';
    if (s === 'pagar') return o.pago === 'Contraentrega' ? 'Paga ' + money(o.pricing.pagarAhora) + ' de anticipo por Nequi para confirmarlo.' : 'Paga ' + money(o.pricing.pagarAhora) + ' por Nequi para confirmarlo.';
    if (s === 'proceso' && o.status === 'Recibido' && o.pago === 'En tienda') return 'Separado. Pagas ' + money(o.pricing.saldoContraentrega) + ' al recogerlo en la tienda.';
    if (s === 'proceso' && o.status === 'Recibido' && !o.pagoReportado) return 'Recibimos tu pedido. Pagas ' + money(o.pricing.saldoContraentrega) + ' al recibirlo.';
    if (s === 'proceso' && o.status === 'Recibido') return 'Recibimos tu comprobante. Lo estamos verificando.';
    if (s === 'proceso') return o.statusLabel + '. Te avisamos cuando salga.';
    if (s === 'enviado') return o.guia ? 'Guía ' + o.guia + (o.transportadora ? ' · ' + o.transportadora : '') : 'Tu pedido va en camino.';
    if (s === 'entregado') return '¡Entregado! Esperamos que lo disfrutes.';
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
      MP.list = d.orders || []; MP.fetchedAt = Date.now(); MP.stale = false;
      saveMis();
      if (addedNum && invalid.indexOf(addedNum) > -1) MP.err = 'No encontramos el pedido ' + addedNum + ' con esos 4 dígitos. Revisa los datos.';
      else if (addedNum) toast('Pedido ' + addedNum + ' agregado');
    } catch (e) {
      MP.err = e instanceof TypeError ? 'Sin conexión: te mostramos lo último que guardamos.' : e.message;
    } finally {
      MP.loading = false; $('ordRefresh').classList.remove('spin');
      updOrdBadge();
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
    return '<article class="oc oc--' + s + '">' +
      '<button type="button" class="oc__hit" data-ord="' + esc(o.numero) + '" aria-label="Ver detalle del pedido ' + esc(o.numero) + '"></button>' +
      '<div class="oc__top"><div><b>' + esc(o.numero) + '</b><small>' + esc(fmtShort(o.createdAt)) + ' · ' + n + (n === 1 ? ' producto' : ' productos') + '</small></div><span class="st st--' + s + '">' + STAGE_TXT[s] + '</span></div>' +
      '<div class="oc__thumbs" aria-hidden="true">' + thumbs + '</div>' +
      (s !== 'cancelado' ? '<div class="oc__bar" aria-hidden="true"><i style="width:' + progress(o) + '%"></i></div>' : '') +
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
    h += '<details class="ord-add"' + (MP.err && /4 dígitos/.test(MP.err) ? ' open' : '') + '><summary>¿Compraste desde otro celular? Agrega tu pedido</summary>' +
      '<form id="ordAddForm" novalidate><div class="row2"><div class="field"><label for="oaNum">Número de pedido</label><input id="oaNum" autocapitalize="characters" autocomplete="off" maxlength="20" placeholder="KS-20261029-4821"></div>' +
      '<div class="field"><label for="oaCel">Últimos 4 del celular</label><input id="oaCel" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="2045"></div></div>' +
      '<p class="err" id="oaErr" hidden></p><button type="submit" class="btn btn-line btn-block">Agregar a mis pedidos</button></form></details>';
    $('ordList').innerHTML = h;
  }
  function renderOrderDetail(num, keepScroll) {
    var o = MP.list.find(function (x) { return x.numero === num; });
    if (!o) { MP.open = ''; renderOrders(); return; }
    MP.open = num;
    var s = stage(o), l = { recibo: '/recibo.html?pedido=' + encodeURIComponent(o.numero) + '&c=' + encodeURIComponent(o.ultimos4) };
    $('ordBack').hidden = false; $('ordTabs').hidden = true; $('ordList').hidden = true; $('ordDetail').hidden = false;
    $('ordTitle').textContent = 'Pedido ' + o.numero; $('ordHello').textContent = fmtShort(o.createdAt);
    var steps = (o.steps || []).map(function (st) {
      return '<li class="' + st.state + '"><span class="dot" aria-hidden="true"></span><b>' + esc(st.label) + '</b>' + (st.at ? '<small>' + esc(fmtTime(st.at)) + '</small>' : '') +
        (st.state === 'current' ? '<span class="sr-only"> (estado actual)</span>' : st.state === 'done' ? '<span class="sr-only"> (completado)</span>' : '') + '</li>';
    }).join('');
    var p = o.pricing, items = o.items.map(function (i) {
      return '<div class="od-item"><span class="oc__th">' + itemArt(i) + '</span><div><b>' + esc(i.brand + ' ' + i.name) + '</b><small>Talla ' + esc(i.size) + (i.color ? ' · ' + esc(i.color) : '') + ' · ×' + i.qty + '</small></div><span>' + money(i.price * i.qty) + '</span></div>';
    }).join('');
    var wa = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola kAIRO, pregunto por mi pedido ' + o.numero);
    $('ordDetail').innerHTML =
      '<div class="od-hero od-hero--' + s + '"><span class="st st--' + s + '">' + STAGE_TXT[s] + '</span><h3>' + esc(o.statusLabel) + '</h3><p>' + esc(stageHint(o)) + '</p>' +
      (s !== 'cancelado' ? '<div class="oc__bar"><i style="width:' + progress(o) + '%"></i></div>' : '') +
      (s === 'pagar' ? '<button type="button" class="btn btn-lime btn-block" data-pay="' + esc(o.numero) + '">Pagar ' + money(p.pagarAhora) + (o.pago === 'Wompi' ? ' en línea' : ' por Nequi') + '</button>' : '') + '</div>' +
      (s !== 'cancelado' ? '<section class="od-sec"><h4>Seguimiento</h4><ol class="tl" aria-label="Estados del pedido">' + steps + '</ol></section>' : '') +
      (o.guia ? '<div class="od-note"><b>Guía de envío:</b> ' + esc(o.guia) + (o.transportadora ? ' (' + esc(o.transportadora) + ')' : '') + '</div>' : '') +
      (o.nota ? '<div class="od-note"><b>Mensaje de la tienda:</b> ' + esc(o.nota) + '</div>' : '') +
      (o.pagoReportado && o.pagoReportado.hasComprobante ? '<section class="od-sec" id="odProof"><h4>Tu comprobante</h4><p class="hint">Cargando…</p></section>' : '') +
      '<section class="od-sec"><h4>Productos</h4>' + items +
      '<div class="totals od-tot">' + (p.promoSavings ? '<div class="save"><span>Promociones</span><span>-' + money(p.promoSavings) + '</span></div>' : '') +
      (p.discount ? '<div class="save"><span>Cupón ' + esc(p.couponCode) + '</span><span>-' + money(p.discount) + '</span></div>' : '') +
      (p.envio != null ? '<div><span>' + (o.entrega === 'Recoger' ? 'Recoger en tienda' : 'Domicilio') + '</span><span>' + (p.envio ? money(p.envio) : 'Gratis') + '</span></div>' : '') +
      '<div class="grand"><span>Total</span><span>' + money(p.totalConEnvio) + '</span></div>' +
      ((o.pago === 'Contraentrega' || o.pago === 'En tienda') && p.saldoContraentrega ? '<div><span>' + (o.pago === 'En tienda' ? 'Pagas al recoger' : 'Pagas al recibir') + '</span><span>' + money(p.saldoContraentrega) + '</span></div>' : '') + '</div>' +
      '<button type="button" class="btn btn-line btn-block" data-rebuy="' + esc(o.numero) + '"><svg aria-hidden="true"><use href="#i-repeat"/></svg>Comprar de nuevo</button></section>' +
      '<section class="od-sec"><h4>Entrega</h4><dl class="od-dl"><div><dt>Recibe</dt><dd>' + esc(o.nombre) + '</dd></div><div><dt>' + (o.entrega === 'Recoger' ? 'Entrega' : 'Dirección') + '</dt><dd>' + (o.entrega === 'Recoger' ? 'Recoge en la tienda' : esc(o.direccion) + ', ' + esc(o.ciudad)) + '</dd></div><div><dt>Pago</dt><dd>' + esc(PAGO_TXT[o.pago] || o.pago) + '</dd></div><div><dt>Empaque</dt><dd>Sin caja</dd></div></dl></section>' +
      '<div class="od-actions"><a class="btn btn-primary" href="' + esc(l.recibo) + '">Ver y descargar recibo</a><a class="btn btn-wa" href="' + esc(wa) + '" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-wa"/></svg>Preguntar por WhatsApp</a></div>';
    if (!keepScroll) { $('ordDetail').scrollTop = 0; $('ordDetail').focus({ preventScroll: true }); }
    if (o.pagoReportado && o.pagoReportado.hasComprobante) loadProof(o);
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
    var msg = !/^KS-\d{8}-\d{4}$/.test(num) ? 'Escribe el número tal como aparece en tu recibo (KS-…).' : !/^\d{4}$/.test(cel) ? 'Escribe los últimos 4 dígitos de tu celular.' : '';
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
    if (s.domicilios && Array.isArray(s.domicilios.barrios)) { DOM = s.domicilios; renderBarrios(); if (stack.indexOf($('coSheet')) > -1) renderCheckoutSummary(); }
    // Pago en línea: solo si Wompi está configurado en el servidor. Queda como opción por defecto.
    var wr = document.querySelector('input[name="pago"][value="Wompi"]');
    if (s.wompi && $('payWompiOpt').hidden) { $('payWompiOpt').hidden = false; wr.disabled = false; wr.checked = true; if (stack.indexOf($('coSheet')) > -1) renderCheckoutSummary(); }
    var m = encodeURIComponent('Hola kAIRO, quiero hacer una consulta.');
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
      S.promos = d.promos || []; S.ann = d.announcements || []; S.settings = d.settings || {};
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
    renderResume();
    // Enlaces a un pedido (?pedido=KS-…&c=1234 o #pedidos, p. ej. desde WhatsApp o la vieja página de seguimiento)
    var qs = new URLSearchParams(location.search), lnkNum = String(qs.get('pedido') || '').toUpperCase().slice(0, 20), lnkCel = String(qs.get('c') || '').replace(/\D/g, '').slice(-4);
    var wantOrders = location.hash === '#pedidos' || !!lnkNum;
    if (lnkNum && /^KS-\d{8}-\d{4}$/.test(lnkNum) && /^\d{4}$/.test(lnkCel)) rememberOrder(lnkNum, lnkCel);
    var wompiTx = qs.get('wompi') ? String(qs.get('id') || '').slice(0, 64) : '';
    if (wantOrders || qs.get('wompi')) { try { history.replaceState(null, '', location.pathname); } catch (e) { } }
    // Volvió de pagar en Wompi: se consulta el resultado real del pago
    if (wompiTx) { verifyWompi(wompiTx); return; }
    // Volvió después de una recarga o de cambiar a Nequi: lo llevamos directo al pago
    if (S.order && S.order.step === 'pago' && !stack.length) resumeOrder();
    else if (wantOrders && !stack.length) openOrders(/^KS-\d{8}-\d{4}$/.test(lnkNum) ? lnkNum : '');
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
    bar.innerHTML = '<div class="wrap"><span><b>Instala kAIRO</b> · ' + (installEvt ? 'ábrela desde tu pantalla de inicio y sigue tus pedidos.' : 'toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.') + '</span>' +
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
