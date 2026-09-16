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
function allowCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
}

/* ---------- Session tokens (in-memory, reset on cold start) ----------
   Vercel serverless functions are stateless — each cold start loses tokens.
   Since kAIRO has one admin, the token is validated against a signed HMAC
   that encodes the expiry inside the token itself, so no shared state is needed.
*/
const SECRET = process.env.TOKEN_SECRET || 'kairo-secret-change-me';

function makeToken() {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 h
  const payload = exp.toString(36);
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
  return `${payload}.${sig}`;
}
function checkToken(token) {
  if (!token) return false;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
  if (sig !== expected) return false;
  return parseInt(payload, 36) > Date.now();
}

/* ---------- Slug ---------- */
function slug(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

module.exports = { ok, err, allowCors, makeToken, checkToken, slug };
