// /api/carrito.js — Cloudflare Pages Function
// ETAPA 4.1 — Tracking de carrito abandonado desde el servidor.
// La tienda deja de escribir directo en Firebase /carritos.
//
// Acciones (POST con action):
//   - action=save    → crea o actualiza un carrito (recibe items, total, clienteData)
//   - action=empty   → marca el carrito como vacío
//   - action=convert → marca el carrito como convertido (pedido completado)

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function genCarritoId() {
  // Generar ID aleatorio. Usamos crypto si está disponible, si no Math.random.
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return 'car_' + hex;
    }
  } catch (e) {
    console.warn('[carrito] crypto.getRandomValues no disponible, usando Math.random');
  }
  return 'car_' + Date.now().toString(16) + Math.random().toString(16).slice(2, 18);
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
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminPost(env, '/arcano/db' + path, body);
  console.log('[carrito] fbPost ruta usada: arcano/db' + path);
  return data;
}

async function fbPatch(env, path, body) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminPatch(env, '/arcano/db' + path, body);
  console.log('[carrito] fbPatch ruta usada: arcano/db' + path);
  return data;
}

async function fbGet(env, path) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminGet(env, '/arcano/db' + path);
  console.log('[carrito] fbGet ruta usada: arcano/db' + path);
  return data;
}

export async function onRequestGet({ request }) {
  return json({
    ok: true,
    service: 'carrito',
    message: 'POST { action: save|empty|convert, carritoId?, items?, total?, clienteData? }'
  });
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
      return json({ ok: false, error: 'Acción inválida. Use: save, empty, convert' }, 400);
    }
  } catch (e) {
    console.error('[carrito] Error:', e.message);
    return json({ ok: false, error: e.message || 'Server error' }, 500);
  }
}

// action=save: crea o actualiza un carrito activo
async function actionSave(env, body) {
  const { carritoId, items, total, clienteId, clienteData } = body;

  // Validar items si vienen
  if (items !== undefined) {
    const err = validateItems(items);
    if (err) return json({ ok: false, error: err }, 400);
  }
  // Validar total si viene
  if (total !== undefined) {
    const err = validateTotal(total);
    if (err) return json({ ok: false, error: err }, 400);
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
      return json({ ok: true, carritoId: newId });
    } catch (e) {
      console.error('[carrito] Error creando carrito:', e.message);
      return json({ ok: false, error: 'No se pudo crear el carrito' }, 500);
    }
  }

  // Si hay carritoId, actualizar
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
    return json({ ok: true, carritoId: carritoId });
  } catch (e) {
    console.error('[carrito] Error actualizando carrito ' + carritoId + ':', e.message);
    return json({ ok: false, error: 'No se pudo actualizar el carrito' }, 500);
  }
}

// action=empty: marcar carrito como vacío
async function actionEmpty(env, body) {
  const { carritoId } = body;
  if (!carritoId) {
    return json({ ok: false, error: 'carritoId obligatorio' }, 400);
  }
  try {
    await fbPatch(env, '/carritos/' + carritoId, {
      estado: 'vacio',
      actualizado: new Date().toISOString()
    });
    return json({ ok: true });
  } catch (e) {
    console.error('[carrito] Error vaciando carrito:', e.message);
    return json({ ok: false, error: 'No se pudo vaciar el carrito' }, 500);
  }
}

// action=convert: marcar carrito como convertido (pedido completado)
async function actionConvert(env, body) {
  const { carritoId } = body;
  if (!carritoId) {
    return json({ ok: false, error: 'carritoId obligatorio' }, 400);
  }
  try {
    await fbPatch(env, '/carritos/' + carritoId, {
      estado: 'convertido',
      convertidoEn: new Date().toISOString()
    });
    return json({ ok: true });
  } catch (e) {
    console.error('[carrito] Error convirtiendo carrito:', e.message);
    return json({ ok: false, error: 'No se pudo marcar como convertido' }, 500);
  }
}
