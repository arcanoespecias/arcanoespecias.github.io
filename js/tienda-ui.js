/* ===================== ARCANO TIENDA — UI REDESIGN ===================== */
var cart = JSON.parse(localStorage.getItem('arcano_cart') || '[]');
var _currentPage = 'tienda';
var _currentRecetaCat = 'Comida';
var _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 };
/* Flag: ¿el usuario ya navegó fuera de Tienda en esta sesión de página?
   - false → primera entrada a Tienda (mostrar cofre desde el top)
   - true  → ya navegó a Recetas/Blog/etc., al volver a Tienda scrollear a filtros */
var _hasNavigatedAway = false;

/* === UTIL: escapar HTML para evitar inyección XSS === */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
/* === SEO: Rich alt text helper === */
function _recetaSlug(titulo) {
  var s = titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$ /g, '').substring(0, 120);
  return s;
}
function _productAlt(p) {
  var t = p.tipo === 'blend' ? 'Blend' : (p.tipo === 'pack' ? 'Pack' : 'Especia');
  var cat = (p.categorias && p.categorias[0]) || p.categoria || '';
  return p.nombre + ' - ' + t + (cat ? ' para ' + cat : '') + ' | Arcano Especias';
}


/*** SEO: Dynamic title ***/
var _BASE_TITLE = 'Arcano Especias';
function _updateTitle(page, extra) {
  var titles = {
    tienda: 'Tienda de Especias y Blends Artesanales',
    recetas: 'Recetas con Especias Artesanales',
    blog: 'Blog de Especias y Blends',
    blend: 'Crea tu Blend Personalizado',
    faq: 'Preguntas Frecuentes'
  };
  var t = titles[page] || titles.tienda;
  if (extra) t = extra + ' | ' + _BASE_TITLE;
  else t = t + ' | ' + _BASE_TITLE;
  document.title = t;
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    var descs = {
      tienda: 'Especias y Blends artesanales del mundo. Ingredientes seleccionados de cada rincón para crear sabores únicos. Comidas, infusiones y coctelería. Envíos a toda Colombia.',
      recetas: 'Recetas con especias artesanales de Arcano. Inspírate para cocinar con blends únicos de cada rincón del mundo.',
      blog: 'Blog de especias, blends artesanales, curiosidades, beneficios y origenes de las especias del mundo.',
      blend: 'Crea tu blend personalizado de especias artesanales con Arcano Especias.',
      faq: 'Preguntas frecuentes sobre Arcano Especias: envíos, pagos, productos y más.'
    };
    metaDesc.setAttribute('content', descs[page] || descs.tienda);
  }
}

/* === NAVIGATION === */
function goTo(page) {
  _currentPage = page;
  var pages = ['tienda','recetas','blog','blend','faq']
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

  /* === Efecto del cofre: solo visible en Tienda (home) === */
  if (window.ArcanoOpening) {
    if (page === 'tienda') window.ArcanoOpening.enable();
    else window.ArcanoOpening.disable();
  }

  if (page === 'tienda') {
    _updateTitle('tienda');
    renderProducts(currentFilter);
  } else if (page === 'recetas') {
    _updateTitle('recetas');
    initRecetas();
    onRecetasReady(function() { renderRecipeGrid(); });
    var rd = document.getElementById('recipe-detail');
    if (rd) rd.innerHTML = '';
  } else if (page === 'blog') {
    _updateTitle('blog');
    initBlog();
    onBlogReady(function() { renderBlogList(); });
  } else if (page === 'blend') {
    _updateTitle('blend');
    renderBlendBuilder();
  } else if (page === 'faq') {
    _updateTitle('faq');
    renderFaqPage();
  }
  _updateSidebar(page);
  // GA4: track SPA page view
  if (typeof gtag === 'function') {
    gtag('event', 'page_view', {
      page_title: document.title,
      page_location: 'https://arcanoespecias.github.io/#' + page
    });
  }

  /* === Scroll: si volvemos a Tienda después de haber navegado a otra página,
        scrollear a los filtros de categoría (saltando el hero/cofre).
        Si es primera entrada a Tienda, ir al top para mostrar el cofre. === */
  if (page === 'tienda') {
    if (_hasNavigatedAway) {
      var filtersEl = document.getElementById('filters');
      if (filtersEl) {
        var targetTop = filtersEl.getBoundingClientRect().top + (window.scrollY || window.pageYOffset) - 90;
        if (targetTop < 0) targetTop = 0;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } else {
    _hasNavigatedAway = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
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
    sb.innerHTML = '<p>Descubre mezclas de especias inspiradas en sabores del mundo, creadas para comidas, infusiones y coctelería. Ingredientes seleccionados para llevar nuevos aromas y sabores a cada momento.</p>';
  } else if (page === 'recetas') {
    sb.innerHTML = '<h3>Categorias</h3><ul class="sidebar-cat-list" id="sidebar-receta-cats">' + '<li class="active" onclick="selectRecetaCat(\'Comida\')">Comida</li>' + '<li onclick="selectRecetaCat(\'Infusiones\')">Infusiones</li>' + '<li onclick="selectRecetaCat(\'Cocteleria\')">Cocteleria</li>' + '</ul>';
  } else if (page === 'blog') {
    sb.innerHTML = '<h3>Categorias</h3><ul class="sidebar-cat-list" id="sidebar-blog-cats"><li class="active" onclick="selectBlogCat(\'Todos\')">Todos</li><li onclick="selectBlogCat(\'Historias\')">Historias</li><li onclick="selectBlogCat(\'Beneficios\')">Beneficios</li><li onclick="selectBlogCat(\'Investigaciones\')">Investigaciones</li><li onclick="selectBlogCat(\'Curiosidades\')">Curiosidades</li><li onclick="selectBlogCat(\'Origenes\')">Origenes</li></ul>';
  } else if (page === 'blend') {
    sb.innerHTML = '<p>Crea tu blend personalizado. Mezcla las especias a tu gusto para dar sabor, aroma y carácter a tus comidas, infusiones o cocteles.</p>';
  } else if (page === 'faq') {
    sb.innerHTML = '<p>Aquí encontrarás respuestas a las preguntas más frecuentes sobre nuestros productos, envíos, formas de pago y más. Si no encuentras lo que buscas, no dudes en contactarnos.</p>';
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

/* === HEADER SCROLL (rAF throttled) === */
function _initHeaderScroll() {
  var header = document.querySelector('.nav-header');
  var ticking = false;
  window.addEventListener('scroll', function() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      var y = window.scrollY;
      if (y > 10) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
      ticking = false;
    });
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
    body.innerHTML = '<div class="empty-state" style="padding:48px 0"><p>Tu pedido está vacío</p></div>';
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
  // Update resumen (Subtotal + Envío + Total) usando el módulo de envío
  if (typeof arcanoActualizarResumenCarrito === 'function') {
    arcanoActualizarResumenCarrito(null, cart || [], getCartTotal());
  } else {
    var subtotalEl = document.getElementById('cart-drawer-subtotal-val') || document.getElementById('cart-drawer-total-val');
    if (subtotalEl) subtotalEl.textContent = '$' + getCartTotal().toLocaleString();
  }
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
      '<button class="btn-secondary" onclick="toggleCartDrawer()">Seguir comprando</button>' +
      '<p style="text-align:center;margin:8px 0 0;font-size:0.8rem;color:#a08b6e;line-height:1.5">🚚 Envío gratis en Medellín desde \$60.000. En compras inferiores y envíos fuera de Medellín, el envío tiene costo adicional.</p>';
  } else {
    footer.innerHTML = '<button class="btn-primary" onclick="sendOrder()">Enviar Pedido</button>' +
      '<button class="btn-secondary" onclick="backToCart()">Volver</button>' +
      '<p style="text-align:center;margin:8px 0 0;font-size:0.8rem;color:#a08b6e;line-height:1.5">🚚 Envío gratis en Medellín desde \$60.000. En compras inferiores y envíos fuera de Medellín, el envío tiene costo adicional.</p>';
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
  h += '<div class="form-row"><div class="form-group"><label>Teléfono</label><input class="form-input" id="o-tel" placeholder="300 123 4567"></div>';
  h += '<div class="form-group"><label>Email</label><input class="form-input" id="o-email" type="email" placeholder="tu@email.com"></div></div>';
  h += '<div class="form-row"><div class="form-group"><label>Ciudad</label><select class="form-input" id="o-ciudad" onchange="arcanoActualizarShippingInfo()"><option value="">Selecciona tu ciudad</option><option value="Medellín">Medellín</option><option value="Bogotá">Bogotá</option><option value="Cali">Cali</option><option value="Barranquilla">Barranquilla</option><option value="Cartagena">Cartagena</option><option value="Bucaramanga">Bucaramanga</option><option value="Pereira">Pereira</option><option value="Manizales">Manizales</option><option value="Cúcuta">Cúcuta</option><option value="Santa Marta">Santa Marta</option><option value="Ibagué">Ibagué</option><option value="Villavicencio">Villavicencio</option><option value="Armenia">Armenia</option><option value="Neiva">Neiva</option><option value="Sincelejo">Sincelejo</option><option value="Popayán">Popayán</option><option value="Tunja">Tunja</option><option value="Montería">Montería</option><option value="Valledupar">Valledupar</option><option value="Riohacha">Riohacha</option><option value="Pasto">Pasto</option><option value="Quibdó">Quibdó</option><option value="Florencia">Florencia</option><option value="Yopal">Yopal</option><option value="Arauca">Arauca</option><option value="Leticia">Leticia</option><option value="Inírida">Inírida</option><option value="San José del Guaviare">San José del Guaviare</option><option value="Mitú">Mitú</option><option value="Puerto Carreño">Puerto Carreño</option><option value="Mocoa">Mocoa</option><option value="San Andrés">San Andrés</option><option value="Otra">Otra ciudad</option></select></div>';
  h += '<div class="form-group"><label>Dirección</label><input class="form-input" id="o-dir" placeholder="Dirección de entrega"></div></div>';
  h += '<div class="form-group"><label>Notas</label><textarea class="form-input" id="o-notas" placeholder="Horario, instrucciones..."></textarea></div>';
  // Bloque donde se muestra el costo de envío (lo llena arcanoActualizarShippingInfo)
  h += '<div id="shipping-info" style="display:none"></div>';
  h += '</div>';
  // QR removido del checkout — el admin coordina el pago por WhatsApp
  body.innerHTML = h;
  body.scrollTop = 0;
  _cartSetFooterStep(2);
  // Autocompletar si hay sesion de cliente
  setTimeout(_autocompletarCheckoutSiSesion, 50);
  // Llamada inicial por si la ciudad quedó preseleccionada por autocompletar
  setTimeout(function() { if (typeof arcanoActualizarShippingInfo === 'function') arcanoActualizarShippingInfo(); }, 80);
}

function backToCart() {
  renderCartDrawer();
}

// Mantenemos la función vieja como alias para no romper otros lugares que la llamen
function updateShippingInfo() {
  if (typeof arcanoActualizarShippingInfo === 'function') {
    arcanoActualizarShippingInfo();
  }
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
  var count = getCartCount();
  var badges = document.querySelectorAll('.cart-badge');
  for (var i = 0; i < badges.length; i++) {
    badges[i].textContent = count;
    badges[i].style.display = count > 0 ? 'flex' : 'none';
  }
}

function sendOrder() {
  var nombre = document.getElementById('o-nombre').value.trim();
  var tel = document.getElementById('o-tel').value.trim();
  var email = document.getElementById('o-email').value.trim();
  var ciudad = document.getElementById('o-ciudad').value.trim();
  var dir = document.getElementById('o-dir').value.trim();
  var notas = document.getElementById('o-notas').value.trim();
  if (!nombre || !tel) { alert('Nombre y teléfono son obligatorios'); return; }
  if (!ciudad) { alert('Selecciona tu ciudad'); return; }
  if (cart.length === 0) { alert('El carrito está vacío'); return; }
  var total = getCartTotal();
  // Cálculo real de envío con Servientrega
  var envio = (typeof arcanoCalcularEnvio === 'function')
    ? arcanoCalcularEnvio(ciudad, cart, total)
    : { exito: false, costo: 0, gratis: false, categoria: null, pesoGramos: 0 };
  var envioCosto = envio.gratis ? 0 : (envio.exito ? envio.costo : 0);
  var totalFinal = total + envioCosto;
  var envioInfoNotas;
  if (!envio.exito) {
    envioInfoNotas = 'Sin cobertura automática. Coordinar con el cliente.';
  } else if (envio.gratis) {
    envioInfoNotas = 'Envío gratis (Medellín, pedido ≥ $60.000)';
  } else {
    envioInfoNotas = 'Envío ' + ciudad + ' (' + envio.categoria + ', ' + Math.ceil(envio.pesoGramos / 1000) + 'kg): $' + envio.costo.toLocaleString('es-CO') + ' (Servientrega Contado Normal Terrestre)';
  }
  var items = [];
  for (var i = 0; i < cart.length; i++) {
    var c = cart[i];
    items.push({ productId: c.productId, nombre: c.nombre, tipo: c.tipo, talla: c.talla, precio: c.precio, qty: c.qty, subtotal: c.precio * c.qty });
  }
  var orderData = {
    cliente: { nombre: nombre, telefono: tel, email: email, ciudad: ciudad, direccion: dir },
    items: items,
    subtotal: total,
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
    notas: notas ? notas + ' | ' + envioInfoNotas : envioInfoNotas
  };
  var body = document.getElementById('cart-drawer-body');
  body.innerHTML = '<div style="text-align:center;padding:48px 0"><div class="loader"></div><p style="color:var(--text-sec);margin-top:12px">Enviando pedido...</p></div>';
  submitOrder(orderData).then(function(savedOrder) {
    // Si el pedido se vinculo a un cliente y no hay sesion local, la creamos
    if (savedOrder && savedOrder.clienteId && !getClienteSession()) {
      saveClienteSession({
        id: savedOrder.clienteId,
        nombre: nombre,
        telefono: tel,
        email: email,
        ciudad: ciudad,
        direccion: dir
      });
      _updateCuentaBadge();
    }
    // GA4: purchase event
    if (typeof gtag === 'function') {
      var ga4Items = [];
      for (var gi = 0; gi < cart.length; gi++) {
        ga4Items.push({
          item_id: String(cart[gi].productId),
          item_name: cart[gi].nombre,
          item_category: cart[gi].tipo,
          price: cart[gi].precio,
          quantity: cart[gi].qty
        });
      }
      gtag('event', 'purchase', {
        transaction_id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        currency: 'COP',
        value: totalFinal,
        shipping: envioCosto,
        items: ga4Items
      });
    }
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
    if (products[i].id == pid) { addToCart(products[i], talla); return; }
  }
}
function addToCartPack(pid) {
  var products = getStoreProducts();
  for (var i = 0; i < products.length; i++) {
    if (products[i].id == pid) {
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
      h += '<img src="' + p.imagen + '" alt="' + _productAlt(p) + '" loading="lazy" decoding="async">';
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
      h += '<div class="card-coming-soon">Muy Pronto</div>';
    }
    h += '</div></div></div>';
  }
  grid.innerHTML = h;
}

/* === PRODUCT DETAIL === */
function openDetail(pid) {
  var products = getStoreProducts();
  var currentIdx = -1;
  for (var i = 0; i < products.length; i++) { if (products[i].id == pid) { currentIdx = i; break; } }
  if (currentIdx === -1) return;
  _renderDetail(products, currentIdx);
}

function _renderDetail(products, idx) {
  var p = products[idx];
  if (!p) return;
  // GA4: view_item event
  if (typeof gtag === 'function') {
    var _isPack = p.tipo === 'pack';
    gtag('event', 'view_item', {
      currency: 'COP',
      value: _isPack ? (p.precio || 0) : (p.precioGrande > 0 ? p.precioGrande : p.precioChico),
      items: [{ item_id: String(p.id), item_name: p.nombre, item_category: p.tipo }]
    });
  }
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

  // Remover overlay existente si hay
  var existing = document.getElementById('detail-ov');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.className = 'detail-overlay';
  overlay.id = 'detail-ov';

  var hasPrev = idx > 0;
  var hasNext = idx < products.length - 1;

  var html = '<div class="detail-modal">';
  html += '<button class="detail-close" onclick="document.getElementById(\'detail-ov\').remove()">&times;</button>';
  // Flecha izquierda (producto anterior)
  if (hasPrev) {
    html += '<button class="detail-nav detail-nav-prev" onclick="_swipeDetail(' + idx + ',-1)" title="Anterior">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    html += '</button>';
  }
  // Flecha derecha (producto siguiente)
  if (hasNext) {
    html += '<button class="detail-nav detail-nav-next" onclick="_swipeDetail(' + idx + ',1)" title="Siguiente">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    html += '</button>';
  }
  html += '<div class="detail-modal-img">' + (p.imagen ? '<img src="' + p.imagen + '" alt="' + _productAlt(p) + '" fetchpriority="high">' : '<span>' + (isPack ? '\ud83c\udf81' : (isBlend ? '\ud83c\udf3f' : '\ud83c\udf31')) + '</span>') + '</div>';
  html += '<div class="detail-modal-content">';
  html += '<span class="detail-type-tag ' + typeClass + '">' + typeLabel + '</span>';
  html += '<h2>' + p.nombre + '</h2>';
  if (tagsHtml) html += '<div class="detail-tags">' + tagsHtml + '</div>';
  html += descHtml + ingsHtml + _usosHtml(p);
  if (pricesHtml) html += '<div class="detail-prices-row">' + pricesHtml + '</div>';
  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  // Click en overlay (fuera del modal) para cerrar
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  // Swipe con touch
  var touchStartX = 0;
  var touchEndX = 0;
  overlay.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  overlay.addEventListener('touchend', function(e) {
    touchEndX = e.changedTouches[0].screenX;
    var diff = touchEndX - touchStartX;
    if (Math.abs(diff) < 60) return; // swipe mínimo 60px
    if (diff > 0 && hasPrev) _swipeDetail(idx, -1);
    else if (diff < 0 && hasNext) _swipeDetail(idx, 1);
  }, { passive: true });

  _updateTitle(null, p.nombre + ' - Arcano Especias');
}

function _swipeDetail(currentIdx, direction) {
  var products = getStoreProducts();
  var newIdx = currentIdx + direction;
  if (newIdx < 0 || newIdx >= products.length) return;
  var overlay = document.getElementById('detail-ov');
  if (!overlay) { _renderDetail(products, newIdx); return; }
  var modal = overlay.querySelector('.detail-modal');
  if (!modal) { _renderDetail(products, newIdx); return; }
  // Animación tipo carta: deslizar fuera + fade
  modal.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
  modal.style.transform = direction > 0 ? 'translateX(-40px) scale(0.95)' : 'translateX(40px) scale(0.95)';
  modal.style.opacity = '0';
  setTimeout(function() {
    // Renderizar el nuevo contenido directamente en el modal existente
    _updateDetailContent(overlay, products, newIdx);
    // Reset transform para que entre desde el lado opuesto
    modal.style.transform = direction > 0 ? 'translateX(40px) scale(0.95)' : 'translateX(-40px) scale(0.95)';
    modal.style.opacity = '0';
    // Forzar reflow para que la transición funcione
    void modal.offsetHeight;
    // Animar entrada
    modal.style.transform = 'translateX(0) scale(1)';
    modal.style.opacity = '1';
  }, 200);
}

function _updateDetailContent(overlay, products, idx) {
  var p = products[idx];
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
  var hasPrev = idx > 0;
  var hasNext = idx < products.length - 1;
  var html = '<div class="detail-modal">';
  html += '<button class="detail-close" onclick="document.getElementById(\'detail-ov\').remove()">&times;</button>';
  if (hasPrev) {
    html += '<button class="detail-nav detail-nav-prev" onclick="_swipeDetail(' + idx + ',-1)" title="Anterior">';
    html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    html += '</button>';
  }
  if (hasNext) {
    html += '<button class="detail-nav detail-nav-next" onclick="_swipeDetail(' + idx + ',1)" title="Siguiente">';
    html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    html += '</button>';
  }
  html += '<div class="detail-modal-img">' + (p.imagen ? '<img src="' + p.imagen + '" alt="' + _productAlt(p) + '" fetchpriority="high">' : '<span>' + (isPack ? '\ud83c\udf81' : (isBlend ? '\ud83c\udf3f' : '\ud83c\udf31')) + '</span>') + '</div>';
  html += '<div class="detail-modal-content">';
  html += '<span class="detail-type-tag ' + typeClass + '">' + typeLabel + '</span>';
  html += '<h2>' + p.nombre + '</h2>';
  if (tagsHtml) html += '<div class="detail-tags">' + tagsHtml + '</div>';
  html += descHtml + ingsHtml + _usosHtml(p);
  if (pricesHtml) html += '<div class="detail-prices-row">' + pricesHtml + '</div>';
  html += '</div></div>';
  // Actualizar el contenido del overlay
  overlay.innerHTML = html;
  // Re-attach touch listeners
  var touchStartX = 0;
  overlay.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  overlay.addEventListener('touchend', function(e) {
    var touchEndX = e.changedTouches[0].screenX;
    var diff = touchEndX - touchStartX;
    if (Math.abs(diff) < 60) return;
    if (diff > 0 && hasPrev) _swipeDetail(idx, -1);
    else if (diff < 0 && hasNext) _swipeDetail(idx, 1);
  }, { passive: true });
  _updateTitle(null, p.nombre + ' - Arcano Especias');
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
  if (filtered.length === 0) { grid.innerHTML = '<div class="page-placeholder"><p>Sin recetas aún</p></div>'; return; }
  var h = '';
  for (var i = 0; i < filtered.length; i++) {
    var r = filtered[i];
    var diffClass = r.dificultad === 'Facil' ? 'easy' : (r.dificultad === 'Dificil' ? 'hard' : 'medium');
    h += '<div class="recipe-grid-card" onclick="showRecipeDetail(\'' + r._key + '\')">';
    h += '<div class="rgc-cat">' + (r.categoria || '') + '</div>';
    h += '<div class="rgc-title">' + (r.titulo || 'Sin título') + '</div>';
    h += '<div class="rgc-meta">';
    h += '<span class="rgc-diff ' + diffClass + '">' + (r.dificultad || '') + '</span>';
    if (r.tiempo) h += '<span>' + r.tiempo + '</span>';
    if (r.porciones) h += '<span>' + r.porciones + ' porciones</span>';
    h += '</div><a href="https://arcanoespecias.github.io/recetas/' + _recetaSlug(r.titulo) + '.html" class="sr-only" aria-hidden="true" tabindex="-1">' + (r.titulo || 'Receta') + ' - Arcano Especias</a></div>';
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
  h += '<h2 class="rd-title">' + (r.titulo || 'Sin título') + '</h2>';
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
    h += '<div class="rd-section-label">Preparación</div><ol class="rd-steps">';
    for (var k = 0; k < r.pasos.length; k++) h += '<li>' + _linkArcanoProducts(r.pasos[k]) + '</li>';
    h += '</ol>';
  }
  h += '<button class="rd-share-btn" onclick="compartirReceta(\'' + r._key + '\')">Compartir receta</button>';
  h += '<a href="https://arcanoespecias.github.io/recetas/' + _recetaSlug(r.titulo) + '.html" class="rd-static-link sr-only" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1">Ver receta completa</a>';
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
    text += 'Preparación:\n';
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
    var stock = e.stockBolsa || 0;
    /* Mostrar todas las especias; las agotadas con flag outOfStock=true */
    especias.push({ nombre: e.nombre, stockPala: stock, id: e.id, outOfStock: stock <= 0 });
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

/* ============================================================
   ALQUIMISTA — Nuevo "Arma tu Blend" interactivo
   ============================================================ */

/* Paleta de colores curada por nombre de especia.
   Si no encuentra match, genera color estable desde hash del nombre. */
var _ALQ_SPICE_COLORS = {
  'ajo': '#E8D5A0', 'ajos': '#E8D5A0',
  'ají': '#D2452A', 'aji': '#D2452A', 'ajíes': '#D2452A',
  'albahaca': '#5A8B3A',
  'achiote': '#E6632A', 'annatto': '#E6632A',
  'baharat': '#6B3A28',
  'canela': '#8B4513',
  'cardamomo': '#B4C766',
  'cilantro': '#8DB360',
  'comino': '#C2853D',
  'cúrcuma': '#E8B530', 'curcuma': '#E8B530', 'turmeric': '#E8B530',
  'eneldo': '#7BA05B',
  'garam masala': '#A0522D',
  'jengibre': '#D4A574', 'ginger': '#D4A574',
  'laurel': '#4A6B3A',
  'mahleb': '#C8AC7A',
  'mejorana': '#7BA042',
  'nuez moscada': '#9B6B3A',
  'orégano': '#6B8E3A', 'oregano': '#6B8E3A',
  'pimienta': '#2D2A26', 'pimientas': '#2D2A26',
  'pimienta negra': '#1A1614', 'pepper': '#2D2A26',
  'pimentón': '#B23A28', 'pimenton': '#B23A28', 'paprika': '#B23A28',
  'pimentón dulce': '#C84838',
  'romero': '#4A6B3A', 'rosemary': '#4A6B3A',
  'sal': '#F5F0E8', 'sal de himalaya': '#E89B8C', 'sal marina': '#F0EAE0',
  'tomillo': '#7BA042', 'thyme': '#7BA042',
  'vainilla': '#3A2418', 'vanilla': '#3A2418',
  'zaatar': '#7B8B3A',
  'zanahoria': '#E67E22'
};
var _ALQ_FALLBACK_PALETTE = [
  '#D4A574', '#C2853D', '#A0522D', '#B23A28', '#E8B530',
  '#6B8E3A', '#7BA042', '#5A8B3A', '#8B4513', '#2D2A26',
  '#C8AC7A', '#E6632A', '#7B8B3A', '#B4C766', '#E89B8C'
];
function _alqGetSpiceColor(nombre) {
  if (!nombre) return '#C9A961';
  var key = nombre.toLowerCase().trim();
  if (_ALQ_SPICE_COLORS[key]) return _ALQ_SPICE_COLORS[key];
  /* Hash determinista del nombre para fallback */
  var hash = 0;
  for (var i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  }
  return _ALQ_FALLBACK_PALETTE[hash % _ALQ_FALLBACK_PALETTE.length];
}

/* Auto-distribuye porcentajes equitativamente al agregar/quitar especias */
function _alqRedistribute() {
  var s = _blendBuilderState;
  var n = s.especias.length;
  if (n === 0) return;
  var base = Math.floor(100 / n);
  var rem = 100 - base * n;
  for (var i = 0; i < n; i++) {
    s.especias[i].porcentaje = base + (i === 0 ? rem : 0);
  }
}

/* === Render principal === */
function renderBlendBuilder() {
  var container = document.getElementById('blend-builder');
  if (!container) return;
  var state = _blendBuilderState;

  /* Vista de éxito (step 6) */
  if (state.step === 6) {
    container.innerHTML = _alqRenderSuccess();
    return;
  }

  var especias = _getEspeciasDisponibles();
  var precio = state.talla ? _getCustomBlendPrice(state.talla) : 0;
  var total = _bbGetTotal();
  var canAddToCart = state.nombre.trim().length > 0 &&
                     (state.talla === 'chico' || state.talla === 'grande') &&
                     state.especias.length >= 2 &&
                     total === 100;

  var tallaLabel = state.talla === 'grande' ? 'Grande' : (state.talla === 'chico' ? 'Pequeño' : '');
  var tallaPriceChico = _getCustomBlendPrice('chico');
  var tallaPriceGrande = _getCustomBlendPrice('grande');

  var h = '';
  h += '<div class="alq-container">';
  /* === Panel izquierdo: Frasco === */
  h += '<div class="alq-jar-panel">';
  h += '  <div class="alq-jar-stage">';
  /* SVG del frasco - proporciones exactas del original:
     - Tapa: ancho 42, alto 36 (x=24-66, y=20-56)
     - Cuello: ancho 42, alto 36 (x=24-66, y=56-92) — igual de ancho que la tapa
     - Hombros: ancho 74, alto 14 (y=92-106) — transición cuello→cuerpo
     - Cuerpo: ancho 74, alto 162 (x=8-82, y=106-268) — cilindro largo y estrecho
     Total: ~250 alto × 74 ancho (ratio 3.4) */
  h += '    <svg class="alq-jar-svg" viewBox="0 0 90 270" preserveAspectRatio="xMidYMid meet" aria-label="Frasco Arcano">';
  h += '      <defs>';
  h += '        <linearGradient id="alq-metal" x1="0" y1="0" x2="0" y2="1">';
  h += '          <stop offset="0%" stop-color="#B8B8C0"/>';
  h += '          <stop offset="15%" stop-color="#FFFFFF"/>';
  h += '          <stop offset="35%" stop-color="#E0E0E8"/>';
  h += '          <stop offset="55%" stop-color="#A8A8B0"/>';
  h += '          <stop offset="80%" stop-color="#6C6C76"/>';
  h += '          <stop offset="100%" stop-color="#383840"/>';
  h += '        </linearGradient>';
  h += '        <linearGradient id="alq-glass" x1="0" y1="0" x2="1" y2="0">';
  h += '          <stop offset="0%" stop-color="rgba(120,170,140,0.32)"/>';
  h += '          <stop offset="20%" stop-color="rgba(255,255,255,0.18)"/>';
  h += '          <stop offset="50%" stop-color="rgba(240,255,250,0.05)"/>';
  h += '          <stop offset="80%" stop-color="rgba(200,230,210,0.18)"/>';
  h += '          <stop offset="100%" stop-color="rgba(90,130,110,0.55)"/>';
  h += '        </linearGradient>';
  h += '        <linearGradient id="alq-glass-neck" x1="0" y1="0" x2="1" y2="0">';
  h += '          <stop offset="0%" stop-color="rgba(120,170,140,0.5)"/>';
  h += '          <stop offset="30%" stop-color="rgba(255,255,255,0.5)"/>';
  h += '          <stop offset="50%" stop-color="rgba(220,240,230,0.18)"/>';
  h += '          <stop offset="70%" stop-color="rgba(180,220,200,0.25)"/>';
  h += '          <stop offset="100%" stop-color="rgba(80,120,100,0.6)"/>';
  h += '        </linearGradient>';
  h += '        <linearGradient id="alq-shine" x1="0" y1="0" x2="0" y2="1">';
  h += '          <stop offset="0%" stop-color="rgba(255,255,255,0.65)"/>';
  h += '          <stop offset="30%" stop-color="rgba(255,255,255,0.32)"/>';
  h += '          <stop offset="60%" stop-color="rgba(255,255,255,0.12)"/>';
  h += '          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>';
  h += '        </linearGradient>';
  h += '        <clipPath id="alq-body-clip">';
  h += '          <path d="M 8 106 L 8 260 Q 8 268 16 268 L 74 268 Q 82 268 82 260 L 82 106 Z"/>';
  h += '        </clipPath>';
  h += '      </defs>';
  /* Sombra elíptica base */
  h += '      <ellipse cx="45" cy="268" rx="42" ry="4" fill="rgba(0,0,0,0.55)"/>';
  /* Cuerpo del frasco (cilindro con esquinas inferiores redondeadas) */
  h += '      <path d="M 8 106 L 8 260 Q 8 268 16 268 L 74 268 Q 82 268 82 260 L 82 106 Z" fill="url(#alq-glass)" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>';
  /* Capas de especias dentro del cuerpo (clip-path al cuerpo) */
  h += '      <g clip-path="url(#alq-body-clip)" id="alq-layers-svg"></g>';
  /* Brillo principal izquierdo (franja vertical sobre el cuerpo) */
  h += '      <rect x="13" y="114" width="6" height="145" rx="3" fill="url(#alq-shine)" opacity="0.85"/>';
  /* Brillo secundario derecho */
  h += '      <rect x="71" y="120" width="2.5" height="120" rx="1.5" fill="rgba(255,255,255,0.3)"/>';
  /* Hombros curvos (transición del cuello estrecho al cuerpo ancho) */
  h += '      <path d="M 8 106 Q 8 92 24 88 L 66 88 Q 82 92 82 106 Z" fill="url(#alq-glass)" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>';
  /* Cuello estrecho (mismo ancho que la tapa) */
  h += '      <rect x="24" y="52" width="42" height="36" fill="url(#alq-glass-neck)" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>';
  /* Brillo del cuello (franja vertical) */
  h += '      <rect x="28" y="56" width="3" height="28" rx="1.5" fill="rgba(255,255,255,0.55)"/>';
  /* Tapa metálica con estrías (mismo ancho que el cuello) */
  h += '      <rect x="24" y="16" width="42" height="36" fill="url(#alq-metal)" stroke="rgba(0,0,0,0.65)" stroke-width="1" rx="2"/>';
  /* Estrías verticales en la tapa (rosca metálica) */
  h += '      <g stroke="rgba(0,0,0,0.4)" stroke-width="0.6">';
  for (var se = 0; se < 14; se++) {
    var xPos = 26 + se * 3;
    h += '<line x1="' + xPos + '" y1="18" x2="' + xPos + '" y2="50"/>';
  }
  h += '      </g>';
  /* Brillo metálico izquierdo (franja vertical) */
  h += '      <rect x="28" y="20" width="3" height="28" rx="1.5" fill="rgba(255,255,255,0.7)"/>';
  /* Cúpula superior convexa de la tapa */
  h += '      <path d="M 25 18 Q 45 8 65 18" fill="url(#alq-metal)" stroke="rgba(0,0,0,0.5)" stroke-width="0.8"/>';
  h += '    </svg>';
  h += '  </div>';
  h += '  <div class="alq-jar-info">';
  h += '    <div class="alq-jar-name" id="alq-jar-name">' + (state.nombre ? esc(state.nombre) : '') + '</div>';
  h += '    <div class="alq-jar-size" id="alq-jar-size">' + (tallaLabel || 'Elige tamaño') + '</div>';
  if (precio > 0) {
    h += '    <div class="alq-jar-price">$' + precio.toLocaleString() + '</div>';
  }
  h += '  </div>';
  h += '</div>';

  /* === Panel derecho: Controles === */
  h += '<div class="alq-controls-panel">';

  /* Step 1: Nombre */
  h += '<div class="alq-section">';
  h += '  <label class="alq-label" for="bb-name">Nombre del blend</label>';
  h += '  <input class="alq-name-input" id="bb-name" value="' + (state.nombre || '').replace(/"/g, '&quot;') + '" oninput="_alqOnNameInput(this)" placeholder="Ej: Sazón Original" maxlength="40">';
  h += '</div>';

  /* Step 2: Tamaño */
  h += '<div class="alq-section">';
  h += '  <label class="alq-label">Tamaño del frasco</label>';
  h += '  <div class="alq-size-row">';
  h += '    <button class="alq-size-btn' + (state.talla === 'chico' ? ' selected' : '') + '" onclick="_alqSetTalla(\'chico\')">';
  h += '      <div class="alq-size-btn-icon">🫙</div>';
  h += '      <div class="alq-size-btn-label">Pequeño</div>';
  h += '      <div class="alq-size-btn-price">$' + tallaPriceChico.toLocaleString() + '</div>';
  h += '    </button>';
  h += '    <button class="alq-size-btn' + (state.talla === 'grande' ? ' selected' : '') + '" onclick="_alqSetTalla(\'grande\')">';
  h += '      <div class="alq-size-btn-icon">🫙</div>';
  h += '      <div class="alq-size-btn-label">Grande</div>';
  h += '      <div class="alq-size-btn-price">$' + tallaPriceGrande.toLocaleString() + '</div>';
  h += '    </button>';
  h += '  </div>';
  h += '</div>';

  /* Step 3: Especias */
  h += '<div class="alq-section">';
  h += '  <label class="alq-label">Especias <span class="alq-counter">' + state.especias.length + '/5</span></label>';
  h += '  <div class="alq-spice-grid">';
  for (var e = 0; e < especias.length; e++) {
    var isSelected = false;
    for (var s = 0; s < state.especias.length; s++) {
      if (state.especias[s].nombre === especias[e].nombre) { isSelected = true; break; }
    }
    var color = _alqGetSpiceColor(especias[e].nombre);
    var safeName = especias[e].nombre.replace(/'/g, "\'");
    var outOfStock = especias[e].outOfStock === true;
    var cls = 'alq-spice-card';
    if (isSelected) cls += ' selected';
    if (outOfStock) cls += ' out-of-stock';
    else if (!isSelected && state.especias.length >= 5) cls += ' disabled';
    var onclickAttr = outOfStock ? '' : ' onclick="_alqToggleSpice(\'' + safeName + '\')"';
    var disabledAttr = outOfStock ? ' disabled' : '';
    h += '<button class="' + cls + '"' + onclickAttr + disabledAttr + ' style="--swatch-color:' + color + '">';
    h += '  <div class="alq-spice-swatch"></div>';
    h += '  <div class="alq-spice-name">' + esc(especias[e].nombre) + '</div>';
    if (outOfStock) h += '  <div class="alq-spice-stock">Agotada</div>';
    h += '</button>';
  }
  h += '  </div>';
  h += '</div>';

  /* Step 4: Proporciones (visible solo si 2+ especias) */
  var visible = state.especias.length >= 2;
  h += '<div class="alq-section alq-proportions' + (visible ? ' visible' : '') + '">';
  var totalCls = total === 100 ? '' : (total > 100 ? ' danger' : ' warning');
  h += '  <label class="alq-label">Proporciones <span class="alq-total-pill' + totalCls + '">Total: ' + total + '%</span></label>';
  h += '  <div class="alq-mix-bar" id="alq-mix-bar"></div>';
  h += '  <div class="alq-legend" id="alq-legend"></div>';
  h += '</div>';

  /* Step 5: CTA */
  h += '<button class="alq-cta" onclick="addCustomBlendToCart()"' + (canAddToCart ? '' : ' disabled') + '>';
  h += '  <span>Agregar al carrito</span>';
  if (precio > 0) h += '  <span class="alq-cta-price">$' + precio.toLocaleString() + '</span>';
  h += '</button>';

  h += '</div>'; /* .alq-controls-panel */
  h += '</div>'; /* .alq-container */

  container.innerHTML = h;

  /* Render dinámico del frasco y la barra */
  _alqUpdateJar();
  _alqUpdateMixBar();
}

/* === Actualizar el frasco (capas de especias) ===
   El frasco se llena según el número de especias seleccionadas:
   - 0 especias: frasco vacío (solo fondo transparente)
   - 1-5 especias: fill = n/5 * 100% del cuerpo del frasco
   Dentro del área llenada, cada capa se dimensiona por su porcentaje del blend.
=== */
function _alqUpdateJar() {
  var layersEl = document.getElementById('alq-layers-svg');
  if (!layersEl) return;
  var state = _blendBuilderState;
  /* El cuerpo del frasco en el SVG va de y=106 a y=268 (altura útil = 162 unidades) */
  var BODY_TOP = 106;
  var BODY_BOTTOM = 268;
  var BODY_HEIGHT = BODY_BOTTOM - BODY_TOP;
  var BODY_LEFT = 8;
  var BODY_RIGHT = 82;

  var svgContent = '';
  if (state.especias.length === 0) {
    /* Frasco vacío: polvo residual al fondo (8% de la altura del cuerpo) */
    var emptyHeight = BODY_HEIGHT * 0.08;
    svgContent += '<rect x="' + BODY_LEFT + '" y="' + (BODY_BOTTOM - emptyHeight) + '" width="' + (BODY_RIGHT - BODY_LEFT) + '" height="' + emptyHeight + '" fill="rgba(80,60,40,0.5)"/>';
  } else {
    /* Calcular el nivel de llenado: 1=20%, 2=40%, 3=60%, 4=80%, 5=100% */
    var fillLevel = Math.min(100, state.especias.length / 5 * 100);
    var totalPct = _bbGetTotal() || 100;
    var filledHeight = BODY_HEIGHT * (fillLevel / 100);
    var currentY = BODY_BOTTOM;
    for (var i = 0; i < state.especias.length; i++) {
      var sp = state.especias[i];
      var color = _alqGetSpiceColor(sp.nombre);
      /* La altura de la capa es proporcional a su % del blend, dentro del fillLevel */
      var layerHeight = (sp.porcentaje / totalPct) * filledHeight;
      var layerY = currentY - layerHeight;
      /* Rectángulo de la capa */
      svgContent += '<rect x="' + BODY_LEFT + '" y="' + layerY.toFixed(2) + '" width="' + (BODY_RIGHT - BODY_LEFT) + '" height="' + layerHeight.toFixed(2) + '" fill="' + color + '"/>';
      /* Línea superior sutil para separar capas */
      svgContent += '<line x1="' + BODY_LEFT + '" y1="' + layerY.toFixed(2) + '" x2="' + BODY_RIGHT + '" y2="' + layerY.toFixed(2) + '" stroke="rgba(255,255,255,0.25)" stroke-width="0.5"/>';
      currentY = layerY;
    }
  }
  layersEl.innerHTML = svgContent;
}

/* === Actualizar la barra de proporciones === */
function _alqUpdateMixBar() {
  var bar = document.getElementById('alq-mix-bar');
  var legend = document.getElementById('alq-legend');
  if (!bar || !legend) return;
  var state = _blendBuilderState;
  var h = '', lh = '';
  for (var i = 0; i < state.especias.length; i++) {
    var sp = state.especias[i];
    var color = _alqGetSpiceColor(sp.nombre);
    var pct = sp.porcentaje;
    h += '<div class="alq-mix-segment" style="width:' + pct + '%;--seg-color:' + color + '">';
    if (pct >= 12) {
      h += '<div class="alq-mix-segment-label">' + esc(sp.nombre) + ' ' + pct + '%</div>';
    } else if (pct >= 6) {
      h += '<div class="alq-mix-segment-label">' + pct + '%</div>';
    }
    h += '</div>';
    if (i < state.especias.length - 1) {
      var leftPct = 0;
      for (var j = 0; j <= i; j++) leftPct += state.especias[j].porcentaje;
      h += '<div class="alq-mix-divider" data-idx="' + i + '" style="left:' + leftPct + '%" onmousedown="_alqDragStart(event,' + i + ')" ontouchstart="_alqDragStart(event,' + i + ')"></div>';
    }
    lh += '<div class="alq-legend-row" style="--legend-color:' + color + '">';
    lh += '  <div class="alq-legend-dot"></div>';
    lh += '  <div class="alq-legend-name">' + esc(sp.nombre) + '</div>';
    lh += '  <div class="alq-legend-pct">' + pct + '%</div>';
    lh += '</div>';
  }
  bar.innerHTML = h;
  legend.innerHTML = lh;
}

/* === Drag para ajustar proporciones === */
var _alqDragState = null;
function _alqDragStart(e, dividerIdx) {
  e.preventDefault();
  var bar = document.getElementById('alq-mix-bar');
  if (!bar) return;
  _alqDragState = {
    dividerIdx: dividerIdx,
    barRect: bar.getBoundingClientRect(),
    moved: false
  };
  var dividers = bar.querySelectorAll('.alq-mix-divider');
  if (dividers[dividerIdx]) dividers[dividerIdx].classList.add('dragging');
  document.addEventListener('mousemove', _alqDragMove);
  document.addEventListener('mouseup', _alqDragEnd);
  document.addEventListener('touchmove', _alqDragMove, { passive: false });
  document.addEventListener('touchend', _alqDragEnd);
}
function _alqDragMove(e) {
  if (!_alqDragState) return;
  e.preventDefault();
  var clientX;
  if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
  else if (e.changedTouches && e.changedTouches.length > 0) clientX = e.changedTouches[0].clientX;
  else clientX = e.clientX;
  if (clientX == null) return;

  var rect = _alqDragState.barRect;
  var x = clientX - rect.left;
  var pct = Math.max(0, Math.min(100, (x / rect.width) * 100));

  var idx = _alqDragState.dividerIdx;
  var s = _blendBuilderState;
  var leftSum = 0;
  for (var j = 0; j < idx; j++) leftSum += s.especias[j].porcentaje;
  var combined = s.especias[idx].porcentaje + s.especias[idx + 1].porcentaje;
  var newLeft = Math.max(5, Math.min(combined - 5, pct - leftSum));
  s.especias[idx].porcentaje = Math.round(newLeft);
  s.especias[idx + 1].porcentaje = Math.round(combined - newLeft);
  _alqDragState.moved = true;
  _alqUpdateMixBar();
  _alqUpdateJar();
  var pill = document.querySelector('.alq-total-pill');
  if (pill) {
    var total = _bbGetTotal();
    pill.textContent = 'Total: ' + total + '%';
    pill.classList.remove('warning', 'danger');
    if (total !== 100) pill.classList.add(total > 100 ? 'danger' : 'warning');
  }
  _alqRefreshCTA();
}
function _alqDragEnd(e) {
  if (!_alqDragState) return;
  var bar = document.getElementById('alq-mix-bar');
  if (bar) {
    var divs = bar.querySelectorAll('.alq-mix-divider.dragging');
    for (var i = 0; i < divs.length; i++) divs[i].classList.remove('dragging');
  }
  _alqDragState = null;
  document.removeEventListener('mousemove', _alqDragMove);
  document.removeEventListener('mouseup', _alqDragEnd);
  document.removeEventListener('touchmove', _alqDragMove);
  document.removeEventListener('touchend', _alqDragEnd);
}

/* === Helpers de estado === */
function _alqRefreshCTA() {
  var state = _blendBuilderState;
  var total = _bbGetTotal();
  var canAddToCart = state.nombre.trim().length > 0 &&
                     (state.talla === 'chico' || state.talla === 'grande') &&
                     state.especias.length >= 2 &&
                     total === 100;
  var cta = document.querySelector('.alq-cta');
  if (cta) {
    if (canAddToCart) cta.removeAttribute('disabled');
    else cta.setAttribute('disabled', '');
  }
}
function _alqOnNameInput(el) {
  _blendBuilderState.nombre = el.value;
  var jarName = document.getElementById('alq-jar-name');
  if (jarName) jarName.textContent = el.value;
  _alqRefreshCTA();
}
function _alqSetTalla(t) {
  _blendBuilderState.talla = t;
  renderBlendBuilder();
}
function _alqToggleSpice(nombre) {
  var state = _blendBuilderState;
  for (var i = 0; i < state.especias.length; i++) {
    if (state.especias[i].nombre === nombre) {
      state.especias.splice(i, 1);
      _alqRedistribute();
      renderBlendBuilder();
      return;
    }
  }
  if (state.especias.length >= 5) return;
  state.especias.push({ nombre: nombre, porcentaje: 0 });
  _alqRedistribute();
  renderBlendBuilder();
}

/* === Vista de éxito === */
function _alqRenderSuccess() {
  var h = '';
  h += '<div class="alq-success">';
  h += '  <img src="icons/blend-success.png" alt="Blend creado" class="alq-success-img" onerror="this.style.display=\'none\'">';
  h += '  <h3 class="alq-success-title">\u00A1Tu Blend ha quedado fant\u00E1stico!</h3>';
  h += '  <p class="alq-success-desc">Tiene mucho car\u00E1cter y estilo. Lo agregamos a tu pedido.</p>';
  h += '  <div class="alq-success-btns">';
  h += '    <button class="alq-success-btn primary" onclick="toggleCartDrawer()">Ver carrito</button>';
  h += '    <button class="alq-success-btn secondary" onclick="_alqCreateAnother()">Crear otro blend</button>';
  h += '    <button class="alq-success-btn tertiary" onclick="goTo(\'tienda\')">Volver a la tienda</button>';
  h += '  </div>';
  h += '</div>';
  return h;
}
function _alqCreateAnother() {
  _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 };
  renderBlendBuilder();
}

/* === Mantener compat con llamadas antiguas === */
function _bbCanNext(step) {
  var s = _blendBuilderState;
  if (step === 1) return s.nombre.trim().length > 0;
  if (step === 2) return s.talla === 'chico' || s.talla === 'grande';
  if (step === 3) return s.especias.length >= 2;
  if (step === 4) return _bbGetTotal() === 100;
  return false;
}
function _bbOnNameInput(el) { _alqOnNameInput(el); }
function _bbGoStep(n) { _blendBuilderState.step = n; renderBlendBuilder(); }
function _bbCreateAnother() { _alqCreateAnother(); }
function _bbSetTalla(t) { _alqSetTalla(t); }
function _bbAddSpice(nombre) { _alqToggleSpice(nombre); }
function _bbRemoveSpice(idx) {
  _blendBuilderState.especias.splice(idx, 1);
  _alqRedistribute();
  renderBlendBuilder();
}
function _bbRemoveSpiceByName(nombre) {
  _alqToggleSpice(nombre);
}
function _bbChangePct(idx, delta) {
  var s = _blendBuilderState;
  var c = s.especias[idx].porcentaje;
  var o = _bbGetTotal() - c;
  var n = c + delta;
  if (n < 1) n = 1;
  if (o + n > 100) n = 100 - o;
  if (n < 1) n = 1;
  s.especias[idx].porcentaje = n;
  renderBlendBuilder();
}
function _bbSetPctDirect(idx, val) {
  var num = parseInt(val, 10);
  if (isNaN(num) || num < 1) num = 1;
  var o = _bbGetTotal() - _blendBuilderState.especias[idx].porcentaje;
  if (o + num > 100) num = 100 - o;
  if (num < 1) num = 1;
  _blendBuilderState.especias[idx].porcentaje = num;
  renderBlendBuilder();
}

function addCustomBlendToCart() {
  var nombreInput = document.getElementById('bb-name');
  var nombre = nombreInput ? nombreInput.value.trim() : _blendBuilderState.nombre.trim();
  if (!nombre) { alert('Dale un nombre a tu blend'); return; }
  var total = _bbGetTotal();
  if (total !== 100) { alert('Las proporciones deben sumar 100%'); return; }
  if (_blendBuilderState.especias.length < 2) { alert('Selecciona al menos 2 especias'); return; }
  if (_blendBuilderState.talla !== 'chico' && _blendBuilderState.talla !== 'grande') {
    alert('Elige el tama\u00F1o del frasco'); return;
  }
  var precio = _getCustomBlendPrice(_blendBuilderState.talla);
  var tallaLabel = _blendBuilderState.talla === 'grande' ? 'Grande' : 'Peque\u00F1o';
  var cartNombre = 'Blend: ' + nombre + ' (' + tallaLabel + ')';
  var customBlend = { nombre: nombre, talla: _blendBuilderState.talla, especias: [] };
  for (var i = 0; i < _blendBuilderState.especias.length; i++) {
    customBlend.especias.push({ nombre: _blendBuilderState.especias[i].nombre, porcentaje: _blendBuilderState.especias[i].porcentaje });
  }
  cart.push({ productId: 'custom-blend-' + Date.now(), nombre: cartNombre, tipo: 'custom-blend', talla: _blendBuilderState.talla, precio: precio, qty: 1, customBlend: customBlend });
  saveCart(); updateCartBadge();
  _blendBuilderState.step = 6;
  renderBlendBuilder();
}




function renderFaqPage() {
  if (typeof _faqData === 'undefined' || !_faqData.length) return;
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
  { name: 'Facebook', url: 'https://facebook.com/arcanoespecias247', svg: '<svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
  { name: 'Instagram', url: 'https://instagram.com/arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.354 2.618 6.782 6.98 6.979C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.668-.072-4.948-.2-4.354-2.618-6.782-6.98-6.979C15.667.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' },
  { name: 'TikTok', url: 'https://tiktok.com/@arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.09-.22-2.98.32-.89.54-1.48 1.5-1.56 2.54-.1 1.26.42 2.55 1.46 3.28 1.04.73 2.5.88 3.68.35 1.18-.53 2.02-1.74 2.08-3.04.04-.96.02-1.92.02-2.88V2.04h1.01z"/></svg>' },
  { name: 'YouTube', url: 'https://youtube.com/@arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  { name: 'WhatsApp', url: 'https://wa.me/+573178003374', svg: '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.613z"/></svg>' }
];
/* === BLOG === */
var _blogCurrentCat = 'Todos';
function selectBlogCat(cat) {
  _blogCurrentCat = cat;
  _blogCatFilter = cat;
  var tabs = document.querySelectorAll('.blog-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.cat === cat);
  var sbItems = document.querySelectorAll('#sidebar-blog-cats li');
  for (var i = 0; i < sbItems.length; i++) sbItems[i].classList.toggle('active', sbItems[i].textContent.trim() === cat);
  renderBlogList();
}
function renderBlogList() {
  var grid = document.getElementById('blog-grid');
  var detail = document.getElementById('blog-detail');
  if (!grid) return;
  if (detail) detail.innerHTML = '';
  grid.style.display = '';
  onBlogReady(function(posts) {
    var filtered = getBlogPosts();
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>Aún no hay artículos en esta categoria.</p></div>';
      return;
    }
    var h = '';
    for (var i = 0; i < filtered.length; i++) {
      var p = filtered[i];
      var fechaStr = '';
      if (p.fecha) {
        var parts = p.fecha.split('T')[0].split('-');
        var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        fechaStr = parseInt(parts[2]) + ' ' + meses[parseInt(parts[1]) - 1] + ' ' + parts[0];
      }
      var imgSrc = _fixImageUrl(p.imagen_url || '');
      h += '<div class="blog-card" onclick="openBlogPost(\'' + p._key + '\')">';
      if (imgSrc) h += '<div class="blog-card-img"><img src="' + imgSrc + '" alt="' + (p.titulo || '').replace(/"/g, '&quot;') + '" loading="lazy"></div>';
      h += '<div class="blog-card-body">';
      if (p.categoria) h += '<span class="blog-card-cat">' + p.categoria + '</span>';
      h += '<h3 class="blog-card-title">' + (p.titulo || 'Sin título') + '</h3>';
      if (p.subtitulo) h += '<p class="blog-card-sub">' + p.subtitulo + '</p>';
      if (fechaStr) h += '<span class="blog-card-date">' + fechaStr + '</span>';
      h += '</div></div>';
    }
    grid.innerHTML = h;
  });
}
function openBlogPost(key) {
  onBlogReady(function(posts) {
    var post = null;
    for (var i = 0; i < posts.length; i++) {
      if (posts[i]._key === key) { post = posts[i]; break; }
    }
    if (!post) return;
    var grid = document.getElementById('blog-grid');
    var detail = document.getElementById('blog-detail');
    if (grid) grid.style.display = 'none';
    if (!detail) return;
    var fechaStr = '';
    if (post.fecha) {
      var parts = post.fecha.split('T')[0].split('-');
      var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      fechaStr = parseInt(parts[2]) + ' ' + meses[parseInt(parts[1]) - 1] + ' ' + parts[0];
    }
    var h = '<div class="blog-detail">';
    h += '<button class="blog-back-btn" onclick="renderBlogList()">&larr; Volver al Blog</button>';
    h += '<div class="blog-detail-meta">';
    if (post.categoria) h += '<span class="blog-card-cat">' + post.categoria + '</span>';
    if (fechaStr) h += '<span class="blog-detail-date">' + fechaStr + '</span>';
    h += '</div>';
    h += '<h1 class="blog-detail-title">' + (post.titulo || '') + '</h1>';
    if (post.subtitulo) h += '<p class="blog-detail-sub">' + post.subtitulo + '</p>';
    if (post.imagen_url) h += '<img class="blog-detail-img" src="' + _fixImageUrl(post.imagen_url) + '" alt="' + (post.titulo || '').replace(/"/g, '&quot;') + '">';
    if (post.contenido) h += '<div class="blog-detail-content">' + post.contenido + '</div>';
    h += '<button class="blog-back-btn" style="margin-top:32px" onclick="renderBlogList()">&larr; Volver al Blog</button>';
    h += '</div>';
    detail.innerHTML = h;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
function compartirBlog(key) {
  onBlogReady(function(posts) {
    var post = null;
    for (var i = 0; i < posts.length; i++) { if (posts[i]._key === key) { post = posts[i]; break; } }
    if (!post) return;
    var text = post.titulo + ' - Arcano Especias';
    if (navigator.share) { navigator.share({ title: post.titulo, text: text }).catch(function() {}); }
    else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      _showToast('Enlace copiado');
    }
  });
}
function renderSocialLinks() {
  var h = '';
  for (var i = 0; i < _SOCIAL_LINKS.length; i++) {
    h += '<a href="' + _SOCIAL_LINKS[i].url + '" target="_blank" title="' + _SOCIAL_LINKS[i].name + '">' + _SOCIAL_LINKS[i].svg + '</a>';
  }
  var footer = document.getElementById('footer-social');
  if (footer) footer.innerHTML = h;
  var sidebar = document.getElementById('sidebar-social');
  if (sidebar) sidebar.innerHTML = h;
  var mmFooter = document.getElementById('mm-footer');
  if (mmFooter) {
    mmFooter.innerHTML = '<img src="icons/arcano-logo.webp" class="mm-logo" alt="Arcano Especias"><div class="mm-social">' + h + '</div>';
  }
}

/* === INIT === */
document.addEventListener('DOMContentLoaded', function() {
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function() {});
  _initHeaderScroll();
  updateCartBadge();
  _updateCuentaBadge();
  _updateSidebar('tienda');
  initTienda().then(function() {
    initRecetas();
    initBlog();
    renderProducts('Todos');
    renderSocialLinks();
    // Inicializar tracking de carrito (cada 60s + al salir de pagina)
    initCarritoTracking(function() { return cart; }, getClienteSession);
    // Inicializar popup lateral (configurado por admin)
    initPopupLateral();
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

window.addEventListener('popstate', function() {
  _updateTitle(_currentPage || 'tienda');
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

/* ===================== MI CUENTA (cliente) =====================
   Flujo:
   1. Cliente hace click en "Mi cuenta" del header.
   2. Si hay sesion local activa -> muestra historial directamente.
   3. Si no -> pide WhatsApp -> genera OTP -> abre wa.me con el codigo
      para que el cliente se lo auto-envie (o el admin se lo envia luego).
   4. Cliente ingresa OTP -> verifica -> sesion creada -> historial.
   5. El checkout autocompleta datos si hay sesion activa.
   ============================================================ */

function openMiCuenta() {
  var existing = document.getElementById('mc-overlay');
  if (existing) existing.remove();
  var session = getClienteSession();
  var overlay = document.createElement('div');
  overlay.id = 'mc-overlay';
  overlay.className = 'mc-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeMiCuenta(); };
  overlay.innerHTML =
    '<div class="mc-modal">' +
      '<button class="mc-close" onclick="closeMiCuenta()">&times;</button>' +
      '<div id="mc-content"><div class="loader"></div></div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  if (session) {
    _mcShowHistorial(session);
  } else {
    _mcShowLogin();
  }
}

function closeMiCuenta() {
  var ov = document.getElementById('mc-overlay');
  if (ov) { ov.remove(); document.body.style.overflow = ''; }
}

function _mcShowLogin() {
  var el = document.getElementById('mc-content');
  if (!el) return;
  el.innerHTML =
    '<div class="mc-login">' +
      '<div class="mc-login-header">' +
        '<h3>Mi Cuenta</h3>' +
        '<p class="mc-sub" id="mc-sub-label">Accede para ver tus pedidos y promociones exclusivas</p>' +
      '</div>' +
      '<div class="form-group"><label>Número de WhatsApp</label>' +
        '<input class="form-input" id="mc-tel" placeholder="3001234567" maxlength="10" inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,\'\').slice(0,10)" onblur="_mcBuscarCliente()"></div>' +
      '<div class="form-group"><label>Tu nombre</label>' +
        '<input class="form-input" id="mc-nombre" placeholder="Tu nombre" maxlength="40"></div>' +
      '<button class="btn-primary btn-block" onclick="_mcRegistrar()" id="mc-btn-registrar">' +
        '<span>Ingresar</span>' +
      '</button>' +
      '<p class="mc-hint" id="mc-hint">💡 Regístrate con tu WhatsApp y nombre. Podrás ver tus pedidos y promociones exclusivas.</p>' +
    '</div>';
}

// Busca si el WhatsApp ya existe en Firebase → autocompleta nombre y cambia UI
function _mcBuscarCliente() {
  var tel = (document.getElementById('mc-tel').value || '').trim();
  if (!tel || tel.length < 6) return; // necesita al menos 6 dígitos
  var telNorm = _normalizeWhatsapp(tel);
  if (!telNorm) return;
  try {
    if (typeof firebase === 'undefined' || !firebase.database) return;
    var ref = firebase.database().ref('arcano/db/clientes');
    ref.orderByChild('telNorm').equalTo(telNorm).limitToFirst(1).once('value', function(snap) {
      var data = snap.val();
      var subLabel = document.getElementById('mc-sub-label');
      var hint = document.getElementById('mc-hint');
      var nombreInput = document.getElementById('mc-nombre');
      var btn = document.getElementById('mc-btn-registrar');
      if (!btn) return;
      if (data) {
        // Cliente existente: autocompletar nombre
        var key = Object.keys(data)[0];
        var cliente = data[key];
        if (nombreInput && cliente.nombre) {
          nombreInput.value = cliente.nombre;
          nombreInput.style.color = 'var(--gold)';
          nombreInput.style.fontWeight = '600';
        }
        if (subLabel) subLabel.textContent = '¡Bienvenido de nuevo, ' + (cliente.nombre || '').split(' ')[0] + '!';
        if (btn) btn.innerHTML = '<span>Ingresar</span>';
        if (hint) hint.innerHTML = '💡 Ya estás registrado. Solo presiona <b>Ingresar</b>.';
      } else {
        // Cliente nuevo: limpiar y mostrar registro
        if (nombreInput) {
          nombreInput.style.color = '';
          nombreInput.style.fontWeight = '';
        }
        if (subLabel) subLabel.textContent = 'Regístrate para ver tus pedidos y promociones exclusivas';
        if (btn) btn.innerHTML = '<span>Registrarme</span>';
        if (hint) hint.innerHTML = '💡 Regístrate con tu WhatsApp y nombre.';
      }
    });
  } catch (e) {
    console.warn('[Mi Cuenta] No se pudo buscar cliente:', e);
  }
}

// Registro directo: cliente solo deja WhatsApp + nombre, queda logueado
function _mcRegistrar() {
  var tel = (document.getElementById('mc-tel').value || '').trim();
  var nombre = (document.getElementById('mc-nombre').value || '').trim();
  if (!tel) { alert('Ingresa tu número de WhatsApp'); return; }
  if (!nombre) { alert('Ingresa tu nombre'); return; }

  var btn = document.getElementById('mc-btn-registrar');
  var original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Ingresando...</span>';

  registrarCliente(tel, nombre).then(function(cliente) {
    saveClienteSession(cliente);
    _showToast('¡Bienvenido ' + (cliente.nombre || '').split(' ')[0] + '!');
    _updateCuentaBadge();
    _mcShowExito(cliente);
  }).catch(function(err) {
    alert(err.message || err);
    btn.disabled = false;
    btn.innerHTML = original;
  });
}

// Pantalla de éxito: registro confirmado
function _mcShowExito(cliente) {
  var el = document.getElementById('mc-content');
  if (!el) return;
  el.innerHTML =
    '<div class="mc-login">' +
      '<div class="mc-exito-icon">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>' +
      '<h3 style="text-align:center;color:var(--gold);margin-bottom:8px">¡Bienvenido, ' + esc(cliente.nombre || '').split(' ')[0] + '!</h3>' +
      '<p class="mc-sub" style="text-align:center;margin-bottom:20px">' +
        'Ya eres parte de Arcano!' +
      '</p>' +
      '<button class="btn-primary btn-block" onclick="closeMiCuenta()">Ir a la tienda</button>' +
    '</div>';
}

function _mcVerifyOTP() {
  var tel = (document.querySelector('#mc-content [data-tel]') || {}).dataset ? document.querySelector('#mc-content [data-tel]').dataset.tel : '';
  if (!tel) tel = (document.getElementById('mc-tel').value || '').trim();
  var codigo = (document.getElementById('mc-otp').value || '').trim();
  if (!codigo) { alert('Ingresa el código de 6 dígitos'); return; }
  var btn = event.target;
  btn.disabled = true; btn.textContent = 'Verificando...';
  verifyClienteOTP(tel, codigo).then(function(cliente) {
    saveClienteSession(cliente);
    _showToast('Bienvenido ' + (cliente.nombre || 'de nuevo'));
    _mcShowHistorial(cliente);
    // Actualizar header si hay badge de cuenta
    _updateCuentaBadge();
  }).catch(function(err) {
    alert(err.message || err);
    btn.disabled = false; btn.textContent = 'Verificar';
  });
}

function _mcShowHistorial(cliente) {
  var el = document.getElementById('mc-content');
  if (!el) return;
  // Calcular stats resumen
  var totalPedidos = cliente.totalPedidos || 0;
  // Layout con header de cliente, promos y tabs de pedidos
  el.innerHTML =
    '<div class="mc-historial">' +
      '<div class="mc-user-info">' +
        '<div class="mc-user-name">' + (cliente.nombre || 'Cliente') + '</div>' +
        '<div class="mc-user-meta">' + (cliente.telefono || '') + '</div>' +
        '<div class="mc-user-stats">' +
          '<span><b>' + totalPedidos + '</b> pedidos</span>' +
        '</div>' +
      '</div>' +
      // Seccion promos exclusivas
      '<div id="mc-promos-section"></div>' +
      // Tabs de pedidos
      '<div class="mc-tabs">' +
        '<button class="mc-tab active" data-tab="entregados" onclick="_mcSwitchTab(\'entregados\')">Entregados <span class="mc-tab-count" id="mc-c-entregados">0</span></button>' +
        '<button class="mc-tab" data-tab="proceso" onclick="_mcSwitchTab(\'proceso\')">En proceso <span class="mc-tab-count" id="mc-c-proceso">0</span></button>' +
        '<button class="mc-tab" data-tab="anulados" onclick="_mcSwitchTab(\'anulados\')">Anulados <span class="mc-tab-count" id="mc-c-anulados">0</span></button>' +
      '</div>' +
      '<div id="mc-pedidos-list"><div class="loader"></div></div>' +
      '<button class="btn-secondary btn-block" style="margin-top:18px" onclick="_mcLogout()">Cerrar sesión</button>' +
    '</div>';
  // Cargar promos
  _mcLoadPromos();
  // Cargar pedidos
  if (!cliente.id) {
    var list = document.getElementById('mc-pedidos-list');
    if (list) list.innerHTML = '<p class="mc-empty">No se pudo cargar el historial.</p>';
    return;
  }
  // Guardar cliente.id para que _mcSwitchTab pueda acceder
  el.dataset.clienteId = cliente.id;
  getClientePedidos(cliente.id).then(function(pedidos) {
    // Guardar en cache del modulo
    _mcPedidosCache = pedidos;
    // Contar por categoria
    var entregados = pedidos.filter(function(p) { return p.estado === 'entregado'; });
    var anulados = pedidos.filter(function(p) { return p.estado === 'cancelado'; });
    var enProceso = pedidos.filter(function(p) { return ['nuevo','confirmado','enviado'].indexOf(p.estado || 'nuevo') !== -1; });
    document.getElementById('mc-c-entregados').textContent = entregados.length;
    document.getElementById('mc-c-proceso').textContent = enProceso.length;
    document.getElementById('mc-c-anulados').textContent = anulados.length;
    _mcRenderPedidosTab('entregados');
  }).catch(function(err) {
    var list = document.getElementById('mc-pedidos-list');
    if (list) list.innerHTML = '<p class="mc-empty">Error al cargar: ' + (err.message || err) + '</p>';
  });
}

var _mcCurrentTab = 'entregados';
var _mcPedidosCache = [];

function _mcSwitchTab(tab) {
  _mcCurrentTab = tab;
  // Actualizar tabs activos
  var tabs = document.querySelectorAll('.mc-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.tab === tab);
  }
  _mcRenderPedidosTab(tab);
}

function _mcRenderPedidosTab(tab) {
  var list = document.getElementById('mc-pedidos-list');
  if (!list) return;
  var pedidos = _mcPedidosCache || [];
  var filtrados;
  if (tab === 'entregados') {
    filtrados = pedidos.filter(function(p) { return p.estado === 'entregado'; });
  } else if (tab === 'anulados') {
    filtrados = pedidos.filter(function(p) { return p.estado === 'cancelado'; });
  } else {
    filtrados = pedidos.filter(function(p) { return ['nuevo','confirmado','enviado'].indexOf(p.estado || 'nuevo') !== -1; });
  }
  if (filtrados.length === 0) {
    list.innerHTML = '<p class="mc-empty">No tienes pedidos ' + (tab === 'entregados' ? 'entregados aún.' : tab === 'anulados' ? 'anulados.' : 'en proceso.') + '</p>';
    return;
  }
  var h = '';
  for (var i = 0; i < filtrados.length; i++) {
    var p = filtrados[i];
    var fecha = (p.creado || '').slice(0, 16).replace('T', ' ');
    var estado = p.estado || 'nuevo';
    var estadoCls = 'mc-estado-' + (estado === 'nuevo' ? 'nuevo' : estado === 'confirmado' || estado === 'enviado' ? 'ok' : estado === 'entregado' ? 'ok' : estado === 'cancelado' ? 'cancelado' : 'pend');
    var estadoLabel = {
      nuevo: 'Nuevo', confirmado: 'Confirmado', enviado: 'Enviado',
      entregado: 'Entregado', cancelado: 'Anulado'
    }[estado] || estado;
    var items = '';
    if (p.items) {
      for (var j = 0; j < p.items.length; j++) {
        items += '<div class="mc-pedido-item">' + (p.items[j].nombre || '?') + ' x' + p.items[j].qty + '</div>';
      }
    }
    h += '<div class="mc-pedido-card">' +
      '<div class="mc-pedido-top">' +
        '<span class="mc-pedido-fecha">' + fecha + '</span>' +
        '<span class="mc-pedido-estado ' + estadoCls + '">' + estadoLabel + '</span>' +
      '</div>' +
      '<div class="mc-pedido-items">' + items + '</div>' +
      '<div class="mc-pedido-total">Total: $' + (p.total || 0).toLocaleString() + '</div>' +
    '</div>';
  }
  list.innerHTML = h;
}

function _mcLoadPromos() {
  var container = document.getElementById('mc-promos-section');
  if (!container) return;
  container.innerHTML = '<h4 class="mc-promos-title">🎁 Promociones exclusivas para ti</h4><div id="mc-promos-list" class="mc-promos-list"><div class="loader"></div></div>';
  getPromocionesActivas().then(function(promos) {
    var list = document.getElementById('mc-promos-list');
    if (!list) return;
    if (promos.length === 0) {
      list.innerHTML = '<p class="mc-empty">Sin promociones activas por ahora. ¡Vuelve pronto!</p>';
      return;
    }
    var h = '';
    for (var i = 0; i < promos.length; i++) {
      var pr = promos[i];
      var vigencia = '';
      if (pr.fechaFin) {
        var f = new Date(pr.fechaFin);
        vigencia = '<div class="mc-promo-vigencia">Vence: ' + f.toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) + '</div>';
      } else if (pr.fechaInicio) {
        var fi = new Date(pr.fechaInicio);
        vigencia = '<div class="mc-promo-vigencia">Desde: ' + fi.toLocaleDateString('es-CO', {day:'2-digit',month:'short'}) + '</div>';
      }
      var codigo = pr.codigo ? '<div class="mc-promo-codigo" onclick="_mcCopiarCodigo(\'' + pr.codigo + '\')"><span>Código:</span><b>' + pr.codigo + '</b><span class="mc-copy-hint">📋 copiar</span></div>' : '';
      var descuento = '';
      if (pr.tipo === 'porcentaje') descuento = pr.valor + '% OFF';
      else if (pr.tipo === 'monto') descuento = '$' + (pr.valor || 0).toLocaleString() + ' Off';
      else if (pr.tipo === 'envio') descuento = 'Envío gratis';
      else if (pr.tipo === 'producto') descuento = 'Producto gratis';
      else descuento = pr.titulo || 'Promo';
      h += '<div class="mc-promo-card' + (pr.destacada ? ' mc-promo-destacada' : '') + '">' +
        '<div class="mc-promo-badge">' + descuento + '</div>' +
        '<div class="mc-promo-nombre">' + (pr.titulo || 'Promoción') + '</div>' +
        (pr.descripcion ? '<div class="mc-promo-desc">' + pr.descripcion + '</div>' : '') +
        codigo + vigencia +
      '</div>';
    }
    list.innerHTML = h;
  }).catch(function(err) {
    var list = document.getElementById('mc-promos-list');
    if (list) list.innerHTML = '<p class="mc-empty">No se pudieron cargar promociones.</p>';
  });
}

function _mcCopiarCodigo(codigo) {
  try {
    navigator.clipboard.writeText(codigo).then(function() {
      _showToast('Código copiado: ' + codigo);
    }).catch(function() {
      // Fallback para navegadores sin clipboard API
      var tmp = document.createElement('input');
      tmp.value = codigo;
      document.body.appendChild(tmp);
      tmp.select();
      try { document.execCommand('copy'); _showToast('Código copiado: ' + codigo); } catch(e) {}
      document.body.removeChild(tmp);
    });
  } catch(e) {
    _showToast('Código: ' + codigo);
  }
}

function _mcLogout() {
  clearClienteSession();
  closeMiCuenta();
  _updateCuentaBadge();
  _showToast('Sesión cerrada');
}

function _updateCuentaBadge() {
  var session = getClienteSession();
  var btn = document.querySelector('.mc-btn');
  var initialsEl = document.querySelector('.mc-btn-initials');
  var svgEl = btn ? btn.querySelector('svg') : null;
  if (!btn) return;
  if (session && session.nombre) {
    // Mostrar primer nombre (no inicial) en el botón
    var primerNombre = session.nombre.trim().split(/\s+/)[0] || '';
    if (initialsEl) {
      initialsEl.textContent = primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1).toLowerCase();
      initialsEl.style.display = 'inline';
    }
    if (svgEl) svgEl.style.display = 'none';
    btn.classList.add('mc-btn-active');
    btn.setAttribute('title', 'Mi cuenta: ' + session.nombre + ' (click para ver pedidos y promos)');
    btn.setAttribute('aria-label', 'Mi cuenta: ' + session.nombre);
  } else {
    // No hay sesión: mostrar icono default
    if (initialsEl) {
      initialsEl.textContent = '';
      initialsEl.style.display = '';
    }
    if (svgEl) svgEl.style.display = '';
    btn.classList.remove('mc-btn-active');
    btn.setAttribute('title', 'Mi cuenta');
    btn.setAttribute('aria-label', 'Mi cuenta');
  }
}

/**
 * Autocompleta el formulario de checkout si hay sesion de cliente activa.
 * Llamado al mostrar showOrderForm().
 */
function _autocompletarCheckoutSiSesion() {
  var s = getClienteSession();
  if (!s) return;
  var setVal = function(id, val) { var el = document.getElementById(id); if (el && val && !el.value) el.value = val; };
  setVal('o-nombre', s.nombre);
  setVal('o-tel', s.telefono);
  setVal('o-email', s.email);
  setVal('o-ciudad', s.ciudad);
  setVal('o-dir', s.direccion);
}

/* ===================== POPUP LATERAL =====================
   Pestaña que asoma desde la derecha a los X segundos
   configurados por el admin. Muestra mensaje + imagen.
   ================================================================== */
var _popupLateralTimer = null;
var _popupLateralShown = false;

function initPopupLateral() {
  if (_popupLateralShown) return;
  var config = getTiendaConfig();
  var popup = config.popupTienda;
  if (!popup || !popup.activo) return;
  if (!popup.mensaje && !popup.imagen) return;

  var segundos = parseInt(popup.segundos, 10) || 15;
  if (segundos < 3) segundos = 3;

  _popupLateralTimer = setTimeout(function() {
    _showPopupLateral(popup);
  }, segundos * 1000);
}

function _showPopupLateral(popup) {
  if (_popupLateralShown) return;
  _popupLateralShown = true;

  var existing = document.getElementById('popup-lateral');
  if (existing) existing.remove();

  var el = document.createElement('div');
  el.className = 'popup-lateral';
  el.id = 'popup-lateral';

  // Colores configurables (defaults a dorado/oscuro)
  var bgColor = popup.colorFondo || '#1A130D';
  var textColor = popup.colorTexto || '#F5E6D0';
  var accentColor = popup.colorAcento || '#E8B84B';
  var btnBg = popup.colorBoton || '#E8B84B';
  var btnText = popup.colorBotonTexto || '#0E0A07';

  el.style.setProperty('--pp-bg', bgColor);
  el.style.setProperty('--pp-text', textColor);
  el.style.setProperty('--pp-accent', accentColor);
  el.style.setProperty('--pp-btn-bg', btnBg);
  el.style.setProperty('--pp-btn-text', btnText);
  // Tipografía configurable
  el.style.setProperty('--pp-title-size', popup.tamanoTitulo || '1.25rem');
  el.style.setProperty('--pp-text-size', popup.tamanoTexto || '0.9rem');
  // Estilos (negrita, subrayada, cursiva, combinaciones)
  var titleWeight = '800';
  var titleItalic = 'normal';
  var titleUnderline = 'none';
  var estiloT = popup.estiloTitulo || 'negrita';
  if (estiloT === 'negrita') { titleWeight = '800'; }
  else if (estiloT === 'subrayada') { titleWeight = '600'; titleUnderline = 'underline'; }
  else if (estiloT === 'cursiva') { titleWeight = '600'; titleItalic = 'italic'; }
  else if (estiloT === 'negrita-subrayada') { titleWeight = '800'; titleUnderline = 'underline'; }
  else if (estiloT === 'negrita-cursiva') { titleWeight = '800'; titleItalic = 'italic'; }
  el.style.setProperty('--pp-title-weight', titleWeight);
  el.style.setProperty('--pp-title-italic', titleItalic);
  el.style.setProperty('--pp-title-deco', titleUnderline);

  var textWeight = '400';
  var textItalic = 'normal';
  var textUnderline = 'none';
  var estiloTx = popup.estiloTexto || 'normal';
  if (estiloTx === 'negrita') { textWeight = '700'; }
  else if (estiloTx === 'cursiva') { textItalic = 'italic'; }
  else if (estiloTx === 'subrayada') { textUnderline = 'underline'; }
  el.style.setProperty('--pp-text-weight', textWeight);
  el.style.setProperty('--pp-text-italic', textItalic);
  el.style.setProperty('--pp-text-deco', textUnderline);

  var html = '';
  if (popup.imagen) {
    html += '<div class="popup-lateral-header">';
    html += '<img class="popup-lateral-img" src="' + _fixImageUrl(popup.imagen) + '" alt="Promo">';
    html += '<button class="popup-lateral-close" onclick="_closePopupLateral()">&times;</button>';
    html += '</div>';
  } else {
    html += '<button class="popup-lateral-close" onclick="_closePopupLateral()" style="top:12px;right:12px">&times;</button>';
  }
  html += '<div class="popup-lateral-body">';
  if (popup.titulo) {
    html += '<div class="popup-lateral-title">' + esc(popup.titulo) + '</div>';
  }
  if (popup.mensaje) {
    html += '<div class="popup-lateral-text">' + esc(popup.mensaje) + '</div>';
  }
  if (popup.botonTexto && popup.botonLink) {
    html += '<a href="' + esc(popup.botonLink) + '" target="_blank" class="popup-lateral-btn">' + esc(popup.botonTexto) + '</a>';
  }
  html += '</div>';
  el.innerHTML = html;
  document.body.appendChild(el);

  // Animación de entrada: doble rAF para asegurar que el browser pinte el estado inicial
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      el.classList.add('show');
    });
  });

  // Auto-cerrar después de la duración configurada
  var duracion = parseInt(popup.duracion, 10) || 8;
  if (duracion < 3) duracion = 3;
  setTimeout(function() {
    _closePopupLateral();
  }, duracion * 1000);

  // No volver a mostrar en esta sesión
  try {
    sessionStorage.setItem('arcano_popup_shown', '1');
  } catch(e) {}
}

function _closePopupLateral() {
  var el = document.getElementById('popup-lateral');
  if (el) {
    el.classList.remove('show');
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 700);
  }
}

/* === Helper: generar HTML de modos de uso === */
function _usosHtml(p) {
  if (!p.uso) return '';
  var usos = p.uso.split(',').map(function(s){return s.trim();}).filter(function(s){return s;});
  if (!usos.length) return '';
  var iconos = {
    'Carnes': '🥩', 'Pollo': '🍗', 'Pescados y Mariscos': '🐟', 'Cerdo': '🐖',
    'Arroces': '🍚', 'Pastas': '🍝', 'Sopas y Cremas': '🍲', 'Ensaladas': '🥗',
    'Guisos y Estofados': '🍲', 'Salsas': '🥫', 'Marinadas y Adobos': '🌿',
    'Panaderia': '🍞', 'Postres': '🍰', 'Bebidas': '🥤', 'Vegetales': '🥕',
    'Ceviches': '🐠', 'Currys': '🍛', 'Tacos y Burritos': '🌮',
    'Hamburguesas': '🍔', 'Pizzas': '🍕'
  };
  var html = '<div class="detail-usos"><div class="detail-usos-label">✨ Ideal para</div><div class="detail-usos-list">';
  for (var i = 0; i < usos.length; i++) {
    var icon = iconos[usos[i]] || '▪';
    html += '<span class="detail-uso-chip">' + icon + ' ' + usos[i] + '</span>';
  }
  html += '</div></div>';
  return html;
}

/* === Hero Landing: partículas + fade on scroll === */
(function() {
  // Crear partículas de especias flotando
  var particlesContainer = document.getElementById('hero-particles');
  if (!particlesContainer) return;

  var colors = ['#c7553f', '#E8B84B', '#8a5a2c', '#6b8e4e', '#2a1a0a', '#d4a574', '#a0522d', '#f0e6d3'];
  var particleCount = 25;

  for (var i = 0; i < particleCount; i++) {
    var p = document.createElement('div');
    p.className = 'hero-particle';
    var size = 3 + Math.random() * 6;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.setProperty('--drift', (Math.random() * 80 - 40) + 'px');
    particlesContainer.appendChild(p);
  }

  // Sin fade on scroll — el texto se queda fijo
})();
