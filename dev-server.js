#!/usr/bin/env node
/**
 * Servidor de desarrollo local — simula Vercel sin necesitar el CLI.
 * Arranca con: node dev-server.js
 *   Tienda → http://localhost:3000
 *   Panel  → http://localhost:3000/admin.html
 */
require('./lib/env'); // carga el .env

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon'
};

// Lazily require API handlers (they import supabase at load time)
const handlers = {};
function handler(name) {
  if (!handlers[name]) handlers[name] = require('./api/' + name);
  return handlers[name];
}

function sendApiError(res, error) {
  const message = error && error.message ? error.message : 'Error interno del servidor';
  res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 14_000_000) reject(new Error('Body muy grande')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = data => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(data));
  };

  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path_  = url.pathname;

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (path_.startsWith('/api/')) {
    req.body = await parseBody(req).catch(() => ({}));
    req.url  = path_;  // strip query for route matching

    try {
      if      (path_ === '/api/catalog')       return await handler('catalog')(req, res);
      else if (path_ === '/api/login')         return await handler('login')(req, res);
      else if (path_ === '/api/orders')        return await handler('orders')(req, res);
      else if (path_.startsWith('/api/admin')) return await handler('admin')(req, res);
      else { res.writeHead(404); return res.end(JSON.stringify({ error: 'Ruta no encontrada' })); }
    } catch (error) {
      console.error('Error API:', error.message);
      return sendApiError(res, error);
    }
  }

  // Static files
  let rel = decodeURIComponent(path_);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);

}).listen(PORT, () => {
  console.log(`\n  kAIRO dev  →  http://localhost:${PORT}`);
  console.log(`  Panel      →  http://localhost:${PORT}/admin.html\n`);
});
