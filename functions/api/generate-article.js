// /api/generate-article.js — Cloudflare Pages Function
// Genera artículos de blog usando el servicio de IA de z.ai (GLM-4-Plus).
// Sin API keys del usuario, sin cuota, sin modelos deprecados.
//
// El admin hace POST a /api/generate-article con:
//   { prompt: string, config: { temperatura, maxTokens } }
// Y recibe: { text: string, model: string } con el contenido JSON generado por la IA.

const ZAI_BASE_URL = 'https://internal-api.z.ai/v1';
// Credenciales internas de z.ai (no sensibles, son del SDK)
const ZAI_CONFIG = {
  apiKey: 'Z.ai',
  chatId: 'chat-c4651b11-5bec-451f-a82a-b52b7cbb2a33',
  userId: '4b275526-6676-42b1-adf2-c8fe7b03f5ad',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNGIyNzU1MjYtNjY3Ni00MmIxLWFkZjItYzhmZTdiMDNmNWFkIiwiY2hhdF9pZCI6ImNoYXQtYzQ2NTFiMTEtNWJlYy00NTFmLWE4MmEtYjUyYjdjYmIyYTMzIiwicGxhdGZvcm0iOiJ6YWkifQ.EFl5fZpZ-viKeNAhLmslMOYXPCNyYEXZHVj4-97X3ds'
};

export async function onRequestPost({ request }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { prompt, config } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.length === 0) {
      return new Response(JSON.stringify({ error: 'prompt required' }), {
        status: 400, headers: corsHeaders
      });
    }

    const temperatura = Number(config?.temperatura);
    const maxTokens = Number(config?.maxTokens) || 4000;

    // Llamar a z.ai chat completions (GLM-4-Plus)
    const zaiResp = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
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

    if (!zaiResp.ok) {
      const errText = await zaiResp.text();
      console.error('[generate-article] z.ai error:', zaiResp.status, errText);
      return new Response(JSON.stringify({
        error: 'z.ai API error',
        detail: zaiResp.status === 429
          ? 'Límite de consultas alcanzado en z.ai. Intentá de nuevo en unos segundos.'
          : 'Error temporal del servicio de IA.',
        status: zaiResp.status,
        body: errText.slice(0, 500)
      }), { status: 502, headers: corsHeaders });
    }

    const data = await zaiResp.json();
    const text = data?.choices?.[0]?.message?.content || '';

    if (!text) {
      console.error('[generate-article] z.ai empty response:', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({
        error: 'Respuesta vacía de z.ai',
        detail: 'La IA no devolvió contenido. Intenta nuevamente.'
      }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      text: text,
      model: data?.model || 'glm-4-plus',
      usage: data?.usage || null
    }), { headers: corsHeaders });

  } catch (e) {
    console.error('[generate-article] Error:', e);
    return new Response(JSON.stringify({
      error: e.message || 'Server error'
    }), { status: 500, headers: corsHeaders });
  }
}
