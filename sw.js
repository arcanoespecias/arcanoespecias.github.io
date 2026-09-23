const CACHE_NAME = 'arcano-tienda-v6';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/favicon.png',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/arcano-logo.webp',
  '/css/tienda.css',
  '/js/bg-dynamic.js',
  '/js/tienda-data.js',
  '/js/tienda-ui.js'
];

self.addEventListener('install', e => {
  // Cacheo tolerante a fallos: si algún asset falla (404, etc.), no rompe el install
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // addAll falla si UNO solo falla. Usamos Promise.allSettled para que no.
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] No se pudo cachear ' + url + ':', err.message);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// === PUSH NOTIFICATIONS (para el admin, pero con scope / para que funcione en cualquier página) ===
self.addEventListener('push', function(event) {
  console.log('[SW Push] Evento push recibido:', event);
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
    console.log('[SW Push] Data parseada:', data);
  } catch (e) {
    try { data = { mensaje: event.data ? event.data.text() : '' }; } catch (e2) {
      console.error('[SW Push] Error parseando data:', e2);
      data = { mensaje: 'Notificación de Arcano Especias' };
    }
  }

  var titulo = data.titulo || '🔔 Arcano Especias';
  var mensaje = data.mensaje || 'Tienes una nueva notificación';
  var evento = data.evento || 'generico';

  var icon = '/icons/icon-192.png';
  var badge = '/icons/favicon.png';
  var tag = 'arcano-' + evento;
  var vibrate = [200, 100, 200, 100, 400];
  var requireInteraction = false;

  if (evento === 'pedido' || evento === 'test') {
    requireInteraction = true;
    vibrate = [300, 100, 300, 100, 300, 100, 600];
  }

  var options = {
    body: mensaje,
    icon: icon,
    badge: badge,
    tag: tag,
    renotify: true,
    vibrate: vibrate,
    requireInteraction: requireInteraction,
    data: {
      url: data.data && data.data.url ? data.data.url : '/admin/',
      evento: evento,
      timestamp: Date.now()
    }
  };

  console.log('[SW Push] Mostrando notificación:', titulo, mensaje);
  event.waitUntil(
    self.registration.showNotification(titulo, options).then(function() {
      console.log('[SW Push] Notificación mostrada OK');
    }).catch(function(err) {
      console.error('[SW Push] Error mostrando notificación:', err);
    })
  );
});

// === Click en notificación: abrir la página correspondiente ===
self.addEventListener('notificationclick', function(event) {
  console.log('[SW Push] Click en notificación:', event.notification);
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/admin/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes('arcano') && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl).catch(function() {});
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  
  // Firebase: network-first, cache fallback
  if (url.hostname.includes('firebaseio.com')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  
  // JS and CSS files: NETWORK-FIRST (always get latest)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  
  // Static assets (images, etc): CACHE-FIRST
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return resp;
    }))
  );
});
