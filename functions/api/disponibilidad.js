// /api/disponibilidad.js — Cloudflare Pages Function
// ETAPA 4 (paso 4) — Devuelve datos de stock de insumos al catálogo de la tienda.
// La tienda ya no lee stock* directo de Firebase (reglas auth.uid admin).
//
// GET /api/disponibilidad → { stockEnvases, stockBolsas, stockCintas, stockCajas, stickers }
// Optimización: 5 lecturas en paralelo (Promise.all) + cache en memoria 5 min.

import { fbAdminGet, hasServiceAccount } from '../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Cache en memoria (5 minutos) — los stocks no cambian mientras un cliente navega
let _cachedStock = null;
let _cachedStockTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function leerStock(env, path) {
  try {
    const data = await fbAdminGet(env, '/arcano/db' + path);
    return data || null;
  } catch (e) {
    console.error('[disponibilidad] Error leyendo ' + path + ':', e.message);
    return null;
  }
}

function _filterStickers(stickers) {
  if (!stickers || typeof stickers !== 'object') return {};
  var filtered = {};
  var keys = Object.keys(stickers);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var st = stickers[k];
    if (st && typeof st === 'object') {
      filtered[k] = {
        nombre: st.nombre || '',
        stockChico: Number(st.stockChico) || 0,
        stockGrande: Number(st.stockGrande) || 0
      };
    }
  }
  return filtered;
}

export async function onRequestGet({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    if (!hasServiceAccount(env)) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'FIREBASE_SERVICE_ACCOUNT no configurada'
      }), { status: 500, headers: CORS_HEADERS });
    }

    // Cache: si tenemos datos frescos (<5 min), devolver directo
    if (_cachedStock && (Date.now() - _cachedStockTs) < CACHE_TTL) {
      return new Response(JSON.stringify({
        ok: true,
        ..._cachedStock,
        cached: true
      }), { headers: CORS_HEADERS });
    }

    // 5 lecturas en paralelo con Promise.all (más rápido que leer /arcano/db entero de 3MB)
    const [stockEnvases, stockBolsas, stockCintas, stockCajas, stickers] = await Promise.all([
      leerStock(env, '/stockEnvases'),
      leerStock(env, '/stockBolsas'),
      leerStock(env, '/stockCintas'),
      leerStock(env, '/stockCajas'),
      leerStock(env, '/stickers')
    ]);

    const result = {
      stockEnvases: stockEnvases || { chico: 0, grande: 0 },
      stockBolsas: stockBolsas || { chico: 0, grande: 0 },
      stockCintas: stockCintas || 0,
      stockCajas: stockCajas || 0,
      stickers: _filterStickers(stickers)
    };

    // Guardar en cache
    _cachedStock = result;
    _cachedStockTs = Date.now();

    return new Response(JSON.stringify({
      ok: true,
      ...result
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[disponibilidad] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
