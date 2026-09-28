// /api/generate-article.js — Cloudflare Pages Function
// Genera artículos de blog usando Cloudflare Workers AI (Llama 3.1 8B Instruct).
// No requiere API keys externas — usa la infraestructura de Cloudflare.
//
// Requiere 2 environment variables configuradas en Cloudflare Pages dashboard:
//   - CF_ACCOUNT_ID: tu Account ID de Cloudflare (visible en cualquier domain overview)
//   - CF_API_TOKEN: API token con permiso "Workers AI > Read" (crear en Profile > API Tokens)
//
// El admin hace POST con: { prompt, config: { temperatura, maxTokens } }
// Recibe: { text, model, usage }

const CF_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// === Health check (GET) ===
export async function onRequestGet({ request, env }) {
  const hasAccountId = !!env?.CF_ACCOUNT_ID;
  const hasApiToken = !!env?.CF_API_TOKEN;
  return new Response(JSON.stringify({
    ok: true,
    service: 'cloudflare-workers-ai',
    model: CF_AI_MODEL,
    timestamp: Date.now(),
    configured: hasAccountId && hasApiToken,
    missingVars: [
      ...(!hasAccountId ? ['CF_ACCOUNT_ID'] : []),
      ...(!hasApiToken ? ['CF_API_TOKEN'] : [])
    ],
    setupInstructions: (!hasAccountId || !hasApiToken) ? [
      'Para activar la IA, configura estas variables en:',
      'Cloudflare Pages → tu proyecto → Settings → Environment variables:',
      '',
      '1. CF_ACCOUNT_ID',
      '   Como obtenerlo: Cloudflare dashboard → cualquier dominio → Overview → scroll derecho "Account ID"',
      '',
      '2. CF_API_TOKEN',
      '   Como obtenerlo: Cloudflare dashboard → My Profile → API Tokens → Create Token',
      '   Usar template "Workers AI" o crear custom con permiso:',
      '   Account > Workers AI > Read'
    ] : null
  }), { headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  console.log('[generate-article] onRequestPost started, env keys:', env ? Object.keys(env).join(',') : 'NO_ENV');

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === Validar configuracion de Cloudflare ===
  if (!env?.CF_ACCOUNT_ID || !env?.CF_API_TOKEN) {
    console.error('[generate-article] Missing env vars');
    return new Response(JSON.stringify({
      error: 'IA no configurada. Faltan variables de entorno en Cloudflare Pages.',
      detail: 'Ve a /api/generate-article (GET) para instrucciones de configuracion.',
      missingVars: [
        ...(!env?.CF_ACCOUNT_ID ? ['CF_ACCOUNT_ID'] : []),
        ...(!env?.CF_API_TOKEN ? ['CF_API_TOKEN'] : [])
      ],
      step: 'validate_env'
    }), { status: 500, headers: corsHeaders });
  }

  // === Parsear body ===
  let body;
  try {
    body = await request.json();
    console.log('[generate-article] Body parsed, prompt length:', body?.prompt?.length);
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Body invalido',
      detail: e.message,
      step: 'parse_body'
    }), { status: 400, headers: corsHeaders });
  }

  const { prompt, config } = body;

  if (!prompt || typeof prompt !== 'string' || prompt.length === 0) {
    return new Response(JSON.stringify({
      error: 'prompt required',
      step: 'validate_prompt'
    }), { status: 400, headers: corsHeaders });
  }

  const temperatura = Number(config?.temperatura);
  const maxTokens = Number(config?.maxTokens) || 4000;

  // === MODO TEST ===
  if (prompt === 'TEST') {
    return new Response(JSON.stringify({
      text: '{"titulo":"Test OK","subtitulo":"Sin llamada a IA","contenido":"<p>Test</p>"}',
      model: 'test-mode',
      usage: null
    }), { headers: corsHeaders });
  }

  // === Llamar a Cloudflare Workers AI ===
  console.log('[generate-article] Calling CF Workers AI:', CF_AI_MODEL);

  let aiResp;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${CF_AI_MODEL}`;
    console.log('[generate-article] URL:', url);

    aiResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CF_API_TOKEN}`
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'Eres un redactor creativo experto en especias y gastronomía. Respondes SIEMPRE con JSON válido, sin markdown code blocks, sin texto adicional.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: isNaN(temperatura) ? 0.8 : temperatura,
        max_tokens: maxTokens
      })
    });
    console.log('[generate-article] CF AI responded status:', aiResp.status);
  } catch (e) {
    console.error('[generate-article] Fetch error:', e.message, e.stack);
    return new Response(JSON.stringify({
      error: 'No se pudo conectar con Cloudflare Workers AI',
      detail: e.message,
      step: 'fetch_cf_ai'
    }), { status: 502, headers: corsHeaders });
  }

  // === Procesar respuesta ===
  if (!aiResp.ok) {
    let errText = '';
    try { errText = await aiResp.text(); } catch(_) {}
    console.error('[generate-article] CF AI error:', aiResp.status, errText.slice(0, 500));
    return new Response(JSON.stringify({
      error: 'Cloudflare Workers AI error',
      detail: aiResp.status === 401
        ? 'CF_API_TOKEN invalido o sin permisos de Workers AI. Crea un token con permiso "Account > Workers AI > Read".'
        : aiResp.status === 404
        ? 'Modelo no encontrado. Revisa que Workers AI este habilitado en tu cuenta.'
        : 'Error temporal del servicio de IA.',
      status: aiResp.status,
      body: errText.slice(0, 500),
      step: 'cf_ai_response'
    }), { status: 502, headers: corsHeaders });
  }

  let data;
  try {
    data = await aiResp.json();
    console.log('[generate-article] CF AI json parsed, keys:', Object.keys(data).join(','));
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'CF AI devolvió respuesta no-JSON',
      detail: e.message,
      step: 'parse_cf_ai_json'
    }), { status: 502, headers: corsHeaders });
  }

  // CF Workers AI response format: { result: { response: "text" } }
  const text = data?.result?.response || data?.response || '';

  if (!text) {
    console.error('[generate-article] Empty response:', JSON.stringify(data).slice(0, 500));
    return new Response(JSON.stringify({
      error: 'Respuesta vacía de CF Workers AI',
      detail: 'La IA no devolvió contenido. Intenta nuevamente.',
      step: 'empty_content',
      raw: JSON.stringify(data).slice(0, 500)
    }), { status: 502, headers: corsHeaders });
  }

  console.log('[generate-article] OK, text length:', text.length);

  return new Response(JSON.stringify({
    text: text,
    model: CF_AI_MODEL,
    usage: data?.usage || null
  }), { headers: corsHeaders });
}
