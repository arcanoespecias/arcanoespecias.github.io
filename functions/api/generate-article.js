// /api/generate-article.js — Cloudflare Pages Function
// Genera artículos de blog usando Gemini API.
// Lee la API key desde Firebase (configurada por el admin en el panel Chatbot IA).
//
// Acepta 2 formatos de API key:
//   - AIzaSy... (formato legacy, hasta 2025)
//   - AQ....   (nuevo formato Gemini 2026, requiere modelo gemini-3.x)
//
// El admin hace POST con: { prompt, config: { temperatura, maxTokens } }
// Recibe: { text, model, usage }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// === Health check (GET) ===
export async function onRequestGet({ request, env }) {
  const hasEnvKey = !!env?.GEMINI_API_KEY;
  return new Response(JSON.stringify({
    ok: true,
    service: 'gemini-via-firebase',
    timestamp: Date.now(),
    hasEnvKey,
    notes: hasEnvKey
      ? 'API key leida desde env var GEMINI_API_KEY'
      : 'API key se leera desde Firebase (arcano/db/chatbot/config/apiKey). Configurala en el panel Chatbot IA del admin.'
  }), { headers: corsHeaders });
}

// Cache en memoria para no leer Firebase en cada request
let _cachedKey = null;
let _cachedKeyTs = 0;
const KEY_TTL = 5 * 60 * 1000; // 5 min

async function getApiKey(env) {
  // 1. Si Cloudflare tiene la key como env var, usarla
  if (env?.GEMINI_API_KEY) return env.GEMINI_API_KEY;

  // 2. Cache en memoria
  if (_cachedKey && (Date.now() - _cachedKeyTs) < KEY_TTL) {
    return _cachedKey;
  }

  // 3. Leer de Firebase (public read)
  //    Primero buscar en arcano/db/config/gemini_key (panel Blog)
  //    Luego en arcano/db/chatbot/config/apiKey (panel Chatbot IA)
  //    Aceptar cualquier de los 2 paths para compatibilidad.
  try {
    // Intento 1: arcano/db/config/gemini_key
    let r = await fetch('https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/config/gemini_key.json');
    if (r.ok) {
      const key = await r.json();
      // Aceptar formatos AIzaSy... (legacy) y AQ.... (nuevo Gemini 2026)
      if (key && (key.startsWith('AIzaSy') || key.startsWith('AQ.'))) {
        _cachedKey = key;
        _cachedKeyTs = Date.now();
        return key;
      }
    }
    // Intento 2: arcano/db/chatbot/config/apiKey
    r = await fetch('https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/chatbot/config/apiKey.json');
    if (r.ok) {
      const key = await r.json();
      if (key && (key.startsWith('AIzaSy') || key.startsWith('AQ.'))) {
        _cachedKey = key;
        _cachedKeyTs = Date.now();
        return key;
      }
    }
    return null;
  } catch (e) {
    console.error('[generate-article] Firebase read error:', e.message);
    return null;
  }
}

// Detecta el modelo apropiado segun el formato de la API key
function getModeloForApiKey(key) {
  if (!key) return 'gemini-2.0-flash';
  // El nuevo formato AQ.... requiere modelos gemini-3.x
  if (key.startsWith('AQ.')) return 'gemini-3.8-flash';
  // Formato AIzaSy... puede usar 2.0-flash (legacy)
  return 'gemini-2.0-flash';
}

export async function onRequestPost({ request, env }) {
  console.log('[generate-article] onRequestPost started');

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === Validar API key ===
  const apiKey = await getApiKey(env);
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'API key de Gemini no configurada. Configurala en el panel Chatbot IA del admin (seccion Configuracion).',
      step: 'validate_api_key',
      help: 'Anda al admin → Chatbot IA → Configuracion → pega tu API key de Gemini (formato AIzaSy... o AQ....)'
    }), { status: 500, headers: corsHeaders });
  }

  const modelo = getModeloForApiKey(apiKey);
  console.log('[generate-article] API key found, formato:', apiKey.substring(0, 6) + '...', 'modelo:', modelo);

  // === Parsear body ===
  let body;
  try {
    body = await request.json();
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

  // === Llamar a Gemini ===
  console.log('[generate-article] Calling Gemini:', modelo);

  let geminiResp;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
    geminiResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Eres un redactor creativo experto en especias y gastronomía. Respondes SIEMPRE con JSON válido, sin markdown code blocks, sin texto adicional.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: isNaN(temperatura) ? 0.8 : temperatura,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json'
        }
      })
    });
    console.log('[generate-article] Gemini responded status:', geminiResp.status);
  } catch (e) {
    console.error('[generate-article] Fetch error:', e.message);
    return new Response(JSON.stringify({
      error: 'No se pudo conectar con Gemini API',
      detail: e.message,
      step: 'fetch_gemini'
    }), { status: 502, headers: corsHeaders });
  }

  // === Procesar respuesta ===
  if (!geminiResp.ok) {
    let errText = '';
    try { errText = await geminiResp.text(); } catch(_) {}
    console.error('[generate-article] Gemini error:', geminiResp.status, errText.slice(0, 500));

    let friendlyMsg = 'Error temporal del servicio de IA.';
    try {
      const errJson = JSON.parse(errText);
      const msg = errJson?.error?.message || '';
      if (geminiResp.status === 429) {
        friendlyMsg = 'Límite de cuota de Gemini alcanzado. Esperá 1 minuto y probá de nuevo.';
      } else if (msg.includes('no longer available') || msg.includes('deprecated')) {
        friendlyMsg = 'El modelo de Gemini no está disponible. Si tu API key empieza con "AQ.", necesitás un modelo nuevo (gemini-3.x). Si empieza con "AIzaSy", usá 2.0-flash.';
      } else if (geminiResp.status === 400 && msg.includes('API key not valid')) {
        friendlyMsg = 'La API key de Gemini no es válida. Verificá que esté bien copiada en el panel Chatbot IA.';
      } else if (msg) {
        friendlyMsg = msg;
      }
    } catch(_) {}

    return new Response(JSON.stringify({
      error: friendlyMsg,
      status: geminiResp.status,
      body: errText.slice(0, 500),
      step: 'gemini_response',
      modelo: modelo
    }), { status: 502, headers: corsHeaders });
  }

  let data;
  try {
    data = await geminiResp.json();
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Gemini devolvió respuesta no-JSON',
      detail: e.message,
      step: 'parse_gemini_json'
    }), { status: 502, headers: corsHeaders });
  }

  // Extraer texto de candidates[0].content.parts[0].text
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ||
               data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

  if (!text) {
    console.error('[generate-article] Empty content:', JSON.stringify(data).slice(0, 500));
    return new Response(JSON.stringify({
      error: 'Respuesta vacía de Gemini',
      detail: 'La IA no devolvió contenido. Intenta nuevamente.',
      step: 'empty_content',
      finishReason: data?.candidates?.[0]?.finishReason,
      raw: JSON.stringify(data).slice(0, 500)
    }), { status: 502, headers: corsHeaders });
  }

  console.log('[generate-article] OK, text length:', text.length);

  return new Response(JSON.stringify({
    text: text,
    model: modelo,
    usage: data?.usageMetadata || null
  }), { headers: corsHeaders });
}
