/* ===================== PUNTOS DE VENTA — UI ===================== */

var PDV = {
  currentPDV: null,
  currentView: 'list', // list | stock | ventas | stats | pos

  render(container) {
    var hash = window.location.hash || '';
    var m = hash.match(/pdv=(\d+)/);
    if (m) {
      var pdv = ArcanoDB.getPuntoDeVenta(Number(m[1]));
      if (pdv) {
        this.currentPDV = pdv;
        var view = hash.match(/view=(\w+)/);
        this.currentView = view ? view[1] : 'stock';
        this['render' + this.currentView.charAt(0).toUpperCase() + this.currentView.slice(1)](container);
        return;
      }
    }
    // Check for POS mode (sales interface via QR)
    var posMatch = hash.match(/pos=(\d+)/);
    if (posMatch) {
      this.currentPDV = ArcanoDB.getPuntoDeVenta(Number(posMatch[1]));
      if (this.currentPDV) {
        this.currentView = 'pos';
        this.renderPos(container);
        return;
      }
    }
    this.currentPDV = null;
    this.currentView = 'list';
    this.renderList(container);
  },

  hash(pdvId, view) {
    if (!pdvId) return '#';
    return '#pdv=' + pdvId + (view ? '&view=' + view : '');
  },

  go(pdvId, view) {
    window.location.hash = this.hash(pdvId, view);
    this.render(document.getElementById('page-content'));
  },

  /* ==================== LISTADO ==================== */
  renderList(container) {
    var pdvs = ArcanoDB.getPuntosDeVenta();
    var h = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div><h3 style="margin:0">Puntos de Venta</h3>' +
      '<p class="text-muted text-sm" style="margin:4px 0 0">Gestiona puntos de venta, stock y ventas por ubicacion</p></div>' +
      '<button class="btn btn-gold" onclick="PDV.formCrear()">+ Punto de Venta</button>' +
      '</div>';
    h += '<div style="border-bottom:2px solid var(--border);margin:12px 0 16px"></div>';
    if (pdvs.length === 0) {
      h += '<div class="card"><div class="card-body text-center text-muted" style="padding:40px">' +
        '<p style="font-size:48px;margin-bottom:12px">🏪</p>' +
        '<p>No hay puntos de venta creados</p>' +
        '<p class="text-sm">Crea un punto de venta para empezar a gestionar stock y ventas por ubicacion</p></div></div>';
    } else {
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">';
      for (var i = 0; i < pdvs.length; i++) {
        var p = pdvs[i];
        var stats = ArcanoDB.getPDVStats(p.id);
        var stockCount = stats.totalItemsEnStock;
        var stockItems = stats.productosEnStock;
        h += '<div class="card" style="cursor:pointer" onclick="PDV.go(' + p.id + ',\'stock\')">' +
          '<div class="card-body">' +
          '<div style="display:flex;justify-content:space-between;align-items:start">' +
          '<div><h4 style="margin:0 0 4px">' + this.esc(p.nombre) + '</h4>' +
          '<p class="text-muted text-sm">' + this.esc(p.ubicacion || 'Sin ubicacion') + '</p></div>' +
          '<span class="badge ' + (p.activo !== false ? 'badge-green' : 'badge-red') + '">' + (p.activo !== false ? 'Activo' : 'Inactivo') + '</span>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px">' +
          '<div class="text-center"><div class="fw7" style="font-size:1.2em">' + stockItems + '</div><div class="text-muted text-sm">Productos</div></div>' +
          '<div class="text-center"><div class="fw7" style="font-size:1.2em">' + stockCount + '</div><div class="text-muted text-sm">Unidades</div></div>' +
          '<div class="text-center"><div class="fw7" style="font-size:1.2em">$' + (stats.totalIngresos || 0).toLocaleString() + '</div><div class="text-muted text-sm">Ventas</div></div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:12px">' +
          '<button class="btn btn-sm btn-outline" style="flex:1" onclick="event.stopPropagation();PDV.go(' + p.id + ',\'stock\')">Stock</button>' +
          '<button class="btn btn-sm btn-outline" style="flex:1" onclick="event.stopPropagation();PDV.go(' + p.id + ',\'ventas\')">Ventas</button>' +
          '<button class="btn btn-sm btn-outline" style="flex:1" onclick="event.stopPropagation();PDV.go(' + p.id + ',\'gastos\')">Gastos</button>' +
          '<button class="btn btn-sm btn-outline" style="flex:1" onclick="event.stopPropagation();PDV.go(' + p.id + ',\'stats\')">Stats</button>' +
          '<button class="btn btn-sm btn-gold" onclick="event.stopPropagation();PDV.showQR(' + p.id + ')" title="Generar QR de ventas">QR</button>' +
          '</div></div></div>';
      }
      h += '</div>';
    }
    container.innerHTML = h;
  },

  /* ==================== CREAR/EDITAR PDV ==================== */
  formCrear() {
    var h = '<div class="form-group"><label>Nombre</label>' +
      '<input type="text" class="input" id="pdv-nombre" placeholder="Ej: Feria 1, Ciudad xyz"></div>' +
      '<div class="form-group"><label>Ubicacion</label>' +
      '<input type="text" class="input" id="pdv-ubicacion" placeholder="Ej: Centro, Plaza principal"></div>' +
      '<div class="form-group"><label><input type="checkbox" id="pdv-activo" checked> Activo</label></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn btn-outline" onclick="PDV.render(document.getElementById(\'page-content\'))">Cancelar</button>' +
      '<button class="btn btn-gold" onclick="PDV.doGuardar()">Guardar</button></div>';
    openModal('Nuevo Punto de Venta', h);
    setTimeout(function() { var el = document.getElementById('pdv-nombre'); if (el) el.focus(); }, 100);
  },

  formEditar(id) {
    var p = ArcanoDB.getPuntoDeVenta(id);
    if (!p) return;
    var h = '<div class="form-group"><label>Nombre</label>' +
      '<input type="text" class="input" id="pdv-nombre" value="' + this.esc(p.nombre) + '"></div>' +
      '<div class="form-group"><label>Ubicacion</label>' +
      '<input type="text" class="input" id="pdv-ubicacion" value="' + this.esc(p.ubicacion || '') + '"></div>' +
      '<div class="form-group"><label><input type="checkbox" id="pdv-activo" ' + (p.activo !== false ? 'checked' : '') + '> Activo</label></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
      '<button class="btn btn-gold" onclick="PDV.doGuardar(' + id + ')">Guardar</button></div>';
    openModal('Editar Punto de Venta', h);
  },

  doGuardar(id) {
    var nombre = (document.getElementById('pdv-nombre').value || '').trim();
    var ubicacion = (document.getElementById('pdv-ubicacion').value || '').trim();
    var activo = document.getElementById('pdv-activo').checked;
    if (!nombre) { toast('Ingresa un nombre', 'err'); return; }
    var data = { nombre: nombre, ubicacion: ubicacion, activo: activo };
    if (id) data.id = id;
    try {
      var saved = ArcanoDB.savePuntoDeVenta(data);
      closeModal();
      toast('Punto de venta guardado');
      if (id && this.currentPDV) {
        this.currentPDV = saved;
        this.render(document.getElementById('page-content'));
      } else {
        this.render(document.getElementById('page-content'));
      }
    } catch (e) { toast(e.message, 'err'); }
  },

  doEliminar(id) {
    var p = ArcanoDB.getPuntoDeVenta(id);
    if (!p) return;
    if (!confirm('Eliminar "' + p.nombre + '"?\n\nEl stock sera devuelto al inventario principal.')) return;
    try {
      ArcanoDB.deletePuntoDeVenta(id);
      toast('Punto de venta eliminado');
      window.location.hash = '#';
      this.render(document.getElementById('page-content'));
    } catch (e) { toast(e.message, 'err'); }
  },

  /* ==================== STOCK ==================== */
  renderStock(container) {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var h = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost" onclick="PDV.go(null)">← Puntos de Venta</button>' +
      '<h3 style="margin:0">' + this.esc(pdv.nombre) + '</h3>' +
      '<span class="badge badge-blue">Stock</span></div>';
    h += '<p class="text-muted text-sm" style="margin:4px 0 0">' + this.esc(pdv.ubicacion || '') + '</p>';
    h += '<div style="display:flex;gap:6px;margin:12px 0;flex-wrap:wrap">' +
      '<button class="btn btn-gold" onclick="PDV.formMoverStock()">Mover Stock al PDV</button>' +
      '<button class="btn btn-green" onclick="PDV.go(' + pdv.id + ',\'pos\')">Nueva Venta</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'stats\')">Stats</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'gastos\')">Gastos</button>' +
      '<button class="btn btn-outline" onclick="PDV.formDevolverStock()">Devolver Stock</button>' +
      '<button class="btn btn-outline" onclick="PDV.formEditar(' + pdv.id + ')">Editar</button>' +
      '<button class="btn btn-red" onclick="PDV.doEliminar(' + pdv.id + ')">Eliminar</button>' +
      '</div>';
    h += '<div style="border-bottom:2px solid var(--border);margin:0 0 16px"></div>';
    // Stock table
    var stock = pdv.stock || {};
    var keys = Object.keys(stock).filter(function(k) { return stock[k] > 0; });
    if (keys.length === 0) {
      h += '<div class="card"><div class="card-body text-center text-muted" style="padding:32px">' +
        '<p>Sin stock en este punto de venta</p>' +
        '<p class="text-sm">Usa "Mover Stock al PDV" para enviar productos</p></div></div>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>Producto</th><th>Tipo</th><th>Talla</th><th>Cantidad</th></tr></thead><tbody>';
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var parts = k.split('_');
        var tipo = parts[0];
        var prodId = Number(parts[1]);
        var talla = parts[2];
        var producto;
        if (tipo === 'pack') { producto = (ArcanoDB.getPacks ? ArcanoDB.getPacks() : []).find(function(x){return x.id===prodId;}); }
        else { producto = tipo === 'especia' ? ArcanoDB.getEspecia(prodId) : ArcanoDB.getBlend(prodId); }
        var nombre = producto ? producto.nombre : '?';
        var badgeClass = tipo === 'pack' ? 'badge-green' : (tipo === 'especia' ? 'badge-gold' : 'badge-blue');
        h += '<tr><td class="fw7">' + this.esc(nombre) + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' + tipo + '</span></td>' +
          '<td>' + (talla === '-' ? 'Pack' : talla) + '</td>' +
          '<td class="fw7">' + stock[k] + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }

    // === Costales en el PDV ===
    var stockCostales = pdv.stockCostales || {};
    var costalesKeys = Object.keys(stockCostales).filter(function(k) { return (stockCostales[k] || 0) > 0; });
    h += '<div style="border-top:2px solid var(--border);margin:20px 0 12px"></div>';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
      '<h4 style="margin:0">🛍️ Costales en el PDV</h4>' +
      '<button class="btn btn-gold btn-sm" onclick="PDV.formMoverCostales()">Mover Costales al PDV</button>' +
      '<button class="btn btn-green btn-sm" onclick="PDV.go(' + pdv.id + ',\'pos\')">Vender Palas</button>' +
    '</div>';
    if (costalesKeys.length === 0) {
      h += '<div class="card"><div class="card-body text-center text-muted" style="padding:16px">' +
        '<p>Sin costales en este punto de venta</p>' +
        '<p class="text-sm">Usa "Mover Costales al PDV" para enviar gramos de costales</p></div></div>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>Costal</th><th>Especias</th><th>Gramos en PDV</th><th>Precio/Pala</th><th>g/Pala</th><th>Palas disp.</th></tr></thead><tbody>';
      for (var ci = 0; ci < costalesKeys.length; ci++) {
        var costalKey = costalesKeys[ci];
        var costalObj = ArcanoDB.getCostal(parseInt(costalKey, 10));
        if (!costalObj) continue;
        var gramosPDV = stockCostales[costalKey] || 0;
        var palasDisp = costalObj.gramosPorPala > 0 ? Math.floor(gramosPDV / costalObj.gramosPorPala) : 0;
        var especiasCostal = '';
        if (costalObj.items) {
          var nombres = [];
          for (var ei = 0; ei < costalObj.items.length; ei++) {
            nombres.push(costalObj.items[ei].especiaNombre);
          }
          especiasCostal = nombres.join(', ');
        }
        h += '<tr>' +
          '<td class="fw7">' + this.esc(costalObj.nombre || 'Costal ' + costalObj.id) + '</td>' +
          '<td class="text-sm">' + this.esc(especiasCostal) + '</td>' +
          '<td class="fw7 text-gold">' + gramosPDV + 'g</td>' +
          '<td>$' + (costalObj.precioPala || 0).toLocaleString() + '</td>' +
          '<td>' + (costalObj.gramosPorPala || 50) + 'g</td>' +
          '<td class="fw7 text-green">' + palasDisp + '</td>' +
        '</tr>';
      }
      h += '</tbody></table></div>';
    }

    container.innerHTML = h;
  },

  formMoverCostales() {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var costales = ArcanoDB.getCostales().filter(function(c) {
      return c.estado !== 'vacio' && (c.gramosRestantes || 0) > 0;
    });
    if (costales.length === 0) {
      alert('No hay costales disponibles con stock. Creá costales primero en la sección Costales.');
      return;
    }
    var h = '<p class="text-muted text-sm" style="margin-bottom:12px">Transfiere gramos de costales al PDV <strong>' + this.esc(pdv.nombre) + '</strong></p>';
    h += '<div id="pdv-costales-items">';
    for (var i = 0; i < costales.length; i++) {
      var c = costales[i];
      h += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0;padding:8px;background:var(--bg);border-radius:8px">' +
        '<div style="flex:1">' +
          '<div class="fw7" style="font-size:0.9em">' + this.esc(c.nombre) + '</div>' +
          '<div class="text-muted text-sm">Disp: ' + (c.gramosRestantes || 0) + 'g · $' + (c.precioPala || 0) + '/pala · ' + (c.gramosPorPala || 50) + 'g/pala</div>' +
        '</div>' +
        '<input type="number" class="input" style="width:80px" min="0" max="' + (c.gramosRestantes || 0) + '" placeholder="0" data-costal-id="' + c.id + '" data-costal-nombre="' + this.esc(c.nombre) + '">' +
        '<span class="text-muted text-sm">gramos</span>' +
      '</div>';
    }
    h += '</div>';
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
      '<button class="btn btn-gold" onclick="PDV.doMoverCostales()">Transferir</button></div>';
    openModal('Mover Costales al PDV', h);
  },

  doMoverCostales() {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var inputs = document.querySelectorAll('#pdv-costales-items input[data-costal-id]');
    var movidos = 0;
    for (var i = 0; i < inputs.length; i++) {
      var gramos = parseInt(inputs[i].value, 10) || 0;
      if (gramos <= 0) continue;
      var costalId = parseInt(inputs[i].dataset.costalId, 10);
      try {
        ArcanoDB.moverCostalAPDV(pdv.id, costalId, gramos);
        movidos += gramos;
      } catch (e) {
        toast('Error: ' + e.message, 'err');
      }
    }
    closeModal();
    if (movidos > 0) {
      toast(movidos + 'g de costales transferidos');
      this.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
      this.renderStock(document.getElementById('page-content'));
    } else {
      toast('No se transfirió nada', 'err');
    }
  },

  formMoverStock() {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var h = '<p class="text-muted text-sm" style="margin-bottom:12px">Selecciona productos y cantidades para mover al PDV <strong>' + this.esc(pdv.nombre) + '</strong></p>';
    h += '<div id="pdv-stock-items">';
    // Especias
    if (especias.length > 0) {
      h += '<p class="fw7" style="margin:8px 0 4px">Especias</p>';
      for (var i = 0; i < especias.length; i++) {
        var e = especias[i];
        if ((e.stockChico || 0) === 0 && (e.stockGrande || 0) === 0) continue;
        h += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">' +
          '<span style="flex:1;font-size:0.85em">' + this.esc(e.nombre) + '</span>' +
          '<span class="text-muted text-sm">Ch:' + (e.stockChico || 0) + '</span>' +
          '<input type="number" class="input" style="width:60px" min="0" max="' + (e.stockChico || 0) + '" placeholder="0" data-tipo="especia" data-id="' + e.id + '" data-talla="chico">' +
          '<span class="text-muted text-sm">Gr:' + (e.stockGrande || 0) + '</span>' +
          '<input type="number" class="input" style="width:60px" min="0" max="' + (e.stockGrande || 0) + '" placeholder="0" data-tipo="especia" data-id="' + e.id + '" data-talla="grande"></div>';
      }
    }
    // Blends
    if (blends.length > 0) {
      h += '<p class="fw7" style="margin:12px 0 4px">Blends</p>';
      for (var j = 0; j < blends.length; j++) {
        var b = blends[j];
        if ((b.stockChico || 0) === 0 && (b.stockGrande || 0) === 0) continue;
        h += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">' +
          '<span style="flex:1;font-size:0.85em">' + this.esc(b.nombre) + '</span>' +
          '<span class="text-muted text-sm">Ch:' + (b.stockChico || 0) + '</span>' +
          '<input type="number" class="input" style="width:60px" min="0" max="' + (b.stockChico || 0) + '" placeholder="0" data-tipo="blend" data-id="' + b.id + '" data-talla="chico">' +
          '<span class="text-muted text-sm">Gr:' + (b.stockGrande || 0) + '</span>' +
          '<input type="number" class="input" style="width:60px" min="0" max="' + (b.stockGrande || 0) + '" placeholder="0" data-tipo="blend" data-id="' + b.id + '" data-talla="grande"></div>';
      }
    }
    // Packs
    var packs = ArcanoDB.getPacks ? ArcanoDB.getPacks() : [];
    if (packs.length > 0) {
      h += '<p class="fw7" style="margin:12px 0 4px">Packs</p>';
      for (var pk = 0; pk < packs.length; pk++) {
        var p = packs[pk];
        var pStk = p.stock || 0;
        if (pStk <= 0) continue;
        h += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">' +
          '<span style="flex:1;font-size:0.85em">' + this.esc(p.nombre) + '</span>' +
          '<span class="text-muted text-sm">Stock:' + pStk + '</span>' +
          '<input type="number" class="input" style="width:60px" min="0" max="' + pStk + '" placeholder="0" data-tipo="pack" data-id="' + p.id + '" data-talla="-"></div>';
      }
    }
    h += '</div>';
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
      '<button class="btn btn-gold" onclick="PDV.doMoverStock()">Mover Stock</button></div>';
    openModal('Mover Stock a ' + pdv.nombre, h);
  },

  doMoverStock() {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var inputs = document.querySelectorAll('#pdv-stock-items input[type=number]');
    var items = [];
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var cant = Number(inp.value) || 0;
      if (cant <= 0) continue;
      items.push({ tipo: inp.dataset.tipo, productoId: Number(inp.dataset.id), talla: inp.dataset.talla, cantidad: cant });
    }
    if (items.length === 0) { toast('Selecciona al menos un producto', 'err'); return; }
    try {
      ArcanoDB.moverStockAPDV(pdv.id, items);
      closeModal();
      toast('Stock movido correctamente');
      this.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
      this.render(document.getElementById('page-content'));
    } catch (e) { toast(e.message, 'err'); }
  },

  formDevolverStock() {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var stock = pdv.stock || {};
    var stockCostales = pdv.stockCostales || {};
    var keys = Object.keys(stock).filter(function(k) { return stock[k] > 0; });
    var costalKeys = Object.keys(stockCostales).filter(function(k) { return (stockCostales[k] || 0) > 0; });
    if (keys.length === 0 && costalKeys.length === 0) { toast('No hay stock para devolver', 'err'); return; }
    var h = '<p class="text-muted text-sm" style="margin-bottom:12px">Selecciona cantidades a devolver al inventario principal</p>';
    h += '<div id="pdv-devolver-items">';
    // Frascos
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var parts = k.split('_');
      var tipo = parts[0], prodId = Number(parts[1]), talla = parts[2];
      var producto;
      if (tipo === 'pack') { producto = (ArcanoDB.getPacks ? ArcanoDB.getPacks() : []).find(function(x){return x.id===prodId;}); }
      else { producto = tipo === 'especia' ? ArcanoDB.getEspecia(prodId) : ArcanoDB.getBlend(prodId); }
      var nombre = producto ? producto.nombre : '?';
      h += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">' +
        '<span style="flex:1;font-size:0.85em">' + this.esc(nombre) + ' (' + (talla === '-' ? 'Pack' : talla) + ')</span>' +
        '<span class="text-muted text-sm">En PDV: ' + stock[k] + '</span>' +
        '<input type="number" class="input" style="width:70px" min="0" max="' + stock[k] + '" placeholder="0" data-key="' + k + '" data-tipo="' + tipo + '" data-id="' + prodId + '" data-talla="' + talla + '"></div>';
    }
    // Costales
    if (costalKeys.length > 0) {
      h += '<div style="border-top:1px solid var(--border);margin:8px 0;padding-top:8px"></div>';
      h += '<p class="fw7" style="margin:0 0 4px;font-size:0.85em">🛍️ Costales</p>';
      for (var ci = 0; ci < costalKeys.length; ci++) {
        var costalKey = costalKeys[ci];
        var costalObj = ArcanoDB.getCostal(parseInt(costalKey, 10));
        if (!costalObj) continue;
        var gramosPDV = stockCostales[costalKey] || 0;
        h += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">' +
          '<span style="flex:1;font-size:0.85em">' + this.esc(costalObj.nombre || 'Costal') + '</span>' +
          '<span class="text-muted text-sm">En PDV: ' + gramosPDV + 'g</span>' +
          '<input type="number" class="input" style="width:70px" min="0" max="' + gramosPDV + '" placeholder="0" data-costal="true" data-costal-id="' + costalKey + '"></div>';
      }
    }
    h += '</div>';
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
      '<button class="btn btn-gold" onclick="PDV.doDevolverStock()">Devolver</button></div>';
    openModal('Devolver Stock de ' + pdv.nombre, h);
  },

  doDevolverStock() {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var inputs = document.querySelectorAll('#pdv-devolver-items input[type=number]');
    var frascoItems = [];
    var costalItems = [];
    for (var i = 0; i < inputs.length; i++) {
      var val = Number(inputs[i].value) || 0;
      if (val <= 0) continue;
      if (inputs[i].dataset.costal === 'true') {
        costalItems.push({ costalId: parseInt(inputs[i].dataset.costalId, 10), gramos: val });
      } else {
        frascoItems.push({ tipo: inputs[i].dataset.tipo, productoId: Number(inputs[i].dataset.id), talla: inputs[i].dataset.talla, cantidad: val });
      }
    }
    if (frascoItems.length === 0 && costalItems.length === 0) { toast('Selecciona al menos un producto', 'err'); return; }
    try {
      if (frascoItems.length > 0) {
        ArcanoDB.devolverStockDePDV(pdv.id, frascoItems);
      }
      for (var ci = 0; ci < costalItems.length; ci++) {
        ArcanoDB.devolverCostalDePDV(pdv.id, costalItems[ci].costalId, costalItems[ci].gramos);
      }
      closeModal();
      toast('Stock devuelto al inventario principal');
      this.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
      this.render(document.getElementById('page-content'));
    } catch (e) { toast(e.message, 'err'); }
  },

  /* ==================== VENTAS DEL PDV ==================== */
  renderVentas(container) {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var ventas = ArcanoDB.getPDVVentas(pdv.id);
    var stats = ArcanoDB.getPDVStats(pdv.id);
    var h = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost" onclick="PDV.go(null)">← Puntos de Venta</button>' +
      '<h3 style="margin:0">' + this.esc(pdv.nombre) + '</h3>' +
      '<span class="badge badge-green">Ventas</span></div>';
    h += '<div style="display:flex;gap:6px;margin:12px 0;flex-wrap:wrap">' +
      '<button class="btn btn-gold" onclick="PDV.go(' + pdv.id + ',\'pos\')">Nueva Venta</button>' +
      '<button class="btn btn-outline" onclick="PDV.showQR(' + pdv.id + ')">Mostrar QR</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'stock\')">Stock</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'gastos\')">Gastos</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'stats\')">Stats</button>' +
      '</div>';
    h += '<div style="border-bottom:2px solid var(--border);margin:0 0 16px"></div>';
    // Summary cards
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px">' +
      '<div class="card"><div class="card-body text-center"><div class="fw7" style="font-size:1.3em">' + stats.totalVentas + '</div><div class="text-muted text-sm">Ventas</div></div></div>' +
      '<div class="card"><div class="card-body text-center"><div class="fw7" style="font-size:1.3em">$' + stats.totalIngresos.toLocaleString() + '</div><div class="text-muted text-sm">Ingresos</div></div></div>' +
      '<div class="card"><div class="card-body text-center"><div class="fw7" style="font-size:1.3em">$' + Math.round(stats.ticketPromedio).toLocaleString() + '</div><div class="text-muted text-sm">Ticket Prom.</div></div></div>' +
      '</div>';
    if (ventas.length === 0) {
      h += '<div class="card"><div class="card-body text-center text-muted" style="padding:32px">Sin ventas registradas</div></div>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Items</th><th>Metodo</th><th>Total</th><th>Detalle</th></tr></thead><tbody>';
      for (var i = 0; i < ventas.length; i++) {
        var v = ventas[i];
        var itemsStr = (v.items || []).map(function(it) { return it.productoNombre + ' x' + it.cantidad; }).join(', ');
        var metodoTag = v.metodoPago === 'qr' ? '<span style="color:var(--blue);font-size:0.75rem;font-weight:600">QR</span>' : '<span style="color:var(--green);font-size:0.75rem;font-weight:600">Efectivo</span>';
        h += '<tr><td>' + (v.fecha || '').slice(0, 10) + '</td><td>' + itemsStr + '</td>' +
          '<td>' + metodoTag + '</td>' +
          '<td class="fw7">$' + (v.total || 0).toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-outline" onclick="PDV.verVentaDetalle(' + v.id + ')">Ver</button></td></tr>';
      }
      h += '</tbody></table></div>';
    }
    container.innerHTML = h;
  },

  verVentaDetalle(ventaId) {
    var v = null;
    var all = ArcanoDB.getPDVVentas(this.currentPDV.id);
    for (var i = 0; i < all.length; i++) { if (all[i].id === ventaId) { v = all[i]; break; } }
    if (!v) return;
    var h = '<p><strong>Fecha:</strong> ' + (v.fecha || '').slice(0, 10) + '</p>';
    h += '<div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Producto</th><th>Talla</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th></tr></thead><tbody>';
    for (var j = 0; j < (v.items || []).length; j++) {
      var it = v.items[j];
      h += '<tr><td>' + this.esc(it.productoNombre) + '</td><td>' + it.talla + '</td><td>' + it.cantidad + '</td>' +
        '<td>$' + (it.precioUnitario || 0).toLocaleString() + '</td><td class="fw7">$' + (it.subtotal || 0).toLocaleString() + '</td></tr>';
    }
    h += '</tbody></table></div>';
    h += '<p class="fw7" style="text-align:right;margin-top:12px;font-size:1.2em">Total: $' + (v.total || 0).toLocaleString() + '</p>';
    openModal('Detalle Venta #' + v.id, h);
  },

  /* ==================== POS (PUNTO DE VENTA) ==================== */
  _posCart: [],
  _pdvCamStream: null,
  _pdvCamCart: [],
  _pdvCamOcrRunning: false,

  renderPos(container) {
    var pdv = this.currentPDV;
    if (!pdv) return;
    this._posCart = [];
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var stock = pdv.stock || {};
    var h = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost" onclick="PDV.go(' + pdv.id + ',\'ventas\')">← Ventas</button>' +
      '<h3 style="margin:0">' + this.esc(pdv.nombre) + '</h3>' +
      '<span class="badge badge-green">Nueva Venta</span></div>';
    h += '<div style="border-bottom:2px solid var(--border);margin:8px 0 12px"></div>';
    // Productos disponibles en PDV
    h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:12px">' +
      '<input type="text" class="input" id="pos-search" placeholder="Buscar producto..." style="flex:1" oninput="PDV.filterPos()">' +
      '<button class="btn btn-gold" onclick="PDV.formVentaCam()" title="Venta por camara">Camara</button>' +
      '</div>';
    h += '<div id="pos-products" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;max-height:50vh;overflow-y:auto">';
    var products = [];
    for (var i = 0; i < especias.length; i++) {
      var e = especias[i];
      var keyCh = 'especia_' + e.id + '_chico';
      var keyGr = 'especia_' + e.id + '_grande';
      if ((stock[keyCh] || 0) > 0) products.push({ tipo: 'especia', id: e.id, nombre: e.nombre, talla: 'chico', stock: stock[keyCh], precio: e.precioChico || 0 });
      if ((stock[keyGr] || 0) > 0) products.push({ tipo: 'especia', id: e.id, nombre: e.nombre, talla: 'grande', stock: stock[keyGr], precio: e.precioGrande || 0 });
    }
    for (var j = 0; j < blends.length; j++) {
      var b = blends[j];
      var keyCh2 = 'blend_' + b.id + '_chico';
      var keyGr2 = 'blend_' + b.id + '_grande';
      if ((stock[keyCh2] || 0) > 0) products.push({ tipo: 'blend', id: b.id, nombre: b.nombre, talla: 'chico', stock: stock[keyCh2], precio: b.precioChico || 0 });
      if ((stock[keyGr2] || 0) > 0) products.push({ tipo: 'blend', id: b.id, nombre: b.nombre, talla: 'grande', stock: stock[keyGr2], precio: b.precioGrande || 0 });
    }
    var pdvPacks = ArcanoDB.getPacks ? ArcanoDB.getPacks() : [];
    for (var pp = 0; pp < pdvPacks.length; pp++) {
      var ppk = pdvPacks[pp];
      var keyPk = 'pack_' + ppk.id + '_-';
      if ((stock[keyPk] || 0) > 0) products.push({ tipo: 'pack', id: ppk.id, nombre: ppk.nombre, talla: '-', stock: stock[keyPk], precio: ppk.precio || 0 });
    }
    for (var p = 0; p < products.length; p++) {
      var pr = products[p];
      h += '<div class="card pos-product" data-name="' + this.esc(pr.nombre).toLowerCase() + '" onclick="PDV.posAdd(\'' + pr.tipo + '\',' + pr.id + ',\'' + pr.talla + '\',' + pr.precio + ',\'' + this.esc(pr.nombre) + '\',' + pr.stock + ')" style="cursor:pointer;padding:10px">' +
        '<div class="fw7" style="font-size:0.9em">' + this.esc(pr.nombre) + '</div>' +
        '<div class="text-muted text-sm">' + pr.talla + ' · Stock: ' + pr.stock + '</div>' +
        '<div class="fw7" style="color:var(--gold)">$' + pr.precio.toLocaleString() + '</div></div>';
    }
    h += '</div>';

    // === Sección de Costales (venta de palas) ===
    var stockCostales = pdv.stockCostales || {};
    var costalesKeys = Object.keys(stockCostales).filter(function(k) { return (stockCostales[k] || 0) > 0; });
    if (costalesKeys.length > 0) {
      h += '<div style="border-top:2px solid var(--border);margin:16px 0 8px"></div>';
      h += '<h4 style="margin:0 0 8px">🛍️ Costales — Venta de Palas</h4>';
      h += '<div id="pos-costales" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">';
      for (var ck = 0; ck < costalesKeys.length; ck++) {
        var costalKey = costalesKeys[ck];
        var costalObj = ArcanoDB.getCostal(parseInt(costalKey, 10));
        if (!costalObj) continue;
        var grsDisp = stockCostales[costalKey] || 0;
        var palasDisp = costalObj.gramosPorPala > 0 ? Math.floor(grsDisp / costalObj.gramosPorPala) : 0;
        if (palasDisp <= 0) continue;
        h += '<div class="card pos-product" data-name="' + this.esc(costalObj.nombre || 'costal').toLowerCase() + '" style="cursor:pointer;padding:10px;border-left:3px solid var(--gold)" onclick="PDV.posAddPala(' + costalObj.id + ',\'' + this.esc(costalObj.nombre || 'Costal').replace(/'/g, "\\'") + '\',' + (costalObj.precioPala || 0) + ',' + palasDisp + ')">' +
          '<div class="fw7" style="font-size:0.9em">' + this.esc(costalObj.nombre || 'Costal') + '</div>' +
          '<div class="text-muted text-sm">Palas: ' + palasDisp + ' · ' + (costalObj.gramosPorPala || 50) + 'g c/u</div>' +
          '<div class="fw7" style="color:var(--gold)">$' + (costalObj.precioPala || 0).toLocaleString() + '/pala</div></div>';
      }
      h += '</div>';
    }

    // === Sección de Palas (venta directa por producto, descuenta de Bodega o costal abierto) ===
    var productosPalas = [];
    for (var ek = 0; ek < especias.length; ek++) {
      var eP = especias[ek];
      var pesoPalaE = Number(eP.pesoPala) || 0;
      if (pesoPalaE > 0 && (Number(eP.stockBolsa) || 0) > 0) {
        productosPalas.push({
          tipo: 'especia', id: eP.id, nombre: eP.nombre, pesoPala: pesoPalaE,
          precioPala: Number(eP.precioPala) || 0,
          bodega: Number(eP.stockBolsa) || 0,
          palasDispBodega: pesoPalaE > 0 ? Math.floor((Number(eP.stockBolsa) || 0) / pesoPalaE) : 0
        });
      }
    }
    // También considerar costales abiertos
    var costalesAbiertos = ArcanoDB.getCostales().filter(function(c) {
      return c && c.estado === 'abierto' && (Number(c.gramosRestantes) || 0) > 0;
    });
    for (var ca = 0; ca < costalesAbiertos.length; ca++) {
      var caObj = costalesAbiertos[ca];
      var caPeso = Number(caObj.pesoPala) || 20;
      var caRest = Number(caObj.gramosRestantes) || 0;
      var caPalas = caPeso > 0 ? Math.floor(caRest / caPeso) : 0;
      if (caPalas <= 0) continue;
      // Verificar si ya agregamos el producto desde Bodega
      var yaAgregado = false;
      for (var pp2 = 0; pp2 < productosPalas.length; pp2++) {
        if (productosPalas[pp2].tipo === caObj.productoTipo && productosPalas[pp2].id === caObj.productoId) {
          productosPalas[pp2].palasDispBodega += caPalas;
          productosPalas[pp2].palasEnCostal = caPalas;
          productosPalas[pp2].costalId = caObj.id;
          yaAgregado = true;
          break;
        }
      }
      if (!yaAgregado) {
        var prodCA = caObj.productoTipo === 'blend' ? ArcanoDB.getBlend(caObj.productoId) : ArcanoDB.getEspecia(caObj.productoId);
        if (prodCA) {
          productosPalas.push({
            tipo: caObj.productoTipo, id: caObj.productoId, nombre: prodCA.nombre, pesoPala: caPeso,
            precioPala: Number(prodCA.precioPala) || 0,
            bodega: 0,
            palasDispBodega: caPalas,
            palasEnCostal: caPalas,
            costalId: caObj.id
          });
        }
      }
    }
    if (productosPalas.length > 0) {
      h += '<div style="border-top:2px solid var(--border);margin:16px 0 8px"></div>';
      h += '<h4 style="margin:0 0 8px">🥄 Palas (vender directo de Bodega o Costal abierto)</h4>';
      h += '<div id="pos-palas" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">';
      for (var pp3 = 0; pp3 < productosPalas.length; pp3++) {
        var pp = productosPalas[pp3];
        var onclickStr = "PDV.posAddPalaProducto('" + pp.tipo + "'," + pp.id + ",'" + this.esc(pp.nombre).replace(/'/g, "\\'") + "'," + pp.pesoPala + "," + (pp.precioPala || 0) + "," + pp.palasDispBodega + "," + (pp.costalId || 0) + ")";
        h += '<div class="card pos-product" data-name="' + this.esc(pp.nombre).toLowerCase() + ' pala" style="cursor:pointer;padding:10px;border-left:3px solid var(--gold)" onclick="' + onclickStr + '">' +
          '<div class="fw7" style="font-size:0.9em">🥄 ' + this.esc(pp.nombre) + ' (pala ' + pp.pesoPala + 'g)</div>' +
          '<div class="text-muted text-sm">Palas: ' + pp.palasDispBodega + (pp.palasEnCostal ? ' (costal #' + pp.costalId + ')' : ' (Bodega)') + '</div>' +
          '<div class="fw7" style="color:var(--gold)">$' + (pp.precioPala || 0).toLocaleString() + '/pala</div></div>';
      }
      h += '</div>';
    }

    // Cart
    h += '<div style="border-top:2px solid var(--border);margin-top:12px;padding-top:12px">' +
      '<h4 style="margin:0 0 8px">Carrito <span id="pos-cart-count" class="badge badge-gold">0</span></h4>' +
      '<div id="pos-cart"></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">' +
      '<div class="fw7" style="font-size:1.3em">Total: $<span id="pos-total">0</span></div>' +
      '<button class="btn btn-gold btn-lg" onclick="PDV.posConfirmar()" id="pos-confirm-btn" disabled>Cobrar</button></div></div>';
    container.innerHTML = h;
  },

  filterPos() {
    var q = (document.getElementById('pos-search').value || '').toLowerCase();
    var cards = document.querySelectorAll('.pos-product');
    for (var i = 0; i < cards.length; i++) {
      var name = cards[i].dataset.name || '';
      cards[i].style.display = name.indexOf(q) >= 0 ? '' : 'none';
    }
  },

  posAdd(tipo, id, talla, precio, nombre, maxStock) {
    // Check if already in cart
    for (var i = 0; i < this._posCart.length; i++) {
      var c = this._posCart[i];
      if (c.tipo === tipo && c.productoId === id && c.talla === talla) {
        if (c.cantidad >= maxStock) { toast('Stock maximo alcanzado', 'err'); return; }
        c.cantidad++;
        c.subtotal = c.precioUnitario * c.cantidad;
        this._renderPosCart();
        return;
      }
    }
    this._posCart.push({ tipo: tipo, productoId: id, talla: talla, productoNombre: nombre, precioUnitario: precio, cantidad: 1, subtotal: precio });
    this._renderPosCart();
  },

  posAddPala(costalId, costalNombre, precioPala, maxPalas) {
    for (var i = 0; i < this._posCart.length; i++) {
      var c = this._posCart[i];
      if (c.tipo === 'costal' && c.productoId === costalId) {
        if (c.cantidad >= maxPalas) { toast('Palas maximas alcanzadas', 'err'); return; }
        c.cantidad++;
        c.subtotal = c.precioUnitario * c.cantidad;
        this._renderPosCart();
        return;
      }
    }
    this._posCart.push({
      tipo: 'costal',
      productoId: costalId,
      costalId: costalId,
      costalNombre: costalNombre,
      productoNombre: costalNombre + ' (pala)',
      talla: 'pala',
      palas: 1,
      precioUnitario: precioPala,
      cantidad: 1,
      subtotal: precioPala,
      maxPalas: maxPalas
    });
    this._renderPosCart();
  },

  /** Agrega una pala al carrito (vender directo de Bodega o costal abierto).
   *  Tipo de item en carrito: 'pala' (NO 'costal').
   *  Al confirmar la venta, se procesa con saveVenta directamente
   *  (que descuenta de costal abierto o Bodega). */
  posAddPalaProducto(productoTipo, productoId, nombre, pesoPala, precioPala, maxPalas, costalId) {
    for (var i = 0; i < this._posCart.length; i++) {
      var c = this._posCart[i];
      if (c.tipo === 'pala' && c.productoId === productoId) {
        if (c.cantidad >= maxPalas) { toast('Palas máximas alcanzadas: ' + maxPalas, 'err'); return; }
        c.cantidad++;
        c.subtotal = c.precioUnitario * c.cantidad;
        this._renderPosCart();
        return;
      }
    }
    this._posCart.push({
      tipo: 'pala',
      productoTipo: productoTipo,
      productoId: productoId,
      productoNombre: nombre + ' (pala ' + pesoPala + 'g)',
      talla: 'pala',
      peso: pesoPala,
      precioUnitario: precioPala,
      cantidad: 1,
      subtotal: precioPala,
      maxPalas: maxPalas,
      costalId: costalId || null
    });
    this._renderPosCart();
  },

  posRemove(idx) {
    this._posCart.splice(idx, 1);
    this._renderPosCart();
  },

  posChangeQty(idx, delta) {
    var item = this._posCart[idx];
    if (!item) return;
    var newQty = item.cantidad + delta;
    if (newQty <= 0) { this.posRemove(idx); return; }
    // Check stock
    if (item.tipo === 'costal') {
      // Para costales, el límite es maxPalas
      if (item.maxPalas && newQty > item.maxPalas) { toast('Palas maximas: ' + item.maxPalas, 'err'); return; }
    } else if (item.tipo === 'pala') {
      // Palas directas de Bodega/costal abierto: límite maxPalas
      if (item.maxPalas && newQty > item.maxPalas) { toast('Palas máximas: ' + item.maxPalas, 'err'); return; }
    } else {
      var pdv = this.currentPDV;
      var key = item.tipo + '_' + item.productoId + '_' + item.talla;
      var maxStock = (pdv.stock || {})[key] || 0;
      if (newQty > maxStock) { toast('Stock maximo: ' + maxStock, 'err'); return; }
    }
    item.cantidad = newQty;
    if (item.tipo === 'costal') item.palas = newQty;
    item.subtotal = item.precioUnitario * item.cantidad;
    this._renderPosCart();
  },

  _renderPosCart() {
    var cartEl = document.getElementById('pos-cart');
    var totalEl = document.getElementById('pos-total');
    var countEl = document.getElementById('pos-cart-count');
    var btn = document.getElementById('pos-confirm-btn');
    if (!cartEl) return;
    if (this._posCart.length === 0) {
      cartEl.innerHTML = '<p class="text-muted text-sm text-center" style="padding:12px">Carrito vacio</p>';
      if (totalEl) totalEl.textContent = '0';
      if (countEl) countEl.textContent = '0';
      if (btn) btn.disabled = true;
      return;
    }
    if (btn) btn.disabled = false;
    var h = '<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Subtotal</th><th></th></tr></thead><tbody>';
    var total = 0;
    for (var i = 0; i < this._posCart.length; i++) {
      var it = this._posCart[i];
      total += it.subtotal;
      var tipoLabel = it.tipo === 'costal' ? '🛍️ Pala' : (it.tipo === 'pala' ? '🥄 Pala' : (it.talla === '-' ? 'Pack' : it.talla));
      h += '<tr><td>' + this.esc(it.productoNombre) + '</td><td>' + tipoLabel + '</td>' +
        '<td><button class="btn btn-sm btn-ghost" onclick="PDV.posChangeQty(' + i + ',-1)">-</button> ' + it.cantidad + ' <button class="btn btn-sm btn-ghost" onclick="PDV.posChangeQty(' + i + ',1)">+</button></td>' +
        '<td class="fw7">$' + it.subtotal.toLocaleString() + '</td>' +
        '<td><button class="btn btn-sm btn-red" onclick="PDV.posRemove(' + i + ')">X</button></td></tr>';
    }
    h += '</tbody></table></div>';
    cartEl.innerHTML = h;
    if (totalEl) totalEl.textContent = total.toLocaleString();
    if (countEl) countEl.textContent = this._posCart.length;
  },

  /* ==================== PAYMENT MODAL (shared) ==================== */
  _showPDVPagoModal: function(saleData, onSuccess) {
    var total = 0;
    for (var i = 0; i < saleData.items.length; i++) {
      total += (Number(saleData.items[i].precioUnitario) || 0) * (Number(saleData.items[i].cantidad) || 0);
    }
    saleData.total = total;
    var qrImg = (typeof Pages !== 'undefined' && Pages._qrPagoImage) ? Pages._qrPagoImage : localStorage.getItem('arcano_qr_pago_image');
    var qrContent = qrImg
      ? '<div style="font-size:0.9rem;color:var(--muted);margin-bottom:8px">Muestra este QR al cliente:</div>' +
        '<div style="margin-bottom:16px"><img src="' + qrImg + '" style="max-width:260px;max-height:260px;border-radius:8px;border:1px solid var(--border)"></div>'
      : '<div style="padding:20px;margin-bottom:12px;border:2px dashed var(--border);border-radius:8px;color:var(--muted)">No hay QR configurado.<br>Configuralo en Ventas > Configuracion de Pago.</div>';
    var pm = document.createElement('div');
    pm.className = 'modal-overlay';
    pm.id = 'pdv-pago-modal';
    pm.innerHTML =
      '<div class="modal" style="max-width:420px;text-align:center">' +
        '<div class="modal-header"><button class="btn btn-ghost" id="pdv-pago-volver-btn" style="margin-right:auto;padding:4px 12px;font-size:0.85rem">< Volver</button><h3>Metodo de Pago</h3></div>' +
        '<div class="modal-body">' +
          '<div style="font-size:2rem;font-weight:800;color:var(--gold);margin-bottom:8px">$' + total.toLocaleString() + '</div>' +
          '<p style="color:var(--muted);margin-bottom:20px;font-size:0.9rem">Selecciona como recibiste el pago</p>' +
          '<div style="display:flex;gap:12px;justify-content:center">' +
            '<button class="btn btn-gold" id="pdv-pago-efectivo-btn" style="flex:1;padding:16px;font-size:1rem;font-weight:700">Efectivo</button>' +
            '<button class="btn btn-outline" id="pdv-pago-qr-btn" style="flex:1;padding:16px;font-size:1rem;font-weight:700;border-color:var(--gold);color:var(--gold)">QR</button>' +
          '</div>' +
          '<div id="pdv-pago-qr-area" style="display:none;margin-top:20px">' +
            qrContent +
            '<div style="display:flex;gap:12px;justify-content:center;margin-top:12px">' +
              '<button class="btn btn-gold" id="pdv-pago-recibido-btn" style="flex:1;padding:14px;font-size:1rem;font-weight:700">Pago Recibido</button>' +
              '<button class="btn btn-outline" id="pdv-pago-qr-cancel-btn" style="flex:1;padding:14px;font-size:1rem;font-weight:700">Cancelar</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pm);
    document.getElementById('pdv-pago-efectivo-btn').addEventListener('click', function() {
      saleData.metodoPago = 'efectivo';
      pm.remove();
      onSuccess(saleData);
    });
    document.getElementById('pdv-pago-qr-btn').addEventListener('click', function() {
      document.getElementById('pdv-pago-qr-area').style.display = 'block';
      document.getElementById('pdv-pago-efectivo-btn').style.display = 'none';
      document.getElementById('pdv-pago-qr-btn').style.display = 'none';
    });
    document.getElementById('pdv-pago-recibido-btn').addEventListener('click', function() {
      saleData.metodoPago = 'qr';
      pm.remove();
      onSuccess(saleData);
    });
    document.getElementById('pdv-pago-qr-cancel-btn').addEventListener('click', function() {
      document.getElementById('pdv-pago-qr-area').style.display = 'none';
      document.getElementById('pdv-pago-efectivo-btn').style.display = '';
      document.getElementById('pdv-pago-qr-btn').style.display = '';
    });
    document.getElementById('pdv-pago-volver-btn').addEventListener('click', function() {
      pm.remove();
    });
  },

  posConfirmar() {
    if (this._posCart.length === 0) return;
    var pdv = this.currentPDV;
    if (!pdv) return;
    var self = this;

    // Separar items de frascos (especia/blend/pack) de items de palas (costal) y palas directas (pala)
    var frascosItems = [];
    var palasCostalItems = [];  // items tipo 'costal' (sistema viejo)
    var palasDirectasItems = []; // items tipo 'pala' (sistema nuevo)
    for (var i = 0; i < this._posCart.length; i++) {
      var it = this._posCart[i];
      if (it.tipo === 'costal') {
        palasCostalItems.push({ costalId: it.costalId, costalNombre: it.costalNombre, palas: it.cantidad });
      } else if (it.tipo === 'pala') {
        palasDirectasItems.push({
          tipo: 'pala',
          productoTipo: it.productoTipo,
          productoId: it.productoId,
          peso: it.peso,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario
        });
      } else {
        frascosItems.push({ tipo: it.tipo, productoId: it.productoId, talla: it.talla, cantidad: it.cantidad, precioUnitario: it.precioUnitario });
      }
    }
    var palasItems = palasCostalItems; // mantener compatibilidad con savePDVVentaPala
    var hayPalasDirectas = palasDirectasItems.length > 0;

    // Si hay palas directas (de Bodega/costal abierto), usar saveVenta (que descuenta de costal o Bodega)
    if (hayPalasDirectas && frascosItems.length === 0 && palasCostalItems.length === 0) {
      var saleDataPalaDirecta = {
        puntoDeVentaId: pdv.id,
        puntoDeVentaNombre: pdv.nombre,
        fecha: new Date().toISOString().slice(0, 10),
        items: palasDirectasItems
      };
      this._showPDVPagoModal(saleDataPalaDirecta, function(data) {
        try {
          var itemsConPago = data.items.map(function(it) {
            return Object.assign({}, it, { metodoPago: data.metodoPago });
          });
          var venta = ArcanoDB.saveVenta({ fecha: data.fecha || new Date().toISOString().slice(0,10), items: itemsConPago, pdvId: pdv.id, pdvNombre: pdv.nombre, metodoPago: data.metodoPago });
          self._posCart = [];
          toast('Venta de palas registrada! #' + venta.id);
          self.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
          self.renderPos(document.getElementById('page-content'));
        } catch (e) { toast(e.message, 'err'); }
      });
      return;
    }

    // Si solo hay palas (costales viejos), usar savePDVVentaPala
    if (palasCostalItems.length > 0 && frascosItems.length === 0 && !hayPalasDirectas) {
      var saleDataPala = {
        puntoDeVentaId: pdv.id,
        puntoDeVentaNombre: pdv.nombre,
        items: palasItems
      };
      this._showPDVPagoModal(saleDataPala, function(data) {
        try {
          var venta = ArcanoDB.savePDVVentaPala(data);
          self._posCart = [];
          toast('Venta de palas registrada! #' + venta.id);
          self.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
          self.renderPos(document.getElementById('page-content'));
        } catch (e) { toast(e.message, 'err'); }
      });
      return;
    }

    // Si solo hay frascos, usar savePDVVenta (original)
    if (frascosItems.length > 0 && palasCostalItems.length === 0 && !hayPalasDirectas) {
      var saleData = {
        puntoDeVentaId: pdv.id,
        puntoDeVentaNombre: pdv.nombre,
        items: frascosItems
      };
      this._showPDVPagoModal(saleData, function(data) {
        try {
          var venta = ArcanoDB.savePDVVenta(data);
          self._posCart = [];
          toast('Venta registrada! #' + venta.id);
          self.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
          self.renderPos(document.getElementById('page-content'));
        } catch (e) { toast(e.message, 'err'); }
      });
      return;
    }

    // Si hay MEZCLADOS (frascos + palas costal y/o palas directas): procesar todo
    // Combinar todos los items para mostrar total en el modal de pago
    var combinedItems = frascosItems.concat(palasDirectasItems);
    if (combinedItems.length > 0 || palasCostalItems.length > 0) {
      var combinedData = {
        puntoDeVentaId: pdv.id,
        puntoDeVentaNombre: pdv.nombre,
        items: combinedItems.concat(palasCostalItems.map(function(p) {
          return { tipo: 'costal_legacy', costalId: p.costalId, costalNombre: p.costalNombre, cantidad: p.palas, precioUnitario: 0 };
        }))
      };
      this._showPDVPagoModal(combinedData, function(data) {
        try {
          // Vender frascos (si hay)
          if (frascosItems.length > 0) {
            ArcanoDB.savePDVVenta({ puntoDeVentaId: pdv.id, puntoDeVentaNombre: pdv.nombre, items: frascosItems, metodoPago: data.metodoPago });
          }
          // Vender palas directas (de Bodega o costal abierto) con saveVenta
          if (palasDirectasItems.length > 0) {
            var itemsPalaFinal = palasDirectasItems.map(function(it) {
              return Object.assign({}, it, { metodoPago: data.metodoPago });
            });
            ArcanoDB.saveVenta({ fecha: data.fecha || new Date().toISOString().slice(0,10), items: itemsPalaFinal, pdvId: pdv.id, pdvNombre: pdv.nombre, metodoPago: data.metodoPago });
          }
          // Vender palas de costales viejos con savePDVVentaPala
          if (palasCostalItems.length > 0) {
            ArcanoDB.savePDVVentaPala({ puntoDeVentaId: pdv.id, puntoDeVentaNombre: pdv.nombre, items: palasCostalItems, metodoPago: data.metodoPago });
          }
          self._posCart = [];
          toast('Venta mixta registrada (frascos + palas)');
          self.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
          self.renderPos(document.getElementById('page-content'));
        } catch (e) { toast(e.message, 'err'); }
      });
      return;
    }
  },

  /* ==================== ESTADISTICAS ==================== */
  renderStats(container) {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var stats = ArcanoDB.getPDVStats(pdv.id);
    var ventas = ArcanoDB.getPDVVentas(pdv.id);
    var h = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost" onclick="PDV.go(null)">← Puntos de Venta</button>' +
      '<h3 style="margin:0">' + this.esc(pdv.nombre) + '</h3>' +
      '<span class="badge badge-blue">Estadisticas</span></div>' +
      '<div style="display:flex;gap:6px;margin:8px 0 0;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-green" onclick="PDV.go(' + pdv.id + ',\'pos\')">Nueva Venta</button>' +
      '<button class="btn btn-sm btn-outline" onclick="PDV.go(' + pdv.id + ',\'stock\')">Stock</button>' +
      '<button class="btn btn-sm btn-outline" onclick="PDV.go(' + pdv.id + ',\'ventas\')">Ventas</button>' +
      '<button class="btn btn-sm btn-outline" onclick="PDV.go(' + pdv.id + ',\'gastos\')">Gastos</button>' +
      '</div>';
    h += '<div style="border-bottom:2px solid var(--border);margin:8px 0 16px"></div>';
    h += '<div style="display:flex;gap:4px;margin-bottom:16px;background:var(--bg2);border-radius:var(--radius);padding:4px">' +
      '<button class="est-tab active" onclick="PDV._statsTab(this,\'resumen\')" data-tab="resumen">Resumen</button>' +
      '<button class="est-tab" onclick="PDV._statsTab(this,\'productos\')" data-tab="productos">Productos</button>' +
      '<button class="est-tab" onclick="PDV._statsTab(this,\'diario\')" data-tab="diario">Ventas por Dia</button>' +
      '<button class="est-tab" onclick="PDV._statsTab(this,\'stock\')" data-tab="stock">Stock</button>' +
      '</div>';
    h += '<div id="pdv-stats-content">';
    h += this._renderStatsResumen(stats, ventas, pdv);
    h += '</div>';
    container.innerHTML = h;
    setTimeout(function() { PDV._renderStatsCharts(stats, ventas, pdv); }, 100);
  },

  _statsTab(btn, tab) {
    var tabs = btn.parentElement.querySelectorAll('.est-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    btn.classList.add('active');
    var contentEl = document.getElementById('pdv-stats-content');
    if (!contentEl) return;
    var pdv = this.currentPDV;
    var stats = ArcanoDB.getPDVStats(pdv.id);
    var ventas = ArcanoDB.getPDVVentas(pdv.id);
    switch (tab) {
      case 'resumen': contentEl.innerHTML = this._renderStatsResumen(stats, ventas, pdv); setTimeout(function() { PDV._renderStatsCharts(stats, ventas, pdv); }, 50); break;
      case 'productos': contentEl.innerHTML = this._renderStatsProductos(stats, ventas, pdv); setTimeout(function() { PDV._renderPieChart(stats); }, 50); break;
      case 'diario': contentEl.innerHTML = this._renderStatsDiario(stats, ventas, pdv); setTimeout(function() { PDV._renderDiarioChart(stats); }, 50); break;
      case 'stock': contentEl.innerHTML = this._renderStatsStock(stats, ventas, pdv); break;
    }
  },

  _renderStatsResumen(stats, ventas, pdv) {
    var h = '';
    // Calculate Efectivo vs QR
    var pdvEfectivo = 0, pdvQr = 0;
    for (var pvi = 0; pvi < ventas.length; pvi++) {
      if (ventas[pvi].metodoPago === 'qr') pdvQr += (ventas[pvi].total || 0);
      else pdvEfectivo += (ventas[pvi].total || 0);
    }
    h += '<div class="est-kpi-grid">' +
      '<div class="est-kpi up"><div class="est-kpi-value">$' + stats.totalIngresos.toLocaleString() + '</div><div class="est-kpi-label">Ingresos Totales</div><div class="est-kpi-sub">por todas las ventas</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value" style="color:var(--green)">$' + pdvEfectivo.toLocaleString() + '</div><div class="est-kpi-label">Efectivo</div><div class="est-kpi-sub">pagos en efectivo</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value" style="color:var(--blue)">$' + pdvQr.toLocaleString() + '</div><div class="est-kpi-label">QR</div><div class="est-kpi-sub">pagos con QR</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">' + stats.totalVentas + '</div><div class="est-kpi-label">Total Ventas</div><div class="est-kpi-sub">transacciones realizadas</div></div>' +
      '<div class="est-kpi ' + (stats.totalItemsEnStock < 10 ? 'down' : 'up') + '"><div class="est-kpi-value">$' + Math.round(stats.ticketPromedio).toLocaleString() + '</div><div class="est-kpi-label">Ticket Promedio</div><div class="est-kpi-sub">ingreso por venta</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">' + stats.totalItemsEnStock + '</div><div class="est-kpi-label">Unidades en Stock</div><div class="est-kpi-sub">' + stats.productosEnStock + ' productos</div></div>' +
      '</div>';
    h += '<div class="est-charts-grid">' +
      '<div class="est-chart-card"><h4>Ingresos Diarios</h4><div class="est-chart-wrap" style="height:220px"><canvas id="pdv-chart-ingresos"></canvas></div></div>' +
      '<div class="est-chart-card"><h4>Productos Mas Vendidos</h4><div class="est-chart-wrap" style="height:220px"><canvas id="pdv-chart-top"></canvas></div></div>' +
      '</div>';
    if (stats.topProductos.length > 0) {
      h += '<h4 style="margin:20px 0 8px">Top 5 Productos</h4>';
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Monto</th><th>%</th></tr></thead><tbody>';
      for (var i = 0; i < Math.min(5, stats.topProductos.length); i++) {
        var tp = stats.topProductos[i];
        var pct = stats.totalIngresos > 0 ? ((tp.monto / stats.totalIngresos) * 100).toFixed(1) : '0';
        h += '<tr><td>' + (i + 1) + '</td><td class="fw7">' + this.esc(tp.nombre) + '</td><td>' + tp.cantidad + '</td>' +
          '<td>$' + tp.monto.toLocaleString() + '</td><td>' + pct + '%</td></tr>';
      }
      h += '</tbody></table></div>';
    }
    if (ventas.length > 0) {
      h += '<h4 style="margin:20px 0 8px">Ultimas 5 Ventas</h4>';
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Fecha</th><th>Items</th><th>Metodo</th><th>Total</th></tr></thead><tbody>';
      var recent = ventas.slice(-5).reverse();
      for (var r = 0; r < recent.length; r++) {
        var rv = recent[r];
        var itemNames = (rv.items || []).map(function(it) { return it.productoNombre; }).join(', ');
        var rvMetodo = rv.metodoPago === 'qr' ? '<span style="color:var(--blue);font-size:0.75rem;font-weight:600">QR</span>' : '<span style="color:var(--green);font-size:0.75rem;font-weight:600">Efectivo</span>';
        h += '<tr><td>' + rv.id + '</td><td>' + (rv.fecha || '').slice(0, 16) + '</td><td class="text-sm">' + this.esc(itemNames) + '</td><td>' + rvMetodo + '</td><td class="fw7">$' + (rv.total || 0).toLocaleString() + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }
    return h;
  },

  _renderStatsProductos(stats, ventas, pdv) {
    var h = '<h4 style="margin:0 0 12px">Ranking Completo de Productos</h4>';
    if (stats.topProductos.length === 0) {
      return h + '<p class="text-muted">Sin datos de ventas</p>';
    }
    var maxMonto = stats.topProductos[0].monto || 1;
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Ingresos</th><th>% del Total</th><th>Barra</th></tr></thead><tbody>';
    for (var i = 0; i < stats.topProductos.length; i++) {
      var tp = stats.topProductos[i];
      var pct = stats.totalIngresos > 0 ? ((tp.monto / stats.totalIngresos) * 100).toFixed(1) : '0';
      var barW = Math.round((tp.monto / maxMonto) * 100);
      h += '<tr><td>' + (i + 1) + '</td><td class="fw7">' + this.esc(tp.nombre) + '</td><td>' + tp.cantidad + '</td>' +
        '<td class="fw7">$' + tp.monto.toLocaleString() + '</td><td>' + pct + '%</td>' +
        '<td><div class="est-bar-inline"><div class="est-bar-track"><div class="est-bar-fill" style="width:' + barW + '%;background:var(--gold)"></div></div></div></td></tr>';
    }
    h += '</tbody></table></div>';
    h += '<div class="est-chart-card" style="margin-top:16px"><h4>Distribucion de Ingresos por Producto</h4><div class="est-chart-wrap" style="height:300px"><canvas id="pdv-chart-pie"></canvas></div></div>';
    return h;
  },

  _renderStatsDiario(stats, ventas, pdv) {
    var dias = Object.keys(stats.diario).sort();
    var h = '<h4 style="margin:0 0 12px">Ventas por Dia</h4>';
    if (dias.length === 0) {
      return h + '<p class="text-muted">Sin datos de ventas</p>';
    }
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Ventas</th><th>Ingresos</th><th>Ticket Prom.</th></tr></thead><tbody>';
    var totalIng = 0;
    for (var d = 0; d < dias.length; d++) {
      var di = stats.diario[dias[d]];
      totalIng += di.ingresos;
      var ticketP = di.ventas > 0 ? Math.round(di.ingresos / di.ventas) : 0;
      h += '<tr><td>' + dias[d].slice(0, 10) + '</td><td>' + di.ventas + '</td>' +
        '<td class="fw7">$' + di.ingresos.toLocaleString() + '</td>' +
        '<td>$' + ticketP.toLocaleString() + '</td></tr>';
    }
    h += '</tbody></table></div>';
    h += '<div class="est-kpi-grid" style="margin-top:16px">' +
      '<div class="est-kpi"><div class="est-kpi-value">' + dias.length + '</div><div class="est-kpi-label">Dias con Venta</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">$' + (dias.length > 0 ? Math.round(totalIng / dias.length) : 0).toLocaleString() + '</div><div class="est-kpi-label">Promedio Diario</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">$' + (dias.length > 0 ? Math.min.apply(null, dias.map(function(dd) { return stats.diario[dd].ingresos; })) : 0).toLocaleString() + '</div><div class="est-kpi-label">Dia Menor</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">$' + (dias.length > 0 ? Math.max.apply(null, dias.map(function(dd) { return stats.diario[dd].ingresos; })) : 0).toLocaleString() + '</div><div class="est-kpi-label">Dia Mayor</div></div>' +
      '</div>';
    h += '<div class="est-chart-card" style="margin-top:16px"><h4>Evolucion de Ingresos Diarios</h4><div class="est-chart-wrap" style="height:280px"><canvas id="pdv-chart-diario"></canvas></div></div>';
    return h;
  },

  _renderStatsStock(stats, ventas, pdv) {
    var h = '<h4 style="margin:0 0 12px">Valorizacion del Stock Actual</h4>';
    var stock = pdv.stock || {};
    var stockKeys = Object.keys(stock).filter(function(k) { return stock[k] > 0; });
    var stockValor = 0;
    if (stockKeys.length === 0) {
      return h + '<p class="text-muted">Sin stock en este PDV</p>';
    }
    h += '<div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th>Tipo</th><th>Talla</th><th>Cant.</th><th>P.Unit</th><th>Valor</th></tr></thead><tbody>';
    for (var s = 0; s < stockKeys.length; s++) {
      var sk = stockKeys[s];
      var parts = sk.split('_');
      var tipo = parts[0], prodId = Number(parts[1]), talla = parts[2];
      var prod;
      if (tipo === 'pack') { prod = (ArcanoDB.getPacks ? ArcanoDB.getPacks() : []).find(function(x){return x.id===prodId;}); }
      else { prod = tipo === 'especia' ? ArcanoDB.getEspecia(prodId) : ArcanoDB.getBlend(prodId); }
      var precio = prod ? (tipo === 'pack' ? (prod.precio || 0) : (talla === 'grande' ? prod.precioGrande : prod.precioChico) || 0) : 0;
      var valor = precio * stock[sk];
      stockValor += valor;
      var badgeClass = tipo === 'pack' ? 'badge-green' : (tipo === 'especia' ? 'badge-gold' : 'badge-blue');
      h += '<tr><td class="fw7">' + this.esc(prod ? prod.nombre : '?') + '</td>' +
        '<td><span class="badge ' + badgeClass + '">' + tipo + '</span></td>' +
        '<td>' + (talla === '-' ? 'Pack' : talla) + '</td><td>' + stock[sk] + '</td>' +
        '<td>$' + precio.toLocaleString() + '</td><td class="fw7">$' + valor.toLocaleString() + '</td></tr>';
    }
    h += '</tbody></table></div>';
    h += '<div class="est-kpi-grid" style="margin-top:16px">' +
      '<div class="est-kpi up"><div class="est-kpi-value">$' + stockValor.toLocaleString() + '</div><div class="est-kpi-label">Valor Total Stock</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">' + stockKeys.length + '</div><div class="est-kpi-label">Lineas de Stock</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">' + stats.totalItemsEnStock + '</div><div class="est-kpi-label">Unidades Totales</div></div>' +
      '<div class="est-kpi"><div class="est-kpi-value">$' + (stats.totalItemsEnStock > 0 ? Math.round(stockValor / stats.totalItemsEnStock) : 0).toLocaleString() + '</div><div class="est-kpi-label">Valor Promedio/Unit</div></div>' +
      '</div>';
    return h;
  },

  _renderStatsCharts(stats, ventas, pdv) {
    if (typeof Chart === 'undefined') return;
    var dias = Object.keys(stats.diario).sort();
    var ctx1 = document.getElementById('pdv-chart-ingresos');
    if (ctx1 && dias.length > 0) {
      new Chart(ctx1, {
        type: 'line',
        data: { labels: dias.map(function(d) { return d.slice(5, 10); }), datasets: [{ label: 'Ingresos', data: dias.map(function(d) { return stats.diario[d].ingresos; }), borderColor: '#e8b84b', backgroundColor: 'rgba(232,184,75,0.1)', fill: true, tension: 0.3, pointRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); }, color: '#9a8a78' }, grid: { color: 'rgba(58,34,24,0.4)' } }, x: { ticks: { color: '#9a8a78' }, grid: { display: false } } } }
      });
    }
    var ctx2 = document.getElementById('pdv-chart-top');
    if (ctx2 && stats.topProductos.length > 0) {
      var top5 = stats.topProductos.slice(0, 5);
      new Chart(ctx2, {
        type: 'bar',
        data: { labels: top5.map(function(p) { return p.nombre.length > 20 ? p.nombre.slice(0, 20) + '...' : p.nombre; }), datasets: [{ label: 'Monto', data: top5.map(function(p) { return p.monto; }), backgroundColor: ['rgba(232,184,75,0.8)', 'rgba(201,150,58,0.8)', 'rgba(160,120,40,0.8)', 'rgba(130,96,32,0.8)', 'rgba(100,72,24,0.8)'], borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); }, color: '#9a8a78' }, grid: { color: 'rgba(58,34,24,0.4)' } }, y: { ticks: { color: '#ece0d0' }, grid: { display: false } } } }
      });
    }
  },

  _renderDiarioChart(stats) {
    if (typeof Chart === 'undefined') return;
    var dias = Object.keys(stats.diario).sort();
    var ctx = document.getElementById('pdv-chart-diario');
    if (!ctx || dias.length === 0) return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dias.map(function(d) { return d.slice(5, 10); }),
        datasets: [
          { label: 'Ingresos', data: dias.map(function(d) { return stats.diario[d].ingresos; }), backgroundColor: 'rgba(232,184,75,0.7)', borderRadius: 4, yAxisID: 'y' },
          { label: 'Ventas', data: dias.map(function(d) { return stats.diario[d].ventas; }), type: 'line', borderColor: '#5dade2', backgroundColor: 'rgba(93,173,226,0.1)', tension: 0.3, pointRadius: 3, yAxisID: 'y1' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12, color: '#9a8a78' } } }, scales: { y: { position: 'left', ticks: { callback: function(v) { return '$' + v.toLocaleString(); }, color: '#9a8a78' }, grid: { color: 'rgba(58,34,24,0.4)' } }, y1: { position: 'right', ticks: { stepSize: 1, color: '#5dade2' }, grid: { drawOnChartArea: false } }, x: { ticks: { color: '#9a8a78' }, grid: { display: false } } } }
    });
  },

  _renderPieChart(stats) {
    if (typeof Chart === 'undefined') return;
    var ctx = document.getElementById('pdv-chart-pie');
    if (!ctx || stats.topProductos.length === 0) return;
    var colors = ['#e8b84b', '#c9963a', '#5dade2', '#27ae60', '#e74c3c', '#f0c040', '#a07828', '#3a2218', '#9a8a78', '#ece0d0'];
    var top = stats.topProductos.slice(0, 10);
    new Chart(ctx, {
      type: 'doughnut',
      data: { labels: top.map(function(p) { return p.nombre.length > 25 ? p.nombre.slice(0, 25) + '...' : p.nombre; }), datasets: [{ data: top.map(function(p) { return p.monto; }), backgroundColor: colors.slice(0, top.length) }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 8, color: '#ece0d0', font: { size: 11 } } } } }
    });
  },

  /* ==================== QR ==================== */
  showQR(id) {
    var pdv = ArcanoDB.getPuntoDeVenta(id);
    if (!pdv) return;
    var url = window.location.origin + window.location.pathname + '#pos=' + id;
    var h = '<div class="text-center" style="padding:12px">' +
      '<p class="fw7" style="font-size:1.1em;margin-bottom:4px">' + this.esc(pdv.nombre) + '</p>' +
      '<p class="text-muted text-sm" style="margin-bottom:12px">' + this.esc(pdv.ubicacion || '') + '</p>' +
      '<div id="qr-container" style="display:inline-block;padding:12px;background:white;border-radius:8px"></div>' +
      '<p class="text-sm text-muted" style="margin-top:12px;word-break:break-all">' + url + '</p>' +
      '<button class="btn btn-gold mt-12" onclick="PDV.go(' + id + ',\'pos\')" style="margin-top:12px">Abrir Ventas</button>' +
      '</div>';
    openModal('QR — Punto de Venta', h);
    // Generate QR using QR code API
    var qrContainer = document.getElementById('qr-container');
    if (qrContainer) {
      var img = document.createElement('img');
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);
      img.alt = 'QR Code';
      img.style.width = '200px';
      img.style.height = '200px';
      qrContainer.appendChild(img);
    }
  },


  /* ==================== VENTA POR CAMARA (OCR) ==================== */
  formVentaCam() {
    var pdv = this.currentPDV;
    if (!pdv) return;
    this._pdvCamCart = [];
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'pdv-cam-venta-modal';
    modal.innerHTML =
      '<div class="modal modal-lg" style="max-width:520px">' +
        '<div class="modal-header"><h3>Venta por Camara — ' + this.esc(pdv.nombre) + '</h3>' +
          '<button class="btn btn-ghost" onclick="PDV.closeVentaCam()">X</button></div>' +
        '<div class="modal-body" style="padding:0">' +
          '<div style="position:relative;background:#000">' +
            '<video id="pdv-cam-video" autoplay playsinline style="width:100%;display:block;max-height:320px;object-fit:cover"></video>' +
            '<canvas id="pdv-cam-canvas" style="display:none"></canvas>' +
            '<div id="pdv-cam-scan-line" style="position:absolute;top:50%;left:10%;right:10%;height:2px;background:var(--gold);opacity:0.6;transform:translateY(-50%);animation:pdvScanLine 2s ease-in-out infinite;pointer-events:none"></div>' +
            '<style>@keyframes pdvScanLine{0%,100%{top:calc(50% - 50px)}50%{top:calc(50% + 50px)}}</style>' +
          '</div>' +
          '<div id="pdv-cam-status" style="padding:12px 16px;background:var(--bg-card);color:var(--muted);font-size:0.85rem;text-align:center">' +
            'Apunta la camara a la etiqueta del producto' +
          '</div>' +
          '<div style="display:flex;justify-content:center;gap:8px;padding:8px 16px;background:var(--bg-card)">' +
            '<button class="btn btn-sm btn-outline" id="pdv-cam-flash-btn" onclick="PDV.togglePDVCamFlash()">Flash</button>' +
            '<button class="btn btn-sm btn-gold" onclick="PDV.captureAndReadPDV()">Capturar</button>' +
          '</div>' +
          '<div id="pdv-cam-confirm-area" style="padding:12px 16px;display:none">' +
            '<div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Producto detectado</div>' +
            '<div id="pdv-cam-detected-text" style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;font-style:italic"></div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<select class="input" id="pdv-cam-prod-select" style="flex:1;min-width:140px"><option value="">Seleccionar producto</option></select>' +
              '<select class="input" id="pdv-cam-talla-select" style="width:120px"><option value="chico">Pequeno</option><option value="grande">Grande</option></select>' +
              '<button class="btn btn-sm btn-gold" onclick="PDV.addPDVCamProduct()">+ Agregar</button>' +
              '<button class="btn btn-sm btn-outline" onclick="PDV.cancelPDVCamDetect()">Seguir leyendo</button>' +
            '</div>' +
          '</div>' +
          '<div id="pdv-cam-cart-area" style="padding:12px 16px;max-height:200px;overflow-y:auto;display:none">' +
            '<div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Productos agregados</div>' +
            '<div id="pdv-cam-cart-items"></div>' +
          '</div>' +
          '<div id="pdv-cam-total-area" style="padding:12px 16px;border-top:1px solid var(--border);display:none">' +
            '<div class="venta-total-box">Total: $<span id="pdv-cam-venta-total">0</span></div>' +
            '<button class="btn btn-gold btn-block" style="margin-top:8px" onclick="PDV.confirmarVentaCamPDV()">Confirmar Venta</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    setTimeout(function() { PDV.startPDVCamera(); }, 300);
  },

  startPDVCamera() {
    var video = document.getElementById('pdv-cam-video');
    if (!video) return;
    var statusEl = document.getElementById('pdv-cam-status');
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(function(stream) {
      PDV._pdvCamStream = stream;
      video.srcObject = stream;
      video.play();
      if (statusEl) statusEl.textContent = 'Apunta la camara a la etiqueta del producto';
    }).catch(function(err) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No se pudo acceder a la camara: ' + err.message + '</span>';
    });
  },

  stopPDVCamera() {
    if (PDV._pdvCamStream) {
      PDV._pdvCamStream.getTracks().forEach(function(t) { t.stop(); });
      PDV._pdvCamStream = null;
    }
    PDV._pdvCamOcrRunning = false;
  },

  togglePDVCamFlash() {
    if (!PDV._pdvCamStream) return;
    var track = PDV._pdvCamStream.getVideoTracks()[0];
    if (!track) return;
    var caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) {
      var isOn = (track.getSettings && track.getSettings().torch) || false;
      track.applyConstraints({ advanced: [{ torch: !isOn }] });
      var btn = document.getElementById('pdv-cam-flash-btn');
      if (btn) btn.textContent = isOn ? 'Flash' : 'Flash ON';
    }
  },

  captureAndReadPDV() {
    if (PDV._pdvCamOcrRunning) return;
    var video = document.getElementById('pdv-cam-video');
    var canvas = document.getElementById('pdv-cam-canvas');
    var statusEl = document.getElementById('pdv-cam-status');
    if (!video || !canvas || video.readyState < 2) return;
    if (navigator.vibrate) navigator.vibrate(50);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    var imageData = canvas.toDataURL('image/png');
    PDV._pdvCamOcrRunning = true;
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--gold)">Leyendo etiqueta...</span>';
    if (typeof Tesseract === 'undefined') {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Libreria OCR no disponible. Verifica conexion a internet.</span>';
      PDV._pdvCamOcrRunning = false;
      return;
    }
    Tesseract.recognize(imageData, 'spa+eng', {
      logger: function() {}
    }).then(function(result) {
      PDV._pdvCamOcrRunning = false;
      var text = (result && result.data && result.data.text) || '';
      text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      PDV.handlePDVOCRResult(text);
    }).catch(function(err) {
      PDV._pdvCamOcrRunning = false;
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">Error al leer: ' + err.message + '</span>';
    });
  },

  handlePDVOCRResult(text) {
    var pdv = this.currentPDV;
    var statusEl = document.getElementById('pdv-cam-status');
    var confirmArea = document.getElementById('pdv-cam-confirm-area');
    var detectedTextEl = document.getElementById('pdv-cam-detected-text');
    var prodSelect = document.getElementById('pdv-cam-prod-select');
    if (!text || text.length < 2) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No se detecto texto. Intenta de nuevo.</span>';
      setTimeout(function() { if (statusEl) statusEl.textContent = 'Apunta la camara a la etiqueta del producto'; }, 2000);
      return;
    }
    // Build product list from PDV stock only
    var especias = ArcanoDB.getEspecias();
    var blends = ArcanoDB.getBlends();
    var pdvStock = pdv.stock || {};
    var allProducts = [];
    for (var i = 0; i < especias.length; i++) {
      var e = especias[i];
      var keyCh = 'especia_' + e.id + '_chico';
      var keyGr = 'especia_' + e.id + '_grande';
      if ((pdvStock[keyCh] || 0) > 0 || (pdvStock[keyGr] || 0) > 0) {
        allProducts.push({ tipo: 'especia', producto: e, tallas: [] });
        if ((pdvStock[keyCh] || 0) > 0) allProducts[allProducts.length - 1].tallas.push('chico');
        if ((pdvStock[keyGr] || 0) > 0) allProducts[allProducts.length - 1].tallas.push('grande');
      }
    }
    for (var j = 0; j < blends.length; j++) {
      var b = blends[j];
      var keyCh2 = 'blend_' + b.id + '_chico';
      var keyGr2 = 'blend_' + b.id + '_grande';
      if ((pdvStock[keyCh2] || 0) > 0 || (pdvStock[keyGr2] || 0) > 0) {
        allProducts.push({ tipo: 'blend', producto: b, tallas: [] });
        if ((pdvStock[keyCh2] || 0) > 0) allProducts[allProducts.length - 1].tallas.push('chico');
        if ((pdvStock[keyGr2] || 0) > 0) allProducts[allProducts.length - 1].tallas.push('grande');
      }
    }
    var ocrLower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var scored = [];
    for (var k = 0; k < allProducts.length; k++) {
      var p = allProducts[k];
      var name = (p.producto.nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      var nameWords = name.split(/\s+/);
      var matchCount = 0;
      for (var w = 0; w < nameWords.length; w++) {
        if (nameWords[w].length < 2) continue;
        if (ocrLower.indexOf(nameWords[w]) !== -1) matchCount++;
      }
      var score = nameWords.length > 0 ? matchCount / nameWords.length : 0;
      if (ocrLower.indexOf(name) !== -1) score = Math.max(score, 1.0);
      if (name.length >= 3 && ocrLower.indexOf(name.substring(0, Math.min(name.length, 6))) !== -1) score = Math.max(score, 0.7);
      if (score >= 0.5) scored.push({ tipo: p.tipo, producto: p.producto, score: score, tallas: p.tallas });
    }
    scored.sort(function(a, b) { return b.score - a.score; });
    if (confirmArea) confirmArea.style.display = 'block';
    if (detectedTextEl) detectedTextEl.textContent = 'Texto leido: "' + text.substring(0, 80) + (text.length > 80 ? '...' : '') + '"';
    if (prodSelect) {
      prodSelect.innerHTML = '<option value="">Seleccionar producto</option>';
      if (scored.length > 0) {
        for (var s = 0; s < Math.min(scored.length, 5); s++) {
          var sc = scored[s];
          var pct = Math.round(sc.score * 100);
          prodSelect.innerHTML += '<option value="' + sc.tipo + '|' + sc.producto.id + '">' + sc.producto.nombre + ' (' + pct + '%)</option>';
        }
        if (scored[0].score >= 0.7) {
          prodSelect.value = scored[0].tipo + '|' + scored[0].producto.id;
        }
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--green)">Producto detectado - confirma abajo</span>';
      } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--red)">No se encontro producto. Selecciona manualmente.</span>';
        for (var a = 0; a < allProducts.length; a++) {
          var ap = allProducts[a];
          prodSelect.innerHTML += '<option value="' + ap.tipo + '|' + ap.producto.id + '">' + ap.producto.nombre + '</option>';
        }
      }
    }
  },

  cancelPDVCamDetect() {
    var confirmArea = document.getElementById('pdv-cam-confirm-area');
    if (confirmArea) confirmArea.style.display = 'none';
    var statusEl = document.getElementById('pdv-cam-status');
    if (statusEl) statusEl.textContent = 'Apunta la camara a la etiqueta del producto';
  },

  addPDVCamProduct() {
    var pdv = this.currentPDV;
    var prodVal = document.getElementById('pdv-cam-prod-select').value;
    var tallaVal = document.getElementById('pdv-cam-talla-select').value;
    if (!prodVal) { toast('Selecciona un producto', 'err'); return; }
    var parts = prodVal.split('|');
    var tipo = parts[0];
    var prodId = Number(parts[1]);
    var producto = tipo === 'blend' ? ArcanoDB.getBlend(prodId) : ArcanoDB.getEspecia(prodId);
    if (!producto) { toast('Producto no encontrado', 'err'); return; }
    // Check PDV stock
    var pdvStock = pdv.stock || {};
    var stockKey = tipo + '_' + prodId + '_' + tallaVal;
    var stock = pdvStock[stockKey] || 0;
    var precioKey = tallaVal === 'grande' ? 'precioGrande' : 'precioChico';
    var precio = producto[precioKey] || 0;
    if (stock <= 0) { toast('Sin stock de ' + producto.nombre + ' (' + tallaVal + ') en este PDV', 'err'); return; }
    var found = false;
    for (var i = 0; i < this._pdvCamCart.length; i++) {
      if (this._pdvCamCart[i].tipo === tipo && this._pdvCamCart[i].productoId === prodId && this._pdvCamCart[i].talla === tallaVal) {
        // Check current cart qty + 1 vs PDV stock
        if (this._pdvCamCart[i].cantidad >= stock) { toast('Stock maximo en PDV: ' + stock, 'err'); return; }
        this._pdvCamCart[i].cantidad++;
        this._pdvCamCart[i].subtotal = this._pdvCamCart[i].precioUnitario * this._pdvCamCart[i].cantidad;
        found = true;
        break;
      }
    }
    if (!found) {
      this._pdvCamCart.push({ tipo: tipo, productoId: prodId, talla: tallaVal, productoNombre: producto.nombre, cantidad: 1, precioUnitario: precio, subtotal: precio });
    }
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    this.renderPDVCamCart();
    this.cancelPDVCamDetect();
  },

  renderPDVCamCart() {
    var cartArea = document.getElementById('pdv-cam-cart-area');
    var cartItems = document.getElementById('pdv-cam-cart-items');
    var totalArea = document.getElementById('pdv-cam-total-area');
    var totalSpan = document.getElementById('pdv-cam-venta-total');
    if (this._pdvCamCart.length === 0) {
      if (cartArea) cartArea.style.display = 'none';
      if (totalArea) totalArea.style.display = 'none';
      return;
    }
    if (cartArea) cartArea.style.display = 'block';
    if (totalArea) totalArea.style.display = 'block';
    var h = '';
    var total = 0;
    for (var i = 0; i < this._pdvCamCart.length; i++) {
      var item = this._pdvCamCart[i];
      var sub = item.cantidad * item.precioUnitario;
      total += sub;
      h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<div><div style="font-weight:600;font-size:0.9rem">' + this.esc(item.productoNombre) + '</div>' +
        '<div style="font-size:0.75rem;color:var(--muted)">' + item.talla + ' | $' + item.precioUnitario.toLocaleString() + ' c/u</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<button class="btn btn-sm btn-outline" onclick="PDV.pdvCamCartQty(' + i + ',-1)">-</button>' +
        '<span style="font-weight:700;min-width:24px;text-align:center">' + item.cantidad + '</span>' +
        '<button class="btn btn-sm btn-outline" onclick="PDV.pdvCamCartQty(' + i + ',1)">+</button>' +
        '<span style="font-weight:700;color:var(--gold);min-width:70px;text-align:right">$' + sub.toLocaleString() + '</span>' +
        '<button class="btn btn-sm btn-red" onclick="PDV.pdvCamCartRemove(' + i + ')">X</button>' +
        '</div></div>';
    }
    if (cartItems) cartItems.innerHTML = h;
    if (totalSpan) totalSpan.textContent = total.toLocaleString();
  },

  pdvCamCartQty(idx, delta) {
    if (!this._pdvCamCart[idx]) return;
    var item = this._pdvCamCart[idx];
    var newCant = item.cantidad + delta;
    // Check PDV stock
    var pdv = this.currentPDV;
    var stockKey = item.tipo + '_' + item.productoId + '_' + item.talla;
    var maxStock = (pdv.stock || {})[stockKey] || 0;
    if (newCant < 1 || newCant > maxStock) return;
    item.cantidad = newCant;
    item.subtotal = item.precioUnitario * item.cantidad;
    this.renderPDVCamCart();
  },

  pdvCamCartRemove(idx) {
    this._pdvCamCart.splice(idx, 1);
    this.renderPDVCamCart();
  },

  confirmarVentaCamPDV() {
    if (this._pdvCamCart.length === 0) { toast('No hay productos en la venta', 'err'); return; }
    var pdv = this.currentPDV;
    if (!pdv) return;
    var self = this;
    var saleData = {
      puntoDeVentaId: pdv.id,
      puntoDeVentaNombre: pdv.nombre,
      items: this._pdvCamCart.map(function(it) {
        return { tipo: it.tipo, productoId: it.productoId, talla: it.talla, cantidad: it.cantidad, precioUnitario: it.precioUnitario };
      })
    };
    this._showPDVPagoModal(saleData, function(data) {
      try {
        var venta = ArcanoDB.savePDVVenta(data);
        self.closeVentaCam();
        toast('Venta registrada! #' + venta.id);
        self.currentPDV = ArcanoDB.getPuntoDeVenta(pdv.id);
        self.render(document.getElementById('page-content'));
      } catch (err) {
        toast('Error: ' + err.message, 'err');
      }
    });
  },

  closeVentaCam() {
    this.stopPDVCamera();
    var modal = document.getElementById('pdv-cam-venta-modal');
    if (modal) modal.remove();
    this._pdvCamCart = [];
  },

  /* ==================== HELPERS ==================== */
  esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  /* ==================== GASTOS PDV ==================== */
  renderGastos(container) {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var allGastos = ArcanoDB.getGastos();
    var gastos = [];
    for (var gi = 0; gi < allGastos.length; gi++) {
      if (allGastos[gi].puntoDeVentaId === pdv.id) gastos.push(allGastos[gi]);
    }
    var today = new Date().toISOString().slice(0, 10);
    var mes = new Date().toISOString().slice(0, 7);
    var totalMes = 0;
    var gastoPorCat = {};
    for (var i = 0; i < gastos.length; i++) {
      var monto = gastos[i].monto || 0;
      if (gastos[i].fecha && gastos[i].fecha.startsWith(mes)) totalMes += monto;
      gastoPorCat[gastos[i].categoria || 'Otros'] = (gastoPorCat[gastos[i].categoria || 'Otros'] || 0) + monto;
    }
    var stats = ArcanoDB.getPDVStats(pdv.id);
    var h = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost" onclick="PDV.go(null)">← Puntos de Venta</button>' +
      '<h3 style="margin:0">' + this.esc(pdv.nombre) + '</h3>' +
      '<span class="badge" style="border:1px solid var(--red);color:var(--red)">Gastos</span></div>';
    h += '<div style="display:flex;gap:6px;margin:12px 0;flex-wrap:wrap">' +
      '<button class="btn btn-gold" onclick="PDV.formGasto()">+ Nuevo Gasto</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'stock\')">Stock</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'ventas\')">Ventas</button>' +
      '<button class="btn btn-outline" onclick="PDV.go(' + pdv.id + ',\'stats\')">Stats</button>' +
      '</div>';
    h += '<div style="border-bottom:2px solid var(--border);margin:0 0 16px"></div>';
    // KPIs
    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">' +
      '<div class="card"><div class="card-body text-center"><div class="fw7" style="font-size:1.3em;color:var(--red)">$' + totalMes.toLocaleString() + '</div><div class="text-muted text-sm">Gastos del Mes</div></div></div>' +
      '<div class="card"><div class="card-body text-center"><div class="fw7" style="font-size:1.3em;color:var(--green)">$' + (stats.totalIngresos || 0).toLocaleString() + '</div><div class="text-muted text-sm">Ingresos Totales</div></div></div>' +
      '<div class="card"><div class="card-body text-center"><div class="fw7" style="font-size:1.3em;color:' + ((stats.totalIngresos || 0) - totalMes >= 0 ? 'var(--green)' : 'var(--red)') + '">$' + ((stats.totalIngresos || 0) - totalMes).toLocaleString() + '</div><div class="text-muted text-sm">Ganancia Neta</div></div></div>' +
      '</div>';
    // Por categoria
    var catKeys = Object.keys(gastoPorCat).sort(function(a, b) { return gastoPorCat[b] - gastoPorCat[a]; });
    if (catKeys.length > 0) {
      var maxCat = gastoPorCat[catKeys[0]] || 1;
      h += '<div class="card" style="margin-bottom:16px"><div class="card-header"><h4>Por Categoria</h4></div><div class="card-body">';
      for (var ci = 0; ci < catKeys.length; ci++) {
        var pct = Math.round(gastoPorCat[catKeys[ci]] / maxCat * 100);
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:80px;font-size:0.85rem">' + catKeys[ci] + '</span><div style="flex:1;height:8px;background:var(--bg2);border-radius:4px"><div style="width:' + pct + '%;height:100%;background:var(--red);border-radius:4px"></div></div><span style="font-size:0.85rem;font-weight:600">$' + gastoPorCat[catKeys[ci]].toLocaleString() + '</span></div>';
      }
      h += '</div></div>';
    }
    // Tabla
    h += '<div class="card"><div class="card-header"><h4>Historial de Gastos</h4></div><div class="card-body">';
    if (gastos.length === 0) {
      h += '<p class="text-muted text-center">Sin gastos registrados en este punto de venta.</p>';
    } else {
      h += '<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Categoria</th><th>Descripcion</th><th>Monto</th><th></th></tr></thead><tbody>';
      for (var i = 0; i < gastos.length; i++) {
        var g = gastos[i];
        h += '<tr><td>' + (g.fecha || '') + '</td><td><span class="badge" style="border:1px solid var(--red);color:var(--red)">' + (g.categoria || 'Otros') + '</span></td><td class="text-sm">' + this.esc(g.descripcion || '-') + '</td><td class="fw7" style="color:var(--red)">$' + (g.monto || 0).toLocaleString() + '</td>' +
          '<td><button class="btn btn-sm btn-red" onclick="PDV.delGasto(' + g.id + ')">X</button></td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div></div>';
    container.innerHTML = h;
  },

  formGasto(editId) {
    var pdv = this.currentPDV;
    if (!pdv) return;
    var cats = ArcanoDB.getGastosCategorias();
    var existing = null;
    if (editId) {
      var allGastos = ArcanoDB.getGastos();
      for (var i = 0; i < allGastos.length; i++) { if (allGastos[i].id === editId && allGastos[i].puntoDeVentaId === pdv.id) { existing = allGastos[i]; break; } }
    }
    var isEdit = !!existing;
    var catOpts = '';
    for (var ci = 0; ci < cats.length; ci++) {
      var sel = (existing && existing.categoria === cats[ci]) ? ' selected' : '';
      catOpts += '<option value="' + cats[ci] + '"' + sel + '>' + cats[ci] + '</option>';
    }
    var h = '<div class="form-group"><label>Fecha</label>' +
      '<input type="date" class="input" id="pdv-g-fecha" value="' + (existing ? existing.fecha : new Date().toISOString().slice(0, 10)) + '"></div>' +
      '<div class="form-group"><label>Categoria</label><select class="input" id="pdv-g-cat"><option value="">Seleccionar</option>' + catOpts + '</select></div>' +
      '<div class="form-group"><label>Descripcion</label><input type="text" class="input" id="pdv-g-desc" value="' + this.esc(existing ? existing.descripcion : '') + '" placeholder="Ej: Pago puesto feria"></div>' +
      '<div class="form-group"><label>Monto ($)</label><input type="number" class="input" id="pdv-g-monto" value="' + (existing ? existing.monto : '') + '" placeholder="0" min="0"></div>';
    h += '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
      '<button class="btn btn-gold" id="btn-save-pdv-g">' + (isEdit ? 'Guardar' : 'Agregar') + '</button></div>';
    openModal(isEdit ? 'Editar Gasto' : 'Nuevo Gasto', h);
    document.getElementById('btn-save-pdv-g').addEventListener('click', function() {
      var fecha = document.getElementById('pdv-g-fecha').value;
      var cat = document.getElementById('pdv-g-cat').value;
      var desc = document.getElementById('pdv-g-desc').value.trim();
      var monto = Number(document.getElementById('pdv-g-monto').value) || 0;
      if (!fecha) { alert('Selecciona una fecha'); return; }
      if (!cat) { alert('Selecciona una categoria'); return; }
      if (monto <= 0) { alert('Ingresa un monto mayor a 0'); return; }
      var data = isEdit ? Object.assign({}, existing) : {};
      data.fecha = fecha;
      data.categoria = cat;
      data.descripcion = desc;
      data.monto = monto;
      data.puntoDeVentaId = pdv.id;
      try {
        ArcanoDB.saveGasto(data);
        closeModal();
        PDV.renderGastos(document.getElementById('page-content'));
      } catch (err) { alert('Error: ' + err.message); }
    });
  },

  delGasto(id) {
    if (!confirm('Eliminar este gasto?')) return;
    ArcanoDB.deleteGasto(id);
    this.renderGastos(document.getElementById('page-content'));
  }
};

// Listen for hash changes
document.addEventListener('hashchange', function() {
  if (App.currentPage === 'puntosdeventa') {
    PDV.render(document.getElementById('page-content'));
  }
});
