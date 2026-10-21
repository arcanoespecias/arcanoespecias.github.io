const CACHE_NAME = 'arcano-admin-v3';
const BASE_PATH = '/admin/';
const STATIC_ASSETS = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'icons/favicon.png',
  BASE_PATH + 'icons/icon-192.png',
  BASE_PATH + 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
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

// === PUSH NOTIFICATIONS (recibe aunque la app esté cerrada) ===
self.addEventListener('push', function(event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try { data = { mensaje: event.data ? event.data.text() : '' }; } catch (e2) {}
  }

  var titulo = data.titulo || '🔔 Arcano Especias';
  var mensaje = data.mensaje || 'Tienes una nueva notificación';
  var evento = data.evento || 'generico';

  // Icono y vibración según tipo de evento
  var icon = '/admin/icons/icon-192.png';
  var badge = '/admin/icons/favicon.png';
  var tag = 'arcano-' + evento;
  var vibrate = [200, 100, 200, 100, 400];
  var requireInteraction = false;

  // Para pedidos nuevos, mantener la notificación hasta que el admin interactúe
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

  event.waitUntil(
    self.registration.showNotification(titulo, options)
  );
});

// === Click en notificación: abrir la PWA ===
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/admin/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes('arcano') && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl).catch(function() {});
          }
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir nueva
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// === ETAPA 4 — Periodic Background Sync eliminado ===
// Antes: el SW consultaba Firebase directamente para ver pedidos nuevos.
// Ahora: el servidor /api/notify-admin envía push al admin cuando llega un pedido,
// no hace falta consultar Firebase desde el SW.
// Razón: el SW no puede autenticarse con Firebase Auth del admin (sin token).

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Solo interceptar requests a /admin/ (no interferir con la tienda)
  if (!url.pathname.startsWith('/admin/') && url.pathname !== '/admin') {
    return;
  }

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
