'use strict';
/* =====================================================================
   Domicilios en Quibdó: el precio depende de qué tan lejos queda el barrio.
   - Zonas por distancia (Cerca, Media, Lejos), cada una con su precio.
   - Cada barrio se asigna a una zona. "Otro barrio" usa la zona que elijas.
   - Precio mínimo $4.000 y máximo $10.000 (el servidor nunca cobra fuera de ese rango).
   Se edita en el panel (Ajustes → Domicilios) y se guarda en settings.domicilios.
   ===================================================================== */
const MIN_DOMICILIO = 4000;
const MAX_DOMICILIO = 10000;
const ZONAS_BASE = [
  { id: 'cerca', nombre: 'Cerca', precio: 4000 },
  { id: 'media', nombre: 'Distancia media', precio: 7000 },
  { id: 'lejos', nombre: 'Lejos', precio: 10000 }
];

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const precio = n => Math.min(MAX_DOMICILIO, Math.max(MIN_DOMICILIO, Math.round((Number(n) || 0) / 100) * 100));
const limpiar = (s, max = 60) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, max);

/* Zona más parecida a un precio (para listas viejas que guardaban precio por barrio) */
const zonaPorPrecio = (zonas, p) => zonas.reduce((best, z) => (Math.abs(z.precio - p) < Math.abs(best.precio - p) ? z : best), zonas[0]).id;

/* Deja la configuración en un formato seguro (lo que venga del panel o de la base).
   Cada barrio sale con su precio ya calculado, para que la tienda lo muestre tal cual. */
function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const zonasIn = Array.isArray(r.zonas) ? r.zonas : [];
  const zonas = ZONAS_BASE.map(z => {
    const z2 = zonasIn.find(x => x && x.id === z.id) || {};
    return { id: z.id, nombre: limpiar(z2.nombre, 30) || z.nombre, precio: z2.precio == null || z2.precio === '' ? z.precio : precio(z2.precio) };
  });
  const zonaOk = id => zonas.some(z => z.id === id);
  const precioZona = id => (zonas.find(z => z.id === id) || zonas[zonas.length - 1]).precio;

  const seen = new Set();
  const barrios = (Array.isArray(r.barrios) ? r.barrios : [])
    .map(b => {
      const nombre = limpiar(b && b.nombre);
      const zona = b && zonaOk(b.zona) ? b.zona : zonaPorPrecio(zonas, precio(b && b.precio));
      return { nombre, zona, precio: precioZona(zona) };
    })
    .filter(b => b.nombre && !seen.has(norm(b.nombre)) && seen.add(norm(b.nombre)))
    .slice(0, 300)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const otroZona = zonaOk(r.otroZona) ? r.otroZona : r.otro != null && r.otro !== '' ? zonaPorPrecio(zonas, precio(r.otro)) : 'lejos';
  return { zonas, barrios, otroZona, otro: precioZona(otroZona), min: MIN_DOMICILIO, max: MAX_DOMICILIO };
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

/* Lo que se guarda en la base (sin precios repetidos por barrio) */
function paraGuardar(cfg) {
  return { zonas: cfg.zonas, barrios: cfg.barrios.map(b => ({ nombre: b.nombre, zona: b.zona })), otroZona: cfg.otroZona };
}

module.exports = { MIN_DOMICILIO, MAX_DOMICILIO, ZONAS_BASE, sanitize, loadDomicilios, precioBarrio, paraGuardar };
