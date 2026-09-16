/* ============================================================
   ARCANO — MÓDULO DE ENVÍO (Servientrega)
   Archivo nuevo: js/envio-arcano.js
   Cargar DESPUÉS de tienda-data.js pero ANTES de tienda-ui.js
   ============================================================ */

/* === TARIFAS OFICIALES SERVIENTREGA ===
   Vigencia: desde 1 de agosto de 2026
   Modalidad: CONTADO - NORMAL - TERRESTRE
   Origen: Medellín (Cra 48 # 18-29 Av. Los Industriales) */
var ARCANO_TARIFAS_SERVIENTREGA = {
  urbano:   { base: 7800,  adicional: 3600  },  // Medellín ciudad
  zonal:    { base: 11500, adicional: 4400  },  // Área Metropolitana
  capital:  { base: 16950, adicional: 4750  },  // Capitales departamentales
  especial: { base: 34500, adicional: 12000 }   // Capitales remotas / insulares
};

/* === PESOS PROMEDIO (en gramos) ===
   No se muestran al usuario. Calcula automáticamente el peso del pedido.
   El peso del empaque y de los frascos puede ser configurado desde el admin
   (Firebase: tiendaConfig.configEnvio). Acá solo quedan los defaults. */
var ARCANO_PESOS_DEFAULT = {
  frascoPequeno: 145,    // promedio 140-150g
  frascoGrande:  230,    // promedio 220-240g
  pack:          600,    // pack típico (3-4 frascos)
  empaque:       200     // caja + relleno protector
};

/* === ENVÍO GRATIS === */
var ARCANO_ENVIO_GRATIS_DEFAULT = {
  montoMinimo: 60000,
  categoriasAplican: ['urbano']  // Medellín
};

/* === Lee config dinámica desde tiendaConfig (Firebase) === */
function _arcanoGetConfigEnvio() {
  var cfg = (typeof getTiendaConfig === 'function') ? getTiendaConfig() : {};
  var ce = (cfg && cfg.configEnvio) ? cfg.configEnvio : {};
  return {
    frascoPequeno: ce.frascoPequeno || ARCANO_PESOS_DEFAULT.frascoPequeno,
    frascoGrande:  ce.frascoGrande  || ARCANO_PESOS_DEFAULT.frascoGrande,
    pack:          ce.pack          || ARCANO_PESOS_DEFAULT.pack,
    empaque:       ce.empaque       !== undefined ? ce.empaque : ARCANO_PESOS_DEFAULT.empaque,
    montoMinimoGratis: ce.montoMinimoGratis || ARCANO_ENVIO_GRATIS_DEFAULT.montoMinimo,
    categoriasGratis:  (ce.categoriasGratis && ce.categoriasGratis.length) ? ce.categoriasGratis : ARCANO_ENVIO_GRATIS_DEFAULT.categoriasAplican
  };
}

/* === MAPEO CIUDADES → CATEGORÍA SERVIENTREGA === */
var ARCANO_CIUDADES_CATEGORIA = {
  // URBANO — Medellín ciudad
  "Medellín": "urbano",

  // ZONAL — Área Metropolitana del Valle de Aburrá
  "Bello": "zonal",
  "Itagüí": "zonal",
  "Envigado": "zonal",
  "Sabaneta": "zonal",
  "La Estrella": "zonal",
  "Caldas": "zonal",
  "Copacabana": "zonal",
  "Girardota": "zonal",
  "Barbosa": "zonal",

  // CAPITAL — Capitales departamentales
  "Bogotá": "capital",
  "Barranquilla": "capital",
  "Cartagena": "capital",
  "Cali": "capital",
  "Bucaramanga": "capital",
  "Pereira": "capital",
  "Manizales": "capital",
  "Cúcuta": "capital",
  "Santa Marta": "capital",
  "Ibagué": "capital",
  "Villavicencio": "capital",
  "Tunja": "capital",
  "Florencia": "capital",
  "Yopal": "capital",
  "Popayán": "capital",
  "Valledupar": "capital",
  "Montería": "capital",
  "Neiva": "capital",
  "Riohacha": "capital",
  "Pasto": "capital",
  "Armenia": "capital",
  "Sincelejo": "capital",
  "Arauca": "capital",
  "Quibdó": "capital",

  // ESPECIAL — Capitales remotas / insulares
  "Leticia": "especial",
  "Inírida": "especial",
  "San José del Guaviare": "especial",
  "Mitú": "especial",
  "Puerto Carreño": "especial",
  "Mocoa": "especial",
  "San Andrés": "especial"
};

/* === FUNCIONES DE CÁLCULO (internas) === */
function _arcanoObtenerCategoria(ciudad) {
  if (!ciudad) return null;
  var c = ciudad.trim();
  return ARCANO_CIUDADES_CATEGORIA[c] || null;
}

function _arcanoCalcularPesoTotal(items) {
  var cfg = _arcanoGetConfigEnvio();
  var gramos = cfg.empaque;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var pesoUnitario = 0;
    if (item.talla === 'grande') pesoUnitario = cfg.frascoGrande;
    else if (item.talla === 'pequeño' || item.talla === 'pequeno') pesoUnitario = cfg.frascoPequeno;
    else if (item.talla === 'pack') pesoUnitario = cfg.pack;
    gramos += (pesoUnitario * item.qty);
  }
  return gramos;
}

/* === FUNCIÓN PRINCIPAL ===
   Devuelve: { exito, costo, gratis, categoria, pesoGramos, mensaje } */
function arcanoCalcularEnvio(ciudadDestino, items, subtotal) {
  var categoria = _arcanoObtenerCategoria(ciudadDestino);

  if (!categoria) {
    return {
      exito: false, costo: 0, gratis: false, categoria: null,
      pesoGramos: 0, mensaje: 'Sin cobertura. Contáctanos para coordinar el envío.'
    };
  }

  var pesoGramos = _arcanoCalcularPesoTotal(items);
  var pesoKg = Math.ceil(pesoGramos / 1000);
  var kilosAdicionales = Math.max(0, pesoKg - 1);

  var cfg = _arcanoGetConfigEnvio();
  var aplicaGratis =
    cfg.categoriasGratis.indexOf(categoria) !== -1 &&
    subtotal >= cfg.montoMinimoGratis;

  if (aplicaGratis) {
    return {
      exito: true, costo: 0, gratis: true, categoria: categoria,
      pesoGramos: pesoGramos, mensaje: 'Envío gratis por compras desde $' + cfg.montoMinimoGratis.toLocaleString('es-CO')
    };
  }

  var tarifa = ARCANO_TARIFAS_SERVIENTREGA[categoria];
  var costo = tarifa.base + (kilosAdicionales * tarifa.adicional);

  var mensaje = null;
  if (categoria === 'urbano') {
    // En Medellín, recordá siempre la promo aunque no aplique
    var faltan = cfg.montoMinimoGratis - subtotal;
    mensaje = 'Te faltan $' + faltan.toLocaleString('es-CO') + ' para tener envío gratis en Medellín.';
  }

  return {
    exito: true, costo: costo, gratis: false, categoria: categoria,
    pesoGramos: pesoGramos, mensaje: mensaje
  };
}

/* === DEBUG (admin, F12) === */
function arcanoDebugEnvio(ciudadDestino, items, subtotal) {
  var r = arcanoCalcularEnvio(ciudadDestino, items, subtotal);
  var cfg = _arcanoGetConfigEnvio();
  console.log('=== ARCANO DEBUG DE ENVÍO ===');
  console.log('Ciudad:', ciudadDestino, '| Categoría:', r.categoria);
  console.log('Items:', items.length, '| Subtotal: $' + subtotal.toLocaleString('es-CO'));
  console.log('Config pesos:', cfg);
  console.log('Peso total:', r.pesoGramos + 'g =', Math.ceil(r.pesoGramos / 1000) + 'kg');
  console.log('Envío gratis:', r.gratis);
  console.log('Costo mostrado al cliente: $' + (r.gratis ? 0 : r.costo).toLocaleString('es-CO'));
  console.log('Mensaje promo:', r.mensaje || '(ninguno)');
  console.log('=============================');
}

/* === FUNCIÓN PARA MOSTRAR EN EL DOM (reemplaza a updateShippingInfo) === */
function arcanoActualizarShippingInfo() {
  var ciudadEl = document.getElementById('o-ciudad');
  if (!ciudadEl) return;
  var ciudad = ciudadEl.value;
  var total = getCartTotal();
  var items = cart || [];

  // Actualiza siempre subtotal y total
  arcanoActualizarResumenCarrito(ciudad, items, total);
}

/* === FUNCIÓN UNIFICADA: actualiza Subtotal + Envío + Total === */
function arcanoActualizarResumenCarrito(ciudad, items, subtotal) {
  var subtotalEl = document.getElementById('cart-drawer-subtotal-val');
  var envioLine  = document.getElementById('cart-drawer-envio-line');
  var envioVal    = document.getElementById('cart-drawer-envio-val');
  var totalEl     = document.getElementById('cart-drawer-total-val');
  var infoEl       = document.getElementById('shipping-info');

  // Subtotal
  if (subtotalEl) subtotalEl.textContent = '$' + subtotal.toLocaleString('es-CO');

  // Cálculo de envío
  var envioCosto = 0;
  var envioGratis = false;
  var envioExito = false;
  var envioMensaje = null;
  var envioCategoria = null;
  var envioPesoGramos = 0;

  if (ciudad) {
    var r = arcanoCalcularEnvio(ciudad, items, subtotal);
    envioExito = r.exito;
    envioGratis = r.gratis;
    envioCosto = r.gratis ? 0 : (r.exito ? r.costo : 0);
    envioMensaje = r.mensaje;
    envioCategoria = r.categoria;
    envioPesoGramos = r.pesoGramos || 0;
  }

  // Bloque de Envío (debajo de Subtotal)
  if (!envioLine) {
    // No estamos en el drawer con líneas (puede ser paso 2 sin el drawer visible)
  } else if (!ciudad) {
    envioLine.style.display = 'none';
  } else {
    envioLine.style.display = 'flex';
    if (envioGratis) {
      envioVal.innerHTML = '<span class="envio-gratis">Gratis</span>';
    } else if (envioExito) {
      envioVal.innerHTML = '<span class="envio-costo">$' + envioCosto.toLocaleString('es-CO') + '</span>';
    } else {
      envioVal.innerHTML = '<span class="envio-calculando">Sin cobertura</span>';
    }
  }

  // Total
  if (totalEl) {
    var totalFinal = subtotal + envioCosto;
    totalEl.textContent = '$' + totalFinal.toLocaleString('es-CO');
  }

  // Bloque promo (envío gratis / te faltan $X) — solo si existe
  if (infoEl) {
    if (!ciudad) {
      infoEl.style.display = 'none';
      infoEl.innerHTML = '';
    } else if (!envioExito) {
      infoEl.style.display = 'block';
      infoEl.style.background = 'rgba(231,76,60,0.08)';
      infoEl.style.border = '1px solid rgba(231,76,60,0.2)';
      infoEl.style.color = '#c7553f';
      infoEl.style.padding = '10px 14px';
      infoEl.style.borderRadius = '8px';
      infoEl.style.fontSize = '0.85rem';
      infoEl.style.margin = '8px 0 0';
      infoEl.innerHTML = '⚠ Sin cobertura para ' + ciudad + '. Contáctanos para coordinar.';
    } else if (envioGratis) {
      infoEl.style.display = 'block';
      infoEl.style.background = 'rgba(107,142,78,0.15)';
      infoEl.style.border = '1px solid rgba(107,142,78,0.3)';
      infoEl.style.color = '#6b8e4e';
      infoEl.style.padding = '10px 14px';
      infoEl.style.borderRadius = '8px';
      infoEl.style.fontSize = '0.85rem';
      infoEl.style.margin = '8px 0 0';
      infoEl.innerHTML = '✓ <strong>¡Envío gratis!</strong> Tu pedido supera el mínimo para envío gratis en ' + ciudad + '.';
    } else if (envioMensaje) {
      infoEl.style.display = 'block';
      infoEl.style.background = 'rgba(232,184,75,0.1)';
      infoEl.style.border = '1px solid rgba(232,184,75,0.3)';
      infoEl.style.color = '#c9a84c';
      infoEl.style.padding = '10px 14px';
      infoEl.style.borderRadius = '8px';
      infoEl.style.fontSize = '0.85rem';
      infoEl.style.margin = '8px 0 0';
      infoEl.innerHTML = envioMensaje;
    } else {
      infoEl.style.display = 'none';
      infoEl.innerHTML = '';
    }
  }
}

/* === Helper: actualiza solo Subtotal + Total cuando no hay ciudad elegida === */
function _arcanoActualizarTotalDrawer(subtotal, envio) {
  var subtotalEl = document.getElementById('cart-drawer-subtotal-val');
  var totalEl = document.getElementById('cart-drawer-total-val');
  if (subtotalEl) subtotalEl.textContent = '$' + subtotal.toLocaleString('es-CO');
  if (totalEl) {
    var envioCosto = (typeof envio === 'number') ? envio : 0;
    var totalFinal = subtotal + envioCosto;
    totalEl.textContent = '$' + totalFinal.toLocaleString('es-CO');
  }
}
