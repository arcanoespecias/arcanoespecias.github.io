// /api/sync-coleccion-brevo.js — Cloudflare Pages Function (TEMPORAL)
// =============================================================================
// PROPOSITO: Sincronización retroactiva ONE-TIME.
// Recorre todos los clientes en Firebase, lee su Colección Arcano en /colecciones,
// y actualiza los atributos COLECCION_ARCANO + COLECCION_ARCANO_PCT en Brevo.
//
// USO:
//   1. Desplegar este archivo a Cloudflare Pages
//   2. Visitar https://arcanoespecias.com/api/sync-coleccion-brevo en el navegador
//   3. Esperar respuesta JSON con el resumen
//   4. BORRAR este archivo del repo y redesplegar (no debe quedar publicado)
//
// SEGURIDAD:
//   - Requiere token admin en query string: ?token=ARCANO_ADMIN_TOKEN
//   - Si no hay token o es incorrecto, devuelve 401
//   - Solo corre una vez — no se programa, no se ciclea
// =============================================================================

import { fbAdminGet, hasServiceAccount } from '../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

const BREVO_API_BASE = 'https://api.brevo.com/v3';

// === Helper: actualizar contacto en Brevo por email ===
async function updateBrevoContact(env, email, attributes) {
  if (!email || !env?.BREVO_API_KEY) return { ok: false, reason: 'no-email-or-key' };

  try {
    const resp = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ attributes: attributes })
    });

    if (resp.ok) return { ok: true };
    const result = await resp.json().catch(() => ({}));
    return { ok: false, status: resp.status, code: result.code, message: result.message };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// === Helper: crear contacto en Brevo si no existe (luego update) ===
async function upsertBrevoContact(env, email, attributes, listId) {
  if (!email || !env?.BREVO_API_KEY) return { ok: false, reason: 'no-email-or-key' };

  // Intentar create con updateEnabled: true — esto crea o actualiza
  try {
    const resp = await fetch(`${BREVO_API_BASE}/contacts`, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        attributes: attributes,
        listIds: [listId],
        updateEnabled: true
      })
    });

    if (resp.ok) return { ok: true, action: 'created-or-updated' };
    const result = await resp.json().catch(() => ({}));
    if (result.code === 'duplicate_parameter') {
      // Ya existe y updateEnabled no funcionó — hacer PUT directo
      const putResp = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ attributes: attributes })
      });
      if (putResp.ok) return { ok: true, action: 'updated' };
      return { ok: false, action: 'put-failed', status: putResp.status };
    }
    return { ok: false, status: resp.status, code: result.code, message: result.message };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// === Normalizar whatsapp (igual que pedido.js) ===
function normalizeWhatsapp(phone) {
  if (!phone) return '';
  var digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.indexOf('57') !== 0) digits = '57' + digits;
  else if (digits.length === 11 && digits.indexOf('57') === 0) { /* ok */ }
  else if (digits.length === 12 && digits.indexOf('57') === 0) { /* ok */ }
  else if (digits.length === 13 && digits.indexOf('0057') === 0) digits = digits.slice(2);
  else return '';
  if (digits.indexOf('57') !== 0) return '';
  return digits;
}

export async function onRequestGet({ request, env }) {
  // === Validar token admin ===
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const expectedToken = env?.ARCANO_ADMIN_TOKEN;

  if (!expectedToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'ARCANO_ADMIN_TOKEN no configurado en env vars de Cloudflare'
    }), { status: 500, headers: CORS_HEADERS });
  }
  if (token !== expectedToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Token inválido. Uso: /api/sync-coleccion-brevo?token=TU_TOKEN'
    }), { status: 401, headers: CORS_HEADERS });
  }

  // === Validar Service Account Firebase ===
  if (!hasServiceAccount(env)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT no configurada'
    }), { status: 500, headers: CORS_HEADERS });
  }

  // === Validar API key Brevo ===
  if (!env?.BREVO_API_KEY) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'BREVO_API_KEY no configurada'
    }), { status: 500, headers: CORS_HEADERS });
  }

  const BREVO_LIST_ID = 2;

  try {
    // === Leer /clientes y /colecciones de Firebase en paralelo ===
    console.log('[sync-coleccion] Leyendo /clientes y /colecciones de Firebase...');
    const [clientes, colecciones] = await Promise.all([
      fbAdminGet(env, '/arcano/db/clientes'),
      fbAdminGet(env, '/arcano/db/colecciones')
    ]);

    if (!clientes || typeof clientes !== 'object') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No se pudo leer /clientes de Firebase'
      }), { status: 500, headers: CORS_HEADERS });
    }

    const clientesKeys = Object.keys(clientes);
    console.log('[sync-coleccion] Clientes encontrados:', clientesKeys.length);

    // Construir mapa de colecciones por teléfono normalizado (para lookup O(1))
    var coleccionByTel = {};
    if (colecciones && typeof colecciones === 'object') {
      var collKeys = Object.keys(colecciones);
      for (var i = 0; i < collKeys.length; i++) {
        var k = collKeys[i];
        var kDigits = String(k).replace(/\D/g, '');
        if (kDigits) coleccionByTel[kDigits] = colecciones[k];
      }
    }
    console.log('[sync-coleccion] Colecciones indexadas:', Object.keys(coleccionByTel).length);

    // === Iterar clientes y sincronizar cada uno ===
    var resultados = [];
    var sincronizados = 0;
    var sinEmail = 0;
    var sinColeccion = 0;
    var errores = 0;

    for (var j = 0; j < clientesKeys.length; j++) {
      var clienteKey = clientesKeys[j];
      var c = clientes[clienteKey];
      var email = (c.email || '').trim();
      var tel = normalizeWhatsapp(c.telefono || c.telNorm);

      if (!email) {
        sinEmail++;
        resultados.push({
          cliente: clienteKey,
          nombre: c.nombre || '',
          telefono: c.telefono || '',
          status: 'skip-no-email'
        });
        continue;
      }

      if (!tel) {
        sinColeccion++;
        resultados.push({
          cliente: clienteKey,
          nombre: c.nombre || '',
          email: email,
          status: 'skip-no-tel'
        });
        continue;
      }

      // Buscar colección por teléfono
      var coleccion = coleccionByTel[tel] || null;
      var casilleros = coleccion ? (Number(coleccion.casilleros) || 0) : 0;
      var pct = Math.min(100, casilleros * 10);

      // Si no hay colección, igual sincronizamos con 0 (cliente nuevo sin progreso)
      if (!coleccion) {
        sinColeccion++;
      }

      // Llamar a Brevo
      var attributes = {
        COLECCION_ARCANO: casilleros,
        COLECCION_ARCANO_PCT: pct
      };
      // También pasar nombre/telefono/ciudad para refrescar (opcional pero recomendado)
      if (c.nombre) attributes.NOMBRE = c.nombre;
      if (c.telefono) attributes.TELEFONO = c.telefono;
      if (c.ciudad) attributes.CIUDAD = c.ciudad;

      var result = await upsertBrevoContact(env, email, attributes, BREVO_LIST_ID);

      if (result.ok) {
        sincronizados++;
        resultados.push({
          cliente: clienteKey,
          nombre: c.nombre || '',
          email: email,
          telefono: c.telefono || '',
          casilleros: casilleros,
          pct: pct,
          status: 'ok',
          action: result.action
        });
      } else {
        errores++;
        resultados.push({
          cliente: clienteKey,
          nombre: c.nombre || '',
          email: email,
          status: 'error',
          error: result
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      resumen: {
        totalClientes: clientesKeys.length,
        sincronizados: sincronizados,
        sinEmail: sinEmail,
        sinColeccion: sinColeccion,
        errores: errores
      },
      resultados: resultados,
      instrucciones: 'Si todo está OK, BORRAR este endpoint del repo y redesplegar.'
    }, null, 2), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[sync-coleccion] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message
    }), { status: 500, headers: CORS_HEADERS });
  }
}
