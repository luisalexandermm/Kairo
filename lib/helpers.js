'use strict';
const crypto = require('crypto');

/* ---------- HTTP helpers ---------- */
function ok(res, data, code = 200) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(code).json(data);
}
function err(res, msg, code = 400) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(code).json({ error: msg });
}
/* La tienda y el panel viven en el mismo dominio que la API, así que no hace falta
   abrir CORS a otros sitios. Antes se enviaba "Access-Control-Allow-Origin: *", lo que
   permitía que cualquier página web llamara a la API desde el navegador de un visitante. */
function allowCors(res) {
  res.setHeader('Vary', 'Origin');
}

/* Limpia texto que llega del navegador: quita caracteres de control y recorta el largo. */
function cleanText(value, max = 200) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/* ---------- Session tokens (in-memory, reset on cold start) ----------
   Vercel serverless functions are stateless — each cold start loses tokens.
   Since kAIRO has one admin, the token is validated against a signed HMAC
   that encodes the expiry inside the token itself, so no shared state is needed.
*/
/* Sin TOKEN_SECRET no se puede entrar al panel: antes había un secreto por defecto
   escrito en el código, con el que cualquiera podía fabricar un token de administrador. */
function secret() {
  const s = process.env.TOKEN_SECRET;
  if (!s || s.length < 16 || s === 'kairo-super-secreto-cambiame') {
    throw new Error('Configura TOKEN_SECRET (mínimo 16 caracteres aleatorios) en las variables de entorno');
  }
  return s;
}

function makeToken() {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 h
  const payload = exp.toString(36);
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 16);
  return `${payload}.${sig}`;
}
function checkToken(token) {
  if (!token) return false;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return false;
  let expected;
  try { expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 16); }
  catch { return false; }
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return parseInt(payload, 36) > Date.now();
}

/* ---------- Slug ---------- */
function slug(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/* ---------- Contrase\u00f1a del panel (hash con scrypt, sin dependencias nuevas) ----------
   El formato guardado es "scrypt$<salt>$<hash>". Si la contrase\u00f1a en la base de datos
   todav\u00eda est\u00e1 en texto plano (instalaciones antiguas), verifyPassword la acepta igual
   para no romper el login, y api/login.js la migra a hash en ese mismo momento.
*/
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored) return false;
  if (String(stored).startsWith('scrypt$')) {
    const [, salt, hash] = String(stored).split('$');
    if (!salt || !hash) return false;
    const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
    } catch {
      return false;
    }
  }
  return String(password) === String(stored);
}

module.exports = { ok, err, allowCors, cleanText, makeToken, checkToken, slug, hashPassword, verifyPassword };
