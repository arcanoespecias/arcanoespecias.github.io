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

  // 1b) BreadcrumbList JSON-LD (site-wide)
  var hasBreadcrumb = false;
  for (var _bi = 0; _bi < existingLd.length; _bi++) {
    try { var _bp = JSON.parse(existingLd[_bi].textContent); if (_bp['@type'] === 'BreadcrumbList') { hasBreadcrumb = true; break; } } catch(_be) {}
  }
  if (!hasBreadcrumb) {
    var _bLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Inicio', 'item': SITE_URL },
        { '@type': 'ListItem', 'position': 2, 'name': 'Catalogo de Especias y Blends', 'item': SITE_URL }
      ]
    };
    var _bsEl = document.createElement('script');
    _bsEl.type = 'application/ld+json';
    _bsEl.textContent = JSON.stringify(_bLd);
    document.head.appendChild(_bsEl);
  }

  // 1c) FAQ JSON-LD (site-wide)
  var hasFaq = false;
  for (var _fi = 0; _fi < existingLd.length; _fi++) {
    try { var _fp = JSON.parse(existingLd[_fi].textContent); if (_fp['@type'] === 'FAQPage') { hasFaq = true; break; } } catch(_fe) {}
  }

  if (!hasFaq) {
    var _fLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': [
        { '@type': 'Question', 'name': '¿Qué es Arcano Especias?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Arcano Especias es una marca colombiana especializada en blends y mezclas artesanales de especias selectas de cada rincón del mundo. Creamos combinaciones únicas para comidas, infusiones y coctelería, con ingredientes 100% naturales y de alta calidad.' }},
        { '@type': 'Question', 'name': '¿Realizan envíos a toda Colombia?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Sí, Arcano Especias realiza envíos a todas las ciudades y municipios de Colombia. Los pedidos se envían una vez confirmado el pago y el tiempo de entrega varía según la ubicación.' }},
        { '@type': 'Question', 'name': '¿Cuáles son las formas de pago aceptadas?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Aceptamos pagos mediante Nequi, transferencia bancaria a Bancolombia y otros métodos de pago disponibles. Los datos de pago se proporcionan al confirmar el pedido.' }},
        { '@type': 'Question', 'name': '¿Qué presentaciones de productos ofrecen?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Nuestros blends y especias se ofrecen en dos presentaciones: tamaño pequeño y tamaño grande. También contamos con packs exclusivos que combinan varios productos a un precio especial.' }},
        { '@type': 'Question', 'name': '¿Son productos naturales?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Sí, todos los productos de Arcano Especias son 100% naturales. Utilizamos especias y ingredientes de alta calidad, sin aditivos artificiales ni conservantes. Cada blend es mezclado de forma artesanal.' }},
        { '@type': 'Question', 'name': '¿Para qué se pueden usar los blends de especias?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Nuestros blends están categorizados según su uso ideal: para comidas (carnes, sopas, arroces), para infusiones (tés y bebidas calientes) y para coctelería (bebidas y cócteles). Cada blend está diseñado para realzar el sabor de tus preparaciones.' }}
      ]
    };
    var _fqEl = document.createElement('script');
    _fqEl.type = 'application/ld+json';
    _fqEl.textContent = JSON.stringify(_fLd);
    document.head.appendChild(_fqEl);
  }

  // 2) seo-content: texto enriquecido para crawlers y AI
  var seoDiv = document.getElementById('seo-content');
  if (seoDiv && !seoDiv.innerHTML.trim()) {
    var html = '<h2>Catalogo de Especias y Blends Artesanales</h2>';
    html += '<p>Arcano Especias es una marca colombiana especializada en blends y mezclas artesanales de especias selectas de cada rincon del mundo. Ofrecemos ' + products.length + ' productos artesanales para comidas, infusiones y cocteleria, con ingredientes 100% naturales y de alta calidad. Envios a toda Colombia.</p>';
    var cats = {};
    for (var ci = 0; ci < products.length; ci++) {
      var cat = products[ci].categoria || 'General';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(products[ci]);
    }
    var catDescs = {
      'Comidas': 'Nuestras mezclas para comidas estan disenadas para realzar el sabor de carnes, sopas, arroces, pastas y preparaciones culinarias de todo el mundo. Cada blend combina especias seleccionadas en proporciones optimas para lograr perfiles de sabor unicos.',
      'Infusiones': 'Nuestras infusiones artesanales combinan especias y botanicos selectos para crear bebidas calientes con perfiles de sabor unicos. Ideales para cada momento del dia, desde un chai matutino hasta una infusion relajante nocturna.',
      'Cocteleria': 'Mezclas especializadas para transformar tragos y cocteles. Cada blend aporta notas aromaticas y de sabor que elevan bebidas clasicas y creaciones de bartenders.',
      'Packs': 'Combina varios blends artesanales a un precio especial. Packs curados para descubrir multiples sabores de Arcano Especias o para regalos originales.'
    };
    var catKeys = Object.keys(cats);
    for (var ck = 0; ck < catKeys.length; ck++) {
      var catName = catKeys[ck];
      var catProds = cats[catName];
      html += '<h3>' + catName + ' (' + catProds.length + ' productos)</h3>';
      html += '<p>' + (catDescs[catName] || 'Productos artesanales de Arcano Especias.') + '</p>';
      html += '<p>';
      for (var cp = 0; cp < catProds.length; cp++) {
        if (cp > 0) html += ' | ';
        html += catProds[cp].nombre;
      }
      html += '</p>';
    }
    html += '<h3>Por que elegir Arcano Especias</h3>';
    html += '<p>Todos nuestros productos son 100% naturales, sin aditivos artificiales ni conservantes. Cada blend es mezclado de forma artesanal con ingredientes seleccionados por su calidad y origen. Ofrecemos envios a toda Colombia con atencion personalizada. Aceptamos pagos por Nequi y transferencia bancaria.</p>';
    for (var j = 0; j < products.length; j++) {
      var pr = products[j];
      var pPrecio = pr.tipo === 'pack' ? (pr.precio || 0) : (pr.precioChico > 0 ? pr.precioChico : pr.precioGrande);
      html += '<article>';
      html += '<h4>' + pr.nombre + '</h4>';
      if (pr.descripcion) html += '<p>' + pr.descripcion + '</p>';
      html += '<p>Categoria: ' + pr.categoria;
      if (pr.region) html += ' | Origen: ' + pr.region;
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
  // Packs
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
/* === BLOG (read) === */
var _blogPosts = [];
var _blogReady = false;
var _blogListeners = [];
var _blogCatFilter = 'Todos';
function initBlog() {
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
