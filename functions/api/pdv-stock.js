// /api/pdv-stock.js — Cloudflare Pages Function
// Devuelve el stock consolidado de todos los PDVs para que la tienda
// pública pueda calcular el stock total (admin + PDVs) sin necesidad
// de acceso directo a Firebase (reglas auth.uid admin).
//
// GET /api/pdv-stock → { pdvs: { <pdvId>: { nombre, stock: { stockKey: qty } } }, stockPorProducto: { stockKey: totalQty } }
//
// stockKey = tipo + '_' + productoId + '_' + talla  (ej: "blend_5_chico")
//
// Cache en memoria 2 minutos (los stocks no cambian mientras un cliente navega).

import { fbAdminGet, hasServiceAccount } from '../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Cache en memoria (2 minutos)
let _cachedData = null;
let _cachedTs = 0;
const CACHE_TTL = 2 * 60 * 1000;

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

    // Cache: si tenemos datos frescos (<2 min), devolver directo
    if (_cachedData && (Date.now() - _cachedTs) < CACHE_TTL) {
      return new Response(JSON.stringify({
        ok: true,
        ..._cachedData,
        cached: true
      }), { headers: CORS_HEADERS });
    }

    // Leer puntosDeVenta con el service account admin
    const pdvsRaw = await fbAdminGet(env, '/arcano/db/puntosDeVenta');

    // Consolidar stock por producto+talla
    const stockPorProducto = {};
    const pdvs = {};

    if (pdvsRaw && typeof pdvsRaw === 'object') {
      for (const pdvId in pdvsRaw) {
        if (!pdvsRaw.hasOwnProperty(pdvId)) continue;
        const pdv = pdvsRaw[pdvId];
        if (!pdv || typeof pdv !== 'object') continue;
        const nombre = pdv.nombre || ('PDV ' + pdvId);
        const stock = pdv.stock || {};
        pdvs[pdvId] = { nombre: nombre, stock: stock };
        // Sumar al consolidado
        for (const stockKey in stock) {
          if (!stock.hasOwnProperty(stockKey)) continue;
          stockPorProducto[stockKey] = (stockPorProducto[stockKey] || 0) + (Number(stock[stockKey]) || 0);
        }
      }
    }

    const result = {
      pdvs: pdvs,
      stockPorProducto: stockPorProducto,
      totalPDVs: Object.keys(pdvs).length,
      totalLineas: Object.keys(stockPorProducto).length
    };

    // Guardar en cache
    _cachedData = result;
    _cachedTs = Date.now();

    return new Response(JSON.stringify({
      ok: true,
      ...result
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[pdv-stock] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
