'use strict';
/**
 * Servidor de kAIRO — sin dependencias externas.
 * Arranca con:  node server.js
 *   Tienda  ->  http://localhost:3000
 *   Panel   ->  http://localhost:3000/admin.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const seed = require('./seed');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------- Primera carga ---------------- */
if (!store.get('settings', 'app')) {
  store.put('settings', seed.settings);
  seed.products.forEach(p => store.put('products', p));
  seed.promos.forEach(p => store.put('promos', p));
  console.log('Base de datos creada con los productos de ejemplo.');
}

const settings = () => store.get('settings', 'app') || seed.settings;
const byPosition = (a, b) => (a.position || 0) - (b.position || 0);

/* ---------------- Sesiones del panel ---------------- */
const sessions = new Map(); // token -> vence (ms)
const SESSION_MS = 1000 * 60 * 60 * 12;

function newToken() {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, Date.now() + SESSION_MS);
  return t;
}
function validToken(token) {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

/* ---------------- Utilidades HTTP ---------------- */
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon'
};

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > limit) { reject(new Error('Archivo demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- Rutas ---------------- */
async function api(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const section = parts[1];
  const rest = parts.slice(2);

  /* --- Público --- */
  if (section === 'catalog' && method === 'GET') {
    const s = settings();
    const { adminPassword, ...publicSettings } = s;
    return json(res, 200, {
      settings: publicSettings,
      products: store.all('products').filter(p => p.active !== false).sort(byPosition),
      promos: store.all('promos').filter(p => p.active !== false).sort(byPosition)
    });
  }

  if (section === 'orders' && method === 'POST') {
    const body = await readBody(req);
    if (!body.items || !body.items.length) return json(res, 400, { error: 'El pedido no tiene productos' });
    const order = {
      id: 'ord-' + Date.now().toString(36),
      customer: body.customer || {},
      items: body.items,
      total: Number(body.total) || 0,
      status: 'Nuevo',
      createdAt: new Date().toISOString()
    };
    store.put('orders', order);
    return json(res, 201, { ok: true, id: order.id });
  }

  if (section === 'login' && method === 'POST') {
    const body = await readBody(req);
    if (String(body.password || '') !== String(settings().adminPassword)) {
      return json(res, 401, { error: 'Contraseña incorrecta' });
    }
    return json(res, 200, { token: newToken() });
  }

  /* --- Panel (requiere token) --- */
  if (section === 'admin') {
    const token = req.headers['x-admin-token'];
    if (!validToken(token)) return json(res, 401, { error: 'Sesión vencida, vuelve a entrar' });

    const table = rest[0];
    const id = rest[1];

    if (table === 'upload' && method === 'POST') {
      const body = await readBody(req);
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(body.data || '');
      if (!m) return json(res, 400, { error: 'Envía una imagen válida' });
      const ext = { 'image/jpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp', 'image/gif':'.gif', 'image/svg+xml':'.svg' }[m[1]] || '.png';
      const name = (slug(body.name || 'imagen') || 'imagen') + '-' + Date.now().toString(36) + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(m[2], 'base64'));
      return json(res, 201, { url: '/uploads/' + name });
    }

    if (table === 'stats' && method === 'GET') {
      const orders = store.all('orders');
      return json(res, 200, {
        products: store.all('products').length,
        activeProducts: store.all('products').filter(p => p.active !== false).length,
        promos: store.all('promos').filter(p => p.active !== false).length,
        orders: orders.length,
        newOrders: orders.filter(o => o.status === 'Nuevo').length,
        revenue: orders.filter(o => o.status !== 'Cancelado').reduce((s, o) => s + (o.total || 0), 0),
        storage: store.kind
      });
    }

    if (table === 'settings') {
      if (method === 'GET') return json(res, 200, settings());
      if (method === 'PUT') {
        const body = await readBody(req);
        const merged = Object.assign({}, settings(), body, { id: 'app' });
        if (!body.adminPassword) merged.adminPassword = settings().adminPassword;
        store.put('settings', merged);
        return json(res, 200, merged);
      }
    }

    if (['products', 'promos', 'orders'].includes(table)) {
      if (method === 'GET') return json(res, 200, store.all(table).sort(byPosition));

      if (method === 'POST') {
        const body = await readBody(req);
        const count = store.all(table).length;
        const record = Object.assign({
          id: (body.id && slug(body.id)) || slug(`${body.brand || table}-${body.name || body.title || Date.now()}`) || String(Date.now()),
          position: count + 1,
          createdAt: new Date().toISOString()
        }, body);
        record.id = slug(record.id);
        if (store.get(table, record.id)) record.id += '-' + Date.now().toString(36).slice(-4);
        store.put(table, record);
        return json(res, 201, record);
      }

      if (method === 'PUT' && id) {
        const current = store.get(table, id);
        if (!current) return json(res, 404, { error: 'No existe ese registro' });
        const body = await readBody(req);
        const updated = Object.assign({}, current, body, { id: current.id });
        store.put(table, updated);
        return json(res, 200, updated);
      }

      if (method === 'DELETE' && id) {
        return json(res, 200, { ok: store.remove(table, id) });
      }
    }
  }

  return json(res, 404, { error: 'Ruta no encontrada' });
}

/* ---------------- Servidor ---------------- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    try {
      await api(req, res, url);
    } catch (err) {
      json(res, 500, { error: err.message || 'Error del servidor' });
    }
    return;
  }
  serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log(`\n  kAIRO en marcha (${store.kind})`);
  console.log(`  Tienda:  http://localhost:${PORT}`);
  console.log(`  Panel:   http://localhost:${PORT}/admin.html\n`);
});
