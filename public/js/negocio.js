/* =====================================================================
   DATOS DEL NEGOCIO — kAIRO
   ---------------------------------------------------------------------
   Este es el ÚNICO lugar donde se escriben los datos legales del negocio.
   La tienda, el pie de página y todas las páginas legales los leen de aquí.

   ⚠️  Todo campo vacío ('') aparece en el sitio como  [COMPLETAR: …]
       para que no se publique nada inventado. Llénalos con los datos
       EXACTOS que figuran en tu RUT / Cámara de Comercio antes de publicar.
   ===================================================================== */
window.NEGOCIO = {
  /* Identificación (Ley 1480 de 2011, art. 50, y Ley 1581 de 2012) */
  nombreComercial: 'kAIRO',
  responsable: '',          // Nombre completo de la persona natural o razón social, tal como aparece en el RUT
  nit: '',                  // NIT con dígito de verificación, ej. 1234567890-1
  matriculaMercantil: '',   // Opcional: número de matrícula en Cámara de Comercio (déjalo vacío si no aplica)
  direccion: '',            // Dirección física de notificaciones (no puede ser solo un WhatsApp)
  ciudad: '',               // Ciudad y departamento, ej. Quibdó, Chocó
  correo: '',               // Correo para PQR y solicitudes de datos personales
  whatsapp: '573145312045', // Solo números, con indicativo 57
  telefonoVisible: '314 531 2045',
  horario: '',              // Horario de atención, ej. Lunes a sábado, 8:00 a. m. – 6:00 p. m.
  instagram: '',            // URL completa de Instagram (vacío = no se muestra el ícono)

  /* Condiciones comerciales que SOLO tú puedes definir */
  plazoEntrega: '',         // ej. 2 a 5 días hábiles en ciudades principales. Máximo legal si no se informa: 30 días calendario
  anticipoEnvioContraentrega: 25000, // Valor que la tienda cobra hoy como anticipo de envío en contraentrega
  plazoCambioTallaDias: '', // Días para cambios de talla por gusto (voluntario). Vacío = [COMPLETAR]

  /* Versión de las políticas. Si cambias los textos legales, cambia esta fecha:
     queda guardada junto a cada pedido como prueba de lo que aceptó el cliente. */
  versionPoliticas: '2026-09-25'
};

(function () {
  var N = window.NEGOCIO;
  var etiquetas = {
    responsable: 'nombre o razón social del RUT', nit: 'NIT', direccion: 'dirección física',
    ciudad: 'ciudad', correo: 'correo de atención', horario: 'horario de atención',
    plazoEntrega: 'plazo de entrega', plazoCambioTallaDias: 'días para cambio de talla'
  };
  var faltantes = Object.keys(etiquetas).filter(function (k) { return !String(N[k] || '').trim(); });
  N.faltantes = faltantes;
  if (faltantes.length && window.console) {
    console.warn('[kAIRO] Faltan datos del negocio en /js/negocio.js:', faltantes.join(', '));
  }

  function valor(k) {
    if (k === 'whatsappLink') return 'https://wa.me/' + N.whatsapp;
    if (k === 'anticipoEnvioContraentrega') return '$' + Number(N[k] || 0).toLocaleString('es-CO');
    if (k === 'fechaPoliticas') {
      var p = String(N.versionPoliticas).split('-');
      var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      return Number(p[2]) + ' de ' + meses[Number(p[1]) - 1] + ' de ' + p[0];
    }
    return N[k];
  }

  function pintar() {
    document.querySelectorAll('[data-negocio]').forEach(function (el) {
      var k = el.getAttribute('data-negocio');
      var v = valor(k);
      if (v === undefined || v === null || String(v).trim() === '') {
        if (el.hasAttribute('data-opcional')) { el.closest('[data-fila]') ? el.closest('[data-fila]').remove() : el.remove(); return; }
        el.innerHTML = '';
        var m = document.createElement('mark');
        m.className = 'pendiente';
        m.textContent = '[COMPLETAR: ' + (etiquetas[k] || k) + ']';
        el.appendChild(m);
        return;
      }
      if (el.tagName === 'A') {
        if (k === 'correo') el.href = 'mailto:' + v;
        if (k === 'telefonoVisible' || k === 'whatsappLink') el.href = 'https://wa.me/' + N.whatsapp;
        if (k === 'instagram') { el.href = v; el.hidden = false; return; }
      }
      el.textContent = v;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintar);
  else pintar();
  N.pintar = pintar;
})();
