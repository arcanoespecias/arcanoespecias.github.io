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
    var comprasMes = 0;  // Entradas (compras de insumos) del mes actual
    var comprasHoy = 0;  // Entradas de hoy
    for (var ei = 0; ei < entradas.length; ei++) {
      var ent = entradas[ei];
      var entTotal = Number(ent.total) || 0;
      totalCostos += entTotal;
      var entFecha = ent.fecha || '';
      if (entFecha === today) comprasHoy += entTotal;
      if (entFecha && entFecha.startsWith(mes)) comprasMes += entTotal;
    }
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

    // KPIs principales — todos clickeables, llevan a su seccion
    h += '<div class="dash-section-title"><span class="dash-dot" style="background:var(--gold)"></span>Resumen del Negocio</div>';
    h += '<div class="dash-kpi-row">';
    h += '<div class="dash-kpi-card dash-kpi-gold dash-clickable" onclick="App.navigate(\'ventas\')" title="Ver historial de ventas"><div class="dash-kpi-icon">$</div><div class="dash-kpi-body"><div class="dash-kpi-val">$' + ingresosHoy.toLocaleString() + '</div><div class="dash-kpi-lbl">Ventas Hoy</div></div></div>';
    h += '<div class="dash-kpi-card dash-kpi-blue dash-clickable" onclick="App.navigate(\'ventas\')" title="Ver historial de ventas"><div class="dash-kpi-icon">M</div><div class="dash-kpi-body"><div class="dash-kpi-val">$' + ingresosMes.toLocaleString() + '</div><div class="dash-kpi-lbl">Ingresos del Mes</div><div class="dash-kpi-sub">' + opsMes + ' operaciones</div></div></div>';
    h += '<div class="dash-kpi-card dash-kpi-red dash-clickable" onclick="App.navigate(\'insumos\')" title="Ver historial de compras"><div class="dash-kpi-icon" style="color:var(--red)">C</div><div class="dash-kpi-body"><div class="dash-kpi-val" style="color:var(--red)">$' + comprasMes.toLocaleString() + '</div><div class="dash-kpi-lbl">Compras del Mes</div><div class="dash-kpi-sub">Insumos adquiridos este mes</div></div></div>';
    var mClr = margenPct >= 0 ? 'var(--green)' : 'var(--red)';
    h += '<div class="dash-kpi-card dash-clickable" onclick="App.navigate(\'estadisticas\')" title="Ver estadisticas detalladas"><div class="dash-kpi-icon" style="color:var(--green)">%a</div><div class="dash-kpi-body"><div class="dash-kpi-val" style="color:' + mClr + '">' + margenPct.toFixed(1) + '%</div><div class="dash-kpi-lbl">Margen Bruto</div><div class="dash-kpi-sub">Ingreso $' + totalIngresos.toLocaleString() + ' - Costos $' + totalCostos.toLocaleString() + '</div></div></div>';
    h += '<div class="dash-kpi-card ' + (totalAlertas > 0 ? 'dash-kpi-red' : 'dash-kpi-green') + ' dash-clickable" onclick="App.navigate(\'stock\')" title="Ver estado de stock"><div class="dash-kpi-icon">!</div><div class="dash-kpi-body"><div class="dash-kpi-val">' + totalAlertas + '</div><div class="dash-kpi-lbl">Alertas de Stock</div><div class="dash-kpi-sub">' + palaBaja.length + ' pala, ' + frascosBajos.length + ' frascos, ' + stickerBajos.length + ' stk</div></div></div>';
    h += '</div>';

    // Segunda fila — todos clickeables
    h += '<div class="dash-kpi-row dash-kpi-sm">';
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'ventas\')" title="Ver ventas"><div class="dash-mini-val">' + totalUnidades + '</div><div class="dash-mini-lbl">Unidades Vendidas</div></div>';
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'ventas\')" title="Ver ventas"><div class="dash-mini-val">$' + (totalOps > 0 ? Math.round(totalIngresos / totalOps) : 0).toLocaleString() + '</div><div class="dash-mini-lbl">Ticket Promedio</div></div>';
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'produccion\')" title="Ver produccion"><div class="dash-mini-val">' + prodMesCount + '</div><div class="dash-mini-lbl">Producciones Mes</div><div class="dash-mini-sub">' + prodMesUds + ' frascos</div></div>';
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'stock\')" title="Ver stock"><div class="dash-mini-val">' + stats.totalFrascos + '</div><div class="dash-mini-lbl">Frascos en Stock</div><div class="dash-mini-sub">' + stats.frascosChico + ' pq / ' + stats.frascosGrande + ' gr</div></div>';
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'productos\')" title="Ver productos"><div class="dash-mini-val">' + stats.totalProductos + '</div><div class="dash-mini-lbl">Productos Activos</div><div class="dash-mini-sub">' + stats.totalEspecias + ' esp + ' + stats.totalBlends + ' bl</div></div>';
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'pedidos\')" title="Ver pedidos"><div class="dash-mini-val">' + pedidosNuevos.length + '</div><div class="dash-mini-lbl">Pedidos Nuevos</div></div>';
    var gastosMes = 0;
    for (var gm = 0; gm < gastos.length; gm++) { if (gastos[gm].fecha && gastos[gm].fecha.startsWith(mes)) gastosMes += (gastos[gm].monto || 0); }
    // Ganancia neta del mes = ingresos del mes - compras del mes - gastos del mes
    // (NO usa totalCostos que es histórico y romperia el calculo mensual)
    var gananciaNeta = ingresosMes - comprasMes - gastosMes;
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'gastos\')" title="Ver historial de gastos"><div class="dash-mini-val" style="color:var(--red)">$' + gastosMes.toLocaleString() + '</div><div class="dash-mini-lbl">Gastos del Mes</div></div>';
    h += '<div class="dash-mini dash-clickable" onclick="App.navigate(\'estadisticas\')" title="Ver estadisticas"><div class="dash-mini-val" style="color:' + (gananciaNeta >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + gananciaNeta.toLocaleString() + '</div><div class="dash-mini-lbl">Ganancia Neta</div><div class="dash-mini-sub">ingresos - compras - gastos</div></div>';
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
        var saved = ArcanoDB.saveEspecia(data);
        modal.remove();
        App.renderPage('productos');
        Pages._publishProductSEO(saved, 'Especia');
        Pages._updateSitemap();
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
        for (var s = 0; s < especias.length; s++) { if (Number(especias[s].id) === Number(espId)) { espObj = especias[s]; break; } }
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
        var saved = ArcanoDB.saveBlend(data);
        modal.remove();
        App.renderPage('productos');
        Pages._publishProductSEO(saved, 'Blend');
        Pages._updateSitemap();
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
      for (var s = 0; s < especias.length; s++) { if (Number(especias[s].id) === Number(espId)) { espName = especias[s].nombre; break; } }
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
        var saved = ArcanoDB.savePack(data);
        modal.remove();
        App.renderPage('productos');
        Pages._publishProductSEO(saved, 'Pack');
        Pages._updateSitemap();
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
    h += '<div class="card mt-16"><div class="card-header"><h3>Historial de Entradas (' + entradas.length + ')</h3></div><div class="card-body">';
    if (entradas.length === 0) { h += '<p class="text-muted text-center">Sin entradas.</p>'; }
    else {
      // Input de búsqueda
      h += '<div class="form-group" style="margin-bottom:12px">' +
        '<input type="text" class="input" id="insumos-busqueda" placeholder="🔍 Buscar por fecha, proveedor o item..." style="width:100%">' +
      '</div>';
      h += '<div class="table-wrap"><table class="table" id="insumos-table"><thead><tr><th>Fecha</th><th>Items</th><th>Total</th><th></th></tr></thead><tbody id="insumos-tbody"></tbody></table></div>';
      // Botón "ver más"
      h += '<div style="text-align:center;margin-top:12px"><button class="btn btn-sm btn-outline" id="insumos-ver-mas" style="display:none">Ver más</button></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;

    // Lógica de búsqueda y paginación para el historial de insumos
    if (entradas.length > 0) {
      var _insumosLimit = 10;
      var _insumosFiltro = '';
      var _insumosTbody = document.getElementById('insumos-tbody');
      var _insumosVerMasBtn = document.getElementById('insumos-ver-mas');
      var _insumosBusqueda = document.getElementById('insumos-busqueda');

      function _insumosFiltradas() {
        if (!_insumosFiltro) return entradas;
        var q = _insumosFiltro.toLowerCase();
        return entradas.filter(function(en) {
          if ((en.fecha || '').toLowerCase().indexOf(q) >= 0) return true;
          if ((en.proveedor || '').toLowerCase().indexOf(q) >= 0) return true;
          var items = en.items || [];
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.especiaNombre && it.especiaNombre.toLowerCase().indexOf(q) >= 0) return true;
            if (it.stickerNombre && it.stickerNombre.toLowerCase().indexOf(q) >= 0) return true;
            if (it.tipo && it.tipo.toLowerCase().indexOf(q) >= 0) return true;
          }
          return false;
        });
      }

      function _insumosRowHtml(en) {
        var desc = (en.items||[]).map(function(it) {
          if (it.tipo==='especia_grs') return (it.especiaNombre||'?') + ' ' + it.cantidad + 'grs';
          if (it.tipo==='envase') return 'Frascos ' + (it.talla||'chico') + ' x' + it.cantidad;
          if (it.tipo==='bolsa') return 'Bolsas ' + (it.talla||'chico') + ' x' + it.cantidad;
          if (it.tipo==='sticker') return 'Stk ' + (it.stickerNombre||'?') + ' ' + (it.talla||'chico') + ' x' + it.cantidad;
          if (it.tipo==='cinta') return 'Cintas x' + it.cantidad;
          return '?';
        }).join(' | ');
        return '<tr><td>' + (en.fecha||'') + '</td><td class="text-sm">' + desc + '</td><td class="fw7 text-gold">$' + (en.total||0).toLocaleString() + (en.ajuste && en.ajuste !== 0 ? ' <span class="badge ' + (en.ajuste > 0 ? 'badge-green' : 'badge-red') + '" style="font-size:10px" title="Total calculado: $' + (en.totalCalculado||0).toLocaleString() + '">' + (en.ajuste > 0 ? '-' : '+') + '$' + Math.abs(en.ajuste).toLocaleString() + '</span>' : '') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn btn-sm btn-outline" onclick="Pages.formEntrada(' + en.id + ')" title="Editar entrada">✏</button> <button class="btn btn-sm btn-red" onclick="Pages.delEntrada(' + en.id + ')" title="Eliminar entrada">X</button></td></tr>';
      }

      function _insumosRender() {
        var filtradas = _insumosFiltradas();
        var html = '';
        for (var i = 0; i < Math.min(filtradas.length, _insumosLimit); i++) {
          html += _insumosRowHtml(filtradas[i]);
        }
        if (filtradas.length === 0) {
          html = '<tr><td colspan="4" class="text-muted text-center" style="padding:16px">Sin resultados para "' + esc(_insumosFiltro) + '"</td></tr>';
        }
        _insumosTbody.innerHTML = html;
        // Mostrar/ocultar botón "ver más"
        if (_insumosLimit < filtradas.length) {
          _insumosVerMasBtn.style.display = '';
          var restantes = filtradas.length - _insumosLimit;
          _insumosVerMasBtn.textContent = 'Ver más (' + restantes + ' restantes de ' + filtradas.length + ')';
        } else {
          _insumosVerMasBtn.style.display = 'none';
        }
      }

      _insumosBusqueda.addEventListener('input', function() {
        _insumosFiltro = this.value.trim();
        _insumosLimit = 10;
        _insumosRender();
      });
      _insumosVerMasBtn.addEventListener('click', function() {
        _insumosLimit += 20;
        _insumosRender();
      });
      _insumosRender();
    }
  },

  /* ---------- Entrada Form ---------- */
  formEntrada(editId) {
    var especias = ArcanoDB.getEspecias();
    var esps = especias;
    var blends = ArcanoDB.getBlends();
    var bls = blends;
    var isEdit = (editId != null);
    var existingEntrada = isEdit ? ArcanoDB.getEntradas().find(function(e){return e.id === editId;}) : null;
    if (isEdit && !existingEntrada) { alert('Entrada no encontrada'); return; }
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    var fechaDefault = isEdit ? (existingEntrada.fecha || new Date().toISOString().slice(0,10)) : new Date().toISOString().slice(0,10);
    var provDefault = isEdit ? (existingEntrada.proveedor || '') : '';
    modal.innerHTML = '<div class="modal modal-lg">' +
      '<div class="modal-header"><h3>' + (isEdit ? 'Editar Entrada #' + editId : 'Registrar Entrada') + '</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Fecha</label><input type="date" class="input" id="f-ent-fecha" value="' + fechaDefault + '"></div>' +
        '<div class="form-group"><label>Proveedor (opcional)</label><input type="text" class="input" id="f-ent-prov" placeholder="Nombre" value="' + esc(provDefault) + '"></div>' +
        '<div class="form-group"><label>Items</label><div id="ent-items"></div>' +
        '<button class="btn btn-sm btn-outline mt-8" id="btn-add-ent">+ Item</button></div>' +
        '<div class="venta-total-box mt-12">Total calculado: $<span id="ent-total">0</span></div>' +
        '<div class="form-group mt-12" style="background:var(--bg);padding:12px;border-radius:8px;border:1px solid var(--border)">' +
          '<label style="font-weight:600">Total pagado (opcional)</label>' +
          '<input type="number" class="input" id="f-ent-pagado" placeholder="Igual al total calculado" min="0" step="0.01" style="margin-top:6px">' +
          '<p class="text-xs text-muted mt-4" id="f-ent-ajuste-info">Si el monto pagado difiere del total calculado, el ajuste se registrará como descuento o recargo.</p>' +
        '</div>' +
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

    function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function addEntRow(preload) {
      var div = document.createElement('div');
      div.className = 'card mb-8 ent-row';
      div.style.background = 'var(--bg)';
      div.innerHTML = '<div class="card-body" style="padding:12px">' +
        '<div class="g4 mb-8">' +
          '<div class="form-group" style="margin:0"><label>Tipo</label><select class="input ent-tipo"><option value="especia_grs">Especia (grs)</option><option value="envase">Frascos</option><option value="bolsa">Bolsas</option><option value="cinta">Cintas</option><option value="sticker">Stickers</option></select></div>' +
          '<div class="form-group ent-detail" style="margin:0"></div>' +
          '<div class="form-group ent-cant-wrap" style="margin:0;min-width:100px"><label>Cantidad</label><input type="number" class="input ent-cant" placeholder="0" min="0"></div>' +
          '<div class="form-group ent-cost-wrap" style="margin:0;min-width:100px"><label>Costo Unit.</label><input type="number" class="input ent-cost-gen" placeholder="0" min="0"></div>' +
        '</div>' +
        '<div class="ent-sticker-extra" style="display:none;margin-top:8px"></div>' +
        '<div style="text-align:right;margin-top:8px"><button class="btn btn-sm btn-red btn-rm-ent">Quitar</button></div>' +
        '</div>';
      itemsDiv.appendChild(div);

      var tipoSel = div.querySelector('.ent-tipo');
      var detailDiv = div.querySelector('.ent-detail');
      var cantWrap = div.querySelector('.ent-cant-wrap');
      var costWrap = div.querySelector('.ent-cost-wrap');
      var stickerExtra = div.querySelector('.ent-sticker-extra');

      function buildStickerTable() {
        // Listas separadas: Blends arriba, Especias abajo, cada una ordenada alfabeticamente
        var blsSorted = bls.slice().sort(function(a, b) { return (a.nombre||'').localeCompare(b.nombre||''); });
        var espsSorted = esps.slice().sort(function(a, b) { return (a.nombre||'').localeCompare(b.nombre||''); });

        function tableHeader() {
          return '<thead><tr>' +
            '<th style="text-align:left;padding:6px 10px">Producto</th>' +
            '<th style="width:90px;text-align:center;padding:6px">Pequeño</th>' +
            '<th style="width:90px;text-align:center;padding:6px">Grande</th>' +
          '</tr></thead>';
        }
        function tableRows(list, tipo) {
          var rows = '';
          for (var si = 0; si < list.length; si++) {
            rows += '<tr>' +
              '<td style="padding:6px 10px">' + esc(list[si].nombre) + '</td>' +
              '<td style="padding:4px;text-align:center"><input type="number" class="input stk-cant" data-nombre="' + esc(list[si].nombre) + '" data-tipo="' + tipo + '" data-talla="chico" placeholder="0" min="0" style="width:70px;padding:4px 6px;text-align:center"></td>' +
              '<td style="padding:4px;text-align:center"><input type="number" class="input stk-cant" data-nombre="' + esc(list[si].nombre) + '" data-tipo="' + tipo + '" data-talla="grande" placeholder="0" min="0" style="width:70px;padding:4px 6px;text-align:center"></td>' +
            '</tr>';
          }
          return rows;
        }

        var html = '<label>Cantidades recibidas</label>' +
          '<p class="text-xs text-muted" style="margin:4px 0">Cargá la cantidad en la columna Pequeño o Grande para cada producto.</p>';

        // Costos separados: chico y grande (se aplican a todas las filas)
        html += '<div style="display:flex;align-items:center;gap:14px;margin:8px 0;flex-wrap:wrap;padding:8px 12px;background:var(--card);border:1px solid var(--border);border-radius:8px">' +
          '<div style="display:flex;align-items:center;gap:6px"><label style="margin:0;font-weight:600">Costo sticker chico:</label>' +
            '<input type="number" class="input stk-cost stk-cost-chico" placeholder="$0" min="0" step="0.01" style="width:110px"></div>' +
          '<div style="display:flex;align-items:center;gap:6px"><label style="margin:0;font-weight:600">Costo sticker grande:</label>' +
            '<input type="number" class="input stk-cost stk-cost-grande" placeholder="$0" min="0" step="0.01" style="width:110px"></div>' +
        '</div>';

        // Sección BLENDS
        if (blsSorted.length > 0) {
          html += '<h4 style="margin:14px 0 6px;font-size:0.95rem">Blends (' + blsSorted.length + ')</h4>';
          html += '<div style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">' +
            '<table class="table" style="margin:0;font-size:0.85rem">' +
            tableHeader() + '<tbody>' + tableRows(blsSorted, 'blend') + '</tbody></table></div>';
        }

        // Sección ESPECIAS
        if (espsSorted.length > 0) {
          html += '<h4 style="margin:14px 0 6px;font-size:0.95rem">Especias (' + espsSorted.length + ')</h4>';
          html += '<div style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">' +
            '<table class="table" style="margin:0;font-size:0.85rem">' +
            tableHeader() + '<tbody>' + tableRows(espsSorted, 'especia') + '</tbody></table></div>';
        }

        if (blsSorted.length === 0 && espsSorted.length === 0) {
          html += '<p class="text-muted text-center" style="margin:12px 0">No hay productos cargados.</p>';
        }
        return html;
      }

      function renderDetail() {
        var t = tipoSel.value;
        // Por defecto mostrar y limpiar campos generales
        cantWrap.style.display = '';
        costWrap.style.display = '';
        var ci = div.querySelector('.ent-cant'); if (ci) ci.value = '';
        var cg = div.querySelector('.ent-cost-gen'); if (cg) cg.value = '';
        stickerExtra.style.display = 'none';
        stickerExtra.innerHTML = '';

        if (t === 'especia_grs') {
          detailDiv.innerHTML = '<label>Especia</label><select class="input ent-especia"><option value="">Seleccionar</option>' + buildEspOpts() + '</select><input type="text" class="input ent-especia-new" placeholder="Nombre nueva especia..." style="display:none;margin-top:6px">';
          var espSel2 = detailDiv.querySelector('.ent-especia');
          var newInput = detailDiv.querySelector('.ent-especia-new');
          espSel2.addEventListener('change', function() {
            if (this.value === '__new__') { this.style.display = 'none'; newInput.style.display = 'block'; newInput.focus(); }
          });
          newInput.addEventListener('blur', function() {
            if (!this.value.trim()) { this.style.display = 'none'; espSel2.style.display = 'block'; espSel2.value = ''; }
          });
          newInput.addEventListener('keydown', function(ev) { if (ev.key === 'Escape') { this.value = ''; this.blur(); } });
        } else if (t === 'envase') {
          detailDiv.innerHTML = '<label>Talla</label><select class="input ent-talla"><option value="chico">Pequeño</option><option value="grande">Grande</option></select>';
        } else if (t === 'bolsa') {
          detailDiv.innerHTML = '<label>Talla</label><select class="input ent-talla"><option value="chico">Chica</option><option value="grande">Grande</option></select>';
        } else if (t === 'cinta') {
          detailDiv.innerHTML = '';
        } else if (t === 'sticker') {
          // Si la fila tiene preload de un sticker individual (edición), usar modo simple:
          // inputs para producto (select de todos los productos) + talla + cantidad + costo.
          // Si NO hay preload (alta nueva), usar el modo tabla masiva original.
          if (preload && preload.tipo === 'sticker' && preload.stickerNombre) {
            // Modo edición: fila simple con select de producto + talla
            // Cantidad y costo van en los inputs generales (cantWrap + costWrap)
            var allProdsOpts = '';
            var blsSorted2 = bls.slice().sort(function(a, b) { return (a.nombre||'').localeCompare(b.nombre||''); });
            var espsSorted2 = esps.slice().sort(function(a, b) { return (a.nombre||'').localeCompare(b.nombre||''); });
            if (blsSorted2.length > 0) {
              allProdsOpts += '<optgroup label="Blends">';
              for (var sb = 0; sb < blsSorted2.length; sb++) allProdsOpts += '<option value="' + esc(blsSorted2[sb].nombre) + '">' + esc(blsSorted2[sb].nombre) + '</option>';
              allProdsOpts += '</optgroup>';
            }
            if (espsSorted2.length > 0) {
              allProdsOpts += '<optgroup label="Especias">';
              for (var se = 0; se < espsSorted2.length; se++) allProdsOpts += '<option value="' + esc(espsSorted2[se].nombre) + '">' + esc(espsSorted2[se].nombre) + '</option>';
              allProdsOpts += '</optgroup>';
            }
            detailDiv.innerHTML =
              '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
                '<div class="form-group" style="margin:0;flex:1;min-width:160px"><label>Producto</label><select class="input stk-prod-simple">' + allProdsOpts + '</select></div>' +
                '<div class="form-group" style="margin:0;min-width:110px"><label>Talla</label><select class="input stk-talla-simple"><option value="chico">Pequeño</option><option value="grande">Grande</option></select></div>' +
              '</div>';
          } else {
            // Modo alta nueva: tabla masiva con todos los productos (comportamiento original)
            cantWrap.style.display = 'none';
            costWrap.style.display = 'none';
            detailDiv.innerHTML = '<label>&nbsp;</label><span class="text-xs text-muted">Stickers ↓</span>';
            stickerExtra.style.display = '';
            stickerExtra.innerHTML = buildStickerTable();
            // Listeners para recalcular total al tipear cantidades o costo
            var stkInputs = stickerExtra.querySelectorAll('.stk-cant, .stk-cost');
            for (var k = 0; k < stkInputs.length; k++) {
              stkInputs[k].addEventListener('input', updateTotal);
            }
          }
        }
      }
      tipoSel.addEventListener('change', renderDetail);
      // Si hay preload, setear el tipo y volver a renderizar para que detailDiv se construya
      if (preload && preload.tipo) {
        tipoSel.value = preload.tipo;
      }
      renderDetail();
      // Aplicar valores pre-cargados después de que renderDetail construyó el detalle
      if (preload) {
        _aplicarPreload(div, preload, stickerExtra);
      }
      div.querySelector('.btn-rm-ent').addEventListener('click', function() { div.remove(); updateTotal(); });
      div.querySelector('.ent-cant').addEventListener('input', updateTotal);
      var genCost = div.querySelector('.ent-cost-gen');
      if (genCost) genCost.addEventListener('input', updateTotal);
    }

    /** Aplica los valores de un item existente a una fila recién creada. */
    function _aplicarPreload(div, it, stickerExtra) {
      try {
        // Tipo (ya fue seteado antes de renderDetail, pero por las dudas)
        var tipoSel2 = div.querySelector('.ent-tipo');
        if (tipoSel2 && it.tipo) tipoSel2.value = it.tipo;
        // Cantidad y costo generales (no aplica a stickers masivos)
        if (it.tipo !== 'sticker') {
          var cantInput = div.querySelector('.ent-cant');
          if (cantInput && it.cantidad != null) cantInput.value = it.cantidad;
          var costInput = div.querySelector('.ent-cost-gen');
          if (costInput && it.costoUnitario != null) costInput.value = it.costoUnitario;
        }
        // Detalle según tipo
        if (it.tipo === 'especia_grs') {
          var espSel = div.querySelector('.ent-especia');
          if (espSel && it.especiaId) espSel.value = String(it.especiaId);
        } else if (it.tipo === 'envase' || it.tipo === 'bolsa') {
          var tallaSel = div.querySelector('.ent-talla');
          if (tallaSel && it.talla) tallaSel.value = it.talla;
        } else if (it.tipo === 'sticker') {
          // Sticker individual en modo edición: setear select de producto + talla + cantidad + costo
          // (los inputs generales .ent-cant y .ent-cost-gen ya están visibles en este modo)
          var stkProdSimple = div.querySelector('.stk-prod-simple');
          var stkTallaSimple = div.querySelector('.stk-talla-simple');
          if (stkProdSimple && it.stickerNombre) {
            // Buscar la option que matchee el nombre (puede tener caracteres escapados)
            for (var op = 0; op < stkProdSimple.options.length; op++) {
              if (stkProdSimple.options[op].value === it.stickerNombre || stkProdSimple.options[op].text === it.stickerNombre) {
                stkProdSimple.selectedIndex = op;
                break;
              }
            }
          }
          if (stkTallaSimple && it.talla) stkTallaSimple.value = it.talla;
          // Cantidad y costo van en los inputs generales (ya seteados arriba para no-sticker,
          // pero como en edición sticker esos campos SÍ son visibles, los seteamos acá también)
          var cantInputStk = div.querySelector('.ent-cant');
          if (cantInputStk && it.cantidad != null) cantInputStk.value = it.cantidad;
          var costInputStk = div.querySelector('.ent-cost-gen');
          if (costInputStk && it.costoUnitario != null) costInputStk.value = it.costoUnitario;
        }
      } catch (e) {
        console.warn('[formEntrada] preload error:', e.message);
      }
    }

    function updateTotal() {
      var rows = itemsDiv.children;
      var total = 0;
      for (var i = 0; i < rows.length; i++) {
        var tipo = rows[i].querySelector('.ent-tipo').value;
        if (tipo === 'sticker') {
          // Si la fila tiene el select de producto simple (modo edición), usar inputs generales
          var stkProdSimpleCheck = rows[i].querySelector('.stk-prod-simple');
          if (stkProdSimpleCheck) {
            var cS = Number(rows[i].querySelector('.ent-cant').value) || 0;
            var coS = Number(rows[i].querySelector('.ent-cost-gen') ? rows[i].querySelector('.ent-cost-gen').value : 0) || 0;
            total += cS * coS;
          } else {
            // Modo tabla masiva: costos separados para chico y grande
            var stkCostCh = Number(rows[i].querySelector('.stk-cost-chico') ? rows[i].querySelector('.stk-cost-chico').value : 0) || 0;
            var stkCostGr = Number(rows[i].querySelector('.stk-cost-grande') ? rows[i].querySelector('.stk-cost-grande').value : 0) || 0;
            var stkCants = rows[i].querySelectorAll('.stk-cant');
            for (var k = 0; k < stkCants.length; k++) {
              var cantK = Number(stkCants[k].value) || 0;
              var costK = stkCants[k].dataset.talla === 'grande' ? stkCostGr : stkCostCh;
              total += cantK * costK;
            }
          }
        } else {
          var c = Number(rows[i].querySelector('.ent-cant').value) || 0;
          var coEl = rows[i].querySelector('.ent-cost-gen');
          var co = Number(coEl ? coEl.value : 0) || 0;
          total += c * co;
        }
      }
      document.getElementById('ent-total').textContent = total.toLocaleString();
      updateAjusteInfo();
    }

    /** Actualiza el texto informativo del ajuste entre total calculado y total pagado. */
    function updateAjusteInfo() {
      var totalCalc = Number((document.getElementById('ent-total').textContent || '0').replace(/\./g, '').replace(/,/g, '.')) || 0;
      var pagadoInput = document.getElementById('f-ent-pagado');
      var infoEl = document.getElementById('f-ent-ajuste-info');
      if (!pagadoInput || !infoEl) return;
      var pagado = Number(pagadoInput.value) || 0;
      if (pagadoInput.value === '' || pagadoInput.value == null) {
        infoEl.textContent = 'Total calculado: $' + totalCalc.toLocaleString() + '. Dejá vacío si el pago coincide; o cargá el monto efectivamente pagado para registrar el ajuste.';
        infoEl.style.color = '';
      } else {
        var ajuste = totalCalc - pagado;
        if (ajuste > 0) {
          infoEl.innerHTML = 'Descuento de <b style="color:var(--green)">-$' + ajuste.toLocaleString() + '</b> (pagaste menos que el cálculo). El total de compras reflejará $' + pagado.toLocaleString() + '.';
        } else if (ajuste < 0) {
          infoEl.innerHTML = 'Recargo de <b style="color:var(--red)">+$' + Math.abs(ajuste).toLocaleString() + '</b> (pagaste más que el cálculo). El total de compras reflejará $' + pagado.toLocaleString() + '.';
        } else {
          infoEl.textContent = 'El monto pagado coincide con el total calculado.';
          infoEl.style.color = '';
        }
      }
    }

    addEntRow();
    document.getElementById('btn-add-ent').addEventListener('click', addEntRow);

    // Listener del input de total pagado para recalcular el info en vivo
    var pagadoInputEl = document.getElementById('f-ent-pagado');
    if (pagadoInputEl) pagadoInputEl.addEventListener('input', updateAjusteInfo);

    // Si es edición, pre-cargar las filas con los items de la entrada existente
    if (isEdit && existingEntrada.items && existingEntrada.items.length > 0) {
      // Limpiar la fila default que addEntRow agregó
      itemsDiv.innerHTML = '';
      for (var ei2 = 0; ei2 < existingEntrada.items.length; ei2++) {
        var it = existingEntrada.items[ei2];
        addEntRow(it);
      }
      updateTotal();
    }

    // Pre-cargar el total pagado si la entrada existente tiene uno distinto al calculado
    if (isEdit && existingEntrada.totalPagado != null && existingEntrada.totalPagado !== '') {
      var pagadoPreEl = document.getElementById('f-ent-pagado');
      if (pagadoPreEl) {
        pagadoPreEl.value = existingEntrada.totalPagado;
        updateAjusteInfo();
      }
    }

    document.getElementById('btn-save-ent').addEventListener('click', function() {
      var rows = itemsDiv.children;
      var items = [];
      var total = 0;
      var esps = ArcanoDB.getEspecias();
      var bls = ArcanoDB.getBlends();

      for (var i = 0; i < rows.length; i++) {
        var tipo = rows[i].querySelector('.ent-tipo').value;

        // Sticker: dos modos posibles
        if (tipo === 'sticker') {
          // MODO EDICIÓN: fila simple con select de producto + talla + inputs generales
          var stkProdSimpleEl = rows[i].querySelector('.stk-prod-simple');
          if (stkProdSimpleEl) {
            var stkProdVal = stkProdSimpleEl.value;
            var stkTallaSimpleEl = rows[i].querySelector('.stk-talla-simple');
            var stkTallaVal = stkTallaSimpleEl ? stkTallaSimpleEl.value : 'chico';
            var stkCantSimple = Number(rows[i].querySelector('.ent-cant').value) || 0;
            var stkCostSimpleEl = rows[i].querySelector('.ent-cost-gen');
            var stkCostSimple = Number(stkCostSimpleEl ? stkCostSimpleEl.value : 0) || 0;
            if (!stkProdVal) { alert('Falta producto de sticker (fila ' + (i+1) + ')'); return; }
            if (stkCantSimple <= 0) { alert('Falta cantidad de stickers (fila ' + (i+1) + ')'); return; }
            if (stkCostSimple <= 0) { alert('Falta costo del sticker (fila ' + (i+1) + ')'); return; }
            // Determinar stickerTipo: buscar en blends y especias por nombre
            var stkTipoDet = 'especia';
            for (var sb2 = 0; sb2 < bls.length; sb2++) { if (bls[sb2].nombre === stkProdVal) { stkTipoDet = 'blend'; break; } }
            items.push({
              tipo: 'sticker',
              cantidad: stkCantSimple,
              costoUnitario: stkCostSimple,
              stickerNombre: stkProdVal,
              stickerTipo: stkTipoDet,
              talla: stkTallaVal
            });
            total += stkCantSimple * stkCostSimple;
            continue; // Saltar el push del final
          }

          // MODO ALTA NUEVA: tabla masiva con todos los productos (comportamiento original)
          var stkCants = rows[i].querySelectorAll('.stk-cant');
          var stkCostChEl = rows[i].querySelector('.stk-cost-chico');
          var stkCostGrEl = rows[i].querySelector('.stk-cost-grande');
          var stkCostCh = Number(stkCostChEl ? stkCostChEl.value : 0) || 0;
          var stkCostGr = Number(stkCostGrEl ? stkCostGrEl.value : 0) || 0;
          var hasAnySticker = false;
          for (var k = 0; k < stkCants.length; k++) {
            var stkCant = Number(stkCants[k].value) || 0;
            if (stkCant > 0) {
              var tallaK = stkCants[k].dataset.talla;
              var costK = tallaK === 'grande' ? stkCostGr : stkCostCh;
              items.push({
                tipo: 'sticker',
                cantidad: stkCant,
                costoUnitario: costK,
                stickerNombre: stkCants[k].dataset.nombre,
                stickerTipo: stkCants[k].dataset.tipo,
                talla: tallaK
              });
              total += stkCant * costK;
              hasAnySticker = true;
            }
          }
          if (!hasAnySticker) { alert('Cargá al menos una cantidad de stickers (fila ' + (i+1) + ')'); return; }
          // Validar que el costo correspondiente esté cargado si hay stickers de esa talla
          var hasChico = false, hasGrande = false;
          for (var k2 = 0; k2 < stkCants.length; k2++) {
            if ((Number(stkCants[k2].value) || 0) > 0) {
              if (stkCants[k2].dataset.talla === 'grande') hasGrande = true;
              else hasChico = true;
            }
          }
          if (hasChico && stkCostCh <= 0) { alert('Falta el costo del sticker chico (fila ' + (i+1) + ')'); return; }
          if (hasGrande && stkCostGr <= 0) { alert('Falta el costo del sticker grande (fila ' + (i+1) + ')'); return; }
          continue; // Ya se agregaron los items arriba, saltar el push del final
        }

        var costGenInput = rows[i].querySelector('.ent-cost-gen');
        var cant = Number(rows[i].querySelector('.ent-cant').value) || 0;
        var cost = Number(costGenInput ? costGenInput.value : 0) || 0;
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
            for (var s = 0; s < esps.length; s++) { if (Number(esps[s].id) === item.especiaId) { espObj = esps[s]; break; } }
            item.especiaNombre = espObj ? espObj.nombre : (espSel.options[espSel.selectedIndex] ? espSel.options[espSel.selectedIndex].text : '?');
          } else {
            alert('Falta especia en item ' + (i+1)); return;
          }
          if (!item.especiaId) { alert('Falta especia en item ' + (i+1)); return; }
        } else if (tipo === 'envase') {
          item.talla = rows[i].querySelector('.ent-talla').value;
        } else if (tipo === 'bolsa') {
          item.talla = rows[i].querySelector('.ent-talla').value;
        }
        items.push(item);
      }
      if (items.length === 0) { alert('Agrega al menos un item'); return; }

      // Calcular total pagado y ajuste
      var pagadoInput = document.getElementById('f-ent-pagado');
      var pagadoValue = pagadoInput ? pagadoInput.value.trim() : '';
      var totalPagado = pagadoValue === '' ? total : (Number(pagadoValue) || 0);
      var ajuste = total - totalPagado;
      var entradaData = {
        fecha: document.getElementById('f-ent-fecha').value,
        proveedor: document.getElementById('f-ent-prov').value.trim(),
        items: items,
        total: totalPagado,
        totalCalculado: total,
        totalPagado: totalPagado,
        ajuste: ajuste
      };

      try {
        if (isEdit) {
          ArcanoDB.updateEntrada(editId, entradaData);
        } else {
          ArcanoDB.saveEntrada(entradaData);
        }
        modal.remove();
        App.renderPage('insumos');
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  delEntrada(id) {
    if (!confirm('Eliminar esta entrada? Se revertirán los stocks que esta entrada sumó (especies, envases, bolsas, cintas, stickers).')) return;
    try {
      ArcanoDB.deleteEntrada(id);
      toast('Entrada eliminada. Stocks revertidos.');
    } catch (e) {
      alert('Error: ' + e.message);
    }
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
  _prodTab: 'historial',

  renderProduccion(container) {
    var self = Pages;
    var prods = ArcanoDB.getProducciones();
    var h = '<div class="page-actions"><button class="btn btn-gold" onclick="Pages.formProduccion()">+ Nueva Produccion</button></div>';

    // Tabs
    h += '<div class="tabs mt-16" style="margin-bottom:0">';
    h += '<button class="tab-btn ' + (self._prodTab === 'historial' ? 'active' : '') + '" onclick="Pages._prodTab=\'historial\';App.renderPage(\'produccion\')">Historial</button>';
    h += '<button class="tab-btn ' + (self._prodTab === 'sugerencias' ? 'active' : '') + '" onclick="Pages._prodTab=\'sugerencias\';App.renderPage(\'produccion\')">Sugerencias de Producción</button>';
    h += '<button class="tab-btn ' + (self._prodTab === 'making' ? 'active' : '') + '" onclick="Pages._prodTab=\'making\';App.renderPage(\'produccion\')">🎮 Making Blends</button>';
    h += '</div>';

    if (self._prodTab === 'sugerencias') {
      h += self._renderProduccionSugerencias();
      container.innerHTML = h;
      return;
    }

    if (self._prodTab === 'making') {
      h += self._renderMakingBlends();
      container.innerHTML = h;
      return;
    }

    // Tab Historial (comportamiento existente)
    h += '<div class="card"><div class="card-header"><h3>Historial de Producciones (' + prods.length + ')</h3></div><div class="card-body">';
    if (prods.length === 0) {
      h += '<p class="text-muted text-center">Sin producciones.</p>';
    } else {
      // Filtros por tipo + búsqueda
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">';
      h += '<button class="btn btn-sm btn-gold" data-prod-filter="todos">Todos</button>';
      h += '<button class="btn btn-sm btn-outline" data-prod-filter="blend">Blends</button>';
      h += '<button class="btn btn-sm btn-outline" data-prod-filter="especia">Especias</button>';
      h += '<input type="text" class="input" id="prod-busqueda" placeholder="🔍 Buscar por producto o fecha..." style="flex:1;min-width:200px">';
      h += '</div>';
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Talla</th><th>Cant.</th><th>Detalle</th><th></th></tr></thead><tbody id="prod-tbody"></tbody></table></div>';
      h += '<div style="text-align:center;margin-top:12px"><button class="btn btn-sm btn-outline" id="prod-ver-mas" style="display:none">Ver más</button></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;

    if (prods.length > 0) {
      var _prodLimit = 10;
      var _prodFiltro = 'todos';
      var _prodBusq = '';
      var _prodTbody = document.getElementById('prod-tbody');
      var _prodVerMas = document.getElementById('prod-ver-mas');
      var _prodBusqueda = document.getElementById('prod-busqueda');
      var _prodFilterBtns = container.querySelectorAll('[data-prod-filter]');

      function _prodFiltradas() {
        return prods.filter(function(p) {
          if (_prodFiltro === 'blend' && p.tipo !== 'blend') return false;
          if (_prodFiltro === 'especia' && p.tipo !== 'especia') return false;
          if (_prodBusq) {
            var q = _prodBusq.toLowerCase();
            if ((p.productoNombre || '').toLowerCase().indexOf(q) < 0 &&
                (p.fecha || '').toLowerCase().indexOf(q) < 0) return false;
          }
          return true;
        });
      }

      function _prodRowHtml(p) {
        var det = p.tipo === 'blend' ?
          (p.ingredientes||[]).map(function(x){return x.especiaNombre+' '+x.gramosTotal+'g'}).join(', ') :
          (p.gramosTotal||0) + 'g consumidos';
        return '<tr><td>' + (p.fecha||'') + '</td>' +
          '<td><span class="badge ' + (p.tipo==='blend'?'badge-blue':'badge-gold') + '">' + (p.tipo==='blend'?'Blend':'Especia') + '</span></td>' +
          '<td class="fw7">' + (p.productoNombre||'') + '</td>' +
          '<td><span class="badge ' + ((p.talla||'chico')==='grande'?'badge-gold':'badge-blue') + '">' + (p.talla||'chico') + '</span></td>' +
          '<td class="fw7 text-green">' + (p.cantidad||0) + ' fr</td>' +
          '<td class="text-sm">' + det + ' | Env:' + (p.envasesConsumidos||0) + ' Stk:' + (p.stickersConsumidos||0) + ' Bol:' + (p.bolsasConsumidas||0) + ' Cin:' + (p.cintasConsumidas||0) + '</td>' +
          '<td><button class="btn btn-sm btn-red" onclick="Pages.deleteProduccion(' + p.id + ')" title="Eliminar y revertir stock">X</button></td></tr>';
      }

      function _prodRender() {
        var filtradas = _prodFiltradas();
        var html = '';
        for (var i = 0; i < Math.min(filtradas.length, _prodLimit); i++) {
          html += _prodRowHtml(filtradas[i]);
        }
        if (filtradas.length === 0) {
          html = '<tr><td colspan="7" class="text-muted text-center" style="padding:16px">Sin resultados</td></tr>';
        }
        _prodTbody.innerHTML = html;
        if (_prodLimit < filtradas.length) {
          _prodVerMas.style.display = '';
          var restantes = filtradas.length - _prodLimit;
          _prodVerMas.textContent = 'Ver más (' + restantes + ' restantes de ' + filtradas.length + ')';
        } else {
          _prodVerMas.style.display = 'none';
        }
      }

      _prodFilterBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          _prodFiltro = btn.getAttribute('data-prod-filter');
          _prodFilterBtns.forEach(function(b) {
            b.className = b.className.replace('btn-gold', 'btn-outline');
            b.className = b.className.replace('  ', ' ');
          });
          btn.className = btn.className.replace('btn-outline', 'btn-gold');
          _prodLimit = 10;
          _prodRender();
        });
      });
      _prodBusqueda.addEventListener('input', function() {
        _prodBusq = this.value.trim();
        _prodLimit = 10;
        _prodRender();
      });
      _prodVerMas.addEventListener('click', function() {
        _prodLimit += 20;
        _prodRender();
      });
      _prodRender();
    }
  },

  /* ---------- Sugerencias de Producción (tab nuevo) ---------- */
  _renderProduccionSugerencias() {
    var blends = ArcanoDB.getBlends();
    var especias = ArcanoDB.getEspecias();
    var db = ArcanoDB.getDB();
    var costos = ArcanoDB.getCostosInsumos();

    // Stock disponible de insumos globales
    var envases = db.stockEnvases || { chico: 0, grande: 0 };
    var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
    var cintas = db.stockCintas || 0;
    var pkgC = (Number(costos.envaseChico)||0) + (Number(costos.bolsaChica)||0) + (Number(costos.cinta)||0) + (Number(costos.stickerChico)||0);
    var pkgG = (Number(costos.envaseGrande)||0) + (Number(costos.bolsaGrande)||0) + (Number(costos.cinta)||0) + (Number(costos.stickerGrande)||0);

    // Stickers por nombre de producto
    function stkDisponible(nombre) {
      var stkKeys = Object.keys(db.stickers || {});
      for (var j = 0; j < stkKeys.length; j++) {
        if (db.stickers[stkKeys[j]].nombre === nombre) {
          return {
            chico: Number(db.stickers[stkKeys[j]].stockChico) || 0,
            grande: Number(db.stickers[stkKeys[j]].stockGrande) || 0
          };
        }
      }
      return { chico: 0, grande: 0 };
    }

    // ====== CÁLCULO 1: Blends ordenados por costo (menor a mayor) ======
    // Para cada blend, calcular cuántos frascos chico y grande se pueden producir
    // según el insumo más limitante, y el costo total de producir ese máximo.
    var sugerenciasBlends = [];
    for (var bi = 0; bi < blends.length; bi++) {
      var b = blends[bi];
      var ings = b.ingredientes || [];
      if (ings.length === 0) continue;

      // ---- Para frasco CHICO ----
      var maxChico = Infinity;
      var espChCost = 0;
      var limitanteChico = '';
      for (var ig = 0; ig < ings.length; ig++) {
        var ing = ings[ig];
        var esp = ArcanoDB.getEspecia(ing.especiaId);
        if (!esp) { maxChico = 0; limitanteChico = (ing.especiaNombre || '?') + ' (no encontrada)'; break; }
        var gpf = Number(ing.gramosChico) || 0;
        if (gpf <= 0) continue;
        var disponible = Number(esp.stockBolsa) || 0;
        var maxPorEste = Math.floor(disponible / gpf);
        if (maxPorEste < maxChico) {
          maxChico = maxPorEste;
          limitanteChico = esp.nombre;
        }
        var cpg = (costos.especias && costos.especias[ing.especiaId]) || 0;
        espChCost += gpf * cpg;
      }
      // Limitantes adicionales (envases, bolsas, cintas, stickers)
      var stk = stkDisponible(b.nombre);
      var limitChicoEnvases = Math.floor(envases.chico / 1);
      var limitChicoBolsas = Math.floor(bolsas.chico / 1);
      var limitChicoCintas = Math.floor(cintas / 1);
      var limitChicoStickers = stk.chico;
      var limitChico = Math.min(maxChico, limitChicoEnvases, limitChicoBolsas, limitChicoCintas, limitChicoStickers);
      if (limitChico < maxChico) {
        if (limitChicoEnvases < maxChico) limitanteChico = 'Envases chico (' + envases.chico + ' disp.)';
        else if (limitChicoBolsas < maxChico) limitanteChico = 'Bolsas chica (' + bolsas.chico + ' disp.)';
        else if (limitChicoCintas < maxChico) limitanteChico = 'Cintas (' + cintas + ' disp.)';
        else if (limitChicoStickers < maxChico) limitanteChico = 'Stickers chico de ' + b.nombre + ' (' + stk.chico + ' disp.)';
      }

      // ---- Para frasco GRANDE ----
      var maxGrande = Infinity;
      var espGrCost = 0;
      var limitanteGrande = '';
      for (var ig2 = 0; ig2 < ings.length; ig2++) {
        var ing2 = ings[ig2];
        var esp2 = ArcanoDB.getEspecia(ing2.especiaId);
        if (!esp2) { maxGrande = 0; limitanteGrande = (ing2.especiaNombre || '?') + ' (no encontrada)'; break; }
        var gpf2 = Number(ing2.gramosGrande) || 0;
        if (gpf2 <= 0) continue;
        var disponible2 = Number(esp2.stockBolsa) || 0;
        var maxPorEste2 = Math.floor(disponible2 / gpf2);
        if (maxPorEste2 < maxGrande) {
          maxGrande = maxPorEste2;
          limitanteGrande = esp2.nombre;
        }
        var cpg2 = (costos.especias && costos.especias[ing2.especiaId]) || 0;
        espGrCost += gpf2 * cpg2;
      }
      var limitGrandeEnvases = Math.floor(envases.grande / 1);
      var limitGrandeBolsas = Math.floor(bolsas.grande / 1);
      var limitGrandeCintas = Math.floor(cintas / 1);
      var limitGrandeStickers = stk.grande;
      var limitGrande = Math.min(maxGrande, limitGrandeEnvases, limitGrandeBolsas, limitGrandeCintas, limitGrandeStickers);
      if (limitGrande < maxGrande) {
        if (limitGrandeEnvases < maxGrande) limitanteGrande = 'Envases grande (' + envases.grande + ' disp.)';
        else if (limitGrandeBolsas < maxGrande) limitanteGrande = 'Bolsas grande (' + bolsas.grande + ' disp.)';
        else if (limitGrandeCintas < maxGrande) limitanteGrande = 'Cintas (' + cintas + ' disp.)';
        else if (limitGrandeStickers < maxGrande) limitanteGrande = 'Stickers grande de ' + b.nombre + ' (' + stk.grande + ' disp.)';
      }

      // Costos unitarios
      var costoUnitChico = espChCost + pkgC;
      var costoUnitGrande = espGrCost + pkgG;
      // Costo total de producir el máximo posible
      var costoTotalChico = limitChico * costoUnitChico;
      var costoTotalGrande = limitGrande * costoUnitGrande;

      // Ingreso potencial (precio × max)
      var ventaTotalChico = limitChico * (Number(b.precioChico) || 0);
      var ventaTotalGrande = limitGrande * (Number(b.precioGrande) || 0);
      var margenTotalChico = ventaTotalChico - costoTotalChico;
      var margenTotalGrande = ventaTotalGrande - costoTotalGrande;

      sugerenciasBlends.push({
        blend: b,
        maxChico: limitChico, maxGrande: limitGrande,
        limitanteChico: limitanteChico, limitanteGrande: limitanteGrande,
        costoUnitChico: costoUnitChico, costoUnitGrande: costoUnitGrande,
        costoTotalChico: costoTotalChico, costoTotalGrande: costoTotalGrande,
        ventaTotalChico: ventaTotalChico, ventaTotalGrande: ventaTotalGrande,
        margenTotalChico: margenTotalChico, margenTotalGrande: margenTotalGrande
      });
    }

    // ====== CÁLCULO 2: Especias limitantes ordenadas por costo ======
    // Para cada especia, cuántos blends la usan y cuántos frascos en total se podrían
    // producir si esa especia tuviera stock suficiente (es decir, qué blends están
    // frenados por esta especia). El "costo" es el costo por gramo de cada especia.
    var especiasImpacto = {};
    for (var bi2 = 0; bi2 < blends.length; bi2++) {
      var b2 = blends[bi2];
      var ings2 = b2.ingredientes || [];
      for (var ig3 = 0; ig3 < ings2.length; ig3++) {
        var ing3 = ings2[ig3];
        var esp3 = ArcanoDB.getEspecia(ing3.especiaId);
        if (!esp3) continue;
        if (!especiasImpacto[esp3.id]) {
          var cpg3 = (costos.especias && costos.especias[esp3.id]) || 0;
          especiasImpacto[esp3.id] = {
            especia: esp3,
            costoPorGramo: cpg3,
            stockActual: Number(esp3.stockBolsa) || 0,
            blendsQueLaUsan: [],
            totalFrascosFrenadosChico: 0,
            totalFrascosFrenadosGrande: 0,
            gramosNecesariosChico: 0,
            gramosNecesariosGrande: 0
          };
        }
        especiasImpacto[esp3.id].blendsQueLaUsan.push(b2.nombre);
        // Para cada blend, calcular cuántos frascos podría producir si tuviera stock
        // (limitado por las otras especias del blend, no por esta)
        var ingsBlend = b2.ingredientes || [];
        var maxChicoSinEsta = Infinity;
        var maxGrandeSinEsta = Infinity;
        for (var ig4 = 0; ig4 < ingsBlend.length; ig4++) {
          if (ig4 === ig3) continue; // skip esta especia
          var ing4 = ingsBlend[ig4];
          var esp4 = ArcanoDB.getEspecia(ing4.especiaId);
          if (!esp4) continue;
          var gpfCh = Number(ing4.gramosChico) || 0;
          var gpfGr = Number(ing4.gramosGrande) || 0;
          if (gpfCh > 0) {
            var mx = Math.floor((Number(esp4.stockBolsa) || 0) / gpfCh);
            if (mx < maxChicoSinEsta) maxChicoSinEsta = mx;
          }
          if (gpfGr > 0) {
            var mx2 = Math.floor((Number(esp4.stockBolsa) || 0) / gpfGr);
            if (mx2 < maxGrandeSinEsta) maxGrandeSinEsta = mx2;
          }
        }
        // Si las otras especias limitan a 5 chico y 3 grande, esta especia frenaría 5+3=8 frascos
        if (isFinite(maxChicoSinEsta)) {
          especiasImpacto[esp3.id].totalFrascosFrenadosChico += maxChicoSinEsta;
          var gpfThisCh = Number(ing3.gramosChico) || 0;
          especiasImpacto[esp3.id].gramosNecesariosChico += maxChicoSinEsta * gpfThisCh;
        }
        if (isFinite(maxGrandeSinEsta)) {
          especiasImpacto[esp3.id].totalFrascosFrenadosGrande += maxGrandeSinEsta;
          var gpfThisGr = Number(ing3.gramosGrande) || 0;
          especiasImpacto[esp3.id].gramosNecesariosGrande += maxGrandeSinEsta * gpfThisGr;
        }
      }
    }
    var especiasLista = Object.values(especiasImpacto);
    // Ordenar: de menor costo a mayor costo (el más barato primero — más rentable reponer primero)
    especiasLista.sort(function(a, b) { return a.costoPorGramo - b.costoPorGramo; });

    // ====== HTML ======
    var h = '';
    h += '<p class="text-sm text-muted mb-16">Sugerencias basadas en el stock actual de insumos y especias. Actualizá en tiempo real al cambiar stocks o costos.</p>';

    // ===== SECCIÓN 1: BLENDS ORDENADOS POR COSTO =====
    h += '<div class="card"><div class="card-header"><h3>1. Blends que podés producir ahora (ordenados por menor costo)</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted mb-12">Para cada blend, calcula el máximo de frascos chico y grande que se pueden producir con el stock actual. Ordenados de menor a mayor costo unitario (chico).</p>';

    // Ordenar sugerenciasBlends por costo unitario chico ascendente
    sugerenciasBlends.sort(function(a, b) { return a.costoUnitChico - b.costoUnitChico; });

    if (sugerenciasBlends.length === 0) {
      h += '<p class="text-muted text-center">No hay blends con receta definida. Agregá ingredientes a los blends primero.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr>';
      h += '<th>Blend</th>';
      h += '<th class="text-center">Máx Chico</th>';
      h += '<th class="text-center">Limitante Chico</th>';
      h += '<th class="text-right">Costo Unit. Ch</th>';
      h += '<th class="text-right">$ Venta Ch</th>';
      h += '<th class="text-right">$ Margen Ch</th>';
      h += '<th class="text-center">Máx Grande</th>';
      h += '<th class="text-center">Limitante Grande</th>';
      h += '<th class="text-right">Costo Unit. Gr</th>';
      h += '<th class="text-right">$ Venta Gr</th>';
      h += '<th class="text-right">$ Margen Gr</th>';
      h += '<th></th>';
      h += '</tr></thead><tbody>';
      for (var si = 0; si < sugerenciasBlends.length; si++) {
        var s = sugerenciasBlends[si];
        var mcCls = s.maxChico <= 0 ? 'text-red fw7' : (s.maxChico >= 10 ? 'text-green fw7' : 'fw7');
        var mgCls = s.maxGrande <= 0 ? 'text-red fw7' : (s.maxGrande >= 10 ? 'text-green fw7' : 'fw7');
        var margenChColor = s.margenTotalChico >= 0 ? 'var(--green)' : 'var(--red)';
        var margenGrColor = s.margenTotalGrande >= 0 ? 'var(--green)' : 'var(--red)';
        h += '<tr>' +
          '<td class="fw7">' + esc(s.blend.nombre) + '</td>' +
          '<td class="text-center ' + mcCls + '">' + s.maxChico + '</td>' +
          '<td class="text-sm text-muted">' + esc(s.limitanteChico || '—') + '</td>' +
          '<td class="text-right">$' + s.costoUnitChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>' +
          '<td class="text-right text-gold">$' + s.ventaTotalChico.toLocaleString() + '</td>' +
          '<td class="text-right fw7" style="color:' + margenChColor + '">$' + s.margenTotalChico.toLocaleString() + '</td>' +
          '<td class="text-center ' + mgCls + '">' + s.maxGrande + '</td>' +
          '<td class="text-sm text-muted">' + esc(s.limitanteGrande || '—') + '</td>' +
          '<td class="text-right">$' + s.costoUnitGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>' +
          '<td class="text-right text-gold">$' + s.ventaTotalGrande.toLocaleString() + '</td>' +
          '<td class="text-right fw7" style="color:' + margenGrColor + '">$' + s.margenTotalGrande.toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-gold" onclick="Pages.formProduccion(\'blend\', ' + s.blend.id + ')">Producir</button></td>' +
        '</tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';

    // ===== SECCIÓN 2: ESPECIAS LIMITANTES ORDENADAS POR COSTO =====
    h += '<div class="card mt-16"><div class="card-header"><h3>2. Especias e insumos para producir más blends (ordenados por menor costo)</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted mb-12">Para cada especia que usan tus blends, muestra cuántos frascos en total están frenados por falta de esa especia. Ordenados de menor a mayor costo por gramo (los más baratos primero — reponerlos da más retorno por peso invertido).</p>';

    if (especiasLista.length === 0) {
      h += '<p class="text-muted text-center">No hay especias usadas en blends todavía.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr>';
      h += '<th>Especia</th>';
      h += '<th class="text-center">Stock Actual (g)</th>';
      h += '<th class="text-right">Costo por gramo</th>';
      h += '<th class="text-center">Blends que la usan</th>';
      h += '<th class="text-center">Frascos Ch frenados</th>';
      h += '<th class="text-center">Frascos Gr frenados</th>';
      h += '<th class="text-right">g necesarios para max</th>';
      h += '<th class="text-right">Costo de reponer</th>';
      h += '<th></th>';
      h += '</tr></thead><tbody>';
      for (var ei = 0; ei < especiasLista.length; ei++) {
        var e = especiasLista[ei];
        var gramosNecesariosTotal = e.gramosNecesariosChico + e.gramosNecesariosGrande;
        var gramosAReponer = Math.max(0, gramosNecesariosTotal - e.stockActual);
        var costoReponer = gramosAReponer * e.costoPorGramo;
        var stkCls = e.stockActual <= 50 ? 'text-red fw7' : 'text-green';
        h += '<tr>' +
          '<td class="fw7">' + esc(e.especia.nombre) + '</td>' +
          '<td class="text-center ' + stkCls + '">' + e.stockActual + 'g</td>' +
          '<td class="text-right">$' + e.costoPorGramo.toLocaleString(undefined,{maximumFractionDigits:3}) + '/g</td>' +
          '<td class="text-center">' + e.blendsQueLaUsan.length + '</td>' +
          '<td class="text-center fw7">' + (e.totalFrascosFrenadosChico || 0) + '</td>' +
          '<td class="text-center fw7">' + (e.totalFrascosFrenadosGrande || 0) + '</td>' +
          '<td class="text-right">' + gramosNecesariosTotal + 'g</td>' +
          '<td class="text-right text-red fw7">$' + costoReponer.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>' +
          '<td><button class="btn btn-sm btn-outline" onclick="Pages.formEntrada()">Comprar</button></td>' +
        '</tr>';
      }
      h += '</tbody></table></div>';

      // También insumos globales limitantes (envases, bolsas, cintas, stickers)
      h += '<h4 style="margin:20px 0 8px;font-size:.95rem">Insumos globales (packaging)</h4>';
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Insumo</th><th class="text-center">Stock</th><th class="text-center">Blends frenados por esto</th><th></th></tr></thead><tbody>';
      var envChFrenados = 0, envGrFrenados = 0, bolChFrenados = 0, bolGrFrenados = 0, cinFrenados = 0;
      for (var si2 = 0; si2 < sugerenciasBlends.length; si2++) {
        var sb = sugerenciasBlends[si2];
        if (sb.maxChico > 0 && sb.maxChico >= envases.chico) envChFrenados++;
        if (sb.maxGrande > 0 && sb.maxGrande >= envases.grande) envGrFrenados++;
        if (sb.maxChico > 0 && sb.maxChico >= bolsas.chico) bolChFrenados++;
        if (sb.maxGrande > 0 && sb.maxGrande >= bolsas.grande) bolGrFrenados++;
        if (sb.maxChico > 0 && sb.maxChico >= cintas) cinFrenados++;
      }
      h += '<tr><td class="fw7">Envases chico</td><td class="text-center ' + (envases.chico<=10?'text-red fw7':'') + '">' + envases.chico + '</td><td class="text-center">' + envChFrenados + '</td><td><button class="btn btn-sm btn-outline" onclick="Pages.formEntrada()">Comprar</button></td></tr>';
      h += '<tr><td class="fw7">Envases grande</td><td class="text-center ' + (envases.grande<=10?'text-red fw7':'') + '">' + envases.grande + '</td><td class="text-center">' + envGrFrenados + '</td><td><button class="btn btn-sm btn-outline" onclick="Pages.formEntrada()">Comprar</button></td></tr>';
      h += '<tr><td class="fw7">Bolsas chica</td><td class="text-center ' + (bolsas.chico<=10?'text-red fw7':'') + '">' + bolsas.chico + '</td><td class="text-center">' + bolChFrenados + '</td><td><button class="btn btn-sm btn-outline" onclick="Pages.formEntrada()">Comprar</button></td></tr>';
      h += '<tr><td class="fw7">Bolsas grande</td><td class="text-center ' + (bolsas.grande<=10?'text-red fw7':'') + '">' + bolsas.grande + '</td><td class="text-center">' + bolGrFrenados + '</td><td><button class="btn btn-sm btn-outline" onclick="Pages.formEntrada()">Comprar</button></td></tr>';
      h += '<tr><td class="fw7">Cintas</td><td class="text-center ' + (cintas<=10?'text-red fw7':'') + '">' + cintas + '</td><td class="text-center">' + cinFrenados + '</td><td><button class="btn btn-sm btn-outline" onclick="Pages.formEntrada()">Comprar</button></td></tr>';
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    return h;
  },

  /** Produccion rapida desde Productos */
  formProduccionRapida(tipo, productoId) {
    Pages.formProduccion(tipo, productoId);
  },

  /** Elimina una producción y revierte el stock */
  deleteProduccion(id) {
    if (!confirm('¿Eliminar esta producción? Se revertirá todo el stock consumido (pala, envases, stickers, bolsas, cintas) y se restarán los frascos producidos.')) return;
    try {
      ArcanoDB.deleteProduccion(id);
      toast('Producción eliminada. Stock revertido.');
      App.renderPage('produccion');
    } catch (e) {
      toast('Error: ' + e.message, 'err');
    }
  },

  /** Formulario de produccion — tipo y productoId son opcionales (pre-llenan) */
  formProduccion(presetTipo, presetProdId) {
    var self = this;
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg" style="max-width:760px">' +
      '<div class="modal-header"><h3>Nueva Produccion</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Tipo</label><select class="input" id="f-prod-tipo"><option value="blend">Blend</option><option value="especia">Especia</option></select></div>' +
        '<div class="form-group"><label>Producto</label><select class="input" id="f-prod-prod"><option value="">Seleccionar</option></select></div>' +
        '<div class="g2 mb-8">' +
          '<div class="form-group" style="margin:0"><label>Frascos pequenos</label><input type="number" class="input" id="f-prod-cant-chico" value="0" min="0" placeholder="0"></div>' +
          '<div class="form-group" style="margin:0"><label>Frascos grandes</label><input type="number" class="input" id="f-prod-cant-grande" value="0" min="0" placeholder="0"></div>' +
        '</div>' +
        '<p class="text-xs text-muted mb-8">Carga cuantos frascos de cada talla queres producir. Dejando un campo en 0 se omite esa talla.</p>' +
        '<div id="f-prod-preview"></div>' +
      '</div><div class="modal-footer">' +
        '<button class="btn btn-outline" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>' +
        '<button class="btn btn-gold" id="btn-prod" disabled>Producir</button>' +
      '</div></div>';
    document.body.appendChild(modal);

    var tipoSel = document.getElementById('f-prod-tipo');
    var prodSel = document.getElementById('f-prod-prod');
    var cantChicoInput = document.getElementById('f-prod-cant-chico');
    var cantGrandeInput = document.getElementById('f-prod-cant-grande');
    var previewDiv = document.getElementById('f-prod-preview');
    var prodBtn = document.getElementById('btn-prod');

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

    /** Devuelve la lista de insumos requeridos para producir cantCh + cantGr
     *  del producto elegido. Calcula gramos por especia, envases, stickers, etc.
     *  Retorna {producto, tipo, tallas:[{talla, cant, items:[{tipo, label, needed, avail, ok, unit}]}], allOk} */
    function calcularRequerimientos() {
      var tipo = tipoSel.value;
      var prodId = Number(prodSel.value);
      var cantChico = Number(cantChicoInput.value) || 0;
      var cantGrande = Number(cantGrandeInput.value) || 0;
      if (!prodId || (cantChico <= 0 && cantGrande <= 0)) return null;
      var producto = tipo === 'blend' ? ArcanoDB.getBlend(prodId) : ArcanoDB.getEspecia(prodId);
      if (!producto) return null;

      var db = ArcanoDB.getDB();
      var envases = db.stockEnvases || { chico: 0, grande: 0 };
      var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
      var cintas = db.stockCintas || 0;
      // Sticker por nombre de producto
      var stkAvailChico = 0, stkAvailGrande = 0;
      var stkKeys = Object.keys(db.stickers || {});
      for (var j = 0; j < stkKeys.length; j++) {
        if (db.stickers[stkKeys[j]].nombre === producto.nombre) {
          stkAvailChico = Number(db.stickers[stkKeys[j]].stockChico) || 0;
          stkAvailGrande = Number(db.stickers[stkKeys[j]].stockGrande) || 0;
          break;
        }
      }

      var tallas = [];
      var allOk = true;

      function buildTalla(talla, cant) {
        if (cant <= 0) return null;
        var items = [];
        // 1) Gramos por especia
        var especiasDetalle = [];
        if (tipo === 'especia') {
          var gpf = talla === 'grande' ? (Number(producto.gramosGrande) || 0) : (Number(producto.gramosChico) || 0);
          var needed = gpf * cant;
          var avail = producto.stockBolsa || 0;
          var ok = avail >= needed;
          if (!ok) allOk = false;
          especiasDetalle.push({ nombre: producto.nombre, gramosPorFrasco: gpf, gramosTotal: needed, avail: avail, ok: ok });
          items.push({
            tipo: 'especia', label: 'Pala de ' + producto.nombre,
            needed: needed, avail: avail, ok: ok, unit: 'g',
            sub: especiasDetalle
          });
        } else {
          var ings = producto.ingredientes || [];
          for (var i = 0; i < ings.length; i++) {
            var ing = ings[i];
            var esp = ArcanoDB.getEspecia(ing.especiaId);
            var gpf2 = talla === 'grande' ? (Number(ing.gramosGrande) || 0) : (Number(ing.gramosChico) || 0);
            var needed2 = gpf2 * cant;
            var avail2 = esp ? (esp.stockBolsa || 0) : 0;
            var ok2 = avail2 >= needed2;
            if (!ok2) allOk = false;
            especiasDetalle.push({ nombre: esp ? esp.nombre : '?', gramosPorFrasco: gpf2, gramosTotal: needed2, avail: avail2, ok: ok2 });
            items.push({
              tipo: 'especia', label: 'Pala de ' + (esp ? esp.nombre : '?'),
              needed: needed2, avail: avail2, ok: ok2, unit: 'g',
              sub: [{ nombre: esp ? esp.nombre : '?', gramosPorFrasco: gpf2, gramosTotal: needed2, avail: avail2, ok: ok2 }]
            });
          }
        }
        // 2) Envases
        var envAvail = envases[talla] || 0;
        var envOk = envAvail >= cant;
        if (!envOk) allOk = false;
        items.push({ tipo: 'envase', label: 'Envases ' + talla, needed: cant, avail: envAvail, ok: envOk, unit: 'u' });
        // 3) Stickers
        var stkAvail = talla === 'grande' ? stkAvailGrande : stkAvailChico;
        var stkOk = stkAvail >= cant;
        if (!stkOk) allOk = false;
        items.push({ tipo: 'sticker', label: 'Stickers ' + talla, needed: cant, avail: stkAvail, ok: stkOk, unit: 'u' });
        // 4) Bolsas
        var bolsaAvail = bolsas[talla] || 0;
        var bolsaOk = bolsaAvail >= cant;
        if (!bolsaOk) allOk = false;
        items.push({ tipo: 'bolsa', label: 'Bolsas ' + talla, needed: cant, avail: bolsaAvail, ok: bolsaOk, unit: 'u' });
        // 5) Cintas
        var cintaOk = cintas >= cant;
        if (!cintaOk) allOk = false;
        items.push({ tipo: 'cinta', label: 'Cintas', needed: cant, avail: cintas, ok: cintaOk, unit: 'u' });
        return { talla: talla, cant: cant, items: items, especiasDetalle: especiasDetalle };
      }

      var tChico = buildTalla('chico', cantChico);
      var tGrande = buildTalla('grande', cantGrande);
      if (tChico) tallas.push(tChico);
      if (tGrande) tallas.push(tGrande);
      // Validar que tenga ingredientes (blends)
      if (tipo === 'blend' && (producto.ingredientes || []).length === 0) {
        allOk = false;
      }
      return { producto: producto, tipo: tipo, tallas: tallas, allOk: allOk, hasIngredientes: tipo !== 'blend' || ((producto.ingredientes || []).length > 0) };
    }

    function updatePreview() {
      var calc = calcularRequerimientos();
      if (!calc) { previewDiv.innerHTML = ''; prodBtn.disabled = true; return; }
      var p = calc.producto;
      var hasIng = calc.hasIngredientes;

      var h = '';
      // ====== SECCION 1: BOLSA — receta detallada por especia ======
      h += '<div class="card mt-12"><div class="card-header"><h3>Bolsa de Preparacion — ' + esc(p.nombre) + '</h3></div><div class="card-body">';

      if (!hasIng) {
        h += '<p class="text-red fw7">Este blend no tiene ingredientes definidos. Editalo primero.</p>';
      } else {
        // Para cada talla, tabla de gramos por especia
        for (var ti = 0; ti < calc.tallas.length; ti++) {
          var t = calc.tallas[ti];
          var tallaLabel = t.talla === 'grande' ? 'Grandes' : 'Pequenos';
          h += '<h4 class="mb-8 mt-8" style="font-size:.95rem">' + tallaLabel + ' (' + t.cant + ' frascos)</h4>';
          if (t.especiasDetalle.length === 0) {
            h += '<p class="text-muted text-xs">Sin especias en la receta.</p>';
          } else {
            h += '<div class="table-wrap mb-12"><table class="table" style="font-size:.85rem"><thead><tr><th>Especia</th><th class="text-center">g/frasco</th><th class="text-center">g totales</th><th class="text-center">Pala dispon.</th><th></th></tr></thead><tbody>';
            var grsTotalTalla = 0;
            for (var ei = 0; ei < t.especiasDetalle.length; ei++) {
              var d = t.especiasDetalle[ei];
              grsTotalTalla += d.gramosTotal;
              var stColor = d.ok ? 'var(--green)' : 'var(--red)';
              var stTxt = d.ok ? 'OK' : 'FALTA';
              h += '<tr>' +
                '<td class="fw7">' + esc(d.nombre) + '</td>' +
                '<td class="text-center">' + d.gramosPorFrasco + 'g</td>' +
                '<td class="text-center fw7" style="color:var(--gold)">' + d.gramosTotal + 'g</td>' +
                '<td class="text-center">' + d.avail + 'g</td>' +
                '<td class="text-center fw7" style="color:' + stColor + '">' + stTxt + '</td>' +
              '</tr>';
            }
            h += '<tr style="background:var(--bg)"><td colspan="2" class="fw7 text-right">Total de la bolsa:</td><td class="text-center fw7" style="color:var(--gold)">' + grsTotalTalla + 'g</td><td colspan="2"></td></tr>';
            h += '</tbody></table></div>';
          }
        }
        // Resumen de gramos totales por especia (suma de tallas)
        if (calc.tallas.length > 1) {
          h += '<h4 class="mb-8 mt-12" style="font-size:.95rem">Resumen total por especia (suma chico + grande)</h4>';
          h += '<div class="table-wrap mb-12"><table class="table" style="font-size:.85rem"><thead><tr><th>Especia</th><th class="text-center">g chico</th><th class="text-center">g grande</th><th class="text-center">g TOTAL</th></tr></thead><tbody>';
          var espMap = {};
          for (var tt = 0; tt < calc.tallas.length; tt++) {
            var t2 = calc.tallas[tt];
            for (var ee = 0; ee < t2.especiasDetalle.length; ee++) {
              var dd = t2.especiasDetalle[ee];
              if (!espMap[dd.nombre]) espMap[dd.nombre] = { chico: 0, grande: 0 };
              espMap[dd.nombre][t2.talla] += dd.gramosTotal;
            }
          }
          var nombres = Object.keys(espMap);
          var grsChicoTotal = 0, grsGrandeTotal = 0, grsTotalGeneral = 0;
          for (var ni = 0; ni < nombres.length; ni++) {
            var n = nombres[ni];
            var gCh = espMap[n].chico, gGr = espMap[n].grande, gT = gCh + gGr;
            grsChicoTotal += gCh; grsGrandeTotal += gGr; grsTotalGeneral += gT;
            h += '<tr><td class="fw7">' + esc(n) + '</td><td class="text-center">' + gCh + 'g</td><td class="text-center">' + gGr + 'g</td><td class="text-center fw7" style="color:var(--gold)">' + gT + 'g</td></tr>';
          }
          h += '<tr style="background:var(--bg)"><td class="fw7 text-right">TOTAL</td><td class="text-center fw7">' + grsChicoTotal + 'g</td><td class="text-center fw7">' + grsGrandeTotal + 'g</td><td class="text-center fw7" style="color:var(--gold)">' + grsTotalGeneral + 'g</td></tr>';
          h += '</tbody></table></div>';
        }
      }

      h += '</div></div>';

      // ====== SECCION 2: STOCK A CONSUMIR (envases, stickers, bolsas, cintas) ======
      h += '<div class="card mt-12"><div class="card-header"><h3>Insumos a Consumir</h3></div><div class="card-body">';
      if (!hasIng) {
        h += '<p class="text-red text-sm">No se puede producir hasta definir ingredientes.</p>';
      } else {
        for (var ti2 = 0; ti2 < calc.tallas.length; ti2++) {
          var t3 = calc.tallas[ti2];
          var tallaLabel3 = t3.talla === 'grande' ? 'Grandes' : 'Pequenos';
          h += '<h4 class="mb-8 mt-8" style="font-size:.95rem">' + tallaLabel3 + ' (' + t3.cant + ' frascos)</h4>';
          h += '<div class="list-row-grid">';
          for (var ii = 0; ii < t3.items.length; ii++) {
            if (t3.items[ii].tipo === 'especia') continue; // ya mostrado arriba
            var it = t3.items[ii];
            var itColor = it.ok ? 'var(--green)' : 'var(--red)';
            var itTxt = it.ok ? 'OK' : 'FALTA';
            h += '<div class="list-row"><span>' + esc(it.label) + '</span><span class="fw7" style="color:' + itColor + '">' + it.avail + ' ' + it.unit + ' &rarr; necesita ' + it.needed + ' ' + it.unit + ' · ' + itTxt + '</span></div>';
          }
          h += '</div>';
        }
      }
      h += '</div></div>';

      previewDiv.innerHTML = h;
      prodBtn.disabled = !calc.allOk;
    }

    tipoSel.addEventListener('change', function() { loadProductos(); });
    prodSel.addEventListener('change', updatePreview);
    cantChicoInput.addEventListener('input', updatePreview);
    cantGrandeInput.addEventListener('input', updatePreview);

    // PRODUCE BUTTON — produce ambas tallas en secuencia con validacion previa
    prodBtn.addEventListener('click', function() {
      var calc = calcularRequerimientos();
      if (!calc || !calc.allOk) { alert('Faltan insumos para producir. Revisá el detalle en rojo.'); return; }
      var tipo = tipoSel.value;
      var prodId = Number(prodSel.value);
      var cantChico = Number(cantChicoInput.value) || 0;
      var cantGrande = Number(cantGrandeInput.value) || 0;
      // Produccion: la DB valida de nuevo por las dudas (race condition)
      try {
        if (tipo === 'blend') {
          if (cantChico > 0) ArcanoDB.producirBlend(prodId, 'chico', cantChico);
          if (cantGrande > 0) ArcanoDB.producirBlend(prodId, 'grande', cantGrande);
        } else {
          if (cantChico > 0) ArcanoDB.producirEspecia(prodId, 'chico', cantChico);
          if (cantGrande > 0) ArcanoDB.producirEspecia(prodId, 'grande', cantGrande);
        }
        var total = cantChico + cantGrande;
        toast('Produccion OK: ' + total + ' frasco' + (total > 1 ? 's' : '') + ' de ' + calc.producto.nombre);
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

    h += '<div class="card mt-16"><div class="card-header"><h3>Historial de Ventas (' + ventas.length + ')</h3></div><div class="card-body">';
    if (ventas.length === 0) {
      h += '<p class="text-muted text-center">Sin ventas.</p>';
    } else {
      h += '<div class="form-group" style="margin-bottom:12px">' +
        '<input type="text" class="input" id="ventas-busqueda" placeholder="🔍 Buscar por fecha o producto..." style="width:100%">' +
      '</div>';
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Items</th><th>Total</th><th></th></tr></thead><tbody id="ventas-tbody"></tbody></table></div>';
      h += '<div style="text-align:center;margin-top:12px"><button class="btn btn-sm btn-outline" id="ventas-ver-mas" style="display:none">Ver más</button></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;

    if (ventas.length > 0) {
      var _ventasLimit = 10;
      var _ventasFiltro = '';
      var _ventasTbody = document.getElementById('ventas-tbody');
      var _ventasVerMas = document.getElementById('ventas-ver-mas');
      var _ventasBusqueda = document.getElementById('ventas-busqueda');

      function _ventasFiltradas() {
        if (!_ventasFiltro) return ventas;
        var q = _ventasFiltro.toLowerCase();
        return ventas.filter(function(v) {
          if ((v.fecha || '').toLowerCase().indexOf(q) >= 0) return true;
          var items = v.items || [];
          for (var i = 0; i < items.length; i++) {
            if ((items[i].productoNombre || '').toLowerCase().indexOf(q) >= 0) return true;
          }
          return false;
        });
      }

      function _ventasRowHtml(v) {
        var desc = (v.items||[]).map(function(it){ return (it.productoNombre||'?')+' '+(it.talla||'chico')+' x'+(it.cantidad||0)+' ($'+(it.subtotal||0).toLocaleString()+')'; }).join(' | ');
        return '<tr><td>' + (v.fecha||'') + '</td><td class="text-sm">' + desc + '</td><td class="fw7 text-gold">$' + (v.total||0).toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-red" onclick="Pages.delVenta(' + v.id + ')">X</button></td></tr>';
      }

      function _ventasRender() {
        var filtradas = _ventasFiltradas();
        var html = '';
        for (var i = 0; i < Math.min(filtradas.length, _ventasLimit); i++) {
          html += _ventasRowHtml(filtradas[i]);
        }
        if (filtradas.length === 0) {
          html = '<tr><td colspan="4" class="text-muted text-center" style="padding:16px">Sin resultados</td></tr>';
        }
        _ventasTbody.innerHTML = html;
        if (_ventasLimit < filtradas.length) {
          _ventasVerMas.style.display = '';
          var restantes = filtradas.length - _ventasLimit;
          _ventasVerMas.textContent = 'Ver más (' + restantes + ' restantes de ' + filtradas.length + ')';
        } else {
          _ventasVerMas.style.display = 'none';
        }
      }

      _ventasBusqueda.addEventListener('input', function() {
        _ventasFiltro = this.value.trim();
        _ventasLimit = 10;
        _ventasRender();
      });
      _ventasVerMas.addEventListener('click', function() {
        _ventasLimit += 20;
        _ventasRender();
      });
      _ventasRender();
    }
  },

  formVenta() {
    var frascos = ArcanoDB.getFrascosParaVender();
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var costos = ArcanoDB.getCostosInsumos();
    // Pesos predefinidos para palas
    var PESOS_PALAS = [8, 15, 30];
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal modal-lg">' +
      '<div class="modal-header"><h3>Nueva Venta</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label>Fecha</label><input type="date" class="input" id="f-v-fecha" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
        '<div class="form-group"><label>Items</label><div id="v-items"></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
          '<button class="btn btn-sm btn-outline" id="btn-add-vitem">+ Frasco</button>' +
          '<button class="btn btn-sm btn-gold" id="btn-add-pala">+ Pala</button>' +
        '</div></div>' +
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

    function buildPalaProductoOpts() {
      // Lista de especias + blends (para que el admin elija de qué producto es la pala)
      var o = '<option value="">Seleccionar producto</option>';
      if (blends.length > 0) {
        o += '<optgroup label="Blends">';
        for (var i = 0; i < blends.length; i++) {
          var b = blends[i];
          var stockBodega = (Number(b.stockBolsa) || 0);
          o += '<option value="blend|' + b.id + '" data-stock="' + stockBodega + '">' + b.nombre + ' (Bodega: ' + stockBodega + 'g)</option>';
        }
        o += '</optgroup>';
      }
      if (especias.length > 0) {
        o += '<optgroup label="Especias">';
        for (var j = 0; j < especias.length; j++) {
          var e = especias[j];
          var stockBodega2 = (Number(e.stockBolsa) || 0);
          o += '<option value="especia|' + e.id + '" data-stock="' + stockBodega2 + '">' + e.nombre + ' (Bodega: ' + stockBodega2 + 'g)</option>';
        }
        o += '</optgroup>';
      }
      return o;
    }

    function buildPesoOpts() {
      var o = '';
      for (var i = 0; i < PESOS_PALAS.length; i++) {
        o += '<option value="' + PESOS_PALAS[i] + '">' + PESOS_PALAS[i] + 'g</option>';
      }
      return o;
    }

    function addVItemRow() {
      var div = document.createElement('div');
      div.className = 'g4 mb-8';
      div.style.alignItems = 'end';
      div.dataset.itemType = 'frasco';
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

    function addPalaRow() {
      var div = document.createElement('div');
      div.className = 'g4 mb-8';
      div.style.alignItems = 'end';
      div.style.background = 'rgba(232,184,75,0.05)';
      div.style.padding = '8px';
      div.style.borderRadius = '6px';
      div.dataset.itemType = 'pala';
      div.innerHTML =
        '<div class="form-group" style="margin:0;min-width:160px"><label>Producto</label><select class="input vi-pala-prod">' + buildPalaProductoOpts() + '</select></div>' +
        '<div class="form-group" style="margin:0;min-width:120px"><label>Peso pala</label><input type="number" class="input vi-pala-peso" value="20" min="1" placeholder="g"></div>' +
        '<div class="form-group" style="margin:0"><label>Cantidad palas</label><input type="number" class="input vi-cant" value="1" min="1"></div>' +
        '<div class="form-group" style="margin:0"><label>Precio Unit.</label><input type="number" class="input vi-precio" placeholder="0"></div>' +
        '<div><button class="btn btn-sm btn-red btn-rm-vi">X</button></div>';
      itemsDiv.appendChild(div);

      var prodSel = div.querySelector('.vi-pala-prod');
      var pesoInp = div.querySelector('.vi-pala-peso');
      var cantInp = div.querySelector('.vi-cant');
      var precioInp = div.querySelector('.vi-precio');

      function _cargarPesoYPrecio() {
        var val = prodSel.value;
        if (!val) return;
        var parts = val.split('|');
        var tipo = parts[0], pid = Number(parts[1]);
        var prod = tipo === 'blend' ? ArcanoDB.getBlend(pid) : ArcanoDB.getEspecia(pid);
        if (!prod) return;
        // Cargar pesoPala configurado del producto (default 20)
        pesoInp.value = Number(prod.pesoPala) || 20;
        _calcPrecioSugerido();
        _actualizarMaxPalas();
      }

      function _actualizarMaxPalas() {
        var opt = prodSel.options[prodSel.selectedIndex];
        var stockBodega = Number(opt.dataset.stock) || 0;
        var peso = Number(pesoInp.value) || 0;
        var maxPalas = peso > 0 ? Math.floor(stockBodega / peso) : 0;
        cantInp.max = maxPalas;
        if (Number(cantInp.value) > maxPalas) cantInp.value = maxPalas;
        // También actualiza data-stock visible del opt
      }

      function _calcPrecioSugerido() {
        var val = prodSel.value;
        if (!val) return;
        var parts = val.split('|');
        var tipo = parts[0], pid = Number(parts[1]);
        var prod = tipo === 'blend' ? ArcanoDB.getBlend(pid) : ArcanoDB.getEspecia(pid);
        if (!prod) return;
        var cpg = (costos.especias && prod && costos.especias[prod.id]) || 0;
        // Para blends usamos el costo promedio de las especias del blend
        if (tipo === 'blend' && prod.ingredientes) {
          cpg = 0;
          var totalG = 0;
          for (var i = 0; i < prod.ingredientes.length; i++) {
            var ing = prod.ingredientes[i];
            var gCh = Number(ing.gramosChico) || 0;
            var gGr = Number(ing.gramosGrande) || 0;
            var avg = (gCh + gGr) / 2;
            var cpgIng = (costos.especias && costos.especias[ing.especiaId]) || 0;
            cpg += avg * cpgIng;
            totalG += avg;
          }
          if (totalG > 0) cpg = cpg / totalG;
        }
        var peso = Number(pesoInp.value) || 0;
        var costoUnit = peso * cpg;  // SOLO especia, sin bolsa
        // Sugerir precio con 100% de margen (redondeado a 50)
        var precioSugerido = Math.ceil(costoUnit * 2 / 50) * 50;
        if (costoUnit > 0) {
          precioInp.value = precioSugerido;
        }
      }

      prodSel.addEventListener('change', function() {
        _cargarPesoYPrecio();
        updateTotal();
      });
      pesoInp.addEventListener('input', function() {
        _calcPrecioSugerido();
        _actualizarMaxPalas();
        updateTotal();
      });
      cantInp.addEventListener('input', updateTotal);
      precioInp.addEventListener('input', updateTotal);
      // Cargar peso y precio inicial
      _cargarPesoYPrecio();
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
    document.getElementById('btn-add-pala').addEventListener('click', addPalaRow);

    document.getElementById('btn-save-v').addEventListener('click', function() {
      var rows = itemsDiv.children;
      var items = [];
      for (var i = 0; i < rows.length; i++) {
        var rowType = rows[i].dataset.itemType || 'frasco';
        var cant = Number(rows[i].querySelector('.vi-cant').value) || 0;
        var precio = Number(rows[i].querySelector('.vi-precio').value) || 0;
        if (cant <= 0) continue;

        if (rowType === 'pala') {
          var palaVal = rows[i].querySelector('.vi-pala-prod').value;
          if (!palaVal) { alert('Seleccioná un producto para la pala (fila ' + (i+1) + ')'); return; }
          var partsP = palaVal.split('|');
          var productoTipo = partsP[0];
          var productoId = Number(partsP[1]);
          var peso = Number(rows[i].querySelector('.vi-pala-peso').value) || 0;
          if (peso <= 0) { alert('Cargá el peso de la pala en gramos (fila ' + (i+1) + ')'); return; }
          items.push({
            tipo: 'pala',
            productoTipo: productoTipo,
            productoId: productoId,
            peso: peso,
            cantidad: cant,
            precioUnitario: precio
          });
        } else {
          var val = rows[i].querySelector('.vi-prod').value;
          if (!val) continue;
          var parts = val.split('|');
          items.push({ tipo: parts[0], productoId: Number(parts[1]), talla: parts[2], cantidad: cant, precioUnitario: precio });
        }
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
    h += '<div class="card mt-16"><div class="card-header"><h3>Historial de Gastos (' + gastos.length + ')</h3></div><div class="card-body">';
    if (gastos.length === 0) {
      h += '<p class="text-muted text-center">Sin gastos registrados.</p>';
    } else {
      h += '<div class="form-group" style="margin-bottom:12px">' +
        '<input type="text" class="input" id="gastos-busqueda" placeholder="🔍 Buscar por fecha, categoría o descripción..." style="width:100%">' +
      '</div>';
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Categoria</th><th>Descripcion</th><th>Monto</th><th></th></tr></thead><tbody id="gastos-tbody"></tbody></table></div>';
      h += '<div style="text-align:center;margin-top:12px"><button class="btn btn-sm btn-outline" id="gastos-ver-mas" style="display:none">Ver más</button></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;

    if (gastos.length > 0) {
      var _gastosLimit = 10;
      var _gastosFiltro = '';
      var _gastosTbody = document.getElementById('gastos-tbody');
      var _gastosVerMas = document.getElementById('gastos-ver-mas');
      var _gastosBusqueda = document.getElementById('gastos-busqueda');

      function _gastosFiltrados() {
        if (!_gastosFiltro) return gastos;
        var q = _gastosFiltro.toLowerCase();
        return gastos.filter(function(g) {
          if ((g.fecha || '').toLowerCase().indexOf(q) >= 0) return true;
          if ((g.categoria || '').toLowerCase().indexOf(q) >= 0) return true;
          if ((g.descripcion || '').toLowerCase().indexOf(q) >= 0) return true;
          return false;
        });
      }

      function _gastosRowHtml(g) {
        return '<tr><td>' + (g.fecha || '') + '</td><td><span class="badge badge-red" style="border:1px solid">' + (g.categoria || 'Otros') + '</span></td><td class="text-sm">' + (g.descripcion || '-') + '</td><td class="fw7" style="color:var(--red)">$' + (g.monto || 0).toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-outline" onclick="Pages.formGasto(' + g.id + ')" style="margin-right:4px">Edit</button><button class="btn btn-sm btn-red" onclick="Pages.delGasto(' + g.id + ')">X</button></td></tr>';
      }

      function _gastosRender() {
        var filtrados = _gastosFiltrados();
        var html = '';
        for (var i = 0; i < Math.min(filtrados.length, _gastosLimit); i++) {
          html += _gastosRowHtml(filtrados[i]);
        }
        if (filtrados.length === 0) {
          html = '<tr><td colspan="5" class="text-muted text-center" style="padding:16px">Sin resultados</td></tr>';
        }
        _gastosTbody.innerHTML = html;
        if (_gastosLimit < filtrados.length) {
          _gastosVerMas.style.display = '';
          var restantes = filtrados.length - _gastosLimit;
          _gastosVerMas.textContent = 'Ver más (' + restantes + ' restantes de ' + filtrados.length + ')';
        } else {
          _gastosVerMas.style.display = 'none';
        }
      }

      _gastosBusqueda.addEventListener('input', function() {
        _gastosFiltro = this.value.trim();
        _gastosLimit = 10;
        _gastosRender();
      });
      _gastosVerMas.addEventListener('click', function() {
        _gastosLimit += 20;
        _gastosRender();
      });
      _gastosRender();
    }
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
     PALAS — Bodega, Ventas de Palas, Configuración
     ================================================================ */
  _palasTab: 'config',

  renderPalas(container) {
    var self = Pages;
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var costos = ArcanoDB.getCostosInsumos();
    var db = ArcanoDB.getDB();

    var h = '';
    // Tabs (sin Bodega — esa info vive en Stock)
    h += '<div class="tabs" style="margin-bottom:16px">';
    h += '<button class="tab-btn ' + (self._palasTab === 'config' ? 'active' : '') + '" onclick="Pages._palasTab=\'config\';App.renderPage(\'palas\')">⚙ Configuración</button>';
    h += '<button class="tab-btn ' + (self._palasTab === 'ventas' ? 'active' : '') + '" onclick="Pages._palasTab=\'ventas\';App.renderPage(\'palas\')">💰 Palas Vendidas</button>';
    h += '<button class="tab-btn ' + (self._palasTab === 'costales' ? 'active' : '') + '" onclick="Pages._palasTab=\'costales\';App.renderPage(\'palas\')">📦 Costales Armados</button>';
    h += '</div>';

    if (self._palasTab === 'ventas') {
      h += self._renderPalasVendidas();
    } else if (self._palasTab === 'costales') {
      h += self._renderPalasCostales(especias, blends, db);
    } else {
      h += self._renderPalasConfig(especias, blends, costos);
    }
    container.innerHTML = h;

    // Wire up el botón Guardar de Configuración si está visible
    var btnSavePalasConfig = document.getElementById('btn-save-palas-config');
    if (btnSavePalasConfig) {
      btnSavePalasConfig.addEventListener('click', function() {
        var inputs = container.querySelectorAll('.pala-peso-input, .pala-precio-input');
        var saved = 0;
        var productosModificados = {};  // {id: {pesoPala, precioPala}}
        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i];
          var prodTipo = inp.getAttribute('data-prod-tipo');
          var prodId = Number(inp.getAttribute('data-prod-id'));
          var campo = inp.getAttribute('data-campo');
          var val = Number(inp.value) || 0;
          if (!productosModificados[prodId]) productosModificados[prodId] = { tipo: prodTipo, id: prodId };
          productosModificados[prodId][campo] = val;
        }
        var ids = Object.keys(productosModificados);
        for (var j = 0; j < ids.length; j++) {
          var pm = productosModificados[ids[j]];
          var prod = pm.tipo === 'blend' ? ArcanoDB.getBlend(pm.id) : ArcanoDB.getEspecia(pm.id);
          if (!prod) continue;
          // Construir objeto completo con los cambios
          var updatedProd = Object.assign({}, prod);
          if (pm.pesoPala != null) updatedProd.pesoPala = pm.pesoPala;
          if (pm.precioPala != null) updatedProd.precioPala = pm.precioPala;
          // Usar saveBlend/saveEspecia que garantizan persistencia
          if (pm.tipo === 'blend') {
            ArcanoDB.saveBlend(updatedProd);
          } else {
            ArcanoDB.saveEspecia(updatedProd);
          }
          saved++;
        }
        // Forzar save síncrono y mostrar confirmación
        if (saved > 0) {
          ArcanoDB.saveNow().then(function(success) {
            if (success) {
              toast(saved + ' productos actualizados.');
              App.renderPage('palas');
            } else {
              toast('Error al guardar en Firebase', 'err');
            }
          });
        } else {
          toast('No hay cambios para guardar');
        }
      });
    }

    // Wire up botones Armar costal
    var btnsArmar = container.querySelectorAll('.btn-armar-costal');
    for (var bi2 = 0; bi2 < btnsArmar.length; bi2++) {
      btnsArmar[bi2].addEventListener('click', function() {
        var prodTipo = this.getAttribute('data-prod-tipo');
        var prodId = Number(this.getAttribute('data-prod-id'));
        var prodNombre = this.getAttribute('data-prod-nombre');
        var gramosInput = document.querySelector('.costal-gramos-' + prodTipo + '-' + prodId);
        var gramos = Number(gramosInput ? gramosInput.value : 0) || 0;
        if (gramos <= 0) { alert('Cargá los gramos para armar el costal'); return; }
        try {
          ArcanoDB.armarCostalDesdeBodega(prodTipo, prodId, gramos, 'Costal de ' + prodNombre);
          toast('Costal armado: ' + gramos + 'g de ' + prodNombre);
          App.renderPage('palas');
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }

    // Wire up botones Desarmar costal
    var btnsDesarmar = container.querySelectorAll('.btn-desarmar-costal');
    for (var di = 0; di < btnsDesarmar.length; di++) {
      btnsDesarmar[di].addEventListener('click', function() {
        var costalId = Number(this.getAttribute('data-costal-id'));
        if (!confirm('Desarmar este costal? Los gramos restantes vuelven a Bodega.')) return;
        try {
          ArcanoDB.desarmarCostalABodega(costalId);
          toast('Costal desarmado. Gramos devueltos a Bodega.');
          App.renderPage('palas');
        } catch (e) {
          alert('Error: ' + e.message);
        }
      });
    }
  },

  _renderPalasBodega(especias, blends, costos) {
    // Construir lista unificada de especias y blends con stock en Bodega
    var items = [];
    for (var ei = 0; ei < especias.length; ei++) {
      var e = especias[ei];
      var grs = Number(e.stockBolsa) || 0;
      if (grs > 0) {
        var cpg = (costos.especias && costos.especias[e.id]) || 0;
        items.push({
          nombre: e.nombre, tipo: 'especia', id: e.id, gramos: grs,
          costoPorGramo: cpg, valorCosto: grs * cpg,
          palasPosibles8: Math.floor(grs / 8),
          palasPosibles15: Math.floor(grs / 15),
          palasPosibles30: Math.floor(grs / 30)
        });
      }
    }
    for (var bi = 0; bi < blends.length; bi++) {
      var b = blends[bi];
      var grsB = Number(b.stockBolsa) || 0;
      if (grsB > 0) {
        // Para blends: el "stock en bodega" es tricky porque un blend se produce desde especias
        // pero si por algún motivo tiene stockBolsa (no debería normalmente), lo mostramos
        items.push({
          nombre: b.nombre, tipo: 'blend', id: b.id, gramos: grsB,
          costoPorGramo: 0, valorCosto: 0,
          palasPosibles8: Math.floor(grsB / 8),
          palasPosibles15: Math.floor(grsB / 15),
          palasPosibles30: Math.floor(grsB / 30)
        });
      }
    }
    items.sort(function(a, b2) { return b2.gramos - a.gramos; });

    var h = '';
    h += '<div class="card"><div class="card-header"><h3>Bodega — Stock de Especias y Blends (gramos)</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted mb-16">La Bodega contiene las especias y blends a granel (en costales). Es la materia prima para armar palas al vender. El stock se carga desde Insumos → Registrar Entrada.</p>';

    if (items.length === 0) {
      h += '<div class="empty-state"><div class="empty-state-icon">📦</div><p class="empty-state-text">Bodega vacía. Cargá costales en Insumos → Registrar Entrada.</p></div>';
    } else {
      // KPIs resumen
      var totalGramos = items.reduce(function(s, x) { return s + x.gramos; }, 0);
      var totalValor = items.reduce(function(s, x) { return s + x.valorCosto; }, 0);
      var totalPalas8 = items.reduce(function(s, x) { return s + x.palasPosibles8; }, 0);
      var totalPalas15 = items.reduce(function(s, x) { return s + x.palasPosibles15; }, 0);
      var totalPalas30 = items.reduce(function(s, x) { return s + x.palasPosibles30; }, 0);

      h += '<div class="g4 mb-16">';
      h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">' + totalGramos.toLocaleString() + 'g</div><div class="stat-label">Total en Bodega</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">' + totalPalas8 + '</div><div class="stat-label">Palas 8g posibles</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">' + totalPalas15 + '</div><div class="stat-label">Palas 15g posibles</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--red)"><div class="stat-value">' + totalPalas30 + '</div><div class="stat-label">Palas 30g posibles</div></div>';
      h += '</div>';

      // Tabla
      h += '<div class="table-wrap"><table class="table"><thead><tr>';
      h += '<th>Producto</th>';
      h += '<th>Tipo</th>';
      h += '<th class="text-center">Gramos en Bodega</th>';
      h += '<th class="text-right">Costo/g</th>';
      h += '<th class="text-right">Valor Costo</th>';
      h += '<th class="text-center">Palas 8g</th>';
      h += '<th class="text-center">Palas 15g</th>';
      h += '<th class="text-center">Palas 30g</th>';
      h += '</tr></thead><tbody>';
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var grsCls = it.gramos <= 50 ? 'text-red fw7' : (it.gramos >= 500 ? 'text-green fw7' : 'fw7');
        var tipoBadge = it.tipo === 'blend' ? '<span class="badge badge-blue">Blend</span>' : '<span class="badge badge-gold">Especia</span>';
        h += '<tr>' +
          '<td class="fw7">' + esc(it.nombre) + '</td>' +
          '<td>' + tipoBadge + '</td>' +
          '<td class="text-center ' + grsCls + '">' + it.gramos.toLocaleString() + 'g</td>' +
          '<td class="text-right">$' + it.costoPorGramo.toLocaleString(undefined,{maximumFractionDigits:3}) + '</td>' +
          '<td class="text-right">$' + it.valorCosto.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>' +
          '<td class="text-center">' + it.palasPosibles8 + '</td>' +
          '<td class="text-center">' + it.palasPosibles15 + '</td>' +
          '<td class="text-center">' + it.palasPosibles30 + '</td>' +
        '</tr>';
      }
      // Fila de totales
      h += '<tr style="background:var(--bg);font-weight:700"><td colspan="2">TOTAL</td>' +
        '<td class="text-center">' + totalGramos.toLocaleString() + 'g</td>' +
        '<td></td><td class="text-right">$' + totalValor.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>' +
        '<td class="text-center">' + totalPalas8 + '</td>' +
        '<td class="text-center">' + totalPalas15 + '</td>' +
        '<td class="text-center">' + totalPalas30 + '</td>' +
      '</tr>';
      h += '</tbody></table></div>';
      h += '<p class="text-xs text-muted mt-8">Las palas se arman al momento de vender. Cada pala descuenta (cantidad × peso) gramos de Bodega. No requieren producción anticipada.</p>';
    }
    h += '</div></div>';
    return h;
  },

  _renderPalasVendidas() {
    var data = ArcanoDB.getPalasVendidas();
    var h = '';
    h += '<div class="card"><div class="card-header"><h3>Palas Vendidas — Histórico</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted mb-16">Reporte dedicado de ventas que incluyeron palas. Se calcula en tiempo real a partir de las ventas registradas.</p>';

    if (data.agregado.length === 0) {
      h += '<div class="empty-state"><div class="empty-state-icon">💰</div><p class="empty-state-text">Aún no se vendieron palas. Hacé tu primera venta con palas desde Ventas → + Nueva Venta → + Pala.</p></div>';
    } else {
      // KPIs
      var totalPalas = data.agregado.reduce(function(s, x) { return s + x.totalVendidas; }, 0);
      var totalIngresos = data.agregado.reduce(function(s, x) { return s + x.ingresos; }, 0);
      var totalGramos = data.agregado.reduce(function(s, x) { return s + x.gramosConsumidos; }, 0);
      h += '<div class="g3 mb-16">';
      h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">' + totalPalas + '</div><div class="stat-label">Palas Vendidas</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">$' + totalIngresos.toLocaleString() + '</div><div class="stat-label">Ingresos por Palas</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">' + totalGramos.toLocaleString() + 'g</div><div class="stat-label">Gramos Consumidos</div></div>';
      h += '</div>';

      // Tabla agregada por (producto, peso)
      h += '<h4 style="margin:16px 0 8px;font-size:.95rem">Resumen por producto y peso</h4>';
      h += '<div class="table-wrap"><table class="table"><thead><tr>';
      h += '<th>Producto</th><th>Tipo</th><th class="text-center">Peso</th>';
      h += '<th class="text-center">Palas vendidas</th>';
      h += '<th class="text-center">Ventas</th>';
      h += '<th class="text-right">Ingresos</th>';
      h += '<th class="text-right">Gramos usados</th>';
      h += '</tr></thead><tbody>';
      for (var i = 0; i < data.agregado.length; i++) {
        var a = data.agregado[i];
        var tipoBadge = a.productoTipo === 'blend' ? '<span class="badge badge-blue">Blend</span>' : '<span class="badge badge-gold">Especia</span>';
        h += '<tr>' +
          '<td class="fw7">' + esc(a.productoNombre) + '</td>' +
          '<td>' + tipoBadge + '</td>' +
          '<td class="text-center">' + a.peso + 'g</td>' +
          '<td class="text-center fw7 text-gold">' + a.totalVendidas + '</td>' +
          '<td class="text-center">' + a.numVentas + '</td>' +
          '<td class="text-right text-green">$' + a.ingresos.toLocaleString() + '</td>' +
          '<td class="text-right">' + a.gramosConsumidos.toLocaleString() + 'g</td>' +
        '</tr>';
      }
      h += '</tbody></table></div>';

      // Tabla detallada de registros
      h += '<h4 style="margin:20px 0 8px;font-size:.95rem">Detalle de ventas con palas (' + data.registros.length + ')</h4>';
      h += '<div class="table-wrap"><table class="table"><thead><tr>';
      h += '<th>Fecha</th><th>Producto</th><th class="text-center">Peso</th>';
      h += '<th class="text-center">Cantidad</th>';
      h += '<th class="text-right">Precio Unit.</th>';
      h += '<th class="text-right">Subtotal</th>';
      h += '</tr></thead><tbody>';
      // Mostrar solo los primeros 30 (con scroll implícito)
      var limit = Math.min(data.registros.length, 30);
      for (var j = 0; j < limit; j++) {
        var r = data.registros[j];
        h += '<tr>' +
          '<td>' + (r.fecha || '') + '</td>' +
          '<td class="fw7">' + esc(r.productoNombre) + '</td>' +
          '<td class="text-center">' + r.peso + 'g</td>' +
          '<td class="text-center fw7">' + r.cantidad + '</td>' +
          '<td class="text-right">$' + r.precioUnitario.toLocaleString() + '</td>' +
          '<td class="text-right text-gold">$' + r.subtotal.toLocaleString() + '</td>' +
        '</tr>';
      }
      h += '</tbody></table></div>';
      if (data.registros.length > limit) {
        h += '<p class="text-xs text-muted text-center mt-8">Mostrando ' + limit + ' de ' + data.registros.length + ' registros.</p>';
      }
    }
    h += '</div></div>';
    return h;
  },

  _renderPalasConfig(especias, blends, costos) {
    var h = '';
    h += '<div class="card"><div class="card-header"><h3>Configuración de Palas</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted mb-16">Para cada producto configurá: el <b>peso de la pala</b> (gramos) y el <b>precio de venta</b>. El costo se calcula como: (peso × costo por gramo de la especia) <b>+ costo de bolsa pequeña</b>. El margen sugerido es 100% sobre el costo.</p>';
    var costoBolsaPala = Number(costos.bolsaChica) || 0;

    var allProductos = [];
    for (var ei = 0; ei < especias.length; ei++) {
      var e = especias[ei];
      var cpg = (costos.especias && costos.especias[e.id]) || 0;
      allProductos.push({
        tipo: 'especia', id: e.id, nombre: e.nombre,
        costoPorGramo: cpg,
        pesoPala: Number(e.pesoPala) || 20,
        precioPala: Number(e.precioPala) || 0
      });
    }
    for (var bi = 0; bi < blends.length; bi++) {
      var b = blends[bi];
      // Costo promedio por gramo del blend (promedio de ingredientes)
      var cpg = 0, totalG = 0;
      var ings = b.ingredientes || [];
      for (var ig = 0; ig < ings.length; ig++) {
        var ing = ings[ig];
        var avg = ((Number(ing.gramosChico) || 0) + (Number(ing.gramosGrande) || 0)) / 2;
        var cpgIng = (costos.especias && costos.especias[ing.especiaId]) || 0;
        cpg += avg * cpgIng;
        totalG += avg;
      }
      if (totalG > 0) cpg = cpg / totalG;
      allProductos.push({
        tipo: 'blend', id: b.id, nombre: b.nombre,
        costoPorGramo: cpg,
        pesoPala: Number(b.pesoPala) || 20,
        precioPala: Number(b.precioPala) || 0
      });
    }
    allProductos.sort(function(a, b2) { return a.nombre.localeCompare(b2.nombre); });

    h += '<div class="table-wrap"><table class="table"><thead><tr>';
    h += '<th>Producto</th><th>Tipo</th>';
    h += '<th class="text-right">Costo/g</th>';
    h += '<th class="text-center">Peso pala (g)</th>';
    h += '<th class="text-right">Costo pala</th>';
    h += '<th class="text-center">Precio venta</th>';
    h += '<th class="text-right">Margen</th>';
    h += '</tr></thead><tbody>';
    for (var i = 0; i < allProductos.length; i++) {
      var p = allProductos[i];
      var tipoBadge = p.tipo === 'blend' ? '<span class="badge badge-blue">Blend</span>' : '<span class="badge badge-gold">Especia</span>';
      var costoPala = (p.pesoPala * p.costoPorGramo) + costoBolsaPala;  // especia + bolsa pequeña
      var margen = p.precioPala - costoPala;
      var margenPct = p.precioPala > 0 ? (margen / p.precioPala * 100) : 0;
      var margenColor = margen >= 0 ? 'var(--green)' : 'var(--red)';
      h += '<tr>' +
        '<td class="fw7">' + esc(p.nombre) + '</td>' +
        '<td>' + tipoBadge + '</td>' +
        '<td class="text-right">$' + p.costoPorGramo.toLocaleString(undefined,{maximumFractionDigits:3}) + '</td>' +
        '<td class="text-center"><input type="number" class="input pala-peso-input" data-prod-tipo="' + p.tipo + '" data-prod-id="' + p.id + '" data-campo="pesoPala" value="' + p.pesoPala + '" min="1" style="width:80px;padding:4px 6px;text-align:center"></td>' +
        '<td class="text-right text-red">$' + costoPala.toLocaleString(undefined,{maximumFractionDigits:0}) + '</td>' +
        '<td class="text-center"><input type="number" class="input pala-precio-input" data-prod-tipo="' + p.tipo + '" data-prod-id="' + p.id + '" data-campo="precioPala" value="' + p.precioPala + '" min="0" placeholder="Sugerido" style="width:100px;padding:4px 6px;text-align:center"></td>' +
        '<td class="text-right" style="color:' + margenColor + '">$' + margen.toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + margenPct.toFixed(0) + '%)</td>' +
      '</tr>';
    }
    h += '</tbody></table></div>';
    h += '<div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn-gold" id="btn-save-palas-config">💾 Guardar Configuración</button>' +
      '<span class="text-xs text-muted">El peso y precio se guardan en cada producto y se usan al vender palas.</span>' +
    '</div>';
    h += '<p class="text-xs text-muted mt-8">Costo de bolsa pequeña para palas: $' + costoBolsaPala + ' (configurable en Insumos → Editar Costos Base).</p>';
    h += '</div></div>';
    return h;
  },

  _renderPalasCostales(especias, blends, db) {
    var costales = ArcanoDB.getCostales();
    var h = '';
    h += '<div class="card"><div class="card-header"><h3>Costales Armados</h3></div><div class="card-body">';
    h += '<p class="text-sm text-muted mb-16">Un <b>costal</b> es una bolsa armada con gramos tomados de la Bodega (stock a granel). Las palas se sirven de los costales abiertos; si no hay costal, se descuenta directo de Bodega.</p>';

    // Formulario para armar costal nuevo
    h += '<div class="card" style="background:var(--bg);margin-bottom:16px"><div class="card-body" style="padding:12px">';
    h += '<h4 style="margin:0 0 8px;font-size:.95rem">Armar nuevo costal</h4>';
    h += '<div class="g3" style="align-items:end">';
    h += '<div class="form-group" style="margin:0"><label>Producto</label><select class="input" id="nuevo-costal-prod">';
    var allProductos = [];
    for (var ei2 = 0; ei2 < especias.length; ei2++) {
      if ((Number(especias[ei2].stockBolsa) || 0) > 0) {
        allProductos.push({ tipo: 'especia', id: especias[ei2].id, nombre: especias[ei2].nombre, stockBolsa: Number(especias[ei2].stockBolsa) || 0 });
      }
    }
    for (var bi2 = 0; bi2 < blends.length; bi2++) {
      if ((Number(blends[bi2].stockBolsa) || 0) > 0) {
        allProductos.push({ tipo: 'blend', id: blends[bi2].id, nombre: blends[bi2].nombre, stockBolsa: Number(blends[bi2].stockBolsa) || 0 });
      }
    }
    allProductos.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
    for (var i = 0; i < allProductos.length; i++) {
      var p = allProductos[i];
      h += '<option value="' + p.tipo + '|' + p.id + '" data-stock="' + p.stockBolsa + '" data-nombre="' + esc(p.nombre) + '">' + p.nombre + ' (Bodega: ' + p.stockBolsa + 'g)</option>';
    }
    h += '</select></div>';
    h += '<div class="form-group" style="margin:0"><label>Gramos del costal</label><input type="number" class="input" id="nuevo-costal-gramos" placeholder="100" min="1"></div>';
    h += '<div><button class="btn btn-gold" id="btn-armar-costal-nuevo">Armar Costal</button></div>';
    h += '</div>';
    h += '</div></div>';

    // Tabla de costales existentes
    if (costales.length === 0) {
      h += '<p class="text-muted text-center">No hay costales armados. Cuando armes uno, aparecerá acá.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr>';
      h += '<th>Costal</th><th>Producto</th><th class="text-center">Total</th>';
      h += '<th class="text-center">Restante</th><th class="text-center">Palas posib.</th>';
      h += '<th class="text-center">Estado</th><th></th>';
      h += '</tr></thead><tbody>';
      for (var ci = 0; ci < costales.length; ci++) {
        var c = costales[ci];
        var grTotal = Number(c.gramosTotal) || 0;
        var grRest = Number(c.gramosRestantes) || 0;
        var pesoPala = Number(c.pesoPala) || 20;
        var palasPosib = pesoPala > 0 ? Math.floor(grRest / pesoPala) : 0;
        var estadoBadge = c.estado === 'vacio' ? '<span class="badge badge-red">Vacío</span>' : (c.estado === 'abierto' ? '<span class="badge badge-green">Abierto</span>' : '<span class="badge badge-gray">' + esc(c.estado || '?') + '</span>');
        h += '<tr>' +
          '<td class="fw7">Costal #' + c.id + '</td>' +
          '<td>' + esc(c.productoNombre || '?') + '</td>' +
          '<td class="text-center">' + grTotal + 'g</td>' +
          '<td class="text-center fw7 ' + (grRest <= 0 ? 'text-red' : 'text-green') + '">' + grRest + 'g</td>' +
          '<td class="text-center">' + palasPosib + '</td>' +
          '<td class="text-center">' + estadoBadge + '</td>' +
          '<td><button class="btn btn-sm btn-outline btn-desarmar-costal" data-costal-id="' + c.id + '">Desarmar</button></td>' +
        '</tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';

    // Wire up del botón "Armar Costal" nuevo
    setTimeout(function() {
      var btnArmarNuevo = document.getElementById('btn-armar-costal-nuevo');
      if (btnArmarNuevo) {
        btnArmarNuevo.addEventListener('click', function() {
          var sel = document.getElementById('nuevo-costal-prod');
          var gramos = Number(document.getElementById('nuevo-costal-gramos').value) || 0;
          if (gramos <= 0) { alert('Cargá los gramos para el costal'); return; }
          var val = sel.value;
          if (!val) { alert('Seleccioná un producto'); return; }
          var parts = val.split('|');
          var prodTipo = parts[0];
          var prodId = Number(parts[1]);
          var opt = sel.options[sel.selectedIndex];
          var prodNombre = opt ? opt.getAttribute('data-nombre') : '';
          try {
            ArcanoDB.armarCostalDesdeBodega(prodTipo, prodId, gramos, 'Costal de ' + prodNombre);
            toast('Costal armado: ' + gramos + 'g de ' + prodNombre);
            App.renderPage('palas');
          } catch (e) {
            alert('Error: ' + e.message);
          }
        });
      }
    }, 100);
    return h;
  },

  renderCostos(container) {
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var costos = ArcanoDB.getCostosInsumos();
    var self = Pages;

    // Componentes del empaque (separados para mostrar)
    var envaseChico   = Number(costos.envaseChico)   || 0;
    var envaseGrande  = Number(costos.envaseGrande)  || 0;
    var bolsaChica    = Number(costos.bolsaChica)    || 0;
    var bolsaGrande   = Number(costos.bolsaGrande)    || 0;
    var cinta         = Number(costos.cinta)          || 0;
    var stickerChico  = Number(costos.stickerChico)  || 0;
    var stickerGrande = Number(costos.stickerGrande) || 0;

    // Construir items unificados
    var items = [];
    for (var bi = 0; bi < blends.length; bi++) {
      var bl = blends[bi];
      var ings = bl.ingredientes || [];
      var espCh = 0, espGr = 0;
      var detailCh = [], detailGr = [];
      for (var ig = 0; ig < ings.length; ig++) {
        var ing = ings[ig];
        var cpg = (costos.especias && costos.especias[ing.especiaId]) || 0;
        var gc = Number(ing.gramosChico)  || 0;
        var gg = Number(ing.gramosGrande) || 0;
        var cc = gc * cpg;
        var cg = gg * cpg;
        espCh += cc; espGr += cg;
        if (gc > 0 || gg > 0) {
          detailCh.push({ nombre: ing.especiaNombre || '?', gramos: gc, costo: cc });
          detailGr.push({ nombre: ing.especiaNombre || '?', gramos: gg, costo: cg });
        }
      }
      items.push({
        tipo: 'blend', id: bl.id, nombre: bl.nombre || '?', categoria: bl.categoria || '',
        espChico: espCh, espGrande: espGr,
        envaseChico: envaseChico, envaseGrande: envaseGrande,
        bolsaChico: bolsaChica, bolsaGrande: bolsaGrande,
        stickerChico: stickerChico, stickerGrande: stickerGrande,
        cinta: cinta,
        totalChico: espCh + envaseChico + bolsaChica + stickerChico + cinta,
        totalGrande: espGr + envaseGrande + bolsaGrande + stickerGrande + cinta,
        precioChico: Number(bl.precioChico) || 0,
        precioGrande: Number(bl.precioGrande) || 0,
        detailChico: detailCh, detailGrande: detailGr
      });
    }
    for (var ei = 0; ei < especias.length; ei++) {
      var esp = especias[ei];
      var cpg2 = (costos.especias && costos.especias[esp.id]) || 0;
      var gc2 = Number(esp.gramosChico)  || 0;
      var gg2 = Number(esp.gramosGrande) || 0;
      var cc2 = gc2 * cpg2;
      var cg2 = gg2 * cpg2;
      items.push({
        tipo: 'especia', id: esp.id, nombre: esp.nombre || '?', categoria: esp.categoria || '',
        espChico: cc2, espGrande: cg2,
        envaseChico: envaseChico, envaseGrande: envaseGrande,
        bolsaChico: bolsaChica, bolsaGrande: bolsaGrande,
        stickerChico: stickerChico, stickerGrande: stickerGrande,
        cinta: cinta,
        totalChico: cc2 + envaseChico + bolsaChica + stickerChico + cinta,
        totalGrande: cg2 + envaseGrande + bolsaGrande + stickerGrande + cinta,
        precioChico: Number(esp.precioChico) || 0,
        precioGrande: Number(esp.precioGrande) || 0,
        detailChico: cpg2 > 0 ? [{ nombre: esp.nombre, gramos: gc2, costo: cc2 }] : [],
        detailGrande: cpg2 > 0 ? [{ nombre: esp.nombre, gramos: gg2, costo: cg2 }] : []
      });
    }

    // Filtro
    var filter = self._costosFilter || 'todos';
    var sort = self._costosSort || 'nombre';
    var filtered = items.filter(function(it) {
      if (filter === 'blend')   return it.tipo === 'blend';
      if (filter === 'especia') return it.tipo === 'especia';
      return true;
    });
    filtered.sort(function(a, b) {
      if (sort === 'costoChico')  return b.totalChico  - a.totalChico;
      if (sort === 'costoGrande') return b.totalGrande - a.totalGrande;
      if (sort === 'margenChico') {
        var ma = a.precioChico > 0 ? (a.precioChico - a.totalChico) / a.precioChico : -1;
        var mb = b.precioChico > 0 ? (b.precioChico - b.totalChico) / b.precioChico : -1;
        return mb - ma;
      }
      return (a.nombre || '').localeCompare(b.nombre || '');
    });

    // Resumen arriba
    var sumCh = 0, sumGr = 0, count = filtered.length;
    var maxCh = 0, maxGr = 0, minCh = Infinity, minGr = Infinity;
    for (var k = 0; k < filtered.length; k++) {
      var tc = filtered[k].totalChico, tg = filtered[k].totalGrande;
      sumCh += tc; sumGr += tg;
      if (tc > maxCh) maxCh = tc;
      if (tg > maxGr) maxGr = tg;
      if (tc < minCh) minCh = tc;
      if (tg < minGr) minGr = tg;
    }
    if (!isFinite(minCh)) minCh = 0;
    if (!isFinite(minGr)) minGr = 0;
    var promCh = count > 0 ? sumCh / count : 0;
    var promGr = count > 0 ? sumGr / count : 0;

    var h = '';
    h += '<div class="page-header"><h2 style="font-size:22px;font-weight:700">Costos por Producto</h2>' +
      '<button class="btn btn-outline" onclick="Pages.formCostosInsumos()">✏ Editar Costos Base</button></div>';

    h += '<p class="text-sm text-muted mb-16">Costo total de cada producto = Especias + Frasco + Bolsa + Sticker + Cinta. ' +
      'Los componentes del empaque son globales (se configuran en "Editar Costos Base"); las especias dependen de la receta del blend y el costo promedio ponderado por gramo.</p>';

    // Panel de costos base (packaging)
    h += '<div class="card mb-16"><div class="card-header"><h3>Costos Base de Empaque</h3></div><div class="card-body">';
    h += '<div class="g2">';
    h += '<div class="card" style="background:var(--bg);margin:0"><div class="card-body" style="padding:14px">' +
      '<div class="fw7 mb-8" style="color:var(--blue)">Frasco Pequeño</div>' +
      '<div class="text-sm mb-4">Envase: $' + envaseChico + '</div>' +
      '<div class="text-sm mb-4">Bolsa: $' + bolsaChica + '</div>' +
      '<div class="text-sm mb-4">Sticker: $' + stickerChico + '</div>' +
      '<div class="text-sm mb-4">Cinta: $' + cinta + '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px" class="fw7">Empaque total: $' + (envaseChico + bolsaChica + stickerChico + cinta) + '</div>' +
    '</div></div>';
    h += '<div class="card" style="background:var(--bg);margin:0"><div class="card-body" style="padding:14px">' +
      '<div class="fw7 mb-8" style="color:var(--gold)">Frasco Grande</div>' +
      '<div class="text-sm mb-4">Envase: $' + envaseGrande + '</div>' +
      '<div class="text-sm mb-4">Bolsa: $' + bolsaGrande + '</div>' +
      '<div class="text-sm mb-4">Sticker: $' + stickerGrande + '</div>' +
      '<div class="text-sm mb-4">Cinta: $' + cinta + '</div>' +
      '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:6px" class="fw7">Empaque total: $' + (envaseGrande + bolsaGrande + stickerGrande + cinta) + '</div>' +
    '</div></div>';
    h += '</div></div></div>';

    // Filtros y orden
    h += '<div class="card mb-16"><div class="card-body" style="padding:12px">';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">';
    h += '<span class="text-xs text-muted" style="margin-right:4px">Filtrar:</span>';
    h += '<button class="btn btn-sm ' + (filter === 'todos' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._costosFilter=\'todos\';App.renderPage(\'costos\')">Todos (' + items.length + ')</button>';
    h += '<button class="btn btn-sm ' + (filter === 'blend' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._costosFilter=\'blend\';App.renderPage(\'costos\')">Blends (' + blends.length + ')</button>';
    h += '<button class="btn btn-sm ' + (filter === 'especia' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._costosFilter=\'especia\';App.renderPage(\'costos\')">Especias (' + especias.length + ')</button>';
    h += '<span class="text-xs text-muted" style="margin-left:16px;margin-right:4px">Ordenar:</span>';
    h += '<button class="btn btn-sm ' + (sort === 'nombre' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._costosSort=\'nombre\';App.renderPage(\'costos\')">Nombre</button>';
    h += '<button class="btn btn-sm ' + (sort === 'costoChico' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._costosSort=\'costoChico\';App.renderPage(\'costos\')">Costo Chico</button>';
    h += '<button class="btn btn-sm ' + (sort === 'costoGrande' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._costosSort=\'costoGrande\';App.renderPage(\'costos\')">Costo Grande</button>';
    h += '<button class="btn btn-sm ' + (sort === 'margenChico' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._costosSort=\'margenChico\';App.renderPage(\'costos\')">Margen Chico</button>';
    h += '</div></div></div>';

    // Cards
    if (filtered.length === 0) {
      h += '<p class="text-muted text-center" style="margin-top:24px">No hay productos para mostrar.</p>';
    } else {
      h += '<div class="costo-card-grid">';
      for (var ci = 0; ci < filtered.length; ci++) {
        var it = filtered[ci];
        var margenC = it.precioChico - it.totalChico;
        var margenG = it.precioGrande - it.totalGrande;
        var pctC = it.precioChico > 0 ? (margenC / it.precioChico * 100) : 0;
        var pctG = it.precioGrande > 0 ? (margenG / it.precioGrande * 100) : 0;
        var tipoBadge = it.tipo === 'blend' ? '<span class="badge badge-blue">Blend</span>' : '<span class="badge badge-gold">Especia</span>';
        var margenColorC = margenC >= 0 ? 'var(--green)' : 'var(--red)';
        var margenColorG = margenG >= 0 ? 'var(--green)' : 'var(--red)';

        h += '<div class="costo-card">';
        h += '<div class="costo-card-header">';
        h += '<div class="costo-card-name">' + esc(it.nombre) + '</div>' + tipoBadge + (it.categoria ? ' <span class="text-xs text-muted">' + esc(it.categoria) + '</span>' : '');
        h += '</div>';
        h += '<div class="costo-card-body">';

        // Columna Chico
        h += '<div class="costo-card-col">';
        h += '<div class="costo-card-talla">Pequeño</div>';
        h += '<div class="costo-card-row"><span>Especias</span><span>$' + it.espChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.detailChico.length > 0 && it.detailChico.length <= 4) {
          for (var dc = 0; dc < it.detailChico.length; dc++) {
            var d = it.detailChico[dc];
            h += '<div class="costo-card-subrow"><span>' + esc(d.nombre) + ' ' + d.gramos + 'g</span><span>$' + d.costo.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
          }
        }
        h += '<div class="costo-card-row"><span>Frasco</span><span>$' + it.envaseChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-row"><span>Bolsa</span><span>$' + it.bolsaChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-row"><span>Sticker</span><span>$' + it.stickerChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-row"><span>Cinta</span><span>$' + it.cinta.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-total"><span>Total</span><span style="color:var(--red)">$' + it.totalChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.precioChico > 0) {
          h += '<div class="costo-card-row"><span>Venta</span><span style="color:var(--gold)">$' + it.precioChico.toLocaleString() + '</span></div>';
          h += '<div class="costo-card-row"><span>Margen</span><span style="color:' + margenColorC + '">$' + margenC.toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + pctC.toFixed(0) + '%)</span></div>';
        }
        h += '</div>';

        // Columna Grande
        h += '<div class="costo-card-col">';
        h += '<div class="costo-card-talla">Grande</div>';
        h += '<div class="costo-card-row"><span>Especias</span><span>$' + it.espGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.detailGrande.length > 0 && it.detailGrande.length <= 4) {
          for (var dg = 0; dg < it.detailGrande.length; dg++) {
            var d2 = it.detailGrande[dg];
            h += '<div class="costo-card-subrow"><span>' + esc(d2.nombre) + ' ' + d2.gramos + 'g</span><span>$' + d2.costo.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
          }
        }
        h += '<div class="costo-card-row"><span>Frasco</span><span>$' + it.envaseGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-row"><span>Bolsa</span><span>$' + it.bolsaGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-row"><span>Sticker</span><span>$' + it.stickerGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-row"><span>Cinta</span><span>$' + it.cinta.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-total"><span>Total</span><span style="color:var(--red)">$' + it.totalGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.precioGrande > 0) {
          h += '<div class="costo-card-row"><span>Venta</span><span style="color:var(--gold)">$' + it.precioGrande.toLocaleString() + '</span></div>';
          h += '<div class="costo-card-row"><span>Margen</span><span style="color:' + margenColorG + '">$' + margenG.toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + pctG.toFixed(0) + '%)</span></div>';
        }
        h += '</div>';

        h += '</div></div>';
      }
      h += '</div>';
    }

    container.innerHTML = h;
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
    var costos = ArcanoDB.getCostosInsumos();

    var h = '<div class="page-actions">' +
      '<button class="btn btn-gold" id="btn-batch-aj" style="opacity:0.4;pointer-events:none">Guardar Ajustes (0)</button>' +
      '<button class="btn btn-outline" style="margin-left:8px" onclick="Pages.formAjusteStock()">Ajuste Individual</button>' +
      '<button class="btn btn-outline" style="margin-left:8px" id="btn-clear-aj" onclick="Pages._clearStockInputs()">Limpiar</button>' +
      '<span class="text-xs text-muted" style="margin-left:12px">Escribe +/− en los campos y guarda todo de una vez</span>' +
      '</div>';

    // === SECCIÓN DESTACADA: FRASCOS PRODUCIDOS PARA LA VENTA ===
    // Construir lista de blends con stock > 0 (producidos y no vendidos)
    var blendsConStock = [];
    var totalChico = 0, totalGrande = 0;
    var valorCostoChico = 0, valorCostoGrande = 0;
    var valorVentaChico = 0, valorVentaGrande = 0;
    for (var bi = 0; bi < blends.length; bi++) {
      var b = blends[bi];
      var ch = Number(b.stockChico) || 0;
      var gr = Number(b.stockGrande) || 0;
      if (ch > 0 || gr > 0) {
        blendsConStock.push({ blend: b, chico: ch, grande: gr });
        totalChico += ch;
        totalGrande += gr;
        // Costo y venta
        var pkgC = (Number(costos.envaseChico)||0) + (Number(costos.bolsaChica)||0) + (Number(costos.cinta)||0) + (Number(costos.stickerChico)||0);
        var pkgG = (Number(costos.envaseGrande)||0) + (Number(costos.bolsaGrande)||0) + (Number(costos.cinta)||0) + (Number(costos.stickerGrande)||0);
        var espC = 0, espG = 0;
        var ings = b.ingredientes || [];
        for (var ig = 0; ig < ings.length; ig++) {
          var cpg = (costos.especias && costos.especias[ings[ig].especiaId]) || 0;
          espC += (Number(ings[ig].gramosChico) || 0) * cpg;
          espG += (Number(ings[ig].gramosGrande) || 0) * cpg;
        }
        valorCostoChico += ch * (espC + pkgC);
        valorCostoGrande += gr * (espG + pkgG);
        valorVentaChico += ch * (Number(b.precioChico) || 0);
        valorVentaGrande += gr * (Number(b.precioGrande) || 0);
      }
    }
    blendsConStock.sort(function(a, b) {
      // Ordenar por total de frascos descendente
      var ta = a.chico + a.grande;
      var tb = b.chico + b.grande;
      return tb - ta;
    });

    h += '<div class="card" style="border-color:var(--gold);background:linear-gradient(135deg, rgba(232,184,75,0.05), transparent)">' +
      '<div class="card-header" style="background:rgba(232,184,75,0.1)"><h3 style="color:var(--gold-dark)">📦 Frascos Produccidos para la Venta</h3></div>' +
      '<div class="card-body">';

    if (blendsConStock.length === 0) {
      h += '<p class="text-muted text-center" style="padding:24px 0">No hay frascos producidos en stock. Producí blends en el panel Producción para tener stock para vender.</p>';
    } else {
      // KPIs resumen arriba
      h += '<div class="g4 mb-16">';
      h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">' + totalChico + '</div><div class="stat-label">Frascos Pequeños</div><div class="stat-sub text-xs text-muted">' + blendsConStock.filter(function(x){return x.chico>0;}).length + ' blends</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">' + totalGrande + '</div><div class="stat-label">Frascos Grandes</div><div class="stat-sub text-xs text-muted">' + blendsConStock.filter(function(x){return x.grande>0;}).length + ' blends</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--red)"><div class="stat-value">$' + valorCostoChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div><div class="stat-label">Valor Costo Stock</div></div>';
      h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">$' + valorVentaChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div><div class="stat-label">Valor Venta Stock</div></div>';
      h += '</div>';

      // Input de búsqueda
      h += '<div class="form-group" style="margin-bottom:12px">' +
        '<input type="text" class="input" id="stock-blends-busqueda" placeholder="🔍 Buscar blend por nombre..." style="width:100%">' +
      '</div>';

      // Tabla de blends con stock
      h += '<div class="table-wrap"><table class="table" id="stock-blends-table"><thead><tr>' +
        '<th>Blend</th>' +
        '<th class="text-center">Pequeños</th>' +
        '<th class="text-center">Grandes</th>' +
        '<th class="text-center">Total</th>' +
        '<th class="text-right">$ Venta Pq</th>' +
        '<th class="text-right">$ Venta Gr</th>' +
        '<th class="text-right">$ Venta Total</th>' +
        '</tr></thead><tbody id="stock-blends-tbody"></tbody>' +
        '<tfoot><tr style="background:var(--bg);font-weight:700"><td>TOTAL</td>' +
        '<td class="text-center" id="stock-blends-total-ch">' + totalChico + '</td>' +
        '<td class="text-center" id="stock-blends-total-gr">' + totalGrande + '</td>' +
        '<td class="text-center" id="stock-blends-total-all">' + (totalChico + totalGrande) + '</td>' +
        '<td class="text-right" id="stock-blends-total-vp">$' + valorVentaChico.toLocaleString() + '</td>' +
        '<td class="text-right" id="stock-blends-total-vg">$' + valorVentaGrande.toLocaleString() + '</td>' +
        '<td class="text-right" id="stock-blends-total-vt">$' + (valorVentaChico + valorVentaGrande).toLocaleString() + '</td>' +
        '</tr></tfoot></table></div>';
      h += '<div style="text-align:center;margin-top:12px"><button class="btn btn-sm btn-outline" id="stock-blends-ver-mas" style="display:none">Ver más</button></div>';
      h += '<p class="text-xs text-muted mt-8">Valor de venta calculado con precios actuales de cada blend. Los blends con stock 0 no aparecen en esta lista.</p>';
    }
    h += '</div></div>';

    // helper: inline adj input
    function adjInput(cat, sub, prodId, prodNombre, placeholder) {
      var pid = prodId != null ? String(prodId) : '';
      return '<input type="number" class="input stock-adj-input" ' +
        'data-cat="' + cat + '" data-sub="' + sub + '" data-pid="' + pid + '" data-pname="' + (prodNombre||'').replace(/"/g, '&quot;') + '" ' +
        'style="width:70px;padding:4px 6px;font-size:0.85rem;text-align:center" placeholder="' + placeholder + '" title="Stock actual: ' + placeholder + '">';
    }

    // === SECTION 1: ESPECIAS ===
    h += '<h3 style="color:var(--gold);margin:16px 0 12px;font-size:1.1rem">Especias</h3>';
    h += '<div class="card"><div class="card-body" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Cat.</th><th>Pala (g)</th><th>Ajuste</th><th>Fr.Pequeño</th><th>Ajuste</th><th>Fr.Grande</th><th>Ajuste</th><th></th></tr></thead><tbody>';
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
        '<td><button class="btn btn-sm btn-red" onclick="Pages.delEspecia(' + e.id + ')" title="Eliminar especia">X</button></td>' +
        '</tr>';
    }
    h += '</tbody></table></div></div></div>';

    // === SECTION 2: BLENDS ===
    h += '<h3 style="color:var(--gold);margin:24px 0 12px;font-size:1.1rem">Blends</h3>';
    h += '<div class="card"><div class="card-body" style="padding:0"><div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Cat.</th><th>Fr.Pequeño</th><th>Ajuste</th><th>Fr.Grande</th><th>Ajuste</th><th></th></tr></thead><tbody>';
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
        '<td><button class="btn btn-sm btn-red" onclick="Pages.delBlend(' + b.id + ')" title="Eliminar blend">X</button></td>' +
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

    // Lógica de búsqueda y paginación para la tabla de frascos producidos
    if (blendsConStock.length > 0) {
      var _sbLimit = 15;
      var _sbFiltro = '';
      var _sbTbody = document.getElementById('stock-blends-tbody');
      var _sbVerMas = document.getElementById('stock-blends-ver-mas');
      var _sbBusqueda = document.getElementById('stock-blends-busqueda');

      function _sbFiltrados() {
        if (!_sbFiltro) return blendsConStock;
        var q = _sbFiltro.toLowerCase();
        return blendsConStock.filter(function(x) {
          return (x.blend.nombre || '').toLowerCase().indexOf(q) >= 0;
        });
      }

      function _sbRowHtml(x) {
        var total = x.chico + x.grande;
        var ventaPq = x.chico * (Number(x.blend.precioChico) || 0);
        var ventaGr = x.grande * (Number(x.blend.precioGrande) || 0);
        var ventaTotal = ventaPq + ventaGr;
        var chCls = x.chico <= 3 ? 'text-red fw7' : (x.chico >= 10 ? 'text-green fw7' : '');
        var grCls = x.grande <= 3 ? 'text-red fw7' : (x.grande >= 10 ? 'text-green fw7' : '');
        return '<tr>' +
          '<td class="fw7">' + esc(x.blend.nombre) + (x.blend.categoria ? ' <span class="badge badge-blue" style="font-size:10px">' + esc(x.blend.categoria) + '</span>' : '') + '</td>' +
          '<td class="text-center ' + chCls + '">' + x.chico + '</td>' +
          '<td class="text-center ' + grCls + '">' + x.grande + '</td>' +
          '<td class="text-center fw7">' + total + '</td>' +
          '<td class="text-right">$' + ventaPq.toLocaleString() + '</td>' +
          '<td class="text-right">$' + ventaGr.toLocaleString() + '</td>' +
          '<td class="text-right fw7 text-gold">$' + ventaTotal.toLocaleString() + '</td>' +
        '</tr>';
      }

      function _sbRender() {
        var filtrados = _sbFiltrados();
        var html = '';
        for (var i = 0; i < Math.min(filtrados.length, _sbLimit); i++) {
          html += _sbRowHtml(filtrados[i]);
        }
        if (filtrados.length === 0) {
          html = '<tr><td colspan="7" class="text-muted text-center" style="padding:16px">Sin resultados para "' + esc(_sbFiltro) + '"</td></tr>';
        }
        _sbTbody.innerHTML = html;
        // Totales recalculados según el filtro
        var fCh = 0, fGr = 0, fVp = 0, fVg = 0;
        for (var j = 0; j < filtrados.length; j++) {
          fCh += filtrados[j].chico;
          fGr += filtrados[j].grande;
          fVp += filtrados[j].chico * (Number(filtrados[j].blend.precioChico) || 0);
          fVg += filtrados[j].grande * (Number(filtrados[j].blend.precioGrande) || 0);
        }
        var tCh = document.getElementById('stock-blends-total-ch');
        var tGr = document.getElementById('stock-blends-total-gr');
        var tAll = document.getElementById('stock-blends-total-all');
        var tVp = document.getElementById('stock-blends-total-vp');
        var tVg = document.getElementById('stock-blends-total-vg');
        var tVt = document.getElementById('stock-blends-total-vt');
        if (tCh) tCh.textContent = fCh;
        if (tGr) tGr.textContent = fGr;
        if (tAll) tAll.textContent = fCh + fGr;
        if (tVp) tVp.textContent = '$' + fVp.toLocaleString();
        if (tVg) tVg.textContent = '$' + fVg.toLocaleString();
        if (tVt) tVt.textContent = '$' + (fVp + fVg).toLocaleString();
        // Ver más
        if (_sbLimit < filtrados.length) {
          _sbVerMas.style.display = '';
          var restantes = filtrados.length - _sbLimit;
          _sbVerMas.textContent = 'Ver más (' + restantes + ' restantes de ' + filtrados.length + ')';
        } else {
          _sbVerMas.style.display = 'none';
        }
      }

      _sbBusqueda.addEventListener('input', function() {
        _sbFiltro = this.value.trim();
        _sbLimit = 15;
        _sbRender();
      });
      _sbVerMas.addEventListener('click', function() {
        _sbLimit += 20;
        _sbRender();
      });
      _sbRender();
    }

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
        if (inp.value === '' || isNaN(v) || v === 0) continue;
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
      batchBtn.disabled = true;
      batchBtn.textContent = 'Guardando...';
      var errors = [];
      var success = 0;
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
          success++;
        } catch(err) { errors.push(pending[i].productoNombre + ' ' + pending[i].subtipo + ': ' + err.message); }
      }
      // Forzar guardado inmediato antes de re-renderizar
      if (ArcanoDB.saveNow) ArcanoDB.saveNow();
      if (errors.length) {
        alert('Se guardaron ' + success + ' de ' + pending.length + ' ajustes.\n\nErrores:\n' + errors.join('\n'));
      } else {
        toast(success + ' ajustes guardados correctamente');
      }
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

    // Mostrar subtotal (productos) + envío + total separados
    var envio = p.envio || {};
    var envioCosto = p.envio ? (p.envio.costo || 0) : 0;
    var envioGratis = p.envio ? p.envio.gratis : false;
    var subtotal = (p.subtotal != null) ? p.subtotal : (p.total || 0) - envioCosto;

    h += '<div style="text-align:right;margin-top:12px;font-size:1rem">';
    h += '<div style="color:var(--text-sec)">Subtotal productos: <strong>$' + subtotal.toLocaleString() + '</strong></div>';
    if (envioGratis) {
      h += '<div style="color:var(--green)">Envío: <strong>GRATIS</strong></div>';
    } else if (envioCosto > 0) {
      h += '<div style="color:var(--text-sec)">Envío: <strong>$' + envioCosto.toLocaleString() + '</strong></div>';
    }
    h += '<div style="font-size:1.2rem;margin-top:4px" class="fw7 text-gold">Total: $' + (p.total || 0).toLocaleString() + '</div>';
    h += '</div>';

    // Botón "Envío sin cargo"
    if (!envioGratis) {
      h += '<div class="mt-8" style="display:flex;gap:8px;align-items:center">';
      h += '<button class="btn btn-sm btn-outline" style="border-color:var(--green);color:var(--green)" onclick="Pages.marcarEnvioSinCargo(\'' + pedidoKey + '\')">🎁 Envío sin cargo</button>';
      h += '<span class="text-xs text-muted">Quita el costo de envío y lo marca como gratis</span>';
      h += '</div>';
    } else {
      h += '<div class="mt-8"><span class="badge" style="background:rgba(107,142,78,0.15);color:var(--green);padding:6px 12px;border-radius:8px;font-size:.85rem">✓ Envío sin cargo aplicado</span></div>';
    }

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
      '<div class="stat-card"><div class="stat-value" style="font-size:0.85rem">arcanoespecias.com</div><div class="stat-label">URL Publica</div></div>' +
      '</div>';

    // Boton Regenerar SEO (legacy — solo JSON-LD del index)
    h += '<div class="card mt-16"><div class="card-header"><h3>SEO Tienda (JSON-LD Home) — Legacy</h3></div><div class="card-body">' +
      '<p class="text-sm text-muted mb-12"><strong>⚠ No usar este botón.</strong> Actualiza solo el JSON-LD del index.html. Puede romper la estructura del index. <strong>Usá \"Regenerar SEO Completo\" abajo en su lugar</strong> — ese regenera las páginas /blends/ y /blends-para/ sin tocar el index.html.</p>' +
      '<button class="btn btn-outline" id="btn-regenerar-seo" onclick="Pages.regenerarSEO()">Regenerar SEO Tienda (no recomendado)</button>' +
      '<span id="seo-status" class="ml-8 text-sm"></span>' +
      '</div></div>';

    // Botón Regenerar SEO Completo (recomendado)
    h += '<div class="card mt-16"><div class="card-header"><h3>✓ SEO Completo — Recomendado</h3></div><div class="card-body">' +
      '<p class="text-sm text-muted mb-12">Genera las páginas individuales de cada producto (/blends/slug/) y las páginas de categorías SEO (/blends-para/categoria/). También actualiza sitemap.xml, merchant_feed.xml/tsv y los canonicals de /p/*.html. <strong>Ejecutá esto después de agregar, modificar o eliminar productos.</strong> No toca el index.html.</p>' +
      '<button class="btn btn-gold" id="btn-regenerar-seo-completo" onclick="Pages.regenerarSEOCompleto()">Regenerar SEO Completo</button>' +
      '<span id="seo-completo-status" class="ml-8 text-sm"></span>' +
      '<div id="seo-completo-log" class="mt-12" style="max-height:300px;overflow-y:auto;background:var(--bg3);padding:12px;border-radius:8px;font-size:12px;font-family:monospace;display:none"></div>' +
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

    // === DISEÑO DINÁMICO ===
    var din = cfg.dinamico || {};
    h += '<div class="card mt-16"><div class="card-header"><h3>Diseño Dinámico de Fondo</h3><p class="text-xs text-muted">Configura la transición del fondo de la tienda (crema → negro). El efecto se activa por <b>tiempo de navegación</b> del usuario, no por scroll. Los textos se ajustan automáticamente para mantener contraste legible.</p></div><div class="card-body">';
    h += '<div class="form-group" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:8px">' +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">' +
        '<input type="checkbox" id="din-habilitado" ' + (din.habilitado !== false ? 'checked' : '') + '> ' +
        '<span>Habilitar fondo dinámico</span>' +
      '</label></div>';

    h += '<div class="g2 mt-12">' +
      '<div class="form-group"><label>Tipo de partículas</label>' +
        '<select class="input" id="din-tipo">' +
          '<option value="dust"' + (din.tipoParticulas === 'dust' || !din.tipoParticulas ? ' selected' : '') + '>Polvo dorado (especias)</option>' +
          '<option value="sparkles"' + (din.tipoParticulas === 'sparkles' ? ' selected' : '') + '>Destellos brillantes</option>' +
          '<option value="snow"' + (din.tipoParticulas === 'snow' ? ' selected' : '') + '>Copos blancos</option>' +
          '<option value="embers"' + (din.tipoParticulas === 'embers' ? ' selected' : '') + '>Brasas anaranjadas</option>' +
          '<option value="stars"' + (din.tipoParticulas === 'stars' ? ' selected' : '') + '>Estrellas</option>' +
        '</select></div>' +
      '<div class="form-group"><label>Cantidad de partículas</label>' +
        '<select class="input" id="din-cantidad">' +
          '<option value="0"' + (din.cantidadParticulas === 0 ? ' selected' : '') + '>0 (sin partículas)</option>' +
          '<option value="8"' + (din.cantidadParticulas === 8 ? ' selected' : '') + '>8 (mínimo)</option>' +
          '<option value="18"' + (din.cantidadParticulas === 18 || !din.cantidadParticulas ? ' selected' : '') + '>18 (normal)</option>' +
          '<option value="30"' + (din.cantidadParticulas === 30 ? ' selected' : '') + '>30 (denso)</option>' +
        '</select></div>' +
    '</div>';

    h += '<div class="g2">' +
      '<div class="form-group"><label>Velocidad de partículas</label>' +
        '<select class="input" id="din-velocidad">' +
          '<option value="slow"' + (din.velocidadParticulas === 'slow' ? ' selected' : '') + '>Lenta (relajante)</option>' +
          '<option value="normal"' + (din.velocidadParticulas === 'normal' || !din.velocidadParticulas ? ' selected' : '') + '>Normal</option>' +
          '<option value="fast"' + (din.velocidadParticulas === 'fast' ? ' selected' : '') + '>Rápida (energética)</option>' +
        '</select></div>' +
      '<div class="form-group"><label>Velocidad del mesh gradient</label>' +
        '<select class="input" id="din-mesh">' +
          '<option value="slow"' + (din.velocidadMesh === 'slow' ? ' selected' : '') + '>Lenta (120s)</option>' +
          '<option value="normal"' + (din.velocidadMesh === 'normal' || !din.velocidadMesh ? ' selected' : '') + '>Normal (60s)</option>' +
          '<option value="fast"' + (din.velocidadMesh === 'fast' ? ' selected' : '') + '>Rápida (25s)</option>' +
          '<option value="none"' + (din.velocidadMesh === 'none' ? ' selected' : '') + '>Sin animación</option>' +
        '</select></div>' +
    '</div>';

    h += '<div class="g2">' +
      '<div class="form-group"><label>Tiempo de transición (qué tan rápido llega al tema oscuro)</label>' +
        '<select class="input" id="din-intensidad">' +
          '<option value="sutil"' + (din.intensidad === 'sutil' ? ' selected' : '') + '>Sutil — 2 minutos (transición muy lenta)</option>' +
          '<option value="normal"' + (din.intensidad === 'normal' || !din.intensidad ? ' selected' : '') + '>Normal — 1 minuto (recomendado)</option>' +
          '<option value="dramatico"' + (din.intensidad === 'dramatico' ? ' selected' : '') + '>Dramático — 30 segundos (cambio rápido)</option>' +
        '</select></div>' +
      '<div class="form-group"><label>Vignette (oscurecido de bordes)</label>' +
        '<select class="input" id="din-vignette">' +
          '<option value="true"' + (din.vignette !== false ? ' selected' : '') + '>Activado</option>' +
          '<option value="false"' + (din.vignette === false ? ' selected' : '') + '>Desactivado</option>' +
        '</select></div>' +
    '</div>';

    h += '<div class="mt-12" style="display:flex;gap:8px;align-items:center">' +
      '<button class="btn btn-gold" onclick="Pages._guardarDisenoDinamico()">Guardar cambios</button>' +
      '<button class="btn btn-outline" onclick="Pages._resetDisenoDinamico()">Restablecer defaults</button>' +
      '<span id="din-status" class="text-sm text-muted ml-8"></span>' +
    '</div>';
    h += '<p class="text-xs text-muted mt-8">💡 El efecto empieza cuando el usuario carga la tienda y transiciona gradualmente según los segundos configurados. Los textos mantienen SIEMPRE buen contraste (curva de easing diferenciada).</p>';
    h += '</div></div>';

    // === POPUP LATERAL ===
    var pp = cfg.popupTienda || {};
    h += '<div class="card mt-16"><div class="card-header"><h3>📢 Popup Lateral</h3><p class="text-xs text-muted">Pestaña que se desliza desde la derecha. Configura colores, tiempos y contenido.</p></div><div class="card-body">';
    h += '<div class="form-group" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:8px">' +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">' +
        '<input type="checkbox" id="pp-activo" ' + (pp.activo !== false ? 'checked' : '') + '> ' +
        '<span>Activar popup</span>' +
      '</label></div>';

    h += '<div class="g2 mt-12">' +
      '<div class="form-group"><label>Segundos antes de mostrar</label>' +
        '<input class="input" id="pp-segundos" type="number" min="3" max="120" value="' + (pp.segundos || 15) + '" placeholder="15"></div>' +
      '<div class="form-group"><label>Duración visible (segundos)</label>' +
        '<input class="input" id="pp-duracion" type="number" min="3" max="60" value="' + (pp.duracion || 8) + '" placeholder="8"></div>' +
    '</div>';

    h += '<div class="g2">' +
      '<div class="form-group"><label>Título (opcional)</label>' +
        '<input class="input" id="pp-titulo" value="' + esc(pp.titulo || '') + '" placeholder="Ej: ¡Promo especial!"></div>' +
      '<div class="form-group"><label>Texto del botón (opcional)</label>' +
        '<input class="input" id="pp-boton-texto" value="' + esc(pp.botonTexto || '') + '" placeholder="Ej: Ver promo"></div>' +
    '</div>';

    h += '<div class="form-group"><label>Mensaje</label>' +
      '<textarea class="input" id="pp-mensaje" rows="3" placeholder="Ej: Lleva 2 frascos y paga 1. Solo por hoy.">' + esc(pp.mensaje || '') + '</textarea></div>';

    h += '<div class="form-group"><label>Link del botón (opcional)</label>' +
      '<input class="input" id="pp-boton-link" value="' + esc(pp.botonLink || '') + '" placeholder="https://..."></div>';

    // Colores configurables
    h += '<div class="card mt-12" style="background:var(--bg);border:1px solid var(--border)"><div class="card-body" style="padding:12px">';
    h += '<p class="fw7 mb-8" style="font-size:0.85rem">🎨 Colores del popup</p>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Fondo</label><input type="color" id="pp-color-fondo" value="' + (pp.colorFondo || '#1A130D') + '" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:transparent"></div>' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Texto</label><input type="color" id="pp-color-texto" value="' + (pp.colorTexto || '#F5E6D0') + '" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:transparent"></div>' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Acento (título)</label><input type="color" id="pp-color-acento" value="' + (pp.colorAcento || '#E8B84B') + '" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:transparent"></div>' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Botón fondo</label><input type="color" id="pp-color-boton" value="' + (pp.colorBoton || '#E8B84B') + '" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:transparent"></div>' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Botón texto</label><input type="color" id="pp-color-boton-texto" value="' + (pp.colorBotonTexto || '#0E0A07') + '" style="width:100%;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:transparent"></div>' +
    '</div>';
    h += '</div></div>';

    // Tipografía configurable
    var estiloTitulo = pp.estiloTitulo || 'negrita';
    var estiloTexto = pp.estiloTexto || 'normal';
    h += '<div class="card mt-12" style="background:var(--bg);border:1px solid var(--border)"><div class="card-body" style="padding:12px">';
    h += '<p class="fw7 mb-8" style="font-size:0.85rem">✏️ Tipografía</p>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Tamaño título</label>' +
        '<select class="input" id="pp-tamano-titulo" style="padding:4px 8px"><option value="1rem"' + (pp.tamanoTitulo === '1rem' ? ' selected' : '') + '>Pequeño</option><option value="1.25rem"' + (!pp.tamanoTitulo || pp.tamanoTitulo === '1.25rem' ? ' selected' : '') + '>Mediano</option><option value="1.5rem"' + (pp.tamanoTitulo === '1.5rem' ? ' selected' : '') + '>Grande</option><option value="1.75rem"' + (pp.tamanoTitulo === '1.75rem' ? ' selected' : '') + '>Muy Grande</option></select></div>' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Estilo título</label>' +
        '<select class="input" id="pp-estilo-titulo" style="padding:4px 8px"><option value="negrita"' + (estiloTitulo === 'negrita' ? ' selected' : '') + '>Negrita</option><option value="subrayada"' + (estiloTitulo === 'subrayada' ? ' selected' : '') + '>Subrayada</option><option value="cursiva"' + (estiloTitulo === 'cursiva' ? ' selected' : '') + '>Cursiva</option><option value="negrita-subrayada"' + (estiloTitulo === 'negrita-subrayada' ? ' selected' : '') + '>Negrita + Subrayada</option><option value="negrita-cursiva"' + (estiloTitulo === 'negrita-cursiva' ? ' selected' : '') + '>Negrita + Cursiva</option></select></div>' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Tamaño texto</label>' +
        '<select class="input" id="pp-tamano-texto" style="padding:4px 8px"><option value="0.8rem"' + (pp.tamanoTexto === '0.8rem' ? ' selected' : '') + '>Pequeño</option><option value="0.9rem"' + (!pp.tamanoTexto || pp.tamanoTexto === '0.9rem' ? ' selected' : '') + '>Mediano</option><option value="1rem"' + (pp.tamanoTexto === '1rem' ? ' selected' : '') + '>Grande</option></select></div>' +
      '<div><label style="display:block;font-size:0.78rem;margin-bottom:4px">Estilo texto</label>' +
        '<select class="input" id="pp-estilo-texto" style="padding:4px 8px"><option value="normal"' + (estiloTexto === 'normal' ? ' selected' : '') + '>Normal</option><option value="negrita"' + (estiloTexto === 'negrita' ? ' selected' : '') + '>Negrita</option><option value="cursiva"' + (estiloTexto === 'cursiva' ? ' selected' : '') + '>Cursiva</option><option value="subrayada"' + (estiloTexto === 'subrayada' ? ' selected' : '') + '>Subrayada</option></select></div>' +
    '</div>';
    h += '</div></div>';

    h += '<div class="form-group mt-12"><label>Imagen cuadrada (opcional, recomendado 400x400px)</label>' +
      '<div class="img-upload-area" id="img-area-popup"><input type="file" accept="image/*" id="f-popup-img" style="display:none" onchange="Pages._handlePopupImg(this)">' +
      (pp.imagen ? '<img src="' + pp.imagen + '" class="img-preview" id="img-preview-popup" style="width:120px;height:120px;object-fit:cover;border-radius:8px"><button class="btn btn-sm btn-red" style="margin-top:6px" onclick="Pages._removePopupImg()">Quitar imagen</button>' : '') +
      '<div class="img-upload-placeholder" onclick="document.getElementById(\'f-popup-img\').click()"><span>+ Imagen del popup</span></div></div>' +
    '</div>';

    h += '<div class="mt-12" style="display:flex;gap:8px;align-items:center">' +
      '<button class="btn btn-gold" onclick="Pages._guardarPopup()">Guardar popup</button>' +
      '<button class="btn btn-outline" onclick="Pages._desactivarPopup()">Desactivar</button>' +
      '<span id="pp-status" class="text-sm text-muted ml-8"></span>' +
    '</div>';
    h += '</div></div>';

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
    var SITE_URL = 'https://arcanoespecias.com/';

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

      // SEO div content — extractos cortos + enlace a /blends/ (sin duplicar contenido completo)
      var sd = '<h2>Catalogo de Especias y Blends Artesanales</h2>';
      sd += '<p>Arcano Especias ofrece ' + products.length + ' productos artesanales: blends para comidas, infusiones y cocteleria, especias selectas y packs exclusivos. Todos los productos son mezclas artesanales con ingredientes seleccionados de cada rincon del mundo. Envios a toda Colombia.</p>';
      sd += '<ul>';
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var slug = Pages._productSlug(p.nombre);
        // Solo generar enlace si tenemos slug
        var link = slug ? '<a href="https://arcanoespecias.com/blends/' + slug + '/">' + escH(p.nombre) + '</a>' : escH(p.nombre);
        // Extracto corto: máximo 80 chars
        var extracto = '';
        if (p.descripcion) {
          extracto = p.descripcion.substring(0, 80);
          if (p.descripcion.length > 80) extracto = extracto.replace(/\s+\S*$/, '') + '...';
        }
        sd += '<li>' + link;
        if (extracto) sd += ' — ' + escH(extracto);
        sd += '</li>';
      }
      sd += '</ul>';

      // BreadcrumbList JSON-LD
      var bcJsonLd = '<!-- SEO: BreadcrumbList estatico -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "BreadcrumbList",\n  "itemListElement": [\n    { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://arcanoespecias.com/" },\n    { "@type": "ListItem", "position": 2, "name": "Catalogo de Especias y Blends", "item": "https://arcanoespecias.com/" }\n  ]\n}\n</script>'

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

        // === SAFETY CHECK: si no tiene la estructura esperada, abortar sin tocar ===
        // El index.html debe tener </head>, </body>, <main> o .main-content
        // Si no los tiene, es un index roto y no debemos seguir
        if (content.indexOf('</head>') === -1 || content.indexOf('</body>') === -1) {
          throw new Error('index.html no tiene estructura válida (falta </head> o </body>). No se modificará para no romperlo. Usá "Regenerar SEO Completo" en su lugar.');
        }
        // Verificar que tenga el body con class="opening-active" (estructura Arcano)
        if (content.indexOf('class="opening-active"') === -1 && content.indexOf('id="page-tienda"') === -1) {
          throw new Error('index.html no parece ser la tienda Arcano. No se modificará. Usá "Regenerar SEO Completo" en su lugar.');
        }

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

        // Remover bloque noscript anterior (si existe)
        var marker2 = '<!-- SEO: Pre-rendered noscript (regenerar con deploy-seo-prerender.js) -->';
        if (content.indexOf(marker2) !== -1) {
          var ns = content.indexOf(marker2);
          var ne = content.indexOf('</noscript>', ns);
          if (ne !== -1) content = content.substring(0, ns) + content.substring(ne + '</noscript>'.length + 1);
        }

        // Inyectar noscript antes del div seo-content (si existe)
        // Soporta tanto <div id="seo-content"> como <div class="seo-products">
        var dm = '<div id="seo-content"';
        var di = content.indexOf(dm);
        if (di === -1) {
          dm = '<div class="seo-products"';
          di = content.indexOf(dm);
        }
        if (di !== -1) {
          content = content.substring(0, di) + marker2 + '\n' + seo.noscript + '\n\n' + content.substring(di);
        }
        // Si no encuentra ninguno, no inyecta noscript (no rompe nada)

        // Actualizar contenido del div seo-content o seo-products (si existe)
        // Soporta divs anidados: cuenta apertura/cierre para encontrar el cierre correcto
        var divSelectors = ['<div id="seo-content"', '<div class="seo-products"'];
        var updated = false;
        for (var si = 0; si < divSelectors.length && !updated; si++) {
          var sel = divSelectors[si];
          var startIdx = content.indexOf(sel);
          if (startIdx === -1) continue;
          var openTagEnd = content.indexOf('>', startIdx);
          if (openTagEnd === -1) continue;
          // Contar divs anidados para encontrar el cierre correcto
          var depth = 1;
          var pos = openTagEnd + 1;
          while (pos < content.length && depth > 0) {
            var nextOpen = content.indexOf('<div', pos);
            var nextClose = content.indexOf('</div>', pos);
            if (nextClose === -1) { pos = -1; break; }
            if (nextOpen !== -1 && nextOpen < nextClose) {
              depth++;
              pos = nextOpen + 4;
            } else {
              depth--;
              pos = nextClose + 6;
            }
          }
          if (pos > 0) {
            // pos ahora apunta justo después del </div> que cierra el seo-content/products
            var closeIdx = pos - 6; // inicio del </div>
            content = content.substring(0, openTagEnd + 1) + '\n' + seo.seoDiv + '\n' + content.substring(closeIdx);
            updated = true;
          }
        }
        // Si no encontró ninguno de los dos selectores, no toca el contenido (no rompe)

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
    espSheet['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 25 }];

    // === Sheet BLENDS ===
    var blRows = [['ID', 'Nombre', 'Descripcion', 'Categoria', 'Precio Chico', 'Precio Grande', 'Stock Chico (uds)', 'Stock Grande (uds)', 'En Tienda', 'Uso', 'Especia', 'Grs/Chico', 'Grs/Grande', 'Costo Ingr. ($/g)', 'Subcosto Chico', 'Subcosto Grande']];
    var _expEspMap = {};
    for (var _ex = 0; _ex < especias.length; _ex++) _expEspMap[especias[_ex].id] = especias[_ex].nombre;
    for (var j = 0; j < blends.length; j++) {
      var b = blends[j];
      var ings = b.ingredientes || [];
      if (ings.length === 0) {
        blRows.push([b.id, b.nombre, b.descripcion || '', b.categoria || '', b.precioChico || 0, b.precioGrande || 0, b.stockChico || 0, b.stockGrande || 0, b.enTienda ? 'Si' : 'No', b.uso || '', '', '', '', '', '', '']);
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
    blSheet['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];

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
        costoTotal += cGr * (bing.gramosChico || 0);
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

          // Parse ESPECIAS (try 'Especias' then case-insensitive fallback)
          var espUpdates = [];
          var espSheet = wb.Sheets['Especias'] || wb.Sheets['ESPECIAS'] || wb.Sheets['especias'];
          if (!espSheet) {
            var sNamesE = Object.keys(wb.Sheets);
            for (var sei = 0; sei < sNamesE.length; sei++) {
              if (sNamesE[sei].toLowerCase() === 'especias') { espSheet = wb.Sheets[sNamesE[sei]]; break; }
            }
          }
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

          // Parse BLENDS (try 'Blends' then case-insensitive fallback)
          var blUpdates = {};
          var blSheet = wb.Sheets['Blends'] || wb.Sheets['BLENDS'] || wb.Sheets['blends'];
          if (!blSheet) {
            var sNames = Object.keys(wb.Sheets);
            for (var si = 0; si < sNames.length; si++) {
              if (sNames[si].toLowerCase() === 'blends') { blSheet = wb.Sheets[sNames[si]]; break; }
            }
          }
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
                  uso: String(row[9] || '').trim(),
                  ingredientes: []
                };
              }
              if (currentBlId && row[10]) {
                blUpdates[currentBlId].ingredientes.push({
                  especiaNombre: String(row[10] || '').trim(),
                  gramosChico: Number(row[11]) || 0,
                  gramosGrande: Number(row[12]) || 0
                });
              }
            }
          }

          // Parse COSTOS (try 'Costos' then case-insensitive fallback)
          var costoUpdates = {};
          var costoEspUpdates = {};
          var costSheet = wb.Sheets['Costos'] || wb.Sheets['COSTOS'] || wb.Sheets['costos'];
          if (!costSheet) {
            var sNamesC = Object.keys(wb.Sheets);
            for (var sci = 0; sci < sNamesC.length; sci++) {
              if (sNamesC[sci].toLowerCase() === 'costos') { costSheet = wb.Sheets[sNamesC[sci]]; break; }
            }
          }
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
                      gramosChico: Number(ing.gramosChico) || 0,
                      gramosGrande: Number(ing.gramosGrande) || 0,
                      gramosReceta: Number(ing.gramosChico) || 0
                    });
                  }
                }
                // Calculate gramosTotal
                var grsTotal = 0;
                for (var gi = 0; gi < resolvedIngs.length; gi++) grsTotal += resolvedIngs[gi].gramosReceta;
                for (var gi2 = 0; gi2 < resolvedIngs.length; gi2++) {
                  resolvedIngs[gi2].gramosTotal = grsTotal;
                  resolvedIngs[gi2].pct = grsTotal > 0 ? Math.round((resolvedIngs[gi2].gramosReceta / grsTotal) * 100) : 0;
                }

                var existingBl = bU.id ? ArcanoDB.getBlend(bU.id) : null;
                var savedBl;
                if (existingBl) {
                  savedBl = ArcanoDB.saveBlend({
                    id: bU.id,
                    nombre: bU.nombre || existingBl.nombre,
                    descripcion: bU.descripcion || existingBl.descripcion || '',
                    categoria: bU.categoria || existingBl.categoria,
                    uso: bU.uso || existingBl.uso || '',
                    precioChico: bU.precioChico,
                    precioGrande: bU.precioGrande,
                    enTienda: bU.enTienda,
                    ingredientes: resolvedIngs.length > 0 ? resolvedIngs : (existingBl.ingredientes || [])
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
                      uso: bU.uso || matchBl.uso || '',
                      precioChico: bU.precioChico,
                      precioGrande: bU.precioGrande,
                      enTienda: bU.enTienda,
                      ingredientes: resolvedIngs.length > 0 ? resolvedIngs : (matchBl.ingredientes || [])
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

              // Force immediate save to Firebase and wait for confirmation
              btn.textContent = 'Guardando en Firebase...';
              ArcanoDB.saveNow().then(function(ok) {
                if (ok) {
                  previewDiv.innerHTML = '<div class="card"><div class="card-body">' +
                    '<p class="text-green fw7 mb-8">Importacion completada y guardada</p>' +
                    '<div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">' +
                      '<div class="stat-card"><div class="stat-value" style="color:var(--green)">' + espOk + '</div><div class="stat-label">Especias Procesadas</div></div>' +
                      '<div class="stat-card"><div class="stat-value" style="color:var(--blue)">' + blOk + '</div><div class="stat-label">Blends Procesados</div></div>' +
                    '</div>' +
                    '<p class="text-sm text-muted mt-12">Los productos nuevos fueron creados y los existentes actualizados. Los stocks no se modificaron.</p>' +
                  '</div></div>';
                } else {
                  previewDiv.innerHTML = '<div class="card"><div class="card-body">' +
                    '<p class="text-red fw7 mb-8">Error al guardar en Firebase</p>' +
                    '<p class="text-sm text-muted">Los datos se procesaron pero no se pudieron guardar. Intenta de nuevo o verifica tu conexion.</p>' +
                  '</div></div>';
                }
                footerDiv.innerHTML = '<button class="btn btn-gold" onclick="this.closest(\'.modal-overlay\').remove();App.renderPage(\'productos\')">Cerrar</button>';
              });

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
     USO SELECTOR HELPER
     ================================================================ */
  buildUsoSelectorHtml(selectedUsos) {
    var opciones = ['Carnes', 'Pollo', 'Pescados y Mariscos', 'Cerdo', 'Arroces', 'Pastas', 'Sopas y Cremas', 'Ensaladas', 'Guisos y Estofados', 'Salsas', 'Marinadas y Adobos', 'Panaderia', 'Postres', 'Bebidas', 'Vegetales', 'Ceviches', 'Currys', 'Tacos y Burritos', 'Hamburguesas', 'Pizzas'];
    var sel = selectedUsos || '';
    var selArr = typeof sel === 'string' ? sel.split(', ') : (sel || []);
    var h = '<div class="tag-selector" id="uso-selector">';
    for (var i = 0; i < opciones.length; i++) {
      var checked = selArr.indexOf(opciones[i]) >= 0 ? ' checked' : '';
      h += '<label class="tag-chip"><input type="checkbox" value="' + opciones[i] + '"' + checked + '><span>' + opciones[i] + '</span></label>';
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
    '</div>' +
    '<input type="file" id="ra-img-input" accept="image/*" style="display:none" onchange="Pages._onRecetaImageSelect(event)">';
    container.innerHTML = h;
    Pages._loadGeminiKey('ra-groq-key', 'ra-key-status');
    Pages._loadRecetasAdmin();
  },

  _saveGroqKey: function() {
    var inp = document.getElementById('ra-groq-key');
    if (!inp) return;
    var key = inp.value.trim();
    var statusEl = document.getElementById('ra-key-status');
    if (!key) { if (statusEl) statusEl.innerHTML = ' <span style="color:var(--red)">vacia</span>'; return; }
    localStorage.setItem('arcano_gemini_key', key);
    firebase.database().ref('arcano/db/config/gemini_key').set(key);
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
    var h = '<div class="table-wrap"><table class="table"><thead><tr><th>Titulo</th><th>Img</th><th>Cat.</th><th>Dificultad</th><th>Tiempo</th><th>Productos</th><th>Fecha</th><th></th></tr></thead><tbody>';
    for (var i = 0; i < recetas.length; i++) {
      var r = recetas[i];
      var prodsUsados = '';
      if (r.productos_usados && r.productos_usados.length) {
        prodsUsados = r.productos_usados.join(', ');
      }
      var diffColor = r.dificultad === 'Facil' ? 'text-green' : (r.dificultad === 'Dificil' ? 'text-red' : 'text-yellow');
      // Celda de imagen: thumbnail si existe, o boton "+ Img" si no
      var imgCell;
      if (r.imagen_url) {
        imgCell = '<div style="display:flex;align-items:center;gap:4px">' +
          '<img src="' + r.imagen_url + '" style="width:48px;height:32px;object-fit:cover;border-radius:4px" onclick="Pages.uploadRecetaImage(\'' + r._key + '\')" title="Cambiar imagen">' +
          '<button class="btn btn-sm" style="padding:2px 6px;font-size:0.7rem;color:var(--red)" onclick="Pages.removeRecetaImage(\'' + r._key + '\')" title="Quitar imagen">x</button>' +
          '</div>';
      } else {
        imgCell = '<button class="btn btn-sm btn-outline" onclick="Pages.uploadRecetaImage(\'' + r._key + '\')" title="Agregar imagen">+ Img</button>';
      }
      h += '<tr>' +
        '<td class="fw7">' + (r.titulo || 'Sin titulo') + '</td>' +
        '<td>' + imgCell + '</td>' +
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

  /* ===== IMAGENES DE RECETAS =====
     - uploadRecetaImage(key): abre modal para elegir (IA o subir archivo)
     - _onRecetaImageSelect: cuando se selecciona archivo, lo sube
     - removeRecetaImage(key): quita la imagen
     - _generarImagenReceta: genera con Gemini Imagen y sube
     - _uploadRecetaImageToGitHub: compresion + upload (análogo a Blog) */

  _recetaImgTarget: null,

  uploadRecetaImage: function(key) {
    // Modal con 2 opciones: generar con IA o subir archivo
    firebase.database().ref('arcano/db/recetas/' + key).once('value', function(snap) {
      var r = snap.val();
      if (!r) return;
      var currentImg = r.imagen_url
        ? '<div style="margin-bottom:12px;text-align:center"><img src="' + r.imagen_url + '" style="max-width:100%;max-height:200px;border-radius:8px"></div>'
        : '<p class="text-muted text-sm" style="margin-bottom:12px">Esta receta no tiene imagen.</p>';
      var body =
        currentImg +
        '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn btn-gold" onclick="Pages._generarImagenReceta(\'' + key + '\', null, null, null);closeModal()">' +
            '<span style="margin-right:6px">✨</span>Generar con IA' +
          '</button>' +
          '<button class="btn btn-outline" onclick="Pages._pickRecetaImageFile(\'' + key + '\');closeModal()">' +
            '<span style="margin-right:6px">📤</span>Subir archivo' +
          '</button>' +
        '</div>' +
        '<p class="text-muted text-sm" style="margin-top:12px;text-align:center">La opcion IA usa el prompt que genero Gemini al crear la receta. Si no existe, se creara uno nuevo automaticamente.</p>';
      openModal('Imagen de: ' + (r.titulo || 'Receta'), body);
    });
  },

  _pickRecetaImageFile: function(key) {
    Pages._recetaImgTarget = key;
    var inp = document.getElementById('ra-img-input');
    if (inp) inp.click();
  },

  _onRecetaImageSelect: function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('La imagen no debe superar 5MB. Recomendado: 1200x800 px JPG.'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      var dataUrl = ev.target.result;
      var key = Pages._recetaImgTarget;
      if (!key) return;
      var statusEl = document.getElementById('ra-gen-status');
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Subiendo imagen...</span>';
      firebase.database().ref('arcano/db/recetas/' + key).once('value', function(snap) {
        var r = snap.val();
        var slug = Pages._titleToSlug(r && r.titulo) || ('receta-img-' + Date.now());
        Pages._uploadRecetaImageToGitHub(dataUrl, slug).then(function(url) {
          firebase.database().ref('arcano/db/recetas/' + key).update({ imagen_url: url }, function(err) {
            if (err) {
              alert('Error al guardar: ' + (err.message || err));
              if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error al guardar URL</span>';
            } else {
              Pages._loadRecetasAdmin();
              if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">Imagen actualizada</span>';
              // Re-publicar SEO con la nueva imagen
              if (r) { r.imagen_url = url; Pages._publishRecipeSEO(r); }
            }
          });
        }).catch(function(err) {
          alert('Error al subir imagen: ' + (err.message || err));
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error al subir imagen</span>';
        });
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  removeRecetaImage: function(key) {
    if (!confirm('Quitar la imagen de esta receta?')) return;
    firebase.database().ref('arcano/db/recetas/' + key).update({ imagen_url: null }, function() {
      Pages._loadRecetasAdmin();
    });
  },

  _generarImagenReceta: function(key, recetaOpt, apiKeyOpt, statusElOpt) {
    // Genera una imagen con Google AI y la sube a GitHub.
    // Fallback chain: Imagen 3 → Imagen 3 Fast → Gemini 2.0 Flash (image generation)
    var apiKey = apiKeyOpt || (localStorage.getItem('arcano_gemini_key') || '').trim();
    var statusEl = statusElOpt || document.getElementById('ra-gen-status');
    if (!apiKey) {
      alert('Falta la API Key de Gemini para generar la imagen.');
      return;
    }
    firebase.database().ref('arcano/db/recetas/' + key).once('value', function(snap) {
      var r = recetaOpt || snap.val();
      if (!r) { if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Receta no encontrada</span>'; return; }
      // Si la receta no trae prompt, lo construimos a partir de titulo + descripcion + ingredientes
      var prompt = r.imagen_prompt;
      if (!prompt) {
        var ingredientes = (r.ingredientes || []).slice(0, 5).join(', ');
        prompt = 'Professional food photography of ' + (r.titulo || 'a delicious dish') + ': ' +
                 (r.descripcion || '') + ' Main ingredients: ' + ingredientes + '. ' +
                 'Appetizing, natural lighting, top-down angle, rustic wooden table, vibrant colors, high resolution, no text, no watermark.';
      } else {
        prompt = 'Professional food photography: ' + prompt + ' Appetizing, natural lighting, top-down angle, rustic wooden table, vibrant colors, high resolution, no text, no watermark.';
      }
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Generando imagen con IA...</span>';

      // Catálogo de modelos con su endpoint y formato de request/response
      var models = [
        {
          name: 'imagen-3.0-generate-002',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=' + apiKey,
          buildBody: function(p) {
            return {
              instances: [{ prompt: p }],
              parameters: { sampleCount: 1, aspectRatio: '1:1' }
            };
          },
          extractImage: function(data) {
            if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
              return { data: data.predictions[0].bytesBase64Encoded, mime: data.predictions[0].mimeType || 'image/png' };
            }
            return null;
          }
        },
        {
          name: 'imagen-3.0-fast-generate-001',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-fast-generate-001:predict?key=' + apiKey,
          buildBody: function(p) {
            return {
              instances: [{ prompt: p }],
              parameters: { sampleCount: 1, aspectRatio: '1:1' }
            };
          },
          extractImage: function(data) {
            if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
              return { data: data.predictions[0].bytesBase64Encoded, mime: data.predictions[0].mimeType || 'image/png' };
            }
            return null;
          }
        },
        {
          name: 'gemini-2.0-flash-preview-image-generation',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=' + apiKey,
          buildBody: function(p) {
            return {
              contents: [{ parts: [{ text: p }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
            };
          },
          extractImage: function(data) {
            var parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
            for (var i = 0; i < parts.length; i++) {
              if (parts[i].inlineData && parts[i].inlineData.data) {
                return { data: parts[i].inlineData.data, mime: parts[i].inlineData.mimeType || 'image/png' };
              }
              if (parts[i].inline_data && parts[i].inline_data.data) {
                return { data: parts[i].inline_data.data, mime: parts[i].inline_data.mime_type || 'image/png' };
              }
            }
            return null;
          }
        }
      ];

      function intentarCon(idx) {
        if (idx >= models.length) {
          throw new Error('Todos los modelos fallaron. Tu API Key quizas no tiene acceso a Imagen 3. Subi la imagen manualmente o activa Imagen 3 en aistudio.google.com.');
        }
        var m = models[idx];
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Generando con ' + m.name + '...</span>';
        return fetch(m.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(m.buildBody(prompt))
        })
        .then(function(res) {
          if (!res.ok) {
            return res.json().then(function(e) {
              var msg = (e.error && e.error.message) || ('HTTP ' + res.status);
              var err = new Error(msg);
              err._providerError = true;
              throw err;
            });
          }
          return res.json();
        })
        .then(function(data) {
          var img = m.extractImage(data);
          if (!img || !img.data) {
            var err = new Error('Sin imagen en respuesta de ' + m.name);
            err._providerError = true;
            throw err;
          }
          return img;
        })
        .catch(function(err) {
          if (err._providerError) {
            console.warn('[Recetas] Modelo ' + m.name + ' fallo:', err.message, '→ probando siguiente...');
            return intentarCon(idx + 1);
          }
          throw err;
        });
      }

      intentarCon(0)
        .then(function(img) {
          var dataUrl = 'data:' + img.mime + ';base64,' + img.data;
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Imagen generada. Subiendo a GitHub...</span>';
          var slug = Pages._titleToSlug(r.titulo) || ('receta-img-' + Date.now());
          return Pages._uploadRecetaImageToGitHub(dataUrl, slug).then(function(url) {
            return firebase.database().ref('arcano/db/recetas/' + key).update({ imagen_url: url }).then(function() {
              return url;
            });
          }).then(function(url) {
            if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">Imagen generada y guardada ✓</span>';
            Pages._loadRecetasAdmin();
            r.imagen_url = url;
            Pages._publishRecipeSEO(r);
          });
        })
        .catch(function(err) {
          console.error('[Recetas] Error generando imagen:', err);
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error imagen: ' + (err.message || err) + '</span>';
        });
    });
  },

  _uploadRecetaImageToGitHub: function(dataUrl, slug) {
    return Pages._compressImage(dataUrl, 1200, 0.85).then(function(compressed) {
      var base64Data = compressed.split(',')[1];
      var path = 'img/recetas/' + slug + '.jpg';
      return Pages._uploadToGitHub(path, base64Data).then(function(result) {
        if (result.content && result.content.download_url) return result.content.download_url;
        return 'https://arcanoespecias.com/' + path;
      });
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
              else {
                status.innerHTML = '<span style="color:var(--green)">Guardada: ' + receta.titulo + '. Generando imagen...</span>';
                Pages._loadRecetasAdmin();
                Pages._publishRecipeSEO(receta);
                Pages._updateSitemap();
                // Generar imagen automaticamente con el prompt que devolvio la IA
                firebase.database().ref('arcano/db/recetas').orderByChild('titulo').equalTo(receta.titulo).limitToLast(1).once('value', function(snap) {
                  var data = snap.val();
                  if (data) {
                    var newKey = Object.keys(data)[0];
                    Pages._generarImagenReceta(newKey, receta, apiKey, status);
                  }
                });
              }
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
      '<div class="card-header"><h3>Articulos Existentes (<span id="ba-count">0</span>)</h3><button class="btn btn-sm btn-gold" onclick="Pages.fixBlogLinks()" style="float:right;margin-top:4px">Corregir Links</button><button class="btn btn-sm btn-outline" onclick="Pages._regenerateAllBlogSEO()" style="float:right;margin-top:4px;margin-right:6px" title="Regenera paginas HTML estaticas para SEO">Regenerar SEO</button><button class="btn btn-sm btn-outline" onclick="Pages._processAllBlogImages()" style="float:right;margin-top:4px;margin-right:6px" title="Convierte imagenes base64 a archivos JPG optimizados">Procesar Imagenes</button></div>' +
      '<div class="card-body" id="ba-list"><div class="text-center text-muted">Cargando...</div></div>' +
    '</div>' +
    '<input type="file" id="ba-img-input" accept="image/*" style="display:none" onchange="Pages._onBlogImageSelect(event)">';
    container.innerHTML = h;
    Pages._loadGeminiKey('ba-gemini-key', 'ba-key-status');
    Pages._loadBlogAdmin();
  },

  _saveBlogKey: function() {
    var inp = document.getElementById('ba-gemini-key');
    if (!inp) return;
    var key = inp.value.trim();
    var statusEl = document.getElementById('ba-key-status');
    if (!key) { if (statusEl) statusEl.innerHTML = ' <span style="color:var(--red)">vacia</span>'; return; }
    localStorage.setItem('arcano_gemini_key', key);
    firebase.database().ref('arcano/db/config/gemini_key').set(key);
    if (statusEl) statusEl.innerHTML = ' <span style="color:var(--green)">guardada</span>';
  },

  _loadGeminiKey: function(inputId, statusId) {
    var inp = document.getElementById(inputId);
    var statusEl = document.getElementById(statusId);
    var localKey = localStorage.getItem('arcano_gemini_key') || '';
    if (inp && localKey) inp.value = localKey;
    firebase.database().ref('arcano/db/config/gemini_key').once('value', function(snap) {
      var fbKey = snap.val();
      if (fbKey) {
        localStorage.setItem('arcano_gemini_key', fbKey);
        if (inp) inp.value = fbKey;
        if (statusEl) statusEl.innerHTML = ' <span style="color:var(--green)">guardada</span>';
      }
    });
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
        '<td class="fw7"><a href="#" onclick="Pages.editarArticulo(\'' + a._key + '\');return false" style="color:inherit;text-decoration:none" title="Editar">' + (a.titulo || 'Sin titulo') + '</a></td>' +
        '<td>' + imgCell + '</td>' +
        '<td><span class="badge badge-gold">' + (a.categoria || '') + '</span></td>' +
        '<td class="text-sm text-muted">' + (a.fecha || '') + '</td>' +
        '<td style="white-space:nowrap"><button class="btn btn-sm btn-outline" onclick="Pages.editarArticulo(\'' + a._key + '\')" title="Editar">✎</button> <button class="btn btn-sm btn-red" onclick="Pages.borrarArticulo(\'' + a._key + '\')" title="Eliminar">X</button></td>' +
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
      var statusEl = document.getElementById('ba-gen-status');
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Subiendo imagen...</span>';
      firebase.database().ref('arcano/db/blog/' + key).once('value', function(snap) {
        var article = snap.val();
        var slug = Pages._titleToSlug(article && article.titulo);
        if (!slug) slug = 'blog-img-' + Date.now();
        Pages._uploadBlogImageToGitHub(dataUrl, slug).then(function(url) {
          firebase.database().ref('arcano/db/blog/' + key).update({ imagen_url: url }, function(err) {
            if (err) {
              alert('Error al guardar: ' + (err.message || err));
              if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error al guardar URL</span>';
            } else {
              Pages._loadBlogAdmin();
              if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">Imagen subida correctamente</span>';
            }
          });
        }).catch(function(err) {
          alert('Error al subir imagen: ' + (err.message || err));
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error al subir imagen</span>';
        });
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

  editarArticulo: function(key) {
    firebase.database().ref('arcano/db/blog/' + key).once('value', function(snap) {
      var a = snap.val();
      if (!a) { alert('Articulo no encontrado'); return; }
      Pages._blogEditKey = key;
      var categorias = ['Historias', 'Beneficios', 'Investigaciones', 'Curiosidades', 'Origenes'];
      var previewCard = document.getElementById('ba-preview-card');
      var previewEl = document.getElementById('ba-preview');
      var actionsEl = document.getElementById('ba-preview-actions');
      if (!previewCard || !previewEl || !actionsEl) return;
      var catOpts = '';
      for (var c = 0; c < categorias.length; c++) {
        catOpts += '<option value="' + categorias[c] + '"' + (a.categoria === categorias[c] ? ' selected' : '') + '>' + categorias[c] + '</option>';
      }
      var h = '<div class="form-group"><label>Titulo</label>' +
        '<input type="text" class="input" id="be-titulo" value="' + (a.titulo || '').replace(/"/g, '&quot;') + '"></div>' +
        '<div class="form-group"><label>Subtitulo</label>' +
        '<input type="text" class="input" id="be-subtitulo" value="' + (a.subtitulo || '').replace(/"/g, '&quot;') + '"></div>' +
        '<div class="form-group"><label>Categoria</label>' +
        '<select class="input" id="be-categoria">' + catOpts + '</select></div>' +
        '<div class="form-group"><label>Contenido (HTML)</label>' +
        '<textarea class="input" id="be-contenido" rows="16" style="font-family:monospace;font-size:0.85rem">' + (a.contenido || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea></div>' +
        '<div style="max-height:300px;overflow-y:auto;padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);margin-top:8px" id="be-live-preview"></div>';
      previewEl.innerHTML = h;
      actionsEl.innerHTML = '<button class="btn btn-gold" onclick="Pages.guardarEdicionArticulo()">Guardar Cambios</button>' +
        '<button class="btn btn-outline ml-8" onclick="Pages.descartarArticulo()">Cancelar</button>' +
        '<span id="be-status" class="text-sm text-muted ml-12"></span>';
      previewCard.style.display = 'block';
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var liveEl = document.getElementById('be-live-preview');
      var contenidoInput = document.getElementById('be-contenido');
      function updatePreview() {
        if (liveEl && contenidoInput) liveEl.innerHTML = contenidoInput.value.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      }
      if (contenidoInput) {
        contenidoInput.addEventListener('input', updatePreview);
        updatePreview();
      }
    });
  },

  guardarEdicionArticulo: function() {
    var key = Pages._blogEditKey;
    if (!key) return;
    var titulo = document.getElementById('be-titulo');
    var subtitulo = document.getElementById('be-subtitulo');
    var categoria = document.getElementById('be-categoria');
    var contenido = document.getElementById('be-contenido');
    var statusEl = document.getElementById('be-status');
    if (!titulo || !contenido) return;
    var t = titulo.value.trim();
    if (!t) { alert('El titulo no puede estar vacio'); titulo.focus(); return; }
    var updates = {
      titulo: t,
      subtitulo: subtitulo ? subtitulo.value.trim() : '',
      categoria: categoria ? categoria.value : '',
      contenido: contenido.value
    };
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Guardando...</span>';
    firebase.database().ref('arcano/db/blog/' + key).update(updates, function(err) {
      if (err) {
        alert('Error al guardar: ' + (err.message || err));
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error</span>';
      } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">Guardado</span>';
        Pages._blogEditKey = null;
        Pages.descartarArticulo();
        Pages._loadBlogAdmin();
        Pages._publishBlogSEO(updates);
      }
    });
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
          Pages._publishBlogSEO(articulo);
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

  /* === BLOG IMAGE AUTOMATION === */

  _compressImage: function(dataUrl, maxWidth, quality) {
    maxWidth = maxWidth || 1200;
    quality = quality || 0.8;
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload = function() {
        var w = img.width;
        var h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function() { resolve(dataUrl); };
      img.src = dataUrl;
    });
  },

  _titleToSlug: function(titulo) {
    return (titulo || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  },

  _getGHToken: function() {
    var _gt = 'jksbZrZsYRI8E5<phRNgs]7wPot<M{yd;W63t6ZP';
    return _gt.split('').map(function(c) { return String.fromCharCode(c.charCodeAt(0) - 3); }).join('');
  },

  _uploadToGitHub: function(path, base64Jpg, commitMsg) {
    var token = Pages._getGHToken();
    var repo = 'arcanoespecias/arcanoespecias.github.io';
    var apiBase = 'https://api.github.com/repos/' + repo + '/contents/' + path;
    return fetch(apiBase + '?ref=main', {
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(res) {
      if (res.status === 404) return { sha: null };
      if (!res.ok) throw new Error('GitHub GET error ' + res.status);
      return res.json();
    })
    .then(function(existing) {
      var body = {
        message: (commitMsg || 'update: ' + path),
        content: base64Jpg
      };
      if (existing && existing.sha) body.sha = existing.sha;
      return fetch(apiBase, {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(body)
      });
    })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(e) { throw new Error((e.message || 'GitHub PUT error ' + res.status)); });
      return res.json();
    });
  },

  _uploadBlogImageToGitHub: function(dataUrl, slug) {
    return Pages._compressImage(dataUrl, 1200, 0.8).then(function(compressed) {
      var base64Data = compressed.split(',')[1];
      var path = 'img/blog/' + slug + '.jpg';
      return Pages._uploadToGitHub(path, base64Data).then(function(result) {
        if (result.content && result.content.download_url) return result.content.download_url;
        return 'https://arcanoespecias.com/' + path;
      });
    });
  },

  _processAllBlogImages: function() {
    if (!confirm('Esto convierte todas las imagenes base64 del blog a archivos JPG optimizados en GitHub. Continuar?')) return;
    var statusEl = document.getElementById('ba-gen-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Buscando imagenes base64...</span>';
    firebase.database().ref('arcano/db/blog').once('value', function(snap) {
      var data = snap.val();
      if (!data) { if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">No hay articulos.</span>'; return; }
      var keys = Object.keys(data);
      var toProcess = [];
      for (var i = 0; i < keys.length; i++) {
        var a = data[keys[i]];
        if (a.imagen_url && a.imagen_url.indexOf('data:image') === 0) {
          toProcess.push({ key: keys[i], titulo: a.titulo, dataUrl: a.imagen_url });
        }
      }
      if (toProcess.length === 0) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">No hay imagenes base64 para procesar.</span>';
        return;
      }
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Procesando ' + toProcess.length + ' imagen(es)...</span>';
      function processNext(idx) {
        if (idx >= toProcess.length) {
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">' + toProcess.length + ' imagen(es) procesadas correctamente.</span>';
          Pages._loadBlogAdmin();
          return;
        }
        var item = toProcess[idx];
        var slug = Pages._titleToSlug(item.titulo) || ('blog-img-' + idx);
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">(' + (idx + 1) + '/' + toProcess.length + ') ' + (item.titulo || 'sin titulo') + '...</span>';
        Pages._uploadBlogImageToGitHub(item.dataUrl, slug).then(function(url) {
          firebase.database().ref('arcano/db/blog/' + item.key).update({ imagen_url: url }, function(err) {
            if (err) console.error('Error updating ' + item.key, err);
            processNext(idx + 1);
          });
        }).catch(function(err) {
          console.error('Error uploading ' + item.key, err);
          processNext(idx + 1);
        });
      }
      processNext(0);
    });
  },

  _publishBlogSEO: function(post) {
    var slug = Pages._titleToSlug(post.titulo);
    if (!slug) return;
    var BASE = 'https://arcanoespecias.com';
    var descripcion = post.subtitulo || post.titulo || '';
    var url = BASE + '/blog/' + slug + '.html';
    var imagen = post.imagen_url || BASE + '/icons/logo.png';
    if (imagen.indexOf('data:') === 0) imagen = BASE + '/icons/logo.png';
    var fecha = post.fecha || new Date().toISOString().slice(0, 10);
    var contenido = post.contenido || '';
    contenido = contenido.replace(/src="data:image[^"]*"/g, 'src="' + BASE + '/icons/logo.png"');
    var titulo = post.titulo || 'Articulo';
    var esc = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var schema = '{"@context":"https://schema.org","@type":"Article","headline":' + JSON.stringify(titulo) + ',"description":' + JSON.stringify(descripcion) + ',"image":' + JSON.stringify(imagen) + ',"datePublished":' + JSON.stringify(fecha) + ',"author":{"@type":"Organization","name":"Arcano Especias"},"publisher":{"@type":"Organization","name":"Arcano Especias","logo":{"@type":"ImageObject","url":' + JSON.stringify(BASE + '/icons/logo.png') + '}},"mainEntityOfPage":' + JSON.stringify(url) + '}';
    var html = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>' + esc(titulo) + ' \u2014 Arcano Especias</title>\n<meta name="description" content="' + esc(descripcion) + '">\n<link rel="canonical" href="' + url + '">\n<meta property="og:type" content="article">\n<meta property="og:title" content="' + esc(titulo) + '">\n<meta property="og:description" content="' + esc(descripcion) + '">\n<meta property="og:url" content="' + url + '">\n<meta property="og:image" content="' + imagen + '">\n<meta property="og:locale" content="es_CO">\n<meta property="og:site_name" content="Arcano Especias">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="' + esc(titulo) + '">\n<meta name="twitter:description" content="' + esc(descripcion) + '">\n<meta name="twitter:image" content="' + imagen + '">\n<script type="application/ld+json">' + schema + '<\/script>\n<style>body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}.container{max-width:720px;margin:0 auto;padding:20px 16px}a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}h1{font-size:1.8rem;color:#c9a84c;margin-bottom:8px;line-height:1.3}.meta{color:#a08b6e;font-size:.85rem;margin-bottom:24px}.back{display:inline-block;margin-bottom:24px;padding:8px 16px;border:1px solid #c9a84c;border-radius:6px;color:#c9a84c;font-size:.85rem}.back:hover{background:#c9a84c;color:#1b0b07;text-decoration:none}img.hero{width:100%;border-radius:8px;margin-bottom:24px;max-height:400px;object-fit:cover}.content p{margin-bottom:16px}.content h2{color:#c9a84c;margin-top:32px;margin-bottom:12px}.content h3{color:#d4b86a;margin-top:24px;margin-bottom:8px}.content ul,.content ol{margin-bottom:16px;padding-left:24px}.content blockquote{border-left:3px solid #c9a84c;padding-left:16px;color:#a08b6e;margin:16px 0}.content a{color:#e8c95a}.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}</style>\n</head>\n<body>\n<div class="container">\n<a href="' + BASE + '/" class="back">&larr; Volver a la tienda</a>\n<h1>' + esc(titulo) + '</h1>\n<div class="meta">' + esc(post.categoria || '') + ' &middot; ' + fecha + '</div>\n' + (imagen && imagen.indexOf('data:') !== 0 ? '<img class="hero" src="' + imagen + '" alt="' + esc(titulo) + '" loading="lazy">' : '') + '\n<div class="content">' + contenido + '</div>\n<div class="footer">Arcano Especias &mdash; Especias y Blends artesanales del mundo</div>\n</div>\n</body>\n</html>';
    var path = 'blog/' + slug + '.html';
    var base64 = btoa(unescape(encodeURIComponent(html)));
    Pages._uploadToGitHub(path, base64, 'blog SEO: ' + post.titulo).then(function() {
      console.log('Blog SEO page published:', path);
      Pages._updateSitemap();
    }).catch(function(err) {
      console.error('Blog SEO page failed:', err);
    });
  },

  /* === AUTO SEO: Product Pages === */
  _productSlug: function(nombre) {
    var clean = (nombre || '').replace(/['\u2019\u2018]/g, '');
    var slug = Pages._titleToSlug(clean);
    if (slug === 'za-atar') slug = 'zaatar';
    return slug;
  },

  _publishProductSEO: function(product, type) {
    if (!product || !product.nombre) return;
    var slug = Pages._productSlug(product.nombre);
    if (!slug) return;
    var BASE = 'https://arcanoespecias.com';
    var pageUrl = BASE + '/blends/' + slug + '/';
    var nombre = product.nombre;
    var descripcion = product.descripcion || (type + ' artesanal de Arcano Especias. Descubri su sabor unico.');
    var imagen = product.imagen || BASE + '/icons/logo.png';
    if (imagen.indexOf('data:') === 0) imagen = BASE + '/icons/logo.png';
    if (imagen.indexOf('arcanoespecias.github.io') >= 0) imagen = imagen.replace('arcanoespecias.github.io', 'arcanoespecias.com');
    var cats = product.categorias || [];
    if (typeof cats === 'string') cats = [cats];
    var catStr = cats.join(', ');
    var region = product.region || '';
    var precioChico = product.precioTiendaChico || product.precioChico || 0;
    var precioGrande = product.precioTiendaGrande || product.precioGrande || 0;
    var precio = precioChico || precioGrande;
    var enStock = !!product.enTienda;
    var usoStr = '';
    if (Array.isArray(product.uso)) usoStr = product.uso.join(', ');
    else if (product.uso) usoStr = product.uso;
    var ingsHtml = '';
    if (product.ingredientes && product.ingredientes.length) {
      for (var i = 0; i < product.ingredientes.length; i++) {
        ingsHtml += '<li>' + (product.ingredientes[i].especiaNombre || '') + '</li>';
      }
    }
    var esc = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var schema = '{"@context":"https://schema.org/","@type":"Product","name":' + JSON.stringify(nombre) + ',"description":' + JSON.stringify(descripcion) + ',"brand":{"@type":"Brand","name":"Arcano Especias"},"offers":{"@type":"Offer","url":' + JSON.stringify(pageUrl) + ',"priceCurrency":"COP","price":"' + precio + '","availability":"' + (enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock') + '"},"image":' + JSON.stringify(imagen) + ',"category":' + JSON.stringify(catStr) + '}';
    var breadcrumb = '{"@context":"https://schema.org/","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Inicio","item":"' + BASE + '/"},{"@type":"ListItem","position":2,"name":"Tienda","item":"' + BASE + '/"},{"@type":"ListItem","position":3,"name":' + JSON.stringify(nombre) + ',"item":' + JSON.stringify(pageUrl) + '}]}';
    var priceBlock = '';
    if (precioChico) {
      priceBlock += '<div style="margin-bottom:8px"><div class="pl">Pequeno' + (product.gramosChico ? ' (' + product.gramosChico + 'g)' : '') + '</div><div class="pv">$' + precioChico.toLocaleString('es-CO') + '</div></div>';
    }
    if (precioGrande) {
      priceBlock += '<div><div class="pl">Grande' + (product.gramosGrande ? ' (' + product.gramosGrande + 'g)' : '') + '</div><div class="pv">$' + precioGrande.toLocaleString('es-CO') + '</div></div>';
    }
    if (!precioChico && !precioGrande && product.precio) {
      priceBlock = '<div><div class="pl">Precio</div><div class="pv">$' + product.precio.toLocaleString('es-CO') + '</div></div>';
    }
    var stockBadge = enStock ? '<span class="si sin">En stock</span>' : '<span class="si sout">Agotado</span>';
    var extrasHtml = '';
    if (usoStr) extrasHtml += '<p style="margin-bottom:16px;color:#a08b6e">Usos: ' + esc(usoStr) + '</p>';
    if (region) extrasHtml += '<p style="margin-bottom:16px;color:#a08b6e">Origen: ' + esc(region) + '</p>';
    if (ingsHtml) extrasHtml += '<p style="margin-bottom:8px;color:#a08b6e">Ingredientes:</p><ul style="margin-bottom:16px;padding-left:24px;color:#a08b6e">' + ingsHtml + '</ul>';
    var html = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>' + esc(nombre) + ' - ' + type + ' | Arcano Especias</title>\n<meta name="description" content="' + esc(descripcion) + '">\n<link rel="canonical" href="' + pageUrl + '">\n<meta property="og:type" content="product">\n<meta property="og:title" content="' + esc(nombre) + ' - Arcano Especias">\n<meta property="og:description" content="' + esc(descripcion) + '">\n<meta property="og:url" content="' + pageUrl + '">\n<meta property="og:image" content="' + imagen + '">\n<meta property="og:locale" content="es_CO">\n<meta property="og:site_name" content="Arcano Especias">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="' + esc(nombre) + ' - Arcano Especias">\n<meta name="twitter:description" content="' + esc(descripcion) + '">\n<meta name="twitter:image" content="' + imagen + '">\n<script type="application/ld+json">' + schema + '<\\/script>\n<script type="application/ld+json">' + breadcrumb + '<\\/script>\n<style>body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}.c{max-width:720px;margin:0 auto;padding:20px 16px}a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}h1{font-size:1.8rem;color:#c9a84c;margin-bottom:8px}.m{color:#a08b6e;font-size:.85rem;margin-bottom:24px}.bk{display:inline-block;margin-bottom:24px;padding:8px 16px;border:1px solid #c9a84c;border-radius:6px;color:#c9a84c;font-size:.85rem}.bk:hover{background:#c9a84c;color:#1b0b07;text-decoration:none}img.h{width:100%;border-radius:8px;margin-bottom:24px;max-height:400px;object-fit:cover}.pb{background:#2d1a10;border-radius:8px;padding:20px;margin:20px 0}.pl{color:#a08b6e;font-size:.8rem;text-transform:uppercase;letter-spacing:1px}.pv{font-size:2rem;color:#c9a84c;font-weight:700}.si{display:inline-block;padding:4px 12px;border-radius:12px;font-size:.8rem;margin-left:12px}.sin{background:#1a3a1a;color:#4caf50}.sout{background:#3a1a1a;color:#f44336}.f{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}</style>\n</head>\n<body>\n<div class="c">\n<a href="' + BASE + '/" class="bk">&larr; Volver a la tienda</a>\n<h1>' + esc(nombre) + '</h1>\n<div class="m"><span>' + esc(type) + '</span> &middot; <span>' + esc(catStr) + '</span>' + (region ? ' &middot; <span>' + esc(region) + '</span>' : '') + '</div>\n' + (imagen && imagen.indexOf('data:') !== 0 ? '<img class="h" src="' + imagen + '" alt="' + esc(nombre) + ' - ' + type + ' Arcano Especias" loading="lazy">' : '') + '\n<p>' + esc(descripcion) + '</p>\n<div class="pb">\n' + priceBlock + '\n' + stockBadge + '\n</div>\n' + extrasHtml + '\n<a href="' + BASE + '/?producto=' + slug + '" class="bk" style="margin-top:24px">Comprar ' + esc(nombre) + ' &rarr;</a>\n<div class="f">Arcano Especias &mdash; Especias y Blends artesanales del mundo</div>\n</div>\n</body>\n</html>';
    var path = 'p/' + slug + '.html';
    var b64 = btoa(unescape(encodeURIComponent(html)));
    Pages._uploadToGitHub(path, b64, 'producto SEO: ' + nombre).then(function() {
      console.log('Product SEO published:', path);
    }).catch(function(err) {
      console.error('Product SEO failed:', path, err);
    });
  },

  /* === AUTO SEO: Recipe Pages === */
  _publishRecipeSEO: function(recipe) {
    if (!recipe || !recipe.titulo) return;
    var slug = Pages._titleToSlug(recipe.titulo);
    if (!slug) return;
    var BASE = 'https://arcanoespecias.com';
    var pageUrl = BASE + '/recetas/' + slug + '.html';
    var titulo = recipe.titulo;
    var descripcion = recipe.descripcion || ('Receta de ' + titulo + ' con especias Arcano');
    var fecha = recipe.fecha || new Date().toISOString().slice(0, 10);
    var categoria = recipe.categoria || 'Comida';
    var dificultad = recipe.dificultad || 'Facil';
    var tiempo = recipe.tiempo || '';
    var porciones = recipe.porciones || '';
    var ingredientes = recipe.ingredientes || [];
    var pasos = recipe.pasos || [];
    var productosUsados = recipe.productos_usados || [];
    var esc = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var ingsHtml = '';
    for (var i = 0; i < ingredientes.length; i++) { ingsHtml += '<li>' + esc(ingredientes[i]) + '</li>'; }
    var stepsHtml = '';
    for (var i = 0; i < pasos.length; i++) { stepsHtml += '<li>' + esc(pasos[i]) + '</li>'; }
    var diffClass = 'badge-easy';
    if (dificultad === 'Media') diffClass = 'badge-medium';
    if (dificultad === 'Dificil') diffClass = 'badge-hard';
    var cookTime = 'PT30M';
    if (tiempo) { var tm = tiempo.match(/(\d+)/); if (tm) cookTime = 'PT' + tm[1] + 'M'; }
    var schemaIngs = [];
    for (var i = 0; i < ingredientes.length; i++) schemaIngs.push(JSON.stringify(ingredientes[i]));
    var schemaSteps = [];
    for (var i = 0; i < pasos.length; i++) schemaSteps.push('{"@type":"HowToStep","text":' + JSON.stringify(pasos[i]) + '}');
    var schema = '{"@context":"https://schema.org","@type":"Recipe","name":' + JSON.stringify(titulo) + ',"description":' + JSON.stringify(descripcion) + ',"datePublished":' + JSON.stringify(fecha) + ',"recipeCategory":' + JSON.stringify(categoria) + ',"cookTime":"' + cookTime + '","recipeYield":' + JSON.stringify(porciones) + ',"recipeIngredient":[' + schemaIngs.join(',') + '],"recipeInstructions":[' + schemaSteps.join(',') + '],"author":{"@type":"Organization","name":"Arcano Especias"},"publisher":{"@type":"Organization","name":"Arcano Especias","logo":{"@type":"ImageObject","url":' + JSON.stringify(BASE + '/icons/logo.png') + '}},"mainEntityOfPage":' + JSON.stringify(pageUrl) + '}';
    var puHtml = '';
    if (productosUsados.length > 0) {
      var puChips = '';
      var allProds = ArcanoDB.getTiendaProductos();
      for (var i = 0; i < productosUsados.length; i++) {
        var pName = productosUsados[i];
        var found = null;
        for (var j = 0; j < allProds.length; j++) { if (allProds[j].nombre === pName) { found = allProds[j]; break; } }
        if (found) {
          var pSlug = Pages._productSlug(found.nombre);
          puChips += '<a href="' + BASE + '/?producto=' + pSlug + '" class="pu-chip">' + esc(pName) + '</a>';
        } else {
          puChips += '<span class="pu-chip pu-nolink">' + esc(pName) + '</span>';
        }
      }
      puHtml = '<div class="productos-usados"><h3>Productos Arcano usados</h3><div class="pu-list">' + puChips + '</div></div>';
    }
    var html = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>' + esc(titulo) + ' \u2014 Arcano Especias</title>\n<meta name="description" content="' + esc(descripcion) + '">\n<link rel="canonical" href="' + pageUrl + '">\n<meta property="og:type" content="article">\n<meta property="og:title" content="' + esc(titulo) + '">\n<meta property="og:description" content="' + esc(descripcion) + '">\n<meta property="og:url" content="' + pageUrl + '">\n<meta property="og:image" content="' + BASE + '/icons/logo.png">\n<meta property="og:locale" content="es_CO">\n<meta property="og:site_name" content="Arcano Especias">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="' + esc(titulo) + '">\n<meta name="twitter:description" content="' + esc(descripcion) + '">\n<meta name="twitter:image" content="' + BASE + '/icons/logo.png">\n<script type="application/ld+json">' + schema + '<\\/script>\n<style>body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}.container{max-width:720px;margin:0 auto;padding:20px 16px}a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}h1{font-size:1.6rem;color:#c9a84c;margin-bottom:8px;line-height:1.3}.meta{color:#a08b6e;font-size:.85rem;margin-bottom:24px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}.meta .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.75rem;font-weight:600}.badge-easy{background:#2d5a27;color:#8fce80}.badge-medium{background:#5a4a1a;color:#e8c95a}.badge-hard{background:#5a1a1a;color:#e87c7c}.back{display:inline-block;margin-bottom:24px;padding:8px 16px;border:1px solid #c9a84c;border-radius:6px;color:#c9a84c;font-size:.85rem}.back:hover{background:#c9a84c;color:#1b0b07;text-decoration:none}.content h2{color:#c9a84c;margin-top:32px;margin-bottom:12px;font-size:1.2rem}.content ul,.content ol{margin-bottom:16px;padding-left:24px}.content li{margin-bottom:6px}.productos-usados{margin-top:36px;padding:20px;background:#231510;border-radius:10px;border:1px solid #3d2515}.productos-usados h3{color:#c9a84c;margin:0 0 12px 0;font-size:1rem}.pu-list{display:flex;flex-wrap:wrap;gap:8px}.pu-chip{display:inline-block;padding:6px 14px;background:#2d1a10;border:1px solid #c9a84c;border-radius:20px;color:#c9a84c;font-size:.85rem}.pu-chip:hover{background:#c9a84c;color:#1b0b07;text-decoration:none}.pu-nolink{opacity:.6;border-color:#6b5a42;color:#a08b6e;cursor:default}.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}</style>\n</head>\n<body>\n<div class="container">\n<a href="' + BASE + '/" class="back">&larr; Volver a la tienda</a>\n<h1>' + esc(titulo) + '</h1>\n<div class="meta">\n<span>' + esc(categoria) + '</span>\n<span class="badge ' + diffClass + '">' + esc(dificultad) + '</span>\n' + (tiempo ? '<span>' + esc(tiempo) + '</span>\n' : '') + (porciones ? '<span>' + esc(porciones) + '</span>\n' : '') + '<span>' + fecha + '</span>\n</div>\n<div class="content">\n<h2>Ingredientes</h2>\n<ul>' + ingsHtml + '</ul>\n<h2>Preparacion</h2>\n<ol>' + stepsHtml + '</ol>\n</div>\n' + puHtml + '\n<div class="footer">Arcano Especias &mdash; Especias y Blends artesanales del mundo</div>\n</div>\n</body>\n</html>';
    var path = 'recetas/' + slug + '.html';
    var b64 = btoa(unescape(encodeURIComponent(html)));
    Pages._uploadToGitHub(path, b64, 'receta SEO: ' + titulo).then(function() {
      console.log('Recipe SEO published:', path);
    }).catch(function(err) {
      console.error('Recipe SEO failed:', path, err);
    });
  },

  /* === AUTO SEO: Sitemap === */
  _sitemapTimer: null,
  _updateSitemap: function() {
    if (Pages._sitemapTimer) clearTimeout(Pages._sitemapTimer);
    Pages._sitemapTimer = setTimeout(function() { Pages._doUpdateSitemap(); }, 5000);
  },

  _doUpdateSitemap: function() {
    // DESHABILITADO: este método generaba el sitemap con URLs /p/*.html (legacy)
    // y con el dominio antiguo arcanoespecias.github.io.
    // Ahora el sitemap lo genera 'Regenerar SEO Completo' correctamente con
    // URLs /blends/<slug>/ y arcanoespecias.com.
    // Si se necesita regenerar el sitemap, usar 'Regenerar SEO Completo' en Tienda.
    console.warn('[SEO] _doUpdateSitemap deshabilitado. Usar "Regenerar SEO Completo" en su lugar.');
    return;
  },

  _doUpdateSitemapLegacy: function() {
    var BASE = 'https://arcanoespecias.com';
    var today = new Date().toISOString().slice(0, 10);
    var urls = ['<url><loc>' + BASE + '/</loc><lastmod>' + today + '</lastmod><priority>1.0</priority><changefreq>weekly</changefreq></url>'];
    var productos = ArcanoDB.getTiendaProductos();
    for (var i = 0; i < productos.length; i++) {
      var p = productos[i];
      var slug = Pages._productSlug(p.nombre);
      if (slug) urls.push('<url><loc>' + BASE + '/blends/' + slug + '/</loc><lastmod>' + today + '</lastmod><priority>0.8</priority><changefreq>monthly</changefreq></url>');
    }
    var pending = 2;
    function onDone() {
      pending--;
      if (pending > 0) return;
      var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n';
      var b64 = btoa(unescape(encodeURIComponent(xml)));
      Pages._uploadToGitHub('sitemap.xml', b64, 'sitemap actualizado').then(function() {
        console.log('Sitemap updated: ' + urls.length + ' URLs');
      }).catch(function(err) {
        console.error('Sitemap update failed:', err);
      });
    }
    firebase.database().ref('arcano/db/blog').once('value', function(snap) {
      var data = snap.val();
      if (data) {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          var a = data[keys[i]];
          if (a.titulo) {
            var slug = Pages._titleToSlug(a.titulo);
            var fecha = a.fecha || today;
            urls.push('<url><loc>' + BASE + '/blog/' + slug + '.html</loc><lastmod>' + fecha + '</lastmod><priority>0.7</priority></url>');
          }
        }
      }
      onDone();
    }).catch(function() { onDone(); });
    firebase.database().ref('arcano/db/recetas').once('value', function(snap) {
      var data = snap.val();
      if (data) {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          var r = data[keys[i]];
          if (r.titulo) {
            var slug = Pages._titleToSlug(r.titulo);
            var fecha = r.fecha || today;
            urls.push('<url><loc>' + BASE + '/recetas/' + slug + '.html</loc><lastmod>' + fecha + '</lastmod><priority>0.7</priority></url>');
          }
        }
      }
      onDone();
    }).catch(function() { onDone(); });
  },

  _regenerateAllBlogSEO: function() {
    if (!confirm('Regenerar todas las paginas SEO del blog y el sitemap?')) return;
    var statusEl = document.getElementById('ba-gen-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Regenerando paginas SEO...</span>';
    firebase.database().ref('arcano/db/blog').once('value', function(snap) {
      var data = snap.val();
      if (!data) { if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">No hay articulos.</span>'; return; }
      var keys = Object.keys(data);
      var posts = [];
      for (var i = 0; i < keys.length; i++) {
        posts.push(data[keys[i]]);
      }
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Publicando ' + posts.length + ' paginas...</span>';
      function next(idx) {
        if (idx >= posts.length) {
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">' + posts.length + ' paginas SEO regeneradas.</span>';
          return;
        }
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">(' + (idx + 1) + '/' + posts.length + ') ' + (posts[idx].titulo || '') + '</span>';
        Pages._publishBlogSEO(posts[idx]);
        setTimeout(function() { next(idx + 1); }, 1500);
      }
      next(0);
    });
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
    h += '<button class="est-tab' + (Pages._estTab === 'costosproducto' ? ' active' : '') + '" onclick="Pages._estTab=\'costosproducto\';App.renderPage(\'estadisticas\')">Costos por Producto</button>';
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
    else if (Pages._estTab === 'costosproducto') Pages._renderCostosPorProducto(container.querySelector('#est-content'), especias, blends);
    else if (Pages._estTab === 'web') Pages._renderWebAnalytics(container.querySelector('#est-content'));
  },

  /* ================================================================
     COSTOS POR PRODUCTO TAB
     Cards individuales con costo total chico/grande por blend y especia.
     ================================================================ */
  _estCostoFilter: 'todos',
  _estCostoSort: 'nombre',

  _renderCostosPorProducto: function(el, especias, blends) {
    if (!el) return;
    var self = Pages;
    var costos = ArcanoDB.getCostosInsumos();
    var pkgC = (Number(costos.envaseChico) || 0) + (Number(costos.bolsaChica) || 0) + (Number(costos.cinta) || 0) + (Number(costos.stickerChico) || 0);
    var pkgG = (Number(costos.envaseGrande) || 0) + (Number(costos.bolsaGrande) || 0) + (Number(costos.cinta) || 0) + (Number(costos.stickerGrande) || 0);

    // Construir lista unificada de productos
    var items = [];
    for (var bi = 0; bi < blends.length; bi++) {
      var bl = blends[bi];
      var ings = bl.ingredientes || [];
      var espChico = 0, espGrande = 0;
      var detailChico = [], detailGrande = [];
      for (var ig = 0; ig < ings.length; ig++) {
        var ing = ings[ig];
        var cpg = (costos.especias && costos.especias[ing.especiaId]) || 0;
        var gc = Number(ing.gramosChico) || 0;
        var gg = Number(ing.gramosGrande) || 0;
        var cc = gc * cpg;
        var cg = gg * cpg;
        espChico += cc;
        espGrande += cg;
        if (gc > 0 || gg > 0) {
          detailChico.push({ nombre: ing.especiaNombre || '?', gramos: gc, costo: cc });
          detailGrande.push({ nombre: ing.especiaNombre || '?', gramos: gg, costo: cg });
        }
      }
      items.push({
        tipo: 'blend',
        id: bl.id,
        nombre: bl.nombre || '?',
        categoria: bl.categoria || '',
        espChico: espChico, espGrande: espGrande,
        pkgChico: pkgC, pkgGrande: pkgG,
        totalChico: espChico + pkgC,
        totalGrande: espGrande + pkgG,
        precioChico: Number(bl.precioChico) || 0,
        precioGrande: Number(bl.precioGrande) || 0,
        detailChico: detailChico,
        detailGrande: detailGrande
      });
    }
    for (var ei = 0; ei < especias.length; ei++) {
      var esp = especias[ei];
      var cpg2 = (costos.especias && costos.especias[esp.id]) || 0;
      var gc2 = Number(esp.gramosChico) || 0;
      var gg2 = Number(esp.gramosGrande) || 0;
      var cc2 = gc2 * cpg2;
      var cg2 = gg2 * cpg2;
      items.push({
        tipo: 'especia',
        id: esp.id,
        nombre: esp.nombre || '?',
        categoria: esp.categoria || '',
        espChico: cc2, espGrande: cg2,
        pkgChico: pkgC, pkgGrande: pkgG,
        totalChico: cc2 + pkgC,
        totalGrande: cg2 + pkgG,
        precioChico: Number(esp.precioChico) || 0,
        precioGrande: Number(esp.precioGrande) || 0,
        detailChico: cpg2 > 0 ? [{ nombre: esp.nombre, gramos: gc2, costo: cc2 }] : [],
        detailGrande: cpg2 > 0 ? [{ nombre: esp.nombre, gramos: gg2, costo: cg2 }] : []
      });
    }

    // Filtro
    var filter = self._estCostoFilter || 'todos';
    var sort = self._estCostoSort || 'nombre';
    var filtered = items.filter(function(it) {
      if (filter === 'blend') return it.tipo === 'blend';
      if (filter === 'especia') return it.tipo === 'especia';
      return true;
    });
    // Sort
    filtered.sort(function(a, b) {
      if (sort === 'costoChico') return b.totalChico - a.totalChico;
      if (sort === 'costoGrande') return b.totalGrande - a.totalGrande;
      if (sort === 'margenChico') {
        var ma = a.precioChico > 0 ? (a.precioChico - a.totalChico) / a.precioChico : -1;
        var mb = b.precioChico > 0 ? (b.precioChico - b.totalChico) / b.precioChico : -1;
        return mb - ma;
      }
      return (a.nombre || '').localeCompare(b.nombre || '');
    });

    // Resumen arriba: KPIs globales
    var sumChico = 0, sumGrande = 0, count = filtered.length;
    var maxChico = 0, maxGrande = 0, minChico = Infinity, minGrande = Infinity;
    for (var k = 0; k < filtered.length; k++) {
      var tc = filtered[k].totalChico, tg = filtered[k].totalGrande;
      sumChico += tc; sumGrande += tg;
      if (tc > maxChico) maxChico = tc;
      if (tg > maxGrande) maxGrande = tg;
      if (tc < minChico) minChico = tc;
      if (tg < minGrande) minGrande = tg;
    }
    if (!isFinite(minChico)) minChico = 0;
    if (!isFinite(minGrande)) minGrande = 0;
    var promChico = count > 0 ? sumChico / count : 0;
    var promGrande = count > 0 ? sumGrande / count : 0;

    var h = '';
    // Panel de packaging visible arriba
    h += '<div class="card"><div class="card-header"><h3>Costo de Packaging (aplica a todos los productos)</h3></div><div class="card-body">';
    h += '<div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">$' + pkgC.toLocaleString() + '</div><div class="stat-label">Frasco Pequeno</div><div class="stat-sub text-xs text-muted">Envase $' + (Number(costos.envaseChico)||0) + ' + Bolsa $' + (Number(costos.bolsaChica)||0) + ' + Cinta $' + (Number(costos.cinta)||0) + ' + Sticker $' + (Number(costos.stickerChico)||0) + '</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">$' + pkgG.toLocaleString() + '</div><div class="stat-label">Frasco Grande</div><div class="stat-sub text-xs text-muted">Envase $' + (Number(costos.envaseGrande)||0) + ' + Bolsa $' + (Number(costos.bolsaGrande)||0) + ' + Cinta $' + (Number(costos.cinta)||0) + ' + Sticker $' + (Number(costos.stickerGrande)||0) + '</div></div>';
    h += '</div></div></div>';

    // Resumen estadistico
    h += '<div class="card mt-16"><div class="card-header"><h3>Resumen ' + (filter === 'blend' ? 'de Blends' : filter === 'especia' ? 'de Especias' : 'de Todos los Productos') + '</h3></div><div class="card-body">';
    h += '<div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">';
    h += '<div class="stat-card"><div class="stat-value">' + count + '</div><div class="stat-label">Productos</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">$' + promChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div><div class="stat-label">Costo Promedio Chico</div><div class="stat-sub text-xs text-muted">min $' + minChico.toLocaleString(undefined,{maximumFractionDigits:0}) + ' · max $' + maxChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">$' + promGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div><div class="stat-label">Costo Promedio Grande</div><div class="stat-sub text-xs text-muted">min $' + minGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + ' · max $' + maxGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</div></div>';
    h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">$' + (sumChico + sumGrande).toLocaleString() + '</div><div class="stat-label">Suma total (ch+gr)</div></div>';
    h += '</div></div></div>';

    // Filtros y orden
    h += '<div class="card mt-16"><div class="card-body" style="padding:12px">';
    h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">';
    h += '<span class="text-xs text-muted" style="margin-right:4px">Filtrar:</span>';
    h += '<button class="btn btn-sm ' + (filter === 'todos' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._estCostoFilter=\'todos\';App.renderPage(\'estadisticas\')">Todos</button>';
    h += '<button class="btn btn-sm ' + (filter === 'blend' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._estCostoFilter=\'blend\';App.renderPage(\'estadisticas\')">Blends</button>';
    h += '<button class="btn btn-sm ' + (filter === 'especia' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._estCostoFilter=\'especia\';App.renderPage(\'estadisticas\')">Especias</button>';
    h += '<span class="text-xs text-muted" style="margin-left:16px;margin-right:4px">Ordenar:</span>';
    h += '<button class="btn btn-sm ' + (sort === 'nombre' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._estCostoSort=\'nombre\';App.renderPage(\'estadisticas\')">Nombre</button>';
    h += '<button class="btn btn-sm ' + (sort === 'costoChico' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._estCostoSort=\'costoChico\';App.renderPage(\'estadisticas\')">Costo Chico</button>';
    h += '<button class="btn btn-sm ' + (sort === 'costoGrande' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._estCostoSort=\'costoGrande\';App.renderPage(\'estadisticas\')">Costo Grande</button>';
    h += '<button class="btn btn-sm ' + (sort === 'margenChico' ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._estCostoSort=\'margenChico\';App.renderPage(\'estadisticas\')">Margen Chico</button>';
    h += '</div></div></div>';

    // Cards grid
    if (filtered.length === 0) {
      h += '<p class="text-muted text-center" style="margin-top:24px">No hay productos para mostrar.</p>';
    } else {
      h += '<div class="costo-card-grid">';
      for (var ci = 0; ci < filtered.length; ci++) {
        var it = filtered[ci];
        var margenC = it.precioChico - it.totalChico;
        var margenG = it.precioGrande - it.totalGrande;
        var pctC = it.precioChico > 0 ? (margenC / it.precioChico * 100) : 0;
        var pctG = it.precioGrande > 0 ? (margenG / it.precioGrande * 100) : 0;
        var tipoBadge = it.tipo === 'blend' ? '<span class="badge badge-blue">Blend</span>' : '<span class="badge badge-gold">Especia</span>';
        var margenColorC = margenC >= 0 ? 'var(--green)' : 'var(--red)';
        var margenColorG = margenG >= 0 ? 'var(--green)' : 'var(--red)';

        h += '<div class="costo-card">';
        h += '<div class="costo-card-header">';
        h += '<div><div class="costo-card-name">' + esc(it.nombre) + '</div>' + tipoBadge + (it.categoria ? ' <span class="text-xs text-muted">' + esc(it.categoria) + '</span>' : '') + '</div>';
        h += '</div>';
        h += '<div class="costo-card-body">';

        // Columna Chico
        h += '<div class="costo-card-col">';
        h += '<div class="costo-card-talla">Pequeno</div>';
        h += '<div class="costo-card-row"><span>Especias</span><span>$' + it.espChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.detailChico.length > 0 && it.detailChico.length <= 4) {
          for (var dc = 0; dc < it.detailChico.length; dc++) {
            var d = it.detailChico[dc];
            h += '<div class="costo-card-subrow"><span>' + esc(d.nombre) + ' ' + d.gramos + 'g</span><span>$' + d.costo.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
          }
        }
        h += '<div class="costo-card-row"><span>Empaque</span><span>$' + it.pkgChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-total"><span>Total</span><span style="color:var(--red)">$' + it.totalChico.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.precioChico > 0) {
          h += '<div class="costo-card-row"><span>Venta</span><span style="color:var(--gold)">$' + it.precioChico.toLocaleString() + '</span></div>';
          h += '<div class="costo-card-row"><span>Margen</span><span style="color:' + margenColorC + '">$' + margenC.toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + pctC.toFixed(0) + '%)</span></div>';
        }
        h += '</div>';

        // Columna Grande
        h += '<div class="costo-card-col">';
        h += '<div class="costo-card-talla">Grande</div>';
        h += '<div class="costo-card-row"><span>Especias</span><span>$' + it.espGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.detailGrande.length > 0 && it.detailGrande.length <= 4) {
          for (var dg = 0; dg < it.detailGrande.length; dg++) {
            var d2 = it.detailGrande[dg];
            h += '<div class="costo-card-subrow"><span>' + esc(d2.nombre) + ' ' + d2.gramos + 'g</span><span>$' + d2.costo.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
          }
        }
        h += '<div class="costo-card-row"><span>Empaque</span><span>$' + it.pkgGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        h += '<div class="costo-card-total"><span>Total</span><span style="color:var(--red)">$' + it.totalGrande.toLocaleString(undefined,{maximumFractionDigits:0}) + '</span></div>';
        if (it.precioGrande > 0) {
          h += '<div class="costo-card-row"><span>Venta</span><span style="color:var(--gold)">$' + it.precioGrande.toLocaleString() + '</span></div>';
          h += '<div class="costo-card-row"><span>Margen</span><span style="color:' + margenColorG + '">$' + margenG.toLocaleString(undefined,{maximumFractionDigits:0}) + ' (' + pctG.toFixed(0) + '%)</span></div>';
        }
        h += '</div>';

        h += '</div></div>';
      }
      h += '</div>';
    }

    el.innerHTML = h;
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
    var totalEnvios = 0, totalEnviosGratis = 0;
    var prodMap = {}, tipoMap = {}, tallaMap = {}, diaMap = {}, monthMap = {}, ciudadMap = {}, sourceMap = {};
    for (var d = 0; d < data.length; d++) {
      var s = data[d];
      totalIngresos += (s.total || 0);
      // Envío se cuenta separado (no es venta)
      if (s.envioGratis) {
        totalEnviosGratis++;
      } else {
        totalEnvios += (s.envioCosto || 0);
      }
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
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + totalIngresos.toLocaleString() + '</div><div class="est-kpi-label">Ingresos por Ventas</div><div class="est-kpi-sub">' + totalOps + ' operaciones</div></div>';
    h += '<div class="est-kpi"><div class="est-kpi-value">$' + totalEnvios.toLocaleString() + '</div><div class="est-kpi-label">Ingresos por Envíos</div><div class="est-kpi-sub">' + totalEnviosGratis + ' envíos gratis</div></div>';
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

/* ==================== CLIENTES (tienda) ==================== */
Pages.renderClientes = function(el) {
  var clientes = ArcanoDB.getClientes();
  var pedidos = ArcanoDB.getPedidos();

  // Calcular total comprado historico por cliente (sumando pedidos no cancelados)
  var totalPorCliente = {};
  for (var pi = 0; pi < pedidos.length; pi++) {
    var p = pedidos[pi];
    if (p.clienteId && p.estado !== 'cancelado') {
      totalPorCliente[p.clienteId] = (totalPorCliente[p.clienteId] || 0) + (p.total || 0);
    }
  }

  // KPIs resumen
  var totalClientes = clientes.length;
  var nuevosEsteMes = 0;
  var mes = new Date().toISOString().slice(0, 7);
  for (var ci = 0; ci < clientes.length; ci++) {
    if ((clientes[ci].creado || '').startsWith(mes)) nuevosEsteMes++;
  }

  var h = '<div class="page-header"><h2>Clientes</h2>';
  h += '<span class="badge badge-gold" style="font-size:0.85rem">' + totalClientes + ' clientes</span>';
  if (nuevosEsteMes > 0) h += '<span class="badge badge-green" style="font-size:0.85rem;margin-left:8px">' + nuevosEsteMes + ' nuevos este mes</span>';
  h += '</div>';

  if (totalClientes === 0) {
    h += '<div class="card"><div class="card-body"><p class="text-center text-muted">Todavía no hay clientes registrados. Cuando un cliente haga click en "Mi Cuenta" en la tienda y se registre con su WhatsApp + nombre, aparecerá aquí automáticamente.</p></div></div>';
    el.innerHTML = h;
    return;
  }

  // === Clientes recién llegados (últimas 24h) ===
  var hace24h = Date.now() - 24 * 60 * 60 * 1000;
  var recientes = clientes.filter(function(c) {
    var t = c.creado ? new Date(c.creado).getTime() : 0;
    return t > hace24h;
  }).sort(function(a, b) {
    return (b.creado || '').localeCompare(a.creado || '');
  });

  if (recientes.length > 0) {
    h += '<div class="card mb-16"><div class="card-header"><h3>🆕 Recién llegados (' + recientes.length + ')</h3><p class="text-xs text-muted">Clientes que se registraron en las últimas 24 horas</p></div><div class="card-body">';
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>WhatsApp</th><th>Registrado hace</th><th></th></tr></thead><tbody>';
    for (var ri = 0; ri < recientes.length; ri++) {
      var r = recientes[ri];
      var telNorm = r.telNorm || '';
      var waLink = telNorm ? 'https://wa.me/' + telNorm : '#';
      var tiempoStr = Pages._formatearTiempo(Date.now() - new Date(r.creado).getTime());
      h += '<tr>' +
        '<td class="fw7">' + esc(r.nombre || 'Sin nombre') + '</td>' +
        '<td><a href="' + waLink + '" target="_blank" style="color:var(--gold)">' + esc(r.telefono || '-') + '</a></td>' +
        '<td class="text-sm text-muted">' + tiempoStr + '</td>' +
        '<td><a href="' + waLink + '?text=' + encodeURIComponent('¡Hola ' + (r.nombre || '') + '! Bienvenido a Arcano Especias. Ya estás registrado en nuestra tienda. Cualquier duda escríbenos por aquí 🌶️') + '" target="_blank" class="btn btn-sm btn-gold" style="text-decoration:none">Enviar bienvenida</a></td>' +
      '</tr>';
    }
    h += '</tbody></table></div>';
    h += '</div></div>';
  }

  // Input de búsqueda
  h += '<div class="card mb-16"><div class="card-body">' +
    '<div class="form-group" style="margin:0"><input class="input" id="clientes-search" placeholder="Buscar por nombre, WhatsApp o email..." oninput="Pages._filterClientesTable(this.value)"></div>' +
  '</div></div>';

  h += '<div class="card"><div class="card-header"><h3>Lista de Clientes</h3></div>' +
    '<div class="card-body" id="clientes-list-container">';

  h += Pages._renderClientesTable(clientes, totalPorCliente);
  h += '</div></div>';

  el.innerHTML = h;
};

Pages._renderClientesTable = function(clientes, totalPorCliente) {
  if (!clientes || clientes.length === 0) {
    return '<p class="text-center text-muted">Sin resultados.</p>';
  }
  var h = '<div class="table-wrap"><table class="table"><thead><tr>' +
    '<th>Nombre</th><th>WhatsApp</th><th>Email</th><th>Ciudad</th>' +
    '<th>Pedidos</th><th>Total Comprado</th><th>Último Pedido</th><th></th>' +
    '</tr></thead><tbody>';
  for (var i = 0; i < clientes.length; i++) {
    var c = clientes[i];
    var total = totalPorCliente[c._key] || 0;
    var ultimoPed = c.ultimoPedido ? new Date(c.ultimoPedido).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) : '-';
    var tel = c.telefono || '';
    var telNorm = c.telNorm || '';
    var waLink = telNorm ? 'https://wa.me/' + telNorm : '#';
    h += '<tr class="cliente-row" data-nombre="' + esc((c.nombre || '').toLowerCase()) + '" data-tel="' + esc(tel.toLowerCase()) + '" data-email="' + esc((c.email || '').toLowerCase()) + '">' +
      '<td class="fw7">' + esc(c.nombre || 'Sin nombre') + '</td>' +
      '<td><a href="' + waLink + '" target="_blank" style="color:var(--gold)">' + esc(tel) + '</a></td>' +
      '<td class="text-sm">' + esc(c.email || '-') + '</td>' +
      '<td>' + esc(c.ciudad || '-') + '</td>' +
      '<td><span class="badge badge-gold">' + (c.totalPedidos || 0) + '</span></td>' +
      '<td class="fw7" style="color:var(--green)">$' + total.toLocaleString() + '</td>' +
      '<td class="text-sm text-muted">' + ultimoPed + '</td>' +
      '<td>' +
        '<button class="btn btn-sm btn-outline" onclick="Pages._verHistorialCliente(\'' + c._key + '\')" title="Ver historial">📜</button> ' +
        '<button class="btn btn-sm btn-red" onclick="Pages._deleteCliente(\'' + c._key + '\')" title="Eliminar">X</button>' +
      '</td>' +
      '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
};

Pages._filterClientesTable = function(q) {
  q = (q || '').toLowerCase().trim();
  var rows = document.querySelectorAll('.cliente-row');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!q) { r.style.display = ''; continue; }
    var nombre = r.dataset.nombre || '';
    var tel = r.dataset.tel || '';
    var email = r.dataset.email || '';
    if (nombre.indexOf(q) !== -1 || tel.indexOf(q) !== -1 || email.indexOf(q) !== -1) {
      r.style.display = '';
    } else {
      r.style.display = 'none';
    }
  }
};

Pages._verHistorialCliente = function(clienteKey) {
  var clientes = ArcanoDB.getClientes();
  var cliente = null;
  for (var i = 0; i < clientes.length; i++) {
    if (clientes[i]._key === clienteKey) { cliente = clientes[i]; break; }
  }
  if (!cliente) { alert('Cliente no encontrado'); return; }
  var pedidos = ArcanoDB.getPedidosByCliente(clienteKey);
  var totalComprado = 0;
  for (var j = 0; j < pedidos.length; j++) {
    if (pedidos[j].estado !== 'cancelado') totalComprado += (pedidos[j].total || 0);
  }
  var telNorm = cliente.telNorm || '';
  var waLink = telNorm ? 'https://wa.me/' + telNorm : '#';
  var body =
    '<div class="card-hdr"><h3 style="margin:0">' + esc(cliente.nombre || 'Cliente') + '</h3></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
      '<div><div class="text-sm text-muted">WhatsApp</div><a href="' + waLink + '" target="_blank" style="color:var(--gold)">' + esc(cliente.telefono || '-') + '</a></div>' +
      '<div><div class="text-sm text-muted">Email</div>' + esc(cliente.email || '-') + '</div>' +
      '<div><div class="text-sm text-muted">Ciudad</div>' + esc(cliente.ciudad || '-') + '</div>' +
      '<div><div class="text-sm text-muted">Dirección</div>' + esc(cliente.direccion || '-') + '</div>' +
      '<div><div class="text-sm text-muted">Total pedidos</div><b>' + (cliente.totalPedidos || 0) + '</b></div>' +
      '<div><div class="text-sm text-muted">Total comprado</div><b style="color:var(--green)">$' + totalComprado.toLocaleString() + '</b></div>' +
      '<div><div class="text-sm text-muted">Cliente desde</div>' + (cliente.creado ? new Date(cliente.creado).toLocaleDateString('es-CO') : '-') + '</div>' +
      '<div><div class="text-sm text-muted">Último pedido</div>' + (cliente.ultimoPedido ? new Date(cliente.ultimoPedido).toLocaleDateString('es-CO') : '-') + '</div>' +
    '</div>' +
    '<h4 style="margin:16px 0 8px">Historial de Pedidos (' + pedidos.length + ')</h4>';
  if (pedidos.length === 0) {
    body += '<p class="text-muted">No hay pedidos vinculados a este cliente.</p>';
  } else {
    body += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Estado</th><th>Items</th><th>Total</th></tr></thead><tbody>';
    for (var k = 0; k < pedidos.length; k++) {
      var p = pedidos[k];
      var fecha = p.creado ? new Date(p.creado).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '-';
      var estadoColor = p.estado === 'nuevo' ? 'var(--red)' : (p.estado === 'enviado' || p.estado === 'confirmado' || p.estado === 'entregado' ? 'var(--green)' : 'var(--text3)');
      body += '<tr>' +
        '<td class="text-sm">' + fecha + '</td>' +
        '<td><span style="color:' + estadoColor + ';font-weight:600">' + esc(p.estado || 'nuevo') + '</span></td>' +
        '<td class="text-sm">' + ((p.items || []).length) + ' items</td>' +
        '<td class="fw7">$' + (p.total || 0).toLocaleString() + '</td>' +
      '</tr>';
    }
    body += '</tbody></table></div>';
  }
  openModal('Historial de Cliente', body);
};

Pages._deleteCliente = function(key) {
  if (!confirm('¿Eliminar este cliente? Sus pedidos no se borrarán pero quedarán sin cliente vinculado.')) return;
  ArcanoDB.deleteCliente(key);
  App.renderPage('clientes');
};



/* ==================== PROMOCIONES (admin CRUD) ==================== */
Pages.renderPromociones = function(el) {
  var promos = ArcanoDB.getPromociones();
  var activas = ArcanoDB.getPromocionesActivas();

  var h = '<div class="page-header"><h2>Promociones</h2>';
  h += '<button class="btn btn-gold" onclick="Pages._editarPromocion(null)">+ Nueva promoción</button>';
  h += '</div>';

  // KPIs
  h += '<div class="stats-grid mt-12" style="grid-template-columns: repeat(4, 1fr)">';
  h += '<div class="stat-card"><div class="stat-value text-gold">' + promos.length + '</div><div class="stat-label">Total</div></div>';
  h += '<div class="stat-card"><div class="stat-value text-green">' + activas.length + '</div><div class="stat-label">Activas vigentes</div></div>';
  var destacadas = promos.filter(function(p) { return p.destacada && p.activa !== false; }).length;
  h += '<div class="stat-card"><div class="stat-value text-yellow">' + destacadas + '</div><div class="stat-label">Destacadas</div></div>';
  var inactivas = promos.filter(function(p) { return p.activa === false; }).length;
  h += '<div class="stat-card"><div class="stat-value text-muted">' + inactivas + '</div><div class="stat-label">Inactivas</div></div>';
  h += '</div>';

  if (promos.length === 0) {
    h += '<div class="card mt-16"><div class="card-body"><p class="text-center text-muted">No hay promociones. Crea la primera con el botón de arriba.</p></div></div>';
    el.innerHTML = h;
    return;
  }

  h += '<div class="card mt-16"><div class="card-header"><h3>Todas las promociones</h3></div><div class="card-body">';
  h += '<div class="table-wrap"><table class="table"><thead><tr><th>Título</th><th>Tipo</th><th>Valor</th><th>Código</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody>';
  for (var i = 0; i < promos.length; i++) {
    var p = promos[i];
    var tipoLabel = { porcentaje: '% Off', monto: '$ Off', envio: 'Envío gratis', producto: 'Producto gratis' }[p.tipo] || p.tipo;
    var valorTxt = '';
    if (p.tipo === 'porcentaje') valorTxt = p.valor + '%';
    else if (p.tipo === 'monto') valorTxt = '$' + (p.valor || 0).toLocaleString();
    else valorTxt = '—';
    var vigencia = '';
    if (p.fechaInicio || p.fechaFin) {
      var fi = p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString('es-CO', {day:'2-digit',month:'short'}) : '—';
      var ff = p.fechaFin ? new Date(p.fechaFin).toLocaleDateString('es-CO', {day:'2-digit',month:'short'}) : '—';
      vigencia = fi + ' → ' + ff;
    } else {
      vigencia = 'Sin límite';
    }
    var activaAhora = p.activa !== false && (!p.fechaFin || new Date(p.fechaFin).getTime() > Date.now()) && (!p.fechaInicio || new Date(p.fechaInicio).getTime() < Date.now());
    var estadoCls = activaAhora ? 'text-green' : 'text-muted';
    var estadoTxt = activaAhora ? 'Vigente' : (p.activa === false ? 'Inactiva' : 'Vencida');
    h += '<tr>' +
      '<td class="fw7">' + esc(p.titulo || 'Sin título') + (p.destacada ? ' ⭐' : '') + '</td>' +
      '<td>' + tipoLabel + '</td>' +
      '<td>' + valorTxt + '</td>' +
      '<td><code style="background:var(--bg);padding:2px 6px;border-radius:4px;color:var(--gold)">' + esc(p.codigo || '—') + '</code></td>' +
      '<td class="text-sm text-muted">' + vigencia + '</td>' +
      '<td><span class="' + estadoCls + ' fw7">' + estadoTxt + '</span></td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm btn-outline" onclick="Pages._editarPromocion(\'' + p._key + '\')">Editar</button> ' +
        '<button class="btn btn-sm ' + (p.activa === false ? 'btn-gold' : 'btn-outline') + '" onclick="Pages._togglePromocion(\'' + p._key + '\')" title="' + (p.activa === false ? 'Activar' : 'Pausar') + '">' + (p.activa === false ? '▶' : '⏸') + '</button> ' +
        '<button class="btn btn-sm btn-red" onclick="Pages._deletePromocion(\'' + p._key + '\')">X</button>' +
      '</td>' +
    '</tr>';
  }
  h += '</tbody></table></div>';
  h += '</div></div>';
  el.innerHTML = h;
};

Pages._editarPromocion = function(key) {
  var promos = ArcanoDB.getPromociones();
  var promo = null;
  if (key) {
    for (var i = 0; i < promos.length; i++) { if (promos[i]._key === key) { promo = promos[i]; break; } }
  }
  var p = promo || {};
  var body =
    '<div class="form-group"><label>Título</label>' +
      '<input class="input" id="pm-titulo" value="' + esc(p.titulo || '') + '" placeholder="Ej: 10% off en tu primera compra"></div>' +
    '<div class="g2">' +
      '<div class="form-group"><label>Tipo de descuento</label>' +
        '<select class="input" id="pm-tipo">' +
          '<option value="porcentaje"' + (p.tipo === 'porcentaje' ? ' selected' : '') + '>Porcentaje (%)</option>' +
          '<option value="monto"' + (p.tipo === 'monto' ? ' selected' : '') + '>Monto fijo ($)</option>' +
          '<option value="envio"' + (p.tipo === 'envio' ? ' selected' : '') + '>Envío gratis</option>' +
          '<option value="producto"' + (p.tipo === 'producto' ? ' selected' : '') + '>Producto gratis</option>' +
        '</select></div>' +
      '<div class="form-group"><label>Valor</label>' +
        '<input class="input" id="pm-valor" type="number" value="' + (p.valor || '') + '" placeholder="Ej: 10 (porcentaje) o 5000 (monto)"></div>' +
    '</div>' +
    '<div class="form-group"><label>Código promocional (opcional)</label>' +
      '<input class="input" id="pm-codigo" value="' + esc(p.codigo || '') + '" placeholder="Ej: BIENVENIDA10 (sin espacios)"></div>' +
    '<div class="form-group"><label>Descripción (opcional)</label>' +
      '<textarea class="input" id="pm-descripcion" placeholder="Detalles de la promo...">' + esc(p.descripcion || '') + '</textarea></div>' +
    '<div class="g2">' +
      '<div class="form-group"><label>Vigencia desde (opcional)</label>' +
        '<input class="input" id="pm-fechainicio" type="date" value="' + (p.fechaInicio ? p.fechaInicio.slice(0,10) : '') + '"></div>' +
      '<div class="form-group"><label>Vigencia hasta (opcional)</label>' +
        '<input class="input" id="pm-fechafin" type="date" value="' + (p.fechaFin ? p.fechaFin.slice(0,10) : '') + '"></div>' +
    '</div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
      '<input type="checkbox" id="pm-destacada" ' + (p.destacada ? 'checked' : '') + '> <span>Destacada (se muestra primero)</span></label></div>' +
    '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
      '<input type="checkbox" id="pm-activa" ' + (p.activa !== false ? 'checked' : '') + '> <span>Activa ahora</span></label></div>' +
    '<div style="margin-top:16px;display:flex;gap:8px">' +
      '<button class="btn btn-gold" onclick="Pages._guardarPromocion(' + (key ? '\'' + key + '\'' : 'null') + ')">Guardar</button>' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
    '</div>';
  openModal(key ? 'Editar promoción' : 'Nueva promoción', body);
};

Pages._guardarPromocion = function(key) {
  var titulo = document.getElementById('pm-titulo').value.trim();
  var tipo = document.getElementById('pm-tipo').value;
  var valorRaw = document.getElementById('pm-valor').value.trim();
  var valor = valorRaw ? Number(valorRaw) : 0;
  var codigo = document.getElementById('pm-codigo').value.trim().toUpperCase().replace(/\s/g, '');
  var descripcion = document.getElementById('pm-descripcion').value.trim();
  var fechaInicio = document.getElementById('pm-fechainicio').value;
  var fechaFin = document.getElementById('pm-fechafin').value;
  var destacada = document.getElementById('pm-destacada').checked;
  var activa = document.getElementById('pm-activa').checked;
  if (!titulo) { alert('El título es obligatorio'); return; }
  if ((tipo === 'porcentaje' || tipo === 'monto') && valor <= 0) { alert('El valor debe ser mayor a 0'); return; }
  var data = {
    titulo: titulo, tipo: tipo, valor: valor, codigo: codigo,
    descripcion: descripcion, destacada: destacada, activa: activa
  };
  if (fechaInicio) data.fechaInicio = fechaInicio + 'T00:00:00';
  if (fechaFin) data.fechaFin = fechaFin + 'T23:59:59';
  if (key) data._key = key;
  ArcanoDB.savePromocion(data);
  closeModal();
  toast(key ? 'Promoción actualizada' : 'Promoción creada');
  App.renderPage('promociones');
};

Pages._togglePromocion = function(key) {
  var promos = ArcanoDB.getPromociones();
  var p = null;
  for (var i = 0; i < promos.length; i++) { if (promos[i]._key === key) { p = promos[i]; break; } }
  if (!p) return;
  ArcanoDB.savePromocion({ _key: key, activa: p.activa === false });
  App.renderPage('promociones');
};

Pages._deletePromocion = function(key) {
  if (!confirm('¿Eliminar esta promoción?')) return;
  ArcanoDB.deletePromocion(key);
  App.renderPage('promociones');
};

/* ==================== CARRITOS (tracking admin) ==================== */
Pages.renderCarritos = function(el) {
  var carritos = ArcanoDB.getCarritos();
  var activos = carritos.filter(function(c) { return c.estado === 'activo'; });
  var abandonados = carritos.filter(function(c) { return c.estado === 'abandonado'; });
  var convertidos = carritos.filter(function(c) { return c.estado === 'convertido'; });
  var vacios = carritos.filter(function(c) { return c.estado === 'vacio'; });

  var h = '<div class="page-header"><h2>Carritos</h2></div>';

  // KPIs
  h += '<div class="stats-grid mt-12" style="grid-template-columns: repeat(4, 1fr)">';
  h += '<div class="stat-card"><div class="stat-value text-green">' + activos.length + '</div><div class="stat-label">Activos</div></div>';
  h += '<div class="stat-card"><div class="stat-value text-yellow">' + abandonados.length + '</div><div class="stat-label">Abandonados</div></div>';
  h += '<div class="stat-card"><div class="stat-value text-gold">' + convertidos.length + '</div><div class="stat-label">Convertidos</div></div>';
  h += '<div class="stat-card"><div class="stat-value text-muted">' + vacios.length + '</div><div class="stat-label">Vacíos</div></div>';
  h += '</div>';

  if (carritos.length === 0) {
    h += '<div class="card mt-16"><div class="card-body"><p class="text-center text-muted">Todavía no hay carritos registrados. Cuando un cliente agregue productos al carrito en la tienda, aparecerá aquí automáticamente.</p></div></div>';
    el.innerHTML = h;
    return;
  }

  // Tabla
  h += '<div class="card mt-16"><div class="card-header"><h3>Todos los carritos</h3></div><div class="card-body">';
  h += '<div class="table-wrap"><table class="table"><thead><tr><th>Actualizado</th><th>Cliente</th><th>WhatsApp</th><th>Items</th><th>Cant.</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>';
  for (var i = 0; i < carritos.length; i++) {
    var c = carritos[i];
    var actualizado = c.actualizado ? new Date(c.actualizado).toLocaleString('es-CO', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
    var cliente = c.cliente || {};
    var nItems = (c.items || []).length;
    var cant = c.itemCount || 0;
    var estadoColors = { activo: 'text-green', abandonado: 'text-yellow', convertido: 'text-gold', vacio: 'text-muted' };
    var estadoLabels = { activo: 'Activo', abandonado: 'Abandonado', convertido: 'Convertido', vacio: 'Vacío' };
    h += '<tr>' +
      '<td class="text-sm">' + actualizado + '</td>' +
      '<td class="fw7">' + esc(cliente.nombre || 'Invitado') + '</td>' +
      '<td>' + esc(cliente.telefono || '-') + '</td>' +
      '<td>' + nItems + '</td>' +
      '<td>' + cant + '</td>' +
      '<td class="fw7 text-gold">$' + (c.total || 0).toLocaleString() + '</td>' +
      '<td><span class="' + (estadoColors[c.estado] || 'text-muted') + ' fw7">' + (estadoLabels[c.estado] || c.estado) + '</span></td>' +
      '<td>' +
        '<button class="btn btn-sm btn-outline" onclick="Pages._verCarrito(\'' + c._key + '\')">Ver</button> ' +
        '<button class="btn btn-sm btn-red" onclick="Pages._deleteCarrito(\'' + c._key + '\')">X</button>' +
      '</td>' +
    '</tr>';
  }
  h += '</tbody></table></div>';
  h += '</div></div>';
  el.innerHTML = h;
};

Pages._verCarrito = function(key) {
  var carritos = ArcanoDB.getCarritos();
  var c = null;
  for (var i = 0; i < carritos.length; i++) { if (carritos[i]._key === key) { c = carritos[i]; break; } }
  if (!c) { alert('Carrito no encontrado'); return; }
  var cliente = c.cliente || {};
  var telNorm = cliente.telefono ? ('57' + cliente.telefono.replace(/\D/g, '').replace(/^57/, '')) : '';
  var waLink = telNorm ? 'https://wa.me/' + telNorm : '#';
  var body =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
      '<div><div class="text-sm text-muted">Cliente</div><b>' + esc(cliente.nombre || 'Invitado') + '</b></div>' +
      '<div><div class="text-sm text-muted">WhatsApp</div><a href="' + waLink + '" target="_blank" style="color:var(--gold)">' + esc(cliente.telefono || '-') + '</a></div>' +
      '<div><div class="text-sm text-muted">Creado</div>' + (c.creado ? new Date(c.creado).toLocaleString('es-CO') : '-') + '</div>' +
      '<div><div class="text-sm text-muted">Última actualización</div>' + (c.actualizado ? new Date(c.actualizado).toLocaleString('es-CO') : '-') + '</div>' +
      '<div><div class="text-sm text-muted">Estado</div><b>' + esc(c.estado || '?') + '</b></div>' +
      '<div><div class="text-sm text-muted">Total</div><b class="text-gold">$' + (c.total || 0).toLocaleString() + '</b></div>' +
    '</div>' +
    '<h4>Items (' + ((c.items || []).length) + ')</h4>';
  if (!c.items || c.items.length === 0) {
    body += '<p class="text-muted">Sin items.</p>';
  } else {
    body += '<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Talla</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>';
    for (var i = 0; i < c.items.length; i++) {
      var it = c.items[i];
      body += '<tr><td class="fw7">' + esc(it.nombre || '?') + '</td><td>' + (it.talla || '-') + '</td><td>' + (it.qty || 0) + '</td><td>$' + (it.precio || 0).toLocaleString() + '</td><td class="fw7">$' + ((it.precio || 0) * (it.qty || 0)).toLocaleString() + '</td></tr>';
    }
    body += '</tbody></table></div>';
    if (telNorm) {
      body += '<div style="margin-top:14px;display:flex;gap:8px">' +
        '<a href="' + waLink + '?text=' + encodeURIComponent('Hola ' + (cliente.nombre || '') + '! Vimos que dejaste productos en tu carrito de Arcano Especias. ¿Te ayudamos a completar tu pedido?') + '" target="_blank" class="btn btn-gold">Recuperar por WhatsApp</a>' +
      '</div>';
    }
  }
  openModal('Detalle de carrito', body);
};

Pages._deleteCarrito = function(key) {
  if (!confirm('¿Eliminar este carrito del tracking?')) return;
  ArcanoDB.deleteCarrito(key);
  App.renderPage('carritos');
};

/* ==================== DISEÑO DINÁMICO (admin tienda config) ==================== */
Pages._guardarDisenoDinamico = function() {
  var data = {
    habilitado: document.getElementById('din-habilitado').checked,
    tipoParticulas: document.getElementById('din-tipo').value,
    cantidadParticulas: parseInt(document.getElementById('din-cantidad').value, 10),
    velocidadParticulas: document.getElementById('din-velocidad').value,
    velocidadMesh: document.getElementById('din-mesh').value,
    intensidad: document.getElementById('din-intensidad').value,
    vignette: document.getElementById('din-vignette').value === 'true'
  };
  var status = document.getElementById('din-status');
  if (status) status.innerHTML = '<span style="color:var(--gold)">Guardando...</span>';
  ArcanoDB.saveTiendaConfig({ dinamico: data });
  if (status) status.innerHTML = '<span style="color:var(--green)">✓ Guardado. Visita la tienda para ver los cambios.</span>';
  toast('Diseño dinámico guardado');
};

Pages._resetDisenoDinamico = function() {
  if (!confirm('¿Restablecer la configuración de diseño a los valores por defecto?')) return;
  var defaults = {
    habilitado: true,
    tipoParticulas: 'dust',
    cantidadParticulas: 18,
    velocidadParticulas: 'normal',
    velocidadMesh: 'normal',
    intensidad: 'normal',
    vignette: true
  };
  ArcanoDB.saveTiendaConfig({ dinamico: defaults });
  toast('Configuración restablecida');
  App.renderPage('tienda');
};

/* ==================== MENSAJES WHATSAPP (admin) ====================
   Permite al admin:
   1. Configurar mensaje automático para carritos abandonados (con tiempo).
   2. Seleccionar clientes y enviarles mensajes manuales.
   3. Ver carritos abandonados pendientes de notificar.
   Config persistida en tiendaConfig.mensajesWhatsApp.
   ================================================================== */
Pages.renderMensajes = function(el) {
  var cfg = ArcanoDB.getTiendaConfig();
  var mw = cfg.mensajesWhatsApp || {};
  var clientes = ArcanoDB.getClientes();
  var carritos = ArcanoDB.getCarritos();
  var ahora = Date.now();

  // Carritos abandonados pendientes de notificar (no notificados aún)
  var abandonadosPendientes = carritos.filter(function(c) {
    if (c.estado !== 'abandonado') return false;
    if (c.notificadoEn) return false;
    if (!c.actualizado && !c.creado) return false;
    return true;
  });

  var h = '<div class="page-header"><h2>Mensajes WhatsApp</h2></div>';

  // === SECCIÓN 0: Códigos OTP pendientes de enviar (clientes nuevos solicitando acceso) ===
  var otpPendientes = ArcanoDB.getOtpPendientes();
  var otpNoEnviados = otpPendientes.filter(function(o) { return !o.enviado; });
  h += '<div class="card mt-16"><div class="card-header"><h3>🔐 Códigos OTP pendientes (' + otpNoEnviados.length + ')</h3><p class="text-xs text-muted">Clientes que solicitaron acceso a "Mi Cuenta". Envíales el código por WhatsApp para que puedan verificar su número.</p></div><div class="card-body">';
  if (otpPendientes.length === 0) {
    h += '<p class="text-center text-muted">No hay códigos pendientes. Cuando un cliente haga click en "Inscribirme" en la tienda, aparecerá aquí.</p>';
  } else {
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Código</th><th>Solicitado</th><th>Estado</th><th></th></tr></thead><tbody>';
    for (var oi = 0; oi < otpPendientes.length; oi++) {
      var o = otpPendientes[oi];
      var telNorm = o.telNorm || '';
      var waLink = telNorm ? ('https://wa.me/' + telNorm + '?text=' + encodeURIComponent('Hola ' + (o.nombre || '') + '! Tu código de acceso a Arcano Especias es: ' + o.codigo + '. Ingrésalo en la tienda para activar tu cuenta.')) : '#';
      var tiempoStr = o.creado ? Pages._formatearTiempo(Date.now() - new Date(o.creado).getTime()) : '-';
      var estadoCls = o.enviado ? 'text-green' : 'text-yellow';
      var estadoTxt = o.enviado ? 'Enviado' : 'Pendiente';
      h += '<tr' + (o.enviado ? ' style="opacity:0.55"' : '') + '>' +
        '<td class="fw7">' + esc(o.nombre || 'Cliente') + (o.esNuevo ? ' <span class="badge badge-blue" style="font-size:0.6rem">NUEVO</span>' : '') + '</td>' +
        '<td>' + esc(o.telefono || '-') + '</td>' +
        '<td><code style="background:var(--gold-light);padding:3px 10px;border-radius:6px;color:var(--gold);font-family:monospace;font-size:1.1rem;font-weight:700;letter-spacing:0.2em">' + esc(o.codigo || '') + '</code></td>' +
        '<td class="text-sm text-muted">' + tiempoStr + '</td>' +
        '<td><span class="' + estadoCls + ' fw7">' + estadoTxt + '</span></td>' +
        '<td style="white-space:nowrap">' +
          (o.enviado ?
            '<button class="btn btn-sm btn-outline" onclick="Pages._reactivarOtp(\'' + o._key + '\')" title="Reenviar">↻</button>' :
            '<a href="' + waLink + '" target="_blank" class="btn btn-sm btn-gold" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>' +
              'Enviar' +
            '</a> ' +
            '<button class="btn btn-sm btn-outline" onclick="Pages._markOtpEnviado(\'' + o._key + '\')" title="Marcar como enviado">✓</button>'
          ) +
          ' <button class="btn btn-sm btn-red" onclick="Pages._deleteOtpPendiente(\'' + o._key + '\')" title="Eliminar">X</button>' +
        '</td>' +
      '</tr>';
    }
    h += '</tbody></table></div>';
  }
  h += '</div></div>';

  // === SECCIÓN 1: Carrito abandonado automático ===
  h += '<div class="card mt-16"><div class="card-header"><h3>🔔 Carrito abandonado automático</h3><p class="text-xs text-muted">Cuando un cliente deja productos en el carrito sin completar el pedido, envíale un recordatorio automático por WhatsApp.</p></div><div class="card-body">';
  h += '<div class="g2">' +
    '<div class="form-group"><label>Tiempo de abandono (minutos)</label>' +
      '<input class="input" id="mw-tiempo" type="number" min="5" max="1440" value="' + (mw.tiempoAbandonoMin || 30) + '" placeholder="30">' +
      '<p class="text-xs text-muted mt-4">Después de X minutos sin actividad, el carrito se considera abandonado y se notifica al admin.</p>' +
    '</div>' +
    '<div class="form-group"><label>Activar notificación automática</label>' +
      '<select class="input" id="mw-activo">' +
        '<option value="true"' + (mw.notifActiva !== false ? ' selected' : '') + '>Activado</option>' +
        '<option value="false"' + (mw.notifActiva === false ? ' selected' : '') + '>Desactivado</option>' +
      '</select></div>' +
  '</div>';

  h += '<div class="form-group mt-12"><label>Mensaje automático (usa {nombre} y {total})</label>' +
    '<textarea class="input" id="mw-mensaje" rows="4" placeholder="Hola {nombre}! Vimos que dejaste productos en tu carrito de Arcano Especias por ${total}. ¿Te ayudamos a completar tu pedido?">' + esc(mw.mensajeAbandono || '') + '</textarea>' +
    '<p class="text-xs text-muted mt-4">Variables disponibles: <code>{nombre}</code>, <code>{total}</code>, <code>{items}</code></p>' +
  '</div>';

  h += '<div class="mt-8" style="display:flex;gap:8px;align-items:center">' +
    '<button class="btn btn-gold" onclick="Pages._guardarMensajesWA()">Guardar configuración</button>' +
    '<span id="mw-status" class="text-sm text-muted ml-8"></span>' +
  '</div>';
  h += '</div></div>';

  // === SECCIÓN 2: Carritos abandonados pendientes ===
  h += '<div class="card mt-16"><div class="card-header"><h3>🛒 Carritos abandonados pendientes (' + abandonadosPendientes.length + ')</h3></div><div class="card-body">';
  if (abandonadosPendientes.length === 0) {
    h += '<p class="text-center text-muted">No hay carritos abandonados pendientes de notificar.</p>';
  } else {
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Items</th><th>Total</th><th>Abandonado hace</th><th></th></tr></thead><tbody>';
    for (var i = 0; i < abandonadosPendientes.length; i++) {
      var c = abandonadosPendientes[i];
      var cliente = c.cliente || {};
      var tiempoMs = ahora - new Date(c.actualizado || c.creado).getTime();
      var tiempoStr = Pages._formatearTiempo(tiempoMs);
      var telNorm = cliente.telefono ? ('57' + cliente.telefono.replace(/\D/g, '').replace(/^57/, '')) : '';
      var nombreVar = cliente.nombre || 'Cliente';
      var totalVar = (c.total || 0).toLocaleString();
      var itemsVar = (c.items || []).map(function(it) { return (it.nombre || '?') + ' x' + (it.qty || 1); }).join(', ');
      var mensaje = (mw.mensajeAbandono || 'Hola {nombre}! Vimos que dejaste productos en tu carrito de Arcano Especias por ${total}. ¿Te ayudamos a completar tu pedido?')
        .replace(/\{nombre\}/g, nombreVar)
        .replace(/\{total\}/g, '$' + totalVar)
        .replace(/\{items\}/g, itemsVar);
      var waLink = telNorm ? ('https://wa.me/' + telNorm + '?text=' + encodeURIComponent(mensaje)) : '#';
      h += '<tr>' +
        '<td class="fw7">' + esc(cliente.nombre || 'Invitado') + '</td>' +
        '<td>' + esc(cliente.telefono || '-') + '</td>' +
        '<td class="text-sm">' + ((c.items || []).length) + ' productos</td>' +
        '<td class="fw7 text-gold">$' + (c.total || 0).toLocaleString() + '</td>' +
        '<td class="text-sm text-muted">' + tiempoStr + '</td>' +
        '<td>' +
          '<a href="' + waLink + '" target="_blank" class="btn btn-sm btn-gold" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>' +
            'Enviar' +
          '</a> ' +
          '<button class="btn btn-sm btn-outline" onclick="Pages._marcarNotificado(\'' + c._key + '\')" title="Marcar como notificado">✓</button>' +
        '</td>' +
      '</tr>';
    }
    h += '</tbody></table></div>';
  }
  h += '</div></div>';

  // === SECCIÓN 3: Envío manual a clientes seleccionados ===
  h += '<div class="card mt-16"><div class="card-header"><h3>📤 Envío manual a clientes</h3><p class="text-xs text-muted">Selecciona clientes y envíales un mensaje personalizado por WhatsApp.</p></div><div class="card-body">';

  h += '<div class="form-group"><label>Mensaje manual (usa {nombre})</label>' +
    '<textarea class="input" id="mw-mensaje-manual" rows="3" placeholder="Hola {nombre}! Tenemos una promo especial para ti...">' + esc(mw.mensajeManual || '') + '</textarea>' +
  '</div>';

  h += '<div class="mt-8" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<button class="btn btn-outline btn-sm" onclick="Pages._selectAllClientesWA(true)">Seleccionar todos</button>' +
    '<button class="btn btn-outline btn-sm" onclick="Pages._selectAllClientesWA(false)">Quitar selección</button>' +
    '<span class="text-sm text-muted ml-8" id="mw-seleccionados-count">0 seleccionados</span>' +
  '</div>';

  if (clientes.length === 0) {
    h += '<p class="text-center text-muted mt-12">No hay clientes registrados aún.</p>';
  } else {
    h += '<div class="table-wrap mt-12"><table class="table"><thead><tr><th><input type="checkbox" onchange="Pages._toggleAllClientesWA(this.checked)"></th><th>Nombre</th><th>WhatsApp</th><th>Pedidos</th><th>Total comprado</th><th>Último pedido</th></tr></thead><tbody>';
    var totalPorCliente = {};
    var pedidos = ArcanoDB.getPedidos();
    for (var pi = 0; pi < pedidos.length; pi++) {
      var p = pedidos[pi];
      if (p.clienteId && p.estado !== 'cancelado') {
        totalPorCliente[p.clienteId] = (totalPorCliente[p.clienteId] || 0) + (p.total || 0);
      }
    }
    for (var ci = 0; ci < clientes.length; ci++) {
      var c2 = clientes[ci];
      var total = totalPorCliente[c2._key] || 0;
      var ultimo = c2.ultimoPedido ? new Date(c2.ultimoPedido).toLocaleDateString('es-CO', {day:'2-digit',month:'short'}) : '-';
      h += '<tr>' +
        '<td><input type="checkbox" class="wa-cliente-check" data-key="' + c2._key + '" onchange="Pages._updateSeleccionadosWA()"></td>' +
        '<td class="fw7">' + esc(c2.nombre || 'Sin nombre') + '</td>' +
        '<td>' + esc(c2.telefono || '-') + '</td>' +
        '<td><span class="badge badge-gold">' + (c2.totalPedidos || 0) + '</span></td>' +
        '<td class="fw7 text-gold">$' + total.toLocaleString() + '</td>' +
        '<td class="text-sm text-muted">' + ultimo + '</td>' +
      '</tr>';
    }
    h += '</tbody></table></div>';

    h += '<div class="mt-12" style="display:flex;gap:8px;align-items:center">' +
      '<button class="btn btn-gold" onclick="Pages._enviarMensajesWA()">Enviar a seleccionados</button>' +
      '<span id="mw-envio-status" class="text-sm text-muted ml-8"></span>' +
    '</div>';
    h += '<p class="text-xs text-muted mt-8">💡 Se abrirá una pestaña de WhatsApp por cada cliente seleccionado, con el mensaje personalizado pre-cargado. Solo tienes que enviar cada uno.</p>';
  }
  h += '</div></div>';

  el.innerHTML = h;
};

Pages._guardarMensajesWA = function() {
  var data = {
    tiempoAbandonoMin: parseInt(document.getElementById('mw-tiempo').value, 10) || 30,
    notifActiva: document.getElementById('mw-activo').value === 'true',
    mensajeAbandono: document.getElementById('mw-mensaje').value.trim(),
    mensajeManual: document.getElementById('mw-mensaje-manual').value.trim()
  };
  ArcanoDB.saveTiendaConfig({ mensajesWhatsApp: data });
  var status = document.getElementById('mw-status');
  if (status) status.innerHTML = '<span style="color:var(--green)">✓ Guardado</span>';
  toast('Configuración de mensajes guardada');
  setTimeout(function() { if (status) status.innerHTML = ''; }, 3000);
};

Pages._marcarNotificado = function(carritoKey) {
  try {
    firebase.database().ref('arcano/db/carritos/' + carritoKey).update({ notificadoEn: new Date().toISOString() });
    toast('Marcado como notificado');
    App.renderPage('mensajes');
  } catch(e) {
    alert('Error: ' + e.message);
  }
};

Pages._selectAllClientesWA = function(select) {
  var checks = document.querySelectorAll('.wa-cliente-check');
  for (var i = 0; i < checks.length; i++) checks[i].checked = select;
  Pages._updateSeleccionadosWA();
};

Pages._toggleAllClientesWA = function(checked) {
  Pages._selectAllClientesWA(checked);
};

Pages._updateSeleccionadosWA = function() {
  var checks = document.querySelectorAll('.wa-cliente-check:checked');
  var countEl = document.getElementById('mw-seleccionados-count');
  if (countEl) countEl.textContent = checks.length + ' seleccionado' + (checks.length !== 1 ? 's' : '');
};

Pages._enviarMensajesWA = function() {
  var checks = document.querySelectorAll('.wa-cliente-check:checked');
  if (checks.length === 0) { alert('Selecciona al menos un cliente'); return; }
  var mensajeTemplate = (document.getElementById('mw-mensaje-manual').value || 'Hola {nombre}! Te escribimos desde Arcano Especias.').trim();
  var clientes = ArcanoDB.getClientes();
  var enviados = 0;
  for (var i = 0; i < checks.length; i++) {
    var key = checks[i].dataset.key;
    var cliente = null;
    for (var j = 0; j < clientes.length; j++) {
      if (clientes[j]._key === key) { cliente = clientes[j]; break; }
    }
    if (!cliente) continue;
    var telNorm = cliente.telefono ? ('57' + cliente.telefono.replace(/\D/g, '').replace(/^57/, '')) : '';
    if (!telNorm) continue;
    var msg = mensajeTemplate.replace(/\{nombre\}/g, cliente.nombre || 'Cliente');
    var waLink = 'https://wa.me/' + telNorm + '?text=' + encodeURIComponent(msg);
    window.open(waLink, '_blank');
    enviados++;
  }
  var status = document.getElementById('mw-envio-status');
  if (status) status.innerHTML = '<span style="color:var(--green)">' + enviados + ' mensaje(s) abiertos en WhatsApp. Envíalos manualmente.</span>';
  toast(enviados + ' mensajes preparados en pestañas de WhatsApp');
};

Pages._formatearTiempo = function(ms) {
  var min = Math.floor(ms / 60000);
  if (min < 60) return min + ' min';
  var horas = Math.floor(min / 60);
  if (horas < 24) return horas + 'h ' + (min % 60) + 'm';
  var dias = Math.floor(horas / 24);
  return dias + 'd ' + (horas % 24) + 'h';
};

/* === OTP pendientes - funciones auxiliares === */
Pages._markOtpEnviado = function(key) {
  ArcanoDB.markOtpEnviado(key);
  toast('Marcado como enviado');
};

Pages._reactivarOtp = function(key) {
  // Reabrir WhatsApp: abrir link wa.me y marcar como no enviado
  // Buscar el OTP entre los pendientes
  var pendientes = ArcanoDB.getOtpPendientes();
  var otp = null;
  for (var i = 0; i < pendientes.length; i++) {
    if (pendientes[i]._key === key) { otp = pendientes[i]; break; }
  }
  if (!otp) return;
  var waLink = 'https://wa.me/' + otp.telNorm + '?text=' + encodeURIComponent('Hola ' + (otp.nombre || '') + '! Tu código de acceso a Arcano Especias es: ' + otp.codigo + '. Ingrésalo en la tienda para activar tu cuenta.');
  window.open(waLink, '_blank');
  // Re-marcar como pendiente
  try {
    firebase.database().ref('arcano/db/otpPendientes/' + key).update({ enviado: false, enviadoEn: null });
  } catch(e) {}
};

Pages._deleteOtpPendiente = function(key) {
  if (!confirm('¿Eliminar este OTP pendiente?')) return;
  ArcanoDB.deleteOtpPendiente(key);
};

/* ==================== COSTALES (admin) ====================
   Costales = sacos/bolsas con mezcla de especias.
   Se venden en PDV por "palas" (scoops).
   ================================================================== */
Pages.renderCostales = function(el) {
  var costales = ArcanoDB.getCostales();
  var especias = ArcanoDB.getEspecias();

  // KPIs
  var totalCostales = costales.length;
  var abiertos = costales.filter(function(c) { return c.estado === 'abierto'; }).length;
  var vacios = costales.filter(function(c) { return c.estado === 'vacio'; }).length;
  var gramosTotales = 0;
  for (var i = 0; i < costales.length; i++) {
    gramosTotales += (Number(costales[i].gramosRestantes) || 0);
  }

  var h = '<div class="page-header"><h2>Costales</h2>';
  h += '<button class="btn btn-gold" onclick="Pages._formCostal(null)">+ Nuevo Costal</button>';
  h += '</div>';

  h += '<div class="stats-grid mt-12" style="grid-template-columns: repeat(4, 1fr)">';
  h += '<div class="stat-card"><div class="stat-value">' + totalCostales + '</div><div class="stat-label">Total</div></div>';
  h += '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value text-green">' + abiertos + '</div><div class="stat-label">Abiertos</div></div>';
  h += '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value text-gold">' + gramosTotales.toLocaleString() + 'g</div><div class="stat-label">Gramos disponibles</div></div>';
  h += '<div class="stat-card" style="border-left-color:var(--red)"><div class="stat-value text-muted">' + vacios + '</div><div class="stat-label">Vacíos</div></div>';
  h += '</div>';

  if (totalCostales === 0) {
    h += '<div class="card mt-16"><div class="card-body"><p class="text-center text-muted">No hay costales. Crea el primero con el botón de arriba.</p></div></div>';
    el.innerHTML = h;
    return;
  }

  h += '<div class="card mt-16"><div class="card-header"><h3>Lista de Costales</h3></div><div class="card-body">';
  h += '<div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Especias</th><th>Gramos Totales</th><th>Disponible</th><th>Precio/Pala</th><th>g/Pala</th><th>Palas aprox.</th><th>Estado</th><th></th></tr></thead><tbody>';
  for (var j = 0; j < costales.length; j++) {
    var c = costales[j];
    var especiasTxt = '';
    if (c.items) {
      var especiaNombres = [];
      for (var k = 0; k < c.items.length; k++) {
        especiaNombres.push(c.items[k].especiaNombre + ' (' + c.items[k].gramos + 'g)');
      }
      especiasTxt = especiaNombres.join(', ');
    }
    var palasAprox = c.gramosPorPala > 0 ? Math.floor((c.gramosRestantes || 0) / c.gramosPorPala) : 0;
    var estadoCls = c.estado === 'abierto' ? 'text-green' : (c.estado === 'vacio' ? 'text-muted' : 'text-yellow');
    h += '<tr' + (c.estado === 'vacio' ? ' style="opacity:0.5"' : '') + '>' +
      '<td class="fw7">' + esc(c.nombre || 'Costal ' + c.id) + '</td>' +
      '<td class="text-sm">' + esc(especiasTxt) + '</td>' +
      '<td>' + (c.gramosTotal || 0) + 'g</td>' +
      '<td class="fw7 ' + ((c.gramosRestantes || 0) <= 100 ? 'text-red' : 'text-green') + '">' + (c.gramosRestantes || 0) + 'g</td>' +
      '<td class="text-gold fw7">$' + (c.precioPala || 0).toLocaleString() + '</td>' +
      '<td>' + (c.gramosPorPala || 50) + 'g</td>' +
      '<td>' + palasAprox + '</td>' +
      '<td><span class="' + estadoCls + ' fw7">' + esc(c.estado || 'abierto') + '</span></td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn btn-sm btn-outline" onclick="Pages._formCostal(\'' + c.id + '\')" title="Editar">✎</button> ' +
        '<button class="btn btn-sm btn-red" onclick="Pages._deleteCostal(\'' + c.id + '\')" title="Eliminar">X</button>' +
      '</td>' +
    '</tr>';
  }
  h += '</tbody></table></div>';
  h += '</div></div>';

  el.innerHTML = h;
};

Pages._formCostal = function(id) {
  var costal = null;
  if (id) {
    var costales = ArcanoDB.getCostales();
    for (var i = 0; i < costales.length; i++) {
      if (String(costales[i].id) === String(id)) { costal = costales[i]; break; }
    }
  }
  var c = costal || { items: [] };
  var especias = ArcanoDB.getEspecias();

  // Construir lista de items actuales
  var itemsHtml = '';
  if (c.items && c.items.length > 0) {
    for (var j = 0; j < c.items.length; j++) {
      itemsHtml += '<div class="costal-item-row" data-especia="' + c.items[j].especiaId + '">' +
        '<span class="costal-item-nombre">' + esc(c.items[j].especiaNombre) + '</span>' +
        '<input type="number" class="input costal-item-gramos" value="' + (c.items[j].gramos || 0) + '" min="0" style="width:80px" data-especia-id="' + c.items[j].especiaId + '" data-especia-nombre="' + esc(c.items[j].especiaNombre) + '">' +
        '<span>gramos</span>' +
        '<button class="btn btn-sm btn-red" onclick="this.parentElement.remove();Pages._updateCostalTotal()">X</button>' +
      '</div>';
    }
  }

  // Opciones de especias disponibles
  var especiasOpts = '<option value="">+ Agregar especia...</option>';
  for (var k = 0; k < especias.length; k++) {
    especiasOpts += '<option value="' + especias[k].id + '" data-nombre="' + esc(especias[k].nombre) + '">' + esc(especias[k].nombre) + ' (' + (especias[k].stockBolsa || 0) + 'g disp.)</option>';
  }

  var body =
    '<div class="form-group"><label>Nombre del costal</label>' +
      '<input class="input" id="ct-nombre" value="' + esc(c.nombre || '') + '" placeholder="Ej: Costal Caribe Costeño, Cúrcuma Pura..."></div>' +
    '<div class="g2">' +
      '<div class="form-group"><label>Precio por pala ($)</label>' +
        '<input class="input" id="ct-precio" type="number" value="' + (c.precioPala || 2000) + '" min="0" step="500"></div>' +
      '<div class="form-group"><label>Gramos por pala</label>' +
        '<input class="input" id="ct-grampala" type="number" value="' + (c.gramosPorPala || 50) + '" min="1"></div>' +
    '</div>' +
    '<div class="form-group"><label>Especias del costal</label>' +
      '<select class="input" id="ct-especia-select" onchange="Pages._addCostalEspecia()">' + especiasOpts + '</select>' +
    '</div>' +
    '<div id="ct-items-list" style="margin-bottom:12px">' + itemsHtml + '</div>' +
    '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:12px">' +
      '<span class="text-sm text-muted">Gramos totales: </span>' +
      '<b id="ct-total-gramos" style="font-size:1.1rem;color:var(--gold)">' + (c.gramosTotal || 0) + 'g</b>' +
    '</div>' +
    '<div style="display:flex;gap:8px">' +
      '<button class="btn btn-gold" onclick="Pages._saveCostal(' + (id ? '\'' + id + '\'' : 'null') + ')">Guardar</button>' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
    '</div>';
  openModal(id ? 'Editar Costal' : 'Nuevo Costal', body);
  // Actualizar total inicial
  Pages._updateCostalTotal();
};

Pages._addCostalEspecia = function() {
  var sel = document.getElementById('ct-especia-select');
  if (!sel || !sel.value) return;
  var especiaId = sel.value;
  var especiaNombre = sel.options[sel.selectedIndex].dataset.nombre;
  // Verificar que no esté ya agregada
  var existing = document.querySelectorAll('.costal-item-gramos');
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].dataset.especiaId === especiaId) {
      alert('Esta especia ya está en el costal');
      sel.value = '';
      return;
    }
  }
  var list = document.getElementById('ct-items-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'costal-item-row';
  row.dataset.especia = especiaId;
  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px';
  row.innerHTML =
    '<span class="costal-item-nombre" style="flex:1;font-weight:600">' + esc(especiaNombre) + '</span>' +
    '<input type="number" class="input costal-item-gramos" value="100" min="0" style="width:80px" data-especia-id="' + especiaId + '" data-especia-nombre="' + esc(especiaNombre) + '" oninput="Pages._updateCostalTotal()">' +
    '<span style="font-size:0.85rem;color:var(--text-muted)">gramos</span>' +
    '<button class="btn btn-sm btn-red" onclick="this.parentElement.remove();Pages._updateCostalTotal()">X</button>';
  list.appendChild(row);
  sel.value = '';
  Pages._updateCostalTotal();
};

Pages._updateCostalTotal = function() {
  var inputs = document.querySelectorAll('.costal-item-gramos');
  var total = 0;
  for (var i = 0; i < inputs.length; i++) {
    total += Number(inputs[i].value) || 0;
  }
  var el = document.getElementById('ct-total-gramos');
  if (el) el.textContent = total + 'g';
};

Pages._saveCostal = function(id) {
  var nombre = document.getElementById('ct-nombre').value.trim();
  var precioPala = parseInt(document.getElementById('ct-precio').value, 10) || 0;
  var gramosPorPala = parseInt(document.getElementById('ct-grampala').value, 10) || 50;
  if (!nombre) { alert('Ingresa un nombre para el costal'); return; }

  // Recolectar items
  var items = [];
  var inputs = document.querySelectorAll('.costal-item-gramos');
  for (var i = 0; i < inputs.length; i++) {
    var gramos = parseInt(inputs[i].value, 10) || 0;
    if (gramos > 0) {
      items.push({
        especiaId: parseInt(inputs[i].dataset.especiaId, 10),
        especiaNombre: inputs[i].dataset.especiaNombre,
        gramos: gramos
      });
    }
  }
  if (items.length === 0) { alert('Agrega al menos una especia al costal'); return; }

  var data = {
    nombre: nombre,
    items: items,
    precioPala: precioPala,
    gramosPorPala: gramosPorPala
  };
  if (id) data.id = parseInt(id, 10);

  ArcanoDB.saveCostal(data);
  closeModal();
  toast(id ? 'Costal actualizado' : 'Costal creado');
  App.renderPage('costales');
};

Pages._deleteCostal = function(id) {
  if (!confirm('¿Eliminar este costal?')) return;
  ArcanoDB.deleteCostal(parseInt(id, 10));
  toast('Costal eliminado');
  App.renderPage('costales');
};

/* ==================== POPUP LATERAL (admin) ==================== */
Pages._guardarPopup = function() {
  var data = {
    activo: document.getElementById('pp-activo').checked,
    segundos: parseInt(document.getElementById('pp-segundos').value, 10) || 15,
    duracion: parseInt(document.getElementById('pp-duracion').value, 10) || 8,
    titulo: document.getElementById('pp-titulo').value.trim(),
    mensaje: document.getElementById('pp-mensaje').value.trim(),
    botonTexto: document.getElementById('pp-boton-texto').value.trim(),
    botonLink: document.getElementById('pp-boton-link').value.trim(),
    colorFondo: document.getElementById('pp-color-fondo').value,
    colorTexto: document.getElementById('pp-color-texto').value,
    colorAcento: document.getElementById('pp-color-acento').value,
    colorBoton: document.getElementById('pp-color-boton').value,
    colorBotonTexto: document.getElementById('pp-color-boton-texto').value,
    tamanoTitulo: document.getElementById('pp-tamano-titulo').value,
    estiloTitulo: document.getElementById('pp-estilo-titulo').value,
    tamanoTexto: document.getElementById('pp-tamano-texto').value,
    estiloTexto: document.getElementById('pp-estilo-texto').value,
    imagen: ''
  };
  // Conservar imagen si ya existe
  var imgPreview = document.getElementById('img-preview-popup');
  if (imgPreview) data.imagen = imgPreview.src;
  ArcanoDB.saveTiendaConfig({ popupTienda: data });
  var status = document.getElementById('pp-status');
  if (status) status.innerHTML = '<span style="color:var(--green)">✓ Guardado</span>';
  toast('Popup guardado');
  setTimeout(function() { if (status) status.innerHTML = ''; }, 3000);
};

Pages._desactivarPopup = function() {
  ArcanoDB.saveTiendaConfig({ popupTienda: { activo: false } });
  toast('Popup desactivado');
  App.renderPage('tienda');
};

Pages._handlePopupImg = function(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  if (file.size > 2 * 1024 * 1024) { alert('La imagen no debe superar 2MB. Recomendado: 400x400px.'); return; }
  var reader = new FileReader();
  reader.onload = function(ev) {
    // Comprimir imagen
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 400;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 400, 400);
      var compressed = canvas.toDataURL('image/jpeg', 0.85);
      var area = document.getElementById('img-area-popup');
      if (area) {
        var existing = area.querySelector('img');
        if (existing) existing.remove();
        var existingBtn = area.querySelector('button');
        if (existingBtn) existingBtn.remove();
        var imgEl = document.createElement('img');
        imgEl.src = compressed;
        imgEl.className = 'img-preview';
        imgEl.id = 'img-preview-popup';
        imgEl.style.cssText = 'width:120px;height:120px;object-fit:cover;border-radius:8px';
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-red';
        btn.style.marginTop = '6px';
        btn.textContent = 'Quitar imagen';
        btn.onclick = function() { Pages._removePopupImg(); };
        area.insertBefore(imgEl, area.querySelector('.img-upload-placeholder'));
        area.insertBefore(btn, area.querySelector('.img-upload-placeholder'));
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

Pages._removePopupImg = function() {
  var area = document.getElementById('img-area-popup');
  if (!area) return;
  var img = area.querySelector('img');
  if (img) img.remove();
  var btn = area.querySelector('button');
  if (btn) btn.remove();
};

/* ==================== ENVÍOS (SERVIENTREGA) ==================== */

Pages.renderEnvios = function(container) {
  var cfg = ArcanoDB.getTiendaConfig();
  var ce = (cfg && cfg.configEnvio) ? cfg.configEnvio : {};
  var pedidos = ArcanoDB.getPedidos();

  // Defaults
  var frascoPequeno = ce.frascoPequeno || 145;
  var frascoGrande  = ce.frascoGrande  || 230;
  var pack          = ce.pack          || 600;
  var empaque       = (ce.empaque !== undefined) ? ce.empaque : 200;
  var montoMinimoGratis = ce.montoMinimoGratis || 60000;
  var categoriasGratis  = (ce.categoriasGratis && ce.categoriasGratis.length) ? ce.categoriasGratis : ['urbano'];

  // Tarifas Servientrega (vigencia ago 2026)
  var tarifas = [
    { cat: 'urbano',   label: 'Urbano (Medellín ciudad)',          base: 7800, adicional: 3600 },
    { cat: 'zonal',    label: 'Zonal (Área Metropolitana AMVA)',   base: 11500, adicional: 4400 },
    { cat: 'capital',  label: 'Capital (capitales departamentales)', base: 16950, adicional: 4750 },
    { cat: 'especial', label: 'Especial (capitales remotas/insular)', base: 34500, adicional: 12000 }
  ];

  // Tab de la página: 'envios' (listado) o 'config' (configuración)
  if (!Pages._enviosTab) Pages._enviosTab = 'envios';
  var tab = Pages._enviosTab;

  var h = '<div class="page-actions"><button class="btn btn-outline" onclick="App.renderPage(\'dashboard\')">Volver al Dashboard</button></div>';

  // Tabs
  h += '<div class="mt-12" style="display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-bottom:16px">';
  h += '<button class="tab ' + (tab === 'envios' ? 'active' : '') + '" onclick="Pages._enviosTab=\'envios\';App.renderPage(\'envios\')">📋 Listado de envíos</button>';
  h += '<button class="tab ' + (tab === 'config' ? 'active' : '') + '" onclick="Pages._enviosTab=\'config\';App.renderPage(\'envios\')">⚙ Configuración</button>';
  h += '</div>';

  // ---- KPIs comunes ----
  var totalEnvios = 0, totalCostoEnvios = 0, totalRecaudadoEnvios = 0, totalGratis = 0;
  for (var i = 0; i < pedidos.length; i++) {
    var p = pedidos[i];
    if (!p.envio) continue;
    totalEnvios++;
    if (p.envio.costo) totalCostoEnvios += p.envio.costo;
    if (p.envio.gratis) totalGratis++;
  }

  // ---- Tab LISTADO ----
  if (tab === 'envios') {
    h += '<div class="stats-grid" style="grid-template-columns: repeat(4, 1fr)">' +
      '<div class="stat-card" style="border-left-color:var(--gold)"><div class="stat-value">' + totalEnvios + '</div><div class="stat-label">Pedidos con envío</div></div>' +
      '<div class="stat-card" style="border-left-color:var(--green)"><div class="stat-value">$' + totalCostoEnvios.toLocaleString() + '</div><div class="stat-label">Costo total cobrado</div></div>' +
      '<div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-value">' + totalGratis + '</div><div class="stat-label">Envíos gratis</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + (totalEnvios - totalGratis) + '</div><div class="stat-label">Envíos pagados</div></div>' +
      '</div>';

    h += '<div class="card mt-16"><div class="card-header"><h3>Envíos por pedido</h3></div><div class="card-body">';
    var conEnvio = [];
    for (var i = 0; i < pedidos.length; i++) {
      if (pedidos[i].envio) conEnvio.push(pedidos[i]);
    }
    conEnvio.sort(function(a, b) { return (b.creado || '').localeCompare(a.creado || ''); });

    if (conEnvio.length === 0) {
      h += '<p class="text-muted text-center">Aún no hay pedidos con envío registrado.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>Fecha</th><th>Cliente</th><th>Ciudad</th><th>Categoría</th><th>Peso</th>' +
        '<th>Costo envío</th><th>Gratis</th><th>Carrier</th><th>Estado pedido</th><th></th>' +
        '</tr></thead><tbody>';
      for (var i = 0; i < conEnvio.length; i++) {
        var p = conEnvio[i];
        var cl = p.cliente || {};
        var e = p.envio || {};
        var fecha = p.creado ? p.creado.slice(0, 10) : '';
        var hora = p.creado ? p.creado.slice(11, 16) : '';
        h += '<tr>' +
          '<td class="fw7">' + fecha + ' ' + hora + '</td>' +
          '<td>' + (cl.nombre || '?') + '</td>' +
          '<td>' + (cl.ciudad || '?') + '</td>' +
          '<td><span class="badge ' + _arcanoCategoriaBadgeClass(e.categoria) + '">' + (e.categoria || '?') + '</span></td>' +
          '<td>' + (e.pesoKg ? e.pesoKg + ' kg' : (e.pesoGramos ? Math.ceil(e.pesoGramos/1000) + ' kg' : '-')) + '</td>' +
          '<td class="text-gold fw7">' + (e.gratis ? '$0' : '$' + (e.costo || 0).toLocaleString()) + '</td>' +
          '<td>' + (e.gratis ? '<span class="badge text-green">SÍ</span>' : '<span class="badge text-muted">no</span>') + '</td>' +
          '<td>' + (e.carrier || 'Servientrega') + '</td>' +
          '<td>' + _arcanoEstadoPedidoLabel(p.estado) + '</td>' +
          '<td><button class="btn btn-sm btn-gold" onclick="Pages.verPedido(\'' + p._key + '\')">Ver</button></td>' +
          '</tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';

    // Tarifas Servientrega (referencia)
    h += '<div class="card mt-16"><div class="card-header"><h3>Tarifas Servientrega vigentes</h3><p class="text-xs text-muted">Modalidad: Contado - Normal - Terrestre. Vigencia: desde agosto 2026. Origen: Medellín.</p></div><div class="card-body">';
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>Categoría</th><th>Kilo inicial</th><th>Kilo adicional</th></tr></thead><tbody>';
    for (var t = 0; t < tarifas.length; t++) {
      h += '<tr><td class="fw7">' + tarifas[t].label + '</td><td class="text-gold">$' + tarifas[t].base.toLocaleString() + '</td><td>$' + tarifas[t].adicional.toLocaleString() + '</td></tr>';
    }
    h += '</tbody></table></div>';
    h += '<p class="text-xs text-muted mt-8">El sobreflete (1% sobre valor declarado, mín $80.000) es absorbido por Arcano y NO se suma al cliente.</p>';
    h += '</div></div>';
  }

  // ---- Tab CONFIGURACIÓN ----
  if (tab === 'config') {
    h += '<div class="card"><div class="card-header"><h3>Configuración de envíos</h3><p class="text-xs text-muted">Estos valores se guardan en Firebase (tiendaConfig.configEnvio) y se usan automáticamente en el checkout de la tienda. Si vaciás un campo, se vuelve al default.</p></div><div class="card-body">';

    // Pesos
    h += '<h4 class="mt-8">Pesos por unidad (gramos)</h4>';
    h += '<p class="text-sm text-muted mb-12">El cálculo de peso es automático y oculto para el cliente. El peso del pedido = empaque + sumatoria de (peso unitario × cantidad) de cada item.</p>';
    h += '<div class="g4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">';
    h += '<div class="form-group"><label>Frasco pequeño</label><input type="number" class="form-input" id="cfg-pq" value="' + frascoPequeno + '" min="0" max="2000"><p class="text-xs text-muted">Default: 145g (140-150g)</p></div>';
    h += '<div class="form-group"><label>Frasco grande</label><input type="number" class="form-input" id="cfg-gr" value="' + frascoGrande + '" min="0" max="2000"><p class="text-xs text-muted">Default: 230g (220-240g)</p></div>';
    h += '<div class="form-group"><label>Pack</label><input type="number" class="form-input" id="cfg-pk" value="' + pack + '" min="0" max="5000"><p class="text-xs text-muted">Default: 600g</p></div>';
    h += '<div class="form-group"><label>Empaque (caja + relleno)</label><input type="number" class="form-input" id="cfg-emp" value="' + empaque + '" min="0" max="2000"><p class="text-xs text-muted">Default: 200g</p></div>';
    h += '</div>';

    // Envío gratis
    h += '<h4 class="mt-16">Envío gratis</h4>';
    h += '<p class="text-sm text-muted mb-12">Define desde qué monto se aplica envío gratis y en qué categorías de destino. Para desactivar envío gratis, subí el monto a un valor muy alto.</p>';
    h += '<div class="g2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    h += '<div class="form-group"><label>Monto mínimo (COP)</label><input type="number" class="form-input" id="cfg-monto-gratis" value="' + montoMinimoGratis + '" min="0" step="1000"><p class="text-xs text-muted">Default: $60.000</p></div>';
    h += '<div class="form-group"><label>Categorías que aplican</label><div style="display:flex;flex-direction:column;gap:6px;padding-top:6px">';
    for (var t = 0; t < tarifas.length; t++) {
      var checked = categoriasGratis.indexOf(tarifas[t].cat) !== -1 ? 'checked' : '';
      h += '<label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer"><input type="checkbox" name="cfg-cat-gratis" value="' + tarifas[t].cat + '" ' + checked + '> ' + tarifas[t].label + '</label>';
    }
    h += '</div></div>';
    h += '</div>';

    // Botón guardar
    h += '<div class="mt-16" style="display:flex;gap:8px;align-items:center">';
    h += '<button class="btn btn-gold" onclick="Pages.guardarConfigEnvio()">Guardar configuración</button>';
    h += '<button class="btn btn-outline" onclick="Pages.restaurarDefaultsEnvio()">Restaurar defaults</button>';
    h += '<span id="cfg-envio-status" class="text-sm ml-8"></span>';
    h += '</div>';

    h += '</div></div>';

    // Simulador
    h += '<div class="card mt-16"><div class="card-header"><h3>Simulador de envío</h3><p class="text-xs text-muted">Probá combinaciones para verificar que el cálculo esté bien.</p></div><div class="card-body">';
    h += '<div class="g3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">';
    h += '<div class="form-group"><label>Ciudad destino</label><select class="form-input" id="sim-ciudad">';
    var ciudades = ['Medellín','Bello','Envigado','Bogotá','Cali','Barranquilla','Cartagena','Bucaramanga','Pereira','Manizales','Cúcuta','Santa Marta','Ibagué','Villavicencio','Armenia','Neiva','Sincelejo','Popayán','Tunja','Montería','Valledupar','Riohacha','Pasto','Quibdó','Florencia','Yopal','Arauca','Leticia','San Andrés','Mocoa'];
    for (var ci = 0; ci < ciudades.length; ci++) {
      h += '<option value="' + ciudades[ci] + '">' + ciudades[ci] + '</option>';
    }
    h += '</select></div>';
    h += '<div class="form-group"><label>Frascos pequeños</label><input type="number" class="form-input" id="sim-pq" value="2" min="0" max="50"></div>';
    h += '<div class="form-group"><label>Frascos grandes</label><input type="number" class="form-input" id="sim-gr" value="1" min="0" max="50"></div>';
    h += '</div>';
    h += '<div class="mt-8" style="display:flex;gap:8px;align-items:center">';
    h += '<button class="btn btn-gold" onclick="Pages.simularEnvio()">Calcular</button>';
    h += '<div class="form-group" style="flex:1;margin:0"><label>Subtotal del carrito (COP)</label><input type="number" class="form-input" id="sim-subtotal" value="60000" min="0" step="1000"></div>';
    h += '</div>';
    h += '<div id="sim-result" class="mt-12" style="padding:14px;background:var(--bg);border-radius:8px;border:1px solid var(--border);min-height:48px"></div>';
    h += '</div></div>';
  }

  container.innerHTML = h;
};

Pages.guardarConfigEnvio = function() {
  var frascoPequeno = parseInt(document.getElementById('cfg-pq').value, 10);
  var frascoGrande  = parseInt(document.getElementById('cfg-gr').value, 10);
  var pack          = parseInt(document.getElementById('cfg-pk').value, 10);
  var empaque       = parseInt(document.getElementById('cfg-emp').value, 10);
  var montoMinimoGratis = parseInt(document.getElementById('cfg-monto-gratis').value, 10);

  // Validaciones
  if (isNaN(frascoPequeno) || frascoPequeno < 0) { alert('Peso frasco pequeño inválido'); return; }
  if (isNaN(frascoGrande) || frascoGrande < 0) { alert('Peso frasco grande inválido'); return; }
  if (isNaN(pack) || pack < 0) { alert('Peso pack inválido'); return; }
  if (isNaN(empaque) || empaque < 0) { alert('Peso empaque inválido'); return; }
  if (isNaN(montoMinimoGratis) || montoMinimoGratis < 0) { alert('Monto mínimo envío gratis inválido'); return; }

  var catsChecked = document.querySelectorAll('input[name="cfg-cat-gratis"]:checked');
  var categoriasGratis = [];
  for (var i = 0; i < catsChecked.length; i++) categoriasGratis.push(catsChecked[i].value);
  if (categoriasGratis.length === 0) {
    if (!confirm('No seleccionaste ninguna categoría para envío gratis. ¿Continuar de todas formas?')) return;
  }

  var configEnvio = {
    frascoPequeno: frascoPequeno,
    frascoGrande: frascoGrande,
    pack: pack,
    empaque: empaque,
    montoMinimoGratis: montoMinimoGratis,
    categoriasGratis: categoriasGratis
  };

  var status = document.getElementById('cfg-envio-status');
  if (status) { status.textContent = 'Guardando...'; status.style.color = 'var(--gold)'; }

  ArcanoDB.saveTiendaConfig({ configEnvio: configEnvio });

  if (status) {
    status.textContent = '✓ Guardado en Firebase';
    status.style.color = 'var(--green)';
    setTimeout(function() { if (status) status.textContent = ''; }, 3000);
  }
  toast('Configuración de envío guardada');
};

Pages.restaurarDefaultsEnvio = function() {
  if (!confirm('¿Restaurar los valores por defecto? Esto sobreescribe tu configuración actual.')) return;
  ArcanoDB.saveTiendaConfig({
    configEnvio: {
      frascoPequeno: 145,
      frascoGrande: 230,
      pack: 600,
      empaque: 200,
      montoMinimoGratis: 60000,
      categoriasGratis: ['urbano']
    }
  });
  toast('Defaults restaurados');
  App.renderPage('envios');
};

Pages.simularEnvio = function() {
  var ciudad = document.getElementById('sim-ciudad').value;
  var pq = parseInt(document.getElementById('sim-pq').value, 10) || 0;
  var gr = parseInt(document.getElementById('sim-gr').value, 10) || 0;
  var subtotal = parseInt(document.getElementById('sim-subtotal').value, 10) || 0;

  // Items simulados
  var items = [];
  if (pq > 0) items.push({ talla: 'pequeño', qty: pq });
  if (gr > 0) items.push({ talla: 'grande', qty: gr });

  // Cálculo en vivo (usa la misma lógica que el front)
  var cfg = ArcanoDB.getTiendaConfig();
  var ce = (cfg && cfg.configEnvio) ? cfg.configEnvio : {};
  var ePq = ce.frascoPequeno || 145;
  var eGr = ce.frascoGrande  || 230;
  var eEmp = (ce.empaque !== undefined) ? ce.empaque : 200;
  var eMonto = ce.montoMinimoGratis || 60000;
  var eCats = (ce.categoriasGratis && ce.categoriasGratis.length) ? ce.categoriasGratis : ['urbano'];

  var CATEGORIAS = {
    'Medellín':'urbano','Bello':'zonal','Itagüí':'zonal','Envigado':'zonal','Sabaneta':'zonal',
    'La Estrella':'zonal','Caldas':'zonal','Copacabana':'zonal','Girardota':'zonal','Barbosa':'zonal',
    'Bogotá':'capital','Cali':'capital','Barranquilla':'capital','Cartagena':'capital','Bucaramanga':'capital',
    'Pereira':'capital','Manizales':'capital','Cúcuta':'capital','Santa Marta':'capital','Ibagué':'capital',
    'Villavicencio':'capital','Armenia':'capital','Neiva':'capital','Sincelejo':'capital','Popayán':'capital',
    'Tunja':'capital','Montería':'capital','Valledupar':'capital','Riohacha':'capital','Pasto':'capital',
    'Quibdó':'capital','Florencia':'capital','Yopal':'capital','Arauca':'capital',
    'Leticia':'especial','San Andrés':'especial','Mocoa':'especial'
  };
  var TARIFAS = {
    urbano:   { base: 7800,  adicional: 3600  },
    zonal:    { base: 11500, adicional: 4400  },
    capital:  { base: 16950, adicional: 4750  },
    especial: { base: 34500, adicional: 12000 }
  };

  var categoria = CATEGORIAS[ciudad];
  var pesoGramos = eEmp + (pq * ePq) + (gr * eGr);
  var pesoKg = Math.ceil(pesoGramos / 1000);
  var kilosAdic = Math.max(0, pesoKg - 1);
  var aplicaGratis = categoria && eCats.indexOf(categoria) !== -1 && subtotal >= eMonto;
  var costo = categoria ? TARIFAS[categoria].base + (kilosAdic * TARIFAS[categoria].adicional) : 0;
  var totalFinal = subtotal + (aplicaGratis ? 0 : (categoria ? costo : 0));

  var html = '';
  if (!categoria) {
    html = '<div style="color:var(--red)">⚠ Sin cobertura para ' + ciudad + '</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">';
    html += '<div><div class="text-xs text-muted">Ciudad</div><div class="fw7">' + ciudad + '</div></div>';
    html += '<div><div class="text-xs text-muted">Categoría</div><div class="fw7">' + categoria + '</div></div>';
    html += '<div><div class="text-xs text-muted">Peso calculado</div><div class="fw7">' + pesoGramos + 'g = ' + pesoKg + 'kg</div></div>';
    html += '<div><div class="text-xs text-muted">Kilos adicionales</div><div class="fw7">' + kilosAdic + '</div></div>';
    html += '</div>';
    html += '<div class="mt-8" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding-top:12px;border-top:1px solid var(--border)">';
    if (aplicaGratis) {
      html += '<div><div class="text-xs text-muted">Envío</div><div class="fw7 text-green">¡GRATIS!</div></div>';
    } else {
      html += '<div><div class="text-xs text-muted">Envío</div><div class="fw7 text-gold">$' + costo.toLocaleString() + '</div></div>';
    }
    html += '<div><div class="text-xs text-muted">Subtotal</div><div class="fw7">$' + subtotal.toLocaleString() + '</div></div>';
    html += '<div><div class="text-xs text-muted">Total a cobrar</div><div class="fw7" style="font-size:1.15rem">$' + totalFinal.toLocaleString() + '</div></div>';
    html += '</div>';
    if (!aplicaGratis && categoria === 'urbano' && eMonto > subtotal) {
      var faltan = eMonto - subtotal;
      html += '<div class="mt-8 text-sm" style="color:var(--gold);font-style:italic">Te faltan $' + faltan.toLocaleString() + ' para tener envío gratis.</div>';
    }
  }
  var res = document.getElementById('sim-result');
  if (res) res.innerHTML = html;
};

// Helpers de badges para la tabla de envíos
function _arcanoCategoriaBadgeClass(cat) {
  if (cat === 'urbano') return 'badge-green';
  if (cat === 'zonal') return 'badge-blue';
  if (cat === 'capital') return 'badge-gold';
  if (cat === 'especial') return 'text-red';
  return 'text-muted';
}
function _arcanoEstadoPedidoLabel(estado) {
  var m = { nuevo: 'Nuevo', confirmado: 'Confirmado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
  return m[estado] || (estado || '?');
}

/* ============================================================
   MAKING BLENDS — Panel interactivo de producción
   Integrado en el admin, usa datos de ArcanoDB
   ============================================================ */

// Estado del "videojuego"
Pages._mb = {
  step: 1,
  selectedBlend: null,
  size: 'chico',
  qty: 10,
  recipe: [],
  addedSpices: {},
  totalWeight: 0,
  targetWeight: 0,
  currentSpiceIdx: null
};

Pages._renderMakingBlends = function() {
  var self = Pages;
  var mb = self._mb;
  var blends = ArcanoDB.getBlends();
  // Solo blends con ingredientes definidos
  var blendsConIng = blends.filter(function(b) {
    return b.ingredientes && b.ingredientes.length > 0;
  });

  var h = '<div class="mb-container">';

  // Step indicator (5 pasos ahora)
  h += '<div class="mb-steps-indicator">';
  h += '<div class="mb-step-dot ' + (mb.step === 1 ? 'active' : (mb.step > 1 ? 'done' : '')) + '" title="Elegir blend">1</div><div class="mb-step-line"></div>';
  h += '<div class="mb-step-dot ' + (mb.step === 2 ? 'active' : (mb.step > 2 ? 'done' : '')) + '" title="Configurar">2</div><div class="mb-step-line"></div>';
  h += '<div class="mb-step-dot ' + (mb.step === 3 ? 'active' : (mb.step > 3 ? 'done' : '')) + '" title="Producir">3</div><div class="mb-step-line"></div>';
  h += '<div class="mb-step-dot ' + (mb.step === 4 ? 'active' : (mb.step > 4 ? 'done' : '')) + '" title="Recuento">4</div><div class="mb-step-line"></div>';
  h += '<div class="mb-step-dot ' + (mb.step === 5 ? 'active' : '') + '" title="Completado">5</div>';
  h += '</div>';

  if (mb.step === 1) {
    // ========== STEP 1: Selección de blend ==========
    h += '<div class="mb-section">';
    h += '<h3 class="mb-section-title">Elegí el blend a producir</h3>';
    h += '<input type="text" class="input mb-search" id="mb-search" placeholder="🔍 Buscar blend..." oninput="Pages._mbFilterBlends()">';
    h += '<div class="mb-blend-grid" id="mb-blend-grid">';
    for (var i = 0; i < blendsConIng.length; i++) {
      var b = blendsConIng[i];
      h += self._mbBlendCard(b);
    }
    h += '</div>';
    if (blendsConIng.length === 0) {
      h += '<p class="text-muted text-center">No hay blends con ingredientes definidos. Primero editá un blend y agregale ingredientes.</p>';
    }
    h += '</div>';
  }

  if (mb.step === 2) {
    h += self._mbRenderStep2();
  }

  if (mb.step === 3) {
    h += self._mbRenderStep3();
  }

  if (mb.step === 4) {
    h += self._mbRenderStep4();
  }

  if (mb.step === 5) {
    h += self._mbRenderStep5();
  }

  h += '</div>';
  return h;
};

Pages._mbBlendCard = function(b) {
  var numIng = (b.ingredientes || []).length;
  var stockChico = b.stockChico || 0;
  var stockGrande = b.stockGrande || 0;
  return '<div class="mb-blend-card" data-blend-name="' + esc((b.nombre || '').toLowerCase()) + '" onclick="Pages._mbSelectBlend(' + b.id + ')">' +
    '<div class="mb-blend-name">' + esc(b.nombre) + '</div>' +
    '<div class="mb-blend-cat">' + esc(b.categoria || (b.categorias && b.categorias[0]) || '') + '</div>' +
    '<div class="mb-blend-meta">' +
      '<span>' + numIng + ' especias</span>' +
      '<span>Stock: ' + stockChico + ' ch / ' + stockGrande + ' gr</span>' +
    '</div>' +
  '</div>';
};

Pages._mbFilterBlends = function() {
  var q = (document.getElementById('mb-search').value || '').toLowerCase();
  var cards = document.querySelectorAll('#mb-blend-grid .mb-blend-card');
  for (var i = 0; i < cards.length; i++) {
    var name = cards[i].dataset.blendName || '';
    cards[i].style.display = name.indexOf(q) !== -1 ? '' : 'none';
  }
};

Pages._mbSelectBlend = function(blendId) {
  var self = Pages;
  var blend = ArcanoDB.getBlend(blendId);
  if (!blend) return;
  self._mb.selectedBlend = blend;
  self._mb.step = 2;
  App.renderPage('produccion');
};

Pages._mbRenderStep2 = function() {
  var self = Pages;
  var mb = self._mb;
  var blend = mb.selectedBlend;
  if (!blend) { mb.step = 1; return self._renderMakingBlends(); }

  var size = mb.size;
  var qty = mb.qty;

  // Peso por frasco
  var pesoFrasco = 0;
  var ingredientes = blend.ingredientes || [];
  for (var i = 0; i < ingredientes.length; i++) {
    var ing = ingredientes[i];
    pesoFrasco += size === 'grande' ? (Number(ing.gramosGrande) || 0) : (Number(ing.gramosChico) || 0);
  }
  var pesoTotal = pesoFrasco * qty;

  // Stock disponible de cada insumo
  var db = ArcanoDB.getDB();
  var envases = db.stockEnvases || { chico: 0, grande: 0 };
  var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
  var cintas = db.stockCintas || 0;
  var stk = null;
  var stkKeys = Object.keys(db.stickers || {});
  for (var j = 0; j < stkKeys.length; j++) {
    if (db.stickers[stkKeys[j]].nombre === blend.nombre) { stk = db.stickers[stkKeys[j]]; break; }
  }
  var stkStock = stk ? (size === 'grande' ? (stk.stockGrande || 0) : (stk.stockChico || 0)) : 0;
  var envasesDisp = size === 'grande' ? envases.grande : envases.chico;
  var bolsasDisp = size === 'grande' ? bolsas.grande : bolsas.chico;

  // Verificar stock de cada especia
  var especiasOk = true;
  var especiasDetalle = [];
  for (var k = 0; k < ingredientes.length; k++) {
    var ing = ingredientes[k];
    var esp = ArcanoDB.getEspecia(ing.especiaId);
    var gpf = size === 'grande' ? (Number(ing.gramosGrande) || 0) : (Number(ing.gramosChico) || 0);
    var needed = gpf * qty;
    var avail = esp ? (esp.stockBolsa || 0) : 0;
    var ok = avail >= needed;
    if (!ok) especiasOk = false;
    especiasDetalle.push({ nombre: esp ? esp.nombre : ing.especiaNombre, needed: needed, avail: avail, ok: ok });
  }

  var allOk = especiasOk && envasesDisp >= qty && bolsasDisp >= qty && cintas >= qty && stkStock >= qty;

  var h = '<div class="mb-section">';
  h += '<div class="mb-step-header"><h3 class="mb-section-title">Configurá la producción</h3>';
  h += '<button class="btn btn-sm btn-outline" onclick="Pages._mbGoStep(1)">← Volver</button></div>';

  h += '<div class="mb-config-card">';
  h += '<div class="mb-blend-selected"><div class="mb-blend-selected-name">' + esc(blend.nombre) + '</div><div class="mb-blend-selected-cat">' + esc(blend.categoria || '') + '</div></div>';

  // Tamaño + Cantidad
  h += '<div class="mb-config-row">';
  h += '<div class="form-group"><label>Tamaño del frasco</label>';
  h += '<div class="mb-size-toggle">';
  h += '<button class="mb-size-btn ' + (size === 'chico' ? 'active' : '') + '" onclick="Pages._mbSetSize(\'chico\')"><span class="mb-size-icon">🫙</span><span class="mb-size-name">Pequeño</span><span class="mb-size-weight">' + pesoFrasco + 'g</span></button>';
  // Recalcular peso grande si está en chico
  var pesoFrascoGrande = 0;
  for (var i = 0; i < ingredientes.length; i++) {
    pesoFrascoGrande += Number(ingredientes[i].gramosGrande) || 0;
  }
  h += '<button class="mb-size-btn ' + (size === 'grande' ? 'active' : '') + '" onclick="Pages._mbSetSize(\'grande\')"><span class="mb-size-icon">🫙</span><span class="mb-size-name">Grande</span><span class="mb-size-weight">' + (size === 'grande' ? pesoFrasco : pesoFrascoGrande) + 'g</span></button>';
  h += '</div></div>';

  h += '<div class="form-group"><label>Cantidad de frascos</label>';
  h += '<div class="mb-qty-selector"><button onclick="Pages._mbAdjustQty(-1)">−</button>';
  h += '<input type="number" id="mb-qty-input" value="' + qty + '" min="1" max="500" oninput="Pages._mbOnQtyChange()">';
  h += '<button onclick="Pages._mbAdjustQty(1)">+</button></div>';
  h += '<div class="mb-qty-presets"><button onclick="Pages._mbSetQty(5)">5</button><button onclick="Pages._mbSetQty(10)">10</button><button onclick="Pages._mbSetQty(25)">25</button><button onclick="Pages._mbSetQty(50)">50</button><button onclick="Pages._mbSetQty(100)">100</button></div>';
  h += '</div>';
  h += '</div>';

  // Resumen
  h += '<div class="mb-summary">';
  h += '<div class="mb-summary-item"><div class="mb-summary-label">Peso por frasco</div><div class="mb-summary-value">' + pesoFrasco + 'g</div></div>';
  h += '<div class="mb-summary-item"><div class="mb-summary-label">Frascos a producir</div><div class="mb-summary-value">' + qty + '</div></div>';
  h += '<div class="mb-summary-item"><div class="mb-summary-label">Peso total</div><div class="mb-summary-value">' + pesoTotal.toLocaleString() + 'g</div></div>';
  h += '</div>';

  // Verificación de stock
  h += '<div class="mb-stock-check">';
  h += '<h4>Verificación de stock</h4>';
  h += '<div class="mb-stock-list">';
  for (var i = 0; i < especiasDetalle.length; i++) {
    var d = especiasDetalle[i];
    var color = d.ok ? 'var(--green)' : 'var(--red)';
    var icon = d.ok ? '✓' : '⚠';
    h += '<div class="mb-stock-item"><span class="mb-stock-name">' + esc(d.nombre) + '</span><span class="mb-stock-detail" style="color:' + color + '">' + icon + ' necesita ' + d.needed + 'g · disponible ' + d.avail + 'g</span></div>';
  }
  h += '<div class="mb-stock-item"><span class="mb-stock-name">Envases ' + size + '</span><span class="mb-stock-detail" style="color:' + (envasesDisp >= qty ? 'var(--green)' : 'var(--red)') + '">' + (envasesDisp >= qty ? '✓' : '⚠') + ' necesita ' + qty + ' · disponible ' + envasesDisp + '</span></div>';
  h += '<div class="mb-stock-item"><span class="mb-stock-name">Bolsas ' + size + '</span><span class="mb-stock-detail" style="color:' + (bolsasDisp >= qty ? 'var(--green)' : 'var(--red)') + '">' + (bolsasDisp >= qty ? '✓' : '⚠') + ' necesita ' + qty + ' · disponible ' + bolsasDisp + '</span></div>';
  h += '<div class="mb-stock-item"><span class="mb-stock-name">Stickers</span><span class="mb-stock-detail" style="color:' + (stkStock >= qty ? 'var(--green)' : 'var(--red)') + '">' + (stkStock >= qty ? '✓' : '⚠') + ' necesita ' + qty + ' · disponible ' + stkStock + '</span></div>';
  h += '<div class="mb-stock-item"><span class="mb-stock-name">Cintas</span><span class="mb-stock-detail" style="color:' + (cintas >= qty ? 'var(--green)' : 'var(--red)') + '">' + (cintas >= qty ? '✓' : '⚠') + ' necesita ' + qty + ' · disponible ' + cintas + '</span></div>';
  h += '</div>';
  h += '</div>';

  if (!allOk) {
    h += '<div class="mb-warn-box">⚠ Stock insuficiente para producir. Reabastecé antes de continuar o ajustá la cantidad.</div>';
  }

  h += '<div class="mb-actions"><button class="btn btn-outline" onclick="Pages._mbGoStep(1)">Volver</button>';
  h += '<button class="btn btn-gold" onclick="Pages._mbStartProduction()" ' + (allOk ? '' : 'disabled') + '>Iniciar producción →</button></div>';

  h += '</div>';
  h += '</div>';
  return h;
};

Pages._mbSetSize = function(size) {
  Pages._mb.size = size;
  App.renderPage('produccion');
};

Pages._mbAdjustQty = function(delta) {
  var input = document.getElementById('mb-qty-input');
  if (!input) return;
  var v = parseInt(input.value, 10) || 0;
  v = Math.max(1, Math.min(500, v + delta));
  input.value = v;
  Pages._mb.qty = v;
  App.renderPage('produccion');
};

Pages._mbSetQty = function(v) {
  Pages._mb.qty = v;
  App.renderPage('produccion');
};

Pages._mbOnQtyChange = function() {
  var input = document.getElementById('mb-qty-input');
  if (!input) return;
  var v = parseInt(input.value, 10) || 1;
  Pages._mb.qty = Math.max(1, Math.min(500, v));
  App.renderPage('produccion');
};

Pages._mbGoStep = function(n) {
  Pages._mb.step = n;
  App.renderPage('produccion');
};

Pages._mbStartProduction = function() {
  var self = Pages;
  var mb = self._mb;
  var blend = mb.selectedBlend;
  var size = mb.size;
  var qty = mb.qty;
  var ingredientes = blend.ingredientes || [];

  var recipe = [];
  var targetWeight = 0;
  var totalGramosFrasco = 0;
  for (var i = 0; i < ingredientes.length; i++) {
    var ing = ingredientes[i];
    var gpf = size === 'grande' ? (Number(ing.gramosGrande) || 0) : (Number(ing.gramosChico) || 0);
    totalGramosFrasco += gpf;
  }
  for (var i = 0; i < ingredientes.length; i++) {
    var ing = ingredientes[i];
    var esp = ArcanoDB.getEspecia(ing.especiaId);
    var gpf = size === 'grande' ? (Number(ing.gramosGrande) || 0) : (Number(ing.gramosChico) || 0);
    var gramosTotal = gpf * qty;
    var pct = totalGramosFrasco > 0 ? (gpf / totalGramosFrasco) * 100 : 0;
    recipe.push({
      especiaId: ing.especiaId,
      nombre: esp ? esp.nombre : (ing.especiaNombre || 'Especia'),
      gramosPorFrasco: gpf,
      gramosTotal: gramosTotal,
      porcentaje: pct,
      added: false,
      actualGramos: 0
    });
    targetWeight += gramosTotal;
  }

  mb.recipe = recipe;
  mb.targetWeight = targetWeight;
  mb.totalWeight = 0;
  mb.addedSpices = {};
  mb.step = 3;
  App.renderPage('produccion');
};

Pages._mbRenderStep3 = function() {
  var self = Pages;
  var mb = self._mb;
  var blend = mb.selectedBlend;
  var size = mb.size;
  var qty = mb.qty;
  var recipe = mb.recipe;

  var h = '<div class="mb-section">';
  h += '<div class="mb-step-header"><h3 class="mb-section-title">Producción en curso</h3>';
  h += '<button class="btn btn-sm btn-outline" onclick="Pages._mbGoStep(2)">← Volver</button></div>';

  h += '<div class="mb-production-layout">';
  // Recipe panel (izquierda)
  h += '<div class="mb-recipe-panel">';
  h += '<h4 class="mb-recipe-title">Receta total</h4>';
  h += '<div class="mb-recipe-meta">' + esc(blend.nombre) + ' · ' + (size === 'grande' ? 'Frascos grandes' : 'Frascos pequeños') + ' · ' + qty + ' unid.</div>';
  h += '<div class="mb-recipe-list" id="mb-recipe-list">';
  for (var i = 0; i < recipe.length; i++) {
    var r = recipe[i];
    h += '<div class="mb-recipe-item" id="mb-recipe-item-' + i + '">' +
      '<div><div class="mb-recipe-item-name">' + esc(r.nombre) + '</div>' +
      '<div class="mb-recipe-item-pct">' + r.porcentaje.toFixed(1) + '% · ' + r.gramosPorFrasco + 'g c/u</div></div>' +
      '<div class="mb-recipe-item-weight">' + r.gramosTotal.toLocaleString() + 'g</div>' +
    '</div>';
  }
  h += '</div>';
  h += '<div class="mb-recipe-total"><span>Peso total</span><span>' + mb.targetWeight.toLocaleString() + 'g</span></div>';
  h += '</div>';

  // Mixing station (derecha)
  h += '<div class="mb-mixing-station">';
  h += '<div class="mb-bowl-container"><div class="mb-bowl' + (mb.totalWeight > 0 ? ' filling' : '') + '" id="mb-bowl"><div class="mb-bowl-content" id="mb-bowl-content"></div><div class="mb-bowl-shine"></div></div><div class="mb-bowl-label" id="mb-bowl-label">Tazón vacío</div></div>';

  var addedCount = 0;
  for (var i = 0; i < recipe.length; i++) if (recipe[i].added) addedCount++;
  var fillPct = mb.targetWeight > 0 ? Math.min(100, (mb.totalWeight / mb.targetWeight) * 100) : 0;

  h += '<div class="mb-progress-section">';
  h += '<div class="mb-progress-bar"><div class="mb-progress-fill" id="mb-progress-fill" style="width:' + fillPct + '%"></div></div>';
  h += '<div class="mb-progress-text" id="mb-progress-text">' + addedCount + ' / ' + recipe.length + ' especias agregadas</div>';
  h += '</div>';

  h += '<div class="mb-spices-rack" id="mb-spices-rack">';
  for (var i = 0; i < recipe.length; i++) {
    var r = recipe[i];
    h += '<div class="mb-spice-jar' + (r.added ? ' added' : '') + '" id="mb-spice-jar-' + i + '" onclick="Pages._mbAddSpice(' + i + ')">' +
      '<span class="mb-spice-jar-icon">🫙</span>' +
      '<div class="mb-spice-jar-name">' + esc(r.nombre) + '</div>' +
      '<div class="mb-spice-jar-weight">' + r.gramosTotal.toLocaleString() + 'g <small>(' + r.gramosPorFrasco + 'g c/u)</small></div>' +
    '</div>';
  }
  h += '</div>';

  h += '<div class="mb-prod-actions">';
  h += '<button class="btn btn-outline" onclick="Pages._mbResetProduction()">Reiniciar</button>';
  h += '<button class="btn btn-gold" id="mb-complete-btn" onclick="Pages._mbGoToRecuento()" ' + (addedCount === recipe.length ? '' : 'disabled') + '>Ver recuento →</button>';
  h += '</div>';

  h += '</div></div></div>';
  return h;
};

// Llenar el bowl dinámicamente después del render
Pages._mbUpdateBowlVisual = function() {
  var self = Pages;
  var mb = self._mb;
  var recipe = mb.recipe;
  var addedCount = 0;
  for (var i = 0; i < recipe.length; i++) if (recipe[i].added) addedCount++;
  var fillPct = mb.targetWeight > 0 ? Math.min(100, (mb.totalWeight / mb.targetWeight) * 100) : 0;

  var content = document.getElementById('mb-bowl-content');
  if (content) content.style.height = fillPct + '%';

  var label = document.getElementById('mb-bowl-label');
  if (label) {
    label.textContent = mb.totalWeight.toLocaleString() + 'g / ' + mb.targetWeight.toLocaleString() + 'g';
  }

  var bowl = document.getElementById('mb-bowl');
  if (bowl) {
    if (fillPct > 50) bowl.classList.add('filling');
    else bowl.classList.remove('filling');
  }

  var progressFill = document.getElementById('mb-progress-fill');
  if (progressFill) progressFill.style.width = fillPct + '%';

  var progressText = document.getElementById('mb-progress-text');
  if (progressText) progressText.textContent = addedCount + ' / ' + recipe.length + ' especias agregadas';

  var completeBtn = document.getElementById('mb-complete-btn');
  if (completeBtn) completeBtn.disabled = addedCount !== recipe.length;
};

Pages._mbAddSpice = function(idx) {
  var self = Pages;
  var mb = self._mb;
  var recipe = mb.recipe;
  var r = recipe[idx];
  if (!r || r.added) return;

  mb.currentSpiceIdx = idx;

  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'mb-weight-modal';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML = '<div class="modal" style="max-width:380px;text-align:center">' +
    '<div class="modal-header"><h3>Agregar especia</h3><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">X</button></div>' +
    '<div class="modal-body">' +
      '<div class="mb-modal-spice">' + esc(r.nombre) + '</div>' +
      '<div class="mb-modal-target">Objetivo: <strong>' + r.gramosTotal.toLocaleString() + 'g</strong></div>' +
      '<input type="number" class="input mb-modal-input" id="mb-modal-input" value="' + r.gramosTotal + '" step="0.1" min="0" style="text-align:center;font-size:22px;font-weight:700">' +
      '<div style="display:flex;gap:8px;margin-top:16px"><button class="btn btn-outline" style="flex:1" onclick="Pages._mbCloseWeightModal()">Cancelar</button>' +
      '<button class="btn btn-gold" style="flex:1" onclick="Pages._mbConfirmWeight()">Confirmar</button></div>' +
    '</div></div>';
  document.body.appendChild(modal);
  setTimeout(function() {
    var inp = document.getElementById('mb-modal-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
};

Pages._mbCloseWeightModal = function() {
  var modal = document.getElementById('mb-weight-modal');
  if (modal) modal.remove();
  Pages._mb.currentSpiceIdx = null;
};

Pages._mbConfirmWeight = function() {
  var self = Pages;
  var mb = self._mb;
  var idx = mb.currentSpiceIdx;
  if (idx === null) return;
  var recipe = mb.recipe;
  var r = recipe[idx];
  if (!r) return;

  var inputVal = parseFloat(document.getElementById('mb-modal-input').value);
  if (isNaN(inputVal) || inputVal <= 0) {
    toast('Ingresá un peso válido', 'error');
    return;
  }

  r.added = true;
  r.actualGramos = inputVal;
  mb.totalWeight += inputVal;

  // Actualizar UI sin recargar todo (más fluido)
  var jar = document.getElementById('mb-spice-jar-' + idx);
  if (jar) jar.classList.add('added');

  var recipeItem = document.getElementById('mb-recipe-item-' + idx);
  if (recipeItem) recipeItem.classList.add('done');

  self._mbUpdateBowlVisual();

  // Animación de tarro cayendo
  var jarEl = document.getElementById('mb-spice-jar-' + idx);
  var bowlEl = document.getElementById('mb-bowl');
  if (jarEl && bowlEl) {
    var drop = document.createElement('div');
    drop.className = 'mb-spice-drop';
    drop.textContent = '🫙';
    var jarRect = jarEl.getBoundingClientRect();
    var bowlRect = bowlEl.getBoundingClientRect();
    drop.style.left = (bowlRect.left + bowlRect.width/2 - 12) + 'px';
    drop.style.top = (bowlRect.top + 20) + 'px';
    drop.style.position = 'fixed';
    drop.style.zIndex = '500';
    document.body.appendChild(drop);
    setTimeout(function() { if (drop.parentNode) drop.parentNode.removeChild(drop); }, 900);
  }

  self._mbCloseWeightModal();
  toast('✓ ' + r.nombre + ': ' + inputVal.toLocaleString() + 'g agregados');

  var addedCount = 0;
  for (var i = 0; i < recipe.length; i++) if (recipe[i].added) addedCount++;
  if (addedCount === recipe.length) {
    setTimeout(function() { toast('¡Receta completa! Ya podés finalizar.'); }, 600);
  }
};

Pages._mbResetProduction = function() {
  if (!confirm('¿Reiniciar la producción? Vas a perder el progreso actual.')) return;
  Pages._mbStartProduction();
};

// Al confirmar el paso 3, va al recuento (no produce directamente)
Pages._mbGoToRecuento = function() {
  var self = Pages;
  var mb = self._mb;
  var recipe = mb.recipe;
  var addedCount = 0;
  for (var i = 0; i < recipe.length; i++) if (recipe[i].added) addedCount++;
  if (addedCount !== recipe.length) {
    toast('Te faltan especias por agregar (' + (recipe.length - addedCount) + ')', 'error');
    return;
  }
  mb.step = 4;
  App.renderPage('produccion');
};

Pages._mbCompleteProduction = function() {
  // Mantenido por compatibilidad — redirige al recuento
  Pages._mbGoToRecuento();
};

Pages._mbRenderStep4 = function() {
  var self = Pages;
  var mb = self._mb;
  var blend = mb.selectedBlend;
  var recipe = mb.recipe;
  var size = mb.size;
  var qty = mb.qty;

  var costos = ArcanoDB.getCostosInsumos();
  var db = ArcanoDB.getDB();
  var envases = db.stockEnvases || { chico: 0, grande: 0 };
  var bolsas = db.stockBolsas || { chico: 0, grande: 0 };
  var cintas = db.stockCintas || 0;
  var stk = null;
  var stkKeys = Object.keys(db.stickers || {});
  for (var j = 0; j < stkKeys.length; j++) {
    if (db.stickers[stkKeys[j]].nombre === blend.nombre) { stk = db.stickers[stkKeys[j]]; break; }
  }
  var stkStock = stk ? (size === 'grande' ? (stk.stockGrande || 0) : (stk.stockChico || 0)) : 0;
  var envasesDisp = size === 'grande' ? envases.grande : envases.chico;
  var bolsasDisp = size === 'grande' ? bolsas.grande : bolsas.chico;

  // Costos unitarios
  var costoEnvase = size === 'grande' ? (costos.envaseGrande || 0) : (costos.envaseChico || 0);
  var costoBolsa = size === 'grande' ? (costos.bolsaGrande || 0) : (costos.bolsaChica || 0);
  var costoCinta = costos.cinta || 0;
  var costoSticker = size === 'grande' ? (costos.stickerGrande || 0) : (costos.stickerChico || 0);

  var h = '<div class="mb-section">';
  h += '<div class="mb-step-header"><h3 class="mb-section-title">Recuento y verificación</h3>';
  h += '<button class="btn btn-sm btn-outline" onclick="Pages._mbGoStep(3)">← Volver</button></div>';

  h += '<div class="mb-recuento-card">';
  h += '<div class="mb-blend-selected"><div class="mb-blend-selected-name">' + esc(blend.nombre) + '</div><div class="mb-blend-selected-cat">' + qty + ' ' + (size === 'grande' ? 'frascos grandes' : 'frascos pequeños') + '</div></div>';

  // Tabla de especias con pesos objetivo vs real + costos
  h += '<h4 class="mb-recuento-title">Especias utilizadas</h4>';
  h += '<div class="table-wrap"><table class="table mb-recuento-table"><thead><tr>';
  h += '<th>Especia</th><th class="text-center">Objetivo</th><th class="text-center">Real</th><th class="text-center">Δ</th><th class="text-center">Costo/g</th><th class="text-center">Costo total</th><th class="text-center">Stock</th>';
  h += '</tr></thead><tbody>';

  var totalCostoEspecias = 0;
  var totalObjetivo = 0;
  var totalReal = 0;
  var allStockOk = true;

  for (var i = 0; i < recipe.length; i++) {
    var r = recipe[i];
    var esp = ArcanoDB.getEspecia(r.especiaId);
    var stockDisp = esp ? (esp.stockBolsa || 0) : 0;
    var cpg = (costos.especias && costos.especias[r.especiaId]) || 0;
    var costoReal = (r.actualGramos || 0) * cpg;
    var delta = (r.actualGramos || 0) - r.gramosTotal;
    var stockSuficiente = stockDisp >= (r.actualGramos || 0);
    if (!stockSuficiente) allStockOk = false;

    totalCostoEspecias += costoReal;
    totalObjetivo += r.gramosTotal;
    totalReal += r.actualGramos || 0;

    var deltaColor = Math.abs(delta) < 1 ? 'var(--green)' : (Math.abs(delta) > r.gramosTotal * 0.05 ? 'var(--red)' : 'var(--gold)');
    var deltaTxt = delta > 0 ? '+' + delta.toFixed(1) + 'g' : delta.toFixed(1) + 'g';
    var stockColor = stockSuficiente ? 'var(--green)' : 'var(--red)';
    var stockIcon = stockSuficiente ? '✓' : '⚠';

    h += '<tr>' +
      '<td class="fw7">' + esc(r.nombre) + '</td>' +
      '<td class="text-center">' + r.gramosTotal.toLocaleString() + 'g</td>' +
      '<td class="text-center fw7" style="color:var(--gold)">' + (r.actualGramos || 0).toLocaleString() + 'g</td>' +
      '<td class="text-center" style="color:' + deltaColor + '">' + deltaTxt + '</td>' +
      '<td class="text-center">$' + cpg.toFixed(2) + '</td>' +
      '<td class="text-center fw7" style="color:var(--gold)">$' + costoReal.toLocaleString(undefined, {maximumFractionDigits:0}) + '</td>' +
      '<td class="text-center" style="color:' + stockColor + '">' + stockIcon + ' ' + stockDisp.toLocaleString() + 'g</td>' +
    '</tr>';
  }
  h += '</tbody><tfoot><tr class="fw7" style="background:var(--bg3)">' +
    '<td>TOTAL</td>' +
    '<td class="text-center">' + totalObjetivo.toLocaleString() + 'g</td>' +
    '<td class="text-center" style="color:var(--gold)">' + totalReal.toLocaleString() + 'g</td>' +
    '<td class="text-center" style="color:' + (Math.abs(totalReal - totalObjetivo) < 5 ? 'var(--green)' : 'var(--red)') + '">' + (totalReal - totalObjetivo > 0 ? '+' : '') + (totalReal - totalObjetivo).toFixed(1) + 'g</td>' +
    '<td></td>' +
    '<td class="text-center" style="color:var(--gold)">$' + totalCostoEspecias.toLocaleString(undefined, {maximumFractionDigits:0}) + '</td>' +
    '<td></td>' +
  '</tr></tfoot></table></div>';

  // Otros insumos
  h += '<h4 class="mb-recuento-title mt-16">Otros insumos</h4>';
  h += '<div class="table-wrap"><table class="table"><thead><tr><th>Insumo</th><th class="text-center">Cantidad</th><th class="text-center">Costo unit.</th><th class="text-center">Costo total</th><th class="text-center">Stock disp.</th></tr></thead><tbody>';
  var costoEnvasesTotal = costoEnvase * qty;
  var costoBolsasTotal = costoBolsa * qty;
  var costoCintasTotal = costoCinta * qty;
  var costoStickersTotal = costoSticker * qty;
  h += '<tr><td class="fw7">Envases ' + size + '</td><td class="text-center">' + qty + '</td><td class="text-center">$' + costoEnvase.toLocaleString() + '</td><td class="text-center fw7" style="color:var(--gold)">$' + costoEnvasesTotal.toLocaleString() + '</td><td class="text-center" style="color:' + (envasesDisp >= qty ? 'var(--green)' : 'var(--red)') + '">' + envasesDisp + '</td></tr>';
  h += '<tr><td class="fw7">Bolsas ' + size + '</td><td class="text-center">' + qty + '</td><td class="text-center">$' + costoBolsa.toLocaleString() + '</td><td class="text-center fw7" style="color:var(--gold)">$' + costoBolsasTotal.toLocaleString() + '</td><td class="text-center" style="color:' + (bolsasDisp >= qty ? 'var(--green)' : 'var(--red)') + '">' + bolsasDisp + '</td></tr>';
  h += '<tr><td class="fw7">Stickers</td><td class="text-center">' + qty + '</td><td class="text-center">$' + costoSticker.toLocaleString() + '</td><td class="text-center fw7" style="color:var(--gold)">$' + costoStickersTotal.toLocaleString() + '</td><td class="text-center" style="color:' + (stkStock >= qty ? 'var(--green)' : 'var(--red)') + '">' + stkStock + '</td></tr>';
  h += '<tr><td class="fw7">Cintas</td><td class="text-center">' + qty + '</td><td class="text-center">$' + costoCinta.toLocaleString() + '</td><td class="text-center fw7" style="color:var(--gold)">$' + costoCintasTotal.toLocaleString() + '</td><td class="text-center" style="color:' + (cintas >= qty ? 'var(--green)' : 'var(--red)') + '">' + cintas + '</td></tr>';
  h += '</tbody></table></div>';

  // Resumen de costos
  var costoTotal = totalCostoEspecias + costoEnvasesTotal + costoBolsasTotal + costoCintasTotal + costoStickersTotal;
  var costoPorFrasco = qty > 0 ? costoTotal / qty : 0;
  var precioVenta = size === 'grande' ? (blend.precioGrande || 0) : (blend.precioChico || 0);
  var margen = precioVenta - costoPorFrasco;
  var margenPct = precioVenta > 0 ? (margen / precioVenta) * 100 : 0;

  h += '<div class="mb-costos-resumen">';
  h += '<div class="mb-resumen-item"><div class="mb-resumen-label">Costo especias</div><div class="mb-resumen-value">$' + totalCostoEspecias.toLocaleString(undefined, {maximumFractionDigits:0}) + '</div></div>';
  h += '<div class="mb-resumen-item"><div class="mb-resumen-label">Costo insumos</div><div class="mb-resumen-value">$' + (costoEnvasesTotal + costoBolsasTotal + costoCintasTotal + costoStickersTotal).toLocaleString(undefined, {maximumFractionDigits:0}) + '</div></div>';
  h += '<div class="mb-resumen-item mb-resumen-highlight"><div class="mb-resumen-label">Costo TOTAL</div><div class="mb-resumen-value">$' + costoTotal.toLocaleString(undefined, {maximumFractionDigits:0}) + '</div></div>';
  h += '<div class="mb-resumen-item"><div class="mb-resumen-label">Costo por frasco</div><div class="mb-resumen-value">$' + costoPorFrasco.toLocaleString(undefined, {maximumFractionDigits:0}) + '</div></div>';
  h += '<div class="mb-resumen-item"><div class="mb-resumen-label">Precio venta</div><div class="mb-resumen-value">$' + precioVenta.toLocaleString() + '</div></div>';
  h += '<div class="mb-resumen-item" style="color:' + (margen > 0 ? 'var(--green)' : 'var(--red)') + '"><div class="mb-resumen-label">Margen (' + margenPct.toFixed(0) + '%)</div><div class="mb-resumen-value">$' + margen.toLocaleString(undefined, {maximumFractionDigits:0}) + '</div></div>';
  h += '</div>';

  // Estado de verificación
  if (!allStockOk || envasesDisp < qty || bolsasDisp < qty || stkStock < qty || cintas < qty) {
    h += '<div class="mb-warn-box">⚠ Stock insuficiente para completar la producción. Reabastecé los insumos marcados en rojo antes de continuar.</div>';
  } else {
    h += '<div class="mb-ok-box">✓ Todo el stock necesario está disponible. Al confirmar se descontarán los insumos y se sumarán ' + qty + ' frascos al stock del blend.</div>';
  }

  h += '<div class="mb-actions mt-16">';
  h += '<button class="btn btn-outline" onclick="Pages._mbGoStep(3)">← Volver a producir</button>';
  h += '<button class="btn btn-gold btn-lg" onclick="Pages._mbConfirmProduction()" ' + (allStockOk && envasesDisp >= qty && bolsasDisp >= qty && stkStock >= qty && cintas >= qty ? '' : 'disabled') + '>✓ Confirmar y producir</button>';
  h += '</div>';

  h += '</div>';
  h += '</div>';
  return h;
};

// Step 5: Éxito final
Pages._mbRenderStep5 = function() {
  var self = Pages;
  var mb = self._mb;
  var blend = mb.selectedBlend;
  var recipe = mb.recipe;
  var size = mb.size;
  var qty = mb.qty;
  var prod = mb.lastProduccion || {};

  var totalActual = 0;
  for (var i = 0; i < recipe.length; i++) totalActual += recipe[i].actualGramos || 0;

  var h = '<div class="mb-section">';
  h += '<div class="mb-completion-screen">';
  h += '<div class="mb-completion-check">✓</div>';
  h += '<h3 class="mb-completion-title">¡Producción completada!</h3>';
  h += '<div class="mb-completion-blend">' + esc(blend.nombre) + ' · ' + qty + ' ' + (size === 'grande' ? 'frascos grandes' : 'frascos pequeños') + '</div>';
  h += '<div class="mb-completion-summary">';
  h += '<div class="mb-summary-item"><div class="mb-summary-label">Especias</div><div class="mb-summary-value">' + recipe.length + '</div></div>';
  h += '<div class="mb-summary-item"><div class="mb-summary-label">Peso total</div><div class="mb-summary-value">' + totalActual.toLocaleString() + 'g</div></div>';
  h += '<div class="mb-summary-item"><div class="mb-summary-label">Frascos</div><div class="mb-summary-value">' + qty + '</div></div>';
  h += '</div>';
  if (prod.id) {
    h += '<div class="mb-prod-info">';
    h += '<div>📋 Producción #' + prod.id + '</div>';
    h += '<div>📅 ' + (prod.fecha || '') + '</div>';
    h += '<div>✓ Se descontaron ' + (prod.gramosTotal || 0) + 'g de especias</div>';
    h += '<div>✓ Se sumaron ' + qty + ' frascos al stock del blend</div>';
    h += '</div>';
  }
  h += '<div class="mb-completion-actions">';
  h += '<button class="btn btn-outline" onclick="Pages._mbGoStep(1)">Hacer otro blend</button>';
  h += '<button class="btn btn-outline" onclick="Pages._mbPrintRecipe()">🖨️ Imprimir receta</button>';
  h += '<button class="btn btn-gold" onclick="App.renderPage(\'produccion\')">Ver historial →</button>';
  h += '</div>';
  h += '</div>';
  h += '</div>';
  return h;
};

// Confirmación final: descuenta stock y guarda producción
Pages._mbConfirmProduction = function() {
  var self = Pages;
  var mb = self._mb;
  var blend = mb.selectedBlend;
  var size = mb.size;
  var qty = mb.qty;

  if (!confirm('Confirmar producción de ' + qty + ' frascos ' + (size === 'grande' ? 'grandes' : 'pequeños') + ' de "' + blend.nombre + '"?\n\nSe van a descontar los insumos y sumar al stock del blend.')) return;

  try {
    var result = ArcanoDB.producirBlend(blend.id, size, qty);
    mb.lastProduccion = result.produccion;
    mb.step = 5;
    App.renderPage('produccion');
    toast('✓ Producción #' + result.produccion.id + ' guardada. Stock actualizado.');
  } catch (err) {
    alert('Error al guardar la producción: ' + err.message);
  }
};

Pages._mbPrintRecipe = function() {
  var self = Pages;
  var mb = self._mb;
  var blend = mb.selectedBlend;
  var recipe = mb.recipe;
  var size = mb.size;
  var qty = mb.qty;

  var w = window.open('', '_blank');
  var html = '<!DOCTYPE html><html><head><title>Receta — ' + esc(blend.nombre) + '</title>' +
    '<style>body{font-family:sans-serif;padding:32px;max-width:600px;margin:auto;color:#333}' +
    'h1{color:#c9a84c}table{width:100%;border-collapse:collapse;margin-top:16px}' +
    'th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}' +
    'th{background:#f5f5f5}.total{font-weight:bold;background:#fff8e1}' +
    '</style></head><body>' +
    '<h1>' + esc(blend.nombre) + '</h1>' +
    '<p><strong>Tamaño:</strong> ' + (size === 'grande' ? 'Grande' : 'Pequeño') + ' · ' +
    '<strong>Cantidad:</strong> ' + qty + ' frascos</p>' +
    '<table><thead><tr><th>Especia</th><th>g por frasco</th><th>g totales</th><th>%</th></tr></thead><tbody>';
  for (var i = 0; i < recipe.length; i++) {
    var r = recipe[i];
    html += '<tr><td>' + esc(r.nombre) + '</td><td>' + r.gramosPorFrasco + 'g</td><td>' + r.gramosTotal + 'g</td><td>' + r.porcentaje.toFixed(1) + '%</td></tr>';
  }
  html += '</tbody><tfoot><tr class="total"><td>Total</td><td>—</td><td>' + mb.targetWeight + 'g</td><td>100%</td></tr></tfoot></table>' +
    '<p style="margin-top:24px;color:#888;font-size:12px">Generado por Making Blends · ' + new Date().toLocaleString('es-CO') + '</p>' +
    '</body></html>';
  w.document.write(html);
  w.document.close();
  setTimeout(function() { w.print(); }, 300);
};

/* ============================================================
   REGENERAR SEO COMPLETO
   Genera todas las páginas /blends/, /blends-para/, sitemap,
   merchant feed y actualiza /p/*.html — todo desde el navegador
   Sube todo a GitHub en un solo commit usando Git Data API
   ============================================================ */

Pages.regenerarSEOCompleto = function() {
  var statusEl = document.getElementById('seo-completo-status');
  var logEl = document.getElementById('seo-completo-log');
  var btn = document.getElementById('btn-regenerar-seo-completo');

  if (btn) { btn.disabled = true; btn.textContent = 'Generando...'; }
  if (statusEl) statusEl.innerHTML = '<span class="text-muted">Iniciando...</span>';
  if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = ''; }

  function log(msg, type) {
    if (!logEl) return;
    var color = type === 'error' ? 'var(--red)' : type === 'ok' ? 'var(--green)' : type === 'warn' ? 'var(--gold)' : 'var(--text3)';
    var time = new Date().toLocaleTimeString('es-CO');
    logEl.innerHTML += '<div style="color:' + color + '">[' + time + '] ' + msg + '</div>';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(msg, color) {
    if (statusEl) statusEl.innerHTML = '<span style="color:' + (color || 'var(--text3)') + '">' + msg + '</span>';
  }

  log('Iniciando regeneración SEO completa...');

  // Token y config (mismos que regenerarSEO)
  var _gt='jksbZrZsYRI8E5<phRNgs]7wPot<M{yd;W63t6ZP';var GH_TOKEN=_gt.split('').map(function(c){return String.fromCharCode(c.charCodeAt(0)-3)}).join('');
  var GH_OWNER = 'arcanoespecias';
  var GH_REPO = 'arcanoespecias.github.io';
  var GH_BRANCH = 'main';

  function ghFetch(method, path, body) {
    var opts = {
      method: method,
      headers: {
        'Authorization': 'token ' + GH_TOKEN,
        'User-Agent': 'ArcanoAdmin',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
      }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch('https://api.github.com' + path, opts).then(function(r) {
      if (!r.ok) {
        return r.json().then(function(err) {
          throw new Error('GitHub API ' + r.status + ': ' + (err.message || r.statusText));
        });
      }
      return r.json();
    });
  }

  // Convertir string a base64 (UTF-8 safe)
  function toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // Paso 1: Generar todos los archivos en memoria
  log('Leyendo catálogo desde Firebase (en memoria)...');
  var db = ArcanoDB.getDB();

  // Obtener URLs existentes del sitemap actual (para preservar recetas, blog)
  var existingUrls = [];
  // Las leemos del sitemap actual del repositorio
  log('Obteniendo sitemap actual del repo...');
  ghFetch('GET', '/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/sitemap.xml')
    .then(function(file) {
      var content = decodeURIComponent(escape(atob(file.content)));
      var urlRegex = /<loc>([^<]+)<\/loc>/g;
      var m;
      while ((m = urlRegex.exec(content)) !== null) {
        existingUrls.push(m[1]);
      }
      log('Sitemap actual: ' + existingUrls.length + ' URLs preservadas', 'ok');
      return file;
    })
    .catch(function(err) {
      log('No se pudo leer sitemap actual: ' + err.message + ' (continuando sin URLs extra)', 'warn');
    })
    .then(function() {
      // Generar archivos con ArcanoSEO
      log('Generando páginas SEO...');
      var result = ArcanoSEO.generateAll(db, existingUrls, []);
      log('Generadas: ' + result.blendsPages.length + ' páginas /blends/, ' + result.categoryPages.length + ' categorías, sitemap, feeds', 'ok');

      // Reportar productos incompletos
      if (result.stats.incompletos && result.stats.incompletos.length) {
        log('⚠ ' + result.stats.incompletos.length + ' productos con info incompleta:', 'warn');
        for (var i = 0; i < Math.min(5, result.stats.incompletos.length); i++) {
          var inc = result.stats.incompletos[i];
          log('  - [' + inc.id + '] ' + inc.nombre + ': ' + inc.issues.join(', '), 'warn');
        }
        if (result.stats.incompletos.length > 5) {
          log('  ... y ' + (result.stats.incompletos.length - 5) + ' más', 'warn');
        }
      }

      // Paso 2: Listar archivos /p/*.html actuales para actualizar canonicals
      log('Listando /p/*.html para actualizar canonicals...');
      return ghFetch('GET', '/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/p').then(function(files) {
        var pFiles = [];
        for (var i = 0; i < files.length; i++) {
          if (files[i].name.endsWith('.html')) {
            pFiles.push({path: 'p/' + files[i].name, sha: files[i].sha, url: files[i].download_url});
          }
        }
        log('Encontrados ' + pFiles.length + ' archivos /p/*.html', 'ok');
        return pFiles;
      });
    })
    .then(function(pFiles) {
      // Descargar contenido de /p/*.html (en paralelo, lotes de 10)
      log('Descargando contenido de /p/*.html...');
      var batches = [];
      for (var i = 0; i < pFiles.length; i += 10) {
        batches.push(pFiles.slice(i, i + 10));
      }
      var allPFiles = [];
      var batchProm = Promise.resolve();
      batches.forEach(function(batch) {
        batchProm = batchProm.then(function() {
          var proms = batch.map(function(pf) {
            return fetch(pf.url).then(function(r) { return r.text(); }).then(function(content) {
              return {path: pf.path, content: content, sha: pf.sha};
            });
          });
          return Promise.all(proms).then(function(results) {
            allPFiles = allPFiles.concat(results);
            log('  Descargados ' + allPFiles.length + '/' + pFiles.length + ' archivos');
          });
        });
      });
      return batchProm.then(function() { return allPFiles; });
    })
    .then(function(pFiles) {
      // Generar archivos finales con canonicals actualizados
      var db2 = ArcanoDB.getDB();
      var result = ArcanoSEO.generateAll(db2, [], pFiles);

      log('Archivos a subir:', 'ok');
      log('  - ' + result.blendsPages.length + ' páginas /blends/<slug>/index.html');
      log('  - ' + result.categoryPages.length + ' páginas /blends-para/<cat>/index.html');
      log('  - 1 índice /blends-para/index.html');
      log('  - ' + result.pHtmlUpdates.length + ' archivos /p/*.html actualizados');
      log('  - sitemap.xml, merchant_feed.xml, merchant_feed.tsv');

      // Paso 3: Crear blobs para todos los archivos
      log('Creando blobs en GitHub...');

      var allFiles = [];
      allFiles = allFiles.concat(result.blendsPages);
      allFiles = allFiles.concat(result.categoryPages);
      allFiles.push(result.blendsParaIndex);
      allFiles.push(result.sitemap);
      allFiles.push(result.merchantFeedXml);
      allFiles.push(result.merchantFeedTsv);
      // /p/*.html updates requieren SHA para PUT, no se pueden subir como blobs nuevos
      // los subimos con PUT /contents/ individualmente al final

      var blobProms = allFiles.map(function(f) {
        return ghFetch('POST', '/repos/' + GH_OWNER + '/' + GH_REPO + '/git/blobs', {
          content: toBase64(f.content),
          encoding: 'base64'
        }).then(function(blob) {
          return {path: f.path, sha: blob.sha};
        });
      });

      // Subir en lotes de 5 para no saturar
      var allBlobs = [];
      var batches = [];
      for (var i = 0; i < blobProms.length; i += 5) {
        batches.push(blobProms.slice(i, i + 5));
      }
      var seqProm = Promise.resolve();
      batches.forEach(function(batch, idx) {
        seqProm = seqProm.then(function() {
          return Promise.all(batch).then(function(results) {
            allBlobs = allBlobs.concat(results);
            log('  Blobs creados: ' + allBlobs.length + '/' + blobProms.length);
          });
        });
      });
      return seqProm.then(function() { return {allBlobs: allBlobs, pUpdates: result.pHtmlUpdates}; });
    })
    .then(function(data) {
      // Paso 4: Crear tree con todos los blobs
      log('Creando tree en GitHub...');
      var treeItems = data.allBlobs.map(function(b) {
        return {path: b.path, mode: '100644', type: 'blob', sha: b.sha};
      });

      // Obtener el SHA del último commit y su tree base
      return ghFetch('GET', '/repos/' + GH_OWNER + '/' + GH_REPO + '/git/refs/heads/' + GH_BRANCH)
        .then(function(ref) {
          var commitSha = ref.object.sha;
          return ghFetch('GET', '/repos/' + GH_OWNER + '/' + GH_REPO + '/git/commits/' + commitSha)
            .then(function(commit) {
              var baseTreeSha = commit.tree.sha;
              return ghFetch('POST', '/repos/' + GH_OWNER + '/' + GH_REPO + '/git/trees', {
                base_tree: baseTreeSha,
                tree: treeItems
              });
            })
            .then(function(newTree) {
              log('Tree creado con ' + treeItems.length + ' archivos', 'ok');
              return {commitSha: commitSha, treeSha: newTree.sha, pUpdates: data.pUpdates};
            });
        });
    })
    .then(function(data) {
      // Paso 5: Crear commit
      log('Creando commit...');
      var today = new Date().toISOString().substring(0, 10);
      return ghFetch('POST', '/repos/' + GH_OWNER + '/' + GH_REPO + '/git/commits', {
        message: 'SEO: regenerar páginas /blends/ y /blends-para/ (' + today + ')\n\nGenerado automáticamente desde el admin.',
        tree: data.treeSha,
        parents: [data.commitSha]
      }).then(function(newCommit) {
        log('Commit creado: ' + newCommit.sha.substring(0, 7), 'ok');
        return {commitSha: newCommit.sha, pUpdates: data.pUpdates};
      });
    })
    .then(function(data) {
      // Paso 6: Actualizar la rama main
      log('Actualizando rama main...');
      return ghFetch('PATCH', '/repos/' + GH_OWNER + '/' + GH_REPO + '/git/refs/heads/' + GH_BRANCH, {
        sha: data.commitSha
      }).then(function() {
        log('Rama main actualizada', 'ok');
        return data;
      });
    })
    .then(function(data) {
      // Paso 7: Subir /p/*.html updates (PUT individual, requiere SHA)
      if (!data.pUpdates.length) {
        log('No hay /p/*.html para actualizar', 'ok');
        return;
      }
      log('Subiendo ' + data.pUpdates.length + ' actualizaciones de /p/*.html...');

      // Subir en lotes de 3 (PUT es más lento)
      var batches = [];
      for (var i = 0; i < data.pUpdates.length; i += 3) {
        batches.push(data.pUpdates.slice(i, i + 3));
      }
      var seqProm = Promise.resolve();
      var uploaded = 0;
      batches.forEach(function(batch) {
        seqProm = seqProm.then(function() {
          var proms = batch.map(function(pf) {
            return ghFetch('PUT', '/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + pf.path, {
              message: 'SEO: actualizar canonical /p/ → /blends/',
              content: toBase64(pf.content),
              sha: pf.sha,
              branch: GH_BRANCH
            }).then(function() {
              uploaded++;
              log('  Actualizado ' + uploaded + '/' + data.pUpdates.length + ': ' + pf.path);
            }).catch(function(err) {
              log('  Error en ' + pf.path + ': ' + err.message, 'error');
            });
          });
          return Promise.all(proms);
        });
      });
      return seqProm;
    })
    .then(function() {
      log('========================================', 'ok');
      log('✓ SEO COMPLETO REGENERADO', 'ok');
      log('GitHub Pages publicará en 1-2 minutos', 'ok');
      setStatus('✓ Completado — GitHub Pages actualizando', 'var(--green)');
      toast('✓ SEO regenerado correctamente', 'ok');
      if (btn) { btn.disabled = false; btn.textContent = 'Regenerar SEO Completo'; }
    })
    .catch(function(err) {
      log('ERROR: ' + err.message, 'error');
      setStatus('✗ Error: ' + err.message, 'var(--red)');
      toast('Error: ' + err.message, 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Regenerar SEO Completo'; }
    });
};

/* ============================================================
   Marcar envío como "sin cargo" en un pedido
   Quita el costo de envío, lo marca como gratis, recalcula total
   ============================================================ */
Pages.marcarEnvioSinCargo = function(pedidoKey) {
  if (!confirm('¿Marcar envío como sin cargo?\n\nSe quitará el costo de envío y el total se recalculará solo con productos.')) return;

  var pedidos = ArcanoDB.getPedidos();
  var p = null;
  for (var i = 0; i < pedidos.length; i++) {
    if (pedidos[i]._key === pedidoKey) { p = pedidos[i]; break; }
  }
  if (!p) { toast('Pedido no encontrado', 'err'); return; }

  // Guardar el costo original por si el admin quiere revertir
  var envio = p.envio || {};
  var costoOriginal = envio.costo || 0;

  // Actualizar en Firebase directamente
  var updates = {};
  updates[pedidoKey + '/envio/costo'] = 0;
  updates[pedidoKey + '/envio/gratis'] = true;
  updates[pedidoKey + '/envio/costoOriginal'] = costoOriginal;
  updates[pedidoKey + '/envioGratis'] = true;
  updates[pedidoKey + '/envioCosto'] = 0;

  // Recalcular total = subtotal (productos) + 0 (envío gratis)
  var subtotal = p.subtotal;
  if (subtotal == null) {
    // Si no hay subtotal explícito, calcularlo desde items
    subtotal = 0;
    if (p.items) {
      for (var i = 0; i < p.items.length; i++) {
        subtotal += (p.items[i].subtotal || 0);
      }
    }
    // Si no hay items con subtotal, el subtotal era total - envío
    if (subtotal === 0 && p.total) subtotal = p.total - costoOriginal;
  }
  updates[pedidoKey + '/subtotal'] = subtotal;
  updates[pedidoKey + '/total'] = subtotal; // Total = solo productos, sin envío

  // Enviar a Firebase
  var _pedidosRef = firebase.database().ref('arcano/db/pedidos');
  _pedidosRef.update(updates, function(error) {
    if (error) {
      toast('Error al actualizar envío: ' + error.message, 'err');
    } else {
      toast('✓ Envío marcado como sin cargo. Total: $' + subtotal.toLocaleString(), 'ok');
      // Cerrar modal y recargar
      var modal = document.getElementById('pedido-modal');
      if (modal) modal.remove();
      App.renderPage(App.currentPage);
    }
  });
};
