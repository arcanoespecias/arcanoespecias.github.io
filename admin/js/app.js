// ===================== ARCANO — APP LOGIC =====================
// ES5 — Firebase-first, every mutation calls DB.save()

// ==================== STATE ====================
var currentUser = null;
var currentPage = 'dashboard';
var cart = [];
var storeCat = 'todos';

// ==================== TOAST ====================
function toast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = (type === 'err' ? 'err' : 'ok') + ' show';
  clearTimeout(toast._t);
  toast._t = setTimeout(function() { el.className = ''; }, 3000);
}

// ==================== MODAL ====================
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ==================== AUTH ====================
function showLogin() {
  var users = DB.data ? DB.data.usuarios.filter(function(u) { return u.rol !== 'vendedor' && u.activo !== false; }) : [];
  if (users.length === 0) { toast('No hay usuarios admin','err'); return; }
  var html = '<div class="pin-users">';
  users.forEach(function(u) {
    var bc = u.rol === 'admin' ? 'badge-gold' : 'badge-blue';
    html += '<button class="pin-user-btn" onclick="startPin('+u.id+')">' +
      '<div class="avatar">'+esc(u.nombre.charAt(0).toUpperCase())+'</div>' +
      '<div><strong>'+esc(u.nombre)+'</strong><br><span class="badge '+bc+'">'+esc(u.rol)+'</span></div></button>';
  });
  html += '</div><button class="btn btn-link mt-16" onclick="showStorefront()">Volver a la tienda</button>';
  document.getElementById('pin-content').innerHTML = html;
  document.getElementById('pin-screen').style.display = 'flex';
  document.getElementById('storefront').style.display = 'none';
  document.getElementById('admin-app').style.display = 'none';
}

function startPin(userId) {
  window._pinTarget = userId;
  window._pinVal = '';
  var html = '<div class="pin-card"><p class="pin-label">Ingrese su PIN</p>' +
    '<div class="pin-dots" id="pin-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>' +
    '<p class="pin-error" id="pin-error"></p><div class="numpad">';
  for (var i = 1; i <= 9; i++) html += '<button class="numpad-btn" onclick="pinDigit(\''+i+'\')">'+i+'</button>';
  html += '<button class="numpad-btn numpad-blank" onclick="pinBack()">&#9003;</button>' +
    '<button class="numpad-btn" onclick="pinDigit(\'0\')">0</button>' +
    '<button class="numpad-btn numpad-cancel" onclick="showLogin()">X</button></div></div>';
  document.getElementById('pin-content').innerHTML = html;
  updatePinDots();
}

function pinDigit(d) {
  if (!window._pinVal) window._pinVal = '';
  if (window._pinVal.length >= 4) return;
  window._pinVal += d;
  updatePinDots();
  if (window._pinVal.length === 4) verifyPin();
}

function pinBack() { if (window._pinVal) { window._pinVal = window._pinVal.slice(0,-1); updatePinDots(); } }

function updatePinDots() {
  var dots = document.querySelectorAll('#pin-dots .dot');
  var len = (window._pinVal||'').length;
  for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('filled', i < len);
}

function verifyPin() {
  var user = DB.find('usuarios', window._pinTarget);
  if (user && user.pin === window._pinVal) {
    currentUser = user;
    enterApp();
  } else {
    var err = document.getElementById('pin-error');
    if (err) err.textContent = 'PIN incorrecto';
    window._pinVal = '';
    updatePinDots();
  }
}

function handleLogout() {
  if (!confirm('Cerrar sesion?')) return;
  currentUser = null;
  cart = [];
  localStorage.removeItem('arcano_user');
  showStorefront();
}

// ==================== NAVIGATION ====================
var ADMIN_PAGES = {
  admin: [
    {id:'dashboard',label:'Dashboard'},{id:'compras',label:'Compras'},{id:'especias',label:'Especias'},
    {id:'blends',label:'Blends'},{id:'ventas',label:'Ventas'},{id:'produccion',label:'Produccion'},
    {id:'usuarios',label:'Usuarios'}
  ],
  vendedor: [{id:'ventas',label:'Ventas'}]
};

function enterApp() {
  document.getElementById('pin-screen').style.display = 'none';
  document.getElementById('storefront').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';
  buildNav();
  updateUserChip();
  var start = (currentUser.rol === 'vendedor') ? 'ventas' : 'dashboard';
  navigateTo(start);
}

function buildNav() {
  var nav = document.getElementById('admin-nav');
  if (!nav || !currentUser) return;
  var items = ADMIN_PAGES[currentUser.rol] || ADMIN_PAGES.admin;
  nav.innerHTML = items.map(function(p) {
    return '<button class="nav-btn'+(p.id===currentPage?' active':'')+'" onclick="navigateTo(\''+p.id+'\')">'+esc(p.label)+'</button>';
  }).join('');
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.toggle('active', b.getAttribute('onclick').indexOf(page) >= 0); });
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('visible'); });
  var el = document.getElementById('page-'+page);
  if (el) el.classList.add('visible');
  renderPage(page);
}

function updateUserChip() {
  var chip = document.getElementById('user-chip');
  if (!chip || !currentUser) return;
  var bc = currentUser.rol==='admin' ? 'badge-gold' : 'badge-blue';
  chip.innerHTML = esc(currentUser.nombre)+' <span class="badge '+bc+'">'+esc(currentUser.rol)+'</span> <button class="btn-icon" title="Salir">&#x2190;</button>';
}

function renderPage(p) {
  var fn = {dashboard:renderDashboard,compras:renderCompras,especias:renderEspecias,blends:renderBlends,ventas:renderVentas,produccion:renderProduccion,usuarios:renderUsuarios};
  if (fn[p]) fn[p]();
}

// ==================== DASHBOARD ====================
function renderDashboard() {
  var el = document.getElementById('page-dashboard');
  if (!el || !DB.data) return;
  var d = DB.data;
  var totalVentasMes = 0, totalComprasMes = 0, ventasMes = 0;
  var now = new Date(), mes = now.getMonth(), anio = now.getFullYear();
  (d.ventas||[]).forEach(function(v) { var vd=new Date(v.fecha); if(vd.getMonth()===mes&&vd.getFullYear()===anio){totalVentasMes+=v.total||0;ventasMes++;} });
  (d.compras||[]).forEach(function(c) { var cd=new Date(c.fecha); if(cd.getMonth()===mes&&cd.getFullYear()===anio) totalComprasMes+=c.total||0; });

  var lowStock = 0;
  (d.especias||[]).forEach(function(e) { if((e.stock||0)<=(e.stockMin||0)) lowStock++; });
  (d.blends||[]).forEach(function(b) { if((b.stock||0)<=5) lowStock++; });

  var html = '<div class="page-header"><h2>Dashboard</h2></div>';
  html += '<div class="g4 mb-16">' +
    '<div class="stat-card"><div class="stat-value">'+(d.especias||[]).length+'</div><div class="stat-label">Especias</div></div>' +
    '<div class="stat-card"><div class="stat-value">'+(d.blends||[]).length+'</div><div class="stat-label">Blends</div></div>' +
    '<div class="stat-card"><div class="stat-value">'+ventasMes+'</div><div class="stat-label">Ventas del mes</div></div>' +
    '<div class="stat-card"><div class="stat-value" style="color:'+(lowStock>0?'var(--red)':'var(--green)')+'">'+lowStock+'</div><div class="stat-label">Stock bajo</div></div></div>';
  html += '<div class="g2 mb-16">' +
    '<div class="stat-card"><div class="stat-value text-sm">'+fmt(totalVentasMes)+'</div><div class="stat-label">Ventas mes</div></div>' +
    '<div class="stat-card"><div class="stat-value text-sm">'+fmt(totalComprasMes)+'</div><div class="stat-label">Compras mes</div></div></div>';

  // Recent activity
  var recent = [];
  (d.compras||[]).slice(-5).reverse().forEach(function(c) { recent.push({txt:'Compra #'+c.id+' — '+esc(c.proveedor||''),date:c.fecha,cls:'badge-yellow'}); });
  (d.ventas||[]).slice(-5).reverse().forEach(function(v) { recent.push({txt:'Venta #'+v.id+' — '+esc(v.vendedorNombre||''),date:v.fecha,cls:'badge-green'}); });
  (d.produccion||[]).slice(-5).reverse().forEach(function(p) { recent.push({txt:'Produccion: '+esc(p.blendNombre||''),date:p.fecha,cls:'badge-blue'}); });
  recent.sort(function(a,b) { return new Date(b.date)-new Date(a.date); });
  recent = recent.slice(0,8);

  if (recent.length) {
    html += '<h3 class="text-sm text-muted mb-8">Actividad reciente</h3>';
    recent.forEach(function(r) {
      html += '<div class="card" style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between">' +
        '<div><span class="badge '+r.cls+' mb-8"></span> '+r.txt+'</div><div class="text-xs text-muted">'+fmtDateTime(r.date)+'</div></div>';
    });
  }
  el.innerHTML = html;
}

// ==================== COMPRAS ====================
var comprasFilter = 'todos';

function renderCompras() {
  var el = document.getElementById('page-compras');
  if (!el || !DB.data) return;
  var list = (DB.data.compras||[]).slice();
  if (comprasFilter !== 'todos') list = list.filter(function(c) { return c.estado === comprasFilter; });
  list.sort(function(a,b) { return new Date(b.fecha)-new Date(a.fecha); });

  var html = '<div class="page-header"><h2>Compras</h2><button class="btn btn-gold btn-sm" onclick="modalNuevaCompra()">+ Nueva Compra</button></div>';
  html += '<div class="tabs">';
  [{v:'todos',l:'Todas'},{v:'pendiente',l:'Pendiente'},{v:'recibida',l:'Recibida'},{v:'cancelada',l:'Cancelada'}].forEach(function(t) {
    html += '<button class="tab-btn'+(t.v===comprasFilter?' active':'')+'" onclick="comprasFilter=\''+t.v+'\';renderCompras()">'+t.l+'</button>';
  });
  html += '</div>';

  if (list.length === 0) {
    html += '<p class="empty-msg">No hay compras</p>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Items</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>';
    list.forEach(function(c) {
      var bc = c.estado==='recibida'?'badge-green':c.estado==='cancelada'?'badge-red':'badge-yellow';
      html += '<tr><td>'+fmtDate(c.fecha)+'</td><td>'+esc(c.proveedor||'-')+'</td><td>'+(c.items||[]).length+'</td><td>'+fmt(c.total)+'</td>' +
        '<td><span class="badge '+bc+'">'+esc(c.estado)+'</span></td>' +
        '<td><button class="btn btn-ghost btn-sm" onclick="verCompra('+c.id+')">Ver</button></td></tr>';
    });
    html += '</tbody></table></div>';
  }
  el.innerHTML = html;
}

function modalNuevaCompra() {
  var today = new Date().toISOString().split('T')[0];
  var html = '<div class="form-stack"><div class="form-group"><label>Fecha</label><input type="date" id="cmp-fecha" value="'+today+'"></div>' +
    '<div class="form-group"><label>Proveedor</label><input type="text" id="cmp-proveedor" placeholder="Nombre del proveedor"></div>' +
    '<div class="form-group"><label>Agregar items</label><div class="flex gap-8" style="flex-wrap:wrap">' +
    '<button class="btn btn-gold btn-sm" onclick="addCmpRow(\'especia\')">+ Especia</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="addCmpRow(\'frasco\')">+ Frasco</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="addCmpRow(\'etiqueta\')">+ Etiqueta</button></div></div>' +
    '<div id="cmp-items"></div>' +
    '<div class="form-group"><label class="chk-label"><input type="checkbox" id="cmp-recibida"> Marcar como recibida</label></div>' +
    '<p class="mb-8"><strong>Total:</strong> <span id="cmp-total">$0</span></p>' +
    '<button class="btn btn-gold btn-full" onclick="guardarCompra()">Guardar Compra</button></div>';
  openModal('Nueva Compra', html);
  addCmpRow('especia');
}

function addCmpRow(tipo) {
  var c = document.getElementById('cmp-items');
  if (!c) return;
  var row = document.createElement('div');
  row.className = 'compra-row';
  row.setAttribute('data-tipo', tipo);

  if (tipo === 'especia') {
    var opts = '<option value="">-- Nueva --</option>';
    (DB.data.especias||[]).forEach(function(e) { opts += '<option value="'+e.id+'">'+esc(e.nombre)+' ('+Math.round(e.stock||0)+'gr)</option>'; });
    row.innerHTML = '<select onchange="cmpEspeciaChange(this)">'+opts+'</select>' +
      '<input name="nombre" placeholder="Nombre (nueva)" style="display:none">' +
      '<input type="number" min="0" step="any" placeholder="Cant. grs" oninput="calcCmpTotal()">' +
      '<input type="number" min="0" step="any" placeholder="$ Total" oninput="calcCmpTotal()">' +
      '<span class="subtotal-disp">$0</span>' +
      '<button class="btn-icon" onclick="this.parentElement.remove();calcCmpTotal()">&times;</button>';
  } else if (tipo === 'frasco') {
    row.innerHTML = '<select><option value="grande">Frasco Grande</option><option value="pequeno">Frasco Pequeno</option></select>' +
      '<input type="number" min="0" step="1" placeholder="Cantidad uds" oninput="calcCmpTotal()">' +
      '<input type="number" min="0" step="any" placeholder="$ Unitario" oninput="calcCmpTotal()">' +
      '<span class="subtotal-disp">$0</span>' +
      '<button class="btn-icon" onclick="this.parentElement.remove();calcCmpTotal()">&times;</button>';
  } else {
    var opts2 = '<option value="">-- Nueva --</option>';
    (DB.data.etiquetas||[]).forEach(function(e) { opts2 += '<option value="'+e.id+'">'+esc(e.nombre)+' ('+(e.stock||0)+')</option>'; });
    row.innerHTML = '<select onchange="cmpEtiquetaChange(this)">'+opts2+'</select>' +
      '<input name="nombre" placeholder="Nombre (nueva)" style="display:none">' +
      '<input type="number" min="0" step="1" placeholder="Cantidad uds" oninput="calcCmpTotal()">' +
      '<input type="number" min="0" step="any" placeholder="$ Unitario" oninput="calcCmpTotal()">' +
      '<span class="subtotal-disp">$0</span>' +
      '<button class="btn-icon" onclick="this.parentElement.remove();calcCmpTotal()">&times;</button>';
  }
  c.appendChild(row);
}

function cmpEspeciaChange(sel) {
  var nombre = sel.parentElement.querySelector('input[name="nombre"]');
  nombre.style.display = sel.value ? 'none' : '';
  if (!sel.value) nombre.focus();
}
function cmpEtiquetaChange(sel) {
  var nombre = sel.parentElement.querySelector('input[name="nombre"]');
  nombre.style.display = sel.value ? 'none' : '';
  if (!sel.value) nombre.focus();
}

function calcCmpTotal() {
  var rows = document.querySelectorAll('#cmp-items .compra-row');
  var total = 0;
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input[type="number"]');
    var q = inputs[0] ? Number(inputs[0].value)||0 : 0;
    var p = inputs[1] ? Number(inputs[1].value)||0 : 0;
    var sub = q * p;
    total += sub;
    var sp = row.querySelector('.subtotal-disp');
    if (sp) sp.textContent = fmt(sub);
  });
  var te = document.getElementById('cmp-total');
  if (te) te.textContent = fmt(total);
}

function guardarCompra() {
  var fecha = document.getElementById('cmp-fecha').value;
  var proveedor = (document.getElementById('cmp-proveedor').value||'').trim();
  var recibida = document.getElementById('cmp-recibida').checked;
  fecha = fecha ? new Date(fecha+'T12:00:00').toISOString() : new Date().toISOString();

  var rows = document.querySelectorAll('#cmp-items .compra-row');
  var items = [], total = 0;

  rows.forEach(function(row) {
    var tipo = row.getAttribute('data-tipo');
    var numInputs = row.querySelectorAll('input[type="number"]');

    if (tipo === 'especia') {
      var sel = row.querySelector('select');
      var existId = sel ? Number(sel.value)||0 : 0;
      var nombreInput = row.querySelector('input[name="nombre"]');
      var nombre = nombreInput ? (nombreInput.value||'').trim() : '';
      var cantGr = numInputs[0] ? Number(numInputs[0].value)||0 : 0;
      var precioTotal = numInputs[1] ? Number(numInputs[1].value)||0 : 0;
      if (cantGr <= 0 || precioTotal <= 0) return;

      var prodId, prodNombre;
      if (existId) {
        prodId = existId;
        var f = DB.find('especias', existId);
        if (!f) return;
        prodNombre = f.nombre;
      } else {
        if (!nombre) return;
        var existing = null;
        DB.data.especias.forEach(function(e) { if (e.nombre.toLowerCase()===nombre.toLowerCase()) existing=e; });
        if (existing) { prodId=existing.id; prodNombre=existing.nombre; }
        else {
          prodId = DB.nextId('especias');
          prodNombre = nombre;
          DB.data.especias.push({id:prodId,nombre:nombre,stock:0,stockMin:0,costoPor1000gr:Math.round(precioTotal/cantGr*1000),precioVentaGr:0,categoria:'',proveedor:proveedor,creadoEn:new Date().toISOString()});
        }
      }
      if (recibida) {
        var e = DB.find('especias', prodId);
        if (e) e.stock = Math.round(((e.stock||0)+cantGr)*100)/100;
      }
      total += precioTotal;
      items.push({productoId:prodId,productoNombre:prodNombre,tipo:'especia',cantidad:cantGr,precioUnitario:Math.round(precioTotal/cantGr*100)/100,subtotal:precioTotal});

    } else if (tipo === 'frasco') {
      var frascoTipo = row.querySelector('select').value;
      var cant = numInputs[0]?Number(numInputs[0].value)||0:0;
      var pUnit = numInputs[1]?Number(numInputs[1].value)||0:0;
      if (cant<=0||pUnit<=0) return;
      var fname = frascoTipo==='grande'?'Frasco Grande':'Frasco Pequeno';
      var frasco = DB.data.frascos.find(function(f){return f.tipo===frascoTipo;});
      if (frasco && recibida) frasco.stock = (frasco.stock||0)+cant;
      total += cant*pUnit;
      items.push({productoId:frasco?frasco.id:0,productoNombre:fname,tipo:'frasco',cantidad:cant,precioUnitario:pUnit,subtotal:cant*pUnit});

    } else if (tipo === 'etiqueta') {
      var sel2 = row.querySelector('select');
      var existId2 = sel2?Number(sel2.value)||0:0;
      var nombreInput2 = row.querySelector('input[name="nombre"]');
      var nombre2 = nombreInput2?(nombreInput2.value||'').trim():'';
      var cant2 = numInputs[0]?Number(numInputs[0].value)||0:0;
      var pUnit2 = numInputs[1]?Number(numInputs[1].value)||0:0;
      if (cant2<=0||pUnit2<=0) return;
      var prodId2, prodNombre2;
      if (existId2) {
        prodId2=existId2; var f2=DB.find('etiquetas',existId2); if(!f2)return; prodNombre2=f2.nombre;
      } else {
        if(!nombre2)return;
        var ex2=null; DB.data.etiquetas.forEach(function(e){if(e.nombre.toLowerCase()===nombre2.toLowerCase())ex2=e;});
        if(ex2){prodId2=ex2.id;prodNombre2=ex2.nombre;}
        else{prodId2=DB.nextId('etiquetas');prodNombre2=nombre2;DB.data.etiquetas.push({id:prodId2,nombre:nombre2,stock:0,costoUnit:pUnit2,creadoEn:new Date().toISOString()});}
      }
      if(recibida){var et=DB.find('etiquetas',prodId2);if(et)et.stock=(et.stock||0)+cant2;}
      total+=cant2*pUnit2;
      items.push({productoId:prodId2,productoNombre:prodNombre2,tipo:'etiqueta',cantidad:cant2,precioUnitario:pUnit2,subtotal:cant2*pUnit2});
    }
  });

  if (items.length===0){toast('Agregue al menos un item valido','err');return;}
  var compra = {id:DB.nextId('compras'),fecha:fecha,proveedor:proveedor,estado:recibida?'recibida':'pendiente',items:items,total:total,creadoPor:currentUser?currentUser.id:null,creadoEn:new Date().toISOString()};
  DB.data.compras.push(compra);
  DB.save();
  closeModal();
  toast('Compra #'+compra.id+' registrada');
  renderCompras();
}

function verCompra(id) {
  var c = DB.find('compras', id);
  if (!c) return;
  var bc = c.estado==='recibida'?'badge-green':c.estado==='cancelada'?'badge-red':'badge-yellow';
  var html = '<p><strong>Fecha:</strong> '+fmtDate(c.fecha)+'</p><p><strong>Proveedor:</strong> '+esc(c.proveedor||'-')+'</p><p><strong>Estado:</strong> <span class="badge '+bc+'">'+esc(c.estado)+'</span></p>';
  html += '<div class="table-wrap mt-12"><table><thead><tr><th>Producto</th><th>Tipo</th><th>Cant.</th><th>P.Unit</th><th>Subtotal</th></tr></thead><tbody>';
  (c.items||[]).forEach(function(i) {
    html += '<tr><td>'+esc(i.productoNombre)+'</td><td>'+esc(i.tipo)+'</td><td>'+i.cantidad+'</td><td>'+fmt(i.precioUnitario)+'</td><td>'+fmt(i.subtotal)+'</td></tr>';
  });
  html += '</tbody></table></div><p class="mt-12"><strong>Total:</strong> '+fmt(c.total)+'</p>';
  html += '<div class="actions-row mt-12">';
  if (c.estado==='pendiente') { html += '<button class="btn btn-gold btn-sm" onclick="cambiarEstadoCompra('+id+',\'recibida\')">Marcar Recibida</button><button class="btn btn-danger btn-sm" onclick="cambiarEstadoCompra('+id+',\'cancelada\')">Cancelar</button>'; }
  else if (c.estado==='recibida') { html += '<button class="btn btn-danger btn-sm" onclick="cambiarEstadoCompra('+id+',\'cancelada\')">Cancelar</button>'; }
  else { html += '<button class="btn btn-ghost btn-sm" onclick="cambiarEstadoCompra('+id+',\'pendiente\')">Reactivar</button>'; }
  html += '</div>';
  openModal('Compra #'+c.id, html);
}

function cambiarEstadoCompra(id, nuevo) {
  var c = DB.find('compras', id);
  if (!c || c.estado === nuevo) return;
  var old = c.estado;

  if (nuevo==='recibida' && old!=='recibida') {
    (c.items||[]).forEach(function(item) {
      if (item.tipo==='especia'){var e=DB.find('especias',item.productoId);if(e)e.stock=Math.round(((e.stock||0)+item.cantidad)*100)/100;}
      else if(item.tipo==='frasco'){var f=DB.data.frascos.find(function(x){return x.tipo==='grande'&&item.productoNombre.indexOf('Grande')>=0;})||DB.data.frascos.find(function(x){return x.tipo==='pequeno';});if(f)f.stock=(f.stock||0)+item.cantidad;}
      else if(item.tipo==='etiqueta'){var et=DB.find('etiquetas',item.productoId);if(et)et.stock=(et.stock||0)+item.cantidad;}
    });
  }
  if (old==='recibida' && nuevo!=='recibida') {
    (c.items||[]).forEach(function(item) {
      if (item.tipo==='especia'){var e=DB.find('especias',item.productoId);if(e)e.stock=Math.round(((e.stock||0)-item.cantidad)*100)/100;}
      else if(item.tipo==='frasco'){var f=DB.data.frascos.find(function(x){return x.tipo==='grande'&&item.productoNombre.indexOf('Grande')>=0;})||DB.data.frascos.find(function(x){return x.tipo==='pequeno';});if(f)f.stock=Math.max(0,(f.stock||0)-item.cantidad);}
      else if(item.tipo==='etiqueta'){var et=DB.find('etiquetas',item.productoId);if(et)et.stock=Math.max(0,(et.stock||0)-item.cantidad);}
    });
  }
  c.estado = nuevo;
  DB.save();
  closeModal();
  toast('Estado actualizado a '+nuevo);
  renderCompras();
}

// ==================== ESPECIAS ====================
function renderEspecias() {
  var el = document.getElementById('page-especias');
  if (!el || !DB.data) return;
  var list = DB.data.especias || [];
  var totalStock = 0, low = 0;
  list.forEach(function(e) { totalStock+=(e.stock||0); if((e.stock||0)<=(e.stockMin||0)) low++; });

  var html = '<div class="page-header"><h2>Especias</h2><div class="text-sm text-muted">Stock disponible</div></div>';
  html += '<div class="g3 mb-16">' +
    '<div class="stat-card"><div class="stat-value">'+list.length+'</div><div class="stat-label">Especias</div></div>' +
    '<div class="stat-card"><div class="stat-value">'+Math.round(totalStock)+' gr</div><div class="stat-label">Stock total</div></div>' +
    '<div class="stat-card"><div class="stat-value" style="color:'+(low>0?'var(--red)':'var(--green)')+'">'+low+'</div><div class="stat-label">Stock bajo</div></div></div>';

  if (list.length===0) { html += '<p class="empty-msg">No hay especias. Cargalas desde Compras.</p>'; el.innerHTML=html; return; }

  list.forEach(function(e) {
    var st = Math.round((e.stock||0)*100)/100;
    var sc = (st<=(e.stockMin||0))?'var(--red)':(st<=(e.stockMin||0)*1.5)?'var(--yellow)':'var(--green)';
    var cpg = e.costoPor1000gr ? Math.round(e.costoPor1000gr/10)/10 : 0;
    html += '<div class="card"><div class="flex justify-between items-center mb-8"><div><strong class="text-gold">'+esc(e.nombre)+'</strong>' +
      (e.categoria?' <span class="badge badge-gold" style="margin-left:6px">'+esc(e.categoria)+'</span>':'')+'</div>' +
      '<button class="btn btn-ghost btn-sm" onclick="modalEditarEspecia('+e.id+')">Editar</button></div>' +
      '<div class="g3"><div><span class="text-xs text-muted">Stock</span><br><strong style="color:'+sc+';font-size:1.1rem">'+st+' gr</strong></div>' +
      '<div><span class="text-xs text-muted">Costo/1000gr</span><br>'+fmt(e.costoPor1000gr)+'</div>' +
      '<div><span class="text-xs text-muted">Precio venta/gr</span><br>'+fmt(e.precioVentaGr||0)+'</div></div></div>';
  });
  el.innerHTML = html;
}

function modalEditarEspecia(id) {
  var e = DB.find('especias', id);
  if (!e) return;
  var html = '<div class="form-stack">' +
    '<div class="form-group"><label>Nombre</label><input type="text" id="ed-nombre" value="'+escJs(e.nombre)+'"></div>' +
    '<div class="g2"><div class="form-group"><label>Stock (gr)</label><input type="number" id="ed-stock" value="'+(e.stock||0)+'" step="any"></div>' +
    '<div class="form-group"><label>Stock minimo (gr)</label><input type="number" id="ed-stockmin" value="'+(e.stockMin||0)+'" step="any"></div></div>' +
    '<div class="g2"><div class="form-group"><label>Costo/1000gr</label><input type="number" id="ed-costo" value="'+(e.costoPor1000gr||0)+'" step="any"></div>' +
    '<div class="form-group"><label>Precio venta/gr</label><input type="number" id="ed-precio" value="'+(e.precioVentaGr||0)+'" step="any"></div></div>' +
    '<div class="g2"><div class="form-group"><label>Categoria</label><input type="text" id="ed-cat" value="'+escJs(e.categoria||'')+'" placeholder="Comidas, Infusion, Cocteleria"></div>' +
    '<div class="form-group"><label>Proveedor</label><input type="text" id="ed-prov" value="'+escJs(e.proveedor||'')+'"></div></div>' +
    '<button class="btn btn-gold btn-full mt-8" onclick="guardarEspecia('+id+')">Guardar</button></div>';
  openModal('Editar Especia', html);
}

function guardarEspecia(id) {
  var e = DB.find('especias', id);
  if (!e) return;
  e.nombre = (document.getElementById('ed-nombre').value||'').trim();
  e.stock = Number(document.getElementById('ed-stock').value)||0;
  e.stockMin = Number(document.getElementById('ed-stockmin').value)||0;
  e.costoPor1000gr = Number(document.getElementById('ed-costo').value)||0;
  e.precioVentaGr = Number(document.getElementById('ed-precio').value)||0;
  e.categoria = (document.getElementById('ed-cat').value||'').trim();
  e.proveedor = (document.getElementById('ed-prov').value||'').trim();
  if (!e.nombre) { toast('Nombre requerido','err'); return; }
  DB.save();
  closeModal();
  toast('Especia actualizada');
  renderEspecias();
}

// ==================== BLENDS ====================
function renderBlends() {
  var el = document.getElementById('page-blends');
  if (!el || !DB.data) return;
  var list = DB.data.blends || [];

  var html = '<div class="page-header"><h2>Blends</h2><button class="btn btn-gold btn-sm" onclick="modalCrearBlend()">+ Nuevo Blend</button></div>';

  if (list.length===0) { html += '<p class="empty-msg">No hay blends. Crea uno para empezar.</p>'; el.innerHTML=html; return; }

  list.forEach(function(b) {
    var costo = b.costoUnitario || 0;
    var utilidad = (b.precioVenta||0) - costo;
    var pct = (b.precioVenta||0) > 0 ? Math.round(utilidad/(b.precioVenta||1)*100) : 0;
    var sc = (b.stock||0)<=5?'var(--red)':'var(--green)';
    html += '<div class="card"><div class="flex justify-between items-center mb-8"><div><strong class="text-gold" style="font-size:1.05rem">'+esc(b.nombre)+'</strong>' +
      (b.categoria?' <span class="badge badge-gold" style="margin-left:6px">'+esc(b.categoria)+'</span>':'')+'</div>' +
      '<div class="flex gap-8"><button class="btn btn-ghost btn-sm" onclick="producirBlend('+b.id+')">Producir</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="modalEditarBlend('+b.id+')">Editar</button></div></div>' +
      '<div class="g4 mb-8"><div><span class="text-xs text-muted">Stock</span><br><strong style="color:'+sc+';font-size:1.1rem">'+(b.stock||0)+' uds</strong></div>' +
      '<div><span class="text-xs text-muted">Costo unit.</span><br>'+fmt(costo)+'</div>' +
      '<div><span class="text-xs text-muted">Precio venta</span><br>'+fmt(b.precioVenta||0)+'</div>' +
      '<div><span class="text-xs text-muted">Utilidad</span><br><span style="color:var(--green)">'+fmt(utilidad)+' ('+pct+'%)</span></div></div>';
    // Recipe
    if (b.receta && b.receta.length) {
      html += '<div class="text-xs text-muted mb-8">Receta ('+b.gramosPorUnidad+'gr por unidad):</div>';
      b.receta.forEach(function(r) {
        html += '<span class="badge badge-gold" style="margin:2px">'+esc(r.nombre)+' '+r.gramos+'gr</span> ';
      });
    }
    html += '</div>';
  });
  el.innerHTML = html;
}

function modalCrearBlend(editId) {
  var b = editId ? DB.find('blends', editId) : null;
  var html = '<div class="form-stack">' +
    '<div class="form-group"><label>Nombre</label><input type="text" id="bl-nombre" value="'+escJs(b?b.nombre:'')+'"></div>' +
    '<div class="g2"><div class="form-group"><label>Categoria</label><input type="text" id="bl-cat" value="'+escJs(b?b.categoria:'')+'" placeholder="Comidas, Infusion, Cocteleria"></div>' +
    '<div class="form-group"><label>Gramos por unidad</label><input type="number" id="bl-gramos" value="'+(b?b.gramosPorUnidad:100)+'" step="any" oninput="calcBlendCost()"></div></div>' +
    '<div class="form-group"><label>Precio venta</label><input type="number" id="bl-precio" value="'+(b?b.precioVenta:0)+'" step="any" oninput="calcBlendCost()"></div>' +
    '<div class="form-group"><label>Receta</label><div class="flex gap-8 mb-8"><button class="btn btn-gold btn-sm" onclick="addRecipeRow()">+ Agregar Especia</button></div>' +
    '<div id="recipe-rows"></div></div>' +
    '<p class="mt-8"><strong>Costo unitario:</strong> <span id="bl-costo">$0</span></p>' +
    '<button class="btn btn-gold btn-full mt-12" onclick="guardarBlend('+(editId||0)+')">'+(b?'Actualizar':'Crear')+' Blend</button></div>';
  openModal(b?'Editar Blend':'Nuevo Blend', html);
  if (b && b.receta) b.receta.forEach(function(r) { addRecipeRow(r.especiaId, r.gramos); });
  else addRecipeRow();
  calcBlendCost();
}

function modalEditarBlend(id) { modalCrearBlend(id); }

function addRecipeRow(especiaId, gramos) {
  var c = document.getElementById('recipe-rows');
  if (!c) return;
  var opts = '<option value="">-- Seleccionar --</option>';
  (DB.data.especias||[]).forEach(function(e) { opts += '<option value="'+e.id+'"'+(e.id===especiaId?' selected':'')+'>'+esc(e.nombre)+' ('+fmt(e.costoPor1000gr||0)+'/kg)</option>'; });
  var row = document.createElement('div');
  row.className = 'recipe-row';
  row.innerHTML = '<select onchange="calcBlendCost()">'+opts+'</select>' +
    '<input type="number" min="0" step="any" placeholder="Gramos" value="'+(gramos||'')+'" oninput="calcBlendCost()">' +
    '<span class="recipe-cost">$0</span>' +
    '<button class="btn-icon" onclick="this.parentElement.remove();calcBlendCost()">&times;</button>';
  c.appendChild(row);
}

function calcBlendCost() {
  var grPorUd = Number(document.getElementById('bl-gramos').value)||100;
  var rows = document.querySelectorAll('#recipe-rows .recipe-row');
  var totalGr = 0, totalCosto = 0;
  rows.forEach(function(row) {
    var sel = row.querySelector('select');
    var grInput = row.querySelectorAll('input')[0];
    var eid = sel?Number(sel.value)||0:0;
    var gr = grInput?Number(grInput.value)||0:0;
    totalGr += gr;
    var costo = 0;
    if (eid && gr > 0) {
      var e = DB.find('especias', eid);
      if (e && e.costoPor1000gr) costo = (e.costoPor1000gr/1000)*gr;
    }
    totalCosto += costo;
    var costSpan = row.querySelector('.recipe-cost');
    if (costSpan) costSpan.textContent = fmt(costo);
  });
  var costoUnit = totalGr > 0 ? totalCosto * (grPorUd/totalGr) : 0;
  var ce = document.getElementById('bl-costo');
  if (ce) ce.textContent = fmt(costoUnit);
  window._blendCosto = costoUnit;
}

function guardarBlend(editId) {
  var nombre = (document.getElementById('bl-nombre').value||'').trim();
  var cat = (document.getElementById('bl-cat').value||'').trim();
  var gramos = Number(document.getElementById('bl-gramos').value)||100;
  var precio = Number(document.getElementById('bl-precio').value)||0;
  if (!nombre) { toast('Nombre requerido','err'); return; }

  var receta = [];
  var rows = document.querySelectorAll('#recipe-rows .recipe-row');
  rows.forEach(function(row) {
    var sel = row.querySelector('select');
    var grInput = row.querySelectorAll('input')[0];
    var eid = sel?Number(sel.value)||0:0;
    var gr = grInput?Number(grInput.value)||0:0;
    if (eid && gr > 0) {
      var e = DB.find('especias', eid);
      receta.push({especiaId:eid, nombre:e?e.nombre:'?', gramos:gr});
    }
  });
  if (receta.length===0){toast('Agregue al menos una especia a la receta','err');return;}

  var costoUnit = window._blendCosto || 0;

  if (editId) {
    var b = DB.find('blends', editId);
    if (b) { b.nombre=nombre; b.categoria=cat; b.gramosPorUnidad=gramos; b.precioVenta=precio; b.receta=receta; b.costoUnitario=costoUnit; }
  } else {
    DB.data.blends.push({id:DB.nextId('blends'),nombre:nombre,categoria:cat,gramosPorUnidad:gramos,receta:receta,costoUnitario:costoUnit,precioVenta:precio,stock:0,creadoEn:new Date().toISOString()});
  }
  DB.save();
  closeModal();
  toast(editId?'Blend actualizado':'Blend creado');
  renderBlends();
}

function producirBlend(id) {
  var b = DB.find('blends', id);
  if (!b) return;
  var stockInfo = '';
  if (b.receta) b.receta.forEach(function(r) {
    var e = DB.find('especias', r.especiaId);
    stockInfo += '<div>'+esc(r.nombre)+': <strong>'+(e?Math.round(e.stock||0):0)+' gr</strong> disponibles (necesita '+r.gramos+' gr por unidad)</div>';
  });
  var html = '<p>Blend: <strong class="text-gold">'+esc(b.nombre)+'</strong></p>' +
    '<p class="text-sm text-muted mt-8">Stock actual: <strong>'+(b.stock||0)+'</strong> unidades</p>' +
    '<div class="mt-12 mb-12 text-sm">'+stockInfo+'</div>' +
    '<div class="form-group"><label>Cantidad a producir (unidades)</label><input type="number" id="prod-cant" min="1" step="1" value="1"></div>' +
    '<button class="btn btn-gold btn-full" onclick="ejecutarProduccion('+id+')">Producir</button>';
  openModal('Producir: '+b.nombre, html);
}

function ejecutarProduccion(id) {
  var b = DB.find('blends', id);
  if (!b) return;
  var cant = Number(document.getElementById('prod-cant').value)||0;
  if (cant <= 0) { toast('Cantidad invalida','err'); return; }

  // Check stock
  var faltantes = [];
  (b.receta||[]).forEach(function(r) {
    var e = DB.find('especias', r.especiaId);
    var necesita = r.gramos * cant;
    if (!e || (e.stock||0) < necesita) faltantes.push(r.nombre+' (necesita '+necesita+'gr, tiene '+(e?Math.round(e.stock||0):0)+'gr)');
  });
  if (faltantes.length) { toast('Stock insuficiente: '+faltantes[0],'err'); return; }

  // Consume especias
  var consumidos = [];
  (b.receta||[]).forEach(function(r) {
    var e = DB.find('especias', r.especiaId);
    if (e) {
      var usado = r.gramos * cant;
      e.stock = Math.round((e.stock - usado)*100)/100;
      consumidos.push({especiaId:r.especiaId, nombre:r.nombre, gramos:usado});
    }
  });
  b.stock = (b.stock||0) + cant;

  DB.data.produccion.push({id:DB.nextId('produccion'),blendId:b.id,blendNombre:b.nombre,cantidad:cant,fecha:new Date().toISOString(),creadoPor:currentUser?currentUser.id:null,itemsConsumidos:consumidos,creadoEn:new Date().toISOString()});
  DB.save();
  closeModal();
  toast(cant+' unidades de '+b.nombre+' producidas');
  renderBlends();
}

// ==================== VENTAS ====================
function renderVentas() {
  var el = document.getElementById('page-ventas');
  if (!el || !DB.data) return;
  var list = (DB.data.ventas||[]).slice().sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha);});
  var html = '<div class="page-header"><h2>Ventas</h2><button class="btn btn-gold btn-sm" onclick="modalNuevaVenta()">+ Nueva Venta</button></div>';
  if (list.length===0) { html += '<p class="empty-msg">No hay ventas</p>'; el.innerHTML=html; return; }
  html += '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Vendedor</th><th>Items</th><th>Total</th></tr></thead><tbody>';
  list.forEach(function(v) {
    html += '<tr><td>'+fmtDateTime(v.fecha)+'</td><td>'+esc(v.vendedorNombre||'-')+'</td><td>'+(v.items||[]).length+'</td><td><strong class="text-gold">'+fmt(v.total)+'</strong></td></tr>';
  });
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function modalNuevaVenta() {
  var html = '<div class="form-stack">' +
    '<div class="form-group"><label>Seleccionar Blend</label><select id="vta-blend" onchange="vtaBlendChange()"><option value="">-- Seleccionar --</option>';
  (DB.data.blends||[]).forEach(function(b) {
    if ((b.stock||0) > 0 && (b.precioVenta||0) > 0) html += '<option value="'+b.id+'">'+esc(b.nombre)+' (stock: '+(b.stock||0)+', '+fmt(b.precioVenta)+')</option>';
  });
  html += '</select></div>' +
    '<div class="g2"><div class="form-group"><label>Tamano frasco</label><select id="vta-frasco"><option value="pequeno">Pequeno</option><option value="grande">Grande</option></select></div>' +
    '<div class="form-group"><label>Cantidad</label><input type="number" id="vta-cant" min="1" step="1" value="1" oninput="calcVtaTotal()"></div></div>' +
    '<p class="mt-8"><strong>Subtotal:</strong> <span id="vta-subtotal">$0</span></p>' +
    '<div id="vta-items-list"></div>' +
    '<button class="btn btn-ghost btn-sm mt-8" onclick="addVentaItem()">+ Agregar otro item</button>' +
    '<p class="mt-12"><strong>Total:</strong> <span id="vta-total" class="text-gold" style="font-size:1.2rem">$0</span></p>' +
    '<button class="btn btn-gold btn-full mt-12" onclick="guardarVenta()">Registrar Venta</button></div>';
  openModal('Nueva Venta', html);
  window._ventaItems = [];
}

function addVentaItem() {
  var blendId = Number(document.getElementById('vta-blend').value)||0;
  var frasco = document.getElementById('vta-frasco').value;
  var cant = Number(document.getElementById('vta-cant').value)||1;
  if (!blendId || cant <= 0) { toast('Seleccione blend y cantidad','err'); return; }
  var b = DB.find('blends', blendId);
  if (!b) return;

  window._ventaItems.push({blendId:blendId,blendNombre:b.nombre,frascoTipo:frasco,cantidad:cant,precioUnit:b.precioVenta,subtotal:cant*b.precioVenta});
  document.getElementById('vta-blend').value = '';
  document.getElementById('vta-cant').value = 1;
  renderVentaItems();
  calcVtaTotal();
}

function renderVentaItems() {
  var el = document.getElementById('vta-items-list');
  if (!el) return;
  var html = '';
  window._ventaItems.forEach(function(item, i) {
    html += '<div class="card" style="padding:8px 14px;display:flex;align-items:center;justify-content:space-between">' +
      '<div class="text-sm">'+esc(item.blendNombre)+' ('+esc(item.frascoTipo)+') x'+item.cantidad+' = '+fmt(item.subtotal)+'</div>' +
      '<button class="btn-icon" onclick="removeVentaItem('+i+')">&times;</button></div>';
  });
  el.innerHTML = html;
}

function removeVentaItem(i) { window._ventaItems.splice(i,1); renderVentaItems(); calcVtaTotal(); }

function vtaBlendChange() { calcVtaTotal(); }

function calcVtaTotal() {
  var blendId = Number(document.getElementById('vta-blend').value)||0;
  var cant = Number(document.getElementById('vta-cant').value)||1;
  var b = blendId ? DB.find('blends', blendId) : null;
  var sub = b ? cant * (b.precioVenta||0) : 0;
  var se = document.getElementById('vta-subtotal');
  if (se) se.textContent = fmt(sub);
  var total = sub;
  window._ventaItems.forEach(function(item) { total += item.subtotal; });
  var te = document.getElementById('vta-total');
  if (te) te.textContent = fmt(total);
}

function guardarVenta() {
  var blendId = Number(document.getElementById('vta-blend').value)||0;
  var cant = Number(document.getElementById('vta-cant').value)||0;
  var items = window._ventaItems || [];

  // Add current item if selected
  if (blendId && cant > 0) {
    var b = DB.find('blends', blendId);
    if (b) {
      var frasco = document.getElementById('vta-frasco').value;
      items.push({blendId:blendId,blendNombre:b.nombre,frascoTipo:frasco,cantidad:cant,precioUnit:b.precioVenta,subtotal:cant*b.precioVenta});
    }
  }
  if (items.length===0) { toast('Agregue al menos un item','err'); return; }

  // Check stock
  items.forEach(function(item) {
    var b = DB.find('blends', item.blendId);
    if (!b || (b.stock||0) < item.cantidad) { toast('Stock insuficiente: '+item.blendNombre,'err'); }
  });

  var total = 0;
  items.forEach(function(item) {
    total += item.subtotal;
    // Deduct blend stock
    var b = DB.find('blends', item.blendId);
    if (b) b.stock = Math.max(0, (b.stock||0) - item.cantidad);
    // Deduct frasco stock
    var frasco = DB.data.frascos.find(function(f) { return f.tipo === item.frascoTipo; });
    if (frasco) frasco.stock = Math.max(0, (frasco.stock||0) - item.cantidad);
  });

  var venta = {id:DB.nextId('ventas'),fecha:new Date().toISOString(),items:items,total:total,vendedorId:currentUser?currentUser.id:null,vendedorNombre:currentUser?currentUser.nombre:'Tienda',creadoEn:new Date().toISOString()};
  DB.data.ventas.push(venta);
  DB.save();
  closeModal();
  toast('Venta #'+venta.id+' registrada');
  renderVentas();
}

// ==================== PRODUCCION ====================
function renderProduccion() {
  var el = document.getElementById('page-produccion');
  if (!el || !DB.data) return;
  var list = (DB.data.produccion||[]).slice().sort(function(a,b){return new Date(b.fecha)-new Date(a.fecha);});
  var html = '<div class="page-header"><h2>Produccion</h2><div class="text-sm text-muted">Historial de produccion de blends</div></div>';
  if (list.length===0) { html += '<p class="empty-msg">No hay registros de produccion</p>'; el.innerHTML=html; return; }
  html += '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Blend</th><th>Cantidad</th><th>Especias consumidas</th></tr></thead><tbody>';
  list.forEach(function(p) {
    var detail = '';
    (p.itemsConsumidos||[]).forEach(function(c) { detail += esc(c.nombre)+' '+Math.round(c.gramos)+'gr, '; });
    html += '<tr><td>'+fmtDateTime(p.fecha)+'</td><td class="text-gold">'+esc(p.blendNombre)+'</td><td>'+p.cantidad+' uds</td><td class="text-sm text-muted">'+(detail||'-')+'</td></tr>';
  });
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ==================== USUARIOS ====================
function renderUsuarios() {
  var el = document.getElementById('page-usuarios');
  if (!el || !DB.data) return;
  var list = DB.data.usuarios || [];
  var html = '<div class="page-header"><h2>Usuarios</h2><button class="btn btn-gold btn-sm" onclick="modalCrearUsuario()">+ Nuevo Usuario</button></div>';
  html += '<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead><tbody>';
  list.forEach(function(u) {
    var bc = u.rol==='admin'?'badge-gold':u.rol==='vendedor'?'badge-blue':'badge-yellow';
    var sc = u.activo!==false?'badge-green':'badge-red';
    html += '<tr><td><strong>'+esc(u.nombre)+'</strong></td><td><span class="badge '+bc+'">'+esc(u.rol)+'</span></td>' +
      '<td><span class="badge '+sc+'">'+(u.activo!==false?'Activo':'Inactivo')+'</span></td>' +
      '<td class="text-sm text-muted">'+fmtDate(u.creadoEn)+'</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="modalEditarUsuario('+u.id+')">Editar</button></td></tr>';
  });
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

function modalCrearUsuario(editId) {
  var u = editId ? DB.find('usuarios', editId) : null;
  var html = '<div class="form-stack">' +
    '<div class="form-group"><label>Nombre</label><input type="text" id="usr-nombre" value="'+escJs(u?u.nombre:'')+'"></div>' +
    '<div class="g2"><div class="form-group"><label>PIN (4 digitos)</label><input type="text" id="usr-pin" value="'+(u?u.pin:'')+'" maxlength="4" pattern="[0-9]*"></div>' +
    '<div class="form-group"><label>Rol</label><select id="usr-rol"><option value="admin"'+(u&&u.rol==='admin'?' selected':'')+'>Admin</option><option value="vendedor"'+(u&&u.rol==='vendedor'?' selected':'')+'>Vendedor</option></select></div></div>' +
    '<div class="form-group"><label class="chk-label"><input type="checkbox" id="usr-activo"'+(u&&u.activo===false?'':' checked')+'> Activo</label></div>' +
    '<button class="btn btn-gold btn-full mt-8" onclick="guardarUsuario('+(editId||0)+')">'+(u?'Actualizar':'Crear')+' Usuario</button></div>';
  openModal(u?'Editar Usuario':'Nuevo Usuario', html);
}

function modalEditarUsuario(id) { modalCrearUsuario(id); }

function guardarUsuario(editId) {
  var nombre = (document.getElementById('usr-nombre').value||'').trim();
  var pin = (document.getElementById('usr-pin').value||'').trim();
  var rol = document.getElementById('usr-rol').value;
  var activo = document.getElementById('usr-activo').checked;
  if (!nombre || pin.length < 4) { toast('Nombre y PIN (4 digitos) requeridos','err'); return; }

  if (editId) {
    var u = DB.find('usuarios', editId);
    if (u) { u.nombre=nombre; u.pin=pin; u.rol=rol; u.activo=activo; }
  } else {
    DB.data.usuarios.push({id:DB.nextId('usuarios'),nombre:nombre,pin:pin,rol:rol,activo:activo,creadoEn:new Date().toISOString()});
  }
  DB.save();
  closeModal();
  toast(editId?'Usuario actualizado':'Usuario creado');
  renderUsuarios();
}

// ==================== STOREFRONT ====================
function showStorefront() {
  document.getElementById('storefront').style.display = 'flex';
  document.getElementById('admin-app').style.display = 'none';
  document.getElementById('pin-screen').style.display = 'none';
  renderStorefront();
}

function renderStorefront() {
  if (!DB.data) return;
  // Build nav
  var cats = ['todos','Comidas','Infusiones','Cocteleria','blends'];
  var nav = document.getElementById('store-nav');
  if (nav) {
    nav.innerHTML = cats.map(function(c) {
      var l = c==='todos'?'Todos':c==='blends'?'Blends':c;
      return '<button class="store-nav-btn'+(c===storeCat?' active':'')+'" onclick="storeCat=\''+c+'\';renderStorefront()">'+l+'</button>';
    }).join('');
  }

  var container = document.getElementById('store-products');
  var emptyEl = document.getElementById('store-empty');
  if (!container) return;

  var html = '';
  var hasProducts = false;

  // Blends
  if (storeCat === 'todos' || storeCat === 'blends') {
    (DB.data.blends||[]).forEach(function(b) {
      if ((b.precioVenta||0)<=0||(b.stock||0)<=0) return;
      // Check frasco stock
      var frascoStock = 999999;
      DB.data.frascos.forEach(function(f) { if ((f.stock||0)<frascoStock) frascoStock=f.stock; });
      if (frascoStock <= 0) return;
      hasProducts = true;
      html += '<div class="product-card"><div class="product-card-type">Blend</div><div class="product-card-name">'+esc(b.nombre)+'</div>' +
        '<div class="product-card-cat">'+esc(b.categoria||'Blend artesanal')+'</div><div class="product-card-footer"><div>' +
        '<div class="product-card-price">'+fmt(b.precioVenta)+'</div><div class="product-card-stock">'+(b.stock||0)+' uds</div></div>' +
        '<button class="btn-add-cart" onclick="addToCart('+b.id+',\''+escJs(b.nombre)+'\','+b.precioVenta+',\''+escJs(b.categoria||'blend')+'\','+(b.stock||0)+')">Agregar</button></div></div>';
    });
  }

  // Especias with precioVenta
  (DB.data.especias||[]).forEach(function(e) {
    if ((e.precioVentaGr||0)<=0||(e.stock||0)<=0) return;
    if (storeCat!=='todos'&&storeCat!=='blends'&&storeCat!==e.categoria) return;
    hasProducts = true;
    html += '<div class="product-card"><div class="product-card-type">Especia</div><div class="product-card-name">'+esc(e.nombre)+'</div>' +
      '<div class="product-card-cat">'+esc(e.categoria||'')+'</div><div class="product-card-footer"><div>' +
      '<div class="product-card-price">'+fmt(e.precioVentaGr)+'/gr</div><div class="product-card-stock">'+Math.round(e.stock||0)+' gr</div></div>' +
      '<button class="btn-add-cart" onclick="addToCartEspecia('+e.id+',\''+escJs(e.nombre)+'\','+e.precioVentaGr+',\''+escJs(e.categoria||'')+'\','+(e.stock||0)+')">Agregar</button></div></div>';
  });

  container.innerHTML = html;
  if (emptyEl) emptyEl.style.display = hasProducts ? 'none' : 'block';
  updateCartUI();
}

function addToCart(blendId, nombre, precio, cat, stock) {
  var existing = null;
  cart.forEach(function(c) { if (c.blendId===blendId && !c.especiaId) existing = c; });
  if (existing) { if (existing.cantidad < stock) existing.cantidad++; else { toast('Stock maximo alcanzado','err'); return; } }
  else cart.push({blendId:blendId,nombre:nombre,precio:precio,tipo:'blend',categoria:cat,cantidad:1,maxStock:stock});
  updateCartUI();
}

function addToCartEspecia(especiaId, nombre, precio, cat, stock) {
  var existing = null;
  cart.forEach(function(c) { if (c.especiaId===especiaId) existing = c; });
  if (existing) { existing.cantidad = Math.min(existing.cantidad + 10, stock); }
  else cart.push({especiaId:especiaId,nombre:nombre,precio:precio,tipo:'especia',categoria:cat,cantidad:10,maxStock:stock});
  updateCartUI();
}

function updateCartUI() {
  var count = 0, total = 0;
  cart.forEach(function(c) { count += c.cantidad; total += c.precio * c.cantidad; });
  var countEl = document.getElementById('cart-count');
  if (countEl) { countEl.textContent = count; countEl.style.display = count > 0 ? 'inline-flex' : 'none'; }
  var totalEl = document.getElementById('cart-total-val');
  if (totalEl) totalEl.textContent = fmt(total);
  var footer = document.getElementById('cart-footer');
  if (footer) footer.style.display = cart.length > 0 ? 'block' : 'none';

  var itemsEl = document.getElementById('cart-items');
  if (!itemsEl) return;
  if (cart.length === 0) { itemsEl.innerHTML = '<p class="text-muted text-sm" style="text-align:center;padding:20px">Carrito vacio</p>'; return; }
  var html = '';
  cart.forEach(function(c, i) {
    html += '<div class="cart-item"><div class="cart-item-info"><div class="cart-item-name">'+esc(c.nombre)+'</div>' +
      '<div class="cart-item-detail">'+(c.tipo==='blend'?'Blend':esc(c.categoria))+' x'+c.cantidad+' = '+fmt(c.precio*c.cantidad)+'</div></div>' +
      '<div style="display:flex;align-items:center;gap:6px"><span class="cart-item-price">'+fmt(c.precio*c.cantidad)+'</span>' +
      '<button class="cart-item-remove" onclick="cartRemove('+i+')">&times;</button></div></div>';
  });
  itemsEl.innerHTML = html;
}

function cartRemove(i) { cart.splice(i,1); updateCartUI(); }

function toggleCart() {
  var drawer = document.getElementById('cart-drawer');
  var overlay = document.getElementById('cart-overlay');
  if (!drawer) return;
  var open = drawer.classList.contains('open');
  drawer.classList.toggle('open');
  overlay.classList.toggle('open');
  if (!open) updateCartUI();
}

function submitOrder() {
  if (cart.length === 0) return;
  var items = [];
  var total = 0;
  cart.forEach(function(c) {
    var subtotal = c.precio * c.cantidad;
    total += subtotal;
    if (c.tipo === 'blend') {
      // Deduct blend stock
      var b = DB.find('blends', c.blendId);
      if (b) b.stock = Math.max(0, (b.stock||0)-c.cantidad);
      // Deduct frasco (default pequeno for storefront)
      var frasco = DB.data.frascos.find(function(f) { return f.tipo === 'pequeno'; });
      if (frasco) frasco.stock = Math.max(0, (frasco.stock||0)-c.cantidad);
      items.push({blendId:c.blendId,blendNombre:c.nombre,frascoTipo:'pequeno',cantidad:c.cantidad,precioUnit:c.precio,subtotal:subtotal});
    } else {
      // Especia directa sale
      var e = DB.find('especias', c.especiaId);
      if (e) e.stock = Math.max(0, (e.stock||0)-c.cantidad);
      items.push({blendId:0,blendNombre:c.nombre,frascoTipo:'granel',cantidad:c.cantidad,precioUnit:c.precio,subtotal:subtotal});
    }
  });
  var venta = {id:DB.nextId('ventas'),fecha:new Date().toISOString(),items:items,total:total,vendedorId:null,vendedorNombre:'Tienda Online',creadoEn:new Date().toISOString()};
  DB.data.ventas.push(venta);
  DB.save();
  cart = [];
  toggleCart();
  updateCartUI();
  toast('Pedido registrado! Venta #'+venta.id);
  renderStorefront();
}

// ==================== BOOT ====================
(function() {
  var statusEl = document.getElementById('boot-status');
  if (statusEl) statusEl.textContent = 'Conectando...';
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=8').catch(function(){}); } catch(e){}
  DB.init(function() {
    DB.seed();
    if (statusEl) statusEl.textContent = '';
    var saved = localStorage.getItem('arcano_user');
    if (saved) {
      try {
        var user = JSON.parse(saved);
        var found = DB.find('usuarios', user.id);
        if (found && found.activo !== false && found.pin === user.pin) { currentUser = found; enterApp(); return; }
      } catch(e){}
    }
    showStorefront();
  });

  // Save session on pin verify
  var _origVerify = verifyPin;
  verifyPin = function() {
    var user = DB.find('usuarios', window._pinTarget);
    if (user && user.pin === window._pinVal) {
      currentUser = user;
      localStorage.setItem('arcano_user', JSON.stringify({id:user.id,pin:user.pin}));
      enterApp();
    } else {
      var err = document.getElementById('pin-error');
      if (err) err.textContent = 'PIN incorrecto';
      window._pinVal = '';
      updatePinDots();
    }
  };
})();