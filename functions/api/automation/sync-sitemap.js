// /api/automation/sync-sitemap.js — Cloudflare Pages Function
// Mantenimiento: sincroniza sitemap.xml con TODAS las recetas que existan en Firebase.
//
// Casos de uso:
//   - Backfill inicial (las recetas automáticas ya publicadas pero no agregadas al sitemap).
//   - Recover después de que un run de automatización falló al actualizar el sitemap.
//   - Auditoría: ver si el sitemap está al día con Firebase.
//
// Auth: header Authorization: Bearer <ARCANO_ADMIN_TOKEN>
//
// GET  /api/automation/sync-sitemap            → solo reporta diferencias (dry-run)
// POST /api/automation/sync-sitemap            → aplica los cambios (append de URLs faltantes)
// POST /api/automation/sync-sitemap { dryRun } → equivalente a GET

import { hasServiceAccount } from '../../_lib/firebase-admin.js';
import { loadExistingRecipes, appendToSitemap } from '../../_lib/automation-helpers.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: CORS_HEADERS });
}

async function syncSitemap(env, apply) {
  // 1. Cargar recetas de Firebase
  const recipes = await loadExistingRecipes(env);
  if (!recipes || recipes.length === 0) {
    return { ok: true, applied: false, message: 'No hay recetas en Firebase', total: 0 };
  }

  // 2. Para cada receta, intentar append (idempotente: si ya existe, no hace nada)
  const results = [];
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of recipes) {
    if (!r.titulo) continue;
    const slug = r.slug_publicado || r.titulo.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const locUrl = `https://arcanoespecias.com/recetas/${slug}`;
    const lastmod = r.fecha || new Date().toISOString().substring(0, 10);

    if (!apply) {
      // Modo dry-run: no llamamos a appendToSitemap (que sube a GitHub)
      // Solo registramos la URL que se agregaría. (No podemos saber sin leer
      // el sitemap si ya existe, pero appendToSitemap lo verifica igual.)
      results.push({ slug, locUrl, lastmod, action: 'pendiente' });
      continue;
    }

    try {
      const r2 = await appendToSitemap(env, locUrl, lastmod);
      if (r2.alreadyExists) {
        skipped++;
        results.push({ slug, locUrl, action: 'skip' });
      } else {
        added++;
        results.push({ slug, locUrl, action: 'added', totalUrls: r2.totalUrls });
      }
    } catch (e) {
      failed++;
      results.push({ slug, locUrl, action: 'error', error: e.message });
    }
  }

  return {
    ok: true,
    applied: apply,
    total: recipes.length,
    added,
    skipped,
    failed,
    results
  };
}

export async function onRequestGet({ request, env }) {
  if (!hasServiceAccount(env)) {
    return json({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT no configurada' }, 500);
  }
  try {
    const result = await syncSitemap(env, false);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 5).join('\n') }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Auth
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!env?.ARCANO_ADMIN_TOKEN || token !== env.ARCANO_ADMIN_TOKEN) {
    return json({ ok: false, error: 'No autorizado' }, 401);
  }

  if (!hasServiceAccount(env)) {
    return json({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT no configurada' }, 500);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const result = await syncSitemap(env, !dryRun);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 5).join('\n') }, 500);
  }
}
