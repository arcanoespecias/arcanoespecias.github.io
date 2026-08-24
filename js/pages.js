const Pages = {
  _qrPagoImage: localStorage.getItem('arcano_qr_pago_image') || '',

  _getCheckedCats: function(prefix) {
    var cats = [];
    var el;
    el = document.getElementById('f-' + prefix + '-cat-comidas');
    if (el && el.checked) cats.push('Comidas');
    el = document.getElementById('f-' + prefix + '-cat-infusiones');
    if (el && el.checked) cats.push('Infusiones');
    el = document.getElementById('f-' + prefix + '-cat-cocteleria');
    if (el && el.checked) cats.push('Cocteleria');
    return cats;
  },


  /* ================================================================
     DASHBOARD — MAPA VISUAL COMPLETO DEL NEGOCIO
     ================================================================ */
  _dashCharts: [],

  renderDashboard(container) {
    if (Pages._dashCharts) { for (var _ci = 0; _ci < Pages._dashCharts.length; _ci++) { try { Pages._dashCharts[_ci].destroy(); } catch(e) {} } }
    Pages._dashCharts = [];

    var db = ArcanoDB.getDB();
    var stats = ArcanoDB.getStats();
    var ventas = ArcanoDB.getVentas();
    var pedidos = ArcanoDB.getPedidos();
    var producciones = ArcanoDB.getProducciones();
    var entradas = ArcanoDB.getEntradas();
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var stickers = ArcanoDB.getStickers();
    var gastos = ArcanoDB.getGastos();
    var today = new Date().toISOString().slice(0, 10);
    var mes = new Date().toISOString().slice(0, 7);

    // === CALCULATE ALL KPIs ===
    var ventasHoy = [], ventasMes = [], pedidosNuevos = [];
    var totalIngresos = 0, totalUnidades = 0, totalOps = 0;
    var adminIngreso = 0, tiendaIngreso = 0;
    var prodVentaMap = {}, tipoCount = {especia: 0, blend: 0}, tallaCount = {chico: 0, grande: 0};
    var diaMap = {}, monthMap = {};

    for (var vi = 0; vi < ventas.length; vi++) {
      var v = ventas[vi];
      var vf = v.fecha || '';
      totalIngresos += (v.total || 0);
      totalOps++;
      adminIngreso += (v.total || 0);
      if (vf === today) ventasHoy.push(v);
      if (vf && vf.startsWith(mes)) ventasMes.push(v);
      if (vf) {
        if (!diaMap[vf]) diaMap[vf] = {ops: 0, ingresos: 0};
        diaMap[vf].ops++;
        diaMap[vf].ingresos += (v.total || 0);
        var mn = vf.substring(0, 7);
        if (!monthMap[mn]) monthMap[mn] = {ops: 0, ingresos: 0};
        monthMap[mn].ops++;
        monthMap[mn].ingresos += (v.total || 0);
      }
      if (v.items) { for (var vi2 = 0; vi2 < v.items.length; vi2++) {
        var it = v.items[vi2];
        var iCant = it.cantidad || 0;
        totalUnidades += iCant;
        tipoCount[it.tipo || 'especia'] = (tipoCount[it.tipo || 'especia'] || 0) + iCant;
        tallaCount[it.talla || 'chico'] = (tallaCount[it.talla || 'chico'] || 0) + iCant;
        var pkey = it.productoNombre || '?';
        if (!prodVentaMap[pkey]) prodVentaMap[pkey] = 0;
        prodVentaMap[pkey] += (it.subtotal || 0);
      }}
    }
    for (var pi = 0; pi < pedidos.length; pi++) {
      var p = pedidos[pi];
      if (p.estado === 'nuevo') pedidosNuevos.push(p);
      if (p.estado === 'cancelado') continue;
      var pf = p.creado ? p.creado.slice(0, 10) : '';
      totalIngresos += (p.total || 0);
      totalOps++;
      tiendaIngreso += (p.total || 0);
      if (pf && pf.startsWith(mes)) ventasMes.push(p);
      if (pf) {
        if (!diaMap[pf]) diaMap[pf] = {ops: 0, ingresos: 0};
        diaMap[pf].ops++;
        diaMap[pf].ingresos += (p.total || 0);
      }
      if (p.items) { for (var pi2 = 0; pi2 < p.items.length; pi2++) {
        var pit = p.items[pi2];
        var pCant = pit.qty || pit.cantidad || 0;
        totalUnidades += pCant;
        tipoCount[pit.tipo || 'especia'] = (tipoCount[pit.tipo || 'especia'] || 0) + pCant;
        tallaCount[pit.talla || 'chico'] = (tallaCount[pit.talla || 'chico'] || 0) + pCant;
        var pkey2 = pit.nombre || '?';
        if (!prodVentaMap[pkey2]) prodVentaMap[pkey2] = 0;
        prodVentaMap[pkey2] += (pit.subtotal || 0);
      }}
    }

    var ingresosHoy = 0;
    for (var vi3 = 0; vi3 < ventasHoy.length; vi3++) ingresosHoy += (ventasHoy[vi3].total || 0);
    var ingresosMes = 0, opsMes = 0;
    for (var vi4 = 0; vi4 < ventasMes.length; vi4++) { ingresosMes += (ventasMes[vi4].total || 0); opsMes++; }

    var totalCostos = 0;
    for (var ei = 0; ei < entradas.length; ei++) totalCostos += (Number(entradas[ei].total) || 0);
    var margenBruto = totalIngresos - totalCostos;
    var margenPct = totalIngresos > 0 ? (margenBruto / totalIngresos * 100) : 0;

    var prodMesCount = 0, prodMesUds = 0;
    for (var pr = 0; pr < producciones.length; pr++) {
      var prd = producciones[pr];
      if (prd.fecha && prd.fecha.startsWith(mes)) { prodMesCount++; prodMesUds += (prd.cantidad || 0); }
    }

    var palaBaja = [], frascosBajos = [], stickerBajos = [];
    for (var ei2 = 0; ei2 < especias.length; ei2++) {
      var esp = especias[ei2];
      if ((esp.stockBolsa || 0) <= 50) palaBaja.push(esp);
      if ((esp.stockChico || 0) <= 3 && (esp.stockGrande || 0) <= 3) frascosBajos.push({nombre: esp.nombre, chico: esp.stockChico||0, grande: esp.stockGrande||0, tipo: 'especia'});
    }
    for (var bi = 0; bi < blends.length; bi++) {
      var bl = blends[bi];
      if ((bl.stockChico || 0) <= 3 && (bl.stockGrande || 0) <= 3) frascosBajos.push({nombre: bl.nombre, chico: bl.stockChico||0, grande: bl.stockGrande||0, tipo: 'blend'});
    }
    for (var si = 0; si < stickers.length; si++) {
      var stk = stickers[si];
      if (((stk.stockChico||0) + (stk.stockGrande||0)) <= 5) stickerBajos.push(stk);
    }
    var totalAlertas = palaBaja.length + frascosBajos.length + stickerBajos.length;

    var prodArr = [];
    var pkeys = Object.keys(prodVentaMap);
    for (var pk = 0; pk < pkeys.length; pk++) prodArr.push({nombre: pkeys[pk], ingreso: prodVentaMap[pkeys[pk]]});
    prodArr.sort(function(a, b) { return b.ingreso - a.ingreso; });

    // === BUILD HTML ===
    var h = '';

    // KPIs principales
    h += '<div class="dash-section-title"><span class="dash-dot" style="background:var(--gold)"></span>Resumen del Negocio</div>';
    h += '<div class="dash-kpi-row">';
    h += '<div class="dash-kpi-card dash-kpi-gold"><div class="dash-kpi-icon">$</div><div class="dash-kpi-body"><div class="dash-kpi-val">$' + ingresosHoy.toLocaleString() + '</div><div class="dash-kpi-lbl">Ventas Hoy</div></div></div>';
    h += '<div class="dash-kpi-card dash-kpi-blue"><div class="dash-kpi-icon">M</div><div class="dash-kpi-body"><div class="dash-kpi-val">$' + ingresosMes.toLocaleString() + '</div><div class="dash-kpi-lbl">Ingresos del Mes</div><div class="dash-kpi-sub">' + opsMes + ' operaciones</div></div></div>';
    var mClr = margenPct >= 0 ? 'var(--green)' : 'var(--red)';
    h += '<div class="dash-kpi-card"><div class="dash-kpi-icon" style="color:var(--green)">%a</div><div class="dash-kpi-body"><div class="dash-kpi-val" style="color:' + mClr + '">' + margenPct.toFixed(1) + '%</div><div class="dash-kpi-lbl">Margen Bruto</div><div class="dash-kpi-sub">Ingreso $' + totalIngresos.toLocaleString() + ' - Costos $' + totalCostos.toLocaleString() + '</div></div></div>';
    h += '<div class="dash-kpi-card ' + (totalAlertas > 0 ? 'dash-kpi-red' : 'dash-kpi-green') + '"><div class="dash-kpi-icon">!</div><div class="dash-kpi-body"><div class="dash-kpi-val">' + totalAlertas + '</div><div class="dash-kpi-lbl">Alertas de Stock</div><div class="dash-kpi-sub">' + palaBaja.length + ' pala, ' + frascosBajos.length + ' frascos, ' + stickerBajos.length + ' stk</div></div></div>';
    h += '</div>';

    // Segunda fila
    h += '<div class="dash-kpi-row dash-kpi-sm">';
    h += '<div class="dash-mini"><div class="dash-mini-val">' + totalUnidades + '</div><div class="dash-mini-lbl">Unidades Vendidas</div></div>';
    h += '<div class="dash-mini"><div class="dash-mini-val">$' + (totalOps > 0 ? Math.round(totalIngresos / totalOps) : 0).toLocaleString() + '</div><div class="dash-mini-lbl">Ticket Promedio</div></div>';
    h += '<div class="dash-mini"><div class="dash-mini-val">' + prodMesCount + '</div><div class="dash-mini-lbl">Producciones Mes</div><div class="dash-mini-sub">' + prodMesUds + ' frascos</div></div>';
    h += '<div class="dash-mini"><div class="dash-mini-val">' + stats.totalFrascos + '</div><div class="dash-mini-lbl">Frascos en Stock</div><div class="dash-mini-sub">' + stats.frascosChico + ' pq / ' + stats.frascosGrande + ' gr</div></div>';
    h += '<div class="dash-mini"><div class="dash-mini-val">' + stats.totalProductos + '</div><div class="dash-mini-lbl">Productos Activos</div><div class="dash-mini-sub">' + stats.totalEspecias + ' esp + ' + stats.totalBlends + ' bl</div></div>';
    h += '<div class="dash-mini"><div class="dash-mini-val">' + pedidosNuevos.length + '</div><div class="dash-mini-lbl">Pedidos Nuevos</div></div>';
    var gastosMes = 0;
    for (var gm = 0; gm < gastos.length; gm++) { if (gastos[gm].fecha && gastos[gm].fecha.startsWith(mes)) gastosMes += (gastos[gm].monto || 0); }
    var gananciaNeta = ingresosMes - totalCostos - gastosMes;
    h += '<div class="dash-mini"><div class="dash-mini-val" style="color:var(--red)">$' + gastosMes.toLocaleString() + '</div><div class="dash-mini-lbl">Gastos del Mes</div></div>';
    h += '<div class="dash-mini"><div class="dash-mini-val" style="color:' + (gananciaNeta >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + gananciaNeta.toLocaleString() + '</div><div class="dash-mini-lbl">Ganancia Neta</div><div class="dash-mini-sub">ingreso - costos - gastos</div></div>';
    h += '</div>';

    // Canal de venta + Composicion
    h += '<div class="dash-section-title"><span class="dash-dot" style="background:var(--blue)"></span>Analisis de Ventas</div>';
    h += '<div class="dash-grid-2">';
    h += '<div class="dash-card"><h4>Canal de Venta</h4>';
    var totalCanal = adminIngreso + tiendaIngreso;
    var admPct = totalCanal > 0 ? Math.round(adminIngreso / totalCanal * 100) : 0;
    var tiePct = totalCanal > 0 ? Math.round(tiendaIngreso / totalCanal * 100) : 0;
    h += '<div class="dash-canal-row"><div class="dash-canal-item"><div class="dash-canal-bar-track"><div class="dash-canal-bar-fill" style="width:' + admPct + '%;background:var(--gold)"></div></div><div class="dash-canal-info"><span class="dash-canal-name">Ventas Admin</span><span class="dash-canal-val">$' + adminIngreso.toLocaleString() + ' (' + admPct + '%)</span></div></div>';
    h += '<div class="dash-canal-item"><div class="dash-canal-bar-track"><div class="dash-canal-bar-fill" style="width:' + tiePct + '%;background:var(--blue)"></div></div><div class="dash-canal-info"><span class="dash-canal-name">Tienda Online</span><span class="dash-canal-val">$' + tiendaIngreso.toLocaleString() + ' (' + tiePct + '%)</span></div></div></div></div>';

    // Composicion con SVG rings
    h += '<div class="dash-card"><h4>Composicion de Ventas</h4><div class="dash-comp-grid">';
    var tipoTotal = (tipoCount.especia || 0) + (tipoCount.blend || 0);
    var espPct = tipoTotal > 0 ? Math.round((tipoCount.especia || 0) / tipoTotal * 100) : 50;
    var blPct = 100 - espPct;
    var tallaTotal = (tallaCount.chico || 0) + (tallaCount.grande || 0);
    var chPct = tallaTotal > 0 ? Math.round((tallaCount.chico || 0) / tallaTotal * 100) : 50;
    var grPct = 100 - chPct;
    h += '<div class="dash-comp-item"><div class="dash-comp-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bg4)" stroke-width="3"></circle><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--gold)" stroke-width="3" stroke-dasharray="' + espPct + ' ' + (100 - espPct) + '" stroke-dashoffset="25" stroke-linecap="round"></circle></svg><div class="dash-comp-center">' + espPct + '%</div></div><div class="dash-comp-label">Especias <b>' + (tipoCount.especia || 0) + '</b></div></div>';
    h += '<div class="dash-comp-item"><div class="dash-comp-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bg4)" stroke-width="3"></circle><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--blue)" stroke-width="3" stroke-dasharray="' + blPct + ' ' + (100 - blPct) + '" stroke-dashoffset="25" stroke-linecap="round"></circle></svg><div class="dash-comp-center">' + blPct + '%</div></div><div class="dash-comp-label">Blends <b>' + (tipoCount.blend || 0) + '</b></div></div>';
    h += '<div class="dash-comp-item"><div class="dash-comp-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bg4)" stroke-width="3"></circle><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--gold2)" stroke-width="3" stroke-dasharray="' + chPct + ' ' + (100 - chPct) + '" stroke-dashoffset="25" stroke-linecap="round"></circle></svg><div class="dash-comp-center">' + chPct + '%</div></div><div class="dash-comp-label">Pequeno <b>' + (tallaCount.chico || 0) + '</b></div></div>';
    h += '<div class="dash-comp-item"><div class="dash-comp-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bg4)" stroke-width="3"></circle><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--green)" stroke-width="3" stroke-dasharray="' + grPct + ' ' + (100 - grPct) + '" stroke-dashoffset="25" stroke-linecap="round"></circle></svg><div class="dash-comp-center">' + grPct + '%</div></div><div class="dash-comp-label">Grande <b>' + (tallaCount.grande || 0) + '</b></div></div>';
    h += '</div></div></div>';

    // Charts
    h += '<div class="dash-section-title"><span class="dash-dot" style="background:var(--green)"></span>Tendencias</div>';
    h += '<div class="dash-grid-2">';
    h += '<div class="dash-card"><h4>Ingresos Ultimos 15 Dias</h4><div class="dash-chart-wrap"><canvas id="dash-chart-daily"></canvas></div></div>';
    h += '<div class="dash-card"><h4>Ingresos Mensuales</h4><div class="dash-chart-wrap"><canvas id="dash-chart-monthly"></canvas></div></div>';
    h += '</div>';

    // Top productos + Pedidos nuevos
    h += '<div class="dash-section-title"><span class="dash-dot" style="background:var(--yellow)"></span>Actividad Reciente</div>';
    h += '<div class="dash-grid-2">';
    h += '<div class="dash-card"><h4>Top 5 Productos por Ingreso</h4>';
    if (prodArr.length > 0) {
      var maxIngreso = prodArr[0].ingreso || 1;
      h += '<div class="dash-top-list">';
      for (var tp = 0; tp < Math.min(5, prodArr.length); tp++) {
        var pp = prodArr[tp];
        var barW = Math.max(4, Math.round((pp.ingreso / maxIngreso) * 100));
        h += '<div class="dash-top-item"><div class="dash-top-info"><span class="dash-top-rank">' + (tp + 1) + '</span><span class="dash-top-name">' + pp.nombre + '</span></div><div class="dash-top-bar-track"><div class="dash-top-bar-fill" style="width:' + barW + '%"></div></div><div class="dash-top-val">$' + pp.ingreso.toLocaleString() + '</div></div>';
      }
      h += '</div>';
    } else { h += '<div class="est-empty">Sin datos de ventas</div>'; }
    h += '</div>';

    // Pedidos nuevos
    h += '<div class="dash-card ' + (pedidosNuevos.length > 0 ? 'dash-card-alert' : '') + '"><h4>' + (pedidosNuevos.length > 0 ? '<span style="color:var(--red)">Pedidos Nuevos (' + pedidosNuevos.length + ')</span>' : 'Pedidos Nuevos') + '</h4>';
    if (pedidosNuevos.length > 0) {
      h += '<div class="dash-pedidos-list">';
      for (var pn = 0; pn < pedidosNuevos.length; pn++) {
        var ped = pedidosNuevos[pn];
        var cl = ped.cliente || {};
        var hora = ped.creado ? ped.creado.slice(11, 16) : '';
        h += '<div class="dash-pedido-item"><div class="dash-pedido-left"><div class="dash-pedido-time">' + hora + '</div><div class="dash-pedido-cliente">' + (cl.nombre || '?') + '</div><div class="dash-pedido-ciudad">' + (cl.ciudad || '') + '</div></div><div class="dash-pedido-right"><div class="dash-pedido-total">$' + (ped.total || 0).toLocaleString() + '</div><div class="dash-pedido-items">' + ((ped.items || []).length) + ' items</div></div></div>';
      }
      h += '</div>';
    } else { h += '<div class="est-empty">Sin pedidos pendientes</div>'; }
    h += '</div></div>';

    // Inventario
    h += '<div class="dash-section-title"><span class="dash-dot" style="background:var(--red)"></span>Estado del Inventario</div>';
    h += '<div class="dash-grid-3">';
    h += '<div class="dash-card"><h4>Envases</h4>';
    h += '<div class="dash-stock-row"><span>Pequenos</span><span class="dash-stock-val" style="color:' + (stats.envasesChico <= 10 ? 'var(--red)' : 'var(--green)') + '">' + stats.envasesChico.toLocaleString() + '</span></div><div class="dash-stock-bar-track"><div class="dash-stock-bar-fill" style="width:' + Math.min(100, stats.envasesChico / 500 * 100) + '%;background:' + (stats.envasesChico <= 10 ? 'var(--red)' : 'var(--green)') + '"></div></div>';
    h += '<div class="dash-stock-row" style="margin-top:8px"><span>Grandes</span><span class="dash-stock-val" style="color:' + (stats.envasesGrande <= 10 ? 'var(--red)' : 'var(--green)') + '">' + stats.envasesGrande.toLocaleString() + '</span></div><div class="dash-stock-bar-track"><div class="dash-stock-bar-fill" style="width:' + Math.min(100, stats.envasesGrande / 500 * 100) + '%;background:' + (stats.envasesGrande <= 10 ? 'var(--red)' : 'var(--green)') + '"></div></div></div>';
    h += '<div class="dash-card"><h4>Bolsas</h4>';
    h += '<div class="dash-stock-row"><span>Pequenas</span><span class="dash-stock-val" style="color:' + (stats.bolsasChico <= 10 ? 'var(--red)' : 'var(--green)') + '">' + stats.bolsasChico.toLocaleString() + '</span></div><div class="dash-stock-bar-track"><div class="dash-stock-bar-fill" style="width:' + Math.min(100, stats.bolsasChico / 500 * 100) + '%;background:' + (stats.bolsasChico <= 10 ? 'var(--red)' : 'var(--green)') + '"></div></div>';
    h += '<div class="dash-stock-row" style="margin-top:8px"><span>Grandes</span><span class="dash-stock-val" style="color:' + (stats.bolsasGrande <= 10 ? 'var(--red)' : 'var(--green)') + '">' + stats.bolsasGrande.toLocaleString() + '</span></div><div class="dash-stock-bar-track"><div class="dash-stock-bar-fill" style="width:' + Math.min(100, stats.bolsasGrande / 500 * 100) + '%;background:' + (stats.bolsasGrande <= 10 ? 'var(--red)' : 'var(--green)') + '"></div></div></div>';
    h += '<div class="dash-card ' + (totalAlertas > 0 ? 'dash-card-alert' : '') + '"><h4>' + (totalAlertas > 0 ? '<span style="color:var(--red)">Alertas de Stock</span>' : 'Stock Saludable') + '</h4>';
    if (totalAlertas > 0) {
      h += '<div class="dash-alert-list">';
      for (var ai = 0; ai < Math.min(palaBaja.length, 4); ai++) h += '<div class="dash-alert-item dash-alert-yellow">PALA: ' + palaBaja[ai].nombre + ' <b>' + (palaBaja[ai].stockBolsa || 0) + 'g</b></div>';
      for (var ai2 = 0; ai2 < Math.min(frascosBajos.length, 3); ai2++) h += '<div class="dash-alert-item dash-alert-red">FRASCO: ' + frascosBajos[ai2].nombre + ' <b>pq:' + frascosBajos[ai2].chico + ' gr:' + frascosBajos[ai2].grande + '</b></div>';
      for (var ai3 = 0; ai3 < Math.min(stickerBajos.length, 3); ai3++) h += '<div class="dash-alert-item dash-alert-blue">STICKER: ' + (stickerBajos[ai3].nombre || '?') + ' <b>' + ((stickerBajos[ai3].stockChico||0) + (stickerBajos[ai3].stockGrande||0)) + '</b></div>';
      h += '</div>';
    } else { h += '<div class="est-empty">Todo el inventario esta OK</div>'; }
    h += '</div></div>';

    // Ultimas operaciones
    h += '<div class="dash-section-title"><span class="dash-dot" style="background:var(--text3)"></span>Ultimas Operaciones</div>';
    h += '<div class="dash-grid-2">';
    h += '<div class="dash-card"><h4>Ultimas Ventas</h4>';
    var ultVentas = ventas.slice(0, 5);
    if (ultVentas.length === 0) { h += '<div class="est-empty">Sin ventas</div>'; }
    else {
      h += '<div class="dash-ops-list">';
      for (var uv = 0; uv < ultVentas.length; uv++) {
        var uv2 = ultVentas[uv];
        var uvItems = '';
        if (uv2.items) { for (var uv3 = 0; uv3 < Math.min(2, uv2.items.length); uv3++) { uvItems += (uv2.items[uv3].productoNombre || '?') + ' x' + (uv2.items[uv3].cantidad || 0); if (uv3 < Math.min(2, uv2.items.length) - 1) uvItems += ', '; } if ((uv2.items||[]).length > 2) uvItems += '...'; }
        h += '<div class="dash-op-item"><div class="dash-op-left"><span class="dash-op-date">' + (uv2.fecha || '') + '</span><span class="dash-op-detail">' + uvItems + '</span></div><div class="dash-op-val">$' + (uv2.total || 0).toLocaleString() + '</div></div>';
      }
      h += '</div>';
    }
    h += '</div>';
    h += '<div class="dash-card"><h4>Ultimas Producciones</h4>';
    var ultProd = producciones.slice(0, 5);
    if (ultProd.length === 0) { h += '<div class="est-empty">Sin producciones</div>'; }
    else {
      h += '<div class="dash-ops-list">';
      for (var up = 0; up < ultProd.length; up++) {
        var upr = ultProd[up];
        var tClr = (upr.talla || 'chico') === 'grande' ? 'var(--gold)' : 'var(--blue)';
        h += '<div class="dash-op-item"><div class="dash-op-left"><span class="dash-op-date">' + (upr.fecha || '') + '</span><span class="dash-op-detail">' + (upr.productoNombre || '') + ' <span style="color:' + tClr + ';font-weight:700">' + (upr.talla || 'chico') + '</span></span></div><div class="dash-op-val" style="color:var(--green)">+' + (upr.cantidad || 0) + ' frascos</div></div>';
      }
      h += '</div>';
    }
    h += '</div></div>';

    container.innerHTML = h;

    // === CHARTS ===
    Chart.defaults.color = '#9a8a78';
    Chart.defaults.borderColor = '#3a2218';
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    var diasSorted = Object.keys(diaMap).sort().slice(-15);
    var ctxD = document.getElementById('dash-chart-daily');
    if (ctxD && diasSorted.length > 0) {
      var dLabels = [], dData = [];
      for (var dd = 0; dd < diasSorted.length; dd++) { dLabels.push(diasSorted[dd].slice(5)); dData.push(diaMap[diasSorted[dd]].ingresos); }
      Pages._dashCharts.push(new Chart(ctxD, { type: 'bar', data: { labels: dLabels, datasets: [{ label: 'Ingresos', data: dData, backgroundColor: 'rgba(232,184,75,0.6)', borderColor: '#e8b84b', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.4)' } }, x: { grid: { display: false } } } } }));
    }
    var mesesSorted = Object.keys(monthMap).sort().slice(-12);
    var ctxM = document.getElementById('dash-chart-monthly');
    if (ctxM && mesesSorted.length > 0) {
      var mLabels = [], mData = [];
      for (var mm = 0; mm < mesesSorted.length; mm++) { mLabels.push(mesesSorted[mm]); mData.push(monthMap[mesesSorted[mm]].ingresos); }
      Pages._dashCharts.push(new Chart(ctxM, { type: 'bar', data: { labels: mLabels, datasets: [{ label: 'Ingresos', data: mData, backgroundColor: 'rgba(93,173,226,0.6)', borderColor: '#5dade2', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.4)' } }, x: { grid: { display: false } } } } }));
    }
    var chartWraps = container.querySelectorAll('.dash-chart-wrap');
    for (var cw = 0; cw < chartWraps.length; cw++) chartWraps[cw].style.height = '220px';
  },

  verPedido(key) {
    App.navigate('pedidos');
    setTimeout(function() { var btn = document.querySelector('[data-pedido-key="' + key + '"]'); if (btn) btn.click(); }, 300);
  },

  /* ================================================================
     PRODUCTOS
     ================================================================ */
  renderProductos(container) {
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var packs = ArcanoDB.getPacks();
    var tab = window._prodTab || 'especias';
    var search = (window._prodSearch || '').toLowerCase().trim();
    var costos = ArcanoDB.getCostosInsumos();
    var _espMap = {};
    for (var _ei = 0; _ei < especias.length; _ei++) _espMap[especias[_ei].id] = especias[_ei].nombre;
    var pkgC = (costos.envaseChico||0) + (costos.bolsaChica||0) + (costos.cinta||0) + (costos.stickerChico||0);
    var pkgG = (costos.envaseGrande||0) + (costos.bolsaGrande||0) + (costos.cinta||0) + (costos.stickerGrande||0);

    // Filtrar por búsqueda
    var filteredEspecias = search ? especias.filter(function(e) {
      return e.nombre.toLowerCase().indexOf(search) !== -1 ||
        ((e.categoria || '').toLowerCase().indexOf(search) !== -1) ||
        ((e.categorias || []).join(', ').toLowerCase().indexOf(search) !== -1);
    }) : especias;
    var filteredBlends = search ? blends.filter(function(b) {
      return b.nombre.toLowerCase().indexOf(search) !== -1 ||
        ((b.categoria || '').toLowerCase().indexOf(search) !== -1) ||
        ((b.categorias || []).join(', ').toLowerCase().indexOf(search) !== -1) ||
        ((b.ingredientes || []).map(function(x){return (x.especiaNombre || _espMap[x.especiaId] || '').toLowerCase()}).join(', ').indexOf(search) !== -1);
    }) : blends;
    var filteredPacks = search ? packs.filter(function(p) {
      return p.nombre.toLowerCase().indexOf(search) !== -1 ||
        ((p.descripcion || '').toLowerCase().indexOf(search) !== -1);
    }) : packs;

    var h = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div class="tabs" style="margin-bottom:0;border-bottom:none">' +
        `<button class="tab${tab==='especias' ? ' active' : ''}" onclick="window._prodTab='especias';window._prodSearch='';App.renderPage('productos')">Especias<span class="tab-count">${especias.length}</span></button>` +
        `<button class="tab${tab==='blends' ? ' active' : ''}" onclick="window._prodTab='blends';window._prodSearch='';App.renderPage('productos')">Blends<span class="tab-count">${blends.length}</span></button>` +
        `<button class="tab${tab==='packs' ? ' active' : ''}" onclick="window._prodTab='packs';window._prodSearch='';App.renderPage('productos')">Packs<span class="tab-count">${packs.length}</span></button>` +
        `<button class="tab${tab==='uso' ? ' active' : ''}" onclick="window._prodTab='uso';window._prodSearch='';App.renderPage('productos')">Etiquetas de uso</button>` +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        (tab==='especias' ? '<button class="btn btn-gold" onclick="Pages.formEspecia()">+ Especia</button><button class="btn btn-outline" style="border-color:var(--green);color:var(--green)" onclick="Pages.formImportarExcel()">Importar Recetas</button><button class="btn btn-outline" style="border-color:var(--blue);color:var(--blue)" onclick="Pages.exportarProductosExcel()">Exportar Excel</button><button class="btn btn-outline" style="border-color:var(--gold);color:var(--gold)" onclick="Pages.importarProductosExcel()">Importar Datos</button>' : '') +
        (tab==='blends' ? '<button class="btn btn-gold" onclick="Pages.formBlend()">+ Blend</button>' : '') +
        (tab==='packs' ? '<button class="btn btn-gold" onclick="Pages.formPack()">+ Pack</button>' : '') +
      '</div></div>';

    h += '<div style="border-bottom:2px solid var(--border);margin:8px 0 12px"></div>';

    // Buscador
    if (tab === 'especias' || tab === 'blends' || tab === 'packs') {
      h += '<div style="margin-bottom:12px">' +
        '<input type="text" class="input" id="prod-search-input" placeholder="Buscar por nombre, categoría o ingrediente..." value="' + (window._prodSearch || '').replace(/"/g, '&quot;') + '" ' +
        'style="width:100%;max-width:400px;padding:8px 12px;font-size:.9rem" ' +
        'oninput="window._prodSearch=this.value;App.renderPage(\'productos\');setTimeout(function(){var el=document.getElementById(\'prod-search-input\');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}},0)">' +
        '</div>';
    }

    h += '<div style="border-bottom:2px solid var(--border);margin:8px 0 16px"></div>';

    // --- TAB: ESPECIAS ---
    if (tab === 'especias') {
      if (especias.length === 0) {
        h += '<div class="card"><div class="card-body"><p class="text-muted text-center" style="padding:32px">Sin especias. Crea una o importa desde Excel.</p></div></div>';
      } else if (filteredEspecias.length === 0) {
        h += '<div class="card"><div class="card-body"><p class="text-muted text-center" style="padding:32px">No se encontraron especias para "' + (window._prodSearch || '').replace(/"/g, '&quot;') + '"</p></div></div>';
      } else {
        h += '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Cat.</th><th>Pala</th><th>Grs/Ch</th><th>Grs/Gr</th><th>$Pequeño</th><th>$Grande</th><th>Fr.Ch</th><th>Fr.Gr</th><th>Acciones</th></tr></thead><tbody>';
        for (var i = 0; i < filteredEspecias.length; i++) {
          var e = filteredEspecias[i];
          h += '<tr>' +
            '<td class="fw7">' + e.nombre + '</td>' +
            '<td><span class="badge badge-gold">' + ((e.categorias||[]).length ? (e.categorias||[]).join(', ') : (e.categoria||'—')) + '</span></td>' +
            '<td>' + (e.stockBolsa||0) + 'g</td>' +
            '<td>' + (e.gramosChico||0) + 'g</td>' +
            '<td>' + (e.gramosGrande||0) + 'g</td>' +
            '<td>$' + (e.precioChico||0).toLocaleString() + '</td>' +
            '<td>$' + (e.precioGrande||0).toLocaleString() + '</td>' +
            '<td><span class="' + ((e.stockChico||0)<=3?'text-red fw7':'text-green') + '">' + (e.stockChico||0) + '</span></td>' +
            '<td><span class="' + ((e.stockGrande||0)<=3?'text-red fw7':'text-green') + '">' + (e.stockGrande||0) + '</span></td>' +
            '<td style="white-space:nowrap">' +
              '<button class="btn btn-sm ' + (e.enTienda ? 'btn-green' : 'btn-outline') + ' mr-4" onclick="ArcanoDB.toggleTienda(\'especia\',' + e.id + ');App.renderPage(\'productos\')" title="Tienda">' + (e.enTienda ? 'Tienda ON' : 'Tienda') + '</button>' +
              '<button class="btn btn-sm btn-green mr-4" onclick="Pages.formProduccionRapida(\'especia\',' + e.id + ')">Producir</button>' +
              '<button class="btn btn-sm btn-outline mr-8" onclick="Pages.formEspecia(' + e.id + ')">Editar</button>' +
              '<button class="btn btn-sm btn-red" onclick="Pages.delEspecia(' + e.id + ')">X</button>' +
            '</td></tr>';
        }
        h += '</tbody></table></div>';
      }
    }

    // --- TAB: BLENDS ---
    if (tab === 'blends') {
      if (blends.length === 0) {
        h += '<div class="card"><div class="card-body"><p class="text-muted text-center" style="padding:32px">Sin blends. Crea uno nuevo.</p></div></div>';
      } else if (filteredBlends.length === 0) {
        h += '<div class="card"><div class="card-body"><p class="text-muted text-center" style="padding:32px">No se encontraron blends para "' + (window._prodSearch || '').replace(/"/g, '&quot;') + '"</p></div></div>';
      } else {
        h += '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Cat.</th><th>Region</th><th>Ingredientes</th><th>$Pequeño</th><th>$Grande</th><th>Fr.Ch</th><th>Fr.Gr</th><th>Acciones</th></tr></thead><tbody>';
        for (var i = 0; i < filteredBlends.length; i++) {
          var b = filteredBlends[i];
          var ingN = (b.ingredientes||[]).map(function(x){return x.especiaNombre || _espMap[x.especiaId] || '?'}).join(', ');
          h += '<tr>' +
            '<td class="fw7">' + b.nombre + '</td>' +
            '<td><span class="badge badge-blue">' + ((b.categorias||[]).length ? (b.categorias||[]).join(', ') : (b.categoria||'—')) + '</span></td>' +
            '<td class="text-sm text-muted">' + (b.region||'—') + '</td>' +
            '<td class="text-sm text-muted">' + (ingN||'—') + '</td>' +
            '<td>$' + (b.precioChico||0).toLocaleString() + '</td>' +
            '<td>$' + (b.precioGrande||0).toLocaleString() + '</td>' +
            '<td><span class="' + ((b.stockChico||0)<=3?'text-red fw7':'text-green') + '">' + (b.stockChico||0) + '</span></td>' +
            '<td><span class="' + ((b.stockGrande||0)<=3?'text-red fw7':'text-green') + '">' + (b.stockGrande||0) + '</span></td>' +
            '<td style="white-space:nowrap">' +
              '<button class="btn btn-sm btn-outline mr-4" onclick="Pages.formBlend(' + b.id + ')" title="Editar">Editar</button>' +
              '<button class="btn btn-sm ' + (b.enTienda ? 'btn-green' : 'btn-outline') + ' mr-4" onclick="ArcanoDB.toggleTienda(\'blend\',' + b.id + ');App.renderPage(\'productos\')" title="Tienda">' + (b.enTienda ? 'Tienda ON' : 'Tienda') + '</button>' +
              '<button class="btn btn-sm btn-green mr-4" onclick="Pages.formProduccionRapida(\'blend\',' + b.id + ')">Producir</button>' +
              '<button class="btn btn-sm btn-red" onclick="Pages.delBlend(' + b.id + ')">X</button>' +
            '</td></tr>';
        }
        h += '</tbody></table></div>';
      }
    }

    // --- TAB: PACKS ---
    if (tab === 'packs') {
      if (packs.length === 0) {
        h += '<div class="card"><div class="card-body"><p class="text-muted text-center" style="padding:32px">Sin packs. Crea uno nuevo combinando blends.</p></div></div>';
      } else if (filteredPacks.length === 0) {
        h += '<div class="card"><div class="card-body"><p class="text-muted text-center" style="padding:32px">No se encontraron packs para "' + (window._prodSearch || '').replace(/"/g, '&quot;') + '"</p></div></div>';
      } else {
        h += '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Blends</th><th>Precio</th><th>Costo</th><th>Margen</th><th>Stock</th><th>Tienda</th><th>Acciones</th></tr></thead><tbody>';
        for (var i = 0; i < filteredPacks.length; i++) {
          var pk = filteredPacks[i];
          var bi3 = pk.blendItems || [];
          var pkBlendNames = [];
          var pkCosto = 0;
          for (var j = 0; j < bi3.length; j++) {
            var bIt = bi3[j];
            var bObj = ArcanoDB.getBlend(bIt.blendId);
            if (bObj) {
              pkBlendNames.push(bObj.nombre + ' (' + (bIt.talla || 'chico') + ')');
              var bC = 0;
              var bI2 = bObj.ingredientes || [];
              for (var k = 0; k < bI2.length; k++) {
                var bIn = bI2[k];
                var cp = (costos.especias && costos.especias[bIn.especiaId]) || 0;
                bC += ((bIt.talla === 'grande' ? (bIn.gramosGrande || 0) : (bIn.gramosChico || 0))) * cp;
              }
              bC += (bIt.talla === 'grande' ? pkgG : pkgC);
              pkCosto += bC;
            }
          }
          var pkPrecio = Number(pk.precio) || 0;
          var pkMargen = pkPrecio - pkCosto;
          var pkPct = pkPrecio > 0 ? (pkMargen / pkPrecio * 100) : 0;
          var pkMC = pkMargen >= 0 ? 'var(--green)' : 'var(--red)';
          var pkStk = pk.stock || 0;
          h += '<tr>' +
            '<td class="fw7">' + pk.nombre + '</td>' +
            '<td class="text-sm">' + (pkBlendNames.length ? pkBlendNames.join(', ') : '<span class="text-muted">Sin blends</span>') + '</td>' +
            '<td class="fw7" style="color:var(--gold)">$' + pkPrecio.toLocaleString() + '</td>' +
            '<td style="color:var(--red)">$' + pkCosto.toFixed(1) + '</td>' +
            '<td style="color:' + pkMC + '">$' + pkMargen.toFixed(1) + ' (' + pkPct.toFixed(0) + '%)</td>' +
            '<td class="fw7" style="color:' + (pkStk > 0 ? 'var(--green)' : 'var(--red)') + '">' + pkStk + '</td>' +
            '<td><button class="btn btn-sm ' + (pk.enTienda ? 'btn-green' : 'btn-outline') + '" onclick="ArcanoDB.toggleTienda(\'pack\',' + pk.id + ');App.renderPage(\'productos\')" title="Tienda">' + (pk.enTienda ? 'ON' : 'OFF') + '</button></td>' +
            '<td style="white-space:nowrap">' +
              '<button class="btn btn-sm btn-green mr-4" onclick="Pages.formProduccionPack(' + pk.id + ')">Producir</button>' +
              '<button class="btn btn-sm btn-outline mr-4" onclick="Pages.formPack(' + pk.id + ')">Editar</button>' +
              '<button class="btn btn-sm btn-red" onclick="Pages.delPack(' + pk.id + ')">X</button>' +
            '</td></tr>';
        }
        h += '</tbody></table></div>';
      }
    }

    // --- TAB: ETIQUETAS DE USO ---
    if (tab === 'uso') {
      var allTags = ArcanoDB.getProductTags();
      var catKeys = ['Comidas', 'Infusiones', 'Cocteleria'];
      h += '<div class="card"><div class="card-body">';
      for (var ci = 0; ci < catKeys.length; ci++) {
        var cat = catKeys[ci];
        var tags = allTags[cat] || [];
        h += '<div style="margin-bottom:20px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span class="badge badge-gold" style="min-width:100px;text-align:center">' + cat + '</span>' +
          `<input type="text" class="input" id="new-tag-${ci}" placeholder="Nueva etiqueta de uso..." style="flex:1;padding:6px 10px;font-size:.85rem" onkeydown="if(event.key==='Enter')Pages.doAddTag('${cat}',${ci})">` +
          `<button class="btn btn-sm btn-outline" onclick="Pages.doAddTag('${cat}',${ci})">+ Agregar</button></div>` +
          '<div style="display:flex;flex-wrap:wrap;gap:6px">';
        for (var ti = 0; ti < tags.length; ti++) {
          h += '<span class="tag-chip-admin"><span>' + tags[ti] + '</span><button onclick="Pages.doRemoveTag(\'' + cat + '\',\'' + tags[ti].replace(/'/g, '&apos;') + '\')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:1rem;padding:0 2px">X</button></span>';
        }
        if (tags.length === 0) h += '<span class="text-sm text-muted">Sin etiquetas de uso</span>';
        h += '</div></div>';
      }
      h += '</div></div>';
    }

    container.innerHTML = h;
  },

  /* ==================== ESPECIA FORM ====================  /* ==================== ESPECIA FORM ==================== */
  formEspecia(editId) {
    var esp = (editId != null) ? ArcanoDB.getEspecia(editId) : null;
    var isEdit = (esp != null);

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.setAttribute('data-edit-id', isEdit ? String(editId) : '');

    var inner = '<div class="modal modal-lg">' +
      '<div class="modal-header"><h3>' + (isEdit ? 'Editar: ' + esp.nombre : 'Nueva Especia') + '</h3>' +
      '<button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Nombre</label><input type="text" class="input" id="f-esp-nombre" value="' + (isEdit ? esp.nombre : '') + '" placeholder="Ej: Curcuma" ' + '></div>' +
        '<div class="form-group"><label>Categorias</label><div class="cat-checks">' +
        '<label class="cat-check"><input type="checkbox" value="Comidas" id="f-esp-cat-comidas"' + (isEdit && (esp.categorias || []).indexOf('Comidas') >= 0 ? ' checked' : (!isEdit ? ' checked' : '')) + '><span>Comidas</span></label>' +
        '<label class="cat-check"><input type="checkbox" value="Infusiones" id="f-esp-cat-infusiones"' + (isEdit && (esp.categorias || []).indexOf('Infusiones') >= 0 ? ' checked' : '') + '><span>Infusiones</span></label>' +
        '<label class="cat-check"><input type="checkbox" value="Cocteleria" id="f-esp-cat-cocteleria"' + (isEdit && (esp.categorias || []).indexOf('Cocteleria') >= 0 ? ' checked' : '') + '><span>Cocteleria</span></label>' +
        '</div></div>' +
        '<div class="card" style="border-color:var(--gold)"><div class="card-header"><h3>Precios de Venta</h3></div><div class="card-body">' +
        '<div class="g2"><div class="form-group"><label>Precio Pequeño ($)</label><input type="number" class="input" id="f-esp-pc" value="' + (isEdit ? esp.precioChico : '') + '" placeholder="Ej: 8000" min="0"></div>' +
        '<div class="form-group"><label>Precio Grande ($)</label><input type="number" class="input" id="f-esp-pg" value="' + (isEdit ? esp.precioGrande : '') + '" placeholder="Ej: 18000" min="0"></div></div>' +
        '<p class="text-xs text-muted">Estos son los precios que se mostraran en la tienda.</p></div></div>' +
        '<div class="g2"><div class="form-group"><label>Gramos por Frasco Pequeño</label><input type="number" class="input" id="f-esp-gc" value="' + (isEdit ? esp.gramosChico : '') + '" placeholder="Ej: 30" min="0"></div>' +
        '<div class="form-group"><label>Gramos por Frasco Grande</label><input type="number" class="input" id="f-esp-gg" value="' + (isEdit ? esp.gramosGrande : '') + '" placeholder="Ej: 80" min="0"></div></div>' +
        '<div class="card mt-12" style="background:var(--bg);border-color:var(--gold)"><div class="card-header"><h3>Tienda Online</h3></div><div class="card-body">' +
        '<div class="form-group"><label>Visible en Tienda</label><select class="input" id="f-esp-tienda"><option value="0"' + (isEdit && !esp.enTienda ? ' selected' : '') + '>No</option><option value="1"' + (isEdit && esp.enTienda ? ' selected' : (!isEdit ? ' selected' : '')) + '>Si</option></select></div>' +
        '<p class="text-xs text-muted mb-8">Precio especial para la tienda online (opcional). Si lo dejas vacio se usara el precio de venta.</p>' +
        '<div class="g2"><div class="form-group"><label>Precio Tienda Pequeño ($)</label><input type="number" class="input" id="f-esp-tc" value="' + (isEdit ? (esp.precioTiendaChico||'') : '') + '" placeholder="Igual al de venta" min="0"></div>' +
        '<div class="form-group"><label>Precio Tienda Grande ($)</label><input type="number" class="input" id="f-esp-tg" value="' + (isEdit ? (esp.precioTiendaGrande||'') : '') + '" placeholder="Igual al de venta" min="0"></div></div>' +
        '<div class="form-group"><label>Imagen</label><div class="img-upload-area" id="img-area-esp"><input type="file" accept="image/*" id="f-esp-img" style="display:none" onchange="Pages.handleImageUpload(this,\'img-area-esp\')">' +
        (isEdit && esp.imagen ? '<img src="' + esp.imagen + '" class="img-preview" id="img-preview-esp"><button class="btn btn-sm btn-red" style="margin-top:6px" onclick="Pages.removeImage(\'img-area-esp\',\'f-esp-img\')">Quitar imagen</button>' : '') +
        '<div class="img-upload-placeholder" onclick="document.getElementById(\'f-esp-img\').click()"><span>+ Click para subir imagen</span></div></div></div>' +
        '</div></div>' +
        '<div class="form-group"><label>Etiquetas de uso</label><div id="tag-area-esp">' + Pages.buildTagSelectorHtml(isEdit && (esp.categorias || []).length ? esp.categorias[0] : 'Comidas', isEdit ? (esp.tags || []) : []) + '</div></div>' +
        '<div class="form-group"><label>Descripcion (opcional)</label><textarea class="input" id="f-esp-desc" rows="2" placeholder="Breve descripcion del producto para la tienda...">' + (isEdit ? (esp.descripcion||'') : '') + '</textarea></div>' +
        '<div class="form-group"><label>Uso / Preparaciones (opcional)</label><div id="uso-area-esp">' + Pages.buildUsoSelectorHtml(isEdit ? (esp.uso||'') : '') + '</div></div>' +
        (isEdit ? '<p class="text-xs text-muted mt-8">Stock: ' + (esp.stockBolsa||0) + 'g pala, ' + (esp.stockChico||0) + ' fr pequeño, ' + (esp.stockGrande||0) + ' fr grande</p>' : '') +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-esp">Guardar</button>' +
      '</div></div>';
    modal.innerHTML = inner;
    document.body.appendChild(modal);

    // Bind save button (no inline onclick with id interpolation)
    document.getElementById('btn-save-esp').addEventListener('click', function() {
      var nombre = document.getElementById('f-esp-nombre').value.trim();
      if (!nombre) { alert('Ingresa un nombre'); return; }
      var previewEl = document.getElementById('img-preview-esp');
      var data = {
        nombre: nombre,
        categorias: Pages._getCheckedCats('esp'),
        precioChico: Number(document.getElementById('f-esp-pc').value) || 0,
        precioGrande: Number(document.getElementById('f-esp-pg').value) || 0,
        gramosChico: Number(document.getElementById('f-esp-gc').value) || 0,
        gramosGrande: Number(document.getElementById('f-esp-gg').value) || 0,
        enTienda: document.getElementById('f-esp-tienda').value === '1' || (Number(document.getElementById('f-esp-pc').value) || Number(document.getElementById('f-esp-pg').value)) > 0,
        precioTiendaChico: Number(document.getElementById('f-esp-tc').value) || 0,
        precioTiendaGrande: Number(document.getElementById('f-esp-tg').value) || 0,
        imagen: previewEl ? previewEl.src : '',
        descripcion: (document.getElementById('f-esp-desc') || {}).value ? document.getElementById('f-esp-desc').value.trim() : '',
        uso: Pages.getSelectedUsos(),
        tags: Pages.getSelectedTags()
      };
      if (isEdit) {
        data.id = editId;  // CRITICAL: set the existing ID
      }
      try {
        ArcanoDB.saveEspecia(data);
        modal.remove();
        App.renderPage('productos');
      } catch (err) { alert('Error: ' + err.message); }
    });

    if (!isEdit) document.getElementById('f-esp-nombre').focus();
  },

  delEspecia(id) {
    var esp = ArcanoDB.getEspecia(id);
    if (!esp) return;
    if (!confirm('Eliminar "' + esp.nombre + '"?')) return;
    ArcanoDB.deleteEspecia(id);
    App.renderPage('productos');
  },

  /* ==================== BLEND FORM ==================== */
  formBlend(editId) {
    var bl = (editId != null) ? ArcanoDB.getBlend(editId) : null;
    var isEdit = (bl != null);
    var especias = ArcanoDB.getEspecias();
    var ings = isEdit ? (bl.ingredientes || []) : [{ especiaId: '', gramosChico: '', gramosGrande: '' }];

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.setAttribute('data-edit-id', isEdit ? String(editId) : '');

    var espOptions = '<option value="">Seleccionar</option>';
    for (var i = 0; i < especias.length; i++) {
      espOptions += '<option value="' + especias[i].id + '">' + especias[i].nombre + '</option>';
    }

    var inner = '<div class="modal modal-lg">' +
      '<div class="modal-header"><h3>' + (isEdit ? 'Editar: ' + bl.nombre : 'Nuevo Blend') + '</h3>' +
      '<button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Nombre</label><input type="text" class="input" id="f-bl-nombre" value="' + (isEdit ? bl.nombre : '') + '" placeholder="Ej: Curry Casero" ' + '></div>' +
        '<div class="g2">' +
          '<div class="form-group"><label>Categorias</label><div class="cat-checks">' +
          '<label class="cat-check"><input type="checkbox" value="Comidas" id="f-bl-cat-comidas"' + (isEdit && (bl.categorias || []).indexOf('Comidas') >= 0 ? ' checked' : (!isEdit ? ' checked' : '')) + '><span>Comidas</span></label>' +
          '<label class="cat-check"><input type="checkbox" value="Infusiones" id="f-bl-cat-infusiones"' + (isEdit && (bl.categorias || []).indexOf('Infusiones') >= 0 ? ' checked' : '') + '><span>Infusiones</span></label>' +
          '<label class="cat-check"><input type="checkbox" value="Cocteleria" id="f-bl-cat-cocteleria"' + (isEdit && (bl.categorias || []).indexOf('Cocteleria') >= 0 ? ' checked' : '') + '><span>Cocteleria</span></label>' +
        '</div></div>' +
          '<div class="form-group"><label>Region (opcional)</label><input type="text" class="input" id="f-bl-region" value="' + (isEdit ? (bl.region||'') : '') + '" placeholder="Ej: India"></div>' +
        '</div>' +
        '<div class="form-group"><label>Uso (opcional)</label><div id="uso-area-bl">' + Pages.buildUsoSelectorHtml(isEdit ? (bl.uso||'') : '') + '</div></div>' +
        '<div class="card" style="border-color:var(--gold)"><div class="card-header"><h3>Precios de Venta</h3></div><div class="card-body">' +
        '<div class="g2"><div class="form-group"><label>Precio Pequeño ($)</label><input type="number" class="input" id="f-bl-pc" value="' + (isEdit ? bl.precioChico : '') + '" placeholder="Ej: 8000" min="0"></div>' +
        '<div class="form-group"><label>Precio Grande ($)</label><input type="number" class="input" id="f-bl-pg" value="' + (isEdit ? bl.precioGrande : '') + '" placeholder="Ej: 18000" min="0"></div></div>' +
        '<p class="text-xs text-muted">Estos son los precios que se mostraran en la tienda.</p></div></div>' +
        '<div class="form-group"><label>Ingredientes</label><div id="blend-ings"></div>' +
        '<button class="btn btn-sm btn-outline mt-8" id="btn-add-ing">+ Ingrediente</button></div>' +
        '<div id="f-bl-cost-preview"></div>' +
        '<div class="card mt-12" style="background:var(--bg);border-color:var(--gold)"><div class="card-header"><h3>Tienda Online</h3></div><div class="card-body">' +
        '<div class="form-group"><label>Visible en Tienda</label><select class="input" id="f-bl-tienda"><option value="0"' + (isEdit && !bl.enTienda ? ' selected' : '') + '>No</option><option value="1"' + (isEdit && bl.enTienda ? ' selected' : (!isEdit ? ' selected' : '')) + '>Si</option></select></div>' +
        '<p class="text-xs text-muted mb-8">Precio especial para la tienda online (opcional). Si lo dejas vacio se usara el precio de venta.</p>' +
        '<div class="g2"><div class="form-group"><label>Precio Tienda Pequeño ($)</label><input type="number" class="input" id="f-bl-tc" value="' + (isEdit ? (bl.precioTiendaChico||'') : '') + '" placeholder="Igual al de venta" min="0"></div>' +
        '<div class="form-group"><label>Precio Tienda Grande ($)</label><input type="number" class="input" id="f-bl-tg" value="' + (isEdit ? (bl.precioTiendaGrande||'') : '') + '" placeholder="Igual al de venta" min="0"></div></div>' +
        '<div class="form-group"><label>Imagen</label><div class="img-upload-area" id="img-area-bl"><input type="file" accept="image/*" id="f-bl-img" style="display:none" onchange="Pages.handleImageUpload(this,\'img-area-bl\')">' +
        (isEdit && bl.imagen ? '<img src="' + bl.imagen + '" class="img-preview" id="img-preview-bl"><button class="btn btn-sm btn-red" style="margin-top:6px" onclick="Pages.removeImage(\'img-area-bl\',\'f-bl-img\')">Quitar imagen</button>' : '') +
        '<div class="img-upload-placeholder" onclick="document.getElementById(\'f-bl-img\').click()"><span>+ Click para subir imagen</span></div></div></div>' +
        '</div></div>' +
        '<div class="form-group"><label>Etiquetas de uso</label><div id="tag-area-bl">' + Pages.buildTagSelectorHtml(isEdit && (bl.categorias || []).length ? bl.categorias[0] : 'Comidas', isEdit ? (bl.tags || []) : []) + '</div></div>' +
        '<div class="form-group"><label>Descripcion (opcional)</label><textarea class="input" id="f-bl-desc" rows="2" placeholder="Breve descripcion del blend para la tienda...">' + (isEdit ? (bl.descripcion||'') : '') + '</textarea></div>' +
        (isEdit ? '<p class="text-xs text-muted mt-8">Stock: ' + (bl.stockChico||0) + ' fr pequeño, ' + (bl.stockGrande||0) + ' fr grande</p>' : '') +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-bl">Guardar</button>' +
      '</div></div>';
    modal.innerHTML = inner;
    document.body.appendChild(modal);

    // Build ingredient rows
    var ingContainer = document.getElementById('blend-ings');
    var espOptsHTML = espOptions; // capture

    function addIngRow(ing) {
      var div = document.createElement('div');
      div.className = 'g4 mb-8';
      div.style.alignItems = 'end';
      var gc = ing ? (ing.gramosChico || '') : '';
      var gg = ing ? (ing.gramosGrande || '') : '';
      var selVal = ing ? ing.especiaId : '';
      div.innerHTML =
        '<div class="form-group" style="margin:0"><label>Especia</label><select class="input ing-esp">' + espOptsHTML + '</select></div>' +
        '<div class="form-group" style="margin:0"><label>Grs/Pequeño</label><input type="number" class="input ing-gc" value="' + gc + '" placeholder="0" min="0"></div>' +
        '<div class="form-group" style="margin:0"><label>Grs/Grande</label><input type="number" class="input ing-gg" value="' + gg + '" placeholder="0" min="0"></div>' +
        '<div><button class="btn btn-sm btn-red btn-rm-ing">X</button></div>';
      if (selVal) div.querySelector('.ing-esp').value = selVal;
      div.querySelector('.btn-rm-ing').addEventListener('click', function() { div.remove(); Pages._updateBlendCost(); });
      div.querySelector('.ing-esp').addEventListener('change', function() { Pages._updateBlendCost(); });
      div.querySelector('.ing-gc').addEventListener('input', function() { Pages._updateBlendCost(); });
      div.querySelector('.ing-gg').addEventListener('input', function() { Pages._updateBlendCost(); });
      ingContainer.appendChild(div);
    }

    for (var i = 0; i < ings.length; i++) addIngRow(ings[i]);
    document.getElementById('btn-add-ing').addEventListener('click', function() { addIngRow(null); Pages._updateBlendCost(); });
    document.getElementById('f-bl-pc').addEventListener('input', function() { Pages._updateBlendCost(); });
    document.getElementById('f-bl-pg').addEventListener('input', function() { Pages._updateBlendCost(); });
    Pages._updateBlendCost();

    // Save
    document.getElementById('btn-save-bl').addEventListener('click', function() {
      var nombre = document.getElementById('f-bl-nombre').value.trim();
      if (!nombre) { alert('Ingresa un nombre'); return; }
      var rows = ingContainer.querySelectorAll('.g4');
      var ingredientes = [];
      for (var r = 0; r < rows.length; r++) {
        var espId = Number(rows[r].querySelector('.ing-esp').value);
        var gc = Number(rows[r].querySelector('.ing-gc').value) || 0;
        var gg = Number(rows[r].querySelector('.ing-gg').value) || 0;
        if (!espId) continue;
        var espObj = null;
        for (var s = 0; s < especias.length; s++) { if (especias[s].id === espId) { espObj = especias[s]; break; } }
        ingredientes.push({ especiaId: espId, especiaNombre: espObj ? espObj.nombre : '', gramosChico: gc, gramosGrande: gg });
      }
      var data = {
        nombre: nombre,
        categorias: Pages._getCheckedCats('bl'),
        region: (document.getElementById('f-bl-region') || {}).value ? document.getElementById('f-bl-region').value.trim() : '',
        uso: Pages.getSelectedUsos(),
        precioChico: Number(document.getElementById('f-bl-pc').value) || 0,
        precioGrande: Number(document.getElementById('f-bl-pg').value) || 0,
        ingredientes: ingredientes,
        enTienda: document.getElementById('f-bl-tienda').value === '1' || (Number(document.getElementById('f-bl-pc').value) || Number(document.getElementById('f-bl-pg').value)) > 0,
        precioTiendaChico: Number(document.getElementById('f-bl-tc').value) || 0,
        precioTiendaGrande: Number(document.getElementById('f-bl-tg').value) || 0,
        imagen: (document.getElementById('img-preview-bl') || {}).src || '',
        descripcion: (document.getElementById('f-bl-desc') || {}).value ? document.getElementById('f-bl-desc').value.trim() : '',
        tags: Pages.getSelectedTags()
      };
      if (isEdit) {
        data.id = editId;  // CRITICAL: set the existing ID
      }
      try {
        ArcanoDB.saveBlend(data);
        modal.remove();
        App.renderPage('productos');
      } catch (err) { alert('Error: ' + err.message); }
    });

    if (!isEdit) document.getElementById('f-bl-nombre').focus();
  },

  _updateBlendCost: function() {
    var costos = ArcanoDB.getCostosInsumos();
    var pkgC = (costos.envaseChico||0) + (costos.bolsaChica||0) + (costos.cinta||0) + (costos.stickerChico||0);
    var pkgG = (costos.envaseGrande||0) + (costos.bolsaGrande||0) + (costos.cinta||0) + (costos.stickerGrande||0);
    var rows = document.querySelectorAll('#blend-ings .g4');
    var costEspC = 0, costEspG = 0;
    var lines = [];
    var especias = ArcanoDB.getEspecias();
    for (var i = 0; i < rows.length; i++) {
      var espId = Number(rows[i].querySelector('.ing-esp').value);
      var gc = Number(rows[i].querySelector('.ing-gc').value) || 0;
      var gg = Number(rows[i].querySelector('.ing-gg').value) || 0;
      if (!espId) continue;
      var cp = (costos.especias && costos.especias[espId]) || 0;
      var cC = gc * cp;
      var cG = gg * cp;
      costEspC += cC;
      costEspG += cG;
      var espName = '';
      for (var s = 0; s < especias.length; s++) { if (especias[s].id === espId) { espName = especias[s].nombre; break; } }
      if (gc > 0 || gg > 0) lines.push(espName + ': ' + gc + 'g=$' + cC.toFixed(0) + ' / ' + gg + 'g=$' + cG.toFixed(0));
    }
    var totalC = costEspC + pkgC;
    var totalG = costEspG + pkgG;
    var precioC = Number((document.getElementById('f-bl-pc') || {}).value) || 0;
    var precioG = Number((document.getElementById('f-bl-pg') || {}).value) || 0;
    var margenC = precioC - totalC;
    var margenG = precioG - totalG;
    var pctC = precioC > 0 ? (margenC / precioC * 100).toFixed(1) : '0';
    var pctG = precioG > 0 ? (margenG / precioG * 100).toFixed(1) : '0';
    var el = document.getElementById('f-bl-cost-preview');
    if (!el) return;
    el.innerHTML = '<div class="card mt-12" style="background:var(--bg);border-color:var(--gold)"><div class="card-header"><h3>Costo de Produccion</h3></div><div class="card-body">' +
      '<div class="text-xs text-muted mb-8">Envase+Bolsa+Cinta+Sticker: Pequeno=$' + pkgC.toFixed(0) + ' / Grande=$' + pkgG.toFixed(0) + '</div>' +
      (lines.length ? '<div class="text-xs mb-8" style="line-height:1.8">' + lines.join('<br>') + '</div>' : '<div class="text-xs text-muted mb-8">Agrega ingredientes para ver el costo</div>') +
      '<div style="border-top:1px solid var(--border);padding-top:8px" class="g2">' +
        '<div><div class="fw7">Pequeno</div><div class="text-sm">Especias: $' + costEspC.toFixed(0) + ' + Empaque: $' + pkgC.toFixed(0) + ' = <b style="color:var(--red)">$' + totalC.toFixed(0) + '</b></div>' +
          (precioC > 0 ? '<div class="text-xs mt-4">Venta: $' + precioC + ' | Margen: <span style="color:' + (margenC >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + margenC.toFixed(0) + ' (' + pctC + '%)</span></div>' : '') + '</div>' +
        '<div><div class="fw7">Grande</div><div class="text-sm">Especias: $' + costEspG.toFixed(0) + ' + Empaque: $' + pkgG.toFixed(0) + ' = <b style="color:var(--red)">$' + totalG.toFixed(0) + '</b></div>' +
          (precioG > 0 ? '<div class="text-xs mt-4">Venta: $' + precioG + ' | Margen: <span style="color:' + (margenG >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + margenG.toFixed(0) + ' (' + pctG + '%)</span></div>' : '') + '</div>' +
      '</div></div></div>';
  },

  delBlend(id) {
    var bl = ArcanoDB.getBlend(id);
    if (!bl) return;
    if (!confirm('Eliminar "' + bl.nombre + '"?')) return;
    ArcanoDB.deleteBlend(id);
    App.renderPage('productos');
  },

  /* ---------- PACK FORM ---------- */
  formPack(editId) {
    var existing = (editId != null) ? ArcanoDB.getPack(editId) : null;
    var isEdit = !!existing;
    var blends = ArcanoDB.getBlends();
    var costos = ArcanoDB.getCostosInsumos();
    var pkgC = (costos.envaseChico||0) + (costos.bolsaChica||0) + (costos.cinta||0) + (costos.stickerChico||0);
    var pkgG = (costos.envaseGrande||0) + (costos.bolsaGrande||0) + (costos.cinta||0) + (costos.stickerGrande||0);

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    var inner = '<div class="modal modal-lg" style="max-width:700px">' +
      '<div class="modal-header"><h3>' + (isEdit ? 'Editar Pack: ' + existing.nombre : 'Nuevo Pack de Blends') + '</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Nombre del Pack</label><input type="text" class="input" id="f-pk-nombre" value="' + (isEdit ? (existing.nombre||'').replace(/"/g, '&quot;') : '') + '" placeholder="Ej: Pack Desayuno"></div>' +
        '<div class="form-group"><label>Descripcion</label><textarea class="input" id="f-pk-desc" rows="2" placeholder="Descripcion del pack...">' + (isEdit ? (existing.descripcion||'') : '') + '</textarea></div>' +
        '<div class="form-group"><label>Precio de Venta</label><div style="position:relative"><span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gold)">$</span><input type="number" class="input" id="f-pk-precio" value="' + (isEdit ? (existing.precio||0) : '') + '" min="0" step="0.01" style="padding-left:24px;max-width:200px"></div></div>' +
        '<div class="form-group"><label>Imagen</label><div class="img-upload-area" id="img-area-pk"><input type="file" accept="image/*" id="f-pk-img" style="display:none" onchange="Pages.handleImageUpload(this,\'img-area-pk\')">' +
        (isEdit && existing.imagen ? '<img src="' + existing.imagen + '" class="img-preview" id="img-preview-pk"><button class="btn btn-sm btn-red" style="margin-top:6px" onclick="Pages.removeImage(\'img-area-pk\',\'f-pk-img\')">Quitar imagen</button>' : '') +
        '<div class="img-upload-placeholder" onclick="document.getElementById(\'f-pk-img\').click()"><span>+ Click para subir imagen</span></div></div></div>' +
        '<h4 class="mt-12 mb-8">Blends que componen el Pack</h4><div id="f-pk-items">';

    var items = isEdit ? (existing.blendItems || []) : [];
    for (var i = 0; i < Math.max(items.length, 1); i++) {
      var it = items[i] || {};
      var opts = '';
      for (var b = 0; b < blends.length; b++) {
        opts += '<option value="' + blends[b].id + '"' + (it.blendId === blends[b].id ? ' selected' : '') + '>' + blends[b].nombre + '</option>';
      }
      inner += '<div class="card mb-8 pk-item" style="background:var(--bg)"><div class="card-body" style="padding:10px"><div class="g3">' +
        '<div class="form-group" style="margin:0"><label>Blend</label><select class="input pk-blend-sel">' + opts + '</select></div>' +
        '<div class="form-group" style="margin:0"><label>Talla</label><select class="input pk-talla-sel"><option value="chico"' + (it.talla==='grande' ? '' : ' selected') + '>Pequeno</option><option value="grande"' + (it.talla==='grande' ? ' selected' : '') + '>Grande</option></select></div>' +
        '<div style="display:flex;align-items:flex-end"><button class="btn btn-sm btn-red" onclick="this.closest(\'.pk-item\').remove();Pages._updatePackCost()">Quitar</button></div>' +
        '</div></div></div>';
    }

    inner += '</div><button class="btn btn-sm btn-outline" onclick="Pages._addPackItem()">+ Agregar Blend</button>' +
      '<div id="f-pk-cost-preview" class="mt-12"></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-pk-save">Guardar Pack</button>' +
      '</div></div>';

    modal.innerHTML = inner;
    document.body.appendChild(modal);
    setTimeout(function() { Pages._updatePackCost(); }, 100);

    document.getElementById('btn-pk-save').addEventListener('click', function() {
      var nombre = document.getElementById('f-pk-nombre').value.trim();
      if (!nombre) { alert('Ingresa un nombre'); return; }
      var blendItems = [];
      var itemEls = document.querySelectorAll('.pk-item');
      for (var j = 0; j < itemEls.length; j++) {
        var sel = itemEls[j].querySelector('.pk-blend-sel');
        var tallaSel = itemEls[j].querySelector('.pk-talla-sel');
        if (sel && sel.value) {
          blendItems.push({ blendId: Number(sel.value), talla: tallaSel ? tallaSel.value : 'chico' });
        }
      }
      if (blendItems.length < 2) { alert('Un pack debe tener al menos 2 blends'); return; }
      var data = {
        nombre: nombre,
        descripcion: document.getElementById('f-pk-desc').value.trim(),
        precio: Number(document.getElementById('f-pk-precio').value) || 0,
        imagen: (document.getElementById('img-preview-pk') || {}).src || '',
        blendItems: blendItems,
        enTienda: isEdit ? (existing.enTienda || false) : false
      };
      if (isEdit) data.id = editId;
      try {
        ArcanoDB.savePack(data);
        modal.remove();
        App.renderPage('productos');
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  _addPackItem: function() {
    var container = document.getElementById('f-pk-items');
    var blends = ArcanoDB.getBlends();
    var opts = '';
    for (var b = 0; b < blends.length; b++) opts += '<option value="' + blends[b].id + '">' + blends[b].nombre + '</option>';
    var div = document.createElement('div');
    div.className = 'card mb-8 pk-item';
    div.style.background = 'var(--bg)';
    div.innerHTML = '<div class="card-body" style="padding:10px"><div class="g3">' +
      '<div class="form-group" style="margin:0"><label>Blend</label><select class="input pk-blend-sel">' + opts + '</select></div>' +
      '<div class="form-group" style="margin:0"><label>Talla</label><select class="input pk-talla-sel"><option value="chico">Pequeno</option><option value="grande">Grande</option></select></div>' +
      '<div style="display:flex;align-items:flex-end"><button class="btn btn-sm btn-red" onclick="this.closest(\'.pk-item\').remove();Pages._updatePackCost()">Quitar</button></div>' +
      '</div></div></div>';
    container.appendChild(div);
    Pages._updatePackCost();
  },

  _updatePackCost: function() {
    var costos = ArcanoDB.getCostosInsumos();
    var pkgC = (costos.envaseChico||0) + (costos.bolsaChica||0) + (costos.cinta||0) + (costos.stickerChico||0);
    var pkgG = (costos.envaseGrande||0) + (costos.bolsaGrande||0) + (costos.cinta||0) + (costos.stickerGrande||0);
    var itemEls = document.querySelectorAll('.pk-item');
    var totalCosto = 0;
    var lines = [];
    for (var i = 0; i < itemEls.length; i++) {
      var sel = itemEls[i].querySelector('.pk-blend-sel');
      var tallaSel = itemEls[i].querySelector('.pk-talla-sel');
      var bl = ArcanoDB.getBlend(Number(sel.value));
      if (bl) {
        var talla = tallaSel.value;
        var c = 0;
        var ings = bl.ingredientes || [];
        for (var j = 0; j < ings.length; j++) {
          var cp = (costos.especias && costos.especias[ings[j].especiaId]) || 0;
          c += ((talla === 'grande' ? (ings[j].gramosGrande||0) : (ings[j].gramosChico||0))) * cp;
        }
        c += (talla === 'grande' ? pkgG : pkgC);
        totalCosto += c;
        lines.push(bl.nombre + ' (' + talla + '): $' + c.toFixed(2));
      }
    }
    var precio = Number((document.getElementById('f-pk-precio') || {}).value) || 0;
    var margen = precio - totalCosto;
    var pct = precio > 0 ? (margen / precio * 100).toFixed(1) : '0';
    var el = document.getElementById('f-pk-cost-preview');
    if (el) {
      el.innerHTML = '<div class="card" style="background:var(--bg)"><div class="card-body" style="padding:10px">' +
        '<div class="fw7 mb-4">Costo del Pack</div>' +
        (lines.length ? lines.join('<br>') : '<span class="text-muted">Selecciona blends</span>') +
        '<div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px">' +
        '<span class="fw7">Costo total: </span><span style="color:var(--red)">$' + totalCosto.toFixed(2) + '</span>' +
        (precio > 0 ? ' | <span class="fw7">Margen: </span><span style="color:' + (margen >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + margen.toFixed(2) + ' (' + pct + '%)</span>' : '') +
        '</div></div></div>';
    }
  },

  formProduccionPack(packId) {
    var pk = ArcanoDB.getPack(packId);
    if (!pk) { alert('Pack no encontrado'); return; }
    var blendItems = pk.blendItems || [];
    if (blendItems.length === 0) { alert('Este pack no tiene blends asignados'); return; }

    var db = ArcanoDB.getDB();
    var envases = db.stockEnvases || { chico: 0, grande: 0 };
    var stickers = db.stickers || {};
    var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
    var cintas = db.stockCintas || 0;

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';

    var blendRows = '';
    for (var i = 0; i < blendItems.length; i++) {
      var bl = ArcanoDB.getBlend(blendItems[i].blendId);
      var blName = bl ? bl.nombre : 'Blend #' + blendItems[i].blendId;
      var talla = blendItems[i].talla || 'chico';
      var frascoKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
      var stockDisp = bl ? (bl[frascoKey] || 0) : 0;
      blendRows += '<div class="card mb-8" style="background:var(--bg)"><div class="card-body" style="padding:10px">' +
        '<div class="fw7">' + blName + ' <span class="badge ' + (talla==='grande' ? 'badge-gold' : 'badge-blue') + '">' + talla + '</span></div>' +
        '<div class="text-sm mt-4">Stock disponible: <span class="fw7">' + stockDisp + ' frascos</span></div>' +
        '</div></div>';
    }

    modal.innerHTML = '<div class="modal modal-lg" style="max-width:600px">' +
      '<div class="modal-header"><h3>Producir Pack: ' + pk.nombre + '</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Cantidad de packs</label><input type="number" class="input" id="f-pkprod-cant" value="1" min="1" style="max-width:120px" oninput="Pages._updatePackProdPreview(' + packId + ')"></div>' +
        '<h4 class="mt-12 mb-8">Blends del pack</h4>' +
        '<div id="f-pkprod-items">' + blendRows + '</div>' +
        '<div id="f-pkprod-preview" class="mt-12"></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-pkprod">Producir</button>' +
      '</div></div>';

    document.body.appendChild(modal);
    setTimeout(function() { Pages._updatePackProdPreview(packId); }, 100);

    document.getElementById('btn-pkprod').addEventListener('click', function() {
      var cant = Number(document.getElementById('f-pkprod-cant').value) || 0;
      if (cant <= 0) { alert('Ingresa una cantidad valida'); return; }
      try {
        ArcanoDB.producirPack(packId, cant);
        modal.remove();
        App.renderPage('productos');
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  _updatePackProdPreview: function(packId) {
    var pk = ArcanoDB.getPack(packId);
    if (!pk) return;
    var blendItems = pk.blendItems || [];
    var cant = Number((document.getElementById('f-pkprod-cant') || {}).value) || 0;
    var allOk = true;
    var h = '<div class="card"><div class="card-body">';

    // Check stock de cada blend
    for (var i = 0; i < blendItems.length; i++) {
      var bl = ArcanoDB.getBlend(blendItems[i].blendId);
      if (bl) {
        var talla = blendItems[i].talla || 'chico';
        var frascoKey = talla === 'grande' ? 'stockGrande' : 'stockChico';
        var disponible = bl[frascoKey] || 0;
        var ok = disponible >= cant;
        if (!ok) allOk = false;
        h += '<div class="list-row"><span>' + bl.nombre + ' (' + talla + ')</span><span class="' + (ok ? 'text-green' : 'text-red fw7') + '">' + disponible + ' fr → necesita ' + cant + ' ' + (ok ? 'OK' : 'FALTA') + '</span></div>';
      }
    }

    h += '</div></div>';
    var el = document.getElementById('f-pkprod-preview');
    if (el) el.innerHTML = h;
    var btn = document.getElementById('btn-pkprod');
    if (btn) btn.disabled = !allOk || cant <= 0;
  },

  delPack(id) {
    var pk = ArcanoDB.getPack(id);
    if (!pk) return;
    if (!confirm('Eliminar pack "' + pk.nombre + '"?')) return;
    ArcanoDB.deletePack(id);
    App.renderPage('productos');
  },

  /* ================================================================
     INSUMOS
     ================================================================ */
  renderInsumos(container) {
    var db = ArcanoDB.getDB();
    var envases = db.stockEnvases || { chico: 0, grande: 0 };
    var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
    var especias = ArcanoDB.getEspecias();
    var etiqList = ArcanoDB.getProductosConStickers();
    var entradas = ArcanoDB.getEntradas();

    var cintas = db.stockCintas || 0;
    var costos = ArcanoDB.getCostosInsumos();
    var h = '<div class="page-actions"><button class="btn btn-gold" onclick="Pages.formEntrada()">+ Registrar Entrada</button><button class="btn btn-outline" style="margin-left:8px" onclick="Pages.formCostosInsumos()">✏ Editar Costos</button></div>';
    h += '<div class="stats-grid mt-12" style="grid-template-columns: repeat(5, 1fr)">' +
      '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value" style="color:var(--blue)">' + (envases.chico||0) + '</div><div class="stat-label">Frascos Pequeños</div></div>' +
      '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value" style="color:var(--blue)">' + (envases.grande||0) + '</div><div class="stat-label">Frascos Grandes</div></div>' +
      '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value" style="color:var(--green)">' + (bolsas.chico||0) + '</div><div class="stat-label">Bolsas Chicas</div></div>' +
      '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value" style="color:var(--green)">' + (bolsas.grande||0) + '</div><div class="stat-label">Bolsas Grandes</div></div>' +
      '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value" style="color:var(--gold)">' + cintas + '</div><div class="stat-label">Cintas</div></div></div>';

    h += '<div class="g2 mt-16" style="gap:16px">';
    // Especias en pala
    h += '<div class="card"><div class="card-header"><h3>Pala (materia prima)</h3></div><div class="card-body">';
    if (especias.length === 0) { h += '<p class="text-muted text-center text-sm">Sin especias</p>'; }
    else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Especia</th><th>Cat.</th><th>Gramos</th></tr></thead><tbody>';
      for (var i = 0; i < especias.length; i++) {
        var e = especias[i];
        var cls = (e.stockBolsa||0) <= 50 ? 'text-red fw7' : (e.stockBolsa||0) <= 200 ? 'text-yellow fw7' : 'text-green';
        h += '<tr><td class="fw7">' + e.nombre + '</td><td class="text-sm">' + ((e.categorias||[]).length ? (e.categorias||[]).join(', ') : (e.categoria||'')) + '</td><td class="' + cls + '">' + (e.stockBolsa||0) + ' grs</td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    // Stickers
    h += '<div class="card"><div class="card-header"><h3>Stickers</h3></div><div class="card-body">';
    if (etiqList.length === 0) { h += '<p class="text-muted text-center text-sm">Sin productos</p>'; }
    else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Tipo</th><th>Pequeño</th><th>Grande</th></tr></thead><tbody>';
      for (var i = 0; i < etiqList.length; i++) {
        var et = etiqList[i];
        h += '<tr><td class="fw7">' + et.nombre + '</td><td><span class="badge ' + (et.tipo==='blend'?'badge-blue':'badge-gold') + '">' + (et.tipo==='blend'?'Blend':'Especia') + '</span></td>' +
          '<td class="' + (et.stockChico<=5?'text-red fw7':'') + '">' + et.stockChico + '</td>' +
          '<td class="' + (et.stockGrande<=5?'text-red fw7':'') + '">' + et.stockGrande + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div></div>';

    // Historial
    h += '<div class="card mt-16"><div class="card-header"><h3>Historial de Entradas</h3></div><div class="card-body">';
    if (entradas.length === 0) { h += '<p class="text-muted text-center">Sin entradas.</p>'; }
    else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Items</th><th>Total</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < Math.min(entradas.length, 30); i++) {
        var en = entradas[i];
        var desc = (en.items||[]).map(function(it) {
          if (it.tipo==='especia_grs') return (it.especiaNombre||'?') + ' ' + it.cantidad + 'grs';
          if (it.tipo==='envase') return 'Frascos ' + (it.talla||'chico') + ' x' + it.cantidad;
          if (it.tipo==='bolsa') return 'Bolsas ' + (it.talla||'chico') + ' x' + it.cantidad;
          if (it.tipo==='sticker') return 'Stk ' + (it.stickerNombre||'?') + ' ' + (it.talla||'chico') + ' x' + it.cantidad;
          if (it.tipo==='cinta') return 'Cintas x' + it.cantidad;
          return '?';
        }).join(' | ');
        h += '<tr><td>' + (en.fecha||'') + '</td><td class="text-sm">' + desc + '</td><td class="fw7 text-gold">$' + (en.total||0).toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-red" onclick="Pages.delEntrada(' + en.id + ')">X</button></td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;
  },

  /* ---------- Entrada Form ---------- */
  formEntrada() {
    var especias = ArcanoDB.getEspecias();
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg">' +
      '<div class="modal-header"><h3>Registrar Entrada</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Fecha</label><input type="date" class="input" id="f-ent-fecha" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
        '<div class="form-group"><label>Proveedor (opcional)</label><input type="text" class="input" id="f-ent-prov" placeholder="Nombre"></div>' +
        '<div class="form-group"><label>Items</label><div id="ent-items"></div>' +
        '<button class="btn btn-sm btn-outline mt-8" id="btn-add-ent">+ Item</button></div>' +
        '<div class="venta-total-box mt-12">Total: $<span id="ent-total">0</span></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-ent">Registrar</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var itemsDiv = document.getElementById('ent-items');

    function buildEspOpts() {
      var o = '';
      var esps = ArcanoDB.getEspecias();
      for (var i = 0; i < esps.length; i++) o += '<option value="' + esps[i].id + '">' + esps[i].nombre + '</option>';
      o += '<option value="__new__">+ Nueva especia...</option>';
      return o;
    }

    function buildProductoOpts() {
      var o = '';
      var esps = ArcanoDB.getEspecias();
      var bls = ArcanoDB.getBlends();
      if (esps.length > 0) {
        o += '<optgroup label="Especias">';
        for (var i = 0; i < esps.length; i++) o += '<option value="especia|' + esps[i].id + '">' + esps[i].nombre + '</option>';
        o += '</optgroup>';
      }
      if (bls.length > 0) {
        o += '<optgroup label="Blends">';
        for (var i = 0; i < bls.length; i++) o += '<option value="blend|' + bls[i].id + '">' + bls[i].nombre + '</option>';
        o += '</optgroup>';
      }
      o += '<option value="__new__">+ Nuevo producto...</option>';
      return o;
    }

    function addEntRow() {
      var div = document.createElement('div');
      div.className = 'card mb-8';
      div.style.background = 'var(--bg)';
      div.innerHTML = '<div class="card-body" style="padding:12px">' +
        '<div class="g4 mb-8">' +
          '<div class="form-group" style="margin:0"><label>Tipo</label><select class="input ent-tipo"><option value="especia_grs">Especia (grs)</option><option value="envase">Frascos</option><option value="bolsa">Bolsas</option><option value="cinta">Cintas</option><option value="sticker">Stickers</option></select></div>' +
          '<div class="form-group" style="margin:0" id="ent-detail-placeholder"></div>' +
          '<div class="form-group" style="margin:0"><label>Cantidad</label><input type="number" class="input ent-cant" placeholder="0" min="0"></div>' +
          '<div class="form-group" style="margin:0"><label>Costo Unit.</label><input type="number" class="input ent-cost" placeholder="0" min="0"></div>' +
        '</div>' +
        '<div style="text-align:right"><button class="btn btn-sm btn-red btn-rm-ent">Quitar</button></div>' +
        '</div>';
      itemsDiv.appendChild(div);

      var tipoSel = div.querySelector('.ent-tipo');
      var detailDiv = div.querySelector('#ent-detail-placeholder');
      detailDiv.removeAttribute('id');

      function renderDetail() {
        var t = tipoSel.value;
        if (t === 'especia_grs') {
          detailDiv.innerHTML = '<label>Especia</label><select class="input ent-especia"><option value="">Seleccionar</option>' + buildEspOpts() + '</select><input type="text" class="input ent-especia-new" placeholder="Nombre nueva especia..." style="display:none;margin-top:6px">';
          var espSel2 = detailDiv.querySelector('.ent-especia');
          var newInput = detailDiv.querySelector('.ent-especia-new');
          espSel2.addEventListener('change', function() {
            if (this.value === '__new__') {
              this.style.display = 'none';
              newInput.style.display = 'block';
              newInput.focus();
            }
          });
          newInput.addEventListener('blur', function() {
            if (!this.value.trim()) {
              this.style.display = 'none';
              espSel2.style.display = 'block';
              espSel2.value = '';
            }
          });
          newInput.addEventListener('keydown', function(ev) {
            if (ev.key === 'Escape') { this.value = ''; this.blur(); }
          });
        } else if (t === 'envase') {
          detailDiv.innerHTML = '<label>Talla</label><select class="input ent-talla"><option value="chico">Pequeño</option><option value="grande">Grande</option></select>';
        } else if (t === 'bolsa') {
          detailDiv.innerHTML = '<label>Talla</label><select class="input ent-talla"><option value="chico">Chica</option><option value="grande">Grande</option></select>';
        } else if (t === 'cinta') {
          detailDiv.innerHTML = '';
        } else {
          detailDiv.innerHTML = '<label>Producto</label><select class="input ent-stk-nombre"><option value="">Seleccionar</option>' + buildProductoOpts() + '</select><input type="text" class="input ent-stk-new-nombre" placeholder="Nombre nuevo producto..." style="display:none;margin-top:6px"><select class="input ent-stk-new-tipo" style="display:none;margin-top:6px"><option value="especia">Especia</option><option value="blend">Blend</option></select><label class="mt-8" style="display:block">Talla</label><select class="input ent-talla"><option value="chico">Pequeño</option><option value="grande">Grande</option></select>';
          var stkSel = detailDiv.querySelector('.ent-stk-nombre');
          var stkNewNombre = detailDiv.querySelector('.ent-stk-new-nombre');
          var stkNewTipo = detailDiv.querySelector('.ent-stk-new-tipo');
          var stkTalla = detailDiv.querySelectorAll('.ent-talla')[0];
          stkSel.addEventListener('change', function() {
            if (this.value === '__new__') {
              this.style.display = 'none';
              stkNewTipo.style.display = 'block';
              stkNewNombre.style.display = 'block';
              stkNewNombre.focus();
            }
          });
          stkNewNombre.addEventListener('blur', function() {
            if (!this.value.trim()) {
              this.style.display = 'none';
              stkNewTipo.style.display = 'none';
              stkSel.style.display = 'block';
              stkSel.value = '';
            }
          });
          stkNewNombre.addEventListener('keydown', function(ev) {
            if (ev.key === 'Escape') { this.value = ''; this.blur(); }
          });
        }
      }
      tipoSel.addEventListener('change', renderDetail);
      renderDetail();
      div.querySelector('.btn-rm-ent').addEventListener('click', function() { div.remove(); updateTotal(); });
      div.querySelector('.ent-cant').addEventListener('input', updateTotal);
      div.querySelector('.ent-cost').addEventListener('input', updateTotal);
    }

    function updateTotal() {
      var rows = itemsDiv.children;
      var total = 0;
      for (var i = 0; i < rows.length; i++) {
        var c = Number(rows[i].querySelector('.ent-cant').value) || 0;
        var co = Number(rows[i].querySelector('.ent-cost').value) || 0;
        total += c * co;
      }
      document.getElementById('ent-total').textContent = total.toLocaleString();
    }

    addEntRow();
    document.getElementById('btn-add-ent').addEventListener('click', addEntRow);

    document.getElementById('btn-save-ent').addEventListener('click', function() {
      var rows = itemsDiv.children;
      var items = [];
      var total = 0;
      var esps = ArcanoDB.getEspecias();
      var bls = ArcanoDB.getBlends();

      for (var i = 0; i < rows.length; i++) {
        var tipo = rows[i].querySelector('.ent-tipo').value;
        var cant = Number(rows[i].querySelector('.ent-cant').value) || 0;
        var cost = Number(rows[i].querySelector('.ent-cost').value) || 0;
        if (cant <= 0) continue;
        var item = { tipo: tipo, cantidad: cant, costoUnitario: cost };
        total += cant * cost;
        if (tipo === 'especia_grs') {
          var newEspInput = rows[i].querySelector('.ent-especia-new');
          var espSel = rows[i].querySelector('.ent-especia');
          if (newEspInput && newEspInput.style.display !== 'none' && newEspInput.value.trim()) {
            var newName = newEspInput.value.trim();
            var existingEsp = null;
            for (var s = 0; s < esps.length; s++) { if (esps[s].nombre.toLowerCase() === newName.toLowerCase()) { existingEsp = esps[s]; break; } }
            if (existingEsp) {
              item.especiaId = existingEsp.id;
              item.especiaNombre = existingEsp.nombre;
            } else {
              var newEsp = ArcanoDB.saveEspecia({ nombre: newName });
              item.especiaId = newEsp.id;
              item.especiaNombre = newEsp.nombre;
              esps = ArcanoDB.getEspecias();
            }
          } else if (espSel && espSel.value && espSel.value !== '__new__') {
            item.especiaId = Number(espSel.value);
            var espObj = null;
            for (var s = 0; s < esps.length; s++) { if (esps[s].id === item.especiaId) { espObj = esps[s]; break; } }
            item.especiaNombre = espObj ? espObj.nombre : '?';
          } else {
            alert('Falta especia en item ' + (i+1)); return;
          }
          if (!item.especiaId) { alert('Falta especia en item ' + (i+1)); return; }
        } else if (tipo === 'envase') {
          item.talla = rows[i].querySelector('.ent-talla').value;
        } else if (tipo === 'bolsa') {
          item.talla = rows[i].querySelector('.ent-talla').value;
        } else if (tipo === 'sticker') {
          var stkSel = rows[i].querySelector('.ent-stk-nombre');
          var stkNewNombre = rows[i].querySelector('.ent-stk-new-nombre');
          var stkNewTipo = rows[i].querySelector('.ent-stk-new-tipo');
          if (stkSel && stkSel.style.display !== 'none') {
            var stkVal = stkSel.value || '';
            if (!stkVal || stkVal === '__new__') { alert('Falta producto de sticker en item ' + (i+1)); return; }
            var stkParts = stkVal.split('|');
            item.stickerTipo = stkParts[0];
            var stkId = Number(stkParts[1]);
            var stkObj = stkParts[0] === 'blend' ? ArcanoDB.getBlend(stkId) : ArcanoDB.getEspecia(stkId);
            item.stickerNombre = stkObj ? stkObj.nombre : '?';
          } else if (stkNewNombre && stkNewNombre.style.display !== 'none' && stkNewNombre.value.trim()) {
            var newProdName = stkNewNombre.value.trim();
            var newProdTipo = stkNewTipo ? stkNewTipo.value : 'especia';
            item.stickerTipo = newProdTipo;
            if (newProdTipo === 'blend') {
              var newBl = ArcanoDB.saveBlend({ nombre: newProdName });
              item.stickerNombre = newBl.nombre;
            } else {
              var newEsp2 = ArcanoDB.saveEspecia({ nombre: newProdName });
              item.stickerNombre = newEsp2.nombre;
            }
          } else {
            alert('Falta producto de sticker en item ' + (i+1)); return;
          }
          if (!item.stickerNombre) { alert('Falta producto de sticker en item ' + (i+1)); return; }
          item.talla = rows[i].querySelector('.ent-talla').value;
        }
        items.push(item);
      }
      if (items.length === 0) { alert('Agrega al menos un item'); return; }
      try {
        ArcanoDB.saveEntrada({ fecha: document.getElementById('f-ent-fecha').value, proveedor: document.getElementById('f-ent-prov').value.trim(), items: items, total: total });
        modal.remove();
        App.renderPage('insumos');
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  delEntrada(id) {
    if (!confirm('Eliminar esta entrada?')) return;
    ArcanoDB.deleteEntrada(id);
    App.renderPage('insumos');
  },

  formCostosInsumos() {
    var costos = ArcanoDB.getCostosInsumos();
    var especias = ArcanoDB.getEspecias();
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    var espCostosRows = '';
    for (var i = 0; i < especias.length; i++) {
      var e = especias[i];
      var val = (costos.especias && costos.especias[e.id]) || 0;
      espCostosRows += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<label style="flex:1;font-size:0.85rem">' + e.nombre + ' ($/g)</label>' +
        '<input type="number" class="input" style="width:120px" id="f-cos-esp-' + e.id + '" value="' + val + '" min="0" step="0.1">' +
        '</div>';
    }
    modal.innerHTML = '<div class="modal">' +
      '<div class="modal-header"><h3>Editar Costos de Insumos</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<h4 style="margin-bottom:8px">Packaging</h4>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
          '<div class="form-group"><label>Envase Chico</label><input type="number" class="input" id="f-cos-env-c" value="' + (costos.envaseChico||0) + '" min="0"></div>' +
          '<div class="form-group"><label>Envase Grande</label><input type="number" class="input" id="f-cos-env-g" value="' + (costos.envaseGrande||0) + '" min="0"></div>' +
          '<div class="form-group"><label>Bolsa Chica</label><input type="number" class="input" id="f-cos-bol-c" value="' + (costos.bolsaChica||0) + '" min="0"></div>' +
          '<div class="form-group"><label>Bolsa Grande</label><input type="number" class="input" id="f-cos-bol-g" value="' + (costos.bolsaGrande||0) + '" min="0"></div>' +
          '<div class="form-group"><label>Cinta</label><input type="number" class="input" id="f-cos-cinta" value="' + (costos.cinta||0) + '" min="0"></div>' +
          '<div class="form-group"><label>Sticker Chico</label><input type="number" class="input" id="f-cos-stk-c" value="' + (costos.stickerChico||0) + '" min="0"></div>' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:4px"><label>Sticker Grande</label><input type="number" class="input" id="f-cos-stk-g" value="' + (costos.stickerGrande||0) + '" min="0"></div>' +
        '<h4 style="margin:16px 0 8px">Costo de Especias ($/g)</h4>' +
        (espCostosRows || '<p class="text-muted text-sm">No hay especias registradas.</p>') +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-costos">Guardar</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    document.getElementById('btn-save-costos').addEventListener('click', function() {
      var data = {
        envaseChico: Number(document.getElementById('f-cos-env-c').value) || 0,
        envaseGrande: Number(document.getElementById('f-cos-env-g').value) || 0,
        bolsaChica: Number(document.getElementById('f-cos-bol-c').value) || 0,
        bolsaGrande: Number(document.getElementById('f-cos-bol-g').value) || 0,
        cinta: Number(document.getElementById('f-cos-cinta').value) || 0,
        stickerChico: Number(document.getElementById('f-cos-stk-c').value) || 0,
        stickerGrande: Number(document.getElementById('f-cos-stk-g').value) || 0,
        especias: {}
      };
      for (var i = 0; i < especias.length; i++) {
        var v = Number(document.getElementById('f-cos-esp-' + especias[i].id).value) || 0;
        if (v > 0) data.especias[especias[i].id] = v;
      }
      ArcanoDB.saveCostosInsumos(data);
      modal.remove();
      App.renderPage('insumos');
    });
  },

  /* ================================================================
     PRODUCCION
     ================================================================ */
  renderProduccion(container) {
    var prods = ArcanoDB.getProducciones();
    var h = '<div class="page-actions"><button class="btn btn-gold" onclick="Pages.formProduccion()">+ Nueva Produccion</button></div>';
    h += '<div class="card mt-16"><div class="card-header"><h3>Historial</h3></div><div class="card-body">';
    if (prods.length === 0) {
      h += '<p class="text-muted text-center">Sin producciones.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Talla</th><th>Cant.</th><th>Detalle</th></tr></thead><tbody>';
      for (var i = 0; i < Math.min(prods.length, 30); i++) {
        var p = prods[i];
        var det = p.tipo === 'blend' ?
          (p.ingredientes||[]).map(function(x){return x.especiaNombre+' '+x.gramosTotal+'g'}).join(', ') :
          (p.gramosTotal||0) + 'g consumidos';
        h += '<tr><td>' + (p.fecha||'') + '</td>' +
          '<td><span class="badge ' + (p.tipo==='blend'?'badge-blue':'badge-gold') + '">' + (p.tipo==='blend'?'Blend':'Especia') + '</span></td>' +
          '<td class="fw7">' + (p.productoNombre||'') + '</td>' +
          '<td><span class="badge ' + ((p.talla||'chico')==='grande'?'badge-gold':'badge-blue') + '">' + (p.talla||'chico') + '</span></td>' +
          '<td class="fw7 text-green">' + (p.cantidad||0) + ' fr</td>' +
          '<td class="text-sm">' + det + ' | Env:' + (p.envasesConsumidos||0) + ' Stk:' + (p.stickersConsumidos||0) + ' Bol:' + (p.bolsasConsumidas||0) + ' Cin:' + (p.cintasConsumidas||0) + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;
  },

  /** Produccion rapida desde Productos */
  formProduccionRapida(tipo, productoId) {
    Pages.formProduccion(tipo, productoId);
  },

  /** Formulario de produccion — tipo y productoId son opcionales (pre-llenan) */
  formProduccion(presetTipo, presetProdId) {
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg">' +
      '<div class="modal-header"><h3>Nueva Produccion</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Tipo</label><select class="input" id="f-prod-tipo"><option value="especia">Especia</option><option value="blend">Blend</option></select></div>' +
        '<div class="form-group"><label>Producto</label><select class="input" id="f-prod-prod"><option value="">Seleccionar</option></select></div>' +
        '<div class="g2"><div class="form-group"><label>Talla</label><select class="input" id="f-prod-talla"><option value="chico">Pequeño</option><option value="grande">Grande</option></select></div>' +
        '<div class="form-group"><label>Cantidad de frascos</label><input type="number" class="input" id="f-prod-cant" value="1" min="1"></div></div>' +
        '<div id="f-prod-preview" class="mt-12"></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-prod">Producir</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var tipoSel = document.getElementById('f-prod-tipo');
    var prodSel = document.getElementById('f-prod-prod');
    var tallaSel = document.getElementById('f-prod-talla');
    var cantInput = document.getElementById('f-prod-cant');
    var previewDiv = document.getElementById('f-prod-preview');
    var prodBtn = document.getElementById('btn-prod');
    prodBtn.disabled = true;

    function loadProductos() {
      var tipo = tipoSel.value;
      var list = tipo === 'blend' ? ArcanoDB.getBlends() : ArcanoDB.getEspecias();
      prodSel.innerHTML = '<option value="">Seleccionar</option>';
      for (var i = 0; i < list.length; i++) {
        prodSel.innerHTML += '<option value="' + list[i].id + '">' + list[i].nombre + '</option>';
      }
      previewDiv.innerHTML = '';
      prodBtn.disabled = true;
    }

    function updatePreview() {
      var tipo = tipoSel.value;
      var prodId = Number(prodSel.value);
      var talla = tallaSel.value;
      var cant = Number(cantInput.value) || 0;
      if (!prodId || cant <= 0) { previewDiv.innerHTML = ''; prodBtn.disabled = true; return; }

      var producto = tipo === 'blend' ? ArcanoDB.getBlend(prodId) : ArcanoDB.getEspecia(prodId);
      if (!producto) { previewDiv.innerHTML = '<p class="text-red">Producto no encontrado</p>'; prodBtn.disabled = true; return; }

      var db = ArcanoDB.getDB();
      var envases = db.stockEnvases || { chico: 0, grande: 0 };
      var allOk = true;
      var h = '<div class="card"><div class="card-body">' +
        '<p class="fw7 mb-8">Producir ' + cant + ' frasco' + (cant>1?'s':'') + ' ' + talla + ' de <span class="text-gold">' + producto.nombre + '</span></p>';

      if (tipo === 'especia') {
        var gpf = talla === 'grande' ? (Number(producto.gramosGrande)||0) : (Number(producto.gramosChico)||0);
        var grsTotal = gpf * cant;
        var bolsaOk = (producto.stockBolsa||0) >= grsTotal;
        if (!bolsaOk) allOk = false;
        h += '<div class="list-row"><span>Pala de ' + producto.nombre + '</span><span class="' + (bolsaOk?'text-green':'text-red fw7') + '">' + (producto.stockBolsa||0) + 'g disponible → necesita ' + grsTotal + 'g ' + (bolsaOk?'OK':'FALTA') + '</span></div>';
      } else {
        // Blend ingredients
        var ings = producto.ingredientes || [];
        if (ings.length === 0) {
          h += '<p class="text-red">Este blend no tiene ingredientes definidos. Editalo primero.</p>';
          allOk = false;
        } else {
          for (var i = 0; i < ings.length; i++) {
            var esp = ArcanoDB.getEspecia(ings[i].especiaId);
            var gpf2 = talla === 'grande' ? (Number(ings[i].gramosGrande)||0) : (Number(ings[i].gramosChico)||0);
            var needed = gpf2 * cant;
            var avail = esp ? (esp.stockBolsa||0) : 0;
            var ok = avail >= needed;
            if (!ok) allOk = false;
            h += '<div class="list-row"><span>' + (esp?esp.nombre:'?') + ' (pala)</span><span class="' + (ok?'text-green':'text-red fw7') + '">' + avail + 'g → necesita ' + needed + 'g ' + (ok?'OK':'FALTA') + '</span></div>';
          }
        }
      }

      // Envases
      var envAvail = envases[talla] || 0;
      var envOk = envAvail >= cant;
      if (!envOk) allOk = false;
      h += '<div class="list-row"><span>Envases ' + talla + '</span><span class="' + (envOk?'text-green':'text-red fw7') + '">' + envAvail + ' → necesita ' + cant + ' ' + (envOk?'OK':'FALTA') + '</span></div>';

      // Stickers
      var stkAvail = 0;
      var stkKeys = Object.keys(db.stickers || {});
      for (var j = 0; j < stkKeys.length; j++) {
        if (db.stickers[stkKeys[j]].nombre === producto.nombre) {
          stkAvail = Number(db.stickers[stkKeys[j]][talla==='grande'?'stockGrande':'stockChico']) || 0;
          break;
        }
      }
      var stkOk = stkAvail >= cant;
      if (!stkOk) allOk = false;
      h += '<div class="list-row"><span>Stickers ' + talla + '</span><span class="' + (stkOk?'text-green':'text-red fw7') + '">' + stkAvail + ' → necesita ' + cant + ' ' + (stkOk?'OK':'FALTA') + '</span></div>';

      // Bolsas (packaging)
      var bolsaAvail = (db.stockBolsas && db.stockBolsas[talla]) || 0;
      var bolsaOk = bolsaAvail >= cant;
      if (!bolsaOk) allOk = false;
      h += '<div class="list-row"><span>Bolsas ' + talla + '</span><span class="' + (bolsaOk?'text-green':'text-red fw7') + '">' + bolsaAvail + ' → necesita ' + cant + ' ' + (bolsaOk?'OK':'FALTA') + '</span></div>';

      // Cintas
      var cintaAvail = db.stockCintas || 0;
      var cintaOk = cintaAvail >= cant;
      if (!cintaOk) allOk = false;
      h += '<div class="list-row"><span>Cintas</span><span class="' + (cintaOk?'text-green':'text-red fw7') + '">' + cintaAvail + ' → necesita ' + cant + ' ' + (cintaOk?'OK':'FALTA') + '</span></div>';

      h += '</div></div>';
      previewDiv.innerHTML = h;
      prodBtn.disabled = !allOk;
    }

    tipoSel.addEventListener('change', function() { loadProductos(); });
    prodSel.addEventListener('change', updatePreview);
    tallaSel.addEventListener('change', updatePreview);
    cantInput.addEventListener('input', updatePreview);

    // PRODUCE BUTTON — the critical missing handler
    prodBtn.addEventListener('click', function() {
      var tipo = tipoSel.value;
      var prodId = Number(prodSel.value);
      var talla = tallaSel.value;
      var cant = Number(cantInput.value) || 0;
      if (!prodId || cant <= 0) { alert('Selecciona producto y cantidad'); return; }
      try {
        if (tipo === 'blend') {
          ArcanoDB.producirBlend(prodId, talla, cant);
        } else {
          ArcanoDB.producirEspecia(prodId, talla, cant);
        }
        modal.remove();
        App.renderPage(App.currentPage);
      } catch (err) { alert('Error: ' + err.message); }
    });

    // Preset values if called from Productos
    if (presetTipo) tipoSel.value = presetTipo;
    loadProductos();
    if (presetProdId) {
      prodSel.value = presetProdId;
      updatePreview();
    }
  },

  /* ================================================================
     VENTAS
     ================================================================ */
  renderVentas(container) {
    var ventas = ArcanoDB.getVentas();
    var h = '<div class="page-actions"><button class="btn btn-gold" onclick="Pages.formVenta()">+ Nueva Venta</button>' +
      '<button class="btn btn-outline" onclick="Pages.formVentaQR()" style="margin-left:8px">\u{1F4F7} Vender por QR</button></div>';

    // Configuracion de Pago (QR)
    var qrImg = Pages._qrPagoImage;
    h += '<div class="card mt-16"><div class="card-header"><h3>Configuracion de Pago</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted" style="margin-bottom:12px">Imagen QR para mostrar al cliente al pagar. Se usa en Puntos de Venta y al entregar pedidos.</p>';
    if (qrImg) {
      h += '<div style="margin-bottom:12px"><img src="' + qrImg + '" style="max-width:200px;max-height:200px;border-radius:8px;border:1px solid var(--border)"></div>';
      h += '<button class="btn btn-outline" onclick="Pages._removeQrPago()" style="margin-right:8px">Eliminar QR</button>';
    } else {
      h += '<div style="padding:20px;margin-bottom:12px;border:2px dashed var(--border);border-radius:8px;color:var(--muted);text-align:center">No hay QR configurado</div>';
    }
    h += '<button class="btn btn-gold" onclick="Pages._uploadQrPago()">Subir QR</button>';
    h += '<input type="file" id="qr-pago-input" accept="image/*" style="display:none">';
    h += '</div></div>';

    h += '<div class="card mt-16"><div class="card-header"><h3>Historial</h3></div><div class="card-body">';
    if (ventas.length === 0) {
      h += '<p class="text-muted text-center">Sin ventas.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Items</th><th>Total</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < Math.min(ventas.length, 30); i++) {
        var v = ventas[i];
        var desc = (v.items||[]).map(function(it){ return (it.productoNombre||'?')+' '+(it.talla||'chico')+' x'+(it.cantidad||0)+' ($'+(it.subtotal||0).toLocaleString()+')'; }).join(' | ');
        h += '<tr><td>' + (v.fecha||'') + '</td><td class="text-sm">' + desc + '</td><td class="fw7 text-gold">$' + (v.total||0).toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-red" onclick="Pages.delVenta(' + v.id + ')">X</button></td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;
  },

  formVenta() {
    var frascos = ArcanoDB.getFrascosParaVender();
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg">' +
      '<div class="modal-header"><h3>Nueva Venta</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Fecha</label><input type="date" class="input" id="f-v-fecha" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
        '<div class="form-group"><label>Items</label><div id="v-items"></div>' +
        '<button class="btn btn-sm btn-outline mt-8" id="btn-add-vitem">+ Item</button></div>' +
        '<div class="venta-total-box mt-12">Total: $<span id="v-total">0</span></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-v">Vender</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var itemsDiv = document.getElementById('v-items');

    function buildFrascoOpts() {
      var list = ArcanoDB.getFrascosParaVender();
      var o = '<option value="">Seleccionar</option>';
      for (var i = 0; i < list.length; i++) {
        var f = list[i];
        o += '<option value="' + f.tipo + '|' + f.id + '|' + f.talla + '" data-precio="' + f.precio + '" data-stock="' + f.stock + '">' +
          f.nombre + ' (' + f.talla + ') - $' + f.precio.toLocaleString() + ' [stock:' + f.stock + ']</option>';
      }
      return o;
    }

    function addVItemRow() {
      var div = document.createElement('div');
      div.className = 'g4 mb-8';
      div.style.alignItems = 'end';
      div.innerHTML =
        '<div class="form-group" style="margin:0"><label>Producto</label><select class="input vi-prod">' + buildFrascoOpts() + '</select></div>' +
        '<div class="form-group" style="margin:0"><label>Cantidad</label><input type="number" class="input vi-cant" value="1" min="1"></div>' +
        '<div class="form-group" style="margin:0"><label>Precio Unit.</label><input type="number" class="input vi-precio" placeholder="0"></div>' +
        '<div><button class="btn btn-sm btn-red btn-rm-vi">X</button></div>';
      itemsDiv.appendChild(div);

      var prodSel = div.querySelector('.vi-prod');
      var cantInp = div.querySelector('.vi-cant');
      var precioInp = div.querySelector('.vi-precio');

      prodSel.addEventListener('change', function() {
        var opt = prodSel.options[prodSel.selectedIndex];
        precioInp.value = opt.dataset.precio || '';
        cantInp.max = opt.dataset.stock || 999;
        if (Number(cantInp.value) > Number(opt.dataset.stock)) cantInp.value = opt.dataset.stock;
        updateTotal();
      });
      cantInp.addEventListener('input', updateTotal);
      precioInp.addEventListener('input', updateTotal);
      div.querySelector('.btn-rm-vi').addEventListener('click', function() { div.remove(); updateTotal(); });
    }

    function updateTotal() {
      var rows = itemsDiv.children;
      var total = 0;
      for (var i = 0; i < rows.length; i++) {
        total += (Number(rows[i].querySelector('.vi-cant').value)||0) * (Number(rows[i].querySelector('.vi-precio').value)||0);
      }
      document.getElementById('v-total').textContent = total.toLocaleString();
    }

    addVItemRow();
    document.getElementById('btn-add-vitem').addEventListener('click', addVItemRow);

    document.getElementById('btn-save-v').addEventListener('click', function() {
      var rows = itemsDiv.children;
      var items = [];
      for (var i = 0; i < rows.length; i++) {
        var val = rows[i].querySelector('.vi-prod').value;
        if (!val) continue;
        var parts = val.split('|');
        var cant = Number(rows[i].querySelector('.vi-cant').value) || 0;
        var precio = Number(rows[i].querySelector('.vi-precio').value) || 0;
        if (cant <= 0) continue;
        items.push({ tipo: parts[0], productoId: Number(parts[1]), talla: parts[2], cantidad: cant, precioUnitario: precio });
      }
      if (items.length === 0) { alert('Agrega al menos un item'); return; }
      try {
        ArcanoDB.saveVenta({ fecha: document.getElementById('f-v-fecha').value, items: items });
        modal.remove();
        App.renderPage('ventas');
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  delVenta(id) {
    if (!confirm('Eliminar esta venta?')) return;
    ArcanoDB.deleteVenta(id);
    App.renderPage('ventas');
  },

  _uploadQrPago() {
    var input = document.getElementById('qr-pago-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'qr-pago-input';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
    }
    input.onchange = function() {
      var file = input.files[0];
      if (!file) return;
      if (file.size > 512000) { alert('La imagen es muy grande. Maximo 500KB.'); return; }
      var reader = new FileReader();
      reader.onload = function(e) {
        var dataUrl = e.target.result;
        Pages._qrPagoImage = dataUrl;
        localStorage.setItem('arcano_qr_pago_image', dataUrl);
        writeField('tiendaConfig/qrPagoImage', dataUrl);
        App.renderPage('ventas');
      };
      reader.readAsDataURL(file);
      input.value = '';
    };
    input.click();
  },

  _removeQrPago() {
    Pages._qrPagoImage = '';
    localStorage.removeItem('arcano_qr_pago_image');
    writeField('tiendaConfig/qrPagoImage', '');
    App.renderPage('ventas');
  },

  /* ================================================================
     GASTOS
     ================================================================ */
  renderGastos(container) {
    var gastos = ArcanoDB.getGastos();
    var cats = ArcanoDB.getGastosCategorias();
    var today = new Date().toISOString().slice(0, 10);
    var mes = new Date().toISOString().slice(0, 7);

    // Calcular totales
    var totalMes = 0, totalHoy = 0, totalGeneral = 0;
    var gastoPorCat = {};
    for (var gi = 0; gi < gastos.length; gi++) {
      var g = gastos[gi];
      var monto = g.monto || 0;
      totalGeneral += monto;
      if (g.fecha && g.fecha.startsWith(mes)) totalMes += monto;
      if (g.fecha === today) totalHoy += monto;
      gastoPorCat[g.categoria || 'Otros'] = (gastoPorCat[g.categoria || 'Otros'] || 0) + monto;
    }

    var h = '<div class="page-actions"><button class="btn btn-gold" onclick="Pages.formGasto()">+ Nuevo Gasto</button>' +
      '<button class="btn btn-outline" onclick="Pages.formGastosCategorias()" style="margin-left:8px">Categorias</button></div>';

    // KPIs
    h += '<div class="stats-grid" style="grid-template-columns: repeat(3, 1fr)">';
    h += '<div class="stat-card" style="border-left-color:var(--red)"><div class="stat-value text-red">$' + totalHoy.toLocaleString() + '</div><div class="stat-label">Gastos Hoy</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value text-gold">$' + totalMes.toLocaleString() + '</div><div class="stat-label">Gastos del Mes</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--muted)"><div class="stat-value">$' + totalGeneral.toLocaleString() + '</div><div class="stat-label">Total General</div></div>';
    h += '</div>';

    // Por categoria
    var catKeys = Object.keys(gastoPorCat).sort(function(a, b) { return gastoPorCat[b] - gastoPorCat[a]; });
    if (catKeys.length > 0) {
      h += '<div class="card mt-16"><div class="card-header"><h3>Gastos por Categoria (General)</h3></div><div class="card-body">';
      var maxCat = gastoPorCat[catKeys[0]] || 1;
      for (var ci = 0; ci < catKeys.length; ci++) {
        var catName = catKeys[ci];
        var catVal = gastoPorCat[catName];
        var pct = Math.round(catVal / maxCat * 100);
        h += '<div class="dash-canal-item" style="margin-bottom:8px"><div class="dash-canal-bar-track"><div class="dash-canal-bar-fill" style="width:' + pct + '%;background:var(--red)"></div></div><div class="dash-canal-info"><span class="dash-canal-name">' + catName + '</span><span class="dash-canal-val">$' + catVal.toLocaleString() + '</span></div></div>';
      }
      h += '</div></div>';
    }

    // Tabla de gastos
    h += '<div class="card mt-16"><div class="card-header"><h3>Historial de Gastos</h3></div><div class="card-body">';
    if (gastos.length === 0) {
      h += '<p class="text-muted text-center">Sin gastos registrados.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Categoria</th><th>Descripcion</th><th>Monto</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < Math.min(gastos.length, 50); i++) {
        var gasto = gastos[i];
        h += '<tr><td>' + (gasto.fecha || '') + '</td><td><span class="badge badge-red" style="border:1px solid">' + (gasto.categoria || 'Otros') + '</span></td><td class="text-sm">' + (gasto.descripcion || '-') + '</td><td class="fw7" style="color:var(--red)">$' + (gasto.monto || 0).toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-outline" onclick="Pages.formGasto(' + gasto.id + ')" style="margin-right:4px">Edit</button><button class="btn btn-sm btn-red" onclick="Pages.delGasto(' + gasto.id + ')">X</button></td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;
  },

  formGasto(editId) {
    var cats = ArcanoDB.getGastosCategorias();
    var existing = editId ? null : null;
    var gastos = ArcanoDB.getGastos();
    if (editId) {
      for (var i = 0; i < gastos.length; i++) { if (gastos[i].id === editId) { existing = gastos[i]; break; } }
    }
    var isEdit = !!existing;
    var catOpts = '<option value="">Seleccionar</option>';
    for (var ci = 0; ci < cats.length; ci++) {
      var sel = (existing && existing.categoria === cats[ci]) ? ' selected' : '';
      catOpts += '<option value="' + cats[ci] + '"' + sel + '>' + cats[ci] + '</option>';
    }
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal" style="max-width:460px">' +
      '<div class="modal-header"><h3>' + (isEdit ? 'Editar Gasto' : 'Nuevo Gasto') + '</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Fecha</label><input type="date" class="input" id="f-g-fecha" value="' + (existing ? existing.fecha : new Date().toISOString().slice(0, 10)) + '"></div>' +
        '<div class="form-group"><label>Categoria</label><select class="input" id="f-g-cat">' + catOpts + '</select></div>' +
        '<div class="form-group"><label>Descripcion</label><input type="text" class="input" id="f-g-desc" value="' + (existing ? (existing.descripcion || '').replace(/'/g, "&#39;") : '') + '" placeholder="Ej: Pago arriendo local"></div>' +
        '<div class="form-group"><label>Monto ($)</label><input type="number" class="input" id="f-g-monto" value="' + (existing ? existing.monto : '') + '" placeholder="0" min="0"></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-g">' + (isEdit ? 'Guardar' : 'Agregar') + '</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    document.getElementById('btn-save-g').addEventListener('click', function() {
      var fecha = document.getElementById('f-g-fecha').value;
      var cat = document.getElementById('f-g-cat').value;
      var desc = document.getElementById('f-g-desc').value.trim();
      var monto = Number(document.getElementById('f-g-monto').value) || 0;
      if (!fecha) { alert('Selecciona una fecha'); return; }
      if (!cat) { alert('Selecciona una categoria'); return; }
      if (monto <= 0) { alert('Ingresa un monto mayor a 0'); return; }
      var data = isEdit ? Object.assign({}, existing) : {};
      data.fecha = fecha;
      data.categoria = cat;
      data.descripcion = desc;
      data.monto = monto;
      try {
        ArcanoDB.saveGasto(data);
        modal.remove();
        App.renderPage('gastos');
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  formGastosCategorias() {
    var cats = ArcanoDB.getGastosCategorias();
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    var h = '<div class="modal" style="max-width:460px">' +
      '<div class="modal-header"><h3>Categorias de Gastos</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<p class="text-sm text-muted" style="margin-bottom:12px">Agrega o elimina categorias para organizar tus gastos.</p>' +
        '<div id="gastos-cats-list">';
    for (var i = 0; i < cats.length; i++) {
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span class="input" style="flex:1;text-align:center;padding:8px">' + cats[i] + '</span><button class="btn btn-sm btn-red" data-cat-name="' + cats[i].replace(/"/g, '&quot;') + '">X</button></div>';
    }
    h += '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px"><input type="text" class="input" id="new-gasto-cat" placeholder="Nueva categoria" style="flex:1"><button class="btn btn-gold" id="btn-add-gasto-cat">+</button></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cerrar</button>' +
      '</div></div>';
    modal.innerHTML = h;
    document.body.appendChild(modal);

    var removeBtns = modal.querySelectorAll('[data-cat-name]');
    for (var ri = 0; ri < removeBtns.length; ri++) {
      removeBtns[ri].addEventListener('click', function() {
        var catName = this.getAttribute('data-cat-name');
        var current = ArcanoDB.getGastosCategorias();
        var idx = current.indexOf(catName);
        if (idx > -1) {
          current.splice(idx, 1);
          ArcanoDB.saveGastosCategorias(current);
          modal.remove();
          Pages.formGastosCategorias();
        }
      });
    }

    document.getElementById('btn-add-gasto-cat').addEventListener('click', function() {
      var input = document.getElementById('new-gasto-cat');
      var val = input.value.trim();
      if (!val) return;
      var current = ArcanoDB.getGastosCategorias();
      if (current.indexOf(val) === -1) {
        current.push(val);
        ArcanoDB.saveGastosCategorias(current);
        modal.remove();
        Pages.formGastosCategorias();
      } else {
        alert('Esta categoria ya existe');
      }
    });
  },

  delGasto(id) {
    if (!confirm('Eliminar este gasto?')) return;
    ArcanoDB.deleteGasto(id);
    App.renderPage('gastos');
  },

  /* ================================================================
  /* ================================================================
     VENTA POR CAMARA (OCR - lectura de etiquetas)
     ================================================================ */
  _camStream: null,
  _camCart: [],
  _camOcrRunning: false,

  /** Open camera modal for label-reading sale */
  formVentaQR() {
    Pages._camCart = [];
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'cam-venta-modal';
    modal.innerHTML =
      '<div class="modal modal-lg" style="max-width:520px">' +
        '<div class="modal-header"><h3>\u{1F4F7} Venta por Camara</h3>' +
          '<button class="btn btn-ghost" onclick="Pages.closeVentaCam()">X</button></div>' +
        '<div class="modal-body" style="padding:0">' +
          '<div style="position:relative;background:#000">' +
            '<video id="cam-video" autoplay playsinline style="width:100%;display:block;max-height:320px;object-fit:cover"></video>' +
            '<canvas id="cam-canvas" style="display:none"></canvas>' +
            '<div id="cam-scan-line" style="position:absolute;top:50%;left:10%;right:10%;height:2px;background:var(--gold);opacity:0.6;transform:translateY(-50%);animation:scanLine 2s ease-in-out infinite;pointer-events:none"></div>' +
            '<style>@keyframes scanLine{0%,100%{top:calc(50% - 50px)}50%{top:calc(50% + 50px)}}</style>' +
          '</div>' +
          '<div id="cam-status" style="padding:12px 16px;background:var(--bg-card);color:var(--muted);font-size:0.85rem;text-align:center">' +
            'Apunta la camara a la etiqueta del producto' +
          '</div>' +
          '<div style="display:flex;justify-content:center;gap:8px;padding:8px 16px;background:var(--bg-card)">' +
            '<button class="btn btn-sm btn-outline" id="cam-flash-btn" onclick="Pages.toggleCamFlash()">\u{1F526} Flash</button>' +
            '<button class="btn btn-sm btn-gold" onclick="Pages.captureAndRead()">\u{1F4F7} Capturar</button>' +
          '</div>' +
          '<!-- Confirmation area -->' +
          '<div id="cam-confirm-area" style="padding:12px 16px;display:none">' +
            '<div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Producto detectado</div>' +
            '<div id="cam-detected-text" style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;font-style:italic"></div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<select class="input" id="cam-prod-select" style="flex:1;min-width:140px"><option value="">Seleccionar producto</option></select>' +
              '<select class="input" id="cam-talla-select" style="width:120px"><option value="chico">Pequeño</option><option value="grande">Grande</option></select>' +
              '<button class="btn btn-sm btn-gold" onclick="Pages.addCamProduct()">+ Agregar</button>' +
              '<button class="btn btn-sm btn-outline" onclick="Pages.cancelCamDetect()">Seguir leyendo</button>' +
            '</div>' +
          '</div>' +
          '<!-- Cart -->' +
          '<div id="cam-cart-area" style="padding:12px 16px;max-height:200px;overflow-y:auto;display:none">' +
            '<div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Productos agregados</div>' +
            '<div id="cam-cart-items"></div>' +
          '</div>' +
          '<!-- Total and confirm -->' +
          '<div id="cam-total-area" style="padding:12px 16px;border-top:1px solid var(--border);display:none">' +
            '<div class="venta-total-box">Total: $<span id="cam-venta-total">0</span></div>' +
            '<button class="btn btn-gold btn-block mt-8" onclick="Pages.confirmarVentaCam()">\u{2705} Confirmar Venta</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    setTimeout(function() { Pages.startCamera(); }, 300);
  },

  startCamera() {
    var video = document.getElementById('cam-video');
    if (!video) return;
    var statusEl = document.getElementById('cam-status');
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(function(stream) {
      Pages._camStream = stream;
      video.srcObject = stream;
      video.play();
      if (statusEl) statusEl.textContent = 'Apunta la camara a la etiqueta del producto';
    }).catch(function(err) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No se pudo acceder a la camara: ' + err.message + '</span>';
    });
  },

  stopCamera() {
    if (Pages._camStream) {
      Pages._camStream.getTracks().forEach(function(t) { t.stop(); });
      Pages._camStream = null;
    }
    Pages._camOcrRunning = false;
  },

  toggleCamFlash() {
    if (!Pages._camStream) return;
    var track = Pages._camStream.getVideoTracks()[0];
    if (!track) return;
    var caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) {
      var isOn = (track.getSettings && track.getSettings().torch) || false;
      track.applyConstraints({ advanced: [{ torch: !isOn }] });
      var btn = document.getElementById('cam-flash-btn');
      if (btn) btn.textContent = isOn ? '\u{1F526} Flash' : '\u{1F526} Flash ON';
    }
  },

  captureAndRead() {
    if (Pages._camOcrRunning) return;
    var video = document.getElementById('cam-video');
    var canvas = document.getElementById('cam-canvas');
    var statusEl = document.getElementById('cam-status');
    if (!video || !canvas || video.readyState < 2) return;
    if (navigator.vibrate) navigator.vibrate(50);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    var imageData = canvas.toDataURL('image/png');
    Pages._camOcrRunning = true;
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Leyendo etiqueta...</span>';
    if (typeof Tesseract === 'undefined') {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Libreria OCR no disponible. Verifica conexion a internet.</span>';
      Pages._camOcrRunning = false;
      return;
    }
    Tesseract.recognize(imageData, 'spa+eng', {
      logger: function() {}
    }).then(function(result) {
      Pages._camOcrRunning = false;
      var text = (result && result.data && result.data.text) || '';
      text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      Pages.handleOCRResult(text);
    }).catch(function(err) {
      Pages._camOcrRunning = false;
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error al leer: ' + err.message + '</span>';
    });
  },

  handleOCRResult(text) {
    var statusEl = document.getElementById('cam-status');
    var confirmArea = document.getElementById('cam-confirm-area');
    var detectedTextEl = document.getElementById('cam-detected-text');
    var prodSelect = document.getElementById('cam-prod-select');
    if (!text || text.length < 2) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No se detecto texto. Intenta de nuevo.</span>';
      setTimeout(function() { if (statusEl) statusEl.textContent = 'Apunta la camara a la etiqueta del producto'; }, 2000);
      return;
    }
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var allProducts = [];
    for (var i = 0; i < especias.length; i++) { allProducts.push({ tipo: 'especia', producto: especias[i] }); }
    for (var i = 0; i < blends.length; i++) { allProducts.push({ tipo: 'blend', producto: blends[i] }); }
    var ocrLower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var scored = [];
    for (var i = 0; i < allProducts.length; i++) {
      var p = allProducts[i];
      var name = (p.producto.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      var nameWords = name.split(/\s+/);
      var matchCount = 0;
      for (var w = 0; w < nameWords.length; w++) {
        if (nameWords[w].length < 2) continue;
        if (ocrLower.indexOf(nameWords[w]) !== -1) matchCount++;
      }
      var score = nameWords.length > 0 ? matchCount / nameWords.length : 0;
      if (ocrLower.indexOf(name) !== -1) score = Math.max(score, 1.0);
      if (name.length >= 3 && ocrLower.indexOf(name.substring(0, Math.min(name.length, 6))) !== -1) score = Math.max(score, 0.7);
      if (score >= 0.5) scored.push({ tipo: p.tipo, producto: p.producto, score: score });
    }
    scored.sort(function(a, b) { return b.score - a.score; });
    if (confirmArea) confirmArea.style.display = 'block';
    if (detectedTextEl) detectedTextEl.textContent = 'Texto leido: "' + text.substring(0, 80) + (text.length > 80 ? '...' : '') + '"';
    if (prodSelect) {
      prodSelect.innerHTML = '<option value="">Seleccionar producto</option>';
      if (scored.length > 0) {
        for (var i = 0; i < Math.min(scored.length, 5); i++) {
          var s = scored[i];
          var pct = Math.round(s.score * 100);
          prodSelect.innerHTML += '<option value="' + s.tipo + '|' + s.producto.id + '">' + s.producto.nombre + ' (' + pct + '%)</option>';
        }
        if (scored[0].score >= 0.7) {
          prodSelect.value = scored[0].tipo + '|' + scored[0].producto.id;
        }
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">Producto detectado - confirma abajo</span>';
      } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No se encontro producto. Selecciona manualmente.</span>';
        for (var i = 0; i < allProducts.length; i++) {
          var ap = allProducts[i];
          prodSelect.innerHTML += '<option value="' + ap.tipo + '|' + ap.producto.id + '">' + ap.producto.nombre + '</option>';
        }
      }
    }
  },

  cancelCamDetect() {
    var confirmArea = document.getElementById('cam-confirm-area');
    if (confirmArea) confirmArea.style.display = 'none';
    var statusEl = document.getElementById('cam-status');
    if (statusEl) statusEl.textContent = 'Apunta la camara a la etiqueta del producto';
  },

  addCamProduct() {
    var prodVal = document.getElementById('cam-prod-select').value;
    var tallaVal = document.getElementById('cam-talla-select').value;
    if (!prodVal) { alert('Selecciona un producto'); return; }
    var parts = prodVal.split('|');
    var tipo = parts[0];
    var prodId = Number(parts[1]);
    var producto = tipo === 'blend' ? ArcanoDB.getBlend(prodId) : ArcanoDB.getEspecia(prodId);
    if (!producto) { alert('Producto no encontrado'); return; }
    var stockKey = tallaVal === 'grande' ? 'stockGrande' : 'stockChico';
    var precioKey = tallaVal === 'grande' ? 'precioGrande' : 'precioChico';
    var stock = producto[stockKey] || 0;
    var precio = producto[precioKey] || 0;
    if (stock <= 0) { alert('Sin stock de ' + producto.nombre + ' (' + tallaVal + ')'); return; }
    var found = false;
    for (var i = 0; i < Pages._camCart.length; i++) {
      if (Pages._camCart[i].tipo === tipo && Pages._camCart[i].productoId === prodId && Pages._camCart[i].talla === tallaVal) {
        if (Pages._camCart[i].cantidad < stock) Pages._camCart[i].cantidad++;
        found = true;
        break;
      }
    }
    if (!found) {
      Pages._camCart.push({ tipo: tipo, productoId: prodId, talla: tallaVal, cantidad: 1, precioUnitario: precio });
    }
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    Pages.renderCamCart();
    Pages.cancelCamDetect();
  },

  renderCamCart() {
    var cartArea = document.getElementById('cam-cart-area');
    var cartItems = document.getElementById('cam-cart-items');
    var totalArea = document.getElementById('cam-total-area');
    var totalSpan = document.getElementById('cam-venta-total');
    if (Pages._camCart.length === 0) {
      if (cartArea) cartArea.style.display = 'none';
      if (totalArea) totalArea.style.display = 'none';
      return;
    }
    if (cartArea) cartArea.style.display = 'block';
    if (totalArea) totalArea.style.display = 'block';
    var h = '';
    var total = 0;
    for (var i = 0; i < Pages._camCart.length; i++) {
      var item = Pages._camCart[i];
      var prod = item.tipo === 'blend' ? ArcanoDB.getBlend(item.productoId) : ArcanoDB.getEspecia(item.productoId);
      var nombre = prod ? prod.nombre : '?';
      var sub = item.cantidad * item.precioUnitario;
      total += sub;
      h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<div><div style="font-weight:600;font-size:0.9rem">' + nombre + '</div>' +
        '<div style="font-size:0.75rem;color:var(--muted)">' + item.talla + ' | $' + item.precioUnitario.toLocaleString() + ' c/u</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<button class="btn btn-sm btn-outline" onclick="Pages.camCartQty(' + i + ',-1)">-</button>' +
        '<span style="font-weight:700;min-width:24px;text-align:center">' + item.cantidad + '</span>' +
        '<button class="btn btn-sm btn-outline" onclick="Pages.camCartQty(' + i + ',1)">+</button>' +
        '<span style="font-weight:700;color:var(--gold);min-width:70px;text-align:right">$' + sub.toLocaleString() + '</span>' +
        '<button class="btn btn-sm btn-red" onclick="Pages.camCartRemove(' + i + ')">X</button>' +
        '</div></div>';
    }
    if (cartItems) cartItems.innerHTML = h;
    if (totalSpan) totalSpan.textContent = total.toLocaleString();
  },

  camCartQty(idx, delta) {
    if (!Pages._camCart[idx]) return;
    var item = Pages._camCart[idx];
    var newCant = item.cantidad + delta;
    var producto = item.tipo === 'blend' ? ArcanoDB.getBlend(item.productoId) : ArcanoDB.getEspecia(item.productoId);
    var stockKey = item.talla === 'grande' ? 'stockGrande' : 'stockChico';
    var maxStock = producto ? (producto[stockKey] || 0) : 0;
    if (newCant < 1 || newCant > maxStock) return;
    item.cantidad = newCant;
    Pages.renderCamCart();
  },

  camCartRemove(idx) {
    Pages._camCart.splice(idx, 1);
    Pages.renderCamCart();
  },

  confirmarVentaCam() {
    if (Pages._camCart.length === 0) { alert('No hay productos en la venta'); return; }
    if (!confirm('Registrar venta de ' + Pages._camCart.length + ' producto(s)?')) return;
    try {
      ArcanoDB.saveVenta({
        fecha: new Date().toISOString().slice(0, 10),
        items: JSON.parse(JSON.stringify(Pages._camCart))
      });
      Pages.closeVentaCam();
      App.renderPage('ventas');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  },

  closeVentaCam() {
    Pages.stopCamera();
    var modal = document.getElementById('cam-venta-modal');
    if (modal) modal.remove();
    Pages._camCart = [];
  },


  /* ================================================================
     STOCK
     ================================================================ */
  renderStock(container) {
    var db = ArcanoDB.getDB();
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var envases = db.stockEnvases || { chico: 0, grande: 0 };
    var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
    var etiqList = ArcanoDB.getProductosConStickers();
    var ajustes = ArcanoDB.getAjustes();

    var h = '<div class="page-actions">' +
      '<button class="btn btn-gold" id="btn-batch-aj" style="opacity:0.4;pointer-events:none">Guardar Ajustes (0)</button>' +
      '<button class="btn btn-outline" style="margin-left:8px" onclick="Pages.formAjusteStock()">Ajuste Individual</button>' +
      '<button class="btn btn-outline" style="margin-left:8px" id="btn-clear-aj" onclick="Pages._clearStockInputs()">Limpiar</button>' +
      '<span class="text-xs text-muted" style="margin-left:12px">Escribe +/− en los campos y guarda todo de una vez</span>' +
      '</div>';

    // helper: inline adj input
    function adjInput(cat, sub, prodId, prodNombre, placeholder) {
      var pid = prodId != null ? String(prodId) : '';
      return '<input type="number" class="input stock-adj-input" ' +
        'data-cat="' + cat + '" data-sub="' + sub + '" data-pid="' + pid + '" data-pname="' + (prodNombre||'').replace(/"/g, '&quot;') + '" ' +
        'style="width:70px;padding:4px 6px;font-size:0.85rem;text-align:center" placeholder="' + placeholder + '" title="Stock actual: ' + placeholder + '">';
    }

    // === SECTION 1: ESPECIAS ===
    h += '<h3 style="color:var(--gold);margin:16px 0 12px;font-size:1.1rem">Especias</h3>';
    h += '<div class="card"><div class="card-body" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Cat.</th><th>Pala (g)</th><th>Ajuste</th><th>Fr.Pequeño</th><th>Ajuste</th><th>Fr.Grande</th><th>Ajuste</th></tr></thead><tbody>';
    for (var i = 0; i < especias.length; i++) {
      var e = especias[i];
      var palaCls = (e.stockBolsa||0)<=50?'text-red fw7':'';
      var chCls = (e.stockChico||0)<=3?'text-red fw7':'text-green';
      var grCls = (e.stockGrande||0)<=3?'text-red fw7':'text-green';
      h += '<tr>' +
        '<td class="fw7">' + e.nombre + '</td>' +
        '<td><span class="badge badge-gold">' + ((e.categorias||[]).length ? (e.categorias||[]).join(', ') : (e.categoria||'—')) + '</span></td>' +
        '<td class="' + palaCls + '">' + (e.stockBolsa||0) + '</td>' +
        '<td>' + adjInput('especia', 'pala', e.id, e.nombre, e.stockBolsa||0) + '</td>' +
        '<td class="' + chCls + '">' + (e.stockChico||0) + '</td>' +
        '<td>' + adjInput('especia', 'chico', e.id, e.nombre, e.stockChico||0) + '</td>' +
        '<td class="' + grCls + '">' + (e.stockGrande||0) + '</td>' +
        '<td>' + adjInput('especia', 'grande', e.id, e.nombre, e.stockGrande||0) + '</td>' +
        '</tr>';
    }
    h += '</tbody></table></div></div></div>';

    // === SECTION 2: BLENDS ===
    h += '<h3 style="color:var(--gold);margin:24px 0 12px;font-size:1.1rem">Blends</h3>';
    h += '<div class="card"><div class="card-body" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Cat.</th><th>Fr.Pequeño</th><th>Ajuste</th><th>Fr.Grande</th><th>Ajuste</th></tr></thead><tbody>';
    for (var i = 0; i < blends.length; i++) {
      var b = blends[i];
      var chCls = (b.stockChico||0)<=3?'text-red fw7':'text-green';
      var grCls = (b.stockGrande||0)<=3?'text-red fw7':'text-green';
      h += '<tr>' +
        '<td class="fw7">' + b.nombre + '</td>' +
        '<td><span class="badge badge-blue">' + ((b.categorias||[]).length ? (b.categorias||[]).join(', ') : '—') + '</span></td>' +
        '<td class="' + chCls + '">' + (b.stockChico||0) + '</td>' +
        '<td>' + adjInput('blend', 'chico', b.id, b.nombre, b.stockChico||0) + '</td>' +
        '<td class="' + grCls + '">' + (b.stockGrande||0) + '</td>' +
        '<td>' + adjInput('blend', 'grande', b.id, b.nombre, b.stockGrande||0) + '</td>' +
        '</tr>';
    }
    h += '</tbody></table></div></div></div>';

    // === SECTION 3: PACKAGING ===
    h += '<h3 style="color:var(--gold);margin:24px 0 12px;font-size:1.1rem">Packaging</h3>';
    h += '<div class="card"><div class="card-body" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Stock</th><th>Ajuste</th></tr></thead><tbody>';
    h += '<tr><td class="fw7">Frascos Pequeños</td><td>' + (envases.chico||0) + '</td><td>' + adjInput('envase', 'chico', null, 'Frascos chico', envases.chico||0) + '</td></tr>';
    h += '<tr><td class="fw7">Frascos Grandes</td><td>' + (envases.grande||0) + '</td><td>' + adjInput('envase', 'grande', null, 'Frascos grande', envases.grande||0) + '</td></tr>';
    h += '<tr><td class="fw7">Bolsas Chicas</td><td>' + (bolsas.chico||0) + '</td><td>' + adjInput('bolsa', 'chico', null, 'Bolsas chica', bolsas.chico||0) + '</td></tr>';
    h += '<tr><td class="fw7">Bolsas Grandes</td><td>' + (bolsas.grande||0) + '</td><td>' + adjInput('bolsa', 'grande', null, 'Bolsas grande', bolsas.grande||0) + '</td></tr>';
    h += '<tr><td class="fw7">Cintas</td><td>' + (db.stockCintas||0) + '</td><td>' + adjInput('cinta', 'cinta', null, 'Cintas', db.stockCintas||0) + '</td></tr>';
    h += '</tbody></table></div></div></div>';

    // === SECTION 4: STICKERS ===
    h += '<h3 style="color:var(--gold);margin:24px 0 12px;font-size:1.1rem">Stickers</h3>';
    h += '<div class="card"><div class="card-body" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Tipo</th><th>Pequeño</th><th>Ajuste</th><th>Grande</th><th>Ajuste</th></tr></thead><tbody>';
    for (var i = 0; i < etiqList.length; i++) {
      var et = etiqList[i];
      var chCls = et.stockChico<=5?'text-red fw7':'';
      var grCls = et.stockGrande<=5?'text-red fw7':'';
      h += '<tr>' +
        '<td class="fw7">' + et.nombre + '</td>' +
        '<td><span class="badge ' + (et.tipo==='blend'?'badge-blue':'badge-gold') + '">' + (et.tipo==='blend'?'Blend':'Especia') + '</span></td>' +
        '<td class="' + chCls + '">' + et.stockChico + '</td>' +
        '<td>' + adjInput('sticker', 'chico', null, et.nombre, et.stockChico) + '</td>' +
        '<td class="' + grCls + '">' + et.stockGrande + '</td>' +
        '<td>' + adjInput('sticker', 'grande', null, et.nombre, et.stockGrande) + '</td>' +
        '</tr>';
    }
    h += '</tbody></table></div></div></div>';

    // === SECTION 5: HISTORIAL ===
    h += '<div class="card mt-24"><div class="card-header"><h3>Historial de Ajustes</h3></div><div class="card-body">';
    if (ajustes.length === 0) {
      h += '<p class="text-muted text-center">Sin ajustes.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Sub</th><th>Cant.</th><th>Motivo</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < Math.min(ajustes.length, 50); i++) {
        var aj = ajustes[i];
        var catLabel = aj.categoria === 'especia' ? 'Especia' : aj.categoria === 'blend' ? 'Blend' : aj.categoria === 'envase' ? 'Frascos' : aj.categoria === 'bolsa' ? 'Bolsas' : aj.categoria === 'cinta' ? 'Cintas' : 'Sticker';
        var subLabel = aj.subtipo === 'pala' ? 'Pala' : aj.subtipo === 'chico' ? 'Pequeño' : 'Grande';
        var cantColor = (aj.cantidad > 0) ? 'text-green' : 'text-red';
        var cantSign = (aj.cantidad > 0) ? '+' : '';
        var unidad = aj.subtipo === 'pala' ? 'g' : 'u';
        h += '<tr><td>' + (aj.fecha||'') + '</td>' +
          '<td><span class="badge badge-gold">' + catLabel + '</span></td>' +
          '<td class="fw7">' + (aj.productoNombre||'—') + '</td>' +
          '<td>' + subLabel + '</td>' +
          '<td class="' + cantColor + ' fw7">' + cantSign + (aj.cantidad||0) + ' ' + unidad + '</td>' +
          '<td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (aj.motivo||'').replace(/"/g, '&quot;') + '">' + (aj.motivo||'—') + '</td>' +
          '<td><button class="btn btn-sm btn-red" onclick="Pages.delAjuste(' + aj.id + ')">X</button></td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;

    // Wire up batch logic
    var allInputs = container.querySelectorAll('.stock-adj-input');
    var batchBtn = document.getElementById('btn-batch-aj');
    function countPending() {
      var c = 0;
      for (var i = 0; i < allInputs.length; i++) { if (allInputs[i].value !== '' && Number(allInputs[i].value) !== 0) c++; }
      return c;
    }
    function refreshBtn() {
      var n = countPending();
      if (n > 0) {
        batchBtn.textContent = 'Guardar Ajustes (' + n + ')';
        batchBtn.style.opacity = '1';
        batchBtn.style.pointerEvents = 'auto';
      } else {
        batchBtn.textContent = 'Guardar Ajustes (0)';
        batchBtn.style.opacity = '0.4';
        batchBtn.style.pointerEvents = 'none';
      }
    }
    for (var i = 0; i < allInputs.length; i++) {
      allInputs[i].addEventListener('input', refreshBtn);
    }
    batchBtn.addEventListener('click', function() {
      var pending = [];
      for (var i = 0; i < allInputs.length; i++) {
        var inp = allInputs[i];
        var v = Number(inp.value);
        if (inp.value === '' || v === 0) continue;
        pending.push({
          categoria: inp.getAttribute('data-cat'),
          subtipo: inp.getAttribute('data-sub'),
          productoId: inp.getAttribute('data-pid') ? Number(inp.getAttribute('data-pid')) : null,
          productoNombre: inp.getAttribute('data-pname'),
          cantidad: v
        });
      }
      if (pending.length === 0) return;
      var summary = pending.map(function(p) { return p.productoNombre + ' ' + p.subtipo + ': ' + (p.cantidad > 0 ? '+' : '') + p.cantidad; }).join('\n');
      if (!confirm('Aplicar ' + pending.length + ' ajustes?\n\n' + summary)) return;
      var errors = [];
      for (var i = 0; i < pending.length; i++) {
        try {
          ArcanoDB.saveAjuste({
            categoria: pending[i].categoria,
            subtipo: pending[i].subtipo,
            productoId: pending[i].productoId,
            productoNombre: pending[i].productoNombre,
            cantidad: pending[i].cantidad,
            motivo: 'Ajuste rapido multiple',
            fecha: new Date().toISOString().slice(0, 10)
          });
        } catch(err) { errors.push(pending[i].productoNombre + ': ' + err.message); }
      }
      if (errors.length) { alert('Errores:\n' + errors.join('\n')); }
      App.renderPage('stock');
    });
  },

  _clearStockInputs: function() {
    var inputs = document.querySelectorAll('.stock-adj-input');
    for (var i = 0; i < inputs.length; i++) inputs[i].value = '';
    var btn = document.getElementById('btn-batch-aj');
    if (btn) { btn.textContent = 'Guardar Ajustes (0)'; btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none'; }
  },

  /* ---------- Ajuste Manual de Stock ---------- */
  delAjuste(id) {
    if (!confirm('Eliminar este ajuste? (El stock NO se revertira)')) return;
    ArcanoDB.deleteAjuste(id);
    App.renderPage('stock');
  },

  formAjusteStock() {
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg" style="max-width:560px">' +
      '<div class="modal-header"><h3>Ajustar Stock Manualmente</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Categoria</label><select class="input" id="f-aj-cat">' +
          '<option value="especia">Especia</option>' +
          '<option value="blend">Blend</option>' +
          '<option value="envase">Frascos</option>' +
          '<option value="bolsa">Bolsas</option>' +
          '<option value="sticker">Stickers</option>' +
        '</select></div>' +
        '<div class="form-group" id="f-aj-prod-wrap"><label>Producto</label><select class="input" id="f-aj-prod"></select></div>' +
        '<div class="form-group"><label>Sub-tipo</label><select class="input" id="f-aj-sub"></select></div>' +
        '<div class="form-group"><label>Cantidad (<span style="color:var(--red)">negativo = restar</span>, positivo = sumar)</label><input type="number" class="input" id="f-aj-cant" placeholder="Ej: -100 o 50"></div>' +
        '<div class="form-group"><label>Motivo <span class="text-red">*</span></label><textarea class="input" id="f-aj-motivo" rows="2" placeholder="Ej: Se rompieron, merma, conteo fisico, etc."></textarea></div>' +
        '<div id="f-aj-preview" class="card mt-12" style="background:var(--bg);border-color:var(--gold);display:none"><div class="card-body" id="f-aj-preview-body"></div></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-aj">Aplicar Ajuste</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var catSel = document.getElementById('f-aj-cat');
    var prodSel = document.getElementById('f-aj-prod');
    var prodWrap = document.getElementById('f-aj-prod-wrap');
    var subSel = document.getElementById('f-aj-sub');
    var cantInput = document.getElementById('f-aj-cant');
    var previewDiv = document.getElementById('f-aj-preview');
    var previewBody = document.getElementById('f-aj-preview-body');

    function buildEspOpts() {
      var o = '';
      for (var i = 0; i < especias.length; i++) o += '<option value="' + especias[i].id + '">' + especias[i].nombre + '</option>';
      return o;
    }
    function buildBlendOpts() {
      var o = '';
      for (var i = 0; i < blends.length; i++) o += '<option value="' + blends[i].id + '">' + blends[i].nombre + '</option>';
      return o;
    }
    function buildStickerOpts() {
      var allProds = ArcanoDB.getProductosConStickers();
      var o = '';
      for (var i = 0; i < allProds.length; i++) o += '<option value="' + allProds[i].nombre + '">' + allProds[i].nombre + ' (' + (allProds[i].tipo==='blend'?'Blend':'Especia') + ')</option>';
      return o;
    }

    function updateForm() {
      var cat = catSel.value;
      var prodId = prodSel.value;

      // Show/hide product selector
      if (cat === 'envase' || cat === 'bolsa') {
        prodWrap.style.display = 'none';
      } else {
        prodWrap.style.display = '';
        if (cat === 'especia') prodSel.innerHTML = buildEspOpts();
        else if (cat === 'blend') prodSel.innerHTML = buildBlendOpts();
        else if (cat === 'sticker') prodSel.innerHTML = buildStickerOpts();
      }

      // Subtipo options
      if (cat === 'especia') {
        subSel.innerHTML = '<option value="pala">Pala (gramos)</option><option value="chico">Frasco Pequeño (unidades)</option><option value="grande">Frasco Grande (unidades)</option>';
      } else if (cat === 'blend') {
        subSel.innerHTML = '<option value="chico">Frasco Pequeño (unidades)</option><option value="grande">Frasco Grande (unidades)</option>';
      } else if (cat === 'envase') {
        subSel.innerHTML = '<option value="chico">Chico (unidades)</option><option value="grande">Grande (unidades)</option>';
      } else if (cat === 'bolsa') {
        subSel.innerHTML = '<option value="chico">Chica (unidades)</option><option value="grande">Grande (unidades)</option>';
      } else if (cat === 'sticker') {
        subSel.innerHTML = '<option value="chico">Chico (unidades)</option><option value="grande">Grande (unidades)</option>';
      }

      updatePreview();
    }

    function updatePreview() {
      var cat = catSel.value;
      var sub = subSel.value;
      var cant = Number(cantInput.value) || 0;
      var db = ArcanoDB.getDB();
      var actual = 0;
      var nombre = '';
      var unidad = sub === 'pala' ? 'g' : 'u';

      if (cat === 'especia' && prodSel.value) {
        var esp = ArcanoDB.getEspecia(Number(prodSel.value));
        if (esp) {
          nombre = esp.nombre;
          if (sub === 'pala') actual = esp.stockBolsa || 0;
          else if (sub === 'chico') actual = esp.stockChico || 0;
          else actual = esp.stockGrande || 0;
        }
      } else if (cat === 'blend' && prodSel.value) {
        var bl = ArcanoDB.getBlend(Number(prodSel.value));
        if (bl) {
          nombre = bl.nombre;
          actual = (sub === 'grande') ? (bl.stockGrande || 0) : (bl.stockChico || 0);
        }
      } else if (cat === 'envase') {
        nombre = 'Frascos ' + sub;
        actual = (db.stockEnvases || {})[sub] || 0;
      } else if (cat === 'bolsa') {
        nombre = 'Bolsas ' + sub;
        actual = (db.stockBolsas || {})[sub] || 0;
      } else if (cat === 'sticker' && prodSel.value) {
        nombre = prodSel.value;
        var allStks = ArcanoDB.getProductosConStickers();
        for (var i = 0; i < allStks.length; i++) {
          if (allStks[i].nombre === nombre) {
            actual = (sub === 'grande') ? (allStks[i].stockGrande || 0) : (allStks[i].stockChico || 0);
            break;
          }
        }
      }

      if (!nombre) { previewDiv.style.display = 'none'; return; }
      var resultante = actual + cant;
      var resColor = resultante < 0 ? 'text-red' : (resultante === 0 ? 'text-yellow' : 'text-green');
      previewDiv.style.display = '';
      previewBody.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><div><span class="text-sm text-muted">Stock actual de <b>' + nombre + '</b> (' + sub + '):</span></div>' +
        '<div style="text-align:right"><span class="fw7" style="font-size:1.2rem">' + actual + ' ' + unidad + '</span>' +
        ' <span class="text-muted" style="margin:0 8px">&#8594;</span>' +
        '<span class="fw7 ' + resColor + '" style="font-size:1.2rem">' + resultante + ' ' + unidad + '</span></div></div>';
    }

    catSel.addEventListener('change', updateForm);
    prodSel.addEventListener('change', updatePreview);
    subSel.addEventListener('change', updatePreview);
    cantInput.addEventListener('input', updatePreview);
    updateForm();

    // Save
    document.getElementById('btn-save-aj').addEventListener('click', function() {
      var motivo = (document.getElementById('f-aj-motivo').value || '').trim();
      if (!motivo) { alert('Debes indicar el motivo del ajuste'); return; }
      var cant = Number(cantInput.value) || 0;
      if (cant === 0) { alert('La cantidad no puede ser 0'); return; }
      var cat = catSel.value;
      var sub = subSel.value;
      var data = {
        categoria: cat,
        subtipo: sub,
        cantidad: cant,
        motivo: motivo,
        fecha: new Date().toISOString().slice(0, 10)
      };
      if (cat === 'especia' || cat === 'blend') {
        data.productoId = Number(prodSel.value);
      }
      if (cat === 'sticker') {
        data.productoNombre = prodSel.value;
      }
      try {
        ArcanoDB.saveAjuste(data);
        modal.remove();
        App.renderPage('stock');
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  /* ================================================================
     PEDIDOS (Tienda)
     ================================================================ */
  renderPedidos(container) {
    var pedidos = ArcanoDB.getPedidos();
    var estados = ['nuevo', 'confirmado', 'enviado', 'entregado', 'cancelado'];
    var estadoColors = { nuevo: 'text-red', confirmado: 'text-yellow', enviado: 'text-blue', entregado: 'text-green', cancelado: 'text-muted' };
    var estadoLabels = { nuevo: 'Nuevo', confirmado: 'Confirmado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };

    var h = '<div class="page-actions"><button class="btn btn-outline" onclick="App.renderPage(\'dashboard\')">Volver al Dashboard</button></div>';

    // Summary cards
    h += '<div class="stats-grid mt-12" style="grid-template-columns: repeat(5, 1fr)">';
    for (var si = 0; si < estados.length; si++) {
      var est = estados[si];
      var count = 0;
      for (var sc = 0; sc < pedidos.length; sc++) { if (pedidos[sc].estado === est) count++; }
      h += '<div class="stat-card"><div class="stat-value ' + estadoColors[est] + '">' + count + '</div><div class="stat-label">' + estadoLabels[est] + '</div></div>';
    }
    h += '</div>';

    // Table
    h += '<div class="card mt-16"><div class="card-header"><h3>Todos los Pedidos</h3></div><div class="card-body">';
    if (pedidos.length === 0) {
      h += '<p class="text-muted text-center">Sin pedidos.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Telefono</th><th>Ciudad</th><th>Items</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < pedidos.length; i++) {
        var p = pedidos[i];
        var cl = p.cliente || {};
        var fecha = p.creado ? p.creado.slice(0, 10) : '';
        var hora = p.creado ? p.creado.slice(11, 16) : '';
        var nItems = (p.items || []).length;
        var estClass = estadoColors[p.estado] || 'text-muted';
        var estLabel = estadoLabels[p.estado] || p.estado;
        h += '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td class="fw7">' + hora + '</td>' +
          '<td class="fw7">' + (cl.nombre || '?') + '</td>' +
          '<td>' + (cl.telefono || '') + '</td>' +
          '<td>' + (cl.ciudad || '') + '</td>' +
          '<td>' + nItems + '</td>' +
          '<td class="text-gold fw7">$' + (p.total || 0).toLocaleString() + '</td>' +
          '<td><span class="badge ' + estClass + '" style="border:1px solid">' + estLabel + '</span></td>' +
          '<td><button class="btn btn-sm btn-gold" onclick="Pages.verPedido(\'' + p._key + '\')">Ver</button>' +
          '<button class="btn btn-sm btn-red" style="margin-left:4px" onclick="Pages.eliminarPedido(\'' + p._key + '\')">Eliminar</button></td>' +
          '</tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;
  },

  verPedido(pedidoKey) {
    var pedidos = ArcanoDB.getPedidos();
    var p = null;
    for (var i = 0; i < pedidos.length; i++) { if (pedidos[i]._key === pedidoKey) { p = pedidos[i]; break; } }
    if (!p) { alert('Pedido no encontrado'); return; }
    var cl = p.cliente || {};
    var estadoLabels = { nuevo: 'Nuevo', confirmado: 'Confirmado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
    var estados = ['nuevo', 'confirmado', 'enviado', 'entregado', 'cancelado'];
    var estadoColors = { nuevo: 'text-red', confirmado: 'text-yellow', enviado: 'text-blue', entregado: 'text-green', cancelado: 'text-muted' };

    var h = '<div class="card"><div class="card-header"><h3>Pedido de ' + (cl.nombre || '?') + '</h3><span class="badge ' + (estadoColors[p.estado]||'') + '" style="font-size:0.85rem">' + (estadoLabels[p.estado]||p.estado) + '</span></div><div class="card-body">';
    h += '<div class="g2">';
    h += '<div><p class="text-sm text-muted">Fecha</p><p class="fw7">' + (p.creado || '').replace('T', ' ') + '</p></div>';
    h += '<div><p class="text-sm text-muted">Telefono</p><p class="fw7">' + (cl.telefono || '') + '</p></div>';
    h += '<div><p class="text-sm text-muted">Email</p><p class="fw7">' + (cl.email || '') + '</p></div>';
    h += '<div><p class="text-sm text-muted">Ciudad</p><p class="fw7">' + (cl.ciudad || '') + '</p></div>';
    h += '</div>';
    if (cl.direccion) h += '<p class="mt-8 text-sm text-muted">Direccion: <b>' + cl.direccion + '</b></p>';
    if (p.notas) h += '<p class="mt-4 text-sm text-muted">Notas: <b>' + p.notas + '</b></p>';

    // Metodo de pago
    if (p.metodoPago) {
      var mpLabel = p.metodoPago === 'qr' ? 'QR' : 'Efectivo';
      var mpColor = p.metodoPago === 'qr' ? 'var(--blue)' : 'var(--green)';
      h += '<div class="mt-12" style="padding:10px 16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)"><span class="text-sm text-muted">Metodo de pago: </span><span class="fw7" style="color:' + mpColor + '">' + mpLabel + '</span></div>';
    }

    h += '<h4 class="mt-16">Productos</h4>';
    h += '<div class="table-wrap mt-8"><table class="table"><thead><tr><th>Producto</th><th>Talla</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>';
    for (var i = 0; i < (p.items || []).length; i++) {
      var it = p.items[i];
      var tallaLabel = it.talla === 'grande' ? 'Grande' : 'Pequeno';
      h += '<tr><td class="fw7">' + (it.nombre || '?') + '</td><td>' + tallaLabel + '</td><td>' + (it.qty || 0) + '</td><td>$' + (it.precio || 0).toLocaleString() + '</td><td class="fw7">$' + (it.subtotal || 0).toLocaleString() + '</td></tr>';
      if (it.tipo === 'custom-blend' && it.customBlend) {
        var cb = it.customBlend;
        h += '<tr><td colspan="5" style="padding:4px 12px 8px 32px;border-bottom:1px solid var(--border)">';
        h += '<div style="font-size:0.75rem;color:var(--gold);font-weight:700;margin-bottom:4px">Blend: ' + (cb.nombre || 'Personalizado') + '</div>';
        if (cb.especias) {
          for (var bi = 0; bi < cb.especias.length; bi++) {
            h += '<span style="display:inline-block;padding:2px 8px;margin:2px;background:var(--bg);border:1px solid var(--border);border-radius:12px;font-size:0.7rem;color:var(--text)">' + cb.especias[bi].nombre + ' ' + cb.especias[bi].porcentaje + '%</span>';
          }
        }
        h += '</td></tr>';
      }
    }
    h += '</tbody></table></div>';
    h += '<div style="text-align:right;margin-top:12px;font-size:1.2rem" class="fw7">Total: $' + (p.total || 0).toLocaleString() + '</div>';

    // Estado buttons
    h += '<div class="mt-16"><h4>Cambiar Estado</h4><div class="mt-8" style="display:flex;gap:8px;flex-wrap:wrap">';
    for (var ei = 0; ei < estados.length; ei++) {
      var est = estados[ei];
      var isActive = p.estado === est;
      var btnClass = isActive ? 'btn btn-gold' : 'btn btn-outline';
      h += '<button class="' + btnClass + ' btn-sm" onclick="Pages.cambiarEstadoPedido(\'' + pedidoKey + '\',\'' + est + '\')">' + estadoLabels[est] + '</button>';
    }
    h += '</div></div>';

    h += '</div><div class="modal-footer"><button class="btn btn-outline" onclick="document.getElementById(\'pedido-modal\').remove()">Cerrar</button>';
    h += '<a class="btn btn-gold" href="tel:' + (cl.telefono || '') + '" target="_blank">Llamar Cliente</a>';
    h += '<button class="btn btn-sm btn-red" style="margin-left:auto" onclick="Pages.eliminarPedido(\'' + pedidoKey + '\')">Eliminar Pedido</button>';
    h += '</div></div>';

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'pedido-modal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = '<div class="modal modal-lg" style="max-width:680px">' + h + '</div>';
    document.body.appendChild(modal);
  },

  cambiarEstadoPedido(pedidoKey, nuevoEstado) {
    if (nuevoEstado === 'entregado') {
      Pages._showPagoModal(pedidoKey, nuevoEstado);
      return;
    }
    ArcanoDB.updatePedidoEstado(pedidoKey, nuevoEstado);
    var modal = document.getElementById('pedido-modal');
    if (modal) modal.remove();
    App.renderPage(App.currentPage);
  },

  _showPagoModal(pedidoKey, nuevoEstado) {
    var pedidos = ArcanoDB.getPedidos();
    var p = null;
    for (var i = 0; i < pedidos.length; i++) { if (pedidos[i]._key === pedidoKey) { p = pedidos[i]; break; } }
    if (!p) return;
    var qrImg = Pages._qrPagoImage;
    var qrContent = qrImg
      ? '<div style="font-size:0.9rem;color:var(--muted);margin-bottom:8px">Muestra este QR al cliente:</div>' +
        '<div style="margin-bottom:16px"><img src="' + qrImg + '" style="max-width:240px;max-height:240px;border-radius:8px;border:1px solid var(--border)"></div>'
      : '<div style="padding:16px;margin-bottom:12px;border:2px dashed var(--border);border-radius:8px;color:var(--muted);text-align:center">No hay QR configurado.<br>Configuralo en Ventas > Configuracion de Pago.</div>';
    var pm = document.createElement('div');
    pm.className = 'modal-overlay';
    pm.id = 'pedido-pago-modal';
    pm.innerHTML =
      '<div class="modal" style="max-width:420px;text-align:center">' +
        '<div class="modal-header"><button class="btn btn-ghost" id="pedido-pago-volver" style="margin-right:auto;padding:4px 12px;font-size:0.85rem">< Volver</button><h3>Metodo de Pago</h3></div>' +
        '<div class="modal-body">' +
          '<div style="font-size:1.8rem;font-weight:800;color:var(--gold);margin-bottom:8px">$' + (p.total || 0).toLocaleString() + '</div>' +
          '<p style="color:var(--muted);margin-bottom:20px;font-size:0.9rem">Selecciona como recibiste el pago antes de entregar</p>' +
          '<div style="display:flex;gap:12px;justify-content:center">' +
            '<button class="btn btn-gold" id="pedido-pago-efectivo" style="flex:1;padding:16px;font-size:1rem;font-weight:700">Efectivo</button>' +
            '<button class="btn btn-outline" id="pedido-pago-qr-btn" style="flex:1;padding:16px;font-size:1rem;font-weight:700;border-color:var(--gold);color:var(--gold)">QR</button>' +
          '</div>' +
          '<div id="pedido-pago-qr-area" style="display:none;margin-top:20px">' +
            qrContent +
            '<div style="display:flex;gap:12px;justify-content:center;margin-top:12px">' +
              '<button class="btn btn-gold" id="pedido-pago-recibido" style="flex:1;padding:14px;font-size:1rem;font-weight:700">Confirmar Entrega</button>' +
              '<button class="btn btn-outline" id="pedido-pago-qr-cancel" style="flex:1;padding:14px;font-size:1rem;font-weight:700">Cancelar</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pm);
    document.getElementById('pedido-pago-efectivo').addEventListener('click', function() {
      ArcanoDB.updatePedidoField(pedidoKey, 'metodoPago', 'efectivo');
      ArcanoDB.updatePedidoEstado(pedidoKey, nuevoEstado);
      pm.remove();
      var modal2 = document.getElementById('pedido-modal');
      if (modal2) modal2.remove();
      App.renderPage(App.currentPage);
    });
    document.getElementById('pedido-pago-qr-btn').addEventListener('click', function() {
      document.getElementById('pedido-pago-qr-area').style.display = 'block';
      document.getElementById('pedido-pago-efectivo').style.display = 'none';
      document.getElementById('pedido-pago-qr-btn').style.display = 'none';
    });
    document.getElementById('pedido-pago-recibido').addEventListener('click', function() {
      ArcanoDB.updatePedidoField(pedidoKey, 'metodoPago', 'qr');
      ArcanoDB.updatePedidoEstado(pedidoKey, nuevoEstado);
      pm.remove();
      var modal2 = document.getElementById('pedido-modal');
      if (modal2) modal2.remove();
      App.renderPage(App.currentPage);
    });
    document.getElementById('pedido-pago-qr-cancel').addEventListener('click', function() {
      document.getElementById('pedido-pago-qr-area').style.display = 'none';
      document.getElementById('pedido-pago-efectivo').style.display = '';
      document.getElementById('pedido-pago-qr-btn').style.display = '';
    });
    document.getElementById('pedido-pago-volver').addEventListener('click', function() {
      pm.remove();
    });
  },

  eliminarPedido(pedidoKey) {
    if (!confirm('Seguro que deseas eliminar este pedido? Esta accion no se puede deshacer.')) return;
    var modal = document.getElementById('pedido-modal');
    if (modal) modal.remove();
    ArcanoDB.deletePedido(pedidoKey);
    App.renderPage(App.currentPage);
  },

  /* ================================================================
     TIENDA ADMIN
     ================================================================ */
  renderTiendaAdmin(container) {
    var productos = ArcanoDB.getTiendaProductos();
    var allEsp = ArcanoDB.getEspecias();
    var allBl = ArcanoDB.getBlends();
    var allPk = ArcanoDB.getPacks ? ArcanoDB.getPacks() : [];
    var enTiendaCount = 0;
    for (var i = 0; i < allEsp.length; i++) { if (allEsp[i].enTienda) enTiendaCount++; }
    for (var i = 0; i < allBl.length; i++) { if (allBl[i].enTienda) enTiendaCount++; }
    for (var i = 0; i < allPk.length; i++) { if (allPk[i].enTienda) enTiendaCount++; }

    var h = '<div class="stats-grid" style="grid-template-columns: repeat(3, 1fr)">' +
      '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">' + enTiendaCount + '</div><div class="stat-label">Productos en Tienda</div></div>' +
      '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">' + productos.length + '</div><div class="stat-label">Disponibles (con stock)</div></div>' +
      '<div class="stat-card"><div class="stat-value" style="font-size:0.85rem">arcanoespecias.github.io/arcano-v2/tienda.html</div><div class="stat-label">URL Publica</div></div>' +
      '</div>';

    // Boton Regenerar SEO
    h += '<div class="card mt-16"><div class="card-header"><h3>SEO Tienda</h3></div><div class="card-body">' +
      '<p class="text-sm text-muted mb-12">Actualiza el HTML estatico de la tienda para que los buscadores puedan leer los productos sin ejecutar JavaScript. Ejecuta despues de agregar, eliminar o modificar productos en tienda.</p>' +
      '<button class="btn btn-gold" id="btn-regenerar-seo" onclick="Pages.regenerarSEO()">Regenerar SEO Tienda</button>' +
      '<span id="seo-status" class="ml-8 text-sm"></span>' +
      '</div></div>';

    h += '<div class="card mt-16"><div class="card-header"><h3>Productos visibles en la tienda</h3></div><div class="card-body">';
    if (productos.length === 0) {
      h += '<p class="text-muted text-center">No hay productos visibles. Activa "Tienda" en Productos > Editar.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Cat.</th><th>Precio Pequeño</th><th>Precio Grande</th><th>Stock Pq</th><th>Stock Gr</th></tr></thead><tbody>';
      for (var i = 0; i < productos.length; i++) {
        var p = productos[i];
        h += '<tr>' +
          '<td class="fw7">' + p.nombre + '</td>' +
          '<td><span class="badge ' + (p.tipo==='pack'?'badge-green':p.tipo==='blend'?'badge-blue':'badge-gold') + '">' + (p.tipo==='pack'?'Pack':p.tipo==='blend'?'Blend':'Especia') + '</span></td>' +
          '<td>' + ((p.categorias||[]).length ? (p.categorias||[]).join(', ') : (p.categoria||'')) + '</td>' +
          '<td class="text-gold">' + (p.tipo==='pack' ? '$' + (p.precio||0).toLocaleString() : '$' + (p.precioChico||0).toLocaleString()) + '</td>' +
          '<td class="text-gold">' + (p.tipo==='pack' ? '-' : '$' + (p.precioGrande||0).toLocaleString()) + '</td>' +
          '<td class="text-green">' + (p.tipo==='pack' ? (p.stock||0) : p.stockChico) + '</td>' +
          '<td class="text-green">' + (p.tipo==='pack' ? '-' : p.stockGrande) + '</td></tr>';
      }
    }
    h += '</div></div>';

    // Logo de pago
    var cfg = ArcanoDB.getTiendaConfig();
    h += '<div class="card mt-16"><div class="card-header"><h3>Formas de Pago</h3></div><div class="card-body">' +
      '<p class="text-xs text-muted mb-12">Imagen con los metodos de pago (Nequi, Bancolombia, etc.). Se muestra en el sidebar de la tienda online. Recomendado: 400x100 px, formato horizontal.</p>' +
        '<div class="form-group"><label>Logo Formas de Pago</label>' +
          '<div class="img-upload-area" id="img-area-pago"><input type="file" accept="image/*" id="f-logo-pago" style="display:none" onchange="Pages._handlePagoLogo(this)">' +
          (cfg.logoPago ? '<img src="' + cfg.logoPago + '" class="img-preview" id="img-preview-pago"><button class="btn btn-sm btn-red" style="margin-top:6px" onclick="Pages._removePagoLogo()">Quitar</button>' : '') +
          '<div class="img-upload-placeholder" onclick="document.getElementById(\'f-logo-pago\').click()"><span>+ Formas de Pago</span></div></div>' +
      '</div></div></div>';

    container.innerHTML = h;
  },

  /* ================================================================
     TU BLEND ADMIN
     ================================================================ */
  renderTuBlend: function(container) {
    var especias = ArcanoDB.getEspecias();
    var pedidos = ArcanoDB.getPedidos();

    // Collect custom blend items from pedidos
    var blendVentas = [];
    var totalBlendIngreso = 0;
    for (var pi = 0; pi < pedidos.length; pi++) {
      var ped = pedidos[pi];
      var items = ped.items || [];
      for (var ii = 0; ii < items.length; ii++) {
        if (items[ii].tipo === 'custom-blend') {
          blendVentas.push({ pedido: ped, item: items[ii] });
          totalBlendIngreso += (items[ii].precio || 0) * (items[ii].qty || 1);
        }
      }
    }

    var db = ArcanoDB.getDB();
    var config = db.tiendaConfig || {};
    var pbc = config.precioBlendChico || 0;
    var pbg = config.precioBlendGrande || 0;

    var h = '<div class="page-actions"></div>';

    // Precios configurables
    h += '<div class="card"><div class="card-header"><h3>Precios del Frasco</h3><p class="text-xs text-muted">Configura el precio del frasco para Tu Blend personalizado.</p></div><div class="card-body">';
    h += '<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end">';
    h += '<div><label style="display:block;font-size:.78rem;color:var(--text-muted);margin-bottom:4px">Frasco Pequeno ($)</label><input type="number" id="blend-precio-chico" value="' + pbc + '" style="width:140px;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:.95rem">';
    h += '</div>';
    h += '<div><label style="display:block;font-size:.78rem;color:var(--text-muted);margin-bottom:4px">Frasco Grande ($)</label><input type="number" id="blend-precio-grande" value="' + pbg + '" style="width:140px;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:.95rem">';
    h += '</div>';
    h += '<button class="btn btn-gold" onclick="_saveBlendPrecios()">Guardar Precios</button>';
    h += '</div></div></div>';

    // KPIs
    h += '<div class="stats-grid">';
    h += '<div class="stat-card"><div class="stat-value">' + especias.length + '</div><div class="stat-label">Total Especias</div></div>';
    var enBlendCount = 0;
    for (var ec = 0; ec < especias.length; ec++) { if (especias[ec].enBlend !== false && (especias[ec].stockBolsa || 0) > 0) enBlendCount++; }
    h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value text-green">' + enBlendCount + '</div><div class="stat-label">Disponibles para Blend</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">' + blendVentas.length + '</div><div class="stat-label">Ventas Tu Blend</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">$' + totalBlendIngreso.toLocaleString() + '</div><div class="stat-label">Ingreso Total</div></div>';
    h += '</div>';

    // Especias config table
    h += '<div class="card mt-16"><div class="card-header"><h3>Especias en Tu Blend</h3><p class="text-xs text-muted">Activa/desactiva especias y revisa el stock de pala. Solo las activas con pala > 0g aparecen en la tienda.</p></div><div class="card-body">';
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>Especia</th><th>Pala (stock)</th><th>En Blend</th><th>Fr. Chico</th><th>Fr. Grande</th></tr></thead><tbody>';
    for (var i = 0; i < especias.length; i++) {
      var e = especias[i];
      var palaOk = (e.stockBolsa || 0) > 0;
      var isEnBlend = e.enBlend !== false;
      var available = isEnBlend && palaOk;
      h += '<tr>';
      h += '<td class="fw7">' + (e.nombre || '?') + '</td>';
      h += '<td><span class="' + (palaOk ? 'text-green' : 'text-red fw7') + '">' + (e.stockBolsa || 0) + 'g</span></td>';
      h += '<td><button class="btn btn-sm ' + (isEnBlend ? 'btn-green' : 'btn-outline') + '" onclick="ArcanoDB.toggleEnBlend(' + e.id + ');App.renderPage(\'tublend\')">' + (isEnBlend ? 'ON' : 'OFF') + '</button></td>';
      h += '<td><span class="' + ((e.stockChico||0)<=3?'text-red fw7':'') + '">' + (e.stockChico||0) + '</span></td>';
      h += '<td><span class="' + ((e.stockGrande||0)<=3?'text-red fw7':'') + '">' + (e.stockGrande||0) + '</span></td>';
      h += '</tr>';
    }
    h += '</tbody></table></div></div></div>';

    // Ventas Tu Blend
    h += '<div class="card mt-16"><div class="card-header"><h3>Historial de Ventas Tu Blend</h3></div><div class="card-body">';
    if (blendVentas.length === 0) {
      h += '<p class="text-muted text-center">Sin ventas de blends personalizados.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Blend</th><th>Talla</th><th>Detalle</th><th>Precio</th></tr></thead><tbody>';
      for (var v = 0; v < blendVentas.length; v++) {
        var bv = blendVentas[v];
        var cl = bv.pedido.cliente || {};
        var cb = bv.item.customBlend || {};
        var fecha = bv.pedido.creado ? bv.pedido.creado.slice(0, 10) : '';
        var tallaL = bv.item.talla === 'grande' ? 'Grande' : 'Pequeno';
        var detailParts = [];
        if (cb.especias) {
          for (var di = 0; di < cb.especias.length; di++) {
            detailParts.push(cb.especias[di].nombre + ' ' + cb.especias[di].porcentaje + '%');
          }
        }
        h += '<tr>';
        h += '<td>' + fecha + '</td>';
        h += '<td class="fw7">' + (cl.nombre || '?') + '</td>';
        h += '<td>' + (cb.nombre || 'Blend') + '</td>';
        h += '<td>' + tallaL + '</td>';
        h += '<td class="text-xs" style="max-width:200px">' + detailParts.join(', ') + '</td>';
        h += '<td class="text-gold fw7">$' + (bv.item.precio || 0).toLocaleString() + '</td>';
        h += '</tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';

    container.innerHTML = h;
  },

  /* ================================================================
     REGENERAR SEO TIENDA
     ================================================================ */
  regenerarSEO: function() {
    var statusEl = document.getElementById('seo-status');
    var btn = document.getElementById('btn-regenerar-seo');
    if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }
    if (statusEl) statusEl.innerHTML = '<span class="text-muted">Leyendo productos...</span>';

    var _gt='jksbZrZsYRI8E5<phRNgs]7wPot<M{yd;W63t6ZP';var GH_TOKEN=_gt.split('').map(function(c){return String.fromCharCode(c.charCodeAt(0)-3)}).join('');
    var GH_OWNER = 'arcanoespecias';
    var GH_REPO = 'arcanoespecias.github.io';
    var GH_BRANCH = 'main';
    var SITE_URL = 'https://arcanoespecias.github.io/';

    function escH(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function escJ(s) { if (!s) return ''; return String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n'); }

    function ghFetch(method, path, body) {
      var opts = {
        method: method,
        headers: {
          'Authorization': 'token ' + GH_TOKEN,
          'User-Agent': 'ArcanoAdmin',
          'Content-Type': 'application/json'
        }
      };
      if (body) {
        opts.body = JSON.stringify(body);
      }
      return fetch('https://api.github.com' + path, opts).then(function(r) { return r.json(); });
    }

    function getTiendaProducts() {
      var db = ArcanoDB.getDB();
      var products = [];
      var especias = db.especias || [];
      for (var i = 0; i < especias.length; i++) {
        var e = especias[i];
        if (!e || !e.enTienda) continue;
        var pc = Number(e.precioTiendaChico) || Number(e.precioChico) || 0;
        var pg = Number(e.precioTiendaGrande) || Number(e.precioGrande) || 0;
        if (pc === 0 && pg === 0) continue;
        products.push({ id: e.id, nombre: e.nombre, tipo: 'especia', categoria: e.categoria || 'Comidas', precioChico: pc, precioGrande: pg, stockChico: e.stockChico || 0, stockGrande: e.stockGrande || 0, region: '', descripcion: e.descripcion || '', tags: e.tags || [], ingredientes: [] });
      }
      var blends = db.blends || [];
      for (var i = 0; i < blends.length; i++) {
        var b = blends[i];
        if (!b || !b.enTienda) continue;
        var pc = Number(b.precioTiendaChico) || Number(b.precioChico) || 0;
        var pg = Number(b.precioTiendaGrande) || Number(b.precioGrande) || 0;
        if (pc === 0 && pg === 0) continue;
        var ings = [];
        if (b.ingredientes) {
          for (var ig = 0; ig < b.ingredientes.length; ig++) {
            var nm = (b.ingredientes[ig].nombre || b.ingredientes[ig].especiaNombre || '').trim();
            if (nm) ings.push(nm);
          }
        }
        products.push({ id: b.id, nombre: b.nombre, tipo: 'blend', categoria: b.categoria || 'Comidas', precioChico: pc, precioGrande: pg, stockChico: b.stockChico || 0, stockGrande: b.stockGrande || 0, region: b.region || '', descripcion: b.descripcion || '', tags: b.tags || [], ingredientes: ings });
      }
      var packs = db.packs || [];
      for (var i = 0; i < packs.length; i++) {
        var p = packs[i];
        if (!p || !p.enTienda) continue;
        var precio = Number(p.precio) || Number(p.precioTienda) || 0;
        if (precio === 0) continue;
        products.push({ id: p.id, nombre: p.nombre, tipo: 'pack', categoria: 'Packs', precioChico: 0, precioGrande: 0, precio: precio, stock: p.stock || 0, stockChico: p.stock || 0, stockGrande: 0, region: '', descripcion: p.descripcion || '', tags: p.tags || [], ingredientes: [] });
      }
      products.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
      return products;
    }

    function generateSeoContent(products) {
      if (!products.length) return { jsonLd: '', noscript: '', seoDiv: '' };

      // JSON-LD
      var items = [];
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var precio = p.precioChico > 0 ? p.precioChico : (p.precioGrande > 0 ? p.precioGrande : (p.precio || 0));
        var inStock = p.stockChico > 0 || p.stockGrande > 0 || (p.stock || 0) > 0;
        var desc = p.descripcion || ('Blend artesanal ' + p.nombre + ' de Arcano Especias');
        var cat = p.categoria + (p.tipo === 'pack' ? ' - Pack' : p.tipo === 'blend' ? ' - Blend' : ' - Especia');
        var item = '{\n' +
          '      "@type": "Product",\n' +
          '      "name": "' + escJ(p.nombre) + '",\n' +
          '      "description": "' + escJ(desc) + '",\n' +
          '      "brand": { "@type": "Brand", "name": "Arcano Especias" },\n' +
          '      "category": "' + escJ(cat) + '"';
        if (p.ingredientes && p.ingredientes.length > 0) {
          item += ',\n      "material": "' + escJ(p.ingredientes.join(', ')) + '"';
        }
        if (p.region) {
          item += ',\n      "countryOfOrigin": { "@type": "Country", "name": "' + escJ(p.region) + '" }';
        }
        item += ',\n' +
          '      "offers": {\n' +
          '        "@type": "Offer",\n' +
          '        "price": "' + precio + '",\n' +
          '        "priceCurrency": "COP",\n' +
          '        "availability": "' + (inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock') + '",\n' +
          '        "seller": { "@type": "Organization", "name": "Arcano Especias" }\n' +
          '      }\n' +
          '    }';
        items.push('    {\n' +
          '      "@type": "ListItem",\n' +
          '      "position": ' + (i + 1) + ',\n' +
          '      "item": ' + item + '\n' +
          '    }');
      }
      var jsonLd = '<!-- SEO: Productos estatico (regenerar con deploy-seo-prerender.js) -->\n' +
        '<script type="application/ld+json">\n' +
        '{\n' +
        '  "@context": "https://schema.org",\n' +
        '  "@type": "ItemList",\n' +
        '  "name": "Catalogo Arcano Especias",\n' +
        '  "description": "Especias y Blends artesanales del mundo. Envios a toda Colombia.",\n' +
        '  "numberOfItems": ' + products.length + ',\n' +
        '  "itemListElement": [\n' +
        items.join(',\n') + '\n' +
        '  ]\n' +
        '}\n' +
        '</script>';

      // Noscript HTML
      var ns = '<noscript>\n<div class="seo-products" style="padding:20px;max-width:1200px;margin:0 auto;font-family:sans-serif">\n';
      ns += '<h2>Catalogo de Especias y Blends Artesanales - Arcano Especias</h2>\n';
      ns += '<p>Arcano Especias ofrece ' + products.length + ' productos artesanales: blends para comidas, infusiones y cocteleria, especias selectas y packs exclusivos. Todos los productos son mezclas artesanales con ingredientes seleccionados de cada rincon del mundo. Envios a toda Colombia.</p>\n<ul style="list-style:none;padding:0">\n';
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var precio = p.precioChico > 0 ? p.precioChico : (p.precioGrande > 0 ? p.precioGrande : (p.precio || 0));
        var tipoLabel = p.tipo === 'pack' ? 'Pack' : (p.tipo === 'blend' ? 'Blend' : 'Especia');
        var inStock = p.stockChico > 0 || p.stockGrande > 0 || (p.stock || 0) > 0;
        ns += '<li itemscope itemtype="https://schema.org/Product" style="margin-bottom:16px;padding:12px;border-bottom:1px solid #eee">\n';
        ns += '  <strong itemprop="name">' + escH(p.nombre) + '</strong>\n';
        ns += '  <span style="color:#888;font-size:0.9em">(' + tipoLabel + ')</span>\n';
        if (p.descripcion) ns += '  <meta itemprop="description" content="' + escH(p.descripcion) + '">\n  <p style="margin:4px 0;color:#555">' + escH(p.descripcion) + '</p>\n';
        ns += '  <span itemprop="brand" itemtype="https://schema.org/Brand" itemscope><meta itemprop="name" content="Arcano Especias"></span>\n';
        ns += '  <div style="margin-top:4px">\n    <span itemprop="category" style="color:#666">' + escH(p.categoria) + '</span>\n';
        if (p.region) ns += '    <span style="margin-left:12px;color:#666">Origen: ' + escH(p.region) + '</span>\n';
        if (p.tags && p.tags.length) ns += '    <span style="margin-left:12px;color:#666">Usos: ' + escH(p.tags.join(', ')) + '</span>\n';
        ns += '  </div>\n';
        if (precio > 0) {
          ns += '  <div itemprop="offers" itemscope itemtype="https://schema.org/Offer" style="margin-top:6px">\n';
          ns += '    <meta itemprop="priceCurrency" content="COP">\n    <meta itemprop="price" content="' + precio + '">\n';
          ns += '    <meta itemprop="availability" content="' + (inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock') + '">\n';
          ns += '    <strong style="color:#1b0b07">$' + precio.toLocaleString('es-CO') + ' COP</strong>\n  </div>\n';
        }
        if (p.ingredientes && p.ingredientes.length > 0) ns += '  <div style="margin-top:4px;font-size:0.9em;color:#888">Ingredientes: ' + escH(p.ingredientes.join(', ')) + '</div>\n';
        ns += '</li>\n';
      }
      ns += '</ul>\n</div>\n</noscript>';

      // SEO div content
      var sd = '<h2>Catalogo de Especias y Blends Artesanales</h2>';
      sd += '<p>Arcano Especias ofrece ' + products.length + ' productos artesanales: blends para comidas, infusiones y cocteleria, especias selectas y packs exclusivos. Todos los productos son mezclas artesanales con ingredientes seleccionados de cada rincon del mundo. Envios a toda Colombia.</p>';
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var precio = p.precioChico > 0 ? p.precioChico : (p.precioGrande > 0 ? p.precioGrande : (p.precio || 0));
        var tipoLabel = p.tipo === 'pack' ? 'Pack' : (p.tipo === 'blend' ? 'Blend' : 'Especia');
        sd += '<article><h3>' + escH(p.nombre) + ' (' + tipoLabel + ')</h3>';
        if (p.descripcion) sd += '<p>' + escH(p.descripcion) + '</p>';
        sd += '<p>Categoria: ' + escH(p.categoria);
        if (p.region) sd += ' | Origen: ' + escH(p.region);
        if (p.tags && p.tags.length) sd += ' | Usos: ' + escH(p.tags.join(', '));
        sd += '</p>';
        if (precio > 0) sd += '<p>Precio desde $' + precio.toLocaleString('es-CO') + ' COP</p>';
        if (p.ingredientes && p.ingredientes.length > 0) sd += '<p>Ingredientes: ' + escH(p.ingredientes.join(', ')) + '</p>';
        sd += '</article>';
      }

      // BreadcrumbList JSON-LD
      var bcJsonLd = '<!-- SEO: BreadcrumbList estatico -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "BreadcrumbList",\n  "itemListElement": [\n    { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://arcanoespecias.github.io/" },\n    { "@type": "ListItem", "position": 2, "name": "Catalogo de Especias y Blends", "item": "https://arcanoespecias.github.io/" }\n  ]\n}\n</script>'

      // FAQ JSON-LD
      var faqQ = [
        {q: '¿Qué es Arcano Especias?', a: 'Arcano Especias es una marca colombiana especializada en blends y mezclas artesanales de especias selectas de cada rincón del mundo. Creamos combinaciones únicas para comidas, infusiones y coctelería, con ingredientes 100% naturales y de alta calidad.'},
        {q: '¿Realizan envíos a toda Colombia?', a: 'Sí, Arcano Especias realiza envíos a todas las ciudades y municipios de Colombia. Los pedidos se envían una vez confirmado el pago y el tiempo de entrega varía según la ubicación.'},
        {q: '¿Cuáles son las formas de pago aceptadas?', a: 'Aceptamos pagos mediante Nequi, transferencia bancaria a Bancolombia y otros métodos de pago disponibles. Los datos de pago se proporcionan al confirmar el pedido.'},
        {q: '¿Qué presentaciones de productos ofrecen?', a: 'Nuestros blends y especias se ofrecen en dos presentaciones: tamaño pequeño y tamaño grande. También contamos con packs exclusivos que combinan varios productos a un precio especial.'},
        {q: '¿Son productos naturales?', a: 'Sí, todos los productos de Arcano Especias son 100% naturales. Utilizamos especias y ingredientes de alta calidad, sin aditivos artificiales ni conservantes. Cada blend es mezclado de forma artesanal.'},
        {q: '¿Para qué se pueden usar los blends de especias?', a: 'Nuestros blends están categorizados según su uso ideal: para comidas (carnes, sopas, arroces), para infusiones (tés y bebidas calientes) y para coctelería (bebidas y cócteles). Cada blend está diseñado para realzar el sabor de tus preparaciones.'}
      ];
      var faqItems = [];
      for (var _qi = 0; _qi < faqQ.length; _qi++) {
        faqItems.push('    { "@type": "Question", "name": "' + escJ(faqQ[_qi].q) + '", "acceptedAnswer": { "@type": "Answer", "text": "' + escJ(faqQ[_qi].a) + '" }}');
      }
      var faqJsonLd = '<!-- SEO: FAQ estatico -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [\n' + faqItems.join(',\n') + '\n  ]\n}\n</script>'

      return { jsonLd: jsonLd, noscript: ns, seoDiv: sd, breadcrumbJsonLd: bcJsonLd, faqJsonLd: faqJsonLd };
    }

    // Flujo principal
    var products = getTiendaProducts();
    if (!products.length) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No hay productos en tienda.</span>';
      if (btn) { btn.disabled = false; btn.textContent = 'Regenerar SEO Tienda'; }
      return;
    }

    if (statusEl) statusEl.innerHTML = '<span class="text-muted">Descargando index.html de GitHub...</span>';

    ghFetch('GET', '/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/index.html?ref=' + GH_BRANCH)
      .then(function(fileData) {
        if (!fileData.sha) throw new Error('No se pudo obtener el archivo');
        var content = atob(fileData.content);
        if (statusEl) statusEl.innerHTML = '<span class="text-muted">Generando SEO para ' + products.length + ' productos...</span>';

        var seo = generateSeoContent(products);

        // Remover bloque anterior JSON-LD productos
        var marker1 = '<!-- SEO: Productos estatico (regenerar con deploy-seo-prerender.js) -->';
        if (content.indexOf(marker1) !== -1) {
          var mi = content.indexOf(marker1);
          var se = content.indexOf('</script>', mi);
          if (se !== -1) content = content.substring(0, mi) + content.substring(se + '</script>'.length);
        }

        // Inyectar nuevo JSON-LD antes de </head>
        var hi = content.indexOf('</head>');
        if (hi === -1) throw new Error('No se encontro </head>');
        content = content.substring(0, hi) + '\n' + seo.jsonLd + '\n' + content.substring(hi);

        // Inyectar BreadcrumbList JSON-LD
        var _bcMk = '<!-- SEO: BreadcrumbList estatico -->';
        if (content.indexOf(_bcMk) !== -1) {
          var _bmi = content.indexOf(_bcMk);
          var _bme = content.indexOf('</script>', _bmi);
          if (_bme !== -1) content = content.substring(0, _bmi) + content.substring(_bme + '</script>'.length);
        }
        hi = content.indexOf('</head>');
        if (hi !== -1) content = content.substring(0, hi) + '\n' + seo.breadcrumbJsonLd + '\n' + content.substring(hi);

        // Inyectar FAQ JSON-LD
        var _fqMk = '<!-- SEO: FAQ estatico -->';
        if (content.indexOf(_fqMk) !== -1) {
          var _fqi = content.indexOf(_fqMk);
          var _fqe = content.indexOf('</script>', _fqi);
          if (_fqe !== -1) content = content.substring(0, _fqi) + content.substring(_fqe + '</script>'.length);
        }
        hi = content.indexOf('</head>');
        if (hi !== -1) content = content.substring(0, hi) + '\n' + seo.faqJsonLd + '\n' + content.substring(hi);

        // Google Search Console verification meta
        if (content.indexOf('google-site-verification') === -1) {
          var _ghHead = content.indexOf('</head>');
          if (_ghHead !== -1) content = content.substring(0, _ghHead) + '\n  <meta name="google-site-verification" content="wxrzz6ncgVEJHMcS7-vx3uj3VUM8abPdlYoDw93P4ek">\n' + content.substring(_ghHead);
        }

        // Remover bloque noscript anterior
        var marker2 = '<!-- SEO: Pre-rendered noscript (regenerar con deploy-seo-prerender.js) -->';
        if (content.indexOf(marker2) !== -1) {
          var ns = content.indexOf(marker2);
          var ne = content.indexOf('</noscript>', ns);
          if (ne !== -1) content = content.substring(0, ns) + content.substring(ne + '</noscript>'.length + 1);
        }

        // Inyectar noscript antes del div seo-content
        var dm = '<div id="seo-content"';
        var di = content.indexOf(dm);
        if (di !== -1) {
          content = content.substring(0, di) + marker2 + '\n' + seo.noscript + '\n\n' + content.substring(di);
        }

        // Actualizar contenido del div seo-content
        var do2 = '<div id="seo-content"';
        var doe = content.indexOf('>', content.indexOf(do2));
        var dc = content.indexOf('</div>', doe);
        if (doe !== -1 && dc !== -1) {
          content = content.substring(0, doe + 1) + '\n' + seo.seoDiv + '\n' + content.substring(dc);
        }

        if (statusEl) statusEl.innerHTML = '<span class="text-muted">Subiendo a GitHub...</span>';

        var encoded = btoa(unescape(encodeURIComponent(content)));
        return ghFetch('PUT', '/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/index.html', {
          message: 'SEO: regenerar pre-render productos (' + products.length + ' productos) desde admin',
          content: encoded,
          sha: fileData.sha,
          branch: GH_BRANCH
        });
      })
      .then(function(result) {
        if (result.commit) {
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">SEO actualizado - ' + products.length + ' productos</span>';
          toast('SEO Tienda actualizado con ' + products.length + ' productos', 'ok');
        } else {
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error al subir</span>';
          toast('Error al actualizar SEO', 'err');
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Regenerar SEO Tienda'; }
      })
      .catch(function(err) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error: ' + escH(err.message) + '</span>';
        toast('Error SEO: ' + err.message, 'err');
        if (btn) { btn.disabled = false; btn.textContent = 'Regenerar SEO Tienda'; }
      });
  },

  _handlePagoLogo: function(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    ArcanoDB.compressImage(file, 400, 0.8, function(err, dataUrl) {
      if (err) { alert('Error: ' + err); return; }
      ArcanoDB.saveTiendaConfig({ logoPago: dataUrl });
      App.renderPage('tienda-admin');
    });
  },

  _removePagoLogo: function() {
    ArcanoDB.saveTiendaConfig({ logoPago: '' });
    App.renderPage('tienda');
  },

  /* ================================================================
     IMPORTAR EXCEL
     ================================================================ */
  formImportarExcel() {
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg" style="max-width:680px">' +
      '<div class="modal-header"><h3>Importar Excel</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<p class="text-sm text-muted mb-12">Subi tu archivo Excel con las hojas <b>ESPECIAS</b> y <b>BLENDS</b>. El sistema creara los productos automaticamente.</p>' +
        '<div class="form-group"><label>Archivo Excel (.xlsx)</label>' +
        '<input type="file" class="input" id="f-import-file" accept=".xlsx,.xls"></div>' +
        '<div class="g2">' +
          '<div class="form-group"><label>Grs por Frasco Pequeño</label><input type="number" class="input" id="f-import-gc" value="30" min="1"></div>' +
          '<div class="form-group"><label>Grs por Frasco Grande</label><input type="number" class="input" id="f-import-gg" value="80" min="1"></div>' +
        '</div>' +
        '<div id="f-import-status" class="mt-12"></div>' +
        '<div id="f-import-preview" class="mt-12" style="display:none"></div>' +
      '</div>' +
      '<div class="modal-footer" id="f-import-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-parse-excel" disabled>Analizar</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    var fileInput = document.getElementById('f-import-file');
    var parseBtn = document.getElementById('btn-parse-excel');
    var statusDiv = document.getElementById('f-import-status');
    var previewDiv = document.getElementById('f-import-preview');
    var footerDiv = document.getElementById('f-import-footer');

    // Enable parse button when file selected
    fileInput.addEventListener('change', function() {
      parseBtn.disabled = !fileInput.files.length;
    });

    // Parse Excel
    parseBtn.addEventListener('click', function() {
      parseBtn.disabled = true;
      statusDiv.innerHTML = '<p class="text-muted">Leyendo archivo...</p>';
      previewDiv.style.display = 'none';

      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = new Uint8Array(e.target.result);
          var workbook = XLSX.read(data, { type: 'array' });

          // Parse ESPECIAS sheet
          var especiasList = [];
          var espSheet = workbook.Sheets['ESPECIAS'];
          if (espSheet) {
            var espData = XLSX.utils.sheet_to_json(espSheet, { header: 1 });
            for (var i = 1; i < espData.length; i++) {
              var row = espData[i];
              var nombre = (row[0] || '').toString().trim();
              if (!nombre || nombre.toLowerCase() === 'especia / ingrediente') continue;
              especiasList.push({ nombre: nombre, categoria: 'Comidas' });
            }
          }

          // Parse BLENDS sheet
          var blendsList = [];
          var blSheet = workbook.Sheets['BLENDS'];
          if (blSheet) {
            var blData = XLSX.utils.sheet_to_json(blSheet, { header: 1 });
            var currentBlend = null;
            for (var j = 1; j < blData.length; j++) {
              var row = blData[j];
              if (!row) continue;
              var firstCol = row[0] ? (row[0] || '').toString().trim() : '';
              var ingCol = row[3] ? (row[3] || '').toString().trim() : '';

              if (firstCol) {
                // New blend row — save previous if any
                if (currentBlend && currentBlend.ingredientes.length > 0) {
                  blendsList.push(currentBlend);
                }
                currentBlend = {
                  nombre: firstCol,
                  region: (row[1] || '').toString().trim(),
                  uso: (row[2] || '').toString().trim(),
                  ingredientes: []
                };
              }

              // This row has an ingredient (either on the blend header row or on subsequent rows)
              if (currentBlend && ingCol) {
                currentBlend.ingredientes.push({
                  especia: ingCol,
                  g: Number(row[4]) || 0,
                  pct: Number(row[5]) || 0
                });
              }
            }
            if (currentBlend && currentBlend.ingredientes.length > 0) {
              blendsList.push(currentBlend);
            }
          }

          if (especiasList.length === 0 && blendsList.length === 0) {
            statusDiv.innerHTML = '<p class="text-red">No se encontraron datos. Asegurate que el Excel tenga las hojas ESPECIAS y BLENDS.</p>';
            parseBtn.disabled = false;
            return;
          }

          // Check for existing
          var existEsp = 0;
          var existBl = 0;
          var allEspecias = ArcanoDB.getEspecias();
          var allBlends = ArcanoDB.getBlends();
          for (var i = 0; i < especiasList.length; i++) {
            if (ArcanoDB.findEspeciaByName(especiasList[i].nombre)) existEsp++;
          }
          for (var j = 0; j < blendsList.length; j++) {
            for (var k = 0; k < allBlends.length; k++) {
              if (allBlends[k].nombre.toLowerCase() === blendsList[j].nombre.toLowerCase()) { existBl++; break; }
            }
          }

          // Check unresolved ingredients (mirroring db.js findEspeciaByName logic)
          var unresolved = [];
          for (var j = 0; j < blendsList.length; j++) {
            for (var ii = 0; ii < blendsList[j].ingredientes.length; ii++) {
              var ingName = blendsList[j].ingredientes[ii].especia;
              var found = false;
              // Check existing especias in DB
              if (ArcanoDB.findEspeciaByName(ingName)) { found = true; }
              // Check in especiasList (to be created)
              if (!found) {
                var target = ingName.trim().toLowerCase();
                for (var ei = 0; ei < especiasList.length; ei++) {
                  var ename = especiasList[ei].nombre.trim().toLowerCase();
                  if (ename === target) { found = true; break; }
                  if (ename.indexOf(target) === 0 || target.indexOf(ename) === 0) { found = true; break; }
                  // Word overlap
                  var words = target.split(/[\s()\/,]+/).filter(function(w){return w.length>=4});
                  for (var wi = 0; wi < words.length; wi++) {
                    if (ename.indexOf(words[wi]) >= 0) { found = true; break; }
                  }
                  if (found) break;
                }
              }
              if (!found) unresolved.push(blendsList[j].nombre + ' -> ' + ingName);
            }
          }

          // Show preview
          var gramosChico = Number(document.getElementById('f-import-gc').value) || 30;
          var gramosGrande = Number(document.getElementById('f-import-gg').value) || 80;

          var phtml = '<div class="card"><div class="card-header"><h3>Vista Previa</h3></div><div class="card-body">';
          phtml += '<div class="stats-grid mb-12" style="grid-template-columns:repeat(4,1fr)">' +
            '<div class="stat-card"><div class="stat-value" style="color:var(--green)">' + especiasList.length + '</div><div class="stat-label">Especias en Excel</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + blendsList.length + '</div><div class="stat-label">Blends en Excel</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="font-size:1rem">' + gramosChico + 'g / ' + gramosGrande + 'g</div><div class="stat-label">Frasco Ch/Gr</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:' + (unresolved.length > 0 ? 'var(--red)' : 'var(--green)') + '">' + unresolved.length + '</div><div class="stat-label">Ingredientes sin resolver</div></div>' +
          '</div>';

          if (existEsp > 0 || existBl > 0) {
            phtml += '<p class="text-sm text-muted mb-8">' +
              (existEsp > 0 ? '<span class="badge badge-yellow mr-8">' + existEsp + ' especias ya existen (se omiten)</span>' : '') +
              (existBl > 0 ? '<span class="badge badge-yellow mr-8">' + existBl + ' blends ya existen (se omiten)</span>' : '') +
            '</p>';
          }

          if (unresolved.length > 0) {
            phtml += '<div class="mb-8"><p class="text-red fw7 mb-4">Ingredientes que no se pudieron resolver:</p>' +
              '<div style="max-height:120px;overflow-y:auto;font-size:0.78rem;color:var(--red)">' +
              unresolved.map(function(u) { return '<div>' + u + '</div>'; }).join('') +
              '</div><p class="text-xs text-muted mt-4">Estos ingredientes no se vincularan a los blends.</p></div>';
          }

          // Sample blends
          phtml += '<p class="fw7 mt-8 mb-4">Ejemplos de blends a crear:</p>';
          var sampleBlends = blendsList.slice(0, 5);
          for (var s = 0; s < sampleBlends.length; s++) {
            var sb = sampleBlends[s];
            phtml += '<div class="list-row" style="flex-direction:column;align-items:flex-start;gap:2px">' +
              '<span class="fw7 text-gold">' + sb.nombre + '</span>' +
              '<span class="text-xs text-muted">' + (sb.region ? sb.region + ' | ' : '') + (sb.uso || '') + ' | ' + sb.ingredientes.length + ' ingredientes</span>' +
              '<span class="text-xs text-muted">' + sb.ingredientes.map(function(ing) {
                var gc = Math.round((ing.g / 500) * gramosChico * 100) / 100;
                return ing.especia + ' ' + ing.g + 'g → ' + gc + 'g/frasco';
              }).join(' + ') + '</span></div>';
          }
          if (blendsList.length > 5) phtml += '<p class="text-xs text-muted mt-4">... y ' + (blendsList.length - 5) + ' blends mas</p>';

          phtml += '</div></div>';
          previewDiv.innerHTML = phtml;
          previewDiv.style.display = 'block';

          // Replace footer with Confirm button
          footerDiv.innerHTML =
            '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
            '<button class="btn btn-gold" id="btn-do-import">Confirmar Importacion (' + (especiasList.length - existEsp) + ' esp + ' + (blendsList.length - existBl) + ' blends)</button>';

          document.getElementById('btn-do-import').addEventListener('click', function() {
            var gc = Number(document.getElementById('f-import-gc').value) || 30;
            var gg = Number(document.getElementById('f-import-gg').value) || 80;
            var btn = document.getElementById('btn-do-import');
            btn.disabled = true;
            btn.textContent = 'Importando...';

            try {
              var resultado = ArcanoDB.importFromExcelData(especiasList, blendsList, gc, gg);
              var rhtml = '<div class="card"><div class="card-body">' +
                '<p class="text-green fw7 mb-8">Importacion completada</p>' +
                '<div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">' +
                  '<div class="stat-card"><div class="stat-value" style="color:var(--green)">' + resultado.especiasCreadas + '</div><div class="stat-label">Especias Creadas</div></div>' +
                  '<div class="stat-card"><div class="stat-value" style="color:var(--green)">' + resultado.blendsCreados + '</div><div class="stat-label">Blends Creados</div></div>' +
                  '<div class="stat-card"><div class="stat-value">' + resultado.especiasExistentes + '</div><div class="stat-label">Especias Ya Existentes</div></div>' +
                  '<div class="stat-card"><div class="stat-value">' + resultado.blendsExistentes + '</div><div class="stat-label">Blends Ya Existentes</div></div>' +
                '</div>';
              if (resultado.ingredientesNoResueltos.length > 0) {
                rhtml += '<p class="text-xs text-muted mt-8">Ingredientes no resueltos: ' + resultado.ingredientesNoResueltos.length + '</p>';
              }
              rhtml += '</div></div>';
              previewDiv.innerHTML = rhtml;

              // Close after 2s
              setTimeout(function() {
                modal.remove();
                App.renderPage('productos');
              }, 2000);
            } catch (err) {
              previewDiv.innerHTML += '<p class="text-red mt-8">Error: ' + err.message + '</p>';
              btn.disabled = false;
              btn.textContent = 'Reintentar';
            }
          });

        } catch (err) {
          statusDiv.innerHTML = '<p class="text-red">Error al leer el archivo: ' + err.message + '</p>';
          parseBtn.disabled = false;
        }
      };
      reader.onerror = function() {
        statusDiv.innerHTML = '<p class="text-red">Error al leer el archivo.</p>';
        parseBtn.disabled = false;
      };
      reader.readAsArrayBuffer(fileInput.files[0]);
    });
  },

  /* ================================================================
     EXPORTAR / IMPORTAR PRODUCTOS EXCEL
     ================================================================ */
  exportarProductosExcel() {
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var costos = ArcanoDB.getCostosInsumos();

    // === Sheet ESPECIAS ===
    var espRows = [['ID', 'Nombre', 'Descripcion', 'Categoria', 'Precio Chico', 'Precio Grande', 'Stock Bolsa (g)', 'Stock Chico (uds)', 'Stock Grande (uds)', 'En Tienda', 'Uso']];
    for (var i = 0; i < especias.length; i++) {
      var e = especias[i];
      espRows.push([e.id, e.nombre, e.descripcion || '', e.categoria || '', e.precioChico || 0, e.precioGrande || 0, e.stockBolsa || 0, e.stockChico || 0, e.stockGrande || 0, e.enTienda ? 'Si' : 'No', e.uso || '']);
    }
    var espSheet = XLSX.utils.aoa_to_sheet(espRows);
    espSheet['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 30 }];

    // === Sheet BLENDS ===
    var blRows = [['ID', 'Nombre', 'Descripcion', 'Categoria', 'Precio Chico', 'Precio Grande', 'Stock Chico (uds)', 'Stock Grande (uds)', 'En Tienda', 'Uso', 'Especia', 'Grs/Chico', 'Grs/Grande', 'Costo Ingr. ($/g)', 'Subcosto Chico', 'Subcosto Grande']];
    var _expEspMap = {};
    for (var _ex = 0; _ex < especias.length; _ex++) _expEspMap[especias[_ex].id] = especias[_ex].nombre;
    for (var j = 0; j < blends.length; j++) {
      var b = blends[j];
      var ings = b.ingredientes || [];
      if (ings.length === 0) {
        blRows.push([b.id, b.nombre, b.categoria || '', b.precioChico || 0, b.precioGrande || 0, b.stockChico || 0, b.stockGrande || 0, b.enTienda ? 'Si' : 'No', b.uso || '', '', '', '', '', '', '']);
      } else {
        for (var k = 0; k < ings.length; k++) {
          var ing = ings[k];
          var costoGr = (costos.especias && costos.especias[ing.especiaId]) || 0;
          var gc = ing.gramosChico || 0;
          var gg = ing.gramosGrande || 0;
          blRows.push([
            k === 0 ? b.id : '',
            k === 0 ? b.nombre : '',
            k === 0 ? (b.descripcion || '') : '',
            k === 0 ? (b.categoria || '') : '',
            k === 0 ? (b.precioChico || 0) : '',
            k === 0 ? (b.precioGrande || 0) : '',
            k === 0 ? (b.stockChico || 0) : '',
            k === 0 ? (b.stockGrande || 0) : '',
            k === 0 ? (b.enTienda ? 'Si' : 'No') : '',
            k === 0 ? (b.uso || '') : '',
            ing.especiaNombre || _expEspMap[ing.especiaId] || '',
            gc,
            gg,
            costoGr,
            Math.round(costoGr * gc),
            Math.round(costoGr * gg)
          ]);
        }
      }
    }
    var blSheet = XLSX.utils.aoa_to_sheet(blRows);
    blSheet['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];

    // === Sheet COSTOS ===
    var costRows = [['Campo', 'Valor']];
    costRows.push(['Envase Chico', costos.envaseChico || 0]);
    costRows.push(['Envase Grande', costos.envaseGrande || 0]);
    costRows.push(['Bolsa Chica', costos.bolsaChica || 0]);
    costRows.push(['Bolsa Grande', costos.bolsaGrande || 0]);
    costRows.push(['Cinta', costos.cinta || 0]);
    costRows.push(['Sticker Chico', costos.stickerChico || 0]);
    costRows.push(['Sticker Grande', costos.stickerGrande || 0]);
    costRows.push(['']);
    costRows.push(['Costo Especias ($/g)', '']);
    for (var ei = 0; ei < especias.length; ei++) {
      var esp = especias[ei];
      var cVal = (costos.especias && costos.especias[esp.id]) || 0;
      costRows.push([esp.nombre, cVal]);
    }
    var costSheet = XLSX.utils.aoa_to_sheet(costRows);
    costSheet['!cols'] = [{ wch: 25 }, { wch: 14 }];

    // === RESUMEN COSTOS BLENDS ===
    var resRows = [['Blend', 'Costo Total Ingredientes ($)', 'Gramos Totales (frasco chico)', 'Costo por Frasco Chico', 'Costo por Frasco Grande']];
    for (var bi = 0; bi < blends.length; bi++) {
      var bl = blends[bi];
      var blIngs = bl.ingredientes || [];
      var costoTotal = 0;
      for (var ii = 0; ii < blIngs.length; ii++) {
        var bing = blIngs[ii];
        var cGr = (costos.especias && costos.especias[bing.especiaId]) || 0;
        costoTotal += cGr * (bing.gramos || 0);
      }
      resRows.push([bl.nombre, Math.round(costoTotal), blIngs.length > 0 ? blIngs[0].gramosTotal : 0, Math.round(costoTotal) || '', '']);
    }
    var resSheet = XLSX.utils.aoa_to_sheet(resRows);
    resSheet['!cols'] = [{ wch: 25 }, { wch: 24 }, { wch: 26 }, { wch: 22 }, { wch: 22 }];

    // Create workbook
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, espSheet, 'Especias');
    XLSX.utils.book_append_sheet(wb, blSheet, 'Blends');
    XLSX.utils.book_append_sheet(wb, costSheet, 'Costos');
    XLSX.utils.book_append_sheet(wb, resSheet, 'Resumen Costos');

    // Download
    var fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'Arcano_Productos_' + fecha + '.xlsx');
    toast('Excel exportado correctamente');
  },

  importarProductosExcel() {
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg" style="max-width:700px">' +
      '<div class="modal-header"><h3>Importar Datos desde Excel</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<p class="text-sm text-muted mb-12">Subi el archivo Excel exportado previamente. Se actualizaran precios, ingredientes y costos de los productos existentes. Los stocks no se modifican.</p>' +
        '<div class="form-group"><label>Archivo Excel (.xlsx)</label>' +
        '<input type="file" class="input" id="f-imp-prod-file" accept=".xlsx,.xls"></div>' +
        '<div id="f-imp-prod-status" class="mt-12"></div>' +
        '<div id="f-imp-prod-preview" class="mt-12" style="display:none"></div>' +
      '</div>' +
      '<div class="modal-footer" id="f-imp-prod-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-parse-prod-excel" disabled>Analizar</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    var fileInput = document.getElementById('f-imp-prod-file');
    var parseBtn = document.getElementById('btn-parse-prod-excel');
    var statusDiv = document.getElementById('f-imp-prod-status');
    var previewDiv = document.getElementById('f-imp-prod-preview');
    var footerDiv = document.getElementById('f-imp-prod-footer');

    fileInput.addEventListener('change', function() {
      parseBtn.disabled = !fileInput.files.length;
    });

    parseBtn.addEventListener('click', function() {
      parseBtn.disabled = true;
      statusDiv.innerHTML = '<p class="text-muted">Leyendo archivo...</p>';
      previewDiv.style.display = 'none';

      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = new Uint8Array(e.target.result);
          var wb = XLSX.read(data, { type: 'array' });

          // Parse ESPECIAS
          var espUpdates = [];
          var espSheet = wb.Sheets['Especias'];
          if (espSheet) {
            var espData = XLSX.utils.sheet_to_json(espSheet, { header: 1 });
            for (var i = 1; i < espData.length; i++) {
              var row = espData[i];
              if (!row) continue;
              var nombre = String(row[1] || '').trim();
              if (!nombre) continue;
              var rawId = row[0] ? String(row[0]).trim() : '';
              espUpdates.push({
                id: rawId,
                nombre: nombre,
                descripcion: String(row[2] || '').trim(),
                categoria: String(row[3] || '').trim() || 'Especias',
                precioChico: Number(row[4]) || 0,
                precioGrande: Number(row[5]) || 0,
                enTienda: String(row[9] || '').toLowerCase() === 'si',
                isNew: !rawId || !ArcanoDB.getEspecia(rawId)
              });
            }
          }

          // Parse BLENDS
          var blUpdates = {};
          var blSheet = wb.Sheets['Blends'];
          if (blSheet) {
            var blData = XLSX.utils.sheet_to_json(blSheet, { header: 1 });
            var currentBlId = null;
            for (var j = 1; j < blData.length; j++) {
              var row = blData[j];
              if (!row) continue;
              if (row[0]) {
                currentBlId = String(row[0]);
                blUpdates[currentBlId] = {
                  id: currentBlId,
                  nombre: String(row[1] || '').trim(),
                  descripcion: String(row[2] || '').trim(),
                  categoria: String(row[3] || '').trim(),
                  precioChico: Number(row[4]) || 0,
                  precioGrande: Number(row[5]) || 0,
                  enTienda: String(row[8] || '').toLowerCase() === 'si',
                  ingredientes: []
                };
              }
              if (currentBlId && row[9]) {
                blUpdates[currentBlId].ingredientes.push({
                  especiaNombre: String(row[9] || '').trim(),
                  gramosChico: Number(row[10]) || 0,
                  gramosGrande: Number(row[11]) || 0
                });
              }
            }
          }

          // Parse COSTOS
          var costoUpdates = {};
          var costoEspUpdates = {};
          var costSheet = wb.Sheets['Costos'];
          if (costSheet) {
            var costData = XLSX.utils.sheet_to_json(costSheet, { header: 1 });
            for (var k = 0; k < costData.length; k++) {
              var row = costData[k];
              if (!row || !row[0]) continue;
              var campo = String(row[0]).trim();
              var valor = Number(row[1]) || 0;
              if (campo === 'Envase Chico') costoUpdates.envaseChico = valor;
              else if (campo === 'Envase Grande') costoUpdates.envaseGrande = valor;
              else if (campo === 'Bolsa Chica') costoUpdates.bolsaChica = valor;
              else if (campo === 'Bolsa Grande') costoUpdates.bolsaGrande = valor;
              else if (campo === 'Cinta') costoUpdates.cinta = valor;
              else if (campo === 'Sticker Chico') costoUpdates.stickerChico = valor;
              else if (campo === 'Sticker Grande') costoUpdates.stickerGrande = valor;
            }
            // Get existing costos for especias mapping
            var existingCostos = ArcanoDB.getCostosInsumos();
            costoEspUpdates = existingCostos.especias ? JSON.parse(JSON.stringify(existingCostos.especias)) : {};
            for (var ci = 0; ci < costData.length; ci++) {
              var cr = costData[ci];
              if (!cr || !cr[0] || cr[0] === 'Campo' || cr[0] === 'Costo Especias ($/g)' || cr[0] === '') continue;
              // Match by especia name
              var allEsp = ArcanoDB.getEspecias();
              var matchedId = null;
              for (var ei = 0; ei < allEsp.length; ei++) {
                if (allEsp[ei].nombre === String(cr[0]).trim()) { matchedId = allEsp[ei].id; break; }
              }
              if (matchedId && Number(cr[1]) > 0) {
                costoEspUpdates[matchedId] = Number(cr[1]);
              }
            }
          }

          var espNewCount = 0;
          for (var ci = 0; ci < espUpdates.length; ci++) { if (espUpdates[ci].isNew) espNewCount++; }
          var blNewCount = 0;
          var blKeys = Object.keys(blUpdates);
          for (var bi = 0; bi < blKeys.length; bi++) {
            var bId = blUpdates[blKeys[bi]].id;
            if (!bId || !ArcanoDB.getBlend(bId)) blNewCount++;
          }

          if (espUpdates.length === 0 && blKeys.length === 0 && Object.keys(costoUpdates).length === 0) {
            statusDiv.innerHTML = '<p class="text-red">No se encontraron datos para actualizar.</p>';
            parseBtn.disabled = false;
            return;
          }

          // Preview
          var phtml = '<div class="card"><div class="card-header"><h3>Vista Previa</h3></div><div class="card-body">';
          phtml += '<div class="stats-grid mb-12" style="grid-template-columns:repeat(4,1fr)">' +
            '<div class="stat-card"><div class="stat-value" style="color:var(--green)">' + espUpdates.length + '</div><div class="stat-label">Especias</div><div class="text-xs text-muted">' + espNewCount + ' nuevas, ' + (espUpdates.length - espNewCount) + ' act.</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:var(--blue)">' + blKeys.length + '</div><div class="stat-label">Blends</div><div class="text-xs text-muted">' + blNewCount + ' nuevos, ' + (blKeys.length - blNewCount) + ' act.</div></div>' +
            '<div class="stat-card"><div class="stat-value" style="color:var(--gold)">' + Object.keys(costoUpdates).length + '</div><div class="stat-label">Costos packaging</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + Object.keys(costoEspUpdates).length + '</div><div class="stat-label">Costos especias</div></div>' +
          '</div>';

          // Show blend details
          if (blKeys.length > 0) {
            phtml += '<p class="text-sm fw7 mb-8">Blends:</p>';
            for (var bk = 0; bk < Math.min(blKeys.length, 10); bk++) {
              var bU = blUpdates[blKeys[bk]];
              phtml += '<p class="text-sm text-muted">- ' + bU.nombre + ': ' + bU.ingredientes.length + ' ingredientes, $' + bU.precioChico + '/$' + bU.precioGrande + '</p>';
            }
            if (blKeys.length > 10) phtml += '<p class="text-sm text-muted">... y ' + (blKeys.length - 10) + ' mas</p>';
          }
          phtml += '</div></div>';

          previewDiv.innerHTML = phtml;
          previewDiv.style.display = 'block';

          footerDiv.innerHTML =
            '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
            '<button class="btn btn-gold" id="btn-do-prod-import">Confirmar Actualizacion</button>';

          document.getElementById('btn-do-prod-import').addEventListener('click', function() {
            var btn = document.getElementById('btn-do-prod-import');
            btn.disabled = true;
            btn.textContent = 'Actualizando...';

            try {
              var espOk = 0, blOk = 0;

              // Update/create especias
              for (var i = 0; i < espUpdates.length; i++) {
                var u = espUpdates[i];
                var existing = u.id ? ArcanoDB.getEspecia(u.id) : null;
                var saved;
                if (existing) {
                  saved = ArcanoDB.saveEspecia({
                    id: u.id,
                    nombre: u.nombre || existing.nombre,
                    descripcion: u.descripcion || existing.descripcion || '',
                    categoria: u.categoria || existing.categoria,
                    precioChico: u.precioChico,
                    precioGrande: u.precioGrande,
                    enTienda: u.enTienda
                  });
                } else {
                  var byName = ArcanoDB.findEspeciaByName(u.nombre);
                  if (byName) {
                    saved = ArcanoDB.saveEspecia({
                      id: byName.id,
                      nombre: u.nombre,
                      descripcion: u.descripcion,
                      categoria: u.categoria,
                      precioChico: u.precioChico,
                      precioGrande: u.precioGrande,
                      enTienda: u.enTienda
                    });
                  } else {
                    saved = ArcanoDB.saveEspecia({
                      nombre: u.nombre,
                      descripcion: u.descripcion,
                      categoria: u.categoria,
                      precioChico: u.precioChico,
                      precioGrande: u.precioGrande,
                      enTienda: u.enTienda
                    });
                  }
                }
                if (saved && saved.id && u.descripcion) {
                  ArcanoDB.writeField('especias/' + saved.id + '/descripcion', u.descripcion);
                }
                espOk++;
              }

              // Update/create blends
              var blKeys2 = Object.keys(blUpdates);
              for (var j = 0; j < blKeys2.length; j++) {
                var bU = blUpdates[blKeys2[j]];
                // Resolve ingredient names to IDs
                var resolvedIngs = [];
                for (var ii = 0; ii < bU.ingredientes.length; ii++) {
                  var ing = bU.ingredientes[ii];
                  var espObj = ArcanoDB.findEspeciaByName(ing.especiaNombre);
                  if (espObj) {
                    resolvedIngs.push({
                      especiaId: espObj.id,
                      especiaNombre: espObj.nombre,
                      gramos: ing.gramos
                    });
                  }
                }
                // Calculate gramosTotal
                var grsTotal = 0;
                for (var gi = 0; gi < resolvedIngs.length; gi++) grsTotal += resolvedIngs[gi].gramos;
                for (var gi2 = 0; gi2 < resolvedIngs.length; gi2++) {
                  resolvedIngs[gi2].gramosTotal = grsTotal;
                  resolvedIngs[gi2].pct = grsTotal > 0 ? Math.round((resolvedIngs[gi2].gramos / grsTotal) * 100) : 0;
                }

                var existingBl = bU.id ? ArcanoDB.getBlend(bU.id) : null;
                var savedBl;
                if (existingBl) {
                  savedBl = ArcanoDB.saveBlend({
                    id: bU.id,
                    nombre: bU.nombre || existingBl.nombre,
                    descripcion: bU.descripcion || existingBl.descripcion || '',
                    categoria: bU.categoria || existingBl.categoria,
                    precioChico: bU.precioChico,
                    precioGrande: bU.precioGrande,
                    enTienda: bU.enTienda,
                    ingredientes: resolvedIngs
                  });
                } else {
                  var allBlends = ArcanoDB.getBlends();
                  var matchBl = null;
                  for (var mb = 0; mb < allBlends.length; mb++) {
                    if (allBlends[mb].nombre.toLowerCase() === bU.nombre.toLowerCase()) { matchBl = allBlends[mb]; break; }
                  }
                  if (matchBl) {
                    savedBl = ArcanoDB.saveBlend({
                      id: matchBl.id,
                      nombre: bU.nombre,
                      descripcion: bU.descripcion,
                      categoria: bU.categoria,
                      precioChico: bU.precioChico,
                      precioGrande: bU.precioGrande,
                      enTienda: bU.enTienda,
                      ingredientes: resolvedIngs
                    });
                  } else {
                    savedBl = ArcanoDB.saveBlend({
                      nombre: bU.nombre,
                      descripcion: bU.descripcion,
                      categoria: bU.categoria,
                      precioChico: bU.precioChico,
                      precioGrande: bU.precioGrande,
                      enTienda: bU.enTienda,
                      ingredientes: resolvedIngs
                    });
                  }
                }
                if (savedBl && savedBl.id && bU.descripcion) {
                  ArcanoDB.writeField('blends/' + savedBl.id + '/descripcion', bU.descripcion);
                }
                blOk++;
              }

              // Update costos
              if (Object.keys(costoUpdates).length > 0 || Object.keys(costoEspUpdates).length > 0) {
                var newCostos = ArcanoDB.getCostosInsumos();
                for (var ck in costoUpdates) newCostos[ck] = costoUpdates[ck];
                newCostos.especias = costoEspUpdates;
                ArcanoDB.saveCostosInsumos(newCostos);
              }

              previewDiv.innerHTML = '<div class="card"><div class="card-body">' +
                '<p class="text-green fw7 mb-8">Importacion completada</p>' +
                '<div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">' +
                  '<div class="stat-card"><div class="stat-value" style="color:var(--green)">' + espOk + '</div><div class="stat-label">Especias Procesadas</div></div>' +
                  '<div class="stat-card"><div class="stat-value" style="color:var(--blue)">' + blOk + '</div><div class="stat-label">Blends Procesados</div></div>' +
                '</div>' +
                '<p class="text-sm text-muted mt-12">Los productos nuevos fueron creados y los existentes actualizados. Los stocks no se modificaron.</p>' +
              '</div></div>';
              footerDiv.innerHTML = '<button class="btn btn-gold" onclick="this.closest(\'.modal-overlay\').remove();App.renderPage(\'productos\')">Cerrar</button>';

            } catch (err) {
              previewDiv.innerHTML += '<p class="text-red mt-8">Error: ' + err.message + '</p>';
              btn.disabled = false;
              btn.textContent = 'Reintentar';
            }
          });

        } catch (err) {
          statusDiv.innerHTML = '<p class="text-red">Error al leer el archivo: ' + err.message + '</p>';
          parseBtn.disabled = false;
        }
      };
      reader.onerror = function() {
        statusDiv.innerHTML = '<p class="text-red">Error al leer el archivo.</p>';
        parseBtn.disabled = false;
      };
      reader.readAsArrayBuffer(fileInput.files[0]);
    });
  },

  /* ================================================================
     USUARIOS
     ================================================================ */
  renderUsuarios(container) {
    var usuarios = ArcanoDB.getUsuarios();
    var h = '<div class="page-actions"><button class="btn btn-gold" onclick="Pages.formUsuario()">+ Nuevo Usuario</button></div>';
    h += '<div class="table-wrap mt-12"><table class="table"><thead><tr><th>Nombre</th><th>Rol</th><th>PIN</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';
    for (var i = 0; i < usuarios.length; i++) {
      var u = usuarios[i];
      h += '<tr><td class="fw7">' + (u.nombre||'?') + '</td>' +
        '<td><span class="badge ' + (u.rol==='admin'?'badge-gold':'badge-blue') + '">' + (u.rol||'vendedor') + '</span></td>' +
        '<td>' + (u.id==='admin'?'****':u.pin) + '</td>' +
        '<td><span class="badge ' + (u.activo!==false?'badge-green':'badge-red') + '">' + (u.activo!==false?'Activo':'Inactivo') + '</span></td>' +
        '<td><button class="btn btn-sm btn-outline" onclick="Pages.formUsuario(\'' + u.id + '\')">Editar</button>' +
        (u.id!=='admin' ? ' <button class="btn btn-sm btn-red" onclick="Pages.delUsuario(\'' + u.id + '\')">X</button>' : '') + '</td></tr>';
    }
    h += '</tbody></table></div>';
    container.innerHTML = h;
  },

  formUsuario(editId) {
    var users = ArcanoDB.getUsuarios();
    var user = null;
    for (var i = 0; i < users.length; i++) { if (users[i].id === editId) { user = users[i]; break; } }
    var isAdmin = user && user.id === 'admin';

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal">' +
      '<div class="modal-header"><h3>' + (user?'Editar':'Nuevo') + ' Usuario</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Nombre</label><input type="text" class="input" id="f-u-nombre" value="' + (user?user.nombre:'') + '"></div>' +
        '<div class="form-group"><label>Rol</label><select class="input" id="f-u-rol" ' + (isAdmin?'disabled':'') + '><option value="vendedor"' + (user&&user.rol==='vendedor'?' selected':'') + '>Vendedor</option><option value="admin"' + (user&&user.rol==='admin'?' selected':'') + '>Admin</option></select></div>' +
        '<div class="form-group"><label>PIN</label><input type="text" class="input" id="f-u-pin" value="' + (user?user.pin:'') + '" maxlength="10"></div>' +
        '<div class="form-group"><label>Estado</label><select class="input" id="f-u-activo" ' + (isAdmin?'disabled':'') + '><option value="true"' + (user&&user.activo!==false?' selected':'') + '>Activo</option><option value="false"' + (user&&user.activo===false?' selected':'') + '>Inactivo</option></select></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-save-u">Guardar</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    document.getElementById('btn-save-u').addEventListener('click', function() {
      var nombre = document.getElementById('f-u-nombre').value.trim();
      var pin = document.getElementById('f-u-pin').value.trim();
      if (!nombre || !pin) { alert('Nombre y PIN obligatorios'); return; }
      var id = editId || ('user_' + Date.now());
      ArcanoDB.saveUsuario({
        id: id, nombre: nombre, rol: document.getElementById('f-u-rol').value,
        pin: pin, activo: document.getElementById('f-u-activo').value === 'true', creado: new Date().toISOString()
      });
      modal.remove();
      App.renderPage('usuarios');
    });
  },

  delUsuario(id) {
    if (id === 'admin') return;
    if (!confirm('Eliminar usuario?')) return;
    ArcanoDB.deleteUsuario(id);
    App.renderPage('usuarios');
  },

  /* ================================================================
     USO SELECTOR (predefined)
     ================================================================ */
  _PREDEFINED_USOS: ['Carnes', 'Aves', 'Cerdo', 'Pescados y Mariscos', 'Arroces', 'Pastas', 'Sopas y Cremas', 'Ensaladas', 'Guisos y Estofados', 'Pizza', 'Hamburguesas', 'Tacos y Mexicana', 'Asiatica', 'Adobos y Marinadas', 'Salsas', 'Arepas y Empanadas', 'Reposteria', 'Postres', 'Desayunos', 'Te Caliente', 'Te Frio', 'Bebidas Detox', 'Smoothies', 'Cocktails', 'Mojitos', 'Margaritas', 'Cervezas', 'Mocktails', 'Snacks', 'Dips'],

  buildUsoSelectorHtml(selectedUsos) {
    var all = Pages._PREDEFINED_USOS;
    var sel = selectedUsos || '';
    var selArr = sel ? sel.split(',').map(function(s){return s.trim()}) : [];
    var h = '<div class="tag-selector" id="uso-selector">';
    for (var i = 0; i < all.length; i++) {
      var checked = selArr.indexOf(all[i]) >= 0 ? ' checked' : '';
      h += '<label class="tag-chip"><input type="checkbox" value="' + all[i] + '"' + checked + '><span>' + all[i] + '</span></label>';
    }
    h += '</div>';
    return h;
  },

  getSelectedUsos() {
    var cbs = document.querySelectorAll('#uso-selector input[type=checkbox]');
    var usos = [];
    for (var i = 0; i < cbs.length; i++) {
      if (cbs[i].checked) usos.push(cbs[i].value);
    }
    return usos.join(', ');
  },

  /* ================================================================
     TAG SELECTOR HELPER
     ================================================================ */
  buildTagSelectorHtml(cat, selectedTags) {
    var tags = ArcanoDB.getTagsForCategoria(cat);
    var sel = selectedTags || [];
    var h = '<div class="tag-selector" id="tag-selector">';
    if (tags.length === 0) {
      h += '<p class="text-sm text-muted">No hay etiquetas de uso para esta categoria.</p>';
    } else {
      for (var i = 0; i < tags.length; i++) {
        var checked = sel.indexOf(tags[i]) >= 0 ? ' checked' : '';
        h += '<label class="tag-chip"><input type="checkbox" value="' + tags[i] + '"' + checked + '><span>' + tags[i] + '</span></label>';
      }
    }
    h += '</div>';
    return h;
  },

  getSelectedTags() {
    var cbs = document.querySelectorAll('#tag-selector input[type=checkbox]');
    var tags = [];
    for (var i = 0; i < cbs.length; i++) {
      if (cbs[i].checked) tags.push(cbs[i].value);
    }
    return tags;
  },

  refreshTagSelector(prefix) {
    var catEl = document.getElementById('f-' + prefix + '-cat');
    var areaEl = document.getElementById('tag-area-' + prefix);
    if (!catEl || !areaEl) return;
    areaEl.innerHTML = Pages.buildTagSelectorHtml(catEl.value, []);
  },

  doAddTag(cat, idx) {
    var inp = document.getElementById('new-tag-' + idx);
    if (!inp) return;
    var name = inp.value.trim();
    if (!name) return;
    if (ArcanoDB.addProductTag(cat, name)) {
      App.renderPage('productos');
    } else {
      alert('La etiqueta de uso ya existe en esta categoria.');
    }
  },

  doRemoveTag(cat, tagName) {
    if (confirm('Eliminar etiqueta de uso "' + tagName + '"? Se quitara de los productos que la tengan.')) {
      ArcanoDB.removeProductTag(cat, tagName);
      App.renderPage('productos');
    }
  },

  /* ================================================================
     IMAGE UPLOAD HELPERS
     ================================================================ */
  handleImageUpload(input, areaId) {
    var file = input.files && input.files[0];
    if (!file) return;
    ArcanoDB.compressImage(file, 400, 0.75, function(err, dataUrl) {
      if (err) { alert(err); return; }
      var area = document.getElementById(areaId);
      var placeholder = area.querySelector('.img-upload-placeholder');
      if (placeholder) placeholder.style.display = 'none';
      var existing = document.getElementById('img-preview-' + areaId.split('-').pop());
      if (existing) existing.remove();
      var removeBtn = area.querySelector('.btn-red');
      if (removeBtn) removeBtn.remove();
      var img = document.createElement('img');
      img.src = dataUrl;
      img.className = 'img-preview';
      img.id = 'img-preview-' + areaId.split('-').pop();
      area.insertBefore(img, placeholder);
      var rmBtn = document.createElement('button');
      rmBtn.className = 'btn btn-sm btn-red';
      rmBtn.style.marginTop = '6px';
      rmBtn.textContent = 'Quitar imagen';
      rmBtn.onclick = function() { Pages.removeImage(areaId, input.id); };
      area.insertBefore(rmBtn, placeholder);
    });
  },

  removeImage(areaId, inputId) {
    var area = document.getElementById(areaId);
    var preview = area.querySelector('.img-preview');
    if (preview) preview.remove();
    var btn = area.querySelector('.btn-red');
    if (btn) btn.remove();
    var placeholder = area.querySelector('.img-upload-placeholder');
    if (placeholder) placeholder.style.display = '';
    var inp = document.getElementById(inputId);
    if (inp) inp.value = '';
  },

  /* ================================================================
   RECETAS IA  (Google Gemini — API gratuita desde el navegador)
   ================================================================ */
  renderRecetasAdmin(container) {
    var categorias = ['Comida', 'Infusiones', 'Cocteleria'];
    var savedKey = localStorage.getItem('arcano_gemini_key') || '';
    var h = '<div class="card mb-16">' +
      '<div class="card-header"><h3>Generar Receta con IA</h3></div>' +
      '<div class="card-body">' +
        '<div class="form-group"><label>API Key de Gemini (gratis)</label>' +
        '<div class="input-group">' +
          '<input type="password" class="input" id="ra-groq-key" placeholder="AIza... (obtenla gratis en aistudio.google.com)" value="' + savedKey.replace(/"/g, '&quot;') + '">' +
          '<button class="btn btn-dark" onclick="Pages._saveGroqKey()">Guardar</button>' +
          '<span id="ra-key-status">' + (savedKey ? ' <span style="color:var(--green)">guardada</span>' : '') + '</span>' +
        '</div>' +
        '<p class="text-sm text-muted mt-4">Obtene tu clave gratis en <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a> (no requiere tarjeta). Modelo: <b>Gemini 3.6 Flash</b>.</p>' +
        '</div>' +
        '<div class="g2">' +
          '<div class="form-group"><label>Categoria</label>' +
          '<select class="input" id="ra-categoria">';
    for (var c = 0; c < categorias.length; c++) {
      h += '<option value="' + categorias[c] + '">' + categorias[c] + '</option>';
    }
    h += '</select></div>' +
          '<div class="form-group"><label>Tema (opcional)</label>' +
          '<input type="text" class="input" id="ra-tema" placeholder="Ej: curry, adobo...">' +
          '</div>' +
        '</div>' +
        '<div class="form-group"><label>Idioma</label>' +
        '<select class="input" id="ra-idioma">' +
          '<option value="es">Espanol</option>' +
          '<option value="en">English</option>' +
        '</select></div>' +
        '<button class="btn btn-gold" id="ra-gen-btn" onclick="Pages.generarReceta()">Generar Receta con IA</button>' +
        '<span id="ra-gen-status" class="text-sm text-muted ml-12"></span>' +
      '</div>' +
    '</div>';
    h += '<div class="card">' +
      '<div class="card-header"><h3>Recetas Existentes (<span id="ra-count">0</span>)</h3></div>' +
      '<div class="card-body" id="ra-list"><div class="text-center text-muted">Cargando...</div></div>' +
    '</div>';
    container.innerHTML = h;
    Pages._loadRecetasAdmin();
  },

  _saveGroqKey: function() {
    var inp = document.getElementById('ra-groq-key');
    if (!inp) return;
    var key = inp.value.trim();
    var statusEl = document.getElementById('ra-key-status');
    if (!key) { if (statusEl) statusEl.innerHTML = ' <span style="color:var(--red)">vacia</span>'; return; }
    localStorage.setItem('arcano_gemini_key', key);
    if (statusEl) statusEl.innerHTML = ' <span style="color:var(--green)">guardada</span>';
  },

  _loadRecetasAdmin: function() {
    try {
      var ref = firebase.database().ref('arcano/db/recetas').orderByChild('fecha');
      ref.once('value', function(snap) {
        var data = snap.val();
        var recetas = [];
        if (data) {
          var keys = Object.keys(data);
          for (var i = 0; i < keys.length; i++) {
            var r = data[keys[i]];
            r._key = keys[i];
            recetas.push(r);
          }
        }
        recetas.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
        Pages._renderRecetasList(recetas);
      });
    } catch(e) {
      var listEl = document.getElementById('ra-list');
      if (listEl) listEl.innerHTML = '<p class="text-center text-muted">Error al cargar recetas.</p>';
    }
  },

  _renderRecetasList: function(recetas) {
    var countEl = document.getElementById('ra-count');
    var listEl = document.getElementById('ra-list');
    if (!countEl || !listEl) return;
    countEl.textContent = recetas.length;
    if (recetas.length === 0) {
      listEl.innerHTML = '<p class="text-center text-muted">No hay recetas. Genera la primera con el boton de arriba.</p>';
      return;
    }
    var h = '<div class="table-wrap"><table class="table"><thead><tr><th>Titulo</th><th>Cat.</th><th>Dificultad</th><th>Tiempo</th><th>Productos</th><th>Fecha</th><th></th></tr></thead><tbody>';
    for (var i = 0; i < recetas.length; i++) {
      var r = recetas[i];
      var prodsUsados = '';
      if (r.productos_usados && r.productos_usados.length) {
        prodsUsados = r.productos_usados.join(', ');
      }
      var diffColor = r.dificultad === 'Facil' ? 'text-green' : (r.dificultad === 'Dificil' ? 'text-red' : 'text-yellow');
      h += '<tr>' +
        '<td class="fw7">' + (r.titulo || 'Sin titulo') + '</td>' +
        '<td><span class="badge badge-gold">' + (r.categoria || '') + '</span></td>' +
        '<td class="' + diffColor + ' fw7">' + (r.dificultad || '-') + '</td>' +
        '<td>' + (r.tiempo || '-') + '</td>' +
        '<td class="text-sm">' + (prodsUsados || '-') + '</td>' +
        '<td class="text-sm text-muted">' + (r.fecha || '') + '</td>' +
        '<td><button class="btn btn-sm btn-red" onclick="Pages.borrarReceta(\'' + r._key + '\')">X</button></td>' +
        '</tr>';
    }
    h += '</tbody></table></div>';
    listEl.innerHTML = h;
  },

  borrarReceta: function(key) {
    if (!confirm('Eliminar esta receta?')) return;
    firebase.database().ref('arcano/db/recetas/' + key).remove(function() {
      Pages._loadRecetasAdmin();
    });
  },

  generarReceta: function() {
    var keyInput = document.getElementById('ra-groq-key');
    var catSelect = document.getElementById('ra-categoria');
    var temaInput = document.getElementById('ra-tema');
    var idiomaSelect = document.getElementById('ra-idioma');
    var btn = document.getElementById('ra-gen-btn');
    var status = document.getElementById('ra-gen-status');

    var apiKey = keyInput.value.trim();
    var categoria = catSelect.value;
    var tema = temaInput.value.trim();
    var idioma = idiomaSelect.value;

    if (!apiKey) { alert('Ingresa tu API Key de Gemini. Obtenla gratis en aistudio.google.com/apikey'); keyInput.focus(); return; }
    localStorage.setItem('arcano_gemini_key', apiKey);

    btn.disabled = true;
    btn.textContent = 'Generando...';
    status.textContent = 'Cargando productos y recetas existentes...';

    var allProductos = ArcanoDB.getTiendaProductos();
    var productLines = [];
    var catMap = { 'Comida': ['Comidas'], 'Infusiones': ['Infusiones'], 'Cocteleria': ['Cocteleria'] };
    var catsOk = catMap[categoria] || ['Comidas'];
    for (var i = 0; i < allProductos.length; i++) {
      var p = allProductos[i];
      var pCats = (p.categorias || [p.categoria] || []).map(function(c){return c.toLowerCase();});
      var match = false;
      for (var ci = 0; ci < catsOk.length; ci++) { if (pCats.indexOf(catsOk[ci].toLowerCase()) !== -1) { match = true; break; } }
      if (!match) continue;
      var line = '- ' + p.nombre;
      if (p.uso) line += ' (' + p.uso + ')';
      productLines.push(line);
    }
    var otherLines = [];
    for (var i = 0; i < allProductos.length && otherLines.length < 10; i++) {
      var p = allProductos[i];
      var pCats = (p.categorias || [p.categoria] || []).map(function(c){return c.toLowerCase();});
      var match = false;
      for (var ci = 0; ci < catsOk.length; ci++) { if (pCats.indexOf(catsOk[ci].toLowerCase()) !== -1) { match = true; break; } }
      if (match) continue;
      otherLines.push(p.nombre);
    }
    var productContext = productLines.join('\n');
    if (otherLines.length > 0) productContext += '\nOtros: ' + otherLines.join(', ');
    if (!productContext) productContext = '- Sin productos';

    var langInstr = idioma === 'en'
      ? 'Respond ONLY in English. All fields must be in English.'
      : 'Responde SOLO en espanol. Todos los campos deben estar en espanol.';

    var temaInstr = tema
      ? 'Tema especifico: ' + tema + '. La receta debe girar alrededor de este tema.'
      : 'Elige un tema creativo y apetitoso que combine bien con la categoria.';

    try {
      firebase.database().ref('arcano/db/recetas').once('value', function(snap) {
        var data = snap.val();
        var existingTitles = [];
        if (data) { var keys = Object.keys(data); for (var i = 0; i < keys.length; i++) { var r = data[keys[i]]; if (r.titulo) existingTitles.push(r.titulo); } }

        var existingBlock = '';
        if (existingTitles.length > 0) {
          existingBlock = '\n\nRECETAS YA EXISTENTES (NO repetir): ' + existingTitles.slice(-20).join(', ');
        }

        var prompt =
          'Eres un chef creativo experto en especias de la marca Arcano Especias.\n\n' +
          'CATALOGO DE PRODUCTOS:\n' + productContext + '\n\n' +
          'REGLAS:\n' +
          '1. Usa al menos UN producto del catalogo (nombre exacto).\n' +
          '2. Si el producto tiene "uso sugerido", respeta esa orientacion.\n' +
          '3. ' + langInstr + '\n' +
          '4. 5 a 12 ingredientes con cantidades precisas.\n' +
          '5. 5 a 8 pasos claros y en orden.\n' +
          '6.productos_usados debe listar SOLO nombres exactos del catalogo.\n' +
          '7. La receta debe ser ORIGINAL, diferente a las existentes.' +
          existingBlock + '\n\n' +
          'Crea una receta de ' + categoria + '. ' + temaInstr + '\n\n' +
          'Responde SOLO con JSON valido (sin markdown, sin backticks, sin texto antes o despues) con esta estructura:\n' +
          '{"titulo": "...", "descripcion": "... (2-3 oraciones)", "categoria": "' + categoria + '", ' +
          '"dificultad": "Facil" o "Media" o "Dificil", ' +
          '"tiempo": "... (ej: 30 min)", "porciones": "... (ej: 4 porciones)", ' +
          '"productos_usados": ["Nombre Exacto del Producto"], ' +
          '"ingredientes": ["1 cucharadita de Nombre Exacto del Producto", "200g de proteina", ...], ' +
          '"pasos": ["Paso 1: ...", "Paso 2: ...", ...], ' +
          '"imagen_prompt": "descripcion visual del plato (en ingles, 1 oracion)"}';

        status.textContent = 'Consultando Gemini 3.6 Flash...';

        var geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + apiKey;

        fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 4000 }
          })
        })
        .then(function(res) {
          if (!res.ok) return res.json().then(function(e) {
            throw new Error((e.error && e.error.message) || 'Error ' + res.status);
          });
          return res.json();
        })
        .then(function(data) {
          var text = data.candidates[0].content.parts[0].text.trim();
          var jsonStr = text;
          var js = jsonStr.indexOf('{');
          var je = jsonStr.lastIndexOf('}');
          if (js !== -1 && je > js) jsonStr = jsonStr.substring(js, je + 1);
          var receta;
          try { receta = JSON.parse(jsonStr); } catch(pe) {
            try { receta = JSON.parse(jsonStr.replace(/'/g, '"')); } catch(pe2) {
              throw new Error('La IA no devolvio un JSON valido: ' + jsonStr.slice(0, 100));
            }
          }
          if (!receta.titulo) throw new Error('La receta no tiene titulo');
          if (!Array.isArray(receta.ingredientes)) throw new Error('ingredientes debe ser un array');
          if (!Array.isArray(receta.pasos)) throw new Error('pasos debe ser un array');
          receta.fecha = new Date().toISOString().slice(0, 10);
          if (!receta.categoria) receta.categoria = categoria;
          try {
            firebase.database().ref('arcano/db/recetas').push(receta, function(err) {
              if (err) { status.textContent = 'Generada pero error al guardar: ' + (err.message || err); }
              else { status.innerHTML = '<span style="color:var(--green)">Guardada: ' + receta.titulo + '</span>'; Pages._loadRecetasAdmin(); }
              btn.disabled = false; btn.textContent = 'Generar Receta con IA';
            });
          } catch(fe) {
            status.innerHTML = '<span style="color:var(--green)">Generada (sin guardar en nube): ' + receta.titulo + '</span>';
            btn.disabled = false; btn.textContent = 'Generar Receta con IA';
          }
        })
        .catch(function(err) {
          status.innerHTML = '<span style="color:var(--red)">Error: ' + (err.message || err) + '</span>';
          btn.disabled = false; btn.textContent = 'Generar Receta con IA';
        });
      }).catch(function(err) {
        status.innerHTML = '<span style="color:var(--red)">Error al cargar recetas: ' + (err.message || err) + '</span>';
        btn.disabled = false; btn.textContent = 'Generar Receta con IA';
      });
    } catch(e) {
      status.innerHTML = '<span style="color:var(--red)">Error: ' + (e.message || e) + '</span>';
      btn.disabled = false; btn.textContent = 'Generar Receta con IA';
    }
  },

  renderBlogAdmin(container) {
    var categorias = ['Historias', 'Beneficios', 'Investigaciones', 'Curiosidades', 'Origenes'];
    var savedKey = localStorage.getItem('arcano_gemini_key') || '';
    var h = '<div class="card mb-16">' +
      '<div class="card-header"><h3>Generar Articulo de Blog con IA</h3></div>' +
      '<div class="card-body">' +
        '<div class="form-group"><label>API Key de Gemini (gratis)</label>' +
        '<div class="input-group">' +
          '<input type="password" class="input" id="ba-gemini-key" placeholder="AIza... (obtenla gratis en aistudio.google.com)" value="' + savedKey.replace(/"/g, '&quot;') + '">' +
          '<button class="btn btn-dark" onclick="Pages._saveBlogKey()">Guardar</button>' +
          '<span id="ba-key-status">' + (savedKey ? ' <span style="color:var(--green)">guardada</span>' : '') + '</span>' +
        '</div>' +
        '<p class="text-sm text-muted mt-4">Obtene tu clave gratis en <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a> (no requiere tarjeta). Modelo: <b>Gemini 3.6 Flash</b>.</p>' +
        '</div>' +
        '<div class="g2">' +
          '<div class="form-group"><label>Categoria</label>' +
          '<select class="input" id="ba-categoria">';
    for (var c = 0; c < categorias.length; c++) {
      h += '<option value="' + categorias[c] + '">' + categorias[c] + '</option>';
    }
    h += '</select></div>' +
          '<div class="form-group"><label>Tema (opcional)</label>' +
          '<input type="text" class="input" id="ba-tema" placeholder="Ej: la ruta de la canela...">' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-gold" id="ba-gen-btn" onclick="Pages.generarArticulo()">Generar Articulo</button>' +
        '<span id="ba-gen-status" class="text-sm text-muted ml-12"></span>' +
      '</div>' +
    '</div>' +
    '<div class="card" id="ba-preview-card" style="display:none">' +
      '<div class="card-header"><h3>Vista Previa</h3></div>' +
      '<div class="card-body" id="ba-preview"></div>' +
      '<div class="card-footer" id="ba-preview-actions"></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-header"><h3>Articulos Existentes (<span id="ba-count">0</span>)</h3><button class="btn btn-sm btn-gold" onclick="Pages.fixBlogLinks()" style="float:right;margin-top:4px">Corregir Links de Blends</button></div>' +
      '<div class="card-body" id="ba-list"><div class="text-center text-muted">Cargando...</div></div>' +
    '</div>' +
    '<input type="file" id="ba-img-input" accept="image/*" style="display:none" onchange="Pages._onBlogImageSelect(event)">';
    container.innerHTML = h;
    Pages._loadBlogAdmin();
  },

  _saveBlogKey: function() {
    var inp = document.getElementById('ba-gemini-key');
    if (!inp) return;
    var key = inp.value.trim();
    var statusEl = document.getElementById('ba-key-status');
    if (!key) { if (statusEl) statusEl.innerHTML = ' <span style="color:var(--red)">vacia</span>'; return; }
    localStorage.setItem('arcano_gemini_key', key);
    if (statusEl) statusEl.innerHTML = ' <span style="color:var(--green)">guardada</span>';
  },

  _loadBlogAdmin: function() {
    try {
      var ref = firebase.database().ref('arcano/db/blog').orderByChild('fecha');
      ref.once('value', function(snap) {
        var data = snap.val();
        var articulos = [];
        if (data) {
          var keys = Object.keys(data);
          for (var i = 0; i < keys.length; i++) {
            var a = data[keys[i]];
            a._key = keys[i];
            articulos.push(a);
          }
        }
        articulos.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
        Pages._renderBlogList(articulos);
      });
    } catch(e) {
      var listEl = document.getElementById('ba-list');
      if (listEl) listEl.innerHTML = '<p class="text-center text-muted">Error al cargar articulos.</p>';
    }
  },

  _renderBlogList: function(articulos) {
    var countEl = document.getElementById('ba-count');
    var listEl = document.getElementById('ba-list');
    if (!countEl || !listEl) return;
    countEl.textContent = articulos.length;
    if (articulos.length === 0) {
      listEl.innerHTML = '<p class="text-center text-muted">No hay articulos. Genera el primero con el boton de arriba.</p>';
      return;
    }
    var h = '<div class="table-wrap"><table class="table"><thead><tr><th>Titulo</th><th>Img</th><th>Categoria</th><th>Fecha</th><th></th></tr></thead><tbody>';
    for (var i = 0; i < articulos.length; i++) {
      var a = articulos[i];
      var imgCell;
      if (a.imagen_url) {
        imgCell = '<div style="display:flex;align-items:center;gap:4px">' +
          '<img src="' + a.imagen_url + '" style="width:48px;height:32px;object-fit:cover;border-radius:4px" onclick="Pages.uploadBlogImage(\'' + a._key + '\')" title="Cambiar imagen">' +
          '<button class="btn btn-sm" style="padding:2px 6px;font-size:0.7rem;color:var(--red)" onclick="Pages.removeBlogImage(\'' + a._key + '\')" title="Quitar imagen">x</button>' +
          '</div>';
      } else {
        imgCell = '<button class="btn btn-sm btn-outline" onclick="Pages.uploadBlogImage(\'' + a._key + '\')">+ Img</button>';
      }
      h += '<tr>' +
        '<td class="fw7">' + (a.titulo || 'Sin titulo') + '</td>' +
        '<td>' + imgCell + '</td>' +
        '<td><span class="badge badge-gold">' + (a.categoria || '') + '</span></td>' +
        '<td class="text-sm text-muted">' + (a.fecha || '') + '</td>' +
        '<td><button class="btn btn-sm btn-red" onclick="Pages.borrarArticulo(\'' + a._key + '\')">X</button></td>' +
        '</tr>';
    }
    h += '</tbody></table></div>';
    listEl.innerHTML = h;
  },

  fixBlogLinks: function() {
    var statusEl = document.getElementById('ba-gen-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Corrigiendo links en articulos...</span>';

    var blends = ArcanoDB.getBlends();
    var blendList = blends.slice().sort(function(a, b) { return b.nombre.length - a.nombre.length; });

    var blendPatterns = [];
    for (var i = 0; i < blendList.length; i++) {
      var name = blendList[i].nombre;
      var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      blendPatterns.push({
        name: name,
        id: blendList[i].id,
        regex: new RegExp('(^|[^a-zA-Z\u00E1-\u00FA\u00C1-\u00DA\u00F1\u00D1\u00FC\u00DC])' + escaped + '($|[^a-zA-Z\u00E1-\u00FA\u00C1-\u00DA\u00F1\u00D1\u00FC\u00DC])', 'gi')
      });
    }

    var LINK_STYLE = 'style="color:var(--gold);text-decoration:underline;font-weight:600"';
    var REMOVE_RE = /<a\s[^>]*onclick\s*=\s*"[^"]*openDetail\(\d+\)[^"]*"[^>]*>([^<]*)<\/a>/gi;
    var SPLIT_RE = /(<[^>]+>)/;

    firebase.database().ref('arcano/db/blog').once('value', function(snap) {
      var data = snap.val();
      if (!data) { if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No hay articulos.</span>'; return; }

      var keys = Object.keys(data);
      var updated = 0;
      var total = keys.length;

      function processPost(idx) {
        if (idx >= total) {
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">Listo! ' + updated + ' de ' + total + ' articulos actualizados.</span>';
          Pages._loadBlogAdmin();
          return;
        }

        var key = keys[idx];
        var post = data[key];
        var contenido = post.contenido || '';

        contenido = contenido.replace(REMOVE_RE, '$1');

        var parts = contenido.split(SPLIT_RE);
        for (var p = 0; p < parts.length; p++) {
          if (parts[p].charAt(0) === '<') continue;
          var text = parts[p];
          var allMatches = [];
          for (var b = 0; b < blendPatterns.length; b++) {
            var bp = blendPatterns[b];
            bp.regex.lastIndex = 0;
            var m;
            while ((m = bp.regex.exec(text)) !== null) {
              var bStart = m.index + m[1].length;
              var bEnd = bStart + bp.name.length;
              allMatches.push({s: bStart, e: bEnd, id: bp.id, name: bp.name, bBefore: m[1], bAfter: m[2]});
              if (m.index === bp.regex.lastIndex) bp.regex.lastIndex++;
            }
          }
          allMatches.sort(function(a, b) { return a.s - b.s || (b.e - b.s) - (a.e - a.s); });
          var filtered = [];
          for (var mi = 0; mi < allMatches.length; mi++) {
            var cur = allMatches[mi];
            var overlap = false;
            for (var fi = 0; fi < filtered.length; fi++) {
              if (cur.s < filtered[fi].e && cur.e > filtered[fi].s) {
                overlap = true;
                if ((cur.e - cur.s) > (filtered[fi].e - filtered[fi].s)) filtered[fi] = cur;
                break;
              }
            }
            if (!overlap) filtered.push(cur);
          }
          for (var fi = filtered.length - 1; fi >= 0; fi--) {
            var f = filtered[fi];
            var linkHtml = '<a href="#" onclick="openDetail(' + f.id + ');return false" ' + LINK_STYLE + '>' + f.name + '</a>';
            text = text.substring(0, f.s) + linkHtml + text.substring(f.e);
          }
          parts[p] = text;
        }
        contenido = parts.join('');

        if (contenido !== (post.contenido || '')) {
          firebase.database().ref('arcano/db/blog/' + key).update({contenido: contenido}, function(err) {
            if (!err) updated++;
            processPost(idx + 1);
          });
        } else {
          processPost(idx + 1);
        }
      }

      processPost(0);
    });
  },

  uploadBlogImage: function(key) {
    Pages._blogImgTarget = key;
    var inp = document.getElementById('ba-img-input');
    if (inp) inp.click();
  },

  _onBlogImageSelect: function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('La imagen no debe superar 2MB. Recomendado: 1200x630 px JPG.'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      var dataUrl = ev.target.result;
      var key = Pages._blogImgTarget;
      if (!key) return;
      firebase.database().ref('arcano/db/blog/' + key).update({imagen_url: dataUrl}, function(err) {
        if (err) { alert('Error al guardar: ' + (err.message || err)); }
        else { Pages._loadBlogAdmin(); }
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  removeBlogImage: function(key) {
    if (!confirm('Quitar imagen destacada?')) return;
    firebase.database().ref('arcano/db/blog/' + key).update({imagen_url: null}, function() {
      Pages._loadBlogAdmin();
    });
  },

  borrarArticulo: function(key) {
    if (!confirm('Eliminar este articulo?')) return;
    firebase.database().ref('arcano/db/blog/' + key).remove(function() {
      Pages._loadBlogAdmin();
    });
  },

  generarArticulo: function() {
    var keyInput = document.getElementById('ba-gemini-key');
    var catSelect = document.getElementById('ba-categoria');
    var temaInput = document.getElementById('ba-tema');
    var btn = document.getElementById('ba-gen-btn');
    var status = document.getElementById('ba-gen-status');

    var apiKey = keyInput.value.trim();
    var categoria = catSelect.value;
    var tema = temaInput.value.trim();

    if (!apiKey) { alert('Ingresa tu API Key de Gemini. Obtenla gratis en aistudio.google.com/apikey'); keyInput.focus(); return; }
    localStorage.setItem('arcano_gemini_key', apiKey);

    btn.disabled = true;
    btn.textContent = 'Generando...';
    status.textContent = 'Cargando productos y articulos existentes...';

    var allBlends = ArcanoDB.getBlends();
    var blendLines = [];
    for (var i = 0; i < allBlends.length; i++) {
      var b = allBlends[i];
      var line = '- [ID:' + b.id + '] ' + b.nombre;
      if (b.descripcion) line += ' - ' + b.descripcion;
      blendLines.push(line);
    }
    var productContext = blendLines.join('\n');
    if (!productContext) productContext = '- Sin blends';

    var temaInstr = tema
      ? 'Tema especifico: ' + tema + '. El articulo debe girar alrededor de este tema.'
      : 'Elige un tema creativo e interesante relacionado con la categoria y los productos.';

    try {
      firebase.database().ref('arcano/db/blog').once('value', function(snap) {
        var data = snap.val();
        var existingTitles = [];
        if (data) { var keys = Object.keys(data); for (var i = 0; i < keys.length; i++) { var a = data[keys[i]]; if (a.titulo) existingTitles.push(a.titulo); } }

        var existingBlock = '';
        if (existingTitles.length > 0) {
          existingBlock = '\n\nARTICULOS YA EXISTENTES (NO repetir temas): ' + existingTitles.slice(-20).join(', ');
        }

        var prompt =
          'Eres un redactor creativo experto en especias y blends de la marca Arcano Especias. Escribe en espanol.\n\n' +
          'BLENDS DISPONIBLES EN TIENDA (usa SOLO estos nombres exactos):\n' + productContext + '\n\n' +
          'REGLAS OBLIGATORIAS:\n' +
          '1. EL PRIMER PARRAFO del articulo debe mencionar al menos UN blend del catalogo de arriba, usando su nombre EXACTO. El blend debe estar relacionado con el tema del articulo de forma natural y creativa. Por ejemplo: si el tema es pimienta, podes relacionarlo con Chai Imperial; si hablas de una ciudad o region, menciona un blend de esa zona (ej: Bangkok Curry para Tailandia, Garam Masala Clasico para India, Mediterranean Citrus para el Mediterraneo, etc). El articulo SIEMPRE debe conectar el tema con algun blend de la tienda.\n' +
          '2. Cada vez que menciones un blend, convierte el nombre en un enlace clickable usando este formato EXACTO: <a href="#" onclick="openDetail(NUMERO_ID);return false">Nombre Exacto del Blend</a> donde NUMERO_ID es el numero ID del blend que aparece en el catalogo como [ID:123]. El texto visible del enlace debe ser el nombre EXACTO del blend.\n' +
          '3. El contenido debe ser informativo, entretenido y relevante para amantes de las especias.\n' +
          '4. Usa etiquetas HTML semanticas: <p> para parrafos, <h2> y <h3> para subtitulos, <ul><li> para listas, <blockquote> para citas destacadas.\n' +
          '5. El articulo debe tener entre 400 y 800 palabras.\n' +
          '6. El articulo debe ser ORIGINAL, diferente a los existentes. NO menciones especias sueltas como productos, solo BLENDS.' +
          existingBlock + '\n\n' +
          'Escribe un articulo de blog categoria "' + categoria + '". ' + temaInstr + '\n\n' +
          'Responde SOLO con JSON valido (sin markdown, sin backticks, sin texto antes o despues) con esta estructura:\n' +
          '{"titulo": "...", "subtitulo": "... (1-2 oraciones)", "categoria": "' + categoria + '", ' +
          '"contenido": "<p>HTML content here</p>", ' +
          '"imagen_prompt": "visual description for AI image generation (in english, 1 sentence)"}';

        status.textContent = 'Consultando Gemini 3.6 Flash...';

        var geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + apiKey;

        fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 4000 }
          })
        })
        .then(function(res) {
          if (!res.ok) return res.json().then(function(e) {
            throw new Error((e.error && e.error.message) || 'Error ' + res.status);
          });
          return res.json();
        })
        .then(function(data) {
          var text = data.candidates[0].content.parts[0].text.trim();
          var jsonStr = text;
          var js = jsonStr.indexOf('{');
          var je = jsonStr.lastIndexOf('}');
          if (js !== -1 && je > js) jsonStr = jsonStr.substring(js, je + 1);
          var articulo;
          try { articulo = JSON.parse(jsonStr); } catch(pe) {
            try { articulo = JSON.parse(jsonStr.replace(/'/g, '"')); } catch(pe2) {
              throw new Error('La IA no devolvio un JSON valido: ' + jsonStr.slice(0, 100));
            }
          }
          if (!articulo.titulo) throw new Error('El articulo no tiene titulo');
          if (!articulo.contenido) throw new Error('El articulo no tiene contenido');
          Pages._showBlogPreview(articulo, categoria);
          status.innerHTML = '<span style="color:var(--green)">Articulo generado. Revisa y publica.</span>';
          btn.disabled = false;
          btn.textContent = 'Generar Articulo';
        })
        .catch(function(err) {
          status.innerHTML = '<span style="color:var(--red)">Error: ' + (err.message || err) + '</span>';
          btn.disabled = false;
          btn.textContent = 'Generar Articulo';
        });
      }).catch(function(err) {
        status.innerHTML = '<span style="color:var(--red)">Error al cargar articulos: ' + (err.message || err) + '</span>';
        btn.disabled = false;
        btn.textContent = 'Generar Articulo';
      });
    } catch(e) {
      status.innerHTML = '<span style="color:var(--red)">Error: ' + (e.message || e) + '</span>';
      btn.disabled = false;
      btn.textContent = 'Generar Articulo';
    }
  },

  _showBlogPreview: function(articulo, categoria) {
    var previewCard = document.getElementById('ba-preview-card');
    var previewEl = document.getElementById('ba-preview');
    var actionsEl = document.getElementById('ba-preview-actions');
    if (!previewCard || !previewEl || !actionsEl) return;
    Pages._blogDraft = articulo;
    var h = '<h2 style="margin-bottom:4px">' + (articulo.titulo || '') + '</h2>' +
      '<p class="text-sm text-muted" style="margin-bottom:16px">' + (articulo.subtitulo || '') + '</p>' +
      '<div style="max-height:400px;overflow-y:auto;padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border)">' +
      (articulo.contenido || '') +
      '</div>' +
      (articulo.imagen_url ? '<img src="' + articulo.imagen_url + '" style="width:100%;max-width:600px;border-radius:8px;margin:12px 0" loading="lazy">' : '') +
      (articulo.imagen_prompt ? '<p class="text-xs text-muted mt-8">Imagen prompt: ' + articulo.imagen_prompt + '</p>' : '');
    previewEl.innerHTML = h;
    actionsEl.innerHTML = '<button class="btn btn-gold" onclick="Pages.publicarArticulo()">Publicar</button>' +
      '<button class="btn btn-outline ml-8" onclick="Pages.descartarArticulo()">Descartar</button>';
    previewCard.style.display = 'block';
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  publicarArticulo: function() {
    var articulo = Pages._blogDraft;
    if (!articulo) return;
    articulo.fecha = new Date().toISOString().slice(0, 10);
    var status = document.getElementById('ba-gen-status');
    try {
      firebase.database().ref('arcano/db/blog').push(articulo, function(err) {
        if (err) {
          if (status) status.innerHTML = '<span style="color:var(--red)">Error al guardar: ' + (err.message || err) + '</span>';
        } else {
          if (status) status.innerHTML = '<span style="color:var(--green)">Publicado: ' + (articulo.titulo || '') + '</span>';
          Pages._loadBlogAdmin();
        }
        Pages.descartarArticulo();
      });
    } catch(fe) {
      if (status) status.innerHTML = '<span style="color:var(--green)">Generado (sin guardar en nube): ' + (articulo.titulo || '') + '</span>';
      Pages.descartarArticulo();
    }
  },

  descartarArticulo: function() {
    Pages._blogDraft = null;
    var previewCard = document.getElementById('ba-preview-card');
    if (previewCard) previewCard.style.display = 'none';
  },

      _blogDraft: null,

/* ================================================================
     ESTADISTICAS DE VENTAS (Chart.js)
     ================================================================ */
  _estPeriod: null,
  _estTab: null,
  _estCharts: [],

  renderEstadisticas: function(container) {
    var ventas = ArcanoDB.getVentas();
    var pedidos = ArcanoDB.getPedidos();
    var producciones = ArcanoDB.getProducciones();
    var entradas = ArcanoDB.getEntradas();
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();

    // === COMBINE ALL SALES ===
    var allSales = [];
    for (var vi = 0; vi < ventas.length; vi++) {
      var v = ventas[vi];
      var vItems = [];
      if (v.items) { for (var vi2 = 0; vi2 < v.items.length; vi2++) { var it = v.items[vi2]; vItems.push({ nombre: it.productoNombre || '?', tipo: it.tipo || 'especia', talla: it.talla || 'chico', cantidad: it.cantidad || 0, precio: it.precioUnitario || 0, subtotal: it.subtotal || 0 }); } }
      allSales.push({ fecha: v.fecha || '', creado: v.creado || '', total: v.total || 0, items: vItems, source: 'admin' });
    }
    for (var pi = 0; pi < pedidos.length; pi++) {
      var p = pedidos[pi];
      if (p.estado === 'cancelado') continue;
      var pItems = [];
      if (p.items) { for (var pi2 = 0; pi2 < p.items.length; pi2++) { var pit = p.items[pi2]; pItems.push({ nombre: pit.nombre || '?', tipo: pit.tipo || 'especia', talla: pit.talla || 'chico', cantidad: pit.qty || pit.cantidad || 0, precio: pit.precio || 0, subtotal: pit.subtotal || 0 }); } }
      var pFecha = p.creado ? p.creado.slice(0, 10) : '';
      allSales.push({ fecha: pFecha, creado: p.creado || '', total: p.total || 0, items: pItems, source: 'tienda', cliente: (p.cliente || {}).nombre || '', ciudad: (p.cliente || {}).ciudad || '' });
    }
    allSales.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });

    if (!Pages._estTab) Pages._estTab = 'ventas';

    var h = '<div class="est-tabs">';
    h += '<button class="est-tab' + (Pages._estTab === 'ventas' ? ' active' : '') + '" onclick="Pages._estTab=\'ventas\';App.renderPage(\'estadisticas\')">Ventas</button>';
    h += '<button class="est-tab' + (Pages._estTab === 'costos' ? ' active' : '') + '" onclick="Pages._estTab=\'costos\';App.renderPage(\'estadisticas\')">Costos y Margen</button>';
    h += '<button class="est-tab' + (Pages._estTab === 'produccion' ? ' active' : '') + '" onclick="Pages._estTab=\'produccion\';App.renderPage(\'estadisticas\')">Produccion</button>';
    h += '<button class="est-tab' + (Pages._estTab === 'pedidos' ? ' active' : '') + '" onclick="Pages._estTab=\'pedidos\';App.renderPage(\'estadisticas\')">Pedidos Tienda</button>';
    h += '<button class="est-tab' + (Pages._estTab === 'inventario' ? ' active' : '') + '" onclick="Pages._estTab=\'inventario\';App.renderPage(\'estadisticas\')">Inventario</button>';
    h += '<button class="est-tab' + (Pages._estTab === 'canales' ? ' active' : '') + '" onclick="Pages._estTab=\'canales\';App.renderPage(\'estadisticas\')">Costos por Canal</button>';
    h += '<button class="est-tab' + (Pages._estTab === 'web' ? ' active' : '') + '" onclick="Pages._estTab=\'web\';App.renderPage(\'estadisticas\')">Web Analytics</button>';
    h += '</div>';
    h += '<div id="est-content"></div>';
    container.innerHTML = h;

    var data;
    if (Pages._estTab === 'ventas' || Pages._estTab === 'costos' || Pages._estTab === 'produccion' || Pages._estTab === 'inventario') {
      data = allSales;
    } else {
      data = allSales.filter(function(s) { return s.source === 'tienda'; });
    }

    if (Pages._estTab === 'ventas') Pages._renderVentas(data, container.querySelector('#est-content'));
    else if (Pages._estTab === 'costos') Pages._renderCostos(data, container.querySelector('#est-content'), entradas, especias, blends, producciones);
    else if (Pages._estTab === 'produccion') Pages._renderProduccion(data, container.querySelector('#est-content'), producciones);
    else if (Pages._estTab === 'pedidos') Pages._renderPedidosTienda(data, container.querySelector('#est-content'));
    else if (Pages._estTab === 'inventario') Pages._renderInventario(container.querySelector('#est-content'), especias, blends);
    else if (Pages._estTab === 'canales') Pages._renderCostosPorCanal(container.querySelector('#est-content'));
    else if (Pages._estTab === 'web') Pages._renderWebAnalytics(container.querySelector('#est-content'));
  },

  /* ================================================================
     WEB ANALYTICS TAB (GA4)
     ================================================================ */
  _ga4Charts: [],
  _ga4Url: 'https://script.google.com/macros/s/AKfycbw8kZ0mDAjRvTXHDehTOS85OCPIhxsSGtUSx0KYYmoLMjE2KTcTpcGf_M9uMyAN5jC0Dg/exec',
  _ga4Days: 30,

  _renderWebAnalytics: function(el) {
    if (!el) return;
    var self = this;
    // Destroy previous charts
    if (Pages._ga4Charts) { for (var _gi = 0; _gi < Pages._ga4Charts.length; _gi++) { try { Pages._ga4Charts[_gi].destroy(); } catch(e) {} } }
    Pages._ga4Charts = [];

    var h = '';
    h += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">';
    h += '<h3 style="margin:0;font-size:1.1rem">Analitica Web (GA4)</h3>';
    h += '<select id="ga4-days" onchange="Pages._ga4Days=parseInt(this.value);Pages._renderWebAnalytics(document.querySelector(\'#est-content\'))" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:0.85rem">';
    h += '<option value="7"' + (Pages._ga4Days === 7 ? ' selected' : '') + '>Ultimos 7 dias</option>';
    h += '<option value="14"' + (Pages._ga4Days === 14 ? ' selected' : '') + '>Ultimos 14 dias</option>';
    h += '<option value="30"' + (Pages._ga4Days === 30 ? ' selected' : '') + '>Ultimos 30 dias</option>';
    h += '<option value="90"' + (Pages._ga4Days === 90 ? ' selected' : '') + '>Ultimos 90 dias</option>';
    h += '</select>';
    h += '</div>';
    h += '<div id="ga4-loading" style="text-align:center;padding:40px;color:var(--text-sec)"><div class="loader"></div><p style="margin-top:12px">Cargando datos de Google Analytics...</p></div>';
    h += '<div id="ga4-kpis" style="display:none"></div>';
    h += '<div id="ga4-charts" style="display:none">';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">';
    h += '<div class="card" style="padding:16px"><h4 style="margin:0 0 12px;font-size:0.9rem">Sesiones por dia</h4><canvas id="ga4-daily-chart" height="220"></canvas></div>';
    h += '<div class="card" style="padding:16px"><h4 style="margin:0 0 12px;font-size:0.9rem">Fuentes de trafico</h4><canvas id="ga4-traffic-chart" height="220"></canvas></div>';
    h += '</div>';
    h += '<div class="card" style="padding:16px;margin-bottom:20px"><h4 style="margin:0 0 12px;font-size:0.9rem">Paginas mas visitadas</h4><canvas id="ga4-pages-chart" height="250"></canvas></div>';
    h += '</div>';
    el.innerHTML = h;

    var url = Pages._ga4Url + '?mode=all&days=' + Pages._ga4Days + '&t=' + Date.now() + '&callback=_ga4Jsonp';
    var timeoutId = setTimeout(function() {
      var loading = document.getElementById('ga4-loading');
      if (loading) loading.innerHTML = '<p style="color:#e74c3c">Tiempo de espera agotado. Reintenta.</p>';
    }, 15000);
    window._ga4Jsonp = function(resp) {
      clearTimeout(timeoutId);
      delete window._ga4Jsonp;
      var s = document.getElementById('_ga4_script');
      if (s) s.remove();
      var loading = document.getElementById('ga4-loading');
      if (loading) loading.style.display = 'none';
      if (!resp || resp.error) {
        el.innerHTML = '<div style="padding:40px;text-align:center;color:#e74c3c"><p>Error: ' + ((resp && resp.message) || 'Desconocido') + '</p><p style="font-size:0.85rem;margin-top:8px;color:var(--text-sec)">Verifica que el Apps Script este deployado correctamente.</p></div>';
        return;
      }
      var d = resp;
      Pages._renderGa4KPIs(d.overview || {}, d.daily || []);
      document.getElementById('ga4-kpis').style.display = '';
      document.getElementById('ga4-charts').style.display = '';
      Pages._renderGa4DailyChart(d.daily || []);
      Pages._renderGa4TrafficChart(d.traffic || []);
      Pages._renderGa4PagesChart(d.pages || []);
    };
    var script = document.createElement('script');
    script.id = '_ga4_script';
    script.src = url;
    script.onerror = function() {
      clearTimeout(timeoutId);
      delete window._ga4Jsonp;
      var loading = document.getElementById('ga4-loading');
      if (loading) loading.innerHTML = '<p style="color:#e74c3c">Error de conexion. Verifica el Apps Script.</p>';
    };
    document.head.appendChild(script);
  },

  _renderGa4KPIs: function(ov, daily) {
    var el = document.getElementById('ga4-kpis');
    if (!el) return;
    var convRate = ov.sessions > 0 ? ((ov.purchases || 0) / ov.sessions * 100) : 0;
    var avgSec = ov.avgDuration || 0;
    var mins = Math.floor(avgSec / 60);
    var secs = Math.round(avgSec % 60);
    var avgStr = mins > 0 ? (mins + 'm ' + secs + 's') : (secs + 's');

    var kpis = [
      {label: 'Sesiones', value: (ov.sessions || 0).toLocaleString(), color: '#4A90D9'},
      {label: 'Usuarios', value: (ov.users || 0).toLocaleString(), color: '#7B68EE'},
      {label: 'Nuevos usuarios', value: (ov.newUsers || 0).toLocaleString(), color: '#2ECC71'},
      {label: 'P. vistas', value: (ov.pageViews || 0).toLocaleString(), color: '#F39C12'},
      {label: 'Tiempo prom.', value: avgStr, color: '#E74C3C'},
      {label: 'Engagement', value: ((ov.engagementRate || 0) * 100).toFixed(1) + '%', color: '#1ABC9C'},
      {label: 'Compras', value: (ov.purchases || 0).toLocaleString(), color: '#9B59B6'},
      {label: 'Conversion', value: convRate.toFixed(2) + '%', color: '#E67E22'}
    ];

    var h = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px">';
    for (var i = 0; i < kpis.length; i++) {
      var k = kpis[i];
      h += '<div class="card" style="padding:16px;border-left:4px solid ' + k.color + '">';
      h += '<div style="font-size:0.78rem;color:var(--text-sec);margin-bottom:4px">' + k.label + '</div>';
      h += '<div style="font-size:1.4rem;font-weight:700;color:var(--text)">' + k.value + '</div>';
      h += '</div>';
    }
    h += '</div>';
    el.innerHTML = h;
  },

  _renderGa4DailyChart: function(daily) {
    var canvas = document.getElementById('ga4-daily-chart');
    if (!canvas || daily.length === 0) return;
    var labels = [], sessions = [], users = [];
    for (var i = 0; i < daily.length; i++) {
      var d = daily[i].date || '';
      labels.push(d.substring(5)); // MM-DD
      sessions.push(daily[i].sessions);
      users.push(daily[i].users);
    }
    var chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {label: 'Sesiones', data: sessions, borderColor: '#4A90D9', backgroundColor: 'rgba(74,144,217,0.1)', fill: true, tension: 0.3, pointRadius: 2},
          {label: 'Usuarios', data: users, borderColor: '#7B68EE', backgroundColor: 'rgba(123,104,238,0.05)', fill: true, tension: 0.3, pointRadius: 2}
        ]
      },
      options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {position: 'bottom', labels: {boxWidth: 12, font: {size: 11}}}}, scales: {x: {ticks: {font: {size: 10}, maxTicksLimit: 10}}, y: {beginAtZero: true, ticks: {font: {size: 10}}}}}
    });
    Pages._ga4Charts.push(chart);
  },

  _renderGa4TrafficChart: function(traffic) {
    var canvas = document.getElementById('ga4-traffic-chart');
    if (!canvas || traffic.length === 0) return;
    var channelLabels = {Organic: 'Organico', Direct: 'Directo', Social: 'Redes Sociales', Paid: 'Pago', Referral: 'Referidos', Email: 'Email'};
    var labels = [], data = [], colors = ['#4A90D9','#2ECC71','#E74C3C','#F39C12','#9B59B6','#1ABC9C','#E67E22','#3498DB'];
    for (var i = 0; i < traffic.length; i++) {
      labels.push(channelLabels[traffic[i].channel] || traffic[i].channel);
      data.push(traffic[i].sessions);
    }
    var chart = new Chart(canvas, {
      type: 'doughnut',
      data: {labels: labels, datasets: [{data: data, backgroundColor: colors.slice(0, data.length), borderWidth: 0}]},
      options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {position: 'bottom', labels: {boxWidth: 12, font: {size: 11}, padding: 12}}}, cutout: '55%'}
    });
    Pages._ga4Charts.push(chart);
  },

  _renderGa4PagesChart: function(pages) {
    var canvas = document.getElementById('ga4-pages-chart');
    if (!canvas || pages.length === 0) return;
    var top = pages.slice(0, 10);
    var labels = [], views = [], durations = [];
    for (var i = 0; i < top.length; i++) {
      var title = top[i].title || top[i].path;
      if (title.length > 35) title = title.substring(0, 35) + '...';
      labels.push(title);
      views.push(top[i].views);
      var dur = top[i].avgDuration || 0;
      var m = Math.floor(dur / 60);
      var s = Math.round(dur % 60);
      durations.push(m + ':' + (s < 10 ? '0' : '') + s);
    }
    var chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {label: 'Vistas', data: views, backgroundColor: 'rgba(74,144,217,0.7)', borderRadius: 4},
          {label: 'Tiempo prom. (mm:ss)', data: durations.map(function(d) { var p = d.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); }), backgroundColor: 'rgba(231,76,60,0.5)', borderRadius: 4}
        ]
      },
      options: {responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: {legend: {position: 'bottom', labels: {boxWidth: 12, font: {size: 11}}}}, scales: {x: {beginAtZero: true, ticks: {font: {size: 10}}}, y: {ticks: {font: {size: 10}}}}}
    });
    Pages._ga4Charts.push(chart);
  },

  /* ================================================================
     VENTAS TAB
     ================================================================ */
  _renderVentas: function(data, el) {
    if (!el) return;
    var totalIngresos = 0, totalOps = 0, totalUnidades = 0;
    var prodMap = {}, tipoMap = {}, tallaMap = {}, diaMap = {}, monthMap = {}, ciudadMap = {}, sourceMap = {};
    for (var d = 0; d < data.length; d++) {
      var s = data[d];
      totalIngresos += (s.total || 0);
      totalOps++;
      sourceMap[s.source] = (sourceMap[s.source] || 0) + 1;
      var opUnidades = 0;
      if (s.items) { for (var it = 0; it < s.items.length; it++) {
        var item = s.items[it];
        totalUnidades += (item.cantidad || 0);
        opUnidades += (item.cantidad || 0);
        var key = item.nombre + '|' + item.tipo + '|' + item.talla;
        if (!prodMap[key]) prodMap[key] = { nombre: item.nombre, tipo: item.tipo, talla: item.talla, unidades: 0, ingreso: 0 };
        prodMap[key].unidades += (item.cantidad || 0);
        prodMap[key].ingreso += (item.subtotal || 0);
        tipoMap[item.tipo] = (tipoMap[item.tipo] || 0) + (item.cantidad || 0);
        tallaMap[item.talla || 'chico'] = (tallaMap[item.talla || 'chico'] || 0) + (item.cantidad || 0);
      }}
      if (s.fecha) {
        if (!diaMap[s.fecha]) diaMap[s.fecha] = { ops: 0, unidades: 0, ingresos: 0 };
        diaMap[s.fecha].ops++;
        diaMap[s.fecha].unidades += opUnidades;
        diaMap[s.fecha].ingresos += (s.total || 0);
        var mn = s.fecha.substring(0, 7);
        if (!monthMap[mn]) monthMap[mn] = { ops: 0, unidades: 0, ingresos: 0 };
        monthMap[mn].ops++;
        monthMap[mn].unidades += opUnidades;
        monthMap[mn].ingresos += (s.total || 0);
      }
      if (s.ciudad) {
        if (!ciudadMap[s.ciudad]) ciudadMap[s.ciudad] = { ops: 0, ingresos: 0 };
        ciudadMap[s.ciudad].ops++;
        ciudadMap[s.ciudad].ingresos += (s.total || 0);
      }
    }
    var prodArr = Object.values(prodMap).sort(function(a, b) { return b.ingreso - a.ingreso; });

    // Calculate day-on-day trend
    var diasSorted = Object.keys(diaMap).sort();
    var ingresosAyer = 0;
    if (diasSorted.length >= 2) { ingresosAyer = diaMap[diasSorted[diasSorted.length - 2]].ingresos || 0; }
    var ingresosHoy = diasSorted.length > 0 ? diaMap[diasSorted[diasSorted.length - 1]].ingresos : 0;
    var tendenciaDiaria = ingresosAyer > 0 ? Math.round(((ingresosHoy - ingresosAyer) / ingresosAyer) * 100) : 0;
    var tendSign = tendenciaDiaria >= 0 ? '+' : '';

    // Monthly comparison
    var mesesSorted = Object.keys(monthMap).sort();
    var mesActual = new Date().toISOString().slice(0, 7);
    var mesAnterior = mesesSorted.length >= 2 ? mesesSorted[mesesSorted.length - 2] : '';
    var ingresosMesActual = (monthMap[mesActual] || {}).ingresos || 0;
    var ingresosMesAnterior = mesAnterior ? (monthMap[mesAnterior] || {}).ingresos || 0 : 0;
    var tendenciaMensual = ingresosMesAnterior > 0 ? Math.round(((ingresosMesActual - ingresosMesAnterior) / ingresosMesAnterior) * 100) : 0;
    var tendMSign = tendenciaMensual >= 0 ? '+' : '';

    var h = '';
    // KPIs
    h += '<div class="est-kpi-grid">';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + totalIngresos.toLocaleString() + '</div><div class="est-kpi-label">Ingresos Totales</div><div class="est-kpi-sub">' + totalOps + ' operaciones</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + totalUnidades + '</div><div class="est-kpi-label">Unidades Vendidas</div><div class="est-kpi-sub">' + prodArr.length + ' productos distintos</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + (totalOps > 0 ? Math.round(totalIngresos / totalOps) : 0).toLocaleString() + '</div><div class="est-kpi-label">Ticket Promedio</div><div class="est-kpi-sub">por operacion</div></div>';
    h += '<div class="est-kpi ' + (tendenciaDiaria >= 0 ? 'up' : 'down') + '"><div class="est-kpi-value">' + tendSign + tendenciaDiaria + '%</div><div class="est-kpi-label">Tendencia Dia</div><div class="est-kpi-sub">vs dia anterior</div></div>';
    h += '</div>';

    // Monthly comparison bar
    h += '<div class="card mt-16"><div class="card-header"><h3>Comparacion Mensual</h3></div><div class="card-body">';
    h += '<div class="est-kpi-grid" style="grid-template-columns:1fr 1fr 1fr">';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + ingresosMesActual.toLocaleString() + '</div><div class="est-kpi-label">Mes Actual (' + mesActual + ')</div><div class="est-kpi-sub">' + ((monthMap[mesActual] || {}).ops || 0) + ' ops / ' + ((monthMap[mesActual] || {}).unidades || 0) + ' uds</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + ingresosMesAnterior.toLocaleString() + '</div><div class="est-kpi-label">Mes Anterior (' + mesAnterior + ')</div><div class="est-kpi-sub">' + (mesAnterior ? ((monthMap[mesAnterior] || {}).ops || 0) + ' ops / ' + ((monthMap[mesAnterior] || {}).unidades || 0) + ' uds' : 'sin datos') + '</div></div>';
    h += '<div class="est-kpi ' + (tendenciaMensual >= 0 ? 'up' : 'down') + '"><div class="est-kpi-value">' + tendMSign + tendenciaMensual + '%</div><div class="est-kpi-label">Variacion Mensual</div><div class="est-kpi-sub">' + (ingresosMesActual >= ingresosMesAnterior ? 'crecimiento' : 'caida') + '</div></div>';
    h += '</div></div></div>';

    // Source breakdown (admin vs tienda)
    h += '<div class="card mt-16"><div class="card-header"><h3>Canal de Venta</h3></div><div class="card-body">';
    h += '<div class="stats-grid" style="grid-template-columns:1fr 1fr">';
    var adminIngreso = 0, tiendaIngreso = 0;
    for (var d = 0; d < data.length; d++) {
      if (data[d].source === 'admin') adminIngreso += data[d].total || 0;
      else tiendaIngreso += data[d].total || 0;
    }
    var totalCh = adminIngreso + tiendaIngreso;
    h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">$' + adminIngreso.toLocaleString() + '</div><div class="stat-label">Ventas Admin (Fisico)</div><div class="stat-sub">' + (sourceMap.admin || 0) + ' ops' + (totalCh > 0 ? ' (' + Math.round(adminIngreso/totalCh*100) + '%)' : '') + '</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">$' + tiendaIngreso.toLocaleString() + '</div><div class="stat-label">Pedidos Tienda Online</div><div class="stat-sub">' + (sourceMap.tienda || 0) + ' ops' + (totalCh > 0 ? ' (' + Math.round(tiendaIngreso/totalCh*100) + '%)' : '') + '</div></div>';
    h += '</div></div></div>';

    // Charts
    h += '<div class="est-charts-grid">';
    h += '<div class="est-chart-card"><h4>Ingresos Diarios</h4><div class="est-chart-wrap"><canvas id="chart-daily"></canvas></div></div>';
    h += '<div class="est-chart-card"><h4>Ingresos Mensuales</h4><div class="est-chart-wrap"><canvas id="chart-monthly"></canvas></div></div>';
    h += '</div>';

    h += '<div class="est-charts-grid">';
    h += '<div class="est-chart-card"><h4>Tipo de Producto</h4><div class="est-chart-wrap"><canvas id="chart-types"></canvas></div></div>';
    h += '<div class="est-chart-card"><h4>Venta por Talla</h4><div class="est-chart-wrap"><canvas id="chart-tallas"></canvas></div></div>';
    h += '</div>';

    h += '<div class="est-charts-grid">';
    h += '<div class="est-chart-card"><h4>Top 10 Productos por Ingreso</h4><div class="est-chart-wrap est-chart-full"><canvas id="chart-products"></canvas></div></div>';
    h += '<div class="est-chart-card"><h4>Ingresos por Ciudad</h4><div class="est-chart-wrap"><canvas id="chart-ciudad"></canvas></div></div>';
    h += '</div>';

    // Top products table
    h += '<div class="card mt-16"><div class="card-header"><h3>Top Productos por Ingreso</h3></div><div class="card-body">';
    if (prodArr.length > 0) {
      h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Producto</th><th>Tipo</th><th>Talla</th><th>Unidades</th><th>Ingreso</th><th>Participacion</th></tr></thead><tbody>';
      for (var pi = 0; pi < Math.min(prodArr.length, 20); pi++) {
        var pp = prodArr[pi];
        var pct = totalIngresos > 0 ? (pp.ingreso / totalIngresos * 100).toFixed(1) : '0';
        h += '<tr><td class="fw7">' + pp.nombre + '</td><td><span class="badge ' + (pp.tipo === 'blend' ? 'badge-blue' : 'badge-gold') + '">' + (pp.tipo === 'blend' ? 'Blend' : 'Especia') + '</span></td><td>' + pp.talla + '</td><td>' + pp.unidades + '</td><td class="fw7" style="color:var(--gold)">$' + pp.ingreso.toLocaleString() + '</td><td>' + pct + '%</td></tr>';
      }
      h += '</tbody></table></div>';
    } else { h += '<p class="text-muted text-center">Sin datos</p>'; }
    h += '</div></div>';

    // Daily breakdown
    var diasArr = Object.keys(diaMap).sort().reverse();
    if (diasArr.length > 0) {
      h += '<div class="card mt-16"><div class="card-header"><h3>Desglose por Dia</h3></div><div class="card-body">';
      h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Fecha</th><th>Ops</th><th>Unidades</th><th>Ingreso</th><th>Ticket Prom.</th><th>Barra</th></tr></thead><tbody>';
      var maxDiaIng = 0;
      for (var di = 0; di < diasArr.length; di++) { if (diaMap[diasArr[di]].ingresos > maxDiaIng) maxDiaIng = diaMap[diasArr[di]].ingresos; }
      for (var di2 = 0; di2 < diasArr.length; di2++) {
        var dk = diasArr[di2]; var dv = diaMap[dk];
        var dBarW = maxDiaIng > 0 ? (dv.ingresos / maxDiaIng * 100).toFixed(0) : 0;
        var ticketP = dv.ops > 0 ? Math.round(dv.ingresos / dv.ops) : 0;
        h += '<tr><td class="fw7">' + dk + '</td><td>' + dv.ops + '</td><td>' + dv.unidades + '</td><td class="fw7" style="color:var(--gold)">$' + dv.ingresos.toLocaleString() + '</td><td>$' + ticketP.toLocaleString() + '</td><td><div class="est-bar-inline"><div class="est-bar-track"><div class="est-bar-fill" style="width:' + dBarW + '%;background:var(--gold)"></div></div></div></td></tr>';
      }
      h += '</tbody></table></div></div></div>';
    }

    el.innerHTML = h;

    // === CHARTS ===
    if (Pages._estCharts) { for (var ci = 0; ci < Pages._estCharts.length; ci++) { try { Pages._estCharts[ci].destroy(); } catch (e) {} } }
    Pages._estCharts = [];
    Chart.defaults.color = '#9a8a78';
    Chart.defaults.borderColor = '#3a2218';
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    var gOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 12, padding: 12 } } }, scales: { y: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.5)' } }, x: { grid: { display: false } } } };

    // Daily line
    var dailyLabels = [], dailyData = [], dailyOpsData = [];
    for (var dd = 0; dd < diasSorted.length; dd++) { dailyLabels.push(diasSorted[dd].slice(5)); dailyData.push(diaMap[diasSorted[dd]].ingresos); dailyOpsData.push(diaMap[diasSorted[dd]].ops); }
    var ctxD = document.getElementById('chart-daily');
    if (ctxD) {
      Pages._estCharts.push(new Chart(ctxD, {
        type: 'line',
        data: { labels: dailyLabels, datasets: [
          { label: 'Ingresos ($)', data: dailyData, borderColor: '#e8b84b', backgroundColor: 'rgba(232,184,75,0.1)', fill: true, tension: 0.3, pointRadius: 3, yAxisID: 'y' },
          { label: 'Operaciones', data: dailyOpsData, borderColor: '#5dade2', backgroundColor: 'rgba(93,173,226,0.1)', fill: false, tension: 0.3, pointRadius: 2, yAxisID: 'y1' }
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12, padding: 16 } } }, scales: { y: { position: 'left', ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.5)' } }, y1: { position: 'right', ticks: { stepSize: 1 }, grid: { drawOnChartArea: false } }, x: { grid: { color: 'rgba(58,34,24,0.3)' } } } }
      }));
    }

    // Monthly bar
    var mLabels = [], mData = [], mOpsData = [];
    for (var mi = 0; mi < mesesSorted.length; mi++) { mLabels.push(mesesSorted[mi]); mData.push(monthMap[mesesSorted[mi]].ingresos); mOpsData.push(monthMap[mesesSorted[mi]].ops); }
    var ctxM = document.getElementById('chart-monthly');
    if (ctxM) {
      Pages._estCharts.push(new Chart(ctxM, {
        type: 'bar', data: { labels: mLabels, datasets: [
          { label: 'Ingresos ($)', data: mData, backgroundColor: 'rgba(232,184,75,0.7)', borderColor: '#e8b84b', borderWidth: 1, borderRadius: 6, yAxisID: 'y' },
          { label: 'Operaciones', data: mOpsData, type: 'line', borderColor: '#5dade2', backgroundColor: 'transparent', pointRadius: 3, yAxisID: 'y1' }
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12, padding: 16 } } }, scales: { y: { position: 'left', ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.5)' } }, y1: { position: 'right', ticks: { stepSize: 1 }, grid: { drawOnChartArea: false } }, x: { grid: { display: false } } } }
      }));
    }

    // Types doughnut
    var ctxT = document.getElementById('chart-types');
    if (ctxT) {
      Pages._estCharts.push(new Chart(ctxT, {
        type: 'doughnut', data: { labels: ['Especias', 'Blends'], datasets: [{ data: [tipoMap.especia || 0, tipoMap.blend || 0], backgroundColor: ['#e8b84b', '#5dade2'], borderColor: '#241209', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12 } } } }
      }));
    }

    // Tallas pie
    var ctxTa = document.getElementById('chart-tallas');
    if (ctxTa) {
      Pages._estCharts.push(new Chart(ctxTa, {
        type: 'pie', data: { labels: ['Pequeno', 'Grande'], datasets: [{ data: [tallaMap.chico || 0, tallaMap.grande || 0], backgroundColor: ['#c9963a', '#5dade2'], borderColor: '#241209', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12 } } } }
      }));
    }

    // Top 10 horizontal bar
    var top10 = prodArr.slice(0, 10);
    var ctxP = document.getElementById('chart-products');
    if (ctxP) {
      var pL = [], pI = [], pC = [];
      for (var tp = 0; tp < top10.length; tp++) { pL.push(top10[tp].nombre); pI.push(top10[tp].ingreso); pC.push(top10[tp].tipo === 'blend' ? '#5dade2' : '#e8b84b'); }
      Pages._estCharts.push(new Chart(ctxP, { type: 'bar', data: { labels: pL, datasets: [{ label: 'Ingreso ($)', data: pI, backgroundColor: pC, borderRadius: 4, barThickness: 18 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.5)' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } } }));
    }

    // City bar
    var ctxC = document.getElementById('chart-ciudad');
    if (ctxC) {
      var ciudades = Object.keys(ciudadMap).sort(function(a, b) { return ciudadMap[b].ingresos - ciudadMap[a].ingresos; });
      var cL = [], cD = [];
      for (var ci2 = 0; ci2 < ciudades.length; ci2++) { cL.push(ciudades[ci2]); cD.push(ciudadMap[ciudades[ci2]].ingresos); }
      Pages._estCharts.push(new Chart(ctxC, { type: 'bar', data: { labels: cL, datasets: [{ label: 'Ingresos ($)', data: cD, backgroundColor: 'rgba(39,174,96,0.7)', borderColor: '#27ae60', borderWidth: 1, borderRadius: 6 }] }, options: Object.assign({}, gOpts) }));
    }

    var canvases = el.querySelectorAll('.est-chart-wrap');
    for (var ch = 0; ch < canvases.length; ch++) { canvases[ch].style.height = canvases[ch].classList.contains('est-chart-full') ? '300px' : '260px'; }
  },

  /* ================================================================
     COSTOS Y MARGEN TAB
     ================================================================ */
  _renderCostos: function(data, el, entradas, especias, blends, producciones) {
    if (!el) return;

    // 1. Total cost of purchases (entradas)
    var totalCostoCompras = 0;
    var costoByTipo = { especia_grs: 0, envase: 0, bolsa: 0, sticker: 0, cinta: 0 };
    var proveedorMap = {};
    var compraMonthMap = {};
    for (var ei = 0; ei < entradas.length; ei++) {
      var ent = entradas[ei];
      var entTotal = Number(ent.total) || 0;
      totalCostoCompras += entTotal;
      var prov = (ent.proveedor || 'Sin proveedor').trim();
      if (!prov) prov = 'Sin proveedor';
      if (!proveedorMap[prov]) proveedorMap[prov] = { total: 0, ops: 0 };
      proveedorMap[prov].total += entTotal;
      proveedorMap[prov].ops++;
      if (ent.fecha) {
        var mn = ent.fecha.substring(0, 7);
        if (!compraMonthMap[mn]) compraMonthMap[mn] = 0;
        compraMonthMap[mn] += entTotal;
      }
      if (ent.items) {
        for (var ij = 0; ij < ent.items.length; ij++) {
          var it = ent.items[ij];
          var t = it.tipo || 'especia_grs';
          costoByTipo[t] = (costoByTipo[t] || 0) + ((Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0));
        }
      }
    }

    // 2. Total ingresos
    var totalIngresos = 0;
    for (var si = 0; si < data.length; si++) totalIngresos += (data[si].total || 0);

    // 3. Margen
    var margenBruto = totalIngresos - totalCostoCompras;
    var margenPct = totalIngresos > 0 ? (margenBruto / totalIngresos * 100).toFixed(1) : '0';

    // 4. Per-product margin (income vs estimated material cost from produccion)
    var prodVentaMap = {}, prodCostoMap = {};
    for (var di = 0; di < data.length; di++) {
      var s = data[di];
      if (s.items) { for (var ii = 0; ii < s.items.length; ii++) {
        var item = s.items[ii];
        var pk = item.nombre + '|' + item.tipo;
        if (!prodVentaMap[pk]) prodVentaMap[pk] = 0;
        prodVentaMap[pk] += (item.subtotal || 0);
      }}
    }
    // From entradas, calculate cost per gram for each especia
    var costoPorGramo = {};
    var gramosComprados = {};
    for (var ei2 = 0; ei2 < entradas.length; ei2++) {
      var ent2 = entradas[ei2];
      if (ent2.items) { for (var ij2 = 0; ij2 < ent2.items.length; ij2++) {
        var it2 = ent2.items[ij2];
        if (it2.tipo === 'especia_grs' && it2.especiaNombre) {
          var nombre = it2.especiaNombre;
          var grs = Number(it2.cantidad) || 0;
          var cost = grs * (Number(it2.costoUnitario) || 0);
          costoPorGramo[nombre] = (costoPorGramo[nombre] || 0) + cost;
          gramosComprados[nombre] = (gramosComprados[nombre] || 0) + grs;
        }
      }}
    }
    var costoGrPorEsp = {};
    var espNames = Object.keys(gramosComprados);
    for (var gn = 0; gn < espNames.length; gn++) {
      if (gramosComprados[espNames[gn]] > 0) {
        costoGrPorEsp[espNames[gn]] = costoPorGramo[espNames[gn]] / gramosComprados[espNames[gn]];
      }
    }

    // Build blend cost from ingredients
    var costoBlendMap = {};
    for (var bi = 0; bi < blends.length; bi++) {
      var bl = blends[bi];
      var ings = bl.ingredientes || [];
      var costChico = 0, costGrande = 0;
      for (var ig = 0; ig < ings.length; ig++) {
        var ing = ings[ig];
        var cpg = costoGrPorEsp[ing.especiaNombre] || 0;
        costChico += (Number(ing.gramosChico) || 0) * cpg;
        costGrande += (Number(ing.gramosGrande) || 0) * cpg;
      }
      // Add envase + bolsa + sticker cost per unit
      costoBlendMap['blend|' + bl.nombre] = { chico: costChico, grande: costGrande };
    }
    for (var ei3 = 0; ei3 < especias.length; ei3++) {
      var esp = especias[ei3];
      var cpg2 = costoGrPorEsp[esp.nombre] || 0;
      costoBlendMap['especia|' + esp.nombre] = { chico: (Number(esp.gramosChico) || 0) * cpg2, grande: (Number(esp.gramosGrande) || 0) * cpg2 };
    }

    // 5. Production volume stats
    var totalFrascosProd = 0, totalGrsProd = 0, prodByMonth = {};
    for (var pri = 0; pri < producciones.length; pri++) {
      var pr = producciones[pri];
      totalFrascosProd += (pr.cantidad || 0);
      totalGrsProd += (pr.gramosTotal || 0);
      if (pr.fecha) {
        var pmn = pr.fecha.substring(0, 7);
        if (!prodByMonth[pmn]) prodByMonth[pmn] = { frascos: 0, gramos: 0, ops: 0 };
        prodByMonth[pmn].frascos += (pr.cantidad || 0);
        prodByMonth[pmn].gramos += (pr.gramosTotal || 0);
        prodByMonth[pmn].ops++;
      }
    }

    var h = '';
    // KPIs
    h += '<div class="est-kpi-grid">';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + totalIngresos.toLocaleString() + '</div><div class="est-kpi-label">Ingresos Totales</div><div class="est-kpi-sub">por todas las ventas</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value" style="color:var(--red)">$' + totalCostoCompras.toLocaleString() + '</div><div class="est-kpi-label">Costo Compras</div><div class="est-kpi-sub">materia prima + packaging</div></div>';
    h += '<div class="est-kpi ' + (margenBruto >= 0 ? 'up' : 'down') + '"><div class="est-kpi-value">$' + margenBruto.toLocaleString() + '</div><div class="est-kpi-label">Margen Bruto</div><div class="est-kpi-sub">' + margenPct + '%</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + totalFrascosProd + '</div><div class="est-kpi-label">Frascos Producidos</div><div class="est-kpi-sub">' + totalGrsProd.toLocaleString() + ' grs en total</div></div>';
    h += '</div>';

    // Cost breakdown by type
    h += '<div class="card mt-16"><div class="card-header"><h3>Desglose de Costos por Tipo</h3></div><div class="card-body">';
    h += '<div class="stats-grid" style="grid-template-columns:repeat(5,1fr)">';
    h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">$' + (costoByTipo.especia_grs || 0).toLocaleString() + '</div><div class="stat-label">Materia Prima</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">$' + (costoByTipo.envase || 0).toLocaleString() + '</div><div class="stat-label">Frascos (Envases)</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">$' + (costoByTipo.bolsa || 0).toLocaleString() + '</div><div class="stat-label">Bolsas</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--yellow)"><div class="stat-value">$' + (costoByTipo.sticker || 0).toLocaleString() + '</div><div class="stat-label">Stickers/Etiquetas</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">$' + (costoByTipo.cinta || 0).toLocaleString() + '</div><div class="stat-label">Cintas</div></div>';
    h += '</div></div></div>';

    // Proveedor table
    var provArr = Object.keys(proveedorMap).sort(function(a, b) { return proveedorMap[b].total - proveedorMap[a].total; });
    if (provArr.length > 0) {
      h += '<div class="card mt-16"><div class="card-header"><h3>Compras por Proveedor</h3></div><div class="card-body">';
      h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Proveedor</th><th>Ordenes</th><th>Total Comprado</th><th>Participacion</th></tr></thead><tbody>';
      for (var pvi = 0; pvi < provArr.length; pvi++) {
        var pv = provArr[pvi]; var pd = proveedorMap[pv];
        var pvPct = totalCostoCompras > 0 ? (pd.total / totalCostoCompras * 100).toFixed(1) : '0';
        h += '<tr><td class="fw7">' + pv + '</td><td>' + pd.ops + '</td><td class="fw7" style="color:var(--red)">$' + pd.total.toLocaleString() + '</td><td>' + pvPct + '%</td></tr>';
      }
      h += '</tbody></table></div></div></div>';
    }

    // Charts
    h += '<div class="est-charts-grid">';
    h += '<div class="est-chart-card"><h4>Ingresos vs Costos Mensual</h4><div class="est-chart-wrap"><canvas id="chart-cost-mensual"></canvas></div></div>';
    h += '<div class="est-chart-card"><h4>Distribucion de Costos</h4><div class="est-chart-wrap"><canvas id="chart-cost-dist"></canvas></div></div>';
    h += '</div>';

    // Per-product margin table
    h += '<div class="card mt-16"><div class="card-header"><h3>Margen Estimado por Producto</h3></div><div class="card-body"><p class="text-sm text-muted mb-8">Costo de materia prima estimado segun precio de compra por gramo. No incluye envases/bolsas/stickers.</p>';
    var allProducts = [];
    for (var vk = 0; vk < Object.keys(prodVentaMap).length; vk++) {
      var pk2 = Object.keys(prodVentaMap)[vk];
      var parts = pk2.split('|');
      var pNombre = parts.slice(1).join('|');
      var pTipo = parts[0];
      var pIngreso = prodVentaMap[pk2];
      var costoEst = costoBlendMap[pk2] || { chico: 0, grande: 0 };
      allProducts.push({ nombre: pNombre, tipo: pTipo, ingreso: pIngreso, costoEst: costoEst.chico + costoEst.grande });
    }
    allProducts.sort(function(a, b) { return b.ingreso - a.ingreso; });
    if (allProducts.length > 0) {
      h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Producto</th><th>Tipo</th><th>Ingreso</th><th>Costo M.P.</th><th>Margen</th><th>% Margen</th></tr></thead><tbody>';
      for (var api = 0; api < Math.min(allProducts.length, 20); api++) {
        var ap = allProducts[api];
        var apMargen = ap.ingreso - ap.costoEst;
        var apPct = ap.ingreso > 0 ? (apMargen / ap.ingreso * 100).toFixed(1) : '0';
        var apColor = apMargen >= 0 ? 'var(--green)' : 'var(--red)';
        h += '<tr><td class="fw7">' + ap.nombre + '</td><td><span class="badge ' + (ap.tipo === 'blend' ? 'badge-blue' : 'badge-gold') + '">' + (ap.tipo === 'blend' ? 'Blend' : 'Especia') + '</span></td><td style="color:var(--gold)">$' + ap.ingreso.toLocaleString() + '</td><td style="color:var(--red)">$' + ap.costoEst.toLocaleString() + '</td><td style="color:' + apColor + '">$' + apMargen.toLocaleString() + '</td><td style="color:' + apColor + '">' + apPct + '%</td></tr>';
      }
      h += '</tbody></table></div>';
    } else { h += '<p class="text-muted text-center">Sin datos suficientes</p>'; }
    h += '</div></div>';

    el.innerHTML = h;

    // Charts
    if (Pages._estCharts) { for (var ci = 0; ci < Pages._estCharts.length; ci++) { try { Pages._estCharts[ci].destroy(); } catch (e) {} } }
    Pages._estCharts = [];
    Chart.defaults.color = '#9a8a78';
    Chart.defaults.borderColor = '#3a2218';
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    // Ingresos vs Costos Mensual
    var allMonths = new Set(Object.keys(compraMonthMap));
    var ventasMonthMap = {};
    for (var vi = 0; vi < data.length; vi++) {
      if (data[vi].fecha) {
        var vmn = data[vi].fecha.substring(0, 7);
        ventasMonthMap[vmn] = (ventasMonthMap[vmn] || 0) + (data[vi].total || 0);
      }
    }
    Object.keys(ventasMonthMap).forEach(function(m) { allMonths.add(m); });
    var mSort = Array.from(allMonths).sort();
    var cmLabels = [], cmIngresos = [], cmCostos = [], cmMargen = [];
    for (var cm = 0; cm < mSort.length; cm++) {
      cmLabels.push(mSort[cm]);
      var v = ventasMonthMap[mSort[cm]] || 0;
      var c = compraMonthMap[mSort[cm]] || 0;
      cmIngresos.push(v); cmCostos.push(c); cmMargen.push(v - c);
    }
    var ctxCM = document.getElementById('chart-cost-mensual');
    if (ctxCM) {
      Pages._estCharts.push(new Chart(ctxCM, {
        type: 'bar', data: { labels: cmLabels, datasets: [
          { label: 'Ingresos', data: cmIngresos, backgroundColor: 'rgba(232,184,75,0.7)', borderRadius: 4 },
          { label: 'Costos', data: cmCostos, backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 4 },
          { label: 'Margen', data: cmMargen, type: 'line', borderColor: '#27ae60', backgroundColor: 'transparent', pointRadius: 4, borderWidth: 2 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12, padding: 16 } } }, scales: { y: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.5)' } }, x: { grid: { display: false } } } }
      }));
    }

    // Cost distribution doughnut
    var ctxCD = document.getElementById('chart-cost-dist');
    if (ctxCD) {
      Pages._estCharts.push(new Chart(ctxCD, {
        type: 'doughnut', data: { labels: ['Materia Prima', 'Envases', 'Bolsas', 'Stickers'], datasets: [{ data: [costoByTipo.especia_grs || 0, costoByTipo.envase || 0, costoByTipo.bolsa || 0, costoByTipo.sticker || 0], backgroundColor: ['#e8b84b', '#5dade2', '#27ae60', '#f0c040'], borderColor: '#241209', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12 } } } }
      }));
    }

    var canvases = el.querySelectorAll('.est-chart-wrap');
    for (var ch = 0; ch < canvases.length; ch++) { canvases[ch].style.height = '280px'; }
  },

  /* ================================================================
     PRODUCCION TAB
     ================================================================ */
  _renderProduccion: function(data, el, producciones) {
    if (!el) return;
    var totalFrascos = 0, totalGramos = 0;
    var tipoProdMap = {}, tallaProdMap = {}, prodProdMap = {}, prodMonthMap = {}, envasesConsumidos = 0, bolsasConsumidas = 0, stickersConsumidos = 0, cintasConsumidas = 0;
    for (var i = 0; i < producciones.length; i++) {
      var pr = producciones[i];
      totalFrascos += (pr.cantidad || 0);
      totalGramos += (pr.gramosTotal || 0);
      envasesConsumidos += (pr.envasesConsumidos || 0);
      bolsasConsumidas += (pr.bolsasConsumidas || 0);
      stickersConsumidos += (pr.stickersConsumidos || 0);
      cintasConsumidas += (pr.cintasConsumidas || 0);
      tipoProdMap[pr.tipo] = (tipoProdMap[pr.tipo] || 0) + (pr.cantidad || 0);
      tallaProdMap[pr.talla || 'chico'] = (tallaProdMap[pr.talla || 'chico'] || 0) + (pr.cantidad || 0);
      var pk = (pr.productoNombre || '?') + '|' + (pr.tipo || 'especia') + '|' + (pr.talla || 'chico');
      if (!prodProdMap[pk]) prodProdMap[pk] = { nombre: pr.productoNombre, tipo: pr.tipo, talla: pr.talla, frascos: 0, gramos: 0, ops: 0 };
      prodProdMap[pk].frascos += (pr.cantidad || 0);
      prodProdMap[pk].gramos += (pr.gramosTotal || 0);
      prodProdMap[pk].ops++;
      if (pr.fecha) {
        var mn = pr.fecha.substring(0, 7);
        if (!prodMonthMap[mn]) prodMonthMap[mn] = { frascos: 0, gramos: 0, ops: 0 };
        prodMonthMap[mn].frascos += (pr.cantidad || 0);
        prodMonthMap[mn].gramos += (pr.gramosTotal || 0);
        prodMonthMap[mn].ops++;
      }
    }
    var prodArr = Object.values(prodProdMap).sort(function(a, b) { return b.frascos - a.frascos; });

    var h = '';
    h += '<div class="est-kpi-grid">';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + totalFrascos + '</div><div class="est-kpi-label">Frascos Producidos</div><div class="est-kpi-sub">' + producciones.length + ' operaciones</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + totalGramos.toLocaleString() + 'g</div><div class="est-kpi-label">Materia Prima Usada</div><div class="est-kpi-sub">gramos en total</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + envasesConsumidos + '</div><div class="est-kpi-label">Envases Consumidos</div><div class="est-kpi-sub">frascos usados</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + stickersConsumidos + '</div><div class="est-kpi-label">Stickers Usados</div><div class="est-kpi-sub">etiquetas aplicadas</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + bolsasConsumidas + '</div><div class="est-kpi-label">Bolsas Usadas</div><div class="est-kpi-sub">empaques</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + cintasConsumidas + '</div><div class="est-kpi-label">Cintas Usadas</div><div class="est-kpi-sub">decorativas</div></div>';
    h += '</div>';

    // Charts
    h += '<div class="est-charts-grid">';
    h += '<div class="est-chart-card"><h4>Produccion Mensual (Frascos)</h4><div class="est-chart-wrap"><canvas id="chart-prod-monthly"></canvas></div></div>';
    h += '<div class="est-chart-card"><h4>Tipo y Talla</h4><div class="est-chart-wrap"><canvas id="chart-prod-tipo"></canvas></div></div>';
    h += '</div>';

    // Production table
    h += '<div class="card mt-16"><div class="card-header"><h3>Produccion por Producto</h3></div><div class="card-body">';
    if (prodArr.length > 0) {
      h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Producto</th><th>Tipo</th><th>Talla</th><th>Frascos</th><th>Gramos</th><th>Ops</th></tr></thead><tbody>';
      for (var pi = 0; pi < prodArr.length; pi++) {
        var pp = prodArr[pi];
        h += '<tr><td class="fw7">' + pp.nombre + '</td><td><span class="badge ' + (pp.tipo === 'blend' ? 'badge-blue' : 'badge-gold') + '">' + (pp.tipo === 'blend' ? 'Blend' : 'Especia') + '</span></td><td>' + pp.talla + '</td><td class="fw7">' + pp.frascos + '</td><td>' + pp.gramos.toLocaleString() + 'g</td><td>' + pp.ops + '</td></tr>';
      }
      h += '</tbody></table></div>';
    } else { h += '<p class="text-muted text-center">Sin producciones</p>'; }
    h += '</div></div>';

    el.innerHTML = h;

    if (Pages._estCharts) { for (var ci = 0; ci < Pages._estCharts.length; ci++) { try { Pages._estCharts[ci].destroy(); } catch (e) {} } }
    Pages._estCharts = [];
    Chart.defaults.color = '#9a8a78'; Chart.defaults.borderColor = '#3a2218'; Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    var pmSorted = Object.keys(prodMonthMap).sort();
    var pmL = [], pmF = [], pmG = [];
    for (var mi = 0; mi < pmSorted.length; mi++) { pmL.push(pmSorted[mi]); pmF.push(prodMonthMap[pmSorted[mi]].frascos); pmG.push(prodMonthMap[pmSorted[mi]].gramos); }
    var ctxPM = document.getElementById('chart-prod-monthly');
    if (ctxPM) {
      Pages._estCharts.push(new Chart(ctxPM, { type: 'bar', data: { labels: pmL, datasets: [
        { label: 'Frascos', data: pmF, backgroundColor: 'rgba(232,184,75,0.7)', borderRadius: 4, yAxisID: 'y' },
        { label: 'Gramos', data: pmG, type: 'line', borderColor: '#5dade2', backgroundColor: 'transparent', pointRadius: 3, yAxisID: 'y1' }
      ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12, padding: 16 } } }, scales: { y: { position: 'left', title: { display: true, text: 'Frascos' }, grid: { color: 'rgba(58,34,24,0.5)' } }, y1: { position: 'right', title: { display: true, text: 'Gramos' }, grid: { drawOnChartArea: false } }, x: { grid: { display: false } } } } }));
    }

    var ctxPT = document.getElementById('chart-prod-tipo');
    if (ctxPT) {
      Pages._estCharts.push(new Chart(ctxPT, { type: 'bar', data: { labels: ['Especia-Chico', 'Especia-Grande', 'Blend-Chico', 'Blend-Grande'], datasets: [{ label: 'Frascos', data: [tipoProdMap.especia_chico || 0, tipoProdMap.especia_grande || 0, tipoProdMap.blend_chico || 0, tipoProdMap.blend_grande || 0], backgroundColor: ['#e8b84b', '#c9963a', '#5dade2', '#3498db'], borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(58,34,24,0.5)' } }, x: { grid: { display: false } } } } }));
    }

    var canvases = el.querySelectorAll('.est-chart-wrap');
    for (var ch = 0; ch < canvases.length; ch++) { canvases[ch].style.height = '280px'; }
  },

  /* ================================================================
     PEDIDOS TIENDA TAB
     ================================================================ */
  _renderPedidosTienda: function(data, el) {
    if (!el) return;
    var total = 0, ops = 0, ciudades = {}, estadoMap = {}, dayMap = {}, prodMap = {};
    for (var i = 0; i < data.length; i++) {
      var s = data[i];
      total += (s.total || 0); ops++;
      estadoMap[s.estado || 'nuevo'] = (estadoMap[s.estado || 'nuevo'] || 0) + 1;
      if (s.ciudad) { if (!ciudades[s.ciudad]) ciudades[s.ciudad] = { ops: 0, ingreso: 0 }; ciudades[s.ciudad].ops++; ciudades[s.ciudad].ingreso += (s.total || 0); }
      if (s.fecha) { if (!dayMap[s.fecha]) dayMap[s.fecha] = { ops: 0, ingreso: 0 }; dayMap[s.fecha].ops++; dayMap[s.fecha].ingreso += (s.total || 0); }
      if (s.items) { for (var j = 0; j < s.items.length; j++) {
        var it = s.items[j]; var pk = it.nombre + '|' + (it.talla || 'chico');
        if (!prodMap[pk]) prodMap[pk] = { nombre: it.nombre, talla: it.talla, uds: 0, ingreso: 0 };
        prodMap[pk].uds += (it.cantidad || 0); prodMap[pk].ingreso += (it.subtotal || 0);
      }}
    }
    var prodArr = Object.values(prodMap).sort(function(a, b) { return b.ingreso - a.ingreso; });
    var cityArr = Object.keys(ciudades).sort(function(a, b) { return ciudades[b].ingreso - ciudades[a].ingreso; });

    var h = '<div class="est-kpi-grid">';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + total.toLocaleString() + '</div><div class="est-kpi-label">Ingresos Tienda</div><div class="est-kpi-sub">' + ops + ' pedidos</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + (ops > 0 ? Math.round(total / ops) : 0).toLocaleString() + '</div><div class="est-kpi-label">Ticket Promedio</div><div class="est-kpi-sub">por pedido</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + cityArr.length + '</div><div class="est-kpi-label">Ciudades</div><div class="est-kpi-sub">destino de envios</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + (estadoMap.entregado || 0) + '</div><div class="est-kpi-label">Entregados</div><div class="est-kpi-sub">de ' + ops + ' total</div></div>';
    h += '</div>';

    // Estado breakdown
    var estColors = { nuevo: 'badge-red', confirmado: 'badge-yellow', preparando: 'badge-blue', enviado: 'badge-gold', entregado: 'badge-green', cancelado: 'badge-red' };
    var estLabels = { nuevo: 'Nuevos', confirmado: 'Confirmados', preparando: 'Preparando', enviado: 'Enviados', entregado: 'Entregados', cancelado: 'Cancelados' };
    h += '<div class="card mt-16"><div class="card-header"><h3>Estado de Pedidos</h3></div><div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap">';
    var estKeys = Object.keys(estadoMap).sort();
    for (var ei = 0; ei < estKeys.length; ei++) {
      var ek = estKeys[ei];
      h += '<div style="text-align:center;padding:12px 16px;background:var(--bg);border-radius:8px;min-width:80px"><div style="font-size:1.4rem;font-weight:800;color:var(--text)">' + estadoMap[ek] + '</div><div style="font-size:.72rem;color:var(--text2);margin-top:2px">' + (estLabels[ek] || ek) + '</div></div>';
    }
    h += '</div></div>';

    // Charts
    h += '<div class="est-charts-grid">';
    h += '<div class="est-chart-card"><h4>Pedidos por Dia</h4><div class="est-chart-wrap"><canvas id="chart-ped-daily"></canvas></div></div>';
    h += '<div class="est-chart-card"><h4>Top 8 Productos</h4><div class="est-chart-wrap"><canvas id="chart-ped-prods"></canvas></div></div>';
    h += '</div>';

    // City table
    if (cityArr.length > 0) {
      h += '<div class="card mt-16"><div class="card-header"><h3>Ingresos por Ciudad</h3></div><div class="card-body">';
      h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Ciudad</th><th>Pedidos</th><th>Ingreso</th><th>Promedio</th></tr></thead><tbody>';
      for (var ci = 0; ci < cityArr.length; ci++) {
        var cd = ciudades[cityArr[ci]];
        h += '<tr><td class="fw7">' + cityArr[ci] + '</td><td>' + cd.ops + '</td><td class="fw7" style="color:var(--gold)">$' + cd.ingreso.toLocaleString() + '</td><td>$' + (cd.ops > 0 ? Math.round(cd.ingreso / cd.ops) : 0).toLocaleString() + '</td></tr>';
      }
      h += '</tbody></table></div></div></div>';
    }

    el.innerHTML = h;

    if (Pages._estCharts) { for (var ci = 0; ci < Pages._estCharts.length; ci++) { try { Pages._estCharts[ci].destroy(); } catch (e) {} } }
    Pages._estCharts = [];
    Chart.defaults.color = '#9a8a78'; Chart.defaults.borderColor = '#3a2218'; Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    var daySorted = Object.keys(dayMap).sort();
    var ctxPD = document.getElementById('chart-ped-daily');
    if (ctxPD) {
      var dl = [], dd = [], do2 = [];
      for (var di = 0; di < daySorted.length; di++) { dl.push(daySorted[di].slice(5)); dd.push(dayMap[daySorted[di]].ingreso); do2.push(dayMap[daySorted[di]].ops); }
      Pages._estCharts.push(new Chart(ctxPD, { type: 'bar', data: { labels: dl, datasets: [
        { label: 'Ingreso ($)', data: dd, backgroundColor: 'rgba(232,184,75,0.7)', borderRadius: 4, yAxisID: 'y' },
        { label: 'Pedidos', data: do2, type: 'line', borderColor: '#5dade2', backgroundColor: 'transparent', pointRadius: 3, yAxisID: 'y1' }
      ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12, padding: 16 } } }, scales: { y: { position: 'left', ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.5)' } }, y1: { position: 'right', ticks: { stepSize: 1 }, grid: { drawOnChartArea: false } }, x: { grid: { display: false } } } } }));
    }

    var ctxPP = document.getElementById('chart-ped-prods');
    if (ctxPP && prodArr.length > 0) {
      var top8 = prodArr.slice(0, 8);
      var pl = [], pd2 = [], pc = [];
      for (var pi = 0; pi < top8.length; pi++) { pl.push(top8[pi].nombre); pd2.push(top8[pi].ingreso); pc.push('#e8b84b'); }
      Pages._estCharts.push(new Chart(ctxPP, { type: 'bar', data: { labels: pl, datasets: [{ label: 'Ingreso ($)', data: pd2, backgroundColor: pc, borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } }, grid: { color: 'rgba(58,34,24,0.5)' } }, y: { grid: { display: false } } } } }));
    }

    var canvases = el.querySelectorAll('.est-chart-wrap');
    for (var ch = 0; ch < canvases.length; ch++) { canvases[ch].style.height = '280px'; }
  },

  /* ================================================================
     INVENTARIO TAB
     ================================================================ */
  _renderInventario: function(el, especias, blends) {
    if (!el) return;
    var db = ArcanoDB.getDB();
    var envases = db.stockEnvases || { chico: 0, grande: 0 };
    var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
    var stickers = ArcanoDB.getStickers();

    // Calculate inventory value (at sale price)
    var valorFrascos = 0, valorPala = 0;
    var stockBajo = [], sinStock = [];
    var catMap = {}, catStockMap = {};
    for (var i = 0; i < especias.length; i++) {
      var e = especias[i];
      var vChico = (e.stockChico || 0) * (e.precioChico || 0);
      var vGrande = (e.stockGrande || 0) * (e.precioGrande || 0);
      valorFrascos += vChico + vGrande;
      var palaGrs = e.stockBolsa || 0;
      var eCats = (e.categorias || []).length > 0 ? e.categorias : [e.categoria || 'Sin categoria'];
      var eCatLabel = eCats.join(' / ');
      for (var ci = 0; ci < eCats.length; ci++) {
        if (!catMap[eCats[ci]]) catMap[eCats[ci]] = { productos: 0, frascos: 0, pala: 0 };
        catMap[eCats[ci]].productos++;
        catMap[eCats[ci]].frascos += (e.stockChico || 0) + (e.stockGrande || 0);
        catMap[eCats[ci]].pala += palaGrs;
      }
      var totalStock = (e.stockChico || 0) + (e.stockGrande || 0);
      if (totalStock === 0 && palaGrs === 0) sinStock.push({ nombre: e.nombre, tipo: 'especia', cat: eCatLabel });
      else if (totalStock <= 3 || palaGrs <= 50) stockBajo.push({ nombre: e.nombre, tipo: 'especia', cat: eCatLabel, frascos: totalStock, pala: palaGrs });
    }
    for (var bi = 0; bi < blends.length; bi++) {
      var b = blends[bi];
      valorFrascos += (b.stockChico || 0) * (b.precioChico || 0) + (b.stockGrande || 0) * (b.precioGrande || 0);
      var bCats = (b.categorias || []).length > 0 ? b.categorias : [b.categoria || 'Sin categoria'];
      var bCatLabel = bCats.join(' / ');
      for (var bci = 0; bci < bCats.length; bci++) {
        if (!catMap[bCats[bci]]) catMap[bCats[bci]] = { productos: 0, frascos: 0, pala: 0 };
        catMap[bCats[bci]].productos++;
        catMap[bCats[bci]].frascos += (b.stockChico || 0) + (b.stockGrande || 0);
      }
      var ts = (b.stockChico || 0) + (b.stockGrande || 0);
      if (ts === 0) sinStock.push({ nombre: b.nombre, tipo: 'blend', cat: bCatLabel });
      else if (ts <= 3) stockBajo.push({ nombre: b.nombre, tipo: 'blend', cat: bCatLabel, frascos: ts, pala: 0 });
    }
    var totalProductos = especias.length + blends.length;
    var totalFrascosStock = especias.reduce(function(s, e) { return s + (e.stockChico||0) + (e.stockGrande||0); }, 0) +
                             blends.reduce(function(s, b) { return s + (b.stockChico||0) + (b.stockGrande||0); }, 0);
    var totalPala = especias.reduce(function(s, e) { return s + (e.stockBolsa||0); }, 0);

    var h = '';
    h += '<div class="est-kpi-grid">';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + valorFrascos.toLocaleString() + '</div><div class="est-kpi-label">Valor Inventario (Frascos)</div><div class="est-kpi-sub">al precio de venta</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + totalFrascosStock + '</div><div class="est-kpi-label">Frascos en Stock</div><div class="est-kpi-sub">listos para vender</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">' + totalPala.toLocaleString() + 'g</div><div class="est-kpi-label">Pala (Materia Prima)</div><div class="est-kpi-sub">gramos en stock</div></div>';
    h += '<div class="est-kpi ' + (stockBajo.length > 0 ? 'down' : 'up') + '"><div class="est-kpi-value">' + stockBajo.length + '</div><div class="est-kpi-label">Stock Bajo</div><div class="est-kpi-sub">requiere reposicion</div></div>';
    h += '<div class="est-kpi ' + (sinStock.length > 0 ? 'down' : 'up') + '"><div class="est-kpi-value">' + sinStock.length + '</div><div class="est-kpi-label">Sin Stock</div><div class="est-kpi-sub">productos agotados</div></div>';
    h += '</div>';

    // Packaging stock
    h += '<div class="card mt-16"><div class="card-header"><h3>Stock de Packaging</h3></div><div class="card-body">';
    h += '<div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">' + (envases.chico || 0) + '</div><div class="stat-label">Envases Pequenos</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">' + (envases.grande || 0) + '</div><div class="stat-label">Envases Grandes</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">' + (bolsas.chico || 0) + '</div><div class="stat-label">Bolsas Pequenas</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">' + (bolsas.grande || 0) + '</div><div class="stat-label">Bolsas Grandes</div></div>';
    h += '</div></div></div>';

    // Category breakdown
    var catArr = Object.keys(catMap).sort(function(a, b) { return catMap[b].frascos - catMap[a].frascos; });
    h += '<div class="card mt-16"><div class="card-header"><h3>Inventario por Categoria</h3></div><div class="card-body">';
    h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Categoria</th><th>Productos</th><th>Frascos</th><th>Pala (grs)</th></tr></thead><tbody>';
    for (var ci = 0; ci < catArr.length; ci++) {
      var cd = catMap[catArr[ci]];
      h += '<tr><td class="fw7">' + catArr[ci] + '</td><td>' + cd.productos + '</td><td>' + cd.frascos + '</td><td>' + cd.pala.toLocaleString() + '</td></tr>';
    }
    h += '</tbody></table></div></div></div>';

    // Low stock alerts
    if (stockBajo.length > 0) {
      h += '<div class="card mt-16" style="border-color:var(--yellow)"><div class="card-header"><h3 style="color:var(--yellow)">Alertas de Stock Bajo (' + stockBajo.length + ')</h3></div><div class="card-body">';
      h += '<div class="table-wrap"><table class="est-detail-table"><thead><tr><th>Producto</th><th>Tipo</th><th>Categoria</th><th>Frascos</th><th>Pala</th></tr></thead><tbody>';
      for (var si = 0; si < stockBajo.length; si++) {
        var sb = stockBajo[si];
        h += '<tr><td class="fw7">' + sb.nombre + '</td><td><span class="badge ' + (sb.tipo === 'blend' ? 'badge-blue' : 'badge-gold') + '">' + (sb.tipo === 'blend' ? 'Blend' : 'Especia') + '</span></td><td>' + sb.cat + '</td><td>' + (sb.frascos || '-') + '</td><td>' + (sb.pala ? sb.pala + 'g' : '-') + '</td></tr>';
      }
      h += '</tbody></table></div></div></div>';
    }

    // No stock
    if (sinStock.length > 0) {
      h += '<div class="card mt-16" style="border-color:var(--red)"><div class="card-header"><h3 style="color:var(--red)">Sin Stock (' + sinStock.length + ')</h3></div><div class="card-body">';
      h += '<p class="text-sm text-muted mb-8">';
      for (var ni = 0; ni < sinStock.length; ni++) {
        h += '<span class="badge badge-red mr-4">' + sinStock[ni].nombre + '</span>';
      }
      h += '</p></div></div>';
    }

    el.innerHTML = h;

    // No charts for inventory, no chart cleanup needed
    if (Pages._estCharts) { for (var ci = 0; ci < Pages._estCharts.length; ci++) { try { Pages._estCharts[ci].destroy(); } catch (e) {} } }
    Pages._estCharts = [];
  },

  /* ================================================================
     HELPERS (kept for backward compat)
     ================================================================ */
  _getCurrentEstData: function() {
    var ventas = ArcanoDB.getVentas();
    var pedidos = ArcanoDB.getPedidos();
    var allSales = [];
    for (var vi = 0; vi < ventas.length; vi++) {
      var v = ventas[vi];
      var vItems = [];
      if (v.items) { for (var vi2 = 0; vi2 < v.items.length; vi2++) { var it = v.items[vi2]; vItems.push({ nombre: it.productoNombre || '?', tipo: it.tipo || 'especia', talla: it.talla || 'chico', cantidad: it.cantidad || 0, precio: it.precioUnitario || 0, subtotal: it.subtotal || 0 }); } }
      allSales.push({ fecha: v.fecha || '', creado: v.creado || '', total: v.total || 0, items: vItems, source: 'admin' });
    }
    for (var pi = 0; pi < pedidos.length; pi++) {
      var p = pedidos[pi];
      if (p.estado === 'cancelado') continue;
      var pItems = [];
      if (p.items) { for (var pi2 = 0; pi2 < p.items.length; pi2++) { var pit = p.items[pi2]; pItems.push({ nombre: pit.nombre || '?', tipo: pit.tipo || 'especia', talla: pit.talla || 'chico', cantidad: pit.qty || pit.cantidad || 0, precio: pit.precio || 0, subtotal: pit.subtotal || 0 }); } }
      var pFecha = p.creado ? p.creado.slice(0, 10) : '';
      allSales.push({ fecha: pFecha, creado: p.creado || '', total: p.total || 0, items: pItems, source: 'tienda', cliente: (p.cliente || {}).nombre || '', ciudad: (p.cliente || {}).ciudad || '' });
    }
    allSales.sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    return allSales;
  },

  _renderEstContent: function(data, el) {
    // Redirect to ventas tab for backward compat
    Pages._estTab = 'ventas';
    Pages._renderVentas(data, el);
  },

  /* ================================================================
     TESTING (sandbox)
     ================================================================ */
  renderTesting(container) {
    var db = ArcanoDB.getDB();
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var ventas = ArcanoDB.getVentas();
    var pedidos = ArcanoDB.getPedidos();
    var pdvs = ArcanoDB.getPuntosDeVenta ? ArcanoDB.getPuntosDeVenta() : [];

    var h = '<div style="margin-bottom:16px">' +
      '<h3 style="margin:0 0 4px">Testing y Sandbox</h3>' +
      '<p class="text-muted text-sm">Genera datos de prueba, reinicia stocks y prueba todas las funciones del sistema.</p>' +
      '</div>';

    // Current state
    h += '<div class="card"><div class="card-header"><h3>Estado Actual</h3></div><div class="card-body">';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">';
    h += '<div class="text-center"><div class="fw7" style="font-size:1.3em;color:var(--gold)">' + especias.length + '</div><div class="text-muted text-sm">Especias</div></div>';
    h += '<div class="text-center"><div class="fw7" style="font-size:1.3em;color:var(--blue)">' + blends.length + '</div><div class="text-muted text-sm">Blends</div></div>';
    h += '<div class="text-center"><div class="fw7" style="font-size:1.3em;color:var(--green)">' + ventas.length + '</div><div class="text-muted text-sm">Ventas Admin</div></div>';
    h += '<div class="text-center"><div class="fw7" style="font-size:1.3em">' + pedidos.length + '</div><div class="text-muted text-sm">Pedidos Tienda</div></div>';
    h += '<div class="text-center"><div class="fw7" style="font-size:1.3em">' + pdvs.length + '</div><div class="text-muted text-sm">P. de Venta</div></div>';
    h += '</div></div></div>';

    // Generate test data
    h += '<div class="card mt-16"><div class="card-header"><h3>Generar Datos de Prueba</h3></div><div class="card-body">';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
    h += '<div><label class="text-sm fw7" style="display:block;margin-bottom:4px">Especias</label><input type="number" class="input" id="test-esp" value="8" min="0" max="50"></div>';
    h += '<div><label class="text-sm fw7" style="display:block;margin-bottom:4px">Blends</label><input type="number" class="input" id="test-blend" value="5" min="0" max="50"></div>';
    h += '<div><label class="text-sm fw7" style="display:block;margin-bottom:4px">Ventas Admin</label><input type="number" class="input" id="test-ventas" value="20" min="0" max="200"></div>';
    h += '<div><label class="text-sm fw7" style="display:block;margin-bottom:4px">Pedidos Tienda</label><input type="number" class="input" id="test-pedidos" value="10" min="0" max="100"></div>';
    h += '<div><label class="text-sm fw7" style="display:block;margin-bottom:4px">PDVs</label><input type="number" class="input" id="test-pdvs" value="2" min="0" max="10"></div>';
    h += '<div><label class="text-sm fw7" style="display:block;margin-bottom:4px">Ventas por PDV</label><input type="number" class="input" id="test-pdv-ventas" value="15" min="0" max="100"></div>';
    h += '</div>';
    h += '<div style="margin-top:12px"><label class="text-sm fw7" style="display:block;margin-bottom:4px">Antiguedad (dias)</label>';
    h += '<input type="range" id="test-dias" min="1" max="90" value="30" style="width:100%" oninput="document.getElementById(\'test-dias-val\').textContent=this.value+\' dias\'"><span id="test-dias-val" class="text-sm text-muted">30 dias</span></div>';
    h += '<button class="btn btn-gold btn-block mt-12" onclick="Pages._testGenerarTodo()" style="padding:14px;font-size:1rem;font-weight:700">Generar Todo</button>';
    h += '</div></div>';

    // Individual actions
    h += '<div class="card mt-16"><div class="card-header"><h3>Acciones Individuales</h3></div><div class="card-body">';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
    h += '<button class="btn btn-outline" onclick="Pages._testCrearProductos()">Crear 10 Productos</button>';
    h += '<button class="btn btn-outline" onclick="Pages._testGenerarVentas()">Crear 20 Ventas</button>';
    h += '<button class="btn btn-outline" onclick="Pages._testGenerarPedidos()">Crear 10 Pedidos</button>';
    h += '<button class="btn btn-outline" onclick="Pages._testCrearPDVs()">Crear 2 PDVs</button>';
    h += '<button class="btn btn-outline" onclick="Pages._testAgregarStock()">Agregar Stock PDVs</button>';
    h += '<button class="btn btn-outline" onclick="Pages._testCrearProducciones()">Crear 5 Producciones</button>';
    h += '</div></div></div>';

    // Danger zone
    h += '<div class="card mt-16"><div class="card-header"><h3 style="color:var(--red)">Zona de Peligro</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted mb-12">Estas acciones eliminan datos de forma permanente.</p>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
    h += '<button class="btn btn-outline" style="border-color:var(--red);color:var(--red)" onclick="Pages._testResetStocks()">Reiniciar Stocks a 0</button>';
    h += '<button class="btn btn-outline" style="border-color:var(--red);color:var(--red)" onclick="Pages._testClearVentas()">Borrar Todas las Ventas</button>';
    h += '<button class="btn btn-outline" style="border-color:var(--red);color:var(--red)" onclick="Pages._testClearPedidos()">Borrar Todos los Pedidos</button>';
    h += '<button class="btn btn-red" onclick="Pages._testNuclearReset()">RESET NUCLEAR - Borrar Todo</button>';
    h += '</div></div></div>';

    container.innerHTML = h;
  },

  _testRandomDate: function(d) { var dt = new Date(); dt.setDate(dt.getDate() - Math.floor(Math.random() * d)); return dt.toISOString().slice(0, 10); },

  _testGenerarTodo: function() {
    var esp = Number(document.getElementById('test-esp').value) || 0;
    var blend = Number(document.getElementById('test-blend').value) || 0;
    var vtas = Number(document.getElementById('test-ventas').value) || 0;
    var peds = Number(document.getElementById('test-pedidos').value) || 0;
    var npdv = Number(document.getElementById('test-pdvs').value) || 0;
    var pv = Number(document.getElementById('test-pdv-ventas').value) || 0;
    var dias = Number(document.getElementById('test-dias').value) || 30;
    Pages._testCrearProductosN(esp, blend);
    Pages._testGenerarVentasN(vtas, dias);
    Pages._testGenerarPedidosN(peds, dias);
    Pages._testCrearPDVsN(npdv, pv, dias);
    Pages._testCrearProduccionesN(5, dias);
    toast('Datos de prueba generados! Revisa Dashboard, Ventas, P.Venta y Stats.');
  },

  _testCrearProductos: function() { Pages._testCrearProductosN(6, 4); toast('Productos creados'); },

  _testCrearProductosN: function(nEsp, nBlend) {
    var nms = ['Canela','Curcuma','Pimienta Negra','Comino','Oregano','Clavo','Nuez Moscada','Jengibre','Cacao','Vanilla','Cardamomo','Cilantro','Paprika','Azafran','Laurel','Tomillo','Romero','Salvia','Hinojo','Anis'];
    var cats = ['Especias','Dulces','Saladas','Exoticas'];
    for (var i = 0; i < nEsp; i++) {
      var nm = nms[i % nms.length] + (i >= nms.length ? ' ' + Math.ceil((i+1)/nms.length) : '');
      var pc = Math.floor(Math.random() * 8000 + 3000);
      ArcanoDB.saveEspecia({ nombre: nm, categoria: cats[i % cats.length], precioChico: pc, precioGrande: Math.floor(pc * 1.7), stockBolsa: Math.floor(Math.random() * 500 + 100), stockChico: Math.floor(Math.random() * 15 + 2), stockGrande: Math.floor(Math.random() * 10 + 1), enTienda: Math.random() > 0.3 });
    }
    var nmsB = ['Arcano Mix','Fuego Interior','Dulce Despertar','Noche Estelar','Camino Sagrado','Raiz Ancestral','Brisa Otono','Sol Naciente','Luna Llena','Tierra Fertil'];
    for (var j = 0; j < nBlend; j++) {
      var nb = nmsB[j % nmsB.length] + (j >= nmsB.length ? ' ' + Math.ceil((j+1)/nmsB.length) : '');
      var pb = Math.floor(Math.random() * 12000 + 5000);
      ArcanoDB.saveBlend({ nombre: nb, categoria: 'Blends', precioChico: pb, precioGrande: Math.floor(pb * 1.6), stockChico: Math.floor(Math.random() * 12 + 2), stockGrande: Math.floor(Math.random() * 8 + 1), enTienda: Math.random() > 0.3 });
    }
  },

  _testGenerarVentas: function() { Pages._testGenerarVentasN(20, 30); toast('Ventas creadas'); },

  _testGenerarVentasN: function(count, dias) {
    var esp = ArcanoDB.getEspecias(), bl = ArcanoDB.getBlends();
    var all = [].concat(esp.map(function(e){return{tipo:'especia',id:e.id,pc:e.precioChico,pg:e.precioGrande};}), bl.map(function(b){return{tipo:'blend',id:b.id,pc:b.precioChico,pg:b.precioGrande};}));
    if (!all.length) { toast('Crea productos primero','err'); return; }
    for (var v = 0; v < count; v++) {
      var nI = Math.floor(Math.random() * 3) + 1, items = [];
      for (var it = 0; it < nI; it++) {
        var pr = all[Math.floor(Math.random() * all.length)];
        var tl = Math.random() > 0.4 ? 'chico' : 'grande', cn = Math.floor(Math.random() * 3) + 1;
        var pu = tl === 'grande' ? pr.pg : pr.pc;
        items.push({ tipo: pr.tipo, productoId: pr.id, talla: tl, cantidad: cn, precioUnitario: pu, subtotal: pu * cn });
      }
      var tot = 0; for (var t = 0; t < items.length; t++) tot += items[t].subtotal;
      ArcanoDB.saveVenta({ fecha: Pages._testRandomDate(dias), items: items, total: tot, metodoPago: Math.random() > 0.5 ? 'efectivo' : 'qr' });
    }
  },

  _testGenerarPedidos: function() { Pages._testGenerarPedidosN(10, 30); toast('Pedidos creados'); },

  _testGenerarPedidosN: function(count, dias) {
    var esp = ArcanoDB.getEspecias(), bl = ArcanoDB.getBlends();
    var all = [].concat(esp, bl);
    if (!all.length) { toast('Crea productos primero','err'); return; }
    var ests = ['nuevo','confirmado','preparando','enviado','entregado'];
    for (var i = 0; i < count; i++) {
      var nI = Math.floor(Math.random() * 3) + 1, items = [];
      for (var it = 0; it < nI; it++) {
        var pr = all[Math.floor(Math.random() * all.length)];
        var tl = Math.random() > 0.4 ? 'chico' : 'grande', cn = Math.floor(Math.random() * 2) + 1;
        var pu = tl === 'grande' ? (pr.precioGrande||0) : (pr.precioChico||0);
        items.push({ tipo: pr.tipo||'especia', productoId: pr.id, productoNombre: pr.nombre, talla: tl, cantidad: cn, precioUnitario: pu, subtotal: pu * cn });
      }
      var tot = 0; for (var t = 0; t < items.length; t++) tot += items[t].subtotal;
      ArcanoDB.savePedido({ nombre: 'Cliente Test ' + (i+1), telefono: '300' + Math.floor(Math.random()*9000000+1000000), direccion: 'Calle Test #' + (i+1), items: items, total: tot, estado: ests[Math.min(Math.floor(Math.random()*ests.length), ests.length-1)], creado: new Date(Date.now() - Math.floor(Math.random()*dias*86400000)).toISOString() });
    }
  },

  _testCrearPDVs: function() { Pages._testCrearPDVsN(2, 15, 30); toast('PDVs creados'); },

  _testCrearPDVsN: function(count, vp, dias) {
    var locs = ['Feria Central','Plaza Principal','Mercado Municipal','Centro Comercial','Parque Norte'];
    var existentes = ArcanoDB.getPuntosDeVenta ? ArcanoDB.getPuntosDeVenta() : [];
    for (var p = 0; p < count; p++) {
      var pdv = ArcanoDB.savePuntoDeVenta({ nombre: 'PDV Test ' + (existentes.length + p + 1), ubicacion: locs[p % locs.length], activo: true });
      var esp = ArcanoDB.getEspecias(), bl = ArcanoDB.getBlends();
      var all = [].concat(esp.map(function(e){return{tipo:'especia',id:e.id,pc:e.precioChico,pg:e.precioGrande};}), bl.map(function(b){return{tipo:'blend',id:b.id,pc:b.precioChico,pg:b.precioGrande};}));
      var si = [];
      for (var s = 0; s < Math.min(8, all.length); s++) {
        var pr = all[Math.floor(Math.random() * all.length)];
        si.push({ tipo: pr.tipo, productoId: pr.id, talla: 'chico', cantidad: Math.floor(Math.random()*5)+2 });
      }
      try { ArcanoDB.moverStockAPDV(pdv.id, si); } catch(e) {}
      for (var v = 0; v < vp; v++) {
        var nI = Math.floor(Math.random()*2)+1, items = [];
        for (var it = 0; it < nI; it++) {
          var pr2 = all[Math.floor(Math.random()*all.length)];
          var cn2 = Math.floor(Math.random()*2)+1;
          items.push({ tipo: pr2.tipo, productoId: pr2.id, talla: 'chico', cantidad: cn2, precioUnitario: pr2.pc, subtotal: pr2.pc*cn2 });
        }
        ArcanoDB.savePDVVenta({ puntoDeVentaId: pdv.id, fecha: Pages._testRandomDate(dias), items: items, metodoPago: Math.random()>0.5?'efectivo':'qr' });
      }
    }
  },

  _testAgregarStock: function() {
    var pdvs = ArcanoDB.getPuntosDeVenta ? ArcanoDB.getPuntosDeVenta() : [];
    if (!pdvs.length) { toast('Crea PDVs primero','err'); return; }
    var esp = ArcanoDB.getEspecias(), bl = ArcanoDB.getBlends();
    var all = [].concat(esp.map(function(e){return{tipo:'especia',id:e.id};}), bl.map(function(b){return{tipo:'blend',id:b.id};}));
    for (var p = 0; p < pdvs.length; p++) {
      var items = [];
      for (var s = 0; s < Math.min(6,all.length); s++) {
        var pr = all[Math.floor(Math.random()*all.length)];
        items.push({ tipo: pr.tipo, productoId: pr.id, talla: 'chico', cantidad: Math.floor(Math.random()*5)+3 });
      }
      try { ArcanoDB.moverStockAPDV(pdvs[p].id, items); } catch(e) {}
    }
    toast('Stock agregado a ' + pdvs.length + ' PDVs');
  },

  _testCrearProducciones: function() { Pages._testCrearProduccionesN(5, 30); toast('Producciones creadas'); },

  _testCrearProduccionesN: function(count, dias) {
    var esp = ArcanoDB.getEspecias(), bl = ArcanoDB.getBlends();
    var all = [].concat(esp, bl);
    if (!all.length) { toast('Crea productos primero','err'); return; }
    for (var i = 0; i < count; i++) {
      var pr = all[Math.floor(Math.random()*all.length)];
      ArcanoDB.saveProduccion({ tipo: pr.tipo||'especia', productoId: pr.id, fecha: Pages._testRandomDate(dias), cantidad: Math.floor(Math.random()*20)+5, frascosChico: Math.floor(Math.random()*10)+2, frascosGrande: Math.floor(Math.random()*5)+1 });
    }
  },

  _testResetStocks: function() {
    if (!confirm('Reiniciar todos los stocks a 0?')) return;
    var esp = ArcanoDB.getEspecias(), bl = ArcanoDB.getBlends();
    for (var i = 0; i < esp.length; i++) ArcanoDB.saveEspecia({ id: esp[i].id, stockBolsa: 0, stockChico: 0, stockGrande: 0 });
    for (var j = 0; j < bl.length; j++) ArcanoDB.saveBlend({ id: bl[j].id, stockChico: 0, stockGrande: 0 });
    toast('Stocks reiniciados a 0'); App.renderPage('testing');
  },

  _testClearVentas: function() {
    if (!confirm('Borrar TODAS las ventas (admin y PDV)?')) return;
    var v = ArcanoDB.getVentas();
    for (var i = 0; i < v.length; i++) ArcanoDB.deleteVenta(v[i].id);
    var pdvs = ArcanoDB.getPuntosDeVenta ? ArcanoDB.getPuntosDeVenta() : [];
    for (var p = 0; p < pdvs.length; p++) pdvs[p].ventas = {};
    try { firebase.database().ref('arcano').remove(); } catch(e) {}
    localStorage.clear();
    toast('Ventas eliminadas'); App.renderPage('testing');
  },

  _testClearPedidos: function() {
    if (!confirm('Borrar TODOS los pedidos?')) return;
    var p = ArcanoDB.getPedidos();
    for (var i = 0; i < p.length; i++) ArcanoDB.deletePedido(p[i].id);
    toast('Pedidos eliminados'); App.renderPage('testing');
  },

  _testNuclearReset: function() {
    if (!confirm('RESET NUCLEAR: Se borrarán TODOS los datos. Continuar?')) return;
    if (!confirm('Estas SEGURO? Se perderán productos, ventas, pedidos, PDVs, todo.')) return;
    try { firebase.database().ref('arcano').remove(); } catch(e) {}
    localStorage.clear();
    toast('Reset completo. Recargando...');
    setTimeout(function() { location.reload(); }, 1500);
  },

  /* ================================================================
     COSTOS POR CANAL DE VENTA
     ================================================================ */
  _renderCostosPorCanal: function(el) {
    if (!el) return;
    var channels = ArcanoDB.getCostosPorCanal();
    var canalKeys = ['admin', 'tienda', 'pdv'];
    var canalNombres = { admin: 'Ventas Admin', tienda: 'Tienda Online', pdv: 'Puntos de Venta' };
    var canalColores = { admin: 'var(--gold)', tienda: 'var(--green)', pdv: 'var(--blue)' };

    var h = '';

    // === RESUMEN GENERAL ===
    var totalIngreso = 0, totalCosto = 0, totalStockCosto = 0;
    for (var ci = 0; ci < canalKeys.length; ci++) {
      var ch = channels[canalKeys[ci]];
      totalIngreso += ch.ingreso;
      totalCosto += ch.costo;
      totalStockCosto += (ch.stockCosto || 0);
    }
    var totalMargen = totalIngreso - totalCosto;
    var totalMargenPct = totalIngreso > 0 ? (totalMargen / totalIngreso * 100) : 0;

    h += '<div class="card"><div class="card-header"><h3>Resumen General</h3></div><div class="card-body">';
    h += '<div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">';
    h += '<div class="stat-card"><div class="stat-value">$' + totalIngreso.toLocaleString() + '</div><div class="stat-label">Ingreso Total</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--red)"><div class="stat-value" style="color:var(--red)">$' + totalCosto.toLocaleString() + '</div><div class="stat-label">Costo Produccion</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value" style="color:var(--green)">$' + totalMargen.toLocaleString() + '</div><div class="stat-label">Margen ($' + totalMargenPct.toFixed(1) + '%)</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value" style="color:var(--blue)">$' + totalStockCosto.toLocaleString() + '</div><div class="stat-label">Costo Stock Actual</div></div>';
    h += '</div></div></div>';

    // === POR CADA CANAL ===
    for (var ci2 = 0; ci2 < canalKeys.length; ci2++) {
      var key = canalKeys[ci2];
      var c = channels[key];
      var clr = canalColores[key];
      var margen = c.ingreso - c.costo;
      var margenPct = c.ingreso > 0 ? (margen / c.ingreso * 100) : 0;

      h += '<div class="card mt-16"><div class="card-header"><h3 style="color:' + clr + '">' + canalNombres[key] + '</h3></div><div class="card-body">';

      // KPIs del canal
      h += '<div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">';
      h += '<div class="stat-card"><div class="stat-value">' + c.ventas + '</div><div class="stat-label">Ventas</div></div>';
      h += '<div class="stat-card"><div class="stat-value">$' + c.ingreso.toLocaleString() + '</div><div class="stat-label">Ingreso</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--red)"><div class="stat-value" style="color:var(--red)">$' + c.costo.toLocaleString() + '</div><div class="stat-label">Costo Prod.</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value" style="color:' + (margen >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + margen.toLocaleString() + '</div><div class="stat-label">Margen (' + margenPct.toFixed(1) + '%)</div></div>';
      h += '</div>';

      // Tabla de productos vendidos
      var prodKeys = Object.keys(c.productos || {});
      if (prodKeys.length > 0) {
        h += '<h4 style="margin:16px 0 8px;font-size:.95rem">Costos de Productos Vendidos</h4>';
        h += '<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Tipo</th><th>Talla</th><th>Cant.</th><th>Ingreso</th><th>Costo Prod.</th><th>Margen</th></tr></thead><tbody>';
        for (var pi = 0; pi < prodKeys.length; pi++) {
          var pr = c.productos[prodKeys[pi]];
          var prMargen = pr.ingreso - pr.costo;
          h += '<tr><td class="fw7">' + pr.nombre + '</td>';
          h += '<td><span class="badge ' + (pr.tipo === 'blend' ? 'badge-blue' : 'badge-gold') + '">' + (pr.tipo === 'blend' ? 'Blend' : 'Especia') + '</span></td>';
          h += '<td>' + pr.talla + '</td>';
          h += '<td class="fw7">' + pr.cantidad + '</td>';
          h += '<td>$' + pr.ingreso.toLocaleString() + '</td>';
          h += '<td style="color:var(--red)">$' + pr.costo.toLocaleString() + '</td>';
          h += '<td style="color:' + (prMargen >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + prMargen.toLocaleString() + '</td></tr>';
        }
        h += '</tbody></table></div>';
      } else {
        h += '<p class="text-muted text-center" style="margin-top:12px">Sin ventas registradas en este canal.</p>';
      }

      // PDV desglose por punto de venta
      if (key === 'pdv' && c.pdvs) {
        var pdvKeys = Object.keys(c.pdvs);
        if (pdvKeys.length > 0) {
          h += '<h4 style="margin:20px 0 8px;font-size:.95rem">Desglose por Punto de Venta</h4>';
          for (var pk = 0; pk < pdvKeys.length; pk++) {
            var pv = c.pdvs[pdvKeys[pk]];
            var pvMargen = pv.ingreso - pv.costo;
            h += '<div class="card" style="background:var(--bg);margin-bottom:8px"><div class="card-body">';
            h += '<div class="fw7" style="margin-bottom:8px;color:var(--blue)">' + pdvKeys[pk] + '</div>';
            h += '<div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">';
            h += '<div class="stat-card"><div class="stat-value">' + pv.ventas + '</div><div class="stat-label">Ventas</div></div>';
            h += '<div class="stat-card"><div class="stat-value">$' + pv.ingreso.toLocaleString() + '</div><div class="stat-label">Ingreso</div></div>';
            h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value" style="color:' + (pvMargen >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + pvMargen.toLocaleString() + '</div><div class="stat-label">Margen</div></div>';
            h += '</div>';
            // Productos del PDV
            var pvProdKeys = Object.keys(pv.productos || {});
            if (pvProdKeys.length > 0) {
              h += '<div class="table-wrap" style="margin-top:8px"><table class="table"><thead><tr><th>Producto</th><th>Talla</th><th>Cant.</th><th>Ingreso</th><th>Costo</th><th>Margen</th></tr></thead><tbody>';
              for (var ppk = 0; ppk < pvProdKeys.length; ppk++) {
                var ppr = pv.productos[pvProdKeys[ppk]];
                var pprM = ppr.ingreso - ppr.costo;
                h += '<tr><td>' + ppr.nombre + '</td><td>' + ppr.talla + '</td><td>' + ppr.cantidad + '</td><td>$' + ppr.ingreso.toLocaleString() + '</td><td style="color:var(--red)">$' + ppr.costo.toLocaleString() + '</td><td style="color:' + (pprM >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + pprM.toLocaleString() + '</td></tr>';
              }
              h += '</tbody></table></div>';
            }
            h += '</div></div>';
          }
        }
      }

      // Stock del canal
      var stockItems = c.stockDetalle || [];
      if (stockItems.length > 0) {
        h += '<h4 style="margin:20px 0 8px;font-size:.95rem">Costo de Stock Actual</h4>';
        h += '<div class="table-wrap"><table class="table"><thead><tr>';
        if (key === 'pdv') {
          h += '<th>Punto de Venta</th><th>Costo Total en Stock</th>';
        } else {
          h += '<th>Producto</th><th>Tipo</th><th>Fr.Ch (cant)</th><th>Fr.Gr (cant)</th><th>Costo/Fr.Ch</th><th>Costo/Fr.Gr</th><th>Costo Total</th>';
        }
        h += '</tr></thead><tbody>';
        var stockTotal = 0;
        for (var si = 0; si < stockItems.length; si++) {
          var s = stockItems[si];
          stockTotal += s.costoTotal;
          if (key === 'pdv') {
            h += '<tr><td class="fw7">' + s.nombre + '</td><td style="color:var(--red);font-weight:700">$' + s.costoTotal.toLocaleString() + '</td></tr>';
          } else {
            h += '<tr><td class="fw7">' + s.nombre + '</td>';
            h += '<td><span class="badge ' + (s.tipo === 'blend' ? 'badge-blue' : 'badge-gold') + '">' + (s.tipo === 'blend' ? 'Blend' : 'Especia') + '</span></td>';
            h += '<td>' + s.chico + '</td><td>' + s.grande + '</td>';
            h += '<td>$' + s.costoChico.toFixed(0) + '</td><td>$' + s.costoGrande.toFixed(0) + '</td>';
            h += '<td style="color:var(--red);font-weight:700">$' + s.costoTotal.toLocaleString() + '</td></tr>';
          }
        }
        h += '<tr style="border-top:2px solid var(--border)"><td colspan="6" class="fw7" style="text-align:right">Total Stock</td><td style="color:var(--red);font-weight:700">$' + stockTotal.toLocaleString() + '</td></tr>';
        h += '</tbody></table></div>';
      } else {
        h += '<p class="text-muted text-center" style="margin-top:12px">Sin stock en este canal.</p>';
      }

      h += '</div></div>';
    }

    el.innerHTML = h;
  }
};
/* ==================== GRANDES CLIENTES ==================== */
Pages.renderGrandesClientes = function(el) {
  var list = ArcanoDB.getGrandesClientes();
  var nuevos = 0;
  for (var i = 0; i < list.length; i++) { if (list[i].estado === 'nuevo') nuevos++; }
  // Update nav badge
  var navBadge = document.getElementById('nav-grandesClientes');
  if (navBadge) {
    var existing = navBadge.querySelector('.nav-badge');
    if (existing) existing.remove();
    if (nuevos > 0) {
      var badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = nuevos;
      navBadge.appendChild(badge);
    }
  }
  var h = '<div class="page-header"><h2>Grandes Clientes</h2>';
  if (nuevos > 0) h += '<span class="badge badge-red" style="font-size:0.9rem">' + nuevos + ' nuevos</span>';
  h += '</div>';
  if (list.length === 0) { h += '<p class="empty-msg">Sin solicitudes de grandes clientes</p>'; el.innerHTML = h; return; }
  h += '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Nombre</th><th>Telefono</th><th>Empresa</th><th>Estado</th><th></th></tr></thead><tbody>';
  for (var j = 0; j < list.length; j++) {
    var g = list[j];
    var estadoColor = g.estado === 'nuevo' ? 'var(--red)' : (g.estado === 'contactado' ? 'var(--gold)' : 'var(--green)');
    var estadoBg = g.estado === 'nuevo' ? 'rgba(220,50,50,0.1)' : (g.estado === 'contactado' ? 'rgba(196,148,58,0.1)' : 'rgba(50,150,50,0.1)');
    var fecha = g.creado ? new Date(g.creado).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) : '-';
    h += '<tr><td style="white-space:nowrap">' + fecha + '</td><td><strong>' + esc(g.nombre || '') + '</strong></td><td>' + esc(g.telefono || '') + '</td><td>' + esc(g.empresa || '-') + '</td>';
    h += '<td><span style="display:inline-block;padding:2px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;background:' + estadoBg + ';color:' + estadoColor + '">' + esc(g.estado || 'nuevo') + '</span></td>';
    h += '<td style="white-space:nowrap">';
    if (g.estado === 'nuevo') h += '<button class="btn btn-ghost btn-sm" onclick="ArcanoDB.updateGCEstado(\'' + g._key + '\',\'contactado\');App.renderPage(\'grandesClientes\')">Contactado</button> ';
    if (g.estado === 'contactado') h += '<button class="btn btn-ghost btn-sm" onclick="ArcanoDB.updateGCEstado(\'' + g._key + '\',\'cerrado\');App.renderPage(\'grandesClientes\')">Cerrado</button> ';
    if (g.estado !== 'descartado') h += '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ArcanoDB.updateGCEstado(\'' + g._key + '\',\'descartado\');App.renderPage(\'grandesClientes\')">Descartar</button>';
    if (g.estado === 'descartado') h += '<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="ArcanoDB.deleteGC(\'' + g._key + '\');App.renderPage(\'grandesClientes\')">Eliminar</button>';
    h += '</td></tr>';
  }
  h += '</tbody></table></div>';
  el.innerHTML = h;
};

function _saveBlendPrecios() {
  var chico = parseInt(document.getElementById('blend-precio-chico').value, 10) || 0;
  var grande = parseInt(document.getElementById('blend-precio-grande').value, 10) || 0;
  writeField('tiendaConfig/precioBlendChico', chico);
  writeField('tiendaConfig/precioBlendGrande', grande);
  toast('Precios de Tu Blend guardados');
}

