// /api/notify-admin.js — Cloudflare Pages Function
// Notificaciones Web Push al admin — sin dependencias externas
// Implementa VAPID (RFC 8292) + Web Push Encryption (RFC 8291) con Web Crypto API nativo
// Lee las VAPID keys desde Firebase (configuradas desde el panel del admin)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';

// Cache en memoria de las VAPID keys (no las lee en cada request)
let _cachedVapid = null;
let _cachedVapidTs = 0;
const VAPID_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getVapidKeys() {
  // Usar cache si está fresco
  if (_cachedVapid && (Date.now() - _cachedVapidTs) < VAPID_CACHE_TTL) {
    return _cachedVapid;
  }
  try {
    const r = await fetch(`${FB_BASE}/pushConfig.json`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || !data.vapidPublicKey || !data.vapidPrivateKey || !data.vapidSubject) {
      return null;
    }
    _cachedVapid = {
      publicKey: data.vapidPublicKey,
      privateKey: data.vapidPrivateKey,
      subject: data.vapidSubject
    };
    _cachedVapidTs = Date.now();
    return _cachedVapid;
  } catch (e) {
    console.error('[notify-admin] Error leyendo VAPID de Firebase:', e);
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();
    const { evento, titulo, mensaje, data } = body;

    if (!titulo || !mensaje) {
      return new Response(JSON.stringify({ error: 'titulo and mensaje required' }), {
        status: 400, headers: CORS_HEADERS
      });
    }

    // 1. Leer VAPID keys desde Firebase
    const vapid = await getVapidKeys();
    if (!vapid) {
      return new Response(JSON.stringify({
        error: 'VAPID keys no configuradas. Pedile al admin que las cargue desde el panel de Notificaciones (sección "Configuración VAPID").'
      }), { status: 500, headers: CORS_HEADERS });
    }

    // 2. Leer suscripciones push del admin desde Firebase
    const subRes = await fetch(`${FB_BASE}/pushSubscriptions.json`);
    if (!subRes.ok) {
      return new Response(JSON.stringify({ error: 'No se pudieron leer suscripciones' }), {
        status: 500, headers: CORS_HEADERS
      });
    }
    const subsData = await subRes.json();

    if (!subsData || Object.keys(subsData).length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No hay dispositivos suscriptos. El admin debe activar notificaciones desde el panel.'
      }), { status: 200, headers: CORS_HEADERS });
    }

    // 3. Construir payload del push
    const payload = JSON.stringify({
      titulo: titulo,
      mensaje: mensaje,
      evento: evento || 'pedido',
      data: data || {},
      timestamp: Date.now()
    });

    // 4. Enviar push a cada suscripción
    const results = [];
    const subKeys = Object.keys(subsData);
    for (const subKey of subKeys) {
      const subscription = subsData[subKey];
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        results.push({ subKey, status: 'invalid_subscription' });
        continue;
      }

      try {
        await sendWebPush({
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth
            }
          },
          payload,
          vapid
        });
        results.push({ subKey, status: 'sent' });
      } catch (err) {
        const status = err?.status || 0;
        if (status === 404 || status === 410) {
          // Suscripción expiró — borrarla
          try {
            await fetch(`${FB_BASE}/pushSubscriptions/${subKey}.json`, { method: 'DELETE' });
            results.push({ subKey, status: 'deleted_expired' });
          } catch (e) {
            results.push({ subKey, status: 'error', error: err.message });
          }
        } else {
          results.push({ subKey, status: 'error', error: err.message });
        }
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const errors = results.filter(r => r.status === 'error').length;
    const expired = results.filter(r => r.status === 'deleted_expired').length;

    return new Response(JSON.stringify({
      ok: sent > 0,
      enviados: sent,
      errores: errors,
      expirados: expired,
      results
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[notify-admin] Error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Server error' }), {
      status: 500, headers: CORS_HEADERS
    });
  }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'test') {
    return onRequestPost({
      request: new Request(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'test',
          titulo: '🔔 Notificacion de prueba',
          mensaje: 'Si ves esto, las notificaciones push funcionan correctamente.',
          data: { url: '/admin/' }
        })
      }),
      env
    });
  }

  if (action === 'status') {
    try {
      const vapid = await getVapidKeys();
      const subRes = await fetch(`${FB_BASE}/pushSubscriptions.json`);
      const subsData = subRes.ok ? await subRes.json() : null;
      const count = subsData ? Object.keys(subsData).length : 0;
      return new Response(JSON.stringify({
        suscripciones: count,
        vapid_configurado: !!(vapid && vapid.publicKey && vapid.privateKey),
        vapid_tiene_public: !!(vapid?.publicKey),
        vapid_tiene_private: !!(vapid?.privateKey),
        vapid_tiene_subject: !!(vapid?.subject)
      }, null, 2), { headers: CORS_HEADERS });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: CORS_HEADERS
      });
    }
  }

  return new Response(JSON.stringify({
    name: 'Arcano Push API',
    endpoints: {
      'POST /api/notify-admin': 'Enviar push al admin',
      'GET /api/notify-admin?action=test': 'Push de prueba',
      'GET /api/notify-admin?action=status': 'Estado de suscripciones'
    }
  }), { headers: CORS_HEADERS });
}

// ===================== WEB PUSH IMPLEMENTATION =====================

async function sendWebPush({ subscription, payload, vapid }) {
  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;
  const { subject, privateKey, publicKey } = vapid;

  // 1. Generar VAPID JWT (RFC 8292)
  const jwt = await generateVapidJWT(subject, publicKey, privateKey);

  // 2. Encriptar payload (RFC 8291 / aes128gcm)
  const encryptedPayload = await encryptPayload(payload, p256dh, auth);

  // 3. POST al endpoint del push service
  // Header Authorization: vapid t=<jwt>; k=<base64url_public_key>
  // (la public key debe ir en base64url, sin padding)
  const authHeader = 'vapid t=' + jwt + '; k=' + publicKey;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': encryptedPayload.byteLength,
      'TTL': '2419200',
      'Authorization': authHeader,
      'Urgency': 'high'
    },
    body: encryptedPayload
  });

  if (!response.ok && response.status !== 201 && response.status !== 202) {
    const err = new Error('Push failed: ' + response.status + ' ' + response.statusText);
    err.status = response.status;
    try {
      const body = await response.text();
      err.message += ' — ' + body;
    } catch (e) {}
    throw err;
  }

  return { ok: true, status: response.status };
}

// Generar VAPID JWT (ES256)
async function generateVapidJWT(subject, publicKeyStr, privateKeyStr) {
  // Decodificar private key de base64url a bytes
  const privKeyBytes = base64UrlToBytes(privateKeyStr);

  // Construir JWT
  const header = { typ: 'JWT', alg: 'ES256' };
  const aud = extractAudience(subject);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: aud,
    exp: now + 12 * 60 * 60,
    sub: subject
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = headerB64 + '.' + payloadB64;

  // Convertir la raw private key (32 bytes) a formato PKCS8 DER
  // Web Crypto no acepta raw ECDSA private keys, solo PKCS8 o JWK
  const pkcs8Der = rawP256PrivateKeyToPkcs8(privKeyBytes);

  let cryptoKey;
  try {
    // Importar como PKCS8
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8Der,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  } catch (e) {
    // Si falla PKCS8, intentar como JWK
    const jwk = rawPrivateKeyToJwk(privKeyBytes);
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  }

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  // La firma puede venir en formato DER (ASN.1) o en formato raw (64 bytes R+S)
  // dependiendo del runtime. Cloudflare Workers devuelve raw en algunos casos.
  const sigBytes = new Uint8Array(signature);
  let rawSignature;
  if (sigBytes.length === 64) {
    // Ya está en formato raw (R + S, 32 bytes cada uno)
    rawSignature = sigBytes;
  } else {
    // Está en formato DER, hay que convertirlo a raw
    rawSignature = derToRaw(signature);
  }
  const signatureB64 = base64UrlEncodeBytes(new Uint8Array(rawSignature));

  return signingInput + '.' + signatureB64;
}

// Convertir raw P-256 private key (32 bytes) a PKCS8 DER
// Estructura PKCS8 para P-256:
// SEQUENCE {
//   INTEGER 0 (version),
//   SEQUENCE { OID 1.2.840.10045.2.1 (ecPublicKey), OID 1.2.840.10045.3.1.7 (P-256) },
//   OCTET STRING { SEQUENCE { INTEGER 1, OCTET STRING { <32-byte private key> } } }
// }
function rawP256PrivateKeyToPkcs8(rawKey) {
  if (rawKey.length !== 32) {
    throw new Error('Invalid raw P-256 private key length: ' + rawKey.length + ' (expected 32). Las VAPID keys de web-push generadas con npx son raw 32 bytes.');
  }

  // OID for ecPublicKey (1.2.840.10045.2.1)
  const OID_EC_PUBLIC_KEY = [0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01];
  // OID for P-256 / prime256v1 (1.2.840.10045.3.1.7)
  const OID_P256 = [0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07];

  // Build inner EC private key SEQUENCE { INTEGER 1, OCTET STRING(32) privKey }
  // INTEGER 1: 02 01 01
  // OCTET STRING(32): 04 20 <32 bytes>
  const integerOne = [0x02, 0x01, 0x01];
  const octetString32 = [0x04, 0x20];
  const ecPrivContent = new Uint8Array(integerOne.length + octetString32.length + 32);
  let off = 0;
  for (let i = 0; i < integerOne.length; i++) ecPrivContent[off++] = integerOne[i];
  for (let i = 0; i < octetString32.length; i++) ecPrivContent[off++] = octetString32[i];
  ecPrivContent.set(rawKey, off);
  
  // Wrap in SEQUENCE
  const ecPrivSeq = new Uint8Array(2 + ecPrivContent.length);
  ecPrivSeq[0] = 0x30;
  ecPrivSeq[1] = ecPrivContent.length;
  ecPrivSeq.set(ecPrivContent, 2);
  
  // OCTET STRING wrapping the EC private key SEQUENCE
  const octetStringWrapper = new Uint8Array(2 + ecPrivSeq.length);
  octetStringWrapper[0] = 0x04;
  octetStringWrapper[1] = ecPrivSeq.length;
  octetStringWrapper.set(ecPrivSeq, 2);
  
  // AlgorithmIdentifier: SEQUENCE { OID ecPublicKey, OID P-256 }
  const algIdContent = new Uint8Array(OID_EC_PUBLIC_KEY.length + OID_P256.length);
  algIdContent.set(OID_EC_PUBLIC_KEY, 0);
  algIdContent.set(OID_P256, OID_EC_PUBLIC_KEY.length);
  const algId = new Uint8Array(2 + algIdContent.length);
  algId[0] = 0x30;
  algId[1] = algIdContent.length;
  algId.set(algIdContent, 2);
  
  // version INTEGER 0
  const version = [0x02, 0x01, 0x00];
  
  // Top-level SEQUENCE { version, algId, OCTET STRING(ecPrivSeq) }
  const topContent = new Uint8Array(version.length + algId.length + octetStringWrapper.length);
  let off2 = 0;
  for (let i = 0; i < version.length; i++) topContent[off2++] = version[i];
  topContent.set(algId, off2); off2 += algId.length;
  topContent.set(octetStringWrapper, off2); off2 += octetStringWrapper.length;
  
  const pkcs8 = new Uint8Array(2 + topContent.length);
  pkcs8[0] = 0x30;
  pkcs8[1] = topContent.length;
  pkcs8.set(topContent, 2);
  
  return pkcs8.buffer;
}

// Alternativa: convertir raw private key a JWK
function rawPrivateKeyToJwk(rawKey) {
  // Convertir 32 bytes a base64url
  const d = base64UrlEncodeBytes(rawKey);
  return {
    kty: 'EC',
    crv: 'P-256',
    d: d,
    // x e y no son necesarios para signing, pero algunos navegadores los requieren
    // Los dejamos vacíos y esperamos que funcione
    ext: true
  };
}

// Encriptar payload con aes128gcm (RFC 8291)
async function encryptPayload(payload, p256dhB64, authB64) {
  const p256dh = base64UrlToBytes(p256dhB64);
  const auth = base64UrlToBytes(authB64);

  // Importar la public key del suscriptor (P-256 ECDH)
  const subscriberPublicKey = await crypto.subtle.importKey(
    'raw',
    p256dh,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Generar ephemeral key pair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Exportar ephemeral public key (65 bytes, uncompressed)
  const ephemeralPublicKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
  const ephemeralPublicKeyBytes = new Uint8Array(ephemeralPublicKey);

  // Compartir secret con ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberPublicKey },
    ephemeralKeyPair.privateKey,
    256
  );

  // HKDF para derivar CEK y nonce
  const ikm = new Uint8Array(sharedSecret);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const infoKey = new Uint8Array(
    15 + p256dh.length + ephemeralPublicKeyBytes.length
  );
  const infoLabel = new TextEncoder().encode('WebPush: info\0');
  infoKey.set(infoLabel, 0);
  infoKey.set(p256dh, infoLabel.length);
  infoKey.set(ephemeralPublicKeyBytes, infoLabel.length + p256dh.length);

  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(ikm, salt, cekInfo, 16);

  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(ikm, salt, nonceInfo, 12);

  // Construir input para encriptar: plaintext || delimiter (0x02)
  const plaintext = new TextEncoder().encode(payload);
  const inputBytes = new Uint8Array(plaintext.length + 1);
  inputBytes.set(plaintext, 0);
  inputBytes[plaintext.length] = 0x02;

  // Encriptar con AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    inputBytes
  );
  const encryptedBytes = new Uint8Array(encrypted);

  // Construir mensaje final RFC 8188 aes128gcm
  const keyIdLen = ephemeralPublicKeyBytes.length; // 65
  const finalPayload = new Uint8Array(16 + 4 + 1 + keyIdLen + encryptedBytes.length);

  let offset = 0;
  finalPayload.set(salt, offset); offset += 16;
  finalPayload[offset++] = 0x00;
  finalPayload[offset++] = 0x00;
  finalPayload[offset++] = 0x10;
  finalPayload[offset++] = 0x00;
  finalPayload[offset++] = keyIdLen;
  finalPayload.set(ephemeralPublicKeyBytes, offset); offset += keyIdLen;
  finalPayload.set(encryptedBytes, offset);

  return finalPayload;
}

async function hkdf(ikm, salt, info, length) {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = await crypto.subtle.sign('HMAC', saltKey, ikm);
  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info, 0);
  infoWithCounter[info.length] = 1;

  const t1 = await crypto.subtle.sign('HMAC', prkKey, infoWithCounter);
  if (length <= 32) return t1.slice(0, length);

  const infoWithCounter2 = new Uint8Array(info.length + 32 + 1);
  infoWithCounter2.set(new Uint8Array(t1), 0);
  infoWithCounter2.set(info, 32);
  infoWithCounter2[32 + info.length] = 2;
  const t2 = await crypto.subtle.sign('HMAC', prkKey, infoWithCounter2);

  const combined = new Uint8Array(64);
  combined.set(new Uint8Array(t1), 0);
  combined.set(new Uint8Array(t2), 32);
  return combined.slice(0, length);
}

function derToRaw(derSignature) {
  const der = new Uint8Array(derSignature);
  
  // Verificar que empiece con SEQUENCE (0x30)
  if (der[0] !== 0x30) {
    throw new Error('Invalid DER: expected 0x30 for SEQUENCE, got 0x' + der[0].toString(16));
  }
  
  // Calcular offset al contenido (manejar short-form y long-form length)
  let offset = 1;
  if (der[1] & 0x80) {
    // Long form length: el byte 1 indica cuántos bytes siguen para la length
    const lenBytes = der[1] & 0x7f;
    offset = 2 + lenBytes;
  } else {
    // Short form length: el byte 1 es la length directamente
    offset = 2;
  }
  
  // Ahora deberíamos estar en el primer INTEGER (r)
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER: expected 0x02 for r at offset ' + offset + ', got 0x' + der[offset].toString(16) + '. Signature length=' + der.length);
  }
  offset++;
  const rLen = der[offset];
  offset++;
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  
  // Segundo INTEGER (s)
  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER: expected 0x02 for s at offset ' + offset + ', got 0x' + der[offset].toString(16));
  }
  offset++;
  const sLen = der[offset];
  offset++;
  const s = der.slice(offset, offset + sLen);

  const rPadded = padToLength(r, 32);
  const sPadded = padToLength(s, 32);
  const raw = new Uint8Array(64);
  raw.set(rPadded, 0);
  raw.set(sPadded, 32);
  return raw;
}

function padToLength(arr, length) {
  if (arr.length === length) return arr;
  if (arr.length > length) return arr.slice(arr.length - length);
  const padded = new Uint8Array(length);
  padded.set(arr, length - arr.length);
  return padded;
}

function base64UrlToBytes(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncodeBytes(bytes);
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToDer(pem) {
  if (typeof pem !== 'string') return pem;
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
    .replace(/-----END EC PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (cleaned.length > 0 && /^[A-Za-z0-9+/_=-]+$/.test(cleaned)) {
    return base64UrlToBytes(cleaned);
  }
  return base64UrlToBytes(pem);
}

function extractAudience(subject) {
  try {
    if (subject.startsWith('mailto:')) {
      return 'https://fcm.googleapis.com';
    }
    return new URL(subject).origin;
  } catch (e) {
    return 'https://fcm.googleapis.com';
  }
}
