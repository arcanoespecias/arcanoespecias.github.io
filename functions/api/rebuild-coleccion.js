// /api/rebuild-coleccion.js — Cloudflare Pages Function (TEMPORAL)
// =============================================================================
// PROPOSITO: Reconstrucción ONE-TIME de la Colección Arcano.
// Recorre TODOS los pedidos en /pedidos de Firebase, cuenta los blends pequeños
// de cada pedido, y actualiza /colecciones/{whatsapp} con el conteo correcto.
//
// LÓGICA:
//   1. Lee /pedidos (todos los pedidos históricos)
//   2. Lee /colecciones (estado actual, para no perder historial manual)
//   3. Lee /clientes (para obtener whatsapp normalizado)
//   4. Para cada pedido:
//      - Cuenta blends chicos (tipo blend o especia, talla chico/pequeño)
//      - Identifica al cliente por telefono
//      - Acumula el conteo en un mapa temporal { whatsapp: total }
//   5. Para cada cliente en el mapa:
//      - Si ya tiene colección: actualiza casilleros (preserva historial)
//      - Si no tiene colección: crea una nueva
//      - Caso especial: si ya canjeó (canjeado=true), resetea a 0 + suma nuevos
//   6. Sincroniza el conteo actualizado a Brevo (COLECCION_ARCANO + PCT)
//   7. Devuelve resumen con el detalle por cliente
//
// USO:
//   GET https://arcanoespecias.com/api/rebuild-coleccion?token=ARCANO_ADMIN_TOKEN
//
// SEGURIDAD:
//   - Requiere token admin en query string (igual que sync-coleccion-brevo)
//   - CORRER UNA SOLA VEZ — después borrar del repo
// =============================================================================

import { fbAdminGet, fbAdminPatch, hasServiceAccount } from '../_lib/firebase-admin.js';
import { syncContact } from '../_lib/brevo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

const BREVO_LIST_ID = 2;
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

// === Contar blends chicos en un pedido ===
// Mismo criterio que _contarBlendsColeccion del admin (db.js:992)
function contarBlendsChicos(pedido) {
  var items = (pedido && pedido.items) || [];
  var count = 0;
  var nombres = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var tipo = (item.tipo || 'blend').toLowerCase();
    var tallaOriginal = (item.talla || 'chico').toLowerCase();
    // Normalizar tallas (igual que pedido.js)
    var talla = tallaOriginal;
    if (talla === 'chico' || talla === 'small') talla = 'pequeño';
    if (talla === 'grande' || talla === 'large') talla = 'grande';
    var qty = Number(item.qty) || Number(item.cantidad) || 0;

    // Solo contar blends y especias en talla chico/pequeño
    if ((tipo === 'blend' || tipo === 'especia') && (talla === 'pequeño' || talla === 'chico') && qty > 0) {
      count += qty;
      if (item.nombre) nombres.push(item.nombre);
    }
  }
  return { count: count, nombres: nombres };
}

export async function onRequestGet({ request, env }) {
  // === Validar token admin ===
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

  // === Validar Service Account Firebase ===
  if (!hasServiceAccount(env)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT no configurada'
    }), { status: 500, headers: CORS_HEADERS });
  }

  try {
    console.log('[rebuild-coleccion] Iniciando lectura de /pedidos, /colecciones, /clientes...');

    // === Leer todo en paralelo ===
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

    console.log('[rebuild-coleccion] Pedidos:', Object.keys(pedidos).length);
    console.log('[rebuild-coleccion] Colecciones existentes:', colecciones ? Object.keys(colecciones).length : 0);
    console.log('[rebuild-coleccion] Clientes:', clientes ? Object.keys(clientes).length : 0);

    // === Paso 1: Indexar colecciones existentes por teléfono normalizado ===
    var coleccionByTel = {};
    if (colecciones && typeof colecciones === 'object') {
      var collKeys = Object.keys(colecciones);
      for (var i = 0; i < collKeys.length; i++) {
        var k = collKeys[i];
        var kDigits = String(k).replace(/\D/g, '');
        if (kDigits) coleccionByTel[kDigits] = { key: k, data: colecciones[k] };
      }
    }

    // === Paso 2: Indexar clientes por telefono normalizado ===
    // Para conseguir el email y sincronizar con Brevo
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

    // === Paso 3: Recorrer pedidos y acumular blends por cliente ===
    // Mapa: { tel_normalizado: { totalBlends: N, pedidos: [{pedidoKey, fecha, count, nombres}], nombre, email } }
    var acumuladoPorTel = {};
    var pedidoKeys = Object.keys(pedidos);
    var pedidosProcesados = 0;
    var pedidosSinCliente = 0;
    var pedidosSinBlends = 0;

    for (var p = 0; p < pedidoKeys.length; p++) {
      var pedidoKey = pedidoKeys[p];
      var pedido = pedidos[pedidoKey];
      if (!pedido) continue;

      var cliente = pedido.cliente || {};
      var telPedido = normalizeWhatsapp(cliente.telefono || cliente.whatsapp || '');

      if (!telPedido) {
        pedidosSinCliente++;
        continue;
      }

      var conteo = contarBlendsChicos(pedido);
      if (conteo.count === 0) {
        pedidosSinBlends++;
        continue;
      }

      pedidosProcesados++;

      if (!acumuladoPorTel[telPedido]) {
        var clienteData = clienteByTel[telPedido] || {};
        acumuladoPorTel[telPedido] = {
          whatsapp: telPedido,
          nombre: cliente.nombre || clienteData.nombre || '',
          email: clienteData.email || '',
          telefonoOriginal: cliente.telefono || clienteData.telefono || '',
          totalBlends: 0,
          pedidos: []
        };
      }

      acumuladoPorTel[telPedido].totalBlends += conteo.count;
      acumuladoPorTel[telPedido].pedidos.push({
        pedidoKey: pedidoKey,
        fecha: pedido.creado || '',
        count: conteo.count,
        nombres: conteo.nombres
      });

      // Actualizar nombre si no lo teníamos
      if (!acumuladoPorTel[telPedido].nombre && cliente.nombre) {
        acumuladoPorTel[telPedido].nombre = cliente.nombre;
      }
    }

    console.log('[rebuild-coleccion] Pedidos procesados con blends:', pedidosProcesados);
    console.log('[rebuild-coleccion] Clientes únicos con blends:', Object.keys(acumuladoPorTel).length);

    // === Paso 4: Actualizar /colecciones en Firebase y sincronizar Brevo ===
    var resultados = [];
    var actualizados = 0;
    var creados = 0;
    var reseteados = 0;
    var errores = 0;
    var brevoSync = 0;
    var brevoErrores = 0;

    var telsAActualizar = Object.keys(acumuladoPorTel);
    for (var t = 0; t < telsAActualizar.length; t++) {
      var tel = telsAActualizar[t];
      var data = acumuladoPorTel[tel];
      var coleccionExistente = coleccionByTel[tel] || null;
      var keyColeccion = coleccionExistente ? coleccionExistente.key : tel;

      try {
        // Determinar casilleros finales
        var casillerosPrevios = coleccionExistente ? (Number(coleccionExistente.data.casilleros) || 0) : 0;
        var canjeado = coleccionExistente ? (coleccionExistente.data.canjeado === true) : false;
        var fueReseteado = false;

        // Si ya canjeó, la colección empieza desde 0 + nuevos blends
        // (comportamiento confirmado por el cliente: "casillero vuelve a 0")
        var casillerosBase = 0;
        if (canjeado) {
          // El cliente ya canjeó — reseteamos y sumamos solo los blends nuevos
          // Pero para no perder el historial de pedidos anteriores al canje,
          // vamos a sumar TODOS los blends históricos al reset
          // (esto puede llevar a >10 si hizo muchos pedidos)
          casillerosBase = 0;
          reseteados++;
          fueReseteado = true;
        } else {
          // Cliente sin canjear: mantener lo que tiene y sumar los nuevos
          // PERO: como estamos reconstruyendo desde cero, los casilleros previos
          // ya fueron sumados por pedidos anteriores. Para no duplicar, usamos
          // solo el total acumulado de TODOS los pedidos.
          casillerosBase = 0; // Empezamos desde 0 y sumamos todo
        }

        // El total real es: casillerosBase (0) + todos los blends históricos
        // Pero capamos a 10 (igual que addBlendsToColeccion en db.js:4165)
        var casillerosFinal = Math.min(10, casillerosBase + data.totalBlends);
        var completado = casillerosFinal >= 10;

        // Construir historial nuevo (preserva el existente)
        var historialPrevio = (coleccionExistente && coleccionExistente.data.historial) || [];
        var historialNuevo = data.pedidos.map(function(p) {
          return {
            pedidoKey: p.pedidoKey,
            fecha: p.fecha,
            cantidad: p.count,
            blends: p.nombres
          };
        });

        // Combinar historial (no duplicar entries con mismo pedidoKey)
        var historialCombinado = historialPrevio.slice();
        var existingKeys = {};
        for (var h = 0; h < historialCombinado.length; h++) {
          if (historialCombinado[h].pedidoKey) {
            existingKeys[historialCombinado[h].pedidoKey] = true;
          }
        }
        for (var h2 = 0; h2 < historialNuevo.length; h2++) {
          if (!existingKeys[historialNuevo[h2].pedidoKey]) {
            historialCombinado.push(historialNuevo[h2]);
          }
        }

        // Construir objeto coleccion completo
        var nuevaColeccion = {
          whatsapp: tel,
          nombre: data.nombre,
          casilleros: casillerosFinal,
          completado: completado,
          canjeado: false, // Si estamos reconstruyendo, el canje se resetea
          historial: historialCombinado,
          creado: (coleccionExistente && coleccionExistente.data.creado) || new Date().toISOString(),
          updated: new Date().toISOString(),
          rebuilt: true,
          rebuiltAt: new Date().toISOString()
        };

        // Guardar en Firebase
        await fbAdminPatch(env, FB_BASE + '/colecciones/' + keyColeccion, nuevaColeccion);

        if (coleccionExistente) {
          actualizados++;
        } else {
          creados++;
        }

        // Calcular pct para Brevo
        var pct = Math.min(100, casillerosFinal * 10);

        // Sincronizar con Brevo (si tiene email)
        var brevoStatus = 'skip-no-email';
        if (data.email && env?.BREVO_API_KEY) {
          try {
            await syncContact(env, {
              email: data.email,
              nombre: data.nombre,
              telefono: data.telefonoOriginal,
              ciudad: '', // No lo tenemos acá, syncContact no lo sobreescribe si viene vacío? Sí lo sobreescribe con ''
              ultimoPedido: new Date().toISOString(),
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
          pedidosContados: data.pedidos.length,
          totalBlendsHistoricos: data.totalBlends,
          casillerosPrevios: casillerosPrevios,
          casillerosFinales: casillerosFinal,
          pct: pct,
          fueReseteado: fueReseteado,
          coleccionStatus: coleccionExistente ? 'actualizada' : 'creada',
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
        console.error('[rebuild-coleccion] Error con cliente', tel, ':', e.message);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      resumen: {
        totalPedidosFirebase: pedidoKeys.length,
        pedidosProcesadosConBlends: pedidosProcesados,
        pedidosSinCliente: pedidosSinCliente,
        pedidosSinBlendsChicos: pedidosSinBlends,
        clientesUnicosConBlends: Object.keys(acumuladoPorTel).length,
        coleccionesActualizadas: actualizados,
        coleccionesCreadas: creados,
        coleccionesReseteadasPorCanje: reseteados,
        brevoSincronizados: brevoSync,
        brevoErrores: brevoErrores,
        errores: errores
      },
      resultados: resultados,
      instrucciones: 'Si todo está OK, BORRAR este endpoint del repo y redesplegar. El comportamiento del canje es: casilleros vuelve a 0 (confirmado por el cliente).'
    }, null, 2), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[rebuild-coleccion] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message
    }), { status: 500, headers: CORS_HEADERS });
  }
}
