// /api/pedido.js — Cloudflare Pages Function
// ETAPA 3 — Recibe el carrito del cliente, valida precios y envío en el servidor,
// y crea el pedido en Firebase. La tienda deja de escribir pedidos directo.
// ETAPA 4.5 — Usa Firebase Admin (Service Account) para bypassar reglas admin-only.
// ETAPA Brevo — Sincroniza contacto + envía emails transaccionales (fire-and-forget).

import { fbAdminGet, fbAdminPost, fbAdminPatch, hasServiceAccount } from '../_lib/firebase-admin.js';
import { syncContact, sendWelcomeEmail, sendConfirmationEmail } from '../_lib/brevo.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const FB_BASE = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db';

// === Tarifas Servientrega (espejo de js/envio-arcano.js) ===
const TARIFAS_SERVIENTREGA = {
  urbano:   { base: 7800,  adicional: 3600  },
  zonal:    { base: 11500, adicional: 4400  },
  capital:  { base: 16950, adicional: 4750  },
  especial: { base: 34500, adicional: 12000 }
};

const PESOS_DEFAULT = {
  frascoPequeno: 145,
  frascoGrande:  230,
  pack:          600,
  empaque:       200
};

const ENVIO_GRATIS_DEFAULT = {
  montoMinimo: 60000,
  categoriasAplican: ['urbano']
};

const CIUDADES_CATEGORIA = {
  "Medellín": "urbano",
  "Bello": "zonal", "Itagüí": "zonal", "Envigado": "zonal", "Sabaneta": "zonal",
  "La Estrella": "zonal", "Caldas": "zonal", "Copacabana": "zonal",
  "Girardota": "zonal", "Barbosa": "zonal",
  "Bogotá": "capital", "Barranquilla": "capital", "Cartagena": "capital", "Cali": "capital",
  "Bucaramanga": "capital", "Pereira": "capital", "Manizales": "capital", "Cúcuta": "capital",
  "Santa Marta": "capital", "Ibagué": "capital", "Villavicencio": "capital", "Tunja": "capital",
  "Florencia": "capital", "Yopal": "capital", "Popayán": "capital", "Valledupar": "capital",
  "Montería": "capital", "Neiva": "capital", "Riohacha": "capital", "Pasto": "capital",
  "Armenia": "capital", "Sincelejo": "capital", "Arauca": "capital", "Quibdó": "capital",
  "Leticia": "especial", "Inírida": "especial", "San José del Guaviare": "especial",
  "Mitú": "especial", "Puerto Carreño": "especial", "Mocoa": "especial", "San Andrés": "especial"
};

function obtenerCategoria(ciudad) {
  if (!ciudad) return null;
  return CIUDADES_CATEGORIA[ciudad.trim()] || null;
}

function calcularPesoTotal(items, cfgEnvio) {
  var gramos = cfgEnvio.empaque;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var pesoUnitario = 0;
    var talla = (item.talla || '').toLowerCase();
    // ETAPA 4 fix: normalizar alias de tallas — la tienda usa 'chico' internamente
    var tallaItem = String(item.talla || '').toLowerCase();
    if (tallaItem === 'chico' || tallaItem === 'small') tallaItem = 'pequeño';
    if (tallaItem === 'grande' || tallaItem === 'large') tallaItem = 'grande';
    if (tallaItem === 'grande') pesoUnitario = cfgEnvio.frascoGrande;
    else if (tallaItem === 'pequeño' || tallaItem === 'pequeno') pesoUnitario = cfgEnvio.frascoPequeno;
    else if (tallaItem === 'pack') pesoUnitario = cfgEnvio.pack;
    gramos += (pesoUnitario * (Number(item.qty) || 1));
  }
  return gramos;
}

function calcularEnvio(ciudad, items, subtotal, cfgEnvio) {
  var categoria = obtenerCategoria(ciudad);
  if (!categoria) {
    return { exito: false, costo: 0, gratis: false, categoria: null, pesoGramos: 0 };
  }
  var pesoGramos = calcularPesoTotal(items, cfgEnvio);
  var pesoKg = Math.ceil(pesoGramos / 1000);
  var kilosAdicionales = Math.max(0, pesoKg - 1);
  var aplicaGratis =
    cfgEnvio.categoriasGratis.indexOf(categoria) !== -1 &&
    subtotal >= cfgEnvio.montoMinimoGratis;
  if (aplicaGratis) {
    return { exito: true, costo: 0, gratis: true, categoria: categoria, pesoGramos: pesoGramos };
  }
  var tarifa = TARIFAS_SERVIENTREGA[categoria];
  var costo = tarifa.base + (kilosAdicionales * tarifa.adicional);
  return { exito: true, costo: costo, gratis: false, categoria: categoria, pesoGramos: pesoGramos };
}

// === Helpers Firebase REST (requieren Service Account — sin fallback público) ===
async function fbGet(env, path) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminGet(env, '/arcano/db' + path);
  console.log('[pedido] fbGet ruta usada: arcano/db' + path);
  return data;
}

async function fbPut(env, path, body) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminPatch(env, '/arcano/db' + path, body);
  console.log('[pedido] fbPut ruta usada: arcano/db' + path);
  return data;
}

async function fbPatch(env, path, body) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminPatch(env, '/arcano/db' + path, body);
  console.log('[pedido] fbPatch ruta usada: arcano/db' + path);
  return data;
}

async function fbPost(env, path, body) {
  if (!hasServiceAccount(env)) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada. Operación rechazada.');
  }
  const data = await fbAdminPost(env, '/arcano/db' + path, body);
  console.log('[pedido] fbPost ruta usada: arcano/db' + path);
  return data;
}

// Normaliza teléfono WhatsApp a formato internacional colombiano sin +
function normalizeWhatsapp(phone) {
  if (!phone) return '';
  var digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.indexOf('57') !== 0) digits = '57' + digits;
  else if (digits.length === 11 && digits.indexOf('57') === 0) { /* ok */ }
  else if (digits.length === 12 && digits.indexOf('57') === 0) { /* ok */ }
  else if (digits.length === 13 && digits.indexOf('0057') === 0) digits = digits.slice(2);
  else return '';
  // Validar que empiece con 57
  if (digits.indexOf('57') !== 0) return '';
  return digits;
}

// === Leer Colección Arcano del cliente (para sincronizar con Brevo) ===
// La colección se guarda en /colecciones con key = whatsapp normalizado
// Devuelve { casilleros: Number, pct: Number } o { casilleros: 0, pct: 0 } si no existe
async function leerColeccionCliente(env, whatsapp) {
  const telNorm = normalizeWhatsapp(whatsapp);
  if (!telNorm) {
    return { casilleros: 0, pct: 0, found: false };
  }

  try {
    const allColecciones = await fbGet(env, '/colecciones');
    if (!allColecciones || typeof allColecciones !== 'object') {
      return { casilleros: 0, pct: 0, found: false };
    }

    // Buscar match por teléfono normalizado (igual que actionColeccion en cuenta.js)
    var coleccion = null;
    var keys = Object.keys(allColecciones);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var kDigits = String(k).replace(/\D/g, '');
      if (kDigits === telNorm || kDigits.endsWith(telNorm) || telNorm.endsWith(kDigits)) {
        coleccion = allColecciones[k];
        break;
      }
    }

    if (!coleccion) {
      return { casilleros: 0, pct: 0, found: false };
    }

    var casilleros = Number(coleccion.casilleros) || 0;
    // Calcular porcentaje (0-100) para la barra del email
    // 10 blends = 100%, entonces cada blend = 10%
    var pct = Math.min(100, casilleros * 10);
    return { casilleros: casilleros, pct: pct, found: true };
  } catch (e) {
    console.warn('[pedido] leerColeccionCliente error:', e.message);
    return { casilleros: 0, pct: 0, found: false };
  }
}

// === Incrementar Colección Arcano del cliente después de un pedido ===
// Cuenta los blends chicos del pedido y los suma a /colecciones/{whatsapp}.
// Si el cliente no tiene colección, la crea. Si ya canjeó (canjeado=true),
// respeta el reset (vuelve a 0 y suma los nuevos blends).
// Devuelve { casillerosFinales, pct, incrementados, creado } o null si no aplica.
async function incrementarColeccionCliente(env, items, cliente, pedidoId) {
  const tel = normalizeWhatsapp(cliente.telefono);
  if (!tel) {
    console.warn('[pedido] incrementarColeccionCliente: teléfono inválido');
    return null;
  }

  // Contar blends chicos en el pedido (mismo criterio que _contarBlendsColeccion del admin)
  var blendsChicosCount = 0;
  var blendNombres = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var tipo = (item.tipo || 'blend').toLowerCase();
    var tallaOriginal = (item.talla || '').toLowerCase();
    var talla = tallaOriginal;
    if (talla === 'chico' || talla === 'small') talla = 'pequeño';
    if (talla === 'grande' || talla === 'large') talla = 'grande';
    var qty = Number(item.qty) || 0;

    if ((tipo === 'blend' || tipo === 'especia') && talla === 'pequeño' && qty > 0) {
      blendsChicosCount += qty;
      if (item.nombre) blendNombres.push(item.nombre);
    }
  }

  if (blendsChicosCount === 0) {
    console.log('[pedido] No hay blends chicos en este pedido, no se incrementa colección');
    return { casillerosFinales: 0, pct: 0, incrementados: 0, creado: false, skipped: true };
  }

  try {
    // Buscar colección existente
    const allColecciones = await fbGet(env, '/colecciones');
    var key = tel;
    var coleccion = null;
    if (allColecciones && typeof allColecciones === 'object') {
      var keys = Object.keys(allColecciones);
      for (var k = 0; k < keys.length; k++) {
        var kDigits = String(keys[k]).replace(/\D/g, '');
        if (kDigits === tel || kDigits.endsWith(tel) || tel.endsWith(kDigits)) {
          key = keys[k];
          coleccion = allColecciones[keys[k]];
          break;
        }
      }
    }

    var now = new Date().toISOString();
    var creado = false;
    var fueReset = false;

    if (!coleccion) {
      // Crear nueva colección
      coleccion = {
        whatsapp: tel,
        nombre: cliente.nombre || '',
        casilleros: 0,
        completado: false,
        canjeado: false,
        historial: [],
        creado: now
      };
      creado = true;
    } else {
      coleccion.historial = coleccion.historial || [];
      coleccion.nombre = coleccion.nombre || cliente.nombre || '';
    }

    // Si ya completó 10 y no ha canjeado, no seguir sumando (igual que db.js:4163)
    if (coleccion.casilleros >= 10 && !coleccion.canjeado) {
      console.log('[pedido] Colección ya completa (10/10) sin canjear, no se incrementa');
      return { casillerosFinales: coleccion.casilleros, pct: 100, incrementados: 0, creado: creado, skipped: true };
    }

    // Si ya canjeó, el canje resetea a 0 (comportamiento confirmado por el cliente)
    if (coleccion.canjeado === true) {
      coleccion.casilleros = 0;
      coleccion.canjeado = false;
      coleccion.completado = false;
      fueReset = true;
    }

    // Incrementar casilleros (cap a 10)
    var prev = Number(coleccion.casilleros) || 0;
    coleccion.casilleros = Math.min(10, prev + blendsChicosCount);
    coleccion.completado = coleccion.casilleros >= 10;

    // Agregar entrada al historial
    coleccion.historial.push({
      pedidoKey: pedidoId || '',
      fecha: now,
      cantidad: blendsChicosCount,
      blends: blendNombres
    });
    coleccion.updated = now;

    // Guardar en Firebase
    await fbPatch(env, '/colecciones/' + key, coleccion);
    console.log('[pedido] Colección actualizada para', tel, ':', coleccion.casilleros, '/10 (+', blendsChicosCount, ')');

    var pctFinal = Math.min(100, coleccion.casilleros * 10);
    return {
      casillerosFinales: coleccion.casilleros,
      pct: pctFinal,
      incrementados: blendsChicosCount,
      creado: creado,
      fueReset: fueReset,
      completado: coleccion.completado
    };
  } catch (e) {
    console.warn('[pedido] incrementarColeccionCliente error:', e.message);
    return null;
  }
}

// === Upsert cliente (server-side) ===
async function upsertCliente(env, cliente) {
  const tel = normalizeWhatsapp(cliente.telefono);
  if (!tel) throw new Error('Teléfono inválido');

  // Leer todos los clientes y filtrar en servidor (evita dependencia de indexOn en reglas)
  const allClientes = await fbGet(env, '/clientes');
  var key = null;
  var existing = null;
  if (allClientes && typeof allClientes === 'object') {
    var keys = Object.keys(allClientes);
    for (var i = 0; i < keys.length; i++) {
      var c = allClientes[keys[i]];
      if (c && c.telNorm === tel) {
        key = keys[i];
        existing = c;
        break;
      }
    }
  }

  const now = new Date().toISOString();
  if (!existing) {
    // Crear cliente nuevo: usar POST que genera push key
    const newCliente = {
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      telNorm: tel,
      email: cliente.email || '',
      ciudad: cliente.ciudad || '',
      direccion: cliente.direccion || '',
      creado: now,
      ultimoPedido: now,
      totalPedidos: 1
    };
    const resp = await fbPost(env, '/clientes', newCliente);
    const result = resp;
    key = result.name;
    return { id: key, isNew: true };
  } else {
    // Actualizar existente
    const updates = {
      nombre: cliente.nombre || existing.nombre || '',
      email: cliente.email || existing.email || '',
      ciudad: cliente.ciudad || existing.ciudad || '',
      direccion: cliente.direccion || existing.direccion || '',
      ultimoPedido: now,
      totalPedidos: (existing.totalPedidos || 0) + 1
    };
    await fbPatch(env, `/clientes/${key}`, updates);
    return { id: key, isNew: false };
  }
}

// === Validación del catálogo ===
async function validarItemsYCalcularSubtotal(items, catalogo) {
  // catalogo: { especias: {key: {...}}, blends: {key: {...}}, packs: {key: {...}} }
  // Construye mapa productId -> producto para lookup O(1)
  var mapa = {};
  function indexar(obj, tipo) {
    if (!obj || typeof obj !== 'object') return;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var p = obj[keys[i]];
      if (!p || p.enTienda === false) continue;
      var pid = Number(p.id);
      if (!isNaN(pid)) mapa[pid + '|' + tipo] = p;
    }
  }
  indexar(catalogo.especias, 'especia');
  indexar(catalogo.blends, 'blend');
  indexar(catalogo.packs, 'pack');

  var subtotalValidado = 0;
  var itemsValidados = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || !item.productId || !item.qty || item.qty < 1) {
      throw new Error('Item inválido en posición ' + i);
    }
    var pid = Number(item.productId);
    var tipo = (item.tipo || '').toLowerCase();
    if (isNaN(pid) || !tipo) {
      throw new Error('Item con productId o tipo faltante: ' + JSON.stringify(item));
    }
    var prod = mapa[pid + '|' + tipo];
    if (!prod) {
      throw new Error('Producto no encontrado en catálogo: ' + tipo + ' #' + pid);
    }
    var tallaOriginal = (item.talla || '').toLowerCase();
    // ETAPA 4 fix: normalizar alias de tallas — la tienda usa 'chico' internamente
    // pero el catálogo usa 'pequeño'. Aceptamos ambos + variantes.
    var talla = tallaOriginal;
    if (talla === 'chico' || talla === 'small') talla = 'pequeño';
    if (talla === 'grande' || talla === 'large') talla = 'grande';
    var precioEsperado = 0;
    if (talla === 'grande') precioEsperado = Number(prod.precioTiendaGrande) || Number(prod.precioGrande) || 0;
    else if (talla === 'pequeño' || talla === 'pequeno') precioEsperado = Number(prod.precioTiendaChico) || Number(prod.precioChico) || 0;
    else if (talla === 'pack') precioEsperado = Number(prod.precioPack) || Number(prod.precio) || 0;
    else throw new Error('Talla inválida: ' + item.talla);

    if (precioEsperado === 0) throw new Error('Precio no configurado para ' + prod.nombre + ' / ' + talla);

    // Validar que el precio enviado coincide con el del catálogo (tolerancia 0)
    var precioEnviado = Number(item.precio);
    if (precioEnviado !== precioEsperado) {
      console.warn('[pedido] Precio mismatch:', prod.nombre, 'enviado:', precioEnviado, 'esperado:', precioEsperado, '→ usando el del catálogo');
    }
    // Siempre usar el precio del catálogo (server-side authority)
    var qty = Number(item.qty);
    var subtotal = precioEsperado * qty;
    subtotalValidado += subtotal;
    itemsValidados.push({
      productId: pid,
      tipo: tipo,
      nombre: prod.nombre,
      talla: talla,
      precio: precioEsperado,
      qty: qty,
      subtotal: subtotal
    });
  }

  return { itemsValidados, subtotalValidado };
}

export async function onRequestGet({ request }) {
  return new Response(JSON.stringify({
    ok: true,
    service: 'pedido',
    message: 'POST { cliente, items, ciudad, notas } to create order'
  }), { headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await request.json();
    const { cliente, items, ciudad, notas } = body;

    // === Validar input mínimo ===
    if (!cliente || !cliente.nombre || !cliente.telefono) {
      return new Response(JSON.stringify({
        ok: false, error: 'Datos del cliente incompletos (nombre y teléfono obligatorios)'
      }), { status: 400, headers: CORS_HEADERS });
    }
    if (!ciudad) {
      return new Response(JSON.stringify({
        ok: false, error: 'Ciudad obligatoria'
      }), { status: 400, headers: CORS_HEADERS });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({
        ok: false, error: 'Carrito vacío'
      }), { status: 400, headers: CORS_HEADERS });
    }

    // === Leer catálogo + config desde Firebase ===
    console.log('[pedido] Iniciando lectura de catálogo con SA...');
    let especias, blends, packs, tiendaConfig;
    try {
      [especias, blends, packs, tiendaConfig] = await Promise.all([
        fbGet(env, '/especias'),
        fbGet(env, '/blends'),
        fbGet(env, '/packs'),
        fbGet(env, '/tiendaConfig')
      ]);
      console.log('[pedido] Catálogo leído: especias=' + (especias ? Object.keys(especias).length : 'null') + ', blends=' + (blends ? Object.keys(blends).length : 'null') + ', packs=' + (packs ? Object.keys(packs).length : 'null'));
    } catch (e) {
      console.error('[pedido] Error leyendo catálogo:', e.message);
      throw new Error('No se pudo leer el catálogo: ' + e.message);
    }

    // === Validar items y calcular subtotal del lado del servidor ===
    const { itemsValidados, subtotalValidado } = await validarItemsYCalcularSubtotal(items, { especias, blends, packs });

    // === Calcular envío en servidor (espejo de envio-arcano.js) ===
    const ce = (tiendaConfig && tiendaConfig.configEnvio) ? tiendaConfig.configEnvio : {};
    const cfgEnvio = {
      frascoPequeno: ce.frascoPequeno || PESOS_DEFAULT.frascoPequeno,
      frascoGrande:  ce.frascoGrande  || PESOS_DEFAULT.frascoGrande,
      pack:          ce.pack          || PESOS_DEFAULT.pack,
      empaque:       ce.empaque       !== undefined ? ce.empaque : PESOS_DEFAULT.empaque,
      montoMinimoGratis: ce.montoMinimoGratis || ENVIO_GRATIS_DEFAULT.montoMinimo,
      categoriasGratis: (ce.categoriasGratis && ce.categoriasGratis.length) ? ce.categoriasGratis : ENVIO_GRATIS_DEFAULT.categoriasAplican
    };

    const envio = calcularEnvio(ciudad, itemsValidados, subtotalValidado, cfgEnvio);
    const envioCosto = envio.gratis ? 0 : (envio.exito ? envio.costo : 0);
    const totalFinal = subtotalValidado + envioCosto;

    var envioInfoNotas;
    if (!envio.exito) {
      envioInfoNotas = 'Sin cobertura automática. Coordinar con el cliente.';
    } else if (envio.gratis) {
      envioInfoNotas = 'Envío gratis (Medellín, pedido ≥ $' + cfgEnvio.montoMinimoGratis.toLocaleString('es-CO') + ')';
    } else {
      envioInfoNotas = 'Envío ' + ciudad + ' (' + envio.categoria + ', ' + Math.ceil(envio.pesoGramos / 1000) + 'kg): $' + envio.costo.toLocaleString('es-CO') + ' (Servientrega Contado Normal Terrestre)';
    }

    // === Upsert cliente ===
    const clienteResult = await upsertCliente(env, cliente);

    // === Crear pedido ===
    const now = new Date().toISOString();
    const orderData = {
      cliente: {
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        email: cliente.email || '',
        ciudad: cliente.ciudad || ciudad,
        direccion: cliente.direccion || ''
      },
      clienteId: clienteResult.id,
      items: itemsValidados,
      subtotal: subtotalValidado,
      envio: {
        costo: envioCosto,
        gratis: envio.gratis,
        categoria: envio.categoria,
        pesoGramos: envio.pesoGramos || 0,
        pesoKg: envio.pesoGramos ? Math.ceil(envio.pesoGramos / 1000) : 0,
        carrier: 'Servientrega',
        modalidad: 'Contado - Normal - Terrestre'
      },
      total: totalFinal,
      notas: notas ? (notas + ' | ' + envioInfoNotas) : envioInfoNotas,
      creado: now,
      estado: 'nuevo',
      metodoPago: 'efectivo'
    };

    // Crear pedido con fbPost (usa Admin SDK si hay Service Account, fallback público)
    const result = await fbPost(env, '/pedidos', orderData);
    const pedidoId = result.name;

    if (!pedidoId) {
      throw new Error('Firebase no devolvió pedido ID');
    }

    // === Notificar al admin (fire-and-forget) ===
    try {
      await fetch('https://arcanoespecias.com/api/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evento: 'pedido',
          titulo: '\u{1F6D2} Pedido nuevo #' + pedidoId.slice(-6),
          mensaje: cliente.nombre + ' (' + cliente.telefono + ') \u2014 $' + totalFinal.toLocaleString('es-CO') + ' \u2014 ' + itemsValidados.length + ' items',
          data: { url: '/admin/', pedidoId: pedidoId }
        })
      });
    } catch (e) {
      console.warn('[pedido] notify-admin falló (no crítico):', e.message);
    }

    // === Brevo: sincronizar contacto + emails transaccionales ===
    var clienteEmail = (cliente.email || '').trim();
    var brevoDebug = { email: clienteEmail, hasKey: !!env?.BREVO_API_KEY, isNew: clienteResult.isNew, steps: [] };

    if (clienteEmail) {
      var itemsResumen = itemsValidados.map(function(it) {
        return it.qty + 'x ' + it.nombre + ' (' + it.talla + ')';
      }).join(', ');
      var envioResumen = envio.gratis ? 'Gratis' : '$' + envioCosto.toLocaleString('es-CO');
      var pedidoResumen = itemsResumen + ' | Envío: ' + envioResumen;

      // === Incrementar Colección Arcano del cliente con este pedido ===
      // ETAPA Colección Arcano auto-increment: cada pedido nuevo suma automáticamente
      // los blends chicos a la colección del cliente en Firebase. Así no dependemos
      // de que el admin vea el pedido en el panel para que cuente.
      var coleccionIncremento = null;
      try {
        coleccionIncremento = await incrementarColeccionCliente(env, itemsValidados, cliente, pedidoId);
        console.log('[pedido] Colección incrementada:', coleccionIncremento);
      } catch (e) {
        console.warn('[pedido] incrementarColeccionCliente falló (no crítico):', e.message);
      }

      // === Leer Colección Arcano actualizada (para sincronizar progreso en Brevo) ===
      // Si el incremento funcionó, usamos esos valores. Si no, leemos el estado actual.
      var coleccionData = { casilleros: 0, pct: 0, found: false };
      if (coleccionIncremento && coleccionIncremento.casillerosFinales !== undefined) {
        coleccionData = {
          casilleros: coleccionIncremento.casillerosFinales,
          pct: coleccionIncremento.pct,
          found: true
        };
      } else {
        try {
          coleccionData = await leerColeccionCliente(env, cliente.telefono);
          console.log('[pedido] Colección leída para', cliente.telefono + ':', coleccionData.casilleros, '/10');
        } catch (e) {
          console.warn('[pedido] leerColeccionCliente falló (no crítico):', e.message);
        }
      }

      // 1. Sincronizar contacto en Brevo (agregar/actualizar en lista #2)
      //    ETAPA Colección Arcano: ahora envía COLECCION_ARCANO + COLECCION_ARCANO_PCT
      try {
        await syncContact(env, {
          email: clienteEmail,
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          ciudad: cliente.ciudad || ciudad,
          ultimoPedido: now,
          coleccionArcano: coleccionData.casilleros,
          coleccionArcanoPct: coleccionData.pct
        });
        brevoDebug.steps.push({ step: 'syncContact', ok: true, coleccionArcano: coleccionData.casilleros });
      } catch (e) {
        brevoDebug.steps.push({ step: 'syncContact', ok: false, error: e.message });
      }

      // 2. Email de bienvenida (solo si es cliente nuevo)
      if (clienteResult.isNew) {
        try {
          await sendWelcomeEmail(env, {
            email: clienteEmail,
            nombre: cliente.nombre,
            pedidoResumen: pedidoResumen,
            total: totalFinal
          });
          brevoDebug.steps.push({ step: 'welcomeEmail', ok: true });
        } catch (e) {
          brevoDebug.steps.push({ step: 'welcomeEmail', ok: false, error: e.message });
        }
      }

      // 3. Email de confirmación de pedido (siempre)
      try {
        await sendConfirmationEmail(env, {
          email: clienteEmail,
          nombre: cliente.nombre,
          itemsResumen: itemsResumen,
          envioResumen: envioResumen,
          total: totalFinal
        });
        brevoDebug.steps.push({ step: 'confirmationEmail', ok: true });
      } catch (e) {
        brevoDebug.steps.push({ step: 'confirmationEmail', ok: false, error: e.message });
      }
    } else {
      brevoDebug.steps.push({ step: 'skip', reason: 'cliente sin email' });
    }

    return new Response(JSON.stringify({
      ok: true,
      pedidoId: pedidoId,
      clienteId: clienteResult.id,
      clienteNuevo: clienteResult.isNew,
      total: totalFinal,
      envioCosto: envioCosto,
      envioGratis: envio.gratis,
      items: itemsValidados.length,
      coleccion: coleccionIncremento,
      brevoDebug: brevoDebug
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[pedido] Error:', e.message);
    return new Response(JSON.stringify({
      ok: false,
      error: e.message || 'Server error'
    }), { status: 500, headers: CORS_HEADERS });
  }
}
