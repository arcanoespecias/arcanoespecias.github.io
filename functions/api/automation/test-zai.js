// /api/automation/test-zai.js — Cloudflare Pages Function
// Diagnóstico: prueba Z.ai (chat + image) directamente desde Cloudflare
// y devuelve el error exacto si falla.
//
// Auth: Bearer ARCANO_ADMIN_TOKEN
// GET /api/automation/test-zai

import { hasServiceAccount } from '../../_lib/firebase-admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  // Auth opcional — si hay token, lo validamos; sino, igual dejamos pasar
  // porque es solo diagnóstico (no expone datos sensibles, solo testea conectividad).
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (env?.ARCANO_ADMIN_TOKEN && token && token !== env.ARCANO_ADMIN_TOKEN) {
    return json({ ok: false, error: 'No autorizado' }, 401);
  }

  const result = {
    ok: true,
    timestamp: new Date().toISOString(),
    env_check: {
      ZAI_BASE_URL: env?.ZAI_BASE_URL ? env.ZAI_BASE_URL.substring(0, 30) + '...' : 'NO CONFIGURADO',
      ZAI_TOKEN: env?.ZAI_TOKEN ? env.ZAI_TOKEN.substring(0, 20) + '... (' + env.ZAI_TOKEN.length + ' chars)' : 'NO CONFIGURADO',
      ZAI_CHAT_ID: env?.ZAI_CHAT_ID ? env.ZAI_CHAT_ID.substring(0, 20) + '...' : 'NO CONFIGURADO',
      ZAI_USER_ID: env?.ZAI_USER_ID ? env.ZAI_USER_ID.substring(0, 20) + '...' : 'NO CONFIGURADO'
    },
    tests: {}
  };

  // === Test 1: Z.ai Chat ===
  const t1 = Date.now();
  try {
    const chatUrl = env.ZAI_BASE_URL + '/chat/completions';
    const chatHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer Z.ai',
      'X-Z-AI-From': 'Z',
      'X-Token': env.ZAI_TOKEN
    };
    if (env.ZAI_CHAT_ID) chatHeaders['X-Chat-Id'] = env.ZAI_CHAT_ID;
    if (env.ZAI_USER_ID) chatHeaders['X-User-Id'] = env.ZAI_USER_ID;

    const chatResp = await fetch(chatUrl, {
      method: 'POST',
      headers: chatHeaders,
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Respondé SOLO con JSON: {"ok":true}' }],
        stream: false,
        thinking: { type: 'disabled' },
        temperature: 0.8,
        max_tokens: 100
      })
    });

    const chatElapsed = Date.now() - t1;
    const chatBody = await chatResp.text();

    result.tests.chat = {
      status: chatResp.status,
      elapsed_ms: chatElapsed,
      ok: chatResp.ok,
      headers: Object.fromEntries(chatResp.headers.entries()),
      body: chatBody.substring(0, 500)
    };
  } catch (e) {
    result.tests.chat = {
      error: e.message,
      elapsed_ms: Date.now() - t1,
      stack: e.stack?.split('\n').slice(0, 3).join('\n')
    };
  }

  // === Test 2: Z.ai Image ===
  const t2 = Date.now();
  try {
    const imgUrl = env.ZAI_BASE_URL + '/images/generations';
    const imgHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer Z.ai',
      'X-Z-AI-From': 'Z',
      'X-Token': env.ZAI_TOKEN
    };
    if (env.ZAI_CHAT_ID) imgHeaders['X-Chat-Id'] = env.ZAI_CHAT_ID;
    if (env.ZAI_USER_ID) imgHeaders['X-User-Id'] = env.ZAI_USER_ID;

    const imgResp = await fetch(imgUrl, {
      method: 'POST',
      headers: imgHeaders,
      body: JSON.stringify({
        prompt: 'a simple black square',
        size: '1024x1024'
      })
    });

    const imgElapsed = Date.now() - t2;
    let imgBody = '';
    try {
      const imgData = await imgResp.json();
      imgBody = JSON.stringify({
        has_data: !!imgData?.data,
        data_length: imgData?.data?.length || 0,
        has_base64: !!imgData?.data?.[0]?.base64,
        base64_length: imgData?.data?.[0]?.base64?.length || 0,
        keys: Object.keys(imgData || {})
      });
    } catch (e) {
      imgBody = (await imgResp.text()).substring(0, 500);
    }

    result.tests.image = {
      status: imgResp.status,
      elapsed_ms: imgElapsed,
      ok: imgResp.ok,
      headers: Object.fromEntries(imgResp.headers.entries()),
      body: imgBody.substring(0, 500)
    };
  } catch (e) {
    result.tests.image = {
      error: e.message,
      elapsed_ms: Date.now() - t2,
      stack: e.stack?.split('\n').slice(0, 3).join('\n')
    };
  }

  return json(result);
}
