// /api/generate-article.js — Cloudflare Pages Function
// Genera artículos de blog usando el servicio de IA de z.ai (GLM-4-Plus).
// Sin API keys del usuario, sin cuota, sin modelos deprecados.

const ZAI_BASE_URL = 'https://internal-api.z.ai/v1';
const ZAI_CONFIG = {
  apiKey: 'Z.ai',
  chatId: 'chat-c4651b11-5bec-451f-a82a-b52b7cbb2a33',
  userId: '4b275526-6676-42b1-adf2-c8fe7b03f5ad',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNGIyNzU1MjYtNjY3Ni00MmIxLWFkZjItYzhmZTdiMDNmNWFkIiwiY2hhdF9pZCI6ImNoYXQtYzQ2NTFiMTEtNWJlYy00NTFmLWE4MmEtYjUyYjdjYmIyYTMzIiwicGxhdGZvcm0iOiJ6YWkifQ.EFl5fZpZ-viKeNAhLmslMOYXPCNyYEXZHVj4-97X3ds'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// === Health check (GET) — para verificar que la función está desplegada ===
export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'z.ai generate-article',
    timestamp: Date.now(),
    zaiBaseUrl: ZAI_BASE_URL
  }), { headers: corsHeaders });
}

export async function onRequestPost({ request }) {
  console.log('[generate-article] onRequestPost started');

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === PASO 1: Parsear el body ===
  let body;
  try {
    body = await request.json();
    console.log('[generate-article] Step 1 OK: body parsed, keys=', Object.keys(body));
  } catch (e) {
    console.error('[generate-article] Step 1 FAIL: body parse error:', e.message);
    return new Response(JSON.stringify({
      error: 'Body invalido',
      detail: e.message,
      step: 'parse_body'
    }), { status: 400, headers: corsHeaders });
  }

  const { prompt, config } = body;

  if (!prompt || typeof prompt !== 'string' || prompt.length === 0) {
    console.error('[generate-article] Step 2 FAIL: prompt missing');
    return new Response(JSON.stringify({
      error: 'prompt required',
      step: 'validate_prompt'
    }), { status: 400, headers: corsHeaders });
  }
  console.log('[generate-article] Step 2 OK: prompt length=', prompt.length);

  const temperatura = Number(config?.temperatura);
  const maxTokens = Number(config?.maxTokens) || 4000;
  console.log('[generate-article] Step 3: config parsed, temp=', temperatura, 'tokens=', maxTokens);

  // === MODO TEST: si el prompt es exactamente "TEST", no llamar a z.ai ===
  if (prompt === 'TEST') {
    console.log('[generate-article] TEST mode: skipping z.ai call');
    return new Response(JSON.stringify({
      text: '{"titulo":"Test OK","subtitulo":"Respuesta de prueba sin z.ai","contenido":"<p>Test</p>"}',
      model: 'test-mode',
      usage: null
    }), { headers: corsHeaders });
  }

  // === PASO 4: Llamar a z.ai ===
  let zaiResp;
  try {
    console.log('[generate-article] Step 4: fetching z.ai at', ZAI_BASE_URL + '/chat/completions');
    zaiResp = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_CONFIG.apiKey}`,
        'X-Z-AI-From': 'Z',
        'X-Chat-Id': ZAI_CONFIG.chatId,
        'X-User-Id': ZAI_CONFIG.userId,
        'X-Token': ZAI_CONFIG.token
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
        max_tokens: maxTokens,
        thinking: { type: 'disabled' }
      })
    });
    console.log('[generate-article] Step 4 OK: z.ai responded status=', zaiResp.status);
  } catch (e) {
    console.error('[generate-article] Step 4 FAIL: fetch error:', e.message, e.stack);
    return new Response(JSON.stringify({
      error: 'No se pudo conectar con z.ai',
      detail: e.message,
      step: 'fetch_zai',
      stack: e.stack?.split('\n').slice(0, 5).join(' | ')
    }), { status: 502, headers: corsHeaders });
  }

  // === PASO 5: Procesar la respuesta de z.ai ===
  if (!zaiResp.ok) {
    let errText = '';
    try { errText = await zaiResp.text(); } catch(_) {}
    console.error('[generate-article] Step 5 FAIL: z.ai HTTP', zaiResp.status, errText.slice(0, 500));
    return new Response(JSON.stringify({
      error: 'z.ai API error',
      detail: zaiResp.status === 429
        ? 'Límite de consultas alcanzado en z.ai. Intentá de nuevo en unos segundos.'
        : 'Error temporal del servicio de IA.',
      status: zaiResp.status,
      body: errText.slice(0, 500),
      step: 'zai_response'
    }), { status: 502, headers: corsHeaders });
  }

  let data;
  try {
    data = await zaiResp.json();
    console.log('[generate-article] Step 5 OK: z.ai json parsed, model=', data?.model);
  } catch (e) {
    console.error('[generate-article] Step 5 FAIL: json parse:', e.message);
    return new Response(JSON.stringify({
      error: 'z.ai devolvió respuesta no-JSON',
      detail: e.message,
      step: 'parse_zai_json'
    }), { status: 502, headers: corsHeaders });
  }

  const text = data?.choices?.[0]?.message?.content || '';

  if (!text) {
    console.error('[generate-article] Step 6 FAIL: empty content, full response:', JSON.stringify(data).slice(0, 500));
    return new Response(JSON.stringify({
      error: 'Respuesta vacía de z.ai',
      detail: 'La IA no devolvió contenido. Intenta nuevamente.',
      step: 'empty_content',
      raw: JSON.stringify(data).slice(0, 500)
    }), { status: 502, headers: corsHeaders });
  }

  console.log('[generate-article] Step 6 OK: text length=', text.length);

  return new Response(JSON.stringify({
    text: text,
    model: data?.model || 'glm-4-plus',
    usage: data?.usage || null
  }), { headers: corsHeaders });
}
