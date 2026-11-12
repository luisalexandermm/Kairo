'use strict';
/* =====================================================================
   Opiniones de clientes: utilidades compartidas por la tienda y el panel.
   ===================================================================== */
const BUCKET = 'punto-club-opiniones';
const MAX_FOTOS = 3;
const MAX_FOTO_BYTES = 1024 * 1024;
const AJUSTES = ['pequena', 'justa', 'grande'];

/* Valida una foto enviada como data URL. Devuelve { buffer, mime, ext } o { error } */
function parseFoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(dataUrl || ''));
  if (!m) return { error: 'Las fotos deben ser JPG, PNG o WEBP.' };
  if (m[2].length > Math.ceil(MAX_FOTO_BYTES / 3) * 4) return { error: 'Cada foto debe pesar máximo 1 MB.' };
  const kind = m[1].toLowerCase(), buffer = Buffer.from(m[2], 'base64');
  const ok = kind === 'jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : kind === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!buffer.length || buffer.length > MAX_FOTO_BYTES || !ok) return { error: 'Una de las fotos no es una imagen válida.' };
  return { buffer, mime: 'image/' + kind, ext: kind === 'jpeg' ? 'jpg' : kind };
}

/* "Ana María Pérez" → "Ana P." (nunca se publica el nombre completo) */
function nombrePublico(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return 'Cliente';
  const first = p[0].charAt(0).toUpperCase() + p[0].slice(1).toLowerCase();
  const last = p.length > 1 ? ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.' : '';
  return (first + last).slice(0, 40);
}

const estrella = v => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : null; };

/* Ruta del archivo dentro del bucket a partir de su enlace público */
function rutaDesdeUrl(url) {
  const i = String(url || '').indexOf('/' + BUCKET + '/');
  return i < 0 ? '' : decodeURIComponent(String(url).slice(i + BUCKET.length + 2).split('?')[0]);
}

/* Lo que ve el público de una opinión */
function publica(r) {
  return {
    id: r.id, rating: r.rating, envio: r.envio, calidad: r.calidad, llegoBien: r.llego_bien,
    tallaAjuste: r.talla_ajuste, comentario: r.comentario, fotos: r.fotos || [],
    nombre: r.nombre, ciudad: r.ciudad, talla: r.talla, color: r.color,
    respuesta: r.respuesta || '', respuestaAt: r.respuesta_at, createdAt: r.created_at
  };
}

/* Resumen de un producto: promedio, distribución, ajuste de talla y % que llegó bien */
function resumen(list) {
  const total = list.length;
  const dist = [0, 0, 0, 0, 0];
  const ajuste = { pequena: 0, justa: 0, grande: 0 };
  let suma = 0, bien = 0, conEstado = 0;
  list.forEach(r => {
    suma += r.rating; dist[r.rating - 1]++;
    if (r.talla_ajuste && ajuste[r.talla_ajuste] != null) ajuste[r.talla_ajuste]++;
    if (r.llego_bien != null) { conEstado++; if (r.llego_bien) bien++; }
  });
  return {
    total, promedio: total ? Math.round(suma / total * 10) / 10 : 0, distribucion: dist, ajuste,
    llegoBien: conEstado ? Math.round(bien / conEstado * 100) : null
  };
}

module.exports = { BUCKET, MAX_FOTOS, AJUSTES, parseFoto, nombrePublico, estrella, rutaDesdeUrl, publica, resumen };
