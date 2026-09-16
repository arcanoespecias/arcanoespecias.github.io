// ===================== ARCANO ERP — FIREBASE SYNC =====================
// Real-time sync with Firebase. Graceful degradation to offline-only.

var FIREBASE_CONFIG = {
  apiKey: "AIzaSyBvuJusx4_FvAdXhBl89VVlCicNb-yrdzo",
  authDomain: "arcano-6788d.firebaseapp.com",
  databaseURL: "https://arcano-6788d-default-rtdb.firebaseio.com",
  projectId: "arcano-6788d",
  storageBucket: "arcano-6788d.firebasestorage.app",
  messagingSenderId: "545294699567",
  appId: "1:545294699567:web:f354ae604a0034c6578ada"
};

var FB_PATH = 'arcano/db';
var fbRef = null;
var fbOk = false;
var fbOnline = false;
var _bootCallback = null;
var _bootDone = false;
var _pushSig = '';

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') throw new Error('Firebase SDK not loaded');
    firebase.initializeApp(FIREBASE_CONFIG);
    fbRef = firebase.database().ref(FB_PATH);
    fbOk = true;

    firebase.database().ref('.info/connected').on('value', function(s) {
      fbOnline = s.val() === true;
      renderSyncBadge();
    });
    console.log('[FB] Initialized');
  } catch(e) {
    console.warn('[FB] Init failed:', e.message, '— running offline');
    fbOk = false;
  }
}

function startSync(onReady) {
  _bootCallback = onReady;

  if (!fbOk) {
    console.log('[FB] Offline mode — booting with local data');
    finishBoot(null);
    return;
  }

  // Timeout fallback
  var timer = setTimeout(function() {
    if (!_bootDone) {
      console.warn('[FB] Timeout — booting locally');
      finishBoot(null);
    }
  }, 5000);

  try {
    fbRef.on('value', function(snap) {
      var data = snap.val();
      if (!data) {
        if (!_bootDone) { clearTimeout(timer); finishBoot(null); }
        return;
      }

      var sig = JSON.stringify(data, Object.keys(data).sort());
      if (sig === _pushSig) { _pushSig = ''; return; }
      _pushSig = '';

      try {
        localStorage.setItem(DB_KEY, JSON.stringify(data));
        syncIdCounter(data);
        if (typeof _dbCached !== 'undefined') _dbCached = null;
      } catch(e) { console.warn('[FB] Local write failed:', e.message); }

      if (!_bootDone) { clearTimeout(timer); finishBoot(data); }
      else {
        refreshPage();
        if (currentUser) toast('Datos sincronizados');
      }
    }, function(err) {
      console.warn('[FB] Listener error:', err.code);
      if (!_bootDone) { clearTimeout(timer); finishBoot(null); }
    });
  } catch(e) {
    console.warn('[FB] Sync error:', e.message);
    clearTimeout(timer);
    finishBoot(null);
  }
}

function finishBoot(remoteData) {
  _bootDone = true;
  try {
    if (remoteData) syncIdCounter(remoteData);
    if (typeof migrateData === 'function') migrateData();
    if (typeof seedIfEmpty === 'function') seedIfEmpty();
    if (typeof _bootCallback === 'function') _bootCallback();
  } catch(e) {
    console.error('[FB] Boot callback error:', e);
  }
}

function fbPush() {
  if (!fbRef) return;
  var db = getDB();
  var clean = JSON.parse(JSON.stringify(db));
  _pushSig = JSON.stringify(clean, Object.keys(clean).sort());
  fbRef.set(clean).then(function() {
    console.log('[FB] Push OK');
  }).catch(function(err) {
    _pushSig = '';
    console.warn('[FB] Push error:', err.code || err.message);
  });
}

function fbIsOnline() { return fbOnline; }

function renderSyncBadge() {
  var el = document.getElementById('sync-badge');
  if (!el) return;
  if (fbOnline) { el.className = 'badge bg'; el.textContent = 'Online'; }
  else { el.className = 'badge br'; el.textContent = 'Offline'; }
}

function fbForceReload() {
  if (!fbRef) { toast('Sin conexión Firebase','err'); return; }
  _pushSig = ''; _bootDone = false;
  fbRef.once('value').then(function(s) {
    var d = s.val();
    if (d) {
      if (typeof _dbCached !== 'undefined') _dbCached = null;
      localStorage.setItem(DB_KEY, JSON.stringify(d));
      syncIdCounter(d);
      refreshPage();
      toast('Sincronizado');
    } else { toast('Sin datos remotos','err'); }
  }).catch(function(e) { toast('Error: '+(e.message||''),'err'); });
}