// /api/automation/blog-styles.js — Cloudflare Pages Function
// Devuelve el CSS compacto por categoría de blog.
// Lo usa la tienda (modal del blog) para teñir el modal con los colores
// de la categoría del artículo que se está mostrando.
//
// NO requiere auth (es CSS público, igual que el HTML estático).
//
// GET /api/automation/blog-styles
//   → { ok, css: "<CSS compacto>", templates: { Historia: {...}, ... } }

import { BLOG_TEMPLATES, generateBlogCSSCompact, generateBlogIndexCategoryColors, catToClass, getBlogTemplate } from '../../_lib/automation-helpers.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const categoria = url.searchParams.get('categoria');

  // Si piden una categoría específica, devuelven solo su CSS
  if (categoria) {
    const t = getBlogTemplate(categoria);
    return new Response(JSON.stringify({
      ok: true,
      categoria: t.nombre,
      template: t,
      css: generateBlogCSSCompact(t)
    }, null, 2), { headers: CORS_HEADERS });
  }

  // Sin parámetro: devuelven TODOS los estilos (para inyectar una sola vez)
  const allCss = Object.keys(BLOG_TEMPLATES).map(cat => {
    const t = BLOG_TEMPLATES[cat];
    return `/* ${cat} — ${t.descripcion} */\n` + generateBlogCSSCompact(t);
  }).join('\n\n');

  // Versión pública de los templates (sin datos sensibles)
  const publicTemplates = {};
  for (const cat in BLOG_TEMPLATES) {
    const t = BLOG_TEMPLATES[cat];
    publicTemplates[cat] = {
      nombre: t.nombre,
      descripcion: t.descripcion,
      bg: t.bg,
      bgAccent: t.bgAccent,
      textPrimary: t.textPrimary,
      textSecondary: t.textSecondary,
      accent: t.accent,
      accentSoft: t.accentSoft,
      badgeBg: t.badgeBg,
      badgeText: t.badgeText,
      headingFont: t.headingFont,
      bodyFont: t.bodyFont
    };
  }

  return new Response(JSON.stringify({
    ok: true,
    css: allCss,
    indexColors: generateBlogIndexCategoryColors(),
    templates: publicTemplates
  }, null, 2), { headers: CORS_HEADERS });
}
