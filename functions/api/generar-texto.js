// /api/generar-texto.js — Cloudflare Pages Function
// Genera texto con Cloudflare Workers AI (Llama 3.1 8B Instruct).
// Rápido (~3-5s) y gratuito (10,000 neuronas/día plan free).
// Reemplaza al API interna de Z.ai que no es accesible desde Cloudflare.
//
// POST /api/generar-texto
// Body: { prompt: "...", max_tokens?: 8192, temperature?: 0.8 }
// Response: { ok: true, text: "...", model: "..." }
//
// Requiere: env.CF_ACCOUNT_ID y env.CF_API_TOKEN (los mismos que generar-imagen.js).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

// Modelo de texto de Cloudflare Workers AI.
// Llama 3.1 8B Instruct: bueno para generación de texto, rápido, soporta español.
// Alternativas más capaces (más lentas):
//   - @cf/meta/llama-3.3-70b-instruct-fp8-fast (más capaz, ~10-15s)
//   - @cf/qwen/qwen1.5-14b-chat-awq (excelente para español)
const MODEL = '@cf/meta/llama-3.1-8b-instruct';

export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'generar-texto',
    message: 'POST { prompt: string, max_tokens?: number, temperature?: number }',
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

    const accountId = env?.CF_ACCOUNT_ID;
    const apiToken = env?.CF_API_TOKEN;
    if (!accountId || !apiToken) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'CF_ACCOUNT_ID y CF_API_TOKEN no configurados en Cloudflare Pages.'
      }), { status: 500, headers: CORS_HEADERS });
    }

    const maxTokens = body.max_tokens || 8192;
    const temperature = body.temperature ?? 0.8;

    // Cloudflare Workers AI text generation endpoint
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
    console.log('[generar-texto] Llamando Workers AI:', MODEL);

    const aiResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: temperature
      })
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('[generar-texto] Workers AI error:', aiResp.status, errText);
      let errMsg = 'Error de Workers AI (HTTP ' + aiResp.status + ')';
      if (aiResp.status === 429) {
        errMsg = 'Cuota de Workers AI agotada. Reintentar más tarde.';
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

    const data = await aiResp.json();
    // Cloudflare Workers AI puede devolver la respuesta en varios formatos:
    //   - data.result.response (string) ← formato normal
    //   - data.result.response (objeto con .role/.content) ← algunos modelos
    //   - data.result.message.content ← formato chat
    //   - data.response ← formato legacy
    // Vamos a extraer el texto de cualquiera de estos.
    let text = '';
    if (data?.result?.response) {
      const r = data.result.response;
      if (typeof r === 'string') {
        text = r;
      } else if (r?.content) {
        text = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
      } else if (Array.isArray(r)) {
        // Algunos modelos devuelven un array de messages
        text = r.map(m => m.content || '').join('\n');
      } else {
        text = JSON.stringify(r);
      }
    } else if (data?.result?.message?.content) {
      text = data.result.message.content;
    } else if (data?.response) {
      text = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
    } else {
      console.error('[generar-texto] Respuesta inesperada:', JSON.stringify(data).substring(0, 500));
      return new Response(JSON.stringify({
        ok: false,
        error: 'Respuesta de Workers AI sin texto reconocible',
        details: JSON.stringify(data).substring(0, 800)
      }), { status: 500, headers: CORS_HEADERS });
    }

    // Asegurar que text sea string
    if (typeof text !== 'string') text = String(text || '');

    console.log('[generar-texto] Texto generado OK (' + text.length + ' chars, primeros 100: "' + text.substring(0, 100) + '")');

    return new Response(JSON.stringify({
      ok: true,
      text: text,
      model: MODEL,
      tokens_used: data?.result?.usage || null
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[generar-texto] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
