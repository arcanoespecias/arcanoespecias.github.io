// ===================== GITHUB SYNC MODULE v10 =====================

const GH_SYNC_KEY = 'arcano_github_config';
const GH_TOKEN_KEY = 'arcano_gh_token';
const GH_DATA_PATH = 'data/arcano-data.json';
const GH_POLL_INTERVAL = 3000;

// Repo hardcodeado: sobrevive al borrado de cache/cookies.
// Solo se necesita el token (se pide una sola vez y se guarda en localStorage).
const GH_DEFAULT = { owner: 'arcanoespecias', repo: 'arcano-v2', branch: 'main' };

let ghConfig = null;
let ghRemoteSha = null;
let ghPollTimer = null;
let ghSyncInProgress = false;
let ghPushErrors = 0;

// v10: Protege cambios locales pendientes de push contra un pull que los sobreescriba.
// Cuando saveDB() se llama, se guarda una snapshot. Si un pull arrives antes de que
// el push se complete, los cambios locales se restauran sobre lo descargado.
let _pendingPushSnapshot = null;

// -------------------- Config --------------------

function getGhConfig() {
  if (ghConfig) return ghConfig;
  const token = localStorage.getItem(GH_TOKEN_KEY) || '';
  if (!token) return null;
  ghConfig = { owner: GH_DEFAULT.owner, repo: GH_DEFAULT.repo, branch: GH_DEFAULT.branch, token: token };
  return ghConfig;
}

function saveGhConfig(config) {
  ghConfig = config;
  // Solo guardar el TOKEN en localStorage (lo unico que no se puede hardcodear)
  if (config.token) localStorage.setItem(GH_TOKEN_KEY, config.token);
  // Limpiar config vieja si existe
  localStorage.removeItem(GH_SYNC_KEY);
  try {
    const dbRaw = localStorage.getItem(DB_KEY);
    if (dbRaw) {
      const db = JSON.parse(dbRaw);
      db._ghConfig = { owner: GH_DEFAULT.owner, repo: GH_DEFAULT.repo, branch: GH_DEFAULT.branch };
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
  } catch {}
}

function clearGhConfig() {
  ghConfig = null;
  ghRemoteSha = null;
  _pendingPushSnapshot = null;
  localStorage.removeItem(GH_TOKEN_KEY);
  localStorage.removeItem(GH_SYNC_KEY);
  try {
    const dbRaw = localStorage.getItem(DB_KEY);
    if (dbRaw) {
      const db = JSON.parse(dbRaw);
      delete db._ghConfig;
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
  } catch {}
  stopGhPolling();
}

// -------------------- Auto-config por URL hash (solo token) --------------------

function checkHashConfig() {
  try {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#tk=')) return false;
    const token = hash.slice(4);
    history.replaceState(null, '', window.location.pathname);
    if (!token) return false;
    saveGhConfig({ owner: GH_DEFAULT.owner, repo: GH_DEFAULT.repo, branch: GH_DEFAULT.branch, token: token });
    return true;
  } catch { history.replaceState(null, '', window.location.pathname); return false; }
}

function generarLinkConexion() {
  const cfg = getGhConfig();
  if (!cfg) return '';
  return window.location.origin + window.location.pathname + '#tk=' + cfg.token;
}

// -------------------- API calls --------------------

async function ghApiRequest(method, endpoint, body) {
  const cfg = getGhConfig();
  if (!cfg) throw new Error('Configuracion de GitHub no encontrada');
  const sep = cfg.branch ? '&' : '?';
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_DATA_PATH}${cfg.branch ? '?ref=' + cfg.branch : ''}${sep}_t=${Date.now()}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Arcano-PWA'
    },
    cache: 'no-store',
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

// -------------------- v10: Fetch fresh SHA before push --------------------
// Siempre obtiene el SHA actual del archivo remoto ANTES de pushear.
// Evita conflictos 409 cuando otro dispositivo modifico el archivo.

async function ghFetchSha() {
  const cfg = getGhConfig();
  if (!cfg) return null;
  try {
    const url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + GH_DATA_PATH + (cfg.branch ? '?ref=' + cfg.branch : '') + '&_t=' + Date.now();
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Arcano-PWA'
      },
      cache: 'no-store'
    });
    if (res.status === 404) return null; // Archivo no existe aun
    if (!res.ok) {
      console.warn('[Sync] ghFetchSha error:', res.status);
      return null;
    }
    const data = await res.json();
    return data.sha;
  } catch (e) {
    console.warn('[Sync] ghFetchSha exception:', e.message);
    return null;
  }
}

// -------------------- Pull --------------------

async function ghPull() {
  if (ghSyncInProgress) return false;
  ghSyncInProgress = true;
  try {
    const data = await ghApiRequest('GET');
    if (!data) { ghRemoteSha = null; return false; }
    if (data.sha === ghRemoteSha) return false;

    ghRemoteSha = data.sha;
    // v8: Decodificacion UTF-8 correcta. atob() devuelve bytes sueltos (Latin-1),
    // pero el JSON original tiene caracteres UTF-8 multibyte (á,é,ñ,etc).
    // Sin TextDecoder, cada byte UTF-8 se trata como un char independiente,
    // causando mojibake (Ã©, Ã³) que se duplica en cada ciclo push/pull.
    const binStr = atob(data.content);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    const remoteDB = JSON.parse(new TextDecoder('utf-8').decode(bytes));

    // v10: Si hay cambios locales pendientes de push, protegerlos.
    // El pull descarga los datos remotos, pero luego restauramos los campos
    // que fueron modificados localmente ANTES de que el push se completara.
    if (_pendingPushSnapshot) {
      try {
        const pending = JSON.parse(_pendingPushSnapshot);
        const current = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
        // Comparar: si el local actual es IGUAL al pending (no fue modificado por otro medio),
        // entonces mezclar los cambios pendientes sobre el remoto.
        if (JSON.stringify(current) === _pendingPushSnapshot) {
          // Restaurar los datos locales sobre lo descargado del remoto
          Object.assign(remoteDB, pending);
          console.log('[Sync] Pull + restore pending changes');
        }
        _pendingPushSnapshot = null;
      } catch (e) {
        console.warn('[Sync] Error restoring pending snapshot:', e.message);
        _pendingPushSnapshot = null;
      }
    }

    // Merge config remota con token local (remoto NUNCA tiene token)
    // Limpiar _ghConfig del remoto (siempre usar el hardcodeado)
    if (remoteDB._ghConfig) delete remoteDB._ghConfig;

    localStorage.setItem(DB_KEY, JSON.stringify(remoteDB));
    syncIdCounter(remoteDB);

    // Actualizar referencia del usuario actual
    if (typeof currentUser !== 'undefined' && currentUser) {
      const updatedUser = (remoteDB.usuarios || []).find(u => u.id === currentUser.id);
      if (updatedUser) {
        currentUser = updatedUser;
        console.log('[Sync] Usuario actualizado:', currentUser.nombre, currentUser.rol);
        if (typeof updateUserChip === 'function') updateUserChip();
      }
    }

    console.log('[Sync] Pull OK - SHA:', ghRemoteSha.slice(0,7));
    if (typeof updateSyncUI === 'function') updateSyncUI('ok', 'Ahora');
    return true;
  } catch (err) {
    console.warn('[Sync] Pull error:', err.message);
    if (typeof updateSyncUI === 'function') updateSyncUI('error', 'Pull');
    return false;
  } finally { ghSyncInProgress = false; }
}

// -------------------- v10: Push with retry + fresh SHA --------------------

async function ghPush() {
  if (ghSyncInProgress) return;
  ghSyncInProgress = true;

  try {
    const dbRaw = localStorage.getItem(DB_KEY);
    if (!dbRaw) return;
    const db = JSON.parse(dbRaw);
    const cfg = getGhConfig();
    // NUNCA incluir el token en el contenido que se sube a GitHub
    if (cfg) db._ghConfig = { owner: GH_DEFAULT.owner, repo: GH_DEFAULT.repo, branch: GH_DEFAULT.branch };
    // Doble seguridad: eliminar cualquier token residual que pudiera haber quedado
    if (db._ghConfig && db._ghConfig.token) delete db._ghConfig.token;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(db, null, 2))));
    const body = { message: 'sync: ' + new Date().toISOString(), content };

    // v10: Siempre obtener SHA fresco antes de pushear
    const freshSha = await ghFetchSha();
    if (freshSha) {
      body.sha = freshSha;
      ghRemoteSha = freshSha;
    } else {
      // No hay archivo remoto (primera vez) - no incluir SHA
      delete body.sha;
      ghRemoteSha = null;
    }

    // v10: Reintentar hasta 3 veces con SHA fresco cada vez
    var maxRetries = 3;
    for (var attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await ghApiRequest('PUT', '', body);
        ghRemoteSha = result.content.sha;
        _pendingPushSnapshot = null; // Push exitoso, limpiar snapshot
        ghPushErrors = 0;
        console.log('[Sync] Push OK (attempt ' + attempt + ') - SHA:', ghRemoteSha.slice(0,7));
        if (typeof updateSyncUI === 'function') updateSyncUI('ok', 'OK');
        return;
      } catch (err) {
        console.warn('[Sync] Push attempt ' + attempt + ' error:', err.message);
        if (err.message && (err.message.includes('409') || err.message.includes('sha'))) {
          // Conflicto de SHA: obtener SHA fresco y reintentar
          if (attempt < maxRetries) {
            var newSha = await ghFetchSha();
            if (newSha) {
              body.sha = newSha;
              ghRemoteSha = newSha;
              console.log('[Sync] SHA conflict, retrying with fresh SHA:', newSha.slice(0,7));
              continue;
            } else {
              delete body.sha;
              ghRemoteSha = null;
              continue;
            }
          }
        }
        // Error que no es de SHA - no reintentar
        throw err;
      }
    }
  } catch (err) {
    console.warn('[Sync] Push error:', err.message);
    ghPushErrors++;
    if (typeof updateSyncUI === 'function') updateSyncUI('error', 'Push');
    if (ghPushErrors <= 3 && typeof toast === 'function') toast('Error sync: ' + err.message, 'err');
  } finally {
    ghSyncInProgress = false;
  }
}

// -------------------- Sync ID counter --------------------

function syncIdCounter(db) {
  try {
    const allIds = [
      ...(db.especias||[]).map(e=>e.id||0),
      ...(db.blends||[]).map(b=>b.id||0),
      ...(db.ventas||[]).map(v=>v.id||0),
      ...(db.movimientos||[]).map(m=>m.id||0),
      ...(db.usuarios||[]).map(u=>u.id||0),
    ];
    const maxId = Math.max(0, ...allIds);
    if (maxId >= _idC) _idC = maxId;
  } catch {}
}

// -------------------- Polling --------------------

function startGhPolling() {
  stopGhPolling();
  if (!getGhConfig()) return;
  console.log('[Sync] Polling cada', GH_POLL_INTERVAL, 'ms');
  ghPollTimer = setInterval(async () => {
    try {
      const updated = await ghPull();
      if (updated) {
        refreshCurrentPage();
        if (currentUser) toast('Datos actualizados');
      }
    } catch(e) { console.warn('[Sync] Poll error:', e.message); }
  }, GH_POLL_INTERVAL);
}

function stopGhPolling() {
  if (ghPollTimer) { clearInterval(ghPollTimer); ghPollTimer = null; }
}

// -------------------- Sync al recuperar foco --------------------

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && getGhConfig()) {
    ghPull().then(updated => {
      if (updated) { refreshCurrentPage(); if (currentUser) toast('Datos actualizados'); }
    });
  }
});

// -------------------- Refresh --------------------

function refreshCurrentPage() {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageId = activePage.id.replace('page-', '');
  const renders = {
    dashboard: renderDashboard, costos: renderCostos, especias: renderEspecias,
    blends: renderBlends, ventas: renderVentas, reportes: renderReportes, ajustes: renderAjustes,
  };
  if (renders[pageId]) renders[pageId]();
}

// -------------------- Test connection --------------------

async function ghTestConnection() {
  try {
    const cfg = getGhConfig();
    if (!cfg) return { ok: false, msg: 'Configuracion incompleta' };
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Arcano-PWA' }
    });
    if (!res.ok) {
      if (res.status === 404) return { ok: false, msg: 'Repo no encontrado o sin acceso' };
      if (res.status === 401) return { ok: false, msg: 'Token invalido o sin permisos' };
      return { ok: false, msg: `Error ${res.status}` };
    }
    const dataUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_DATA_PATH}${cfg.branch ? '?ref=' + cfg.branch : ''}`;
    const dataRes = await fetch(dataUrl, {
      cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Arcano-PWA' }
    });
    if (dataRes.status === 404) return { ok: true, msg: 'Conexion OK. Se creara el archivo al guardar.' };
    if (dataRes.ok) { ghRemoteSha = (await dataRes.json()).sha; return { ok: true, msg: 'Conexion OK. Archivo encontrado.' }; }
    return { ok: false, msg: 'No se pudo acceder al archivo de datos' };
  } catch (err) { return { ok: false, msg: err.message }; }
}

// -------------------- Init --------------------

async function initGithubSync() {
  const hashConfigured = checkHashConfig();

  // Limpiar token del DB local si existe (versiones viejas lo guardaban ahi)
  try {
    const dbRaw = localStorage.getItem(DB_KEY);
    if (dbRaw) {
      const db = JSON.parse(dbRaw);
      if (db._ghConfig && db._ghConfig.token) {
        delete db._ghConfig.token;
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        console.log('[Sync] Token removido del DB local (limpieza v8)');
      }
    }
  } catch {}

  const cfg = getGhConfig();
  if (!cfg) {
    console.log('[Sync] Sin token - mostrando pantalla de token');
    if (typeof showTokenScreen === 'function') showTokenScreen();
    return false;
  }
  console.log('[Sync] Config:', cfg.owner + '/' + cfg.repo);
  const updated = await ghPull();
  if (updated) console.log('[Sync] Datos iniciales descargados');
  if (hashConfigured) { await ghPush(); toast('Token recibido por link. Sincronizando...'); }
  startGhPolling();
  return true;
}

// -------------------- Token Screen --------------------
// Se muestra cuando no hay token (ej: despues de borrar cache/cookies).
// El usuario pega el token una vez y todos los datos se sincronizan desde GitHub.

function showTokenScreen() {
  const pinScreen = document.getElementById('pin-screen');
  if (!pinScreen) return;
  pinScreen.style.display = 'flex';
  pinScreen.innerHTML = `
    <img src="icons/logo-pin.png?v=10" style="width:70px;height:70px;margin-bottom:8px;object-fit:contain">
    <div class="pin-logo">Arcano</div>
    <div class="pin-sub">Ingresa tu token de GitHub</div>
    <p style="color:var(--muted);font-size:.78rem;max-width:280px;text-align:center;margin:12px 0">
      Se necesita una sola vez. Despues los datos se sincronizan automaticamente.
    </p>
    <div style="width:100%;max-width:320px">
      <input type="password" id="token-input" placeholder="ghp_xxxx..."
        style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--fg);font-size:.9rem;padding:12px;outline:none;text-align:center">
      <button class="btn btn-gold btn-full" style="margin-top:10px" onclick="conectarConToken()">Conectar</button>
    </div>
    <div id="token-err" style="color:#e07070;font-size:.8rem;min-height:18px;margin-top:6px"></div>
  `;
}

async function conectarConToken() {
  const token = (document.getElementById('token-input') || {}).value || '';
  const errEl = document.getElementById('token-err');
  if (!token.trim()) { if (errEl) errEl.textContent = 'Pega tu token de GitHub'; return; }
  if (errEl) errEl.textContent = 'Conectando...';
  // Probar conexion
  saveGhConfig({ owner: GH_DEFAULT.owner, repo: GH_DEFAULT.repo, branch: GH_DEFAULT.branch, token: token.trim() });
  const result = await ghTestConnection();
  if (result.ok) {
    toast('Conectado! Descargando datos...');
    const updated = await ghPull();
    if (updated) {
      // Datos descargados, iniciar app
      startGhPolling();
      document.getElementById('pin-screen').style.display = 'none';
      seedIfEmpty();
      initPin();
      renderGhAjustes();
      if (typeof updateSyncUI === 'function') updateSyncUI('ok', 'OK');
    } else {
      // No hay archivo de datos en GitHub - usar datos locales si existen
      // v10: Si hay datos locales, subirlos ahora
      startGhPolling();
      document.getElementById('pin-screen').style.display = 'none';
      seedIfEmpty();
      initPin();
      renderGhAjustes();
      // Hacer un push inicial si no hay datos remotos
      ghPush();
      if (typeof updateSyncUI === 'function') updateSyncUI('ok', 'Nuevo');
    }
  } else {
    clearGhConfig();
    if (errEl) errEl.textContent = result.msg || 'Token invalido';
  }
}

function getGhSyncStatus() {
  if (!getGhConfig()) return 'not_configured';
  if (ghPollTimer) return 'syncing';
  return 'configured';
}