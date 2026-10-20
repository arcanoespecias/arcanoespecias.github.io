// functions/_lib/firebase-admin.js — Firebase Admin REST helper usando Service Account
// ETAPA 4.5 — Genera JWT OAuth2 con Web Crypto API nativo (sin libs externas)
// y hace fetch a Firebase con Authorization: Bearer <jwt>.
// Esto permite que las Cloudflare Functions lean/escriban rutas admin-only.
//
// La service account se lee desde env.FIREBASE_SERVICE_ACCOUNT (JSON completo, cifrado).
// Si no está configurada, las functions devuelven error claro.

const FIREBASE_AUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.database';
const FIREBASE_AUTH_AUDIENCE = 'https://oauth2.googleapis.com/token';
const TOKEN_TTL_SECONDS = 3600; // 1 hora (máximo permitido por Google)

let _cachedServiceAccount = null;
let _cachedProjectId = null;
let _cachedToken = null;
let _cachedTokenExpiry = 0;

function _b64UrlEncode(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _strToB64Url(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _pemToBinary(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function _importPrivateKey(pem) {
  const der = _pemToBinary(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function _signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encHeader = _strToB64Url(JSON.stringify(header));
  const encPayload = _strToB64Url(JSON.stringify(payload));
  const signingInput = encHeader + '.' + encPayload;
  const dataBuf = new TextEncoder().encode(signingInput);
  const sigBuf = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    dataBuf
  );
  const encSig = _b64UrlEncode(sigBuf);
  return signingInput + '.' + encSig;
}

async function _exchangeJwtForAccessToken(jwt) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  });
  const resp = await fetch(FIREBASE_AUTH_AUDIENCE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('OAuth2 token exchange failed: ' + resp.status + ' ' + text);
  }
  const data = await resp.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || TOKEN_TTL_SECONDS
  };
}

function _loadServiceAccount(env) {
  if (_cachedServiceAccount) return _cachedServiceAccount;
  const raw = env?.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!sa.private_key || !sa.client_email || !sa.project_id) {
      throw new Error('Service account incompleta: faltan private_key/client_email/project_id');
    }
    _cachedServiceAccount = sa;
    _cachedProjectId = sa.project_id;
    return sa;
  } catch (e) {
    console.error('[firebase-admin] Error parseando FIREBASE_SERVICE_ACCOUNT:', e.message);
    return null;
  }
}

async function getAccessToken(env) {
  const now = Date.now();
  if (_cachedToken && _cachedTokenExpiry - now > 5 * 60 * 1000) {
    return _cachedToken;
  }

  const sa = _loadServiceAccount(env);
  if (!sa) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada en env vars');
  }

  const nowSec = Math.floor(now / 1000);
  const payload = {
    iss: sa.client_email,
    scope: FIREBASE_AUTH_SCOPE,
    aud: FIREBASE_AUTH_AUDIENCE,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SECONDS
  };

  const privateKey = await _importPrivateKey(sa.private_key);
  const jwt = await _signJwt(payload, privateKey);
  const tokenInfo = await _exchangeJwtForAccessToken(jwt);

  _cachedToken = tokenInfo.accessToken;
  _cachedTokenExpiry = now + (tokenInfo.expiresIn * 1000);
  return _cachedToken;
}

function getProjectId(env) {
  if (_cachedProjectId) return _cachedProjectId;
  const sa = _loadServiceAccount(env);
  return sa ? sa.project_id : null;
}

// === Wrappers para Firebase REST con auth ===
// Usamos query param auth=token (alternativa al header Authorization)

async function fbAdminGet(env, dbPath) {
  const token = await getAccessToken(env);
  const sa = _loadServiceAccount(env);
  const baseUrl = sa.databaseURL || `https://${sa.project_id}-default-rtdb.firebaseio.com`;
  const url = baseUrl + dbPath + '.json';
  const r = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Firebase GET failed: ' + r.status + ' ' + text);
  }
  return r.json();
}

async function fbAdminPost(env, dbPath, body) {
  const token = await getAccessToken(env);
  const sa = _loadServiceAccount(env);
  const baseUrl = sa.databaseURL || `https://${sa.project_id}-default-rtdb.firebaseio.com`;
  const url = baseUrl + dbPath + '.json';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Firebase POST failed: ' + r.status + ' ' + text);
  }
  return r.json();
}

async function fbAdminPatch(env, dbPath, body) {
  const token = await getAccessToken(env);
  const sa = _loadServiceAccount(env);
  const baseUrl = sa.databaseURL || `https://${sa.project_id}-default-rtdb.firebaseio.com`;
  const url = baseUrl + dbPath + '.json';
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Firebase PATCH failed: ' + r.status + ' ' + text);
  }
  return r.json();
}

async function fbAdminDelete(env, dbPath) {
  const token = await getAccessToken(env);
  const sa = _loadServiceAccount(env);
  const baseUrl = sa.databaseURL || `https://${sa.project_id}-default-rtdb.firebaseio.com`;
  const url = baseUrl + dbPath + '.json';
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Firebase DELETE failed: ' + r.status + ' ' + text);
  }
  return r.json();
}

function hasServiceAccount(env) {
  return !!env?.FIREBASE_SERVICE_ACCOUNT;
}

export {
  getAccessToken,
  getProjectId,
  fbAdminGet,
  fbAdminPost,
  fbAdminPatch,
  fbAdminDelete,
  hasServiceAccount
};
