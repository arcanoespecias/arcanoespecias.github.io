/* ===================== WHATSAPP NOTIFICATIONS \u2014 Admin Panel =====================
 * Sistema de plantillas configurables por evento + historial + estad\u00EDsticas.
 * Eventos: nuevo, confirmado, enviado, entregado, cancelado, pago_recibido.
 *
 * Persistencia: arcano/db/tiendaConfig/mensajesWhatsApp/
 *   \u251C\u2500\u2500 plantillas: { estado: {mensaje, activo} }
 *   \u2514\u2500\u2500 historial: [{cliente, tel, mensaje, estado, fecha, enviado}]
 *                  (tambi\u00E9n en arcano/db/whatsappHistorial/{autoId})
 */

var WhatsAppNotifications = (function() {

  var FB_URL = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';
  var ESTADOS = ['nuevo', 'confirmado', 'enviado', 'entregado', 'cancelado', 'pago_recibido', 'primer_pedido'];
  var ESTADO_LABELS = {
    nuevo: '\u{1F195} Pedido Nuevo',
    confirmado: '\u2705 Pedido Confirmado',
    enviado: '\u{1F69A} Pedido Enviado',
    entregado: '\u{1F4E6} Pedido Entregado',
    cancelado: '\u274C Pedido Cancelado',
    pago_recibido: '\u{1F4B0} Pago Recibido',
    primer_pedido: '\u{1F381} Primer Pedido'
  };
  var ESTADO_DESCRIPCIONES = {
    nuevo: 'Cuando un cliente hace un pedido nuevo en la tienda',
    confirmado: 'Cuando confirm\u00E1s el pedido (lo vas a preparar)',
    enviado: 'Cuando el pedido sale a entrega / gu\u00EDa generada',
    entregado: 'Cuando el pedido fue entregado al cliente',
    cancelado: 'Cuando cancel\u00E1s un pedido',
    pago_recibido: 'Cuando registr\u00E1s un pago del cliente',
    primer_pedido: 'Cuando un cliente hace su primer pedido (bienvenida)'
  };

  var PLANTILLAS_DEFAULT = {
    nuevo: {
      mensaje: 'Hola {nombre}! Recibimos tu pedido #{id} en Arcano Especias por ${total}. Lo estamos revisando y te confirmamos en breve.',
      activo: true
    },
    confirmado: {
      mensaje: 'Hola {nombre}! Confirmamos tu pedido #{id} por ${total}. Lo estamos preparando con cuidado. Te avisamos cuando salga.',
      activo: true
    },
    enviado: {
      mensaje: '{nombre}, tu pedido #{id} esta en viaje! Lo recibiras pronto. Si tienes dudas, escribenos por aqui.',
      activo: true
    },
    entregado: {
      mensaje: 'Hola {nombre}! Tu pedido #{id} fue entregado. Esperamos que disfrutes tus blends. Como fue tu experiencia? Escribenos por aqui.',
      activo: true
    },
    cancelado: {
      mensaje: 'Hola {nombre}, tu pedido #{id} fue cancelado. Si tienes dudas o quieres reactivarlo, escribenos por aqui.',
      activo: false
    },
    pago_recibido: {
      mensaje: 'Gracias {nombre}! Recibimos tu pago de ${total} por el pedido #{id}. Lo estamos preparando para envio.',
      activo: true
    },
    primer_pedido: {
      mensaje: 'Hola {nombre}! Bienvenido a Arcano Especias! Este es tu primer pedido #{id} y queremos agradecerte por confiar en nosotros. Tus blends estan siendo preparados con cuidado. Cualquier duda, escribenos por aqui.',
      activo: true
    }
  };

  var VARIABLES = [
    { var: '{nombre}', desc: 'Nombre del cliente' },
    { var: '{id}', desc: 'ID corto del pedido (\u00FAltimos 6 caracteres)' },
    { var: '{total}', desc: 'Total del pedido (numero sin $). Usar ${total} para incluir signo' },
    { var: '{estado}', desc: 'Estado actual del pedido' },
    { var: '{items}', desc: 'Lista de productos del pedido' },
    { var: '{cantidad}', desc: 'Cantidad total de items' },
    { var: '{ciudad}', desc: 'Ciudad de env\u00EDo' },
    { var: '{direccion}', desc: 'Direcci\u00F3n de env\u00EDo' },
    { var: '{fecha}', desc: 'Fecha del pedido' },
    { var: '{guia}', desc: 'N\u00FAmero de gu\u00EDa (si est\u00E1 disponible)' }
  ];

  function renderPanel(container) {
    container.innerHTML =
      '<div class="wa-panel">' +
        _styles() +
        '<h2 style="color:var(--gold,#d4af37);margin:0 0 4px">\u{1F4F1} Mensajes WhatsApp</h2>' +
        '<p style="color:var(--text-muted,#8a7a6e);margin:0 0 20px;font-size:0.9rem">Plantillas autom\u00E1ticas para cada evento del pedido + env\u00EDo manual + estad\u00EDsticas</p>' +

        '<div id="wa-tabs" class="wa-tabs">' +
          '<button class="wa-tab active" data-tab="plantillas" onclick="WhatsAppNotifications.showTab(\'plantillas\')">\u{1F4DD} Plantillas por evento</button>' +
          '<button class="wa-tab" data-tab="estadisticas" onclick="WhatsAppNotifications.showTab(\'estadisticas\')">\u{1F4CA} Estad\u00EDsticas</button>' +
          '<button class="wa-tab" data-tab="historial" onclick="WhatsAppNotifications.showTab(\'historial\')">\u{1F4DC} Historial</button>' +
          '<button class="wa-tab" data-tab="manual" onclick="WhatsAppNotifications.showTab(\'manual\')">\u{1F4E4} Env\u00EDo manual</button>' +
        '</div>' +

        '<div id="wa-content"><div class="loader-center"><div class="loader"></div></div></div>' +
      '</div>';

    loadAndRender('plantillas');
  }

  function showTab(tab) {
    document.querySelectorAll('.wa-tab').forEach(function(t) { t.classList.remove('active'); });
    var btn = document.querySelector('.wa-tab[data-tab="' + tab + '"]');
    if (btn) btn.classList.add('active');
    loadAndRender(tab);
  }

  async function loadAndRender(tab) {
    var content = document.getElementById('wa-content');
    if (!content) return;
    content.innerHTML = '<div class="loader-center"><div class="loader"></div></div>';

    try {
      var cfg = await loadConfig();
      var historial = await loadHistorial();
      if (tab === 'plantillas') renderPlantillas(content, cfg);
      else if (tab === 'estadisticas') renderEstadisticas(content, cfg, historial);
      else if (tab === 'historial') renderHistorial(content, historial);
      else if (tab === 'manual') renderManual(content, cfg);
    } catch (e) {
      content.innerHTML = '<div class="wa-error">Error: ' + escHtml(e.message) + '</div>';
    }
  }

  // === TAB: Plantillas por evento ===

  function renderPlantillas(container, cfg) {
    var plantillas = cfg.plantillas || {};
    var html = '<div class="wa-section">';

    // Header con variables
    html += '<div class="wa-info-box">' +
      '<h4>\u{1F4CB} Variables disponibles</h4>' +
      '<p>Us\u00E1 estas variables en tus mensajes. Se reemplazan autom\u00E1ticamente con los datos del pedido:</p>' +
      '<div class="wa-vars-grid">';
    VARIABLES.forEach(function(v) {
      html += '<code>' + v.var + '</code><span>' + v.desc + '</span>';
    });
    html += '</div></div>';

    // Plantillas por evento
    ESTADOS.forEach(function(estado) {
      var p = plantillas[estado] || PLANTILLAS_DEFAULT[estado];
      var label = ESTADO_LABELS[estado];
      var desc = ESTADO_DESCRIPCIONES[estado];
      html += '<div class="wa-template-card' + (p.activo ? '' : ' inactive') + '">' +
        '<div class="wa-template-header">' +
          '<div>' +
            '<h4>' + label + '</h4>' +
            '<p class="wa-template-desc">' + desc + '</p>' +
          '</div>' +
          '<label class="wa-switch">' +
            '<input type="checkbox" id="wa-activo-' + estado + '" ' + (p.activo ? 'checked' : '') + ' onchange="WhatsAppNotifications.toggleActivo(\'' + estado + '\', this.checked)">' +
            '<span class="wa-slider"></span>' +
          '</label>' +
        '</div>' +
        '<textarea id="wa-msg-' + estado + '" rows="3" placeholder="Escribe el mensaje...">' + escHtml(p.mensaje || '') + '</textarea>' +
        '<div class="wa-template-actions">' +
          '<button class="wa-btn wa-btn-sec" onclick="WhatsAppNotifications.previewMensaje(\'' + estado + '\')">\u{1F441}\uFE0F Vista previa</button>' +
          '<button class="wa-btn wa-btn-gold" onclick="WhatsAppNotifications.savePlantilla(\'' + estado + '\')">\u{1F4BE} Guardar</button>' +
          '<button class="wa-btn wa-btn-outline" onclick="WhatsAppNotifications.resetPlantilla(\'' + estado + '\')">\u21BA Restablecer</button>' +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  async function toggleActivo(estado, activo) {
    try {
      var cfg = await loadConfig();
      cfg.plantillas = cfg.plantillas || {};
      cfg.plantillas[estado] = cfg.plantillas[estado] || PLANTILLAS_DEFAULT[estado];
      cfg.plantillas[estado].activo = activo;
      await saveConfig(cfg);
      toast(activo ? 'Plantilla activada \u2705' : 'Plantilla desactivada');
      // Update visual sin recargar todo
      var card = document.getElementById('wa-activo-' + estado).closest('.wa-template-card');
      if (card) card.classList.toggle('inactive', !activo);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function savePlantilla(estado) {
    var msg = document.getElementById('wa-msg-' + estado).value.trim();
    if (!msg) { alert('El mensaje no puede estar vac\u00EDo'); return; }
    try {
      var cfg = await loadConfig();
      cfg.plantillas = cfg.plantillas || {};
      var current = cfg.plantillas[estado] || PLANTILLAS_DEFAULT[estado];
      cfg.plantillas[estado] = { mensaje: msg, activo: current.activo !== false };
      await saveConfig(cfg);
      toast('Plantilla guardada \u2705');
    } catch (e) { alert('Error: ' + e.message); }
  }

  function resetPlantilla(estado) {
    if (!confirm('\u00BFRestablecer esta plantilla a su valor por defecto?')) return;
    document.getElementById('wa-msg-' + estado).value = PLANTILLAS_DEFAULT[estado].mensaje;
    toast('Plantilla restablecida. Hac\u00E9 clic en "Guardar" para confirmar.');
  }

  function previewMensaje(estado) {
    var msg = document.getElementById('wa-msg-' + estado).value;
    var preview = applyVariables(msg, {
      nombre: 'Mar\u00EDa Gonz\u00E1lez',
      id: 'A3F2K9',
      total: '45.000',
      estado: estado,
      items: 'Chimichurri Argentino x1, Garam Masala x2',
      cantidad: '3',
      ciudad: 'Medell\u00EDn',
      direccion: 'Cra 45 #12-34, Apto 502',
      fecha: new Date().toLocaleDateString('es-CO'),
      guia: '1234567890'
    });
    alert('\u{1F4F1} Vista previa del mensaje:\n\n' + preview);
  }

  // === TAB: Estad\u00EDsticas ===

  function renderEstadisticas(container, cfg, historial) {
    var total = historial.length;
    var enviados = historial.filter(function(h) { return h.enviado !== false; }).length;
    var saltados = total - enviados;
    var hoy = new Date().toISOString().slice(0, 10);
    var enviadosHoy = historial.filter(function(h) {
      return h.fecha && h.fecha.slice(0, 10) === hoy && h.enviado !== false;
    }).length;

    // Por evento
    var porEvento = {};
    ESTADOS.forEach(function(e) { porEvento[e] = { enviados: 0, total: 0 }; });
    historial.forEach(function(h) {
      var ev = h.estado || 'nuevo';
      if (!porEvento[ev]) porEvento[ev] = { enviados: 0, total: 0 };
      porEvento[ev].total++;
      if (h.enviado !== false) porEvento[ev].enviados++;
    });

    // \u00DAltimos 30 d\u00EDas
    var porDia = {};
    var hoyDate = new Date();
    for (var i = 29; i >= 0; i--) {
      var d = new Date(hoyDate);
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      porDia[key] = 0;
    }
    historial.forEach(function(h) {
      if (h.fecha && h.enviado !== false) {
        var key = h.fecha.slice(0, 10);
        if (porDia[key] !== undefined) porDia[key]++;
      }
    });

    // Clientes \u00FAnicos notificados
    var clientesUnicos = new Set(historial.filter(function(h) { return h.enviado !== false; }).map(function(h) { return h.tel; })).size;

    // Tasa de env\u00EDo
    var tasaEnvio = total > 0 ? Math.round((enviados / total) * 100) : 0;

    var html = '<div class="wa-section">' +
      '<div class="wa-stats-grid">' +
        _statCard('Total notificaciones', total, 'blue') +
        _statCard('Enviadas', enviados, 'green') +
        _statCard('Saltadas', saltados, 'muted') +
        _statCard('Enviadas hoy', enviadosHoy, 'gold') +
        _statCard('Clientes \u00FAnicos', clientesUnicos, 'blue') +
        _statCard('Tasa de env\u00EDo', tasaEnvio + '%', 'green') +
      '</div>';

    // Gr\u00E1fico de mensajes por d\u00EDa (\u00FAltimos 30 d\u00EDas)
    html += '<div class="wa-card mt-16">' +
      '<h4>\u{1F4C8} Mensajes enviados por d\u00EDa (\u00FAltimos 30 d\u00EDas)</h4>' +
      '<div class="wa-chart-wrap"><canvas id="wa-chart-dias"></canvas></div>' +
    '</div>';

    // Tabla por evento
    html += '<div class="wa-card mt-16">' +
      '<h4>\u{1F4CA} Notificaciones por evento</h4>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Evento</th><th>Disparadas</th><th>Enviadas</th><th>Saltadas</th><th>Tasa</th></tr></thead><tbody>';
    ESTADOS.forEach(function(e) {
      var d = porEvento[e];
      var tasa = d.total > 0 ? Math.round((d.enviados / d.total) * 100) : 0;
      html += '<tr><td>' + ESTADO_LABELS[e] + '</td><td>' + d.total + '</td><td class="text-green">' + d.enviados + '</td><td class="text-muted">' + (d.total - d.enviados) + '</td><td><span class="badge ' + (tasa >= 70 ? 'text-green' : tasa >= 40 ? 'text-yellow' : 'text-red') + '">' + tasa + '%</span></td></tr>';
    });
    html += '</tbody></table></div></div>';

    html += '</div>';

    container.innerHTML = html;

    // Render chart
    setTimeout(function() {
      var canvas = document.getElementById('wa-chart-dias');
      if (!canvas) return;
      var days = Object.keys(porDia).sort();
      var labels = days.map(function(d) { return d.slice(5); });
      var data = days.map(function(d) { return porDia[d]; });

      if (window._waChart) window._waChart.destroy();
      window._waChart = new Chart(canvas, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Mensajes enviados', data: data, backgroundColor: '#d4af37', borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#8a7a6e', font: { size: 9 } }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: '#8a7a6e', font: { size: 10 }, precision: 0 }, grid: { color: 'rgba(212,175,55,0.1)' } }
          }
        }
      });
    }, 50);
  }

  // === TAB: Historial ===

  function renderHistorial(container, historial) {
    var html = '<div class="wa-section">' +
      '<div class="wa-card">' +
        '<h4>\u{1F4DC} \u00DAltimas 50 notificaciones</h4>';
    if (historial.length === 0) {
      html += '<p class="text-muted text-center" style="padding:40px">No hay notificaciones enviadas todav\u00EDa. Cuando cambies el estado de un pedido y notifiques al cliente, aparecer\u00E1 ac\u00E1.</p>';
    } else {
      html += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Tel\u00E9fono</th><th>Evento</th><th>Pedido</th><th>Estado</th><th></th></tr></thead><tbody>';
      var ultimos = historial.slice(-50).reverse();
      ultimos.forEach(function(h, idx) {
        var fecha = h.fecha ? new Date(h.fecha).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
        var estadoBadge = h.enviado !== false
          ? '<span class="badge text-green">\u2713 Enviado</span>'
          : '<span class="badge text-muted">\u2298 Saltado</span>';
        var pedidoId = h.pedidoId ? h.pedidoId.slice(-6).toUpperCase() : '-';
        html += '<tr>' +
          '<td class="text-sm">' + fecha + '</td>' +
          '<td class="fw7">' + escHtml(h.cliente || 'Cliente') + '</td>' +
          '<td>' + escHtml(h.tel || '') + '</td>' +
          '<td>' + (ESTADO_LABELS[h.estado] || h.estado || '-') + '</td>' +
          '<td><code>#' + pedidoId + '</code></td>' +
          '<td>' + estadoBadge + '</td>' +
          '<td>' +
            (h.tel ? '<button class="btn btn-sm btn-outline" onclick="WhatsAppNotifications.reenviar(' + idx + ')">\u21BB Reenviar</button>' : '') +
          '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div></div>';
    container.innerHTML = html;

    // Guardar referencia para reenviar
    _lastHistorial = ultimos;
  }

  // === TAB: Env\u00EDo manual ===

  function renderManual(container, cfg) {
    var clientes = (typeof ArcanoDB !== 'undefined' && ArcanoDB.getClientes) ? ArcanoDB.getClientes() : [];
    var html = '<div class="wa-section">' +
      '<div class="wa-card">' +
        '<h4>\u{1F4E4} Env\u00EDo manual a clientes</h4>' +
        '<p class="text-sm text-muted">Selecciona uno o varios clientes y env\u00EDales un mensaje personalizado. Se abrir\u00E1 una pesta\u00F1a de WhatsApp por cada uno con el mensaje pre-cargado.</p>' +

        '<div class="form-group mt-12">' +
          '<label>Mensaje (usa {nombre})</label>' +
          '<textarea id="wa-manual-msg" rows="3" placeholder="Hola {nombre}! Tenemos una promo especial para ti...">' + escHtml((cfg.mensajesWhatsApp && cfg.mensajesWhatsApp.mensajeManual) || '') + '</textarea>' +
        '</div>' +

        '<div class="mt-8" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<button class="wa-btn wa-btn-outline" onclick="WhatsAppNotifications.selectAllClientes(true)">\u2611 Seleccionar todos</button>' +
          '<button class="wa-btn wa-btn-outline" onclick="WhatsAppNotifications.selectAllClientes(false)">\u2610 Quitar selecci\u00F3n</button>' +
          '<span class="text-sm text-muted ml-8" id="wa-seleccionados-count">0 seleccionados</span>' +
        '</div>';

    if (clientes.length === 0) {
      html += '<p class="text-muted text-center mt-12">No hay clientes registrados a\u00FAn.</p>';
    } else {
      html += '<div class="table-wrap mt-12"><table class="table"><thead><tr>' +
        '<th><input type="checkbox" onchange="WhatsAppNotifications.selectAllClientes(this.checked)"></th>' +
        '<th>Nombre</th><th>WhatsApp</th><th>Pedidos</th><th>\u00DAltimo pedido</th>' +
        '</tr></thead><tbody>';
      var pedidos = (typeof ArcanoDB !== 'undefined' && ArcanoDB.getPedidos) ? ArcanoDB.getPedidos() : [];
      var totalPorCliente = {};
      for (var pi = 0; pi < pedidos.length; pi++) {
        var p = pedidos[pi];
        if (p.clienteId && p.estado !== 'cancelado') {
          totalPorCliente[p.clienteId] = (totalPorCliente[p.clienteId] || 0) + (p.total || 0);
        }
      }
      for (var ci = 0; ci < clientes.length; ci++) {
        var c = clientes[ci];
        var ultimo = c.ultimoPedido ? new Date(c.ultimoPedido).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '-';
        html += '<tr>' +
          '<td><input type="checkbox" class="wa-cliente-check" data-key="' + c._key + '" data-nombre="' + escHtml(c.nombre || '') + '" data-tel="' + escHtml(c.telefono || '') + '" onchange="WhatsAppNotifications.updateSeleccionados()"></td>' +
          '<td class="fw7">' + escHtml(c.nombre || 'Sin nombre') + '</td>' +
          '<td>' + escHtml(c.telefono || '-') + '</td>' +
          '<td><span class="badge badge-gold">' + (c.totalPedidos || 0) + '</span></td>' +
          '<td class="text-sm text-muted">' + ultimo + '</td>' +
        '</tr>';
      }
      html += '</tbody></table></div>';

      html += '<div class="mt-12" style="display:flex;gap:8px;align-items:center">' +
        '<button class="wa-btn wa-btn-gold" onclick="WhatsAppNotifications.enviarManual()">\u{1F4E4} Enviar a seleccionados</button>' +
        '<span id="wa-envio-status" class="text-sm text-muted ml-8"></span>' +
      '</div>';
    }
    html += '</div></div>';
    container.innerHTML = html;
  }

  function selectAllClientes(check) {
    document.querySelectorAll('.wa-cliente-check').forEach(function(c) { c.checked = check; });
    updateSeleccionados();
  }

  function updateSeleccionados() {
    var count = document.querySelectorAll('.wa-cliente-check:checked').length;
    var el = document.getElementById('wa-seleccionados-count');
    if (el) el.textContent = count + ' seleccionado' + (count !== 1 ? 's' : '');
  }

  async function enviarManual() {
    var checks = document.querySelectorAll('.wa-cliente-check:checked');
    if (checks.length === 0) { alert('Selecciona al menos un cliente'); return; }
    var msg = document.getElementById('wa-manual-msg').value || 'Hola {nombre}! Te escribimos desde Arcano Especias.';
    var enviados = 0;
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      var nombre = c.dataset.nombre || 'Cliente';
      var tel = c.dataset.tel || '';
      var telNorm = _normalizeTel(tel);
      if (!telNorm) continue;
      var msgFinal = msg.replace(/\{nombre\}/g, nombre);
      var waLink = _buildWaLink(telNorm, msgFinal);
      window.open(waLink, '_blank');
      enviados++;
      // Log
      logHistorial({
        cliente: nombre, tel: tel, mensaje: msgFinal,
        estado: 'manual', enviado: true, fecha: new Date().toISOString()
      });
    }
    var status = document.getElementById('wa-envio-status');
    if (status) status.innerHTML = '<span style="color:var(--green)">' + enviados + ' mensajes abiertos en WhatsApp. Env\u00EDalos manualmente.</span>';
    toast(enviados + ' mensajes preparados');
  }

  // === Modal de notificaci\u00F3n al cambiar estado ===

  async function showNotificacionModal(pedido, nuevoEstado) {
    var cfg = await loadConfig();
    var plantilla = (cfg.plantillas && cfg.plantillas[nuevoEstado]) || PLANTILLAS_DEFAULT[nuevoEstado];

    // Si la plantilla est\u00E1 desactivada, no mostrar modal
    if (plantilla.activo === false) {
      logHistorial({
        cliente: (pedido.cliente || {}).nombre || 'Cliente',
        tel: (pedido.cliente || {}).telefono || '',
        pedidoId: pedido._key,
        estado: nuevoEstado, enviado: false,
        fecha: new Date().toISOString()
      });
      return false; // no se envi\u00F3
    }

    var cl = pedido.cliente || {};
    var tel = cl.telefono || '';
    var telNorm = _normalizeTel(tel);
    var mensaje = applyVariables(plantilla.mensaje, {
      nombre: cl.nombre || 'Cliente',
      id: (pedido._key || '').slice(-6).toUpperCase(),
      total: (pedido.total || 0).toLocaleString('es-CO'),
      estado: nuevoEstado,
      items: (pedido.items || []).map(function(it) { return (it.nombre || '?') + ' x' + (it.qty || 1); }).join(', '),
      cantidad: String((pedido.items || []).reduce(function(s, it) { return s + (it.qty || 1); }, 0)),
      ciudad: cl.ciudad || '',
      direccion: cl.direccion || '',
      fecha: pedido.creado ? new Date(pedido.creado).toLocaleDateString('es-CO') : '',
      guia: pedido.guia || ''
    });

    // Si no hay tel\u00E9fono, no se puede notificar
    if (!telNorm) {
      toast('\u26A0\uFE0F El cliente no tiene tel\u00E9fono para WhatsApp', 'warn');
      logHistorial({
        cliente: cl.nombre || 'Cliente', tel: '',
        pedidoId: pedido._key, estado: nuevoEstado,
        enviado: false, fecha: new Date().toISOString()
      });
      return false;
    }

    return new Promise(function(resolve) {
      // Quitar modal existente si lo hay
      var existing = document.getElementById('wa-notif-modal');
      if (existing) existing.remove();

      var modal = document.createElement('div');
      modal.id = 'wa-notif-modal';
      modal.className = 'modal-overlay';
      modal.onclick = function(e) { if (e.target === modal) { modal.remove(); resolve(false); } };

      modal.innerHTML =
        '<div class="modal" style="max-width:520px">' +
          '<div class="modal-header">' +
            '<h3>\u{1F4F1} Notificar por WhatsApp</h3>' +
            '<button class="btn btn-ghost" onclick="document.getElementById(\'wa-notif-modal\').remove()">\u00D7</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="wa-notif-info">' +
              '<div><strong>Cliente:</strong> ' + escHtml(cl.nombre || 'Cliente') + '</div>' +
              '<div><strong>Tel\u00E9fono:</strong> ' + escHtml(tel) + '</div>' +
              '<div><strong>Evento:</strong> ' + ESTADO_LABELS[nuevoEstado] + '</div>' +
              '<div><strong>Pedido:</strong> #' + pedido._key.slice(-6).toUpperCase() + '</div>' +
            '</div>' +
            '<label class="text-sm text-muted mt-12" style="display:block;margin-bottom:6px">Mensaje pre-cargado (puedes editarlo):</label>' +
            '<textarea id="wa-notif-msg" rows="5" style="width:100%;background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7);padding:10px;border-radius:6px;font-family:inherit;font-size:0.9rem;resize:vertical">' + escHtml(mensaje) + '</textarea>' +
            '<p class="text-xs text-muted mt-4">Se abrir\u00E1 WhatsApp con este mensaje. Solo tienes que hacer clic en "Enviar" dentro de WhatsApp.</p>' +
          '</div>' +
          '<div class="modal-footer" style="display:flex;gap:8px;justify-content:space-between">' +
            '<button class="btn btn-outline" onclick="document.getElementById(\'wa-notif-modal\').remove()">\u2298 Saltar</button>' +
            '<a id="wa-notif-send" href="' + _buildWaLink(telNorm, mensaje) + '" target="_blank" class="btn btn-gold" style="text-decoration:none">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:6px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>' +
              'Enviar por WhatsApp' +
            '</a>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);

      // Actualizar link cuando se edita el mensaje
      var textarea = modal.querySelector('#wa-notif-msg');
      var link = modal.querySelector('#wa-notif-send');
      textarea.addEventListener('input', function() {
        link.href = _buildWaLink(telNorm, textarea.value);
      });

      // Cuando se hace clic en Enviar, registrar como enviado
      link.addEventListener('click', function() {
        logHistorial({
          cliente: cl.nombre || 'Cliente',
          tel: tel, pedidoId: pedido._key,
          estado: nuevoEstado, mensaje: textarea.value,
          enviado: true, fecha: new Date().toISOString()
        });
        // Marcar pedido como notificado
        if (typeof firebase !== 'undefined' && firebase.database) {
          try {
            firebase.database().ref('arcano/db/pedidos/' + pedido._key).update({
              notificadoWhatsapp: true,
              notificadoEn: new Date().toISOString(),
              notificadoEstado: nuevoEstado
            });
          } catch (e) {}
        }
        setTimeout(function() { modal.remove(); resolve(true); }, 200);
      });

      // Si cierra sin enviar
      var skipBtn = modal.querySelector('.btn-outline');
      skipBtn.addEventListener('click', function() {
        logHistorial({
          cliente: cl.nombre || 'Cliente',
          tel: tel, pedidoId: pedido._key,
          estado: nuevoEstado, enviado: false,
          fecha: new Date().toISOString()
        });
        resolve(false);
      });
    });
  }

  // === Funci\u00F3n para bot\u00F3n WA en lista de pedidos ===

  async function notificarDesdePedido(pedidoKey, estado) {
    var pedidos = (typeof ArcanoDB !== 'undefined' && ArcanoDB.getPedidos) ? ArcanoDB.getPedidos() : [];
    var pedido = null;
    for (var i = 0; i < pedidos.length; i++) {
      if (pedidos[i]._key === pedidoKey) { pedido = pedidos[i]; break; }
    }
    if (!pedido) { alert('Pedido no encontrado'); return; }
    await showNotificacionModal(pedido, estado);
  }

  // === Helpers ===

  function _styles() {
    return '<style>' +
      '.wa-panel{padding:20px;max-width:1100px;margin:0 auto}' +
      '.wa-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border,#3a2a1e);margin-bottom:20px;flex-wrap:wrap}' +
      '.wa-tab{background:none;border:none;color:var(--text-muted,#8a7a6e);padding:10px 16px;cursor:pointer;border-bottom:2px solid transparent;font-size:0.9rem;font-weight:500;font-family:inherit;transition:all 0.2s}' +
      '.wa-tab:hover{color:var(--text,#e8d5b7)}' +
      '.wa-tab.active{color:var(--gold,#d4af37);border-bottom-color:var(--gold,#d4af37)}' +
      '.wa-section{display:flex;flex-direction:column;gap:16px}' +
      '.wa-card{background:var(--card-bg,#2a1a14);border:1px solid var(--border,#3a2a1e);border-radius:12px;padding:20px}' +
      '.wa-card h4{margin:0 0 12px;color:var(--gold,#d4af37);font-size:1rem}' +
      '.wa-info-box{background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:8px;padding:14px 16px}' +
      '.wa-info-box h4{margin:0 0 8px;color:var(--gold,#d4af37);font-size:0.9rem}' +
      '.wa-info-box p{margin:0 0 10px;font-size:0.8rem;color:var(--text-muted,#8a7a6e)}' +
      '.wa-vars-grid{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center}' +
      '.wa-vars-grid code{background:var(--bg,#1b0b07);color:var(--gold,#d4af37);padding:2px 8px;border-radius:4px;font-size:0.8rem;font-weight:600;white-space:nowrap}' +
      '.wa-vars-grid span{font-size:0.78rem;color:var(--text-muted,#8a7a6e)}' +
      '.wa-template-card{background:var(--card-bg,#2a1a14);border:1px solid var(--border,#3a2a1e);border-radius:10px;padding:16px;transition:border-color 0.2s}' +
      '.wa-template-card.inactive{opacity:0.55}' +
      '.wa-template-card:hover{border-color:var(--gold,#d4af37)}' +
      '.wa-template-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}' +
      '.wa-template-header h4{margin:0;color:var(--text,#e8d5b7);font-size:0.95rem}' +
      '.wa-template-desc{margin:4px 0 0;font-size:0.75rem;color:var(--text-muted,#8a7a6e)}' +
      '.wa-template-card textarea{width:100%;background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7);padding:10px;border-radius:6px;font-family:inherit;font-size:0.88rem;resize:vertical}' +
      '.wa-template-card textarea:focus{outline:none;border-color:var(--gold,#d4af37)}' +
      '.wa-template-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
      '.wa-btn{background:var(--gold,#d4af37);color:#1b0b07;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.8rem;font-family:inherit;transition:all 0.2s;text-decoration:none;display:inline-flex;align-items:center;gap:4px}' +
      '.wa-btn:hover{background:#e6c14a}' +
      '.wa-btn-sec{background:transparent;border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7)}' +
      '.wa-btn-sec:hover{border-color:var(--gold,#d4af37);color:var(--gold,#d4af37);background:transparent}' +
      '.wa-btn-outline{background:transparent;border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7)}' +
      '.wa-btn-outline:hover{border-color:var(--gold,#d4af37)}' +
      '.wa-switch{position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0}' +
      '.wa-switch input{opacity:0;width:0;height:0}' +
      '.wa-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#3a2a1e;transition:0.2s;border-radius:24px}' +
      '.wa-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#e8d5b7;transition:0.2s;border-radius:50%}' +
      '.wa-switch input:checked + .wa-slider{background:#4ade80}' +
      '.wa-switch input:checked + .wa-slider:before{transform:translateX(18px);background:#1b0b07}' +
      '.wa-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}' +
      '.wa-stat-card{background:var(--card-bg,#2a1a14);border:1px solid var(--border,#3a2a1e);border-radius:10px;padding:16px;text-align:center}' +
      '.wa-stat-val{font-size:28px;font-weight:800;line-height:1}' +
      '.wa-stat-val.gold{color:var(--gold,#d4af37)}' +
      '.wa-stat-val.green{color:#4ade80}' +
      '.wa-stat-val.blue{color:#60a5fa}' +
      '.wa-stat-val.muted{color:var(--text-muted,#8a7a6e)}' +
      '.wa-stat-lbl{font-size:0.7rem;color:var(--text-muted,#8a7a6e);text-transform:uppercase;letter-spacing:1px;margin-top:6px}' +
      '.wa-chart-wrap{height:240px;position:relative;margin-top:8px}' +
      '.wa-notif-info{background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);border-radius:8px;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem}' +
      '.wa-error{padding:20px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:8px;color:#f87171}' +
      '.wa-panel .table{width:100%;border-collapse:collapse;font-size:0.85rem}' +
      '.wa-panel .table th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border,#3a2a1e);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted,#8a7a6e)}' +
      '.wa-panel .table td{padding:8px 10px;border-bottom:1px solid var(--border,#3a2a1e)}' +
      '.wa-panel .badge{padding:3px 8px;border-radius:4px;font-size:0.7rem;font-weight:600}' +
      '@media(max-width:600px){.wa-tabs{overflow-x:auto;flex-wrap:nowrap;white-space:nowrap}.wa-stats-grid{grid-template-columns:repeat(2,1fr)}.wa-notif-info{grid-template-columns:1fr}}' +
    '</style>';
  }

  function _statCard(label, value, color) {
    return '<div class="wa-stat-card"><div class="wa-stat-val ' + color + '">' + value + '</div><div class="wa-stat-lbl">' + label + '</div></div>';
  }

  function applyVariables(msg, data) {
    // El total ya viene formateado como string. Solo reemplazamos la variable.
    return (msg || '')
      .replace(/\{nombre\}/g, data.nombre || 'Cliente')
      .replace(/\{id\}/g, data.id || '')
      .replace(/\{total\}/g, data.total || '0')
      .replace(/\{estado\}/g, data.estado || '')
      .replace(/\{items\}/g, data.items || '')
      .replace(/\{cantidad\}/g, data.cantidad || '0')
      .replace(/\{ciudad\}/g, data.ciudad || '')
      .replace(/\{direccion\}/g, data.direccion || '')
      .replace(/\{fecha\}/g, data.fecha || '')
      .replace(/\{guia\}/g, data.guia || '');
  }

  function _buildWaLink(telNorm, mensaje) {
    // IMPORTANTE: usar api.whatsapp.com directamente, NO wa.me
    // wa.me rompe los emojis en el redirect 302 (los convierte a U+FFFD �)
    // api.whatsapp.com preserva los emojis correctamente
    try {
      var params = new URLSearchParams();
      params.set('text', mensaje);
      params.set('phone', telNorm);
      params.set('type', 'phone_number');
      return 'https://api.whatsapp.com/send/?' + params.toString();
    } catch (e) {
      return 'https://api.whatsapp.com/send/?phone=' + telNorm + '&text=' + encodeURIComponent(mensaje) + '&type=phone_number';
    }
  }

  function _normalizeTel(tel) {
    if (!tel) return '';
    var clean = String(tel).replace(/\D/g, '');
    if (!clean) return '';
    if (clean.length === 10) return '57' + clean;
    if (clean.startsWith('57')) return clean;
    if (clean.length >= 11) return clean;
    if (clean.length >= 7) return '57' + clean;
    return '';
  }

  async function loadConfig() {
    try {
      var r = await fetch(FB_URL + '/tiendaConfig.json');
      if (!r.ok) return { plantillas: {} };
      var data = await r.json();
      return {
        plantillas: (data && data.mensajesWhatsApp && data.mensajesWhatsApp.plantillas) || {},
        mensajesWhatsApp: (data && data.mensajesWhatsApp) || {}
      };
    } catch (e) { return { plantillas: {} }; }
  }

  async function saveConfig(cfg) {
    // Leer config actual
    var r = await fetch(FB_URL + '/tiendaConfig.json');
    var current = r.ok ? await r.json() : {};
    current = current || {};
    current.mensajesWhatsApp = current.mensajesWhatsApp || {};
    current.mensajesWhatsApp.plantillas = cfg.plantillas;
    if (cfg.mensajesWhatsApp && cfg.mensajesWhatsApp.mensajeManual !== undefined) {
      current.mensajesWhatsApp.mensajeManual = cfg.mensajesWhatsApp.mensajeManual;
    }
    await fetch(FB_URL + '/tiendaConfig.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current)
    });
  }

  async function loadHistorial() {
    try {
      var r = await fetch(FB_URL + '/whatsappHistorial.json?orderBy="fecha"&limitToLast=200');
      if (!r.ok) return [];
      var data = await r.json();
      if (!data) return [];
      var arr = Object.keys(data).map(function(k) { var h = data[k]; h._key = k; return h; });
      arr.sort(function(a, b) { return (a.fecha || '').localeCompare(b.fecha || ''); });
      return arr;
    } catch (e) { return []; }
  }

  async function logHistorial(entry) {
    try {
      var ref = firebase.database().ref('arcano/db/whatsappHistorial').push();
      ref.set(entry);
    } catch (e) {
      // Fallback: fetch directo
      try {
        await fetch(FB_URL + '/whatsappHistorial.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      } catch (e2) {}
    }
  }

  function reenviar(idx) {
    var h = _lastHistorial[idx];
    if (!h || !h.tel) return;
    var telNorm = _normalizeTel(h.tel);
    var msg = h.mensaje || 'Hola ' + (h.cliente || 'Cliente') + '! Te escribimos desde Arcano Especias.';
    var waLink = _buildWaLink(telNorm, msg);
    window.open(waLink, '_blank');
    toast('Mensaje abierto en WhatsApp');
  }

  function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
    else if (window.App && App.toast) App.toast(msg);
    else console.log('[WA]', msg);
  }

  var _lastHistorial = [];

  return {
    renderPanel: renderPanel,
    showTab: showTab,
    toggleActivo: toggleActivo,
    savePlantilla: savePlantilla,
    resetPlantilla: resetPlantilla,
    previewMensaje: previewMensaje,
    selectAllClientes: selectAllClientes,
    updateSeleccionados: updateSeleccionados,
    enviarManual: enviarManual,
    notificarDesdePedido: notificarDesdePedido,
    showNotificacionModal: showNotificacionModal,
    reenviar: reenviar
  };
})();
