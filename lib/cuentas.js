'use strict';
/* =====================================================================
   Cuentas para recibir pagos por transferencia o QR (Nequi, Bancolombia,
   Daviplata, llave Bre-B…). Se editan en el panel (Ajustes → Cuentas para
   recibir pagos) y se guardan en settings.pagos = { cuentas: [...] }.
   Si no hay ninguna, la tienda usa la cuenta Nequi de public/js/negocio.js.
   ===================================================================== */
const BANCOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Bre-B', 'Davivienda', 'Banco de Bogotá', 'BBVA', 'Otro'];
const TIPOS = ['Llave Bre-B', 'Número de celular', 'Cuenta de ahorros', 'Cuenta corriente'];

const limpiar = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F<>"]/g, '').trim().replace(/\s+/g, ' ').slice(0, max);
/* Solo imágenes de la propia tienda (/img/…) o de un enlace https (bucket de Supabase) */
const qrOk = u => {
  const s = String(u || '').trim();
  return /^\/img\/[\w.-]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s) ? s.slice(0, 500) : '';
};

function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const cuentas = (Array.isArray(r.cuentas) ? r.cuentas : [])
    .map(c => ({
      banco: BANCOS.includes(c && c.banco) ? c.banco : 'Otro',
      nombre: limpiar(c && c.nombre, 30), // nombre visible si el banco es "Otro"
      titular: limpiar(c && c.titular, 80),
      tipo: TIPOS.includes(c && c.tipo) ? c.tipo : 'Número de celular',
      numero: limpiar(c && c.numero, 40),
      qr: qrOk(c && c.qr)
    }))
    .filter(c => c.numero || c.qr)
    .slice(0, 6);
  return { cuentas };
}

module.exports = { BANCOS, TIPOS, sanitize };
