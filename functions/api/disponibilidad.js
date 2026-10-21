// /api/disponibilidad.js — Cloudflare Pages Function
// ETAPA 4 (paso 4) — Devuelve datos de stock de insumos al catálogo de la tienda.
// La tienda ya no lee stock* directo de Firebase (reglas auth.uid admin).
//
// GET /api/disponibilidad → { stockEnvases, stockBolsas, stockCintas, stockCajas, stickers }
// Solo devuelve los campos mínimos que la tienda necesita para calcular disponibilidad.

import { fbAdminGet, hasServiceAccount } from '../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';

export async function onRequestGet({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Leer las 5 colecciones de stock con Service Account
    if (!hasServiceAccount(env)) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'FIREBASE_SERVICE_ACCOUNT no configurada'
      }), { status: 500, headers: CORS_HEADERS });
    }

    // Función helper: leer y filtrar solo campos necesarios
    async function leerStock(path) {
      try {
        const data = await fbAdminGet(env, '/arcano/db' + path);
        console.log('[disponibilidad] fbAdminGet ruta usada: arcano/db' + path);
        return data || null;
      } catch (e) {
        console.error('[disponibilidad] Error leyendo ' + path + ':', e.message);
        return null;
      }
    }

    const [stockEnvases, stockBolsas, stockCintas, stockCajas, stickers] = await Promise.all([
      leerStock('/stockEnvases'),
      leerStock('/stockBolsas'),
      leerStock('/stockCintas'),
      leerStock('/stockCajas'),
      leerStock('/stickers')
    ]);

    // Filtrar stickers: solo nombre + stockChico + stockGrande (no otros campos internos)
    var stickersFiltrados = null;
    if (stickers && typeof stickers === 'object') {
      stickersFiltrados = {};
      var keys = Object.keys(stickers);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var st = stickers[k];
        if (st && typeof st === 'object') {
          stickersFiltrados[k] = {
            nombre: st.nombre || '',
            stockChico: Number(st.stockChico) || 0,
            stockGrande: Number(st.stockGrande) || 0
          };
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      stockEnvases: stockEnvases || { chico: 0, grande: 0 },
      stockBolsas: stockBolsas || { chico: 0, grande: 0 },
      stockCintas: stockCintas || 0,
      stockCajas: stockCajas || 0,
      stickers: stickersFiltrados || {}
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[disponibilidad] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
