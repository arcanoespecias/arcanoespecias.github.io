// /api/automation/sync-sitemap.js — Cloudflare Pages Function
// Mantenimiento: sincroniza sitemap.xml con TODAS las recetas Y artículos de blog
// que existan en Firebase.
//
// Casos de uso:
//   - Backfill inicial (las recetas/artículos automáticos ya publicados pero
//     no agregados al sitemap).
//   - Recover después de que un run de automatización falló al actualizar el sitemap.
//   - Auditoría: ver si el sitemap está al día con Firebase.
//
// Auth: header Authorization: Bearer <ARCANO_ADMIN_TOKEN>
//
// GET  /api/automation/sync-sitemap            → solo reporta diferencias (dry-run)
// POST /api/automation/sync-sitemap            → aplica los cambios (append de URLs faltantes)
// POST /api/automation/sync-sitemap { dryRun } → equivalente a GET
//
// Body opcional: { tipo: 'recetas' | 'blog' }  → limita a uno de los dos

import { hasServiceAccount } from '../../_lib/firebase-admin.js';
import { loadExistingRecipes, loadExistingBlog, appendToSitemap, slugify } from '../../_lib/automation-helpers.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: CORS_HEADERS });
}

// slugify puede no estar exportado, fallback simple
function _slug(s) {
  if (!s) return '';
  try { return slugify(s); } catch { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
}

async function syncSitemap(env, apply, tipoFilter) {
  const tasks = [];
  if (!tipoFilter || tipoFilter === 'recetas') tasks.push('recetas');
  if (!tipoFilter || tipoFilter === 'blog') tasks.push('blog');

  let added = 0, skipped = 0, failed = 0;
  const results = [];

  // === RECETAS ===
  if (tasks.includes('recetas')) {
    const recipes = await loadExistingRecipes(env).catch(() => []);
    for (const r of recipes || []) {
      if (!r || !r.titulo) continue;
      const slug = r.slug_publicado || _slug(r.titulo);
      const locUrl = `https://arcanoespecias.com/recetas/${slug}`;
      const lastmod = r.fecha || new Date().toISOString().substring(0, 10);
      if (!apply) { results.push({ tipo: 'receta', slug, locUrl, lastmod, action: 'pendiente' }); continue; }
      try {
        const r2 = await appendToSitemap(env, locUrl, lastmod);
        if (r2.alreadyExists) { skipped++; results.push({ tipo: 'receta', slug, locUrl, action: 'skip' }); }
        else { added++; results.push({ tipo: 'receta', slug, locUrl, action: 'added', totalUrls: r2.totalUrls }); }
      } catch (e) { failed++; results.push({ tipo: 'receta', slug, locUrl, action: 'error', error: e.message }); }
    }
  }

  // === BLOG ===
  if (tasks.includes('blog')) {
    const posts = await loadExistingBlog(env).catch(() => []);
    for (const p of posts || []) {
      if (!p || !p.titulo) continue;
      // Solo incluir posts publicados (pausado=false o no explicitamente false)
      if (p.pausado === true) continue;
      if (p.publicado === false) continue;
      const slug = p.slug_publicado || _slug(p.titulo);
      const locUrl = `https://arcanoespecias.com/blog/${slug}`;
      const lastmod = p.fecha || new Date().toISOString().substring(0, 10);
      if (!apply) { results.push({ tipo: 'blog', slug, locUrl, lastmod, action: 'pendiente' }); continue; }
      try {
        const r2 = await appendToSitemap(env, locUrl, lastmod);
        if (r2.alreadyExists) { skipped++; results.push({ tipo: 'blog', slug, locUrl, action: 'skip' }); }
        else { added++; results.push({ tipo: 'blog', slug, locUrl, action: 'added', totalUrls: r2.totalUrls }); }
      } catch (e) { failed++; results.push({ tipo: 'blog', slug, locUrl, action: 'error', error: e.message }); }
    }
  }

  return {
    ok: true,
    applied: apply,
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
    const url = new URL(request.url);
    const tipo = url.searchParams.get('tipo') || null;
    const result = await syncSitemap(env, false, tipo);
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
    const tipo = body.tipo || null;  // 'recetas' | 'blog' | null (ambos)

    const result = await syncSitemap(env, !dryRun, tipo);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 5).join('\n') }, 500);
  }
}
