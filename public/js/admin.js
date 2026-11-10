/* =====================================================================
   Panel de administración de kAIRO
   ===================================================================== */
(function () {
  'use strict';
  var TOKEN = null;
  try { TOKEN = sessionStorage.getItem('kairo_token'); } catch (e) { }
  var D = { products: [], orders: [], pqrs: [], settings: {}, promos: [], coupons: [], announcements: [] };
  var knownOrderIds = null;
  var ALL_SIZES = [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];
  var STEPS = ['Recibido', 'Pago confirmado', 'En preparación', 'Enviado', 'Entregado'];
  var STATUSES = STEPS.concat(['Cancelado']);
  var N = window.NEGOCIO || {};

  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var safeUrl = function (u) { u = String(u || '').trim(); return /^(https:\/\/|\/(?!\/))/.test(u) ? u : ''; };
  var fdate = function (d, time) { return d ? new Date(d).toLocaleString('es-CO', time === false ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
  function toast(msg, dur) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, dur || 2800); }

  async function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['x-admin-token'] = TOKEN;
    var res = await fetch('/api' + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') < 0) throw new Error('La API no está disponible en este despliegue');
    var data = {}; try { data = await res.json(); } catch (e) { }
    if (res.status === 401 && TOKEN) { logout(); throw new Error('Sesión vencida. Vuelve a entrar.'); }
    if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
    return data;
  }

  /* ---------------- ingreso ---------------- */
  // El panel se usa desde el navegador, nunca dentro de la app instalada de la tienda
  if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true) {
    TOKEN = null;
    $('loginForm').innerHTML = '<div class="logo"><img src="/img/kairo-logo-negro.png" alt="kAIRO Sneakers" width="243" height="52"></div>' +
      '<p>El panel de administración se abre desde el navegador, no desde la app.</p>' +
      '<a class="btn btn-primary" href="/admin.html" target="_blank" rel="noopener">Abrir en el navegador</a>';
    return;
  }
  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var pass = $('passInput').value;
    $('loginErr').textContent = '';
    if (!pass) { $('loginErr').textContent = 'Escribe la contraseña.'; $('passInput').focus(); return; }
    $('loginBtn').disabled = true; $('loginBtn').textContent = 'Verificando…';
    try {
      var r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') < 0) throw new Error('La API no está disponible en este despliegue');
      var data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Contraseña incorrecta');
      TOKEN = data.token; try { sessionStorage.setItem('kairo_token', TOKEN); } catch (x) { }
      enter();
    } catch (err) {
      $('loginErr').textContent = err instanceof TypeError ? 'No se pudo conectar con el servidor.' : err.message;
    } finally { $('loginBtn').disabled = false; $('loginBtn').textContent = 'Entrar'; }
  });
  function enter() { $('loginScreen').style.display = 'none'; $('app').classList.add('on'); loadAll(); $('main').focus(); }
  function logout() {
    TOKEN = null; try { sessionStorage.removeItem('kairo_token'); } catch (e) { }
    $('app').classList.remove('on'); $('loginScreen').style.display = 'flex'; $('passInput').value = ''; $('passInput').focus();
  }
  $('logoutBtn').addEventListener('click', logout);

  /* ---------------- navegación ---------------- */
  function menu(open) { $('app').classList.toggle('menu-open', open); $('adminMenuBtn').setAttribute('aria-expanded', String(open)); }
  $('adminMenuBtn').addEventListener('click', function () { menu(!$('app').classList.contains('menu-open')); });
  $('adminNavBackdrop').addEventListener('click', function () { menu(false); });
  $('adminMenuClose').addEventListener('click', function () { menu(false); $('adminMenuBtn').focus(); });
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.view); menu(false); });
  });
  function show(view) {
    document.querySelectorAll('[data-view]').forEach(function (x) { if (x.dataset.view === view) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
    $('adminMenuBtn').classList.toggle('on', !document.querySelector('.bnav [data-view="' + view + '"]'));
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'view-' + view); });
    $('main').focus({ preventScroll: true }); window.scrollTo(0, 0);
  }
  document.addEventListener('click', function (e) { if (e.target.closest('[data-reload]')) loadAll(); });

  /* En móvil las tablas se ven como tarjetas: cada celda lleva el nombre de su columna. */
  function labelTables() {
    document.querySelectorAll('.panel table').forEach(function (t) {
      var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.querySelector('.sr-only') ? '' : th.textContent.trim(); });
      t.querySelectorAll('tbody tr').forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i] && !td.hasAttribute('colspan')) td.setAttribute('data-label', heads[i]); });
      });
    });
  }
  var labelQueued = false;
  new MutationObserver(function () { if (labelQueued) return; labelQueued = true; requestAnimationFrame(function () { labelQueued = false; labelTables(); }); }).observe($('main'), { childList: true, subtree: true });

  /* ---------------- carga ---------------- */
  async function loadAll() {
    var jobs = {
      products: api('/admin/products'), orders: api('/admin/orders'), settings: api('/admin/settings'),
      promos: api('/admin/promos'), coupons: api('/admin/coupons'), announcements: api('/admin/announcements'), pqrs: api('/admin/pqrs'),
      stats: api('/admin/stats')
    };
    var keys = Object.keys(jobs), res = await Promise.allSettled(keys.map(function (k) { return jobs[k]; }));
    var errors = [];
    res.forEach(function (r, i) { var k = keys[i]; if (r.status === 'fulfilled') D[k] = r.value; else { errors.push(r.reason.message); if (k !== 'stats' && k !== 'settings') D[k + 'Error'] = r.reason.message; } });
    res.forEach(function (r, i) { if (r.status === 'fulfilled') delete D[keys[i] + 'Error']; });
    notifyNewOrders(D.orders);
    renderStats(); renderSales(); renderOrders(); renderProducts(); Object.keys(FORMS).forEach(renderForm); renderPqr(); fillSettings();
    if (errors.length) toast(errors[0], 5000);
  }
  /* Cada 20 s: con el panel a la vista se recarga todo; en segundo plano (u otra pestaña)
     solo se revisan los pedidos para sonar la alarma sin tocar lo que estés editando. */
  setInterval(function () {
    if (!TOKEN) return;
    if (document.visibilityState === 'visible' && !document.querySelector('.drawer.on')) loadAll();
    else api('/admin/orders').then(notifyNewOrders, function () { });
  }, 20000);
  function notifyNewOrders(list) {
    list = list || [];
    var ids = new Set(list.map(function (o) { return o.id; }));
    if (knownOrderIds) {
      var fresh = list.filter(function (o) { return !knownOrderIds.has(o.id); });
      if (fresh.length) {
        var o = fresh[0], msg = o.id + ' · ' + ((o.customer || {}).nombre || 'Cliente') + ' · ' + money(o.total);
        toast((fresh.length > 1 ? fresh.length + ' pedidos nuevos. Último: ' : 'Nuevo pedido: ') + msg, 8000);
        ring();
        flashTitle(fresh.length);
        if (navigator.vibrate) { try { navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { } }
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Nuevo pedido kAIRO', { body: msg, icon: '/img/icon-192.png', requireInteraction: true });
      }
    } else if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { } }
    knownOrderIds = ids;
  }

  /* ---------------- alarma de pedido nuevo ---------------- */
  var soundOn = true, actx = null, baseTitle = document.title, pendingTitle = 0;
  try { soundOn = localStorage.getItem('kairo_sonido') !== 'off'; } catch (e) { }
  function audio() {
    if (!actx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { actx = new C(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume().then(soundUi, soundUi);
    return actx;
  }
  // El navegador solo deja sonar audio después de que la persona toca la página
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { audio(); soundUi(); }, true); });
  /* Alarma fuerte: 3 rondas de timbre agudo de dos tonos (unos 4 segundos) */
  function ring(force) {
    if (!soundOn && !force) return;
    var c = audio(); if (!c) return;
    var t0 = c.currentTime + 0.05, out = c.createDynamicsCompressor();
    out.connect(c.destination);
    for (var r = 0; r < 3; r++) {
      [1175, 1568, 1175, 1568, 1175].forEach(function (f, i) {
        var o = c.createOscillator(), g = c.createGain(), s = t0 + r * 1.35 + i * 0.17;
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.9, s + 0.01);
        g.gain.setValueAtTime(0.9, s + 0.13);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
        o.connect(g); g.connect(out); o.start(s); o.stop(s + 0.17);
      });
    }
  }
  function flashTitle(n) {
    pendingTitle += n;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    document.title = '🔔 (' + pendingTitle + ') Nuevo pedido · kAIRO';
  }
  function clearTitle() { pendingTitle = 0; document.title = baseTitle; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') clearTitle(); });
  window.addEventListener('focus', clearTitle);
  function soundUi() {
    var b = $('soundToggle'); if (!b) return;
    b.setAttribute('aria-pressed', String(soundOn));
    b.textContent = soundOn ? '🔔 Sonido de pedidos: activado' : '🔕 Sonido de pedidos: apagado';
    $('soundHint').hidden = !(soundOn && (!actx || actx.state !== 'running'));
  }
  $('soundToggle').addEventListener('click', function () {
    soundOn = !soundOn;
    try { localStorage.setItem('kairo_sonido', soundOn ? 'on' : 'off'); } catch (e) { }
    soundUi(); toast(soundOn ? 'Sonará una alarma con cada pedido nuevo' : 'Alarma de pedidos apagada');
  });
  $('soundTest').addEventListener('click', function () { ring(true); soundUi(); });
  soundUi();

  /* ---------------- resumen ---------------- */
  function renderStats() {
    var s = D.stats || {};
    var waitingPay = D.orders.filter(function (o) { return o.status === 'Recibido'; }).length;
    var reported = D.orders.filter(function (o) { return o.status === 'Recibido' && o.customer && o.customer.pagoReportado; }).length;
    $('statsGrid').innerHTML = [
      { v: waitingPay, l: 'Pedidos por confirmar pago' }, { v: reported, l: 'Con pago reportado' },
      { v: D.orders.filter(function (o) { return o.status === 'En preparación' || o.status === 'Pago confirmado'; }).length, l: 'Por preparar' },
      { v: D.orders.filter(function (o) { return (o.customer || {}).entrega === 'Recoger' && ['Entregado', 'Cancelado'].indexOf(o.status) < 0; }).length, l: 'Para recoger en la tienda' },
      { v: D.orders.filter(function (o) { return (o.customer || {}).entrega === 'Domicilio' && ['Entregado', 'Cancelado'].indexOf(o.status) < 0; }).length, l: 'Domicilios por entregar' },
      { v: s.activeProducts != null ? s.activeProducts : D.products.filter(function (p) { return p.active !== false; }).length, l: 'Productos visibles' },
      { v: money(s.revenue || 0), l: 'Total pedidos (sin cancelados)' }, { v: s.pqrPending || 0, l: 'PQR sin responder' }
    ].map(function (x) { return '<div class="stat"><b>' + esc(x.v) + '</b><span>' + x.l + '</span></div>'; }).join('');
    $('navNew').hidden = !waitingPay; $('navNew').textContent = waitingPay; $('navNew').setAttribute('aria-label', waitingPay + ' por confirmar');
    var pq = s.pqrPending || D.pqrs.filter(function (p) { return p.estado === 'Radicada'; }).length;
    $('navPqr').hidden = !pq; $('navPqr').textContent = pq;
    $('bnNew').hidden = !waitingPay; $('bnNew').textContent = waitingPay; $('bnPqr').hidden = !pq; $('bnPqr').textContent = pq;
    $('recentOrders').innerHTML = D.orders.slice(0, 6).map(function (o) {
      return '<tr><td><b class="order-no">' + esc(o.id) + '</b><br><small>' + fdate(o.created_at) + '</small></td><td>' + esc((o.customer || {}).nombre || '—') + '<br><small>' + esc((o.customer || {}).entrega === 'Recoger' ? 'Recoge en la tienda' : (o.customer || {}).entrega === 'Domicilio' ? 'Domicilio' + ((o.customer || {}).barrio ? ' · ' + (o.customer || {}).barrio : '') : '') + '</small></td><td>' + money(o.total) + '</td><td>' + statusPill(o) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty">Todavía no hay pedidos.</td></tr>';
  }

  /* ---------------- estadísticas de ventas ---------------- */
  var salesPeriod = 'hoy';
  try { salesPeriod = localStorage.getItem('kairo_periodo') || 'hoy'; } catch (e) { }
  var PERIODS = [['hoy', 'Hoy', 'ayer'], ['semana', 'Últimos 7 días', 'los 7 días anteriores'], ['mes', 'Este mes', 'el mes pasado'], ['anio', 'Este año', 'el año pasado']];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  if (!PERIODS.some(function (p) { return p[0] === salesPeriod; })) salesPeriod = 'hoy';

  /* Inicio y fin del periodo (back = 1 es el periodo anterior) y sus columnas de la gráfica */
  function periodo(p, back) {
    var n = new Date(), y = n.getFullYear(), m = n.getMonth(), d = n.getDate(), s, e, cols = [];
    if (p === 'hoy') {
      s = new Date(y, m, d - back); e = new Date(y, m, d - back + 1);
      for (var h = 0; h < 24; h++) cols.push({ s: new Date(y, m, d - back, h), e: new Date(y, m, d - back, h + 1), l: (h % 12 || 12) + (h < 12 ? ' a. m.' : ' p. m.'), x: h % 3 === 0 ? (h % 12 || 12) + (h < 12 ? 'a' : 'p') : '' });
    } else if (p === 'semana') {
      s = new Date(y, m, d - 6 - 7 * back); e = new Date(y, m, d + 1 - 7 * back);
      for (var i = 0; i < 7; i++) {
        var a = new Date(y, m, d - 6 - 7 * back + i);
        cols.push({ s: a, e: new Date(y, m, d - 5 - 7 * back + i), l: DIAS[a.getDay()] + ' ' + a.getDate() + ' ' + MESES[a.getMonth()], x: DIAS[a.getDay()] + ' ' + a.getDate() });
      }
    } else if (p === 'mes') {
      s = new Date(y, m - back, 1); e = new Date(y, m - back + 1, 1);
      for (var dd = 1; dd <= new Date(y, m - back + 1, 0).getDate(); dd++) cols.push({ s: new Date(y, m - back, dd), e: new Date(y, m - back, dd + 1), l: dd + ' ' + MESES[s.getMonth()], x: dd === 1 || dd % 5 === 0 ? String(dd) : '' });
    } else {
      s = new Date(y - back, 0, 1); e = new Date(y - back + 1, 0, 1);
      for (var mm = 0; mm < 12; mm++) cols.push({ s: new Date(y - back, mm, 1), e: new Date(y - back, mm + 1, 1), l: MESES[mm] + ' ' + (y - back), x: MESES[mm] });
    }
    return { s: s, e: e, cols: cols };
  }
  function vendidos() { return D.orders.filter(function (o) { return o.status !== 'Cancelado'; }); }
  function enRango(o, s, e) { var t = new Date(o.created_at); return t >= s && t < e; }
  function resumenDe(list) {
    var r = { ventas: 0, pedidos: list.length, pares: 0, prods: {}, tallas: {} };
    list.forEach(function (o) {
      r.ventas += Number(o.total) || 0;
      (o.items || []).forEach(function (it) {
        var q = Number(it.qty) || 1, k = it.id || (it.brand + ' ' + it.name);
        r.pares += q;
        var p = r.prods[k] || (r.prods[k] = { name: it.name || 'Producto', brand: it.brand || '', pares: 0, ventas: 0 });
        p.pares += q; p.ventas += (Number(it.price) || 0) * q;
        if (it.size) r.tallas[it.size] = (r.tallas[it.size] || 0) + q;
      });
    });
    return r;
  }
  function moneyCorto(n) {
    if (n >= 1e6) return '$' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' mil';
    return money(n);
  }
  function topeBonito(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 2.5, 5, 10].map(function (k) { return k * p; }).filter(function (k) { return k >= v; })[0];
  }
  function cambio(act, prev, txt) {
    if (!prev) return act ? '<em>Sin ventas ' + txt + '</em>' : '<em>Igual que ' + txt + '</em>';
    var pc = Math.round((act - prev) / prev * 100);
    if (pc === 0) return '<em>Igual que ' + txt + '</em>';
    return '<em class="' + (pc > 0 ? 'up' : 'down') + '">' + (pc > 0 ? '▲ ' : '▼ ') + Math.abs(pc) + '% frente a ' + txt + '</em>';
  }
  function hbars(rows, unidad) {
    if (!rows.length) return '<p class="empty">Sin ventas en este periodo.</p>';
    var max = rows[0].v || 1;
    return '<ol class="hbars">' + rows.map(function (r) {
      return '<li><span class="nm">' + esc(r.n) + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</span>' +
        '<span class="tr" aria-hidden="true"><i style="--w:' + Math.max(2, r.v / max * 100) + '%"></i></span>' +
        '<span class="vl"><b>' + r.v + '</b> ' + unidad + (r.extra ? '<small>' + esc(r.extra) + '</small>' : '') + '</span></li>';
    }).join('') + '</ol>';
  }
  function renderSales() {
    if (!$('salesTabs')) return;
    var P = PERIODS.filter(function (p) { return p[0] === salesPeriod; })[0];
    $('salesTabs').innerHTML = PERIODS.map(function (p) { return '<button type="button" data-period="' + p[0] + '" aria-pressed="' + (p[0] === salesPeriod) + '">' + p[1] + '</button>'; }).join('');
    var act = periodo(salesPeriod, 0), ant = periodo(salesPeriod, 1), now = new Date();
    // Para comparar justo: el periodo anterior hasta el mismo punto (p. ej. ayer hasta esta hora)
    var antFin = new Date(Math.min(ant.e.getTime(), ant.s.getTime() + (Math.min(now, act.e) - act.s)));
    var base = vendidos();
    var lista = base.filter(function (o) { return enRango(o, act.s, act.e); });
    var R = resumenDe(lista), A = resumenDe(base.filter(function (o) { return enRango(o, ant.s, antFin); }));

    $('salesKpis').innerHTML = [
      { v: money(R.ventas), l: 'Ventas', c: cambio(R.ventas, A.ventas, P[2]) },
      { v: R.pedidos, l: 'Pedidos', c: cambio(R.pedidos, A.pedidos, P[2]) },
      { v: money(R.pedidos ? R.ventas / R.pedidos : 0), l: 'Promedio por pedido', c: '' },
      { v: R.pares, l: 'Pares vendidos', c: cambio(R.pares, A.pares, P[2]) }
    ].map(function (x) { return '<div class="stat"><b>' + esc(x.v) + '</b><span>' + x.l + '</span>' + x.c + '</div>'; }).join('');

    // Gráfica de ventas en el tiempo (una sola serie: columnas)
    var cols = act.cols.map(function (c) {
      var os = lista.filter(function (o) { return enRango(o, c.s, c.e); });
      return { l: c.l, x: c.x, v: os.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0), n: os.length };
    });
    var porQue = { hoy: 'por hora', semana: 'por día', mes: 'por día', anio: 'por mes' }[salesPeriod];
    $('salesChartTitle').textContent = 'Ventas ' + porQue;
    $('salesChartSub').textContent = R.pedidos ? P[1] + ': ' + money(R.ventas) + ' en ' + R.pedidos + (R.pedidos === 1 ? ' pedido' : ' pedidos') + '. Pasa el dedo o el mouse por las barras.' : P[1] + ': todavía no hay ventas.';
    var tope = topeBonito(Math.max.apply(null, cols.map(function (c) { return c.v; })));
    $('salesChart').innerHTML = '<div class="vchart"><div class="vchart__plot">' +
      '<div class="vchart__grid" aria-hidden="true">' + [0, 0.5, 1].map(function (k) { return '<span style="bottom:' + k * 100 + '%"><i>' + (k ? moneyCorto(tope * k) : '$0') + '</i></span>'; }).join('') + '</div>' +
      '<div class="vchart__bars">' + cols.map(function (c) {
        var tip = c.l + ': ' + money(c.v) + ' · ' + c.n + (c.n === 1 ? ' pedido' : ' pedidos');
        return '<div class="vbar' + (c.v ? '' : ' zero') + '" tabindex="0" role="img" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '"><span style="--h:' + (c.v / tope * 100) + '%"></span></div>';
      }).join('') + '</div><div class="chart-tip" hidden></div></div>' +
      '<div class="vchart__x" aria-hidden="true">' + cols.map(function (c) { return '<span>' + esc(c.x) + '</span>'; }).join('') + '</div></div>';
    $('salesTable').innerHTML = '<table><thead><tr><th scope="col">' + ({ hoy: 'Hora', anio: 'Mes' }[salesPeriod] || 'Día') + '</th><th scope="col">Pedidos</th><th scope="col">Ventas</th></tr></thead><tbody>' +
      cols.map(function (c) { return '<tr><td>' + esc(c.l) + '</td><td>' + c.n + '</td><td>' + money(c.v) + '</td></tr>'; }).join('') + '</tbody></table>';

    var top = Object.keys(R.prods).map(function (k) { return R.prods[k]; })
      .sort(function (a, b) { return b.pares - a.pares || b.ventas - a.ventas; }).slice(0, 8)
      .map(function (p) { return { n: p.name, sub: p.brand, v: p.pares, extra: money(p.ventas) }; });
    $('salesTop').innerHTML = hbars(top, 'pares');
    var tallas = Object.keys(R.tallas).map(function (t) { return { n: 'Talla ' + t, v: R.tallas[t] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    $('salesSizes').innerHTML = hbars(tallas, 'pares');
  }
  $('salesTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-period]'); if (!b) return;
    salesPeriod = b.dataset.period; try { localStorage.setItem('kairo_periodo', salesPeriod); } catch (x) { }
    renderSales();
  });
  // Globo con el valor de cada barra (mouse, dedo o teclado)
  function showTip(e) {
    var bar = e.target.closest && e.target.closest('.vbar'); if (!bar) return;
    var plot = bar.closest('.vchart__plot'), tip = plot.querySelector('.chart-tip');
    var pr = plot.getBoundingClientRect(), br = bar.getBoundingClientRect(), col = bar.firstChild.getBoundingClientRect();
    tip.textContent = bar.dataset.tip; tip.hidden = false;
    var x = br.left + br.width / 2 - pr.left, w = tip.offsetWidth;
    tip.style.left = Math.max(w / 2, Math.min(pr.width - w / 2, x)) + 'px';
    tip.style.top = Math.min(col.top, br.bottom - 2) - pr.top + 'px';
  }
  function hideTip(e) { var p = e.target.closest && e.target.closest('.vchart__plot'); if (p) p.querySelector('.chart-tip').hidden = true; }
  $('salesChart').addEventListener('pointerover', showTip);
  $('salesChart').addEventListener('focusin', showTip);
  $('salesChart').addEventListener('pointerleave', function () { var t = $('salesChart').querySelector('.chart-tip'); if (t) t.hidden = true; });
  $('salesChart').addEventListener('focusout', hideTip);

  var WOMPI_TXT = { APPROVED: 'pago aprobado', DECLINED: 'pago rechazado', VOIDED: 'pago anulado', ERROR: 'error en el pago', PENDING: 'pago en proceso', REVISAR: 'aprobado con valor distinto, revisar en Wompi' };
  var ENTREGA_TXT = { Recoger: 'Recoge en la tienda', Domicilio: 'Domicilio', Local: 'Local · Quibdó', Nacional: 'Nacional' };
  var PAGO_TXT = { Wompi: 'En línea (Wompi)', Nequi: 'Transferencia o QR', Contraentrega: 'Contraentrega', 'En tienda': 'Paga al recoger' };
  /* Nombre de cada estado según cómo se entrega y se paga (el valor guardado no cambia) */
  function stateLabel(k, c) {
    c = c || {};
    if (k === 'Pago confirmado' && c.pago === 'Contraentrega') return 'Anticipo confirmado';
    if (k === 'Pago confirmado' && c.pago === 'En tienda') return 'Pedido separado';
    if (k === 'Enviado' && c.entrega === 'Recoger') return 'Listo para recoger';
    if (k === 'Enviado' && c.entrega === 'Domicilio') return 'Domicilio en camino';
    if (k === 'Entregado' && c.entrega === 'Recoger') return 'Recogido';
    return k;
  }
  function entregaPill(c) {
    if (c.entrega === 'Recoger') return '<span class="pill lime">Recoge en la tienda</span>';
    if (c.entrega === 'Domicilio') return '<span class="pill on">Domicilio' + (c.barrio ? ' · ' + esc(c.barrio) : '') + '</span>';
    return c.entrega ? '<span class="pill off">' + esc(ENTREGA_TXT[c.entrega] || c.entrega) + '</span>' : '';
  }
  function statusPill(o) {
    var s = o.status, rep = o.customer && o.customer.pagoReportado;
    var cls = s === 'Cancelado' ? 'bad' : s === 'Recibido' ? (rep ? 'lime' : 'warn') : s === 'Entregado' ? 'on' : 'off';
    var c = o.customer || {}, sep = c.pago === 'En tienda';
    var label = s === 'Recibido' ? (rep ? 'Pago reportado' : sep ? 'Separado: confirmar' : c.pago === 'Wompi' ? 'Esperando pago en línea' : 'Esperando pago') : stateLabel(s, c);
    return '<span class="pill ' + cls + '">' + esc(label) + '</span>';
  }

  /* ---------------- pedidos ---------------- */
  var ordFilter = 'activos';
  var ORD_TABS = [['activos', 'Activos'], ['pago', 'Por confirmar pago'], ['despachar', 'Por preparar'], ['recoger', 'Para recoger'], ['domicilio', 'Domicilios'], ['Enviado', 'Enviados'], ['Entregado', 'Entregados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']];
  function ordMatch(o) {
    if (ordFilter === 'todos') return true;
    if (ordFilter === 'activos') return ['Entregado', 'Cancelado'].indexOf(o.status) < 0;
    if (ordFilter === 'pago') return o.status === 'Recibido';
    if (ordFilter === 'despachar') return o.status === 'Pago confirmado' || o.status === 'En preparación';
    var ent = (o.customer || {}).entrega, vivo = ['Entregado', 'Cancelado'].indexOf(o.status) < 0;
    if (ordFilter === 'recoger') return vivo && ent === 'Recoger';
    if (ordFilter === 'domicilio') return vivo && ent === 'Domicilio';
    return o.status === ordFilter;
  }
  function stepsOf(o) {
    var idx = STEPS.indexOf(o.status), h = (o.tracking && o.tracking.history) || [];
    var at = function (k) { for (var i = h.length - 1; i >= 0; i--) if (h[i].status === k) return h[i].at; return k === 'Recibido' ? o.created_at : null; };
    return STEPS.map(function (k, i) {
      var label = stateLabel(k, o.customer);
      return { label: label, state: o.status === 'Cancelado' ? 'todo' : i < idx ? 'done' : i === idx ? (i === STEPS.length - 1 ? 'done' : 'current') : 'todo', at: i <= idx ? at(k) : null };
    });
  }
  function trackLink(o) { var t = String((o.customer || {}).telefono || '').slice(-4); return location.origin + '/seguimiento.html?pedido=' + encodeURIComponent(o.id) + '&c=' + t; }
  function renderOrders() {
    $('ordTabs').innerHTML = ORD_TABS.map(function (t) {
      var n = D.orders.filter(function (o) { var f = ordFilter; ordFilter = t[0]; var m = ordMatch(o); ordFilter = f; return m; }).length;
      return '<button type="button" data-otab="' + t[0] + '" aria-pressed="' + (ordFilter === t[0]) + '">' + t[1] + ' (' + n + ')</button>';
    }).join('');
    var q = ($('ordSearch').value || '').trim().toLowerCase();
    var list = D.orders.filter(ordMatch).filter(function (o) {
      if (!q) return true; var c = o.customer || {};
      return (o.id + ' ' + (c.nombre || '') + ' ' + (c.telefono || '') + ' ' + (c.ciudad || '') + ' ' + (c.barrio || '') + ' ' + (ENTREGA_TXT[c.entrega] || '')).toLowerCase().indexOf(q) > -1;
    });
    if (D.ordersError) { $('orderList').innerHTML = '<p class="form-msg bad">' + esc(D.ordersError) + '</p>'; return; }
    $('orderList').innerHTML = list.map(function (o) {
      var c = o.customer || {}, pr = o.pricing || {}, t = o.tracking || {}, tel = String(c.telefono || '');
      var steps = stepsOf(o);
      var items = (o.items || []).map(function (i) { return '<li>' + esc(i.brand + ' ' + i.name) + ' — Talla ' + esc(i.size) + (i.color ? ' — ' + esc(i.color) : '') + ' × ' + esc(i.qty) + ' — ' + money(i.price * i.qty) + ' <small>(sin caja)</small></li>'; }).join('');
      var lines = '';
      if (pr.subtotal != null) {
        lines = '<div class="money-lines">' +
          (pr.promoSavings ? '<div><span>Ahorro por promociones</span><span>-' + money(pr.promoSavings) + '</span></div>' : '') +
          (pr.coupon && pr.coupon.discount ? '<div><span>Cupón ' + esc(pr.coupon.code) + '</span><span>-' + money(pr.coupon.discount) + '</span></div>' : '') +
          '<div><span>' + (c.entrega === 'Recoger' ? 'Recoge en la tienda' : c.entrega === 'Domicilio' ? 'Domicilio' + (c.barrio ? ' (' + esc(c.barrio) + ')' : '') : 'Envío') + '</span><span>' + (pr.envio ? money(pr.envio) : 'Gratis') + '</span></div>' +
          '<div><b>Total</b><b>' + money(pr.totalConEnvio != null ? pr.totalConEnvio : o.total) + '</b></div>' +
          (c.pago === 'En tienda' ? '<div><span>Cobrar al recoger</span><span>' + money(pr.saldoContraentrega) + '</span></div>' :
          c.pago === 'Contraentrega' ? '<div><span>Domicilio por transferencia</span><span>' + money(pr.pagarAhora) + '</span></div><div><span>Cobrar al entregar</span><span>' + money(pr.saldoContraentrega) + '</span></div>' : '<div><span>' + (c.pago === 'Wompi' ? 'Pago en línea (Wompi)' : 'Debe llegar a tu cuenta') + '</span><span>' + money(pr.pagarAhora) + '</span></div>') +
          '</div>';
      }
      var nom = (c.nombre || '').split(' ')[0];
      var waText = 'Hola ' + nom + ', te escribimos de kAIRO sobre tu pedido ' + o.id + '. Puedes ver el estado aquí: ' + trackLink(o);
      // Mensaje rápido según el tipo de entrega
      var waQuick = c.entrega === 'Recoger'
        ? ['Avisar: listo para recoger', 'Hola ' + nom + ', tu pedido ' + o.id + ' de kAIRO ya está listo para recoger en la tienda' + (N.direccion ? ' (' + N.direccion + ')' : '') + (N.horario ? ', horario ' + N.horario : '') + '.' + (c.pago === 'En tienda' && pr.saldoContraentrega ? ' Recuerda que pagas ' + money(pr.saldoContraentrega) + ' al recogerlo.' : '') + ' ¡Te esperamos!']
        : c.entrega === 'Domicilio'
        ? ['Avisar: va en camino', 'Hola ' + nom + ', tu pedido ' + o.id + ' de kAIRO va en camino a ' + (c.direccion || 'tu dirección') + (c.barrio ? ', barrio ' + c.barrio : '') + '.' + (pr.saldoContraentrega ? ' Ten listos ' + money(pr.saldoContraentrega) + ' para pagar al recibir.' : '')]
        : null;
      var isLocal = c.entrega === 'Recoger' || c.entrega === 'Domicilio';
      return '<article class="order-card' + (o.status === 'Recibido' ? ' is-new' : '') + '" aria-labelledby="o-' + esc(o.id) + '">' +
        '<div class="order-card__top"><div><h2 class="order-no" id="o-' + esc(o.id) + '">' + esc(o.id) + '</h2><small>' + fdate(o.created_at) + '</small></div><span class="big-price">' + money(o.total) + '</span></div>' +
        '<div class="order-meta">' + statusPill(o) + entregaPill(c) + '<span class="pill off">' + esc(PAGO_TXT[c.pago] || c.pago || 'Sin método') + '</span>' + (pr.coupon ? '<span class="pill off">Cupón ' + esc(pr.coupon.code) + '</span>' : '') + '<span class="pill warn">Sin caja</span></div>' +
        (c.wompi ? '<p class="ref-box"><b>Wompi: ' + esc(WOMPI_TXT[c.wompi.status] || c.wompi.status) + '</b>' + (c.wompi.metodo ? ' · ' + esc(c.wompi.metodo) : '') + ' · ' + money(c.wompi.valor) + ' <small>(' + fdate(c.wompi.at) + ')</small><br>Transacción ' + esc(c.wompi.transactionId) + ' · Ref. ' + esc(c.wompi.reference) + '</p>' : '') +
        (c.pagoReportado ? '<p class="ref-box"><b>El cliente reportó su pago</b>' + (c.pagoReportado.ref ? ' · Referencia: ' + esc(c.pagoReportado.ref) : '') + ' <small>(' + fdate(c.pagoReportado.at) + ')</small><br>Revisa que el pago llegó a tu cuenta (Nequi, Bancolombia…) antes de confirmar.' + (c.pagoReportado.hasComprobante ? ' <button class="btn btn-line btn-sm" type="button" data-proof="' + esc(o.id) + '">Ver foto del comprobante</button>' : '') + '</p>' : '') +
        '<p><b>' + esc(c.nombre || 'Sin nombre') + '</b> · ' + esc(tel) + (c.cedula ? ' · CC ' + esc(c.cedula) : '') + (c.correo ? ' · ' + esc(c.correo) : '') + '<br><small>' + (c.entrega === 'Recoger' ? '<b>Pasa a recoger a la tienda</b>' : (c.entrega ? '<b>' + esc(ENTREGA_TXT[c.entrega] || c.entrega) + '</b> · ' : '') + esc([c.direccion, c.barrio ? 'barrio ' + c.barrio : '', c.ciudad].filter(Boolean).join(', '))) + '</small>' + (c.notas ? '<br><small>Notas: ' + esc(c.notas) + '</small>' : '') + '</p>' +
        '<ul class="order-items">' + items + '</ul>' + lines +
        '<ol class="timeline" aria-label="Seguimiento del pedido">' + steps.map(function (s) { return '<li class="' + s.state + '">' + esc(s.label) + (s.at ? '<small>' + fdate(s.at) + '</small>' : '') + '</li>'; }).join('') + '</ol>' +
        '<form class="tl-form" data-track="' + esc(o.id) + '">' +
        '<div class="field"><label for="st-' + esc(o.id) + '">Estado</label><select id="st-' + esc(o.id) + '" name="status">' + STATUSES.map(function (s) { return '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + esc(stateLabel(s, c)) + '</option>'; }).join('') + '</select></div>' +
        (isLocal ? '<input type="hidden" name="guia" value="' + esc(t.guia || '') + '">' : '<div class="field"><label for="gu-' + esc(o.id) + '">Número de guía</label><input id="gu-' + esc(o.id) + '" name="guia" value="' + esc(t.guia || '') + '" maxlength="60"></div>') +
        (c.entrega === 'Recoger' ? '<input type="hidden" name="transportadora" value="' + esc(t.transportadora || '') + '">'
          : '<div class="field"><label for="tr-' + esc(o.id) + '">' + (c.entrega === 'Domicilio' ? 'Domiciliario' : 'Transportadora') + '</label><input id="tr-' + esc(o.id) + '" name="transportadora" list="' + (c.entrega === 'Domicilio' ? 'riders' : 'carriers') + '" value="' + esc(t.transportadora || '') + '" maxlength="60"' + (c.entrega === 'Domicilio' ? ' placeholder="Quién lo lleva"' : '') + '></div>') +
        '<div class="field full"><label for="no-' + esc(o.id) + '">Mensaje para el cliente (se ve en su seguimiento)</label><input id="no-' + esc(o.id) + '" name="nota" value="' + esc(t.nota || '') + '" maxlength="400" placeholder="' + (c.entrega === 'Recoger' ? 'Ej.: Ya está listo, pasa después de las 2 p. m.' : 'Ej.: Sale hoy en la tarde') + '"></div>' +
        '<div class="full order-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar seguimiento</button>' +
        '<button class="btn btn-line btn-sm" type="button" data-receipt="' + esc(o.id) + '">Ver recibo</button>' +
        '<button class="btn btn-line btn-sm" type="button" data-copylink="' + esc(o.id) + '">Copiar enlace de seguimiento</button>' +
        (tel ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/57' + esc(tel.slice(-10)) + '?text=' + encodeURIComponent(waText) + '">WhatsApp al cliente</a>' : '') +
        (tel && waQuick ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/57' + esc(tel.slice(-10)) + '?text=' + encodeURIComponent(waQuick[1]) + '">' + esc(waQuick[0]) + '</a>' : '') +
        '<button class="btn-danger" type="button" style="margin-left:auto" data-del="orders" data-id="' + esc(o.id) + '">Eliminar</button></div>' +
        '</form></article>';
    }).join('') || '<div class="panel"><p class="empty">No hay pedidos en esta vista.</p></div>';
    if (!$('carriers')) document.body.insertAdjacentHTML('beforeend', '<datalist id="carriers"><option>Servientrega</option><option>Interrapidísimo</option><option>Coordinadora</option><option>Envía</option><option>TCC</option><option>Deprisa</option><option>Entrega local</option></datalist><datalist id="riders"><option>Domiciliario de la tienda</option><option>Mototaxi</option></datalist>');
  }
  $('ordTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-otab]'); if (!b) return; ordFilter = b.dataset.otab; renderOrders(); });
  $('ordSearch').addEventListener('input', renderOrders);
  $('orderList').addEventListener('submit', async function (e) {
    var f = e.target.closest('[data-track]'); if (!f) return; e.preventDefault();
    var id = f.dataset.track, o = D.orders.find(function (x) { return x.id === id; });
    var body = { status: f.status.value, guia: f.guia.value.trim(), transportadora: f.transportadora.value.trim(), nota: f.nota.value.trim() };
    if (o && o.status === 'Recibido' && body.status !== 'Recibido' && body.status !== 'Cancelado' &&
      !(o.customer && o.customer.wompi && o.customer.wompi.status === 'APPROVED') &&
      !(o.customer && o.customer.pago === 'En tienda') &&
      !confirm('¿Ya verificaste' + (o.customer && o.customer.pago === 'Wompi' ? ' en Wompi' : ' en tu cuenta (Nequi, Bancolombia…)') + ' que llegó el pago de ' + money((o.pricing || {}).pagarAhora || o.total) + ' para el pedido ' + id + '?')) return;
    var btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      var upd = await api('/admin/orders/' + encodeURIComponent(id), { method: 'PUT', body: body });
      D.orders = D.orders.map(function (x) { return x.id === id ? upd : x; });
      renderOrders(); renderStats(); toast('Seguimiento de ' + id + ' guardado');
    } catch (err) { toast(err.message, 4500); btn.disabled = false; }
  });
  $('orderList').addEventListener('click', async function (e) {
    var r = e.target.closest('[data-receipt]'), cl = e.target.closest('[data-copylink]'), proof = e.target.closest('[data-proof]');
    if (r) printReceipt(D.orders.find(function (o) { return o.id === r.dataset.receipt; }));
    if (cl) { var o = D.orders.find(function (x) { return x.id === cl.dataset.copylink; }); try { await navigator.clipboard.writeText(trackLink(o)); toast('Enlace copiado'); } catch (x) { prompt('Copia el enlace:', trackLink(o)); } }
    if (proof) {
      var tab = window.open('about:blank', '_blank');
      if (!tab) { toast('Permite las ventanas emergentes para ver el comprobante'); return; }
      try {
        var result = await api('/admin/orders/' + encodeURIComponent(proof.dataset.proof) + '/comprobante');
        tab.location.replace(result.url);
      } catch (err) { tab.close(); toast(err.message, 4500); }
    }
  });

  /* Recibo completo del pedido (para imprimir o guardar en PDF) */
  function printReceipt(o) {
    if (!o) return;
    var c = o.customer || {}, pr = o.pricing || {};
    var w = window.open('', '_blank', 'width=760,height=900');
    if (!w) { toast('Permite las ventanas emergentes para ver el recibo'); return; }
    var biz = function (k) { return esc(N[k] || '[COMPLETAR]'); };
    var rows = (o.items || []).map(function (i) { return '<tr><td>' + esc(i.brand + ' ' + i.name) + '<small>Talla ' + esc(i.size) + (i.color ? ' · ' + esc(i.color) : '') + ' · Sin caja</small></td><td class="n">' + esc(i.qty) + '</td><td class="n">' + money(i.price) + '</td><td class="n">' + money(i.price * i.qty) + '</td></tr>'; }).join('');
    var sub = (o.items || []).reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var foot = '<tr><td colspan="3">Subtotal</td><td class="n">' + money(sub) + '</td></tr>' +
      (pr.coupon ? '<tr><td colspan="3">Cupón ' + esc(pr.coupon.code) + '</td><td class="n">-' + money(pr.coupon.discount) + '</td></tr>' : '') +
      (pr.envio != null ? '<tr><td colspan="3">' + (c.entrega === 'Recoger' ? 'Recoger en la tienda' : c.entrega === 'Domicilio' ? 'Domicilio' + (c.barrio ? ' (' + esc(c.barrio) + ')' : '') : 'Envío') + '</td><td class="n">' + (pr.envio ? money(pr.envio) : 'Gratis') + '</td></tr>' : '') +
      '<tr class="g"><td colspan="3">Total</td><td class="n">' + money(o.total) + '</td></tr>';
    w.document.write('<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><title>Recibo ' + esc(o.id) + '</title><link rel="stylesheet" href="/css/fonts.css"><style>' +
      'body{font-family:Manrope,Arial,sans-serif;color:#0e0e0e;max-width:720px;margin:32px auto;padding:0 24px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0e0e0e;padding-bottom:14px}' +
      '.top img{height:48px}.no{text-align:right}.no small{display:block;font-size:11px;font-weight:800;color:#55635c;text-transform:uppercase;letter-spacing:.06em}.no b{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:26px;letter-spacing:.03em}' +
      '.biz{font-size:12px;color:#55635c;margin-top:6px;line-height:1.5}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px;margin:16px 0}.grid b{display:block;font-size:11px;color:#55635c;text-transform:uppercase}' +
      'table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 6px;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;color:#55635c}td small{display:block;color:#55635c}.n{text-align:right;white-space:nowrap}' +
      'tfoot td{border-bottom:0;padding:5px 6px}tr.g td{font-weight:800;font-size:15px;border-top:2px solid #0e0e0e}.legal{font-size:11px;color:#55635c;margin-top:18px;border-top:1px solid #ddd;padding-top:10px}' +
      'button{margin-top:18px;padding:10px 18px;border-radius:999px;border:0;background:#0e4d38;color:#fff;font-weight:800;cursor:pointer}@media print{button{display:none}}</style></head><body>' +
      '<div class="top"><div><img src="/img/kairo-logo-negro.png" alt="kAIRO Sneakers"><div class="biz">' + biz('responsable') + ' · NIT ' + biz('nit') + '<br>' + biz('direccion') + ', ' + biz('ciudad') + '<br>WhatsApp ' + biz('telefonoVisible') + '</div></div>' +
      '<div class="no"><small>Recibo de pedido</small><b>' + esc(o.id) + '</b><br><small>' + esc(o.status) + '</small></div></div>' +
      '<div class="grid"><div><b>Fecha</b>' + fdate(o.created_at) + '</div><div><b>Forma de pago</b>' + esc(PAGO_TXT[c.pago] || c.pago || '') + (c.pagoReportado ? ' · Ref. ' + esc(c.pagoReportado.ref) : '') + '</div>' +
      '<div><b>Cliente</b>' + esc(c.nombre || '') + (c.cedula ? ' · CC ' + esc(c.cedula) : '') + '<br>' + esc(c.telefono || '') + '</div><div><b>Entrega</b>' + (c.entrega === 'Recoger' ? 'Recoge en la tienda' : esc([c.direccion, c.barrio ? 'barrio ' + c.barrio : '', c.ciudad].filter(Boolean).join(', '))) + '</div>' +
      ((o.tracking || {}).guia ? '<div><b>Guía</b>' + esc(o.tracking.guia) + ' ' + esc(o.tracking.transportadora || '') + '</div>' : '') +
      ((c.pago === 'Contraentrega' || c.pago === 'En tienda') && pr.saldoContraentrega != null ? '<div><b>' + (c.pago === 'En tienda' ? 'Cobrar al recoger' : 'Cobrar al entregar') + '</b>' + money(pr.saldoContraentrega) + '</div>' : '') + '</div>' +
      '<table><thead><tr><th>Producto</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Valor</th></tr></thead><tbody>' + rows + '</tbody><tfoot>' + foot + '</tfoot></table>' +
      '<p class="legal">Todos los productos se entregan sin caja. Este recibo no reemplaza la factura electrónica de venta.</p>' +
      '<button onclick="print()">Imprimir o guardar en PDF</button></body></html>');
    w.document.close();
  }

  /* ---------------- productos ---------------- */
  var editingProduct = null, prodImageUrl = '', pickedSizes = new Set();
  function art(p) {
    var img = safeUrl(p.image);
    if (img) return '<img src="' + esc(img) + '" alt="">';
    var shape = p.category === 'Sandalias' ? 's-sandal' : p.category === 'Chanclas' ? 's-slide' : (p.shape || 's-low');
    return '<svg viewBox="0 0 260 140" style="color:' + esc(p.shoeColor || '#1d2733') + '" aria-hidden="true"><use href="#' + esc(shape) + '"/></svg>';
  }
  function renderProducts() {
    var q = ($('prodSearch').value || '').toLowerCase(), cat = $('prodCat').value, gen = $('prodGen').value;
    var list = D.products.filter(function (p) { return (!cat || p.category === cat) && (!gen || p.gender === gen) && (!q || (p.name + ' ' + p.brand).toLowerCase().indexOf(q) > -1); });
    $('productRows').innerHTML = list.map(function (p) {
      return '<tr><td><div class="cell-name"><div class="thumb" style="background:' + esc(p.bg || '#e2f0e8') + '">' + art(p) + '</div><div><b>' + esc(p.name) + '</b><small>' + esc(p.brand) + (p.tag ? ' · ' + esc(p.tag) : '') + '</small></div></div></td>' +
        '<td>' + esc(p.category) + '<br><small>' + esc(p.gender) + '</small></td>' +
        '<td>' + (p.salePrice ? '<span class="was">' + money(p.price) + '</span>' + money(p.salePrice) : money(p.price)) + '</td>' +
        '<td>' + esc(p.stock != null ? p.stock : 0) + '</td>' +
        '<td><span class="pill ' + (p.active === false ? 'off' : 'on') + '">' + (p.active === false ? 'Oculto' : 'Visible') + '</span>' + (p.featured ? ' <span class="pill warn">Destacado</span>' : '') + '</td>' +
        '<td><div class="row-actions"><button class="btn btn-line btn-sm" type="button" data-editp="' + esc(p.id) + '">Editar<span class="sr-only"> ' + esc(p.name) + '</span></button><button class="btn-danger" type="button" data-del="products" data-id="' + esc(p.id) + '">Eliminar<span class="sr-only"> ' + esc(p.name) + '</span></button></div></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">' + esc(D.productsError || 'No hay productos con ese filtro.') + '</td></tr>';
  }
  ['prodSearch', 'prodCat', 'prodGen'].forEach(function (id) { $(id).addEventListener('input', renderProducts); });
  $('productRows').addEventListener('click', function (e) { var b = e.target.closest('[data-editp]'); if (b) openProduct(b.dataset.editp); });
  $('newProduct').addEventListener('click', function () { openProduct(null); });
  function openProduct(id) {
    editingProduct = id ? D.products.find(function (p) { return p.id === id; }) : null;
    var p = editingProduct || {};
    $('prodDrawerTitle').textContent = editingProduct ? 'Editar producto' : 'Nuevo producto';
    $('pName').value = p.name || ''; $('pBrand').value = p.brand || '';
    $('pCat').value = p.category || 'Tenis'; $('pGen').value = p.gender || 'Unisex';
    $('pPrice').value = p.price || ''; $('pSale').value = p.salePrice || ''; $('pStock').value = p.stock != null ? p.stock : 10;
    $('pTag').value = p.tag || ''; $('pDesc').value = p.desc || '';
    $('pShape').value = p.shape || 's-low'; $('pShoeColor').value = p.shoeColor || '#1d2733'; $('pBg').value = p.bg || '#e2f0e8';
    $('pActive').checked = p.active !== false; $('pFeatured').checked = !!p.featured;
    prodImageUrl = p.image || '';
    pickedSizes = new Set(p.sizes && p.sizes.length ? p.sizes.map(Number) : [36, 37, 38, 39, 40, 41, 42, 43]);
    $('sizeChips').innerHTML = ALL_SIZES.map(function (s) { return '<button type="button" class="size-chip' + (pickedSizes.has(s) ? ' on' : '') + '" data-sz="' + s + '" aria-pressed="' + pickedSizes.has(s) + '">' + s + '</button>'; }).join('');
    $('colorRows').innerHTML = (p.colors && p.colors.length ? p.colors : [{ n: 'Negro', h: '#1d2733' }]).map(colorRow).join('');
    $('prodFile').value = ''; $('prodErr').hidden = true;
    prodPreview(); openDrawer('productDrawer');
  }
  $('sizeChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sz]'); if (!b) return; var s = Number(b.dataset.sz);
    if (pickedSizes.has(s)) pickedSizes.delete(s); else pickedSizes.add(s);
    b.classList.toggle('on', pickedSizes.has(s)); b.setAttribute('aria-pressed', pickedSizes.has(s));
  });
  function prodPreview() {
    $('prodPreview').style.background = $('pBg').value;
    $('prodPreview').innerHTML = art({ image: prodImageUrl, shape: $('pShape').value, shoeColor: $('pShoeColor').value, category: $('pCat').value });
    $('prodImgRemove').hidden = !prodImageUrl;
  }
  ['pShape', 'pShoeColor', 'pBg', 'pCat'].forEach(function (id) { $(id).addEventListener('input', prodPreview); });
  $('prodImgRemove').addEventListener('click', function () { prodImageUrl = ''; prodPreview(); });
  var cr = 0;
  function colorRow(c) {
    cr++;
    return '<div class="color-row" data-image="' + esc(c.image || '') + '"><label class="sr-only" for="cn' + cr + '">Nombre del color</label><input id="cn' + cr + '" type="text" value="' + esc(c.n || '') + '" placeholder="Nombre del color">' +
      '<label class="sr-only" for="ch' + cr + '">Tono</label><input id="ch' + cr + '" type="color" value="' + esc(c.h || '#333333') + '">' +
      '<label class="sr-only" for="cf' + cr + '">Foto de este color</label><input id="cf' + cr + '" class="color-image" type="file" accept="image/png,image/jpeg,image/webp">' +
      '<div class="color-image-preview">' + (safeUrl(c.image) ? '<img src="' + esc(c.image) + '" alt="">' : '<span>Sin foto</span>') + '</div>' +
      '<button type="button" data-rmcolor aria-label="Quitar este color">✕</button></div>';
  }
  $('addColor').addEventListener('click', function () { $('colorRows').insertAdjacentHTML('beforeend', colorRow({ n: '', h: '#333333' })); });
  $('colorRows').addEventListener('click', function (e) { if (e.target.closest('[data-rmcolor]')) e.target.closest('.color-row').remove(); });
  $('colorRows').addEventListener('change', async function (e) {
    if (!e.target.classList.contains('color-image')) return;
    var row = e.target.closest('.color-row'), url = await upload(e.target.files[0]);
    if (url) { row.dataset.image = url; row.querySelector('.color-image-preview').innerHTML = '<img src="' + esc(url) + '" alt="">'; }
  });
  $('prodFile').addEventListener('change', async function () { var url = await upload(this.files[0]); if (url) { prodImageUrl = url; prodPreview(); } });
  function fileToDataURL(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(new Error('No se pudo leer el archivo')); }; r.readAsDataURL(file); }); }
  async function upload(file) {
    if (!file) return '';
    if (file.size > 5 * 1024 * 1024) { toast('La imagen pesa más de 5 MB'); return ''; }
    try { toast('Subiendo imagen…'); var r = await api('/admin/upload', { method: 'POST', body: { name: file.name, data: await fileToDataURL(file) } }); toast('Imagen subida'); return r.url; }
    catch (err) { toast('Error al subir: ' + err.message, 4500); return ''; }
  }
  $('saveProduct').addEventListener('click', async function () {
    var colors = Array.prototype.map.call($('colorRows').querySelectorAll('.color-row'), function (row) {
      return { n: row.querySelector('input[type=text]').value.trim() || 'Color', h: row.querySelector('input[type=color]').value, image: row.dataset.image || '' };
    });
    var body = {
      name: $('pName').value.trim(), brand: $('pBrand').value.trim(), category: $('pCat').value, gender: $('pGen').value,
      price: Number($('pPrice').value) || 0, salePrice: Number($('pSale').value) || null, stock: Number($('pStock').value) || 0,
      tag: $('pTag').value.trim(), desc: $('pDesc').value.trim(), sizes: Array.from(pickedSizes).sort(function (a, b) { return a - b; }),
      colors: colors.length ? colors : [{ n: 'Único', h: '#1d2733' }], image: prodImageUrl,
      shape: $('pShape').value, shoeColor: $('pShoeColor').value, bg: $('pBg').value,
      active: $('pActive').checked, featured: $('pFeatured').checked
    };
    var bad = !body.name ? ['pName', 'Escribe el nombre del producto.'] : !body.brand ? ['pBrand', 'Escribe la marca.'] : !body.price ? ['pPrice', 'Escribe el precio.'] : body.salePrice && body.salePrice >= body.price ? ['pSale', 'El precio de oferta debe ser menor que el precio normal.'] : !body.sizes.length ? ['sizeChips', 'Elige al menos una talla.'] : null;
    // El mensaje queda al final del cajón: lo mostramos también en un aviso y llevamos al campo
    function showErr(msg, field) {
      $('prodErr').textContent = msg; $('prodErr').hidden = false; toast(msg, 4500);
      var f = field && $(field);
      if (f) { f.scrollIntoView({ block: 'center' }); if (f.focus) f.focus(); } else $('prodErr').scrollIntoView({ block: 'nearest' });
    }
    if (bad) { showErr(bad[1], bad[0]); return; }
    $('prodErr').hidden = true;
    var btn = this; btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (editingProduct) await api('/admin/products/' + encodeURIComponent(editingProduct.id), { method: 'PUT', body: body });
      else await api('/admin/products', { method: 'POST', body: body });
      closeDrawers(); toast('Producto guardado'); await loadAll();
    } catch (err) { showErr('No se guardó: ' + err.message); }
    finally { btn.disabled = false; btn.textContent = 'Guardar producto'; }
  });

  /* ---------------- formularios genéricos ---------------- */
  var LINK_OPTS = [['ninguno', 'Sin enlace'], ['producto', 'Un producto'], ['marca', 'Una marca'], ['categoria', 'Una categoría'], ['genero', 'Hombre o Mujer'], ['url', 'Una página (https:// o /)']];
  var SCOPE_OPTS = [['todo', 'Toda la tienda'], ['marca', 'Una marca'], ['categoria', 'Una categoría'], ['genero', 'Hombre o Mujer'], ['producto', 'Un producto']];
  var DATES = [
    { k: 'starts_at', l: 'Empieza', t: 'datetime', half: 1 }, { k: 'ends_at', l: 'Termina', t: 'datetime', half: 1, h: 'Vacío = sin fecha de fin.' }
  ];
  var FORMS = {
    promos: {
      endpoint: 'promos', key: 'id', title: 'Promociones', one: 'promoción',
      intro: 'Las promociones de “descuento” bajan el precio real en la tienda y en el cobro. Las de “envío gratis” quitan el envío desde un valor mínimo. Las “informativas” solo muestran un aviso.',
      help: 'Ley 1480: publica siempre las condiciones (a qué aplica, desde y hasta cuándo, si hay límite de unidades). No anuncies un “antes” que nunca existió.',
      fields: [
        { k: 'title', l: 'Título *', t: 'text', max: 80 },
        { k: 'kind', l: 'Tipo', t: 'select', opts: [['descuento', 'Descuento en el precio'], ['envio', 'Envío gratis'], ['informativa', 'Solo informativa']] },
        { k: 'discount', l: 'Descuento %', t: 'number', min: 0, max: 90, half: 1, showIf: { kind: 'descuento' } },
        { k: 'min_subtotal', l: 'Compra mínima ($)', t: 'number', min: 0, half: 1, showIf: { kind: 'envio' } },
        { k: 'scope_type', l: 'Aplica a', t: 'select', opts: SCOPE_OPTS, half: 1, showIf: { kind: 'descuento' } },
        { k: 'scope_value', l: '¿Cuál?', t: 'scope', half: 1, showIf: { kind: 'descuento' } },
        { k: 'badge', l: 'Etiqueta corta', t: 'text', max: 30, half: 1, h: 'Ej.: -20%, Envío gratis' },
        { k: 'description', l: 'Descripción', t: 'textarea', max: 300 },
        { k: 'conditions', l: 'Condiciones *', t: 'textarea', max: 1500, h: 'Obligatorias para descuento y envío gratis.' }
      ].concat(DATES).concat([{ k: 'active', l: 'Activa', t: 'check', def: true }]),
      cols: function (r) {
        var what = r.kind === 'descuento' ? r.discount + '% · ' + scopeTxt(r) : r.kind === 'envio' ? 'Envío gratis desde ' + money(r.min_subtotal) : 'Informativa';
        return ['<b>' + esc(r.title) + '</b><br><small>' + esc(r.description || '') + '</small>', esc(what), periodTxt(r), activeTxt(r)];
      },
      heads: ['Promoción', 'Qué hace', 'Vigencia', 'Estado']
    },
    coupons: {
      endpoint: 'coupons', key: 'code', title: 'Cupones', one: 'cupón',
      intro: 'El cliente escribe el código en el carrito. El descuento se valida en el servidor y el uso se cuenta cuando se registra el pedido.',
      help: 'Publica las condiciones del cupón donde lo compartas (mínimo de compra, vigencia, límite de usos).',
      fields: [
        { k: 'code', l: 'Código *', t: 'text', max: 30, upper: 1, onlyNew: 1, h: 'Letras y números, sin espacios. Ej.: KAIRO10' },
        { k: 'type', l: 'Tipo', t: 'select', opts: [['porcentaje', 'Porcentaje'], ['valor', 'Valor fijo en pesos'], ['envio', 'Envío gratis']], half: 1 },
        { k: 'value', l: 'Valor (% o $)', t: 'number', min: 0, half: 1, showIf: { type: ['porcentaje', 'valor'] } },
        { k: 'max_discount', l: 'Tope del descuento ($)', t: 'number', min: 0, half: 1, h: '0 = sin tope', showIf: { type: 'porcentaje' } },
        { k: 'min_subtotal', l: 'Compra mínima ($)', t: 'number', min: 0, half: 1 },
        { k: 'max_uses', l: 'Usos máximos', t: 'number', min: 0, half: 1, h: '0 = sin límite' },
        { k: 'description', l: 'Descripción', t: 'text', max: 200 },
        { k: 'conditions', l: 'Condiciones', t: 'textarea', max: 1500 }
      ].concat(DATES).concat([{ k: 'active', l: 'Activo', t: 'check', def: true }]),
      cols: function (r) {
        var what = r.type === 'porcentaje' ? r.value + '%' + (r.max_discount ? ' (tope ' + money(r.max_discount) + ')' : '') : r.type === 'valor' ? money(r.value) : 'Envío gratis';
        return ['<b>' + esc(r.code) + '</b><br><small>' + esc(r.description || '') + '</small>', esc(what) + (r.min_subtotal ? '<br><small>Desde ' + money(r.min_subtotal) + '</small>' : ''), esc((r.uses || 0) + (r.max_uses ? ' / ' + r.max_uses : '')) + ' usos', periodTxt(r), activeTxt(r)];
      },
      heads: ['Cupón', 'Descuento', 'Usos', 'Vigencia', 'Estado']
    },
    banners: {
      endpoint: 'announcements', kind: 'banner', key: 'id', title: 'Banners del inicio', one: 'banner',
      intro: 'Aparecen en el carrusel de arriba. Si no hay banners activos, la tienda muestra los productos destacados.',
      fields: [
        { k: 'title', l: 'Título *', t: 'text', max: 90 }, { k: 'subtitle', l: 'Texto', t: 'textarea', max: 220 },
        { k: 'button_text', l: 'Texto del botón', t: 'text', max: 30, half: 1 }, { k: 'color', l: 'Color de fondo', t: 'color', half: 1, def: '#0e4d38', h: 'El texto se pone blanco u oscuro según el color, para que se lea.' },
        { k: 'link_type', l: 'Al tocar el botón, llevar a', t: 'select', opts: LINK_OPTS, half: 1 }, { k: 'link_value', l: '¿Cuál?', t: 'scope', half: 1 },
        { k: 'image', l: 'Imagen del banner (opcional)', t: 'image', h: 'Si eliges “Un producto”, se usa la foto de ese producto.' }
      ].concat(DATES).concat([{ k: 'position', l: 'Orden', t: 'number', min: 0, half: 1 }, { k: 'active', l: 'Activo', t: 'check', def: true }]),
      cols: function (r) { return ['<b>' + esc(r.title) + '</b><br><small>' + esc(r.subtitle || '') + '</small>', '<span class="pill off" style="background:' + esc(r.color) + ';color:#fff">' + esc(r.color) + '</span>', periodTxt(r), activeTxt(r)]; },
      heads: ['Banner', 'Color', 'Vigencia', 'Estado']
    },
    barra: {
      endpoint: 'announcements', kind: 'barra', key: 'id', title: 'Barra de aviso', one: 'aviso',
      intro: 'Una franja negra en la parte de arriba de la tienda. Se muestra el primer aviso activo.',
      fields: [
        { k: 'title', l: 'Mensaje *', t: 'text', max: 90 }, { k: 'subtitle', l: 'Complemento', t: 'text', max: 220 },
        { k: 'button_text', l: 'Texto del enlace', t: 'text', max: 30, half: 1 }, { k: 'link_type', l: 'Llevar a', t: 'select', opts: LINK_OPTS, half: 1 }, { k: 'link_value', l: '¿Cuál?', t: 'scope' }
      ].concat(DATES).concat([{ k: 'active', l: 'Activo', t: 'check', def: true }]),
      cols: function (r) { return ['<b>' + esc(r.title) + '</b>', periodTxt(r), activeTxt(r)]; },
      heads: ['Aviso', 'Vigencia', 'Estado']
    },
    dinamicas: {
      endpoint: 'announcements', kind: 'dinamica', key: 'id', title: 'Dinámicas', one: 'dinámica',
      intro: 'Retos, concursos y actividades para tus clientes, con sus bases publicadas.',
      help: '<b>Importante:</b> si el ganador se elige al azar (sorteo, rifa, “etiqueta y gana” por sorteo), en Colombia necesitas autorización de Coljuegos (Ley 643 de 2001). Sin el número de autorización, el panel no deja activarla. Los concursos donde gana el mejor (por mérito) no son juegos de suerte y azar.',
      fields: [
        { k: 'title', l: 'Nombre *', t: 'text', max: 90 }, { k: 'subtitle', l: 'Resumen', t: 'textarea', max: 220 },
        { k: 'conditions', l: 'Bases completas *', t: 'textarea', max: 3000, rows: 8, h: 'Cómo participar, fechas, premio, cómo se elige al ganador, cómo y cuándo se entrega, y quién no puede participar.' },
        { k: 'has_chance', l: 'El ganador se elige al azar (sorteo o rifa)', t: 'check' },
        { k: 'coljuegos_ref', l: 'Número de autorización de Coljuegos', t: 'text', max: 60, showIf: { has_chance: true } }
      ].concat(DATES).concat([{ k: 'active', l: 'Activa', t: 'check', def: false }]),
      cols: function (r) { return ['<b>' + esc(r.title) + '</b><br><small>' + esc(r.subtitle || '') + '</small>', r.has_chance ? (r.coljuegos_ref ? 'Sorteo · Coljuegos ' + esc(r.coljuegos_ref) : '<span class="pill bad">Sorteo sin autorización</span>') : 'Por mérito', periodTxt(r), activeTxt(r)]; },
      heads: ['Dinámica', 'Tipo', 'Vigencia', 'Estado']
    }
  };
  function scopeTxt(r) { var t = r.scope_type || 'todo'; if (t === 'todo') return 'toda la tienda'; var v = r.scope_value || ''; if (t === 'producto') { var p = D.products.find(function (x) { return x.id === v; }); v = p ? p.brand + ' ' + p.name : v; } return v; }
  function periodTxt(r) { return r.starts_at || r.ends_at ? (r.starts_at ? fdate(r.starts_at, false) : 'Ya') + ' → ' + (r.ends_at ? fdate(r.ends_at, false) : 'sin fin') : 'Sin fechas'; }
  function activeTxt(r) {
    var now = new Date(), live = r.active !== false && (!r.starts_at || new Date(r.starts_at) <= now) && (!r.ends_at || new Date(r.ends_at) >= now);
    return '<span class="pill ' + (live ? 'on' : 'off') + '">' + (r.active === false ? 'Inactiva' : live ? 'Publicada' : r.ends_at && new Date(r.ends_at) < now ? 'Vencida' : 'Programada') + '</span>';
  }
  function rowsOf(name) { var c = FORMS[name], all = D[c.endpoint] || []; return c.kind ? all.filter(function (r) { return r.kind === c.kind; }) : all; }
  function renderForm(name) {
    var c = FORMS[name], sec = document.querySelector('[data-form="' + name + '"]'), err = D[c.endpoint + 'Error'];
    var rows = rowsOf(name);
    sec.innerHTML = '<div class="head"><div><h1 class="display" id="h-' + name + '">' + c.title + '</h1><p>' + c.intro + '</p></div><button class="btn btn-primary" type="button" data-new="' + name + '">+ Nuevo ' + (c.one === 'promoción' || c.one === 'dinámica' ? 'registro' : c.one) + '</button></div>' +
      (c.help ? '<p class="help-box">' + c.help + '</p>' : '') +
      (err ? '<p class="form-msg bad">' + esc(err) + '</p>' : '') +
      '<div class="panel"><table><caption class="sr-only">' + c.title + '</caption><thead><tr>' + c.heads.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') + '<th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>' +
      (rows.map(function (r) {
        var id = r[c.key];
        return '<tr>' + c.cols(r).map(function (x) { return '<td>' + x + '</td>'; }).join('') + '<td><div class="row-actions"><button class="btn btn-line btn-sm" type="button" data-edit="' + name + '" data-id="' + esc(id) + '">Editar</button><button class="btn-danger" type="button" data-del="' + c.endpoint + '" data-id="' + esc(id) + '">Eliminar</button></div></td></tr>';
      }).join('') || '<tr><td colspan="' + (c.heads.length + 1) + '" class="empty">Aún no hay registros.</td></tr>') + '</tbody></table></div>';
    sec.setAttribute('aria-labelledby', 'h-' + name);
  }
  var editing = null;
  document.addEventListener('click', function (e) {
    var n = e.target.closest('[data-new]'), ed = e.target.closest('[data-edit]');
    if (n) openForm(n.dataset.new, null);
    if (ed) openForm(ed.dataset.edit, rowsOf(ed.dataset.edit).find(function (r) { return String(r[FORMS[ed.dataset.edit].key]) === ed.dataset.id; }));
  });
  function toLocal(iso) { if (!iso) return ''; var d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function scopeField(f, val, type) {
    var id = 'ff-' + f.k;
    if (type === 'producto') return '<select id="' + id + '" name="' + f.k + '"><option value="">Elige un producto</option>' + D.products.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === val ? ' selected' : '') + '>' + esc(p.brand + ' ' + p.name) + '</option>'; }).join('') + '</select>';
    if (type === 'categoria') return '<select id="' + id + '" name="' + f.k + '">' + ['Tenis', 'Sandalias', 'Chanclas', 'Botas'].map(function (x) { return '<option' + (x === val ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
    if (type === 'genero') return '<select id="' + id + '" name="' + f.k + '">' + ['Hombre', 'Mujer'].map(function (x) { return '<option' + (x === val ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
    if (type === 'marca') { var brands = Array.from(new Set(D.products.map(function (p) { return p.brand; }))); return '<input id="' + id + '" name="' + f.k + '" list="fbrands" value="' + esc(val || '') + '"><datalist id="fbrands">' + brands.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('') + '</datalist>'; }
    if (type === 'url') return '<input id="' + id + '" name="' + f.k + '" value="' + esc(val || '') + '" placeholder="https://… o /terminos.html">';
    return '<input id="' + id + '" name="' + f.k + '" value="" disabled placeholder="No aplica">';
  }
  function fieldHTML(f, r, isNew) {
    var id = 'ff-' + f.k, v = r[f.k] != null ? r[f.k] : (f.def != null ? f.def : '');
    var wrap = function (inner, label) { return '<div class="field" data-f="' + f.k + '"' + (f.half ? ' data-half' : '') + '>' + (label !== false ? '<label for="' + id + '">' + f.l + '</label>' : '') + inner + (f.h ? '<small id="' + id + '-h">' + f.h + '</small>' : '') + '</div>'; };
    var desc = f.h ? ' aria-describedby="' + id + '-h"' : '';
    if (f.onlyNew && !isNew) return wrap('<input id="' + id + '" value="' + esc(v) + '" disabled>');
    switch (f.t) {
      case 'textarea': return wrap('<textarea id="' + id + '" name="' + f.k + '" maxlength="' + (f.max || 1000) + '" rows="' + (f.rows || 3) + '"' + desc + '>' + esc(v) + '</textarea>');
      case 'number': return wrap('<input id="' + id + '" name="' + f.k + '" type="number" min="' + (f.min || 0) + '"' + (f.max ? ' max="' + f.max + '"' : '') + ' value="' + esc(v === '' ? 0 : v) + '"' + desc + '>');
      case 'select': return wrap('<select id="' + id + '" name="' + f.k + '"' + desc + '>' + f.opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(v || f.opts[0][0]) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>');
      case 'check': return '<label class="check" data-f="' + f.k + '"><input type="checkbox" id="' + id + '" name="' + f.k + '"' + (v === true || (v === '' && f.def) ? ' checked' : '') + '> ' + f.l + '</label>';
      case 'color': return wrap('<input id="' + id + '" name="' + f.k + '" type="color" value="' + esc(v || '#0e4d38') + '"' + desc + '>');
      case 'datetime': return wrap('<input id="' + id + '" name="' + f.k + '" type="datetime-local" value="' + toLocal(v) + '"' + desc + '>');
      case 'image': return wrap('<div class="img-preview" id="' + id + '-pv">' + (safeUrl(v) ? '<img src="' + esc(v) + '" alt="">' : '<span>Sin imagen</span>') + '</div><input type="hidden" name="' + f.k + '" value="' + esc(v) + '"><input id="' + id + '" type="file" accept="image/png,image/jpeg,image/webp" data-upload="' + f.k + '"' + desc + '><button type="button" class="btn-danger" data-clearimg="' + f.k + '">Quitar imagen</button>');
      case 'scope': return wrap('<span data-scope="' + f.k + '">' + scopeField(f, v, r[f.k === 'link_value' ? 'link_type' : 'scope_type']) + '</span>');
      default: return wrap('<input id="' + id + '" name="' + f.k + '" maxlength="' + (f.max || 200) + '" value="' + esc(v) + '"' + (f.upper ? ' style="text-transform:uppercase"' : '') + desc + '>');
    }
  }
  function openForm(name, row) {
    var c = FORMS[name]; editing = { name: name, row: row || null };
    var r = row || {};
    $('formDrawerTitle').textContent = (row ? 'Editar ' : 'Nuevo: ') + c.one;
    $('formBody').innerHTML = '<p class="form-msg bad" id="formErr" role="alert" hidden></p>' + (c.help ? '<p class="help-box">' + c.help + '</p>' : '') + '<form id="gForm" novalidate>' + c.fields.map(function (f) { return fieldHTML(f, r, !row); }).join('') + '</form>';
    applyShowIf(); openDrawer('formDrawer');
  }
  function formVals() {
    var f = $('gForm'), out = {};
    FORMS[editing.name].fields.forEach(function (fd) {
      var el = f.elements[fd.k]; if (!el || el.disabled) return;
      if (fd.t === 'check') out[fd.k] = el.checked;
      else if (fd.t === 'number') out[fd.k] = Number(el.value) || 0;
      else if (fd.t === 'datetime') out[fd.k] = el.value ? new Date(el.value).toISOString() : null;
      else out[fd.k] = fd.upper ? el.value.trim().toUpperCase() : el.value.trim();
    });
    return out;
  }
  function applyShowIf() {
    var vals = formVals();
    FORMS[editing.name].fields.forEach(function (fd) {
      if (!fd.showIf) return;
      var ok = Object.keys(fd.showIf).every(function (k) { var want = fd.showIf[k]; return Array.isArray(want) ? want.indexOf(vals[k]) > -1 : vals[k] === want; });
      var el = $('gForm').querySelector('[data-f="' + fd.k + '"]'); if (el) el.hidden = !ok;
    });
  }
  $('formBody').addEventListener('change', async function (e) {
    var t = e.target;
    if (t.name === 'scope_type' || t.name === 'link_type') {
      var k = t.name === 'scope_type' ? 'scope_value' : 'link_value';
      var box = $('formBody').querySelector('[data-scope="' + k + '"]');
      if (box) box.innerHTML = scopeField({ k: k }, '', t.value);
    }
    if (t.dataset.upload) {
      var url = await upload(t.files[0]);
      if (url) { $('gForm').elements[t.dataset.upload].value = url; $('ff-' + t.dataset.upload + '-pv').innerHTML = '<img src="' + esc(url) + '" alt="">'; }
    }
    applyShowIf();
  });
  $('formBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-clearimg]'); if (!b) return;
    $('gForm').elements[b.dataset.clearimg].value = ''; $('ff-' + b.dataset.clearimg + '-pv').innerHTML = '<span>Sin imagen</span>';
  });
  $('saveForm').addEventListener('click', async function () {
    var c = FORMS[editing.name], body = formVals();
    if (c.kind) body.kind = c.kind;
    if (editing.name === 'dinamicas' && !body.has_chance) body.coljuegos_ref = '';
    var btn = this; btn.disabled = true;
    try {
      if (editing.row) await api('/admin/' + c.endpoint + '/' + encodeURIComponent(editing.row[c.key]), { method: 'PUT', body: body });
      else await api('/admin/' + c.endpoint, { method: 'POST', body: body });
      closeDrawers(); await loadAll(); toast('Guardado');
    } catch (err) { $('formErr').textContent = err.message; $('formErr').hidden = false; $('formErr').scrollIntoView({ block: 'nearest' }); }
    finally { btn.disabled = false; }
  });

  /* ---------------- PQR ---------------- */
  function renderPqr() {
    if (D.pqrsError) { $('pqrList').innerHTML = '<p class="form-msg bad">' + esc(D.pqrsError) + '</p>'; return; }
    $('pqrList').innerHTML = D.pqrs.map(function (q) {
      var days = Math.floor((Date.now() - new Date(q.created_at)) / 864e5);
      return '<article class="order-card' + (q.estado === 'Radicada' ? ' is-new' : '') + '"><div class="order-card__top"><div><h2 class="order-no">' + esc(q.id) + '</h2><small>' + fdate(q.created_at) + ' · hace ' + days + ' días</small></div><span class="pill ' + (q.estado === 'Radicada' ? 'warn' : q.estado === 'Cerrada' ? 'off' : 'on') + '">' + esc(q.estado) + '</span></div>' +
        '<p><b>' + esc(q.tipo) + '</b> · ' + esc(q.nombre) + (q.celular ? ' · ' + esc(q.celular) : '') + (q.correo ? ' · ' + esc(q.correo) : '') + (q.pedido ? ' · Pedido ' + esc(q.pedido) : '') + '</p>' +
        '<p class="pqr-msg">' + esc(q.mensaje) + '</p>' +
        '<form class="tl-form" data-pqr="' + esc(q.id) + '"><div class="field"><label for="pe-' + esc(q.id) + '">Estado</label><select id="pe-' + esc(q.id) + '" name="estado">' + ['Radicada', 'En trámite', 'Respondida', 'Cerrada'].map(function (s) { return '<option' + (q.estado === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="field full"><label for="pr-' + esc(q.id) + '">Respuesta enviada (para tu registro)</label><textarea id="pr-' + esc(q.id) + '" name="respuesta" maxlength="3000">' + esc(q.respuesta || '') + '</textarea></div>' +
        '<div class="full order-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar</button>' + (q.celular ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/57' + esc(String(q.celular).replace(/\D/g, '').slice(-10)) + '?text=' + encodeURIComponent('Hola ' + q.nombre + ', te escribimos de kAIRO por tu solicitud ' + q.id + '.') + '">Responder por WhatsApp</a>' : '') +
        (q.correo ? '<a class="btn btn-line btn-sm" href="mailto:' + esc(q.correo) + '?subject=' + encodeURIComponent('Respuesta a tu solicitud ' + q.id) + '">Responder por correo</a>' : '') +
        '<button class="btn-danger" type="button" style="margin-left:auto" data-del="pqrs" data-id="' + esc(q.id) + '">Eliminar</button></div></form></article>';
    }).join('') || '<div class="panel"><p class="empty">No hay solicitudes.</p></div>';
  }
  $('pqrList').addEventListener('submit', async function (e) {
    var f = e.target.closest('[data-pqr]'); if (!f) return; e.preventDefault();
    try { await api('/admin/pqrs/' + encodeURIComponent(f.dataset.pqr), { method: 'PUT', body: { estado: f.estado.value, respuesta: f.respuesta.value } }); await loadAll(); toast('PQR actualizada'); }
    catch (err) { toast(err.message, 4500); }
  });

  /* ---------------- ajustes ---------------- */
  function fillSettings() { var s = D.settings || {}; $('sWa').value = s.whatsapp || ''; $('sShip').value = s.shippingNote || ''; fillDomicilios(); fillAccounts(); fillPayStatus(); if (N.pintar) N.pintar(); }

  /* ---------------- domicilios en Quibdó: precio según la distancia del barrio ---------------- */
  var DOM_MIN = 4000, DOM_MAX = 10000;
  var DOM_ZONAS = [{ id: 'cerca', nombre: 'Cerca', precio: 4000 }, { id: 'media', nombre: 'Distancia media', precio: 7000 }, { id: 'lejos', nombre: 'Lejos', precio: 10000 }];
  function domCfg() { return (D.settings && D.settings.domicilios) || { zonas: DOM_ZONAS, barrios: [], otroZona: 'lejos' }; }
  function zonaPrecio(id) { var inp = $('domZonas').querySelector('[data-zona="' + id + '"]'); return inp ? Number(inp.value) || 0 : 0; }
  function zonaOptions(sel) {
    return DOM_ZONAS.map(function (z) { var p = zonaPrecio(z.id); return '<option value="' + z.id + '"' + (z.id === sel ? ' selected' : '') + '>' + esc(z.nombre) + (p ? ' · ' + money(p) : '') + '</option>'; }).join('');
  }
  function domRow(b) {
    return '<div class="dom-row"><input aria-label="Nombre del barrio" maxlength="60" value="' + esc(b.nombre || '') + '" placeholder="Nombre del barrio">' +
      '<select aria-label="Distancia de ' + esc(b.nombre || 'este barrio') + '">' + zonaOptions(b.zona || 'media') + '</select>' +
      '<button type="button" class="btn-danger" data-domrm aria-label="Quitar ' + esc(b.nombre || 'barrio') + '">Quitar</button></div>';
  }
  function refreshZonaLabels() {
    // Al cambiar un precio, se actualiza el texto de todas las listas de distancia
    document.querySelectorAll('#domList select, #domOtro').forEach(function (sel) { var v = sel.value; sel.innerHTML = zonaOptions(v); });
    $('domCount').textContent = '(' + $('domList').children.length + ')';
  }
  function fillDomicilios() {
    var d = domCfg();
    $('domZonas').innerHTML = DOM_ZONAS.map(function (z) {
      var cur = (d.zonas || []).find(function (x) { return x.id === z.id; }) || z;
      return '<label class="dom-zona"><span>' + esc(z.nombre) + '</span><input type="number" inputmode="numeric" min="' + DOM_MIN + '" max="' + DOM_MAX + '" step="500" data-zona="' + z.id + '" value="' + esc(cur.precio) + '" aria-label="Precio del domicilio: ' + esc(z.nombre) + '"></label>';
    }).join('');
    $('domList').innerHTML = (d.barrios || []).map(domRow).join('');
    $('domOtro').innerHTML = zonaOptions(d.otroZona || 'lejos');
    $('domWarn').hidden = !!(D.settings && D.settings.domiciliosListo);
    refreshZonaLabels();
  }
  $('domZonas').addEventListener('input', refreshZonaLabels);
  $('domAdd').addEventListener('click', function () { $('domList').insertAdjacentHTML('beforeend', domRow({})); refreshZonaLabels(); $('domList').lastElementChild.querySelector('input').focus(); });
  $('domList').addEventListener('click', function (e) { var b = e.target.closest('[data-domrm]'); if (b) { b.closest('.dom-row').remove(); refreshZonaLabels(); } });
  $('domForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var bad = '', zonas = DOM_ZONAS.map(function (z) {
      var p = zonaPrecio(z.id);
      if (!(p >= DOM_MIN && p <= DOM_MAX)) bad = bad || 'El precio de “' + z.nombre + '” debe estar entre ' + money(DOM_MIN) + ' y ' + money(DOM_MAX) + '.';
      return { id: z.id, precio: p };
    });
    var barrios = [], seen = {};
    $('domList').querySelectorAll('.dom-row').forEach(function (r) {
      var nombre = r.querySelector('input').value.trim(), key = nombre.toLowerCase();
      if (!nombre) return;
      if (seen[key]) bad = bad || 'El barrio “' + nombre + '” está repetido.';
      seen[key] = 1;
      barrios.push({ nombre: nombre, zona: r.querySelector('select').value });
    });
    if (bad) { toast(bad, 4500); return; }
    try { await api('/admin/settings', { method: 'PUT', body: { domicilios: { zonas: zonas, barrios: barrios, otroZona: $('domOtro').value } } }); await loadAll(); toast('Domicilios guardados (' + barrios.length + ' barrios)'); }
    catch (err) { toast(err.message, 6000); }
  });

  /* ---------------- cuentas para recibir pagos (QR de Nequi, Bancolombia…) ---------------- */
  var BANCOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Bre-B', 'Davivienda', 'Banco de Bogotá', 'BBVA', 'Otro'];
  var TIPOS = ['Llave Bre-B', 'Número de celular', 'Cuenta de ahorros', 'Cuenta corriente'];
  function opts(list, sel) { return list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function acctRow(a) {
    var qr = safeUrl(a.qr || '');
    return '<fieldset class="acct-row" data-qr="' + esc(qr) + '"><legend class="sr-only">Cuenta</legend>' +
      '<div class="acct-qr">' + (qr ? '<img src="' + esc(qr) + '" alt="QR de la cuenta">' : '<span>Sin QR</span>') + '</div>' +
      '<div class="acct-fields">' +
      '<label>Banco o app<select name="banco">' + opts(BANCOS, a.banco || 'Nequi') + '</select></label>' +
      '<label class="acct-otro"' + (a.banco === 'Otro' ? '' : ' hidden') + '>Nombre<input name="nombre" maxlength="30" value="' + esc(a.nombre || '') + '" placeholder="Ej.: Nu"></label>' +
      '<label>Titular<input name="titular" maxlength="80" value="' + esc(a.titular || '') + '" placeholder="Nombre que ve el cliente"></label>' +
      '<label>Tipo<select name="tipo">' + opts(TIPOS, a.tipo || 'Número de celular') + '</select></label>' +
      '<label>Número o llave<input name="numero" maxlength="40" value="' + esc(a.numero || '') + '" placeholder="Ej.: 3145312045"></label>' +
      '<div class="acct-actions"><label class="btn btn-line btn-sm acct-up">' + (qr ? 'Cambiar QR' : 'Subir foto del QR') + '<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>' +
      (qr ? '<button type="button" class="btn btn-line btn-sm" data-acctqrdel>Quitar QR</button>' : '') +
      '<button type="button" class="btn-danger" data-acctrm>Quitar cuenta</button></div></div></fieldset>';
  }
  function fillAccounts() {
    var list = (D.settings && D.settings.pagos && D.settings.pagos.cuentas) || [];
    // Sin cuentas guardadas: se muestra la de Nequi que hoy ve la tienda, para que solo la completes
    if (!list.length) list = [{ banco: 'Nequi', titular: N.nequiTitular || '', tipo: 'Llave Bre-B', numero: N.nequiLlave || '', qr: '/img/nequi-qr.png' }];
    $('acctList').innerHTML = list.map(acctRow).join('');
    $('acctWarn').hidden = !!(D.settings && D.settings.pagosListo);
  }
  function readAccount(row) {
    var f = function (n) { var el = row.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    return { banco: f('banco'), nombre: f('nombre'), titular: f('titular'), tipo: f('tipo'), numero: f('numero'), qr: row.dataset.qr || '' };
  }
  $('acctAdd').addEventListener('click', function () {
    if ($('acctList').children.length >= 6) { toast('Máximo 6 cuentas'); return; }
    $('acctList').insertAdjacentHTML('beforeend', acctRow({ banco: 'Bancolombia', tipo: 'Cuenta de ahorros', titular: N.nequiTitular || '' }));
    $('acctList').lastElementChild.querySelector('select').focus();
  });
  $('acctList').addEventListener('change', async function (e) {
    var row = e.target.closest('.acct-row'); if (!row) return;
    if (e.target.name === 'banco') row.querySelector('.acct-otro').hidden = e.target.value !== 'Otro';
    if (e.target.type === 'file') {
      var url = await upload(e.target.files[0]);
      if (url) { var a = readAccount(row); a.qr = url; row.outerHTML = acctRow(a); toast('QR listo. Recuerda “Guardar cuentas”.'); }
    }
  });
  $('acctList').addEventListener('click', function (e) {
    var row = e.target.closest('.acct-row'); if (!row) return;
    if (e.target.closest('[data-acctrm]')) { if (confirm('¿Quitar esta cuenta?')) row.remove(); }
    if (e.target.closest('[data-acctqrdel]')) { var a = readAccount(row); a.qr = ''; row.outerHTML = acctRow(a); }
  });
  $('acctForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var cuentas = [].map.call($('acctList').querySelectorAll('.acct-row'), readAccount);
    var bad = '';
    cuentas.forEach(function (a) {
      var n = a.banco === 'Otro' ? (a.nombre || 'la cuenta') : a.banco;
      if (!a.numero && !a.qr) bad = bad || 'A ' + n + ' le falta el número o la foto del QR.';
      else if (!a.titular) bad = bad || 'Escribe el titular de ' + n + ': el cliente lo usa para confirmar a quién le paga.';
    });
    if (!cuentas.length) bad = 'Deja al menos una cuenta para que los clientes puedan pagar.';
    if (bad) { toast(bad, 5000); return; }
    try { await api('/admin/settings', { method: 'PUT', body: { pagos: { cuentas: cuentas } } }); await loadAll(); toast('Cuentas guardadas'); }
    catch (err) { toast(err.message, 6000); }
  });

  /* Estado de los pagos (Wompi) */
  function fillPayStatus() {
    var w = (D.settings && D.settings.wompi) || {};
    $('payStatus').hidden = !w.activo; // sin llaves de Wompi no se muestra nada
    if (!w.activo) return;
    $('payStatus').innerHTML = '<h2>Pago en línea (Wompi)</h2>' + (w.activo
      ? '<p><span class="pill ' + (w.pruebas ? 'warn' : 'on') + '">' + (w.pruebas ? 'Activo en modo de pruebas' : 'Activo: cobros reales') + '</span></p><p class="hint">Los clientes pueden pagar con tarjeta, PSE, Nequi o Bancolombia. Los pedidos pagados pasan solos a “Pago confirmado”.' + (w.pruebas ? ' Con llaves de pruebas no se cobra dinero real: cambia a las llaves pub_prod_ cuando quieras vender.' : '') + '</p>' +
        (w.eventos ? '' : '<p class="ref-box">Falta <code>WOMPI_EVENTS_SECRET</code> en Vercel: sin él, Wompi no puede avisar los pagos si el cliente cierra la página antes de volver.</p>')
      : '<p><span class="pill off">No configurado</span></p><p class="hint">La tienda solo ofrece Nequi, contraentrega y separar. Para activar el pago en línea, pon <code>WOMPI_PUBLIC_KEY</code>, <code>WOMPI_INTEGRITY_SECRET</code> y <code>WOMPI_EVENTS_SECRET</code> en Vercel (Settings → Environment Variables).</p>');
  }

  /* ---------------- comunes ---------------- */
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-del]'); if (!b) return;
    if (!confirm('¿Eliminar este registro? No se puede deshacer.')) return;
    try { await api('/admin/' + b.dataset.del + '/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' }); await loadAll(); toast('Eliminado'); }
    catch (err) { toast(err.message, 4500); }
  });
  var lastFocus = null;
  function openDrawer(id) {
    lastFocus = document.activeElement;
    $(id).classList.add('on'); $('scrim').classList.add('on');
    $('app').setAttribute('inert', '');
    setTimeout(function () { var f = $(id).querySelector('input:not([type=hidden]):not([disabled]),select,textarea'); (f || $(id).querySelector('button')).focus(); }, 60);
  }
  function closeDrawers() {
    document.querySelectorAll('.drawer').forEach(function (d) { d.classList.remove('on'); });
    $('scrim').classList.remove('on'); $('app').removeAttribute('inert');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $('scrim').addEventListener('click', closeDrawers);
  document.querySelectorAll('[data-close-drawer]').forEach(function (b) { b.addEventListener('click', closeDrawers); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('app').classList.contains('menu-open')) { menu(false); $('adminMenuBtn').focus(); return; }
    var d = document.querySelector('.drawer.on'); if (!d) return;
    if (e.key === 'Escape') { closeDrawers(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea'), function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  if (TOKEN) enter();
})();
