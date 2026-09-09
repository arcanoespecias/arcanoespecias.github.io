/* ===================== ARCANO TIENDA — DATA LAYER (read-only) ===================== */
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
    // Only load what the store needs: especias, blends, packs, tiendaConfig
    var neededPaths = ['especias', 'blends', 'packs', 'tiendaConfig'];
    var loaded = 0;
    _sDb = {};
    function checkReady() {
      loaded++;
      if (loaded >= neededPaths.length) {
        if (_sDb.especias && _sDb.blends) { _sReady = true; }
        _injectSEO();
        for (var i = 0; i < _sListeners.length; i++) { try { _sListeners[i](); } catch(e) {} }
        resolve();
      }
    }
    for (var p = 0; p < neededPaths.length; p++) {
      (function(path) {
        firebase.database().ref(FB_PATH + '/' + path).on('value', function(snap) {
          _sDb[path] = snap.val() || {};
          if (!_sReady && _sDb.especias && _sDb.blends) { _sReady = true; }
          _notifyListeners();
        });
        // Initial read
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

function submitOrder(orderData) {
  return new Promise(function(resolve, reject) {
    if (!_pedidosRef) _pedidosRef = firebase.database().ref('arcano/db/pedidos');
    orderData.creado = new Date().toISOString();
    orderData.estado = 'nuevo';
    // Upsert de cliente antes de guardar el pedido para vincularlo
    if (orderData.cliente && orderData.cliente.telefono) {
      upsertCliente(orderData.cliente).then(function(result) {
        orderData.clienteId = result.id;
        _pedidosRef.push(orderData, function(error) {
          if (error) reject(error); else resolve(orderData);
        });
      }).catch(function(err) {
        // Si falla el upsert, igual guardamos el pedido sin clienteId
        console.warn('[Tienda] upsertCliente fallo, guardando pedido sin vincular:', err);
        _pedidosRef.push(orderData, function(error) {
          if (error) reject(error); else resolve(orderData);
        });
      });
    } else {
      _pedidosRef.push(orderData, function(error) {
        if (error) reject(error); else resolve(orderData);
      });
    }
  });
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
 * Genera un OTP de 6 digitos y lo guarda en Firebase con expiracion 10 min.
 * El admin lo enviaria manualmente por WhatsApp (o un futuro bot).
 * Por ahora se devuelve para que el frontend lo muestre/ envie via wa.me link.
 */
function requestClienteOTP(telefono) {
  return new Promise(function(resolve, reject) {
    var tel = _normalizeWhatsapp(telefono);
    if (!tel) { reject(new Error('Telefono invalido')); return; }
    if (!_clientesRef) _clientesRef = firebase.database().ref('arcano/db/clientes');
    _clientesRef.orderByChild('telNorm').equalTo(tel).limitToFirst(1).once('value', function(snap) {
      var data = snap.val();
      if (!data) { reject(new Error('No encontramos un cliente con ese numero. Haz tu primer pedido para registrarte.')); return; }
      var key = Object.keys(data)[0];
      var cliente = data[key];
      var otp = '';
      for (var i = 0; i < 6; i++) otp += Math.floor(Math.random() * 10);
      var now = Date.now();
      var otpData = { codigo: otp, creado: now, expira: now + 10 * 60 * 1000 };
      _clientesRef.child(key).update({ otp: otpData }, function(err) {
        if (err) reject(err);
        else resolve({ otp: otp, clienteKey: key, telefono: cliente.telefono || telefono, nombre: cliente.nombre || '' });
      });
    }, function(err) { reject(err); });
  });
}

/**
 * Verifica OTP ingresado por el cliente contra el guardado en Firebase.
 * Si OK, devuelve los datos del cliente (sin OTP) para crear sesion.
 */
function verifyClienteOTP(telefono, codigoIngresado) {
  return new Promise(function(resolve, reject) {
    var tel = _normalizeWhatsapp(telefono);
    if (!_clientesRef) _clientesRef = firebase.database().ref('arcano/db/clientes');
    _clientesRef.orderByChild('telNorm').equalTo(tel).limitToFirst(1).once('value', function(snap) {
      var data = snap.val();
      if (!data) { reject(new Error('Cliente no encontrado')); return; }
      var key = Object.keys(data)[0];
      var cliente = data[key];
      if (!cliente.otp || !cliente.otp.codigo) { reject(new Error('No hay codigo activo. Solicita uno nuevo.')); return; }
      if (Date.now() > cliente.otp.expira) { reject(new Error('El codigo expiro. Solicita uno nuevo.')); return; }
      if (String(cliente.otp.codigo) !== String(codigoIngresado).trim()) {
        reject(new Error('Codigo incorrecto')); return;
      }
      // Limpiar OTP usado y devolver datos
      _clientesRef.child(key).update({ otp: null, ultimoLogin: new Date().toISOString() }, function(err) {
        if (err) reject(err);
        else resolve({
          id: key,
          nombre: cliente.nombre || '',
          telefono: cliente.telefono || '',
          email: cliente.email || '',
          ciudad: cliente.ciudad || '',
          direccion: cliente.direccion || '',
          totalPedidos: cliente.totalPedidos || 0,
          creado: cliente.creado || ''
        });
      });
    }, function(err) { reject(err); });
  });
}

/**
 * Obtiene los pedidos de un cliente ordenados por fecha desc.
 */
function getClientePedidos(clienteId) {
  return new Promise(function(resolve, reject) {
    if (!_pedidosRef) _pedidosRef = firebase.database().ref('arcano/db/pedidos');
    _pedidosRef.orderByChild('clienteId').equalTo(clienteId).once('value', function(snap) {
      var data = snap.val();
      var pedidos = [];
      if (data) {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          var p = data[keys[i]];
          p._key = keys[i];
          pedidos.push(p);
        }
      }
      pedidos.sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
      resolve(pedidos);
    }, function(err) { reject(err); });
  });
}

/* === CONFIG === */
function getTiendaConfig() {
  if (!_sDb) return {};
  return _sDb.tiendaConfig || {};
}

function getStoreProducts() {
  if (!_sDb) return [];
  var products = [];
  var ek = Object.keys(_sDb.especias || {});
  for (var i = 0; i < ek.length; i++) {
    var e = _sDb.especias[ek[i]];
    if (!e || !e.enTienda) continue;
    products.push({
      id: e.id, nombre: e.nombre, tipo: 'especia', categoria: e.categoria || 'Comidas', categorias: e.categorias || [e.categoria || 'Comidas'],
      precioChico: Number(e.precioTiendaChico) || Number(e.precioChico) || 0,
      precioGrande: Number(e.precioTiendaGrande) || Number(e.precioGrande) || 0,
      stockChico: e.stockChico || 0, stockGrande: e.stockGrande || 0, stockPala: e.stockBolsa || 0, enBlend: e.enBlend !== false,
      region: '', uso: e.uso || '', descripcion: e.descripcion || '', imagen: e.imagen || '', tags: e.tags || []
    });
  }
  var bk = Object.keys(_sDb.blends || {});
  for (var i = 0; i < bk.length; i++) {
    var b = _sDb.blends[bk[i]];
    if (!b || !b.enTienda) continue;
    products.push({
      id: b.id, nombre: b.nombre, tipo: 'blend', categoria: b.categoria || 'Comidas', categorias: b.categorias || [b.categoria || 'Comidas'],
      precioChico: Number(b.precioTiendaChico) || Number(b.precioChico) || 0,
      precioGrande: Number(b.precioTiendaGrande) || Number(b.precioGrande) || 0,
      stockChico: b.stockChico || 0, stockGrande: b.stockGrande || 0,
      region: b.region || '', uso: b.uso || '', descripcion: b.descripcion || '', imagen: b.imagen || '', tags: b.tags || [],
      ingredientes: b.ingredientes || []
    });
  }
  var pkKeys = Object.keys(_sDb.packs || {});
  for (var pi = 0; pi < pkKeys.length; pi++) {
    var pk = _sDb.packs[pkKeys[pi]];
    if (!pk || !pk.enTienda) continue;
    var packStock = pk.stock || 0;
    if (packStock <= 0) continue;
    products.push({
      id: pk.id, nombre: pk.nombre, tipo: 'pack', categoria: 'Packs', categorias: ['Packs'],
      precioChico: 0, precioGrande: 0, precio: Number(pk.precio) || 0,
      stockChico: 0, stockGrande: 0, stock: packStock,
      region: '', uso: '', descripcion: pk.descripcion || '', imagen: pk.imagen || '', tags: pk.tags || [],
      blendItems: pk.blendItems || []
    });
  }
  return products.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
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
  var ref = firebase.database().ref('arcano/db/blog').orderByChild('fecha');
  ref.on('value', function(snap) {
    var d = snap.val();
    _blogPosts = [];
    if (d) {
      var keys = Object.keys(d);
      for (var i = 0; i < keys.length; i++) {
        var p = d[keys[i]]; p._key = keys[i]; _blogPosts.push(p);
      }
    }
    _blogPosts.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
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
