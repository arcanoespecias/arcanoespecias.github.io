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
    var ref = firebase.database().ref(FB_PATH);
    ref.once('value').then(function(snap) {
      var d = snap.val();
      if (d && d.especias && d.blends) { _sDb = d; _sReady = true; }
      resolve();
    }).catch(function() { resolve(); });
    ref.on('value', function(snap) {
      var d = snap.val();
      if (d && d.especias && d.blends) {
        _sDb = d; _sReady = true;
        _injectSEO();
        for (var i = 0; i < _sListeners.length; i++) { try { _sListeners[i](); } catch(e) {} }
      }
    });
  });
}

function onTiendaChange(fn) { _sListeners.push(fn); }

/* === SEO: JSON-LD + contenido para crawlers === */
var _seoInjected = false;
function _injectSEO() {
  if (_seoInjected) return;
  var products = getStoreProducts();
  if (!products.length) return;
  _seoInjected = true;

  var SITE_URL = 'https://arcanoespecias.github.io/';

  // 1) Product JSON-LD — solo inyectar si NO existe el estatico (pre-render)
  var existingLd = document.querySelectorAll('script[type="application/ld+json"]');
  var hasStaticProducts = false;
  for (var k = 0; k < existingLd.length; k++) {
    try {
      var parsed = JSON.parse(existingLd[k].textContent);
      if (parsed['@type'] === 'ItemList' && parsed.itemListElement && parsed.itemListElement.length > 0) {
        hasStaticProducts = true;
        break;
      }
    } catch(e) {}
  }

  if (!hasStaticProducts) {
    var jsonLdProducts = [];
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var precio = p.precioChico > 0 ? p.precioChico : p.precioGrande;
      var inStock = (p.stockChico > 0 || p.stockGrande > 0);
      var entry = {
        '@type': 'Product',
        'name': p.nombre,
        'description': p.descripcion || ('Blend artesanal ' + p.nombre + ' de Arcano Especias'),
        'brand': { '@type': 'Brand', 'name': 'Arcano Especias' },
        'category': p.categoria + (p.tipo === 'pack' ? ' - Pack' : p.tipo === 'blend' ? ' - Blend' : ' - Especia'),
        'offers': {
          '@type': 'Offer',
          'price': String(precio),
          'priceCurrency': 'COP',
          'availability': inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          'seller': { '@type': 'Organization', 'name': 'Arcano Especias' }
        }
      };
      var ings = [];
      if (p.ingredientes) {
        for (var ig = 0; ig < p.ingredientes.length; ig++) {
          var nm = p.ingredientes[ig].nombre || p.ingredientes[ig].especiaNombre || '';
          if (nm.trim()) ings.push(nm.trim());
        }
      }
      if (ings.length > 0) entry['material'] = ings.join(', ');
      if (p.region) entry['countryOfOrigin'] = { '@type': 'Country', 'name': p.region };
      jsonLdProducts.push(entry);
    }
    var itemList = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': 'Catalogo Arcano Especias',
      'description': 'Especias y Blends artesanales del mundo',
      'numberOfItems': jsonLdProducts.length,
      'itemListElement': jsonLdProducts
    };
    var scriptEl = document.createElement('script');
    scriptEl.type = 'application/ld+json';
    scriptEl.textContent = JSON.stringify(itemList);
    document.head.appendChild(scriptEl);
  }

  // 2) Actualizar contenido textual en div seo-content solo si esta vacio (sin pre-render estatico)
  var seoDiv = document.getElementById('seo-content');
  if (seoDiv && !seoDiv.innerHTML.trim()) {
    var html = '<h2>Catalogo de Especias y Blends Artesanales</h2>';
    html += '<p>Arcano Especias ofrece ' + products.length + ' productos artesanales: blends para comidas, infusiones y cocteleria, ademas de packs exclusivos. Todos los productos son mezclas artesanales con ingredientes seleccionados de cada rincon del mundo.</p>';
    for (var j = 0; j < products.length; j++) {
      var pr = products[j];
      var pPrecio = pr.precioChico > 0 ? pr.precioChico : pr.precioGrande;
      html += '<article>';
      html += '<h3>' + pr.nombre + '</h3>';
      if (pr.descripcion) html += '<p>' + pr.descripcion + '</p>';
      html += '<p>Categoria: ' + pr.categoria;
      if (pr.region) html += ' | Origen: ' + pr.region;
      if (pr.tags && pr.tags.length) html += ' | Usos: ' + pr.tags.join(', ');
      html += '</p>';
      if (pPrecio > 0) html += '<p>Precio desde $' + pPrecio.toLocaleString('es-CO') + ' COP</p>';
      html += '</article>';
    }
    seoDiv.innerHTML = html;
  }
}

/* === PEDIDOS (write) === */
var _pedidosRef = null;

function submitOrder(orderData) {
  return new Promise(function(resolve, reject) {
    if (!_pedidosRef) _pedidosRef = firebase.database().ref('arcano/db/pedidos');
    orderData.creado = new Date().toISOString();
    orderData.estado = 'nuevo';
    _pedidosRef.push(orderData, function(error) {
      if (error) reject(error);
      else resolve();
    });
  });
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
      stockChico: e.stockChico || 0, stockGrande: e.stockGrande || 0,
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
  return products.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
}

/* === RECETAS (read) === */
var _recetas = [];
var _recetasReady = false;
var _recetasListeners = [];

function initRecetas() {
  var recetasRef = firebase.database().ref('arcano/db/recetas').orderByChild('fecha');
  recetasRef.on('value', function(snap) {
    var data = snap.val();
    _recetas = [];
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var r = data[keys[i]];
        r._key = keys[i];
        _recetas.push(r);
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