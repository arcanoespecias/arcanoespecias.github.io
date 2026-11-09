// /api/automation/list-models.js — Cloudflare Pages Function
// Lista los modelos de Gemini disponibles con la API key configurada.
// Útil para debuggear cuando Google deprecia modelos.
// No requiere auth (solo lee la lista pública de modelos de la API key).

import { hasServiceAccount } from '../../_lib/firebase-admin.js';
import { fbAdminGet } from '../../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

async function getGeminiKey(env) {
  if (env?.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  if (hasServiceAccount(env)) {
    try {
      const config = await fbAdminGet(env, '/arcano/db/config');
      if (config?.gemini_key) return config.gemini_key;
      const chatbot = await fbAdminGet(env, '/arcano/db/chatbot');
      if (chatbot?.config?.apiKey) return chatbot.config.apiKey;
    } catch (e) { /* ignore */ }
  }
  return null;
}

export async function onRequestGet({ env }) {
  try {
    const apiKey = await getGeminiKey(env);
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: 'No hay API key de Gemini configurada' }), { status: 500, headers: CORS_HEADERS });
    }

    // Listar modelos disponibles
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Gemini API error: ' + resp.status, detail: data }, null, 2), { status: 500, headers: CORS_HEADERS });
    }

    // Filtrar solo modelos que soportan generateContent
    const models = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => ({
        name: m.name,
        displayName: m.displayName,
        description: m.description?.substring(0, 100),
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit
      }));

    return new Response(JSON.stringify({
      ok: true,
      total: models.length,
      models: models,
      timestamp: new Date().toISOString()
    }, null, 2), { headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 3).join('\n') }), { status: 500, headers: CORS_HEADERS });
  }
}
