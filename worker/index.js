// worker/index.js — Cloudflare Worker con cron trigger
// Dispara la automatización de recetas y blog automáticamente.
// NO contiene lógica de negocio — solo hace HTTP POST a /api/automation/run.
//
// Cron schedule (hora America/Bogota = UTC-5):
//   - Recetas: Lun, Mié, Vie a las 9am → cron "0 14 * * 1,3,5" (14:00 UTC = 09:00 BOT)
//   - Blog: Domingos a las 9am → cron "0 14 * * 0"
//
// REINTENTOS AUTOMÁTICOS:
//   Si la generación falla (Gemini 503, timeout, JSON truncado, etc.),
//   el worker reintenta automáticamente 3 veces con backoff exponencial:
//     intento 1: inmediato
//     intento 2: espera 30s
//     intento 3: espera 2min
//   Si los 3 fallan, recién ahí se pierde hasta el próximo cron.
//
// Deploy: ver worker/README.md

const SITE_URL = 'https://arcanoespecias.com';

// Configuración de reintentos
const MAX_INTENTOS = 3;
const BACKOFF_MS = [0, 30 * 1000, 2 * 60 * 1000];  // 0s, 30s, 2min

// Handler para cron triggers
export default {
  async scheduled(event, env, ctx) {
    const now = new Date();
    const dayUTC = event.cron ? event.cron : '';
    console.log(`[cron] Triggered at ${now.toISOString()} cron="${dayUTC}"`);

    // Determinar qué tarea correr según el día de la semana
    const isRecipeDay = event.cron === '0 14 * * 1,3,5';  // Lun, Mié, Vie
    const isBlogDay = event.cron === '0 14 * * 0';        // Domingo

    if (isRecipeDay) {
      ctx.waitUntil(runAutomationWithRetries(env, 'recetas'));
    }
    if (isBlogDay) {
      ctx.waitUntil(runAutomationWithRetries(env, 'blog'));
    }
    if (!isRecipeDay && !isBlogDay) {
      console.warn(`[cron] Triggered but no task matches cron="${dayUTC}"`);
    }
  },

  // Handler para HTTP (para pruebas manuales)
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'arcano-automation-worker' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.ARCANO_ADMIN_TOKEN || auth.replace(/^Bearer\s+/i, '').trim() !== env.ARCANO_ADMIN_TOKEN) {
        return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      const body = await request.json();
      const result = await runAutomationWithRetries(env, body.task || 'recetas', body.dryRun === true);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Arcano Automation Worker. Use POST /trigger or wait for cron.', { status: 404 });
  }
};

// Función sleep — Cloudflare Workers permite setTimeout en ctx.waitUntil
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ejecuta runAutomation con hasta MAX_INTENTOS intentos, esperando BACKOFF_MS
// entre cada uno. Devuelve el primer éxito, o el último error si todos fallan.
async function runAutomationWithRetries(env, task, dryRun) {
  const log = [];
  log.push(`[${new Date().toISOString()}] Iniciando automation task="${task}" dryRun=${!!dryRun} (reintentos: hasta ${MAX_INTENTOS})`);

  let lastResult = null;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    log.push(`--- Intento ${intento}/${MAX_INTENTOS} ---`);

    // Esperar el backoff correspondiente (intento 1 → 0ms, intento 2 → 30s, etc.)
    if (BACKOFF_MS[intento - 1] > 0) {
      log.push(`Esperando ${BACKOFF_MS[intento - 1] / 1000}s antes de reintentar...`);
      await sleep(BACKOFF_MS[intento - 1]);
    }

    const result = await runAutomation(env, task, dryRun);
    log.push(...result.log);

    if (result.ok) {
      log.push(`✓ Éxito en intento ${intento}`);
      return { ok: true, log, intentos: intento, response: result.response };
    }

    log.push(`✗ Intento ${intento} falló: ${result.error || 'error desconocido'}`);
    lastResult = result;

    // Si fue un error de validación (no de infraestructura), no reintentar
    // — por ejemplo: "Receta inválida (faltan campos)" significa que Gemini
    // devolvió algo malformado, reintentar podría ayudar pero también podría
    // entrar en loop. Por ahora, reintentamos siempre.
  }

  log.push(`✗ Todos los ${MAX_INTENTOS} intentos fallaron. Se pierde hasta el próximo cron.`);
  console.error(`[worker] ${task}: todos los ${MAX_INTENTOS} intentos fallaron`);

  return {
    ok: false,
    log,
    intentos: MAX_INTENTOS,
    error: lastResult?.error || 'Todos los intentos fallaron'
  };
}

async function runAutomation(env, task, dryRun) {
  const log = [];
  log.push(`[${new Date().toISOString()}] Llamando a /api/automation/run`);

  try {
    const resp = await fetch(`${SITE_URL}/api/automation/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.ARCANO_ADMIN_TOKEN
      },
      body: JSON.stringify({ task: task, dryRun: dryRun || false })
    });

    const data = await resp.json();
    log.push(`Response status: ${resp.status}`);
    log.push(`Response ok: ${data.ok}`);

    if (!data.ok) {
      log.push(`ERROR: ${data.error}`);
      console.error('[worker] Automation failed:', data.error);
    } else {
      log.push(`Success. Result keys: ${Object.keys(data.result || {}).join(', ')}`);
      if (data.result?.receta) log.push(`Receta: ${data.result.receta.titulo}`);
      if (data.result?.articulo) log.push(`Artículo: ${data.result.articulo.titulo}`);
    }

    return { ok: data.ok, log, response: data };
  } catch (e) {
    log.push(`EXCEPTION: ${e.message}`);
    console.error('[worker] Automation exception:', e);
    return { ok: false, log, error: e.message };
  }
}
