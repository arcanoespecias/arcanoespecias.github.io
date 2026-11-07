// /api/automation/status.js — Cloudflare Pages Function
// Devuelve el estado actual de la automatización (qué se generó último, cuándo).
// Solo lectura, no requiere auth (info de estado, no sensible).

import { hasServiceAccount } from '../../_lib/firebase-admin.js';
import { getAutomationState, loadExistingRecipes, loadExistingBlog, RECETA_CATEGORIAS, BLOG_CATEGORIAS, BLOG_ESPECIAS } from '../../_lib/automation-helpers.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestGet({ env }) {
  try {
    if (!hasServiceAccount(env)) {
      return new Response(JSON.stringify({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT no configurada' }), { status: 500, headers: CORS_HEADERS });
    }

    const [state, recipes, blogPosts] = await Promise.all([
      getAutomationState(env),
      loadExistingRecipes(env).catch(() => []),
      loadExistingBlog(env).catch(() => [])
    ]);

    // Próxima categoría/tema que se generaría
    const nextRecetaCat = state?.recetas?.ultimaCategoria
      ? RECETA_CATEGORIAS[(RECETA_CATEGORIAS.indexOf(state.recetas.ultimaCategoria) + 1) % RECETA_CATEGORIAS.length]
      : RECETA_CATEGORIAS[0];

    // Próxima categoría y especia de blog (rotación independiente)
    const blogState = state?.blog?.ultimaCategoria;
    let nextBlogCatIdx = 0;
    if (blogState) {
      const found = BLOG_CATEGORIAS.findIndex(c => c.categoria === blogState);
      if (found >= 0) nextBlogCatIdx = (found + 1) % BLOG_CATEGORIAS.length;
    }
    const nextBlogCat = BLOG_CATEGORIAS[nextBlogCatIdx];
    const ultEspIdx = Number.isFinite(Number(state?.blog?.ultimaEspeciaIdx))
      ? Number(state.blog.ultimaEspeciaIdx) : -1;
    const nextEspIdx = (ultEspIdx + 1) % BLOG_ESPECIAS.length;
    const nextBlogEspecia = BLOG_ESPECIAS[nextEspIdx];

    return new Response(JSON.stringify({
      ok: true,
      state: state,
      recetas: {
        total: recipes.length,
        ultimaCategoria: state?.recetas?.ultimaCategoria || null,
        ultimaFecha: state?.recetas?.ultimaFecha || null,
        proximaCategoria: nextRecetaCat
      },
      blog: {
        total: blogPosts.length,
        ultimaCategoria: state?.blog?.ultimaCategoria || null,
        ultimaEspeciaIdx: ultEspIdx,
        ultimaEspecia: ultEspIdx >= 0 ? BLOG_ESPECIAS[ultEspIdx] : null,
        ultimaFecha: state?.blog?.ultimaFecha || null,
        proximaCategoria: nextBlogCat ? nextBlogCat.categoria : null,
        proximaEspecia: nextBlogEspecia
      },
      categoriasBlog: BLOG_CATEGORIAS.map(c => c.categoria),
      especiasBlog: BLOG_ESPECIAS,
      schedule: {
        recetas: 'Lunes, Miércoles, Viernes a las 09:00 America/Bogota',
        blog: 'Domingos a las 09:00 America/Bogota'
      },
      timestamp: new Date().toISOString()
    }, null, 2), { headers: CORS_HEADERS });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS_HEADERS });
  }
}
