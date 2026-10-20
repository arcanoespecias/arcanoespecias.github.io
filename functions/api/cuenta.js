// /api/cuenta.js — Cloudflare Pages Function
// ETAPA 3 — Maneja OTP y datos de cuenta del cliente desde el servidor.
//   POST action=otp      → genera OTP, guarda en otpPendientes, NO devuelve el código
//   POST action=verify   → verifica OTP, devuelve datos del cliente (sin OTP)
//   POST action=pedidos  → devuelve historial de pedidos del cliente autenticado por OTP exitoso
//   POST action=logout   → limpia sesión server-side (no-op por ahora, sesión es por OTP)
// ETAPA 4.5 — Usa Firebase Admin (Service Account) para bypassar reglas admin-only.
//
// La tienda deja de leer clientes / otpPendientes / pedidos directamente desde Firebase.

import { fbAdminGet, fbAdminPost, fbAdminPatch, hasServiceAccount } from '../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const OTP_MAX_ATTEMPTS = 3;
const VERIFIED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function normalizeWhatsapp(phone) {
  if (!phone) return '';
  var digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.indexOf('57') !== 0) digits = '57' + digits;
  else if (digits.length === 13 && digits.indexOf('0057') === 0) digits = digits.slice(2);
  else if (digits.indexOf('57') !== 0) return '';
  return digits;
}

function genOtpCode() {
  var c = '';
  for (var i = 0; i < 6; i++) c += Math.floor(Math.random() * 10);
  return c;
}

async function fbGet(env, path) {
  if (hasServiceAccount(env)) {
    return fbAdminGet(env, '/arcano/db' + path);
  }
  const r = await fetch(`${FB_BASE}${path}.json`);
  if (!r.ok) throw new Error('Firebase GET failed: ' + r.status);
  return r.json();
}

async function fbPost(env, path, body) {
  if (hasServiceAccount(env)) {
    return fbAdminPost(env, '/arcano/db' + path, body);
  }
  const r = await fetch(`${FB_BASE}${path}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Firebase POST failed: ' + r.status);
  return r.json();
}

async function fbPatch(env, path, body) {
  if (hasServiceAccount(env)) {
    return fbAdminPatch(env, '/arcano/db' + path, body);
  }
  const r = await fetch(`${FB_BASE}${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Firebase PATCH failed: ' + r.status);
  return r.json();
}

// === Buscar o crear cliente por telNorm, devolver key y datos (sin OTP) ===
async function upsertClienteByPhone(env, telefono, nombreOpt) {
  const tel = normalizeWhatsapp(telefono);
  if (!tel) throw new Error('Teléfono inválido');

  // Leer todos los clientes y filtrar en servidor (evita dependencia de indexOn en reglas)
  const allClientes = await fbGet(env, '/clientes');
  var key = null;
  var existing = null;
  if (allClientes && typeof allClientes === 'object') {
    var keys = Object.keys(allClientes);
    for (var i = 0; i < keys.length; i++) {
      var c = allClientes[keys[i]];
      if (c && c.telNorm === tel) {
        key = keys[i];
        existing = c;
        break;
      }
    }
  }

  if (existing) {
    // Si viene nombre nuevo y no estaba seteado, actualizar
    if (nombreOpt && !existing.nombre) {
      await fbPatch(env, `/clientes/${key}`, { nombre: nombreOpt, ultimoLogin: new Date().toISOString() });
      existing.nombre = nombreOpt;
    }
    return { key, cliente: existing, isNew: false };
  }

  // Crear nuevo
  const now = new Date().toISOString();
  const nuevoCliente = {
    nombre: nombreOpt || '',
    telefono: telefono,
    telNorm: tel,
    email: '',
    ciudad: '',
    direccion: '',
    creado: now,
    ultimoPedido: now,
    totalPedidos: 0
  };
  const result = await fbPost(env, '/clientes', nuevoCliente);
  key = result.name;
  return { key, cliente: nuevoCliente, isNew: true };
}

// === ACTION: solicitar OTP ===
async function actionOtp(env, body) {
  const { telefono, nombre } = body;
  if (!telefono) {
    return { ok: false, status: 400, body: { ok: false, error: 'Teléfono obligatorio' } };
  }

  // Upsert cliente (busca por teléfono)
  const upsert = await upsertClienteByPhone(env, telefono, nombre);

  // Generar OTP de 6 dígitos
  const codigo = genOtpCode();
  const now = Date.now();
  const expira = now + OTP_TTL_MS;

  // Guardar en otpPendientes (NO en /clientes, para no exponer el código en lectura pública)
  const otpPendiente = {
    clienteKey: upsert.key,
    nombre: upsert.cliente.nombre || nombre || '',
    telefono: telefono,
    telNorm: normalizeWhatsapp(telefono),
    codigo: codigo,
    creado: new Date().toISOString(),
    creadoTs: now,
    expira: expira,
    enviado: false,
    esNuevo: upsert.isNuevo,
    intentos: 0,
    verificado: false
  };
  const result = await fbPost(env, '/otpPendientes', otpPendiente);
  const otpKey = result.name;

  // === Notificar al admin por email/push (fire-and-forget) si es cliente nuevo ===
  if (upsert.isNuevo) {
    try {
      await fetch('https://arcanoespecias.com/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'cliente_nuevo',
          titulo: '👤 Nuevo cliente registrado',
          mensaje: (upsert.cliente.nombre || nombre || 'Cliente') + ' se acaba de registrar con WhatsApp ' + telefono + '. Revisá el panel de Mensajes WA para enviarle el código de acceso.',
          data: { url: '/admin/', otpKey: otpKey }
        })
      });
    } catch (e) {
      console.warn('[cuenta] notify-admin falló (no crítico):', e.message);
    }
  }

  // IMPORTANTE: NO devolver el código al frontend — el admin lo envía por WhatsApp
  return {
    ok: true,
    body: {
      ok: true,
      otpKey: otpKey,
      clienteKey: upsert.key,
      clienteNuevo: upsert.isNuevo,
      nombre: upsert.cliente.nombre || nombre || '',
      expiraEn: OTP_TTL_MS,
      // Mensaje que el admin verá: indicar que hay que enviar el código
      mensaje: upsert.isNuevo
        ? 'Cliente nuevo. El código fue enviado al panel del admin. Te lo enviaremos por WhatsApp en breve.'
        : 'Tu código fue enviado. Te lo enviaremos por WhatsApp en breve.'
    }
  };
}

// === ACTION: verificar OTP ===
async function actionVerify(env, body) {
  const { otpKey, codigo } = body;
  if (!otpKey || !codigo) {
    return { ok: false, status: 400, body: { ok: false, error: 'Falta otpKey o codigo' } };
  }

  const otpData = await fbGet(env, `/otpPendientes/${otpKey}`);
  if (!otpData) {
    return { ok: false, status: 404, body: { ok: false, error: 'El código expiró o no existe. Solicitá uno nuevo.' } };
  }

  // Verificar expiración
  if (Date.now() > (otpData.expira || 0)) {
    return { ok: false, status: 400, body: { ok: false, error: 'El código expiró. Solicitá uno nuevo.' } };
  }

  // Verificar intentos
  const intentos = (otpData.intentos || 0);
  if (intentos >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, body: { ok: false, error: 'Demasiados intentos. Esperá 30 minutos.' } };
  }

  if (String(otpData.codigo) !== String(codigo).trim()) {
    // Incrementar intentos
    await fbPatch(env, `/otpPendientes/${otpKey}`, { intentos: intentos + 1 });
    const remaining = OTP_MAX_ATTEMPTS - (intentos + 1);
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: 'Código incorrecto. ' + (remaining > 0 ? remaining + ' intentos restantes.' : 'Sin intentos restantes.')
      }
    };
  }

  // === Código correcto: marcar verificado y devolver datos del cliente ===
  await fbPatch(env, `/otpPendientes/${otpKey}`, { verificado: true, verificadoEn: Date.now() });

  // Leer cliente desde Firebase
  const clienteKey = otpData.clienteKey;
  if (!clienteKey) {
    return { ok: false, status: 500, body: { ok: false, error: 'OTP sin clienteKey' } };
  }
  const cliente = await fbGet(env, `/clientes/${clienteKey}`);
  if (!cliente) {
    return { ok: false, status: 404, body: { ok: false, error: 'Cliente no encontrado' } };
  }

  // Actualizar ultimoLogin
  await fbPatch(env, `/clientes/${clienteKey}`, { ultimoLogin: new Date().toISOString() });

  // Generar token de sesión simple (para que el cliente pueda pedir su historial)
  // Usamos el otpKey verificado como token de sesión (30 días)
  const sessionToken = otpKey;
  const sessionExpiry = Date.now() + VERIFIED_TTL_MS;

  // Devolver datos del cliente SIN OTP ni campos sensibles internos
  return {
    ok: true,
    body: {
      ok: true,
      cliente: {
        id: clienteKey,
        nombre: cliente.nombre || '',
        telefono: cliente.telefono || '',
        email: cliente.email || '',
        ciudad: cliente.ciudad || '',
        direccion: cliente.direccion || '',
        totalPedidos: cliente.totalPedidos || 0,
        creado: cliente.creado || ''
      },
      sessionToken: sessionToken,
      sessionExpiry: sessionExpiry
    }
  };
}

// === ACTION: pedidos del cliente (requiere sessionToken) ===
async function actionPedidos(env, body) {
  const { sessionToken, clienteId } = body;
  if (!sessionToken || !clienteId) {
    return { ok: false, status: 401, body: { ok: false, error: 'Sesión inválida' } };
  }

  // Verificar que el sessionToken sea un OTP verificado y que el clienteId coincida
  const otpData = await fbGet(env, `/otpPendientes/${sessionToken}`);
  if (!otpData || !otpData.verificado) {
    return { ok: false, status: 401, body: { ok: false, error: 'Sesión inválida o expirada' } };
  }
  if (otpData.clienteKey !== clienteId) {
    return { ok: false, status: 403, body: { ok: false, error: 'Token no corresponde al cliente' } };
  }
  if (Date.now() > (otpData.expira || 0) + VERIFIED_TTL_MS) {
    return { ok: false, status: 401, body: { ok: false, error: 'Sesión expirada' } };
  }

  // Leer pedidos del cliente (sin orderBy para evitar dependencia de indexOn en reglas)
  const allPedidos = await fbGet(env, '/pedidos');
  var pedidos = [];
  if (allPedidos && typeof allPedidos === 'object') {
    var keys = Object.keys(allPedidos);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var p = allPedidos[k];
      if (!p || p.clienteId !== clienteId) continue;
      p._key = k;
      pedidos.push(p);
    }
  }
  // Ordenar por creado desc
  pedidos.sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });

  return {
    ok: true,
    body: {
      ok: true,
      pedidos: pedidos
    }
  };
}

// === MAIN ROUTER ===
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'info';
  return new Response(JSON.stringify({
    ok: true,
    service: 'cuenta',
    actions: ['otp', 'verify', 'pedidos', 'logout']
  }), { headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // DEBUG ETAPA 4.5 — verificar que env y Service Account llegan
  console.log('[cuenta] env keys:', env ? Object.keys(env).filter(k => !k.startsWith('__')).join(',') : 'env is null');
  console.log('[cuenta] hasServiceAccount:', hasServiceAccount(env));
  console.log('[cuenta] FIREBASE_SERVICE_ACCOUNT length:', env?.FIREBASE_SERVICE_ACCOUNT ? (typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' ? env.FIREBASE_SERVICE_ACCOUNT.length : 'object') : 'not set');

  try {
    const body = await request.json();
    const action = body.action;

    var result;
    switch (action) {
      case 'otp':
        result = await actionOtp(env, body);
        break;
      case 'verify':
        result = await actionVerify(env, body);
        break;
      case 'pedidos':
        result = await actionPedidos(env, body);
        break;
      default:
        result = { ok: false, status: 400, body: { ok: false, error: 'Acción inválida: ' + action } };
    }

    return new Response(JSON.stringify(result.body), {
      status: result.status || 200,
      headers: CORS_HEADERS
    });

  } catch (e) {
    console.error('[cuenta] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error',
      debug: {
        hasSA: hasServiceAccount(env),
        envKeys: env ? Object.keys(env).filter(k => !k.startsWith('__') && k.length < 30).join(',') : 'env is null'
      }
    }), { status: 500, headers: CORS_HEADERS });
  }
}
