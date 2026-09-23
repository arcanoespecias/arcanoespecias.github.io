// /api/notify-admin.js — Cloudflare Pages Function
// Recibe notificaciones del cliente y las envía como Web Push al admin
// usando VAPID + Web Push protocol (RFC 8291/8292)
// GRATIS — sin Firebase Cloud Functions, sin tarjeta de crédito

import { sendWebPush } from 'webcrypto-web-push';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';

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

    // 1. Leer todas las suscripciones push del admin desde Firebase
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
        error: 'No hay dispositivos suscriptos. El admin debe abrir la PWA y activar notificaciones.'
      }), { status: 200, headers: CORS_HEADERS });
    }

    // 2. Verificar que tengamos las VAPID keys en environment
    if (!env?.VAPID_PRIVATE_KEY || !env?.VAPID_PUBLIC_KEY || !env?.VAPID_SUBJECT) {
      return new Response(JSON.stringify({
        error: 'VAPID keys no configuradas en Cloudflare. Agregar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT en Settings > Environment Variables.'
      }), { status: 500, headers: CORS_HEADERS });
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
          vapid: {
            subject: env.VAPID_SUBJECT,
            privateKey: env.VAPID_PRIVATE_KEY,
            publicKey: env.VAPID_PUBLIC_KEY
          }
        });
        results.push({ subKey, status: 'sent' });
      } catch (err) {
        // Si el endpoint devolvió 404 o 410, la suscripción expiró → borrarla
        const status = err?.response?.status || err?.status || 0;
        if (status === 404 || status === 410) {
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

// Endpoint GET para test desde el navegador del admin
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'test') {
    // Enviar push de prueba
    return onRequestPost({
      request: new Request(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'test',
          titulo: '🔔 Notificación de prueba',
          mensaje: 'Si ves esto, las notificaciones push funcionan correctamente.',
          data: { url: '/admin/' }
        })
      }),
      env
    });
  }

  if (action === 'status') {
    // Devolver estado de suscripciones
    try {
      const subRes = await fetch(`${FB_BASE}/pushSubscriptions.json`);
      const subsData = subRes.ok ? await subRes.json() : null;
      const count = subsData ? Object.keys(subsData).length : 0;
      return new Response(JSON.stringify({
        suscripciones: count,
        vapid_configurado: !!(env?.VAPID_PUBLIC_KEY && env?.VAPID_PRIVATE_KEY)
      }), { headers: CORS_HEADERS });
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
      'GET /api/notify-admin?action=test': 'Enviar push de prueba',
      'GET /api/notify-admin?action=status': 'Ver estado de suscripciones'
    }
  }), { headers: CORS_HEADERS });
}
