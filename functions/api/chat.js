// /api/chat.js — Cloudflare Pages Function
// Proxy seguro a Gemini API. Lee la API key desde Firebase (configurada en admin).
// Cache de 5 min para la key → no hacemos fetch a Firebase en cada request.

export async function onRequestPost({ request, env }) {
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
    const { messages, catalogo, config, sessionId } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400, headers: corsHeaders
      });
    }

    // 1. Obtener API key (cache en KV-like con globalThis)
    const apiKey = await getApiKey(env);
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'API key no configurada. Pedile al admin que la configure en el panel Chatbot IA.'
      }), { status: 500, headers: corsHeaders });
    }

    // 2. Armar system prompt
    const systemPrompt = buildSystemPrompt(config, catalogo);

    // 3. Llamar a Gemini
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config?.modelo || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          generationConfig: {
            temperature: Number(config?.temperature) || 0.7,
            maxOutputTokens: 1200,
            topP: 0.9
          }
        })
      }
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error('[chat] Gemini error:', geminiResp.status, errText);
      return new Response(JSON.stringify({
        error: 'Gemini API error',
        detail: geminiResp.status === 429 ? 'Límite de consultas alcanzado. Intentá de nuevo en unos minutos.' : 'Error temporal.'
      }), { status: 502, headers: corsHeaders });
    }

    const data = await geminiResp.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 4. Extraer IDs de blends mencionados (para tarjetas de producto)
    const mentionedIds = extractBlendIds(reply, catalogo);

    // 5. Log asíncrono a Firebase (no bloquea la respuesta)
    if (sessionId) {
      try {
        logConversation(env, sessionId, messages, reply, mentionedIds);
      } catch (e) { /* fire and forget */ }
    }

    return new Response(JSON.stringify({
      reply,
      productosMencionados: mentionedIds
    }), { headers: corsHeaders });

  } catch (e) {
    console.error('[chat] Error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Server error' }), {
      status: 500, headers: corsHeaders
    });
  }
}

// === Helpers ===

// Cache global (survive across requests en el mismo worker instance)
let _cachedKey = null;
let _cachedKeyTs = 0;
const KEY_TTL = 5 * 60 * 1000; // 5 min

async function getApiKey(env) {
  // Si Cloudflare tiene la key como env var, usarla (fallback)
  if (env?.GEMINI_API_KEY) return env.GEMINI_API_KEY;

  // Cache en memoria
  if (_cachedKey && (Date.now() - _cachedKeyTs) < KEY_TTL) {
    return _cachedKey;
  }

  // Leer de Firebase
  try {
    const r = await fetch('https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/chatbot.json');
    if (!r.ok) return null;
    const data = await r.json();
    const key = data?.config?.apiKey;
    // Aceptar formatos AIzaSy... (legacy) y AQ.Ab8RN6K... (nuevo formato Gemini 2026)
    if (key && (key.startsWith('AIzaSy') || key.startsWith('AQ.'))) {
      _cachedKey = key;
      _cachedKeyTs = Date.now();
      return key;
    }
    return null;
  } catch (e) {
    console.error('[chat] Firebase read error:', e);
    return null;
  }
}

function buildSystemPrompt(config, catalogo) {
  const personalidad = config?.personalidad || PERSONALIDAD_DEFAULT;
  const saludo = config?.saludo || SALUDO_DEFAULT;
  const bloqueadas = (config?.palabrasBloqueadas || []).join(', ');

  // Armar lista de blends (compacta para no volar el contexto)
  let catalogoStr = 'Ninguno';
  if (catalogo && catalogo.length) {
    catalogoStr = catalogo.map(b =>
      `ID:${b.id} | ${b.nombre} | ${b.categoria} | ${b.uso || ''} | $${b.precioChico}/$${b.precioGrande} | ${b.descripcion?.slice(0, 200) || ''}`
    ).join('\n');
  }

  return `${personalidad}

SALUDO INICIAL (usá solo en la primera respuesta):
${saludo}

REGLAS:
- Respondé en español rioplatense neutro, tono cálido y místico.
- Recomendá SIEMPRE blends del catálogo (no inventes productos).
- Máximo 3 blends por respuesta. Si pedís más de uno, explicá la diferencia.
- Si mencionás un blend, incluí su ID entre corchetes [ID:N] para que el frontend muestre la tarjeta.
- Ejemplo: "Para pollo a la parrilla te recomiendo [ID:34] Garam Masala Clásico, que aporta..." 
- Si la consulta no es sobre cocina/especias, derivá a WhatsApp +57 300 000 0000.
- Nunca des precios en USD, siempre COP con $.
- No uses markdown con ## o **, usá texto plano con emojis 🌶🌿.
- Si el usuario pregunta por envíos, pagos o pedidos, derivá a WhatsApp.
- No digas "como IA" ni "soy un asistente". Sos el Guardián de Arcano.

PALABRAS BLOQUEADAS (no respondas sobre estos temas): ${bloqueadas || 'ninguna'}

CATÁLOGO DE BLENDS:
${catalogoStr}`;
}

const PERSONALIDAD_DEFAULT = `Sos el "Guardián de Arcano", asesor culinario místico de Arcano Especias, tienda colombiana de especias y blends artesanales.
Tu misión: ayudar al viajero a encontrar el blend perfecto para su preparación.
Sos conocedor de cocinas del mundo: india, mexicana, asiática, mediterránea, criolla, árabe.
Usá metáforas suaves de viaje, descubrimiento, senderos, destinos de sabor.`;

const SALUDO_DEFAULT = 'Bienvenido, viajero. Soy el Guardián de Arcano. Contame qué vas a cocinar y te guiaré hacia el blend perfecto.';

function extractBlendIds(text, catalogo) {
  const ids = new Set();
  // Match [ID:N]
  const matches = text.match(/\[ID:(\d+)\]/g) || [];
  matches.forEach(m => {
    const id = parseInt(m.match(/\d+/)[0]);
    if (catalogo?.find(b => b.id === id)) ids.add(id);
  });
  // También por nombre (fallback)
  if (catalogo) {
    catalogo.forEach(b => {
      if (text.includes(b.nombre) && !ids.has(b.id)) {
        // Solo si el bot lo mencionó explícitamente con ID, no por casualidad
      }
    });
  }
  return Array.from(ids);
}

async function logConversation(env, sessionId, messages, reply, mentionedIds) {
  // Log a Firebase RTDB (escritura rápida, fire-and-forget)
  const lastUser = messages.filter(m => m.role === 'user').pop();
  const logRef = `https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/chatbot/conversaciones/${sessionId}.json`;

  // Primero leer si ya existe
  let existing = null;
  try {
    const r = await fetch(logRef);
    if (r.ok) existing = await r.json();
  } catch (e) {}

  const newMsg = {
    role: 'user',
    content: lastUser?.content || '',
    ts: Date.now()
  };
  const botMsg = {
    role: 'assistant',
    content: reply,
    productosMencionados: mentionedIds,
    ts: Date.now() + 1
  };

  const mensajes = existing?.mensajes || [];
  mensajes.push(newMsg, botMsg);

  const payload = {
    sessionId,
    inicio: existing?.inicio || Date.now(),
    ultimoMensaje: Date.now(),
    mensajes: mensajes.slice(-20), // últimos 20 mensajes
    productosRecomendados: [...new Set([...(existing?.productosRecomendados || []), ...mentionedIds])],
    cantMensajes: mensajes.length
  };

  await fetch(logRef, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Incrementar métricas diarias
  const hoy = new Date().toISOString().slice(0, 10);
  const metricRef = `https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db/chatbot/estadisticas/porDia/${hoy}.json`;
  try {
    const r = await fetch(metricRef);
    const cur = r.ok ? (await r.json()) || {} : {};
    await fetch(metricRef, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensajes: (cur.mensajes || 0) + 1,
        conversaciones: existing ? 0 : 1 // solo si es nueva conversación
      })
    });
  } catch (e) {}
}
