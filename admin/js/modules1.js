// ===================== CURRENT USER =====================
let currentUser = null;
const SESSION_KEY = 'arcano_session';

// ===================== PWA INSTALL =====================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  // Mostrar banner si el usuario no lo descarto
  if (!localStorage.getItem('arcano_pwa_dismissed')) {
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.style.display = 'block';
  }
});

window.addEventListener('appinstalled', function() {
  deferredPrompt = null;
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.style.display = 'none';
  localStorage.removeItem('arcano_pwa_dismissed');
  toast('Arcano instalada correctamente');
});

function installPWA() {
  if (!deferredPrompt) { toast('La instalacion no esta disponible en este momento', 'err'); return; }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function(choice) {
    if (choice.outcome === 'accepted') toast('Instalando Arcano...');
    deferredPrompt = null;
  });
}

function dismissPWA() {
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('arcano_pwa_dismissed', '1');
}

// ===================== PWA CONFIG (admin) =====================
const PWA_CONFIG_KEY = 'arcano_pwa_config';
const PWA_DEFAULTS = {
  name: 'Arcano — Complice del Sabor',
  shortName: 'Arcano',
  bgColor: '#1b0b07',
  themeColor: '#1b0b07',
  description: 'Gestion de especias y blends para Arcano',
  orientation: 'portrait-primary',
  // Colores extendidos
  colorBg2: '#221108',
  colorSurface: '#2a150e',
  colorSurface2: '#331e12',
  colorGold: '#c9963a',
  colorGold2: '#e8b84b',
  colorCream: '#f0e8d0',
  colorMuted: '#7a6a50',
  // Tipografia
  fontSizeBase: 15,
  fontSizeTitle: 1.9
};

function getPWAConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(PWA_CONFIG_KEY) || '{}');
    return { ...PWA_DEFAULTS, ...saved };
  } catch { return { ...PWA_DEFAULTS }; }
}

function applyPWAConfig(cfg) {
  const root = document.documentElement;
  // Fondos
  if (cfg.bgColor) { root.style.setProperty('--bg', cfg.bgColor); document.body.style.background = cfg.bgColor; }
  if (cfg.colorBg2) root.style.setProperty('--bg2', cfg.colorBg2);
  if (cfg.colorSurface) root.style.setProperty('--surface', cfg.colorSurface);
  if (cfg.colorSurface2) root.style.setProperty('--surface2', cfg.colorSurface2);
  // Colores decorativos
  if (cfg.colorGold) root.style.setProperty('--gold', cfg.colorGold);
  if (cfg.colorGold2) root.style.setProperty('--gold2', cfg.colorGold2);
  if (cfg.colorCream) root.style.setProperty('--cream', cfg.colorCream);
  if (cfg.colorMuted) root.style.setProperty('--muted', cfg.colorMuted);
  // Tipografia
  if (cfg.fontSizeBase) { root.style.setProperty('--fs-base', cfg.fontSizeBase + 'px'); document.body.style.fontSize = cfg.fontSizeBase + 'px'; }
  if (cfg.fontSizeTitle) root.style.setProperty('--fs-title', cfg.fontSizeTitle + 'rem');
  // Theme-color meta
  if (cfg.themeColor) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = cfg.themeColor;
  }
  // Titulo y header
  if (cfg.shortName) {
    document.title = cfg.name || cfg.shortName;
    const brand = document.querySelector('.header-brand');
    if (brand) brand.textContent = cfg.shortName;
    const sub = document.querySelector('.header-sub');
    if (sub) sub.textContent = cfg.description || '';
  }
}

function syncColorInput(type) {
  const textInput = document.getElementById('pwa-cfg-' + type + '-text');
  const colorInput = document.getElementById('pwa-cfg-' + type);
  if (textInput && colorInput && /^#[0-9a-fA-F]{6}$/.test(textInput.value)) {
    colorInput.value = textInput.value;
    previewPWA();
  }
}

function previewPWA() {
  // Sync all color text ↔ picker pairs
  ['bg','theme','bg2','surface','surface2','gold','gold2','cream','muted'].forEach(function(key) {
    const picker = document.getElementById('pwa-cfg-' + key);
    const text = document.getElementById('pwa-cfg-' + key + '-text');
    if (picker && text) text.value = picker.value;
  });
  // Font size labels
  const fsBase = document.getElementById('pwa-cfg-fs-base');
  const fsBaseVal = document.getElementById('pwa-cfg-fs-base-val');
  if (fsBase && fsBaseVal) fsBaseVal.textContent = fsBase.value + 'px';
  const fsTitle = document.getElementById('pwa-cfg-fs-title');
  const fsTitleVal = document.getElementById('pwa-cfg-fs-title-val');
  if (fsTitle && fsTitleVal) fsTitleVal.textContent = fsTitle.value + 'rem';
  // Preview box
  const previewBox = document.getElementById('pwa-preview-box');
  const bgPicker = document.getElementById('pwa-cfg-bg');
  if (previewBox && bgPicker) previewBox.style.background = bgPicker.value;
  const short = document.getElementById('pwa-cfg-short').value.trim();
  const desc = document.getElementById('pwa-cfg-desc').value.trim();
  const previewName = document.getElementById('pwa-preview-name');
  const previewDesc = document.getElementById('pwa-preview-desc');
  if (previewName) previewName.textContent = short || 'Arcano';
  if (previewDesc) previewDesc.textContent = desc || 'Complice del Sabor';
  // Live apply
  applyPWAConfig(readPWAConfigFromUI());
}

function readPWAConfigFromUI() {
  const v = function(id) { const el = document.getElementById(id); return el ? el.value : ''; };
  return {
    name: v('pwa-cfg-name').trim() || PWA_DEFAULTS.name,
    shortName: v('pwa-cfg-short').trim() || PWA_DEFAULTS.shortName,
    description: v('pwa-cfg-desc').trim() || PWA_DEFAULTS.description,
    bgColor: v('pwa-cfg-bg'),
    themeColor: v('pwa-cfg-theme'),
    orientation: v('pwa-cfg-orient') || 'portrait-primary',
    colorBg2: v('pwa-cfg-bg2'),
    colorSurface: v('pwa-cfg-surface'),
    colorSurface2: v('pwa-cfg-surface2'),
    colorGold: v('pwa-cfg-gold'),
    colorGold2: v('pwa-cfg-gold2'),
    colorCream: v('pwa-cfg-cream'),
    colorMuted: v('pwa-cfg-muted'),
    fontSizeBase: parseInt(v('pwa-cfg-fs-base')) || 15,
    fontSizeTitle: parseFloat(v('pwa-cfg-fs-title')) || 1.9
  };
}

function loadPWAConfigUI() {
  const cfg = getPWAConfig();
  const s = function(id, val) { const el = document.getElementById(id); if (el) el.value = val; };
  s('pwa-cfg-name', cfg.name || '');
  s('pwa-cfg-short', cfg.shortName || '');
  s('pwa-cfg-desc', cfg.description || '');
  s('pwa-cfg-bg', cfg.bgColor); s('pwa-cfg-bg-text', cfg.bgColor);
  s('pwa-cfg-theme', cfg.themeColor); s('pwa-cfg-theme-text', cfg.themeColor);
  s('pwa-cfg-orient', cfg.orientation || 'portrait-primary');
  s('pwa-cfg-bg2', cfg.colorBg2); s('pwa-cfg-bg2-text', cfg.colorBg2);
  s('pwa-cfg-surface', cfg.colorSurface); s('pwa-cfg-surface-text', cfg.colorSurface);
  s('pwa-cfg-surface2', cfg.colorSurface2); s('pwa-cfg-surface2-text', cfg.colorSurface2);
  s('pwa-cfg-gold', cfg.colorGold); s('pwa-cfg-gold-text', cfg.colorGold);
  s('pwa-cfg-gold2', cfg.colorGold2); s('pwa-cfg-gold2-text', cfg.colorGold2);
  s('pwa-cfg-cream', cfg.colorCream); s('pwa-cfg-cream-text', cfg.colorCream);
  s('pwa-cfg-muted', cfg.colorMuted); s('pwa-cfg-muted-text', cfg.colorMuted);
  s('pwa-cfg-fs-base', cfg.fontSizeBase);
  s('pwa-cfg-fs-title', cfg.fontSizeTitle);
  // Status badge + install button
  const badge = document.getElementById('pwa-status-badge');
  const installBtn = document.getElementById('pwa-install-btn-settings');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (badge) {
    if (isStandalone) { badge.className = 'badge bg'; badge.textContent = 'Instalada'; }
    else if (deferredPrompt) { badge.className = 'badge ba'; badge.textContent = 'Disponible'; }
    else { badge.className = 'badge by'; badge.textContent = 'No instalada'; }
  }
  if (installBtn) installBtn.style.display = (!isStandalone && deferredPrompt) ? '' : 'none';
  previewPWA();
}

function guardarPWAConfig() {
  const cfg = readPWAConfigFromUI();
  localStorage.setItem(PWA_CONFIG_KEY, JSON.stringify(cfg));
  applyPWAConfig(cfg);
  toast('Configuracion guardada');
}

function resetPWAConfig() {
  localStorage.removeItem(PWA_CONFIG_KEY);
  applyPWAConfig(PWA_DEFAULTS);
  loadPWAConfigUI();
  toast('Configuracion restaurada');
}

// ===================== PIN / LOGIN =====================
function initPin() {
  const screen = document.getElementById('pin-screen');
  const db = getDB();

  try {
    const savedSession = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (savedSession && savedSession.userId) {
      const user = db.usuarios.find(u => u.id === savedSession.userId);
      if (user) { currentUser = user; screen.style.display = 'none'; updateUserChip(); renderDashboard(); return; }
    }
  } catch {}

  function showUserList() {
    screen.innerHTML = `
      <img src="icons/logo-pin.png?v=9" style="width:80px;height:80px;margin-bottom:4px;object-fit:contain">
      <div class="pin-logo">Arcano</div>
      <div class="pin-sub">Complice del Sabor</div>
      <div class="user-list" style="margin-top:8px">
        ${db.usuarios.map(u => `
          <button class="user-btn" onclick="selectUser(${u.id})">
            <div class="user-avatar">${u.emoji}</div>
            <div>
              <div style="font-size:.95rem;font-weight:700">${u.nombre}</div>
              <div style="font-size:.7rem;color:var(--muted)">${u.rol}</div>
            </div>
          </button>`).join('')}
      </div>`;
  }

  window.selectUser = function(uid) {
    const user = db.usuarios.find(u => u.id === uid);
    if (!user) return;
    let entered = '';
    screen.innerHTML = `
      <div class="pin-logo">Arcano</div>
      <div class="pin-sub">${user.emoji} ${user.nombre}</div>
      <div class="pin-display" id="pin-dots">
        ${[0,1,2,3].map(() => '<div class="pin-dot"></div>').join('')}
      </div>
      <div class="pin-pad">
        ${[1,2,3,4,5,6,7,8,9,'←',0,'OK'].map(k => `<button class="pin-digit" onclick="pinKey('${k}')">${k}</button>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="initPin()" style="margin-top:4px">← Volver</button>
      <div id="pin-err" style="color:#e07070;font-size:.8rem;min-height:18px;margin-top:4px"></div>`;
    window.pinKey = function(k) {
      if (k === '←') { entered = entered.slice(0,-1); }
      else if (k === 'OK') {
        if (entered === user.pin) {
          currentUser = user;
          localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
          screen.style.display = 'none';
          updateUserChip();
          renderDashboard();
        } else { entered = ''; document.getElementById('pin-err').textContent = 'PIN incorrecto'; setTimeout(() => { const e = document.getElementById('pin-err'); if(e) e.textContent=''; }, 1500); }
      } else if (entered.length < 4) { entered += k; }
      const dots = document.querySelectorAll('.pin-dot');
      dots.forEach((d,i) => d.classList.toggle('filled', i < entered.length));
    };
  };

  showUserList();
}

function updateUserChip() {
  const chip = document.getElementById('user-chip');
  if (chip && currentUser) {
    chip.innerHTML = `${currentUser.emoji} ${currentUser.nombre} <span style="color:var(--muted);font-size:.7rem">▼</span>`;
  }
  // OCULTAR AJUSTES PARA OPERADORES
  const navAjustes = document.getElementById('nav-ajustes');
  if (navAjustes) {
    navAjustes.style.display = (currentUser && currentUser.rol === 'admin') ? '' : 'none';
  }
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('pin-screen').style.display = 'flex';
  initPin();
}

// ===================== NAV =====================
function goPage(name, btn) {
  // Operadores NO pueden acceder a Ajustes
  if (name === 'ajustes' && currentUser && currentUser.rol !== 'admin') return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  const renders = {
    dashboard: renderDashboard, costos: renderCostos, especias: renderEspecias,
    blends: renderBlends, ventas: renderVentas, reportes: renderReportes, ajustes: renderAjustes,
  };
  if (renders[name]) renders[name]();
  // Mostrar botón exportar blends solo para admin
  const btnExp = document.getElementById('btn-export-blends');
  if (btnExp) btnExp.style.display = (currentUser && currentUser.rol === 'admin' && name === 'blends') ? '' : 'none';
  // Cargar UI de config PWA al entrar a ajustes
  if (name === 'ajustes' && currentUser && currentUser.rol === 'admin') loadPWAConfigUI();
}

// ===================== DASHBOARD =====================
function renderDashboard() {
  const db = getDB(); const c = db.costos;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const mesStart = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ventasHoy = db.ventas.filter(v => new Date(v.fecha) >= hoy && v.estado !== 'cancelada');
  const ventasMes  = db.ventas.filter(v => new Date(v.fecha) >= mesStart && v.estado !== 'cancelada');
  const ingHoy = ventasHoy.reduce((s,v) => s + v.total, 0);
  const ingMes  = ventasMes.reduce((s,v) => s + v.total, 0);
  const stockBajo = db.especias.filter(e => e.stock <= e.stockMin).length;

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat"><div class="stat-label">Ventas hoy</div><div class="stat-value">${ventasHoy.length}</div><div class="stat-sub">${fmt(ingHoy)}</div></div>
    <div class="stat"><div class="stat-label">Ingresos mes</div><div class="stat-value">${fmt(ingMes)}</div><div class="stat-sub">${ventasMes.length} ventas</div></div>
    <div class="stat"><div class="stat-label">Especias</div><div class="stat-value">${db.especias.length}</div><div class="stat-sub">en catalogo</div></div>
    <div class="stat"><div class="stat-label">Stock bajo</div><div class="stat-value" style="color:${stockBajo>0?'var(--red)':'var(--green)'}">${stockBajo}</div><div class="stat-sub">requieren reposicion</div></div>`;

  const chart = document.getElementById('chart-7d');
  const dias = Array.from({length:7}, (_,i) => { const d=new Date(hoy); d.setDate(d.getDate()-(6-i)); return d; });
  const vals = dias.map(dia => {
    const sig = new Date(dia); sig.setDate(sig.getDate()+1);
    return db.ventas.filter(v => { const f=new Date(v.fecha); return f>=dia&&f<sig&&v.estado!=='cancelada'; }).reduce((s,v)=>s+v.total,0);
  });
  const max = Math.max(...vals, 1);
  chart.innerHTML = vals.map((v,i) => `
    <div class="bar-col">
      <div class="bar-val">${v ? fmt(v) : ''}</div>
      <div class="bar" style="height:${Math.round((v/max)*90)}px;opacity:${v?1:.25}"></div>
      <div class="bar-lbl">${fmtDay(dias[i].toISOString())}</div>
    </div>`).join('');

  const bajo = db.especias.filter(e => e.stock <= e.stockMin);
  const sb = document.getElementById('dash-stock-bajo');
  if (!bajo.length) {
    sb.innerHTML = '<div class="empty" style="padding:20px"><div class="empty-icon">✅</div><p>Todo el stock esta OK</p></div>';
  } else {
    sb.innerHTML = bajo.map(e => `
      <div class="flex items-center justify-between" style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.84rem">
        <span>${e.nombre}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="text-red fw7">${fmtG(e.stock)}</span>
          <span class="badge br">Bajo</span>
        </div>
      </div>`).join('');
  }

  const tbody = document.getElementById('dash-ventas-tabla');
  const ult = db.ventas.slice(0, 7);
  if (!ult.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="empty-icon">🧾</div><p>Sin ventas aun</p></div></td></tr>`;
  } else {
    tbody.innerHTML = ult.map(v => `<tr>
      <td class="text-muted text-xs">${fmtDateTime(v.fecha)}</td>
      <td class="text-sm">${v.items.map(i=>`${i.nombre}x${i.qty}`).join(', ')}</td>
      <td class="fw7 text-gold">${fmt(v.total)}</td>
      <td>${estadoBadge(v.estado)}</td>
    </tr>`).join('');
  }

  const conteo = {};
  db.ventas.filter(v=>v.estado!=='cancelada').forEach(v => v.items.forEach(i => { conteo[i.nombre] = (conteo[i.nombre]||0) + i.qty; }));
  const top = Object.entries(conteo).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topEl = document.getElementById('dash-top');
  topEl.innerHTML = top.length ? top.map(([n,q],i) => `
    <div class="flex items-center justify-between" style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.84rem">
      <span><span style="color:var(--gold-dim);margin-right:8px">${i+1}.</span>${n}</span>
      <span class="badge ba">${q} u.</span>
    </div>`).join('') : '<div class="text-muted text-sm" style="padding:12px 0">Sin datos de ventas aun</div>';
}

// ===================== COSTOS =====================
function saveCostos() {
  const db = getDB();
  db.costos = {
    envChico:  +document.getElementById('c-env-c').value  || 0,
    envGrande: +document.getElementById('c-env-g').value  || 0,
    pkgChico:  +document.getElementById('c-pkg-c').value  || 0,
    pkgGrande: +document.getElementById('c-pkg-g').value  || 0,
    etiqueta:  +document.getElementById('c-etiq').value   || 0,
    mo:        +document.getElementById('c-mo').value     || 0,
    otros:     +document.getElementById('c-otros').value  || 0,
  };
  saveDB(db);
  renderResumenCostos();
  toast('Costos guardados');
}

function renderCostos() {
  const c = getDB().costos;
  document.getElementById('c-env-c').value  = c.envChico;
  document.getElementById('c-env-g').value  = c.envGrande;
  document.getElementById('c-pkg-c').value  = c.pkgChico;
  document.getElementById('c-pkg-g').value  = c.pkgGrande;
  document.getElementById('c-etiq').value   = c.etiqueta;
  document.getElementById('c-mo').value     = c.mo;
  document.getElementById('c-otros').value  = c.otros;
  renderResumenCostos();
}

function renderResumenCostos() {
  const c = getDB().costos;
  const fijosC = c.pkgChico  + c.etiqueta + c.mo + c.otros;
  const fijosG = c.pkgGrande + c.etiqueta + c.mo + c.otros;
  const totalC = c.envChico  + fijosC;
  const totalG = c.envGrande + fijosG;
  document.getElementById('resumen-costos').innerHTML = `
    <div class="cost-box">
      <div class="fw7 text-gold text-sm mb-12">ENVASE CHICO</div>
      <div class="cost-row"><span>Envase</span><span>${fmt(c.envChico)}</span></div>
      <div class="cost-row"><span>Packaging</span><span>${fmt(c.pkgChico)}</span></div>
      <div class="cost-row"><span>Etiqueta</span><span>${fmt(c.etiqueta)}</span></div>
      <div class="cost-row"><span>Mano de obra</span><span>${fmt(c.mo)}</span></div>
      <div class="cost-row"><span>Otros</span><span>${fmt(c.otros)}</span></div>
      <div class="cost-row total"><span>Total fijos/u</span><span>${fmt(totalC)}</span></div>
    </div>
    <div class="cost-box">
      <div class="fw7 text-gold text-sm mb-12">ENVASE GRANDE</div>
      <div class="cost-row"><span>Envase</span><span>${fmt(c.envGrande)}</span></div>
      <div class="cost-row"><span>Packaging</span><span>${fmt(c.pkgGrande)}</span></div>
      <div class="cost-row"><span>Etiqueta</span><span>${fmt(c.etiqueta)}</span></div>
      <div class="cost-row"><span>Mano de obra</span><span>${fmt(c.mo)}</span></div>
      <div class="cost-row"><span>Otros</span><span>${fmt(c.otros)}</span></div>
      <div class="cost-row total"><span>Total fijos/u</span><span>${fmt(totalG)}</span></div>
    </div>`;
}

// ===================== ESPECIAS =====================
let editingEspId = null;

function openModalEspecia(id = null) {
  editingEspId = id;
  document.getElementById('modal-esp-titulo').textContent = id ? 'Editar especia' : 'Nueva especia';
  const db = getDB();
  if (id) {
    const e = db.especias.find(x => x.id === id);
    if (e) {
      document.getElementById('esp-nombre').value = e.nombre;
      document.getElementById('esp-precio').value = e.precioKg;
      document.getElementById('esp-stock').value  = e.stock || 0;
      document.getElementById('esp-stockmin').value = e.stockMin || 500;
      calcEsp100();
    }
  } else {
    ['esp-nombre'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('esp-precio').value = '';
    document.getElementById('esp-stock').value = '0';
    document.getElementById('esp-stockmin').value = '500';
    document.getElementById('esp-100').value = '';
  }
  openModal('modal-esp');
}

function calcEsp100() {
  const kg = parseFloat(document.getElementById('esp-precio').value) || 0;
  document.getElementById('esp-100').value = fmt(kg / 10);
}

function guardarEspecia() {
  const nombre = document.getElementById('esp-nombre').value.trim();
  const precioKg = parseFloat(document.getElementById('esp-precio').value) || 0;
  if (!nombre) { showAlert('alert-esp','El nombre es obligatorio.','err'); return; }
  const db = getDB();
  const obj = { nombre, precioKg, stock: +document.getElementById('esp-stock').value || 0, stockMin: +document.getElementById('esp-stockmin').value || 500 };
  if (editingEspId) { obj.id = editingEspId; const i = db.especias.findIndex(e => e.id === editingEspId); if (i >= 0) db.especias[i] = obj; }
  else { obj.id = nid(); db.especias.push(obj); }
  saveDB(db);
  toast(editingEspId ? 'Especia actualizada' : 'Especia creada');
  setTimeout(() => closeModal('modal-esp'), 700);
  renderEspecias();
}

function openModalStock(id) {
  const db = getDB(); const esp = db.especias.find(e => e.id === id);
  if (!esp) return;
  document.getElementById('ms-nombre').textContent = esp.nombre;
  document.getElementById('ms-stock-actual').textContent = fmtG(esp.stock);
  document.getElementById('ms-tipo').value = 'entrada';
  document.getElementById('ms-cantidad').value = '';
  document.getElementById('ms-nota-stock').value = '';
  document.getElementById('ms-esp-id').value = id;
  renderMovimientos(id);
  openModal('modal-stock');
}

function guardarMovimiento() {
  const id = +document.getElementById('ms-esp-id').value;
  const tipo = document.getElementById('ms-tipo').value;
  const cant = parseFloat(document.getElementById('ms-cantidad').value) || 0;
  const nota = document.getElementById('ms-nota-stock').value.trim();
  if (!cant || cant <= 0) { showAlert('alert-stock','Ingresa una cantidad valida.','err'); return; }
  const db = getDB(); const esp = db.especias.find(e => e.id === id);
  if (!esp) return;
  const delta = tipo === 'entrada' ? cant : -cant;
  esp.stock = Math.max(0, (esp.stock || 0) + delta);
  db.movimientos.push({ id: nid(), espId: id, tipo, cantidad: cant, nota, fecha: new Date().toISOString(), usuario: currentUser?.nombre || 'Sistema' });
  saveDB(db);
  document.getElementById('ms-stock-actual').textContent = fmtG(esp.stock);
  document.getElementById('ms-cantidad').value = '';
  renderMovimientos(id); renderEspecias();
  toast('Stock actualizado');
}

function renderMovimientos(espId) {
  const db = getDB();
  const movs = db.movimientos.filter(m => m.espId === espId).slice(-10).reverse();
  const el = document.getElementById('ms-historial');
  if (!movs.length) { el.innerHTML = '<div class="text-muted text-sm" style="padding:8px 0">Sin movimientos aun</div>'; return; }
  el.innerHTML = movs.map(m => `
    <div class="mov-row">
      <span class="${m.tipo === 'entrada' ? 'mov-in' : 'mov-out'}">${m.tipo === 'entrada' ? '▲' : '▼'}</span>
      <span class="fw7 ${m.tipo === 'entrada' ? 'text-green' : 'text-red'}">${fmtG(m.cantidad)}</span>
      <span class="text-muted text-xs">${m.nota || '—'}</span>
      <span class="text-muted text-xs mov-date">${fmtDateTime(m.fecha)}</span>
    </div>`).join('');
}

function eliminarEspecia(id) {
  if (!confirm('Eliminar esta especia?')) return;
  const db = getDB(); db.especias = db.especias.filter(e => e.id !== id);
  saveDB(db); renderEspecias(); toast('Especia eliminada');
}

function renderEspecias() {
  const q = (document.getElementById('search-esp')?.value || '').toLowerCase();
  const db = getDB();
  const list = db.especias.filter(e => e.nombre.toLowerCase().includes(q));
  const tbody = document.getElementById('tabla-especias');
  if (!list.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">🌿</div><p>No hay especias.</p></div></td></tr>`; return; }
  tbody.innerHTML = list.map(e => {
    const bajo = e.stock <= e.stockMin;
    return `<tr>
      <td><strong>${e.nombre}</strong></td>
      <td>${fmt(e.precioKg)}</td>
      <td class="text-gold">${fmt(e.precioKg / 10)}</td>
      <td class="${bajo ? 'stock-low' : 'stock-ok'}">${fmtG(e.stock)}</td>
      <td class="text-muted text-xs">${fmtG(e.stockMin)}</td>
      <td>${bajo ? '<span class="badge br">Stock bajo</span>' : '<span class="badge bg">OK</span>'}</td>
      <td class="tr" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openModalStock(${e.id})">📦 Stock</button>
        <button class="btn btn-ghost btn-sm" onclick="openModalEspecia(${e.id})">✏</button>
        <button class="btn btn-red btn-sm" onclick="eliminarEspecia(${e.id})">🗑</button>
      </td></tr>`;
  }).join('');
}

// ===================== HELPERS =====================
function estadoBadge(e) {
  const m = { completada:'bg', pendiente:'by', cancelada:'br', entregada:'ba' };
  return `<span class="badge ${m[e]||'ba'}">${e}</span>`;
}
