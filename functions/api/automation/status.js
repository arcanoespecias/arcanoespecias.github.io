// /api/automation/status.js — Cloudflare Pages Function
// Devuelve el estado actual de la automatización (qué se generó último, cuándo).
// Solo lectura, no requiere auth (info de estado, no sensible).

import { hasServiceAccount } from '../../_lib/firebase-admin.js';
import { getAutomationState, loadExistingRecipes, loadExistingBlog, RECETA_CATEGORIAS, BLOG_TEMAS } from '../../_lib/automation-helpers.js';

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

    const blogState = state?.blog?.ultimaCategoria;
    const blogIdx = BLOG_TEMAS.findIndex(t => t.especia === blogState);
    const nextBlog = blogIdx >= 0 ? BLOG_TEMAS[(blogIdx + 1) % BLOG_TEMAS.length] : BLOG_TEMAS[0];

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
        ultimaFecha: state?.blog?.ultimaFecha || null,
        proximoTema: nextBlog
      },
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
