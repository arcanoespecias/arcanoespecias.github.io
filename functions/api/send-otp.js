// /api/send-otp.js — Cloudflare Pages Function
// Envía un código OTP por push notification (FCM) al dispositivo del usuario
// Sin dependencias externas: usa Firebase Admin REST API con la API key

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FCM_URL = 'https://fcm.googleapis.com/fcm/send';
// Server key de Firebase (no es la API key del navegador)
// Esta key se obtiene de Firebase Console > Project Settings > Cloud Messaging > Server Key
// Si no está configurada, el push no funcionará pero el código se muestra en pantalla
const FCM_SERVER_KEY = ''; // TODO: configurar con la server key real

export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'send-otp',
    message: 'POST { token, code, phone } to send OTP push notification'
  }), { headers: CORS_HEADERS });
}

export async function onRequestPost({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();
    const { token, code, phone } = body;

    if (!token || !code) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'token and code are required'
      }), { status: 400, headers: CORS_HEADERS });
    }

    // Si no hay server key configurada, no podemos enviar push
    // Pero devolvemos ok=true para que la tienda muestre el código en pantalla
    if (!FCM_SERVER_KEY) {
      console.warn('[send-otp] FCM_SERVER_KEY no configurada. El código se mostrará en pantalla.');
      return new Response(JSON.stringify({
        ok: true,
        method: 'fallback',
        message: 'Push no disponible. Código mostrado en pantalla.'
      }), { headers: CORS_HEADERS });
    }

    // Enviar push via FCM HTTP v1 API
    const message = {
      to: token,
      notification: {
        title: 'Arcano Especias 🔐',
        body: `Tu código de verificación es: ${code}`,
        icon: '/icons/icon-192.png',
        click_action: '/'
      },
      data: {
        type: 'otp',
        code: code,
        phone: phone || '',
        url: '/'
      }
    };

    const resp = await fetch(FCM_URL, {
      method: 'POST',
      headers: {
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    const result = await resp.json();

    if (resp.ok) {
      return new Response(JSON.stringify({
        ok: true,
        method: 'push',
        messageId: result.message_id || result.messageId || null
      }), { headers: CORS_HEADERS });
    } else {
      console.error('[send-otp] FCM error:', result);
      return new Response(JSON.stringify({
        ok: false,
        error: result.error || 'FCM send failed',
        method: 'fallback'
      }), { status: 500, headers: CORS_HEADERS });
    }
  } catch (e) {
    console.error('[send-otp] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message
    }), { status: 500, headers: CORS_HEADERS });
  }
}
