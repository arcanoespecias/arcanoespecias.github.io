/* ===================== CHATBOT ARCANO — PANEL ADMIN =====================
 * Permite activar/desactivar, configurar, ver estadísticas y conversaciones.
 */

var ChatbotPanel = (function() {

  var FB_URL = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/chatbot';
  var _config = null;
  var _stats = null;
  var _conversaciones = null;

  function render(container) {
    container.innerHTML =
      '<div class="chatbot-panel">' +
        '<style>.chatbot-panel{padding:20px;max-width:1100px;margin:0 auto}' +
        '.cb-section{background:var(--card-bg,#2a1a14);border:1px solid var(--border,#3a2a1e);border-radius:12px;padding:20px;margin-bottom:20px}' +
        '.cb-section h3{color:var(--gold,#d4af37);margin:0 0 12px;font-size:18px}' +
        '.cb-row{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px}' +
        '.cb-row label{color:var(--text-muted,#8a7a6e);font-size:13px;min-width:140px}' +
        '.cb-row input,.cb-row select,.cb-row textarea{flex:1;background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7);padding:8px 12px;border-radius:6px;font-family:inherit;font-size:14px}' +
        '.cb-toggle{position:relative;width:48px;height:24px;background:#3a2a1e;border-radius:12px;cursor:pointer;transition:background 0.2s}' +
        '.cb-toggle.on{background:#4ade80}' +
        '.cb-toggle::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;background:#e8d5b7;border-radius:50%;transition:left 0.2s}' +
        '.cb-toggle.on::after{left:26px;background:#1b0b07}' +
        '.cb-btn{background:var(--gold,#d4af37);color:#1b0b07;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px}' +
        '.cb-btn:hover{background:#e6c14a}' +
        '.cb-btn.sec{background:transparent;border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7)}' +
        '.cb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}' +
        '.cb-stat{background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);border-radius:8px;padding:14px;text-align:center}' +
        '.cb-stat-val{font-size:28px;color:var(--gold,#d4af37);font-weight:700}' +
        '.cb-stat-lbl{font-size:11px;color:var(--text-muted,#8a7a6e);text-transform:uppercase;letter-spacing:1px;margin-top:4px}' +
        '.cb-chart-wrap{background:var(--bg,#1b0b07);border-radius:8px;padding:12px;margin-top:8px;max-width:100%;height:240px;position:relative}' +
        '.cb-conv-list{max-height:400px;overflow-y:auto}' +
        '.cb-conv-item{background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer}' +
        '.cb-conv-item:hover{border-color:var(--gold,#d4af37)}' +
        '.cb-conv-head{display:flex;justify-content:space-between;align-items:center}' +
        '.cb-conv-id{color:var(--gold,#d4af37);font-size:13px;font-weight:600}' +
        '.cb-conv-date{color:var(--text-muted,#8a7a6e);font-size:11px}' +
        '.cb-conv-msgs{margin-top:8px;display:none;gap:6px;flex-direction:column}' +
        '.cb-conv-item.expanded .cb-conv-msgs{display:flex}' +
        '.cb-conv-msg{padding:6px 10px;border-radius:6px;font-size:13px;max-width:90%}' +
        '.cb-conv-msg.user{background:#3a2a1e;color:#e8d5b7;align-self:flex-end}' +
        '.cb-conv-msg.bot{background:#2a1a14;color:#d4af37;align-self:flex-start;border:1px solid var(--border,#3a2a1e)}' +
        '.cb-warn{background:#fef3c7;color:#92400e;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:12px}' +
        '.cb-warn.ok{background:#dcfce7;color:#166534}' +
        '@media(max-width:600px){.cb-row label{min-width:100px}}</style>' +
        '<h2 style="color:var(--gold,#d4af37);margin:0 0 20px">🔮 Chatbot IA — Guardián de Arcano</h2>' +
        '<div id="cb-status-section" class="cb-section"><div class="cb-row"><h3 style="margin:0">Estado del chatbot</h3></div>' +
          '<div class="cb-row"><label>Activo en tienda</label><div id="cb-toggle" class="cb-toggle" onclick="ChatbotPanel.toggle()"></div><span id="cb-status-text">Cargando...</span></div>' +
          '<div class="cb-row"><label>Estado de API</label><span id="cb-api-status">—</span></div>' +
          '<div class="cb-row" style="margin-top:12px"><button class="cb-btn" onclick="ChatbotPanel.testChat()">Probar chat</button></div>' +
        '</div>' +
        '<div id="cb-config-section" class="cb-section">' +
          '<h3>⚙️ Configuración</h3>' +
          '<div class="cb-row"><label>API Key de Gemini</label><input type="password" id="cb-apikey" placeholder="AIzaSy... (de aistudio.google.com/apikey)"><button class="cb-btn sec" onclick="ChatbotPanel.saveApiKey()">Guardar</button></div>' +
          '<div class="cb-row"><label>Modelo</label><select id="cb-modelo"><option value="gemini-2.0-flash">gemini-2.0-flash (rápido)</option><option value="gemini-2.5-flash">gemini-2.5-flash (avanzado)</option><option value="gemini-1.5-flash">gemini-1.5-flash (legacy)</option></select></div>' +
          '<div class="cb-row"><label>Creatividad (0-1)</label><input type="range" id="cb-temp" min="0" max="1" step="0.1" value="0.7"><span id="cb-temp-val">0.7</span></div>' +
          '<div class="cb-row"><label>Saludo inicial</label><textarea id="cb-saludo" rows="2"></textarea></div>' +
          '<div class="cb-row"><label>Personalidad</label><textarea id="cb-personalidad" rows="4"></textarea></div>' +
          '<div class="cb-row"><label>Quick replies (uno por línea, formato: etiqueta|mensaje)</label><textarea id="cb-quick" rows="5" placeholder="🌶 Para carnes|Tengo carne y quiero algo para parrilla"></textarea></div>' +
          '<div class="cb-row"><label>Palabras bloqueadas (separadas por coma)</label><input type="text" id="cb-blocked" placeholder="política, religión, etc"></div>' +
          '<div class="cb-row" style="margin-top:12px"><button class="cb-btn" onclick="ChatbotPanel.saveConfig()">Guardar configuración</button></div>' +
        '</div>' +
        '<div id="cb-stats-section" class="cb-section">' +
          '<h3>📊 Estadísticas</h3>' +
          '<div class="cb-stats">' +
            '<div class="cb-stat"><div class="cb-stat-val" id="cb-stat-msgs">0</div><div class="cb-stat-lbl">Mensajes totales</div></div>' +
            '<div class="cb-stat"><div class="cb-stat-val" id="cb-stat-conv">0</div><div class="cb-stat-lbl">Conversaciones</div></div>' +
            '<div class="cb-stat"><div class="cb-stat-val" id="cb-stat-today">0</div><div class="cb-stat-lbl">Mensajes hoy</div></div>' +
            '<div class="cb-stat"><div class="cb-stat-val" id="cb-stat-recom">0</div><div class="cb-stat-lbl">Productos recomendados</div></div>' +
          '</div>' +
          '<div class="cb-chart-wrap"><canvas id="cb-chart"></canvas></div>' +
        '</div>' +
        '<div id="cb-conv-section" class="cb-section">' +
          '<h3>💬 Conversaciones recientes</h3>' +
          '<div class="cb-conv-list" id="cb-conv-list"><p style="color:var(--text-muted,#8a7a6e)">Cargando...</p></div>' +
        '</div>' +
      '</div>';

    loadAll();
    document.getElementById('cb-temp').addEventListener('input', function(e) {
      document.getElementById('cb-temp-val').textContent = e.target.value;
    });
  }

  async function loadAll() {
    try {
      var r = await fetch(FB_URL + '.json');
      var data = await r.json();
      _config = data || { activo: false, config: {} };
      _stats = data?.estadisticas || {};
      _conversaciones = data?.conversaciones || {};

      renderStatus();
      renderConfig();
      renderStats();
      renderConversaciones();
    } catch (e) {
      console.error('[chatbot] load error:', e);
    }
  }

  function renderStatus() {
    var t = document.getElementById('cb-toggle');
    if (t) t.classList.toggle('on', !!_config.activo);
    var txt = document.getElementById('cb-status-text');
    if (txt) txt.textContent = _config.activo ? 'Activo' : 'Desactivado';
    var api = document.getElementById('cb-api-status');
    if (api) {
      var key = _config.config?.apiKey;
      if (key && key.startsWith('AIzaSy')) api.innerHTML = '<span style="color:#4ade80">✓ Key configurada</span>';
      else api.innerHTML = '<span style="color:#f87171">✗ Sin configurar</span>';
    }
  }

  function renderConfig() {
    var c = _config.config || {};
    setVal('cb-apikey', c.apiKey || '');
    setVal('cb-modelo', c.modelo || 'gemini-2.0-flash');
    setVal('cb-temp', c.temperature ?? 0.7);
    document.getElementById('cb-temp-val').textContent = c.temperature ?? 0.7;
    setVal('cb-saludo', c.saludo || 'Bienvenido, viajero. Soy el Guardián de Arcano. Contame qué vas a cocinar y te guiaré hacia el blend perfecto.');
    setVal('cb-personalidad', c.personalidad || 'Sos el "Guardián de Arcano", asesor culinario místico de Arcano Especias, tienda colombiana de especias y blends artesanales.\nTu misión: ayudar al viajero a encontrar el blend perfecto para su preparación.\nSos conocedor de cocinas del mundo: india, mexicana, asiática, mediterránea, criolla, árabe.\nUsá metáforas suaves de viaje, descubrimiento, senderos, destinos de sabor.');
    var qr = c.quickReplies || [];
    setVal('cb-quick', qr.map(function(r) { return r.label + '|' + r.text; }).join('\n'));
    setVal('cb-blocked', (c.palabrasBloqueadas || []).join(', '));
  }

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v;
  }

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  async function toggle() {
    _config.activo = !_config.activo;
    try {
      await fetch(FB_URL + '/activo.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_config.activo)
      });
      renderStatus();
      toast(_config.activo ? 'Chatbot activado 🔮' : 'Chatbot desactivado');
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    }
  }

  async function saveApiKey() {
    var key = getVal('cb-apikey').trim();
    if (!key) { alert('Ingresá la API key'); return; }
    if (!key.startsWith('AIzaSy')) {
      if (!confirm('La key no empieza con "AIzaSy". ¿Estás seguro que es una API key de Gemini válida?')) return;
    }
    try {
      await fetch(FB_URL + '/config/apiKey.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(key)
      });
      _config.config = _config.config || {};
      _config.config.apiKey = key;
      renderStatus();
      toast('API key guardada ✅');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async function saveConfig() {
    var qr = getVal('cb-quick').split('\n').filter(Boolean).map(function(line) {
      var parts = line.split('|');
      return { label: parts[0].trim(), text: (parts[1] || parts[0]).trim() };
    });
    var blocked = getVal('cb-blocked').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    var config = {
      apiKey: _config.config?.apiKey || '',
      modelo: getVal('cb-modelo'),
      temperature: parseFloat(getVal('cb-temp')),
      saludo: getVal('cb-saludo'),
      personalidad: getVal('cb-personalidad'),
      quickReplies: qr,
      palabrasBloqueadas: blocked
    };
    try {
      await fetch(FB_URL + '/config.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      _config.config = config;
      toast('Configuración guardada ✅');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  function renderStats() {
    var totalMsgs = 0, totalConv = 0, totalRecom = 0;
    var byDay = _stats.porDia || {};
    Object.keys(byDay).forEach(function(d) {
      totalMsgs += byDay[d].mensajes || 0;
      totalConv += byDay[d].conversaciones || 0;
    });
    Object.keys(_conversaciones).forEach(function(sid) {
      totalRecom += (_conversaciones[sid].productosRecomendados || []).length;
    });
    var hoy = new Date().toISOString().slice(0, 10);
    var todayMsgs = byDay[hoy]?.mensajes || 0;

    setStat('cb-stat-msgs', totalMsgs);
    setStat('cb-stat-conv', totalConv);
    setStat('cb-stat-today', todayMsgs);
    setStat('cb-stat-recom', totalRecom);

    renderChart(byDay);
  }

  function setStat(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderChart(byDay) {
    var canvas = document.getElementById('cb-chart');
    if (!canvas) return;
    var days = Object.keys(byDay).sort().slice(-30);
    var labels = days.map(function(d) { return d.slice(5); });
    var msgs = days.map(function(d) { return byDay[d].mensajes || 0; });

    if (window._chatbotChart) window._chatbotChart.destroy();
    window._chatbotChart = new Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Mensajes por día', data: msgs, borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.15)', tension: 0.3, fill: true }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { labels: { color: '#8a7a6e', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#8a7a6e', font: { size: 10 } }, grid: { color: 'rgba(212,175,55,0.1)' } },
          y: { beginAtZero: true, ticks: { color: '#8a7a6e', font: { size: 10 } }, grid: { color: 'rgba(212,175,55,0.1)' } }
        }
      }
    });
  }

  function renderConversaciones() {
    var list = document.getElementById('cb-conv-list');
    if (!list) return;
    var items = Object.keys(_conversaciones).map(function(sid) {
      var c = _conversaciones[sid];
      return { sid: sid, data: c };
    }).sort(function(a, b) {
      return (b.data.ultimoMensaje || b.data.inicio || 0) - (a.data.ultimoMensaje || a.data.inicio || 0);
    }).slice(0, 30);

    if (items.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted,#8a7a6e);text-align:center;padding:20px">Sin conversaciones aún</p>';
      return;
    }

    list.innerHTML = items.map(function(item) {
      var d = item.data;
      var fecha = new Date(d.ultimoMensaje || d.inicio || 0).toLocaleString('es-CO');
      var msgs = d.mensajes || [];
      var msgHtml = msgs.map(function(m) {
        return '<div class="cb-conv-msg ' + m.role + '">' + escapeHtml(m.content?.slice(0, 200) || '') + '</div>';
      }).join('');
      return '<div class="cb-conv-item" onclick="this.classList.toggle(\'expanded\')">' +
        '<div class="cb-conv-head"><span class="cb-conv-id">' + escapeHtml(item.sid.slice(0, 12)) + ' · ' + (d.cantMensajes || msgs.length) + ' msgs</span><span class="cb-conv-date">' + fecha + '</span></div>' +
        '<div class="cb-conv-msgs">' + msgHtml + '</div>' +
      '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function testChat() {
    var btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = 'Probando...'; }
    try {
      var r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hola, recomendame un blend para pollo' }],
          catalogo: [],
          config: _config.config,
          sessionId: 'test-' + Date.now()
        })
      });
      var data = await r.json();
      if (data.error) alert('Error: ' + data.error);
      else alert('Respuesta del bot:\n\n' + data.reply);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Probar chat'; }
    }
  }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
    else if (window.App?.toast) App.toast(msg);
    else console.log('[chatbot]', msg);
  }

  return {
    render: render,
    toggle: toggle,
    saveApiKey: saveApiKey,
    saveConfig: saveConfig,
    testChat: testChat,
    reload: loadAll
  };
})();
