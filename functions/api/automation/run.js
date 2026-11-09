// /api/automation/run.js — Cloudflare Pages Function
// Orquestador de automatización: genera recetas y blog con IA.
// Disparado por un Cloudflare Worker con cron trigger (no por el admin).
//
// Auth: header Authorization: Bearer <ARCANO_ADMIN_TOKEN>
//
// POST /api/automation/run
// Body: { task: 'recetas' | 'blog', dryRun?: boolean }
//   - task='recetas': genera 1 receta (categoría rotada: Comidas→Infusiones→Coctelería)
//   - task='blog': genera 1 artículo como borrador + email al admin
//   - dryRun=true: genera todo pero NO sube a GitHub ni guarda en Firebase
//
// Response: { ok, task, result: { receta|articulo, log, url? }, dryRun }

import { hasServiceAccount } from '../../_lib/firebase-admin.js';
import { generateRecipe, generateBlog, getAutomationState } from '../../_lib/automation-helpers.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  // Health check / status
  const state = hasServiceAccount(env) ? await getAutomationState(env).catch(() => null) : null;
  return json({
    ok: true,
    service: 'automation-run',
    message: 'POST { task: "recetas"|"blog", dryRun?: bool }',
    authRequired: true,
    state: state
  });
}

export async function onRequestPost({ request, env, ctx }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // === AUTH ===
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!env?.ARCANO_ADMIN_TOKEN || token !== env.ARCANO_ADMIN_TOKEN) {
    return json({ ok: false, error: 'No autorizado. Requiere header Authorization: Bearer <ARCANO_ADMIN_TOKEN>' }, 401);
  }

  // === VALIDAR SERVICE ACCOUNT (necesario para Firebase) ===
  if (!hasServiceAccount(env)) {
    return json({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT no configurada en env vars de Cloudflare Pages.'
    }, 500);
  }

  try {
    const body = await request.json();
    const task = body.task;
    const dryRun = body.dryRun === true;

    if (task !== 'recetas' && task !== 'blog') {
      return json({ ok: false, error: 'task debe ser "recetas" o "blog"' }, 400);
    }

    console.log(`[automation] Iniciando task=${task} dryRun=${dryRun}`);

    let result;
    if (task === 'recetas') {
      result = await generateRecipe(env, { dryRun, ctx });
    } else {
      result = await generateBlog(env, { dryRun, ctx });
    }

    console.log(`[automation] Task ${task} completada. Log:`, result.log);

    return json({
      ok: true,
      task: task,
      dryRun: dryRun,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    console.error('[automation] Error:', e.message, e.stack);
    return json({
      ok: false,
      error: e.message || 'Server error',
      stack: e.stack?.split('\n').slice(0, 5).join('\n')
    }, 500);
  }
}
