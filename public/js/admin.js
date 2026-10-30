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
    notifyNewOrders();
    renderStats(); renderOrders(); renderProducts(); Object.keys(FORMS).forEach(renderForm); renderPqr(); fillSettings();
    if (errors.length) toast(errors[0], 5000);
  }
  setInterval(function () { if (TOKEN && document.visibilityState === 'visible' && !document.querySelector('.drawer.on')) loadAll(); }, 30000);
  function notifyNewOrders() {
    var ids = new Set(D.orders.map(function (o) { return o.id; }));
    if (knownOrderIds) {
      var fresh = D.orders.filter(function (o) { return !knownOrderIds.has(o.id); });
      if (fresh.length) {
        var o = fresh[0], msg = o.id + ' · ' + ((o.customer || {}).nombre || 'Cliente') + ' · ' + money(o.total);
        toast('Nuevo pedido: ' + msg, 5000);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Nuevo pedido kAIRO', { body: msg, icon: '/img/icon-192.png' });
      }
    } else if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { } }
    knownOrderIds = ids;
  }

  /* ---------------- resumen ---------------- */
  function renderStats() {
    var s = D.stats || {};
    var waitingPay = D.orders.filter(function (o) { return o.status === 'Recibido'; }).length;
    var reported = D.orders.filter(function (o) { return o.status === 'Recibido' && o.customer && o.customer.pagoReportado; }).length;
    $('statsGrid').innerHTML = [
      { v: waitingPay, l: 'Pedidos por confirmar pago' }, { v: reported, l: 'Con pago reportado' },
      { v: D.orders.filter(function (o) { return o.status === 'En preparación' || o.status === 'Pago confirmado'; }).length, l: 'Por despachar' },
      { v: s.activeProducts != null ? s.activeProducts : D.products.filter(function (p) { return p.active !== false; }).length, l: 'Productos visibles' },
      { v: money(s.revenue || 0), l: 'Total pedidos (sin cancelados)' }, { v: s.pqrPending || 0, l: 'PQR sin responder' }
    ].map(function (x) { return '<div class="stat"><b>' + esc(x.v) + '</b><span>' + x.l + '</span></div>'; }).join('');
    $('navNew').hidden = !waitingPay; $('navNew').textContent = waitingPay; $('navNew').setAttribute('aria-label', waitingPay + ' por confirmar');
    var pq = s.pqrPending || D.pqrs.filter(function (p) { return p.estado === 'Radicada'; }).length;
    $('navPqr').hidden = !pq; $('navPqr').textContent = pq;
    $('bnNew').hidden = !waitingPay; $('bnNew').textContent = waitingPay; $('bnPqr').hidden = !pq; $('bnPqr').textContent = pq;
    $('recentOrders').innerHTML = D.orders.slice(0, 6).map(function (o) {
      return '<tr><td><b class="order-no">' + esc(o.id) + '</b><br><small>' + fdate(o.created_at) + '</small></td><td>' + esc((o.customer || {}).nombre || '—') + '</td><td>' + money(o.total) + '</td><td>' + statusPill(o) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty">Todavía no hay pedidos.</td></tr>';
  }
  function statusPill(o) {
    var s = o.status, rep = o.customer && o.customer.pagoReportado;
    var cls = s === 'Cancelado' ? 'bad' : s === 'Recibido' ? (rep ? 'lime' : 'warn') : s === 'Entregado' ? 'on' : 'off';
    var label = s === 'Recibido' ? (rep ? 'Pago reportado' : 'Esperando pago') : s;
    return '<span class="pill ' + cls + '">' + esc(label) + '</span>';
  }

  /* ---------------- pedidos ---------------- */
  var ordFilter = 'activos';
  var ORD_TABS = [['activos', 'Activos'], ['pago', 'Por confirmar pago'], ['despachar', 'Por despachar'], ['Enviado', 'Enviados'], ['Entregado', 'Entregados'], ['Cancelado', 'Cancelados'], ['todos', 'Todos']];
  function ordMatch(o) {
    if (ordFilter === 'todos') return true;
    if (ordFilter === 'activos') return ['Entregado', 'Cancelado'].indexOf(o.status) < 0;
    if (ordFilter === 'pago') return o.status === 'Recibido';
    if (ordFilter === 'despachar') return o.status === 'Pago confirmado' || o.status === 'En preparación';
    return o.status === ordFilter;
  }
  function stepsOf(o) {
    var idx = STEPS.indexOf(o.status), h = (o.tracking && o.tracking.history) || [];
    var at = function (k) { for (var i = h.length - 1; i >= 0; i--) if (h[i].status === k) return h[i].at; return k === 'Recibido' ? o.created_at : null; };
    return STEPS.map(function (k, i) {
      var label = k === 'Pago confirmado' && o.customer && o.customer.pago === 'Contraentrega' ? 'Anticipo confirmado' : k;
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
      return (o.id + ' ' + (c.nombre || '') + ' ' + (c.telefono || '') + ' ' + (c.ciudad || '')).toLowerCase().indexOf(q) > -1;
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
          '<div><span>Envío</span><span>' + (pr.envio ? money(pr.envio) : 'Gratis') + '</span></div>' +
          '<div><b>Total</b><b>' + money(pr.totalConEnvio != null ? pr.totalConEnvio : o.total) + '</b></div>' +
          (c.pago === 'Contraentrega' ? '<div><span>Anticipo por Nequi</span><span>' + money(pr.pagarAhora) + '</span></div><div><span>Cobrar al entregar</span><span>' + money(pr.saldoContraentrega) + '</span></div>' : '<div><span>Debe llegar a tu Nequi</span><span>' + money(pr.pagarAhora) + '</span></div>') +
          '</div>';
      }
      var waText = 'Hola ' + (c.nombre || '').split(' ')[0] + ', te escribimos de kAIRO sobre tu pedido ' + o.id + '. Puedes ver el estado aquí: ' + trackLink(o);
      return '<article class="order-card' + (o.status === 'Recibido' ? ' is-new' : '') + '" aria-labelledby="o-' + esc(o.id) + '">' +
        '<div class="order-card__top"><div><h2 class="order-no" id="o-' + esc(o.id) + '">' + esc(o.id) + '</h2><small>' + fdate(o.created_at) + '</small></div><span class="big-price">' + money(o.total) + '</span></div>' +
        '<div class="order-meta">' + statusPill(o) + '<span class="pill off">' + esc(c.pago || 'Sin método') + '</span>' + (pr.coupon ? '<span class="pill off">Cupón ' + esc(pr.coupon.code) + '</span>' : '') + '<span class="pill warn">Sin caja</span></div>' +
        (c.pagoReportado ? '<p class="ref-box"><b>El cliente reportó su pago</b>' + (c.pagoReportado.ref ? ' · Referencia: ' + esc(c.pagoReportado.ref) : '') + ' <small>(' + fdate(c.pagoReportado.at) + ')</small><br>Revisa que el pago esté en tu Nequi antes de confirmar.' + (c.pagoReportado.hasComprobante ? ' <button class="btn btn-line btn-sm" type="button" data-proof="' + esc(o.id) + '">Ver foto del comprobante</button>' : '') + '</p>' : '') +
        '<p><b>' + esc(c.nombre || 'Sin nombre') + '</b> · ' + esc(tel) + (c.cedula ? ' · CC ' + esc(c.cedula) : '') + (c.correo ? ' · ' + esc(c.correo) : '') + '<br><small>' + esc([c.direccion, c.barrio, c.ciudad, c.departamento].filter(Boolean).join(', ')) + '</small>' + (c.notas ? '<br><small>Notas: ' + esc(c.notas) + '</small>' : '') + '</p>' +
        '<ul class="order-items">' + items + '</ul>' + lines +
        '<ol class="timeline" aria-label="Seguimiento del pedido">' + steps.map(function (s) { return '<li class="' + s.state + '">' + esc(s.label) + (s.at ? '<small>' + fdate(s.at) + '</small>' : '') + '</li>'; }).join('') + '</ol>' +
        '<form class="tl-form" data-track="' + esc(o.id) + '">' +
        '<div class="field"><label for="st-' + esc(o.id) + '">Estado</label><select id="st-' + esc(o.id) + '" name="status">' + STATUSES.map(function (s) { return '<option' + (o.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="gu-' + esc(o.id) + '">Número de guía</label><input id="gu-' + esc(o.id) + '" name="guia" value="' + esc(t.guia || '') + '" maxlength="60"></div>' +
        '<div class="field"><label for="tr-' + esc(o.id) + '">Transportadora</label><input id="tr-' + esc(o.id) + '" name="transportadora" list="carriers" value="' + esc(t.transportadora || '') + '" maxlength="60"></div>' +
        '<div class="field full"><label for="no-' + esc(o.id) + '">Mensaje para el cliente (se ve en su seguimiento)</label><input id="no-' + esc(o.id) + '" name="nota" value="' + esc(t.nota || '') + '" maxlength="400" placeholder="Ej.: Sale mañana en la mañana"></div>' +
        '<div class="full order-actions"><button class="btn btn-primary btn-sm" type="submit">Guardar seguimiento</button>' +
        '<button class="btn btn-line btn-sm" type="button" data-receipt="' + esc(o.id) + '">Ver recibo</button>' +
        '<button class="btn btn-line btn-sm" type="button" data-copylink="' + esc(o.id) + '">Copiar enlace de seguimiento</button>' +
        (tel ? '<a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://wa.me/57' + esc(tel.slice(-10)) + '?text=' + encodeURIComponent(waText) + '">WhatsApp al cliente</a>' : '') +
        '<button class="btn-danger" type="button" style="margin-left:auto" data-del="orders" data-id="' + esc(o.id) + '">Eliminar</button></div>' +
        '</form></article>';
    }).join('') || '<div class="panel"><p class="empty">No hay pedidos en esta vista.</p></div>';
    if (!$('carriers')) document.body.insertAdjacentHTML('beforeend', '<datalist id="carriers"><option>Servientrega</option><option>Interrapidísimo</option><option>Coordinadora</option><option>Envía</option><option>TCC</option><option>Deprisa</option><option>Entrega local</option></datalist>');
  }
  $('ordTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-otab]'); if (!b) return; ordFilter = b.dataset.otab; renderOrders(); });
  $('ordSearch').addEventListener('input', renderOrders);
  $('orderList').addEventListener('submit', async function (e) {
    var f = e.target.closest('[data-track]'); if (!f) return; e.preventDefault();
    var id = f.dataset.track, o = D.orders.find(function (x) { return x.id === id; });
    var body = { status: f.status.value, guia: f.guia.value.trim(), transportadora: f.transportadora.value.trim(), nota: f.nota.value.trim() };
    if (o && o.status === 'Recibido' && body.status !== 'Recibido' && body.status !== 'Cancelado' &&
      !confirm('¿Ya verificaste en tu Nequi que llegó el pago de ' + money((o.pricing || {}).pagarAhora || o.total) + ' para el pedido ' + id + '?')) return;
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
      (pr.envio != null ? '<tr><td colspan="3">Envío</td><td class="n">' + (pr.envio ? money(pr.envio) : 'Gratis') + '</td></tr>' : '') +
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
      '<div class="grid"><div><b>Fecha</b>' + fdate(o.created_at) + '</div><div><b>Forma de pago</b>' + esc(c.pago || '') + (c.pagoReportado ? ' · Ref. ' + esc(c.pagoReportado.ref) : '') + '</div>' +
      '<div><b>Cliente</b>' + esc(c.nombre || '') + (c.cedula ? ' · CC ' + esc(c.cedula) : '') + '<br>' + esc(c.telefono || '') + '</div><div><b>Entrega</b>' + esc([c.direccion, c.barrio, c.ciudad, c.departamento].filter(Boolean).join(', ')) + '</div>' +
      ((o.tracking || {}).guia ? '<div><b>Guía</b>' + esc(o.tracking.guia) + ' ' + esc(o.tracking.transportadora || '') + '</div>' : '') +
      (c.pago === 'Contraentrega' && pr.saldoContraentrega != null ? '<div><b>Cobrar al entregar</b>' + money(pr.saldoContraentrega) + '</div>' : '') + '</div>' +
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
    var e = !body.name ? 'Escribe el nombre del producto.' : !body.brand ? 'Escribe la marca.' : !body.price ? 'Escribe el precio.' : body.salePrice && body.salePrice >= body.price ? 'El precio de oferta debe ser menor que el precio normal.' : !body.sizes.length ? 'Elige al menos una talla.' : '';
    if (e) { $('prodErr').textContent = e; $('prodErr').hidden = false; return; }
    try {
      if (editingProduct) await api('/admin/products/' + encodeURIComponent(editingProduct.id), { method: 'PUT', body: body });
      else await api('/admin/products', { method: 'POST', body: body });
      closeDrawers(); await loadAll(); toast('Producto guardado');
    } catch (err) { $('prodErr').textContent = err.message; $('prodErr').hidden = false; }
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
  function fillSettings() { var s = D.settings || {}; $('sWa').value = s.whatsapp || ''; $('sShip').value = s.shippingNote || ''; if (N.pintar) N.pintar(); }
  $('settingsForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = { whatsapp: $('sWa').value.replace(/\D/g, ''), shippingNote: $('sShip').value.trim() };
    var pass = $('sPass').value; if (pass) body.adminPassword = pass;
    try { await api('/admin/settings', { method: 'PUT', body: body }); $('sPass').value = ''; await loadAll(); toast('Ajustes guardados'); }
    catch (err) { toast(err.message, 4500); }
  });

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
