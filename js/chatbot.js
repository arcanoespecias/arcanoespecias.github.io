/* ===================== CHATBOT ARCANO — WIDGET TIENDA =====================
 * Carga el chat, dialoga con /api/chat, recomienda blends del catálogo.
 * Lee configuración desde Firebase (chatbot/activo, chatbot/config).
 */

(function() {
  'use strict';

  var SESSION_KEY = 'arcano_chat_session';
  var SESSION_ID_KEY = 'arcano_chat_sid';
  var CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 min
  var _config = null;
  var _configTs = 0;
  var _catalogo = null;
  var _isOpen = false;
  var _sessionId = null;
  var _messages = [];
  var _isTyping = false;
  var _lastConfigCheck = 0;

  // Elementos DOM
  var $toggle, $window, $messages, $input, $send, $quickReplies;

  function init() {
    // No inicializar si estamos en admin
    if (window.location.pathname.startsWith('/admin')) return;

    // Cargar config desde Firebase y crear widget si está activo
    checkAndRender();
    // Recheck cada 2 min por si el admin lo activa/desactiva
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
      var r = await fetch('https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/chatbot.json');
      if (!r.ok) return null;
      var data = await r.json();
      _config = data || { activo: false, config: {} };
      _configTs = Date.now();
      return _config;
    } catch (e) {
      console.warn('[chatbot] config load error:', e);
      return null;
    }
  }

  function renderWidget() {
    // CSS
    if (!document.getElementById('arcano-chatbot-css')) {
      var link = document.createElement('link');
      link.id = 'arcano-chatbot-css';
      link.rel = 'stylesheet';
      link.href = '/css/chatbot.css?v=' + Date.now();
      document.head.appendChild(link);
    }

    // Toggle button
    $toggle = document.createElement('button');
    $toggle.className = 'arcano-chat-toggle';
    $toggle.setAttribute('aria-label', 'Abrir chat de Arcano');
    $toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.5 3.42 1.36 4.83L2 22l5.17-1.36C8.58 21.5 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.2-.47-4.52-1.27l-.32-.19-3.07.81.82-3-.21-.32C3.46 15.15 3 13.66 3 12c0-4.96 4.04-9 9-9s9 4.04 9 9-4.04 9-9 9z"/></svg>';
    $toggle.addEventListener('click', toggleChat);
    document.body.appendChild($toggle);

    // Chat window
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

    // Restaurar sesión previa
    loadSession();
    if (_messages.length === 0) {
      // Saludo inicial del bot
      var saludo = (_config.config && _config.config.saludo) || 'Bienvenido, viajero. Soy el Guardián de Arcano. Contame qué vas a cocinar y te guiaré hacia el blend perfecto.';
      addMessage('bot', saludo);
      showQuickReplies(getDefaultQuickReplies());
    } else {
      // Re-renderizar mensajes
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
      // Marcar como leído
      var badge = $toggle.querySelector('.arcano-chat-toggle-badge');
      if (badge) badge.classList.remove('show');
      setTimeout(function() { $messages.scrollTop = $messages.scrollHeight; }, 100);
    }
  }

  function getDefaultQuickReplies() {
    var cfg = _config.config || {};
    if (cfg.quickReplies && cfg.quickReplies.length) return cfg.quickReplies;
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

    // Renderizar tarjetas de producto si mencionó IDs
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
    // Hook a la función de carrito existente
    if (typeof window.addToCart === 'function') {
      window.addToCart(product.id, 'chico');
    } else if (typeof window.ArcanoCart === 'object' && window.ArcanoCart.add) {
      window.ArcanoCart.add(product.id, 1, 'chico');
    } else {
      // Disparar evento para que la tienda lo capture
      document.dispatchEvent(new CustomEvent('arcano:addToCart', { detail: { productId: product.id, talla: 'chico' } }));
    }
  }

  async function sendMessage() {
    var text = $input.value.trim();
    if (!text || _isTyping) return;

    addMessage('user', text);
    $input.value = '';
    $quickReplies.innerHTML = '';

    // Typing indicator
    _isTyping = true;
    var typing = document.createElement('div');
    typing.className = 'arcano-msg bot arcano-typing';
    typing.id = 'arcano-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    $messages.appendChild(typing);
    $messages.scrollTop = $messages.scrollHeight;

    try {
      // Cargar catálogo si no está cargado
      if (!_catalogo) _catalogo = await loadCatalogo();

      // Preparar mensajes para Gemini (últimos 10)
      var history = _messages.slice(-10).map(function(m) {
        return { role: m.role, content: m.content };
      });
      // Quitar el último (que ya es el que mandamos y va de nuevo)
      history.pop();

      var config = (_config && _config.config) || {};

      var resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          catalogo: _catalogo,
          config: config,
          sessionId: _sessionId
        })
      });

      var data = await resp.json();
      var typingEl = document.getElementById('arcano-typing');
      if (typingEl) typingEl.remove();
      _isTyping = false;

      if (data.error) {
        addMessage('bot', 'Disculpá, tuve un problema técnico. Intentá de nuevo en un momento. 🌿');
      } else {
        // Limpiar [ID:N] del texto visible (lo usamos internamente)
        var cleanReply = data.reply.replace(/\[ID:\d+\]/g, '').trim();
        addMessage('bot', cleanReply, data.productosMencionados || []);

        // Mostrar quick replies genéricos después de la 1era respuesta
        if (_messages.length <= 2) {
          showQuickReplies([
            { label: 'Ver más blends', text: 'Mostrame más opciones' },
            { label: 'Por categoría', text: '¿Qué categorías de blends tienen?' },
            { label: 'Cómo usarlo', text: '¿Cómo uso los blends?' }
          ]);
        }
      }
    } catch (e) {
      console.error('[chatbot] send error:', e);
      var typingEl = document.getElementById('arcano-typing');
      if (typingEl) typingEl.remove();
      _isTyping = false;
      addMessage('bot', 'Disculpá, hubo un problema de conexión. 🌿');
    }
  }

  async function loadCatalogo() {
    // Reutilizar catálogo ya cargado en la tienda
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
    // Fallback: leer de Firebase
    try {
      var r = await fetch('https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/blends.json');
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

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
