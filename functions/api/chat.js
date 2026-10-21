// /api/chat.js — Cloudflare Pages Function
// Proxy seguro a Gemini API. Lee la API key desde Firebase (configurada en admin).
// Cache de 5 min para la key → no hacemos fetch a Firebase en cada request.
// ETAPA 4.5: Usa Firebase Admin SDK para escribir conversaciones y estadísticas (regla auth.uid admin).
// ETAPA 4.H1: Agrega GET y POST action=config para que el widget no lea Firebase directo.

import { fbAdminGet, fbAdminPatch, fbAdminPost, hasServiceAccount } from '../_lib/firebase-admin.js';

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';

// === GET: endpoint info / config pública para el widget ===
export async function onRequestGet({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'info';

  if (action === 'config') {
    // Devuelve SOLO config pública para el widget del chatbot
    // NUNCA incluye config.apiKey ni otros secretos
    try {
      if (!hasServiceAccount(env)) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada.');
      }
      const chatbotData = await fbAdminGet(env, '/arcano/db/chatbot');
      console.log('[chat] fbAdminGet ruta usada: arcano/db/chatbot');
      const cfg = chatbotData?.config || {};
      const publicConfig = {
        activo: chatbotData?.activo === true,
        personalidad: cfg.personalidad || '',
        saludo: cfg.saludo || '',
        modelo: cfg.modelo || 'gemini-2.0-flash',
        temperature: cfg.temperature || 0.8,
        palabrasBloqueadas: cfg.palabrasBloqueadas || []
      };
      return new Response(JSON.stringify(publicConfig), { headers: corsHeaders });
    } catch (e) {
      console.error('[chat] config error:', e.message);
      return new Response(JSON.stringify({
        activo: false,
        error: 'No se pudo cargar la configuración del chatbot'
      }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    service: 'chat',
    endpoints: {
      'GET /api/chat?action=config': 'Config pública para widget (sin API key)',
      'POST /api/chat': 'Enviar mensaje al chatbot'
    }
  }), { headers: corsHeaders });
}

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

  // Leer de Firebase (requiere Service Account — sin fallback público)
  try {
    if (!hasServiceAccount(env)) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada.');
    }
    const data = await fbAdminGet(env, '/arcano/db/chatbot');
    console.log('[chat] fbAdminGet ruta usada: arcano/db/chatbot');
    const key = data?.config?.apiKey;
    // Aceptar formatos AIzaSy... (legacy) y AQ.Ab8RN6K... (nuevo formato Gemini 2026)
    if (key && (key.startsWith('AIzaSy') || key.startsWith('AQ.'))) {
      _cachedKey = key;
      _cachedKeyTs = Date.now();
      return key;
    }
    return null;
  } catch (e) {
    console.error('[chat] Firebase read error:', e.message);
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
  // Log a Firebase RTDB (escritura rápida, fire-and-forget pero con logging de errores)
  const lastUser = messages.filter(m => m.role === 'user').pop();
  const dbPathConv = `/chatbot/conversaciones/${sessionId}`;
  const dbPathMetric = `/chatbot/estadisticas/porDia/${new Date().toISOString().slice(0, 10)}`;

  // Primero leer si ya existe
  let existing = null;
  try {
    if (!hasServiceAccount(env)) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada.');
    }
    existing = await fbAdminGet(env, '/arcano/db' + dbPathConv);
    console.log('[chat] fbAdminGet ruta usada: arcano/db' + dbPathConv);
  } catch (e) {
    console.error('[chat] Error leyendo conversación existente:', e.message);
  }

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

  // Guardar conversación (PATCH = actualizar sin sobrescribir otros campos)
  try {
    if (!hasServiceAccount(env)) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada.');
    }
    await fbAdminPatch(env, '/arcano/db' + dbPathConv, payload);
    console.log('[chat] fbAdminPatch ruta usada: arcano/db' + dbPathConv);
  } catch (e) {
    console.error('[chat] Error guardando conversación:', e.message);
  }

  // Incrementar métricas diarias
  try {
    if (!hasServiceAccount(env)) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada.');
    }
    const cur = (await fbAdminGet(env, '/arcano/db' + dbPathMetric)) || {};
    console.log('[chat] fbAdminGet ruta usada: arcano/db' + dbPathMetric);
    const newMetrics = {
      mensajes: (cur.mensajes || 0) + 1,
      conversaciones: existing ? 0 : 1 // solo si es nueva conversación
    };
    await fbAdminPatch(env, '/arcano/db' + dbPathMetric, newMetrics);
    console.log('[chat] fbAdminPatch ruta usada: arcano/db' + dbPathMetric);
  } catch (e) {
    console.error('[chat] Error actualizando métricas diarias:', e.message);
  }
}
