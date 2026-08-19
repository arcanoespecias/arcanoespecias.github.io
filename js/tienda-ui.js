/* ===================== ARCANO TIENDA — UI ===================== */
var cart = JSON.parse(localStorage.getItem('arcano_cart') || '[]');

function saveCart() { localStorage.setItem('arcano_cart', JSON.stringify(cart)); }

function getCartCount() { var c = 0; for (var i = 0; i < cart.length; i++) c += cart[i].qty; return c; }

function getCartTotal() { var t = 0; for (var i = 0; i < cart.length; i++) t += cart[i].precio * cart[i].qty; return t; }

function _showCartToast(nombre) {
  var existing = document.getElementById('cart-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'cart-toast';
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1b0b07;color:#e8b84b;padding:12px 24px;border-radius:8px;border:1px solid #e8b84b;font-size:0.95rem;font-weight:600;z-index:10000;animation:toastIn 0.3s ease,toastOut 0.3s ease 1.7s forwards;box-shadow:0 4px 20px rgba(232,184,75,0.3)';
  toast.textContent = 'Producto agregado al carrito';
  if (!document.getElementById('toast-keyframes')) {
    var style = document.createElement('style');
    style.id = 'toast-keyframes';
    style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes toastOut{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(20px)}}';
    document.head.appendChild(style);
  }
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 2000);
}

function addToCart(product, talla) {
  var precio = talla === 'grande' ? product.precioGrande : product.precioChico;
  if (precio <= 0) return;
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].productId === product.id && cart[i].talla === talla) { cart[i].qty++; saveCart(); updateCartFab(); _showCartToast(product.nombre); return; }
  }
  cart.push({ productId: product.id, nombre: product.nombre, tipo: product.tipo, talla: talla, precio: precio, qty: 1 });
  saveCart(); updateCartFab(); _showCartToast(product.nombre);
}

function removeFromCart(idx) { cart.splice(idx, 1); saveCart(); updateCartFab(); if (document.getElementById('cart-list')) renderCartModal(); }

function changeQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  saveCart(); updateCartFab(); if (document.getElementById('cart-list')) renderCartModal();
}

function updateCartFab() {
  var fab = document.getElementById('cart-fab');
  var count = getCartCount();
  if (count > 0) { fab.style.display = 'flex'; document.getElementById('cart-count').textContent = count; }
  else { fab.style.display = 'none'; }
}

/* === RENDER PRODUCTS === */
function renderProducts(filter) {
  var products = getStoreProducts();
  var grid = document.getElementById('products-grid');
  if (products.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p style="font-size:2rem;margin-bottom:8px">\ud83c\udf36</p><p>No hay productos disponibles por el momento.</p></div>';
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
    var hasChico = p.stockChico > 0 && p.precioChico > 0;
    var hasGrande = p.stockGrande > 0 && p.precioGrande > 0;
    var anyStock = hasChico || hasGrande;
    var isPack = p.tipo === 'pack'; var meta = ''; if (p.categorias && p.categorias.length > 1) { meta = p.categorias.join(' / '); } else if (p.categoria) { meta = p.categoria; }

    h += '<div class="product-card">' +
      '<div class="card-img" style="position:relative" onclick="openDetail(' + p.id + ')">' +
        (p.imagen ? '<img src="' + p.imagen + '" alt="' + p.nombre + '">' : '<span>' + (isPack ? '\ud83c\udf81' : (p.tipo === 'blend' ? '\ud83c\udf3f' : '\ud83c\udf31')) + '</span>') +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-name">' + p.nombre + '</div>' +
        '<div class="card-meta">' + meta + '</div>' +
        '<div class="card-prices">' +
          (hasChico ? '<button class="price-box price-box-btn" onclick="event.stopPropagation();addToCartByIdAndSize(' + p.id + ', &#39;chico&#39;)"><div class="price-label">Pequeño</div><div class="price-value">$' + p.precioChico.toLocaleString() + '</div></button>' : '') +
          (hasGrande ? '<button class="price-box price-box-btn" onclick="event.stopPropagation();addToCartByIdAndSize(' + p.id + ', &#39;grande&#39;)"><div class="price-label">Grande</div><div class="price-value">$' + p.precioGrande.toLocaleString() + '</div></button>' : '') +
          (isPack && p.precio > 0 && (p.stock || 0) > 0 ? '<button class="price-box price-box-btn" onclick="event.stopPropagation();addToCartPack(' + p.id + ')"><div class="price-label">Pack</div><div class="price-value">$' + p.precio.toLocaleString() + '</div></button>' : '') +
          (!hasChico && !hasGrande && !(isPack && p.precio > 0) ? '<div class="price-na">Sin precio</div>' : '') +
        '</div>' +
        (!anyStock ? '<button class="add-btn" disabled>Sin stock</button>' : '') +
      '</div></div>';
  }
  grid.innerHTML = h;
}

function addToCartByIdAndSize(pid, talla) {
  var products = getStoreProducts();
  var product = null;
  for (var i = 0; i < products.length; i++) { if (products[i].id === pid) { product = products[i]; break; } }
  if (!product) return;
  addToCart(product, talla);
}

function addToCartPack(pid) {
  var products = getStoreProducts();
  var product = null;
  for (var i = 0; i < products.length; i++) { if (products[i].id === pid) { product = products[i]; break; } }
  if (!product || !product.precio) return;
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].productId === product.id && cart[i].tipo === 'pack') { cart[i].qty++; saveCart(); updateCartFab(); _showCartToast(product.nombre); return; }
  }
  cart.push({ productId: product.id, nombre: product.nombre, tipo: 'pack', talla: 'pack', precio: product.precio, qty: 1 });
  saveCart(); updateCartFab(); _showCartToast(product.nombre);
}
function doAddToCart(pid) {
  var products = getStoreProducts();
  var product = null;
  for (var i = 0; i < products.length; i++) { if (products[i].id === pid) { product = products[i]; break; } }
  if (!product) return;
  var talla = (product.stockChico > 0 && product.precioChico > 0) ? 'chico' : 'grande';
  addToCart(product, talla);
}

/* === PRODUCT DETAIL MODAL === */
function openDetail(pid) {
  var products = getStoreProducts();
  var p = null;
  for (var i = 0; i < products.length; i++) { if (products[i].id === pid) { p = products[i]; break; } }
  if (!p) return;

  var isPack = p.tipo === 'pack';
  var hasChico = !isPack && p.stockChico > 0 && p.precioChico > 0;
  var hasGrande = !isPack && p.stockGrande > 0 && p.precioGrande > 0;
  var hasPackPrice = isPack && p.precio > 0 && (p.stock || 0) > 0;
  var anyStock = hasChico || hasGrande || hasPackPrice;
  var typeClass = isPack ? 'detail-type-pack' : (p.tipo === 'blend' ? 'detail-type-blend' : 'detail-type-especia');
  var typeLabel = isPack ? 'Pack' : (p.tipo === 'blend' ? 'Blend' : 'Especia');

  var tagsHtml = '';
  if (p.categorias && p.categorias.length > 0) { for (var ci = 0; ci < p.categorias.length; ci++) { tagsHtml += '<span class="detail-info-tag">' + p.categorias[ci] + '</span>'; } } else if (p.categoria) { tagsHtml += '<span class="detail-info-tag">' + p.categoria + '</span>'; }
  if (p.uso) tagsHtml += '<span class="detail-info-tag">' + p.uso + '</span>';
  if (p.region) tagsHtml += '<span class="detail-info-tag">' + p.region + '</span>';
  if (p.tags && p.tags.length) {
    for (var ti = 0; ti < p.tags.length; ti++) {
      tagsHtml += '<span class="detail-info-tag detail-tag-item">' + p.tags[ti] + '</span>';
    }
  }

  var pricesHtml = '';
  if (hasChico) pricesHtml += '<button class="detail-price-card detail-price-btn" onclick="addToCartByIdAndSize(' + p.id + ', ' + String.fromCharCode(39) + 'chico' + String.fromCharCode(39) + ');document.getElementById(' + String.fromCharCode(39) + 'detail-overlay' + String.fromCharCode(39) + ').remove()"><div class="detail-price-label">Pequeño</div><div class="detail-price-val">$' + p.precioChico.toLocaleString() + '</div></button>';
  if (hasGrande) pricesHtml += '<button class="detail-price-card detail-price-btn" onclick="addToCartByIdAndSize(' + p.id + ', ' + String.fromCharCode(39) + 'grande' + String.fromCharCode(39) + ');document.getElementById(' + String.fromCharCode(39) + 'detail-overlay' + String.fromCharCode(39) + ').remove()"><div class="detail-price-label">Grande</div><div class="detail-price-val">$' + p.precioGrande.toLocaleString() + '</div></button>';

  var descHtml = p.descripcion ? '<p class="detail-desc">' + p.descripcion + '</p>' : '';

  // Mostrar contenido del pack o ingredientes para blends
  var ingsHtml = '';
  if (isPack && p.blendItems && p.blendItems.length > 0) {
    ingsHtml = '<div style="margin-top:14px"><div style="font-size:.9rem;font-weight:700;color:#5A4210;margin-bottom:8px">Incluye</div>';
    for (var bi = 0; bi < p.blendItems.length; bi++) {
      var bItem = p.blendItems[bi];
      var bName = '';
      var allProds = getStoreProducts();
      for (var pi = 0; pi < allProds.length; pi++) {
        if (allProds[pi].id === bItem.blendId) { bName = allProds[pi].nombre; break; }
      }
      if (!bName) bName = 'Blend';
      var tallaLabel = bItem.talla === 'grande' ? 'Grande' : 'Pequeño';
      var qtyLabel = bItem.cantidad || 1;
      ingsHtml += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(196,148,58,0.15)"><span style="font-size:.9rem;color:#5A4210;min-width:18px;font-weight:700">' + qtyLabel + '</span><span style="font-size:.9rem;color:var(--text)">' + bName + '</span><span style="font-size:.8rem;color:var(--text-secondary);margin-left:auto">(' + tallaLabel + ')</span></div>';
    }
    ingsHtml += '</div>';
  } else if (p.tipo === 'blend' && p.ingredientes && p.ingredientes.length > 0) {
    ingsHtml = '<div style="margin-top:14px"><div style="font-size:.9rem;font-weight:700;color:#5A4210;margin-bottom:6px">Ingredientes</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
    for (var ii = 0; ii < p.ingredientes.length; ii++) {
      var ing = p.ingredientes[ii];
      ingsHtml += '<span style="display:inline-block;padding:5px 12px;border-radius:20px;font-size:.82rem;background:rgba(196,148,58,0.14);color:#5A4210;border:1px solid rgba(196,148,58,0.25)">' + (ing.nombre || ing.especiaNombre || 'Especia') + '</span>';
    }
    ingsHtml += '</div></div>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'detail-overlay';
  overlay.id = 'detail-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var html = '<div class="detail-modal">' +
    '<button class="detail-close" onclick="document.getElementById(\'detail-overlay\').remove()">&times;</button>' +
    '<div class="detail-img">' +
      (p.imagen ? '<img src="' + p.imagen + '" alt="' + p.nombre + '">' : '<span class="detail-emoji">' + (isPack ? '\ud83c\udf81' : (p.tipo === 'blend' ? '\ud83c\udf3f' : '\ud83c\udf31')) + '</span>') +
    '</div>' +
    '<div class="detail-content">' +
      '<span class="detail-type ' + typeClass + '">' + typeLabel + '</span>' +
      '<h2>' + p.nombre + '</h2>' +
      (tagsHtml ? '<div class="detail-info-row">' + tagsHtml + '</div>' : '') +
      descHtml +
      ingsHtml +
      (pricesHtml ? '<div class="detail-prices-row">' + pricesHtml + '</div>' : '') +
    '</div></div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

/* === CART MODAL === */
function openCart() {
  var existing = document.getElementById('order-modal');
  if (existing) { existing.remove(); return; }
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'order-modal';
  document.body.appendChild(overlay);
  renderCartModal();
}

function renderCartModal() {
  var overlay = document.getElementById('order-modal');
  if (!overlay) return;
  var total = getCartTotal();
  var h = '<div class="modal">' +
    '<div class="modal-header"><h3>Tu Pedido</h3><button class="modal-close" onclick="closeCart()">&times;</button></div>' +
    '<div class="modal-body">';

  if (cart.length === 0) {
    h += '<div class="empty-state"><p>No agregaste productos aun.</p></div>';
  } else {
    h += '<div id="cart-list">';
    for (var i = 0; i < cart.length; i++) {
      var c = cart[i];
      h += '<div class="cart-item">' +
        '<div class="cart-item-info"><div class="cart-item-name">' + c.nombre + '</div>' +
        '<div class="cart-item-detail">' + ((c.talla === 'pack' ? 'Pack' : (c.talla === 'grande' ? 'Grande' : 'Pequeño')) + ' \u00b7 $' + c.precio.toLocaleString() + ' c/u') + '</div>' +
        (c.customBlend ? _renderCartBlendDetail(c.customBlend) : '') +
        '</div>' +
        '<div class="cart-item-qty"><button onclick="changeQty(' + i + ',-1)">-</button><span>' + c.qty + '</span><button onclick="changeQty(' + i + ',1)">+</button></div>' +
        '<div class="cart-item-price">$' + (c.precio * c.qty).toLocaleString() + '</div>' +
        '<button class="cart-item-rm" onclick="removeFromCart(' + i + ')">&times;</button></div>';
    }
    h += '</div>';
    h += '<div class="cart-total">Total: $' + total.toLocaleString() + '</div>';
    h += '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">' +
      '<div class="form-group"><label>Nombre</label><input class="form-input" id="o-nombre" placeholder="Tu nombre"></div>' +
      '<div class="form-row"><div class="form-group"><label>Telefono</label><input class="form-input" id="o-tel" placeholder="Ej: 300 123 4567"></div>' +
      '<div class="form-group"><label>Email</label><input class="form-input" id="o-email" type="email" placeholder="tu@email.com"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Ciudad</label><input class="form-input" id="o-ciudad" placeholder="Ej: Bogota"></div>' +
      '<div class="form-group"><label>Direccion</label><input class="form-input" id="o-dir" placeholder="Direccion de entrega"></div></div>' +
      '<div class="form-group"><label>Notas adicionales</label><textarea class="form-input" id="o-notas" placeholder="Horario de entrega, instrucciones especiales..."></textarea></div>' +
      '</div>';
  }

  h += '</div><div class="modal-footer">' +
    (cart.length > 0 ? '<button class="btn-secondary" onclick="closeCart()">Seguir comprando</button><button class="btn-primary" onclick="sendOrder()">Enviar Pedido</button>' :
    '<button class="btn-secondary" onclick="closeCart()">Volver</button>') +
    '</div></div>';
        var config = getTiendaConfig();
      var qrHtml = '';
      if (config && config.qrPagoImage) {
        qrHtml = '<div style="margin-top:20px;padding:16px;background:rgba(232,184,75,0.08);border:1px solid rgba(232,184,75,0.2);border-radius:10px"><p style="font-size:.85rem;font-weight:600;color:var(--gold);margin:0 0 10px">Forma de pago</p><img src="' + config.qrPagoImage + '" style="max-width:280px;border-radius:8px;display:block;margin:0 auto">' +
        '<p style="font-size:.75rem;color:#8a7a6a;margin:8px 0 0;text-align:center">Env\u00eda el comprobante por WhatsApp</p></div>';
      }
      overlay.innerHTML = h + qrHtml;
}

function closeCart() {
  var el = document.getElementById('order-modal');
  if (el) el.remove();
}

/* === SEND ORDER (Firebase) === */
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
    var _itemData = { productId: c.productId, nombre: c.nombre, tipo: c.tipo, talla: c.talla, precio: c.precio, qty: c.qty, subtotal: c.precio * c.qty };
    if (c.customBlend) _itemData.customBlend = c.customBlend;
    items.push(_itemData);
  }
  var total = getCartTotal();
  var orderData = {
    cliente: { nombre: nombre, telefono: tel, email: email, ciudad: ciudad, direccion: dir },
    items: items, total: total, notas: notas
  };

  var overlay = document.getElementById('order-modal');
  if (overlay) overlay.querySelector('.modal-body').innerHTML = '<div style="text-align:center;padding:30px"><div class="loader"></div><p class="text-muted mt-12">Enviando pedido...</p></div>';

  submitOrder(orderData).then(function() {
    if (overlay) {
      overlay.querySelector('.modal').innerHTML =
        '<div class="modal-body"><div class="success-msg">' +
        '<div class="success-icon">\u2705</div>' +
        '<h3>Pedido enviado</h3>' +
        '<p>Tu pedido fue recibido correctamente. Nos contactaremos pronto para confirmar.</p>' +
        '<button class="btn-primary" style="margin-top:20px" onclick="finishOrder()">Entendido</button>' +
        '</div></div>';
    }
  }).catch(function(err) {
    alert('Error al enviar el pedido: ' + (err.message || err));
    if (overlay) renderCartModal();
  });
}

function finishOrder() {
  cart = []; saveCart(); updateCartFab();
  closeCart();
  renderProducts(currentFilter);
}

/* === SIDEBAR === */
var _sidebarOpen = true;
var _currentRecetaCat = 'Comida';
var _currentSidebarSection = 'recetas';
var _blendBuilderState = { nombre: '', talla: 'chico', especias: [], showDropdown: false };
var _SOCIAL_LINKS = [
  { name: 'Facebook', url: 'https://facebook.com/arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
  { name: 'Instagram', url: 'https://instagram.com/arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.354 2.618 6.782 6.98 6.979C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.668-.072-4.948-.2-4.354-2.618-6.782-6.98-6.979C15.667.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' },
  { name: 'TikTok', url: 'https://tiktok.com/@arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.09-.22-2.98.32-.89.54-1.48 1.5-1.56 2.54-.1 1.26.42 2.55 1.46 3.28 1.04.73 2.5.88 3.68.35 1.18-.53 2.02-1.74 2.08-3.04.04-.96.02-1.92.02-2.88V2.04h1.01z"/></svg>' },
  { name: 'YouTube', url: 'https://youtube.com/@arcanoespecias', svg: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  { name: 'WhatsApp', url: 'https://wa.me/XXXXXXXXXX', svg: '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.613z"/></svg>' }
];

function toggleSidebar() {
  _sidebarOpen = !_sidebarOpen;
  var panel = document.getElementById('sidebar-panel');
  var overlay = document.getElementById('sidebar-overlay');
  if (window.innerWidth <= 768) {
    panel.classList.toggle('open', _sidebarOpen);
    panel.classList.toggle('closed', !_sidebarOpen);
    overlay.classList.toggle('open', _sidebarOpen);
  } else {
    panel.classList.toggle('closed', !_sidebarOpen);
  }
}
function closeSidebar() {
  _sidebarOpen = false;
  var panel = document.getElementById('sidebar-panel');
  var overlay = document.getElementById('sidebar-overlay');
  panel.classList.add('closed');
  panel.classList.remove('open');
  overlay.classList.remove('open');
}
function switchSidebarSection(section) {
  _currentSidebarSection = section;
  var mainTabs = document.querySelectorAll('.sidebar-main-tab');
  for (var i = 0; i < mainTabs.length; i++) mainTabs[i].classList.toggle('active', mainTabs[i].dataset.section === section);
  var catTabs = document.getElementById('receta-cats-tabs');
  if (section === 'blend') {
    if (catTabs) catTabs.style.display = 'none';
    renderBlendBuilder();
  } else {
    if (catTabs) catTabs.style.display = 'flex';
    renderRecetas();
  }
}
function selectRecetaCat(cat) {
  var tabs = document.querySelectorAll('.sidebar-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.cat === cat);
  _currentRecetaCat = cat;
  renderRecetas();
}
/* === BLEND BUILDER === */
function _getEspeciasDisponibles() {
  var products = getStoreProducts();
  var especias = [];
  for (var i = 0; i < products.length; i++) {
    if (products[i].tipo === 'especia' && products[i].enBlend !== false && (products[i].stockPala || 0) > 0) especias.push(products[i]);
  }
  especias.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
  return especias;
}

function _getCustomBlendPrice(talla) {
  var products = getStoreProducts();
  var totalChico = 0, countChico = 0, totalGrande = 0, countGrande = 0;
  for (var i = 0; i < products.length; i++) {
    if (products[i].tipo === 'blend') {
      if (products[i].precioChico > 0) { totalChico += products[i].precioChico; countChico++; }
      if (products[i].precioGrande > 0) { totalGrande += products[i].precioGrande; countGrande++; }
    }
  }
  if (talla === 'grande' && countGrande > 0) return Math.round(totalGrande / countGrande);
  if (countChico > 0) return Math.round(totalChico / countChico);
  return 15000;
}

function _bbGetTotal() {
  var total = 0;
  for (var i = 0; i < _blendBuilderState.especias.length; i++) {
    total += _blendBuilderState.especias[i].porcentaje;
  }
  return total;
}

function renderBlendBuilder() {
  var container = document.getElementById('sidebar-content');
  if (!container) return;

  var especias = _getEspeciasDisponibles();
  var state = _blendBuilderState;
  var total = _bbGetTotal();
  var precio = _getCustomBlendPrice(state.talla);
  var isComplete = total === 100 && state.nombre.trim().length > 0 && state.especias.length > 0;

  var activeId = null;
  var selStart = null, selEnd = null;
  if (document.activeElement && document.activeElement.id) {
    activeId = document.activeElement.id;
    if (document.activeElement.setSelectionRange) {
      selStart = document.activeElement.selectionStart;
      selEnd = document.activeElement.selectionEnd;
    }
  }

  var h = '<div class="bb-container">';

  h += '<div class="bb-field"><label class="bb-label">Nombre del blend</label>';
  h += '<input class="bb-input" id="bb-name" value="' + (state.nombre || '').replace(/"/g, '&quot;') + '" oninput="_blendBuilderState.nombre=this.value" placeholder="Ej: Mi mezcla especial">';
  h += '</div>';

  h += '<div class="bb-field"><label class="bb-label">Tama\u00f1o del frasco</label>';
  h += '<div class="bb-size-row">';
  h += '<button class="bb-size-btn' + (state.talla === 'chico' ? ' active' : '') + '" onclick="_bbSetTalla(\'chico\')">Peque\u00f1o</button>';
  h += '<button class="bb-size-btn' + (state.talla === 'grande' ? ' active' : '') + '" onclick="_bbSetTalla(\'grande\')">Grande</button>';
  h += '</div></div>';

  h += '<div class="bb-field"><label class="bb-label">Tu mezcla</label>';
  if (state.especias.length === 0) {
    h += '<div class="bb-empty">Agrega especias para crear tu blend</div>';
  } else {
    for (var i = 0; i < state.especias.length; i++) {
      var sp = state.especias[i];
      h += '<div class="bb-spice-row">';
      h += '<div class="bb-spice-name">' + sp.nombre + '</div>';
      h += '<div class="bb-spice-controls">';
      h += '<button class="bb-pct-btn" onclick="_bbChangePct(' + i + ',-5)">-</button>';
      h += '<input class="bb-pct-input" id="bb-pct-' + i + '" type="number" min="1" max="100" value="' + sp.porcentaje + '" onchange="_bbSetPctDirect(' + i + ',this.value)">';
      h += '<span class="bb-pct-sym">%</span>';
      h += '<button class="bb-pct-btn" onclick="_bbChangePct(' + i + ',5)">+</button>';
      h += '<button class="bb-rm-btn" onclick="_bbRemoveSpice(' + i + ')">\u00d7</button>';
      h += '</div></div>';
    }
  }

  var availableEspecias = [];
  for (var e = 0; e < especias.length; e++) {
    var found = false;
    for (var s = 0; s < state.especias.length; s++) {
      if (state.especias[s].nombre === especias[e].nombre) { found = true; break; }
    }
    if (!found) availableEspecias.push(especias[e]);
  }

  if (availableEspecias.length > 0) {
    h += '<button class="bb-add-btn" onclick="_bbToggleDropdown()">' + (state.showDropdown ? 'Cerrar lista' : '+ Agregar especia') + '</button>';
  }
  if (state.showDropdown && availableEspecias.length > 0) {
    h += '<div class="bb-dropdown">';
    h += '<input class="bb-search" id="bb-search" placeholder="Buscar especia..." oninput="_bbFilterDropdown(this.value)">';
    h += '<div class="bb-dropdown-list" id="bb-dropdown-list">';
    for (var a = 0; a < availableEspecias.length; a++) {
      var safeName = availableEspecias[a].nombre.replace(/'/g, "\\'");
      h += '<div class="bb-dropdown-item" data-name="' + availableEspecias[a].nombre + '" onclick="_bbAddSpice(\'' + safeName + '\')">';
      h += '<span class="bb-dd-name">' + availableEspecias[a].nombre + '</span>';
      h += '<span class="bb-dd-region">' + (availableEspecias[a].stockPala || 0) + 'g</span>';
      h += '</div>';
    }
    h += '</div></div>';
  }
  h += '</div>';

  var barColor = total === 100 ? '#4a8a3e' : (total > 100 ? '#a63d3d' : 'var(--gold)');
  h += '<div class="bb-total-section">';
  h += '<div class="bb-total-bar"><div class="bb-total-fill" style="width:' + Math.min(total, 100) + '%;background:' + barColor + '"></div></div>';
  h += '<div class="bb-total-text" style="color:' + barColor + '">' + (total > 100 ? 'Excedes el 100%' : 'Total: ' + total + '%') + '</div>';
  h += '</div>';

  h += '<div class="bb-footer">';
  h += '<div class="bb-price">$' + precio.toLocaleString() + '</div>';
  h += '<button class="bb-cart-btn' + (isComplete ? '' : ' disabled') + '" onclick="addCustomBlendToCart()"' + (isComplete ? '' : ' disabled') + '>Agregar al carrito</button>';
  h += '</div>';

  h += '</div>';

  container.innerHTML = h;

  if (activeId) {
    var el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (selStart !== null) el.setSelectionRange(selStart, selEnd);
    }
  }
}

function _bbSetTalla(talla) {
  _blendBuilderState.talla = talla;
  renderBlendBuilder();
}

function _bbToggleDropdown() {
  _blendBuilderState.showDropdown = !_blendBuilderState.showDropdown;
  renderBlendBuilder();
  if (_blendBuilderState.showDropdown) {
    var search = document.getElementById('bb-search');
    if (search) search.focus();
  }
}

function _bbFilterDropdown(query) {
  var items = document.querySelectorAll('.bb-dropdown-item');
  var q = query.toLowerCase();
  for (var i = 0; i < items.length; i++) {
    var name = items[i].getAttribute('data-name').toLowerCase();
    items[i].style.display = name.indexOf(q) >= 0 ? '' : 'none';
  }
}

function _bbAddSpice(nombre) {
  var total = _bbGetTotal();
  var remaining = 100 - total;
  var pct = Math.min(10, remaining);
  if (pct <= 0) { alert('Ya llegaste al 100%'); return; }
  _blendBuilderState.especias.push({ nombre: nombre, porcentaje: pct });
  _blendBuilderState.showDropdown = false;
  renderBlendBuilder();
}

function _bbRemoveSpice(idx) {
  _blendBuilderState.especias.splice(idx, 1);
  renderBlendBuilder();
}

function _bbChangePct(idx, delta) {
  var curr = _blendBuilderState.especias[idx].porcentaje;
  var othersTotal = _bbGetTotal() - curr;
  var newVal = curr + delta;
  if (newVal < 1) newVal = 1;
  if (othersTotal + newVal > 100) newVal = 100 - othersTotal;
  if (newVal < 1) newVal = 1;
  _blendBuilderState.especias[idx].porcentaje = newVal;
  renderBlendBuilder();
}

function _bbSetPctDirect(idx, val) {
  var num = parseInt(val, 10);
  if (isNaN(num) || num < 1) num = 1;
  var othersTotal = _bbGetTotal() - _blendBuilderState.especias[idx].porcentaje;
  if (othersTotal + num > 100) num = 100 - othersTotal;
  if (num < 1) num = 1;
  _blendBuilderState.especias[idx].porcentaje = num;
  renderBlendBuilder();
}

function _renderCartBlendDetail(blend) {
  var h = '<div class="cart-blend-specs">';
  h += '<div class="cart-blend-name">' + (blend.nombre || 'Blend personalizado') + '</div>';
  if (blend.especias) {
    for (var i = 0; i < blend.especias.length; i++) {
      h += '<span class="cart-blend-tag">' + blend.especias[i].nombre + ' ' + blend.especias[i].porcentaje + '%</span>';
    }
  }
  h += '</div>';
  return h;
}

function addCustomBlendToCart() {
  var nombreInput = document.getElementById('bb-name');
  var nombre = nombreInput ? nombreInput.value.trim() : _blendBuilderState.nombre.trim();
  if (!nombre) { alert('Dale un nombre a tu blend'); return; }
  var total = _bbGetTotal();
  if (total !== 100) { alert('El total debe ser 100%. Actualmente es ' + total + '%'); return; }
  if (_blendBuilderState.especias.length === 0) { alert('Agrega al menos una especia'); return; }
  var precio = _getCustomBlendPrice(_blendBuilderState.talla);
  var tallaLabel = _blendBuilderState.talla === 'grande' ? 'Grande' : 'Peque\u00f1o';
  var cartNombre = 'Blend: ' + nombre + ' (' + tallaLabel + ')';
  var customBlend = { nombre: nombre, talla: _blendBuilderState.talla, especias: [] };
  for (var i = 0; i < _blendBuilderState.especias.length; i++) {
    customBlend.especias.push({ nombre: _blendBuilderState.especias[i].nombre, porcentaje: _blendBuilderState.especias[i].porcentaje });
  }
  cart.push({
    productId: 'custom-blend-' + Date.now(),
    nombre: cartNombre,
    tipo: 'custom-blend',
    talla: _blendBuilderState.talla,
    precio: precio,
    qty: 1,
    customBlend: customBlend
  });
  saveCart();
  updateCartFab();
  _showCartToast('Blend ' + nombre + ' agregado');
  _blendBuilderState = { nombre: '', talla: 'chico', especias: [], showDropdown: false };
  renderBlendBuilder();
}

/* === ARCANO PRODUCT LINKER (recipes) === */
var _arcanoLinkData = null;

function _getArcanoLinkData() {
  if (_arcanoLinkData) return _arcanoLinkData;
  var products = getStoreProducts();
  var map = {};
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    if (p.nombre && (p.precioChico > 0 || p.precioGrande > 0)) map[p.nombre] = p.id;
  }
  var names = Object.keys(map);
  if (names.length === 0) { _arcanoLinkData = { regex: null, map: map }; return _arcanoLinkData; }
  names.sort(function(a, b) { return b.length - a.length; });
  var escaped = [];
  for (var i = 0; i < names.length; i++) {
    escaped.push(names[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  _arcanoLinkData = {
    regex: new RegExp('(^|[\\s,.:;!?])(' + escaped.join('|') + ')(?=[\\s,.:;!?]|$)', 'gi'),
    map: map
  };
  return _arcanoLinkData;
}

function _linkArcanoProducts(text) {
  var data = _getArcanoLinkData();
  if (!data.regex) return text;
  return text.replace(data.regex, function(full, before, name) {
    var pid = null;
    for (var k in data.map) {
      if (k.toLowerCase() === name.toLowerCase()) { pid = data.map[k]; break; }
    }
    if (!pid) return full;
    return before + '<span class=\'arcano-link\' onclick=\'event.stopPropagation();openDetail(' + pid + ')\'>' + name + '</span>';
  });
}

function renderRecetas() {
  var recetas = getRecetas();
  var filtered = [];
  for (var i = 0; i < recetas.length; i++) { if (recetas[i].categoria === _currentRecetaCat) filtered.push(recetas[i]); }
  var container = document.getElementById('sidebar-content');
  if (filtered.length === 0) { container.innerHTML = '<div class="sidebar-empty">Sin recetas a\u00fan</div>'; return; }
  var h = '';
  for (var i = 0; i < filtered.length; i++) {
    var r = filtered[i];
    var diffColor = r.dificultad === 'Facil' ? '#4a8a3e' : (r.dificultad === 'Dificil' ? '#a63d3d' : '#c4943a');
    h += '<div class="recipe-card-sb" onclick="openRecipeModal(\'' + r._key + '\')">' +
      '<div class="recipe-card-sb-header"><div>' +
      '<div class="recipe-card-sb-title">' + (r.titulo || 'Sin t\u00edtulo') + '</div>' +
      '<div class="recipe-card-sb-meta">' +
        '<span class="recipe-sb-diff" style="color:' + diffColor + '">' + (r.dificultad || '') + '</span>' +
        (r.tiempo ? ' \u00b7 ' + r.tiempo : '') + (r.porciones ? ' \u00b7 ' + r.porciones + ' porciones' : '') +
      '</div></div>' +
      '<div class="recipe-card-sb-arrow">\u203A</div></div>' +
      '</div>';
  }
  container.innerHTML = h;
}
function openRecipeModal(key) {
  var recetas = getRecetas();
  var r = null;
  for (var i = 0; i < recetas.length; i++) { if (recetas[i]._key === key) { r = recetas[i]; break; } }
  if (!r) return;

  var diffColor = r.dificultad === 'Facil' ? '#4a8a3e' : (r.dificultad === 'Dificil' ? '#a63d3d' : '#c4943a');
  var catIcon = r.categoria === 'Infusiones' ? '☕' : (r.categoria === 'Cocteleria' ? '🍸' : '🍳');

  var blendProd = null;
  var allProds = getStoreProducts();
  if (r.productos_usados && r.productos_usados.length > 0) {
    for (var b = 0; b < r.productos_usados.length; b++) {
      var bName = r.productos_usados[b];
      for (var pi = 0; pi < allProds.length; pi++) {
        if (allProds[pi].nombre && allProds[pi].nombre.toLowerCase() === bName.toLowerCase()) {
          if (allProds[pi].imagen) { blendProd = allProds[pi]; break; }
        }
      }
      if (blendProd) break;
    }
  }

  var ingredientesHtml = '';
  if (r.ingredientes && r.ingredientes.length) {
    ingredientesHtml = '<div class="rm-section"><div class="rm-label">Ingredientes</div><ul class="rm-ingredients">';
    for (var j = 0; j < r.ingredientes.length; j++) ingredientesHtml += '<li>' + _linkArcanoProducts(r.ingredientes[j]) + '</li>';
    ingredientesHtml += '</ul></div>';
  }

  var pasosHtml = '';
  if (r.pasos && r.pasos.length) {
    pasosHtml = '<div class="rm-section"><div class="rm-label">Preparaci\u00f3n</div><ol class="rm-steps">';
    for (var k = 0; k < r.pasos.length; k++) pasosHtml += '<li>' + _linkArcanoProducts(r.pasos[k]) + '</li>';
    pasosHtml += '</ol></div>';
  }

  var blendNamesHtml = '';
  if (r.productos_usados && r.productos_usados.length > 0) {
    var names = [];
    for (var b = 0; b < r.productos_usados.length; b++) {
      var bName = r.productos_usados[b];
      var bProd = null;
      for (var pi = 0; pi < allProds.length; pi++) {
        if (allProds[pi].nombre && allProds[pi].nombre.toLowerCase() === bName.toLowerCase()) { bProd = allProds[pi]; break; }
      }
      if (bProd && blendProd && bProd.id !== blendProd.id) {
        names.push('<span class="arcano-link" onclick="event.stopPropagation();openDetail(' + bProd.id + ')">' + bName + '</span>');
      } else if (!bProd) {
        names.push(bName);
      }
    }
    if (names.length > 0) {
      blendNamesHtml = '<div class="rm-extra-blends">' + names.join(' \u00b7 ') + '</div>';
    }
  }

  var overlay = document.createElement('div');
  overlay.className = 'detail-overlay';
  overlay.id = 'recipe-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var imgSide = '';
  if (blendProd) {
    imgSide = '<div class="recipe-modal-img" onclick="event.stopPropagation();openDetail(' + blendProd.id + ')"><img src="' + blendProd.imagen + '" alt="' + blendProd.nombre + '"></div>';
  }

  var contentClass = blendProd ? 'recipe-modal-content' : 'recipe-modal-body recipe-modal-full';
  var modalClass = blendProd ? 'recipe-modal recipe-modal-split' : 'recipe-modal recipe-modal-single';

  var html = '<div class="' + modalClass + '">' +
    '<button class="detail-close" onclick="document.getElementById(\'recipe-overlay\').remove()">&times;</button>' +
    imgSide +
    '<div class="' + contentClass + '">' +
      '<div class="rm-header">' +
        '<span class="rm-cat-badge">' + catIcon + ' ' + (r.categoria || '') + '</span>' +
        '<h2 class="rm-title">' + (r.titulo || 'Sin \u00edtulo') + '</h2>' +
        '<div class="rm-meta">' +
          '<span class="rm-diff" style="color:' + diffColor + '">' + (r.dificultad || '') + '</span>' +
          (r.tiempo ? '<span class="rm-meta-item">\u23f1 ' + r.tiempo + '</span>' : '') +
          (r.porciones ? '<span class="rm-meta-item">\ud83c\udf5a ' + r.porciones + '</span>' : '') +
        '</div>' +
      '</div>' +
      (r.descripcion ? '<p class="rm-desc">' + _linkArcanoProducts(r.descripcion) + '</p>' : '') +
      (blendProd ? '<div class="rm-blend-tag" onclick="event.stopPropagation();openDetail(' + blendProd.id + ')">' + blendProd.nombre + (blendProd.uso ? ' \u2014 ' + blendProd.uso : '') + '</div>' : '') +
      blendNamesHtml +
      ingredientesHtml +
      pasosHtml +
      '<button class="recipe-share-btn" onclick="compartirReceta(\'' + r._key + '\')">Compartir receta</button>' +
    '</div></div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}function toggleRecipe(key) {
  var card = document.getElementById('recipe-' + key);
  if (card) card.classList.toggle('expanded');
}
function renderSocialLinks() {
  var el = document.getElementById('sidebar-social');
  var h = '';
  for (var i = 0; i < _SOCIAL_LINKS.length; i++) {
    h += '<a href="' + _SOCIAL_LINKS[i].url + '" class="social-link" target="_blank" title="' + _SOCIAL_LINKS[i].name + '">' + _SOCIAL_LINKS[i].svg + '</a>';
  }
  el.innerHTML = h;
}
function renderSidebarLogo() {
  var el = document.getElementById('sidebar-brand');
  if (!el) return;
  var cfg = getTiendaConfig();
  var logo = cfg.logoPago || '';
  if (logo) {
    el.innerHTML = '<img src="' + logo + '" alt="Formas de pago" class="pago-logo-img">';
  } else {
    var headerImg = document.querySelector('.store-logo img');
    if (headerImg) {
      el.innerHTML = '<img src="' + headerImg.src + '" alt="Arcano">';
    }
  }
}
function compartirReceta(key) {
  var recetas = getRecetas();
  var receta = null;
  for (var i = 0; i < recetas.length; i++) { if (recetas[i]._key === key) { receta = recetas[i]; break; } }
  if (!receta) return;
  var text = '🍳 ' + (receta.titulo || 'Receta Arcano') + '\n';
  text += (receta.tiempo || '') + (receta.porciones ? ' \u00b7 ' + receta.porciones : '') + '\n\n';
  if (receta.ingredientes && receta.ingredientes.length) {
    text += 'Ingredientes:\n';
    for (var i = 0; i < receta.ingredientes.length; i++) text += '\u2022 ' + receta.ingredientes[i] + '\n';
    text += '\n';
  }
  if (receta.pasos && receta.pasos.length) {
    text += 'Preparaci\u00f3n:\n';
    for (var j = 0; j < receta.pasos.length; j++) text += (j + 1) + '. ' + receta.pasos[j] + '\n';
  }
  text += '\n\u2728 Arcano Especias';
  if (navigator.share) {
    navigator.share({ title: receta.titulo, text: text }).catch(function() {});
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1b0b07;color:#e8b84b;padding:10px 20px;border-radius:8px;border:1px solid #e8b84b;font-size:0.85rem;font-weight:600;z-index:10000;box-shadow:0 4px 20px rgba(232,184,75,0.3)';
    toast.textContent = 'Receta copiada al portapapeles';
    document.body.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 2000);
  }
}
/* === INIT === */
var currentFilter = 'Todos';
document.addEventListener('DOMContentLoaded', function() {
  // Lock portrait orientation on mobile
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(function() {});
  }
  initTienda().then(function() {
    renderProducts('Todos');
    updateCartFab();
    onRecetasReady(function() { renderRecetas(); });
    initRecetas();
    renderSidebarLogo();
    onTiendaChange(function() {
      renderSidebarLogo();
      if (!hasVisiblePacks()) {
        var packBtn = document.querySelector('.filter-btn[data-cat="Packs"]');
        if (packBtn) packBtn.style.display = 'none';
      } else {
        var packBtn = document.querySelector('.filter-btn[data-cat="Packs"]');
        if (packBtn) packBtn.style.display = '';
      }
    });
    renderSocialLinks();
    if (!hasVisiblePacks()) {
      var packBtn = document.querySelector('.filter-btn[data-cat="Packs"]');
      if (packBtn) packBtn.style.display = 'none';
    }
  });

  document.getElementById('filters').addEventListener('click', function(e) {
    var btn = e.target.closest('.filter-btn');
    if (!btn) return;
    currentFilter = btn.dataset.cat;
    var allBtns = document.querySelectorAll('.filter-btn');
    for (var i = 0; i < allBtns.length; i++) allBtns[i].classList.remove('active');
    btn.classList.add('active');
    renderProducts(currentFilter);
  });
});

