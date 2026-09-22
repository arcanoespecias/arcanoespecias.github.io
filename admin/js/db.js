/* ===================== ARCANO V3 — DATA LAYER =====================
   Flujo:
     Insumos → Stock (pala grs, envases, stickers, bolsas)
     Produccion → consume insumos → Frascos listos (chico / grande)
     Ventas → consume frascos

   Stock por especia: stockBolsa (grs), stockChico, stockGrande (frascos)
   Stock por blend:   stockChico, stockGrande (frascos)
   Stock global:      stockEnvases (chico/grande), stockBolsas (chico/grande), stockCintas
   Stickers:           por producto, stockChico, stockGrande
   ===================== */

const DB_KEY = 'arcano_v3';
const FB_PATH = 'arcano/db';
const DB_VERSION = 3;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBvuJusx4_FvAdXhBl89VVlCicNb-yrdzo",
  authDomain: "arcano-6788d.firebaseapp.com",
  databaseURL: "https://arcano-6788d-default-rtdb.firebaseio.com",
  projectId: "arcano-6788d",
  storageBucket: "arcano-6788d.appspot.com",
  messagingSenderId: "544197982462",
  appId: "1:544197982462:web:4e8d7e3e4a9e7c6c7b3a2d"
};

var _db = null;
var _ready = false;
var _saveTimer = null;
var _listeners = [];
var _localDirty = false;  // prevents Firebase listener from overwriting pending saves

// Helper: round a number to 3 decimals (prevents float drift in stockBolsa)
function _r3(v) { return Math.round((Number(v) || 0) * 1000) / 1000; }

var DEFAULT_IDS = { especias: 1, blends: 1, producciones: 1, ventas: 1, entradas: 1, stickers: 1, ajustes: 1, puntosDeVenta: 1, pdvVentas: 1, packs: 1, costales: 1 };

/* ==================== HELPERS ==================== */

function _filterValid(arr) {
  return arr.filter(function(o) { return o && typeof o === 'object'; });
}

function _cleanNulls() {
  var cols = ['especias', 'blends', 'producciones', 'ventas', 'entradas', 'stickers', 'ajustes'];
  for (var c = 0; c < cols.length; c++) {
    var col = cols[c];
    if (!_db[col]) { _db[col] = {}; continue; }
    var keys = Object.keys(_db[col]);
    for (var j = 0; j < keys.length; j++) {
      if (_db[col][keys[j]] == null || typeof _db[col][keys[j]] !== 'object') {
        delete _db[col][keys[j]];
      }
    }
  }
}

function _ensureStructure() {
  if (!_db || typeof _db !== 'object' || Array.isArray(_db)) {
    _db = null;
    return false;
  }
  if (!_db.meta || !_db.meta.nextId) {
    _db.meta = { nextId: Object.assign({}, DEFAULT_IDS), version: DB_VERSION };
  } else {
    _db.meta.version = DB_VERSION;
    for (var k in DEFAULT_IDS) {
      if (typeof _db.meta.nextId[k] !== 'number') _db.meta.nextId[k] = DEFAULT_IDS[k];
    }
  }
  if (!_db.especias) _db.especias = {};
  if (!_db.blends) _db.blends = {};
  if (!_db.producciones) _db.producciones = {};
  if (!_db.ventas) _db.ventas = {};
  if (!_db.entradas) _db.entradas = {};
  if (!_db.stickers) _db.stickers = {};
  if (!_db.ajustes) _db.ajustes = {};
  if (!_db.costales) _db.costales = {};
  if (!_db.packs) _db.packs = {};
  // Migration: copy old etiquetas data to stickers
  if (_db.etiquetas && Object.keys(_db.etiquetas).length > 0 && Object.keys(_db.stickers).length === 0) {
    _db.stickers = _db.etiquetas;
  }
  delete _db.etiquetas;
  if (!_db.stockEnvases) _db.stockEnvases = { chico: 0, grande: 0 };
  if (!_db.stockBolsas) _db.stockBolsas = { chico: 0, grande: 0 };
  if (!_db.stockCintas) _db.stockCintas = 0;
  if (!_db.usuarios) _db.usuarios = {
    admin: { id: 'admin', nombre: 'Administrador', pin: '1234', rol: 'admin', activo: true, creado: new Date().toISOString() }
  };
  if (!_db.productTags) _db.productTags = {
    'Comidas': ['Aves', 'Pescados y Mariscos', 'Cerdo', 'Salsas y Aderezos', 'Verduras y Vegetales', 'Granos y Legumbres'],
    'Infusiones': ['Relajante', 'Digestiva', 'Energética', 'Citrica', 'Refrescante', 'Detox', 'Aromatica'],
    'Cocteleria': ['Tropical', 'Citrica', 'Seca', 'Dulce']
  };
  if (!_db.usoOptions) _db.usoOptions = ['Carnes', 'Pollo', 'Pescados y Mariscos', 'Cerdo', 'Arroces', 'Pastas', 'Sopas y Cremas', 'Ensaladas', 'Guisos y Estofados', 'Salsas', 'Marinadas y Adobos', 'Panaderia', 'Postres', 'Bebidas', 'Vegetales', 'Ceviches', 'Currys', 'Tacos y Burritos', 'Hamburguesas', 'Pizzas'];
  if (!_db.tiendaConfig) _db.tiendaConfig = { logoPago: '' };

  _cleanNulls();

  // === MIGRACIÓN: reparar especiaNombre='?' en entradas históricas ===
  // Bug: el handler de guardado comparaba IDs con === sin convertir tipos,
  // entonces si la especia tenía ID string, no la encontraba y guardaba '?'.
  // Esta migración busca los items con especiaNombre='?' y los repara buscando
  // la especia por ID en la colección actual.
  // IMPORTANTE: debe ir DESPUÉS de _cleanNulls() para no crashear con nulls.
  if (!window._arcanoMigracionReparada) {
    var entradasKeys = Object.keys(_db.entradas || {});
    var reparadas = 0;
    for (var ek = 0; ek < entradasKeys.length; ek++) {
      var ent = _db.entradas[entradasKeys[ek]];
      if (!ent || !ent.items) continue;
      for (var ei = 0; ei < ent.items.length; ei++) {
        var it = ent.items[ei];
        if (it.tipo === 'especia_grs' && (it.especiaNombre === '?' || !it.especiaNombre) && it.especiaId != null) {
          var espIdNum = Number(it.especiaId);
          var espKeys = Object.keys(_db.especias || {});
          for (var sk = 0; sk < espKeys.length; sk++) {
            var espEntry = _db.especias[espKeys[sk]];
            if (espEntry && Number(espEntry.id) === espIdNum) {
              it.especiaNombre = espEntry.nombre;
              reparadas++;
              break;
            }
          }
        }
      }
    }
    if (reparadas > 0) {
      console.log('[DB] Migración: ' + reparadas + ' items de entrada con especiaNombre="?" reparados.');
      window._arcanoMigracionReparada = true;
      // Persistir los cambios a Firebase y localStorage
      setTimeout(function() {
        _saveToFirebase();
        _cacheLocal();
        console.log('[DB] Migración: cambios persistidos a Firebase y localStorage.');
      }, 2000);
    } else {
      window._arcanoMigracionReparada = true;
    }
  }
  // === FIN MIGRACIÓN ===
  return true;
}

function _emptyDB() {
  return {
    meta: { nextId: Object.assign({}, DEFAULT_IDS), version: DB_VERSION },
    especias: {}, blends: {}, producciones: {}, ventas: {}, entradas: {}, stickers: {}, ajustes: {}, puntosDeVenta: {}, pdvVentas: {}, packs: {}, costales: {},
    stockEnvases: { chico: 0, grande: 0 },
    stockBolsas: { chico: 0, grande: 0 },
    stockCintas: 0,
    productTags: {
      'Comidas': ['Aves', 'Pescados y Mariscos', 'Cerdo', 'Salsas y Aderezos', 'Verduras y Vegetales', 'Granos y Legumbres'],
      'Infusiones': ['Relajante', 'Digestiva', 'Energética', 'Citrica', 'Refrescante', 'Detox', 'Aromatica'],
      'Cocteleria': ['Tropical', 'Citrica', 'Seca', 'Dulce']
    },
    usoOptions: ['Carnes', 'Pollo', 'Pescados y Mariscos', 'Cerdo', 'Arroces', 'Pastas', 'Sopas y Cremas', 'Ensaladas', 'Guisos y Estofados', 'Salsas', 'Marinadas y Adobos', 'Panaderia', 'Postres', 'Bebidas', 'Vegetales', 'Ceviches', 'Currys', 'Tacos y Burritos', 'Hamburguesas', 'Pizzas'],
    usuarios: { admin: { id: 'admin', nombre: 'Administrador', pin: '1234', rol: 'admin', activo: true, creado: new Date().toISOString() } }
  };
}

function nextId(col) {
  if (!_db.meta.nextId[col]) _db.meta.nextId[col] = 1;
  var id = _db.meta.nextId[col]++;
  return id;
}

/* ==================== FIREBASE ==================== */

var _firebaseApp = null;
var _firebaseDb = null;
var _firebaseRef = null;

/* === Pedidos (path arcano/db/pedidos) === */
var _pedidos = [];           // in-memory list of orders from tienda
var _pedidosRef = null;      // Firebase ref for arcano/db/pedidos
var _pedidosListeners = [];  // callbacks when new pedido arrives

/* === Grandes Clientes (path arcano/db/grandesClientes) === */
var _grandesClientes = [];
var _gcRef = null;
var _gcListeners = [];
var _prevGCKeys = {};

/* === Clientes tienda (path arcano/db/clientes) === */
var _clientes = [];
var _clientesRef = null;
var _clientesListeners = [];

/* === Promociones (path arcano/db/promociones) === */
var _promociones = [];
var _promocionesRef = null;
var _promocionesListeners = [];

/* === Carritos tracking (path arcano/db/carritos) === */
var _carritos = [];
var _carritosRef = null;
var _carritosListeners = [];

/* === OTP pendientes (path arcano/db/otpPendientes) === */
var _otpPendientes = [];
var _otpPendientesRef = null;
var _otpPendientesListeners = [];

/* === Costos de insumos (separate from _db to avoid sync overwrites) === */
var _costosRef = null;
var _costosInsumos = null;
var _costosReady = false;
var _costosListeners = [];

function _initFirebase() {
  if (_firebaseDb) return;
  try {
    _firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    _firebaseDb = firebase.database();
    _firebaseRef = _firebaseDb.ref(FB_PATH);
    _pedidosRef = _firebaseDb.ref('arcano/db/pedidos');
    _gcRef = _firebaseDb.ref('arcano/db/grandesClientes');
    _clientesRef = _firebaseDb.ref('arcano/db/clientes');
    _promocionesRef = _firebaseDb.ref('arcano/db/promociones');
    _carritosRef = _firebaseDb.ref('arcano/db/carritos');
    _otpPendientesRef = _firebaseDb.ref('arcano/db/otpPendientes');
    _costosRef = _firebaseDb.ref('arcano/db/costosInsumos');
  } catch (e) {
    console.error('[DB] Firebase init error:', e);
  }
}

function _saveToFirebase() {
  if (!_firebaseRef) return;
  _localDirty = true;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() {
    try {
      var safetyTimer = setTimeout(function() { _localDirty = false; }, 5000);
      _firebaseRef.update(_db, function(error) {
        clearTimeout(safetyTimer);
        _localDirty = false;
        if (error) console.error('[DB] Firebase save error:', error);
      });
    } catch (e) {
      console.error('[DB] Firebase save error:', e);
      _localDirty = false;
    }
  }, 500);
}

function _saveToFirebaseNow(callback) {
  if (!_firebaseRef) { if (callback) callback(null); return; }
  clearTimeout(_saveTimer);
  _localDirty = true;
  try {
    var safetyTimer = setTimeout(function() { _localDirty = false; if (callback) callback(new Error('Firebase save timeout')); }, 10000);
    _firebaseRef.update(_db, function(error) {
      clearTimeout(safetyTimer);
      _localDirty = false;
      if (callback) callback(error);
      else if (error) console.error('[DB] Firebase save error:', error);
    });
  } catch (e) {
    _localDirty = false;
    if (callback) callback(e);
    else console.error('[DB] Firebase save error:', e);
  }
}

function writeField(path, value) {
  if (!_firebaseRef) return;
  try {
    _firebaseRef.child(path).set(value, function(error) {
      if (error) console.error('[DB] writeField error:', path, error);
    });
  } catch (e) {
    console.error('[DB] writeField error:', path, e);
  }
}

function saveNow() {
  return new Promise(function(resolve) {
    if (!_firebaseRef) { resolve(false); return; }
    clearTimeout(_saveTimer);
    _localDirty = true;
    var resolved = false;
    var safetyTimer = setTimeout(function() {
      if (!resolved) { resolved = true; _localDirty = false; console.warn('[DB] saveNow timeout - resolving false'); resolve(false); }
    }, 10000);
    try {
      // En vez de update(_db) que sube TODO (con campos internos que no queremos),
      // subimos solo las colecciones de datos relevantes
      var dataToSave = {
        especias: _db.especias || {},
        blends: _db.blends || {},
        packs: _db.packs || {},
        entradas: _db.entradas || {},
        producciones: _db.producciones || {},
        stockEnvases: _db.stockEnvases || {},
        stockBolsas: _db.stockBolsas || {},
        stockCintas: _db.stockCintas || 0,
        costales: _db.costales || {},
        stickers: _db.stickers || {},
        ventas: _db.ventas || {},
        gastos: _db.gastos || {},
        gastosCategorias: _db.gastosCategorias || [],
        ajustes: _db.ajustes || {},
        usuarios: _db.usuarios || {},
        puntosDeVenta: _db.puntosDeVenta || {},
        pdvVentas: _db.pdvVentas || {},
        productTags: _db.productTags || [],
        usoOptions: _db.usoOptions || [],
        tiendaConfig: _db.tiendaConfig || {},
        costosInsumos: _db.costosInsumos || {},
        meta: _db.meta || {}
      };
      _firebaseRef.update(dataToSave, function(error) {
        if (resolved) return;
        resolved = true;
        clearTimeout(safetyTimer);
        // Mantener _localDirty = true por 2 segundos más para que el listener
        // no sobreescriba _db con datos viejos antes de que Firebase confirme
        setTimeout(function() { _localDirty = false; }, 2000);
        if (error) { console.error('[DB] Firebase save error:', error); resolve(false); }
        else resolve(true);
      });
    } catch (e) {
      if (resolved) return;
      resolved = true;
      clearTimeout(safetyTimer);
      _localDirty = false;
      console.error('[DB] Firebase save error:', e);
      resolve(false);
    }
  });
}

function _notify(type, col, id) {
  for (var i = 0; i < _listeners.length; i++) {
    try { _listeners[i](type, col, id); } catch (e) {}
  }
}

/* ==================== INIT ==================== */

function initDB() {
  return new Promise(function(resolve) {
    _initFirebase();

    // Always try localStorage cache for instant UI
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) {}

    if (cached && cached.meta && cached.meta.version === DB_VERSION && _ensureStructureOn(cached)) {
      _db = cached;
      _ensureStructure();  // ensure new fields exist on cached data
      _ready = true;
      _startFirebaseListener();
      _startPedidosListener();
      _startGrandesClientesListener();
      _startClientesListener();
      _startPromocionesListener();
      _startCarritosListener();
      _startOtpPendientesListener();
      _startCostosListener();
      resolve();
      return;
    }

    // Load from Firebase
    if (_firebaseRef) {
      _firebaseRef.once('value').then(function(snap) {
        var fbData = snap.val();
        if (fbData && fbData.meta && fbData.meta.version === DB_VERSION && _ensureStructureOn(fbData)) {
          delete fbData.pedidos;
          delete fbData.costosInsumos;
          _db = fbData;
          _ensureStructure();  // ensure new fields exist on Firebase data
        } else {
          _db = _emptyDB();
          _ensureStructure();
          _saveToFirebase();
        }
        _ready = true;
        _cacheLocal();
        _startFirebaseListener();
        _startPedidosListener();
        _startGrandesClientesListener();
        _startClientesListener();
        _startPromocionesListener();
        _startCarritosListener();
      _startOtpPendientesListener();
        _startCostosListener();
        resolve();
      }).catch(function() {
        _db = _emptyDB();
        _ensureStructure();
        _ready = true;
        resolve();
      });
    } else {
      _db = _emptyDB();
      _ensureStructure();
      _ready = true;
      resolve();
    }
  });
}

function _ensureStructureOn(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.meta || !data.meta.version) return false;
  if (data.meta.version !== DB_VERSION) return false;
  // Basic check
  if (!data.especias || !data.blends) return false;
  return true;
}

function _cacheLocal() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(_db)); } catch (e) {}
}

function _startFirebaseListener() {
  if (!_firebaseRef) return;
  _firebaseRef.on('value', function(snap) {
    var data = snap.val();
    if (!data || !data.meta || data.meta.version !== DB_VERSION) return;
    // CRITICAL: skip if local save is pending to prevent overwriting unsaved changes
    if (_localDirty) return;
    delete data.pedidos;
    delete data.costosInsumos;
    var prevJson = JSON.stringify(_db);
    _db = data;
    _ensureStructure();
    _cacheLocal();
    var newJson = JSON.stringify(_db);
    if (prevJson !== newJson) {
      _notify('remote_change', '', '');
    }
  });
}

function _startPedidosListener() {
  if (!_pedidosRef) return;
  var _prevNuevoKeys = {};
  _pedidosRef.on('value', function(snap) {
    var data = snap.val();
    var prevLen = _pedidos.length;
    var prevNuevoKeys = Object.assign({}, _prevNuevoKeys);
    _pedidos = [];
    var nuevoKeys = {};
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var p = data[keys[i]];
        if (p && typeof p === 'object') {
          p._key = keys[i];
          _pedidos.push(p);
          if (p.estado === 'nuevo') nuevoKeys[keys[i]] = true;
        }
      }
    }
    _pedidos.sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
    _prevNuevoKeys = nuevoKeys;
    // Detect new pedido: a key in nuevoKeys that was NOT in prevNuevoKeys
    var hasNew = false;
    var nk = Object.keys(nuevoKeys);
    for (var n = 0; n < nk.length; n++) {
      if (!prevNuevoKeys[nk[n]]) { hasNew = true; break; }
    }
    _notifyPedidos(hasNew, _pedidos.length !== prevLen);
  });
}

function _notifyPedidos(isNew, countChanged) {
  for (var i = 0; i < _pedidosListeners.length; i++) {
    try { _pedidosListeners[i](_pedidos, isNew, countChanged); } catch (e) {}
  }
}

function onPedidosChange(fn) { _pedidosListeners.push(fn); }

function getPedidos() {
  return _pedidos.slice();
}

function getPedidosCount(estado) {
  if (!estado) return _pedidos.length;
  var c = 0;
  for (var i = 0; i < _pedidos.length; i++) { if (_pedidos[i].estado === estado) c++; }
  return c;
}

/* === Grandes Clientes === */
function _startGrandesClientesListener() {
  if (!_gcRef) return;
  _gcRef.on('value', function(snap) {
    var data = snap.val();
    _grandesClientes = [];
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var g = data[keys[i]];
        if (g && typeof g === 'object') {
          g._key = keys[i];
          _grandesClientes.push(g);
        }
      }
    }
    _grandesClientes.sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
    // Detect new GC message
    var currentKeys = {};
    for (var k = 0; k < _grandesClientes.length; k++) { currentKeys[_grandesClientes[k]._key] = true; }
    var hasNew = false;
    var ck = Object.keys(currentKeys);
    for (var c = 0; c < ck.length; c++) {
      if (!_prevGCKeys[ck[c]]) { hasNew = true; break; }
    }
    _prevGCKeys = currentKeys;
    for (var j = 0; j < _listeners.length; j++) { try { _listeners[j](); } catch(e) {} }
    for (var g = 0; g < _gcListeners.length; g++) { try { _gcListeners[g](_grandesClientes, hasNew); } catch(e) {} }
  });
}

function getGrandesClientes() { return _grandesClientes.slice(); }

function updateGCEstado(key, estado) {
  if (!_gcRef) return;
  _gcRef.child(key + '/estado').set(estado);
}

function deleteGC(key) {
  if (!_gcRef) return;
  _gcRef.child(key).remove();
}

function onGCChange(fn) { _gcListeners.push(fn); }

function getGCCount(estado) {
  if (!estado) return _grandesClientes.length;
  var count = 0;
  for (var i = 0; i < _grandesClientes.length; i++) {
    if (_grandesClientes[i].estado === estado) count++;
  }
  return count;
}

/* === Clientes tienda (path arcano/db/clientes) === */
function _startClientesListener() {
  if (!_clientesRef) return;
  _clientesRef.on('value', function(snap) {
    var data = snap.val();
    _clientes = [];
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var c = data[keys[i]];
        if (c && typeof c === 'object') {
          c._key = keys[i];
          _clientes.push(c);
        }
      }
    }
    // Ordenar por ultimoPedido desc (mas recientes primero)
    _clientes.sort(function(a, b) {
      return (b.ultimoPedido || b.creado || '').localeCompare(a.ultimoPedido || a.creado || '');
    });
    for (var j = 0; j < _listeners.length; j++) { try { _listeners[j](); } catch(e) {} }
    for (var cl = 0; cl < _clientesListeners.length; cl++) { try { _clientesListeners[cl](_clientes); } catch(e) {} }
  });
}

function getClientes() { return _clientes.slice(); }

function getClientesCount() { return _clientes.length; }

function onClientesChange(fn) { _clientesListeners.push(fn); }

function deleteCliente(key) {
  if (!_clientesRef) return;
  _clientesRef.child(key).remove();
}

/**
 * Obtiene los pedidos asociados a un cliente por su clienteId.
 */
function getPedidosByCliente(clienteId) {
  if (!clienteId) return [];
  var result = [];
  for (var i = 0; i < _pedidos.length; i++) {
    if (_pedidos[i].clienteId === clienteId) {
      result.push(_pedidos[i]);
    }
  }
  result.sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
  return result;
}

/* === Promociones === */
function _startPromocionesListener() {
  if (!_promocionesRef) return;
  _promocionesRef.on('value', function(snap) {
    var data = snap.val();
    _promociones = [];
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var p = data[keys[i]];
        if (p && typeof p === 'object') {
          p._key = keys[i];
          _promociones.push(p);
        }
      }
    }
    _promociones.sort(function(a, b) {
      // Activas primero, luego destacadas, luego por creacion desc
      var aActive = a.activa !== false ? 1 : 0;
      var bActive = b.activa !== false ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      var aDest = a.destacada ? 1 : 0;
      var bDest = b.destacada ? 1 : 0;
      if (aDest !== bDest) return bDest - aDest;
      return (b.creado || '').localeCompare(a.creado || '');
    });
    for (var j = 0; j < _listeners.length; j++) { try { _listeners[j](); } catch(e) {} }
    for (var pl = 0; pl < _promocionesListeners.length; pl++) { try { _promocionesListeners[pl](_promociones); } catch(e) {} }
  });
}

function getPromociones() { return _promociones.slice(); }

function getPromocionesActivas() {
  var now = Date.now();
  return _promociones.filter(function(p) {
    if (p.activa === false) return false;
    if (p.fechaInicio && new Date(p.fechaInicio).getTime() > now) return false;
    if (p.fechaFin && new Date(p.fechaFin).getTime() < now) return false;
    return true;
  });
}

function savePromocion(data) {
  if (!_promocionesRef) return;
  if (!data._key) {
    data.creado = new Date().toISOString();
    var newRef = _promocionesRef.push();
    var clean = Object.assign({}, data);
    delete clean._key;
    newRef.set(clean);
  } else {
    var key = data._key;
    var updates = Object.assign({}, data);
    delete updates._key;
    _promocionesRef.child(key).update(updates);
  }
}

function deletePromocion(key) {
  if (!_promocionesRef) return;
  _promocionesRef.child(key).remove();
}

function onPromocionesChange(fn) { _promocionesListeners.push(fn); }

/* === Carritos === */
function _startCarritosListener() {
  if (!_carritosRef) return;
  _carritosRef.on('value', function(snap) {
    var data = snap.val();
    _carritos = [];
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var c = data[keys[i]];
        if (c && typeof c === 'object') {
          c._key = keys[i];
          _carritos.push(c);
        }
      }
    }
    _carritos.sort(function(a, b) { return (b.actualizado || b.creado || '').localeCompare(a.actualizado || a.creado || ''); });
    for (var j = 0; j < _listeners.length; j++) { try { _listeners[j](); } catch(e) {} }
    for (var cl = 0; cl < _carritosListeners.length; cl++) { try { _carritosListeners[cl](_carritos); } catch(e) {} }
  });
}

function getCarritos() { return _carritos.slice(); }

function getCarritosByEstado(estado) {
  return _carritos.filter(function(c) { return c.estado === estado; });
}

function deleteCarrito(key) {
  if (!_carritosRef) return;
  _carritosRef.child(key).remove();
}

function onCarritosChange(fn) { _carritosListeners.push(fn); }

/* === OTP pendientes (cola de códigos a enviar a clientes) === */
function _startOtpPendientesListener() {
  if (!_otpPendientesRef) return;
  _otpPendientesRef.on('value', function(snap) {
    var data = snap.val();
    _otpPendientes = [];
    if (data) {
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        var o = data[keys[i]];
        if (o && typeof o === 'object') {
          o._key = keys[i];
          _otpPendientes.push(o);
        }
      }
    }
    // Ordenar: no enviados primero, luego por creación desc
    _otpPendientes.sort(function(a, b) {
      var aPend = a.enviado ? 1 : 0;
      var bPend = b.enviado ? 1 : 0;
      if (aPend !== bPend) return aPend - bPend;
      return (b.creado || '').localeCompare(a.creado || '');
    });
    for (var j = 0; j < _listeners.length; j++) { try { _listeners[j](); } catch(e) {} }
    for (var op = 0; op < _otpPendientesListeners.length; op++) { try { _otpPendientesListeners[op](_otpPendientes); } catch(e) {} }
  });
}

function getOtpPendientes() { return _otpPendientes.slice(); }

function getOtpPendientesCount() {
  var count = 0;
  for (var i = 0; i < _otpPendientes.length; i++) {
    if (!_otpPendientes[i].enviado) count++;
  }
  return count;
}

function markOtpEnviado(key) {
  if (!_otpPendientesRef) return;
  _otpPendientesRef.child(key).update({ enviado: true, enviadoEn: new Date().toISOString() });
}

function deleteOtpPendiente(key) {
  if (!_otpPendientesRef) return;
  _otpPendientesRef.child(key).remove();
}

function onOtpPendientesChange(fn) { _otpPendientesListeners.push(fn); }

function updatePedidoEstado(pedidoKey, nuevoEstado) {
  if (!_pedidosRef) return;
  _pedidosRef.child(pedidoKey + '/estado').set(nuevoEstado);
  // Si el pedido pasa a "entregado", descontar stock de los productos
  // (solo si no fue descontado antes — flag stockDescontado)
  if (nuevoEstado === 'entregado') {
    _pedidosRef.child(pedidoKey).once('value', function(snap) {
      var pedido = snap.val();
      if (!pedido || pedido.stockDescontado) return;
      _descontarStockPedido(pedido);
      _pedidosRef.child(pedidoKey + '/stockDescontado').set(true);
      // === Colección Arcano: contar blends pequeños ===
      _contarBlendsColeccion(pedido, pedidoKey);
    });
  } else {
    // Si el pedido estaba entregado y vuelve a otro estado, revertir stock
    _pedidosRef.child(pedidoKey).once('value', function(snap) {
      var pedido = snap.val();
      if (!pedido || !pedido.stockDescontado) return;
      _revertirStockPedido(pedido);
      _pedidosRef.child(pedidoKey + '/stockDescontado').set(false);
    });
  }
}

/* === Descontar stock de los productos de un pedido (al entregar) === */
function _descontarStockPedido(pedido) {
  try {
    var items = pedido.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var qty = Number(item.qty) || 0;
      if (qty <= 0) continue;
      var tipo = item.tipo || 'blend';
      var talla = item.talla || 'chico';
      var productId = item.productId;

      if (tipo === 'blend' || tipo === 'especia') {
        var collection = tipo === 'blend' ? _db.blends : _db.especias;
        var prod = collection ? collection[productId] : null;
        if (!prod) continue;
        // Descontar stockChico o stockGrande según la talla
        if (talla === 'grande') {
          prod.stockGrande = Math.max(0, (Number(prod.stockGrande) || 0) - qty);
        } else {
          prod.stockChico = Math.max(0, (Number(prod.stockChico) || 0) - qty);
        }
      } else if (tipo === 'pack') {
        if (_db.packs && _db.packs[productId]) {
          _db.packs[productId].stock = Math.max(0, (Number(_db.packs[productId].stock) || 0) - qty);
        }
      }
    }
    _saveToFirebase();
    _notify('update', 'blends', 'global');
    console.log('[DB] Stock descontado por entrega de pedido');
  } catch (e) {
    console.error('[DB] Error descontando stock de pedido:', e);
  }
}

/* === Colección Arcano: contar blends pequeños de un pedido === */
function _contarBlendsColeccion(pedido, pedidoKey) {
  try {
    var cliente = pedido.cliente || {};
    var whatsapp = cliente.telefono || cliente.whatsapp || '';
    if (!whatsapp) return;
    // Normalizar whatsapp
    whatsapp = whatsapp.replace(/[^0-9+]/g, '');
    if (whatsapp.startsWith('+')) whatsapp = whatsapp.substring(1);

    var items = pedido.items || [];
    var blendsChicosCount = 0;
    var blendNombres = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var tipo = item.tipo || 'blend';
      var talla = item.talla || 'chico';
      var qty = Number(item.qty) || Number(item.cantidad) || 0;

      // Solo contar blends y especias en talla chico (pequeño)
      if ((tipo === 'blend' || tipo === 'especia') && talla === 'chico' && qty > 0) {
        blendsChicosCount += qty;
        var nombre = item.nombre || item.productoNombre || '';
        if (nombre) blendNombres.push(nombre);
      }
    }

    if (blendsChicosCount > 0) {
      var col = addBlendsToColeccion(whatsapp, blendsChicosCount, pedidoKey, blendNombres);
      // Actualizar el nombre del cliente en la colección si no lo tiene
      if (!col.nombre && cliente.nombre) {
        col.nombre = cliente.nombre;
        if (_coleccionesRef) _coleccionesRef.child(whatsapp + '/nombre').set(cliente.nombre);
      }
      // Si completó el cartón, notificar al admin
      if (col.completado && !col.canjeado) {
        console.log('[Colección Arcano] ¡Cliente completó su cartón! WhatsApp:', whatsapp);
        // Notificación visual en el admin
        _notify('coleccion_completada', 'colecciones', whatsapp);
      }
    }
  } catch(e) {
    console.error('[Colección Arcano] Error al contar blends:', e);
  }
}

/* === Revertir stock si un pedido entregado vuelve a otro estado === */
function _revertirStockPedido(pedido) {
  try {
    var items = pedido.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var qty = Number(item.qty) || 0;
      if (qty <= 0) continue;
      var tipo = item.tipo || 'blend';
      var talla = item.talla || 'chico';
      var productId = item.productId;

      if (tipo === 'blend' || tipo === 'especia') {
        var collection = tipo === 'blend' ? _db.blends : _db.especias;
        var prod = collection ? collection[productId] : null;
        if (!prod) continue;
        if (talla === 'grande') {
          prod.stockGrande = (Number(prod.stockGrande) || 0) + qty;
        } else {
          prod.stockChico = (Number(prod.stockChico) || 0) + qty;
        }
      } else if (tipo === 'pack') {
        if (_db.packs && _db.packs[productId]) {
          _db.packs[productId].stock = (Number(_db.packs[productId].stock) || 0) + qty;
        }
      }
    }
    _saveToFirebase();
    _notify('update', 'blends', 'global');
    console.log('[DB] Stock revertido por cambio de estado de pedido');
  } catch (e) {
    console.error('[DB] Error revirtiendo stock de pedido:', e);
  }
}

function updatePedidoField(pedidoKey, field, value) {
  if (!_pedidosRef) return;
  _pedidosRef.child(pedidoKey + '/' + field).set(value);
}

function deletePedido(pedidoKey) {
  if (!_pedidosRef) return;
  _pedidosRef.child(pedidoKey).remove();
}

function onDBChange(fn) { _listeners.push(fn); }

/* ==================== GETTERS ==================== */

function getDB() { return _db; }

function getEspecias() {
  return _filterValid(Object.values(_db.especias || {})).sort(function(a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
}
function getEspecia(id) { return _db.especias[id] || null; }

function getBlends() {
  return _filterValid(Object.values(_db.blends || {})).sort(function(a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
}
function getBlend(id) { return _db.blends[id] || null; }

function getStickers() {
  return _filterValid(Object.values(_db.stickers || {})).sort(function(a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
}

function getEntradas() {
  return _filterValid(Object.values(_db.entradas || {})).sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
}
function getProducciones() {
  return _filterValid(Object.values(_db.producciones || {})).sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
}
function getVentas() {
  return _filterValid(Object.values(_db.ventas || {})).sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
}

/* ==================== ESPECIAS ==================== */

function saveEspecia(data) {
  _ensureStructure();
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('especias');
    data.creado = new Date().toISOString();
  } else {
    var existing = _db.especias[data.id];
    if (existing) {
      for (var _k in existing) {
        if (existing.hasOwnProperty(_k) && !data.hasOwnProperty(_k)) {
          data[_k] = existing[_k];
        }
      }
      data.creado = existing.creado;
    }
  }
  data.nombre = (data.nombre || '').trim();
  if (Array.isArray(data.categorias) && data.categorias.length > 0) {
    data.categoria = data.categorias[0];
  } else {
    data.categorias = [data.categoria || 'Comidas'];
  }
  data.precioChico = Number(data.precioChico) || 0;
  data.precioGrande = Number(data.precioGrande) || 0;
  data.gramosChico = Number(data.gramosChico) || 0;
  data.gramosGrande = Number(data.gramosGrande) || 0;
  data.stockBolsa = Number(data.stockBolsa) || 0;
  data.stockChico = Number(data.stockChico) || 0;
  data.stockGrande = Number(data.stockGrande) || 0;
  _db.especias[data.id] = data;
  _getOrCreateSticker(data.nombre);
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'especias', data.id);
  return data;
}

function deleteEspecia(id) {
  if (!_db.especias[id]) return false;
  delete _db.especias[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'especias', id);
  return true;
}

/* ==================== BLENDS ==================== */

function saveBlend(data) {
  _ensureStructure();
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('blends');
    data.creado = new Date().toISOString();
  } else {
    var existing = _db.blends[data.id];
    if (existing) {
      for (var _k in existing) {
        if (existing.hasOwnProperty(_k) && !data.hasOwnProperty(_k)) {
          data[_k] = existing[_k];
        }
      }
      data.creado = existing.creado;
    }
  }
  data.nombre = (data.nombre || '').trim();
  if (Array.isArray(data.categorias) && data.categorias.length > 0) {
    data.categoria = data.categorias[0];
  } else {
    data.categorias = [data.categoria || 'Comidas'];
  }
  data.precioChico = Number(data.precioChico) || 0;
  data.precioGrande = Number(data.precioGrande) || 0;
  data.ingredientes = data.ingredientes || [];
  data.stockChico = Number(data.stockChico) || 0;
  data.stockGrande = Number(data.stockGrande) || 0;
  _db.blends[data.id] = data;
  _getOrCreateSticker(data.nombre);
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'blends', data.id);
  return data;
}

function deleteBlend(id) {
  if (!_db.blends[id]) return false;
  delete _db.blends[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'blends', id);
  return true;
}

/* ==================== STICKERS ==================== */

function _findStickerByNombre(nombre) {
  var keys = Object.keys(_db.stickers || {});
  for (var i = 0; i < keys.length; i++) {
    if (_db.stickers[keys[i]].nombre === nombre) return _db.stickers[keys[i]];
  }
  return null;
}

function _getOrCreateSticker(nombre) {
  if (!_db.stickers) _db.stickers = {};
  var existing = _findStickerByNombre(nombre);
  if (existing) return existing;
  var id = nextId('stickers');
  var nueva = { id: id, nombre: nombre, stockChico: 0, stockGrande: 0, creado: new Date().toISOString() };
  _db.stickers[id] = nueva;
  return nueva;
}

/** Get all products (especias+blends) with their sticker stock merged */
function getProductosConStickers() {
  var items = [];
  var espKeys = Object.keys(_db.especias || {});
  for (var i = 0; i < espKeys.length; i++) {
    var e = _db.especias[espKeys[i]];
    if (!e || typeof e !== 'object') continue;
    var stk = _findStickerByNombre(e.nombre);
    items.push({
      id: e.id, nombre: e.nombre || '', tipo: 'especia', categoria: e.categoria || '', categorias: e.categorias || [e.categoria || 'Comidas'],
      stockChico: stk ? (Number(stk.stockChico) || 0) : 0,
      stockGrande: stk ? (Number(stk.stockGrande) || 0) : 0
    });
  }
  var blKeys = Object.keys(_db.blends || {});
  for (var i = 0; i < blKeys.length; i++) {
    var b = _db.blends[blKeys[i]];
    if (!b || typeof b !== 'object') continue;
    var stk = _findStickerByNombre(b.nombre);
    items.push({
      id: b.id, nombre: b.nombre || '', tipo: 'blend', categoria: b.categoria || '', categorias: b.categorias || [b.categoria || 'Comidas'],
      stockChico: stk ? (Number(stk.stockChico) || 0) : 0,
      stockGrande: stk ? (Number(stk.stockGrande) || 0) : 0
    });
  }
  return items.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
}

/* ==================== ENTRADAS (Insumos) ==================== */

function saveEntrada(data) {
  _ensureStructure();
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('entradas');
    data.creado = new Date().toISOString();
    data.fecha = data.fecha || new Date().toISOString().slice(0, 10);
    data.items = data.items || [];
    data.total = Number(data.total) || 0;
    // Persistir campos de ajuste si vienen (compat hacia atrás: si no vienen, se asume = total)
    if (data.totalCalculado == null) data.totalCalculado = data.total;
    if (data.totalPagado == null) data.totalPagado = data.total;
    if (data.ajuste == null) data.ajuste = 0;
  }
  if (isNew) {
    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      var tipo = item.tipo;
      if (tipo === 'especia_grs') {
        // Add grams to especia stockBolsa
        if (item.especiaId && _db.especias[item.especiaId]) {
          var espObj = _db.especias[item.especiaId];
          var grsNuevos = Number(item.cantidad) || 0;
          var costoNuevo = Number(item.costoUnitario) || 0;
          // Weighted average cost per gram
          if (grsNuevos > 0 && costoNuevo > 0) {
            var stockPrevio = espObj.stockBolsa || 0;
            var costoPrevio = (_costosInsumos && _costosInsumos.especias && _costosInsumos.especias[item.especiaId]) || 0;
            var nuevoTotalGrs = stockPrevio + grsNuevos;
            var nuevoCostoProm = 0;
            if (nuevoTotalGrs > 0) {
              nuevoCostoProm = (stockPrevio * costoPrevio + grsNuevos * costoNuevo) / nuevoTotalGrs;
            }
            if (!_costosInsumos) _costosInsumos = Object.assign({}, _COSTOS_DEFAULTS);
            if (!_costosInsumos.especias) _costosInsumos.especias = {};
            _costosInsumos.especias[item.especiaId] = Math.round(nuevoCostoProm * 1000) / 1000;
            if (_costosRef) {
              _costosRef.set(_costosInsumos, function(error) {
                if (error) console.error('[DB] Costos promedio save error:', error);
              });
            }
            try { localStorage.setItem('arcano_costos', JSON.stringify(_costosInsumos)); } catch (e) {}
          }
          espObj.stockBolsa = _r3(espObj.stockBolsa + grsNuevos);
        }
      } else if (tipo === 'envase') {
        var talla = item.talla || 'chico';
        if (!_db.stockEnvases) _db.stockEnvases = { chico: 0, grande: 0 };
        _db.stockEnvases[talla] = (_db.stockEnvases[talla] || 0) + (Number(item.cantidad) || 0);
      } else if (tipo === 'sticker') {
        var stk = _getOrCreateSticker(item.stickerNombre);
        var t = item.talla || 'chico';
        if (t === 'grande') {
          stk.stockGrande = (stk.stockGrande || 0) + (Number(item.cantidad) || 0);
        } else {
          stk.stockChico = (stk.stockChico || 0) + (Number(item.cantidad) || 0);
        }
      } else if (tipo === 'bolsa') {
        var tallaB = item.talla || 'chico';
        if (!_db.stockBolsas) _db.stockBolsas = { chico: 0, grande: 0 };
        _db.stockBolsas[tallaB] = (_db.stockBolsas[tallaB] || 0) + (Number(item.cantidad) || 0);
      } else if (tipo === 'cinta') {
        if (!_db.stockCintas) _db.stockCintas = 0;
        _db.stockCintas = _db.stockCintas + (Number(item.cantidad) || 0);
      }
    }
  }
  _db.entradas[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'entradas', data.id);
  return data;
}

/**
 * Revertir el efecto en stock de una entrada (sin tocar el registro).
 * Se usa antes de borrar o antes de actualizar una entrada.
 * Para especias, revierte el costo promedio solo si la especia sigue existiendo
 * y si el costo actual corresponde al promedio (mejor esfuerzo, no exacto para
 * especias con múltiples entradas posteriores).
 */
function _revertirEntrada(entrada) {
  if (!entrada || !entrada.items) return;
  var items = entrada.items;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var tipo = item.tipo;
    var cantidad = Number(item.cantidad) || 0;
    if (cantidad <= 0) continue;

    if (tipo === 'especia_grs') {
      if (item.especiaId && _db.especias[item.especiaId]) {
        var espObj = _db.especias[item.especiaId];
        espObj.stockBolsa = _r3(Math.max(0, espObj.stockBolsa - cantidad));
        // Nota: el costo promedio ponderado no se revierte exactamente porque
        // entradas posteriores pueden haberlo recalculado. Lo dejamos como está;
        // el admin puede reajustarlo manualmente si lo necesita.
      }
    } else if (tipo === 'envase') {
      var talla = item.talla || 'chico';
      if (_db.stockEnvases) {
        _db.stockEnvases[talla] = Math.max(0, (_db.stockEnvases[talla] || 0) - cantidad);
      }
    } else if (tipo === 'sticker') {
      var stk = _findStickerByNombre(item.stickerNombre);
      if (stk) {
        var t = item.talla || 'chico';
        if (t === 'grande') {
          stk.stockGrande = Math.max(0, (stk.stockGrande || 0) - cantidad);
        } else {
          stk.stockChico = Math.max(0, (stk.stockChico || 0) - cantidad);
        }
      }
    } else if (tipo === 'bolsa') {
      var tallaB = item.talla || 'chico';
      if (_db.stockBolsas) {
        _db.stockBolsas[tallaB] = Math.max(0, (_db.stockBolsas[tallaB] || 0) - cantidad);
      }
    } else if (tipo === 'cinta') {
      if (_db.stockCintas) {
        _db.stockCintas = Math.max(0, (_db.stockCintas || 0) - cantidad);
      }
    }
  }
}

/**
 * Actualizar una entrada existente: revierte el stock viejo y aplica el nuevo.
 * Recibe el id y los nuevos datos (items, fecha, proveedor, total).
 */
function updateEntrada(id, newData) {
  _ensureStructure();
  var existing = _db.entradas[id];
  if (!existing) throw new Error('Entrada no encontrada: ' + id);
  // 1. Revertir stock de la entrada vieja
  _revertirEntrada(existing);
  // 2. Construir entrada nueva conservando id, creado y meta
  var updated = {
    id: id,
    creado: existing.creado,
    fecha: newData.fecha || existing.fecha,
    proveedor: newData.proveedor != null ? newData.proveedor : (existing.proveedor || ''),
    items: newData.items || [],
    total: Number(newData.total) || 0,
    totalCalculado: newData.totalCalculado != null ? Number(newData.totalCalculado) : (existing.totalCalculado != null ? Number(existing.totalCalculado) : Number(newData.total) || 0),
    totalPagado: newData.totalPagado != null ? Number(newData.totalPagado) : (existing.totalPagado != null ? Number(existing.totalPagado) : Number(newData.total) || 0),
    ajuste: newData.ajuste != null ? Number(newData.ajuste) : (existing.ajuste || 0),
    editado: new Date().toISOString()
  };
  // 3. Aplicar stock de los nuevos items (reutiliza la lógica de saveEntrada con un flag)
  _aplicarItemsEntrada(updated.items);
  // 4. Guardar y notificar
  _db.entradas[id] = updated;
  _saveToFirebase(); _cacheLocal();
  _notify('update', 'entradas', id);
  return updated;
}

/** Aplica el efecto en stock de una lista de items de entrada (helper). */
function _aplicarItemsEntrada(items) {
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var tipo = item.tipo;
    var cantidad = Number(item.cantidad) || 0;
    var costoUnit = Number(item.costoUnitario) || 0;
    if (cantidad <= 0) continue;

    if (tipo === 'especia_grs') {
      if (item.especiaId && _db.especias[item.especiaId]) {
        var espObj = _db.especias[item.especiaId];
        if (cantidad > 0 && costoUnit > 0) {
          var stockPrevio = espObj.stockBolsa || 0;
          var costoPrevio = (_costosInsumos && _costosInsumos.especias && _costosInsumos.especias[item.especiaId]) || 0;
          var nuevoTotalGrs = stockPrevio + cantidad;
          var nuevoCostoProm = 0;
          if (nuevoTotalGrs > 0) {
            nuevoCostoProm = (stockPrevio * costoPrevio + cantidad * costoUnit) / nuevoTotalGrs;
          }
          if (!_costosInsumos) _costosInsumos = Object.assign({}, _COSTOS_DEFAULTS);
          if (!_costosInsumos.especias) _costosInsumos.especias = {};
          _costosInsumos.especias[item.especiaId] = Math.round(nuevoCostoProm * 1000) / 1000;
          if (_costosRef) {
            _costosRef.set(_costosInsumos, function(error) {
              if (error) console.error('[DB] Costos promedio save error:', error);
            });
          }
          try { localStorage.setItem('arcano_costos', JSON.stringify(_costosInsumos)); } catch (e) {}
        }
        espObj.stockBolsa = _r3(espObj.stockBolsa + cantidad);
      }
    } else if (tipo === 'envase') {
      var talla = item.talla || 'chico';
      if (!_db.stockEnvases) _db.stockEnvases = { chico: 0, grande: 0 };
      _db.stockEnvases[talla] = (_db.stockEnvases[talla] || 0) + cantidad;
    } else if (tipo === 'sticker') {
      var stk = _getOrCreateSticker(item.stickerNombre);
      var t = item.talla || 'chico';
      if (t === 'grande') {
        stk.stockGrande = (stk.stockGrande || 0) + cantidad;
      } else {
        stk.stockChico = (stk.stockChico || 0) + cantidad;
      }
    } else if (tipo === 'bolsa') {
      var tallaB = item.talla || 'chico';
      if (!_db.stockBolsas) _db.stockBolsas = { chico: 0, grande: 0 };
      _db.stockBolsas[tallaB] = (_db.stockBolsas[tallaB] || 0) + cantidad;
    } else if (tipo === 'cinta') {
      if (!_db.stockCintas) _db.stockCintas = 0;
      _db.stockCintas = _db.stockCintas + cantidad;
    }
  }
}

function deleteEntrada(id) {
  _ensureStructure();
  var existing = _db.entradas[id];
  if (!existing) return false;
  // Revertir el stock antes de borrar el registro
  _revertirEntrada(existing);
  delete _db.entradas[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'entradas', id);
  return true;
}

/* ==================== AJUSTES MANUALES DE STOCK ==================== */

function getAjustes() {
  return _filterValid(Object.values(_db.ajustes || {})).sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
}

function saveAjuste(data) {
  _ensureStructure();
  if (!_db.ajustes) _db.ajustes = {};
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('ajustes');
    data.creado = new Date().toISOString();
    data.fecha = data.fecha || new Date().toISOString().slice(0, 10);
  }
  var cantidad = Number(data.cantidad) || 0;
  if (cantidad === 0) throw new Error('La cantidad no puede ser 0');
  var cat = data.categoria; // 'especia', 'blend', 'envase', 'bolsa', 'sticker'
  var sub = data.subtipo;   // 'pala', 'chico', 'grande'

  if (cat === 'especia') {
    var esp = _db.especias[data.productoId];
    if (!esp) throw new Error('Especia no encontrada');
    if (sub === 'pala') {
      var nv = (Number(esp.stockBolsa) || 0) + cantidad;
      if (nv < 0) throw new Error('Stock de pala resultante negativo (' + nv + 'g) para ' + esp.nombre);
      esp.stockBolsa = nv;
    } else {
      var field = (sub === 'grande') ? 'stockGrande' : 'stockChico';
      var nv = (Number(esp[field]) || 0) + cantidad;
      if (nv < 0) throw new Error('Stock de frascos resultante negativo (' + nv + ') para ' + esp.nombre);
      esp[field] = nv;
    }
    data.productoNombre = esp.nombre;
  } else if (cat === 'blend') {
    var bl = _db.blends[data.productoId];
    if (!bl) throw new Error('Blend no encontrado');
    var field = (sub === 'grande') ? 'stockGrande' : 'stockChico';
    var nv = (Number(bl[field]) || 0) + cantidad;
    if (nv < 0) throw new Error('Stock resultante negativo (' + nv + ') para ' + bl.nombre);
    bl[field] = nv;
    data.productoNombre = bl.nombre;
  } else if (cat === 'envase') {
    if (!_db.stockEnvases) _db.stockEnvases = { chico: 0, grande: 0 };
    var t = (sub === 'grande') ? 'grande' : 'chico';
    var nv = (_db.stockEnvases[t] || 0) + cantidad;
    if (nv < 0) throw new Error('Stock de frascos ' + t + ' resultante negativo (' + nv + ')');
    _db.stockEnvases[t] = nv;
    data.productoNombre = 'Frascos ' + t;
  } else if (cat === 'bolsa') {
    if (!_db.stockBolsas) _db.stockBolsas = { chico: 0, grande: 0 };
    var t = (sub === 'grande') ? 'grande' : 'chico';
    var nv = (_db.stockBolsas[t] || 0) + cantidad;
    if (nv < 0) throw new Error('Stock de bolsas ' + t + ' resultante negativo (' + nv + ')');
    _db.stockBolsas[t] = nv;
    data.productoNombre = 'Bolsas ' + t;
  } else if (cat === 'sticker') {
    var stk = _getOrCreateSticker(data.productoNombre);
    var field = (sub === 'grande') ? 'stockGrande' : 'stockChico';
    var nv = (Number(stk[field]) || 0) + cantidad;
    if (nv < 0) throw new Error('Stock resultante negativo (' + nv + ') para sticker ' + stk.nombre);
    stk[field] = nv;
  } else if (cat === 'cinta') {
    if (!_db.stockCintas) _db.stockCintas = 0;
    var nv = (_db.stockCintas || 0) + cantidad;
    if (nv < 0) throw new Error('Stock resultante negativo (' + nv + ') para cintas');
    _db.stockCintas = nv;
    data.productoNombre = 'Cintas';
  }

  data.cantidad = cantidad;
  _db.ajustes[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'ajustes', data.id);
  return data;
}

function deleteAjuste(id) {
  if (!_db.ajustes || !_db.ajustes[id]) return false;
  delete _db.ajustes[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'ajustes', id);
  return true;
}

/* ==================== GASTOS ==================== */

function getGastos() {
  return _filterValid(Object.values(_db.gastos || {})).sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || '').localeCompare(a.creado || ''); });
}

function getGastosCategorias() {
  if (!_db.gastosCategorias || !Array.isArray(_db.gastosCategorias) || _db.gastosCategorias.length === 0) {
    return ['Envio', 'Arriendo', 'Servicios', 'Impuestos', 'Marketing', 'Empaque', 'Transporte', 'Otros'];
  }
  return _db.gastosCategorias;
}

function saveGasto(data) {
  _ensureStructure();
  if (!_db.gastos) _db.gastos = {};
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('gastos');
    data.creado = new Date().toISOString();
    data.fecha = data.fecha || new Date().toISOString().slice(0, 10);
  }
  data.monto = Number(data.monto) || 0;
  data.categoria = data.categoria || 'Otros';
  data.descripcion = data.descripcion || '';
  _db.gastos[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'gastos', data.id);
  return data;
}

function deleteGasto(id) {
  if (!_db.gastos || !_db.gastos[id]) return false;
  delete _db.gastos[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'gastos', id);
  return true;
}

function saveGastosCategorias(categorias) {
  _ensureStructure();
  _db.gastosCategorias = categorias;
  _saveToFirebase(); _cacheLocal();
}

/* ==================== PRODUCCION ==================== */

function producirEspecia(especiaId, talla, cantidad) {
  _ensureStructure();
  var esp = _db.especias[especiaId];
  if (!esp) throw new Error('Especia no encontrada');
  talla = (talla === 'grande') ? 'grande' : 'chico';
  cantidad = Number(cantidad) || 0;
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0');

  var gramosPorFrasco = (talla === 'grande') ? (Number(esp.gramosGrande) || 0) : (Number(esp.gramosChico) || 0);
  if (gramosPorFrasco <= 0) throw new Error('La especia no tiene gramos definidos para frasco ' + talla + '. Editala primero.');

  var grsTotal = gramosPorFrasco * cantidad;

  // Check & consume pala (raw material)
  if ((esp.stockBolsa || 0) < grsTotal) {
    throw new Error('Pala insuficiente de "' + esp.nombre + '". Necesitas ' + grsTotal + 'grs, tienes ' + (esp.stockBolsa || 0) + 'grs');
  }

  // Check & consume envases
  if (!_db.stockEnvases) _db.stockEnvases = { chico: 0, grande: 0 };
  if ((_db.stockEnvases[talla] || 0) < cantidad) {
    throw new Error('Envases ' + talla + ' insuficientes. Necesitas ' + cantidad + ', tienes ' + (_db.stockEnvases[talla] || 0));
  }

  // Check & consume stickers
  var stk = _findStickerByNombre(esp.nombre);
  var stkStock = stk ? (Number(stk[talla === 'grande' ? 'stockGrande' : 'stockChico']) || 0) : 0;
  if (stkStock < cantidad) {
    throw new Error('Stickers ' + talla + ' insuficientes para "' + esp.nombre + '". Necesitas ' + cantidad + ', tienes ' + stkStock);
  }

  // Check & consume bolsas (packaging)
  if (!_db.stockBolsas) _db.stockBolsas = { chico: 0, grande: 0 };
  if ((_db.stockBolsas[talla] || 0) < cantidad) {
    throw new Error('Bolsas ' + talla + ' insuficientes. Necesitas ' + cantidad + ', tienes ' + (_db.stockBolsas[talla] || 0));
  }

  // Check & consume cintas
  if (!_db.stockCintas) _db.stockCintas = 0;
  if ((_db.stockCintas || 0) < cantidad) {
    throw new Error('Cintas insuficientes. Necesitas ' + cantidad + ', tienes ' + (_db.stockCintas || 0));
  }

  // All checks passed — consume
  esp.stockBolsa = _r3(esp.stockBolsa - grsTotal);
  _db.stockEnvases[talla] = (_db.stockEnvases[talla] || 0) - cantidad;
  _db.stockBolsas[talla] = (_db.stockBolsas[talla] || 0) - cantidad;
  _db.stockCintas = (_db.stockCintas || 0) - cantidad;
  if (stk) {
    var stkKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
    stk[stkKey] = (stk[stkKey] || 0) - cantidad;
  }
  var frascoKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
  esp[frascoKey] = (esp[frascoKey] || 0) + cantidad;

  // Record
  var prodId = nextId('producciones');
  var prod = {
    id: prodId, tipo: 'especia', productoId: especiaId, productoNombre: esp.nombre,
    categoria: esp.categoria || '', talla: talla, cantidad: cantidad,
    gramosPorFrasco: gramosPorFrasco, gramosTotal: grsTotal,
    envasesConsumidos: cantidad, stickersConsumidos: cantidad, bolsasConsumidas: cantidad, cintasConsumidas: cantidad,
    fecha: new Date().toISOString().slice(0, 10), creado: new Date().toISOString()
  };
  _db.producciones[prodId] = prod;
  _saveToFirebase(); _cacheLocal();
  _notify('create', 'producciones', prodId);
  _notify('update', 'especias', especiaId);
  return { producto: esp, produccion: prod };
}

function producirBlend(blendId, talla, cantidad) {
  _ensureStructure();
  var blend = _db.blends[blendId];
  if (!blend) throw new Error('Blend no encontrado');
  talla = (talla === 'grande') ? 'grande' : 'chico';
  cantidad = Number(cantidad) || 0;
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0');

  var ingredientes = blend.ingredientes || [];
  if (ingredientes.length === 0) throw new Error('El blend no tiene ingredientes definidos. Editalo primero.');

  // Check ingredient stock
  var detalleIngredientes = [];
  for (var i = 0; i < ingredientes.length; i++) {
    var ing = ingredientes[i];
    var esp = _db.especias[ing.especiaId];
    if (!esp) throw new Error('Especia "' + (ing.especiaNombre || ing.especiaId) + '" no encontrada');
    var grsPorFrasco = (talla === 'grande') ? (Number(ing.gramosGrande) || 0) : (Number(ing.gramosChico) || 0);
    if (grsPorFrasco <= 0) throw new Error('El ingrediente "' + esp.nombre + '" no tiene gramos para frasco ' + talla);
    var grsNeeded = grsPorFrasco * cantidad;
    if ((esp.stockBolsa || 0) < grsNeeded) {
      throw new Error('Pala insuficiente de "' + esp.nombre + '". Necesitas ' + grsNeeded + 'grs, tienes ' + (esp.stockBolsa || 0) + 'grs');
    }
    detalleIngredientes.push({ especiaId: ing.especiaId, especiaNombre: esp.nombre, gramosPorFrasco: grsPorFrasco, gramosTotal: grsNeeded });
  }

  // Check envases
  if (!_db.stockEnvases) _db.stockEnvases = { chico: 0, grande: 0 };
  if ((_db.stockEnvases[talla] || 0) < cantidad) {
    throw new Error('Envases ' + talla + ' insuficientes. Necesitas ' + cantidad + ', tienes ' + (_db.stockEnvases[talla] || 0));
  }

  // Check stickers
  var stk = _findStickerByNombre(blend.nombre);
  var stkStock = stk ? (Number(stk[talla === 'grande' ? 'stockGrande' : 'stockChico']) || 0) : 0;
  if (stkStock < cantidad) {
    throw new Error('Stickers ' + talla + ' insuficientes para "' + blend.nombre + '". Necesitas ' + cantidad + ', tienes ' + stkStock);
  }

  // Check & consume bolsas (packaging)
  if (!_db.stockBolsas) _db.stockBolsas = { chico: 0, grande: 0 };
  if ((_db.stockBolsas[talla] || 0) < cantidad) {
    throw new Error('Bolsas ' + talla + ' insuficientes. Necesitas ' + cantidad + ', tienes ' + (_db.stockBolsas[talla] || 0));
  }

  // Check & consume cintas
  if (!_db.stockCintas) _db.stockCintas = 0;
  if ((_db.stockCintas || 0) < cantidad) {
    throw new Error('Cintas insuficientes. Necesitas ' + cantidad + ', tienes ' + (_db.stockCintas || 0));
  }

  // All checks passed — consume
  var grsTotalGeneral = 0;
  for (var i = 0; i < detalleIngredientes.length; i++) {
    var d = detalleIngredientes[i];
    var esp = _db.especias[d.especiaId];
    esp.stockBolsa = _r3(esp.stockBolsa - d.gramosTotal);
    grsTotalGeneral += d.gramosTotal;
  }
  _db.stockEnvases[talla] = (_db.stockEnvases[talla] || 0) - cantidad;
  _db.stockBolsas[talla] = (_db.stockBolsas[talla] || 0) - cantidad;
  _db.stockCintas = (_db.stockCintas || 0) - cantidad;
  if (stk) {
    var stkKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
    stk[stkKey] = (stk[stkKey] || 0) - cantidad;
  }
  var frascoKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
  blend[frascoKey] = (blend[frascoKey] || 0) + cantidad;

  var prodId = nextId('producciones');
  var prod = {
    id: prodId, tipo: 'blend', productoId: blendId, productoNombre: blend.nombre,
    categoria: blend.categoria || '', talla: talla, cantidad: cantidad,
    ingredientes: detalleIngredientes, gramosTotal: grsTotalGeneral,
    envasesConsumidos: cantidad, stickersConsumidos: cantidad, bolsasConsumidas: cantidad, cintasConsumidas: cantidad,
    fecha: new Date().toISOString().slice(0, 10), creado: new Date().toISOString()
  };
  _db.producciones[prodId] = prod;
  _saveToFirebase(); _cacheLocal();
  _notify('create', 'producciones', prodId);
  _notify('update', 'blends', blendId);
  return { producto: blend, produccion: prod };
}

function deleteProduccion(id) {
  _ensureStructure();
  var prod = _db.producciones && _db.producciones[id];
  if (!prod) return false;
  var talla = prod.talla || 'chico';
  var cantidad = Number(prod.cantidad) || 0;
  var frascoKey = talla === 'grande' ? 'stockGrande' : 'stockChico';

  // 1. Restar los frascos producidos del producto
  if (prod.tipo === 'especia') {
    var esp = _db.especias[prod.productoId];
    if (esp) {
      esp[frascoKey] = (esp[frascoKey] || 0) - cantidad;
      if (esp[frascoKey] < 0) esp[frascoKey] = 0;
      // Devolver pala (gramos consumidos)
      if (prod.gramosTotal) {
        esp.stockBolsa = _r3(esp.stockBolsa + prod.gramosTotal);
      }
    }
  } else if (prod.tipo === 'blend') {
    var blend = _db.blends[prod.productoId];
    if (blend) {
      blend[frascoKey] = (blend[frascoKey] || 0) - cantidad;
      if (blend[frascoKey] < 0) blend[frascoKey] = 0;
    }
    // Devolver pala de cada ingrediente
    if (prod.ingredientes) {
      for (var i = 0; i < prod.ingredientes.length; i++) {
        var ing = prod.ingredientes[i];
        var espIng = _db.especias[ing.especiaId];
        if (espIng && ing.gramosTotal) {
          espIng.stockBolsa = _r3(espIng.stockBolsa + ing.gramosTotal);
        }
      }
    } else if (prod.gramosTotal) {
      // Fallback: blend sin ingredientes detallados (producción vieja)
      // No se puede devolver pala por especia, pero al menos registramos
      console.warn('[deleteProduccion] Blend sin ingredientes detallados, no se puede devolver pala por especia');
    }
  }

  // 2. Devolver envases
  if (!_db.stockEnvases) _db.stockEnvases = { chico: 0, grande: 0 };
  _db.stockEnvases[talla] = (_db.stockEnvases[talla] || 0) + cantidad;

  // 3. Devolver bolsas
  if (!_db.stockBolsas) _db.stockBolsas = { chico: 0, grande: 0 };
  _db.stockBolsas[talla] = (_db.stockBolsas[talla] || 0) + cantidad;

  // 4. Devolver cintas
  if (!_db.stockCintas) _db.stockCintas = 0;
  _db.stockCintas = (_db.stockCintas || 0) + cantidad;

  // 5. Devolver stickers
  if (prod.productoNombre) {
    var stk = _findStickerByNombre(prod.productoNombre);
    if (stk) {
      var stkKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
      stk[stkKey] = (stk[stkKey] || 0) + cantidad;
    }
  }

  // Eliminar el registro
  delete _db.producciones[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'producciones', id);
  if (prod.tipo === 'especia') _notify('update', 'especias', prod.productoId);
  else if (prod.tipo === 'blend') _notify('update', 'blends', prod.productoId);
  return true;
}

/* ==================== VENTAS ==================== */

function saveVenta(data) {
  _ensureStructure();
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('ventas');
    data.creado = new Date().toISOString();
    data.fecha = data.fecha || new Date().toISOString().slice(0, 10);
    data.items = data.items || [];
    data.total = Number(data.total) || 0;
  }
  // Separar costo de envío del total de productos (envío NO es venta)
  // El total siempre es SOLO productos. El envío va aparte en envioCosto.
  if (isNew) {
    for (var i = 0; i < data.items.length; i++) {
      var item = data.items[i];
      // PALAS: armado al vender.
      // Costo = peso × costo por gramo (sin bolsa, sin envase).
      // Descuento: primero del costal abierto del producto, si no hay, de la Bodega (stockBolsa).
      if (item.tipo === 'pala') {
        var productoPala;
        if (item.productoTipo === 'blend') {
          productoPala = _db.blends[item.productoId];
        } else {
          productoPala = _db.especias[item.productoId];
        }
        if (!productoPala) throw new Error('Producto no encontrado para pala: ' + (item.productoNombre || item.productoId));
        item.productoNombre = productoPala.nombre;
        var cantP = Number(item.cantidad) || 0;
        var pesoP = Number(item.peso) || Number(productoPala.pesoPala) || 0;
        var grsNecesarios = cantP * pesoP;
        if (pesoP <= 0) throw new Error('El producto "' + productoPala.nombre + '" no tiene peso de pala configurado. Configuralo en Palas → Configuración.');

        // Buscar costal abierto del producto
        var costalAbierto = null;
        var costalKeys = Object.keys(_db.costales || {});
        for (var ci = 0; ci < costalKeys.length; ci++) {
          var c = _db.costales[costalKeys[ci]];
          if (c && c.productoId === item.productoId && c.productoTipo === item.productoTipo && c.estado === 'abierto' && (Number(c.gramosRestantes) || 0) > 0) {
            costalAbierto = c;
            break;
          }
        }

        var grsDisponibles = 0;
        if (costalAbierto) {
          grsDisponibles = Number(costalAbierto.gramosRestantes) || 0;
        } else {
          grsDisponibles = Number(productoPala.stockBolsa) || 0;
        }

        if (grsDisponibles < grsNecesarios) {
          throw new Error('Stock insuficiente de "' + productoPala.nombre + '" para ' + cantP + ' palas de ' + pesoP + 'g. Necesitas ' + grsNecesarios + 'g, tienes ' + grsDisponibles + 'g ' + (costalAbierto ? 'en el costal abierto' : 'en Bodega') + '.');
        }

        // Descontar del costal abierto (si existe) o de Bodega
        if (costalAbierto) {
          costalAbierto.gramosRestantes = (Number(costalAbierto.gramosRestantes) || 0) - grsNecesarios;
          if (costalAbierto.gramosRestantes <= 0) {
            costalAbierto.gramosRestantes = 0;
            costalAbierto.estado = 'vacio';
          }
          item.costalId = costalAbierto.id;
          item.costalNombre = costalAbierto.nombre;
        } else {
          productoPala.stockBolsa = _r3(productoPala.stockBolsa - grsNecesarios);
        }

        item.peso = pesoP;
        item.precioUnitario = Number(item.precioUnitario) || 0;
        item.subtotal = item.precioUnitario * cantP;
        item.talla = 'pala';
        continue;
      }
      // Venta normal (frascos chico/grande)
      var producto;
      if (item.tipo === 'especia') {
        producto = _db.especias[item.productoId];
        if (!producto) throw new Error('Especia no encontrada: ' + item.productoId);
      } else {
        producto = _db.blends[item.productoId];
        if (!producto) throw new Error('Blend no encontrado: ' + item.productoId);
      }
      item.productoNombre = producto.nombre;
      var cant = Number(item.cantidad) || 0;
      var talla = item.talla || 'chico';
      var stockKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
      if ((producto[stockKey] || 0) < cant) {
        throw new Error('Stock insuficiente de frascos ' + talla + ' de "' + producto.nombre + '". Solicitado: ' + cant + ', Disponible: ' + (producto[stockKey] || 0));
      }
      producto[stockKey] = (producto[stockKey] || 0) - cant;
      item.precioUnitario = Number(item.precioUnitario) || 0;
      item.subtotal = item.precioUnitario * cant;
    }
    // Recalculate total (SOLO productos, sin envío)
    data.total = data.items.reduce(function(s, it) { return s + (it.subtotal || 0); }, 0);
    // envioCosto se guarda aparte (no se suma al total)
    // Si la venta viene con envioCosto ya seteado (de un pedido online), se respeta
    if (data.envioCosto == null) data.envioCosto = 0;
    if (data.envioGratis == null) data.envioGratis = false;
  }
  _db.ventas[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'ventas', data.id);
  return data;
}

function deleteVenta(id) {
  _ensureStructure();
  var existing = _db.ventas[id];
  if (!existing) return false;
  // Revertir stock de cada item
  if (existing.items) {
    for (var i = 0; i < existing.items.length; i++) {
      var item = existing.items[i];
      if (item.tipo === 'pala') {
        var prod;
        if (item.productoTipo === 'blend') {
          prod = _db.blends[item.productoId];
        } else {
          prod = _db.especias[item.productoId];
        }
        var grs = (Number(item.cantidad) || 0) * (Number(item.peso) || 0);
        // Si la venta original descontó de un costal, revertir al costal; sino a Bodega
        if (item.costalId && _db.costales && _db.costales[item.costalId]) {
          var costal = _db.costales[item.costalId];
          costal.gramosRestantes = (Number(costal.gramosRestantes) || 0) + grs;
          if (costal.gramosRestantes > 0 && costal.estado === 'vacio') {
            costal.estado = 'abierto';
          }
        } else if (prod) {
          prod.stockBolsa = _r3(prod.stockBolsa + grs);
        }
      } else {
        var producto;
        if (item.tipo === 'especia') {
          producto = _db.especias[item.productoId];
        } else {
          producto = _db.blends[item.productoId];
        }
        if (producto) {
          var talla = item.talla || 'chico';
          var stockKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
          producto[stockKey] = (producto[stockKey] || 0) + (Number(item.cantidad) || 0);
        }
      }
    }
  }
  delete _db.ventas[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'ventas', id);
  return true;
}

/* ==================== AUTH ==================== */
/*
 * Sesion persistente con localStorage (NO sessionStorage).
 * En mobile, sessionStorage se borra al cambiar de app/pestana o
 * cuando el navegador libera memoria en background, lo que cierra
 * la sesion del admin inesperadamente. localStorage persiste hasta
 * logout explicito.
 *
 * Expiracion: 30 dias desde el ultimo login. Si pasa mas tiempo,
 * se exige re-login. Resetable al volver a loguearse.
 */
var SESSION_KEY = DB_KEY + '_session';
var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function authenticateUser(pin) {
  var users = _db.usuarios || {};
  var keys = Object.keys(users);
  for (var i = 0; i < keys.length; i++) {
    var u = users[keys[i]];
    if (u && u.pin === pin && u.activo !== false) {
      var now = Date.now();
      var session = {
        id: u.id,
        nombre: u.nombre,
        rol: u.rol,
        issuedAt: now,
        expiresAt: now + SESSION_TTL_MS
      };
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        // Limpiar sesion vieja de sessionStorage si existia (migracion)
        sessionStorage.removeItem(SESSION_KEY);
      } catch (e) { console.warn('[Auth] No se pudo persistir sesion:', e); }
      return session;
    }
  }
  return null;
}

function getCurrentUser() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      // Migracion: si existe en sessionStorage (version anterior), moverla a localStorage
      raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        try {
          var migrated = JSON.parse(raw);
          if (migrated && migrated.id) {
            var now = Date.now();
            migrated.issuedAt = migrated.issuedAt || now;
            migrated.expiresAt = migrated.expiresAt || (now + SESSION_TTL_MS);
            localStorage.setItem(SESSION_KEY, JSON.stringify(migrated));
            sessionStorage.removeItem(SESSION_KEY);
            return migrated;
          }
        } catch (e2) {}
      }
      return null;
    }
    var session = JSON.parse(raw);
    if (!session || !session.id) return null;
    // Verificar expiracion
    if (session.expiresAt && Date.now() > session.expiresAt) {
      console.info('[Auth] Sesion expirada, elimininando.');
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch (e) { return null; }
}

function logoutUser() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
}

function getUsuarios() {
  return _filterValid(Object.values(_db.usuarios || {}));
}
function saveUsuario(data) {
  _ensureStructure();
  _db.usuarios[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  return data;
}
function deleteUsuario(id) {
  if (id === 'admin') return false;
  delete _db.usuarios[id];
  _saveToFirebase(); _cacheLocal();
  return true;
}

/* ==================== STATS ==================== */

function getStats() {
  var especias = _filterValid(Object.values(_db.especias || {}));
  var blends = _filterValid(Object.values(_db.blends || {}));
  var ventas = _filterValid(Object.values(_db.ventas || {}));
  var stickers = _filterValid(Object.values(_db.stickers || {}));
  var envases = _db.stockEnvases || { chico: 0, grande: 0 };
  var bolsas = _db.stockBolsas || { chico: 0, grande: 0 };

  var today = new Date().toISOString().slice(0, 10);
  var mes = new Date().toISOString().slice(0, 7);
  var ventasHoy = ventas.filter(function(v) { return v.fecha === today; });
  var ventasMes = ventas.filter(function(v) { return v.fecha && v.fecha.startsWith(mes); });

  var frascosChico = especias.reduce(function(s, e) { return s + (e.stockChico || 0); }, 0) +
                     blends.reduce(function(s, b) { return s + (b.stockChico || 0); }, 0);
  var frascosGrande = especias.reduce(function(s, e) { return s + (e.stockGrande || 0); }, 0) +
                      blends.reduce(function(s, b) { return s + (b.stockGrande || 0); }, 0);

  var stkBajo = stickers.filter(function(e) { return (e.stockChico + e.stockGrande) <= 5; });
  var espBolsaBaja = especias.filter(function(e) { return (e.stockBolsa || 0) <= 50; });

  return {
    totalEspecias: especias.length,
    totalBlends: blends.length,
    totalProductos: especias.length + blends.length,
    frascosChico: frascosChico,
    frascosGrande: frascosGrande,
    totalFrascos: frascosChico + frascosGrande,
    envasesChico: envases.chico || 0,
    envasesGrande: envases.grande || 0,
    bolsasChico: bolsas.chico || 0,
    bolsasGrande: bolsas.grande || 0,
    ventasHoy: ventasHoy.length,
    totalVentasHoy: ventasHoy.reduce(function(s, v) { return s + (Number(v.total) || 0); }, 0),
    ventasMes: ventasMes.length,
    totalVentasMes: ventasMes.reduce(function(s, v) { return s + (Number(v.total) || 0); }, 0),
    especiasBolsaBaja: espBolsaBaja,
    stickersBajos: stkBajo
  };
}

/** Items for venta selection: products with frascos > 0 */
function getFrascosParaVender() {
  var items = [];
  var espKeys = Object.keys(_db.especias || {});
  for (var i = 0; i < espKeys.length; i++) {
    var e = _db.especias[espKeys[i]];
    if (!e || typeof e !== 'object') continue;
    if ((e.stockChico || 0) > 0) items.push({ tipo: 'especia', id: e.id, nombre: e.nombre, talla: 'chico', stock: e.stockChico, precio: e.precioChico || 0 });
    if ((e.stockGrande || 0) > 0) items.push({ tipo: 'especia', id: e.id, nombre: e.nombre, talla: 'grande', stock: e.stockGrande, precio: e.precioGrande || 0 });
  }
  var blKeys = Object.keys(_db.blends || {});
  for (var i = 0; i < blKeys.length; i++) {
    var b = _db.blends[blKeys[i]];
    if (!b || typeof b !== 'object') continue;
    if ((b.stockChico || 0) > 0) items.push({ tipo: 'blend', id: b.id, nombre: b.nombre, talla: 'chico', stock: b.stockChico, precio: b.precioChico || 0 });
    if ((b.stockGrande || 0) > 0) items.push({ tipo: 'blend', id: b.id, nombre: b.nombre, talla: 'grande', stock: b.stockGrande, precio: b.precioGrande || 0 });
  }
  return items.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
}

/**
 * Devuelve el histórico de palas vendidas, agregado por (productoId, productoTipo, peso).
 * Filtra ventas con items tipo='pala' y suma cantidades, ingresos y conteo de ventas.
 */
function getPalasVendidas() {
  _ensureStructure();
  var ventas = getVentas();
  var agregado = {};
  var registros = [];
  for (var i = 0; i < ventas.length; i++) {
    var v = ventas[i];
    if (!v.items) continue;
    for (var j = 0; j < v.items.length; j++) {
      var it = v.items[j];
      if (it.tipo !== 'pala') continue;
      var cant = Number(it.cantidad) || 0;
      var sub = Number(it.subtotal) || 0;
      var peso = Number(it.peso) || 0;
      var key = (it.productoTipo || 'especia') + '|' + it.productoId + '|' + peso;
      if (!agregado[key]) {
        agregado[key] = {
          productoNombre: it.productoNombre || '?',
          productoId: it.productoId,
          productoTipo: it.productoTipo || 'especia',
          peso: peso,
          totalVendidas: 0,
          ingresos: 0,
          numVentas: 0,
          gramosConsumidos: 0
        };
      }
      agregado[key].totalVendidas += cant;
      agregado[key].ingresos += sub;
      agregado[key].numVentas += 1;
      agregado[key].gramosConsumidos += cant * peso;
      registros.push({
        ventaId: v.id,
        fecha: v.fecha,
        productoNombre: it.productoNombre,
        productoTipo: it.productoTipo,
        peso: peso,
        cantidad: cant,
        precioUnitario: Number(it.precioUnitario) || 0,
        subtotal: sub
      });
    }
  }
  var listaAgregada = Object.values(agregado);
  listaAgregada.sort(function(a, b) { return b.totalVendidas - a.totalVendidas; });
  registros.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
  return { agregado: listaAgregada, registros: registros };
}

/* ==================== TIENDA (STORE) ==================== */

/** Products visible in the public store (enTienda=true, stock>0) */
function getTiendaProductos() {
  var products = [];
  var espKeys = Object.keys(_db.especias || {});
  for (var i = 0; i < espKeys.length; i++) {
    var e = _db.especias[espKeys[i]];
    if (!e || !e.enTienda) continue;
    if ((e.stockChico || 0) <= 0 && (e.stockGrande || 0) <= 0) continue;
    products.push({
      id: e.id, nombre: e.nombre, tipo: 'especia', categoria: e.categoria || 'Comidas', categorias: e.categorias || [e.categoria || 'Comidas'],
      precioChico: Number(e.precioTiendaChico) || Number(e.precioChico) || 0,
      precioGrande: Number(e.precioTiendaGrande) || Number(e.precioGrande) || 0,
      stockChico: e.stockChico || 0, stockGrande: e.stockGrande || 0,
      region: '', uso: e.uso || ''
    });
  }
  var blKeys = Object.keys(_db.blends || {});
  for (var i = 0; i < blKeys.length; i++) {
    var b = _db.blends[blKeys[i]];
    if (!b || !b.enTienda) continue;
    if ((b.stockChico || 0) <= 0 && (b.stockGrande || 0) <= 0) continue;
    products.push({
      id: b.id, nombre: b.nombre, tipo: 'blend', categoria: b.categoria || 'Comidas', categorias: b.categorias || [b.categoria || 'Comidas'],
      precioChico: Number(b.precioTiendaChico) || Number(b.precioChico) || 0,
      precioGrande: Number(b.precioTiendaGrande) || Number(b.precioGrande) || 0,
      stockChico: b.stockChico || 0, stockGrande: b.stockGrande || 0,
      region: b.region || '', uso: b.uso || ''
    });
  }
  // Packs
  var pkKeys = Object.keys(_db.packs || {});
  for (var i = 0; i < pkKeys.length; i++) {
    var pk = _db.packs[pkKeys[i]];
    if (!pk || !pk.enTienda) continue;
    var blendItems = pk.blendItems || [];
    var minStock = 999999;
    for (var j = 0; j < blendItems.length; j++) {
      var bi2 = blendItems[j];
      var bl2 = _db.blends[bi2.blendId];
      if (!bl2) { minStock = 0; break; }
      var st = bi2.talla === 'grande' ? (bl2.stockGrande || 0) : (bl2.stockChico || 0);
      if (st < minStock) minStock = st;
    }
    if (minStock <= 0) continue;
    products.push({
      id: pk.id, nombre: pk.nombre, tipo: 'pack', categoria: 'Packs', categorias: ['Packs'],
      precioChico: 0, precioGrande: 0, precio: Number(pk.precio) || 0,
      stockChico: 0, stockGrande: 0, stock: minStock,
      region: '', uso: pk.descripcion || '', imagen: pk.imagen || ''
    });
  }
  return products.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
}

/** Toggle enTienda for a product */
function toggleTienda(tipo, id) {
  if (tipo === 'especia' && _db.especias[id]) {
    _db.especias[id].enTienda = !_db.especias[id].enTienda;
  } else if (tipo === 'blend' && _db.blends[id]) {
    _db.blends[id].enTienda = !_db.blends[id].enTienda;
  } else if (tipo === 'pack' && _db.packs[id]) {
    _db.packs[id].enTienda = !_db.packs[id].enTienda;
  } else return;
  _saveToFirebase(); _cacheLocal();
  var colMap = { especia: 'especias', blend: 'blends', pack: 'packs' };
  _notify('update', colMap[tipo] || tipo, id);
}

function toggleEnBlend(especiaId) {
  if (!_db.especias[especiaId]) return;
  _db.especias[especiaId].enBlend = !_db.especias[especiaId].enBlend;
  _saveToFirebase(); _cacheLocal();
  _notify('update', 'especias', especiaId);
}

/* ==================== EXCEL IMPORT ==================== */

/** Find especia by name with flexible matching (exact, prefix, contains, word overlap) */
function findEspeciaByName(nombre) {
  if (!nombre) return null;
  var target = nombre.trim().toLowerCase();
  var keys = Object.keys(_db.especias || {});
  // 1. Exact match
  for (var i = 0; i < keys.length; i++) {
    var e = _db.especias[keys[i]];
    if (e && (e.nombre || '').trim().toLowerCase() === target) return e;
  }
  // 2. Especia name starts with target (e.g. "Color" matches "Color (achiote/...)")
  for (var i = 0; i < keys.length; i++) {
    var e = _db.especias[keys[i]];
    if (e && (e.nombre || '').trim().toLowerCase().indexOf(target) === 0) return e;
  }
  // 3. Target is contained in especia name
  for (var i = 0; i < keys.length; i++) {
    var e = _db.especias[keys[i]];
    if (e && (e.nombre || '').trim().toLowerCase().indexOf(target) >= 0) return e;
  }
  // 4. Word overlap: any word (len>=4) from target appears in especia name
  var targetWords = target.split(/[\s()\/,]+/).filter(function(w) { return w.length >= 4; });
  for (var w = 0; w < targetWords.length; w++) {
    for (var i = 0; i < keys.length; i++) {
      var e = _db.especias[keys[i]];
      if (e && (e.nombre || '').trim().toLowerCase().indexOf(targetWords[w]) >= 0) return e;
    }
  }
  return null;
}

/** Auto-detect categoria from blend USO field */
function _categoriaFromUso(uso) {
  if (!uso) return 'Comidas';
  var u = uso.toLowerCase();
  // Cocteleria keywords
  if (/\b(gin|ron|vodka|whisky|mojito|mule|vermouth|aperitif|coctel)\b/.test(u)) return 'Cocteleria';
  // Infusiones keywords
  if (/\b(relajant|sueño|digestiv|energiz|té|calidez|respiratorio|meditaci|antioxidant|bienestar|infusi)\b/.test(u)) return 'Infusiones';
  return 'Comidas';
}

/**
 * Import especias and blends from parsed Excel data.
 * Returns { especiasCreadas: N, blendsCreados: N, blendsParciales: N, errores: [] }
 *
 * especiasList: [{ nombre, categoria? }]
 * blendsList:   [{ nombre, region, uso, categoria, ingredientes: [{ especia, g, pct }] }]
 * gramosChico:  default grams for frasco chico (e.g. 30)
 * gramosGrande: default grams for frasco grande (e.g. 80)
 */
function importFromExcelData(especiasList, blendsList, gramosChico, gramosGrande) {
  _ensureStructure();
  var resultado = { especiasCreadas: 0, especiasExistentes: 0, blendsCreados: 0, blendsExistentes: 0, ingredientesNoResueltos: [], errores: [] };

  // 1. Create especias (skip if name already exists)
  for (var i = 0; i < especiasList.length; i++) {
    var esp = especiasList[i];
    var nombre = (esp.nombre || '').trim();
    if (!nombre) continue;
    var existing = findEspeciaByName(nombre);
    if (existing) {
      resultado.especiasExistentes++;
      continue;
    }
    saveEspecia({
      nombre: nombre,
      categoria: esp.categoria || 'Comidas',
      precioChico: 0,
      precioGrande: 0,
      gramosChico: Number(gramosChico) || 30,
      gramosGrande: Number(gramosGrande) || 80,
      stockBolsa: 0,
      stockChico: 0,
      stockGrande: 0
    });
    resultado.especiasCreadas++;
  }

  // 2. Create blends (skip if name already exists)
  for (var j = 0; j < blendsList.length; j++) {
    var bl = blendsList[j];
    var nombre = (bl.nombre || '').trim();
    if (!nombre) continue;
    var existingBlend = null;
    var blKeys = Object.keys(_db.blends || {});
    for (var k = 0; k < blKeys.length; k++) {
      if ((_db.blends[blKeys[k]].nombre || '').trim().toLowerCase() === nombre.toLowerCase()) {
        existingBlend = _db.blends[blKeys[k]];
        break;
      }
    }
    if (existingBlend) {
      resultado.blendsExistentes++;
      continue;
    }

    // Resolve ingredients: map specia names to IDs and calculate grams per frasco
    var ings = bl.ingredientes || [];
    var recipeTotal = 0;
    for (var ii = 0; ii < ings.length; ii++) recipeTotal += (Number(ings[ii].g) || 0);
    if (recipeTotal <= 0) recipeTotal = 500;

    var resolvedIngs = [];
    for (var ii = 0; ii < ings.length; ii++) {
      var ing = ings[ii];
      var espObj = findEspeciaByName(ing.especia);
      if (!espObj) {
        resultado.ingredientesNoResueltos.push(nombre + ' → ' + (ing.especia || '?'));
        continue;
      }
      var ingG = Number(ing.g) || 0;
      resolvedIngs.push({
        especiaId: espObj.id,
        especiaNombre: espObj.nombre,
        gramosChico: Math.round((ingG / recipeTotal) * (Number(gramosChico) || 30) * 100) / 100,
        gramosGrande: Math.round((ingG / recipeTotal) * (Number(gramosGrande) || 80) * 100) / 100,
        gramosReceta: ingG
      });
    }

    var cat = bl.categoria || _categoriaFromUso(bl.uso);
    saveBlend({
      nombre: nombre,
      categoria: cat,
      region: bl.region || '',
      uso: bl.uso || '',
      precioChico: 0,
      precioGrande: 0,
      ingredientes: resolvedIngs,
      stockChico: 0,
      stockGrande: 0
    });
    resultado.blendsCreados++;
  }

  return resultado;
}

/* ==================== PRODUCT TAGS ==================== */

function getProductTags() {
  _ensureStructure();
  return _db.productTags || {};
}

function getTagsForCategoria(cat) {
  var tags = getProductTags();
  return tags[cat] || [];
}

function addProductTag(cat, tagName) {
  _ensureStructure();
  tagName = (tagName || '').trim();
  if (!tagName) return false;
  if (!_db.productTags) _db.productTags = {};
  if (!_db.productTags[cat]) _db.productTags[cat] = [];
  // Check duplicate (case-insensitive)
  for (var i = 0; i < _db.productTags[cat].length; i++) {
    if (_db.productTags[cat][i].toLowerCase() === tagName.toLowerCase()) return false;
  }
  _db.productTags[cat].push(tagName);
  _saveToFirebase(); _cacheLocal();
  return true;
}

function removeProductTag(cat, tagName) {
  _ensureStructure();
  if (!_db.productTags || !_db.productTags[cat]) return false;
  var idx = -1;
  for (var i = 0; i < _db.productTags[cat].length; i++) {
    if (_db.productTags[cat][i] === tagName) { idx = i; break; }
  }
  if (idx < 0) return false;
  _db.productTags[cat].splice(idx, 1);
  // Also remove from all products that have this tag
  var allEsp = getEspecias();
  for (var e = 0; e < allEsp.length; e++) {
    if (allEsp[e].tags) {
      var ti = allEsp[e].tags.indexOf(tagName);
      if (ti >= 0) { allEsp[e].tags.splice(ti, 1); }
    }
  }
  var allBl = getBlends();
  for (var b = 0; b < allBl.length; b++) {
    if (allBl[b].tags) {
      var bi = allBl[b].tags.indexOf(tagName);
      if (bi >= 0) { allBl[b].tags.splice(bi, 1); }
    }
  }
  _saveToFirebase(); _cacheLocal();
  return true;
}

/* ==================== USO OPTIONS ==================== */

function getUsoOptions() {
  _ensureStructure();
  return _db.usoOptions || [];
}

function addUsoOption(optionName) {
  _ensureStructure();
  optionName = (optionName || '').trim();
  if (!optionName) return false;
  if (!_db.usoOptions) _db.usoOptions = [];
  for (var i = 0; i < _db.usoOptions.length; i++) {
    if (_db.usoOptions[i].toLowerCase() === optionName.toLowerCase()) return false;
  }
  _db.usoOptions.push(optionName);
  _saveToFirebase(); _cacheLocal();
  return true;
}

function removeUsoOption(optionName) {
  _ensureStructure();
  if (!_db.usoOptions) return false;
  var idx = -1;
  for (var i = 0; i < _db.usoOptions.length; i++) {
    if (_db.usoOptions[i] === optionName) { idx = i; break; }
  }
  if (idx < 0) return false;
  _db.usoOptions.splice(idx, 1);
  _saveToFirebase(); _cacheLocal();
  return true;
}

/* ==================== IMAGE HELPER ==================== */

function compressImage(file, maxW, quality, cb) {
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      cb(null, dataUrl);
    };
    img.onerror = function() { cb('Error al cargar imagen'); };
    img.src = ev.target.result;
  };
  reader.onerror = function() { cb('Error al leer archivo'); };
  reader.readAsDataURL(file);
}

/* ==================== PUNTOS DE VENTA ==================== */

function getPuntosDeVenta() {
  _ensureStructure();
  return _filterValid(Object.values(_db.puntosDeVenta || {})).sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
}

function getPuntoDeVenta(id) {
  _ensureStructure();
  return _db.puntosDeVenta ? _db.puntosDeVenta[id] : null;
}

function savePuntoDeVenta(data) {
  _ensureStructure();
  if (!_db.puntosDeVenta) _db.puntosDeVenta = {};
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('puntosDeVenta');
    data.creado = new Date().toISOString();
    data.stock = data.stock || {};
  }
  _db.puntosDeVenta[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'puntosDeVenta', data.id);
  return data;
}

function deletePuntoDeVenta(id) {
  _ensureStructure();
  var pdv = _db.puntosDeVenta ? _db.puntosDeVenta[id] : null;
  if (!pdv) return false;
  // Return all stock to main inventory
  var stock = pdv.stock || {};
  var keys = Object.keys(stock);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var cant = Number(stock[k]) || 0;
    if (cant <= 0) continue;
    var parts = k.split('_');
    var tipo = parts[0], prodId = Number(parts[1]), talla = parts[2];
    var producto;
    if (tipo === 'blend') producto = _db.blends[prodId];
    else if (tipo === 'pack') producto = _db.packs[prodId];
    else producto = _db.especias[prodId];
    if (producto) {
      if (tipo === 'pack') {
        producto.stock = (Number(producto.stock) || 0) + cant;
      } else {
        var frascoKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
        producto[frascoKey] = (producto[frascoKey] || 0) + cant;
      }
    }
  }
  // Return all costales to main inventory
  var stockCostales = pdv.stockCostales || {};
  var costalKeys = Object.keys(stockCostales);
  for (var ci = 0; ci < costalKeys.length; ci++) {
    var costalKey = costalKeys[ci];
    var gramos = Number(stockCostales[costalKey]) || 0;
    if (gramos <= 0) continue;
    var costal = _db.costales && _db.costales[costalKey];
    if (costal) {
      costal.gramosRestantes = (Number(costal.gramosRestantes) || 0) + gramos;
      if (costal.gramosRestantes > 0 && costal.estado === 'vacio') costal.estado = 'abierto';
    }
  }
  delete _db.puntosDeVenta[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'puntosDeVenta', id);
  return true;
}

function moverStockAPDV(pdvId, items) {
  _ensureStructure();
  var pdv = _db.puntosDeVenta ? _db.puntosDeVenta[pdvId] : null;
  if (!pdv) throw new Error('Punto de venta no encontrado');
  if (!pdv.stock) pdv.stock = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var producto;
    if (it.tipo === 'pack') {
      producto = _db.packs[it.productoId];
      if (!producto) throw new Error('Pack no encontrado: ' + it.productoId);
      if ((producto.stock || 0) < it.cantidad) {
        throw new Error('Stock insuficiente de ' + producto.nombre + ' (pack): tienes ' + (producto.stock || 0) + ', necesitas ' + it.cantidad);
      }
    } else {
      producto = it.tipo === 'blend' ? _db.blends[it.productoId] : _db.especias[it.productoId];
      if (!producto) throw new Error('Producto no encontrado: ' + it.tipo + ' ' + it.productoId);
      var frascoKey = it.talla === 'grande' ? 'stockGrande' : 'stockChico';
      if ((producto[frascoKey] || 0) < it.cantidad) {
        throw new Error('Stock insuficiente de ' + producto.nombre + ' (' + it.talla + '): tienes ' + (producto[frascoKey] || 0) + ', necesitas ' + it.cantidad);
      }
    }
  }
  // All checks passed - deduct from main, add to PDV
  for (var j = 0; j < items.length; j++) {
    var it2 = items[j];
    var prod2, fk2, stockKey;
    if (it2.tipo === 'pack') {
      var pack2 = _db.packs[it2.productoId];
      pack2.stock = (pack2.stock || 0) - it2.cantidad;
      _notify('update', 'packs', it2.productoId);
      stockKey = 'pack_' + it2.productoId + '_-';
    } else {
      prod2 = it2.tipo === 'blend' ? _db.blends[it2.productoId] : _db.especias[it2.productoId];
      fk2 = it2.talla === 'grande' ? 'stockGrande' : 'stockChico';
      prod2[fk2] = (prod2[fk2] || 0) - it2.cantidad;
      stockKey = it2.tipo + '_' + it2.productoId + '_' + it2.talla;
    }
    pdv.stock[stockKey] = (pdv.stock[stockKey] || 0) + it2.cantidad;
  }
  _saveToFirebase(); _cacheLocal();
  _notify('update', 'puntosDeVenta', pdvId);
}

function devolverStockDePDV(pdvId, items) {
  _ensureStructure();
  var pdv = _db.puntosDeVenta ? _db.puntosDeVenta[pdvId] : null;
  if (!pdv) throw new Error('Punto de venta no encontrado');
  if (!pdv.stock) pdv.stock = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var stockKey = it.tipo + '_' + it.productoId + '_' + it.talla;
    if ((pdv.stock[stockKey] || 0) < it.cantidad) {
      throw new Error('Stock insuficiente en PDV para devolver');
    }
  }
  for (var j = 0; j < items.length; j++) {
    var it2 = items[j];
    var stockKey2 = it2.tipo + '_' + it2.productoId + '_' + it2.talla;
    pdv.stock[stockKey2] = (pdv.stock[stockKey2] || 0) - it2.cantidad;
    var prod2;
    if (it2.tipo === 'pack') {
      var pack3 = _db.packs[it2.productoId];
      pack3.stock = (pack3.stock || 0) + it2.cantidad;
      _notify('update', 'packs', it2.productoId);
    } else {
      prod2 = it2.tipo === 'blend' ? _db.blends[it2.productoId] : _db.especias[it2.productoId];
      if (prod2) {
        var fk2 = it2.talla === 'grande' ? 'stockGrande' : 'stockChico';
        prod2[fk2] = (prod2[fk2] || 0) + it2.cantidad;
      }
    }
  }
  _saveToFirebase(); _cacheLocal();
  _notify('update', 'puntosDeVenta', pdvId);
}

/**
 * Devuelve gramos de un costal desde el PDV al costal principal.
 * Los gramos vuelven al costal.gramosRestantes.
 */
function devolverCostalDePDV(pdvId, costalId, gramos) {
  _ensureStructure();
  var pdv = _db.puntosDeVenta ? _db.puntosDeVenta[pdvId] : null;
  if (!pdv) throw new Error('Punto de venta no encontrado');
  if (!pdv.stockCostales) pdv.stockCostales = {};
  gramos = Number(gramos) || 0;
  if (gramos <= 0) throw new Error('Gramos inválidos');
  var disponible = Number(pdv.stockCostales[costalId]) || 0;
  if (disponible < gramos) {
    throw new Error('Gramos insuficientes en PDV. Disponibles: ' + disponible + 'g');
  }
  // Restar del PDV
  pdv.stockCostales[costalId] = disponible - gramos;
  // Devolver al costal principal
  var costal = _db.costales && _db.costales[costalId];
  if (costal) {
    costal.gramosRestantes = (Number(costal.gramosRestantes) || 0) + gramos;
    if (costal.gramosRestantes > 0 && costal.estado === 'vacio') costal.estado = 'abierto';
  }
  _saveToFirebase(); _cacheLocal();
  _notify('update', 'puntosDeVenta', pdvId);
  _notify('update', 'costales', costalId);
}

function getPDVVentas(pdvId) {
  _ensureStructure();
  var all = _db.pdvVentas || {};
  var result = [];
  var keys = Object.keys(all);
  for (var i = 0; i < keys.length; i++) {
    var v = all[keys[i]];
    if (v.puntoDeVentaId === pdvId) result.push(v);
  }
  return result.sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });
}

function getPDVStats(pdvId) {
  _ensureStructure();
  var pdv = _db.puntosDeVenta ? _db.puntosDeVenta[pdvId] : null;
  var ventas = getPDVVentas(pdvId);
  var stock = (pdv && pdv.stock) || {};
  var totalIngresos = 0, totalVentas = ventas.length, totalItemsEnStock = 0, productosEnStock = 0;
  var stockKeys = Object.keys(stock);
  for (var si = 0; si < stockKeys.length; si++) {
    var cant = Number(stock[stockKeys[si]]) || 0;
    if (cant > 0) { totalItemsEnStock += cant; productosEnStock++; }
  }
  var productoVentaMap = {};
  for (var vi = 0; vi < ventas.length; vi++) {
    var v = ventas[vi];
    totalIngresos += (v.total || 0);
    var vItems = v.items || [];
    for (var vj = 0; vj < vItems.length; vj++) {
      var vIt = vItems[vj];
      var prod = vIt.tipo === 'blend' ? _db.blends[vIt.productoId] : _db.especias[vIt.productoId];
      var nombre = prod ? prod.nombre : '?';
      if (!productoVentaMap[nombre]) productoVentaMap[nombre] = { cantidad: 0, monto: 0 };
      productoVentaMap[nombre].cantidad += (vIt.cantidad || 0);
      productoVentaMap[nombre].monto += (vIt.subtotal || (vIt.precioUnitario || 0) * (vIt.cantidad || 0));
    }
  }
  var topArr = Object.keys(productoVentaMap).map(function(n) { return { nombre: n, cantidad: productoVentaMap[n].cantidad, monto: productoVentaMap[n].monto }; });
  topArr.sort(function(a, b) { return b.monto - a.monto; });
  // Daily income map
  var dailyMap = {};
  for (var di = 0; di < ventas.length; di++) {
    var d = ventas[di].fecha || ventas[di].creado;
    if (d) {
      var day = d.substring(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + (ventas[di].total || 0);
    }
  }
  return {
    totalIngresos: totalIngresos,
    totalVentas: totalVentas,
    totalItemsEnStock: totalItemsEnStock,
    productosEnStock: productosEnStock,
    ticketPromedio: totalVentas > 0 ? totalIngresos / totalVentas : 0,
    topProductos: topArr,
    dailyMap: dailyMap
  };
}

function savePDVVenta(data) {
  _ensureStructure();
  if (!_db.pdvVentas) _db.pdvVentas = {};
  data.id = nextId('pdvVentas');
  data.creado = new Date().toISOString();
  data.fecha = data.fecha || new Date().toISOString().slice(0, 10);
  // Deduct stock from PDV
  var pdv = _db.puntosDeVenta ? _db.puntosDeVenta[data.puntoDeVentaId] : null;
  if (!pdv) throw new Error('Punto de venta no encontrado');
  if (!pdv.stock) pdv.stock = {};
  var total = 0;
  var items = data.items || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var stockKey = it.tipo + '_' + it.productoId + '_' + it.talla;
    if ((pdv.stock[stockKey] || 0) < it.cantidad) {
      throw new Error('Stock insuficiente de ' + (it.productoNombre || '') + ' (' + it.talla + ') en PDV');
    }
  }
  for (var j = 0; j < items.length; j++) {
    var it2 = items[j];
    var sk = it2.tipo + '_' + it2.productoId + '_' + it2.talla;
    pdv.stock[sk] = (pdv.stock[sk] || 0) - it2.cantidad;
    it2.subtotal = (it2.precioUnitario || 0) * (it2.cantidad || 0);
    total += it2.subtotal;
  }
  data.total = total;
  // Also add to main ventas for global stats
  var mainVenta = {
    id: nextId('ventas'),
    fecha: data.fecha,
    creado: data.creado,
    items: items.map(function(it) {
      return { tipo: it.tipo, productoId: it.productoId, talla: it.talla, cantidad: it.cantidad, precioUnitario: it.precioUnitario, subtotal: it.subtotal, productoNombre: it.productoNombre || '' };
    }),
    total: total,
    pdvId: data.puntoDeVentaId,
    pdvNombre: data.puntoDeVentaNombre,
    metodoPago: data.metodoPago || 'efectivo'
  };
  _db.ventas[mainVenta.id] = mainVenta;
  _db.pdvVentas[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify('create', 'pdvVentas', data.id);
  _notify('create', 'ventas', mainVenta.id);
  return data;
}

/* ==================== COSTOS DE INSUMOS (FIREBASE SEPARATE) ==================== */
var _COSTOS_DEFAULTS = { envaseChico: 0, envaseGrande: 0, bolsaChica: 0, bolsaGrande: 0, cinta: 0, stickerChico: 0, stickerGrande: 0, especias: {} };

function getCostosInsumos() {
  return _costosInsumos || Object.assign({}, _COSTOS_DEFAULTS);
}

function saveCostosInsumos(data) {
  _costosInsumos = data;
  try { localStorage.setItem('arcano_costos', JSON.stringify(data)); } catch (e) {}
  if (_costosRef) {
    _costosRef.set(data, function(error) {
      if (error) {
        console.error('[DB] Costos save error:', error);
        alert('Error al guardar costos: ' + error.message);
      }
    });
  }
  for (var i = 0; i < _costosListeners.length; i++) {
    try { _costosListeners[i](_costosInsumos); } catch (e) {}
  }
  _notify('update', 'costosInsumos', 'global');
  return data;
}

function onCostosChange(callback) {
  _costosListeners.push(callback);
}

function _startCostosListener() {
  try {
    var cached = JSON.parse(localStorage.getItem('arcano_costos'));
    if (cached && typeof cached === 'object' && cached.especias) {
      // Si especias es array (formato antiguo), migrar a object
      if (Array.isArray(cached.especias)) {
        var espObj = {};
        for (var ci = 0; ci < cached.especias.length; ci++) {
          if (cached.especias[ci] != null) {
            espObj[String(ci)] = cached.especias[ci];
          }
        }
        cached.especias = espObj;
        try { localStorage.setItem('arcano_costos', JSON.stringify(cached)); } catch (e2) {}
      }
      _costosInsumos = cached;
      _costosReady = true;
    }
  } catch (e) {}
  if (!_costosRef) return;
  _costosRef.on('value', function(snap) {
    var data = snap.val();
    if (data && typeof data === 'object') {
      _costosInsumos = data;
      try { localStorage.setItem('arcano_costos', JSON.stringify(data)); } catch (e) {}
    } else if (!_costosInsumos) {
      _costosInsumos = Object.assign({}, _COSTOS_DEFAULTS);
    }
    _costosReady = true;
    for (var i = 0; i < _costosListeners.length; i++) {
      try { _costosListeners[i](_costosInsumos); } catch (e) {}
    }
  });
}

/* ==================== COSTOS DE PRODUCCION POR PRODUCTO ==================== */

/** Returns the production cost of a single unit (frasco) of a product */
function getCostoProducto(tipo, productoId, talla) {
  var costos = _costosInsumos || _COSTOS_DEFAULTS;
  var pkgC = (Number(costos.envaseChico) || 0) + (Number(costos.bolsaChica) || 0) + (Number(costos.cinta) || 0) + (Number(costos.stickerChico) || 0);
  var pkgG = (Number(costos.envaseGrande) || 0) + (Number(costos.bolsaGrande) || 0) + (Number(costos.cinta) || 0) + (Number(costos.stickerGrande) || 0);
  var pkg = talla === 'grande' ? pkgG : pkgC;
  if (tipo === 'especia') {
    var esp = _db.especias[productoId];
    if (!esp) return 0;
    var gramos = talla === 'grande' ? (Number(esp.gramosGrande) || 0) : (Number(esp.gramosChico) || 0);
    var costoGrs = (costos.especias && costos.especias[productoId]) || 0;
    return gramos * costoGrs + pkg;
  } else if (tipo === 'blend') {
    var blend = _db.blends[productoId];
    if (!blend) return 0;
    var ings = blend.ingredientes || [];
    var total = 0;
    for (var i = 0; i < ings.length; i++) {
      var g = talla === 'grande' ? (Number(ings[i].gramosGrande) || 0) : (Number(ings[i].gramosChico) || 0);
      var cpg = (costos.especias && costos.especias[ings[i].especiaId]) || 0;
      total += g * cpg;
    }
    return total + pkg;
  }
  return pkg;
}

/** Get all sales grouped by channel with production costs */
function getCostosPorCanal() {
  var costos = _costosInsumos || _COSTOS_DEFAULTS;
  var pkgC = (Number(costos.envaseChico) || 0) + (Number(costos.bolsaChica) || 0) + (Number(costos.cinta) || 0) + (Number(costos.stickerChico) || 0);
  var pkgG = (Number(costos.envaseGrande) || 0) + (Number(costos.bolsaGrande) || 0) + (Number(costos.cinta) || 0) + (Number(costos.stickerGrande) || 0);

  var channels = {
    admin: { nombre: 'Ventas Admin', ventas: 0, ingreso: 0, costo: 0, productos: {} },
    tienda: { nombre: 'Tienda Online', ventas: 0, ingreso: 0, costo: 0, productos: {} },
    pdv: { nombre: 'Puntos de Venta', ventas: 0, ingreso: 0, costo: 0, productos: {}, pdvs: {} }
  };

  // 1. Admin ventas (sin pdvId)
  var ventas = getVentas();
  for (var i = 0; i < ventas.length; i++) {
    var v = ventas[i];
    var canal = v.pdvId ? 'pdv' : 'admin';
    var ch = channels[canal];
    ch.ventas++;
    ch.ingreso += (v.total || 0);
    var items = v.items || [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var tipo = it.tipo || 'especia';
      var pid = it.productoId;
      var talla = it.talla || 'chico';
      var cant = it.cantidad || 0;
      var costoUnit = getCostoProducto(tipo, pid, talla);
      var costoTotal = costoUnit * cant;
      ch.costo += costoTotal;
      var key = (it.productoNombre || '?') + '|' + talla;
      if (!ch.productos[key]) ch.productos[key] = { nombre: it.productoNombre || '?', tipo: tipo, talla: talla, cantidad: 0, ingreso: 0, costo: 0 };
      ch.productos[key].cantidad += cant;
      ch.productos[key].ingreso += (it.subtotal || 0);
      ch.productos[key].costo += costoTotal;
      if (canal === 'pdv' && v.pdvNombre) {
        if (!ch.pdvs[v.pdvNombre]) ch.pdvs[v.pdvNombre] = { ventas: 0, ingreso: 0, costo: 0, productos: {} };
        var pv = ch.pdvs[v.pdvNombre];
        pv.ventas++;
        pv.ingreso += (it.subtotal || 0);
        pv.costo += costoTotal;
        var pk2 = (it.productoNombre || '?') + '|' + talla;
        if (!pv.productos[pk2]) pv.productos[pk2] = { nombre: it.productoNombre || '?', tipo: tipo, talla: talla, cantidad: 0, ingreso: 0, costo: 0 };
        pv.productos[pk2].cantidad += cant;
        pv.productos[pk2].ingreso += (it.subtotal || 0);
        pv.productos[pk2].costo += costoTotal;
      }
    }
  }

  // 2. Tienda pedidos (entregados)
  var pedidos = getPedidos();
  for (var pi = 0; pi < pedidos.length; pi++) {
    var p = pedidos[pi];
    if (p.estado === 'cancelado') continue;
    var ch2 = channels.tienda;
    ch2.ventas++;
    ch2.ingreso += (p.total || 0);
    var pItems = p.items || [];
    for (var pj = 0; pj < pItems.length; pj++) {
      var pit = pItems[pj];
      var ptipo = pit.tipo || 'especia';
      var ppid = pit.productoId;
      var ptalla = pit.talla || 'chico';
      var pcant = pit.qty || pit.cantidad || 0;
      var pcostoUnit = getCostoProducto(ptipo, ppid, ptalla);
      var pcostoTotal = pcostoUnit * pcant;
      ch2.costo += pcostoTotal;
      var pkey = (pit.nombre || '?') + '|' + ptalla;
      if (!ch2.productos[pkey]) ch2.productos[pkey] = { nombre: pit.nombre || '?', tipo: ptipo, talla: ptalla, cantidad: 0, ingreso: 0, costo: 0 };
      ch2.productos[pkey].cantidad += pcant;
      ch2.productos[pkey].ingreso += (pit.subtotal || pit.precio * pcant || 0);
      ch2.productos[pkey].costo += pcostoTotal;
    }
  }

  // 3. Stock costs per channel
  channels.admin.stockCosto = 0;
  channels.admin.stockDetalle = [];
  var espKeys = Object.keys(_db.especias || {});
  for (var ei = 0; ei < espKeys.length; ei++) {
    var e = _db.especias[espKeys[ei]];
    if (!e || typeof e !== 'object') continue;
    var ecCh = getCostoProducto('especia', e.id, 'chico') * (e.stockChico || 0);
    var ecGr = getCostoProducto('especia', e.id, 'grande') * (e.stockGrande || 0);
    channels.admin.stockCosto += ecCh + ecGr;
    if (ecCh + ecGr > 0) channels.admin.stockDetalle.push({ nombre: e.nombre, tipo: 'especia', chico: e.stockChico || 0, grande: e.stockGrande || 0, costoChico: getCostoProducto('especia', e.id, 'chico'), costoGrande: getCostoProducto('especia', e.id, 'grande'), costoTotal: ecCh + ecGr });
  }
  var blKeys = Object.keys(_db.blends || {});
  for (var bi = 0; bi < blKeys.length; bi++) {
    var b = _db.blends[blKeys[bi]];
    if (!b || typeof b !== 'object') continue;
    var bcCh = getCostoProducto('blend', b.id, 'chico') * (b.stockChico || 0);
    var bcGr = getCostoProducto('blend', b.id, 'grande') * (b.stockGrande || 0);
    channels.admin.stockCosto += bcCh + bcGr;
    if (bcCh + bcGr > 0) channels.admin.stockDetalle.push({ nombre: b.nombre, tipo: 'blend', chico: b.stockChico || 0, grande: b.stockGrande || 0, costoChico: getCostoProducto('blend', b.id, 'chico'), costoGrande: getCostoProducto('blend', b.id, 'grande'), costoTotal: bcCh + bcGr });
  }

  // Tienda stock = same as admin stock but only enTienda products
  channels.tienda.stockCosto = 0;
  channels.tienda.stockDetalle = [];
  for (var ti = 0; ti < espKeys.length; ti++) {
    var te = _db.especias[espKeys[ti]];
    if (!te || !te.enTienda) continue;
    var tecCh = getCostoProducto('especia', te.id, 'chico') * (te.stockChico || 0);
    var tecGr = getCostoProducto('especia', te.id, 'grande') * (te.stockGrande || 0);
    channels.tienda.stockCosto += tecCh + tecGr;
    if (tecCh + tecGr > 0) channels.tienda.stockDetalle.push({ nombre: te.nombre, tipo: 'especia', chico: te.stockChico || 0, grande: te.stockGrande || 0, costoChico: getCostoProducto('especia', te.id, 'chico'), costoGrande: getCostoProducto('especia', te.id, 'grande'), costoTotal: tecCh + tecGr });
  }
  for (var tbi = 0; tbi < blKeys.length; tbi++) {
    var tb = _db.blends[blKeys[tbi]];
    if (!tb || !tb.enTienda) continue;
    var tbcCh = getCostoProducto('blend', tb.id, 'chico') * (tb.stockChico || 0);
    var tbcGr = getCostoProducto('blend', tb.id, 'grande') * (tb.stockGrande || 0);
    channels.tienda.stockCosto += tbcCh + tbcGr;
    if (tbcCh + tbcGr > 0) channels.tienda.stockDetalle.push({ nombre: tb.nombre, tipo: 'blend', chico: tb.stockChico || 0, grande: tb.stockGrande || 0, costoChico: getCostoProducto('blend', tb.id, 'chico'), costoGrande: getCostoProducto('blend', tb.id, 'grande'), costoTotal: tbcCh + tbcGr });
  }

  // PDV stock
  channels.pdv.stockCosto = 0;
  channels.pdv.stockDetalle = [];
  var pdvs = _filterValid(Object.values(_db.puntosDeVenta || {}));
  for (var pi2 = 0; pi2 < pdvs.length; pi2++) {
    var pdv = pdvs[pi2];
    var pdvStock = pdv.stock || {};
    var pdvCosto = 0;
    var sks = Object.keys(pdvStock);
    for (var si = 0; si < sks.length; si++) {
      var cant = Number(pdvStock[sks[si]]) || 0;
      if (cant <= 0) continue;
      var parts = sks[si].split('_');
      var stipo = parts[0], sprodId = Number(parts[1]), stalla = parts[2];
      var cu = getCostoProducto(stipo, sprodId, stalla);
      pdvCosto += cu * cant;
    }
    channels.pdv.stockCosto += pdvCosto;
    if (pdvCosto > 0) channels.pdv.stockDetalle.push({ nombre: pdv.nombre || 'PDV', tipo: 'pdv', chico: 0, grande: 0, costoChico: 0, costoGrande: 0, costoTotal: pdvCosto, pdvId: pdv.id });
  }

  return channels;
}

/* ==================== PACKS DE BLENDS ==================== */

function getPacks() {
  return _filterValid(Object.values(_db.packs || {})).sort(function(a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
}

function getPack(id) {
  return (_db.packs || {})[id];
}

function producirPack(packId, cantidad) {
  _ensureStructure();
  var pack = _db.packs[packId];
  if (!pack) throw new Error('Pack no encontrado');
  cantidad = Number(cantidad) || 0;
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0');

  var blendItems = pack.blendItems || [];
  if (blendItems.length === 0) throw new Error('El pack no tiene blends asignados');

  // Check and consume blend stock (frascos ya producidos)
  var detalleBlends = [];
  for (var i = 0; i < blendItems.length; i++) {
    var bi = blendItems[i];
    var blend = _db.blends[bi.blendId];
    if (!blend) throw new Error('Blend #' + bi.blendId + ' no encontrado');
    var talla = (bi.talla === 'grande') ? 'grande' : 'chico';
    var frascoKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
    var disponible = blend[frascoKey] || 0;
    if (disponible < cantidad) {
      throw new Error('Stock insuficiente de ' + blend.nombre + ' (' + talla + '). Necesitas ' + cantidad + ' frascos, tienes ' + disponible);
    }
    blend[frascoKey] = disponible - cantidad;
    detalleBlends.push({ blendId: blend.id, blendNombre: blend.nombre, talla: talla, cantidad: cantidad });
    _notify('update', 'blends', blend.id);
  }

  // Store pack stock
  pack.stock = (pack.stock || 0) + cantidad;
  _notify('update', 'packs', pack.id);

  // Create production record
  var prodId = nextId('producciones');
  var prod = {
    id: prodId, tipo: 'pack', productoId: packId, productoNombre: pack.nombre,
    categoria: 'Pack', talla: '-', cantidad: cantidad,
    ingredientes: detalleBlends, gramosTotal: 0,
    envasesConsumidos: 0, stickersConsumidos: 0, bolsasConsumidas: 0, cintasConsumidas: 0,
    fecha: new Date().toISOString().slice(0, 10), creado: new Date().toISOString()
  };
  _db.producciones[prodId] = prod;
  _notify('create', 'producciones', prodId);

  _saveToFirebase(); _cacheLocal();
  return { pack: pack, produccion: prod };
}

function savePack(data) {
  var isNew = !data.id || !_db.packs[data.id];
  if (isNew) {
    data.id = nextId('packs');
    data.creado = new Date().toISOString();
  }
  _db.packs[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'packs', data.id);
  return data;
}

function deletePack(id) {
  if (!_db.packs[id]) return false;
  delete _db.packs[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'packs', id);
  return true;
}

/* ==================== COSTALES ====================
   Un costal es un saco/bolsa que contiene una o varias especias
   con gramos específicos. Se vende en PDV por "palas" (scoops).
   Cada pala consume X gramos del costal (gramosPorPala).
   El precio por pala lo define el admin.

   Estructura:
   costal = {
     id, creado, nombre,
     items: [{especiaId, especiaNombre, gramos}],
     gramosTotal,       // suma de items.gramos
     gramosRestantes,   // gramos disponibles para vender
     precioPala,        // precio por pala (scoop)
     gramosPorPala,     // gramos que consume 1 pala (default 50)
     estado,            // 'abierto' | 'cerrado' | 'vacio'
     nota
   }
   ================================================================== */

function getCostales() {
  return _filterValid(Object.values(_db.costales || {})).sort(function(a, b) {
    return (b.creado || '').localeCompare(a.creado || '');
  });
}

function getCostal(id) {
  return _db.costales && _db.costales[id] ? _db.costales[id] : null;
}

function saveCostal(data) {
  _ensureStructure();
  var isNew = !data.id;
  if (isNew) {
    data.id = nextId('costales');
    data.creado = new Date().toISOString();
  }
  // Calcular gramosTotal
  var gramosTotal = 0;
  if (data.items && data.items.length > 0) {
    // Costal multi-ingrediente
    for (var i = 0; i < data.items.length; i++) {
      gramosTotal += Number(data.items[i].gramos) || 0;
    }
    // Si es nuevo, descontar gramos de cada especia en la Bodega
    if (isNew) {
      for (var j = 0; j < data.items.length; j++) {
        var item = data.items[j];
        var especia = _db.especias && _db.especias[item.especiaId];
        if (especia) {
          var g = Number(item.gramos) || 0;
          if ((Number(especia.stockBolsa) || 0) < g) {
            throw new Error('Bodega insuficiente de "' + especia.nombre + '". Necesitas ' + g + 'g, tienes ' + (especia.stockBolsa || 0) + 'g');
          }
          especia.stockBolsa = _r3(especia.stockBolsa - g);
        }
      }
    }
  } else if (data.productoId) {
    // Costal single-producto (no descontar aquí, lo hace armarCostalDesdeBodega)
    gramosTotal = Number(data.gramosTotal) || 0;
  }
  data.gramosTotal = gramosTotal;
  // Si es nuevo, gramosRestantes = gramosTotal. Si edit, solo actualizar si no tiene
  if (isNew || data.gramosRestantes == null) {
    data.gramosRestantes = gramosTotal;
  }
  // Defaults
  if (!data.gramosPorPala) data.gramosPorPala = 50;
  // Estado: vacio si gramosRestantes < gramosPorPala
  if (data.gramosRestantes < data.gramosPorPala) data.estado = 'vacio';
  else if (!data.estado) data.estado = gramosTotal > 0 ? 'abierto' : 'vacio';

  _db.costales[data.id] = data;
  _saveToFirebase(); _cacheLocal();
  _notify(isNew ? 'create' : 'update', 'costales', data.id);
  return data;
}

function deleteCostal(id) {
  if (!_db.costales || !_db.costales[id]) return false;
  var costal = _db.costales[id];
  var gramosRestantes = Number(costal.gramosRestantes) || 0;

  if (gramosRestantes > 0) {
    if (costal.items && costal.items.length > 0) {
      // Costal multi-ingrediente: devolver gramos a cada especia
      for (var i = 0; i < costal.items.length; i++) {
        var item = costal.items[i];
        var especia = _db.especias && _db.especias[item.especiaId];
        if (especia) {
          // Devolver proporcionalmente según gramosRestantes
          var ratio = gramosRestantes / (Number(costal.gramosTotal) || 1);
          var gramosADevolver = _r3((Number(item.gramos) || 0) * ratio);
          especia.stockBolsa = _r3(especia.stockBolsa + gramosADevolver);
        }
      }
    } else if (costal.productoId && costal.productoTipo) {
      // Costal single-producto: devolver al stockBolsa del producto
      var prod;
      if (costal.productoTipo === 'blend') {
        prod = _db.blends[costal.productoId];
      } else {
        prod = _db.especias[costal.productoId];
      }
      if (prod) {
        prod.stockBolsa = _r3(prod.stockBolsa + gramosRestantes);
      }
    }
  }
  delete _db.costales[id];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'costales', id);
  return true;
}

/**
 * Arma un costal desde la Bodega: descuenta gramos de stockBolsa del producto
 * y crea un costal con esos gramos listos para servirse palas.
 */
function armarCostalDesdeBodega(productoTipo, productoId, gramos, nombreCostal) {
  _ensureStructure();
  if (!_db.costales) _db.costales = {};
  gramos = Number(gramos) || 0;
  if (gramos <= 0) throw new Error('Los gramos deben ser mayor a 0');

  var prod;
  if (productoTipo === 'blend') {
    prod = _db.blends[productoId];
  } else {
    prod = _db.especias[productoId];
  }
  if (!prod) throw new Error('Producto no encontrado');

  if ((Number(prod.stockBolsa) || 0) < gramos) {
    throw new Error('Bodega insuficiente de "' + prod.nombre + '". Necesitas ' + gramos + 'g, tienes ' + (prod.stockBolsa || 0) + 'g');
  }

  // Descontar de Bodega
  prod.stockBolsa = _r3(prod.stockBolsa - gramos);

  // Crear el costal
  var id = nextId('costales');
  var costal = {
    id: id,
    nombre: nombreCostal || ('Costal de ' + prod.nombre),
    productoTipo: productoTipo,
    productoId: productoId,
    productoNombre: prod.nombre,
    gramosTotal: gramos,
    gramosRestantes: gramos,
    gramosPorPala: Number(prod.pesoPala) || 50,  // peso de cada pala (unificado)
    precioPala: Number(prod.precioPala) || 0,     // precio de venta por pala (del producto)
    estado: 'abierto',
    creado: new Date().toISOString()
  };
  _db.costales[id] = costal;
  _saveToFirebase(); _cacheLocal();
  _notify('create', 'costales', id);
  return costal;
}

/**
 * Desarma un costal y devuelve los gramos restantes a la Bodega (stockBolsa).
 */
function desarmarCostalABodega(costalId) {
  _ensureStructure();
  var costal = _db.costales && _db.costales[costalId];
  if (!costal) throw new Error('Costal no encontrado');
  var grsRestantes = Number(costal.gramosRestantes) || 0;
  if (grsRestantes > 0 && costal.productoId && costal.productoTipo) {
    var prod;
    if (costal.productoTipo === 'blend') {
      prod = _db.blends[costal.productoId];
    } else {
      prod = _db.especias[costal.productoId];
    }
    if (prod) {
      prod.stockBolsa = (Number(prod.stockBolsa) || 0) + grsRestantes;
    }
  }
  delete _db.costales[costalId];
  _saveToFirebase(); _cacheLocal();
  _notify('delete', 'costales', costalId);
  return true;
}

/**
 * Consume gramos de un costal (cuando se venden palas en PDV).
 * Si gramosRestantes llega a 0, marca el costal como 'vacio'.
 */
function consumirCostal(costalId, gramos) {
  if (!_db.costales || !_db.costales[costalId]) return false;
  var costal = _db.costales[costalId];
  var grsRestantes = (Number(costal.gramosRestantes) || 0) - (Number(gramos) || 0);
  if (grsRestantes < 0) grsRestantes = 0;
  costal.gramosRestantes = grsRestantes;
  if (grsRestantes <= 0) costal.estado = 'vacio';
  _saveToFirebase(); _cacheLocal();
  _notify('update', 'costales', costalId);
  return true;
}

/**
 * Mueve gramos de un costal a un PDV.
 * El PDV guarda: pdv.stockCostales[costalId] = gramos
 */
function moverCostalAPDV(pdvId, costalId, gramos) {
  var pdv = _db.puntosDeVenta && _db.puntosDeVenta[pdvId];
  if (!pdv) throw new Error('PDV no encontrado');
  var costal = _db.costales && _db.costales[costalId];
  if (!costal) throw new Error('Costal no encontrado');
  gramos = Number(gramos) || 0;
  if (gramos <= 0) throw new Error('Gramos inválidos');
  if ((Number(costal.gramosRestantes) || 0) < gramos) {
    throw new Error('Gramos insuficientes en el costal. Disponibles: ' + (costal.gramosRestantes || 0) + 'g');
  }
  // Restar del costal
  costal.gramosRestantes = (Number(costal.gramosRestantes) || 0) - gramos;
  if (costal.gramosRestantes <= 0) costal.estado = 'vacio';
  // Sumar al PDV
  if (!pdv.stockCostales) pdv.stockCostales = {};
  pdv.stockCostales[costalId] = (Number(pdv.stockCostales[costalId]) || 0) + gramos;
  _saveToFirebase(); _cacheLocal();
  return true;
}

/**
 * Registra una venta de palas en un PDV.
 * Cada pala consume gramosPorPala del costal.
 */
function savePDVVentaPala(data) {
  _ensureStructure();
  var pdv = _db.puntosDeVenta && _db.puntosDeVenta[data.puntoDeVentaId];
  if (!pdv) throw new Error('PDV no encontrado');
  if (!pdv.stockCostales) pdv.stockCostales = {};

  var total = 0;
  var items = data.items || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var costal = _db.costales && _db.costales[item.costalId];
    if (!costal) throw new Error('Costal no encontrado: ' + item.costalNombre);
    var gramosNecesarios = item.palas * (Number(costal.gramosPorPala) || 50);
    var disponiblePDV = Number(pdv.stockCostales[item.costalId]) || 0;
    if (disponiblePDV < gramosNecesarios) {
      throw new Error('Gramos insuficientes en PDV para ' + (costal.nombre || 'costal') + '. Necesitas ' + gramosNecesarios + 'g, tienes ' + disponiblePDV + 'g');
    }
    // Restar del PDV
    pdv.stockCostales[item.costalId] = disponiblePDV - gramosNecesarios;
    item.gramosConsumidos = gramosNecesarios;
    item.precioUnitario = Number(costal.precioPala) || 0;
    item.subtotal = item.palas * item.precioUnitario;
    total += item.subtotal;
  }

  // Guardar venta de palas en pdvVentas
  var ventaId = nextId('pdvVentas');
  var venta = {
    id: ventaId,
    creado: new Date().toISOString(),
    fecha: data.fecha || new Date().toISOString().slice(0, 10),
    puntoDeVentaId: data.puntoDeVentaId,
    puntoDeVentaNombre: pdv.nombre || '',
    metodoPago: data.metodoPago || 'efectivo',
    tipoVenta: 'palas',
    items: items,
    total: total
  };
  _db.pdvVentas[ventaId] = venta;

  // También crear una entrada en ventas global para estadísticas
  var ventaGlobalId = nextId('ventas');
  _db.ventas[ventaGlobalId] = {
    id: ventaGlobalId,
    creado: venta.creado,
    fecha: venta.fecha,
    items: items.map(function(it) {
      return {
        tipo: 'costal',
        productoId: it.costalId,
        productoNombre: it.costalNombre + ' (x' + it.palas + ' palas)',
        talla: '-',
        cantidad: it.palas,
        precioUnitario: it.precioUnitario,
        subtotal: it.subtotal
      };
    }),
    total: total,
    pdvId: data.puntoDeVentaId,
    pdvNombre: pdv.nombre || '',
    metodoPago: data.metodoPago || 'efectivo'
  };

  _saveToFirebase(); _cacheLocal();
  return venta;
}

/* ==================== TIENDA CONFIG ==================== */

function getTiendaConfig() {
  return _db.tiendaConfig || { logoPago: '' };
}

function saveTiendaConfig(data) {
  if (!_db.tiendaConfig) _db.tiendaConfig = {};
  // Merge profundo: soporta cualquier campo nuevo (incluido dinamico)
  for (var key in data) {
    if (!data.hasOwnProperty(key)) continue;
    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      // Merge de objetos anidados (ej: dinamico: { tipo, velocidad, ... })
      if (!_db.tiendaConfig[key] || typeof _db.tiendaConfig[key] !== 'object') _db.tiendaConfig[key] = {};
      for (var sub in data[key]) {
        if (data[key].hasOwnProperty(sub)) _db.tiendaConfig[key][sub] = data[key][sub];
      }
    } else {
      _db.tiendaConfig[key] = data[key];
    }
  }
  _saveToFirebase(); _cacheLocal();
  return _db.tiendaConfig;
}

function saveTiendaConfigField(path, value) {
  if (!_db.tiendaConfig) _db.tiendaConfig = {};
  var parts = path.split('/');
  var target = _db.tiendaConfig;
  for (var i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
  _saveToFirebase(); _cacheLocal();
  return _db.tiendaConfig;
}

/* ==================== COLECCIÓN ARCANO ==================== */
var _coleccionesRef = null;
var _coleccionesListeners = [];

function _ensureColeccionesRef() {
  if (!_coleccionesRef && _firebaseDb) {
    _coleccionesRef = _firebaseDb.ref('arcano/db/colecciones');
    _coleccionesRef.on('value', function(snap) {
      _db.colecciones = snap.val() || {};
      for (var i = 0; i < _coleccionesListeners.length; i++) {
        try { _coleccionesListeners[i](_db.colecciones); } catch(e) {}
      }
      _notify('update', 'colecciones', 'all');
    });
  }
}

function getColecciones() {
  _ensureColeccionesRef();
  if (!_db.colecciones) _db.colecciones = {};
  return Object.values(_db.colecciones).filter(function(c) { return c !== null; }).sort(function(a, b) {
    return (b.updated || b.creado || '').localeCompare(a.updated || a.creado || '');
  });
}

function getColeccion(whatsapp) {
  _ensureColeccionesRef();
  if (!_db.colecciones) return null;
  return _db.colecciones[whatsapp] || null;
}

function getColeccionesCompletadas() {
  return getColecciones().filter(function(c) { return c.casilleros >= 10; });
}

function saveColeccion(data) {
  _ensureStructure();
  if (!_db.colecciones) _db.colecciones = {};
  var key = data.whatsapp;
  if (!key) throw new Error('WhatsApp es requerido');
  var existing = _db.colecciones[key] || {};
  if (!existing.creado) {
    data.creado = new Date().toISOString();
    data.casilleros = data.casilleros || 0;
    data.completado = false;
    data.canjeado = false;
    data.historial = [];
  } else {
    data.creado = existing.creado;
    data.historial = data.historial || existing.historial || [];
  }
  data.updated = new Date().toISOString();
  data.completado = (data.casilleros || 0) >= 10;
  _db.colecciones[key] = data;
  if (_coleccionesRef) _coleccionesRef.child(key).set(data);
  else _saveToFirebase();
  _cacheLocal();
  _notify('update', 'colecciones', key);
  return data;
}

function deleteColeccion(whatsapp) {
  _ensureStructure();
  if (!_db.colecciones) return false;
  delete _db.colecciones[whatsapp];
  if (_coleccionesRef) _coleccionesRef.child(whatsapp).remove();
  else _saveToFirebase();
  _cacheLocal();
  _notify('delete', 'colecciones', whatsapp);
  return true;
}

function addBlendsToColeccion(whatsapp, cantidad, pedidoKey, blendNombres) {
  _ensureStructure();
  if (!_db.colecciones) _db.colecciones = {};
  var col = _db.colecciones[whatsapp];
  if (!col) {
    col = { whatsapp: whatsapp, nombre: '', casilleros: 0, completado: false, canjeado: false, historial: [], creado: new Date().toISOString() };
    _db.colecciones[whatsapp] = col;
  }
  if (col.casilleros >= 10 && !col.canjeado) return col;
  var prev = col.casilleros || 0;
  col.casilleros = Math.min(10, prev + cantidad);
  col.historial = col.historial || [];
  col.historial.push({ pedidoKey: pedidoKey || '', fecha: new Date().toISOString(), cantidad: cantidad, blends: blendNombres || [] });
  col.updated = new Date().toISOString();
  var wasCompleted = col.completado;
  col.completado = col.casilleros >= 10;
  if (!wasCompleted && col.completado) _notify('coleccion_completada', 'colecciones', whatsapp);
  if (_coleccionesRef) _coleccionesRef.child(whatsapp).set(col);
  else _saveToFirebase();
  _cacheLocal();
  _notify('update', 'colecciones', whatsapp);
  return col;
}

function canjearColeccion(whatsapp, reset) {
  _ensureStructure();
  if (!_db.colecciones) return null;
  var col = _db.colecciones[whatsapp];
  if (!col) return null;
  col.canjeado = true;
  col.canjeadoFecha = new Date().toISOString();
  if (reset) { col.casilleros = 0; col.completado = false; col.canjeado = false; }
  col.updated = new Date().toISOString();
  if (_coleccionesRef) _coleccionesRef.child(whatsapp).set(col);
  else _saveToFirebase();
  _cacheLocal();
  _notify('update', 'colecciones', whatsapp);
  return col;
}

function onColeccionesChange(callback) { _coleccionesListeners.push(callback); }
/* ==================== FIN COLECCIÓN ARCANO ==================== */

/* ==================== EXPORT ==================== */

window.ArcanoDB = {
  initDB: initDB, getDB: getDB, onDBChange: onDBChange, nextId: nextId,
  getEspecias: getEspecias, getEspecia: getEspecia, saveEspecia: saveEspecia, deleteEspecia: deleteEspecia,
  getBlends: getBlends, getBlend: getBlend, saveBlend: saveBlend, deleteBlend: deleteBlend,
  getStickers: getStickers, getProductosConStickers: getProductosConStickers,
  getEntradas: getEntradas, saveEntrada: saveEntrada, updateEntrada: updateEntrada, deleteEntrada: deleteEntrada,
  getGastos: getGastos, getGastosCategorias: getGastosCategorias, saveGasto: saveGasto, deleteGasto: deleteGasto, saveGastosCategorias: saveGastosCategorias,
  getAjustes: getAjustes, saveAjuste: saveAjuste, deleteAjuste: deleteAjuste,
  getPedidos: getPedidos, getPedidosCount: getPedidosCount, updatePedidoEstado: updatePedidoEstado, updatePedidoField: updatePedidoField, deletePedido: deletePedido, onPedidosChange: onPedidosChange,
  producirEspecia: producirEspecia, producirBlend: producirBlend,
  getProducciones: getProducciones, deleteProduccion: deleteProduccion,
  getFrascosParaVender: getFrascosParaVender,
  getPalasVendidas: getPalasVendidas,
  getVentas: getVentas, saveVenta: saveVenta, deleteVenta: deleteVenta,
  getUsuarios: getUsuarios, saveUsuario: saveUsuario, deleteUsuario: deleteUsuario,
  authenticateUser: authenticateUser, getCurrentUser: getCurrentUser, logoutUser: logoutUser,
  getStats: getStats,
  findEspeciaByName: findEspeciaByName,
  importFromExcelData: importFromExcelData,
  getTiendaProductos: getTiendaProductos,
  toggleTienda: toggleTienda,
  toggleEnBlend: toggleEnBlend,
  getProductTags: getProductTags, getTagsForCategoria: getTagsForCategoria,
  addProductTag: addProductTag, removeProductTag: removeProductTag,
  getUsoOptions: getUsoOptions, addUsoOption: addUsoOption, removeUsoOption: removeUsoOption,
  compressImage: compressImage,
  DB_KEY: DB_KEY, FB_PATH: FB_PATH,
  getPuntosDeVenta: getPuntosDeVenta, getPuntoDeVenta: getPuntoDeVenta,
  savePuntoDeVenta: savePuntoDeVenta, deletePuntoDeVenta: deletePuntoDeVenta,
  moverStockAPDV: moverStockAPDV, devolverStockDePDV: devolverStockDePDV, devolverCostalDePDV: devolverCostalDePDV,
  getPDVVentas: getPDVVentas, getPDVStats: getPDVStats, savePDVVenta: savePDVVenta,
  getPacks: getPacks, getPack: getPack, savePack: savePack, deletePack: deletePack, producirPack: producirPack,
  getCostales: getCostales, getCostal: getCostal, saveCostal: saveCostal, deleteCostal: deleteCostal, consumirCostal: consumirCostal, moverCostalAPDV: moverCostalAPDV, savePDVVentaPala: savePDVVentaPala,
  armarCostalDesdeBodega: armarCostalDesdeBodega, desarmarCostalABodega: desarmarCostalABodega,
  getCostosInsumos: getCostosInsumos, saveCostosInsumos: saveCostosInsumos, onCostosChange: onCostosChange,
  getCostoProducto: getCostoProducto, getCostosPorCanal: getCostosPorCanal,
  getTiendaConfig: getTiendaConfig, saveTiendaConfig: saveTiendaConfig, saveTiendaConfigField: saveTiendaConfigField,
  saveNow: saveNow,
  writeField: writeField,
  getGrandesClientes: getGrandesClientes, updateGCEstado: updateGCEstado, deleteGC: deleteGC, onGCChange: onGCChange, getGCCount: getGCCount,
  getClientes: getClientes, getClientesCount: getClientesCount, onClientesChange: onClientesChange, deleteCliente: deleteCliente, getPedidosByCliente: getPedidosByCliente,
  getPromociones: getPromociones, getPromocionesActivas: getPromocionesActivas, savePromocion: savePromocion, deletePromocion: deletePromocion, onPromocionesChange: onPromocionesChange,
  getCarritos: getCarritos, getCarritosByEstado: getCarritosByEstado, deleteCarrito: deleteCarrito, onCarritosChange: onCarritosChange,
  getOtpPendientes: getOtpPendientes, getOtpPendientesCount: getOtpPendientesCount, markOtpEnviado: markOtpEnviado, deleteOtpPendiente: deleteOtpPendiente, onOtpPendientesChange: onOtpPendientesChange,

  // Colección Arcano
  getColecciones: getColecciones, getColeccion: getColeccion, saveColeccion: saveColeccion,
  deleteColeccion: deleteColeccion, addBlendsToColeccion: addBlendsToColeccion,
  canjearColeccion: canjearColeccion, getColeccionesCompletadas: getColeccionesCompletadas,
  onColeccionesChange: onColeccionesChange
};
