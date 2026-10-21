// /api/carrito.js — Cloudflare Pages Function
// ETAPA 4.1 — Tracking de carrito abandonado desde el servidor.
// La tienda deja de escribir directo en Firebase /carritos.
//
// Acciones (POST con action):
//   - action=save    → crea o actualiza un carrito (recibe items, total, clienteData)
//   - action=empty   → marca el carrito como vacío
//   - action=convert → marca el carrito como convertido (pedido completado)
//
// Seguridad:
//   - Genera un carritoId aleatorio seguro (crypto.getRandomValues)
//   - Valida tamaño máximo de items (50)
//   - Valida tipos de campos (cantidad numérica, total numérico)
//   - El cliente guarda el carritoId en localStorage y lo manda en cada update
//   - Sin carritoId → crea nuevo (POST inicial)
//   - Con carritoId → update (PATCH)
//   - Las reglas de Firebase solo permiten crear (!data.exists()) y update del propio registro

import { fbAdminPost, fbAdminPatch, fbAdminGet, hasServiceAccount } from '../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';
const MAX_ITEMS = 50;
const MAX_ITEM_QTY = 99;
const MAX_TOTAL = 99999999; // $99.999.999 COP

function genCarritoId() {
  // 16 bytes aleatorios → 32 chars hex
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return 'car_' + hex;
}

function validateItems(items) {
  if (!Array.isArray(items)) return 'items debe ser array';
  if (items.length > MAX_ITEMS) return 'Demasiados items (máx ' + MAX_ITEMS + ')';
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') return 'item inválido en posición ' + i;
    const qty = Number(it.qty);
    if (!isFinite(qty) || qty < 1 || qty > MAX_ITEM_QTY) {
      return 'cantidad inválida en item ' + i;
    }
    const precio = Number(it.precio);
    if (!isFinite(precio) || precio < 0) {
      return 'precio inválido en item ' + i;
    }
  }
  return null;
}

function validateTotal(total) {
  const t = Number(total);
  if (!isFinite(t) || t < 0 || t > MAX_TOTAL) return 'total inválido';
  return null;
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
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Firebase POST failed: ' + r.status + ' ' + text);
  }
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
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Firebase PATCH failed: ' + r.status + ' ' + text);
  }
  return r.json();
}

async function fbGet(env, path) {
  if (hasServiceAccount(env)) {
    return fbAdminGet(env, '/arcano/db' + path);
  }
  const r = await fetch(`${FB_BASE}${path}.json`);
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Firebase GET failed: ' + r.status + ' ' + text);
  }
  return r.json();
}

export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'carrito',
    message: 'POST { action: save|empty|convert, carritoId?, items?, total?, clienteData? }'
  }), { headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'save') {
      return await actionSave(env, body);
    } else if (action === 'empty') {
      return await actionEmpty(env, body);
    } else if (action === 'convert') {
      return await actionConvert(env, body);
    } else {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Acción inválida. Use: save, empty, convert'
      }), { status: 400, headers: CORS_HEADERS });
    }
  } catch (e) {
    console.error('[carrito] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}

// action=save: crea o actualiza un carrito activo
async function actionSave(env, body) {
  const { carritoId, items, total, clienteId, clienteData } = body;

  // Validar items si vienen
  if (items !== undefined) {
    const err = validateItems(items);
    if (err) return { status: 400, body: { ok: false, error: err } };
  }
  // Validar total si viene
  if (total !== undefined) {
    const err = validateTotal(total);
    if (err) return { status: 400, body: { ok: false, error: err } };
  }

  const now = new Date().toISOString();

  // Si no hay carritoId, crear nuevo
  if (!carritoId) {
    const newId = genCarritoId();
    const data = {
      carritoId: newId,
      items: items || [],
      total: Number(total) || 0,
      itemCount: items ? items.reduce((s, c) => s + (Number(c.qty) || 1), 0) : 0,
      clienteId: clienteId || null,
      cliente: clienteData || null,
      creado: now,
      actualizado: now,
      estado: 'activo'
    };
    try {
      await fbPost(env, '/carritos', data);
      return { status: 200, body: { ok: true, carritoId: newId } };
    } catch (e) {
      console.error('[carrito] Error creando carrito:', e.message);
      return { status: 500, body: { ok: false, error: 'No se pudo crear el carrito' } };
    }
  }

  // Si hay carritoId, actualizar
  // Nota: para actualizar necesitamos la push key real de Firebase, no nuestro carritoId interno.
  // La tienda guarda la push key (no el carritoId) en localStorage.
  // Para mantener compatibilidad, aceptamos que carritoId sea la push key de Firebase.
  const updates = { actualizado: now, estado: 'activo' };
  if (items !== undefined) {
    updates.items = items;
    updates.itemCount = items.reduce((s, c) => s + (Number(c.qty) || 1), 0);
  }
  if (total !== undefined) updates.total = Number(total);
  if (clienteId !== undefined) updates.clienteId = clienteId || null;
  if (clienteData !== undefined) updates.cliente = clienteData || null;

  try {
    await fbPatch(env, '/carritos/' + carritoId, updates);
    return { status: 200, body: { ok: true, carritoId: carritoId } };
  } catch (e) {
    console.error('[carrito] Error actualizando carrito ' + carritoId + ':', e.message);
    return { status: 500, body: { ok: false, error: 'No se pudo actualizar el carrito' } };
  }
}

// action=empty: marcar carrito como vacío
async function actionEmpty(env, body) {
  const { carritoId } = body;
  if (!carritoId) {
    return { status: 400, body: { ok: false, error: 'carritoId obligatorio' } };
  }
  try {
    await fbPatch(env, '/carritos/' + carritoId, {
      estado: 'vacio',
      actualizado: new Date().toISOString()
    });
    return { status: 200, body: { ok: true } };
  } catch (e) {
    console.error('[carrito] Error vaciando carrito:', e.message);
    return { status: 500, body: { ok: false, error: 'No se pudo vaciar el carrito' } };
  }
}

// action=convert: marcar carrito como convertido (pedido completado)
async function actionConvert(env, body) {
  const { carritoId } = body;
  if (!carritoId) {
    return { status: 400, body: { ok: false, error: 'carritoId obligatorio' } };
  }
  try {
    await fbPatch(env, '/carritos/' + carritoId, {
      estado: 'convertido',
      convertidoEn: new Date().toISOString()
    });
    return { status: 200, body: { ok: true } };
  } catch (e) {
    console.error('[carrito] Error convirtiendo carrito:', e.message);
    return { status: 500, body: { ok: false, error: 'No se pudo marcar como convertido' } };
  }
}
