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
import { sendOTPEmail } from '../_lib/brevo.js';

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
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminGet(env, '/arcano/db' + path);
  console.log('[cuenta] fbGet ruta usada: arcano/db' + path);
  return data;
}

async function fbPost(env, path, body) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminPost(env, '/arcano/db' + path, body);
  console.log('[cuenta] fbPost ruta usada: arcano/db' + path);
  return data;
}

async function fbPatch(env, path, body) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminPatch(env, '/arcano/db' + path, body);
  console.log('[cuenta] fbPatch ruta usada: arcano/db' + path);
  return data;
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

// === Helper: verificar sesión y devolver cliente + otpData ===
async function _verifySession(env, sessionToken, clienteId) {
  if (!sessionToken || !clienteId) {
    return { ok: false, status: 401, error: 'Sesión inválida' };
  }
  const otpData = await fbGet(env, `/otpPendientes/${sessionToken}`);
  if (!otpData || !otpData.verificado) {
    return { ok: false, status: 401, error: 'Sesión inválida o expirada' };
  }
  if (otpData.clienteKey !== clienteId) {
    return { ok: false, status: 403, error: 'Token no corresponde al cliente' };
  }
  if (Date.now() > (otpData.expira || 0) + VERIFIED_TTL_MS) {
    return { ok: false, status: 401, error: 'Sesión expirada' };
  }
  // Leer cliente para obtener telNorm (key de la colección)
  const cliente = await fbGet(env, `/clientes/${clienteId}`);
  if (!cliente) {
    return { ok: false, status: 404, error: 'Cliente no encontrado' };
  }
  return { ok: true, otpData, cliente };
}

// === ACTION: pedidos del cliente (requiere sessionToken) ===
async function actionPedidos(env, body) {
  const { sessionToken, clienteId } = body;
  const sessionCheck = await _verifySession(env, sessionToken, clienteId);
  if (!sessionCheck.ok) {
    return { ok: false, status: sessionCheck.status, body: { ok: false, error: sessionCheck.error } };
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

// === ACTION: colección del cliente (tarjeta de lealtad, requiere sessionToken) ===
async function actionColeccion(env, body) {
  const { sessionToken, clienteId } = body;
  const sessionCheck = await _verifySession(env, sessionToken, clienteId);
  if (!sessionCheck.ok) {
    return { ok: false, status: sessionCheck.status, body: { ok: false, error: sessionCheck.error } };
  }

  // La colección se guarda en /colecciones con key = whatsapp del cliente
  const cliente = sessionCheck.cliente;
  const whatsapp = cliente.telefono || cliente.telNorm || '';
  if (!whatsapp) {
    // Cliente sin teléfono — devolver cartón vacío
    return {
      ok: true,
      body: {
        ok: true,
        coleccion: {
          whatsapp: '', nombre: cliente.nombre || '', casilleros: 0,
          completado: false, canjeado: false, historial: []
        }
      }
    };
  }

  // Normalizar whatsapp para buscarlo como key en /colecciones
  // La key original en Firebase es el teléfono sin '+' ni espacios (formato internacional colombiano)
  var keyWhatsapp = String(whatsapp).replace(/[^0-9+]/g, '');
  if (keyWhatsapp.startsWith('+')) keyWhatsapp = keyWhatsapp.substring(1);

  // Probar varias claves posibles (con y sin código de país)
  const allColecciones = await fbGet(env, '/colecciones');
  var coleccion = null;
  if (allColecciones && typeof allColecciones === 'object') {
    // Buscar match exacto primero
    if (allColecciones[keyWhatsapp]) {
      coleccion = allColecciones[keyWhatsapp];
    } else {
      // Buscar por variantes: sin '57' adelante, con '57' adelante
      var keys = Object.keys(allColecciones);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        // Comparar solo por dígitos
        var kDigits = k.replace(/\D/g, '');
        var wDigits = keyWhatsapp.replace(/\D/g, '');
        if (kDigits === wDigits || kDigits.endsWith(wDigits) || wDigits.endsWith(kDigits)) {
          coleccion = allColecciones[k];
          break;
        }
      }
    }
  }

  if (!coleccion) {
    // Cartón vacío para clientes nuevos
    coleccion = {
      whatsapp: keyWhatsapp,
      nombre: cliente.nombre || '',
      casilleros: 0,
      completado: false,
      canjeado: false,
      historial: []
    };
  }

  return {
    ok: true,
    body: {
      ok: true,
      coleccion: coleccion
    }
  };
}

// === ACTION: registrar o actualizar cliente (login directo por WhatsApp) ===
// ETAPA 4 — Migración de registrarCliente (tienda-data.js) al servidor.
// La tienda ya no lee/escribe /clientes directo.
//
// FIX CRÍTICO: actionRegistrar ahora crea un sessionToken en /otpPendientes
// con verificado=true para que el cliente pueda consultar /api/cuenta
// action=pedidos y action=coleccion sin pasar por el flujo OTP (que fue
// desactivado del frontend). Sin este fix, el cliente se loguea pero
// actionPedidos/actionColeccion responden 401 'Sesión inválida'.
async function actionRegistrar(env, body) {
  const { telefono, nombre } = body;
  if (!telefono) {
    return { ok: false, status: 400, body: { ok: false, error: 'Teléfono obligatorio' } };
  }
  if (!nombre || !nombre.trim()) {
    return { ok: false, status: 400, body: { ok: false, error: 'Nombre obligatorio' } };
  }
  // Reutilizar upsertClienteByPhone
  const result = await upsertClienteByPhone(env, telefono, nombre.trim());

  // === Crear sesión verificada (sessionToken) para este cliente ===
  // Esto reemplaza el flujo OTP desactivado. El cliente queda logueado
  // automáticamente y puede consultar /api/cuenta action=pedidos y
  // action=coleccion durante VERIFIED_TTL_MS (30 días).
  const now = Date.now();
  const otpPendiente = {
    clienteKey: result.key,
    telefono: telefono,
    nombre: nombre.trim(),
    verificado: true,         // ← ya verificado, sin pasar por OTP
    verificadoEn: now,
    expira: now,              // timestamp base para VERIFIED_TTL_MS en _verifySession
    creado: now,
    registro_directo: true    // flag para distinguir de los OTP reales
  };
  const sessionResult = await fbPost(env, '/otpPendientes', otpPendiente);
  const sessionToken = sessionResult.name;
  const sessionExpiry = now + VERIFIED_TTL_MS;

  // Devolver datos del cliente + sessionToken al frontend
  return {
    ok: true,
    body: {
      ok: true,
      cliente: {
        id: result.key,
        nombre: result.cliente.nombre || nombre.trim(),
        telefono: result.cliente.telefono || telefono,
        email: result.cliente.email || '',
        ciudad: result.cliente.ciudad || '',
        direccion: result.cliente.direccion || '',
        totalPedidos: result.cliente.totalPedidos || 0,
        creado: result.cliente.creado || ''
      },
      sessionToken: sessionToken,
      sessionExpiry: sessionExpiry,
      esNuevo: result.isNew
    }
  };
}

// === ACTION: verificar si existe un cliente por teléfono (para autocompletar UI) ===
// ETAPA 4 — Migración de _mcBuscarCliente (tienda-ui.js).
// La tienda ya no lee /clientes directo.
async function actionCheck(env, body) {
  const { telefono } = body;
  if (!telefono) {
    return { ok: false, status: 400, body: { ok: false, error: 'Teléfono obligatorio' } };
  }
  const tel = normalizeWhatsapp(telefono);
  if (!tel) {
    return { ok: false, status: 400, body: { ok: false, error: 'Teléfono inválido' } };
  }
  const allClientes = await fbGet(env, '/clientes');
  if (allClientes && typeof allClientes === 'object') {
    var keys = Object.keys(allClientes);
    for (var i = 0; i < keys.length; i++) {
      var c = allClientes[keys[i]];
      if (c && c.telNorm === tel) {
        return {
          ok: true,
          body: {
            ok: true,
            existe: true,
            cliente: { nombre: c.nombre || '' }
          }
        };
      }
    }
  }
  return {
    ok: true,
    body: { ok: true, existe: false, cliente: null }
  };
}

// === ACTION: enviar código OTP por email (verificación de email) ===
async function actionSendOTPEmail(env, body) {
  const { email, nombre, telefono } = body;
  if (!email || !email.trim()) {
    return { ok: false, status: 400, body: { ok: false, error: 'Email es obligatorio' } };
  }

  // Generar código de 4 dígitos
  var codigo = String(Math.floor(1000 + Math.random() * 9000));
  var now = Date.now();
  var expira = now + 10 * 60 * 1000; // 10 minutos

  // Guardar OTP en /otpPendientes con referencia al email
  var otpData = {
    tipo: 'email_verification',
    email: email.trim().toLowerCase(),
    nombre: nombre || '',
    telefono: telefono || '',
    codigo: codigo,
    creadoTs: now,
    expira: expira,
    intentos: 0,
    verificado: false
  };

  try {
    const result = await fbPost(env, '/otpPendientes', otpData);
    const otpKey = result.name;

    // Enviar email con el código via Brevo
    try {
      await sendOTPEmail(env, { email: email.trim(), nombre: nombre || '', codigo: codigo });
    } catch (e) {
      console.warn('[cuenta] Error enviando OTP email:', e.message);
      return { ok: false, status: 500, body: { ok: false, error: 'No se pudo enviar el email de verificación' } };
    }

    return {
      ok: true,
      body: {
        ok: true,
        otpKey: otpKey,
        email: email.trim(),
        mensaje: 'Te enviamos un código de 4 dígitos por email. Revisá tu casilla.'
      }
    };
  } catch (e) {
    console.error('[cuenta] Error en sendOTP:', e.message);
    return { ok: false, status: 500, body: { ok: false, error: 'No se pudo generar el código' } };
  }
}

// === ACTION: verificar código OTP por email ===
async function actionVerifyOTPEmail(env, body) {
  const { otpKey, codigo, email } = body;
  if (!otpKey || !codigo) {
    return { ok: false, status: 400, body: { ok: false, error: 'Falta otpKey o codigo' } };
  }

  try {
    const otpData = await fbGet(env, '/otpPendientes/' + otpKey);
    if (!otpData) {
      return { ok: false, status: 404, body: { ok: false, error: 'El código expiró o no existe. Solicitá uno nuevo.' } };
    }

    // Verificar expiración
    if (Date.now() > (otpData.expira || 0)) {
      return { ok: false, status: 400, body: { ok: false, error: 'El código expiró. Solicitá uno nuevo.' } };
    }

    // Verificar intentos
    const intentos = otpData.intentos || 0;
    if (intentos >= 3) {
      return { ok: false, status: 429, body: { ok: false, error: 'Demasiados intentos. Esperá 10 minutos.' } };
    }

    if (String(otpData.codigo) !== String(codigo).trim()) {
      await fbPatch(env, '/otpPendientes/' + otpKey, { intentos: intentos + 1 });
      var remaining = 3 - (intentos + 1);
      return {
        ok: false,
        status: 400,
        body: { ok: false, error: 'Código incorrecto. ' + (remaining > 0 ? remaining + ' intentos restantes.' : 'Sin intentos.') }
      };
    }

    // Código correcto: marcar verificado
    await fbPatch(env, '/otpPendientes/' + otpKey, { verificado: true, verificadoEn: Date.now() });

    // Buscar y actualizar el cliente para marcar email como verificado
    var clienteEmail = email || otpData.email || '';
    if (clienteEmail) {
      const allClientes = await fbGet(env, '/clientes');
      if (allClientes && typeof allClientes === 'object') {
        var keys = Object.keys(allClientes);
        for (var i = 0; i < keys.length; i++) {
          var c = allClientes[keys[i]];
          if (c && (c.email || '').toLowerCase() === clienteEmail.toLowerCase()) {
            await fbPatch(env, '/clientes/' + keys[i], { emailVerificado: true });
            break;
          }
        }
      }
    }

    return {
      ok: true,
      body: {
        ok: true,
        email: clienteEmail,
        mensaje: 'Email verificado correctamente'
      }
    };
  } catch (e) {
    console.error('[cuenta] Error en verifyOTP:', e.message);
    return { ok: false, status: 500, body: { ok: false, error: 'Error de conexión' } };
  }
}

// === ACTION: buscar cliente por email (para Mi Cuenta después de verificar OTP) ===
async function actionFindByEmail(env, body) {
  const { email } = body;
  if (!email) {
    return { ok: false, status: 400, body: { ok: false, error: 'Email obligatorio' } };
  }
  var emailLower = email.trim().toLowerCase();
  const allClientes = await fbGet(env, '/clientes');
  if (allClientes && typeof allClientes === 'object') {
    var keys = Object.keys(allClientes);
    for (var i = 0; i < keys.length; i++) {
      var c = allClientes[keys[i]];
      if (c && (c.email || '').toLowerCase() === emailLower) {
        // Generar sessionToken usando un OTP verificado o crear uno nuevo
        var sessionToken = keys[i]; // usar el clienteId como token temporal
        return {
          ok: true,
          body: {
            ok: true,
            existe: true,
            cliente: {
              id: keys[i],
              nombre: c.nombre || '',
              telefono: c.telefono || '',
              email: c.email || '',
              ciudad: c.ciudad || '',
              direccion: c.direccion || '',
              totalPedidos: c.totalPedidos || 0,
              creado: c.creado || ''
            },
            sessionToken: sessionToken,
            sessionExpiry: Date.now() + 30 * 24 * 60 * 60 * 1000
          }
        };
      }
    }
  }
  // Cliente no encontrado por email — devolver sesión vacía
  return {
    ok: true,
    body: {
      ok: true,
      existe: false,
      cliente: null,
      sessionToken: null
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
    actions: ['otp', 'verify', 'pedidos', 'coleccion', 'registrar', 'check', 'send-otp-email', 'verify-otp-email', 'logout']
  }), { headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

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
      case 'coleccion':
        result = await actionColeccion(env, body);
        break;
      case 'registrar':
        result = await actionRegistrar(env, body);
        break;
      case 'check':
        result = await actionCheck(env, body);
        break;
      case 'send-otp-email':
        result = await actionSendOTPEmail(env, body);
        break;
      case 'verify-otp-email':
        result = await actionVerifyOTPEmail(env, body);
        break;
      case 'find-by-email':
        result = await actionFindByEmail(env, body);
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
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
