#!/usr/bin/env node
/**
 * Arcano Especias — Fix Firebase SEO (blog + recetas)
 * ====================================================
 *
 * Corrige voseo y enlaces rotos en los datos de Firebase:
 *   - Blog posts (arcano/db/blog/*)
 *   - Recetas (arcano/db/recetas/*)
 *
 * Cambios que aplica:
 *   1. Voseo → tuteo en: contenido, descripcion_meta, titulo, subtitulo,
 *      keywords, faqs (q y a).
 *      Patrones: podés, querés, tenés, sabés, encontrás, aplicás, recibís,
 *      entrá, elegí, consultá, agregá, dejá, usá, escribí, contactanos,
 *      mirá, probá, descubrí, armá, sumá, "vos".
 *   2. Elimina enlaces a /blends/bavarian-roast/ (producto inexistente)
 *      dejando solo el texto del enlace.
 *   3. Muestra antes/después de cada cambio.
 *
 * RESPALDO: Antes de modificar, descarga todo el nodo blog/ y recetas/
 * a scripts/seo/backup_blog_recetas_<timestamp>.json.
 *
 * USO:
 *   # Opción 1: con token de Firebase (recomendado para producción)
 *   FIREBASE_TOKEN=xxxx node scripts/seo/fix_firebase_seo.mjs
 *
 *   # Opción 2: dry-run (solo muestra cambios, no escribe)
 *   DRY_RUN=1 node scripts/seo/fix_firebase_seo.mjs
 *
 *   # Opción 3: con service account JSON
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/seo/fix_firebase_seo.mjs
 *
 * NOTA: Este script NO regenera las páginas HTML estáticas.
 * El owner debe regenerar blog y recetas desde el admin después de correr esto.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const FIREBASE_DB_URL = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';
const BACKUP_DIR = path.join(__dirname, 'backups');

// Reemplazos de voseo → tuteo
// IMPORTANTE: solo convertir formas voseantes reales, preservando mayúsculas.
// NO usar flag 'i' para los imperativos con tilde (á, é, í) → ya son voseo.
// Las formas SIN tilde (agrega, deja, usa) son tuteo válido y NO se tocan.
// Caso especial: "podes", "queres", "tenes" (sin tilde) son voseo escrito sin tilde
// y se convierten; "puedes", "quieres", "tienes" no matchean.

// FIX: JavaScript \b no reconoce vocales acentuadas como word chars.
// "agregándola" contiene "agregá" entre \b boundaries falsos.
// Usamos lookbehind/lookahead con \p{L} (Unicode letter) + flag 'u'.
const LW = '(?<![\\p{L}])';  // left word boundary (Unicode-aware)
const RW = '(?!\\p{L})';     // right word boundary (Unicode-aware)

function preserveCase(replacement, original) {
  // Si la palabra original empieza con mayúscula, capitalizar el reemplazo.
  if (original && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Helper: compila un patrón con word boundaries Unicode-aware + flags 'gu' (global + case-insensitive)
// El flag 'i' hace que "Guardá" matchee "guardá", pero NO hace que "á" matchee "a"
// (son caracteres Unicode distintos). Así "guarda" (tuteo) NO se ve afectado.
function wp(word) {
  return new RegExp(LW + word + RW, 'giu');
}

const VOSEO_REPLACEMENTS = [
  // Imperativos voseantes (CON TILDE, obligatoria): agregá, dejá, usá, etc.
  [wp('descubrí'), function(m) { return preserveCase('descubre', m); }],
  [wp('agregá'), function(m) { return preserveCase('agrega', m); }],
  [wp('dejá'), function(m) { return preserveCase('deja', m); }],
  [wp('usá'), function(m) { return preserveCase('usa', m); }],
  [wp('mirá'), function(m) { return preserveCase('mira', m); }],
  [wp('probá'), function(m) { return preserveCase('prueba', m); }],
  [wp('armá'), function(m) { return preserveCase('arma', m); }],
  [wp('sumá'), function(m) { return preserveCase('suma', m); }],
  [wp('consultá'), function(m) { return preserveCase('consulta', m); }],
  [wp('entrá'), function(m) { return preserveCase('entra', m); }],
  [wp('elegí'), function(m) { return preserveCase('elige', m); }],
  [wp('escribí'), function(m) { return preserveCase('escribe', m); }],
  [wp('comenzá'), function(m) { return preserveCase('comienza', m); }],
  [wp('ajustá'), function(m) { return preserveCase('ajusta', m); }],
  [wp('guardá'), function(m) { return preserveCase('guarda', m); }],
  [wp('avisá'), function(m) { return preserveCase('avisa', m); }],
  [wp('esperá'), function(m) { return preserveCase('espera', m); }],
  [wp('verificá'), function(m) { return preserveCase('verifica', m); }],
  [wp('seleccioná'), function(m) { return preserveCase('selecciona', m); }],
  [wp('creá'), function(m) { return preserveCase('crea', m); }],
  // Presente 2a persona voseante (con tilde): podés, querés, tenés, sabés, etc.
  [wp('podés'), function(m) { return preserveCase('puedes', m); }],
  [wp('podes'), function(m) { return preserveCase('puedes', m); }],  // voseo sin tilde
  [wp('querés'), function(m) { return preserveCase('quieres', m); }],
  [wp('queres'), function(m) { return preserveCase('quieres', m); }],  // voseo sin tilde
  [wp('tenés'), function(m) { return preserveCase('tienes', m); }],
  [wp('tenes'), function(m) { return preserveCase('tienes', m); }],  // voseo sin tilde
  [wp('sabés'), function(m) { return preserveCase('sabes', m); }],
  // "sabes" sin tilde es tuteo válido → NO se convierte
  [wp('encontrás'), function(m) { return preserveCase('encuentras', m); }],
  [wp('encontras'), function(m) { return preserveCase('encuentras', m); }],  // voseo sin tilde
  [wp('aplicás'), function(m) { return preserveCase('aplicas', m); }],
  // "aplicas" sin tilde es tuteo válido → NO se convierte
  [wp('recibís'), function(m) { return preserveCase('recibes', m); }],
  [wp('recibis'), function(m) { return preserveCase('recibes', m); }],  // voseo sin tilde
  [wp('ajustás'), function(m) { return preserveCase('ajustas', m); }],
  [wp('necesitás'), function(m) { return preserveCase('necesitas', m); }],
  // "necesitas" sin tilde es tuteo → NO se convierte
  // Pronombre "vos" → "tú" (solo como palabra independiente, no "vos." ni "vosotros")
  [wp('vos'), function(m) { return preserveCase('tú', m); }],
];

// Enlaces a productos inexistentes → dejar solo el texto
const BROKEN_LINK_PATTERNS = [
  // /blends/bavarian-roast/ no existe (es /blends/bavarian-roast/ ... verificar)
  // El usuario dijo que NO existe. Patrón: <a href=".../blends/bavarian-roast/">texto</a> → texto
  [/<a\s+[^>]*href="[^"]*\/blends\/bavarian-roast\/"[^>]*>([^<]+)<\/a>/gi, '$1'],
];

function applyVoseoFix(text) {
  if (typeof text !== 'string') return text;
  let original = text;
  let fixed = text;
  for (const [pattern, replacement] of VOSEO_REPLACEMENTS) {
    fixed = fixed.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of BROKEN_LINK_PATTERNS) {
    fixed = fixed.replace(pattern, replacement);
  }
  return { changed: fixed !== original, original, fixed };
}

function findVoseoMatches(text) {
  if (typeof text !== 'string') return [];
  const patterns = [
    /\bpod[eé]s\b/gi, /\bquer[eé]s\b/gi, /\bten[eé]s\b/gi, /\bsab[eé]s\b/gi,
    /\bencontr[eá]s\b/gi, /\baplic[eá]s\b/gi, /\brecib[eíi]s\b/gi,
    /\bentr[aá]\b/gi, /\beleg[ií]\b/gi, /\bconsult[aá]\b/gi, /\bagreg[aá]\b/gi,
    /\bdej[aá]s?\b/gi, /\bus[aá]s\b/gi, /\bescrib[ií]\b/gi,
    /\bcontactanos\b/gi, /\bmir[aá]\b/gi, /\bprob[aá]\b/gi,
    /\bdescubr[ií]\b/gi, /\barm[aá]s?\b/gi, /\bsum[aá]\b/gi, /\bvos\b/gi,
  ];
  const matches = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) matches.push(...m);
  }
  return matches;
}

async function firebaseGet(path) {
  const url = `${FIREBASE_DB_URL}${path}.json`;
  const token = process.env.FIREBASE_TOKEN;
  const fullUrl = token ? `${url}?auth=${token}` : url;
  const resp = await fetch(fullUrl);
  if (!resp.ok) {
    throw new Error(`Firebase GET ${path} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

async function firebasePatch(path, data) {
  const url = `${FIREBASE_DB_URL}${path}.json`;
  const token = process.env.FIREBASE_TOKEN;
  const fullUrl = token ? `${url}?auth=${token}` : url;
  const resp = await fetch(fullUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    throw new Error(`Firebase PATCH ${path} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

async function backupNode(nodeName) {
  const data = await firebaseGet(`/${nodeName}`);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup_${nodeName}_${ts}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
  console.log(`  [backup] ${nodeName} → ${backupPath}`);
  return data;
}

// Campos a escanear/fijar en cada nodo
const BLOG_FIELDS = ['contenido', 'descripcion_meta', 'titulo', 'subtitulo', 'keywords', 'faqs'];
const RECETA_FIELDS = ['descripcion', 'titulo', 'subtitulo', 'ingredientes', 'pasos', 'keywords', 'faqs'];

function fixObject(obj, fields) {
  const changes = [];
  if (!obj || typeof obj !== 'object') return changes;
  for (const field of fields) {
    if (!(field in obj)) continue;
    const val = obj[field];
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        if (typeof val[i] === 'string') {
          const { changed, original, fixed } = applyVoseoFix(val[i]);
          if (changed) {
            changes.push({ field: `${field}[${i}]`, original, fixed });
            val[i] = fixed;
          }
        } else if (val[i] && typeof val[i] === 'object') {
          // FAQ objects: { q, a }
          for (const subField of Object.keys(val[i])) {
            if (typeof val[i][subField] === 'string') {
              const { changed, original, fixed } = applyVoseoFix(val[i][subField]);
              if (changed) {
                changes.push({ field: `${field}[${i}].${subField}`, original, fixed });
                val[i][subField] = fixed;
              }
            }
          }
        }
      }
    } else if (typeof val === 'string') {
      const { changed, original, fixed } = applyVoseoFix(val);
      if (changed) {
        changes.push({ field, original, fixed });
        obj[field] = fixed;
      }
    } else if (val && typeof val === 'object') {
      // FAQ object: { q, a }
      for (const subField of Object.keys(val)) {
        if (typeof val[subField] === 'string') {
          const { changed, original, fixed } = applyVoseoFix(val[subField]);
          if (changed) {
            changes.push({ field: `${field}.${subField}`, original, fixed });
            val[subField] = fixed;
          }
        }
      }
    }
  }
  return changes;
}

async function main() {
  const DRY_RUN = process.env.DRY_RUN === '1';
  console.log('============================================================');
  console.log('  Arcano Especias — Fix Firebase SEO (blog + recetas)');
  console.log('============================================================');
  console.log(`  Modo: ${DRY_RUN ? 'DRY-RUN (no escribe)' : 'PRODUCCIÓN (escribe)'}`);
  console.log(`  Token: ${process.env.FIREBASE_TOKEN ? 'proporcionado' : 'NO (lectura pública, escritura puede fallar)'}`);
  console.log();

  ensureBackupDir();

  // === 1. Backup ===
  console.log('[1/4] Respaldando blog y recetas...');
  const blogData = await backupNode('blog');
  const recetasData = await backupNode('recetas');
  console.log();

  // === 2. Escanear y fix blog ===
  console.log('[2/4] Escaneando blog posts...');
  const blogChanges = [];
  if (blogData) {
    for (const key of Object.keys(blogData)) {
      const post = blogData[key];
      if (!post || typeof post !== 'object') continue;
      const changes = fixObject(post, BLOG_FIELDS);
      if (changes.length) {
        blogChanges.push({ key, titulo: post.titulo, changes });
      }
    }
  }
  console.log(`  ${blogChanges.length} posts con cambios:`);
  for (const c of blogChanges) {
    console.log(`\n  --- ${c.titulo || c.key} ---`);
    for (const ch of c.changes) {
      console.log(`    [${ch.field}]`);
      console.log(`      ANTES: ${ch.original.substring(0, 150)}${ch.original.length > 150 ? '...' : ''}`);
      console.log(`      DESPUÉS: ${ch.fixed.substring(0, 150)}${ch.fixed.length > 150 ? '...' : ''}`);
    }
  }
  console.log();

  // === 3. Escanear y fix recetas ===
  console.log('[3/4] Escaneando recetas...');
  const recetaChanges = [];
  if (recetasData) {
    for (const key of Object.keys(recetasData)) {
      const receta = recetasData[key];
      if (!receta || typeof receta !== 'object') continue;
      const changes = fixObject(receta, RECETA_FIELDS);
      if (changes.length) {
        recetaChanges.push({ key, titulo: receta.titulo, changes });
      }
    }
  }
  console.log(`  ${recetaChanges.length} recetas con cambios:`);
  for (const c of recetaChanges) {
    console.log(`\n  --- ${c.titulo || c.key} ---`);
    for (const ch of c.changes) {
      console.log(`    [${ch.field}]`);
      console.log(`      ANTES: ${ch.original.substring(0, 150)}${ch.original.length > 150 ? '...' : ''}`);
      console.log(`      DESPUÉS: ${ch.fixed.substring(0, 150)}${ch.fixed.length > 150 ? '...' : ''}`);
    }
  }
  console.log();

  // === 4. Escribir cambios ===
  if (DRY_RUN) {
    console.log('[4/4] DRY-RUN: no se escriben cambios.');
    console.log('\n  Para aplicar los cambios, corre sin DRY_RUN:');
    console.log('    FIREBASE_TOKEN=xxxx node scripts/seo/fix_firebase_seo.mjs');
  } else {
    console.log('[4/4] Escribiendo cambios a Firebase...');
    let ok = 0, fail = 0;
    for (const c of blogChanges) {
      try {
        const post = blogData[c.key];
        const patch = {};
        for (const field of BLOG_FIELDS) {
          if (field in post) patch[field] = post[field];
        }
        await firebasePatch(`/blog/${c.key}`, patch);
        ok++;
      } catch (e) {
        console.error(`  ✗ blog/${c.key}: ${e.message}`);
        fail++;
      }
    }
    for (const c of recetaChanges) {
      try {
        const receta = recetasData[c.key];
        const patch = {};
        for (const field of RECETA_FIELDS) {
          if (field in receta) patch[field] = receta[field];
        }
        await firebasePatch(`/recetas/${c.key}`, patch);
        ok++;
      } catch (e) {
        console.error(`  ✗ recetas/${c.key}: ${e.message}`);
        fail++;
      }
    }
    console.log(`  ✓ ${ok} nodos actualizados, ${fail} errores`);
  }

  console.log('\n============================================================');
  console.log('  RESUMEN');
  console.log('============================================================');
  console.log(`  Blog posts con cambios:   ${blogChanges.length}`);
  console.log(`  Recetas con cambios:      ${recetaChanges.length}`);
  console.log(`  Total cambios:            ${blogChanges.reduce((s, c) => s + c.changes.length, 0) + recetaChanges.reduce((s, c) => s + c.changes.length, 0)}`);
  console.log();
  console.log('  NOTA: Las páginas HTML estáticas NO se regeneraron.');
  console.log('  El owner debe regenerar blog y recetas desde el admin');
  console.log('  para que los cambios se reflejen en las URLs públicas.');
}

main().catch(e => {
  console.error('Error fatal:', e.message);
  process.exit(1);
});
