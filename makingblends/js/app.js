/* ============================================================
   Making Blends — Arcano Especias
   Panel interactivo para producción de blends
   ============================================================ */

var App = {
  db: null,
  blends: [],
  especias: {},
  user: null,
  state: {
    selectedBlend: null,
    size: 'chico',
    qty: 10,
    recipe: [],
    addedSpices: {},
    totalWeight: 0,
    targetWeight: 0
  }
};

/* ==================== Init ==================== */
App.init = function() {
  // Init Firebase
  firebase.initializeApp(FIREBASE_CONFIG);
  App.fbDb = firebase.database();

  // Check session
  App.user = App.getSession();
  if (App.user) {
    App.showApp();
  } else {
    App.showLogin();
  }

  // Enter key on PIN input
  var pinInput = document.getElementById('pin-input');
  if (pinInput) {
    pinInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') App.login();
    });
  }
};

/* ==================== Auth ==================== */
App.getSession = function() {
  try {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || !s.id) return null;
    if (s.expiresAt && Date.now() > s.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch (e) { return null; }
};

App.login = function() {
  var pin = document.getElementById('pin-input').value.trim();
  var errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!pin) { errEl.textContent = 'Ingresá tu PIN'; return; }

  // Buscar en /usuarios de Firebase
  App.fbDb.ref(FB_PATH + '/usuarios').once('value').then(function(snap) {
    var users = snap.val() || {};
    var found = null;
    var keys = Object.keys(users);
    for (var i = 0; i < keys.length; i++) {
      var u = users[keys[i]];
      if (u && u.pin === pin && u.activo !== false) {
        found = u;
        break;
      }
    }
    if (!found) {
      errEl.textContent = 'PIN incorrecto o usuario inactivo';
      return;
    }
    var now = Date.now();
    var session = {
      id: found.id,
      nombre: found.nombre,
      rol: found.rol || 'admin',
      issuedAt: now,
      expiresAt: now + SESSION_TTL_MS
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    App.user = session;
    App.showApp();
  }).catch(function(err) {
    errEl.textContent = 'Error de conexión: ' + err.message;
  });
};

App.logout = function() {
  localStorage.removeItem(SESSION_KEY);
  App.user = null;
  App.showLogin();
};

App.showLogin = function() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  var pinInput = document.getElementById('pin-input');
  if (pinInput) { pinInput.value = ''; pinInput.focus(); }
};

App.showApp = function() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-name').textContent = 'Hola, ' + (App.user.nombre || 'Admin');
  App.loadData();
};

/* ==================== Data Loading ==================== */
App.loadData = function() {
  // Cargar blends y especias en paralelo
  App.fbDb.ref(FB_PATH + '/blends').on('value', function(snap) {
    var data = snap.val() || {};
    App.blends = [];
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var b = data[keys[i]];
      if (b && b.nombre) {
        b._key = keys[i];
        App.blends.push(b);
      }
    }
    App.blends.sort(function(a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); });
    App.renderBlends();
  });

  App.fbDb.ref(FB_PATH + '/especias').on('value', function(snap) {
    var data = snap.val() || {};
    App.especias = data;
  });
};

/* ==================== Step 1: Blend Grid ==================== */
App.renderBlends = function() {
  var grid = document.getElementById('blend-grid');
  if (!grid) return;

  var search = (document.getElementById('blend-search').value || '').toLowerCase();
  var filtered = App.blends.filter(function(b) {
    if (!search) return true;
    return (b.nombre || '').toLowerCase().indexOf(search) !== -1 ||
           (b.categoria || '').toLowerCase().indexOf(search) !== -1;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:40px">No se encontraron blends</p>';
    return;
  }

  var h = '';
  for (var i = 0; i < filtered.length; i++) {
    var b = filtered[i];
    var numIng = (b.ingredientes || []).length;
    h += '<div class="blend-card" onclick="App.selectBlend(\'' + b._key + '\')">' +
      '<div class="blend-card-name">' + App.esc(b.nombre) + '</div>' +
      '<div class="blend-card-cat">' + App.esc(b.categoria || b.categorias && b.categorias[0] || '') + '</div>' +
      '<div class="blend-card-meta"><span>' + numIng + ' especias</span><strong>$' + (b.precioChico || 0).toLocaleString() + ' / $' + (b.precioGrande || 0).toLocaleString() + '</strong></div>' +
      '</div>';
  }
  grid.innerHTML = h;
};

App.esc = function(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

/* ==================== Step 2: Config ==================== */
App.selectBlend = function(key) {
  var blend = null;
  for (var i = 0; i < App.blends.length; i++) {
    if (App.blends[i]._key === key) { blend = App.blends[i]; break; }
  }
  if (!blend) return;
  App.state.selectedBlend = blend;
  document.getElementById('selected-blend-name').textContent = blend.nombre;
  document.getElementById('selected-blend-cat').textContent = (blend.categoria || (blend.categorias && blend.categorias[0]) || '');

  App.updateConfigSummary();
  App.goStep(2);
};

App.setSize = function(size) {
  App.state.size = size;
  var btns = document.querySelectorAll('.size-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.size === size);
  }
  App.updateConfigSummary();
};

App.adjustQty = function(delta) {
  var input = document.getElementById('qty-input');
  var v = parseInt(input.value, 10) || 0;
  v = Math.max(1, Math.min(500, v + delta));
  input.value = v;
  App.state.qty = v;
  App.updateConfigSummary();
};

App.setQty = function(v) {
  var input = document.getElementById('qty-input');
  input.value = v;
  App.state.qty = v;
  App.updateConfigSummary();
};

App.onQtyChange = function() {
  var v = parseInt(document.getElementById('qty-input').value, 10) || 1;
  App.state.qty = Math.max(1, Math.min(500, v));
  App.updateConfigSummary();
};

App.updateConfigSummary = function() {
  var blend = App.state.selectedBlend;
  if (!blend) return;
  var size = App.state.size;
  var qty = App.state.qty;

  // Peso por frasco: viene de los gramos de cada ingrediente
  var pesoFrasco = 0;
  var ingredientes = blend.ingredientes || [];
  for (var i = 0; i < ingredientes.length; i++) {
    var ing = ingredientes[i];
    pesoFrasco += size === 'grande' ? (ing.gramosGrande || 0) : (ing.gramosChico || 0);
  }
  var pesoTotal = pesoFrasco * qty;
  var precioUnit = size === 'grande' ? (blend.precioGrande || 0) : (blend.precioChico || 0);

  var html = '' +
    '<div class="summary-item"><div class="summary-item-label">Peso por frasco</div><div class="summary-item-value">' + pesoFrasco + 'g</div></div>' +
    '<div class="summary-item"><div class="summary-item-label">Frascos a producir</div><div class="summary-item-value">' + qty + '</div></div>' +
    '<div class="summary-item"><div class="summary-item-label">Peso total</div><div class="summary-item-value">' + pesoTotal.toLocaleString() + 'g</div></div>';
  document.getElementById('config-summary').innerHTML = html;
};

/* ==================== Step 3: Producción ==================== */
App.startProduction = function() {
  var blend = App.state.selectedBlend;
  if (!blend) return;
  var size = App.state.size;
  var qty = App.state.qty;
  var ingredientes = blend.ingredientes || [];

  // Calcular gramos totales por especia
  var recipe = [];
  var targetWeight = 0;
  for (var i = 0; i < ingredientes.length; i++) {
    var ing = ingredientes[i];
    var gramosPorFrasco = size === 'grande' ? (ing.gramosGrande || 0) : (ing.gramosChico || 0);
    var gramosTotal = gramosPorFrasco * qty;
    var pct = 0;
    // Calcular porcentaje
    var totalGramosFrasco = 0;
    for (var j = 0; j < ingredientes.length; j++) {
      totalGramosFrasco += size === 'grande' ? (ingredientes[j].gramosGrande || 0) : (ingredientes[j].gramosChico || 0);
    }
    if (totalGramosFrasco > 0) pct = (gramosPorFrasco / totalGramosFrasco) * 100;

    recipe.push({
      especiaId: ing.especiaId,
      nombre: ing.especiaNombre || (App.especias[ing.especiaId] && App.especias[ing.especiaId].nombre) || 'Especia ' + ing.especiaId,
      gramosPorFrasco: gramosPorFrasco,
      gramosTotal: gramosTotal,
      porcentaje: pct,
      added: false
    });
    targetWeight += gramosTotal;
  }

  App.state.recipe = recipe;
  App.state.targetWeight = targetWeight;
  App.state.totalWeight = 0;
  App.state.addedSpices = {};

  App.renderProduction();
  App.goStep(3);
};

App.renderProduction = function() {
  var blend = App.state.selectedBlend;
  var size = App.state.size;
  var qty = App.state.qty;
  var recipe = App.state.recipe;

  // Recipe panel
  var metaHtml = '<strong>' + App.esc(blend.nombre) + '</strong> · ' +
    (size === 'grande' ? 'Frascos grandes' : 'Frascos pequeños') + ' · ' +
    qty + ' unidades';
  document.getElementById('recipe-meta').innerHTML = metaHtml;

  var listHtml = '';
  for (var i = 0; i < recipe.length; i++) {
    var r = recipe[i];
    listHtml += '<div class="recipe-item" id="recipe-item-' + i + '">' +
      '<div>' +
        '<div class="recipe-item-name">' + App.esc(r.nombre) + '</div>' +
        '<div class="recipe-item-pct">' + r.porcentaje.toFixed(1) + '% · ' + r.gramosPorFrasco + 'g c/u</div>' +
      '</div>' +
      '<div class="recipe-item-weight">' + r.gramosTotal.toLocaleString() + 'g</div>' +
    '</div>';
  }
  document.getElementById('recipe-list').innerHTML = listHtml;
  document.getElementById('recipe-total').innerHTML = '<span>Peso total</span><span>' + App.state.targetWeight.toLocaleString() + 'g</span>';

  // Spices rack
  var rackHtml = '';
  for (var i = 0; i < recipe.length; i++) {
    var r = recipe[i];
    rackHtml += '<div class="spice-jar" id="spice-jar-' + i + '" onclick="App.addSpice(' + i + ')">' +
      '<span class="spice-jar-icon">🫙</span>' +
      '<div class="spice-jar-name">' + App.esc(r.nombre) + '</div>' +
      '<div class="spice-jar-weight">' + r.gramosTotal.toLocaleString() + 'g <small>(' + r.gramosPorFrasco + 'g c/u)</small></div>' +
    '</div>';
  }
  document.getElementById('spices-rack').innerHTML = rackHtml;

  // Reset bowl
  document.getElementById('bowl-content').style.height = '0%';
  document.getElementById('bowl-label').textContent = 'Tazón vacío';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-text').textContent = '0 / ' + recipe.length + ' especias agregadas';
  document.getElementById('complete-btn').disabled = true;
  document.getElementById('bowl').classList.remove('filling');
};

App.addSpice = function(idx) {
  var recipe = App.state.recipe;
  var r = recipe[idx];
  if (!r || r.added) return;

  // Abrir modal para confirmar peso
  App.currentSpiceIdx = idx;
  document.getElementById('weight-modal-spice').textContent = r.nombre;
  document.getElementById('weight-modal-target').textContent = r.gramosTotal.toLocaleString() + 'g';
  document.getElementById('weight-modal-input').value = r.gramosTotal;
  document.getElementById('weight-modal').style.display = 'flex';
  setTimeout(function() { document.getElementById('weight-modal-input').focus(); document.getElementById('weight-modal-input').select(); }, 50);
};

App.closeWeightModal = function() {
  document.getElementById('weight-modal').style.display = 'none';
  App.currentSpiceIdx = null;
};

App.confirmWeight = function() {
  var idx = App.currentSpiceIdx;
  if (idx === null || idx === undefined) return;
  var recipe = App.state.recipe;
  var r = recipe[idx];
  if (!r) return;

  var inputVal = parseFloat(document.getElementById('weight-modal-input').value);
  if (isNaN(inputVal) || inputVal <= 0) {
    App.toast('Ingresá un peso válido');
    return;
  }

  r.added = true;
  r.actualGramos = inputVal;
  App.state.totalWeight += inputVal;

  // Animación: especia cayendo al tazón
  App.animateSpiceDrop(r);

  // Actualizar UI
  document.getElementById('spice-jar-' + idx).classList.add('added');
  document.getElementById('recipe-item-' + idx).classList.add('done');

  // Llenar tazón proporcionalmente
  var fillPct = Math.min(100, (App.state.totalWeight / App.state.targetWeight) * 100);
  document.getElementById('bowl-content').style.height = fillPct + '%';
  document.getElementById('bowl-label').textContent = App.state.totalWeight.toLocaleString() + 'g / ' + App.state.targetWeight.toLocaleString() + 'g';

  // Progress bar
  var addedCount = recipe.filter(function(x) { return x.added; }).length;
  document.getElementById('progress-fill').style.width = (addedCount / recipe.length * 100) + '%';
  document.getElementById('progress-text').textContent = addedCount + ' / ' + recipe.length + ' especias agregadas';

  // Si falta poco, animar el tazón
  if (fillPct > 50) {
    document.getElementById('bowl').classList.add('filling');
  }

  App.closeWeightModal();
  App.toast('✓ ' + r.nombre + ': ' + inputVal.toLocaleString() + 'g agregados');

  // Si completó todo, habilitar botón
  if (addedCount === recipe.length) {
    document.getElementById('complete-btn').disabled = false;
    App.toast('¡Receta completa! Podés finalizar.');
  }
};

App.animateSpiceDrop = function(r) {
  // Crear elemento temporal que "cae" al tazón
  var jar = document.getElementById('spice-jar-' + App.currentSpiceIdx);
  var bowl = document.getElementById('bowl');
  if (!jar || !bowl) return;

  var jarRect = jar.getBoundingClientRect();
  var bowlRect = bowl.getBoundingClientRect();

  var drop = document.createElement('div');
  drop.className = 'spice-drop';
  drop.textContent = '🫙';
  drop.style.left = (bowlRect.left + bowlRect.width/2 - 12) + 'px';
  drop.style.top = (bowlRect.top + 20) + 'px';
  drop.style.position = 'fixed';
  drop.style.zIndex = '500';
  document.body.appendChild(drop);
  setTimeout(function() { if (drop.parentNode) drop.parentNode.removeChild(drop); }, 900);
};

App.resetProduction = function() {
  if (!confirm('¿Reiniciar la producción? Vas a perder el progreso actual.')) return;
  App.startProduction();
};

App.completeProduction = function() {
  var blend = App.state.selectedBlend;
  var recipe = App.state.recipe;
  var size = App.state.size;
  var qty = App.state.qty;

  document.getElementById('completion-blend-name').textContent = blend.nombre + ' · ' + qty + ' ' + (size === 'grande' ? 'frascos grandes' : 'frascos pequeños');

  var totalActual = 0;
  for (var i = 0; i < recipe.length; i++) {
    totalActual += recipe[i].actualGramos || 0;
  }

  var html = '' +
    '<div class="summary-item"><div class="summary-item-label">Especias usadas</div><div class="summary-item-value">' + recipe.length + '</div></div>' +
    '<div class="summary-item"><div class="summary-item-label">Peso total</div><div class="summary-item-value">' + totalActual.toLocaleString() + 'g</div></div>' +
    '<div class="summary-item"><div class="summary-item-label">Frascos</div><div class="summary-item-value">' + qty + '</div></div>';
  document.getElementById('completion-summary').innerHTML = html;

  App.goStep(4);
};

/* ==================== Step 4: Print ==================== */
App.printRecipe = function() {
  var blend = App.state.selectedBlend;
  var recipe = App.state.recipe;
  var size = App.state.size;
  var qty = App.state.qty;

  var w = window.open('', '_blank');
  var html = '<!DOCTYPE html><html><head><title>Receta — ' + blend.nombre + '</title>' +
    '<style>body{font-family:sans-serif;padding:32px;max-width:600px;margin:auto;color:#333}' +
    'h1{color:#c9a84c}table{width:100%;border-collapse:collapse;margin-top:16px}' +
    'th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}' +
    'th{background:#f5f5f5}.total{font-weight:bold;background:#fff8e1}' +
    '</style></head><body>' +
    '<h1>' + blend.nombre + '</h1>' +
    '<p><strong>Tamaño:</strong> ' + (size === 'grande' ? 'Grande' : 'Pequeño') + ' · ' +
    '<strong>Cantidad:</strong> ' + qty + ' frascos</p>' +
    '<table><thead><tr><th>Especia</th><th>g por frasco</th><th>g totales</th><th>%</th></tr></thead><tbody>';
  for (var i = 0; i < recipe.length; i++) {
    var r = recipe[i];
    html += '<tr><td>' + r.nombre + '</td><td>' + r.gramosPorFrasco + 'g</td><td>' + r.gramosTotal + 'g</td><td>' + r.porcentaje.toFixed(1) + '%</td></tr>';
  }
  html += '</tbody><tfoot><tr class="total"><td>Total</td><td>—</td><td>' + App.state.targetWeight + 'g</td><td>100%</td></tr></tfoot></table>' +
    '<p style="margin-top:24px;color:#888;font-size:12px">Generado por Making Blends · ' + new Date().toLocaleString('es-CO') + '</p>' +
    '</body></html>';
  w.document.write(html);
  w.document.close();
  setTimeout(function() { w.print(); }, 300);
};

/* ==================== Navigation ==================== */
App.goStep = function(n) {
  for (var i = 1; i <= 4; i++) {
    var el = document.getElementById('step-' + i);
    if (el) el.classList.toggle('hidden', i !== n);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* ==================== Toast ==================== */
App.toast = function(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(App._toastT);
  App._toastT = setTimeout(function() { el.classList.remove('show'); }, 2500);
};

/* ==================== Boot ==================== */
document.addEventListener('DOMContentLoaded', function() { App.init(); });
