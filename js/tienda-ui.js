/* ===================== ARCANO TIENDA \u2014 UI REDESIGN ===================== */
var cart = JSON.parse(localStorage.getItem('arcano_cart') || '[]');
var _currentPage = 'tienda';
var _currentRecetaCat = 'Comida';
var _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 };
/* Flag: \u00BFel usuario ya naveg\u00F3 fuera de Tienda en esta sesi\u00F3n de p\u00E1gina?
   - false \u2192 primera entrada a Tienda (mostrar cofre desde el top)
   - true  \u2192 ya naveg\u00F3 a Recetas/Blog/etc., al volver a Tienda scrollear a filtros */
var _hasNavigatedAway = false;

/* === UTIL: escapar HTML para evitar inyecci\u00F3n XSS === */
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
      tienda: 'Especias y Blends artesanales del mundo. Ingredientes seleccionados de cada rinc\u00F3n para crear sabores \u00FAnicos. Comidas, infusiones y cocteler\u00EDa. Env\u00EDos a toda Colombia.',
      recetas: 'Recetas con especias artesanales de Arcano. Insp\u00EDrate para cocinar con blends \u00FAnicos de cada rinc\u00F3n del mundo.',
      blog: 'Blog de especias, blends artesanales, curiosidades, beneficios y origenes de las especias del mundo.',
      blend: 'Crea tu blend personalizado de especias artesanales con Arcano Especias.',
      faq: 'Preguntas frecuentes sobre Arcano Especias: env\u00EDos, pagos, productos y m\u00E1s.'
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

  /* === Scroll: si volvemos a Tienda despu\u00E9s de haber navegado a otra p\u00E1gina,
        scrollear a los filtros de categor\u00EDa (saltando el hero/cofre).
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
    sb.innerHTML = '<p>En ARCANO seleccionamos especias, hierbas y bot\u00E1nicos para crear blends artesanales inspirados en los sabores de diferentes regiones del mundo. Condimentos para carnes, pescados, pollo, arroces, sopas y vegetales; mezclas para preparar infusiones y opciones especiales para cocteler\u00EDa.</p>';
  } else if (page === 'recetas') {
    sb.innerHTML = '<h3>Categorias</h3><ul class="sidebar-cat-list" id="sidebar-receta-cats">' + '<li class="active" onclick="selectRecetaCat(\'Comida\')">Comida</li>' + '<li onclick="selectRecetaCat(\'Infusiones\')">Infusiones</li>' + '<li onclick="selectRecetaCat(\'Cocteleria\')">Cocteleria</li>' + '</ul>';
  } else if (page === 'blog') {
    sb.innerHTML = '<h3>Categorias</h3><ul class="sidebar-cat-list" id="sidebar-blog-cats"><li class="active" onclick="selectBlogCat(\'Todos\')">Todos</li><li onclick="selectBlogCat(\'Historias\')">Historias</li><li onclick="selectBlogCat(\'Beneficios\')">Beneficios</li><li onclick="selectBlogCat(\'Investigaciones\')">Investigaciones</li><li onclick="selectBlogCat(\'Curiosidades\')">Curiosidades</li><li onclick="selectBlogCat(\'Origenes\')">Origenes</li></ul>';
  } else if (page === 'blend') {
    sb.innerHTML = '<p>Crea tu blend personalizado. Mezcla las especias a tu gusto para dar sabor, aroma y car\u00E1cter a tus comidas, infusiones o cocteles.</p>';
  } else if (page === 'faq') {
    sb.innerHTML = '<p>Aqu\u00ED encontrar\u00E1s respuestas a las preguntas m\u00E1s frecuentes sobre nuestros productos, env\u00EDos, formas de pago y m\u00E1s. Si no encuentras lo que buscas, no dudes en contactarnos.</p>';
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
    body.innerHTML = '<div class="empty-state" style="padding:48px 0"><p>Tu pedido esta\u0301 vac\u00EDo</p></div>';
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
  // Update resumen (Subtotal + Env\u00EDo + Total) usando el m\u00F3dulo de env\u00EDo
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
      '<p style="text-align:center;margin:8px 0 0;font-size:0.8rem;color:#a08b6e;line-height:1.5">\u{1F69A} Env\u00EDo gratis en Medell\u00EDn desde \$60.000. En compras inferiores y env\u00EDos fuera de Medell\u00EDn, el env\u00EDo tiene costo adicional.</p>';
  } else {
    footer.innerHTML = '<button class="btn-primary" onclick="sendOrder()">Enviar Pedido</button>' +
      '<button class="btn-secondary" onclick="backToCart()">Volver</button>' +
      '<p style="text-align:center;margin:8px 0 0;font-size:0.8rem;color:#a08b6e;line-height:1.5">\u{1F69A} Env\u00EDo gratis en Medell\u00EDn desde \$60.000. En compras inferiores y env\u00EDos fuera de Medell\u00EDn, el env\u00EDo tiene costo adicional.</p>';
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
  h += '<div class="form-row"><div class="form-group"><label>Tel\u00E9fono</label><input class="form-input" id="o-tel" placeholder="300 123 4567"></div>';
  h += '<div class="form-group"><label>Email</label><input class="form-input" id="o-email" type="email" placeholder="tu@email.com"></div></div>';
  h += '<div class="form-row"><div class="form-group"><label>Ciudad</label><select class="form-input" id="o-ciudad" onchange="arcanoActualizarShippingInfo()"><option value="">Selecciona tu ciudad</option><option value="Medell\u00EDn">Medell\u00EDn</option><option value="Bogot\u00E1">Bogot\u00E1</option><option value="Cali">Cali</option><option value="Barranquilla">Barranquilla</option><option value="Cartagena">Cartagena</option><option value="Bucaramanga">Bucaramanga</option><option value="Pereira">Pereira</option><option value="Manizales">Manizales</option><option value="C\u00FAcuta">C\u00FAcuta</option><option value="Santa Marta">Santa Marta</option><option value="Ibagu\u00E9">Ibagu\u00E9</option><option value="Villavicencio">Villavicencio</option><option value="Armenia">Armenia</option><option value="Neiva">Neiva</option><option value="Sincelejo">Sincelejo</option><option value="Popay\u00E1n">Popay\u00E1n</option><option value="Tunja">Tunja</option><option value="Monter\u00EDa">Monter\u00EDa</option><option value="Valledupar">Valledupar</option><option value="Riohacha">Riohacha</option><option value="Pasto">Pasto</option><option value="Quibd\u00F3">Quibd\u00F3</option><option value="Florencia">Florencia</option><option value="Yopal">Yopal</option><option value="Arauca">Arauca</option><option value="Leticia">Leticia</option><option value="In\u00EDrida">In\u00EDrida</option><option value="San Jos\u00E9 del Guaviare">San Jos\u00E9 del Guaviare</option><option value="Mit\u00FA">Mit\u00FA</option><option value="Puerto Carre\u00F1o">Puerto Carre\u00F1o</option><option value="Mocoa">Mocoa</option><option value="San Andr\u00E9s">San Andr\u00E9s</option><option value="Otra">Otra ciudad</option></select></div>';
  h += '<div class="form-group"><label>Direcci\u00F3n</label><input class="form-input" id="o-dir" placeholder="Direcci\u00F3n de entrega"></div></div>';
  h += '<div class="form-group"><label>Notas</label><textarea class="form-input" id="o-notas" placeholder="Horario, instrucciones..."></textarea></div>';
  // Bloque donde se muestra el costo de env\u00EDo (lo llena arcanoActualizarShippingInfo)
  h += '<div id="shipping-info" style="display:none"></div>';
  h += '</div>';
  // QR removido del checkout \u2014 el admin coordina el pago por WhatsApp
  body.innerHTML = h;
  body.scrollTop = 0;
  _cartSetFooterStep(2);
  // Autocompletar si hay sesion de cliente
  setTimeout(_autocompletarCheckoutSiSesion, 50);
  // Llamada inicial por si la ciudad qued\u00F3 preseleccionada por autocompletar
  setTimeout(function() { if (typeof arcanoActualizarShippingInfo === 'function') arcanoActualizarShippingInfo(); }, 80);
}

function backToCart() {
  renderCartDrawer();
}

// Mantenemos la funci\u00F3n vieja como alias para no romper otros lugares que la llamen
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
  if (!nombre || !tel) { alert('Nombre y tel\u00E9fono son obligatorios'); return; }
  if (!ciudad) { alert('Selecciona tu ciudad'); return; }
  if (cart.length === 0) { alert('El carrito est\u00E1 vac\u00EDo'); return; }
  var total = getCartTotal();
  // C\u00E1lculo real de env\u00EDo con Servientrega
  var envio = (typeof arcanoCalcularEnvio === 'function')
    ? arcanoCalcularEnvio(ciudad, cart, total)
    : { exito: false, costo: 0, gratis: false, categoria: null, pesoGramos: 0 };
  var envioCosto = envio.gratis ? 0 : (envio.exito ? envio.costo : 0);
  var totalFinal = total + envioCosto;
  var envioInfoNotas;
  if (!envio.exito) {
    envioInfoNotas = 'Sin cobertura autom\u00E1tica. Coordinar con el cliente.';
  } else if (envio.gratis) {
    envioInfoNotas = 'Env\u00EDo gratis (Medell\u00EDn, pedido \u2265 $60.000)';
  } else {
    envioInfoNotas = 'Env\u00EDo ' + ciudad + ' (' + envio.categoria + ', ' + Math.ceil(envio.pesoGramos / 1000) + 'kg): $' + envio.costo.toLocaleString('es-CO') + ' (Servientrega Contado Normal Terrestre)';
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
    if (Math.abs(diff) < 60) return; // swipe m\u00EDnimo 60px
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
  // Animaci\u00F3n tipo carta: deslizar fuera + fade
  modal.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
  modal.style.transform = direction > 0 ? 'translateX(-40px) scale(0.95)' : 'translateX(40px) scale(0.95)';
  modal.style.opacity = '0';
  setTimeout(function() {
    // Renderizar el nuevo contenido directamente en el modal existente
    _updateDetailContent(overlay, products, newIdx);
    // Reset transform para que entre desde el lado opuesto
    modal.style.transform = direction > 0 ? 'translateX(40px) scale(0.95)' : 'translateX(-40px) scale(0.95)';
    modal.style.opacity = '0';
    // Forzar reflow para que la transici\u00F3n funcione
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
  if (filtered.length === 0) { grid.innerHTML = '<div class="page-placeholder"><p>Sin recetas a\u00FAn</p></div>'; return; }
  var h = '';
  for (var i = 0; i < filtered.length; i++) {
    var r = filtered[i];
    var diffClass = r.dificultad === 'Facil' ? 'easy' : (r.dificultad === 'Dificil' ? 'hard' : 'medium');
    h += '<div class="recipe-grid-card" onclick="showRecipeDetail(\'' + r._key + '\')">';
    h += '<div class="rgc-cat">' + (r.categoria || '') + '</div>';
    h += '<div class="rgc-title">' + (r.titulo || 'Sin t\u00EDtulo') + '</div>';
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
  h += '<h2 class="rd-title">' + (r.titulo || 'Sin t\u00EDtulo') + '</h2>';
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
    h += '<div class="rd-section-label">Preparaci\u00F3n</div><ol class="rd-steps">';
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
    text += 'Preparaci\u00F3n:\n';
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

  // Step indicators (hide on success)
  var steps = ['Nombre', 'Tama\u00F1o', 'Especias', 'Proporciones', 'Confirmar'];
  var h = '<div class="bb-container">';
  if (step < 6) {
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
  }

  // Step 1: Nombre
  if (step === 1) {
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">NOMBRE DE TU BLEND</h3>';
    h += '<p class="bb-step-desc">Para un sabor \u00FAnico, un nombre incre\u00EDble!.</p>';
    h += '<input class="bb-name-input" id="bb-name" value="' + (state.nombre || '').replace(/"/g, '&quot;') + '" oninput="_bbOnNameInput(this)" placeholder="Ej: Saz\u00F3n Original">';
    h += '</div>';
  }

  // Step 2: Tama\u00F1o
  if (step === 2) {
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">Elige el tama\u00F1o</h3>';
    h += '<p class="bb-step-desc">Selecciona el tama\u00F1o del frasco para tu blend.</p>';
    h += '<div class="bb-size-cards">';
    h += '<div class="bb-size-card' + (state.talla === 'chico' ? ' selected' : '') + '" onclick="_bbSetTalla(\'chico\')">';
    h += '<div class="bb-size-card-icon"><img src="icons/frasco-chico.png" alt="Frasco peque\u00F1o"></div>';
    h += '<div class="bb-size-card-name">Peque\u00F1o</div>';
    if (precio > 0 && state.talla === 'chico') h += '<div class="bb-size-card-price">$' + precio.toLocaleString() + '</div>';
    h += '</div>';
    h += '<div class="bb-size-card' + (state.talla === 'grande' ? ' selected' : '') + '" onclick="_bbSetTalla(\'grande\')">';
    h += '<div class="bb-size-card-icon"><img src="icons/frasco-grande.png" alt="Frasco grande"></div>';
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

  // Step 6: Exito
  if (step === 6) {
    h += '<div class="bb-step-content bb-success">';
    h += '<h3 class="bb-step-title bb-success-title">Genial, tu Blend ha quedado Fant\u00E1stico</h3>';
    h += '<p class="bb-step-desc bb-success-desc">Tiene mucho car\u00E1cter y estilo.</p>';
    h += '<div class="bb-success-btns">';
    h += '<button class="bb-nav-btn success dark" onclick="_bbCreateAnother()">Crear otro</button>';
    h += '<button class="bb-nav-btn success dark" onclick="goTo(\'tienda\')">Volver a la tienda</button>';
    h += '<button class="bb-nav-btn success" onclick="toggleCartDrawer()">Ver Carrito</button>';
    h += '</div></div>';
  }

  // Step 5: Confirmar
  if (step === 5) {
    var tallaLabel = state.talla === 'grande' ? 'Grande' : 'Peque\u00F1o';
    h += '<div class="bb-step-content">';
    h += '<h3 class="bb-step-title">Resumen de tu blend</h3>';
    h += '<div class="bb-summary">';
    h += '<div class="bb-summary-row"><span class="bb-summary-label">Nombre</span><span class="bb-summary-value">' + (state.nombre || '-') + '</span></div>';
    h += '<div class="bb-summary-row"><span class="bb-summary-label">Tama\u00F1o</span><span class="bb-summary-value">' + tallaLabel + '</span></div>';
    h += '<div class="bb-summary-row"><span class="bb-summary-label">Precio</span><span class="bb-summary-value bb-summary-price">$' + precio.toLocaleString() + '</span></div>';
    h += '</div>';
    h += '<div class="bb-summary-specs">';
    for (var i = 0; i < state.especias.length; i++) {
      var sp = state.especias[i];
      h += '<div class="bb-summary-spec"><span class="bb-spec-name">' + sp.nombre + '</span><span class="bb-spec-pct">' + sp.porcentaje + '%</span></div>';
    }
    h += '</div></div>';
  }

  // Navigation buttons (hide on success)
  if (step < 6) {
  h += '<div class="bb-nav">';
  if (step > 1) {
    h += '<button class="bb-nav-btn prev" onclick="_bbGoStep(' + (step - 1) + ')">Atr\u00E1s</button>';
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
  }
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

function _bbCreateAnother() { _blendBuilderState = { nombre: '', talla: '', especias: [], step: 1 }; renderBlendBuilder(); }
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
  { name: 'WhatsApp', url: 'https://api.whatsapp.com/send/?phone=+573178003374&type=phone_number', svg: '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.613z"/></svg>' }
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
      grid.innerHTML = '<div class="empty-state"><p>Au\u0301n no hay art\u00EDculos en esta categoria.</p></div>';
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
      h += '<h3 class="blog-card-title">' + (p.titulo || 'Sin t\u00EDtulo') + '</h3>';
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
      '<div class="form-group"><label>N\u00FAmero de WhatsApp</label>' +
        '<input class="form-input" id="mc-tel" placeholder="3001234567" maxlength="10" inputmode="numeric" pattern="[0-9]*" oninput="this.value=this.value.replace(/[^0-9]/g,\'\').slice(0,10)" onblur="_mcBuscarCliente()"></div>' +
      '<div class="form-group"><label>Tu nombre</label>' +
        '<input class="form-input" id="mc-nombre" placeholder="Tu nombre" maxlength="40"></div>' +
      '<button class="btn-primary btn-block" onclick="_mcRegistrar()" id="mc-btn-registrar">' +
        '<span>Ingresar</span>' +
      '</button>' +
      '<p class="mc-hint" id="mc-hint">\u{1F4A1} Reg\u00EDstrate con tu WhatsApp y nombre. Podr\u00E1s ver tus pedidos y promociones exclusivas.</p>' +
    '</div>';
}

// Busca si el WhatsApp ya existe en Firebase \u2192 autocompleta nombre y cambia UI
function _mcBuscarCliente() {
  var tel = (document.getElementById('mc-tel').value || '').trim();
  if (!tel || tel.length < 6) return; // necesita al menos 6 d\u00EDgitos
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
        if (subLabel) subLabel.textContent = '\u00A1Bienvenido de nuevo, ' + (cliente.nombre || '').split(' ')[0] + '!';
        if (btn) btn.innerHTML = '<span>Ingresar</span>';
        if (hint) hint.innerHTML = '\u{1F4A1} Ya est\u00E1s registrado. Solo presiona <b>Ingresar</b>.';
      } else {
        // Cliente nuevo: limpiar y mostrar registro
        if (nombreInput) {
          nombreInput.style.color = '';
          nombreInput.style.fontWeight = '';
        }
        if (subLabel) subLabel.textContent = 'Reg\u00EDstrate para ver tus pedidos y promociones exclusivas';
        if (btn) btn.innerHTML = '<span>Registrarme</span>';
        if (hint) hint.innerHTML = '\u{1F4A1} Reg\u00EDstrate con tu WhatsApp y nombre.';
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
  if (!tel) { alert('Ingresa tu n\u00FAmero de WhatsApp'); return; }
  if (!nombre) { alert('Ingresa tu nombre'); return; }

  var btn = document.getElementById('mc-btn-registrar');
  var original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span>Ingresando...</span>';

  registrarCliente(tel, nombre).then(function(cliente) {
    saveClienteSession(cliente);
    _showToast('\u00A1Bienvenido ' + (cliente.nombre || '').split(' ')[0] + '!');
    _updateCuentaBadge();
    _mcShowExito(cliente);
  }).catch(function(err) {
    alert(err.message || err);
    btn.disabled = false;
    btn.innerHTML = original;
  });
}

// Pantalla de \u00E9xito: registro confirmado
function _mcShowExito(cliente) {
  var el = document.getElementById('mc-content');
  if (!el) return;
  el.innerHTML =
    '<div class="mc-login">' +
      '<div class="mc-exito-icon">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>' +
      '<h3 style="text-align:center;color:var(--gold);margin-bottom:8px">\u00A1Bienvenido, ' + esc(cliente.nombre || '').split(' ')[0] + '!</h3>' +
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
  if (!codigo) { alert('Ingresa el c\u00F3digo de 6 d\u00EDgitos'); return; }
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
        '<div class="mc-user-avatar">' + ((cliente.nombre || 'C').charAt(0) || 'C').toUpperCase() + '</div>' +
        '<div class="mc-user-data">' +
          '<div class="mc-user-name">' + (cliente.nombre || 'Cliente') + '</div>' +
          '<div class="mc-user-meta">' + (cliente.telefono || '') + '</div>' +
          '<div class="mc-user-stats">' +
            '<span><b>' + totalPedidos + '</b> pedidos</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Colecci\u00F3n Arcano
      '<div id="mc-coleccion-section"></div>' +
      // Seccion promos exclusivas
      '<div id="mc-promos-section"></div>' +
      // Tabs de pedidos
      '<div class="mc-tabs">' +
        '<button class="mc-tab active" data-tab="entregados" onclick="_mcSwitchTab(\'entregados\')">Entregados <span class="mc-tab-count" id="mc-c-entregados">0</span></button>' +
        '<button class="mc-tab" data-tab="proceso" onclick="_mcSwitchTab(\'proceso\')">En proceso <span class="mc-tab-count" id="mc-c-proceso">0</span></button>' +
        '<button class="mc-tab" data-tab="anulados" onclick="_mcSwitchTab(\'anulados\')">Anulados <span class="mc-tab-count" id="mc-c-anulados">0</span></button>' +
      '</div>' +
      '<div id="mc-pedidos-list"><div class="loader"></div></div>' +
      '<button class="btn-secondary btn-block" style="margin-top:18px" onclick="_mcLogout()">Cerrar sesi\u00F3n</button>' +
    '</div>';
  // Cargar promos
  _mcLoadPromos();
  // Cargar colecci\u00F3n Arcano
  _mcLoadColeccion(cliente);
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
    list.innerHTML = '<p class="mc-empty">No tienes pedidos ' + (tab === 'entregados' ? 'entregados a\u00FAn.' : tab === 'anulados' ? 'anulados.' : 'en proceso.') + '</p>';
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
  container.innerHTML = '<h4 class="mc-promos-title">\u{1F381} Promociones exclusivas para ti</h4><div id="mc-promos-list" class="mc-promos-list"><div class="loader"></div></div>';
  getPromocionesActivas().then(function(promos) {
    var list = document.getElementById('mc-promos-list');
    if (!list) return;
    if (promos.length === 0) {
      list.innerHTML = '<p class="mc-empty">Sin promociones activas por ahora. \u00A1Vuelve pronto!</p>';
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
      var codigo = pr.codigo ? '<div class="mc-promo-codigo" onclick="_mcCopiarCodigo(\'' + pr.codigo + '\')"><span>C\u00F3digo:</span><b>' + pr.codigo + '</b><span class="mc-copy-hint">\u{1F4CB} copiar</span></div>' : '';
      var descuento = '';
      if (pr.tipo === 'porcentaje') descuento = pr.valor + '% OFF';
      else if (pr.tipo === 'monto') descuento = '$' + (pr.valor || 0).toLocaleString() + ' Off';
      else if (pr.tipo === 'envio') descuento = 'Env\u00EDo gratis';
      else if (pr.tipo === 'producto') descuento = 'Producto gratis';
      else descuento = pr.titulo || 'Promo';
      h += '<div class="mc-promo-card' + (pr.destacada ? ' mc-promo-destacada' : '') + '">' +
        '<div class="mc-promo-badge">' + descuento + '</div>' +
        '<div class="mc-promo-nombre">' + (pr.titulo || 'Promoci\u00F3n') + '</div>' +
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
      _showToast('C\u00F3digo copiado: ' + codigo);
    }).catch(function() {
      // Fallback para navegadores sin clipboard API
      var tmp = document.createElement('input');
      tmp.value = codigo;
      document.body.appendChild(tmp);
      tmp.select();
      try { document.execCommand('copy'); _showToast('C\u00F3digo copiado: ' + codigo); } catch(e) {}
      document.body.removeChild(tmp);
    });
  } catch(e) {
    _showToast('C\u00F3digo: ' + codigo);
  }
}

function _mcLogout() {
  clearClienteSession();
  closeMiCuenta();
  _updateCuentaBadge();
  _showToast('Sesi\u00F3n cerrada');
}

function _updateCuentaBadge() {
  var session = getClienteSession();
  var btn = document.querySelector('.mc-btn');
  var initialsEl = document.querySelector('.mc-btn-initials');
  var svgEl = btn ? btn.querySelector('svg') : null;
  if (!btn) return;
  if (session && session.nombre) {
    // Mostrar primer nombre (no inicial) en el bot\u00F3n
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
    // No hay sesi\u00F3n: mostrar icono default
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
   Pesta\u00F1a que asoma desde la derecha a los X segundos
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
  // Tipograf\u00EDa configurable
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

  // Animaci\u00F3n de entrada: doble rAF para asegurar que el browser pinte el estado inicial
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      el.classList.add('show');
    });
  });

  // Auto-cerrar despu\u00E9s de la duraci\u00F3n configurada
  var duracion = parseInt(popup.duracion, 10) || 8;
  if (duracion < 3) duracion = 3;
  setTimeout(function() {
    _closePopupLateral();
  }, duracion * 1000);

  // No volver a mostrar en esta sesi\u00F3n
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
    'Carnes': '\u{1F969}', 'Pollo': '\u{1F357}', 'Pescados y Mariscos': '\u{1F41F}', 'Cerdo': '\u{1F416}',
    'Arroces': '\u{1F35A}', 'Pastas': '\u{1F35D}', 'Sopas y Cremas': '\u{1F372}', 'Ensaladas': '\u{1F957}',
    'Guisos y Estofados': '\u{1F372}', 'Salsas': '\u{1F96B}', 'Marinadas y Adobos': '\u{1F33F}',
    'Panaderia': '\u{1F35E}', 'Postres': '\u{1F370}', 'Bebidas': '\u{1F964}', 'Vegetales': '\u{1F955}',
    'Ceviches': '\u{1F420}', 'Currys': '\u{1F35B}', 'Tacos y Burritos': '\u{1F32E}',
    'Hamburguesas': '\u{1F354}', 'Pizzas': '\u{1F355}'
  };
  var html = '<div class="detail-usos"><div class="detail-usos-label">\u2728 Ideal para</div><div class="detail-usos-list">';
  for (var i = 0; i < usos.length; i++) {
    var icon = iconos[usos[i]] || '\u25AA';
    html += '<span class="detail-uso-chip">' + icon + ' ' + usos[i] + '</span>';
  }
  html += '</div></div>';
  return html;
}

/* === Hero Landing: part\u00EDculas + fade on scroll === */
(function() {
  // Crear part\u00EDculas de especias flotando
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

  // Sin fade on scroll \u2014 el texto se queda fijo
})();

/* === COLECCI\u00D3N ARCANO \u2014 Cart\u00F3n del cliente === */
function _mcLoadColeccion(cliente) {
  var el = document.getElementById('mc-coleccion-section');
  if (!el) return;
  var wa = cliente.telefono || cliente.whatsapp || '';
  if (!wa) { el.innerHTML = ''; return; }

  // Normalizar whatsapp
  wa = wa.replace(/[^0-9+]/g, '');
  if (wa.startsWith('+')) wa = wa.substring(1);

  // Mostrar loading
  el.innerHTML = '<div class="coleccion-card"><div class="coleccion-title">\u{1F3C5} Colecci\u00F3n Arcano</div><div class="loader" style="margin:12px auto"></div></div>';

  onColeccionReady(wa, function(col) {
    if (!col) {
      // No tiene cart\u00F3n todav\u00EDa \u2014 mostrar cart\u00F3n vac\u00EDo
      col = { whatsapp: wa, nombre: cliente.nombre || '', casilleros: 0, completado: false, canjeado: false, historial: [] };
    }
    _mcRenderColeccion(el, col);
  });
}

function _mcRenderColeccion(el, col) {
  var casilleros = col.casilleros || 0;
  var completado = casilleros >= 10;
  var canjeado = col.canjeado || false;

  var h = '<div class="coleccion-card">';
  h += '<div class="coleccion-header">';
  h += '<div class="coleccion-icon">\u{1F3C5}</div>';
  h += '<div><div class="coleccion-title">Colecci\u00F3n Arcano</div>';
  h += '<div class="coleccion-subtitle">' + (casilleros >= 10 ? '\u00A1Cart\u00F3n completado!' : 'Acumula 10 blends peque\u00F1os') + '</div></div>';
  h += '</div>';
  h += '<div class="coleccion-desc">Compra <b>10 Blends peque\u00F1os</b> y recibe un <b>Blend Grande</b> de regalo.</div>';

  // Grid de 10 slots (2 filas de 5)
  h += '<div class="coleccion-grid">';
  for (var s = 0; s < 10; s++) {
    var lit = s < casilleros;
    h += '<div class="coleccion-slot' + (lit ? ' lit' : '') + '">';
    h += '<img src="icons/arcano-logo.webp" alt="Arcano" class="coleccion-slot-logo">';
    if (!lit) h += '<div class="coleccion-slot-num">' + (s + 1) + '</div>';
    h += '</div>';
  }
  h += '</div>';

  // Progreso
  h += '<div class="coleccion-progress">';
  h += '<div class="coleccion-progress-bar"><div class="coleccion-progress-fill" style="width:' + (casilleros * 10) + '%"></div></div>';
  h += '<div class="coleccion-progress-text"><b>' + casilleros + '</b> / 10</div>';
  h += '</div>';

  // Mensaje seg\u00FAn estado
  if (completado && !canjeado) {
    h += '<div class="coleccion-msg coleccion-msg-complete">';
    h += '<span class="coleccion-msg-icon">\u{1F389}</span>';
    h += '<span>\u00A1Felicitaciones! Has completado tu cart\u00F3n.<br>Tu pr\u00F3ximo Blend Grande es <b>gratis</b>.</span>';
    h += '</div>';
  } else if (canjeado) {
    h += '<div class="coleccion-msg coleccion-msg-canjeado">';
    h += '<span class="coleccion-msg-icon">\u2713</span>';
    h += '<span>Canjeaste tu Blend Grande gratis.<br>\u00A1Sigue comprando para completar tu pr\u00F3ximo cart\u00F3n!</span>';
    h += '</div>';
  } else if (casilleros > 0) {
    var restantes = 10 - casilleros;
    h += '<div class="coleccion-msg coleccion-msg-progress">';
    h += 'Te faltan <b>' + restantes + '</b> blend' + (restantes > 1 ? 's' : '') + ' peque\u00F1o' + (restantes > 1 ? 's' : '') + ' para tu regalo.';
    h += '</div>';
  } else {
    h += '<div class="coleccion-msg coleccion-msg-start">\u00A1Empieza tu colecci\u00F3n comprando tu primer Blend peque\u00F1o!</div>';
  }

  h += '</div>';

  // CSS inline (se carga una sola vez)
  if (!document.getElementById('coleccion-css')) {
    var style = document.createElement('style');
    style.id = 'coleccion-css';
    style.textContent = `
      .coleccion-card {
        background: linear-gradient(180deg, rgba(201,168,76,0.06) 0%, rgba(201,168,76,0.02) 100%);
        border: 1px solid rgba(201,168,76,0.18);
        border-radius: 14px;
        padding: 20px 18px;
        margin-bottom: 16px;
        overflow: hidden;
      }
      .coleccion-header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
      .coleccion-icon { font-size: 1.8rem; line-height: 1; }
      .coleccion-title {
        font-family: var(--font-display); font-size: 1.05rem; font-weight: 800;
        color: var(--gold, #c9a84c); letter-spacing: -0.01em;
      }
      .coleccion-subtitle { font-size: 0.72rem; color: var(--text-muted); font-weight: 500; }
      .coleccion-desc { font-size: 0.78rem; color: var(--text-sec); margin-bottom: 16px; line-height: 1.45; }
      .coleccion-desc b { color: var(--gold, #c9a84c); }

      .coleccion-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; margin-bottom: 14px; }
      .coleccion-slot {
        aspect-ratio: 1; border-radius: 10px;
        background: rgba(0,0,0,0.3);
        border: 1.5px solid rgba(201,168,76,0.1);
        display: flex; align-items: center; justify-content: center;
        position: relative;
        transition: all 0.4s cubic-bezier(0.34, 1.36, 0.64, 1);
      }
      .coleccion-slot.lit {
        background: linear-gradient(135deg, rgba(201,168,76,0.15) 0%, rgba(201,168,76,0.05) 100%);
        border-color: rgba(201,168,76,0.5);
        box-shadow: 0 2px 10px rgba(201,168,76,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
        animation: coleccionPop 0.4s ease;
      }
      @keyframes coleccionPop {
        0% { transform: scale(0.85); }
        60% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      .coleccion-slot-logo {
        width: 65%; height: 65%; object-fit: contain;
        filter: grayscale(1) brightness(0.3);
        opacity: 0.25;
        transition: all 0.4s ease;
      }
      .coleccion-slot.lit .coleccion-slot-logo {
        filter: grayscale(0) brightness(1);
        opacity: 1;
        filter: drop-shadow(0 1px 4px rgba(201,168,76,0.4));
      }
      .coleccion-slot-num {
        position: absolute;
        font-size: 0.7rem; font-weight: 700;
        color: rgba(201,168,76,0.2);
      }

      .coleccion-progress { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
      .coleccion-progress-bar { flex: 1; height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; overflow: hidden; }
      .coleccion-progress-fill { height: 100%; background: linear-gradient(90deg, var(--gold, #c9a84c), #e8c860); border-radius: 3px; transition: width 0.6s ease; }
      .coleccion-progress-text { font-size: 0.82rem; color: var(--text-sec); white-space: nowrap; }
      .coleccion-progress-text b { color: var(--gold, #c9a84c); font-size: 1rem; font-family: var(--font-display); }

      .coleccion-msg {
        padding: 12px 14px; border-radius: 8px; font-size: 0.8rem; line-height: 1.4; text-align: center;
      }
      .coleccion-msg-complete {
        background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05));
        border: 1px solid rgba(201,168,76,0.3);
        color: var(--gold, #c9a84c); font-weight: 600;
        display: flex; align-items: center; gap: 10px;
      }
      .coleccion-msg-canjeado {
        background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.2);
        color: #6bcf8f;
        display: flex; align-items: center; gap: 10px;
      }
      .coleccion-msg-progress { color: var(--text-sec); }
      .coleccion-msg-progress b { color: var(--gold, #c9a84c); }
      .coleccion-msg-start { color: var(--text-muted); font-style: italic; }
      .coleccion-msg-icon { font-size: 1.3rem; flex-shrink: 0; }
    `;
    document.head.appendChild(style);
  }

  el.innerHTML = h;
}
