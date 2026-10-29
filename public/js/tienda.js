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
  var ENVIO = Number(N.anticipoEnvioContraentrega) || 25000;
  var WA = N.whatsapp || '573145312045';
  var CATS = ['Tenis', 'Sandalias', 'Chanclas', 'Botas'];
  var CAT_ICON = { Todo: 'i-bolt', Nuevo: 'i-spark', Tenis: 'i-sneaker', Sandalias: 'i-sandal', Chanclas: 'i-flip', Botas: 'i-boot' };
  var BRANDS_DEFAULT = ['Nike', 'Jordan', 'Adidas', 'Puma', 'New Balance', 'Converse', 'Vans'];
  var K_CART = 'kairo.carrito.v1', K_ORDER = 'kairo.pedido.v1';

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
    var pic = list.find(function (p) { return p.gender === g && safeUrl(p.image); }) || list.find(function (p) { return safeUrl(p.image); }) || list[0];
    return { n: list.length, cats: cats, pic: pic };
  }
  function renderGenders() {
    $('genders').innerHTML = ['Hombre', 'Mujer'].map(function (g) {
      var st = genderStats(g);
      return '<button type="button" class="gcard gcard--' + (g === 'Hombre' ? 'h' : 'm') + '" data-gender="' + g + '" aria-pressed="' + (S.f.gender === g) + '">' +
        '<span><h3>' + g + '</h3><small>' + (S.loaded ? st.n + (st.n === 1 ? ' modelo' : ' modelos') : 'Cargando…') + '</small>' +
        '<span class="gcard__links" aria-hidden="true">' + st.cats.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</span></span>' +
        (st.pic ? '<span class="gcard__art" aria-hidden="true">' + art(st.pic, '', null) + '</span>' : '') +
        '<span class="gcard__cta">' + (S.f.gender === g ? 'Viendo ' + g.toLowerCase() : 'Ver ' + (g === 'Hombre' ? 'hombre' : 'mujer')) + '<svg aria-hidden="true"><use href="#i-arrow"/></svg></span>' +
        '</button>';
    }).join('');
  }
  $('genders').addEventListener('click', function (e) {
    var b = e.target.closest('[data-gender]'); if (!b) return;
    var g = b.dataset.gender;
    setFilter({ gender: S.f.gender === g ? 'Todos' : g, cat: 'Todo' }, S.f.gender !== g);
  });
  document.querySelectorAll('[data-goto-gender]').forEach(function (b) {
    b.addEventListener('click', function () { setFilter({ gender: b.dataset.gotoGender, cat: 'Todo', brand: 'Todos', q: '' }, true); $('q').value = ''; });
  });
  document.querySelectorAll('[data-goto-cat]').forEach(function (b) {
    b.addEventListener('click', function () { setFilter({ cat: b.dataset.gotoCat, brand: 'Todos', q: '' }, true); $('q').value = ''; });
  });

  /* ---------------- grilla ---------------- */
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
    if (!S.loaded) return;
    if (!list.length) { g.innerHTML = '<p class="empty">No encontramos modelos con esos filtros. <button type="button" class="link-btn" data-gclear>Ver todo el catálogo</button></p>'; return; }
    g.innerHTML = list.map(function (p) {
      var sale = p.salePrice && p.salePrice < p.price;
      var pct = sale ? Math.round((1 - p.salePrice / p.price) * 100) : 0;
      return '<article class="card" style="--tint:' + esc(p.bg || '#e2f0e8') + '">' +
        '<div class="card__media">' + art(p, 'card__shoe') +
        '<div class="card__tags">' + (p.isNew ? '<span class="tag tag--new">Nuevo</span>' : '') + (sale ? '<span class="tag tag--off">-' + pct + '%</span>' : '') + (p.tag ? '<span class="tag">' + esc(p.tag) + '</span>' : '') + '</div></div>' +
        '<div class="card__body"><span class="card__brand">' + esc(p.brand) + '</span><h3>' + esc(p.name) + '</h3>' +
        '<span class="card__meta">' + esc(p.category) + ' · ' + esc(p.gender) + '</span>' +
        '<span class="nobox"><svg aria-hidden="true"><use href="#i-nobox"/></svg>Sin caja</span>' +
        '<div class="card__row"><span class="price">' + (sale ? '<s><span class="sr-only">Antes </span>' + money(p.price) + '</s><span class="sr-only">Ahora </span>' : '') + money(priceOf(p)) + '</span>' +
        '<button type="button" class="plus" data-open="' + esc(p.id) + '" aria-label="Elegir talla de ' + esc(p.brand + ' ' + p.name) + '"><svg aria-hidden="true"><use href="#i-plus"/></svg></button></div></div>' +
        '<button type="button" class="card__open" data-open="' + esc(p.id) + '" tabindex="-1" aria-hidden="true"></button>' +
        '</article>';
    }).join('');
    reveal(g.children, matchMedia('(min-width: 980px)').matches ? 4 : 3);
  }
  document.addEventListener('click', function (e) {
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
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); setFilter({ q: this.value.trim() }, true); } });
  $('qClear').addEventListener('click', function () { $('q').value = ''; this.hidden = true; setFilter({ q: '' }); $('q').focus(); });
  function focusSearch() {
    var header = $('hdr'), isCompact = window.matchMedia('(max-width: 699px)').matches;
    if (isCompact) {
      var open = !header.classList.contains('search-open');
      header.classList.toggle('search-open', open);
      $('searchBtn').setAttribute('aria-expanded', String(open));
      if (!open) return;
    }
    $('q').focus({ preventScroll: true });
  }
  $('searchBtn').addEventListener('click', focusSearch);
  $('bnSearch').addEventListener('click', focusSearch);

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
    else { closeLayer($('pdSheet')); toast(p.name + ' (talla ' + S.sel.size + ') añadido al carrito'); }
  }
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
    var envio = free ? 0 : ENVIO;
    var total = Math.max(0, sub - disc);
    return { lines: lines, list: list, sub: sub, save: list - sub, disc: disc, free: free, shipPromo: shipPromo, envio: envio, total: total, totalConEnvio: total + envio, count: lines.reduce(function (s, l) { return s + l.qty; }, 0) };
  }
  function totalsHTML(c, pago) {
    var h = '<div><span>Productos</span><span>' + money(c.list) + '</span></div>';
    if (c.save) h += '<div class="save"><span>Promociones</span><span>-' + money(c.save) + '</span></div>';
    if (c.disc) h += '<div class="save"><span>Cupón ' + esc(S.coupon.code) + '</span><span>-' + money(c.disc) + '</span></div>';
    h += '<div><span>Envío' + (c.shipPromo && !(S.coupon && S.coupon.freeShipping) ? ' (' + esc(c.shipPromo.title) + ')' : '') + '</span><span>' + (c.free ? 'Gratis' : money(c.envio)) + '</span></div>';
    h += '<div class="grand"><span>Total</span><span>' + money(c.totalConEnvio) + '</span></div>';
    if (pago === 'Contraentrega') h += '<div><span>Pagas ahora por Nequi (anticipo de envío)</span><span>' + money(ENVIO) + '</span></div><div><span>Pagas al recibir</span><span>' + money(Math.max(0, c.totalConEnvio - ENVIO)) + '</span></div>';
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
    $('payNequiTxt').textContent = 'Pagas ' + money(c.totalConEnvio) + ' ahora con el QR que te mostramos.';
    $('payCodTxt').textContent = 'Pagas ' + money(ENVIO) + ' de anticipo del envío por Nequi y ' + money(Math.max(0, c.totalConEnvio - ENVIO)) + ' al recibir.';
  }
  document.querySelectorAll('input[name="pago"]').forEach(function (r) { r.addEventListener('change', renderCheckoutSummary); });
  function openCheckout(replace) {
    if (stack.indexOf($('cartSheet')) > -1) { closeLayer($('cartSheet'), false, true); replace = true; }
    if (S.order) { resumeOrder(replace); return; }
    if (!S.cart.length) return;
    renderCheckoutSummary(); showStep(1);
    $('orderErr').hidden = true;
    openLayer($('coSheet'), $('fNombre'), replace === true);
  }
  $('toCheckout').addEventListener('click', function () { openCheckout(); });

  function fieldErr(id, msg) { var i = $(id), e = $(id + '-e'); i.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } return !msg; }
  function telDigits(v) { var d = String(v || '').replace(/\D/g, ''); if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2); return d; }
  var sending = false;
  $('orderForm').addEventListener('submit', async function (e) {
    e.preventDefault(); if (sending) return;
    var v = function (id) { return $(id).value.trim(); };
    var checks = [
      ['fNombre', v('fNombre').length >= 3 ? '' : 'Escribe tu nombre y apellido.'],
      ['fTel', /^3\d{9}$/.test(telDigits(v('fTel'))) ? '' : 'Escribe un celular de 10 dígitos que empiece por 3.'],
      ['fCorreo', !v('fCorreo') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('fCorreo')) ? '' : 'Revisa el correo (ejemplo: nombre@correo.com).'],
      ['fDir', v('fDir').length >= 5 ? '' : 'Escribe la dirección de entrega.'],
      ['fCiudad', v('fCiudad').length >= 2 ? '' : 'Escribe la ciudad.']
    ];
    var firstBad = null;
    checks.forEach(function (c) { if (!fieldErr(c[0], c[1]) && !firstBad) firstBad = $(c[0]); });
    var cErr = !$('cTerm').checked ? 'Para continuar acepta los términos y condiciones.' : !$('cDatos').checked ? 'Para continuar autoriza el tratamiento de tus datos para gestionar el pedido.' : '';
    $('consent-e').textContent = cErr; $('consent-e').hidden = !cErr;
    if (cErr && !firstBad) firstBad = !$('cTerm').checked ? $('cTerm') : $('cDatos');
    if (firstBad) { firstBad.focus(); return; }

    sending = true; $('orderBtn').disabled = true; $('orderBtn').textContent = 'Guardando tu pedido…'; $('orderErr').hidden = true;
    var pago = currentPago();
    var customer = { nombre: v('fNombre'), telefono: telDigits(v('fTel')), cedula: v('fCed'), correo: v('fCorreo'), direccion: v('fDir'), barrio: v('fBarrio'), ciudad: v('fCiudad'), departamento: v('fDepto'), notas: v('fNotas'), pago: pago };
    try {
      var d = await api('/api/orders', { items: itemsPayload(), coupon: S.coupon ? S.coupon.code : '', customer: customer, consent: { terminos: true, datos: true, version: N.versionPoliticas || '' } });
      S.order = {
        numero: d.numero, ultimos4: customer.telefono.slice(-4), nombre: customer.nombre.split(' ')[0], ciudad: customer.ciudad,
        pago: d.pago, pricing: d.pricing, items: d.items.map(function (i) { return { brand: i.brand, name: i.name, size: i.size, color: i.color, qty: i.qty, price: i.price }; }),
        createdAt: d.createdAt, step: 'pago', at: Date.now()
      };
      store.set(K_ORDER, S.order);
      S.cart = []; S.coupon = null; saveCart(); renderCart(); $('couponIn').value = ''; $('couponMsg').textContent = '';
      $('orderForm').reset();
      renderPayment(); showStep(2);
      setTimeout(function () { $('payTitle').setAttribute('tabindex', '-1'); $('payTitle').focus(); }, 50);
    } catch (err) {
      $('orderErr').textContent = err instanceof TypeError ? 'No hay conexión. Tu carrito sigue guardado: revisa tu internet e intenta de nuevo.' : err.message;
      $('orderErr').hidden = false; $('orderErr').focus && $('orderErr').setAttribute('tabindex', '-1'); $('orderErr').focus();
      if (err.status === 400 && /cup[oó]n/i.test(err.message)) { S.coupon = null; saveCart(); renderCheckoutSummary(); }
    } finally { sending = false; $('orderBtn').disabled = false; $('orderBtn').textContent = 'Confirmar pedido e ir a pagar'; }
  });

  /* ---------------- pago Nequi ---------------- */
  function payValue() { var o = S.order; return o.pricing.pagarAhora != null ? o.pricing.pagarAhora : (o.pago === 'Nequi' ? o.pricing.totalConEnvio : ENVIO); }
  function renderPayment() {
    var o = S.order, val = payValue();
    $('payNo').textContent = o.numero;
    $('payTitle').textContent = o.pago === 'Contraentrega' ? 'Paga el anticipo del envío' : 'Paga con Nequi';
    $('payAmount').innerHTML = money(val) + '<small>' + (o.pago === 'Contraentrega' ? 'Anticipo de envío. El resto (' + money(o.pricing.saldoContraentrega) + ') lo pagas al recibir.' : 'Total de tu pedido con envío') + '</small>';
    $('payVal').textContent = money(val);
    $('payMsg').textContent = o.numero;
    $('payCodNote').hidden = o.pago !== 'Contraentrega';
    $('payCodNote').textContent = o.pricing.freeShipping ? 'Tu pedido tiene envío gratis: el anticipo se descuenta de lo que pagas al recibir.' : 'El anticipo cubre el envío y confirma tu pedido contraentrega.';
    $('payWa').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola kAIRO, pagué mi pedido ' + o.numero + ' por ' + money(val) + '. Te envío el comprobante.');
    $('fRef').value = ''; fieldErr('fRef', '');
    $('fReceipt').value = ''; $('fReceipt-status').textContent = '';
    if (N.pintar) N.pintar();
  }
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
  $('fReceipt').addEventListener('change', function () {
    var file = this.files && this.files[0];
    $('fReceipt-status').textContent = file ? 'Foto seleccionada: ' + file.name : '';
  });
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
    var ref = $('fRef').value.trim();
    if (!fieldErr('fRef', ref.length >= 3 ? '' : 'Escribe la referencia que aparece en tu comprobante de Nequi.')) { $('fRef').focus(); return; }
    var file = $('fReceipt').files && $('fReceipt').files[0];
    $('refBtn').disabled = true;
    try {
      $('fReceipt-status').textContent = file ? 'Preparando y enviando la foto…' : '';
      var comprobante = file ? await receiptData(file) : '';
      var result = await api('/api/track', {
        numero: S.order.numero, ultimos4: S.order.ultimos4, reportarPago: ref,
        ...(comprobante ? { comprobante: comprobante } : {})
      });
      S.order.comprobante = result.comprobanteRecibido;
      S.order.step = 'reportado'; store.set(K_ORDER, S.order);
      renderDone(); showStep(3); $('doneTitle').focus();
    } catch (err) {
      if (file) $('fReceipt-status').textContent = err instanceof TypeError ? 'No hay conexión. Intenta enviar la referencia y la foto de nuevo.' : err.message;
      else fieldErr('fRef', err instanceof TypeError ? 'No hay conexión. Tu pedido está guardado; intenta de nuevo en un momento.' : err.message);
      if (err.status === 409) { S.order.step = 'reportado'; store.set(K_ORDER, S.order); renderDone(); showStep(3); }
    } finally { $('refBtn').disabled = false; }
  });
  function orderLinks(o) { var q = '?pedido=' + encodeURIComponent(o.numero) + '&c=' + encodeURIComponent(o.ultimos4); return { recibo: '/recibo.html' + q, seg: '/seguimiento.html' + q }; }
  function renderDone() {
    var o = S.order, l = orderLinks(o);
    $('doneNo').textContent = o.numero;
    $('doneTxt').textContent = 'Gracias, ' + o.nombre + '. Recibimos la referencia de tu pago' + (o.comprobante ? ' y la foto del comprobante' : '') + '. Cuando la verifiquemos, tu pedido pasa a “Pago confirmado” y te escribimos por WhatsApp.';
    $('doneReceipt').href = l.recibo; $('doneTrack').href = l.seg;
    $('doneWa').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola kAIRO, tengo una pregunta sobre mi pedido ' + o.numero);
  }
  $('doneClose').addEventListener('click', function () { finishOrder(); closeLayer($('coSheet')); });
  function finishOrder() { S.order = null; store.del(K_ORDER); paying(false); renderResume(); }

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
    if (!o || stack.indexOf($('coSheet')) > -1) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = '<div class="wrap"><span><b>Pedido ' + esc(o.numero) + '</b> · ' + (o.step === 'pago' ? 'pendiente de pago' : 'pago reportado') + '</span>' +
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

  /* ---------------- ajustes ---------------- */
  function applySettings() {
    var s = S.settings || {};
    if (s.whatsapp && /^\d{10,13}$/.test(s.whatsapp)) WA = s.whatsapp;
    if (s.anticipo) ENVIO = Number(s.anticipo) || ENVIO;
    var m = encodeURIComponent('Hola kAIRO, quiero hacer una consulta.');
    $('waHelp').href = 'https://wa.me/' + WA + '?text=' + m;
    $('bnWa').href = 'https://wa.me/' + WA + '?text=' + m;
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
    renderNotices(); renderBrands(); renderHero(); renderChips(); renderGenders(); renderGrid(); renderCart();
    if (S.coupon && S.cart.length) applyCoupon(S.coupon.code, true);
    if (window.KairoLoader) window.KairoLoader.done();
  }

  restore();
  renderChips(); renderGenders(); renderBrands(); renderCart(); renderGrid();
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
    // Volvió después de una recarga o de cambiar a Nequi: lo llevamos directo al pago
    if (S.order && S.order.step === 'pago' && !stack.length) resumeOrder();
  });
  if (!document.getElementById('kLoader')) setTimeout(function () { window.dispatchEvent(new Event('kairo:ready')); }, 0);

  var hdr = $('hdr');
  window.addEventListener('scroll', function () { hdr.classList.toggle('scrolled', scrollY > 10); }, { passive: true });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { }); });
  }
})();
