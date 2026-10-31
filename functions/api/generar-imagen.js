// /api/generar-imagen.js — Cloudflare Pages Function
// Genera una imagen con Cloudflare Workers AI (flux-1-schnell) como alternativa
// gratuita a Gemini cuando la cuota de este se agota (429).
//
// Plan gratuito de Workers AI: 10,000 neuronas/día (suficiente para imágenes de recetas).
// Modelo: @cf/black-forest-labs/flux-1-schnell (rápido, buena calidad para food photography).
//
// POST /api/generar-imagen
// Body: { prompt: "descripción visual del plato", width: 1024, height: 768 }
// Response: { ok: true, image: "data:image/jpeg;base64,..." }
//
// Requiere: env.CF_ACCOUNT_ID y env.CF_API_TOKEN (configurados en Cloudflare Pages).
// Si no están configurados, devuelve error claro para que el admin los configure.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const MODEL = '@cf/black-forest-labs/flux-1-schnell';

export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'generar-imagen',
    message: 'POST { prompt: string, width?: number, height?: number }',
    model: MODEL
  }), { headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();
    const prompt = body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'prompt es obligatorio (string)'
      }), { status: 400, headers: CORS_HEADERS });
    }

    // Verificar credenciales de Cloudflare
    const accountId = env?.CF_ACCOUNT_ID;
    const apiToken = env?.CF_API_TOKEN;
    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'CF_ACCOUNT_ID y CF_API_TOKEN no configurados en Cloudflare Pages. Ve a Dashboard > Pages > arcanoespecias > Settings > Environment variables y agrega: CF_ACCOUNT_ID (tu Account ID) y CF_API_TOKEN (un API token con permiso Workers AI).',
        needConfig: true
      }), { status: 500, headers: CORS_HEADERS });
    }

    // Dimensiones (default 1024x768 para formato horizontal de recetas)
    const width = Math.min(1024, body.width || 1024);
    const height = Math.min(768, body.height || 768);

    // Llamar a Workers AI
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
    console.log('[generar-imagen] Llamando Workers AI:', MODEL);

    const aiResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        width: width,
        height: height
      })
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('[generar-imagen] Workers AI error:', aiResp.status, errText);
      let errMsg = 'Error de Workers AI (HTTP ' + aiResp.status + ')';
      if (aiResp.status === 429) {
        errMsg = 'Cuota de Workers AI agotada (10,000 neuronas/día). Reintentar mañana.';
      } else if (aiResp.status === 401 || aiResp.status === 403) {
        errMsg = 'CF_API_TOKEN inválido o sin permisos de Workers AI.';
      }
      return new Response(JSON.stringify({
        ok: false,
        error: errMsg,
        status: aiResp.status,
        details: errText.substring(0, 500)
      }), { status: aiResp.status, headers: CORS_HEADERS });
    }

    // Workers AI devuelve la imagen como base64 en response.image
    const data = await aiResp.json();
    if (!data.success || !data.result || !data.result.image) {
      console.error('[generar-imagen] Respuesta inesperada:', JSON.stringify(data).substring(0, 300));
      return new Response(JSON.stringify({
        ok: false,
        error: 'Respuesta de Workers AI sin imagen',
        details: JSON.stringify(data).substring(0, 500)
      }), { status: 500, headers: CORS_HEADERS });
    }

    // Convertir base64 a data URI
    const base64Image = data.result.image;
    const dataUri = 'data:image/jpeg;base64,' + base64Image;

    console.log('[generar-imagen] Imagen generada OK (' + base64Image.length + ' bytes base64)');

    return new Response(JSON.stringify({
      ok: true,
      image: dataUri,
      mime: 'image/jpeg',
      model: MODEL,
      size: width + 'x' + height
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[generar-imagen] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
