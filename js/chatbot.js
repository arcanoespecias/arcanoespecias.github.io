/* ===================== CHATBOT ARCANO — WIDGET TIENDA =====================
 * ETAPA 4: No accede a Firebase directo. Config pública vía /api/chat?action=config.
 * Los logs de conversación los guarda /api/chat en el servidor (no duplicar en el browser).
 * Catálogo de blends se sigue leyendo de Firebase (es público).
 */

(function() {
  'use strict';

  var SESSION_KEY = 'arcano_chat_session';
  var SESSION_ID_KEY = 'arcano_chat_sid';
  var CONFIG_CACHE_TTL = 5 * 60 * 1000;
  var FB_URL = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';
  var _config = null;
  var _configTs = 0;
  var _catalogo = null;
  var _isOpen = false;
  var _sessionId = null;
  var _messages = [];
  var _isTyping = false;

  var $toggle, $window, $messages, $input, $send, $quickReplies;

  function init() {
    if (window.location.pathname.startsWith('/admin')) return;
    checkAndRender();
    setInterval(checkAndRender, 2 * 60 * 1000);
  }

  async function checkAndRender() {
    var config = await loadConfig();
    if (!config || !config.activo) {
      if ($toggle) $toggle.style.display = 'none';
      if ($window) $window.classList.remove('open');
      _isOpen = false;
      return;
    }
    if (!$toggle) renderWidget();
    $toggle.style.display = 'flex';
  }

  async function loadConfig() {
    if (_config && (Date.now() - _configTs) < CONFIG_CACHE_TTL) return _config;
    try {
      // ETAPA 4: pedir config al servidor (no leer Firebase directo)
      var r = await fetch('/api/chat?action=config');
      if (!r.ok) return null;
      var data = await r.json();
      _config = data || { activo: false };
      _configTs = Date.now();
      return _config;
    } catch (e) {
      console.warn('[chatbot] config load error:', e.message);
      return null;
    }
  }

  function renderWidget() {
    if (!document.getElementById('arcano-chatbot-css')) {
      var link = document.createElement('link');
      link.id = 'arcano-chatbot-css';
      link.rel = 'stylesheet';
      link.href = '/css/chatbot.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    $toggle = document.createElement('button');
    $toggle.className = 'arcano-chat-toggle';
    $toggle.setAttribute('aria-label', 'Abrir chat de Arcano');
    $toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.5 3.42 1.36 4.83L2 22l5.17-1.36C8.58 21.5 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.2-.47-4.52-1.27l-.32-.19-3.07.81.82-3-.21-.32C3.46 15.15 3 13.66 3 12c0-4.96 4.04-9 9-9s9 4.04 9 9-4.04 9-9 9z"/></svg>';
    $toggle.addEventListener('click', toggleChat);
    document.body.appendChild($toggle);

    $window = document.createElement('div');
    $window.className = 'arcano-chat-window';
    $window.innerHTML =
      '<div class="arcano-chat-header">' +
        '<div class="arcano-chat-avatar">🔮</div>' +
        '<div class="arcano-chat-header-info">' +
          '<h3 class="arcano-chat-title">Guardián de Arcano</h3>' +
          '<p class="arcano-chat-status online">En línea</p>' +
        '</div>' +
        '<button class="arcano-chat-close" aria-label="Cerrar">&times;</button>' +
      '</div>' +
      '<div class="arcano-chat-messages" id="arcano-chat-msgs"></div>' +
      '<div class="arcano-quick-replies" id="arcano-chat-quick"></div>' +
      '<div class="arcano-chat-input-wrap">' +
        '<input type="text" class="arcano-chat-input" placeholder="Escribí tu consulta..." id="arcano-chat-input">' +
        '<button class="arcano-chat-send" aria-label="Enviar">' +
          '<svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>' +
        '</button>' +
      '</div>';
    document.body.appendChild($window);

    $messages = $window.querySelector('#arcano-chat-msgs');
    $input = $window.querySelector('#arcano-chat-input');
    $send = $window.querySelector('.arcano-chat-send');
    $quickReplies = $window.querySelector('#arcano-chat-quick');

    $window.querySelector('.arcano-chat-close').addEventListener('click', toggleChat);
    $send.addEventListener('click', sendMessage);
    $input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    loadSession();
    if (_messages.length === 0) {
      var saludo = _config.saludo || 'Bienvenido, viajero. Soy el Guardián de Arcano. Contame qué vas a cocinar y te guiaré hacia el blend perfecto.';
      addMessage('bot', saludo);
      showQuickReplies(getDefaultQuickReplies());
    } else {
      _messages.forEach(function(m) {
        renderMessage(m.role, m.content, m.productos);
      });
    }
  }

  function toggleChat() {
    _isOpen = !_isOpen;
    $toggle.classList.toggle('open', _isOpen);
    $window.classList.toggle('open', _isOpen);
    if (_isOpen) {
      var badge = $toggle.querySelector('.arcano-chat-toggle-badge');
      if (badge) badge.classList.remove('show');
      setTimeout(function() { $messages.scrollTop = $messages.scrollHeight; }, 100);
    }
  }

  function getDefaultQuickReplies() {
    if (_config.quickReplies && _config.quickReplies.length) return _config.quickReplies;
    return [
      { label: '🌶 Para carnes', text: 'Tengo carne y quiero algo para parrilla' },
      { label: '🐟 Para pescado', text: 'Voy a cocinar pescado' },
      { label: '🌿 Infusiones', text: 'Quiero hacer infusiones' },
      { label: '🍸 Coctelería', text: 'Busco algo para cócteles' },
      { label: '❓ Recomendame', text: 'Recomendame un blend' }
    ];
  }

  function showQuickReplies(replies) {
    $quickReplies.innerHTML = '';
    replies.forEach(function(r) {
      var btn = document.createElement('button');
      btn.className = 'arcano-quick-reply';
      btn.textContent = r.label;
      btn.addEventListener('click', function() {
        $input.value = r.text;
        sendMessage();
      });
      $quickReplies.appendChild(btn);
    });
  }

  function addMessage(role, content, productos) {
    _messages.push({ role: role, content: content, productos: productos, ts: Date.now() });
    if (_messages.length > 50) _messages = _messages.slice(-30);
    saveSession();
    renderMessage(role, content, productos);
    $messages.scrollTop = $messages.scrollHeight;
  }

  function renderMessage(role, content, productos) {
    var div = document.createElement('div');
    div.className = 'arcano-msg ' + (role === 'bot' ? 'bot' : 'user');
    div.textContent = content;
    $messages.appendChild(div);

    if (role === 'bot' && productos && productos.length) {
      productos.forEach(function(pid) {
        var p = findProductById(pid);
        if (!p) return;
        var card = document.createElement('div');
        card.className = 'arcano-product-card-chat';
        card.innerHTML =
          '<img src="' + (p.imagen || '/img/placeholder.webp') + '" alt="' + p.nombre + '">' +
          '<div class="arcano-product-card-chat-info">' +
            '<p class="arcano-product-card-chat-name">' + p.nombre + '</p>' +
            '<p class="arcano-product-card-chat-price">$' + (p.precioChico || p.precioGrande).toLocaleString('es-CO') + '</p>' +
          '</div>' +
          '<button class="arcano-product-card-chat-btn">+ Carrito</button>';
        card.querySelector('button').addEventListener('click', function() {
          addToCart(p);
          this.textContent = '✓ Agregado';
          this.classList.add('added');
        });
        $messages.appendChild(card);
      });
    }
  }

  function findProductById(id) {
    if (!_catalogo) return null;
    return _catalogo.find(function(p) { return p.id === id; });
  }

  function addToCart(product) {
    if (typeof window.addToCart === 'function') {
      window.addToCart(product.id, 'chico');
    } else if (typeof window.ArcanoCart === 'object' && window.ArcanoCart.add) {
      window.ArcanoCart.add(product.id, 1, 'chico');
    } else {
      document.dispatchEvent(new CustomEvent('arcano:addToCart', { detail: { productId: product.id, talla: 'chico' } }));
    }
  }

  async function sendMessage() {
    var text = $input.value.trim();
    if (!text || _isTyping) return;

    addMessage('user', text);
    $input.value = '';
    $quickReplies.innerHTML = '';

    _isTyping = true;
    var typing = document.createElement('div');
    typing.className = 'arcano-msg bot arcano-typing';
    typing.id = 'arcano-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    $messages.appendChild(typing);
    $messages.scrollTop = $messages.scrollHeight;

    try {
      if (!_catalogo) _catalogo = await loadCatalogo();

      // ETAPA 4: usar /api/chat como proxy al LLM (no llamar al LLM directo desde el browser).
      // El servidor lee la API key con Service Account y la usa.
      var history = _messages.slice(-10).map(function(m) {
        return { role: m.role === 'bot' ? 'assistant' : 'user', content: m.content };
      });
      // Quitar el último user message (lo mandamos como nuevo messages)
      history.pop();

      var resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.length > 0
            ? history.concat([{ role: 'user', content: text }])
            : [{ role: 'user', content: text }],
          catalogo: _catalogo,
          sessionId: _sessionId
        })
      });

      var data = await resp.json();
      removeTyping();
      _isTyping = false;

      if (!resp.ok) {
        console.error('[chatbot] /api/chat error:', data);
        var errMsg = 'Disculpá, tuve un problema técnico. ';
        if (resp.status === 429) errMsg += 'Límite de consultas alcanzado. Intentá de nuevo en unos minutos. 🌿';
        else if (resp.status === 401) errMsg += 'API key inválida. Avisale al administrador. 🌿';
        else errMsg += 'Intentá de nuevo en un momento. 🌿';
        addMessage('bot', errMsg);
        return;
      }

      var reply = data?.reply || data?.text || data?.choices?.[0]?.message?.content || 'Disculpá, no pude procesar tu consulta. 🌿';
      var mentionedIds = data?.productosMencionados || extractBlendIds(reply, _catalogo);
      var cleanReply = reply.replace(/\[ID:\d+\]/g, '').trim();
      addMessage('bot', cleanReply, mentionedIds);

      // ETAPA 4: el log de conversación lo hace el servidor (chat.js logConversation)
      // No duplicar en el browser — borrado logConversation del front-end.

      if (_messages.length <= 2) {
        showQuickReplies([
          { label: 'Ver más blends', text: 'Mostrame más opciones' },
          { label: 'Por categoría', text: '¿Qué categorías de blends tienen?' },
          { label: 'Cómo usarlo', text: '¿Cómo uso los blends?' }
        ]);
      }
    } catch (e) {
      console.error('[chatbot] send error:', e.message);
      removeTyping();
      _isTyping = false;
      addMessage('bot', ' 🔌 Hubo un problema de conexión. Intentá de nuevo. 🌿');
    }
  }

  function removeTyping() {
    var t = document.getElementById('arcano-typing');
    if (t) t.remove();
  }

  async function loadCatalogo() {
    if (typeof getProducts === 'function') return getProducts();
    if (window._sDb && window._sDb.blends) {
      var productos = [];
      var bk = Object.keys(window._sDb.blends || {});
      for (var i = 0; i < bk.length; i++) {
        var b = window._sDb.blends[bk[i]];
        if (!b || !b.enTienda) continue;
        productos.push({
          id: b.id, nombre: b.nombre, categoria: b.categoria || 'Comidas',
          uso: b.uso || '', descripcion: b.descripcion || '',
          precioChico: Number(b.precioTiendaChico) || Number(b.precioChico) || 0,
          precioGrande: Number(b.precioTiendaGrande) || Number(b.precioGrande) || 0,
          imagen: b.imagen || ''
        });
      }
      var ek = Object.keys(window._sDb.especias || {});
      for (var j = 0; j < ek.length; j++) {
        var e = window._sDb.especias[ek[j]];
        if (!e || !e.enTienda) continue;
        productos.push({
          id: e.id, nombre: e.nombre, categoria: e.categoria || 'Comidas',
          uso: e.uso || '', descripcion: e.descripcion || '',
          precioChico: Number(e.precioTiendaChico) || Number(e.precioChico) || 0,
          precioGrande: Number(e.precioTiendaGrande) || Number(e.precioGrande) || 0,
          imagen: e.imagen || ''
        });
      }
      return productos;
    }
    try {
      var r = await fetch(FB_URL + '/blends.json');
      var blends = await r.json();
      var out = [];
      if (Array.isArray(blends)) {
        blends.forEach(function(b) {
          if (!b || !b.enTienda) return;
          out.push({
            id: b.id, nombre: b.nombre, categoria: b.categoria || 'Comidas',
            uso: b.uso || '', descripcion: b.descripcion || '',
            precioChico: Number(b.precioTiendaChico) || Number(b.precioChico) || 0,
            precioGrande: Number(b.precioTiendaGrande) || Number(b.precioGrande) || 0,
            imagen: b.imagen || ''
          });
        });
      }
      return out;
    } catch (e) { return []; }
  }

  function loadSession() {
    try {
      _sessionId = localStorage.getItem(SESSION_ID_KEY);
      if (!_sessionId) {
        _sessionId = 's' + Date.now() + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(SESSION_ID_KEY, _sessionId);
      }
      var saved = localStorage.getItem(SESSION_KEY);
      if (saved) _messages = JSON.parse(saved) || [];
    } catch (e) { _messages = []; }
  }

  function saveSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(_messages.slice(-20)));
    } catch (e) {}
  }

  // ETAPA 4 — buildSystemPrompt eliminado del front-end.
  // El system prompt ahora lo construye el servidor en /api/chat.

  function extractBlendIds(text, catalogo) {
    var ids = new Set();
    var matches = text.match(/\[ID:(\d+)\]/g) || [];
    matches.forEach(function(m) {
      var id = parseInt(m.match(/\d+/)[0]);
      if (catalogo?.find(function(b) { return b.id === id; })) ids.add(id);
    });
    return Array.from(ids);
  }

  // ETAPA 4 — logConversation eliminado del front-end.
  // El servidor /api/chat ya guarda conversaciones y métricas con Service Account.

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
