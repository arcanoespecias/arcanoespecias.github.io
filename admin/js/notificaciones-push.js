/* ===================== NOTIFICACIONES PUSH — Admin Panel =====================
 * Gestiona suscripción a Web Push (FCM/Google push service para Chrome Android)
 * Funciona incluso con la PWA cerrada (en Android).
 */

var NotificacionesPush = (function() {

  var FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';
  var PUSH_API = '/api/notify-admin';
  // VAPID public key se lee desde Firebase (configurada por el admin)
  var _vapidPublicKey = null;
  var _currentSubscription = null;

  function renderPanel(container) {
    container.innerHTML =
      '<div class="notif-panel">' +
        _styles() +
        '<h2 style="color:var(--gold,#d4af37);margin:0 0 4px">🔔 Notificaciones Push</h2>' +
        '<p style="color:var(--text-muted,#8a7a6e);margin:0 0 20px;font-size:0.9rem">Recibí alertas en tu celular aunque la app esté cerrada (Android)</p>' +

        '<div class="notif-section">' +
          '<div class="notif-card' + (Notification.permission === 'granted' ? ' active' : '') + '">' +
            '<div class="notif-status-row">' +
              '<div>' +
                '<h4 class="notif-card-title">Estado de notificaciones</h4>' +
                '<p class="notif-card-desc" id="notif-status-desc">Cargando estado...</p>' +
              '</div>' +
              '<div class="notif-status-badge" id="notif-status-badge">—</div>' +
            '</div>' +
            '<div class="notif-actions">' +
              '<button class="notif-btn notif-btn-gold" id="notif-enable-btn" onclick="NotificacionesPush.activar()">Activar notificaciones</button>' +
              '<button class="notif-btn notif-btn-outline" id="notif-test-btn" onclick="NotificacionesPush.enviarTest()" style="display:none">🔔 Probar notificación</button>' +
              '<button class="notif-btn notif-btn-outline" onclick="NotificacionesPush.diagnosticar()">🔍 Diagnosticar</button>' +
              '<button class="notif-btn notif-btn-sec" id="notif-disable-btn" onclick="NotificacionesPush.desactivar()" style="display:none">Desactivar</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="notif-section">' +
          '<div class="notif-card">' +
            '<h4 class="notif-card-title">📱 Dispositivos suscriptos</h4>' +
            '<p class="notif-card-desc">Otros dispositivos donde activaste notificaciones</p>' +
            '<div id="notif-devices-list"><p class="text-muted text-center" style="padding:20px">Cargando...</p></div>' +
          '</div>' +
        '</div>' +

        '<div class="notif-section">' +
          '<div class="notif-card">' +
            '<h4 class="notif-card-title">📋 Eventos que disparan notificaciones</h4>' +
            '<div class="notif-events-grid">' +
              _eventCard('🛒', 'Pedido nuevo', 'Cuando un cliente hace un pedido en la tienda') +
              _eventCard('👤', 'Cliente nuevo', 'Cuando alguien se registra en Mi Cuenta') +
              _eventCard('🛍️', 'Carrito abandonado', 'Después de 30 min sin completar compra') +
              _eventCard('🏅', 'Colección completada', 'Cliente completó 10 casilleros (canje)') +
              _eventCard('🏢', 'Grandes Clientes', 'Nueva solicitud de restaurante/hotel') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="notif-section">' +
          '<div class="notif-card">' +
            '<h4 class="notif-card-title">ℹ️ Cómo funciona</h4>' +
            '<ul class="notif-info-list">' +
              '<li><strong>Instalá la PWA</strong> en tu celular (Chrome Android → "Agregar a pantalla de inicio")</li>' +
              '<li><strong>Activá las notificaciones</strong> con el botón de arriba</li>' +
              '<li>Cuando un cliente haga un pedido, te llegará una notificación push <strong>instantánea</strong></li>' +
              '<li>Funciona <strong>aunque la app esté cerrada</strong> (en Android Chrome)</li>' +
              '<li>En iOS, la app debe estar en background reciente (limitación de Apple)</li>' +
              '<li>Para instalar en PC, abrí la PWA en Chrome/Edge y hacé clic en "Instalar" en la barra de direcciones</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +

        '<div class="notif-section">' +
          '<div class="notif-card">' +
            '<h4 class="notif-card-title">⚙️ Configuración VAPID</h4>' +
            '<p class="notif-card-desc">Las VAPID keys son necesarias para que las notificaciones push funcionen. Las generaste con <code>npx web-push generate-vapid-keys</code>. Se guardan en Firebase.</p>' +
            '<div class="notif-vapid-form">' +
              '<label class="text-sm text-muted">VAPID Public Key (empieza con B...)</label>' +
              '<div class="notif-vapid-row">' +
                '<input type="text" class="notif-input" id="notif-vapid-public" placeholder="BG9...">' +
              '</div>' +
              '<label class="text-sm text-muted mt-8">VAPID Private Key</label>' +
              '<div class="notif-vapid-row">' +
                '<input type="password" class="notif-input" id="notif-vapid-private" placeholder="xXx...">' +
              '</div>' +
              '<label class="text-sm text-muted mt-8">Subject (mail o URL)</label>' +
              '<div class="notif-vapid-row">' +
                '<input type="text" class="notif-input" id="notif-vapid-subject" placeholder="mailto:admin@arcanoespecias.com" value="mailto:arcanoespecias@gmail.com">' +
              '</div>' +
              '<div class="mt-12">' +
                '<button class="notif-btn notif-btn-gold" onclick="NotificacionesPush.guardarVapidKey()">💾 Guardar keys</button>' +
                ' <button class="notif-btn notif-btn-outline" onclick="NotificacionesPush.mostrarPrivate()" id="notif-toggle-private">👁 Mostrar private</button>' +
              '</div>' +
            '</div>' +
            '<p class="text-xs text-muted mt-8">⚠️ La private key se guarda en Firebase. Es accesible públicamente con tus reglas actuales. Para tu caso (tienda pequeña) es aceptable. El riesgo máximo es que alguien te envíe notificaciones no deseadas.</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    loadVapidKey();
    loadStatus();
    loadDevices();
  }

  function _eventCard(icon, title, desc) {
    return '<div class="notif-event-card">' +
      '<div class="notif-event-icon">' + icon + '</div>' +
      '<div>' +
        '<div class="notif-event-title">' + title + '</div>' +
        '<div class="notif-event-desc">' + desc + '</div>' +
      '</div>' +
    '</div>';
  }

  async function loadVapidKey() {
    try {
      var r = await fetch(FB_BASE + '/pushConfig.json');
      var data = r.ok ? await r.json() : null;
      if (!data) data = {};
      _vapidPublicKey = data.vapidPublicKey || null;
      var pubInput = document.getElementById('notif-vapid-public');
      var privInput = document.getElementById('notif-vapid-private');
      var subjInput = document.getElementById('notif-vapid-subject');
      if (pubInput && data.vapidPublicKey) pubInput.value = data.vapidPublicKey;
      if (privInput && data.vapidPrivateKey) privInput.value = data.vapidPrivateKey;
      if (subjInput && data.vapidSubject) subjInput.value = data.vapidSubject;
    } catch (e) {}
  }

  async function guardarVapidKey() {
    var pubInput = document.getElementById('notif-vapid-public');
    var privInput = document.getElementById('notif-vapid-private');
    var subjInput = document.getElementById('notif-vapid-subject');
    if (!pubInput || !privInput || !subjInput) return;
    var publicKey = pubInput.value.trim();
    var privateKey = privInput.value.trim();
    var subject = subjInput.value.trim();
    if (!publicKey) { alert('Ingresá la VAPID public key'); return; }
    if (!privateKey) { alert('Ingresá la VAPID private key'); return; }
    if (!subject) { alert('Ingresá el subject (mail o URL)'); return; }
    if (publicKey.length < 80) { if (!confirm('La public key parece muy corta. ¿Es válida?')) return; }
    if (privateKey.length < 30) { if (!confirm('La private key parece muy corta. ¿Es válida?')) return; }
    try {
      var config = {
        vapidPublicKey: publicKey,
        vapidPrivateKey: privateKey,
        vapidSubject: subject,
        actualizadoEn: Date.now()
      };
      await fetch(FB_BASE + '/pushConfig.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      _vapidPublicKey = publicKey;
      toast('VAPID keys guardadas en Firebase');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  function mostrarPrivate() {
    var inp = document.getElementById('notif-vapid-private');
    var btn = document.getElementById('notif-toggle-private');
    if (!inp) return;
    if (inp.type === 'password') {
      inp.type = 'text';
      if (btn) btn.textContent = '🙈 Ocultar private';
    } else {
      inp.type = 'password';
      if (btn) btn.textContent = '👁 Mostrar private';
    }
  }

  async function loadStatus() {
    var desc = document.getElementById('notif-status-desc');
    var badge = document.getElementById('notif-status-badge');
    var enableBtn = document.getElementById('notif-enable-btn');
    var testBtn = document.getElementById('notif-test-btn');
    var disableBtn = document.getElementById('notif-disable-btn');

    if (!('Notification' in window)) {
      if (desc) desc.textContent = 'Este navegador no soporta notificaciones';
      if (badge) { badge.textContent = 'No soportado'; badge.className = 'notif-status-badge notif-status-off'; }
      return;
    }

    var permission = Notification.permission;
    if (permission === 'granted') {
      // Verificar si hay suscripción activa
      if ('serviceWorker' in navigator) {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (sub) {
          _currentSubscription = sub;
          if (desc) desc.textContent = 'Notificaciones activadas en este dispositivo. Vas a recibir alertas cuando lleguen pedidos.';
          if (badge) { badge.textContent = '● Activo'; badge.className = 'notif-status-badge notif-status-on'; }
          if (enableBtn) enableBtn.style.display = 'none';
          if (testBtn) testBtn.style.display = 'inline-flex';
          if (disableBtn) disableBtn.style.display = 'inline-flex';
        } else {
          if (desc) desc.textContent = 'Permiso concedido pero falta suscribirse. Hacé clic en "Activar notificaciones".';
          if (badge) { badge.textContent = '○ Listo para activar'; badge.className = 'notif-status-badge notif-status-wait'; }
        }
      }
    } else if (permission === 'denied') {
      if (desc) desc.innerHTML = 'Las notificaciones están <strong>bloqueadas</strong> en este navegador. Habilitá los permisos desde la configuración del navegador → Notificaciones → permitir arcanoespecias.com';
      if (badge) { badge.textContent = '✗ Bloqueado'; badge.className = 'notif-status-badge notif-status-off'; }
      if (enableBtn) enableBtn.style.display = 'none';
    } else {
      if (desc) desc.textContent = 'Aún no activaste las notificaciones. Hacé clic en "Activar notificaciones" para empezar a recibir alertas.';
      if (badge) { badge.textContent = '○ Inactivo'; badge.className = 'notif-status-badge notif-status-wait'; }
      if (enableBtn) enableBtn.style.display = 'inline-flex';
      if (testBtn) testBtn.style.display = 'none';
      if (disableBtn) disableBtn.style.display = 'none';
    }
  }

  async function loadDevices() {
    var listEl = document.getElementById('notif-devices-list');
    if (!listEl) return;
    try {
      var r = await fetch(FB_BASE + '/pushSubscriptions.json');
      var data = r.ok ? await r.json() : null;
      if (!data || Object.keys(data).length === 0) {
        listEl.innerHTML = '<p class="text-muted text-center" style="padding:20px">No hay dispositivos suscriptos todavía.</p>';
        return;
      }
      var html = '<div class="notif-devices-table"><table class="table"><thead><tr><th>Dispositivo</th><th>Suscripto</th><th></th></tr></thead><tbody>';
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var sub = data[k];
        var endpoint = sub.endpoint || '';
        var isAndroid = endpoint.indexOf('fcm.googleapis.com') >= 0 || endpoint.indexOf('android.googleapis.com') >= 0;
        var isFirefox = endpoint.indexOf('mozilla') >= 0;
        var isChrome = endpoint.indexOf('google') >= 0;
        var deviceType = isAndroid ? '📱 Android (Chrome)' : (isFirefox ? '🦊 Firefox' : (isChrome ? '💻 Chrome' : '🌐 Web Push'));
        var fecha = sub.suscriptoEn ? new Date(sub.suscriptoEn).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
        html += '<tr>' +
          '<td class="fw7">' + deviceType + '</td>' +
          '<td class="text-sm text-muted">' + fecha + '</td>' +
          '<td><button class="notif-btn notif-btn-sec btn-sm" onclick="NotificacionesPush.borrarDispositivo(\'' + k + '\')">Eliminar</button></td>' +
        '</tr>';
      }
      html += '</tbody></table></div>';
      listEl.innerHTML = html;
    } catch (e) {
      listEl.innerHTML = '<p class="text-muted text-center">Error: ' + e.message + '</p>';
    }
  }

  async function borrarDispositivo(key) {
    if (!confirm('¿Eliminar este dispositivo? Ya no recibirá notificaciones.')) return;
    try {
      await fetch(FB_BASE + '/pushSubscriptions/' + key + '.json', { method: 'DELETE' });
      loadDevices();
      toast('Dispositivo eliminado');
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function activar() {
    if (!('Notification' in window)) {
      alert('Tu navegador no soporta notificaciones push. Probá con Chrome Android o Edge.');
      return;
    }
    if (!_vapidPublicKey) {
      alert('Falta configurar la VAPID public key. Ingresala abajo y hacé clic en "Guardar".');
      return;
    }
    try {
      // 1. Pedir permiso
      var permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Permiso denegado. No vas poder recibir notificaciones.');
        return;
      }
      // 2. Usar el SW RAÍZ (scope /) para push, no el del admin
      if (!('serviceWorker' in navigator)) {
        alert('Tu navegador no soporta service workers. No se puede activar push.');
        return;
      }
      
      // Registrar el SW raíz explícitamente y esperar a que esté ACTIVO
      console.log('[Push] Registrando SW raíz /sw.js con scope /');
      var reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[Push] SW registrado. Estado:', reg.active ? 'active' : (reg.waiting ? 'waiting' : (reg.installing ? 'installing' : 'unknown')));
      
      // Esperar a que el SW esté activo
      await _waitForSWActive(reg);
      console.log('[Push] SW activo confirmado');
      
      // 3. Suscribirse a push usando el SW raíz
      var applicationServerKey = _urlBase64ToUint8Array(_vapidPublicKey);
      var subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
      _currentSubscription = subscription;
      // 4. Guardar suscripción en Firebase
      var subJson = subscription.toJSON();
      var subData = {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        suscriptoEn: Date.now(),
        userAgent: navigator.userAgent.substring(0, 200)
      };
      // Generar ID único para este dispositivo
      var deviceId = 'd' + Date.now() + Math.random().toString(36).slice(2, 8);
      await fetch(FB_BASE + '/pushSubscriptions/' + deviceId + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subData)
      });
      toast('Notificaciones activadas en este dispositivo');
      loadStatus();
      loadDevices();
    } catch (e) {
      alert('Error: ' + e.message);
      console.error('[Push] Error en activar():', e);
    }
  }

  // Helper: esperar a que el SW esté en estado 'activated'
  function _waitForSWActive(registration) {
    return new Promise(function(resolve, reject) {
      if (registration.active) {
        // Ya está activo
        resolve(registration);
        return;
      }
      
      var sw = registration.installing || registration.waiting;
      if (!sw) {
        // No hay SW instalando/esperando — esperar a navigator.serviceWorker.ready
        navigator.serviceWorker.ready.then(resolve).catch(reject);
        return;
      }
      
      // Escuchar cambios de estado
      function checkState() {
        if (sw.state === 'activated') {
          sw.removeEventListener('statechange', checkState);
          resolve(registration);
        } else if (sw.state === 'redundant') {
          sw.removeEventListener('statechange', checkState);
          reject(new Error('Service Worker falló al instalar (redundant)'));
        }
      }
      sw.addEventListener('statechange', checkState);
      // Llamar una vez por si ya cambió
      checkState();
      
      // Timeout de seguridad (10s)
      setTimeout(function() {
        sw.removeEventListener('statechange', checkState);
        // Aún así intentar resolver — quizás ya está activo
        navigator.serviceWorker.ready.then(resolve).catch(reject);
      }, 10000);
    });
  }

  async function desactivar() {
    if (!confirm('¿Desactivar notificaciones en este dispositivo?')) return;
    try {
      if ('serviceWorker' in navigator) {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
      // También borrar de Firebase (buscar por endpoint)
      if (_currentSubscription) {
        var endpoint = _currentSubscription.endpoint;
        var r = await fetch(FB_BASE + '/pushSubscriptions.json');
        var data = r.ok ? await r.json() : null;
        if (data) {
          for (var k in data) {
            if (data[k].endpoint === endpoint) {
              await fetch(FB_BASE + '/pushSubscriptions/' + k + '.json', { method: 'DELETE' });
              break;
            }
          }
        }
      }
      _currentSubscription = null;
      toast('Notificaciones desactivadas');
      loadStatus();
      loadDevices();
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function enviarTest() {
    var btn = document.getElementById('notif-test-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
      var r = await fetch(PUSH_API + '?action=test');
      var data = await r.json();
      if (data.ok) {
        toast('Notificación enviada. Debería llegar en unos segundos.');
        // Mostrar detalle en consola para debug
        console.log('[Push] Test enviado:', data);
      } else {
        var errMsg = data.error || JSON.stringify(data);
        alert('No se pudo enviar: ' + errMsg);
        console.error('[Push] Error enviando test:', data);
      }
    } catch (e) {
      alert('Error: ' + e.message);
      console.error('[Push] Exception:', e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔔 Probar notificación'; }
    }
  }

  async function diagnosticar() {
    var output = [];
    output.push('=== DIAGNÓSTICO DE NOTIFICACIONES PUSH ===\n');
    
    // 1. Service Worker
    output.push('1. Service Worker:');
    if (!('serviceWorker' in navigator)) {
      output.push('   ✗ No soportado');
    } else {
      var regs = await navigator.serviceWorker.getRegistrations();
      output.push('   Registrations encontradas: ' + regs.length);
      for (var i = 0; i < regs.length; i++) {
        output.push('   - scope: ' + regs[i].scope);
        output.push('     active: ' + (regs[i].active ? 'sí' : 'no'));
        output.push('     scriptURL: ' + regs[i].active?.scriptURL);
      }
      var reg = await navigator.serviceWorker.ready;
      output.push('   SW ready: ' + (reg ? 'sí' : 'no'));
    }
    output.push('');
    
    // 2. Permiso de notificaciones
    output.push('2. Permiso de notificaciones:');
    if (!('Notification' in window)) {
      output.push('   ✗ No soportado');
    } else {
      output.push('   Permission: ' + Notification.permission);
    }
    output.push('');
    
    // 3. Push subscription
    output.push('3. Push subscription:');
    if ('serviceWorker' in navigator) {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        output.push('   ✓ Suscripto');
        output.push('   endpoint: ' + sub.endpoint);
        output.push('   expirationTime: ' + sub.expirationTime);
      } else {
        output.push('   ✗ No hay suscripción');
      }
    }
    output.push('');
    
    // 4. VAPID key configurada
    output.push('4. VAPID key:');
    try {
      var r = await fetch(FB_BASE + '/pushConfig.json');
      var data = r.ok ? await r.json() : null;
      if (data && data.vapidPublicKey) {
        output.push('   ✓ Configurada (len=' + data.vapidPublicKey.length + ')');
        output.push('   Public key (primeros 30): ' + data.vapidPublicKey.substring(0, 30) + '...');
      } else {
        output.push('   ✗ No configurada');
      }
    } catch (e) {
      output.push('   ✗ Error: ' + e.message);
    }
    output.push('');
    
    // 5. Llamar al status del API
    output.push('5. Estado del API (/api/notify-admin?action=status):');
    try {
      var r = await fetch(PUSH_API + '?action=status');
      var data = await r.json();
      output.push('   ' + JSON.stringify(data, null, 2).split('\n').join('\n   '));
    } catch (e) {
      output.push('   ✗ Error: ' + e.message);
    }
    
    var report = output.join('\n');
    console.log(report);
    
    // Mostrar en un modal con textarea copiable
    var existing = document.getElementById('notif-diag-modal');
    if (existing) existing.remove();
    
    var modal = document.createElement('div');
    modal.id = 'notif-diag-modal';
    modal.className = 'modal-overlay';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML =
      '<div class="modal" style="max-width:600px;max-height:80vh">' +
        '<div class="modal-header">' +
          '<h3>🔍 Diagnóstico de Notificaciones</h3>' +
          '<button class="btn btn-ghost" onclick="document.getElementById(\'notif-diag-modal\').remove()">×</button>' +
        '</div>' +
        '<div class="modal-body" style="overflow-y:auto">' +
          '<p class="text-sm text-muted mb-8">Copiá todo este texto y pegalo en el chat:</p>' +
          '<textarea readonly style="width:100%;height:300px;font-family:monospace;font-size:0.75rem;background:var(--bg,#1b0b07);color:var(--text,#e8d5b7);border:1px solid var(--border,#3a2a1e);border-radius:6px;padding:8px" id="notif-diag-text">' + report.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-gold" onclick="var t=document.getElementById(\'notif-diag-text\');t.select();document.execCommand(\'copy\');toast(\'Copiado al portapapeles\')">📋 Copiar todo</button>' +
          '<button class="btn btn-outline ml-8" onclick="document.getElementById(\'notif-diag-modal\').remove()">Cerrar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    
    // Auto-seleccionar el texto para que sea fácil copiar
    setTimeout(function() {
      var ta = document.getElementById('notif-diag-text');
      if (ta) { ta.focus(); ta.select(); }
    }, 100);
  }

  function _urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function _styles() {
    return '<style>' +
      '.notif-panel{padding:20px;max-width:900px;margin:0 auto}' +
      '.notif-section{margin-bottom:20px}' +
      '.notif-card{background:var(--card-bg,#2a1a14);border:1px solid var(--border,#3a2a1e);border-radius:12px;padding:20px;transition:border-color 0.2s}' +
      '.notif-card.active{border-color:var(--green,#4ade80)}' +
      '.notif-card-title{margin:0 0 4px;color:var(--gold,#d4af37);font-size:1rem;font-weight:600}' +
      '.notif-card-desc{margin:0 0 16px;color:var(--text-muted,#8a7a6e);font-size:0.85rem}' +
      '.notif-status-row{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:12px}' +
      '.notif-status-badge{padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;white-space:nowrap}' +
      '.notif-status-on{background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3)}' +
      '.notif-status-wait{background:rgba(212,175,55,0.15);color:#d4af37;border:1px solid rgba(212,175,55,0.3)}' +
      '.notif-status-off{background:rgba(248,113,113,0.15);color:#f87171;border:1px solid rgba(248,113,113,0.3)}' +
      '.notif-actions{display:flex;gap:8px;flex-wrap:wrap}' +
      '.notif-btn{padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.85rem;font-family:inherit;border:none;transition:all 0.2s;display:inline-flex;align-items:center;gap:4px;text-decoration:none}' +
      '.notif-btn-gold{background:var(--gold,#d4af37);color:#1b0b07}' +
      '.notif-btn-gold:hover{background:#e6c14a}' +
      '.notif-btn-outline{background:transparent;border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7)}' +
      '.notif-btn-outline:hover{border-color:var(--gold,#d4af37);color:var(--gold,#d4af37)}' +
      '.notif-btn-sec{background:transparent;border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7);padding:4px 10px;font-size:0.78rem}' +
      '.notif-btn-sec:hover{border-color:#f87171;color:#f87171}' +
      '.notif-events-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:8px}' +
      '.notif-event-card{background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);border-radius:8px;padding:12px;display:flex;gap:10px;align-items:center}' +
      '.notif-event-icon{font-size:1.4rem;flex-shrink:0}' +
      '.notif-event-title{color:var(--text,#e8d5b7);font-weight:600;font-size:0.88rem}' +
      '.notif-event-desc{color:var(--text-muted,#8a7a6e);font-size:0.75rem;margin-top:2px}' +
      '.notif-info-list{margin:8px 0 0 16px;padding:0;color:var(--text,#e8d5b7);font-size:0.85rem;line-height:1.7}' +
      '.notif-info-list li{margin-bottom:6px}' +
      '.notif-info-list strong{color:var(--gold,#d4af37)}' +
      '.notif-vapid-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.notif-input{flex:1;background:var(--bg,#1b0b07);border:1px solid var(--border,#3a2a1e);color:var(--text,#e8d5b7);padding:8px 12px;border-radius:6px;font-family:inherit;font-size:0.85rem;min-width:300px}' +
      '.notif-input:focus{outline:none;border-color:var(--gold,#d4af37)}' +
      '.notif-devices-table .table{width:100%;border-collapse:collapse;font-size:0.85rem}' +
      '.notif-devices-table .table th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border,#3a2a1e);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted,#8a7a6e)}' +
      '.notif-devices-table .table td{padding:8px 10px;border-bottom:1px solid var(--border,#3a2a1e)}' +
      '.btn-sm{padding:4px 10px;font-size:0.78rem}' +
      '@media(max-width:600px){.notif-status-row{flex-direction:column;align-items:flex-start;gap:8px}.notif-vapid-row{flex-direction:column}.notif-input{min-width:100%}}' +
    '</style>';
  }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
    else if (window.App && App.toast) App.toast(msg);
  }

  return {
    renderPanel: renderPanel,
    activar: activar,
    desactivar: desactivar,
    enviarTest: enviarTest,
    diagnosticar: diagnosticar,
    guardarVapidKey: guardarVapidKey,
    mostrarPrivate: mostrarPrivate,
    borrarDispositivo: borrarDispositivo
  };
})();
