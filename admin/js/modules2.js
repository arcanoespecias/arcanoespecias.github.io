// ===================== BLENDS =====================
let blendIngRows = [];
let editingBlendId = null;
let editingBEId = null;

function openModalBlend(id = null) {
  editingBlendId = id;
  blendIngRows = [];
  document.getElementById('modal-blend-titulo').textContent = id ? 'Editar blend' : 'Nuevo Blend';
  const db = getDB();
  if (id) {
    const bl = db.blends.find(b => b.id === id);
    if (bl) {
      document.getElementById('bl-nombre').value       = bl.nombre;
      document.getElementById('bl-peso-c').value       = bl.pesoChico || '';
      document.getElementById('bl-peso-g').value       = bl.pesoGrande || '';
      document.getElementById('bl-pventa-c').value     = bl.pVentaChico || '';
      document.getElementById('bl-pventa-g').value     = bl.pVentaGrande || '';
      document.getElementById('bl-notas').value        = bl.notas || '';
      blendIngRows = bl.ingredientes.map(i => ({ ...i, _rid: nid() }));
    }
  } else {
    document.getElementById('bl-nombre').value    = '';
    document.getElementById('bl-peso-c').value    = '';
    document.getElementById('bl-peso-g').value    = '';
    document.getElementById('bl-pventa-c').value  = '';
    document.getElementById('bl-pventa-g').value  = '';
    document.getElementById('bl-notas').value     = '';
    blendIngRows = [{ _rid: nid(), espId: null, gramos: 0 }];
  }
  renderIngRows();
  calcBlendModal();
  openModal('modal-blend');
}

function addIngRow() {
  blendIngRows.push({ _rid: nid(), espId: null, gramos: 0 });
  renderIngRows();
}

function removeIngRow(rid) {
  blendIngRows = blendIngRows.filter(r => r._rid !== rid);
  renderIngRows();
  calcBlendModal();
}

function renderIngRows() {
  const esp = getDB().especias;
  const opts = esp.map(e => `<option value="${e.id}">${e.nombre} (${fmt(e.precioKg)}/kg)</option>`).join('');
  document.getElementById('blend-ings-rows').innerHTML = blendIngRows.map(r => `
    <div class="ing-row" id="row-${r._rid}">
      <select onchange="ingChange(${r._rid},'espId',this.value)">
        <option value="">-- Especia --</option>${opts}
      </select>
      <input type="number" min="0" max="1000" placeholder="gramos" value="${r.gramos || ''}"
        oninput="ingChange(${r._rid},'gramos',+this.value)">
      <div class="ing-cost" id="ic-${r._rid}">$0</div>
      <button class="btn btn-red btn-sm" onclick="removeIngRow(${r._rid})">×</button>
    </div>
  `).join('');
  blendIngRows.forEach(r => {
    const sel = document.querySelector(`#row-${r._rid} select`);
    if (sel && r.espId) sel.value = r.espId;
    updateIngCost(r);
  });
}

function ingChange(rid, field, val) {
  const r = blendIngRows.find(x => x._rid === rid);
  if (r) { r[field] = val; updateIngCost(r); calcBlendModal(); }
}

function updateIngCost(r) {
  const el = document.getElementById('ic-' + r._rid);
  if (!el) return;
  if (!r.espId || !r.gramos) { el.textContent = '$0'; return; }
  const esp = getDB().especias.find(e => e.id == r.espId);
  el.textContent = esp ? fmt((esp.precioKg / 1000) * r.gramos) : '$0';
}

function calcBlendModal() {
  const db = getDB(); const c = db.costos;
  let costoKg = 0, totalG = 0;
  blendIngRows.forEach(r => {
    if (!r.espId || !r.gramos) return;
    const esp = db.especias.find(e => e.id == r.espId);
    if (!esp) return;
    costoKg += (esp.precioKg / 1000) * r.gramos;
    totalG  += +r.gramos;
  });
  const costo100 = costoKg / 10;
  const pC = +document.getElementById('bl-peso-c')?.value || 0;
  const pG = +document.getElementById('bl-peso-g')?.value || 0;
  const mpC = (costoKg / 1000) * pC;
  const mpG = (costoKg / 1000) * pG;
  const fC = c.envChico  + c.pkgChico  + c.etiqueta + c.mo + c.otros;
  const fG = c.envGrande + c.pkgGrande + c.etiqueta + c.mo + c.otros;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('bc-kg',    fmt(costoKg));
  set('bc-100',   fmt(costo100));
  set('bc-grams', `${totalG}g de 1000g`);
  set('bc-mp-c',  fmt(mpC));
  set('bc-fij-c', fmt(fC));
  set('bc-tot-c', fmt(mpC + fC));
  set('bc-mp-g',  fmt(mpG));
  set('bc-fij-g', fmt(fG));
  set('bc-tot-g', fmt(mpG + fG));

  const gramEl = document.getElementById('bc-grams');
  if (gramEl) gramEl.style.color = Math.abs(totalG - 1000) < 1 ? 'var(--green)' : 'var(--yellow)';
}

function guardarBlend() {
  const nombre = document.getElementById('bl-nombre').value.trim();
  if (!nombre) { showAlert('alert-blend','El nombre es obligatorio.','err'); return; }
  const db = getDB();
  const ings = blendIngRows.filter(r => r.espId && r.gramos > 0).map(r => {
    const esp = db.especias.find(e => e.id == r.espId);
    return { espId: +r.espId, nombre: esp?.nombre || '', gramos: +r.gramos, precioKg: esp?.precioKg || 0 };
  });
  if (!ings.length) { showAlert('alert-blend','Agregá al menos una especia.','err'); return; }
  const bl = {
    nombre, ingredientes: ings,
    pesoChico:   +document.getElementById('bl-peso-c').value   || 0,
    pesoGrande:  +document.getElementById('bl-peso-g').value   || 0,
    pVentaChico: +document.getElementById('bl-pventa-c').value || 0,
    pVentaGrande:+document.getElementById('bl-pventa-g').value || 0,
    notas:        document.getElementById('bl-notas').value.trim(),
  };
  if (editingBlendId) {
    bl.id = editingBlendId;
    const i = db.blends.findIndex(b => b.id === editingBlendId);
    if (i >= 0) db.blends[i] = bl;
  } else { bl.id = nid(); db.blends.push(bl); }
  saveDB(db);
  toast(editingBlendId ? 'Blend actualizado ✓' : 'Blend creado ✓');
  setTimeout(() => closeModal('modal-blend'), 700);
  renderBlends();
}

function eliminarBlend(id) {
  if (!confirm('¿Eliminar este blend?')) return;
  const db = getDB(); db.blends = db.blends.filter(b => b.id !== id); saveDB(db);
  renderBlends(); toast('Blend eliminado');
}

function toggleBlend(id) {
  const body  = document.getElementById('bb-' + id);
  const arrow = document.getElementById('arr-' + id);
  body.classList.toggle('open');
  if (arrow) arrow.textContent = body.classList.contains('open') ? '▲' : '▼';
}

function renderBlends() {
  const db = getDB(); const c = db.costos;
  const el = document.getElementById('lista-blends');
  if (!db.blends.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🫙</div><p>No hay blends. Creá el primero.</p></div>`;
    return;
  }
  el.innerHTML = db.blends.map(bl => {
    const cd = calcBlendCostData(bl, c);
    const prod = calcProduccion(bl, db.especias);
    const totalGramos = bl.ingredientes.reduce((s, i) => s + i.gramos, 0);
    return `
    <div class="blend-card">
      <div class="blend-header" onclick="toggleBlend(${bl.id})">
        <div>
          <div class="blend-name">${bl.nombre}</div>
          <div class="flex gap-8" style="margin-top:5px;flex-wrap:wrap">
            <span class="badge ba">Costo/kg: ${fmt(cd.costoKg)}</span>
            <span class="badge ba">Costo/100g: ${fmt(cd.costo100g)}</span>
            ${totalGramos !== 1000 ? `<span class="badge by">${totalGramos}g/1kg</span>` : ''}
          </div>
        </div>
        <div class="flex gap-8 items-center" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="openModalBlend(${bl.id})">✏ Editar</button>
          <button class="btn btn-red btn-sm" onclick="eliminarBlend(${bl.id})">🗑</button>
          <span id="arr-${bl.id}" class="text-muted text-xs" style="padding:4px">▼</span>
        </div>
      </div>
      <div class="blend-body" id="bb-${bl.id}">
        <div class="blend-inner">
          ${bl.notas ? `<div class="cost-box mb-16" style="border-color:var(--gold-dim)"><span class="text-xs text-muted">📝 Notas: </span>${bl.notas}</div>` : ''}
          <h3 style="margin-bottom:10px">Ingredientes — fórmula /1kg</h3>
          <div class="tw mb-16">
            <table>
              <thead><tr><th>Especia</th><th>Gramos</th><th>%</th><th>Costo</th></tr></thead>
              <tbody>
                ${bl.ingredientes.map(i => `<tr>
                  <td>${i.nombre}</td>
                  <td>${i.gramos}g</td>
                  <td class="text-muted">${Math.round(i.gramos/10)}%</td>
                  <td class="text-gold">${fmt((i.precioKg/1000)*i.gramos)}</td>
                </tr>`).join('')}
                <tr style="font-weight:700">
                  <td>TOTAL</td><td>${totalGramos}g</td><td>${Math.round(totalGramos/10)}%</td>
                  <td class="text-gold">${fmt(cd.costoKg)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="g2">
            <div class="cost-box">
              <div class="fw7 text-gold text-sm mb-12">ENVASE CHICO ${bl.pesoChico ? '('+bl.pesoChico+'g)' : '— sin peso'}</div>
              <div class="cost-row"><span>Mat. prima</span><span>${fmt(cd.mpChico)}</span></div>
              <div class="cost-row"><span>Envase + extras</span><span>${fmt(cd.fijosC)}</span></div>
              <div class="cost-row total"><span>Costo total</span><span>${fmt(cd.totalC)}</span></div>
              ${bl.pVentaChico ? `
                <div class="cost-row" style="margin-top:6px"><span>Precio venta</span><span class="text-green fw7">${fmt(bl.pVentaChico)}</span></div>
                <div class="cost-row ${cd.margenC > 0 ? 'profit' : 'loss'}"><span>Margen</span><span>${cd.margenC !== null ? Math.round(cd.margenC)+'%' : '—'}</span></div>
              ` : '<div class="text-muted text-xs" style="margin-top:6px">Sin precio de venta</div>'}
              <div class="divider"></div>
              <div class="cost-row text-xs"><span class="text-muted">Producción posible</span><span class="text-gold fw7">${prod.unidadesC} u.</span></div>
            </div>
            <div class="cost-box">
              <div class="fw7 text-gold text-sm mb-12">ENVASE GRANDE ${bl.pesoGrande ? '('+bl.pesoGrande+'g)' : '— sin peso'}</div>
              <div class="cost-row"><span>Mat. prima</span><span>${fmt(cd.mpGrande)}</span></div>
              <div class="cost-row"><span>Envase + extras</span><span>${fmt(cd.fijosG)}</span></div>
              <div class="cost-row total"><span>Costo total</span><span>${fmt(cd.totalG)}</span></div>
              ${bl.pVentaGrande ? `
                <div class="cost-row" style="margin-top:6px"><span>Precio venta</span><span class="text-green fw7">${fmt(bl.pVentaGrande)}</span></div>
                <div class="cost-row ${cd.margenG > 0 ? 'profit' : 'loss'}"><span>Margen</span><span>${cd.margenG !== null ? Math.round(cd.margenG)+'%' : '—'}</span></div>
              ` : '<div class="text-muted text-xs" style="margin-top:6px">Sin precio de venta</div>'}
              <div class="divider"></div>
              <div class="cost-row text-xs"><span class="text-muted">Producción posible</span><span class="text-gold fw7">${prod.unidadesG} u.</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===================== EXPORTAR BLENDS EXCEL =====================
function exportBlendsExcel() {
  const db = getDB();
  if (!db.blends.length) {
    toast('No hay blends para exportar.', 'err');
    return;
  }
  if (typeof XLSX !== 'undefined') {
    _doExportBlendsExcel();
    return;
  }
  toast('Cargando libreria Excel...', 'gold');
  const s = document.createElement('script');
  s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  s.onload = function() { _doExportBlendsExcel(); };
  s.onerror = function() { toast('Error al cargar libreria Excel. Verifica tu conexion.', 'err'); };
  document.head.appendChild(s);
}

function _doExportBlendsExcel() {
  const db = getDB();
  const c = db.costos;

  // ---- HOJA 1: Resumen de Blends ----
  const resumenRows = db.blends.map(bl => {
    const cd = calcBlendCostData(bl, c);
    const prod = calcProduccion(bl, db.especias);
    const totalG = bl.ingredientes.reduce((s, i) => s + i.gramos, 0);
    const ingNombres = bl.ingredientes.map(i => i.nombre + ' (' + i.gramos + 'g)').join(', ');
    return {
      'Nombre': bl.nombre,
      'Ingredientes': ingNombres,
      'Cantidad ingredientes': bl.ingredientes.length,
      'Peso total formula': totalG + 'g',
      'Costo/kg': Math.round(cd.costoKg),
      'Costo/100g': Math.round(cd.costo100g),
      'Peso envase chico (g)': bl.pesoChico || '',
      'Costo total chico': Math.round(cd.totalC),
      'Precio venta chico': bl.pVentaChico || '',
      'Margen chico %': cd.margenC !== null ? Math.round(cd.margenC) + '%' : '',
      'Produccion posible chico (u.)': prod.unidadesC,
      'Peso envase grande (g)': bl.pesoGrande || '',
      'Costo total grande': Math.round(cd.totalG),
      'Precio venta grande': bl.pVentaGrande || '',
      'Margen grande %': cd.margenG !== null ? Math.round(cd.margenG) + '%' : '',
      'Produccion posible grande (u.)': prod.unidadesG,
      'Notas': bl.notas || ''
    };
  });

  // ---- HOJA 2: Ingredientes detallados ----
  const ingRows = [];
  db.blends.forEach(bl => {
    const cd = calcBlendCostData(bl, c);
    const totalG = bl.ingredientes.reduce((s, i) => s + i.gramos, 0);
    bl.ingredientes.forEach((ing, idx) => {
      const costoIng = (ing.precioKg / 1000) * ing.gramos;
      ingRows.push({
        'Blend': bl.nombre,
        '#': idx + 1,
        'Especia': ing.nombre,
        'Gramos en formula': ing.gramos,
        '% sobre 1kg': Math.round(ing.gramos / 10) + '%',
        'Precio/kg especia': ing.precioKg || 0,
        'Costo en formula': Math.round(costoIng),
        'Costo/kg del blend': Math.round(cd.costoKg),
        'Peso envase chico (g)': bl.pesoChico || '',
        'Peso envase grande (g)': bl.pesoGrande || ''
      });
    });
    // Fila subtotal del blend
    ingRows.push({
      'Blend': 'SUBTOTAL: ' + bl.nombre,
      '#': '',
      'Especia': bl.ingredientes.length + ' ingredientes',
      'Gramos en formula': totalG,
      '% sobre 1kg': Math.round(totalG / 10) + '%',
      'Precio/kg especia': '',
      'Costo en formula': Math.round(cd.costoKg),
      'Costo/kg del blend': '',
      'Peso envase chico (g)': '',
      'Peso envase grande (g)': ''
    });
    // Fila vacia separadora
    ingRows.push({
      'Blend': '', '#': '', 'Especia': '', 'Gramos en formula': '',
      '% sobre 1kg': '', 'Precio/kg especia': '', 'Costo en formula': '',
      'Costo/kg del blend': '', 'Peso envase chico (g)': '', 'Peso envase grande (g)': ''
    });
  });

  // ---- HOJA 3: Costos fijos ----
  const costosFijosRows = [
    { 'Concepto': 'Envase chico ($/u)', 'Valor': c.envChico },
    { 'Concepto': 'Envase grande ($/u)', 'Valor': c.envGrande },
    { 'Concepto': 'Packaging chico ($/u)', 'Valor': c.pkgChico },
    { 'Concepto': 'Packaging grande ($/u)', 'Valor': c.pkgGrande },
    { 'Concepto': 'Etiqueta ($/u)', 'Valor': c.etiqueta },
    { 'Concepto': 'Mano de obra ($/u)', 'Valor': c.mo },
    { 'Concepto': 'Otros ($/u)', 'Valor': c.otros },
    { 'Concepto': 'Costos fijos chico (total)', 'Valor': c.envChico + c.pkgChico + c.etiqueta + c.mo + c.otros },
    { 'Concepto': 'Costos fijos grande (total)', 'Valor': c.envGrande + c.pkgGrande + c.etiqueta + c.mo + c.otros },
  ];

  // Crear workbook
  const wb = XLSX.utils.book_new();

  // Hoja resumen
  const ws1 = XLSX.utils.json_to_sheet(resumenRows);
  // Ajustar anchos de columna
  ws1['!cols'] = [
    { wch: 22 },  // Nombre
    { wch: 55 },  // Ingredientes
    { wch: 14 },  // Cantidad ingredientes
    { wch: 14 },  // Peso total
    { wch: 12 },  // Costo/kg
    { wch: 12 },  // Costo/100g
    { wch: 16 },  // Peso chico
    { wch: 14 },  // Costo total chico
    { wch: 14 },  // Precio venta chico
    { wch: 12 },  // Margen chico
    { wch: 16 },  // Prod posible chico
    { wch: 16 },  // Peso grande
    { wch: 14 },  // Costo total grande
    { wch: 14 },  // Precio venta grande
    { wch: 12 },  // Margen grande
    { wch: 16 },  // Prod posible grande
    { wch: 35 },  // Notas
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen Blends');

  // Hoja ingredientes
  const ws2 = XLSX.utils.json_to_sheet(ingRows);
  ws2['!cols'] = [
    { wch: 24 },  // Blend
    { wch: 4 },   // #
    { wch: 24 },  // Especia
    { wch: 14 },  // Gramos
    { wch: 12 },  // %
    { wch: 14 },  // Precio/kg
    { wch: 14 },  // Costo formula
    { wch: 16 },  // Costo/kg blend
    { wch: 16 },  // Peso chico
    { wch: 16 },  // Peso grande
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Ingredientes');

  // Hoja costos fijos
  const ws3 = XLSX.utils.json_to_sheet(costosFijosRows);
  ws3['!cols'] = [
    { wch: 30 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Costos Fijos');

  // Generar y descargar
  const nombreArchivo = 'Arcano_Blends_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  XLSX.writeFile(wb, nombreArchivo);
  toast('Excel descargado: ' + nombreArchivo);
}

// ===================== VENTAS =====================
let ventaItems = [];
let editingVentaId = null;

function openModalVenta(id = null) {
  editingVentaId = id;
  ventaItems = [];
  document.getElementById('modal-venta-titulo').textContent = id ? 'Editar venta' : 'Nueva venta';
  const db = getDB();
  // Populate product select (blends + especias)
  const sel = document.getElementById('v-prod-sel');
  sel.innerHTML = '<option value="">-- Producto --</option>';
  sel.innerHTML += '<optgroup label="Blends — Chico">' +
    db.blends.filter(b=>b.pVentaChico>0).map(b=>`<option value="bc-${b.id}">${b.nombre} (chico) — ${fmt(b.pVentaChico)}</option>`).join('') + '</optgroup>';
  sel.innerHTML += '<optgroup label="Blends — Grande">' +
    db.blends.filter(b=>b.pVentaGrande>0).map(b=>`<option value="bg-${b.id}">${b.nombre} (grande) — ${fmt(b.pVentaGrande)}</option>`).join('') + '</optgroup>';
  sel.innerHTML += '<optgroup label="Especias">' +
    db.especias.filter(e=>e.precioKg>0).map(e=>`<option value="e-${e.id}">${e.nombre}</option>`).join('') + '</optgroup>';

  if (id) {
    const v = db.ventas.find(x => x.id === id);
    if (v) {
      ventaItems = [...v.items];
      document.getElementById('v-desc').value   = v.descuento || 0;
      document.getElementById('v-estado').value = v.estado || 'completada';
      document.getElementById('v-nota').value   = v.nota || '';
    }
  } else {
    document.getElementById('v-desc').value   = '0';
    document.getElementById('v-estado').value = 'completada';
    document.getElementById('v-nota').value   = '';
  }
  renderVentaItems();
  openModal('modal-venta');
}

function agregarItemVenta() {
  const sel = document.getElementById('v-prod-sel');
  const val = sel.value; if (!val) return;
  const qty = parseInt(document.getElementById('v-qty').value) || 1;
  const db  = getDB();
  let nombre, precio;
  if (val.startsWith('bc-')) {
    const bl = db.blends.find(b => b.id === +val.slice(3));
    if (!bl) return;
    nombre = bl.nombre + ' (chico)'; precio = bl.pVentaChico;
  } else if (val.startsWith('bg-')) {
    const bl = db.blends.find(b => b.id === +val.slice(3));
    if (!bl) return;
    nombre = bl.nombre + ' (grande)'; precio = bl.pVentaGrande;
  } else {
    const esp = db.especias.find(e => e.id === +val.slice(2));
    if (!esp) return;
    nombre = esp.nombre; precio = 0; // precio libre para especias sueltas
  }
  const ex = ventaItems.find(i => i.key === val);
  if (ex) ex.qty += qty;
  else ventaItems.push({ key: val, nombre, precio, qty });
  renderVentaItems();
}

function removeVentaItem(idx) { ventaItems.splice(idx, 1); renderVentaItems(); }

function renderVentaItems() {
  const el = document.getElementById('v-items-lista');
  if (!ventaItems.length) {
    el.innerHTML = '<div class="text-muted text-sm" style="padding:8px">Sin productos aún</div>';
    recalcVenta(); return;
  }
  el.innerHTML = ventaItems.map((i, idx) => `
    <div class="flex items-center justify-between" style="padding:7px 0;border-bottom:1px solid var(--border);gap:8px">
      <span class="text-sm">${i.nombre} × ${i.qty}</span>
      <div class="flex items-center gap-8">
        <input type="number" value="${i.precio}" style="width:100px" oninput="ventaItems[${idx}].precio=+this.value;recalcVenta()">
        <button class="btn btn-red btn-sm" onclick="removeVentaItem(${idx})">×</button>
      </div>
    </div>
  `).join('');
  recalcVenta();
}

function recalcVenta() {
  const sub  = ventaItems.reduce((s, i) => s + i.precio * i.qty, 0);
  const desc = parseFloat(document.getElementById('v-desc')?.value || 0) || 0;
  const total = Math.max(0, sub - desc);
  const el = document.getElementById('v-total');
  if (el) el.textContent = fmt(total);
}

function guardarVenta() {
  if (!ventaItems.length) { showAlert('alert-venta','Agregá al menos un producto.','err'); return; }
  const db   = getDB();
  const desc = parseFloat(document.getElementById('v-desc').value) || 0;
  const sub  = ventaItems.reduce((s, i) => s + i.precio * i.qty, 0);
  const v = {
    items:     [...ventaItems],
    subtotal:  sub,
    descuento: desc,
    total:     Math.max(0, sub - desc),
    estado:    document.getElementById('v-estado').value,
    nota:      document.getElementById('v-nota').value.trim(),
    usuario:   currentUser?.nombre || 'Sistema',
  };
  if (editingVentaId) {
    v.id = editingVentaId;
    const old = db.ventas.find(x => x.id === editingVentaId);
    v.fecha = old?.fecha || new Date().toISOString();
    const i = db.ventas.findIndex(x => x.id === editingVentaId);
    if (i >= 0) db.ventas[i] = v;
  } else {
    v.id = nid(); v.fecha = new Date().toISOString();
    db.ventas.unshift(v);
  }
  saveDB(db);
  toast('Venta guardada ✓');
  setTimeout(() => closeModal('modal-venta'), 700);
  renderVentas(); renderDashboard();
}

function eliminarVenta(id) {
  if (!confirm('¿Eliminar esta venta?')) return;
  const db = getDB(); db.ventas = db.ventas.filter(v => v.id !== id); saveDB(db);
  renderVentas(); renderDashboard(); toast('Venta eliminada');
}

function renderVentas() {
  const q   = (document.getElementById('search-ventas')?.value || '').toLowerCase();
  const est = document.getElementById('filter-estado')?.value || '';
  const db  = getDB();
  let list  = db.ventas;
  if (q)   list = list.filter(v => v.items.some(i => i.nombre.toLowerCase().includes(q)) || (v.nota||'').toLowerCase().includes(q));
  if (est) list = list.filter(v => v.estado === est);
  const tbody = document.getElementById('tabla-ventas');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">🧾</div><p>Sin ventas.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(v => `<tr>
    <td class="text-muted text-xs">${fmtDateTime(v.fecha)}</td>
    <td class="text-sm" style="max-width:180px">${v.items.map(i=>`${i.nombre}×${i.qty}`).join(', ')}</td>
    <td>${fmt(v.subtotal)}</td>
    <td class="text-muted">${v.descuento ? fmt(v.descuento) : '—'}</td>
    <td class="fw7 text-gold">${fmt(v.total)}</td>
    <td>${estadoBadge(v.estado)}</td>
    <td class="tr" style="white-space:nowrap">
      <button class="btn btn-ghost btn-sm" onclick="openModalVenta(${v.id})">✏</button>
      <button class="btn btn-red btn-sm" onclick="eliminarVenta(${v.id})">🗑</button>
    </td>
  </tr>`).join('');
}

// ===================== REPORTES =====================
function showTab(id) {
  document.querySelectorAll('#page-reportes > div[id^="rep-"]').forEach(d => d.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  renderReportes();
}

function renderReportes() {
  const db   = getDB(); const c = db.costos;
  const comp = db.ventas.filter(v => v.estado !== 'cancelada');
  const total = comp.reduce((s, v) => s + v.total, 0);
  const mesKey = new Date().toLocaleDateString('es-AR', { year:'numeric', month:'long' });

  // Por mes
  const porMes = {};
  comp.forEach(v => {
    const k = new Date(v.fecha).toLocaleDateString('es-AR', { year:'numeric', month:'long' });
    if (!porMes[k]) porMes[k] = { count:0, total:0 };
    porMes[k].count++; porMes[k].total += v.total;
  });
  const mesActual = porMes[mesKey] || { count:0, total:0 };

  document.getElementById('rep-stats').innerHTML = `
    <div class="stat"><div class="stat-label">Total histórico</div><div class="stat-value">${fmt(total)}</div></div>
    <div class="stat"><div class="stat-label">Ventas totales</div><div class="stat-value">${comp.length}</div></div>
    <div class="stat"><div class="stat-label">Este mes</div><div class="stat-value">${fmt(mesActual.total)}</div><div class="stat-sub">${mesActual.count} ventas</div></div>
  `;

  document.getElementById('rep-mes-tabla').innerHTML = Object.keys(porMes).reverse().slice(0,12).map(k => `<tr>
    <td>${k}</td><td>${porMes[k].count}</td>
    <td class="fw7 text-gold">${fmt(porMes[k].total)}</td>
    <td>${fmt(porMes[k].total / porMes[k].count)}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="text-muted">Sin datos</td></tr>';

  // Por producto
  const porProd = {};
  comp.forEach(v => v.items.forEach(i => {
    if (!porProd[i.nombre]) porProd[i.nombre] = { qty:0, total:0 };
    porProd[i.nombre].qty   += i.qty;
    porProd[i.nombre].total += i.precio * i.qty;
  }));
  const prodList = Object.entries(porProd).sort((a,b) => b[1].total - a[1].total);
  document.getElementById('rep-prod-tabla').innerHTML = prodList.map(([n,{qty,t2}],_,arr) => {
    const tot = porProd[n].total;
    return `<tr>
      <td>${n}</td><td>${porProd[n].qty}</td>
      <td class="fw7 text-gold">${fmt(tot)}</td>
      <td>${total ? Math.round(tot/total*100)+'%' : '—'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="text-muted">Sin datos</td></tr>';

  // Rentabilidad de blends
  document.getElementById('rep-rent-tabla').innerHTML = db.blends.map(bl => {
    const cd = calcBlendCostData(bl, c);
    return `<tr>
      <td><strong>${bl.nombre}</strong></td>
      <td>${fmt(cd.costoKg)}</td>
      <td>${fmt(cd.totalC)} ${bl.pVentaChico ? `<span class="badge ${cd.margenC>0?'bg':'br'} ml-4">${Math.round(cd.margenC)}%</span>` : '—'}</td>
      <td>${fmt(cd.totalG)} ${bl.pVentaGrande ? `<span class="badge ${cd.margenG>0?'bg':'br'}">${Math.round(cd.margenG)}%</span>` : '—'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="text-muted">Sin blends</td></tr>';
}

// ===================== AJUSTES (usuarios + GitHub sync) =====================
function renderAjustes() {
  const db = getDB();
  document.getElementById('ajustes-usuarios').innerHTML = db.usuarios.map(u => `
    <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="flex items-center gap-8">
        <div class="user-avatar" style="width:32px;height:32px;font-size:.9rem">${u.emoji}</div>
        <div>
          <div class="fw7 text-sm">${u.nombre}</div>
          <div class="text-xs text-muted">${u.rol} · PIN: ${'●'.repeat(u.pin.length)}</div>
        </div>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm" onclick="openModalUsuario(${u.id})">✏</button>
        ${db.usuarios.length > 1 ? `<button class="btn btn-red btn-sm" onclick="eliminarUsuario(${u.id})">🗑</button>` : ''}
      </div>
    </div>
  `).join('');
  renderGhAjustes();
}

// ===================== SYNC UI (Firebase) =====================

function renderGhAjustes() {
  var badge = document.getElementById('gh-status-badge');
  var info = document.getElementById('gh-connected-info');
  if (badge) {
    if (typeof fbIsConnected === 'function' && fbIsConnected()) {
      badge.className = 'badge bg';
      badge.textContent = 'En linea';
    } else {
      badge.className = 'badge br';
      badge.textContent = 'Desconectado';
    }
  }
  if (info) info.style.display = 'block';
}

// ===================== USUARIOS =====================

let editingUserId = null;
function openModalUsuario(id = null) {
  editingUserId = id;
  document.getElementById('modal-usr-titulo').textContent = id ? 'Editar usuario' : 'Nuevo usuario';
  const db = getDB();
  if (id) {
    const u = db.usuarios.find(x => x.id === id);
    if (u) {
      document.getElementById('usr-nombre').value = u.nombre;
      document.getElementById('usr-pin').value    = u.pin;
      document.getElementById('usr-rol').value    = u.rol;
      document.getElementById('usr-emoji').value  = u.emoji;
    }
  } else {
    document.getElementById('usr-nombre').value = '';
    document.getElementById('usr-pin').value    = '';
    document.getElementById('usr-rol').value    = 'operador';
    document.getElementById('usr-emoji').value  = '🌿';
  }
  openModal('modal-usuario');
}

function guardarUsuario() {
  const nombre = document.getElementById('usr-nombre').value.trim();
  const pin    = document.getElementById('usr-pin').value.trim();
  if (!nombre || !pin) { showAlert('alert-usr','Nombre y PIN son obligatorios.','err'); return; }
  if (pin.length < 4) { showAlert('alert-usr','El PIN debe tener al menos 4 dígitos.','err'); return; }
  const db = getDB();
  const u = { nombre, pin, rol: document.getElementById('usr-rol').value, emoji: document.getElementById('usr-emoji').value || '👤' };
  if (editingUserId) {
    u.id = editingUserId;
    const i = db.usuarios.findIndex(x => x.id === editingUserId);
    if (i >= 0) db.usuarios[i] = u;
  } else { u.id = nid(); db.usuarios.push(u); }
  saveDB(db);
  toast('Usuario guardado ✓');
  setTimeout(() => closeModal('modal-usuario'), 700);
  renderAjustes();
}

function eliminarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  const db = getDB(); db.usuarios = db.usuarios.filter(u => u.id !== id); saveDB(db);
  renderAjustes(); toast('Usuario eliminado');
}

function borrarTodo() {
  if (!confirm('¿Borrar TODOS los datos?')) return;
  if (!confirm('Segunda confirmación: ¿borrar definitivamente?')) return;
  localStorage.removeItem('arcano_v1'); toast('Datos borrados'); location.reload();
}
