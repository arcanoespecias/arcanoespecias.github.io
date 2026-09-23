/* ===================== GLOBAL UTILITIES ===================== */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function toast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = (type === 'err' ? 'err' : 'ok') + ' show';
  clearTimeout(toast._t);
  toast._t = setTimeout(function() { el.className = ''; }, 3000);
}
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

/* ===================== ARCANO V3 \u2014 CORE (Auth, Routing, Shell) ===================== */

const ARCANO_LOGO = 'data:image/jpeg;base64,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';

const App = {
  currentPage: 'dashboard',
  sidebarOpen: window.innerWidth > 768,

  async init() {
    this.showSplash();
    try {
      await ArcanoDB.initDB();
    } catch (e) {
      console.error('[Core] DB init failed:', e);
    }
    var user = ArcanoDB.getCurrentUser();
    if (user) {
      this.enterApp();
    } else {
      this.showLogin();
    }
  },

  showSplash() {
    document.getElementById('app-root').innerHTML =
      '<div class="splash">' +
        '<div class="splash-logo"><img src="' + ARCANO_LOGO + '" alt="Arcano" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>' +
        '<div class="splash-text">ARCANO</div>' +
        '<div class="splash-sub">Especias & Blends</div>' +
        '<div class="splash-loader"><div class="loader"></div></div>' +
      '</div>';
  },

  showLogin() {
    document.getElementById('app-root').innerHTML =
      '<div class="login-screen">' +
        '<div class="login-card">' +
          '<div class="login-logo"><img src="' + ARCANO_LOGO + '" alt="Arcano" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>' +
          '<h1 class="login-title">ARCANO</h1>' +
          '<p class="login-sub">Especias & Blends</p>' +
          '<div class="login-form">' +
            '<label>Ingresar PIN</label>' +
            '<input type="password" id="pin-input" maxlength="10" placeholder="PIN de acceso" onkeydown="if(event.key===\'Enter\')App.doLogin()">' +
            '<button class="btn btn-gold btn-block" onclick="App.doLogin()">Ingresar</button>' +
            '<p id="login-error" class="text-red text-sm mt-8" style="display:none"></p>' +
          '</div>' +
        '</div>' +
      '</div>';
    setTimeout(function() {
      var inp = document.getElementById('pin-input');
      if (inp) inp.focus();
    }, 100);
  },

  doLogin() {
    var pin = document.getElementById('pin-input').value.trim();
    if (!pin) { this.showLoginError('Ingresar un PIN'); return; }
    var user = ArcanoDB.authenticateUser(pin);
    if (user) { this.enterApp(); } else { this.showLoginError('PIN incorrecto'); }
  },

  showLoginError(msg) {
    var el = document.getElementById('login-error');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('pin-input').classList.add('input-error');
    setTimeout(function() { document.getElementById('pin-input').classList.remove('input-error'); }, 1500);
  },

  enterApp() {
    var user = ArcanoDB.getCurrentUser();
    if (!user) { this.showLogin(); return; }

    ArcanoDB.onDBChange(function(type) {
      if (type === 'remote_change') App.renderPage(App.currentPage);
    });

    // Pedidos badge listener + audio notification
    function _playNotifSound() {
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Two-tone notification: high note then higher note
        var times = [0, 0.15, 0.35];
        var freqs = [880, 1100, 880];
        for (var i = 0; i < times.length; i++) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freqs[i];
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.3, ctx.currentTime + times[i]);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + times[i] + 0.14);
          osc.start(ctx.currentTime + times[i]);
          osc.stop(ctx.currentTime + times[i] + 0.15);
        }
      } catch (e) {}
    }

    var _lastPedidoNuevoCount = -1;
    function _updatePedidosBadge(pedidos, isNew, countChanged) {
      var count = ArcanoDB.getPedidosCount('nuevo');
      var badge = document.getElementById('pedidos-badge');
      if (badge) {
        if (count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
        else { badge.style.display = 'none'; }
      }
      // Audio + visual alert when a NEW pedido arrives (not on initial load)
      if (isNew && _lastPedidoNuevoCount >= 0) {
        _playNotifSound();
        // Flash browser tab title
        var origTitle = document.title;
        var flashCount = 0;
        var flashInterval = setInterval(function() {
          document.title = flashCount % 2 === 0 ? '\u{1F514} Nuevo Pedido!' : origTitle;
          flashCount++;
          if (flashCount >= 10) { clearInterval(flashInterval); document.title = origTitle; }
        }, 800);
        // Re-render current page to show new pedido in dashboard
        App.renderPage(App.currentPage);
      }
      _lastPedidoNuevoCount = count;
    }
    ArcanoDB.onPedidosChange(_updatePedidosBadge);
    // Initial badge update after a short delay to let pedidos load
    setTimeout(_updatePedidosBadge, 2000);

    // Clientes listener + sonido de bienvenida cuando un cliente se registra
    function _playWelcomeSound() {
      try {
        // En mobile, vibrar adem\u00E1s de sonar (si el dispositivo lo soporta)
        if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 200]);
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        var ctx;
        // Reutilizar contexto existente si est\u00E1 disponible (mejor performance)
        if (window._arcanoWelcomeAudioCtx && window._arcanoWelcomeAudioCtx.state !== 'closed') {
          ctx = window._arcanoWelcomeAudioCtx;
        } else {
          ctx = new AudioCtx();
          window._arcanoWelcomeAudioCtx = ctx;
        }
        // En mobile, el contexto puede estar suspended hasta interacci\u00F3n del usuario
        if (ctx.state === 'suspended') {
          ctx.resume().catch(function() {});
        }
        // Sonido tipo "campana de bienvenida": 4 notas ascendentes (do-mi-sol-do)
        var now = ctx.currentTime;
        var times = [0, 0.12, 0.24, 0.45];
        var freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        for (var i = 0; i < times.length; i++) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freqs[i];
          osc.type = 'sine';
          gain.gain.setValueAtTime(0, now + times[i]);
          gain.gain.linearRampToValueAtTime(0.25, now + times[i] + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + times[i] + 0.4);
          osc.start(now + times[i]);
          osc.stop(now + times[i] + 0.45);
        }
      } catch (e) {
        console.warn('[Audio] No se pudo reproducir sonido de bienvenida:', e);
      }
    }

    // Notificaci\u00F3n nativa del sistema (para cuando la PWA est\u00E1 en background)
    function _showNativeNotification(title, body, tag) {
      try {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        var options = {
          body: body,
          icon: 'icons/icon-192.png',
          badge: 'icons/favicon.png',
          tag: tag || 'arcano-notif',
          vibrate: [120, 60, 120, 60, 200],
          requireInteraction: false,
          silent: true  // ya reproducimos nuestro propio sonido
        };
        // Usar registration del service worker si est\u00E1 disponible
        // (necesario para que funcione en PWA instalada en background)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(function(reg) {
            reg.showNotification(title, options).catch(function() {
              // Fallback: usar Notification API directa
              try { new Notification(title, options); } catch(e) {}
            });
          });
        } else {
          try { new Notification(title, options); } catch(e) {}
        }
      } catch (e) {
        console.warn('[Notif] No se pudo mostrar notificaci\u00F3n nativa:', e);
      }
    }

    // Wake Lock: mantener pantalla encendida por 8 segundos al llegar notificaci\u00F3n
    var _wakeLock = null;
    function _requestWakeLock() {
      try {
        if (!('wakeLock' in navigator)) return;
        if (_wakeLock) return;  // ya hay uno activo
        navigator.wakeLock.request('screen').then(function(lock) {
          _wakeLock = lock;
          // Liberar despu\u00E9s de 8 segundos
          setTimeout(function() {
            if (_wakeLock) {
              _wakeLock.release();
              _wakeLock = null;
            }
          }, 8000);
        }).catch(function() {});
      } catch (e) {}
    }

    var _lastClientesCount = -1;
    function _onClientesChange(clientes) {
      var count = clientes.length;
      // Sonido solo si aument\u00F3 la cantidad (cliente nuevo) y no en carga inicial
      if (count > _lastClientesCount && _lastClientesCount >= 0) {
        // Buscar el cliente nuevo (el \u00FAltimo agregado)
        var nuevoCliente = clientes[0];  // ya est\u00E1 ordenado por ultimoPedido desc
        var nombreNuevo = nuevoCliente && nuevoCliente.nombre ? nuevoCliente.nombre : 'Nuevo cliente';

        _playWelcomeSound();
        _requestWakeLock();
        _showNativeNotification(
          '\u{1F514} Nuevo Cliente en Arcano',
          nombreNuevo + ' acaba de registrarse',
          'arcano-cliente-nuevo-' + Date.now()
        );
        // Flash browser tab title
        var origTitle = document.title;
        var flashCount = 0;
        var flashInterval = setInterval(function() {
          document.title = flashCount % 2 === 0 ? '\u{1F514} Nuevo Cliente!' : origTitle;
          flashCount++;
          if (flashCount >= 10) { clearInterval(flashInterval); document.title = origTitle; }
        }, 800);
        // Si est\u00E1 en la p\u00E1gina de clientes, re-renderizar
        if (App.currentPage === 'clientes') {
          App.renderPage('clientes');
        }
      }
      _lastClientesCount = count;
    }
    ArcanoDB.onClientesChange(_onClientesChange);
    // Inicializar count despu\u00E9s de un delay para no disparar sonido en carga inicial
    setTimeout(function() {
      _lastClientesCount = ArcanoDB.getClientesCount();
    }, 3000);

    // === Colecci\u00F3n Arcano: notificaci\u00F3n cuando un cliente completa su cart\u00F3n ===
    ArcanoDB.onDBChange(function(type, collection, id) {
      if (type === 'coleccion_completada') {
        var col = ArcanoDB.getColeccion(id);
        var nombre = (col && col.nombre) ? col.nombre : id;
        // Sonido
        try {
          var ctx = new (window.AudioContext || window.webkitAudioContext)();
          var osc = ctx.createOscillator(); var gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'triangle'; osc.frequency.setValueAtTime(523, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1047, ctx.currentTime + 0.3);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        } catch(e) {}
        // Flash del t\u00EDtulo
        var origTitle2 = document.title;
        var flashCount2 = 0;
        var flashInt2 = setInterval(function() {
          document.title = flashCount2 % 2 === 0 ? '\u{1F3C5} \u00A1Cart\u00F3n Completado!' : origTitle2;
          flashCount2++;
          if (flashCount2 >= 10) { clearInterval(flashInt2); document.title = origTitle2; }
        }, 800);
        // Notificaci\u00F3n nativa
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('\u{1F3C5} Colecci\u00F3n Arcano', { body: nombre + ' complet\u00F3 su cart\u00F3n de 10 blends. \u00A1Debe recibir Blend Grande gratis!', icon: 'icons/arcano-logo.webp' });
        }
        // Toast
        if (typeof toast === 'function') toast('\u{1F3C5} ' + nombre + ' complet\u00F3 su cart\u00F3n. \u00A1Blend Grande gratis!', 'ok');
        // Re-render si est\u00E1 en campa\u00F1as
        if (App.currentPage === 'campanas') App.renderPage('campanas');
      }
    });

    // Pedir permiso de notificaciones nativas al entrar al admin
    // (necesario para que funcione en PWA instalada en background)
    function _requestNotifPermission() {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(function(p) {
          console.log('[Notif] Permiso:', p);
        }).catch(function() {});
      }
    }
    // Pedir permiso despu\u00E9s de un breve delay (no interrumpir el login)
    setTimeout(_requestNotifPermission, 2000);

    // Detectar cuando la app vuelve a foreground (PWA instalada)
    // para reanudar el AudioContext si estaba suspended
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        if (window._arcanoWelcomeAudioCtx && window._arcanoWelcomeAudioCtx.state === 'suspended') {
          window._arcanoWelcomeAudioCtx.resume().catch(function() {});
        }
      }
    });

    // Grandes Clientes badge listener + audio notification
    var _lastGCNuevoCount = -1;
    function _updateGCBadge(gcs, isNew) {
      var count = ArcanoDB.getGCCount('nuevo');
      var badge = document.getElementById('gc-badge');
      if (badge) {
        if (count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
        else { badge.style.display = 'none'; }
      }
      // Audio + visual alert when a NEW GC message arrives
      if (isNew && _lastGCNuevoCount >= 0) {
        _playNotifSound();
        var origTitle = document.title;
        var flashCount = 0;
        var flashInterval = setInterval(function() {
          document.title = flashCount % 2 === 0 ? '\u{1F4E7} Nuevo Gran Cliente!' : origTitle;
          flashCount++;
          if (flashCount >= 10) { clearInterval(flashInterval); document.title = origTitle; }
        }, 800);
        App.renderPage(App.currentPage);
      }
      _lastGCNuevoCount = count;
    }
    ArcanoDB.onGCChange(_updateGCBadge);
    setTimeout(function() { _updateGCBadge(ArcanoDB.getGrandesClientes(), false); }, 2500);

    this.renderShell(user);
    // Render dashboard immediately with cached data, then re-render
    // after a short delay to pick up fresh Firebase data
    this.renderPage('dashboard');
    setTimeout(function() {
      if (App.currentPage === 'dashboard') {
        App.renderPage('dashboard');
      }
    }, 2000);
  },

  renderShell(user) {
    var root = document.getElementById('app-root');
    root.innerHTML =
      '<div class="app-layout ' + (this.sidebarOpen ? '' : 'sidebar-closed') + '">' +
        '<aside class="sidebar" id="sidebar">' +
          '<div class="sidebar-header">' +
            '<div class="sidebar-logo"><img src="' + ARCANO_LOGO + '" alt="Arcano" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>' +
            '<div class="sidebar-brand">ARCANO</div>' +
          '</div>' +
          '<nav class="sidebar-nav" id="sidebar-nav">' +
            '<a class="nav-item active" data-page="dashboard" onclick="App.navigate(\'dashboard\')">' +
              '<span class="nav-icon">\u{1F4CA}</span><span class="nav-label">Dashboard</span></a>' +
            '<a class="nav-item" data-page="productos" onclick="App.navigate(\'productos\')">' +
              '<span class="nav-icon">\u{1F336}\uFE0F</span><span class="nav-label">Productos</span></a>' +
            '<a class="nav-item" data-page="insumos" onclick="App.navigate(\'insumos\')">' +
              '<span class="nav-icon">\u{1F4E6}</span><span class="nav-label">Insumos</span></a>' +
            '<a class="nav-item" data-page="produccion" onclick="App.navigate(\'produccion\')">' +
              '<span class="nav-icon">\u{1F3ED}</span><span class="nav-label">Produccion</span></a>' +
            '<a class="nav-item" data-page="costales" onclick="App.navigate(\'costales\')">' +
              '<span class="nav-icon">\u{1F6CD}\uFE0F</span><span class="nav-label">Costales</span></a>' +
            '<a class="nav-item" data-page="ventas" onclick="App.navigate(\'ventas\')">' +
              '<span class="nav-icon">\u{1F4B0}</span><span class="nav-label">Ventas</span></a>' +
            '<a class="nav-item" data-page="gastos" onclick="App.navigate(\'gastos\')">' +
              '<span class="nav-icon">\u{1F4C9}</span><span class="nav-label">Gastos</span></a>' +
            '<a class="nav-item" data-page="pedidos" onclick="App.navigate(\'pedidos\')" id="nav-pedidos">' +
              '<span class="nav-icon">\u{1F4E6}</span><span class="nav-label">Pedidos</span><span class="nav-badge" id="pedidos-badge" style="display:none"></span></a>' +
            '<a class="nav-item" data-page="envios" onclick="App.navigate(\'envios\')">' +
              '<span class="nav-icon">\u{1F69A}</span><span class="nav-label">Env\u00EDos</span></a>' +
            '<a class="nav-item" data-page="stock" onclick="App.navigate(\'stock\')">' +
              '<span class="nav-icon">\u{1F4CB}</span><span class="nav-label">Stock</span></a>' +
            '<a class="nav-item" data-page="costos" onclick="App.navigate(\'costos\')">' +
              '<span class="nav-icon">\u{1F4B2}</span><span class="nav-label">Costos</span></a>' +
            '<a class="nav-item" data-page="palas" onclick="App.navigate(\'palas\')">' +
              '<span class="nav-icon">\u{1F944}</span><span class="nav-label">Palas</span></a>' +
            '<a class="nav-item" data-page="tienda" onclick="App.navigate(\'tienda\')">' +
              '<span class="nav-icon">\u{1F6D2}</span><span class="nav-label">Tienda</span></a>' +
            '<a class="nav-item" data-page="tublend" onclick="App.navigate(\'tublend\')">' +
              '<span class="nav-icon">\u2697</span><span class="nav-label">Tu Blend</span></a>' +
            '<a class="nav-item" data-page="recetas" onclick="App.navigate(\'recetas\')">' +
              '<span class="nav-icon">\u{1F373}</span><span class="nav-label">Recetas IA</span></a>' +
            '<a class="nav-item" data-page="blog" onclick="App.navigate(\'blog\')">' +
              '<span class="nav-icon">\u{1F4DD}</span><span class="nav-label">Blog IA</span></a>' +
            '<a class="nav-item" data-page="estadisticas" onclick="App.navigate(\'estadisticas\')">' +
              '<span class="nav-icon">\u{1F4CA}</span><span class="nav-label">Estadisticas</span></a>' +
            '<a class="nav-item" data-page="usuarios" onclick="App.navigate(\'usuarios\')">' +
              '<span class="nav-icon">\u{1F465}</span><span class="nav-label">Usuarios</span></a>' +
            '<a class="nav-item" data-page="puntosdeventa" onclick="App.navigate(\'puntosdeventa\')">' +
              '<span class="nav-icon">\u{1F3EA}</span><span class="nav-label">P. Venta</span></a>' +
            '<a class="nav-item" data-page="grandesClientes" onclick="App.navigate(\'grandesClientes\')">' +
              '<span class="nav-icon">\u{1F3E2}</span><span class="nav-label">Grandes Clientes</span><span class="nav-badge" id="gc-badge" style="display:none"></span></a>' +
            '<a class="nav-item" data-page="clientes" onclick="App.navigate(\'clientes\')">' +
              '<span class="nav-icon">\u{1F465}</span><span class="nav-label">Clientes</span></a>' +
            '<a class="nav-item" data-page="promociones" onclick="App.navigate(\'promociones\')">' +
              '<span class="nav-icon">\u{1F381}</span><span class="nav-label">Promociones</span></a>' +
            '<a class="nav-item" data-page="carritos" onclick="App.navigate(\'carritos\')">' +
              '<span class="nav-icon">\u{1F6D2}</span><span class="nav-label">Carritos</span></a>' +
            '<a class="nav-item" data-page="mensajes" onclick="App.navigate(\'mensajes\')">' +
              '<span class="nav-icon">\u{1F4AC}</span><span class="nav-label">Mensajes WA</span></a>' +
            '<a class="nav-item" data-page="campanas" onclick="App.navigate(\'campanas\')">' +
              '<span class="nav-icon">\u{1F3C5}</span><span class="nav-label">Campa\u00F1as</span><span class="nav-badge" id="nav-campanas" style="display:none"></span></a>' +
            '<a class="nav-item" data-page="chatbot" onclick="App.navigate(\'chatbot\')">' +
              '<span class="nav-icon">\u{1F52E}</span><span class="nav-label">Chatbot IA</span></a>' +
            '<div style="border-top:1px solid var(--border);margin:8px 12px"></div>' +
            '<a class="nav-item" data-page="testing" onclick="App.navigate(\'testing\')">' +
              '<span class="nav-icon">\u{1F9EA}</span><span class="nav-label">Testing</span></a>' +
          '</nav>' +
          '<div class="sidebar-footer">' +
            '<div class="user-info">' +
              '<span class="user-name">' + (user.nombre || 'Admin') + '</span>' +
              '<span class="user-role">' + (user.rol || 'admin') + '</span>' +
            '</div>' +
            '<button class="btn btn-sm btn-outline" onclick="App.logout()">Salir</button>' +
          '</div>' +
        '</aside>' +
        '<div class="sidebar-overlay" id="sidebar-overlay" onclick="App.closeMobileSidebar()"></div>' +
        '<main class="main-content">' +
          '<header class="top-bar">' +
            '<button class="btn btn-ghost" id="menu-toggle-btn" onclick="App.toggleSidebar()" aria-label="Abrir menu">\u2630</button>' +
            '<h2 class="page-title" id="page-title">Dashboard</h2>' +
            '<div class="top-bar-actions">' +
              '<span class="sync-indicator" id="sync-indicator" title="Conectado a Firebase">\u25CF Firebase</span>' +
            '</div>' +
          '</header>' +
          '<div class="page-content" id="page-content">' +
            '<div class="loader-center"><div class="loader"></div></div>' +
          '</div>' +
        '</main>' +
      '</div>' +
      '<div id="modal-overlay" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-header"><h3 id="modal-title"></h3><button class="btn btn-ghost" onclick="closeModal()" style="font-size:18px">X</button></div><div class="modal-body" id="modal-body"></div></div></div>' +
      '<div id="toast" class="toast"></div>';
  },

  navigate(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.page === page);
    });
    this.closeMobileSidebar();
    var titles = {
      dashboard: 'Dashboard', productos: 'Productos', insumos: 'Insumos', testing: 'Testing',
      produccion: 'Produccion', costales: 'Costales', ventas: 'Ventas', gastos: 'Gastos', pedidos: 'Pedidos', envios: 'Env\u00EDos', stock: 'Stock', costos: 'Costos', palas: 'Palas', tienda: 'Tienda', tublend: 'Tu Blend', recetas: 'Recetas IA', blog: 'Blog IA', estadisticas: 'Estadisticas', usuarios: 'Usuarios', puntosdeventa: 'P. Venta', grandesClientes: 'Grandes Clientes', clientes: 'Clientes', promociones: 'Promociones', carritos: 'Carritos', mensajes: 'Mensajes WhatsApp', chatbot: 'Chatbot IA'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    // Cierra el drawer lateral en mobile al cambiar de pagina
    if (window.matchMedia('(max-width: 768px)').matches) {
      this.closeMobileSidebar();
    }
    this.renderPage(page);
  },

  toggleSidebar(force) {
    // En mobile usamos mobile-open (overlay drawer), en desktop sidebar-closed (colapso a 60px).
    var isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      var sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      var overlay = document.getElementById('sidebar-overlay');
      if (typeof force === 'boolean') {
        sidebar.classList.toggle('mobile-open', force);
        if (overlay) overlay.classList.toggle('visible', force);
        this.sidebarOpen = force;
      } else {
        var willOpen = !sidebar.classList.contains('mobile-open');
        sidebar.classList.toggle('mobile-open', willOpen);
        if (overlay) overlay.classList.toggle('visible', willOpen);
        this.sidebarOpen = willOpen;
      }
    } else {
      this.sidebarOpen = typeof force === 'boolean' ? force : !this.sidebarOpen;
      document.querySelector('.app-layout').classList.toggle('sidebar-closed', !this.sidebarOpen);
    }
  },

  closeMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('visible');
    this.sidebarOpen = false;
  },

  logout() {
    ArcanoDB.logoutUser();
    this.showLogin();
  },

  renderPage(page) {
    var container = document.getElementById('page-content');
    if (!container) return;
    try {
      switch (page) {
        case 'dashboard': Pages.renderDashboard(container); break;
        case 'productos': Pages.renderProductos(container); break;
        case 'insumos': Pages.renderInsumos(container); break;
        case 'produccion': Pages.renderProduccion(container); break;
        case 'costales': Pages.renderCostales(container); break;
        case 'ventas': Pages.renderVentas(container); break;
        case 'gastos': Pages.renderGastos(container); break;
        case 'pedidos': Pages.renderPedidos(container); break;
        case 'envios': Pages.renderEnvios(container); break;
        case 'stock': Pages.renderStock(container); break;
        case 'costos': Pages.renderCostos(container); break;
        case 'palas': Pages.renderPalas(container); break;
        case 'tienda': Pages.renderTiendaAdmin(container); break;
        case 'tublend': Pages.renderTuBlend(container); break;
        case 'recetas': Pages.renderRecetasAdmin(container); break;
        case 'blog': Pages.renderBlogAdmin(container); break;
        case 'estadisticas': Pages.renderEstadisticas(container); break;
        case 'usuarios': Pages.renderUsuarios(container); break;
        case 'testing': Pages.renderTesting(container); break;
        case 'puntosdeventa': PDV.render(container); break;
        case 'grandesClientes': Pages.renderGrandesClientes(container); break;
        case 'clientes': Pages.renderClientes(container); break;
        case 'promociones': Pages.renderPromociones(container); break;
        case 'carritos': Pages.renderCarritos(container); break;
        case 'mensajes': WhatsAppNotifications.renderPanel(container); break;
        case 'campanas': Pages.renderCampanas(container); break;
        case 'chatbot': ChatbotPanel.render(container); break;
        default: container.innerHTML = '<p>Pagina no encontrada</p>';
      }
    } catch (e) {
      console.error('[Core] Page render error:', e);
      container.innerHTML = '<div class="error-box"><h3>Error al cargar la pagina</h3><p>' + e.message + '</p><button class="btn btn-gold mt-12" onclick="App.renderPage(\'' + page + '\')">Reintentar</button></div>';
    }
  }
};

document.addEventListener('DOMContentLoaded', function() { App.init(); });