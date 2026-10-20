/* ===================== ARCANO TIENDA \u2014 DATA LAYER (read-only) ===================== */
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyBvuJusx4_FvAdXhBl89VVlCicNb-yrdzo",
  authDomain: "arcano-6788d.firebaseapp.com",
  databaseURL: "https://arcano-6788d-default-rtdb.firebaseio.com",
  projectId: "arcano-6788d",
  storageBucket: "arcano-6788d.appspot.com",
  messagingSenderId: "544197982462",
  appId: "1:544197982462:web:4e8d7e3e4a9e7c6c7b3a2d"
};
var FB_PATH = 'arcano/db';
var _sDb = null;
var _sReady = false;
var _sListeners = [];

function initTienda() {
  return new Promise(function(resolve) {
    firebase.initializeApp(FIREBASE_CONFIG);
    // Only load what the store needs: especias, blends, packs, tiendaConfig, colecciones
    // + insumos para cálculo de disponibilidad por producción (especias + frascos + bolsas + cintas + stickers + cajas)
    var neededPaths = ['especias', 'blends', 'packs', 'tiendaConfig', 'colecciones', 'stockEnvases', 'stockBolsas', 'stockCintas', 'stockCajas', 'stickers'];
    var loaded = 0;
    _sDb = {};

    // === CACHE LOCAL: cargar datos cacheados instant\u00E1neamente ===
    var CACHE_KEY = 'arcano_tienda_cache';
    var CACHE_TTL = 2 * 60 * 1000; // 2 minutos (antes 5) para ver cambios mas rapido
    var cacheValid = false;
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached.timestamp && (Date.now() - cached.timestamp) < CACHE_TTL) {
        // Cache v\u00E1lido por 2 minutos
        for (var cp = 0; cp < neededPaths.length; cp++) {
          var path = neededPaths[cp];
          if (cached[path]) {
            _sDb[path] = cached[path];
          }
        }
        if (_sDb.especias && _sDb.blends) {
          _sReady = true;
          _injectSEO();
          _notifyListeners();
          // Render inmediato con datos cacheados
          resolve();
          cacheValid = true;
        }
      }
    } catch(e) {}

    function checkReady() {
      loaded++;
      if (loaded >= neededPaths.length) {
        if (_sDb.especias && _sDb.blends) { _sReady = true; }
        _injectSEO();
        _notifyListeners();
        if (!cacheValid) resolve();
        // Guardar cache
        try {
          var toCache = { timestamp: Date.now() };
          for (var sp = 0; sp < neededPaths.length; sp++) {
            toCache[neededPaths[sp]] = _sDb[neededPaths[sp]];
          }
          localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
        } catch(e) {}
      }
    }

    // Listeners realtime + initial read
    for (var p = 0; p < neededPaths.length; p++) {
      (function(path) {
        firebase.database().ref(FB_PATH + '/' + path).on('value', function(snap) {
          _sDb[path] = snap.val() || {};
          if (!_sReady && _sDb.especias && _sDb.blends) { _sReady = true; }
          _notifyListeners();
        });
        firebase.database().ref(FB_PATH + '/' + path).once('value', function(snap) {
          _sDb[path] = snap.val() || {};
          checkReady();
        }).catch(function() { checkReady(); });
      })(neededPaths[p]);
    }
  });
}

function _notifyListeners() {
  for (var i = 0; i < _sListeners.length; i++) { try { _sListeners[i](); } catch(e) {} }
}

function onTiendaChange(fn) { _sListeners.push(fn); }

/* === SEO: JSON-LD fallback (only if no static prerender) === */
var _seoInjected = false;
function _injectSEO() {
  if (_seoInjected) return;
  var products = getStoreProducts();
  if (!products.length) return;
  var existingLd = document.querySelectorAll('script[type="application/ld+json"]');
  var hasStaticProducts = false;
  for (var k = 0; k < existingLd.length; k++) {
    try {
      var parsed = JSON.parse(existingLd[k].textContent);
      if (parsed['@type'] === 'ItemList' && parsed.itemListElement && parsed.itemListElement.length > 0) {
        hasStaticProducts = true; break;
      }
    } catch(e) {}
  }
  if (hasStaticProducts) { _seoInjected = true; return; }
  _seoInjected = true;
  var SITE_URL = 'https://arcanoespecias.github.io/';
  var jsonLdProducts = [];
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var precio = p.precioChico > 0 ? p.precioChico : p.precioGrande;
    var inStock = (p.stockChico > 0 || p.stockGrande > 0 || p.stock > 0);
    var entry = {
      '@type': 'Product', 'name': p.nombre,
      'description': p.descripcion || ('Blend artesanal ' + p.nombre + ' de Arcano Especias'),
      'brand': { '@type': 'Brand', 'name': 'Arcano Especias' },
      'offers': { '@type': 'Offer', 'price': String(precio), 'priceCurrency': 'COP',
        'availability': inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        'seller': { '@type': 'Organization', 'name': 'Arcano Especias' } }
    };
    jsonLdProducts.push(entry);
  }
  var itemList = { '@context': 'https://schema.org', '@type': 'ItemList', 'name': 'Catalogo Arcano Especias', 'numberOfItems': jsonLdProducts.length, 'itemListElement': jsonLdProducts };
  var scriptEl = document.createElement('script');
  scriptEl.type = 'application/ld+json';
  scriptEl.textContent = JSON.stringify(itemList);
  document.head.appendChild(scriptEl);
}

/* === PEDIDOS (write) === */
var _pedidosRef = null;
var _clientesRef = null;

/**
 * Normaliza un telefono WhatsApp a formato internacional colombiano sin '+':
 * - Quita espacios, guiones, parentesis
 * - Si empieza con '+' lo saca
 * - Si empieza con '57' lo deja asi
 * - Si tiene 10 digitos y empieza con 3 (celular CO) le antepone '57'
 */
function _normalizeWhatsapp(tel) {
  if (!tel) return '';
  var t = String(tel).replace(/[^\d]/g, '');
  if (!t) return '';
  if (t.indexOf('57') === 0 && t.length >= 12) return t;
  if (t.length === 10 && t.indexOf('3') === 0) return '57' + t;
  if (t.length === 11 && t.indexOf('0') === 0) return '57' + t.substring(1);
  return t;
}

/**
 * Upsert de cliente por WhatsApp.
 * - Busca por telefono normalizado. Si existe, actualiza datos si hay cambios.
 * - Si no existe, lo crea.
 * - Devuelve { id, isNew } para que el caller vincule el pedido.
 */
function upsertCliente(cliente) {
  return new Promise(function(resolve, reject) {
    if (!_clientesRef) _clientesRef = firebase.database().ref('arcano/db/clientes');
    var tel = _normalizeWhatsapp(cliente.telefono);
    if (!tel) { reject(new Error('Telefono invalido')); return; }
    _clientesRef.orderByChild('telNorm').equalTo(tel).limitToFirst(1).once('value', function(snap) {
      var data = snap.val();
      var key = null;
      var existing = null;
      if (data) { key = Object.keys(data)[0]; existing = data[key]; }
      var updates = {};
      var now = new Date().toISOString();
      if (!existing) {
        // Cliente nuevo
        var newRef = _clientesRef.push();
        key = newRef.key;
        updates = {
          nombre: cliente.nombre || '',
          telefono: cliente.telefono || '',
          telNorm: tel,
          email: cliente.email || '',
          ciudad: cliente.ciudad || '',
          direccion: cliente.direccion || '',
          creado: now,
          ultimoPedido: now,
          totalPedidos: 1
        };
        newRef.set(updates, function(err) {
          if (err) reject(err); else resolve({ id: key, isNew: true });
        });
      } else {
        // Cliente existente: actualizar datos si vinieron en el pedido
        updates.nombre = cliente.nombre || existing.nombre || '';
        updates.email = cliente.email || existing.email || '';
        updates.ciudad = cliente.ciudad || existing.ciudad || '';
        updates.direccion = cliente.direccion || existing.direccion || '';
        updates.ultimoPedido = now;
        updates.totalPedidos = (existing.totalPedidos || 0) + 1;
        _clientesRef.child(key).update(updates, function(err) {
          if (err) reject(err); else resolve({ id: key, isNew: false });
        });
      }
    }, function(err) { reject(err); });
  });
}

/**
 * ETAPA 3 — Envía el pedido al servidor /api/pedido en vez de escribir directo en Firebase.
 * El servidor valida precios, calcula envío, hace upsert del cliente y crea el pedido.
 * Devuelve el pedido ID REAL (el mismo que ve el admin).
 */
function submitOrder(orderData) {
  // Extraer ciudad del envío o del cliente
  var ciudad = (orderData.cliente && orderData.cliente.ciudad) || '';
  var payload = {
    cliente: orderData.cliente || {},
    items: orderData.items || [],
    ciudad: ciudad,
    notas: orderData.notas || ''
  };
  return fetch('/api/pedido', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) throw new Error(data.error || 'No se pudo crear el pedido');
    // Marcar carrito como convertido en tracking
    markCarritoAsConverted();
    // Construir objeto de retorno compatible con el código viejo
    var savedOrder = Object.assign({}, orderData);
    savedOrder.pedidoId = data.pedidoId;
    savedOrder.clienteId = data.clienteId;
    savedOrder.clienteNuevo = data.clienteNuevo;
    // El servidor recalculó total, subtotal y envío — usamos esos valores (server authority)
    if (typeof data.total === 'number') savedOrder.total = data.total;
    if (typeof data.envioCosto === 'number') {
      if (!savedOrder.envio) savedOrder.envio = {};
      savedOrder.envio.costo = data.envioCosto;
      savedOrder.envio.gratis = !!data.envioGratis;
    }
    savedOrder.creado = new Date().toISOString();
    savedOrder.estado = 'nuevo';
    return savedOrder;
  });
}

/**
 * Notifica al admin por Web Push (llama a /api/notify-admin en Cloudflare)
 * - No bloquea el flujo del checkout (fire and forget)
 * - Usa sendBeacon para que se ejecute incluso si el usuario cierra la pestaña
 */
function _notifyAdminPush(orderData, evento) {
  // Mantener compatibilidad: redirige a _notifyAdminEmail
  try {
    var cliente = orderData.cliente || {};
    var nombreCliente = cliente.nombre || 'Cliente';
    var total = orderData.total || 0;
    var nItems = (orderData.items || []).length;
    var titulo = '🛒 Nuevo pedido';
    var mensaje = nombreCliente + ' — $' + total.toLocaleString('es-CO') + ' — ' + nItems + ' producto(s)';
    _notifyAdminEmail(titulo, mensaje, evento || 'pedido');
  } catch (e) {
    console.warn('[Notif] Error:', e);
  }
}

/**
 * Envía notificación por email al admin (vía /api/notify-admin → Resend)
 * No bloquea el flujo (fire and forget con keepalive).
 */
function _notifyAdminEmail(titulo, mensaje, evento) {
  try {
    var payload = {
      evento: evento || 'generico',
      titulo: titulo,
      mensaje: mensaje,
      data: { url: '/admin/' }
    };
    fetch('/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function(e) {
      console.warn('[Notif] No se pudo enviar email:', e);
    });
  } catch (e) {
    console.warn('[Notif] Error:', e);
  }
}

/* === CLIENTES (sesion + historial) === */
var CLIENTE_SESSION_KEY = 'arcano_cliente_session';

/**
 * Guarda sesion local del cliente (solo telefono + nombre, NO OTP).
 * Esto permite autocompletar el checkout en futuras visitas.
 */
function saveClienteSession(cliente) {
  try {
    var session = {
      id: cliente.id || null,
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      telNorm: _normalizeWhatsapp(cliente.telefono),
      email: cliente.email || '',
      ciudad: cliente.ciudad || '',
      direccion: cliente.direccion || '',
      loggedAt: Date.now()
    };
    localStorage.setItem(CLIENTE_SESSION_KEY, JSON.stringify(session));
  } catch (e) {}
}

function getClienteSession() {
  try {
    var raw = localStorage.getItem(CLIENTE_SESSION_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    // Expira en 30 dias
    if (s.loggedAt && (Date.now() - s.loggedAt) > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(CLIENTE_SESSION_KEY);
      return null;
    }
    return s;
  } catch (e) { return null; }
}

function clearClienteSession() {
  try { localStorage.removeItem(CLIENTE_SESSION_KEY); } catch (e) {}
}

/**
 * Registra o actualiza un cliente solo con WhatsApp + nombre.
 * Sin OTP, sin verificaci\u00F3n \u2014 el cliente queda logueado directamente.
 * Si el cliente ya existe, actualiza el nombre si vino nuevo.
 * Devuelve los datos del cliente para crear sesi\u00F3n local.
 */
function registrarCliente(telefono, nombre) {
  return new Promise(function(resolve, reject) {
    var tel = _normalizeWhatsapp(telefono);
    if (!tel) { reject(new Error('Tel\u00E9fono inv\u00E1lido. Ingresa tu n\u00FAmero de WhatsApp con c\u00F3digo de pa\u00EDs.')); return; }
    if (!nombre || !nombre.trim()) { reject(new Error('Ingresa tu nombre')); return; }
    if (!_clientesRef) _clientesRef = firebase.database().ref('arcano/db/clientes');
    _clientesRef.orderByChild('telNorm').equalTo(tel).limitToFirst(1).once('value', function(snap) {
      var data = snap.val();
      var now = new Date().toISOString();
      if (data) {
        // Cliente existente: actualizar ultimoLogin
        var key = Object.keys(data)[0];
        var cliente = data[key];
        var updates = { ultimoLogin: now };
        // Si el nombre cambi\u00F3, actualizarlo
        if (nombre && nombre.trim() && (!cliente.nombre || cliente.nombre !== nombre.trim())) {
          updates.nombre = nombre.trim();
        }
        _clientesRef.child(key).update(updates, function(err) {
          if (err) reject(err);
          else resolve({
            id: key,
            nombre: cliente.nombre || nombre,
            telefono: cliente.telefono || telefono,
            email: cliente.email || '',
            ciudad: cliente.ciudad || '',
            direccion: cliente.direccion || '',
            totalPedidos: cliente.totalPedidos || 0,
            creado: cliente.creado || now,
            esNuevo: false
          });
        });
      } else {
        // Cliente nuevo: crear
        var newRef = _clientesRef.push();
        var newKey = newRef.key;
        var newCliente = {
          nombre: nombre.trim(),
          telefono: telefono,
          telNorm: tel,
          email: '',
          ciudad: '',
          direccion: '',
          creado: now,
          ultimoLogin: now,
          totalPedidos: 0
        };
        newRef.set(newCliente, function(err) {
          if (err) reject(err);
          else {
            // Notificar al admin por email si es cliente nuevo
            _notifyAdminEmail(
              '\u{1F464} Nuevo cliente registrado',
              nombre.trim() + ' se acaba de registrar con WhatsApp ' + telefono + '. Ya puede hacer pedidos en la tienda.',
              'cliente_nuevo'
            );
            resolve({
              id: newKey,
              nombre: nombre.trim(),
              telefono: telefono,
              email: '',
              ciudad: '',
              direccion: '',
              totalPedidos: 0,
              creado: now,
              esNuevo: true
            });
          }
        });
      }
    }, function(err) { reject(err); });
  });
}

/**
 * Genera un OTP de 6 digitos y lo guarda en Firebase con expiracion 10 min.
 * Si el cliente no existe, lo crea autom\u00E1ticamente (registro nuevo).
 * Si existe, usa el cliente existente.
 * NO devuelve el c\u00F3digo al frontend (UX: el cliente no debe ver el c\u00F3digo,
 * solo recibirlo por WhatsApp desde el admin).
 * Tambi\u00E9n encola el OTP en arcano/db/otpPendientes para que el admin
 * lo vea y lo env\u00EDe por WhatsApp manualmente.
 */
/**
 * ETAPA 3 — Solicita un OTP al servidor /api/cuenta.
 * El código NO se devuelve al frontend; el admin lo envía por WhatsApp.
 */
function requestClienteOTP(telefono, nombreOpt) {
  return fetch('/api/cuenta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'otp', telefono: telefono, nombre: nombreOpt || '' })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) throw new Error(data.error || 'No se pudo generar el código');
    // Guardar otpKey localmente para usarlo en verify
    try {
      localStorage.setItem('arcano_otp_key', data.otpKey);
      localStorage.setItem('arcano_otp_phone', _normalizeWhatsapp(telefono));
    } catch (e) {}
    return {
      otpKey: data.otpKey,
      clienteKey: data.clienteKey,
      telefono: telefono,
      nombre: data.nombre,
      esNuevo: data.clienteNuevo,
      mensaje: data.mensaje || ''
    };
  });
}

/**
 * ETAPA 3 — Verifica el OTP en el servidor /api/cuenta.
 * Devuelve los datos del cliente + sessionToken para futuras consultas.
 */
function verifyClienteOTP(telefono, codigoIngresado) {
  var otpKey = null;
  try { otpKey = localStorage.getItem('arcano_otp_key'); } catch (e) {}
  if (!otpKey) {
    return Promise.reject(new Error('No hay código pendiente. Solicitá uno nuevo.'));
  }
  return fetch('/api/cuenta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'verify', otpKey: otpKey, codigo: codigoIngresado })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) throw new Error(data.error || 'Código incorrecto');
    // Limpiar otpKey, guardar sessionToken
    try {
      localStorage.removeItem('arcano_otp_key');
      localStorage.setItem('arcano_session_token', data.sessionToken);
      localStorage.setItem('arcano_session_expiry', String(data.sessionExpiry));
      localStorage.setItem('arcano_verified_phone', _normalizeWhatsapp(telefono));
    } catch (e) {}
    return data.cliente;
  });
}

/**
 * ETAPA 3 — Obtiene los pedidos del cliente autenticado vía /api/cuenta.
 * Requiere sessionToken válido (obtenido al verificar OTP).
 */
function getClientePedidos(clienteId) {
  var sessionToken = null;
  try { sessionToken = localStorage.getItem('arcano_session_token'); } catch (e) {}
  if (!sessionToken) {
    return Promise.reject(new Error('Sesión expirada. Volvé a ingresar tu código.'));
  }
  return fetch('/api/cuenta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pedidos', sessionToken: sessionToken, clienteId: clienteId })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (!data.ok) throw new Error(data.error || 'No se pudo obtener el historial');
    return data.pedidos || [];
  });
}

/* === PROMOCIONES (read-only para clientes) === */
var _promocionesRef = null;

/**
 * Devuelve las promociones activas vigentes para clientes.
 * Filtro: activa=true Y (fechaInicio <= ahora <= fechaFin O sin fechas).
 */
function getPromocionesActivas() {
  return new Promise(function(resolve, reject) {
    if (!_promocionesRef) _promocionesRef = firebase.database().ref('arcano/db/promociones');
    _promocionesRef.once('value', function(snap) {
      var data = snap.val();
      var promos = [];
      var now = Date.now();
      if (data) {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          var promo = data[keys[i]];
          if (!promo || promo.activa === false) continue;
          // Validar vigencia
          if (promo.fechaInicio && new Date(promo.fechaInicio).getTime() > now) continue;
          if (promo.fechaFin && new Date(promo.fechaFin).getTime() < now) continue;
          promo._key = keys[i];
          promos.push(promo);
        }
      }
      // Ordenar: destacadas primero, luego por fecha de creacion desc
      promos.sort(function(a, b) {
        if ((a.destacada ? 1 : 0) !== (b.destacada ? 1 : 0)) return (b.destacada ? 1 : 0) - (a.destacada ? 1 : 0);
        return (b.creado || '').localeCompare(a.creado || '');
      });
      resolve(promos);
    }, function(err) { reject(err); });
  });
}

/* === CARRITOS (tracking de carritos abandonados) === */
var _carritosRef = null;
var _carritoTrackingTimer = null;
var _carritoTrackingKey = null;

/**
 * Guarda o actualiza el carrito del cliente en Firebase para tracking.
 * Si clienteId es null, usa una key anonima persistida en localStorage.
 * Se llama periodicamente (cada 60s) y al cerrar la pagina.
 */
function saveCarritoTracking(cart, clienteId, clienteData) {
  return new Promise(function(resolve, reject) {
    if (!_carritosRef) _carritosRef = firebase.database().ref('arcano/db/carritos');
    if (!cart || cart.length === 0) {
      // Si el carrito esta vacio y existe una key, marcar como convertido o eliminar
      if (_carritoTrackingKey) {
        _carritosRef.child(_carritoTrackingKey).update({
          estado: 'vacio',
          actualizado: new Date().toISOString()
        }, function() { resolve(); });
      } else { resolve(); }
      return;
    }
    var now = new Date().toISOString();
    if (!_carritoTrackingKey) {
      // Crear nuevo carrito tracking
      var newRef = _carritosRef.push();
      _carritoTrackingKey = newRef.key;
      try { localStorage.setItem('arcano_carrito_key', _carritoTrackingKey); } catch(e) {}
      var data = {
        items: cart,
        total: cart.reduce(function(s, c) { return s + (c.precio * c.qty); }, 0),
        itemCount: cart.reduce(function(s, c) { return s + c.qty; }, 0),
        clienteId: clienteId || null,
        cliente: clienteData || null,
        creado: now,
        actualizado: now,
        estado: 'activo'
      };
      newRef.set(data, function(err) { if (err) reject(err); else resolve(); });
    } else {
      // Actualizar carrito existente
      var updates = {
        items: cart,
        total: cart.reduce(function(s, c) { return s + (c.precio * c.qty); }, 0),
        itemCount: cart.reduce(function(s, c) { return s + c.qty; }, 0),
        clienteId: clienteId || null,
        cliente: clienteData || null,
        actualizado: now,
        estado: 'activo'
      };
      _carritosRef.child(_carritoTrackingKey).update(updates, function(err) { if (err) reject(err); else resolve(); });
    }
  });
}

/**
 * Marca el carrito como convertido (se completo el pedido).
 * Se llama desde submitOrder tras exito.
 */
function markCarritoAsConverted() {
  return new Promise(function(resolve) {
    if (!_carritosRef || !_carritoTrackingKey) { resolve(); return; }
    _carritosRef.child(_carritoTrackingKey).update({
      estado: 'convertido',
      convertidoEn: new Date().toISOString()
    }, function() {
      _carritoTrackingKey = null;
      try { localStorage.removeItem('arcano_carrito_key'); } catch(e) {}
      resolve();
    });
  });
}

/**
 * Inicia el tracking automatico del carrito. Llamar al cargar la tienda.
 * Guarda el carrito cada 60s y al detectar cambios.
 */
function initCarritoTracking(getCartFn, getClienteSessionFn) {
  // Restaurar key previa si existe
  try {
    _carritoTrackingKey = localStorage.getItem('arcano_carrito_key') || null;
  } catch(e) { _carritoTrackingKey = null; }
  // Tracking periodico
  if (_carritoTrackingTimer) clearInterval(_carritoTrackingTimer);
  _carritoTrackingTimer = setInterval(function() {
    try {
      var cartItems = getCartFn();
      if (!cartItems || cartItems.length === 0) return; // skip empty carts
      var s = getClienteSessionFn ? getClienteSessionFn() : null;
      saveCarritoTracking(cartItems, s && s.id, s).catch(function() {});
    } catch(e) {}
  }, 60000);
  // Guardar al salir de la pagina
  window.addEventListener('beforeunload', function() {
    try {
      var s = getClienteSessionFn ? getClienteSessionFn() : null;
      // Marcar como abandonado si no se completo en 30 min
      if (_carritoTrackingKey && getCartFn().length > 0) {
        saveCarritoTracking(getCartFn(), s && s.id, s).then(function() {
          if (_carritosRef && _carritoTrackingKey) {
            _carritosRef.child(_carritoTrackingKey).update({ estado: 'abandonado' });
          }
        }).catch(function() {});
      }
    } catch(e) {}
  });
}

/* === CONFIG === */
function getTiendaConfig() {
  if (!_sDb) return {};
  return _sDb.tiendaConfig || {};
}

/* === FIX DE URLs: reemplazar dominio viejo por nuevo en im\u00E1genes === */
function _fixImageUrl(url, updatedAt) {
  if (!url) return '';
  // Si es base64, devolverla tal cual (ya está lista para usar)
  if (url.indexOf('data:image') === 0) return url;
  // Reemplazar dominio viejo
  var fixed = url.replace(/https?:\/\/arcanoespecias\.github\.io/g, 'https://arcanoespecias.com');
  // Cache-busting: si la imagen fue actualizada recientemente, agregar ?v=timestamp
  if (updatedAt && (Date.now() - updatedAt) < 24 * 60 * 60 * 1000) {
    var separator = fixed.indexOf('?') >= 0 ? '&' : '?';
    fixed = fixed + separator + 'v=' + updatedAt;
  }
  return fixed;
}

function getStoreProducts() {
  if (!_sDb) return [];
  var products = [];
  var ek = Object.keys(_sDb.especias || {});
  for (var i = 0; i < ek.length; i++) {
    var e = _sDb.especias[ek[i]];
    if (!e || !e.enTienda) continue;
    var eUpdated = e.imagenUpdatedAt || e.actualizadoEn || e.creado || 0;
    if (typeof eUpdated === 'string') eUpdated = new Date(eUpdated).getTime() || 0;
    // NORMALIZAR ID a numero (algunos especias vinieron de Excel como string)
    var eId = Number(e.id);
    if (isNaN(eId)) eId = e.id;
    // Calcular disponibilidad ampliada (stock + posibilidad de producción)
    var dispChico = _disponibilidadProducto('especia', e, 'chico');
    var dispGrande = _disponibilidadProducto('especia', e, 'grande');
    products.push({
      id: eId, tipo: 'especia', _origId: e.id,
      nombre: e.nombre, categoria: e.categoria || 'Comidas', categorias: e.categorias || [e.categoria || 'Comidas'],
      precioChico: Number(e.precioTiendaChico) || Number(e.precioChico) || 0,
      precioGrande: Number(e.precioTiendaGrande) || Number(e.precioGrande) || 0,
      stockChico: e.stockChico || 0, stockGrande: e.stockGrande || 0, stockPala: e.stockBolsa || 0, enBlend: e.enBlend !== false,
      _disponibleChico: dispChico.disponible,
      _disponibleGrande: dispGrande.disponible,
      _producibleChico: dispChico.producible,
      _producibleGrande: dispGrande.producible,
      region: '', uso: e.uso || '', descripcion: e.descripcion || '', imagen: _fixImageUrl(e.imagen, eUpdated), tags: e.tags || []
    });
  }
  var bk = Object.keys(_sDb.blends || {});
  for (var i = 0; i < bk.length; i++) {
    var b = _sDb.blends[bk[i]];
    if (!b || !b.enTienda) continue;
    var bUpdated = b.imagenUpdatedAt || b.actualizadoEn || b.creado || 0;
    if (typeof bUpdated === 'string') bUpdated = new Date(bUpdated).getTime() || 0;
    // NORMALIZAR ID a numero (algunos blends vinieron de Excel como string)
    var bId = Number(b.id);
    if (isNaN(bId)) bId = b.id;
    var dispChicoB = _disponibilidadProducto('blend', b, 'chico');
    var dispGrandeB = _disponibilidadProducto('blend', b, 'grande');
    products.push({
      id: bId, tipo: 'blend', _origId: b.id,
      nombre: b.nombre, categoria: b.categoria || 'Comidas', categorias: b.categorias || [b.categoria || 'Comidas'],
      precioChico: Number(b.precioTiendaChico) || Number(b.precioChico) || 0,
      precioGrande: Number(b.precioTiendaGrande) || Number(b.precioGrande) || 0,
      stockChico: b.stockChico || 0, stockGrande: b.stockGrande || 0,
      _disponibleChico: dispChicoB.disponible,
      _disponibleGrande: dispGrandeB.disponible,
      _producibleChico: dispChicoB.producible,
      _producibleGrande: dispGrandeB.producible,
      region: b.region || '', uso: b.uso || '', descripcion: b.descripcion || '', imagen: _fixImageUrl(b.imagen, bUpdated), tags: b.tags || [],
      ingredientes: b.ingredientes || []
    });
  }
  var pkKeys = Object.keys(_sDb.packs || {});
  for (var pi = 0; pi < pkKeys.length; pi++) {
    var pk = _sDb.packs[pkKeys[pi]];
    if (!pk || !pk.enTienda) continue;
    // Packs: si no hay stock definido (null/0), asumimos que está disponible
    // para venta (los packs se arman al momento del pedido).
    // Solo se filtra si stock fue explícitamente seteado en 0.
    var packStock = pk.stock;
    if (packStock === null || packStock === undefined || packStock === 0) {
      packStock = 999;  // stock "ilimitado" si no se maneja stock de packs
    }
    // Disponibilidad ampliada para packs: necesita stock de blends que lo componen
    // Y al menos 1 caja de madera + 1 bolsa + 1 cinta para armarlo
    var packTalla = (pk.configTalla === 'grande') ? 'grande' : 'chico';
    var packDisponible = packStock > 0;
    var packProducible = false;
    // Validar insumos de packaging del pack (caja + bolsa + cinta)
    if (packDisponible) {
      var cajasDisp = Number(_sDb.stockCajas) || 0;
      var bolsasDisp = (_sDb.stockBolsas && Number(_sDb.stockBolsas[packTalla])) || 0;
      var cintasDisp = Number(_sDb.stockCintas) || 0;
      // Validar también stock de cada blend que compone el pack
      var blendItems = pk.blendItems || [];
      var blendsOk = blendItems.length > 0;
      for (var bi2 = 0; bi2 < blendItems.length; bi2++) {
        var bi3 = blendItems[bi2];
        var bl3 = _sDb.blends ? _sDb.blends[bi3.blendId] : null;
        if (!bl3) { blendsOk = false; break; }
        var st = bi3.talla === 'grande' ? (bl3.stockGrande || 0) : (bl3.stockChico || 0);
        if (st < 1) { blendsOk = false; break; }
      }
      packProducible = (cajasDisp > 0 && bolsasDisp > 0 && cintasDisp > 0 && blendsOk);
    }
    var pkUpdated = pk.imagenUpdatedAt || pk.actualizadoEn || pk.creado || 0;
    if (typeof pkUpdated === 'string') pkUpdated = new Date(pkUpdated).getTime() || 0;
    products.push({
      id: pk.id, nombre: pk.nombre, tipo: 'pack', categoria: 'Packs', categorias: ['Packs'],
      precioChico: 0, precioGrande: 0, precio: Number(pk.precio) || 0,
      stockChico: 0, stockGrande: 0, stock: packStock,
      _disponibleChico: packDisponible,
      _disponibleGrande: packDisponible,
      _producibleChico: packProducible,
      _producibleGrande: packProducible,
      region: '', uso: '', descripcion: pk.descripcion || '', imagen: _fixImageUrl(pk.imagen, pkUpdated), tags: pk.tags || [],
      blendItems: pk.blendItems || [],
      configurable: pk.configurable || false,
      blendCount: pk.blendCount || 0,
      configTalla: pk.configTalla || 'chico'
    });
  }
  return products.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
}

/* === DISPONIBILIDAD AMPLIADA POR PRODUCCIÓN ===
 *
 * Un producto (chico o grande) se considera "disponible para la tienda" si:
 *   1. Tiene stock ya producido > 0 (stockChico / stockGrande > 0), O
 *   2. Puede producirse con los insumos actuales:
 *      - Especias suficientes (stockBolsa >= gramos necesarios para 1 frasco)
 *      - Frascos (envases) disponibles > 0
 *      - Bolsas disponibles > 0
 *      - Cintas disponibles > 0
 *      - Sticker del producto con stock > 0
 *
 * Para blends: la receta está en ingredientes[].gramosChico/gramosGrande.
 * Para especias individuales: la cantidad necesaria está en gramosChico/gramosGrande.
 *
 * Retorna: { disponible: bool, producible: bool, faltantes: [string] }
 *   - disponible = true si hay stock > 0 OR producible = true
 *   - producible = true si todos los insumos necesarios están disponibles
 *   - faltantes = lista de insumos faltantes (para tooltip informativo)
 */
function _disponibilidadProducto(tipo, producto, talla) {
  var result = { disponible: false, producible: false, faltantes: [] };

  // 1. Stock ya producido
  var stockActual = (talla === 'grande')
    ? (Number(producto.stockGrande) || 0)
    : (Number(producto.stockChico) || 0);
  if (stockActual > 0) {
    result.disponible = true;
    // Ya hay stock producido; no hace falta validar insumos
    return result;
  }

  // 2. Validar insumos para producir al menos 1 frasco
  // 2a. Especias necesarias
  if (tipo === 'especia') {
    var gramosNecesarios = (talla === 'grande')
      ? (Number(producto.gramosGrande) || 0)
      : (Number(producto.gramosChico) || 0);
    if (gramosNecesarios <= 0) {
      // No tiene receta definida; no es producilbe
      result.faltantes.push('gramos ' + talla + ' no definidos');
      return result;
    }
    var stockBolsa = Number(producto.stockBolsa) || 0;
    if (stockBolsa < gramosNecesarios) {
      result.faltantes.push('especia (quedan ' + stockBolsa + 'g, faltan ' + gramosNecesarios + 'g)');
      return result;
    }
  } else if (tipo === 'blend') {
    var ings = producto.ingredientes || [];
    if (!ings.length) {
      result.faltantes.push('receta sin ingredientes');
      return result;
    }
    for (var i = 0; i < ings.length; i++) {
      var ing = ings[i];
      var g = (talla === 'grande')
        ? (Number(ing.gramosGrande) || 0)
        : (Number(ing.gramosChico) || 0);
      if (g <= 0) continue; // ingrediente sin peso para esta talla
      var esp = _sDb.especias ? _sDb.especias[ing.especiaId] : null;
      if (!esp) {
        // Buscar por id numérico también
        if (_sDb.especias) {
          for (var k in _sDb.especias) {
            if (String(_sDb.especias[k].id) === String(ing.especiaId)) { esp = _sDb.especias[k]; break; }
          }
        }
      }
      if (!esp) {
        result.faltantes.push('especia ' + (ing.especiaNombre || ing.especiaId) + ' no encontrada');
        return result;
      }
      var sb = Number(esp.stockBolsa) || 0;
      if (sb < g) {
        result.faltantes.push((ing.especiaNombre || ing.especiaId) + ' (quedan ' + sb + 'g, faltan ' + g + 'g)');
        return result;
      }
    }
  } else {
    // Packs: no se validan insumos (se arman al momento del pedido)
    return result;
  }

  // 2b. Frascos (envases)
  var envases = _sDb.stockEnvases || { chico: 0, grande: 0 };
  var envDisp = (talla === 'grande')
    ? (Number(envases.grande) || 0)
    : (Number(envases.chico) || 0);
  if (envDisp <= 0) {
    result.faltantes.push('frascos ' + talla);
    return result;
  }

  // 2c. Bolsas
  var bolsas = _sDb.stockBolsas || { chico: 0, grande: 0 };
  var bolDisp = (talla === 'grande')
    ? (Number(bolsas.grande) || 0)
    : (Number(bolsas.chico) || 0);
  if (bolDisp <= 0) {
    result.faltantes.push('bolsas ' + talla);
    return result;
  }

  // 2d. Cintas
  var cintas = Number(_sDb.stockCintas) || 0;
  if (cintas <= 0) {
    result.faltantes.push('cintas');
    return result;
  }

  // 2e. Sticker del producto (match por nombre exacto)
  var stkStock = 0;
  if (_sDb.stickers) {
    var stkKeys = Object.keys(_sDb.stickers);
    for (var j = 0; j < stkKeys.length; j++) {
      var st = _sDb.stickers[stkKeys[j]];
      if (st && st.nombre === producto.nombre) {
        stkStock = (talla === 'grande')
          ? (Number(st.stockGrande) || 0)
          : (Number(st.stockChico) || 0);
        break;
      }
    }
  }
  if (stkStock <= 0) {
    result.faltantes.push('sticker ' + talla);
    return result;
  }

  // Todos los insumos están disponibles
  result.producible = true;
  result.disponible = true;
  return result;
}

/* === RECETAS (read, lazy) === */
var _recetas = [];
var _recetasReady = false;
var _recetasListeners = [];
var _recetasInited = false;

function initRecetas() {
  if (_recetasInited) return;
  _recetasInited = true;
  var recetasRef = firebase.database().ref('arcano/db/recetas').orderByChild('fecha');
  recetasRef.on('value', function(snap) {
    var data = snap.val();
    _recetas = [];
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var r = data[keys[i]]; r._key = keys[i]; _recetas.push(r);
      }
    }
    _recetas.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    _recetasReady = true;
    for (var j = 0; j < _recetasListeners.length; j++) { try { _recetasListeners[j](_recetas); } catch(e) {} }
  });
}

function getRecetas() { return _recetas; }

function onRecetasReady(cb) {
  if (_recetasReady) { cb(_recetas); return; }
  _recetasListeners.push(cb);
}

/* === BLOG (read, lazy) === */
var _blogPosts = [];
var _blogReady = false;
var _blogListeners = [];
var _blogCatFilter = 'Todos';
var _blogInited = false;

function initBlog() {
  if (_blogInited) return;
  _blogInited = true;
  // IMPORTANTE: No usar orderByChild('fecha') porque requiere index en Firebase rules
  // Hacemos el sort en JS despues de recibir los datos
  var ref = firebase.database().ref('arcano/db/blog');
  ref.on('value', function(snap) {
    var d = snap.val();
    _blogPosts = [];
    var ahora = Date.now();
    if (d) {
      var keys = Object.keys(d);
      for (var i = 0; i < keys.length; i++) {
        var p = d[keys[i]]; p._key = keys[i];
        // Filtros:
        // 1. Pausado → no mostrar
        if (p.pausado === true) continue;
        // 2. Programado para el futuro → no mostrar (aun)
        if (p.programado === true && p.fechaPublicacion) {
          var fp = new Date(p.fechaPublicacion).getTime();
          if (!isNaN(fp) && fp > ahora) continue;
        }
        // 3. Borrador (publicado === false explicito, sin programar) → no mostrar
        //    Nota: si publicado es undefined (articulos legacy), se considera publicado
        if (p.publicado === false && p.programado !== true) continue;
        _blogPosts.push(p);
      }
    }
    _blogPosts.sort(function(a, b) { return (b.fechaPublicacion || b.fecha || '').localeCompare(a.fechaPublicacion || a.fecha || ''); });
    _blogReady = true;
    for (var j = 0; j < _blogListeners.length; j++) { try { _blogListeners[j](_blogPosts); } catch(e) {} }
  });
}
function getBlogPosts() {
  if (_blogCatFilter === 'Todos') return _blogPosts;
  return _blogPosts.filter(function(p) { return p.categoria === _blogCatFilter; });
}
function onBlogReady(cb) {
  if (_blogReady) { cb(_blogPosts); return; }
  _blogListeners.push(cb);
}

/* === COLECCI\u00D3N ARCANO === */
function getColeccionCliente(whatsapp) {
  if (!_sDb || !_sDb.colecciones || !whatsapp) return null;
  return _sDb.colecciones[whatsapp] || null;
}
function onColeccionReady(whatsapp, cb) {
  if (_sDb && _sDb.colecciones && _sDb.colecciones[whatsapp]) { cb(_sDb.colecciones[whatsapp]); return; }
  // Listen for when colecciones data arrives
  var checkInterval = setInterval(function() {
    if (_sDb && _sDb.colecciones) {
      clearInterval(checkInterval);
      cb(_sDb.colecciones[whatsapp] || null);
    }
  }, 500);
  // Timeout after 10s
  setTimeout(function() { clearInterval(checkInterval); }, 10000);
}
