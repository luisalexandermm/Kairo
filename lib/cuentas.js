'use strict';
/* =====================================================================
   Cuentas para recibir pagos por transferencia o QR. Por ahora Punto Club
   solo recibe en Nequi o con llave Bre-B (el cliente paga desde la app de
   cualquier banco). Se editan en el panel (Ajustes → Cuentas para recibir
   pagos) y se guardan en settings.pagos = { cuentas: [...] }.
   Las cuentas de otros bancos guardadas antes no se muestran.
   Si no hay ninguna, la tienda usa la cuenta Nequi de public/js/negocio.js.
   ===================================================================== */
const BANCOS = ['Nequi', 'Bre-B'];
const TIPOS = ['Llave Bre-B', 'Número de celular'];

const limpiar = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F<>"]/g, '').trim().replace(/\s+/g, ' ').slice(0, max);
/* Solo imágenes de la propia tienda (/img/…) o de un enlace https (bucket de Supabase) */
const qrOk = u => {
  const s = String(u || '').trim();
  return /^\/img\/[\w.-]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s) ? s.slice(0, 500) : '';
};

function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const cuentas = (Array.isArray(r.cuentas) ? r.cuentas : [])
    .filter(c => c && BANCOS.includes(c.banco))
    .map(c => ({
      banco: c.banco,
      nombre: limpiar(c && c.nombre, 30), // nombre visible si el banco es "Otro"
      titular: limpiar(c && c.titular, 80),
      tipo: TIPOS.includes(c && c.tipo) ? c.tipo : c.banco === 'Bre-B' ? 'Llave Bre-B' : 'Número de celular',
      numero: limpiar(c && c.numero, 40),
      qr: qrOk(c && c.qr)
    }))
    .filter(c => c.numero || c.qr)
    .slice(0, 6);
  return { cuentas };
}

module.exports = { BANCOS, TIPOS, sanitize };
