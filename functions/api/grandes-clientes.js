// /api/grandes-clientes.js — Cloudflare Pages Function
// ETAPA 4.1 — Alta de solicitudes de Grandes Clientes (restaurantes/hoteles).
// La tienda deja de escribir directo en Firebase /grandesClientes.
// Seguridad: solo crea (no lee ni modifica), valida campos y tamaño.

import { fbAdminPost, hasServiceAccount } from '../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';
const MAX_NOMBRE = 100;
const MAX_TELEFONO = 20;
const MAX_EMPRESA = 100;

function validateField(value, maxLen, fieldName) {
  if (typeof value !== 'string') return fieldName + ' debe ser texto';
  if (value.length > maxLen) return fieldName + ' demasiado largo (máx ' + maxLen + ' caracteres)';
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

export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'grandes-clientes',
    message: 'POST { nombre, telefono, empresa } to create a request'
  }), { headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();
    const { nombre, telefono, empresa } = body;

    // Validaciones
    if (!nombre || !nombre.trim()) {
      return new Response(JSON.stringify({
        ok: false, error: 'Nombre y teléfono son obligatorios'
      }), { status: 400, headers: CORS_HEADERS });
    }
    if (!telefono || !telefono.trim()) {
      return new Response(JSON.stringify({
        ok: false, error: 'Teléfono es obligatorio'
      }), { status: 400, headers: CORS_HEADERS });
    }

    const errNombre = validateField(nombre, MAX_NOMBRE, 'Nombre');
    if (errNombre) return new Response(JSON.stringify({ ok: false, error: errNombre }), { status: 400, headers: CORS_HEADERS });
    const errTel = validateField(telefono, MAX_TELEFONO, 'Teléfono');
    if (errTel) return new Response(JSON.stringify({ ok: false, error: errTel }), { status: 400, headers: CORS_HEADERS });
    if (empresa) {
      const errEmp = validateField(empresa, MAX_EMPRESA, 'Empresa');
      if (errEmp) return new Response(JSON.stringify({ ok: false, error: errEmp }), { status: 400, headers: CORS_HEADERS });
    }

    const data = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      empresa: (empresa || '').trim(),
      creado: new Date().toISOString(),
      estado: 'nuevo'
    };

    const result = await fbPost(env, '/grandesClientes', data);
    const solicitudId = result.name;

    if (!solicitudId) {
      throw new Error('Firebase no devolvió ID de solicitud');
    }

    // Notificar al admin (fire-and-forget)
    try {
      await fetch('https://arcanoespecias.com/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'grande_cliente',
          titulo: '🏢 Nueva solicitud de Gran Cliente',
          mensaje: nombre + ' (' + telefono + ') quiere ser cliente mayorista. Empresa: ' + (empresa || '(no especificada)'),
          data: { url: '/admin/', solicitudId: solicitudId }
        })
      });
    } catch (e) {
      console.warn('[grandes-clientes] notify-admin falló (no crítico):', e.message);
    }

    return new Response(JSON.stringify({
      ok: true,
      solicitudId: solicitudId
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[grandes-clientes] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
