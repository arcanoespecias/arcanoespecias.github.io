// /api/diag-pedidos-cliente.js — Cloudflare Pages Function (TEMPORAL)
// =============================================================================
// PROPOSITO: Diagnóstico — ver los pedidos en Firebase y su clienteId,
// comparar con los clientes en /clientes, y detectar inconsistencias.
// =============================================================================

import { fbAdminGet, hasServiceAccount } from '../_lib/firebase-admin.js';

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

  if (!expectedToken || token !== expectedToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Token inválido'
    }), { status: 401, headers: CORS_HEADERS });
  }

  if (!hasServiceAccount(env)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT no configurada'
    }), { status: 500, headers: CORS_HEADERS });
  }

  try {
    const [pedidos, clientes] = await Promise.all([
      fbAdminGet(env, FB_BASE + '/pedidos'),
      fbAdminGet(env, FB_BASE + '/clientes')
    ]);

    // Indexar clientes por key y por telefono
    var clienteByKey = {};
    var clienteByTel = {};
    if (clientes && typeof clientes === 'object') {
      var cliKeys = Object.keys(clientes);
      for (var j = 0; j < cliKeys.length; j++) {
        var c = clientes[cliKeys[j]];
        clienteByKey[cliKeys[j]] = c;
        var tel = normalizeWhatsapp(c.telefono || c.telNorm);
        if (tel) clienteByTel[tel] = { key: cliKeys[j], cliente: c };
      }
    }

    // Para cada pedido, mostrar su clienteId y si coincide con algún cliente
    var pedidosArray = [];
    var pedidoKeys = Object.keys(pedidos || {});
    for (var i = 0; i < pedidoKeys.length; i++) {
      var k = pedidoKeys[i];
      var p = pedidos[k];
      if (!p) continue;

      var pedidoClienteId = p.clienteId || '(sin clienteId)';
      var clienteEncontrado = clienteByKey[pedidoClienteId];
      var telCliente = clienteEncontrado ? (clienteEncontrado.telefono || clienteEncontrado.telNorm || '') : '(cliente no encontrado)';
      var telNorm = normalizeWhatsapp(p.cliente && (p.cliente.telefono || p.cliente.whatsapp) || '');
      var clientePorTel = telNorm ? clienteByTel[telNorm] : null;

      pedidosArray.push({
        pedidoKey: k,
        clienteIdEnPedido: pedidoClienteId,
        clienteEncontradoPorId: clienteEncontrado ? {
          key: pedidoClienteId,
          nombre: clienteEncontrado.nombre,
          telefono: clienteEncontrado.telefono
        } : null,
        telefonoEnPedido: p.cliente ? (p.cliente.telefono || '') : '',
        telefonoNormalizado: telNorm,
        clienteEncontradoPorTel: clientePorTel ? {
          key: clientePorTel.key,
          nombre: clientePorTel.cliente.nombre,
          telefono: clientePorTel.cliente.telefono
        } : null,
        coincideId: !!clienteEncontrado,
        coincideTel: !!clientePorTel,
        mismatch: clientePorTel && clienteEncontrado && clientePorTel.key !== pedidoClienteId,
        estado: p.estado,
        total: p.total,
        itemsCount: (p.items || []).length,
        creado: p.creado
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      resumen: {
        totalPedidos: pedidosArray.length,
        totalClientes: Object.keys(clienteByKey).length,
        pedidosConClienteIdMatch: pedidosArray.filter(function(p) { return p.coincideId; }).length,
        pedidosSinClienteIdMatch: pedidosArray.filter(function(p) { return !p.coincideId; }).length,
        pedidosConMismatch: pedidosArray.filter(function(p) { return p.mismatch; }).length
      },
      pedidos: pedidosArray
    }, null, 2), { headers: CORS_HEADERS });

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: e.message
    }), { status: 500, headers: CORS_HEADERS });
  }
}
