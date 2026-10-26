// /api/rebuild-coleccion.js — Cloudflare Pages Function (TEMPORAL) v2
// =============================================================================
// PROPOSITO: Reconstrucción ONE-TIME de la Colección Arcano (v2).
// Recorre TODOS los pedidos ENTREGADOS en /pedidos de Firebase, cuenta los
// blends (chicos Y grandes, cada uno como 1) y reconstruye /colecciones.
//
// DIFERENCIAS vs v1:
//   - Solo cuenta pedidos con estado === 'entregado' (no pedidos nuevos/cancelados)
//   - Cuenta blends chicos Y grandes (antes solo chicos)
//   - Resetea TODAS las colecciones existentes antes de reconstruir
//   - El reset borra el flag canjeado y el historial previo (se reconstruye limpio)
//
// LÓGICA:
//   1. Lee /pedidos (todos)
//   2. Filtra solo los pedidos con estado === 'entregado'
//   3. Para cada pedido entregado:
//      - Cuenta blends y especias en talla chico o grande (cada uno = 1)
//      - Acumula en mapa temporal { whatsapp: { total, pedidos: [] } }
//   4. Resetea /colecciones (borra todas las existentes)
//   5. Para cada cliente en el mapa:
//      - Crea colección nueva con casilleros = min(10, total)
//      - historial con todos los pedidos entregados
//      - canjeado = false, completado = (casilleros >= 10)
//   6. Sincroniza a Brevo (COLECCION_ARCANO + PCT)
//   7. Devuelve resumen detallado
//
// USO:
//   GET https://arcanoespecias.com/api/rebuild-coleccion?token=ARCANO_ADMIN_TOKEN
//
// SEGURIDAD:
//   - Requiere token admin en query string
//   - CORRER UNA SOLA VEZ — después borrar del repo
// =============================================================================

import { fbAdminGet, fbAdminPatch, fbAdminDelete, hasServiceAccount } from '../_lib/firebase-admin.js';
import { syncContact } from '../_lib/brevo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

const FB_BASE = '/arcano/db';

// === Normalizar whatsapp (igual que pedido.js) ===
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

// === Contar blends en un pedido (chicos Y grandes, cada uno = 1) ===
function contarBlends(pedido) {
  var items = (pedido && pedido.items) || [];
  var count = 0;
  var nombres = [];
  var detalle = { chicos: 0, grandes: 0 };

  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var tipo = (item.tipo || 'blend').toLowerCase();
    var tallaOriginal = (item.talla || '').toLowerCase();
    var talla = tallaOriginal;
    if (talla === 'small' || talla === 'pequeno' || talla === 'pequeño') talla = 'chico';
    if (talla === 'large') talla = 'grande';
    var qty = Number(item.qty) || Number(item.cantidad) || 0;

    if ((tipo === 'blend' || tipo === 'especia') && (talla === 'chico' || talla === 'grande') && qty > 0) {
      count += qty;
      if (talla === 'chico') detalle.chicos += qty;
      if (talla === 'grande') detalle.grandes += qty;
      if (item.nombre) nombres.push(item.nombre);
    }
  }
  return { count: count, nombres: nombres, detalle: detalle };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const expectedToken = env?.ARCANO_ADMIN_TOKEN;

  if (!expectedToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'ARCANO_ADMIN_TOKEN no configurado en env vars de Cloudflare'
    }), { status: 500, headers: CORS_HEADERS });
  }
  if (token !== expectedToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Token inválido. Uso: /api/rebuild-coleccion?token=TU_TOKEN'
    }), { status: 401, headers: CORS_HEADERS });
  }

  if (!hasServiceAccount(env)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT no configurada'
    }), { status: 500, headers: CORS_HEADERS });
  }

  try {
    console.log('[rebuild-coleccion-v2] Iniciando lectura de /pedidos, /colecciones, /clientes...');

    const [pedidos, colecciones, clientes] = await Promise.all([
      fbAdminGet(env, FB_BASE + '/pedidos'),
      fbAdminGet(env, FB_BASE + '/colecciones'),
      fbAdminGet(env, FB_BASE + '/clientes')
    ]);

    if (!pedidos || typeof pedidos !== 'object') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'No se pudo leer /pedidos de Firebase'
      }), { status: 500, headers: CORS_HEADERS });
    }

    console.log('[rebuild-coleccion-v2] Pedidos totales:', Object.keys(pedidos).length);
    console.log('[rebuild-coleccion-v2] Colecciones existentes:', colecciones ? Object.keys(colecciones).length : 0);
    console.log('[rebuild-coleccion-v2] Clientes:', clientes ? Object.keys(clientes).length : 0);

    // === Indexar clientes por telefono normalizado ===
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

    // === Filtrar solo pedidos ENTREGADOS y acumular blends por cliente ===
    var acumuladoPorTel = {};
    var pedidoKeys = Object.keys(pedidos);
    var pedidosEntregados = 0;
    var pedidosNoEntregados = 0;
    var pedidosSinCliente = 0;
    var pedidosSinBlends = 0;

    for (var p = 0; p < pedidoKeys.length; p++) {
      var pedidoKey = pedidoKeys[p];
      var pedido = pedidos[pedidoKey];
      if (!pedido) continue;

      var estado = (pedido.estado || '').toLowerCase();
      if (estado !== 'entregado') {
        pedidosNoEntregados++;
        continue;
      }
      pedidosEntregados++;

      var cliente = pedido.cliente || {};
      var telPedido = normalizeWhatsapp(cliente.telefono || cliente.whatsapp || '');

      if (!telPedido) {
        pedidosSinCliente++;
        continue;
      }

      var conteo = contarBlends(pedido);
      if (conteo.count === 0) {
        pedidosSinBlends++;
        continue;
      }

      if (!acumuladoPorTel[telPedido]) {
        var clienteData = clienteByTel[telPedido] || {};
        acumuladoPorTel[telPedido] = {
          whatsapp: telPedido,
          nombre: cliente.nombre || clienteData.nombre || '',
          email: clienteData.email || '',
          telefonoOriginal: cliente.telefono || clienteData.telefono || '',
          totalBlends: 0,
          totalChicos: 0,
          totalGrandes: 0,
          pedidos: []
        };
      }

      acumuladoPorTel[telPedido].totalBlends += conteo.count;
      acumuladoPorTel[telPedido].totalChicos += conteo.detalle.chicos;
      acumuladoPorTel[telPedido].totalGrandes += conteo.detalle.grandes;
      acumuladoPorTel[telPedido].pedidos.push({
        pedidoKey: pedidoKey,
        fecha: pedido.creado || '',
        count: conteo.count,
        chicos: conteo.detalle.chicos,
        grandes: conteo.detalle.grandes,
        nombres: conteo.nombres
      });

      if (!acumuladoPorTel[telPedido].nombre && cliente.nombre) {
        acumuladoPorTel[telPedido].nombre = cliente.nombre;
      }
    }

    console.log('[rebuild-coleccion-v2] Pedidos entregados:', pedidosEntregados);
    console.log('[rebuild-coleccion-v2] Pedidos NO entregados (skip):', pedidosNoEntregados);
    console.log('[rebuild-coleccion-v2] Clientes únicos con blends en pedidos entregados:', Object.keys(acumuladoPorTel).length);

    // === Resetear TODAS las colecciones existentes ===
    var coleccionesReseteadas = 0;
    if (colecciones && typeof colecciones === 'object') {
      var collResetKeys = Object.keys(colecciones);
      for (var cr = 0; cr < collResetKeys.length; cr++) {
        try {
          await fbAdminDelete(env, FB_BASE + '/colecciones/' + collResetKeys[cr]);
          coleccionesReseteadas++;
        } catch (e) {
          console.warn('[rebuild-coleccion-v2] No se pudo resetear colección', collResetKeys[cr], ':', e.message);
        }
      }
    }
    console.log('[rebuild-coleccion-v2] Colecciones reseteadas:', coleccionesReseteadas);

    // === Crear colecciones nuevas con el conteo correcto ===
    var resultados = [];
    var coleccionesCreadas = 0;
    var brevoSync = 0;
    var brevoErrores = 0;
    var errores = 0;

    var telsAActualizar = Object.keys(acumuladoPorTel);
    for (var t = 0; t < telsAActualizar.length; t++) {
      var tel = telsAActualizar[t];
      var data = acumuladoPorTel[tel];

      try {
        var casillerosFinal = Math.min(10, data.totalBlends);
        var completado = casillerosFinal >= 10;
        var now = new Date().toISOString();

        var historial = data.pedidos.map(function(p) {
          return {
            pedidoKey: p.pedidoKey,
            fecha: p.fecha,
            cantidad: p.count,
            blends: p.nombres
          };
        });

        var nuevaColeccion = {
          whatsapp: tel,
          nombre: data.nombre,
          casilleros: casillerosFinal,
          completado: completado,
          canjeado: false,
          historial: historial,
          creado: now,
          updated: now,
          rebuilt: true,
          rebuiltAt: now,
          rebuiltVersion: 2
        };

        await fbAdminPatch(env, FB_BASE + '/colecciones/' + tel, nuevaColeccion);
        coleccionesCreadas++;

        var pct = Math.min(100, casillerosFinal * 10);

        var brevoStatus = 'skip-no-email';
        if (data.email && env?.BREVO_API_KEY) {
          try {
            await syncContact(env, {
              email: data.email,
              nombre: data.nombre,
              telefono: data.telefonoOriginal,
              ciudad: '',
              ultimoPedido: now,
              coleccionArcano: casillerosFinal,
              coleccionArcanoPct: pct
            });
            brevoSync++;
            brevoStatus = 'ok';
          } catch (e) {
            brevoErrores++;
            brevoStatus = 'error: ' + e.message;
          }
        }

        resultados.push({
          whatsapp: tel,
          nombre: data.nombre,
          email: data.email || '(sin email)',
          telefono: data.telefonoOriginal,
          pedidosEntregados: data.pedidos.length,
          totalBlends: data.totalBlends,
          totalChicos: data.totalChicos,
          totalGrandes: data.totalGrandes,
          casillerosFinales: casillerosFinal,
          pct: pct,
          completado: completado,
          coleccionStatus: 'creada',
          brevoStatus: brevoStatus
        });

      } catch (e) {
        errores++;
        resultados.push({
          whatsapp: tel,
          nombre: data.nombre,
          status: 'error',
          error: e.message
        });
        console.error('[rebuild-coleccion-v2] Error con cliente', tel, ':', e.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      version: 2,
      resumen: {
        totalPedidosFirebase: pedidoKeys.length,
        pedidosEntregados: pedidosEntregados,
        pedidosNoEntregadosSkip: pedidosNoEntregados,
        pedidosSinCliente: pedidosSinCliente,
        pedidosSinBlends: pedidosSinBlends,
        clientesUnicosConBlends: Object.keys(acumuladoPorTel).length,
        coleccionesReseteadas: coleccionesReseteadas,
        coleccionesCreadas: coleccionesCreadas,
        brevoSincronizados: brevoSync,
        brevoErrores: brevoErrores,
        errores: errores
      },
      resultados: resultados,
      instrucciones: 'v2: solo cuenta pedidos entregados + cuenta blends chicos Y grandes (cada uno = 1). BORRAR después de correr.'
    }, null, 2), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[rebuild-coleccion-v2] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message
    }), { status: 500, headers: CORS_HEADERS });
  }
}
