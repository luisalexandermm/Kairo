'use strict';
/**
 * Capa de base de datos de kAIRO.
 *
 * Usa SQLite (módulo nativo `node:sqlite`, disponible desde Node 22.5) y,
 * si la versión de Node no lo trae, guarda los datos en un archivo JSON.
 * En los dos casos la API es la misma:
 *
 *   store.all('products')            -> [ {...}, {...} ]
 *   store.get('products', id)        -> {...} | null
 *   store.put('products', record)    -> record  (inserta o actualiza)
 *   store.remove('products', id)     -> true/false
 */

const fs = require('fs');
const path = require('path');

const TABLES = ['products', 'promos', 'orders', 'settings'];
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- Backend SQLite ---------------- */
function sqliteBackend() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(DATA_DIR, 'kairo.db'));
  db.exec('PRAGMA journal_mode = WAL');
  for (const t of TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  }
  const parse = row => (row ? JSON.parse(row.json) : null);
  return {
    kind: 'sqlite',
    all(table) {
      return db.prepare(`SELECT json FROM ${table}`).all().map(r => JSON.parse(r.json));
    },
    get(table, id) {
      return parse(db.prepare(`SELECT json FROM ${table} WHERE id = ?`).get(String(id)));
    },
    put(table, record) {
      db.prepare(`INSERT INTO ${table} (id, json, updated_at) VALUES (?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`)
        .run(String(record.id), JSON.stringify(record), new Date().toISOString());
      return record;
    },
    remove(table, id) {
      const r = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(String(id));
      return r.changes > 0;
    }
  };
}

/* ---------------- Backend PostgreSQL ---------------- */
function postgresBackend() {
  const { Client } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL no configurada');

  const client = new Client({ connectionString });
  client.connect().catch(err => {
    console.error('No se pudo conectar a PostgreSQL:', err.message);
    throw err;
  });

  const ensureTables = async () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, json JSONB NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS promos (id TEXT PRIMARY KEY, json JSONB NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, json JSONB NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, json JSONB NOT NULL, updated_at TEXT NOT NULL);
    `;
    await client.query(sql);
  };

  const parse = row => (row && row.json !== undefined ? row.json : null);

  return {
    kind: 'postgres',
    async all(table) {
      await ensureTables();
      const { rows } = await client.query(`SELECT json FROM ${table}`);
      return rows.map(r => r.json);
    },
    async get(table, id) {
      await ensureTables();
      const { rows } = await client.query(`SELECT json FROM ${table} WHERE id = $1`, [String(id)]);
      return parse(rows[0] || null);
    },
    async put(table, record) {
      await ensureTables();
      await client.query(
        `INSERT INTO ${table} (id, json, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, updated_at = EXCLUDED.updated_at`,
        [String(record.id), record, new Date().toISOString()]
      );
      return record;
    },
    async remove(table, id) {
      await ensureTables();
      const { rowCount } = await client.query(`DELETE FROM ${table} WHERE id = $1`, [String(id)]);
      return rowCount > 0;
    }
  };
}

/* ---------------- Backend JSON ---------------- */
function jsonBackend() {
  const file = path.join(DATA_DIR, 'db.json');
  let data = { products: [], promos: [], orders: [], settings: [] };
  if (fs.existsSync(file)) {
    try { data = Object.assign(data, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (_) {}
  }
  const save = () => fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return {
    kind: 'json',
    all(table) { return data[table].slice(); },
    get(table, id) { return data[table].find(r => String(r.id) === String(id)) || null; },
    put(table, record) {
      const i = data[table].findIndex(r => String(r.id) === String(record.id));
      if (i >= 0) data[table][i] = record; else data[table].push(record);
      save();
      return record;
    },
    remove(table, id) {
      const before = data[table].length;
      data[table] = data[table].filter(r => String(r.id) !== String(id));
      save();
      return data[table].length < before;
    }
  };
}

let backend;
try {
  if (process.env.DATABASE_URL) {
    backend = postgresBackend();
    console.log('Usando PostgreSQL via DATABASE_URL');
  } else {
    backend = sqliteBackend();
  }
} catch (err) {
  console.log('No se pudo conectar a PostgreSQL, uso SQLite. (' + (err && err.message ? err.message : err) + ')');
  backend = sqliteBackend();
}

module.exports = backend;
