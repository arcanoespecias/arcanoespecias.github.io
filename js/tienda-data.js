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

function submitOrder(orderData) {
  return new Promise(function(resolve, reject) {
    if (!_pedidosRef) _pedidosRef = firebase.database().ref('arcano/db/pedidos');
    orderData.creado = new Date().toISOString();
    orderData.estado = 'nuevo';
    _pedidosRef.push(orderData, function(error) {
      if (error) reject(error); else resolve();
    });
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
