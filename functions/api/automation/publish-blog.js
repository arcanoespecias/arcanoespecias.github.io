// /api/automation/publish-blog.js — Cloudflare Pages Function
// Publica un artículo de blog que estaba como borrador (publicado=false).
// Lo llama el admin desde el panel con el botón "Aprobar y publicar".
//
// Auth: header Authorization: Bearer <ARCANO_ADMIN_TOKEN>
//
// POST /api/automation/publish-blog
// Body: { key: "<firebase-key>" } o { slug: "<slug>" }
//
// Qué hace:
//   1. Marca publicado=true en Firebase
//   2. Genera HTML SEO individual + sube a GitHub
//   3. Regenera /blog/index.html
//   4. Append al sitemap.xml
//   5. Devuelve la URL pública

import { hasServiceAccount } from '../../_lib/firebase-admin.js';
import { publishBlogPost } from '../../_lib/automation-helpers.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: CORS_HEADERS });
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
    const key = body.key;
    const slug = body.slug;

    if (!key && !slug) {
      return json({ ok: false, error: 'Se requiere body { key } o { slug }' }, 400);
    }

    const result = await publishBlogPost(env, { key, slug });

    return json({
      ok: true,
      message: 'Artículo publicado correctamente',
      url: result.url,
      result: result
    });
  } catch (e) {
    console.error('[publish-blog] Error:', e.message, e.stack);
    return json({
      ok: false,
      error: e.message || 'Server error',
      stack: e.stack?.split('\n').slice(0, 5).join('\n')
    }, 500);
  }
}

// GET para health check
export async function onRequestGet({ env }) {
  return json({
    ok: true,
    service: 'publish-blog',
    message: 'POST { key: "<firebase-key>" } o { slug: "<slug>" } para publicar',
    authRequired: true
  });
}
