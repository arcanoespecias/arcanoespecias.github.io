// functions/_lib/automation-helpers.js
// Helpers para la automatización de recetas y blog con IA.
// Lee todo de Firebase (catálogo, recetas/blog existentes, estado de rotación).
// Genera con Gemini (fallback Z.ai si 429).
// Genera imagen con /api/generar-imagen (Cloudflare Workers AI).
// Sube a GitHub con env.GITHUB_TOKEN.
// Envía email con Brevo.

import { fbAdminGet, fbAdminPost, fbAdminPut, hasServiceAccount } from './firebase-admin.js';
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

async function callGemini(env, prompt, maxTokens) {
  const apiKey = await getGeminiKey(env);
  if (!apiKey) throw new Error('No hay API key de Gemini. Configura GEMINI_API_KEY en env o guárdala en Firebase.');

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + apiKey;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: maxTokens || 4000 }
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Gemini ${resp.status}: ${err?.error?.message || 'error desconocido'}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini no devolvió texto');
  return text;
}

function extractJSON(text) {
  let s = text;
  const js = s.indexOf('{');
  const je = s.lastIndexOf('}');
  if (js !== -1 && je > js) s = s.substring(js, je + 1);
  try { return JSON.parse(s); }
  catch (e) {
    try { return JSON.parse(s.replace(/'/g, '"')); }
    catch (e2) { throw new Error('JSON inválido: ' + s.slice(0, 150)); }
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
      ultimaFecha: null
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
      base.blog = { ...base.blog, ...state.blog };
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

// Rotación de temas para blog (historia/curiosidades de especias)
const BLOG_TEMAS = [
  { tema: 'historia de una especia específica', especia: 'pimienta negra' },
  { tema: 'origen y ruta comercial histórica', especia: 'canela' },
  { tema: 'curiosidades y alquimia molecular', especia: 'cúrcuma' },
  { tema: 'ciencia oculta y beneficios', especia: 'jengibre' },
  { tema: 'historia y conquista del mundo', especia: 'ají/capsaicina' },
  { tema: 'epica odisea y monasterios', especia: 'pimentón' },
  { tema: 'brevaje sagrado y origen oscuro', especia: 'cacao' },
  { tema: 'acertijo molecular y aroma', especia: 'comino' },
  { tema: 'oro negro y fascinante historia', especia: 'pimienta' },
  { tema: 'fuego ilusorio y paladar humano', especia: 'ají' }
];

function nextBlogTema(state) {
  const ult = state?.blog?.ultimaCategoria;
  if (!ult) return BLOG_TEMAS[0];
  const idx = BLOG_TEMAS.findIndex(t => t.especia === ult);
  if (idx < 0) return BLOG_TEMAS[0];
  return BLOG_TEMAS[(idx + 1) % BLOG_TEMAS.length];
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
  const text = await callGemini(env, prompt, 4000);
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

// ============ GENERAR BLOG (borrador + email) ============

async function generateBlog(env, opts) {
  const dryRun = opts?.dryRun;
  const log = [];

  // 1. Estado + tema
  const state = await getAutomationState(env);
  const tema = nextBlogTema(state);
  log.push(`Tema rotación: ${tema.tema} — ${tema.especia} (anterior: ${state.blog.ultimaCategoria || 'ninguno'})`);

  // 2. Catálogo (para enlazar blends)
  const products = await loadCatalog(env);
  const productContext = products.slice(0, 30).map(p => `- [ID:${p.id}] ${p.nombre} - ${p.uso || ''}`).join('\n');

  // 3. Blog existente
  const existing = await loadExistingBlog(env);
  const existingTitles = existing.slice(-15).map(p => p.titulo).join(', ');
  log.push(`Blog existente: ${existing.length} posts`);

  // 4. Prompt (historia/curiosidades de especias)
  const prompt = 'Eres un redactor creativo experto en especias y blends de la marca Arcano Especias (tienda colombiana online).\n' +
    'Escribes en ESPAÑOL NEUTRO INTERNACIONAL (no voseo, no "vos"). Usas "tú" y "tienes".\n' +
    'Tono: narrativo, cercano, didáctico.\n\n' +
    'BLENDS DISPONIBLES EN TIENDA (usa SOLO estos nombres exactos para enlazar):\n' + productContext + '\n\n' +
    '=== INSTRUCCION DE KEYWORDS ===\n' +
    '1. Identifica 5-8 keywords del mercado de especias online en Colombia.\n' +
    '2. Integra las keywords de forma SUTIL y NATURAL en el contenido.\n' +
    '3. NUNCA repitas una keyword más de 2 veces.\n\n' +
    '=== ESTRUCTURA OBLIGATORIA ===\n' +
    'El contenido HTML debe tener: <p> introductorio, 3-4 <h2> subtítulos, párrafos de 3-4 oraciones, ' +
    'un <blockquote> con frase destacada, y cierre con "Para llevar a tu cocina".\n' +
    'TOTAL: entre 1200 y 1800 palabras.\n\n' +
    '=== REGLAS DE ESTILO ===\n' +
    '1. ESPAÑOL NEUTRO. Sin voseo, sin argentismos.\n' +
    '2. Título ≤ 60 caracteres.\n' +
    '3. Descripción meta ≤ 155 caracteres.\n' +
    '4. Cada vez que menciones un blend, envuélvelo: <a href="#" onclick="openDetail(ID);return false">Nombre Exacto</a>\n' +
    '5. Sin emojis.\n' +
    '6. Contenido original, no repetir existentes.\n\n' +
    'ARTICULOS YA EXISTENTES (NO repetir): ' + existingTitles + '\n\n' +
    `Tema: ${tema.tema} sobre ${tema.especia}. Enfócate en historia, curiosidades, origen, ruta comercial, anécdotas históricas. NO es una receta.\n\n` +
    'Responde SOLO con JSON valido:\n' +
    '{"titulo": "...", "subtitulo": "... (100-160 chars)", "categoria": "Historia", ' +
    '"descripcion_meta": "... (150-155 chars SEO)", "keywords": ["k1","k2"], ' +
    '"tiempoLectura": "X min", "contenido": "<p>...</p><h2>...</h2>...", ' +
    '"imagen_prompt": "visual description in english for AI image generation, 1 sentence"}';

  // 5. Llamar Gemini
  log.push('Llamando a Gemini...');
  const text = await callGemini(env, prompt, 8000);
  const articulo = extractJSON(text);
  log.push(`Artículo generado: "${articulo.titulo}"`);

  // 6. Validar
  if (!articulo.titulo || !articulo.contenido) {
    throw new Error('Artículo inválido: ' + JSON.stringify(articulo).slice(0, 200));
  }
  articulo.slug_publicado = slugify(articulo.titulo);
  articulo.fecha = new Date().toISOString().substring(0, 10);
  articulo.publicado = false;  // BORRADOR — el admin carga imagen y publica
  articulo.programado = false;
  articulo.categoria = articulo.categoria || 'Historia';

  // Calcular tiempoLectura si no vino
  if (!articulo.tiempoLectura) {
    const palabras = articulo.contenido.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => w.length).length;
    articulo.tiempoLectura = Math.max(1, Math.round(palabras / 200)) + ' min';
  }

  // 7. Dry-run: parar
  if (dryRun) {
    return { articulo, log, dryRun: true };
  }

  // 8. Guardar en Firebase como borrador
  log.push('Guardando artículo como borrador en Firebase...');
  await fbAdminPost(env, '/arcano/db/blog', articulo);
  log.push('Artículo guardado (publicado=false)');

  // 9. Actualizar estado
  state.blog = {
    ultimaCategoria: tema.especia,
    ultimaFecha: articulo.fecha
  };
  await updateAutomationState(env, state);

  // 10. Email al admin (avisar que hay borrador para revisar)
  log.push('Enviando email al admin...');
  await sendBlogDraftEmail(env, articulo);
  log.push('Email enviado');

  return {
    articulo,
    log,
    adminUrl: `${BASE_URL}/admin/#blog`,
    previewUrl: `${BASE_URL}/admin/`  // el admin entra y edita
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
  const adminUrl = `${BASE_URL}/admin/`;
  const subject = `Borrador de blog listo para revisar: ${articulo.titulo}`;
  const htmlContent = `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;background:#1b0b07;color:#f0e6d3;padding:24px">
  <div style="text-align:center;margin-bottom:24px">
    <img src="${BASE_URL}/icons/arcano-logo.webp" alt="Arcano Especias" style="max-width:120px">
  </div>
  <h1 style="color:#c9a84c;font-size:1.5rem;margin:0 0 16px">Nuevo artículo de blog (borrador)</h1>
  <p style="font-size:1.1rem;margin:0 0 8px"><strong>${escHtml(articulo.titulo)}</strong></p>
  <p style="color:#a08b6e;margin:0 0 16px">${escHtml(articulo.categoria || 'Historia')} · ${escHtml(articulo.tiempoLectura || '')}</p>
  <p style="margin:0 0 16px">${escHtml(articulo.subtitulo || articulo.descripcion_meta || '')}</p>
  <div style="background:#2d1a10;padding:16px;border-radius:8px;margin:16px 0">
    <p style="margin:0 0 12px;color:#a08b6e;font-size:0.85rem">Keywords: ${escHtml((articulo.keywords || []).join(', '))}</p>
    <p style="margin:0;color:#a08b6e;font-size:0.85rem">Descripción meta: ${escHtml(articulo.descripcion_meta || '')}</p>
  </div>
  <p style="margin:0 0 24px">El artículo está guardado como <strong>borrador</strong> en el admin. Necesita que cargues la imagen y lo publiques.</p>
  <a href="${adminUrl}" style="display:inline-block;background:#c9a84c;color:#1b0b07;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Ir al admin para editar</a>
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
  getAutomationState,
  updateAutomationState,
  loadCatalog,
  loadExistingRecipes,
  loadExistingBlog,
  nextRecipeCategory,
  nextBlogTema,
  generateRecipeHTML,
  generateRecipesIndexHTML,
  appendToSitemap,
  defaultState,
  RECETA_CATEGORIAS,
  BLOG_TEMAS
};
