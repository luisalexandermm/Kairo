'use strict';
/* =====================================================================
   Envíos nacionales de Punto Club: una tarifa fija para toda Colombia.
   - El valor se edita en el panel (Ajustes → Envío nacional) y se guarda en
     settings.envio_nacional. Si la columna no existe todavía, se usa ENVIO_BASE.
   - El servidor nunca cobra fuera del rango MIN_ENVIO … MAX_ENVIO.
   ===================================================================== */
const ENVIO_BASE = 25000;
const MIN_ENVIO = 0;
const MAX_ENVIO = 100000;

/* Departamentos de Colombia (y Bogotá D.C.), en el orden en que se muestran */
const DEPARTAMENTOS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá',
  'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila',
  'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda',
  'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'
];

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/* Nombre oficial del departamento a partir de lo que escriba o elija el cliente ('' si no existe) */
function departamento(v) {
  const n = norm(v);
  return DEPARTAMENTOS.find(d => norm(d) === n) || '';
}

/* Valor de envío seguro: redondeado a centenas y dentro del rango */
function precioEnvio(v) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return ENVIO_BASE;
  return Math.min(MAX_ENVIO, Math.max(MIN_ENVIO, Math.round(Number(v) / 100) * 100));
}

async function loadEnvio(supabase) {
  try {
    const { data, error } = await supabase.from('settings').select('envio_nacional').eq('id', 'app').single();
    return precioEnvio(error ? null : data && data.envio_nacional);
  } catch {
    return ENVIO_BASE;
  }
}

module.exports = { ENVIO_BASE, MIN_ENVIO, MAX_ENVIO, DEPARTAMENTOS, departamento, precioEnvio, loadEnvio };
