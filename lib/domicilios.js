'use strict';
/* =====================================================================
   Domicilios en Quibdó: precio según el barrio (máximo $10.000).
   La lista se edita en el panel (Ajustes → Domicilios) y se guarda en
   settings.domicilios = { barrios: [{ nombre, precio }], otro }.
   "otro" es el precio para un barrio que no esté en la lista.
   ===================================================================== */
const MAX_DOMICILIO = 10000;

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const precio = n => Math.min(MAX_DOMICILIO, Math.max(0, Math.round((Number(n) || 0) / 100) * 100));
const limpiar = s => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 60);

/* Deja la configuración en un formato seguro (lo que venga del panel o de la base) */
function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const barrios = (Array.isArray(r.barrios) ? r.barrios : [])
    .map(b => ({ nombre: limpiar(b && b.nombre), precio: precio(b && b.precio) }))
    .filter(b => b.nombre && !seen.has(norm(b.nombre)) && seen.add(norm(b.nombre)))
    .slice(0, 300)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const otro = r.otro == null || r.otro === '' ? MAX_DOMICILIO : precio(r.otro);
  return { barrios, otro, max: MAX_DOMICILIO };
}

async function loadDomicilios(supabase) {
  try {
    const { data, error } = await supabase.from('settings').select('domicilios').eq('id', 'app').single();
    return sanitize(error ? null : data && data.domicilios);
  } catch {
    return sanitize(null);
  }
}

/* Precio del domicilio para un barrio (si no está en la lista, el de "otro barrio") */
function precioBarrio(cfg, barrio) {
  const b = cfg.barrios.find(x => norm(x.nombre) === norm(barrio));
  return b ? b.precio : cfg.otro;
}

module.exports = { MAX_DOMICILIO, sanitize, loadDomicilios, precioBarrio };
