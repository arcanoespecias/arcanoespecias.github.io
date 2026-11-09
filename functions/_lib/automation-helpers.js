// functions/_lib/automation-helpers.js
// Helpers para la automatización de recetas y blog con IA.
// Lee todo de Firebase (catálogo, recetas/blog existentes, estado de rotación).
// Genera con Gemini (fallback Z.ai si 429).
// Genera imagen con /api/generar-imagen (Cloudflare Workers AI).
// Sube a GitHub con env.GITHUB_TOKEN.
// Envía email con Brevo.

import { fbAdminGet, fbAdminPost, fbAdminPatch, fbAdminPut, hasServiceAccount } from './firebase-admin.js';
import { uploadToGitHub, uploadImage, downloadFromGitHub } from './github.js';

const BASE_URL = 'https://arcanoespecias.com';
const ADMIN_EMAIL = 'hola@arcanoespecias.com';

// ============ GEMINI API ============

async function getGeminiKey(env) {
  // 1. env var directa
  if (env?.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  // 2. Firebase config
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

// Modelos Gemini en orden de preferencia (primario → fallback).
// Si el primario da 503 (alta demanda), 429 (rate limit) o 404 (modelo
// deprecado/no disponible), probamos el siguiente.
//
// Lista AMPLIADA con TODOS los modelos flash estables vigentes (Nov 2026):
//   - gemini-3.8-flash: último flash estable (primario)
//   - gemini-3.7-flash: fallback 1
//   - gemini-3.6-flash: fallback 2
//   - gemini-3.5-flash: fallback 3
//   - gemini-flash-latest: alias que Google mantiene apuntando al último
//     flash disponible. Última opción confiable.
//
// NOTA: gemini-2.5-flash y gemini-2.0-flash fueron deprecados por Google
// (devuelven 404 aunque aparezcan en list-models). Los sacamos de la lista.
// Cuando Google tiene picos de demanda, varios flash estables se saturan
// a la vez, por eso conviene tener 5 opciones en la lista.
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

// Llamada interna a un modelo específico de Gemini.
// Devuelve { text, finishReason, model } o tira error con el status.
async function _callGeminiModel(model, apiKey, body) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    let errMsg = 'error desconocido';
    try {
      const err = await resp.json();
      errMsg = err?.error?.message || errMsg;
    } catch (e) { /* ignore */ }
    const error = new Error(`Gemini ${resp.status}: ${errMsg}`);
    error.status = resp.status;
    error.model = model;
    throw error;
  }

  const data = await resp.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini no devolvió texto (modelo: ' + model + ')');

  return {
    text,
    finishReason: candidate?.finishReason,
    model
  };
}

async function callGemini(env, prompt, maxTokens, opts) {
  const apiKey = await getGeminiKey(env);
  if (!apiKey) throw new Error('No hay API key de Gemini. Configura GEMINI_API_KEY en env o guárdala en Firebase.');

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: maxTokens || 4000
    }
  };

  // Modo JSON: Gemini devuelve JSON válido sin markdown overhead ni prose
  // alrededor. Más eficiente en tokens y más confiable.
  if (opts?.json) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  // Probar modelos en orden. Si el primario da 503 (alta demanda) o 429
  // (rate limit), caemos al siguiente. Otros errores (400, 500) se propagan.
  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const result = await _callGeminiModel(model, apiKey, body);

      // Detectar truncamiento: si finishReason es MAX_TOKENS, el JSON va a estar
      // cortado a mitad de palabra y va a fallar el parse.
      if (result.finishReason === 'MAX_TOKENS') {
        throw new Error(`Gemini truncó la respuesta (finishReason=MAX_TOKENS, maxOutputTokens=${maxTokens || 4000}, modelo=${model}). Subí maxTokens o reducí el tamaño del contenido pedido.`);
      }

      return result.text;
    } catch (e) {
      lastError = e;
      // Errores recuperables (probar siguiente modelo):
      //   404 = modelo deprecado/no disponible (ej: gemini-2.5-flash fue removido)
      //   429 = rate limit
      //   500/502/503/504 = server errors temporales (alta demanda, overload)
      // Errores NO recuperables (se propagan inmediatamente):
      //   400 = bad request (prompt inválido) — no tiene sentido reintentar
      //   401/403 = auth problem — no tiene sentido reintentar
      const recoverable = [404, 429, 500, 502, 503, 504].includes(e.status);
      if (!recoverable) throw e;
      // Si fue recuperable, seguimos al siguiente modelo
      console.warn(`[gemini] Modelo ${model} falló (${e.status}), probando fallback...`);
    }
  }

  // Si llegamos acá, todos los modelos fallaron con errores recuperables.
  throw new Error(`Todos los modelos de Gemini fallaron (503/429). Último error: ${lastError?.message || 'desconocido'}. Intentá de nuevo en unos minutos.`);
}

function extractJSON(text) {
  let s = text;
  const js = s.indexOf('{');
  const je = s.lastIndexOf('}');
  if (js !== -1 && je > js) s = s.substring(js, je + 1);
  try { return JSON.parse(s); }
  catch (e) {
    try { return JSON.parse(s.replace(/'/g, '"')); }
    // Mostrar más del texto para diagnóstico: dónde se cortó el JSON.
    // Antes solo mostrábamos 150 chars, lo que no servía para ver si estaba truncado.
    catch (e2) {
      const tail = s.length > 200 ? '...' + s.substring(s.length - 200) : s;
      throw new Error('JSON inválido (longitud=' + s.length + '). Inicio: "' + s.slice(0, 80) + '". Final: "' + tail + '"');
    }
  }
}

// ============ SLUG ============

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u').replace(/[ñ]/g, 'n').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============ CATÁLOGO ============

async function loadCatalog(env) {
  const [blendsData, especiasData, packsData] = await Promise.all([
    fbAdminGet(env, '/arcano/db/blends'),
    fbAdminGet(env, '/arcano/db/especias'),
    fbAdminGet(env, '/arcano/db/packs')
  ]);

  const products = [];
  // Blends
  for (const k in blendsData) {
    const b = blendsData[k];
    if (!b || !b.enTienda || !b.nombre) continue;
    products.push({ tipo: 'blend', id: b.id, nombre: b.nombre, uso: b.uso || '', categoria: b.categoria || 'Comidas' });
  }
  // Especias
  for (const k in especiasData) {
    const e = especiasData[k];
    if (!e || !e.enTienda || !e.nombre) continue;
    products.push({ tipo: 'especia', id: e.id, nombre: e.nombre, uso: e.uso || '', categoria: e.categoria || 'Comidas' });
  }
  return products;
}

// ============ RECETAS EXISTENTES ============

async function loadExistingRecipes(env) {
  const data = await fbAdminGet(env, '/arcano/db/recetas');
  const recetas = [];
  for (const k in data) {
    if (data[k] && data[k].titulo) recetas.push(data[k]);
  }
  return recetas;
}

async function loadExistingBlog(env) {
  const data = await fbAdminGet(env, '/arcano/db/blog');
  const posts = [];
  for (const k in data) {
    if (data[k] && data[k].titulo) posts.push(data[k]);
  }
  return posts;
}

// ============ ESTADO DE ROTACIÓN ============

// Estado "vacío" / inicial con TODOS los campos que el sistema usa.
// Lo usamos siempre que el estado guardado esté corrupto o incompleto.
function defaultState() {
  return {
    recetas: {
      ultimaCategoria: null,
      ultimaFecha: null,
      contadorSemana: 0,
      // Rotación estricta de productos: índice dentro de cada categoría
      // del último producto destacado usado. La próxima vez seguimos
      // desde el siguiente índice, NO random.
      ultimoProductoIdx: { Comida: -1, Infusiones: -1, Cocteleria: -1 },
      // Lista plana de "últimos productos usados" (cualquier categoría)
      // para evitar repetir blends en recetas consecutivas.
      ultimosProductosUsados: []
    },
    blog: {
      ultimaCategoria: null,
      ultimaFecha: null,
      // Índice de la última especia usada (rotación en BLOG_ESPECIAS)
      ultimaEspeciaIdx: -1,
      // Lista de los últimos títulos generados (para evitar duplicados)
      ultimosTitulos: []
    }
  };
}

async function getAutomationState(env) {
  const raw = await fbAdminGet(env, '/arcano/db/automation');
  if (!raw) return defaultState();

  // CASO LEGACY: si antes se guardaba con fbAdminPost (que agrega un child
  // con clave auto-generada), el nodo se ve como:
  //   { "-Lx9abc": {recetas, blog}, "-Lx9abd": {recetas, blog} }
  // En ese caso tomamos el último child (mayor fecha) y lo usamos como
  // estado base; el próximo updateAutomationState lo normaliza con PUT.
  let state = raw;
  const looksLikeLegacy = raw && typeof raw === 'object' && !Array.isArray(raw)
    && !raw.recetas && !raw.blog
    && Object.values(raw).some(v => v && typeof v === 'object' && (v.recetas || v.blog));
  if (looksLikeLegacy) {
    const children = Object.entries(raw)
      .filter(([, v]) => v && typeof v === 'object' && (v.recetas || v.blog))
      .map(([k, v]) => ({ k, v, fecha: (v.recetas && v.recetas.ultimaFecha) || (v.blog && v.blog.ultimaFecha) || '' }))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    if (children.length > 0) {
      state = children[0].v;
    }
  }

  // Merge con defaults para asegurar que TODO lo que el código va a leer
  // esté definido (evita TypeError: Cannot read properties of undefined).
  const base = defaultState();
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    if (state.recetas && typeof state.recetas === 'object') {
      base.recetas = {
        ...base.recetas,
        ...state.recetas,
        ultimoProductoIdx: {
          ...base.recetas.ultimoProductoIdx,
          ...(state.recetas.ultimoProductoIdx || {})
        },
        ultimosProductosUsados: Array.isArray(state.recetas.ultimosProductosUsados)
          ? state.recetas.ultimosProductosUsados
          : []
      };
    }
    if (state.blog && typeof state.blog === 'object') {
      base.blog = {
        ...base.blog,
        ...state.blog,
        ultimosTitulos: Array.isArray(state.blog.ultimosTitulos)
          ? state.blog.ultimosTitulos
          : []
      };
    }
  }
  return base;
}

async function updateAutomationState(env, newState) {
  // PUT reemplaza TODO el nodo /arcano/db/automation.
  // Antes usábamos POST, lo cual agregaba un child nuevo cada vez
  // y rompía la próxima lectura (state.recetas quedaba undefined).
  await fbAdminPut(env, '/arcano/db/automation', newState);
}

// Rotación de categorías para recetas: Comidas, Infusiones, Coctelería
const RECETA_CATEGORIAS = ['Comida', 'Infusiones', 'Cocteleria'];

function nextRecipeCategory(state) {
  const ult = state?.recetas?.ultimaCategoria;
  if (!ult) return RECETA_CATEGORIAS[0];
  const idx = RECETA_CATEGORIAS.indexOf(ult);
  return RECETA_CATEGORIAS[(idx + 1) % RECETA_CATEGORIAS.length];
}

// Rotación de categorías para blog.
// IMPORTANTE: deben coincidir EXACTAMENTE con las categorías que maneja el
// admin del blog (admin/js/pages.js → renderBlogAdmin): 
//   Historias, Beneficios, Investigaciones, Curiosidades, Origenes
const BLOG_CATEGORIAS = [
  { categoria: 'Historias',       consigna: 'Enfócate en historia, origen, ruta comercial histórica, anécdotas del pasado, cómo llegó al mundo occidental, monasterios, imperios, rutas de la seda y especias. Transmitir descubrimiento, tradición y relatos fascinantes.' },
  { categoria: 'Beneficios',     consigna: 'Enfócate en beneficios para la salud, propiedades medicinales tradicionales y validadas, vitaminas, minerales, bienestar, nutrición, terapéutica natural. Transmitir bienestar, naturaleza y conocimiento. Evitar representaciones médicas.' },
  { categoria: 'Investigaciones', consigna: 'Enfócate en la ciencia y alquimia molecular: compuestos activos, reacciones químicas, moléculas aromáticas, ciencia del sabor, bioquímica, interacciones moleculares. Transmitir rigor, investigación y conocimiento. Evitar apariencia de laboratorio farmacéutico genérico.' },
  { categoria: 'Curiosidades',   consigna: 'Enfócate en datos curiosos, poco conocidos, mitos desmentidos, anécdotas sorprendentes, usos inesperados, cultura pop, records y tradiciones curiosas. Despertar curiosidad inmediatamente.' },
  { categoria: 'Origenes',       consigna: 'Enfócate en origen y procedencia geográfica: rutas comerciales, regiones productoras, elementos culturales del lugar de origen, patrimonio gastronómico. Transmitir autenticidad, procedencia y patrimonio gastronómico.' }
];

// Lista de especias base que el sistema va rotando dentro de cada categoría,
// para que cada artículo sea sobre una especia diferente y no se repita.
// Se van rotando: si la última vez fue "pimienta negra", ahora es "canela",
// luego "cúrcuma", etc.
const BLOG_ESPECIAS = [
  'pimienta negra', 'canela', 'cúrcuma', 'jengibre', 'ají/capsaicina',
  'pimentón', 'cacao', 'comino', 'cardamomo', 'clavo', 'nuez moscada',
  'azafrán', 'comino negro', 'fenogreco', 'sumac', 'zaatar', 'baharat',
  'ras el hanout', 'garam masala', 'curry'
];

// ============ PLANTILLAS DE DISEÑO POR CATEGORÍA ============
//
// Cada categoría de blog tiene su "look" propio:
//   - Paleta de colores (fondo, texto primario, acento, badge)
//   - Tipografía (heading y body)
//   - Decoración (pattern sutil de fondo, border, etc.)
//
// El CSS es FIJO en el código (no lo genera Gemini). Gemini solo genera
// contenido HTML semántico (p, h2, h3, blockquote, ul/ol, etc.) y el CSS
// de la categoría correspondiente se inyecta al publicar. Esto garantiza
// consistencia visual: todos los artículos de "Historias" se ven iguales
// sin importar qué devuelva Gemini.
//
// Las 5 categorías tienen paletas MUY distintas entre sí, todas con
// fondos claros (legibles, SEO-friendly) y acentos que las diferencian.
const BLOG_TEMPLATES = {
  Historias: {
    nombre: 'Historias',
    descripcion: 'Pergamino antiguo',
    // Paleta: tonos tierra, marrón cuero, dorado
    bg: '#f4ecd8',           // crema envejecido (pergamino)
    bgAccent: '#e8dcc0',     // crema más oscuro para destacar
    textPrimary: '#3a2a1a',  // marrón oscuro tipo tinta
    textSecondary: '#7a6a52',
    accent: '#c9a84c',       // dorado Arcano
    accentSoft: '#e8d5a3',
    badgeBg: '#3a2a1a',
    badgeText: '#f4ecd8',
    headingFont: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    bodyFont: 'Merriweather, "Source Serif Pro", Georgia, serif'
  },
  Beneficios: {
    nombre: 'Beneficios',
    descripcion: 'Bienestar natural',
    // Paleta: verde menta suave + rosa terracota
    bg: '#f5f0e8',
    bgAccent: '#e8f0e4',
    textPrimary: '#2a3d2e',
    textSecondary: '#6b7d6e',
    accent: '#52b788',       // verde menta
    accentSoft: '#95d5b2',
    badgeBg: '#e07a5f',      // rosa terracota (diferenciador)
    badgeText: '#f5f0e8',
    headingFont: '"Mulish", "Source Sans Pro", system-ui, sans-serif',
    bodyFont: '"Source Serif Pro", "Lora", Georgia, serif'
  },
  Investigaciones: {
    nombre: 'Investigaciones',
    descripcion: 'Laboratorio botánico',
    // Paleta: verde botánico + azul eléctrico
    bg: '#f0f4f0',
    bgAccent: '#e0eae0',
    textPrimary: '#1a2d1f',
    textSecondary: '#4a5d52',
    accent: '#2d5a3d',       // verde botánico
    accentSoft: '#7ab594',
    badgeBg: '#0077b6',      // azul eléctrico (diferenciador)
    badgeText: '#f0f4f0',
    headingFont: '"IBM Plex Sans", "Source Sans Pro", system-ui, sans-serif',
    bodyFont: '"IBM Plex Serif", "Source Serif Pro", Georgia, serif'
  },
  Curiosidades: {
    nombre: 'Curiosidades',
    descripcion: 'Magazine divertido',
    // Paleta: naranja vibrante + cyan
    bg: '#fff8f0',
    bgAccent: '#ffe8d6',
    textPrimary: '#2d1b0e',
    textSecondary: '#7a5a3a',
    accent: '#e85d04',       // naranja vibrante
    accentSoft: '#fbb47a',
    badgeBg: '#e85d04',
    badgeText: '#fff8f0',
    headingFont: '"Poppins", "Montserrat", system-ui, sans-serif',
    bodyFont: 'Inter, "Source Sans Pro", system-ui, sans-serif'
  },
  Origenes: {
    nombre: 'Origenes',
    descripcion: 'Exploración geográfica',
    // Paleta: terracota + mostaza (tierras lejanas)
    bg: '#fdf6e3',
    bgAccent: '#f5e6c8',
    textPrimary: '#3a1f1a',
    textSecondary: '#7a524a',
    accent: '#c1432e',       // rojo terracota
    accentSoft: '#e07560',
    badgeBg: '#d4a017',      // mostaza (diferenciador)
    badgeText: '#3a1f1a',
    headingFont: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    bodyFont: 'Merriweather, "Lora", Georgia, serif'
  }
};

// Devuelve el template de una categoría. Si no existe, usa Historias como fallback.
function getBlogTemplate(categoria) {
  return BLOG_TEMPLATES[categoria] || BLOG_TEMPLATES.Historias;
}

// Genera el CSS completo de un artículo según su categoría.
// Se inyecta en el <style> del HTML individual /blog/<slug>.html.
function generateBlogCSS(t) {
  return `
body{margin:0;padding:0;background:${t.bg};color:${t.textPrimary};font-family:${t.bodyFont};line-height:1.8;font-size:17px}
.container{max-width:760px;margin:0 auto;padding:0 18px 48px}
a{color:${t.accent};text-decoration:none;border-bottom:1px solid ${t.accentSoft};transition:border-color .15s}a:hover{border-color:${t.accent}}
.back{display:inline-block;margin:24px 0 16px;padding:8px 16px;border:1px solid ${t.accent};border-radius:4px;color:${t.accent};font-size:.85rem;border-bottom:1px solid ${t.accent}}.back:hover{background:${t.accent};color:${t.bg};text-decoration:none}
.header-meta{font-family:${t.headingFont};color:${t.textSecondary};font-size:.78rem;margin-bottom:6px;text-transform:uppercase;letter-spacing:.12em;font-weight:600}
h1{font-family:${t.headingFont};font-size:2.4rem;color:${t.textPrimary};margin:0 0 12px;line-height:1.2;font-weight:700;letter-spacing:-.01em}
.subtitulo{font-family:${t.bodyFont};color:${t.textSecondary};font-size:1.15rem;margin:0 0 28px;font-style:italic;line-height:1.5;border-left:3px solid ${t.accent};padding-left:16px}
.meta{color:${t.textSecondary};font-size:.85rem;margin-bottom:28px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding-bottom:18px;border-bottom:1px solid ${t.bgAccent}}
.meta .badge{display:inline-block;padding:4px 14px;border-radius:14px;font-size:.72rem;font-weight:700;background:${t.badgeBg};color:${t.badgeText};text-transform:uppercase;letter-spacing:.08em}
img.hero{width:100%;border-radius:8px;margin-bottom:32px;max-height:440px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.12)}
.content{font-size:1.05rem}
.content > p:first-child::first-letter{font-family:${t.headingFont};font-size:3.5rem;float:left;line-height:.85;padding:6px 10px 0 0;color:${t.accent};font-weight:700}
.content h2{font-family:${t.headingFont};color:${t.textPrimary};margin-top:42px;margin-bottom:14px;font-size:1.6rem;font-weight:700;border-bottom:2px solid ${t.accentSoft};padding-bottom:6px;display:inline-block}
.content h3{font-family:${t.headingFont};color:${t.textPrimary};margin-top:28px;margin-bottom:10px;font-size:1.2rem;font-weight:600}
.content p{margin-bottom:20px}
.content ul,.content ol{margin-bottom:20px;padding-left:32px}
.content li{margin-bottom:8px}
.content ul li::marker{color:${t.accent}}
.content blockquote{border-left:4px solid ${t.accent};padding:18px 24px;margin:32px 0;background:${t.bgAccent};border-radius:0 8px 8px 0;font-style:italic;color:${t.textPrimary};font-size:1.1rem;font-family:${t.bodyFont}}
.content blockquote p{margin:0}
.content a.blend-link{color:${t.accent};font-weight:600;background:${t.bgAccent};padding:1px 6px;border-radius:3px;border-bottom:none}.content a.blend-link:hover{background:${t.accent};color:${t.bg}}
.keywords-row{margin-top:40px;padding:18px 0 0;border-top:1px solid ${t.bgAccent};font-size:.82rem;color:${t.textSecondary}}.keywords-row strong{color:${t.accent};font-family:${t.headingFont};letter-spacing:.05em}
.footer{text-align:center;margin-top:64px;padding-top:24px;border-top:2px solid ${t.bgAccent};color:${t.textSecondary};font-size:.82rem;font-family:${t.bodyFont}}
.footer a{color:${t.accent};border-bottom:none}
@media(max-width:640px){
  .container{padding:0 14px 32px}
  h1{font-size:1.8rem}
  .content > p:first-child::first-letter{font-size:2.8rem}
  .content h2{font-size:1.35rem}
  .meta{flex-direction:column;align-items:flex-start;gap:6px}
}
`;
}

// CSS compacto (solo colores esenciales) para inyectar en el modal de la tienda.
// Es una versión reducida del CSS completo, suficiente para teñir el modal
// con los colores de la categoría.
function generateBlogCSSCompact(t) {
  return `
.arcano-blog-modal{--bg:${t.bg};--bg-accent:${t.bgAccent};--text:${t.textPrimary};--text-secondary:${t.textSecondary};--accent:${t.accent};--accent-soft:${t.accentSoft};--badge-bg:${t.badgeBg};--badge-text:${t.badgeText};--heading:${t.headingFont};--body:${t.bodyFont}}
`;
}

// Devuelve el CSS que necesitan las cards del índice /blog/ para mostrar
// el color de cada categoría. Se inlinea una sola vez en el index.
function generateBlogIndexCategoryColors() {
  let css = '';
  for (const cat in BLOG_TEMPLATES) {
    const t = BLOG_TEMPLATES[cat];
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    css += `.post.cat-${slug}{border-top:4px solid ${t.accent};}\n`;
    css += `.post.cat-${slug} .cat-badge{background:${t.badgeBg};color:${t.badgeText};}\n`;
    css += `.post.cat-${slug} h2{color:${t.textPrimary};}\n`;
    css += `.post.cat-${slug}:hover{border-color:${t.accent};border-top-color:${t.accent};}\n`;
  }
  return css;
}

// Slug de categoría para usar como clase CSS
function catToClass(categoria) {
  return String(categoria || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ============ BRIEF DE IMAGEN EDITORIAL POR CATEGORÍA ============
//
// Brief maestro para generar las portadas del blog Arcano.
// Sistema de identidad visual consistente: cada portada debe pertenecer a la
// MISMA colección editorial, sin crear 5 estilos diferentes.
//
// Estructura del brief:
//   - base: formato + paleta cromática oficial + sistema tipográfico + composición
//   - <categoría>: solo adapta la DIRECCIÓN de la fotografía, NO cambia el
//     sistema tipográfico ni la paleta.
//
// IMPORTANTE: Gemini debe LEER el contenido del artículo que acaba de generar
// y crear un imagen_prompt ESPECÍFICO que:
//   1. Aplique este brief editorial completo.
//   2. Use los ingredientes/elementos ESPECÍFICOS del artículo (no genéricos).
//   3. Use el título y subtítulo EXACTOS del artículo.
const BLOG_IMAGE_BRIEF = {
  base: `Create a premium editorial gastronomic magazine cover for ARCANO brand. ALL covers must follow EXACTLY the same visual identity system, typography, color palette and art direction. The result must look like part of the same international luxury gastronomic magazine collection. DO NOT create different styles. Create covers that belong to the same editorial collection.

FORMAT:
- Horizontal orientation, 16:9 aspect ratio, target resolution 1200x630 pixels.
- A single integrated photographic composition. NO collages, grids or panels.
- Optimized for blog and social media.

OFFICIAL COLOR PALETTE (use EXCLUSIVELY these colors as reference):
- Charcoal black: #11100E (must DOMINATE the composition)
- Editorial ivory: #F4EFE6 (used for main titles)
- Primary gold: #D99B27 (elegance, exclusivity, NOT excessively bright metallic)
- Secondary gold: #C99736 (complementary gold)
- Warm white: #E9E3D9 (for subtitles)
- Deep coffee: #392619 (deep browns for backgrounds/accents)
- Natural spice colors can complement but NEVER break the chromatic identity.

TYPOGRAPHY SYSTEM (MANDATORY — must look identical on every cover):

A. BRAND NAME: ARCANO
- Always uppercase: ARCANO
- Geometric thin elegant sans serif (Montserrat Light, Gotham Light or Helvetica Neue Light reference)
- Wide letter spacing
- Editorial ivory color #F4EFE6
- Small, discreet, sophisticated size
- Location: TOP LEFT zone
- Below the brand name: a SHORT HORIZONTAL GOLD LINE
- Do not modify the name, do not add symbols, do not invent logos.

B. MAIN TITLE
- High-contrast editorial serif typography (Cormorant Garamond, Playfair Display or Didot reference)
- Elegant, refined, personality letters
- Large protagonist size
- Main color: editorial ivory #F4EFE6
- Left alignment
- Preferably 1 to 3 lines depending on title length
- Compact balanced line spacing

C. HIGHLIGHTED WORDS
- Select 1 or 2 important words from the title
- Write them in ITALIC
- Use gold #D99B27
- Keep the rest of the title in ivory
- DO NOT highlight all words
- The contrast must look natural, elegant, balanced
- This typographic treatment must recall a luxury gastronomic magazine

D. SUBTITLE
- Modern sans serif typography (Montserrat, Helvetica Neue or similar reference)
- Regular weight
- Color: warm white #E9E3D9
- Size considerably smaller than the title
- Located below the title
- Maximum 2 lines
- Excellent legibility

E. DECORATIVE ELEMENTS
- Use ONLY: thin horizontal gold lines, small discreet geometric details when necessary, minimalist separators
- NO excessive ornaments

LAYOUT AND COMPOSITION (must remain consistent):

LEFT ZONE (text area):
- ARCANO brand name at the top
- Horizontal gold line below the brand
- Large main title
- 1-2 highlighted words in italic gold
- Subtitle below the title
- Small horizontal gold detail to close the composition
- Sufficient negative space and dark background to guarantee legibility

RIGHT ZONE (photography area):
- Main article photograph
- Ingredients, spices, objects or cultural elements related to the content
- Cinematic lighting
- Depth of field
- Rich and attractive visual composition
- The photography must integrate with the background, avoiding artificial divisions between text and image

PHOTOGRAPHIC DIRECTION:
- Hyperrealistic photography
- Professional advertising quality
- Warm cinematic lighting
- Deep controlled shadows
- Natural detailed textures
- Professional depth of field
- Contrasts between black, gold and natural tones
- Carefully selected gastronomic elements
- AVOID generic stock images, childish illustrations, artificial renders, overloaded compositions

TEXT RULES (use ONLY the texts supplied by the agent):
- BRAND: ARCANO
- CATEGORY: [article category]
- TITLE: [EXACT title of the article]
- SUBTITLE: [provided subtitle]
- DO NOT invent titles, modify words, correct, reinterpret, add promotional phrases, translate, add additional texts
- Strictly respect Spanish accents and spelling
- DO NOT duplicate words, deform letters, substitute characters
- If title is too long, adapt size and distribution without modifying content

RESTRICTIONS:
- NO handwritten, futuristic, or 3D fonts
- NO multicolor gradients, neon colors, predominantly white backgrounds
- NO frames, cards, decorative icons, watermarks, invented logos
- NO additional texts

FINAL RESULT:
- A single horizontal ARCANO cover
- Exactly the described editorial identity: dark background, cinematic gastronomic photography, serif titles in ivory, highlighted words in italic gold, sans serif subtitles, ARCANO brand in spaced letters
- Each publication must have a DIFFERENT photograph, but ALL must look designed by the same art director and belong to the same gastronomic magazine
- ABSOLUTE PRIORITY: BRAND CONSISTENCY, TYPOGRAPHIC ELEGANCE, LEGIBILITY, PHOTOGRAPHIC QUALITY`,

  Historias: `CATEGORY DIRECTION (only adapts photography, NOT typography): HISTORIAS — Historical and narrative aesthetic.
Incorporate antique books, old maps, compasses, navigation instruments, cultural objects and the spices that the article is about. Convey storytelling, tradition and discovery. The visual mood should evoke a vintage apothecary or a 19th century botanical expedition.`,

  Beneficios: `CATEGORY DIRECTION (only adapts photography, NOT typography): BENEFICIOS — Botanical and sensorial aesthetic.
Use roots, leaves, flowers, fresh spices and botanical ingredients. Convey nature, wellness and knowledge. AVOID medical visual claims (no pills, no pharmacy look, no clinical white). The mood should be calm, organic, spa-like.`,

  Investigaciones: `CATEGORY DIRECTION (only adapts photography, NOT typography): INVESTIGACIONES — Scientific and editorial aesthetic.
Incorporate glassware, microscopy, lab elements, botanical samples and the spices. Convey rigor, research and knowledge. AVOID generic pharmaceutical lab appearance (no sterile white lab, no pills). The mood should be editorial scientific journal, dark and moody with golden highlights.`,

  Curiosidades: `CATEGORY DIRECTION (only adapts photography, NOT typography): CURIOSIDADES — Dynamic and surprising aesthetic.
Use macro photography, suspended spice particles, spices in motion, textures and unusual perspectives. Awaken curiosity and interest immediately. Dynamic composition with frozen motion, particles floating, dramatic angles.`,

  Origenes: `CATEGORY DIRECTION (only adapts photography, NOT typography): ORIGENES — Geographic and cultural exploration aesthetic.
Incorporate old maps, trade routes, compasses, cultural elements and representative spices of each region. Convey provenance, exploration and gastronomic heritage. The mood should evoke a 16th century spice trade expedition.`
};

// Devuelve el brief completo (base + categoría) para una categoría dada.
function getBlogImageBrief(categoria) {
  const cat = BLOG_IMAGE_BRIEF[categoria] || BLOG_IMAGE_BRIEF.Historias;
  return BLOG_IMAGE_BRIEF.base + '\n\n' + cat;
}

function nextBlogTema(state) {
  const ultCat = state?.blog?.ultimaCategoria;
  const ultEspIdx = Number.isFinite(Number(state?.blog?.ultimaEspeciaIdx))
    ? Number(state.blog.ultimaEspeciaIdx)
    : -1;
  // Avanzar categoría
  let catIdx = 0;
  if (ultCat) {
    const found = BLOG_CATEGORIAS.findIndex(c => c.categoria === ultCat);
    if (found >= 0) catIdx = (found + 1) % BLOG_CATEGORIAS.length;
  }
  const categoria = BLOG_CATEGORIAS[catIdx];
  // Avanzar especia (rotación independiente de la categoría)
  const espIdx = (ultEspIdx + 1) % BLOG_ESPECIAS.length;
  const especia = BLOG_ESPECIAS[espIdx];
  return {
    categoria: categoria.categoria,
    consigna: categoria.consigna,
    especia,
    espIdx,
    catIdx
  };
}

// ============ GENERAR RECETA ============

async function generateRecipe(env, opts) {
  const dryRun = opts?.dryRun;
  const log = [];

  // 1. Estado + categoría
  const state = await getAutomationState(env);
  const categoria = nextRecipeCategory(state);
  log.push(`Categoría rotación: ${categoria} (anterior: ${state.recetas.ultimaCategoria || 'ninguna'})`);

  // 2. Catálogo
  const products = await loadCatalog(env);
  const catProducts = products.filter(p => {
    // Productos que aplican a esta categoría
    if (categoria === 'Cocteleria') return /coctel|gin|ron|whisky|mojito|vodka|rum|citrus/i.test(p.uso + ' ' + p.nombre);
    if (categoria === 'Infusiones') return /infusion|te|chai|golden|wellness|respirar|sueños/i.test(p.uso + ' ' + p.nombre);
    return true; // Comidas: todos aplican
  });
  log.push(`Productos en catálogo (${catProducts.length} filtrados, ${products.length} total)`);

  // 3. Recetas existentes (para no repetir) + rotación de productos
  const existing = await loadExistingRecipes(env);
  const existingTitles = existing.slice(-20).map(r => r.titulo).join(', ');
  log.push(`Recetas existentes: ${existing.length} (no repetir últimas 20)`);

  // 3b. Rotación ESTRICTA de productos (no random).
  // El sistema guarda en el estado `ultimoProductoIdx[categoria]` el índice
  // del último producto destacado usado DENTRO del catálogo ordenado de
  // esa categoría. Cada vez que se genera una receta, avanzamos al
  // siguiente índice, así nunca usamos siempre el mismo blend.
  const recentProducts = new Set();
  existing.slice(-10).forEach(r => {
    (r.productos_usados || []).forEach(p => recentProducts.add(p));
  });
  log.push(`Productos usados en últimas 10 recetas: ${Array.from(recentProducts).join(', ') || 'ninguno'}`);

  // Orden determinista por nombre: así el índice guardado en el estado
  // apunta siempre al mismo producto aunque el catálogo crezca o mute.
  const orderedCat = catProducts.slice().sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })
  );
  const pool = orderedCat.length > 0 ? orderedCat : catProducts;

  let lastIdx = -1;
  if (state.recetas.ultimoProductoIdx && typeof state.recetas.ultimoProductoIdx === 'object') {
    lastIdx = Number(state.recetas.ultimoProductoIdx[categoria]);
    if (!Number.isFinite(lastIdx)) lastIdx = -1;
  }
  const nextIdx = pool.length > 0 ? (lastIdx + 1) % pool.length : -1;
  const chosenProduct = nextIdx >= 0 ? pool[nextIdx] : null;
  const highlightProduct = chosenProduct ? chosenProduct.nombre : '';
  if (chosenProduct) {
    log.push(`Producto destacado: ${highlightProduct} (${chosenProduct.tipo}) [índice ${nextIdx}/${pool.length} en ${categoria}]`);
  } else {
    log.push('AVISO: sin productos disponibles en el catálogo para esta categoría');
  }

  const productContext = (catProducts.length ? catProducts : products).slice(0, 30).map(p => {
    const marker = (chosenProduct && p.nombre === chosenProduct.nombre) ? ' ← PRODUCTO DESTACADO' : '';
    return `- ${p.nombre} (${p.uso || 'uso general'})${marker}`;
  }).join('\n');

  // 4. Prompt (basado en pages.js:7687)
  const prompt = 'Eres un chef creativo experto en especias de la marca Arcano Especias.\n\n' +
    'CATALOGO DE PRODUCTOS PUBLICADOS (usa SOLO nombres exactos de esta lista):\n' + productContext + '\n\n' +
    'REGLAS:\n' +
    '1. Usa al menos UN producto del catalogo (nombre exacto, copia literal).\n' +
    '2. Si el producto tiene "uso sugerido", respeta esa orientacion.\n' +
    '3. Idioma: ESPAÑOL.\n' +
    '4. 5 a 12 ingredientes con cantidades precisas.\n' +
    '5. 5 a 8 pasos claros y en orden.\n' +
    '6. productos_usados DEBE ser un array con al menos 1 nombre EXACTO del catalogo arriba.\n' +
    '   Si mencionas un producto en ingredientes, su nombre EXACTO debe estar en productos_usados.\n' +
    '   NO inventes nombres. Si un ingrediente no es del catalogo, no lo pongas en productos_usados.\n' +
    '7. La receta debe ser ORIGINAL, diferente a las existentes.\n' +
    '8. EXPRESION: ESPAÑOL NEUTRO. Sin voseo, sin argentismos, sin "vos". Usar "tú" y "tienes".\n' +
    'RECETAS YA EXISTENTES (NO repetir): ' + existingTitles + '\n\n' +
    `Crea una receta de ${categoria} que use como ingrediente principal el producto: ${highlightProduct}.\n` +
    `Esta receta debe destacar el sabor de ${highlightProduct} como protagonista.\n\n` +
    'Responde SOLO con JSON valido (sin markdown, sin backticks) con esta estructura:\n' +
    '{"titulo": "...", "descripcion": "... (2-3 oraciones)", "categoria": "' + categoria + '", ' +
    '"dificultad": "Facil" o "Media" o "Dificil", ' +
    '"tiempo": "... (ej: 30 min)", "porciones": "... (ej: 4 porciones)", ' +
    '"productos_usados": ["Nombre Exacto del Producto del Catalogo"], ' +
    '"ingredientes": ["1 cucharadita de Nombre Exacto del Producto", "200g de proteina", ...], ' +
    '"pasos": ["Paso 1: ...", "Paso 2: ...", ...], ' +
    '"imagen_prompt": "professional food photography of the finished dish, overhead angle, natural light, on a rustic wooden table, no text, no letters, no words, vibrant colors, appetizing"}\n\n' +
    `RECORDATORIO FINAL: productos_usados[] DEBE contener exactamente "${highlightProduct}" como primer elemento. ` +
    'Puedes agregar otros productos del catalogo si encajan, pero el protagonista debe ser el destacado.';

  // 5. Llamar Gemini
  log.push('Llamando a Gemini (gemini-3.6-flash)...');
  const text = await callGemini(env, prompt, 4000, { json: true });
  const receta = extractJSON(text);
  log.push(`Receta generada: "${receta.titulo}"`);

  // 6. Validar
  if (!receta.titulo || !receta.ingredientes || !receta.pasos) {
    throw new Error('Receta inválida (faltan campos): ' + JSON.stringify(receta).slice(0, 200));
  }
  receta.slug_publicado = slugify(receta.titulo);
  receta.fecha = new Date().toISOString().substring(0, 10);
  // NORMALIZAR categoria: la tienda filtra por 'Comida' | 'Infusiones' | 'Cocteleria'
  // (singular, sin acento). Si Gemini devolvió otra cosa (p.ej. 'Comidas', 'Coctelería',
  // 'Postres'), forzamos la categoria rotada para que SÍ aparezca en la tienda.
  if (!RECETA_CATEGORIAS.includes(receta.categoria)) {
    log.push(`Normalizando categoria: "${receta.categoria}" → "${categoria}"`);
    receta.categoria = categoria;
  }
  // Garantizar productos_usados (array) — si Gemini no devolvió ninguno, usar el destacado.
  if (!Array.isArray(receta.productos_usados) || receta.productos_usados.length === 0) {
    receta.productos_usados = highlightProduct ? [highlightProduct] : [];
  } else if (highlightProduct && receta.productos_usados[0] !== highlightProduct) {
    // Asegurar que el destacado sea el primer elemento (lo exige el prompt).
    receta.productos_usados = [highlightProduct, ...receta.productos_usados.filter(p => p !== highlightProduct)];
  }

  // 7. Dry-run: parar aquí
  if (dryRun) {
    return { receta, log, dryRun: true };
  }

  // 8. Generar imagen (sin texto)
  log.push('Generando imagen con Workers AI...');
  const imgResp = await fetch('https://arcanoespecias.com/api/generar-imagen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: receta.imagen_prompt || `professional food photography of ${receta.titulo}, overhead, natural light, no text`,
      width: 1024, height: 768
    })
  });
  const imgData = await imgResp.json();
  if (!imgData.ok) throw new Error('Error generando imagen: ' + (imgData.error || 'desconocido'));
  log.push('Imagen generada OK');

  // 9. Subir imagen a GitHub
  log.push('Subiendo imagen a GitHub...');
  const { url: imageUrl } = await uploadImage(env, receta.slug_publicado, imgData.image, 'recetas');
  receta.imagen_url = imageUrl;
  log.push(`Imagen subida: ${imageUrl}`);

  // 10. Guardar en Firebase
  log.push('Guardando receta en Firebase...');
  await fbAdminPost(env, '/arcano/db/recetas', receta);
  log.push('Receta guardada');

  // 11. Generar HTML SEO + subir a GitHub
  log.push('Generando HTML SEO...');
  const html = generateRecipeHTML(receta, imageUrl);
  const htmlPath = `recetas/${receta.slug_publicado}.html`;
  await uploadToGitHub(env, htmlPath, html, `automation: receta ${receta.titulo}`, false);
  log.push(`HTML subido: ${htmlPath}`);

  // 11b. Regenerar el ÍNDICE /recetas/index.html con la nueva receta incluida.
  // Sin esto, las recetas generadas automáticamente aparecen en el admin y en
  // /recetas/<slug>.html pero NO en el listado público estático.
  try {
    log.push('Regenerando índice /recetas/index.html...');
    const allRecipes = await loadExistingRecipes(env);
    const indexHtml = generateRecipesIndexHTML(allRecipes);
    await uploadToGitHub(env, 'recetas/index.html', indexHtml, `automation: índice recetas (agregada ${receta.titulo})`, false);
    log.push('Índice /recetas/index.html actualizado');
  } catch (e) {
    // No es crítico: la receta individual ya está publicada.
    log.push(`AVISO: no se pudo regenerar el índice: ${e.message}`);
  }

  // 11c. Agregar la URL de la receta nueva a sitemap.xml (sin regenerar todo).
  // Idempotente y defensivo: si la URL ya existe o algo falla, no rompe nada.
  try {
    const recetaUrl = `${BASE_URL}/recetas/${receta.slug_publicado}`;
    const sm = await appendToSitemap(env, recetaUrl, receta.fecha);
    if (sm.alreadyExists) {
      log.push(`Sitemap: URL ya presente (skip)`);
    } else {
      log.push(`Sitemap: URL agregada (${sm.totalUrls} URLs totales)`);
    }
  } catch (e) {
    // No es crítico: la receta ya está publicada y enlazada desde el índice.
    log.push(`AVISO: no se pudo actualizar sitemap.xml: ${e.message}`);
  }

  // 12. Actualizar estado
  // Preservamos ultimoProductoIdx (rotación estricta) y actualizamos el
  // índice de la categoria actual al nextIdx que acabamos de usar.
  const nuevoIdxMap = {
    ...(state.recetas.ultimoProductoIdx || {}),
    [categoria]: nextIdx
  };
  // Mantener un historial circular de los últimos 15 productos usados
  // (todos los nombres mencionados en productos_usados, no solo el destacado).
  const ultimosUsados = Array.isArray(state.recetas.ultimosProductosUsados) ? state.recetas.ultimosProductosUsados : [];
  const productosDeEstaReceta = Array.isArray(receta.productos_usados) ? receta.productos_usados : [];
  const nuevoHistorial = [...ultimosUsados, ...productosDeEstaReceta].slice(-15);

  state.recetas = {
    ultimaCategoria: categoria,
    ultimaFecha: receta.fecha,
    contadorSemana: (state.recetas.contadorSemana || 0) + 1,
    ultimoProductoIdx: nuevoIdxMap,
    ultimosProductosUsados: nuevoHistorial
  };
  await updateAutomationState(env, state);

  // 13. Email al admin
  log.push('Enviando email al admin...');
  await sendRecipeEmail(env, receta);
  log.push('Email enviado');

  return { receta, log, url: `${BASE_URL}/recetas/${receta.slug_publicado}` };
}

// ============ GENERAR BLOG (auto-publicado) ============

async function generateBlog(env, opts) {
  const dryRun = opts?.dryRun;
  const ctx = opts?.ctx;  // Cloudflare context para ctx.waitUntil (fire-and-forget)
  const log = [];

  // 1. Estado + catálogo + blog existente EN PARALELO (3 lecturas simultáneas)
  log.push('Cargando estado, catálogo y blog existente en paralelo...');
  const [state, products, existing] = await Promise.all([
    getAutomationState(env),
    loadCatalog(env),
    loadExistingBlog(env)
  ]);
  const tema = nextBlogTema(state);
  log.push(`Categoría rotación: ${tema.categoria} (anterior: ${state.blog.ultimaCategoria || 'ninguna'})`);
  log.push(`Especia rotación: ${tema.especia} [índice ${tema.espIdx}/${BLOG_ESPECIAS.length}]`);

  const productContext = products.slice(0, 30).map(p => `- [ID:${p.id}] ${p.nombre} - ${p.uso || ''}`).join('\n');
  const existingTitles = existing.slice(-15).map(p => p.titulo).join(', ');
  log.push(`Blog existente: ${existing.length} posts`);

  // 4. Prompt dinámico por categoría
  //    El CSS se inyecta después (generateBlogCSS) según la categoría.
  //    Gemini solo genera HTML semántico (p, h2, h3, blockquote, ul/ol).
  //    NO debe incluir <style>, classes CSS, ni atributos inline.
  const prompt = 'Eres un redactor creativo experto en especias y blends de la marca Arcano Especias (tienda colombiana online).\n' +
    'Escribes en ESPAÑOL NEUTRO INTERNACIONAL (no voseo, no "vos"). Usas "tú" y "tienes".\n' +
    'Tono: narrativo, cercano, didáctico, experto pero accesible.\n\n' +
    'BLENDS DISPONIBLES EN TIENDA (usa SOLO estos nombres exactos cuando menciones):\n' + productContext + '\n\n' +
    '=== INSTRUCCION DE KEYWORDS ===\n' +
    '1. Identifica 5-8 keywords del mercado de especias online en Colombia.\n' +
    '2. Integra las keywords de forma SUTIL y NATURAL en el contenido.\n' +
    '3. NUNCA repitas una keyword más de 2 veces.\n\n' +
    '=== ESTRUCTURA HTML OBLIGATORIA ===\n' +
    'El campo "contenido" debe ser HTML semántico PURO. SOLO se permiten estos tags:\n' +
    '  <p>  <h2>  <h3>  <blockquote>  <ul>  <ol>  <li>  <strong>  <em>\n' +
    'ESTRUCTURA:\n' +
    '  - <p> introductorio (2-3 oraciones) al inicio\n' +
    '  - 2-3 <h2> subtítulos con el contenido desarrollado debajo\n' +
    '  - 1 <blockquote> con una frase destacada o cita interesante\n' +
    '  - Opcional: 1 <ul> o <ol> con lista útil\n' +
    '  - Cierre con <h2>Para llevar a tu cocina</h2> que menciona 1-2 blends del catálogo\n' +
    'TOTAL: entre 600 y 800 palabras.\n\n' +
    '=== REGLAS CRÍTICAS DE HTML ===\n' +
    '1. NO incluyas <style>, <script>, <div>, <span>, <section>, <article>, <header>, <footer>.\n' +
    '2. NO agregues clases CSS ni atributos style="". El diseño visual lo maneja el sistema automáticamente según la categoría.\n' +
    '3. NO envuelvas menciones de blends en <a>. El sistema lo hace automáticamente después con openDetail(ID).\n' +
    '4. NO uses IDs en los tags. Solo HTML semántico puro.\n' +
    '5. Cierra todos los tags correctamente. Ej: <p>texto</p>, no <p>texto.\n\n' +
    '=== REGLAS DE ESTILO ===\n' +
    '1. ESPAÑOL NEUTRO. Sin voseo, sin argentismos. Sin "conocé", "aprendé", "probá" → usa "conoce", "aprende", "prueba".\n' +
    '2. Título ≤ 60 caracteres, llamativo, con la especia o temática.\n' +
    '3. Descripción meta ≤ 155 caracteres (para SEO).\n' +
    '4. Sin emojis. Sin markdown. Sin backticks.\n' +
    '5. Contenido original, NO repetir los existentes.\n' +
    '6. NO uses placeholders tipo [...]. Toda la información debe estar completa.\n\n' +
    'ARTICULOS YA EXISTENTES (NO repetir títulos ni enfoques): ' + existingTitles + '\n\n' +
    `CATEGORIA: ${tema.categoria}\n` +
    `${tema.consigna}\n\n` +
    `ESPECIA PRINCIPAL: ${tema.especia}\n` +
    `El artículo debe girar en torno a ${tema.especia}. Es el protagonista. ` +
    `Aparece en el título, en la introducción, en al menos 2 subtítulos y en el cierre.\n\n` +
    '=== FAQs OBLIGATORIAS ===\n' +
    'Generá 3 a 5 preguntas frecuentes relacionadas al artículo, con respuestas concretas de 1-3 oraciones cada una.\n' +
    'Las preguntas deben ser las que un usuario real buscaría en Google (orientadas a SEO + intención de búsqueda).\n' +
    'Ejemplos buenos: "¿Cuánto dura la pimienta negra molida?", "¿Cómo conservar la pimienta negra fresca?", "¿La pimienta negra tiene cafeína?"\n' +
    'Ejemplos malos: "¿Qué es la pimienta?" (muy genérico), "¿Te gusta la pimienta?" (opinión)\n\n' +
    '=== IMAGEN_PROMPT (CRÍTICO — leer el artículo) ===\n' +
    'Después de escribir el artículo, LEÉ su contenido completo (título, subtítulo, especia protagonista, keywords, ideas centrales) y generá un "imagen_prompt" ESPECÍFICO para este artículo.\n' +
    'NO uses un prompt genérico. La imagen debe ilustrar visualmente el tema específico del artículo, con ingredientes/elementos que se mencionen en el contenido.\n' +
    'El imagen_prompt va a alimentar un modelo de generación de imágenes (flux-1-schnell), por lo que debe ser en INGLÉS, descriptivo y específico.\n' +
    'Aplica este BRIEF EDITORIAL (debes respetarlo en el imagen_prompt que generes):\n\n' +
    getBlogImageBrief(tema.categoria) + '\n\n' +
    'IMPORTANTE: el imagen_prompt que generes debe ser UNA FRASE LARGA (3-6 oraciones) que:\n' +
    '1. Mencione ingredientes/elementos ESPECÍFICOS del artículo (no genéricos).\n' +
    '2. Aplique el brief editorial Arcano (fondo oscuro, dorado, cinematográfico, 35% izquierda limpio).\n' +
    '3. Sea específico de la categoría ' + tema.categoria + '.\n' +
    '4. Termine SIEMPRE con "no text, no letters, no watermark, no logos".\n\n' +
    'Responde SOLO con JSON valido (sin markdown, sin backticks):\n' +
    '{"titulo": "...", "subtitulo": "... (100-160 chars)", "categoria": "' + tema.categoria + '", ' +
    '"descripcion_meta": "... (150-155 chars SEO)", "keywords": ["k1","k2"], ' +
    '"tiempoLectura": "X min", "contenido": "<p>...</p><h2>...</h2><p>...</p>...", ' +
    '"faqs": [{"q": "pregunta 1", "a": "respuesta 1"}, {"q": "pregunta 2", "a": "respuesta 2"}, ...], ' +
    '"imagen_prompt": "specific english description for THIS article applying the brief above, ends with no text, no letters, no watermark"}';

  // 5. Llamar Gemini
  log.push('Llamando a Gemini (gemini-3.6-flash, modo JSON, 8192 tokens)...');
  // maxTokens=8192 suficiente para 600-800 palabras de contenido HTML + JSON
  // overhead (FAQs, keywords, imagen_prompt). Con fallback automático a
  // gemini-2.5-flash si el 3.6 da 503 (alta demanda).
  const text = await callGemini(env, prompt, 8192, { json: true });
  const articulo = extractJSON(text);
  log.push(`Artículo generado: "${articulo.titulo}"`);

  // 6. Validar
  if (!articulo.titulo || !articulo.contenido) {
    throw new Error('Artículo inválido: ' + JSON.stringify(articulo).slice(0, 200));
  }
  articulo.slug_publicado = slugify(articulo.titulo);
  articulo.fecha = new Date().toISOString().substring(0, 10);
  articulo.publicado = false;       // BORRADOR — el admin aprueba desde el panel
  articulo.programado = false;
  articulo.categoria = tema.categoria;  // Forzar la categoría rotada
  articulo.especia_principal = tema.especia;  // Guardar para usar al publicar

  // 6b. Normalizar FAQs: asegurar array válido con {q, a}
  if (!Array.isArray(articulo.faqs) || articulo.faqs.length === 0) {
    articulo.faqs = [];
    log.push('AVISO: Gemini no devolvió faqs, se generan vacías');
  } else {
    articulo.faqs = articulo.faqs
      .filter(f => f && f.q && f.a)
      .slice(0, 6)  // máximo 6 FAQs
      .map(f => ({ q: String(f.q).trim(), a: String(f.a).trim() }));
    log.push(`FAQs generadas: ${articulo.faqs.length}`);
  }

  // Calcular tiempoLectura si no vino
  if (!articulo.tiempoLectura) {
    const palabras = articulo.contenido.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => w.length).length;
    articulo.tiempoLectura = Math.max(1, Math.round(palabras / 200)) + ' min';
  }

  // 7. POST-PROCESAMIENTO: envolver menciones de blends con openDetail(ID)
  //    Gemini NO debería haberlo hecho solo (lo pedimos en el prompt), pero
  //    reforzamos aquí para garantizar que los enlaces estén bien formados.
  const productosParaEnlazar = products.slice();  // copia
  const linkResult = linkBlendMentions(articulo.contenido, productosParaEnlazar);
  articulo.contenido = linkResult.html;
  log.push(`Enlaces a blends insertados: ${linkResult.linksInserted} (${linkResult.productosEnlazados.join(', ') || 'ninguno'})`);

  // 8. Dry-run: parar aquí
  if (dryRun) {
    return { articulo, log, dryRun: true };
  }

  // 9. Generar imagen con Workers AI
  log.push('Generando imagen con Workers AI...');
  const imgResp = await fetch('https://arcanoespecias.com/api/generar-imagen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Si por alguna razón Gemini no devolvió imagen_prompt, usar el brief
      // completo de la categoría como fallback (no un prompt genérico).
      prompt: articulo.imagen_prompt || getBlogImageBrief(tema.categoria),
      width: 1024, height: 768
    })
  });
  const imgData = await imgResp.json();
  if (!imgData.ok) throw new Error('Error generando imagen: ' + (imgData.error || 'desconocido'));
  log.push('Imagen generada OK');

  // 10-13. Subir imagen + guardar en Firebase + actualizar estado EN PARALELO
  //       (no dependen entre sí, así que los corremos simultáneamente para
  //       reducir el tiempo total y evitar timeout de Cloudflare 524).
  log.push('Subiendo imagen a GitHub + guardando en Firebase + actualizando estado (en paralelo)...');

  const ultimosTitulos = Array.isArray(state.blog.ultimosTitulos) ? state.blog.ultimosTitulos : [];
  const newState = {
    ...state,
    blog: {
      ultimaCategoria: tema.categoria,
      ultimaFecha: articulo.fecha,
      ultimaEspeciaIdx: tema.espIdx,
      ultimosTitulos: [...ultimosTitulos, articulo.titulo].slice(-20)
    }
  };

  const [uploadResult, fbResult] = await Promise.all([
    // 10. Subir imagen a GitHub
    uploadImage(env, articulo.slug_publicado, imgData.image, 'blog'),
    // 11. Guardar en Firebase como BORRADOR (publicado=false)
    fbAdminPost(env, '/arcano/db/blog', articulo),
    // 13. Actualizar estado (categoría + especia + títulos)
    updateAutomationState(env, newState)
  ]);

  articulo.imagen_url = uploadResult.url;
  articulo._key = fbResult?.name || null;
  log.push(`Imagen subida: ${uploadResult.url}`);
  log.push(`Artículo guardado en Firebase (key=${articulo._key || 'n/a'}, publicado=false)`);
  log.push('Estado de rotación actualizado');

  // 12. NO subir HTML individual, NO regenerar índice, NO append al sitemap.
  //     Todo eso lo hace el endpoint /api/automation/publish-blog cuando el
  //     admin aprueba el artículo. Mientras tanto, el borrador solo existe en
  //     Firebase y se ve en el admin (con botón "Aprobar y publicar").

  // 14. Email al admin: fire-and-forget con ctx.waitUntil (no bloquea respuesta)
  //     Si ctx no está disponible (ej: dry-run manual o llamada directa),
  //     esperamos sync. Si ctx está, lo mandamos en background.
  if (ctx?.waitUntil) {
    ctx.waitUntil(sendBlogDraftEmail(env, articulo).catch(e => {
      console.warn('[automation] Email falló (background):', e.message);
    }));
    log.push('Email encolado en background (no bloquea respuesta)');
  } else {
    log.push('Enviando email al admin (sync)...');
    try {
      await sendBlogDraftEmail(env, articulo);
      log.push('Email enviado');
    } catch (e) {
      log.push(`AVISO: email falló: ${e.message}`);
    }
  }

  return {
    articulo,
    log,
    adminUrl: `${BASE_URL}/admin/#blog`,
    pendingApproval: true
  };
}

// ============ PUBLICAR BLOG (lo llama el admin al aprobar) ============

// Publica un artículo de blog que estaba como borrador:
//   1. Lo busca en Firebase por _key o por slug
//   2. Marca publicado=true
//   3. Genera HTML SEO individual + sube a GitHub
//   4. Regenera /blog/index.html
//   5. Append al sitemap.xml
//   6. Devuelve la URL pública
//
// Es idempotente: si el artículo ya estaba publicado, no falla, solo omite
// los pasos que ya están hechos (HTML ya subido, etc.).
async function publishBlogPost(env, opts) {
  const log = [];
  const keyOrSlug = opts?.key || opts?.slug;
  if (!keyOrSlug) throw new Error('Se requiere key o slug');

  // 1. Buscar el artículo en Firebase
  const allPosts = await loadExistingBlog(env);
  let articulo = null;
  if (opts?.key) {
    articulo = allPosts.find(p => p._key === opts.key);
  }
  if (!articulo && opts?.slug) {
    articulo = allPosts.find(p => (p.slug_publicado || slugify(p.titulo)) === opts.slug);
  }
  if (!articulo) throw new Error('Artículo no encontrado: ' + keyOrSlug);

  log.push(`Publicando: "${articulo.titulo}" (key=${articulo._key || 'n/a'})`);

  // 2. Marcar publicado=true en Firebase (PATCH solo ese nodo)
  if (articulo._key) {
    await fbAdminPatch(env, '/arcano/db/blog/' + articulo._key, { publicado: true });
    log.push('Firebase: publicado=true');
  } else {
    log.push('AVISO: sin _key, no se pudo actualizar Firebase. El HTML se subirá igual.');
  }
  articulo.publicado = true;

  // 3. Generar HTML SEO + subir a GitHub
  log.push('Generando HTML SEO...');
  const html = generateBlogHTML(articulo, articulo.imagen_url, articulo.especia_principal);
  const htmlPath = `blog/${articulo.slug_publicado || slugify(articulo.titulo)}.html`;
  await uploadToGitHub(env, htmlPath, html, `admin: publicar blog ${articulo.titulo}`, false);
  log.push(`HTML subido: ${htmlPath}`);

  // 4. Regenerar el ÍNDICE /blog/index.html
  try {
    log.push('Regenerando índice /blog/index.html...');
    const fresh = await loadExistingBlog(env);
    const indexHtml = generateBlogIndexHTML(fresh);
    await uploadToGitHub(env, 'blog/index.html', indexHtml, `admin: índice blog (publicado ${articulo.titulo})`, false);
    log.push('Índice /blog/index.html actualizado');
  } catch (e) {
    log.push(`AVISO: no se pudo regenerar el índice del blog: ${e.message}`);
  }

  // 5. Append al sitemap.xml
  try {
    const slug = articulo.slug_publicado || slugify(articulo.titulo);
    const blogUrl = `${BASE_URL}/blog/${slug}`;
    const sm = await appendToSitemap(env, blogUrl, articulo.fecha);
    if (sm.alreadyExists) {
      log.push('Sitemap: URL ya presente (skip)');
    } else {
      log.push(`Sitemap: URL agregada (${sm.totalUrls} URLs totales)`);
    }
  } catch (e) {
    log.push(`AVISO: no se pudo actualizar sitemap.xml: ${e.message}`);
  }

  const slug = articulo.slug_publicado || slugify(articulo.titulo);
  return {
    articulo,
    log,
    url: `${BASE_URL}/blog/${slug}`
  };
}

// ============ POST-PROCESAMIENTO DE ENLACES A BLENDS ============

// Toma el contenido HTML del artículo y envuelve cada mención de un blend
// del catálogo con <a href="#" onclick="openDetail(ID);return false">Nombre</a>.
//
// SEGURIDAD:
//  - NO duplica enlaces que ya estén envueltos (respeta los <a> existentes).
//  - Solo envuelve menciones que aparezcan como texto SUELTO (no dentro de tags).
//  - Ordena los productos por longitud DESC para que "Caribe Costeño" se enlace
//    antes que "Caribe" (si existiera), evitando overlapping matches.
//  - NO procesa dentro de <a>...</a>, <code>, <pre>.
function linkBlendMentions(html, products) {
  if (!html || !products || products.length === 0) {
    return { html: html || '', linksInserted: 0, productosEnlazados: [] };
  }

  // Construir lista de [nombre, id] ordenada por longitud DESC
  const candidatos = products
    .filter(p => p && p.nombre && p.id != null)
    .map(p => ({ nombre: p.nombre, id: p.id }))
    .sort((a, b) => b.nombre.length - a.nombre.length);

  if (candidatos.length === 0) {
    return { html, linksInserted: 0, productosEnlazados: [] };
  }

  // Tokenizar el HTML en: texto + tags, para no tocar el interior de los tags
  // ni el contenido entre <a>...</a>, <code>...</code>, <pre>...</pre>.
  const tokens = html.split(/(<[^>]+>)/g);
  const enlacesInsertados = new Set();
  let linksInserted = 0;

  // Estados: dentro de qué tag estamos (para no tocar)
  let inAnchor = false;
  let inCode = false;
  let inPre = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;

    // ¿Es un tag?
    if (tok.startsWith('<')) {
      const lower = tok.toLowerCase();
      // Apertura
      if (/^<a[>\s]/.test(lower)) inAnchor = true;
      else if (/^<code[>\s]/.test(lower)) inCode = true;
      else if (/^<pre[>\s]/.test(lower)) inPre = true;
      // Cierre
      else if (/^<\/a[>\s]/.test(lower)) inAnchor = false;
      else if (/^<\/code[>\s]/.test(lower)) inCode = false;
      else if (/^<\/pre[>\s]/.test(lower)) inPre = false;
      continue;  // no modificar tags
    }

    // ¿Estamos en una zona protegida?
    if (inAnchor || inCode || inPre) continue;

    // Es texto: aplicar regex para cada producto
    let text = tok;
    for (const prod of candidatos) {
      const escapedName = prod.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Buscar el nombre como palabra completa (no dentro de otra palabra)
      // y que NO esté precedido por una comilla doble (para no re-enlazar texto
      // dentro de un href existente, por las dudas).
      const re = new RegExp(
        '(^|[^\\w"\'>])(' + escapedName + ')(?=$|[^\\w"\'<])',
        'g'
      );
      text = text.replace(re, (full, before, name) => {
        // Si el match ya está dentro de un <a> en el texto original, el estado
        // inAnchor ya lo debería haber filtrado. Pero por las dudas, verificamos
        // que el "before" no sea el cierre de un href: no debería ocurrir.
        enlacesInsertados.add(prod.nombre);
        linksInserted++;
        return `${before}<a href="#" onclick="openDetail(${prod.id});return false">${name}</a>`;
      });
    }
    tokens[i] = text;
  }

  return {
    html: tokens.join(''),
    linksInserted,
    productosEnlazados: Array.from(enlacesInsertados)
  };
}

// ============ HTML SEO DE RECETA ============

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function generateRecipeHTML(receta, imageUrl) {
  const slug = receta.slug_publicado;
  const url = `${BASE_URL}/recetas/${slug}`;
  const titulo = escHtml(receta.titulo);
  const descripcion = escHtml(receta.descripcion || '');
  const img = imageUrl || '';

  const ingsHtml = (receta.ingredientes || []).map(i => `<li>${escHtml(i)}</li>`).join('');
  const pasosHtml = (receta.pasos || []).map(p => `<li>${escHtml(p)}</li>`).join('');

  // Schema.org Recipe
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: receta.titulo,
    description: receta.descripcion,
    image: img,
    recipeCategory: receta.categoria,
    recipeIngredient: receta.ingredientes || [],
    recipeInstructions: (receta.pasos || []).map(p => ({ '@type': 'HowToStep', text: p })),
    totalTime: receta.tiempo || '',
    recipeYield: receta.porciones || ''
  };
  const bc = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: BASE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Recetas', item: BASE_URL + '/recetas/' },
      { '@type': 'ListItem', position: 3, name: receta.titulo, item: url }
    ]
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${titulo} — Arcano Especias</title>
<meta name="description" content="${descripcion.substring(0, 155)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descripcion}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="Arcano Especias">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${descripcion}">
<meta name="twitter:image" content="${img}">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<script type="application/ld+json">${JSON.stringify(bc)}</script>
<style>body{margin:0;padding:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}.container{max-width:720px;margin:0 auto;padding:20px 16px}a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}h1{font-size:1.6rem;color:#c9a84c;margin-bottom:8px;line-height:1.3}.meta{color:#a08b6e;font-size:.85rem;margin-bottom:24px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}.meta .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.75rem;font-weight:600;background:#2d5a27;color:#8fce80}.back{display:inline-block;margin-bottom:24px;padding:8px 16px;border:1px solid #c9a84c;border-radius:6px;color:#c9a84c;font-size:.85rem}.back:hover{background:#c9a84c;color:#1b0b07;text-decoration:none}img.hero{width:100%;border-radius:8px;margin-bottom:24px;max-height:400px;object-fit:cover}.content h2{color:#c9a84c;margin-top:32px;margin-bottom:12px;font-size:1.2rem}.content ul,.content ol{margin-bottom:16px;padding-left:24px}.content li{margin-bottom:6px}.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}</style>
</head>
<body>
<div class="container">
<a href="${BASE_URL}/" class="back">&larr; Volver a Arcano Especias</a>
<h1>${titulo}</h1>
<div class="meta">
<span>${escHtml(receta.categoria || '')}</span>
${receta.dificultad ? `<span class="badge">${escHtml(receta.dificultad)}</span>` : ''}
${receta.tiempo ? `<span>${escHtml(receta.tiempo)}</span>` : ''}
${receta.porciones ? `<span>${escHtml(receta.porciones)}</span>` : ''}
</div>
${img ? `<img class="hero" src="${escHtml(img)}" alt="${titulo}" loading="lazy">` : ''}
<div class="content">
<h2>Ingredientes</h2>
<ul>${ingsHtml}</ul>
<h2>Preparacion</h2>
<ol>${pasosHtml}</ol>
</div>
<div class="footer">Arcano Especias &mdash; Especias y Blends artesanales del mundo &middot; <a href="${BASE_URL}/politica-envios/" style="color:#6b5a42">Envíos</a> &middot; <a href="${BASE_URL}/politica-devoluciones/" style="color:#6b5a42">Devoluciones</a></div>
</div>
</body>
</html>`;
}

// ============ ÍNDICE /recetas/index.html ============

// Genera el HTML estático del listado público de recetas.
// Lo llama generateRecipe() cada vez que se crea una nueva receta, así el
// índice público siempre incluye las recetas nuevas (no solo las que estaban
// cuando se generó el sitio estático manualmente).
//
// Categorías EXACTAS con las que filtra la tienda (tienda-ui.js):
//   Comida, Infusiones, Cocteleria
// Pero el encabezado de cada sección usa el plural/acento legible.
function generateRecipesIndexHTML(allRecipes) {
  // Normalizar categorias y deduplicar por slug_publicado.
  const seen = new Set();
  const valid = [];
  for (const r of allRecipes || []) {
    if (!r || !r.titulo) continue;
    const slug = r.slug_publicado || slugify(r.titulo);
    if (seen.has(slug)) continue;
    seen.add(slug);
    let cat = r.categoria;
    if (!RECETA_CATEGORIAS.includes(cat)) cat = RECETA_CATEGORIAS[0];
    valid.push({
      titulo: r.titulo,
      slug,
      descripcion: r.descripcion || '',
      imagen_url: r.imagen_url || '',
      categoria: cat
    });
  }
  // Ordenar alfabéticamente dentro de cada sección.
  valid.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'es', { sensitivity: 'base' }));

  const SECCIONES = [
    { cat: 'Comida',      titulo: 'Comidas' },
    { cat: 'Infusiones',  titulo: 'Infusiones' },
    { cat: 'Cocteleria',  titulo: 'Coctelería' }
  ];

  const seccionesHtml = SECCIONES.map(sec => {
    const items = valid.filter(r => r.categoria === sec.cat);
    if (items.length === 0) return ''; // sección vacía: no renderizar
    const cards = items.map(r => {
      const img = r.imagen_url || (BASE_URL + '/icons/logo.png');
      const desc = escHtml((r.descripcion || '').substring(0, 120));
      const titulo = escHtml(r.titulo);
      return `<a href="${BASE_URL}/recetas/${encodeURIComponent(r.slug)}" class="recipe">
<img src="${escHtml(img)}" alt="${titulo}" loading="lazy">
<div class="body"><h3>${titulo}</h3><p>${desc}</p></div>
</a>`;
    }).join('\n');
    return `<div class="cat-section"><h2>${sec.titulo} (${items.length})</h2><div class="grid">
${cards}
</div></div>`;
  }).filter(s => s.length > 0).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Recetas con Especias y Blends | Arcano Especias</title>
<meta name="description" content="Recetas con especias y blends artesanales de Arcano Especias. Cocina, infusiones y coctelería con sabores del mundo. Aprende a usar cada blend en preparaciones reales.">
<link rel="canonical" href="${BASE_URL}/recetas/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="Recetas con Especias y Blends | Arcano Especias">
<meta property="og:description" content="Cocina, infusiones y coctelería con especias artesanales. Aprende a usar cada blend en preparaciones reales.">
<meta property="og:url" content="${BASE_URL}/recetas/">
<meta property="og:image" content="${BASE_URL}/icons/logo.png">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}
.wrap{max-width:960px;margin:0 auto;padding:24px 20px}
header{text-align:center;padding:32px 0 24px;border-bottom:1px solid #3d2a1c}
header h1{color:#c9a84c;font-size:2.2rem;margin-bottom:8px}
header p{color:#a08b6e;font-size:1rem;max-width:600px;margin:0 auto}
.cat-section{margin-top:32px}
.cat-section h2{color:#c9a84c;font-size:1.4rem;border-bottom:1px solid #3d2a1c;padding-bottom:8px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.recipe{background:#2d1a10;border:1px solid #3d2a1c;border-radius:10px;overflow:hidden;text-decoration:none;color:#f0e6d3;transition:transform .2s,border-color .2s}
.recipe:hover{transform:translateY(-2px);border-color:#c9a84c}
.recipe img{width:100%;aspect-ratio:16/10;object-fit:cover;background:#1b0b07}
.recipe .body{padding:12px 16px}
.recipe h3{font-size:0.95rem;color:#c9a84c;margin-bottom:4px;line-height:1.3}
.recipe p{font-size:0.8rem;color:#a08b6e;line-height:1.4}
.breadcrumbs{font-size:0.85rem;color:#a08b6e;margin-bottom:16px}
.breadcrumbs a{color:#c9a84c;text-decoration:none}
.footer{margin-top:48px;padding-top:24px;border-top:1px solid #3d2a1c;text-align:center;color:#6b5a42;font-size:0.85rem}
.footer a{color:#c9a84c}
@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
<div class="breadcrumbs"><a href="${BASE_URL}/">Inicio</a> › Recetas</div>
<header>
<h1>Recetas con Especias</h1>
<p>Cocina, infusiones y coctelería con especias y blends artesanales de Arcano Especias. Aprende a usar cada blend en preparaciones reales.</p>
</header>
${seccionesHtml}
<div class="footer">
<p><a href="${BASE_URL}/">← Volver a Arcano Especias</a></p>
<p style="margin-top:8px">Arcano Especias — Especias y Blends artesanales del mundo · Envíos a toda Colombia · <a href="${BASE_URL}/politica-envios/" style="color:#6b5a42">Envíos</a> · <a href="${BASE_URL}/politica-devoluciones/" style="color:#6b5a42">Devoluciones</a></p>
</div>
</div>
</body>
</html>`;
}

// ============ HTML SEO DE BLOG (artículo individual) ============

function generateBlogHTML(articulo, imageUrl, especiaPrincipal) {
  const slug = articulo.slug_publicado;
  const url = `${BASE_URL}/blog/${slug}`;
  const titulo = escHtml(articulo.titulo);
  const descripcion = escHtml(articulo.descripcion_meta || articulo.subtitulo || '');
  const img = imageUrl || '';
  const categoria = articulo.categoria || 'Historia';
  const t = getBlogTemplate(categoria);

  // Schema.org Article
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: articulo.titulo,
    description: articulo.descripcion_meta || articulo.subtitulo || '',
    image: img,
    datePublished: articulo.fecha,
    dateModified: articulo.fecha,
    author: { '@type': 'Organization', name: 'Arcano Especias', url: BASE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'Arcano Especias',
      logo: { '@type': 'ImageObject', url: BASE_URL + '/icons/arcano-logo.webp' }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: categoria,
    keywords: (articulo.keywords || []).join(', ')
  };
  const bc = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: BASE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: BASE_URL + '/blog/' },
      { '@type': 'ListItem', position: 3, name: articulo.titulo, item: url }
    ]
  };

  // FAQ Schema JSON-LD — solo si hay FAQs (Google los usa para rich snippets)
  const faqs = Array.isArray(articulo.faqs) ? articulo.faqs.filter(f => f && f.q && f.a) : [];
  const faqSchema = faqs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  } : null;

  // El contenido viene como HTML desde Gemini + los enlaces a blends que
  // insertamos con linkBlendMentions(). Sanitizamos agresivamente:
  //  - Quitar <script>, <style>, <iframe>, etc. (no deberían venir).
  //  - Quitar tags no semánticos que Gemini podría meter: <div>, <span>,
  //    <section>, <article>, <header>, <footer> — preservando su contenido.
  //  - Quitar atributos on* que no sean nuestros openDetail.
  //  - Quitar atributos class="", id="", style="".
  //  - Conservar nuestros <a onclick="openDetail(ID);return false">.
  // El CSS de la categoría se inyecta aparte (generateBlogCSS), Gemini no
  // tiene control sobre el diseño visual.
  const contenidoFinal = String(articulo.contenido || '')
    // 1. Quitar scripts/styles/objects por completo
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    // 2. Unwrap tags no semánticos (preservar el contenido, quitar el tag)
    .replace(/<\/?(?:div|span|section|article|header|footer|main|aside|figure|figcaption)[^>]*>/gi, '')
    // 3. Quitar atributos class="", id="", style="" de cualquier tag
    .replace(/\s(?:class|id|style)\s*=\s*"[^"]*"/gi, '')
    // 4. Quitar atributos on* (excepto nuestros openDetail)
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, (m) => {
      return /onclick\s*=\s*".*openDetail/.test(m) ? m : '';
    });

  const keywordsStr = (articulo.keywords || []).join(', ');
  const catClass = catToClass(categoria);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${titulo} — Arcano Especias</title>
<meta name="description" content="${descripcion.substring(0, 155)}">
<link rel="canonical" href="${url}">
<meta name="keywords" content="${escHtml(keywordsStr)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="${t.accent}">
<meta property="og:type" content="article">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descripcion}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="Arcano Especias">
<meta property="article:published_time" content="${articulo.fecha}">
<meta property="article:section" content="${escHtml(categoria)}">
<meta property="article:tag" content="${escHtml(keywordsStr)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${descripcion}">
<meta name="twitter:image" content="${img}">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<script type="application/ld+json">${JSON.stringify(bc)}</script>
${faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : ''}
<!-- Fuentes Google -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Merriweather:wght@400;700&family=Poppins:wght@600;700&family=Inter:wght@400;500&family=IBM+Plex+Sans:wght@500;600&family=IBM+Plex+Serif:wght@400;600&family=Mulish:wght@600;700&family=Lora:wght@400;700&family=Source+Serif+Pro:wght@400;700&display=swap" rel="stylesheet">
<style>
${generateBlogCSS(t)}
.faq-section{margin-top:48px;padding-top:32px;border-top:2px solid ${t.bgAccent}}
.faq-section h2{font-family:${t.headingFont};color:${t.textPrimary};font-size:1.6rem;margin-bottom:20px;font-weight:700}
.faq-item{margin-bottom:18px;padding:16px 20px;background:${t.bgAccent};border-radius:8px;border-left:3px solid ${t.accent}}
.faq-item h3{font-family:${t.headingFont};color:${t.textPrimary};font-size:1.05rem;margin:0 0 8px;font-weight:600}
.faq-item p{margin:0;color:${t.textPrimary};font-size:.95rem;line-height:1.6}
</style>
</head>
<body class="blog-cat-${catClass}">
<div class="container">
<a href="${BASE_URL}/blog/" class="back">&larr; Volver al Blog</a>
<div class="header-meta">${escHtml(categoria)}${especiaPrincipal ? ' · ' + escHtml(especiaPrincipal) : ''}</div>
<h1>${titulo}</h1>
${articulo.subtitulo ? `<div class="subtitulo">${escHtml(articulo.subtitulo)}</div>` : ''}
<div class="meta">
${articulo.fecha ? `<span>${escHtml(articulo.fecha)}</span>` : ''}
${articulo.tiempoLectura ? `<span>${escHtml(articulo.tiempoLectura)}</span>` : ''}
<span class="badge">${escHtml(categoria)}</span>
</div>
${img ? `<img class="hero" src="${escHtml(img)}" alt="${titulo}" loading="lazy">` : ''}
<div class="content">
${contenidoFinal}
</div>
${faqs.length > 0 ? `<section class="faq-section">
<h2>Preguntas frecuentes</h2>
${faqs.map(f => `<div class="faq-item">
<h3>${escHtml(f.q)}</h3>
<p>${escHtml(f.a)}</p>
</div>`).join('')}
</section>` : ''}
${keywordsStr ? `<div class="keywords-row"><strong>Keywords:</strong> ${escHtml(keywordsStr)}</div>` : ''}
<div class="footer">
<p><a href="${BASE_URL}/blog/">← Volver al Blog</a> · <a href="${BASE_URL}/">Ir a la tienda</a></p>
<p style="margin-top:8px">Arcano Especias — Especias y Blends artesanales del mundo · <a href="${BASE_URL}/politica-envios/">Envíos</a> · <a href="${BASE_URL}/politica-devoluciones/">Devoluciones</a></p>
</div>
</div>
</body>
</html>`;
}

// ============ ÍNDICE /blog/index.html ============

// Genera el HTML estático del listado público del blog.
// Solo muestra posts publicados (publicado !== false o sin el campo = legacy).
function generateBlogIndexHTML(allPosts) {
  // Filtrar publicados + deduplicar por slug
  const seen = new Set();
  const valid = [];
  for (const p of allPosts || []) {
    if (!p || !p.titulo) continue;
    // Filtro: pausado o no publicado (a menos que sea legacy sin el campo)
    if (p.pausado === true) continue;
    if (p.publicado === false) continue;
    const slug = p.slug_publicado || slugify(p.titulo);
    if (seen.has(slug)) continue;
    seen.add(slug);
    valid.push({
      titulo: p.titulo,
      slug,
      subtitulo: p.subtitulo || p.descripcion_meta || '',
      descripcion_meta: p.descripcion_meta || p.subtitulo || '',
      imagen_url: p.imagen_url || '',
      categoria: p.categoria || 'Blog',
      fecha: p.fecha || ''
    });
  }
  // Ordenar por fecha DESC (más nuevos primero)
  valid.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const cards = valid.map(p => {
    const img = p.imagen_url || (BASE_URL + '/icons/logo.png');
    const desc = escHtml((p.descripcion_meta || p.subtitulo || '').substring(0, 140));
    const titulo = escHtml(p.titulo);
    const cat = escHtml(p.categoria);
    const catCls = catToClass(p.categoria);
    return `<a href="${BASE_URL}/blog/${encodeURIComponent(p.slug)}" class="post cat-${catCls}">
<img src="${escHtml(img)}" alt="${titulo}" loading="lazy">
<div class="body"><div class="cat-badge">${cat}</div><h2>${titulo}</h2><p>${desc}</p></div>
</a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Blog de Especias y Blends | Arcano Especias</title>
<meta name="description" content="Blog de Arcano Especias: historias, beneficios, curiosidades y orígenes de las especias del mundo. Guías para cocinar, infusiones y coctelería con especias artesanales.">
<link rel="canonical" href="${BASE_URL}/blog/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="Blog de Especias y Blends | Arcano Especias">
<meta property="og:description" content="Historias, beneficios, curiosidades y orígenes de las especias del mundo. Guías para cocinar con especias artesanales.">
<meta property="og:url" content="${BASE_URL}/blog/">
<meta property="og:image" content="${BASE_URL}/icons/logo.png">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,"Times New Roman",serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}
.wrap{max-width:960px;margin:0 auto;padding:24px 20px}
header{text-align:center;padding:32px 0 24px;border-bottom:1px solid #3d2a1c}
header h1{color:#c9a84c;font-size:2.2rem;margin-bottom:8px}
header p{color:#a08b6e;font-size:1rem;max-width:600px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-top:32px}
.post{background:#2d1a10;border:1px solid #3d2a1c;border-radius:12px;overflow:hidden;text-decoration:none;color:#f0e6d3;transition:transform .2s,border-color .2s;border-top:4px solid #3d2a1c}
.post:hover{transform:translateY(-3px);border-color:#c9a84c}
.post img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#1b0b07}
.post .body{padding:16px 20px}
.post .cat-badge{display:inline-block;background:#2d5a27;color:#8fce80;padding:2px 10px;border-radius:10px;font-size:.7rem;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.post h2{font-size:1.05rem;color:#c9a84c;margin-bottom:8px;line-height:1.3}
.post p{font-size:.85rem;color:#a08b6e;line-height:1.5}
.breadcrumbs{font-size:0.85rem;color:#a08b6e;margin-bottom:16px}
.breadcrumbs a{color:#c9a84c;text-decoration:none}
.breadcrumbs a:hover{text-decoration:underline}
.footer{margin-top:48px;padding-top:24px;border-top:1px solid #3d2a1c;text-align:center;color:#6b5a42;font-size:0.85rem}
.footer a{color:#c9a84c}
@media(max-width:600px){.grid{grid-template-columns:1fr}}
/* Colores por categoría */
${generateBlogIndexCategoryColors()}
</style>
</head>
<body>
<div class="wrap">
<div class="breadcrumbs"><a href="${BASE_URL}/">Inicio</a> › Blog</div>
<header>
<h1>Blog de Especias</h1>
<p>Historias, beneficios, curiosidades y orígenes de las especias del mundo. Guías para cocinar, infusiones y coctelería con especias artesanales.</p>
</header>
<div class="grid">
${cards}
</div>
<div class="footer">
<p><a href="${BASE_URL}/">← Volver a Arcano Especias</a></p>
<p style="margin-top:8px">Arcano Especias — Especias y Blends artesanales del mundo · Envíos a toda Colombia · <a href="${BASE_URL}/politica-envios/" style="color:#6b5a42">Envíos</a> · <a href="${BASE_URL}/politica-devoluciones/" style="color:#6b5a42">Devoluciones</a></p>
</div>
</div>
</body>
</html>`;
}

// ============ SITEMAP APPEND ============

// Agrega una URL nueva a sitemap.xml sin regenerar todo el archivo.
// SEGURIDAD:
//  - Lee el sitemap actual de GitHub.
//  - Si la URL ya existe → no hace nada (idempotente).
//  - Si no existe → la inserta ANTES del </urlset>.
//  - Valida que el XML resultante tenga exactamente un </urlset> al final
//    y que el número de <url> haya crecido en 1 (no rompió nada).
//  - Si cualquier validación falla → NO sube nada y devuelve error.
//
// Formato de cada entrada (igual al que ya usa el sitemap actual):
//   <url><loc>https://arcanoespecias.com/recetas/slug</loc><lastmod>YYYY-MM-DD</lastmod></url>
async function appendToSitemap(env, locUrl, lastmod) {
  const sitemapPath = 'sitemap.xml';
  const today = lastmod || new Date().toISOString().substring(0, 10);

  // 1. Leer sitemap actual
  const existing = await downloadFromGitHub(env, sitemapPath);
  if (!existing || !existing.content) {
    throw new Error('sitemap.xml no encontrado en el repo');
  }
  let xml = existing.content;
  const sha = existing.sha;

  // 2. Idempotente: si la URL ya está, no hacer nada
  const escapedUrl = locUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urlAlreadyExists = new RegExp(
    '<url>\\s*<loc>' + escapedUrl + '(?:</loc>|/</loc>)'
  ).test(xml);
  if (urlAlreadyExists) {
    return { alreadyExists: true };
  }

  // 3. Validar que el XML actual tiene estructura esperada
  //    (un solo </urlset> al final)
  const closeCount = (xml.match(/<\/urlset>/g) || []).length;
  if (closeCount !== 1) {
    throw new Error(`sitemap.xml inválido: ${closeCount} etiquetas </urlset> (esperaba 1)`);
  }
  const openCount = (xml.match(/<urlset[^>]*>/g) || []).length;
  if (openCount !== 1) {
    throw new Error(`sitemap.xml inválido: ${openCount} etiquetas <urlset> (esperaba 1)`);
  }
  const urlCountBefore = (xml.match(/<url>/g) || []).length;

  // 4. Insertar la nueva entrada justo antes de </urlset>
  //    Buscamos el último </url> antes de </urlset> para insertar después.
  const newEntry = `<url><loc>${escXml(locUrl)}</loc><lastmod>${today}</lastmod></url>`;
  const closeIdx = xml.lastIndexOf('</urlset>');
  if (closeIdx < 0) throw new Error('No se encontró </urlset> en sitemap.xml');

  // Insertar con salto de línea antes de </urlset>
  let newXml = xml.substring(0, closeIdx);
  // Asegurar que termina con salto de línea
  if (!newXml.endsWith('\n')) newXml += '\n';
  newXml += newEntry + '\n';
  newXml += xml.substring(closeIdx);

  // 5. Validar el resultado
  const urlCountAfter = (newXml.match(/<url>/g) || []).length;
  if (urlCountAfter !== urlCountBefore + 1) {
    throw new Error(`Validación falló: esperaba ${urlCountBefore + 1} <url>, hay ${urlCountAfter}`);
  }
  const newCloseCount = (newXml.match(/<\/urlset>/g) || []).length;
  if (newCloseCount !== 1) {
    throw new Error(`sitemap.xml resultante inválido: ${newCloseCount} </urlset>`);
  }

  // 6. Subir (con sha para que GitHub lo trate como update del archivo)
  //    uploadToGitHub se encarga de obtener el sha también, pero ya lo tenemos,
  //    así que lo pasamos para ahorrar una llamada. Para eso reusamos uploadToGitHub
  //    que ya valida el sha internamente.
  await uploadToGitHub(env, sitemapPath, newXml, `automation: sitemap +${locUrl}`, false);

  return { alreadyExists: false, added: true, totalUrls: urlCountAfter };
}

function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

// ============ EMAILS ============

async function sendRecipeEmail(env, receta) {
  const url = `${BASE_URL}/recetas/${receta.slug_publicado}`;
  const subject = `Nueva receta publicada: ${receta.titulo}`;
  const htmlContent = `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#1b0b07;color:#f0e6d3;padding:24px">
  <div style="text-align:center;margin-bottom:24px">
    <img src="${BASE_URL}/icons/arcano-logo.webp" alt="Arcano Especias" style="max-width:120px">
  </div>
  <h1 style="color:#c9a84c;font-size:1.5rem;margin:0 0 16px">Nueva receta publicada automáticamente</h1>
  <p style="font-size:1.1rem;margin:0 0 8px"><strong>${escHtml(receta.titulo)}</strong></p>
  <p style="color:#a08b6e;margin:0 0 16px">${escHtml(receta.categoria)} · ${escHtml(receta.dificultad || '')} · ${escHtml(receta.tiempo || '')}</p>
  ${receta.imagen_url ? `<img src="${escHtml(receta.imagen_url)}" alt="${escHtml(receta.titulo)}" style="width:100%;border-radius:8px;margin:16px 0">` : ''}
  <p style="margin:0 0 24px">${escHtml(receta.descripcion || '')}</p>
  <a href="${url}" style="display:inline-block;background:#c9a84c;color:#1b0b07;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ver receta completa</a>
  <hr style="border:none;border-top:1px solid #2d1a10;margin:32px 0">
  <p style="font-size:0.8rem;color:#6b5a42">Esta receta fue generada automáticamente por el sistema de automatización de Arcano Especias.<br>URL: <a href="${url}" style="color:#6b5a42">${url}</a></p>
</div>`;

  await sendRawEmail(env, ADMIN_EMAIL, subject, htmlContent);
}

async function sendBlogDraftEmail(env, articulo) {
  const adminUrl = `${BASE_URL}/admin/#blog`;
  const subject = `Borrador de blog pendiente de aprobación: ${articulo.titulo}`;
  const htmlContent = `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#1b0b07;color:#f0e6d3;padding:24px">
  <div style="text-align:center;margin-bottom:24px">
    <img src="${BASE_URL}/icons/arcano-logo.webp" alt="Arcano Especias" style="max-width:120px">
  </div>
  <h1 style="color:#c9a84c;font-size:1.5rem;margin:0 0 16px">Nuevo artículo de blog (pendiente de aprobación)</h1>
  <p style="font-size:1.1rem;margin:0 0 8px"><strong>${escHtml(articulo.titulo)}</strong></p>
  <p style="color:#a08b6e;margin:0 0 16px">
    ${escHtml(articulo.categoria || 'Blog')} ·
    ${articulo.especia_principal ? 'Especia: ' + escHtml(articulo.especia_principal) + ' · ' : ''}
    ${escHtml(articulo.tiempoLectura || '')}
  </p>
  <p style="margin:0 0 16px">${escHtml(articulo.descripcion_meta || articulo.subtitulo || '')}</p>
  ${articulo.imagen_url ? `<img src="${escHtml(articulo.imagen_url)}" alt="${escHtml(articulo.titulo)}" style="width:100%;border-radius:8px;margin:16px 0">` : ''}
  <div style="background:#2d1a10;padding:16px;border-radius:8px;margin:16px 0">
    <p style="margin:0 0 12px;color:#a08b6e;font-size:0.85rem">Keywords: ${escHtml((articulo.keywords || []).join(', '))}</p>
    <p style="margin:0;color:#a08b6e;font-size:0.85rem">Estado: <strong style="color:#c9a84c">BORRADOR</strong> — pendiente de aprobación</p>
  </div>
  <p style="margin:0 0 24px">El artículo está listo para revisar. Entrá al admin, editalo si querés y después pulsá <strong>"Aprobar y publicar"</strong>. Recién ahí se sube el HTML público, se actualiza el índice /blog/ y se agrega al sitemap.</p>
  <a href="${adminUrl}" style="display:inline-block;background:#c9a84c;color:#1b0b07;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ir al admin para aprobar</a>
  <hr style="border:none;border-top:1px solid #2d1a10;margin:32px 0">
  <p style="font-size:0.8rem;color:#6b5a42">Este artículo fue generado automáticamente por el sistema de automatización de Arcano Especias.</p>
</div>`;

  await sendRawEmail(env, ADMIN_EMAIL, subject, htmlContent);
}

async function sendRawEmail(env, toEmail, subject, htmlContent) {
  if (!env?.BREVO_API_KEY) {
    console.warn('[automation] BREVO_API_KEY no configurada, no se envía email');
    return { sent: false, reason: 'BREVO_API_KEY missing' };
  }
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: 'hola@arcanoespecias.com', name: 'Arcano Especias' },
      to: [{ email: toEmail }],
      subject: subject,
      htmlContent: htmlContent
    })
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error('[automation] Brevo error:', resp.status, err);
    return { sent: false, reason: `Brevo ${resp.status}: ${err.substring(0, 200)}` };
  }
  return { sent: true };
}

export {
  generateRecipe,
  generateBlog,
  publishBlogPost,
  getAutomationState,
  updateAutomationState,
  loadCatalog,
  loadExistingRecipes,
  loadExistingBlog,
  nextRecipeCategory,
  nextBlogTema,
  generateRecipeHTML,
  generateRecipesIndexHTML,
  generateBlogHTML,
  generateBlogIndexHTML,
  generateBlogCSS,
  generateBlogCSSCompact,
  generateBlogIndexCategoryColors,
  getBlogTemplate,
  getBlogImageBrief,
  catToClass,
  linkBlendMentions,
  appendToSitemap,
  defaultState,
  slugify,
  RECETA_CATEGORIAS,
  BLOG_CATEGORIAS,
  BLOG_ESPECIAS,
  BLOG_TEMPLATES,
  BLOG_IMAGE_BRIEF
};
