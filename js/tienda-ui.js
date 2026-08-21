/* ===================== ARCANO TIENDA — UI REDESIGN ===================== */
var cart = JSON.parse(localStorage.getItem('arcano_cart') || '[]');
var _currentPage = 'tienda';
var _currentRecetaCat = 'Comida';
var _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 };

function saveCart() { localStorage.setItem('arcano_cart', JSON.stringify(cart)); }
function getCartCount() { var c = 0; for (var i = 0; i < cart.length; i++) c += cart[i].qty; return c; }
function getCartTotal() { var t = 0; for (var i = 0; i < cart.length; i++) t += cart[i].precio * cart[i].qty; return t; }

/* === TOAST === */
function _showToast(msg) {
  var old = document.querySelector('.toast'); if (old) old.remove();
  var el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.remove(); }, 2200);
}

/* === NAVIGATION === */
function goTo(page) {
  _currentPage = page;
  var pages = ['tienda','recetas','blend','faq'];
  for (var i = 0; i < pages.length; i++) {
    var el = document.getElementById('page-' + pages[i]);
    if (el) {
      el.style.display = (pages[i] === page) ? '' : 'none';
      if (pages[i] === page) el.className = 'page';
    }
  }
  // Update desktop nav
  var navBtns = document.querySelectorAll('.nav-item');
  for (var i = 0; i < navBtns.length; i++) navBtns[i].classList.toggle('active', navBtns[i].dataset.page === page);
  // Update mobile bottom tabs
  var btabs = document.querySelectorAll('.btab');
  for (var i = 0; i < btabs.length; i++) btabs[i].classList.toggle('active', btabs[i].dataset.page === page);
  // Update mobile menu items
  var mmItems = document.querySelectorAll('.mm-nav-item');
  for (var i = 0; i < mmItems.length; i++) mmItems[i].classList.toggle('active', mmItems[i].dataset.page === page);

  if (page === 'tienda') {
    renderProducts(currentFilter);
  } else if (page === 'recetas') {
    renderRecipeGrid();
    var rd = document.getElementById('recipe-detail');
    if (rd) rd.innerHTML = '';
  } else if (page === 'blend') {
    renderBlendBuilder();
  } else if (page === 'faq') {
    renderFaqPage();
  }
  _updateSidebar(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* === RIGHT SIDEBAR === */
function hasVisiblePacks() {
  var products = getStoreProducts();
  for (var i = 0; i < products.length; i++) {
    if (products[i].tipo === 'pack' && (products[i].stock || 0) > 0) return true;
  }
  return false;
}

function _updateSidebar(page) {
  var sb = document.getElementById('sidebar-content');
  if (!sb) return;
  if (page === 'tienda') {
    sb.innerHTML = '<p>Descubre nuestra coleccion de especias y blends artesanales, seleccionados de cada rincon del mundo. Cada producto es elaborado con ingredientes de alta calidad para llevar sabores unicos a tu mesa.</p><p>Explora nuestras categorias: Comidas, Infusiones, Cocteleria y Packs exclusivos.</p>';
  } else if (page === 'recetas') {
    sb.innerHTML = '<h3>Categorias</h3><ul class="sidebar-cat-list" id="sidebar-receta-cats">' + '<li class="active" onclick="selectRecetaCat(\'Comida\')">Comida</li>' + '<li onclick="selectRecetaCat(\'Infusiones\')">Infusiones</li>' + '<li onclick="selectRecetaCat(\'Cocteleria\')">Cocteleria</li>' + '</ul>';
  } else if (page === 'blend') {
    sb.innerHTML = '<p>Crea tu blend personalizado seleccionando las especias que mas te gusten. Elige entre nuestra coleccion de ingredientes artesanales y diseña una mezcla unica para tus recetas.</p><p>Puedes elegir el tamano y la proporcion de cada especia para obtener el sabor perfecto.</p>';
  } else if (page === 'faq') {
    sb.innerHTML = '<p>Aqui encontraras respuestas a las preguntas mas frecuentes sobre nuestros productos, envios, formas de pago y mas. Si no encuentras lo que buscas, no dudes en contactarnos.</p>';
  }
}
/* === MOBILE MENU === */
function openMobileMenu() {
  document.getElementById('mobile-menu').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMobileMenu() {
  document.getElementById('mobile-menu').classList.remove('open');
  document.body.style.overflow = '';
}

/* === HEADER SCROLL === */
function _initHeaderScroll() {
  var header = document.querySelector('.nav-header');
  var last = 0;
  window.addEventListener('scroll', function() {
    var y = window.scrollY;
    if (y > 10) header.classList.add('scrolled'); else header.classList.remove('scrolled');
    last = y;
  }, { passive: true });
}

/* === CART DRAWER === */
function toggleCartDrawer() {
  var drawer = document.getElementById('cart-drawer');
  var overlay = document.getElementById('cart-overlay');
  var isOpen = drawer.classList.contains('open');
  if (isOpen) {
    drawer.classList.remove('open'); overlay.classList.remove('open');
    document.body.style.overflow = '';
  } else {
    renderCartDrawer();
    drawer.classList.add('open'); overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}
function closeCartDrawer() {
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCartDrawer() {
  var body = document.getElementById('cart-drawer-body');
  if (!body) return;
  var total = getCartTotal();
  if (cart.length === 0) {
    body.innerHTML = '<div class="empty-state" style="padding:48px 0"><p>Tu pedido esta vacio</p></div>';
    return;
  }
  var h = '';
  for (var i = 0; i < cart.length; i++) {
    var c = cart[i];
    var tallaLabel = c.talla === 'pack' ? 'Pack' : (c.talla === 'grande' ? 'Grande' : 'Peque\u00f1o');
    h += '<div class="cart-drawer-item">';
    h += '<div class="cart-drawer-item-info">';
    h += '<div class="cart-drawer-item-name">' + c.nombre + '</div>';
    h += '<div class="cart-drawer-item-detail">' + tallaLabel + ' \u00b7 $' + c.precio.toLocaleString() + ' c/u</div>';
    if (c.customBlend && c.customBlend.especias) {
      h += '<div class="cart-blend-specs">';
      for (var b = 0; b < c.customBlend.especias.length; b++) {
        h += '<span class="cart-blend-tag">' + c.customBlend.especias[b].nombre + ' ' + c.customBlend.especias[b].porcentaje + '%</span>';
      }
      h += '</div>';
    }
    h += '<div class="cart-drawer-item-qty">';
    h += '<button class="cart-qty-btn" onclick="_cartQty(' + i + ',-1)">-</button>';
    h += '<span class="cart-qty-num">' + c.qty + '</span>';
    h += '<button class="cart-qty-btn" onclick="_cartQty(' + i + ',1)">+</button>';
    h += '</div></div>';
    h += '<div class="cart-drawer-item-price">$' + (c.precio * c.qty).toLocaleString() + '</div>';
    h += '<button class="cart-drawer-item-rm" onclick="_cartRm(' + i + ')">\u00d7</button>';
    h += '</div>';
  }
  body.innerHTML = h;
  // Update total
  var totalEl = document.getElementById('cart-drawer-total-val');
  if (totalEl) totalEl.textContent = '$' + getCartTotal().toLocaleString();
  // Reset footer to step 1
  _cartSetFooterStep(1);
}

var _cartStep = 1;
function _cartSetFooterStep(step) {
  _cartStep = step;
  var footer = document.getElementById('cart-drawer-footer');
  if (!footer) return;
  if (step === 1) {
    footer.innerHTML = '<button class="btn-primary" onclick="showOrderForm()">Confirmar Pedido</button>' +
      '<button class="btn-secondary" onclick="toggleCartDrawer()">Seguir comprando</button>';
  } else {
    footer.innerHTML = '<button class="btn-primary" onclick="sendOrder()">Enviar Pedido</button>' +
      '<button class="btn-secondary" onclick="backToCart()">Volver</button>';
  }
}

function showOrderForm() {
  var body = document.getElementById('cart-drawer-body');
  if (!body) return;
  // Compact item summary
  var h = '<div class="cart-order-summary">';
  h += '<div class="cart-order-summary-title">Tu pedido (' + cart.length + ' producto' + (cart.length > 1 ? 's' : '') + ')</div>';
  for (var i = 0; i < cart.length; i++) {
    var c = cart[i];
    h += '<div class="cart-order-summary-item">';
    h += '<span>' + c.nombre + ' x' + c.qty + '</span>';
    h += '<span>$' + (c.precio * c.qty).toLocaleString() + '</span>';
    h += '</div>';
  }
  h += '</div>';
  // Order form
  h += '<div class="order-form">';
  h += '<div class="form-group"><label>Nombre</label><input class="form-input" id="o-nombre" placeholder="Tu nombre"></div>';
  h += '<div class="form-row"><div class="form-group"><label>Telefono</label><input class="form-input" id="o-tel" placeholder="300 123 4567"></div>';
  h += '<div class="form-group"><label>Email</label><input class="form-input" id="o-email" type="email" placeholder="tu@email.com"></div></div>';
  h += '<div class="form-row"><div class="form-group"><label>Ciudad</label><input class="form-input" id="o-ciudad" placeholder="Bogota"></div>';
  h += '<div class="form-group"><label>Direccion</label><input class="form-input" id="o-dir" placeholder="Direccion de entrega"></div></div>';
  h += '<div class="form-group"><label>Notas</label><textarea class="form-input" id="o-notas" placeholder="Horario, instrucciones..."></textarea></div>';
  h += '</div>';
  // QR
  var config = getTiendaConfig();
  if (config && config.qrPagoImage) {
    h += '<div class="qr-section"><p>Forma de pago</p><img src="' + config.qrPagoImage + '" alt="QR Pago"><small>Envia el comprobante por WhatsApp</small></div>';
  }
  body.innerHTML = h;
  body.scrollTop = 0;
  _cartSetFooterStep(2);
}

function backToCart() {
  renderCartDrawer();
}

function _cartQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  saveCart(); updateCartBadge(); renderCartDrawer();
}
function _cartRm(idx) {
  cart.splice(idx, 1); saveCart(); updateCartBadge(); renderCartDrawer();
}
function updateCartBadge() {
  var badge = document.getElementById('cart-badge');
  var count = getCartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function sendOrder() {
  var nombre = document.getElementById('o-nombre').value.trim();
  var tel = document.getElementById('o-tel').value.trim();
  var email = document.getElementById('o-email').value.trim();
  var ciudad = document.getElementById('o-ciudad').value.trim();
  var dir = document.getElementById('o-dir').value.trim();
  var notas = document.getElementById('o-notas').value.trim();
  if (!nombre || !tel) { alert('Nombre y telefono son obligatorios'); return; }
  if (cart.length === 0) { alert('El carrito esta vacio'); return; }
  var items = [];
  for (var i = 0; i < cart.length; i++) {
    var c = cart[i];
    items.push({ productId: c.productId, nombre: c.nombre, tipo: c.tipo, talla: c.talla, precio: c.precio, qty: c.qty, subtotal: c.precio * c.qty });
  }
  var orderData = {
    cliente: { nombre: nombre, telefono: tel, email: email, ciudad: ciudad, direccion: dir },
    items: items, total: getCartTotal(), notas: notas
  };
  var body = document.getElementById('cart-drawer-body');
  body.innerHTML = '<div style="text-align:center;padding:48px 0"><div class="loader"></div><p style="color:var(--text-sec);margin-top:12px">Enviando pedido...</p></div>';
  submitOrder(orderData).then(function() {
    body.innerHTML = '<div class="success-box"><div class="success-icon">\u2705</div><h3>Pedido enviado</h3><p>Tu pedido fue recibido correctamente.</p><button class="btn-primary" onclick="_finishOrder()" style="max-width:200px;margin:0 auto">Entendido</button></div>';
  }).catch(function(err) {
    alert('Error: ' + (err.message || err));
    renderCartDrawer();
  });
}
function _finishOrder() {
  cart = []; saveCart(); updateCartBadge(); closeCartDrawer();
  renderProducts(currentFilter);
}

/* === CART FUNCTIONS (add to cart) === */
function addToCart(product, talla) {
  var precio = talla === 'grande' ? product.precioGrande : product.precioChico;
  if (precio <= 0) return;
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].productId === product.id && cart[i].talla === talla) {
      cart[i].qty++; saveCart(); updateCartBadge(); _showToast('Producto agregado'); return;
    }
  }
  cart.push({ productId: product.id, nombre: product.nombre, tipo: product.tipo, talla: talla, precio: precio, qty: 1 });
  saveCart(); updateCartBadge(); _showToast('Producto agregado');
}
function addToCartByIdAndSize(pid, talla) {
  var products = getStoreProducts();
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === pid) { addToCart(products[i], talla); return; }
  }
}
function addToCartPack(pid) {
  var products = getStoreProducts();
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === pid) {
      var p = products[i];
      if (!p.precio) return;
      for (var j = 0; j < cart.length; j++) {
        if (cart[j].productId === p.id && cart[j].tipo === 'pack') { cart[j].qty++; saveCart(); updateCartBadge(); _showToast('Pack agregado'); return; }
      }
      cart.push({ productId: p.id, nombre: p.nombre, tipo: 'pack', talla: 'pack', precio: p.precio, qty: 1 });
      saveCart(); updateCartBadge(); _showToast('Pack agregado');
      return;
    }
  }
}

/* === RENDER PRODUCTS === */
var currentFilter = 'Todos';
function renderProducts(filter) {
  var products = getStoreProducts();
  var grid = document.getElementById('products-grid');
  if (products.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No hay productos disponibles.</p></div>';
    return;
  }
  var filtered = filter && filter !== 'Todos' ? products.filter(function(p) { return (p.categorias || []).indexOf(filter) >= 0; }) : products;
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No hay productos en esta categoria.</p></div>';
    return;
  }
  var h = '';
  for (var i = 0; i < filtered.length; i++) {
    var p = filtered[i];
    var isPack = p.tipo === 'pack';
    var isBlend = p.tipo === 'blend';
    var hasChico = !isPack && p.stockChico > 0 && p.precioChico > 0;
    var hasGrande = !isPack && p.stockGrande > 0 && p.precioGrande > 0;
    var hasPack = isPack && p.precio > 0 && (p.stock || 0) > 0;
    var typeClass = isPack ? 'pack' : (isBlend ? 'blend' : 'especia');
    var typeLabel = isPack ? 'Pack' : (isBlend ? 'Blend' : 'Especia');
    var meta = '';
    if (p.categorias && p.categorias.length > 0) meta = p.categorias.join(' / ');
    else if (p.categoria) meta = p.categoria;
    if (p.region) meta += (meta ? ' \u00b7 ' : '') + p.region;

    h += '<div class="product-card" onclick="openDetail(' + p.id + ')">';
    h += '<div class="card-img-wrap">';
    if (p.imagen) {
      h += '<img src="' + p.imagen + '" alt="' + p.nombre + '" loading="lazy">';
    } else {
      h += '<span>' + (isPack ? '\ud83c\udf81' : (isBlend ? '\ud83c\udf3f' : '\ud83c\udf31')) + '</span>';
    }
    h += '</div><div class="card-body">';
    h += '<div class="card-name">' + p.nombre + '</div>';
    h += '<div class="card-meta">' + meta + '</div>';
    h += '<div class="card-prices">';
    if (hasChico) {
      h += '<button class="price-btn" onclick="event.stopPropagation();addToCartByIdAndSize(' + p.id + ',\'chico\')"><div class="price-label">Peque\u00f1o</div><div class="price-value">$' + p.precioChico.toLocaleString() + '</div></button>';
    }
    if (hasGrande) {
      h += '<button class="price-btn" onclick="event.stopPropagation();addToCartByIdAndSize(' + p.id + ',\'grande\')"><div class="price-label">Grande</div><div class="price-value">$' + p.precioGrande.toLocaleString() + '</div></button>';
    }
    if (hasPack) {
      h += '<button class="price-btn" onclick="event.stopPropagation();addToCartPack(' + p.id + ')"><div class="price-label">Pack</div><div class="price-value">$' + p.precio.toLocaleString() + '</div></button>';
    }
    if (!hasChico && !hasGrande && !hasPack) {
      h += '<div class="card-na">Sin precio</div>';
    }
    if (!hasChico && !hasGrande && !hasPack && (isPack ? !(p.stock > 0) : !(p.stockChico > 0 || p.stockGrande > 0))) {
      h += '<div class="card-oos">Sin stock</div>';
    }
    h += '</div></div></div>';
  }
  grid.innerHTML = h;
}

/* === PRODUCT DETAIL === */
function openDetail(pid) {
  var products = getStoreProducts();
  var p = null;
  for (var i = 0; i < products.length; i++) { if (products[i].id === pid) { p = products[i]; break; } }
  if (!p) return;
  var isPack = p.tipo === 'pack';
  var isBlend = p.tipo === 'blend';
  var hasChico = !isPack && p.stockChico > 0 && p.precioChico > 0;
  var hasGrande = !isPack && p.stockGrande > 0 && p.precioGrande > 0;
  var typeClass = isPack ? 'pack' : (isBlend ? 'blend' : 'especia');
  var typeLabel = isPack ? 'Pack' : (isBlend ? 'Blend' : 'Especia');
  var tagsHtml = '';
  if (p.categorias && p.categorias.length > 0) {
    for (var ci = 0; ci < p.categorias.length; ci++) tagsHtml += '<span class="detail-tag">' + p.categorias[ci] + '</span>';
  } else if (p.categoria) { tagsHtml += '<span class="detail-tag">' + p.categoria + '</span>'; }
  if (p.uso) tagsHtml += '<span class="detail-tag">' + p.uso + '</span>';
  if (p.region) tagsHtml += '<span class="detail-tag">' + p.region + '</span>';
  var pricesHtml = '';
  if (hasChico) pricesHtml += '<button class="detail-price-card" onclick="addToCartByIdAndSize(' + p.id + ',&#39;chico&#39;);document.getElementById(\'detail-ov\').remove()"><div class="detail-price-label">Peque\u00f1o</div><div class="detail-price-val">$' + p.precioChico.toLocaleString() + '</div></button>';
  if (hasGrande) pricesHtml += '<button class="detail-price-card" onclick="addToCartByIdAndSize(' + p.id + ',&#39;grande&#39;);document.getElementById(\'detail-ov\').remove()"><div class="detail-price-label">Grande</div><div class="detail-price-val">$' + p.precioGrande.toLocaleString() + '</div></button>';
  var descHtml = p.descripcion ? '<p class="detail-desc">' + p.descripcion + '</p>' : '';
  var ingsHtml = '';
  if (isBlend && p.ingredientes && p.ingredientes.length > 0) {
    ingsHtml = '<div class="detail-ingredients"><div class="detail-ingredients-label">Ingredientes</div>';
    for (var ii = 0; ii < p.ingredientes.length; ii++) {
      var ingName = p.ingredientes[ii].especiaNombre;
      if (!ingName && p.ingredientes[ii].especiaId != null && _sDb && _sDb.especias) {
        var esObj = _sDb.especias[p.ingredientes[ii].especiaId];
        if (esObj && esObj.nombre) ingName = esObj.nombre;
      }
      if (!ingName) ingName = 'Especia';
      ingsHtml += '<span class="detail-ingredient-chip">' + ingName + '</span>';
    }
    ingsHtml += '</div>';
  }
  var overlay = document.createElement('div');
  overlay.className = 'detail-overlay'; overlay.id = 'detail-ov';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  var html = '<div class="detail-modal">';
  html += '<button class="detail-close" onclick="document.getElementById(\'detail-ov\').remove()">&times;</button>';
  html += '<div class="detail-modal-img">' + (p.imagen ? '<img src="' + p.imagen + '" alt="' + p.nombre + '">' : '<span>' + (isPack ? '\ud83c\udf81' : (isBlend ? '\ud83c\udf3f' : '\ud83c\udf31')) + '</span>') + '</div>';
  html += '<div class="detail-modal-content">';
  html += '<span class="detail-type-tag ' + typeClass + '">' + typeLabel + '</span>';
  html += '<h2>' + p.nombre + '</h2>';
  if (tagsHtml) html += '<div class="detail-tags">' + tagsHtml + '</div>';
  html += descHtml + ingsHtml;
  if (pricesHtml) html += '<div class="detail-prices-row">' + pricesHtml + '</div>';
  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

/* === RECETAS === */
function selectRecetaCat(cat) {
  var items = document.querySelectorAll('#sidebar-receta-cats li');
  for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i].textContent.trim() === cat);
  _currentRecetaCat = cat;
  var tabs = document.querySelectorAll('.recipe-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.cat === cat);
  var grid = document.getElementById('recipe-grid'); if (grid) grid.style.display = '';
  var rd = document.getElementById('recipe-detail'); if (rd) rd.innerHTML = '';
  renderRecipeGrid();
}
function renderRecipeGrid() {
  var recetas = getRecetas();
  var filtered = [];
  for (var i = 0; i < recetas.length; i++) { if (recetas[i].categoria === _currentRecetaCat) filtered.push(recetas[i]); }
  var grid = document.getElementById('recipe-grid');
  if (filtered.length === 0) { grid.innerHTML = '<div class="page-placeholder"><p>Sin recetas aun</p></div>'; return; }
  var h = '';
  for (var i = 0; i < filtered.length; i++) {
    var r = filtered[i];
    var diffClass = r.dificultad === 'Facil' ? 'easy' : (r.dificultad === 'Dificil' ? 'hard' : 'medium');
    h += '<div class="recipe-grid-card" onclick="showRecipeDetail(\'' + r._key + '\')">';
    h += '<div class="rgc-cat">' + (r.categoria || '') + '</div>';
    h += '<div class="rgc-title">' + (r.titulo || 'Sin titulo') + '</div>';
    h += '<div class="rgc-meta">';
    h += '<span class="rgc-diff ' + diffClass + '">' + (r.dificultad || '') + '</span>';
    if (r.tiempo) h += '<span>' + r.tiempo + '</span>';
    if (r.porciones) h += '<span>' + r.porciones + ' porciones</span>';
    h += '</div></div>';
  }
  grid.innerHTML = h;
}

var _arcanoLinkData = null;
function _getArcanoLinkData() {
  if (_arcanoLinkData) return _arcanoLinkData;
  var products = getStoreProducts(); var map = {};
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    if (p.nombre && (p.precioChico > 0 || p.precioGrande > 0)) map[p.nombre] = p.id;
  }
  var names = Object.keys(map);
  if (names.length === 0) { _arcanoLinkData = { regex: null, map: map }; return _arcanoLinkData; }
  names.sort(function(a, b) { return b.length - a.length; });
  var escaped = [];
  for (var i = 0; i < names.length; i++) escaped.push(names[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  _arcanoLinkData = { regex: new RegExp('(^|[\\s,.:;!?])(' + escaped.join('|') + ')(?=[\\s,.:;!?]|$)', 'gi'), map: map };
  return _arcanoLinkData;
}
function _linkArcanoProducts(text) {
  var data = _getArcanoLinkData();
  if (!data.regex) return text;
  return text.replace(data.regex, function(full, before, name) {
    var pid = null;
    for (var k in data.map) { if (k.toLowerCase() === name.toLowerCase()) { pid = data.map[k]; break; } }
    if (!pid) return full;
    return before + '<span class=\'arcano-link\' onclick=\'event.stopPropagation();openDetail(' + pid + ')\'>' + name + '</span>';
  });
}

function showRecipeDetail(key) {
  var recetas = getRecetas(); var r = null;
  for (var i = 0; i < recetas.length; i++) { if (recetas[i]._key === key) { r = recetas[i]; break; } }
  if (!r) return;
  document.getElementById('recipe-grid').style.display = 'none';
  var el = document.getElementById('recipe-detail');
  var diffClass = r.dificultad === 'Facil' ? 'easy' : (r.dificultad === 'Dificil' ? 'hard' : 'medium');
  var diffColor = r.dificultad === 'Facil' ? 'var(--success)' : (r.dificultad === 'Dificil' ? 'var(--error)' : 'var(--gold)');
  var catIcon = r.categoria === 'Infusiones' ? '\u2615' : (r.categoria === 'Cocteleria' ? '\ud83c\udf78' : '\ud83c\udf73');
  var h = '<div class="recipe-detail">';
  h += '<button class="recipe-detail-back" onclick="_backToRecipes()">\u2190 Volver a recetas</button>';
  h += '<div class="rd-header">';
  h += '<div class="rd-cat-badge">' + catIcon + ' ' + (r.categoria || '') + '</div>';
  h += '<h2 class="rd-title">' + (r.titulo || 'Sin titulo') + '</h2>';
  h += '<div class="rd-meta">';
  h += '<span class="rd-diff" style="color:' + diffColor + '">' + (r.dificultad || '') + '</span>';
  if (r.tiempo) h += '<span>\u23f1 ' + r.tiempo + '</span>';
  if (r.porciones) h += '<span>\ud83c\udf5a ' + r.porciones + ' porciones</span>';
  h += '</div></div>';
  if (r.descripcion) h += '<p class="rd-desc">' + _linkArcanoProducts(r.descripcion) + '</p>';
  if (r.ingredientes && r.ingredientes.length) {
    h += '<div class="rd-section-label">Ingredientes</div><ul class="rd-ingredients">';
    for (var j = 0; j < r.ingredientes.length; j++) h += '<li>' + _linkArcanoProducts(r.ingredientes[j]) + '</li>';
    h += '</ul>';
  }
  if (r.pasos && r.pasos.length) {
    h += '<div class="rd-section-label">Preparacion</div><ol class="rd-steps">';
    for (var k = 0; k < r.pasos.length; k++) h += '<li>' + _linkArcanoProducts(r.pasos[k]) + '</li>';
    h += '</ol>';
  }
  h += '<button class="rd-share-btn" onclick="compartirReceta(\'' + r._key + '\')">Compartir receta</button>';
  h += '</div>';
  el.innerHTML = h;
  _updateSidebar(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function _backToRecipes() {
  document.getElementById('recipe-grid').style.display = '';
  document.getElementById('recipe-detail').innerHTML = '';
}
function compartirReceta(key) {
  var recetas = getRecetas(); var receta = null;
  for (var i = 0; i < recetas.length; i++) { if (recetas[i]._key === key) { receta = recetas[i]; break; } }
  if (!receta) return;
  var text = '\ud83c\udf73 ' + (receta.titulo || 'Receta Arcano') + '\n';
  text += (receta.tiempo || '') + (receta.porciones ? ' \u00b7 ' + receta.porciones : '') + '\n\n';
  if (receta.ingredientes && receta.ingredientes.length) {
    text += 'Ingredientes:\n';
    for (var i = 0; i < receta.ingredientes.length; i++) text += '\u2022 ' + receta.ingredientes[i] + '\n';
    text += '\n';
  }
  if (receta.pasos && receta.pasos.length) {
    text += 'Preparacion:\n';
    for (var j = 0; j < receta.pasos.length; j++) text += (j + 1) + '. ' + receta.pasos[j] + '\n';
  }
  text += '\n\u2728 Arcano Especias';
  if (navigator.share) { navigator.share({ title: receta.titulo, text: text }).catch(function() {}); }
  else {
    var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    _showToast('Receta copiada');
  }
}

/* === BLEND BUILDER === */
function _getEspeciasDisponibles() {
  if (!_sDb || !_sDb.especias) return [];
  var especias = []; var items = _sDb.especias;
  for (var i = 0; i < items.length; i++) {
    var e = items[i]; if (!e || !e.nombre) continue;
    if ((e.stockBolsa || 0) > 0) especias.push({ nombre: e.nombre, stockPala: e.stockBolsa || 0, id: e.id });
  }
  especias.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
  return especias;
}

function _bbGetTotal() {
  var total = 0;
  for (var i = 0; i < _blendBuilderState.especias.length; i++) total += _blendBuilderState.especias[i].porcentaje;
  return total;
}

function _getCustomBlendPrice(talla) {
  var config = getTiendaConfig();
  if (talla === 'grande') return config.precioBlendGrande || 0;
  return config.precioBlendChico || 0;
}

// Blend Builder Steps

function _bbGetTotal() {
  var total = 0;
  for (var i = 0; i < _blendBuilderState.especias.length; i++) total += _blendBuilderState.especias[i].porcentaje;
  return total;
}

function _getCustomBlendPrice(talla) {
  var config = getTiendaConfig();
  if (talla === 'grande') return config.precioBlendGrande || 0;
  return config.precioBlendChico || 0;
}

// Blend Builder Steps

function _bbGetTotal() {
  var total = 0;
  for (var i = 0; i < _blendBuilderState.especias.length; i++) total += _blendBuilderState.especias[i].porcentaje;
  return total;
}

function _getCustomBlendPrice(talla) {
  var config = getTiendaConfig();
  if (talla === 'grande') return config.precioBlendGrande || 0;
  return config.precioBlendChico || 0;
}

function renderBlendBuilder() {
  var container = document.getElementById('blend-builder');
  if (!container) return;
  var especias = _getEspeciasDisponibles();
  var state = _blendBuilderState;
  var total = _bbGetTotal();
  var step = state.step || 1;
  var precio = state.talla ? _getCustomBlendPrice(state.talla) : 0;
  var activeId = null, selStart = null, selEnd = null;
  if (document.activeElement && document.activeElement.id) {
    activeId = document.activeElement.id;
    if (document.activeElement.setSelectionRange) { selStart = document.activeElement.selectionStart; selEnd = document.activeElement.selectionEnd; }
  }

  // Step indicators
  var steps = ['Nombre', 'Tamano', 'Especias', 'Proporciones', 'Confirmar'];
  var h = '<div class="bb-container">';
  h += '<div class="bb-steps">';
  for (var si = 0; si < steps.length; si++) {
    var sNum = si + 1;
    var cls = 'bb-step';
    if (sNum === step) cls += ' active';
    else if (sNum < step) cls += ' done';
    h += '<div class="' + cls + '">' +
         '<div class="bb-step-num">' + (sNum < step ? '\u2713' : sNum) + '</div>' +
         '<div class="bb-step-label">' + steps[si] + '</div></div>';
  }
  h += '</div>';

  // Step 1: Nombre
  if (step === 1) {
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">Nombra tu blend</h3>';
    h += '<p class="bb-step-desc">Dale un nombre unico a tu mezcla especial.</p>';
    h += '<input class="bb-name-input" id="bb-name" value="' + (state.nombre || '').replace(/"/g, '&quot;') + '" oninput="_bbOnNameInput(this)" placeholder="Ej: Mi mezcla especial">';
    h += '</div>';
  }

  // Step 2: Tamano
  if (step === 2) {
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">Elige el tamano</h3>';
    h += '<p class="bb-step-desc">Selecciona el tamano del frasco para tu blend.</p>';
    h += '<div class="bb-size-cards">';
    h += '<div class="bb-size-card' + (state.talla === 'chico' ? ' selected' : '') + '" onclick="_bbSetTalla(\'chico\')">';
    h += '<div class="bb-size-card-icon">\ud83e\uddf2</div>';
    h += '<div class="bb-size-card-name">Pequeno</div>';
    if (precio > 0 && state.talla === 'chico') h += '<div class="bb-size-card-price">$' + precio.toLocaleString() + '</div>';
    h += '</div>';
    h += '<div class="bb-size-card' + (state.talla === 'grande' ? ' selected' : '') + '" onclick="_bbSetTalla(\'grande\')">';
    h += '<div class="bb-size-card-icon">\ud83e\uddf2</div>';
    h += '<div class="bb-size-card-name">Grande</div>';
    if (precio > 0 && state.talla === 'grande') h += '<div class="bb-size-card-price">$' + precio.toLocaleString() + '</div>';
    h += '</div>';
    h += '</div></div>';
  }

  // Step 3: Especias
  if (step === 3) {
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">Elige tus especias</h3>';
    h += '<p class="bb-step-desc">Selecciona entre 2 y 5 especias para tu blend.</p>';
    if (state.especias.length > 0) {
      h += '<div class="bb-selected-count">' + state.especias.length + ' de 5 seleccionadas</div>';
    }
    h += '<div class="bb-chips-grid">';
    for (var e = 0; e < especias.length; e++) {
      var isSelected = false;
      for (var s = 0; s < state.especias.length; s++) {
        if (state.especias[s].nombre === especias[e].nombre) { isSelected = true; break; }
      }
      var safeName = especias[e].nombre.replace(/'/g, "\\'");
      if (isSelected) {
        h += '<button class="bb-chip selected" onclick="_bbRemoveSpiceByName(\'' + safeName + '\')">' + especias[e].nombre + '<span class="bb-chip-check">\u2713</span></button>';
      } else {
        var disabled = state.especias.length >= 5 ? ' disabled' : '';
        h += '<button class="bb-chip' + disabled + '" onclick="_bbAddSpice(\'' + safeName + '\')">' + especias[e].nombre + '</button>';
      }
    }
    h += '</div></div>';
  }

  // Step 4: Proporciones
  if (step === 4) {
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">Define las proporciones</h3>';
    h += '<p class="bb-step-desc">Ajusta el porcentaje de cada especia. El total debe ser 100%.</p>';
    h += '<div class="bb-mix-list">';
    for (var i = 0; i < state.especias.length; i++) {
      var sp = state.especias[i];
      h += '<div class="bb-mix-row"><span class="bb-mix-name">' + sp.nombre + '</span><div class="bb-mix-controls">';
      h += '<button class="bb-pct-btn" onclick="_bbChangePct(' + i + ',-5)">-</button>';
      h += '<div class="bb-pct-display"><input class="bb-pct-input" id="bb-pct-' + i + '" type="number" min="1" max="100" value="' + sp.porcentaje + '" onchange="_bbSetPctDirect(' + i + ',this.value)"><span class="bb-pct-sym">%</span></div>';
      h += '<button class="bb-pct-btn" onclick="_bbChangePct(' + i + ',5)">+</button>';
      h += '</div></div>';
    }
    h += '</div>';
    var barColor = total === 100 ? 'var(--success)' : (total > 100 ? 'var(--error)' : 'var(--gold)');
    h += '<div class="bb-total-section"><div class="bb-total-bar"><div class="bb-total-fill" style="width:' + Math.min(total, 100) + '%;background:' + barColor + '"></div></div>';
    h += '<div class="bb-total-text" style="color:' + barColor + '">' + (total > 100 ? 'Excedes el 100%' : 'Total: ' + total + '%') + '</div></div>';
    h += '</div>';
  }

  // Step 5: Confirmar
  if (step === 5) {
    var tallaLabel = state.talla === 'grande' ? 'Grande' : 'Pequeno';
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">Resumen de tu blend</h3>';
    h += '<div class="bb-summary">';
    h += '<div class="bb-summary-row"><span class="bb-summary-label">Nombre</span><span class="bb-summary-value">' + (state.nombre || '-') + '</span></div>';
    h += '<div class="bb-summary-row"><span class="bb-summary-label">Tamano</span><span class="bb-summary-value">' + tallaLabel + '</span></div>';
    h += '<div class="bb-summary-row"><span class="bb-summary-label">Precio</span><span class="bb-summary-value bb-summary-price">$' + precio.toLocaleString() + '</span></div>';
    h += '</div>';
    h += '<div class="bb-summary-specs">';
    for (var i = 0; i < state.especias.length; i++) {
      var sp = state.especias[i];
      h += '<div class="bb-summary-spec"><span class="bb-spec-name">' + sp.nombre + '</span><span class="bb-spec-pct">' + sp.porcentaje + '%</span></div>';
    }
    h += '</div></div>';
  }

  // Navigation buttons
  h += '<div class="bb-nav">';
  if (step > 1) {
    h += '<button class="bb-nav-btn prev" onclick="_bbGoStep(' + (step - 1) + ')">Atras</button>';
  } else {
    h += '<div></div>';
  }
  if (step < 5) {
    var canNext = _bbCanNext(step);
    h += '<button id="bb-btn-next" class="bb-nav-btn next' + (canNext ? '' : ' disabled') + '" onclick="_bbGoStep(' + (step + 1) + ')"' + (canNext ? '' : ' disabled') + '>Siguiente</button>';
  } else {
    h += '<button class="bb-nav-btn next cart" onclick="addCustomBlendToCart()">Agregar al carrito</button>';
  }
  h += '</div>';
  h += '</div>';
  container.innerHTML = h;
  if (activeId) { var el = document.getElementById(activeId); if (el) { el.focus(); if (selStart !== null) el.setSelectionRange(selStart, selEnd); } }
}

function _bbCanNext(step) {
  var s = _blendBuilderState;
  if (step === 1) return s.nombre.trim().length > 0;
  if (step === 2) return s.talla === 'chico' || s.talla === 'grande';
  if (step === 3) return s.especias.length >= 2;
  if (step === 4) return _bbGetTotal() === 100;
  return false;
}

function _bbOnNameInput(el) {
  _blendBuilderState.nombre = el.value;
  var btn = document.getElementById('bb-btn-next');
  if (!btn) return;
  if (el.value.trim().length > 0) {
    btn.removeAttribute('disabled');
    btn.classList.remove('disabled');
  } else {
    btn.setAttribute('disabled', '');
    btn.classList.add('disabled');
  }
}
function _bbGoStep(n) {
  if (n > _blendBuilderState.step && !_bbCanNext(_blendBuilderState.step)) return;
  // Auto-distribute when entering step 4
  if (n === 4 && _blendBuilderState.step < 4) {
    var count = _blendBuilderState.especias.length;
    var base = Math.floor(100 / count);
    var remainder = 100 - base * count;
    for (var i = 0; i < count; i++) {
      _blendBuilderState.especias[i].porcentaje = base + (i === 0 ? remainder : 0);
    }
  }
  _blendBuilderState.step = n;
  renderBlendBuilder();
}

function _bbSetTalla(t) { _blendBuilderState.talla = t; renderBlendBuilder(); }
function _bbAddSpice(nombre) {
  if (_blendBuilderState.especias.length >= 5) return;
  _blendBuilderState.especias.push({ nombre: nombre, porcentaje: 0 });
  renderBlendBuilder();
}
function _bbRemoveSpice(idx) { _blendBuilderState.especias.splice(idx, 1); renderBlendBuilder(); }
function _bbRemoveSpiceByName(nombre) {
  for (var i = 0; i < _blendBuilderState.especias.length; i++) {
    if (_blendBuilderState.especias[i].nombre === nombre) { _blendBuilderState.especias.splice(i, 1); break; }
  }
  renderBlendBuilder();
}
function _bbChangePct(idx, delta) { var c = _blendBuilderState.especias[idx].porcentaje; var o = _bbGetTotal() - c; var n = c + delta; if (n < 1) n = 1; if (o + n > 100) n = 100 - o; if (n < 1) n = 1; _blendBuilderState.especias[idx].porcentaje = n; renderBlendBuilder(); }
function _bbSetPctDirect(idx, val) { var num = parseInt(val, 10); if (isNaN(num) || num < 1) num = 1; var o = _bbGetTotal() - _blendBuilderState.especias[idx].porcentaje; if (o + num > 100) num = 100 - o; if (num < 1) num = 1; _blendBuilderState.especias[idx].porcentaje = num; renderBlendBuilder(); }
function addCustomBlendToCart() {
  var nombreInput = document.getElementById('bb-name');
  var nombre = nombreInput ? nombreInput.value.trim() : _blendBuilderState.nombre.trim();
  if (!nombre) { alert('Dale un nombre a tu blend'); return; }
  var total = _bbGetTotal();
  if (total !== 100) { alert('El total debe ser 100%'); return; }
  if (_blendBuilderState.especias.length < 2) { alert('Selecciona al menos 2 especias'); return; }
  var precio = _getCustomBlendPrice(_blendBuilderState.talla);
  var tallaLabel = _blendBuilderState.talla === 'grande' ? 'Grande' : 'Pequeno';
  var cartNombre = 'Blend: ' + nombre + ' (' + tallaLabel + ')';
  var customBlend = { nombre: nombre, talla: _blendBuilderState.talla, especias: [] };
  for (var i = 0; i < _blendBuilderState.especias.length; i++) {
    customBlend.especias.push({ nombre: _blendBuilderState.especias[i].nombre, porcentaje: _blendBuilderState.especias[i].porcentaje });
  }
  cart.push({ productId: 'custom-blend-' + Date.now(), nombre: cartNombre, tipo: 'custom-blend', talla: _blendBuilderState.talla, precio: precio, qty: 1, customBlend: customBlend });
  saveCart(); updateCartBadge(); _showToast('Blend ' + nombre + ' agregado');
  _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 };
  renderBlendBuilder();
}

function addCustomBlendToCart() {
  var nombreInput = document.getElementById('bb-name');
  var nombre = nombreInput ? nombreInput.value.trim() : _blendBuilderState.nombre.trim();
  if (!nombre) { alert('Dale un nombre a tu blend'); return; }
  var total = _bbGetTotal();
  if (total !== 100) { alert('El total debe ser 100%'); return; }
  if (_blendBuilderState.especias.length < 2) { alert('Selecciona al menos 2 especias'); return; }
  var precio = _getCustomBlendPrice(_blendBuilderState.talla);
  var tallaLabel = _blendBuilderState.talla === 'grande' ? 'Grande' : 'Pequeno';
  var cartNombre = 'Blend: ' + nombre + ' (' + tallaLabel + ')';
  var customBlend = { nombre: nombre, talla: _blendBuilderState.talla, especias: [] };
  for (var i = 0; i < _blendBuilderState.especias.length; i++) {
    customBlend.especias.push({ nombre: _blendBuilderState.especias[i].nombre, porcentaje: _blendBuilderState.especias[i].porcentaje });
  }
  cart.push({ productId: 'custom-blend-' + Date.now(), nombre: cartNombre, tipo: 'custom-blend', talla: _blendBuilderState.talla, precio: precio, qty: 1, customBlend: customBlend });
  saveCart(); updateCartBadge(); _showToast('Blend ' + nombre + ' agregado');
  _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 };
  renderBlendBuilder();
}

function addCustomBlendToCart() {
  var nombreInput = document.getElementById('bb-name');
  var nombre = nombreInput ? nombreInput.value.trim() : _blendBuilderState.nombre.trim();
  if (!nombre) { alert('Dale un nombre a tu blend'); return; }
  var total = _bbGetTotal();
  if (total !== 100) { alert('El total debe ser 100%'); return; }
  if (_blendBuilderState.especias.length < 2) { alert('Selecciona al menos 2 especias'); return; }
  var precio = _getCustomBlendPrice(_blendBuilderState.talla);
  var tallaLabel = _blendBuilderState.talla === 'grande' ? 'Grande' : 'Pequeno';
  var cartNombre = 'Blend: ' + nombre + ' (' + tallaLabel + ')';
  var customBlend = { nombre: nombre, talla: _blendBuilderState.talla, especias: [] };
  for (var i = 0; i < _blendBuilderState.especias.length; i++) {
    customBlend.especias.push({ nombre: _blendBuilderState.especias[i].nombre, porcentaje: _blendBuilderState.especias[i].porcentaje });
  }
  cart.push({ productId: 'custom-blend-' + Date.now(), nombre: cartNombre, tipo: 'custom-blend', talla: _blendBuilderState.talla, precio: precio, qty: 1, customBlend: customBlend });
  saveCart(); updateCartBadge(); _showToast('Blend ' + nombre + ' agregado');
  _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 };
  renderBlendBuilder();
}

/* === FAQ === */
var _faqData = [
  { q: '\u00bfCuales son los tiempos de envio?', a: 'Realizamos envios a toda Colombia. El tiempo estimado de entrega es de 2 a 5 dias habiles dependiendo de la ciudad.' },
  { q: '\u00bfQue medios de pago aceptan?', a: 'Aceptamos pagos por Nequi, Daviplata, transferencia bancaria y efectivo a traves de puntos autorizados.' },
  { q: '\u00bfCual es la diferencia entre frasco pequeno y grande?', a: 'El frasco pequeno contiene 30-40g, ideal para probar. El grande contiene 80-100g, perfecto para uso frecuente. Ambos vienen sellados al vacio.' },
  { q: '\u00bfComo funciona Tu Blend personalizado?', a: 'Eliges las especias, les asignas un porcentaje hasta completar el 100%, seleccionas el tamano del frasco y lo agregas a tu pedido. Lo preparamos artesanalmente.' },
  { q: '\u00bfLas especias son naturales?', a: 'Si, todas nuestras especias son 100% naturales, sin aditivos artificiales, colorantes ni conservantes.' },
  { q: '\u00bfPuedo pedir por WhatsApp?', a: 'Claro que si! Puedes escribirnos por WhatsApp y te ayudamos con tu pedido.' },
  { q: '\u00bfHacen envios a todo el pais?', a: 'Si, envios a toda Colombia a traves de transportadoras especializadas. El costo se calcula segun la ciudad de destino.' }
];
function renderFaqPage() {
  var el = document.getElementById('faq-container');
  if (!el) return;
  var h = '<div class="faq-container">';
  for (var i = 0; i < _faqData.length; i++) {
    h += '<div class="faq-item" onclick="this.classList.toggle(\'open\')"><div class="faq-q">' + _faqData[i].q + '<span class="faq-icon">+</span></div><div class="faq-a"><p>' + _faqData[i].a + '</p></div></div>';
  }
  h += '</div>';
  el.innerHTML = h;
}

/* === SOCIAL LINKS === */
var _SOCIAL_LINKS = [
  { name: 'Facebook', url: 'https://facebook.com/arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
  { name: 'Instagram', url: 'https://instagram.com/arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.354 2.618 6.782 6.98 6.979C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.668-.072-4.948-.2-4.354-2.618-6.782-6.98-6.979C15.667.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' },
  { name: 'TikTok', url: 'https://tiktok.com/@arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.09-.22-2.98.32-.89.54-1.48 1.5-1.56 2.54-.1 1.26.42 2.55 1.46 3.28 1.04.73 2.5.88 3.68.35 1.18-.53 2.02-1.74 2.08-3.04.04-.96.02-1.92.02-2.88V2.04h1.01z"/></svg>' },
  { name: 'YouTube', url: 'https://youtube.com/@arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  { name: 'WhatsApp', url: 'https://wa.me/XXXXXXXXXX', svg: '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.613z"/></svg>' }
];
function renderSocialLinks() {
  var el = document.getElementById('footer-social');
  if (!el) return;
  var h = '';
  for (var i = 0; i < _SOCIAL_LINKS.length; i++) {
    h += '<a href="' + _SOCIAL_LINKS[i].url + '" target="_blank" title="' + _SOCIAL_LINKS[i].name + '">' + _SOCIAL_LINKS[i].svg + '</a>';
  }
  el.innerHTML = h;
}

/* === INIT === */
document.addEventListener('DOMContentLoaded', function() {
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function() {});
  _initHeaderScroll();
  updateCartBadge();
  _updateSidebar('tienda');
  initTienda().then(function() {
    renderProducts('Todos');
    initRecetas();
    renderSocialLinks();
    onRecetasReady(function() { if (_currentPage === 'recetas') renderRecipeGrid(); });
    onTiendaChange(function() {
      if (!hasVisiblePacks()) {
        var pb = document.querySelector('.filter-pill[data-cat="Packs"]');
        if (pb) pb.style.display = 'none';
      } else {
        var pb = document.querySelector('.filter-pill[data-cat="Packs"]');
        if (pb) pb.style.display = '';
      }
    });
    if (!hasVisiblePacks()) {
      var pb = document.querySelector('.filter-pill[data-cat="Packs"]');
      if (pb) pb.style.display = 'none';
    }
  });
  document.getElementById('filters').addEventListener('click', function(e) {
    var btn = e.target.closest('.filter-pill');
    if (!btn) return;
    currentFilter = btn.dataset.cat;
    var all = document.querySelectorAll('.filter-pill');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    btn.classList.add('active');
    renderProducts(currentFilter);
  });
});

/* === GRANDES CLIENTES === */
function openGrandesClientes() {
  var ov = document.getElementById('gc-overlay');
  if (ov) { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeGrandesClientes() {
  var ov = document.getElementById('gc-overlay');
  if (ov) { ov.classList.remove('open'); document.body.style.overflow = ''; }
}
function submitGrandesClientes(e) {
  e.preventDefault();
  var nombre = document.getElementById('gc-nombre').value.trim();
  var tel = document.getElementById('gc-tel').value.trim();
  var empresa = document.getElementById('gc-empresa').value.trim();
  if (!nombre || !tel) { alert('Nombre y telefono son obligatorios'); return; }
  var btn = document.getElementById('gc-submit-btn');
  btn.disabled = true; btn.textContent = 'Enviando...';
  var ref = firebase.database().ref('arcano/db/grandesClientes').push();
  ref.set({
    nombre: nombre,
    telefono: tel,
    empresa: empresa || '',
    creado: new Date().toISOString(),
    estado: 'nuevo'
  }).then(function() {
    _showToast('Solicitud enviada correctamente');
    closeGrandesClientes();
    document.getElementById('gc-form').reset();
    btn.disabled = false; btn.textContent = 'Enviar Solicitud';
  }).catch(function() {
    alert('Error al enviar. Intenta de nuevo.');
    btn.disabled = false; btn.textContent = 'Enviar Solicitud';
  });
}
