// worker/index.js — Cloudflare Worker con cron trigger
// Dispara la automatización de recetas y blog automáticamente.
// NO contiene lógica de negocio — solo hace HTTP POST a /api/automation/run.
//
// Cron schedule (hora America/Bogota = UTC-5):
//   - Recetas: Lun, Mié, Vie a las 9am → cron "0 14 * * 1,3,5" (14:00 UTC = 09:00 BOT)
//   - Blog: Domingos a las 9am → cron "0 14 * * 0"
//
// Deploy: ver worker/README.md

const SITE_URL = 'https://arcanoespecias.com';

// Handler para cron triggers
export default {
  async scheduled(event, env, ctx) {
    const now = new Date();
    const dayUTC = event.cron ? event.cron : '';
    console.log(`[cron] Triggered at ${now.toISOString()} cron="${dayUTC}"`);

    // Determinar qué tarea correr según el día de la semana
    // event.cron nos dice qué cron disparó esto
    const isRecipeDay = event.cron === '0 14 * * 1,3,5';  // Lun, Mié, Vie
    const isBlogDay = event.cron === '0 14 * * 0';        // Domingo

    if (isRecipeDay) {
      ctx.waitUntil(runAutomation(env, 'recetas'));
    }
    if (isBlogDay) {
      ctx.waitUntil(runAutomation(env, 'blog'));
    }
    // Si no es ninguno (no debería pasar), loguear
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
      // Trigger manual: POST /trigger { task: 'recetas'|'blog', dryRun?: bool }
      const auth = request.headers.get('Authorization') || '';
      if (!env.ARCANO_ADMIN_TOKEN || auth.replace(/^Bearer\s+/i, '').trim() !== env.ARCANO_ADMIN_TOKEN) {
        return new Response(JSON.stringify({ ok: false, error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      const body = await request.json();
      const result = await runAutomation(env, body.task || 'recetas', body.dryRun === true);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Arcano Automation Worker. Use POST /trigger or wait for cron.', { status: 404 });
  }
};

async function runAutomation(env, task, dryRun) {
  const log = [];
  log.push(`[${new Date().toISOString()}] Iniciando automation task="${task}" dryRun=${!!dryRun}`);

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

    return { ok: data.ok, log: log, response: data };
  } catch (e) {
    log.push(`EXCEPTION: ${e.message}`);
    console.error('[worker] Automation exception:', e);
    return { ok: false, log: log, error: e.message };
  }
}
