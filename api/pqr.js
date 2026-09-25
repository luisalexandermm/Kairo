'use strict';
/* POST /api/pqr — registra peticiones, quejas y reclamos con número de radicado
   (Ley 1480 de 2011 modificada por la Ley 2439 de 2024, y Ley 1581 de 2012). */
const supabase = require('../lib/supabase');
const { ok, err, allowCors, cleanText } = require('../lib/helpers');

const TIPOS = ['Petición', 'Queja', 'Reclamo', 'Retracto', 'Reversión del pago', 'Garantía', 'Solicitud sobre mis datos personales'];

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);

  const b = req.body || {};
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : null;
  const nombre = cleanText(b.nombre, 120);
  const celular = cleanText(b.celular, 20).replace(/[^\d+ ]/g, '');
  const correo = cleanText(b.correo, 120);
  const pedido = cleanText(b.pedido, 40);
  const mensaje = cleanText(b.mensaje, 3000);
  const autorizo = b.autorizacion && b.autorizacion.datos === true;

  if (!tipo) return err(res, 'Elige el tipo de solicitud', 400);
  if (!nombre) return err(res, 'Escribe tu nombre', 400);
  if (!celular && !correo) return err(res, 'Escribe un celular o un correo', 400);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return err(res, 'El correo no es válido', 400);
  if (mensaje.length < 10) return err(res, 'El mensaje es muy corto', 400);
  if (!autorizo) return err(res, 'Falta la autorización de tratamiento de datos', 400);

  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const radicado = `PQR-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const { error } = await supabase.from('pqrs').insert({
    id: radicado, tipo, nombre, celular, correo, pedido, mensaje, estado: 'Radicada',
    autorizacion: { datos: true, version: cleanText(b.autorizacion.version, 20), fecha: d.toISOString() }
  });
  if (error) {
    console.error('PQR no guardada:', error.message);
    return err(res, 'No se pudo registrar la solicitud', 500);
  }
  ok(res, { radicado }, 201);
};
