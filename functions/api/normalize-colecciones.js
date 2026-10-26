// /api/normalize-colecciones.js — Cloudflare Pages Function (TEMPORAL)
// =============================================================================
// PROPOSITO: Consolidar colecciones duplicadas por inconsistencia de normalización.
//
// PROBLEMA:
//   - El rebuild-coleccion.js guardó colecciones con key normalizada ("57...")
//   - El admin (db.js) guardaba colecciones con key raw (sin "57")
//   - Esto creó colecciones duplicadas para el mismo cliente
//
// SOLUCIÓN:
//   1. Lee todas las colecciones en /colecciones
//   2. Para cada colección, normaliza la key con _normalizeWhatsapp
//   3. Si la key normalizada difiere de la key actual:
//      - Merge: si ya existe una colección con la key normalizada, combina
//        casilleros (toma el mayor) e historial (union sin duplicados)
//      - Si no existe, mueve la colección a la key normalizada
//      - Borra la key vieja
//   4. Sincroniza el valor final a Brevo
//   5. Devuelve resumen de qué se consolidó
//
// USO:
//   GET https://arcanoespecias.com/api/normalize-colecciones?token=ARCANO_ADMIN_TOKEN
// =============================================================================

import { fbAdminGet, fbAdminPatch, fbAdminDelete, hasServiceAccount } from '../_lib/firebase-admin.js';
import { syncContact } from '../_lib/brevo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

const FB_BASE = '/arcano/db';

function normalizeWhatsapp(phone) {
  if (!phone) return '';
  var digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.indexOf('57') !== 0) digits = '57' + digits;
  else if (digits.length === 11 && digits.indexOf('57') === 0) { /* ok */ }
  else if (digits.length === 12 && digits.indexOf('57') === 0) { /* ok */ }
  else if (digits.length === 13 && digits.indexOf('0057') === 0) digits = digits.slice(2);
  else return '';
  if (digits.indexOf('57') !== 0) return '';
  return digits;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const expectedToken = env?.ARCANO_ADMIN_TOKEN;

  if (!expectedToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'ARCANO_ADMIN_TOKEN no configurado'
    }), { status: 500, headers: CORS_HEADERS });
  }
  if (token !== expectedToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Token inválido. Uso: /api/normalize-colecciones?token=TU_TOKEN'
    }), { status: 401, headers: CORS_HEADERS });
  }

  if (!hasServiceAccount(env)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT no configurada'
    }), { status: 500, headers: CORS_HEADERS });
  }

  try {
    console.log('[normalize-colecciones] Leyendo /colecciones y /clientes...');

    const [colecciones, clientes] = await Promise.all([
      fbAdminGet(env, FB_BASE + '/colecciones'),
      fbAdminGet(env, FB_BASE + '/clientes')
    ]);

    if (!colecciones || typeof colecciones !== 'object') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No se pudo leer /colecciones'
      }), { status: 500, headers: CORS_HEADERS });
    }

    // Indexar clientes por telefono normalizado para obtener email
    var clienteByTel = {};
    if (clientes && typeof clientes === 'object') {
      var cliKeys = Object.keys(clientes);
      for (var j = 0; j < cliKeys.length; j++) {
        var c = clientes[cliKeys[j]];
        var tel = normalizeWhatsapp(c.telefono || c.telNorm);
        if (tel) {
          clienteByTel[tel] = {
            id: cliKeys[j],
            nombre: c.nombre || '',
            email: (c.email || '').trim(),
            telefono: c.telefono || ''
          };
        }
      }
    }

    // Agrupar colecciones por key normalizada
    var grupos = {}; // { telNormalizado: [{ key, data }, ...] }
    var allKeys = Object.keys(colecciones);
    for (var i = 0; i < allKeys.length; i++) {
      var key = allKeys[i];
      var col = colecciones[key];
      if (!col) continue;

      // Normalizar la key usando el campo whatsapp del objeto, o la key misma
      var telNorm = normalizeWhatsapp(col.whatsapp || key);
      if (!telNorm) {
        // No se pudo normalizar — dejar como está
        telNorm = key;
      }

      if (!grupos[telNorm]) grupos[telNorm] = [];
      grupos[telNorm].push({ key: key, data: col, telNorm: telNorm });
    }

    console.log('[normalize-colecciones] Colecciones totales:', allKeys.length);
    console.log('[normalize-colecciones] Grupos únicos:', Object.keys(grupos).length);

    // Para cada grupo, consolidar en una sola colección con key normalizada
    var resultados = [];
    var consolidadas = 0;
    var movidas = 0;
    var sinCambios = 0;
    var borradas = 0;
    var brevoSync = 0;
    var errores = 0;

    var telsGrupo = Object.keys(grupos);
    for (var g = 0; g < telsGrupo.length; g++) {
      var telFinal = telsGrupo[g];
      var entradas = grupos[telFinal];

      try {
        // Si solo hay 1 entrada y su key ya es la normalizada → sin cambios
        if (entradas.length === 1 && entradas[0].key === telFinal) {
          sinCambios++;
          // Pero igual sincronizamos con Brevo por las dudas
          var col0 = entradas[0].data;
          var cli0 = clienteByTel[telFinal] || {};
          if (cli0.email && env?.BREVO_API_KEY) {
            try {
              await syncContact(env, {
                email: cli0.email,
                nombre: col0.nombre || cli0.nombre || '',
                telefono: cli0.telefono || '',
                ciudad: '',
                ultimoPedido: new Date().toISOString(),
                coleccionArcano: col0.casilleros || 0,
                coleccionArcanoPct: Math.min(100, (col0.casilleros || 0) * 10)
              });
              brevoSync++;
            } catch (e) { /* ignore */ }
          }
          resultados.push({
            tel: telFinal,
            nombre: col0.nombre || cli0.nombre || '',
            email: cli0.email || '(sin email)',
            keysEncontradas: [entradas[0].key],
            casillerosFinal: col0.casilleros || 0,
            accion: 'sin-cambios',
            brevo: cli0.email ? 'ok' : 'skip'
          });
          continue;
        }

        // Consolidar: merge de todas las entradas
        // Tomar el casillero máximo (por si hay duplicados del mismo pedido)
        var maxCasilleros = 0;
        var mejorNombre = '';
        var historialUnificado = {};
        var createdDates = [];
        var canjeadoFinal = false;
        var completadoFinal = false;

        for (var e = 0; e < entradas.length; e++) {
          var entry = entradas[e];
          var data = entry.data;

          // Casilleros: tomar el máximo
          if ((data.casilleros || 0) > maxCasilleros) {
            maxCasilleros = data.casilleros || 0;
          }

          // Nombre: tomar el primero no vacío
          if (!mejorNombre && data.nombre) mejorNombre = data.nombre;

          // Historial: unificar por pedidoKey (sin duplicados)
          var hist = data.historial || [];
          for (var h = 0; h < hist.length; h++) {
            var entry2 = hist[h];
            var histKey = (entry2.pedidoKey || '') + '|' + (entry2.fecha || '');
            if (!historialUnificado[histKey]) {
              historialUnificado[histKey] = entry2;
            }
          }

          // Fechas de creación
          if (data.creado) createdDates.push(data.creado);

          // Flags
          if (data.canjeado) canjeadoFinal = true;
          if (data.completado) completadoFinal = true;
        }

        // Convertir historial unificado a array
        var historialArray = Object.values(historialUnificado);
        // Ordenar por fecha
        historialArray.sort(function(a, b) {
          return (a.fecha || '').localeCompare(b.fecha || '');
        });

        // Fecha de creación: la más antigua
        var creadoFinal = createdDates.length > 0 ? createdDates.sort()[0] : new Date().toISOString();

        var colFinal = {
          whatsapp: telFinal,
          nombre: mejorNombre,
          casilleros: maxCasilleros,
          completado: maxCasilleros >= 10,
          canjeado: canjeadoFinal,
          historial: historialArray,
          creado: creadoFinal,
          updated: new Date().toISOString(),
          normalized: true,
          normalizedAt: new Date().toISOString()
        };

        // Guardar en la key normalizada
        await fbAdminPatch(env, FB_BASE + '/colecciones/' + telFinal, colFinal);

        // Borrar todas las keys viejas que no sean la normalizada
        var keysBorradas = [];
        for (var e2 = 0; e2 < entradas.length; e2++) {
          if (entradas[e2].key !== telFinal) {
            try {
              await fbAdminDelete(env, FB_BASE + '/colecciones/' + entradas[e2].key);
              keysBorradas.push(entradas[e2].key);
              borradas++;
            } catch (err) {
              console.warn('[normalize-colecciones] No se pudo borrar', entradas[e2].key, ':', err.message);
            }
          }
        }

        // Sincronizar con Brevo
        var cli = clienteByTel[telFinal] || {};
        var brevoStatus = 'skip-no-email';
        if (cli.email && env?.BREVO_API_KEY) {
          try {
            await syncContact(env, {
              email: cli.email,
              nombre: mejorNombre || cli.nombre || '',
              telefono: cli.telefono || '',
              ciudad: '',
              ultimoPedido: new Date().toISOString(),
              coleccionArcano: maxCasilleros,
              coleccionArcanoPct: Math.min(100, maxCasilleros * 10)
            });
            brevoSync++;
            brevoStatus = 'ok';
          } catch (e) {
            brevoStatus = 'error: ' + e.message;
          }
        }

        var accion = keysBorradas.length > 0 ? 'consolidada' : 'movida';
        if (accion === 'consolidada') consolidadas++;
        else movidas++;

        resultados.push({
          tel: telFinal,
          nombre: mejorNombre || cli.nombre || '',
          email: cli.email || '(sin email)',
          keysEncontradas: entradas.map(function(x) { return x.key; }),
          keysBorradas: keysBorradas,
          casillerosFinal: maxCasilleros,
          historialCount: historialArray.length,
          accion: accion,
          brevo: brevoStatus
        });

      } catch (e) {
        errores++;
        resultados.push({
          tel: telFinal,
          status: 'error',
          error: e.message
        });
        console.error('[normalize-colecciones] Error con', telFinal, ':', e.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      resumen: {
        totalColeccionesIniciales: allKeys.length,
        gruposUnicos: Object.keys(grupos).length,
        sinCambios: sinCambios,
        consolidadas: consolidadas,
        movidas: movidas,
        keysBorradas: borradas,
        brevoSincronizados: brevoSync,
        errores: errores
      },
      resultados: resultados,
      instrucciones: 'Migración completada. BORRAR este endpoint después.'
    }, null, 2), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[normalize-colecciones] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message
    }), { status: 500, headers: CORS_HEADERS });
  }
}
