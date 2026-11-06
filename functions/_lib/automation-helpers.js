// functions/_lib/automation-helpers.js
// Helpers para la automatización de recetas y blog con IA.
// Lee todo de Firebase (catálogo, recetas/blog existentes, estado de rotación).
// Genera con Gemini (fallback Z.ai si 429).
// Genera imagen con /api/generar-imagen (Cloudflare Workers AI).
// Sube a GitHub con env.GITHUB_TOKEN.
// Envía email con Brevo.

import { fbAdminGet, fbAdminPost, hasServiceAccount } from './firebase-admin.js';
import { uploadToGitHub, uploadImage } from './github.js';

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

async function getAutomationState(env) {
  const state = await fbAdminGet(env, '/arcano/db/automation');
  return state || {
    recetas: { ultimaCategoria: null, ultimaFecha: null, contadorSemana: 0 },
    blog: { ultimaCategoria: null, ultimaFecha: null }
  };
}

async function updateAutomationState(env, newState) {
  await fbAdminPost(env, '/arcano/db/automation', newState);
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

  // 3b. Rotación de productos: elegir un producto destacado que no se haya usado recientemente
  const recentProducts = new Set();
  existing.slice(-10).forEach(r => {
    (r.productos_usados || []).forEach(p => recentProducts.add(p));
  });
  log.push(`Productos usados en últimas 10 recetas: ${Array.from(recentProducts).join(', ') || 'ninguno'}`);

  const availableProducts = catProducts.filter(p => !recentProducts.has(p.nombre));
  const pool = availableProducts.length > 0 ? availableProducts : catProducts;
  const chosenProduct = pool[Math.floor(Math.random() * pool.length)];
  const highlightProduct = chosenProduct ? chosenProduct.nombre : '';
  if (chosenProduct) {
    log.push(`Producto destacado para esta receta: ${highlightProduct} (${chosenProduct.tipo})`);
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
  receta.categoria = receta.categoria || categoria;

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

  // 12. Actualizar estado
  state.recetas = {
    ultimaCategoria: categoria,
    ultimaFecha: receta.fecha,
    contadorSemana: (state.recetas.contadorSemana || 0) + 1
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
  RECETA_CATEGORIAS,
  BLOG_TEMAS
};
