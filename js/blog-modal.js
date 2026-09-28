/* ===================== BLOG MODAL — Arcano Especias =====================
   Muestra una card de producto cuando el usuario hace hover o click en
   un link a /blends/<slug>/ dentro de artículos del blog.
   Permite: seleccionar tamaño, agregar al carrito y continuar leyendo.
   SEO safe: el <a href> sigue apuntando a /blends/<slug>/ (Google lo sigue).
   ========================================================================= */

(function() {
  // === Slugify helper ===
  function slugify(name) {
    if (!name) return '';
    var repl = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n'};
    var s = String(name).toLowerCase().trim();
    for (var k in repl) { s = s.replace(new RegExp(k, 'g'), repl[k]); }
    s = s.replace('&', '-');
    s = s.replace(/[^a-z0-9\s-]/g, '');
    s = s.replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
    return s;
  }

  var _modalBlendData = null;
  var _selectedTalla = 'chico';
  var _hoverTimer = null;

  // === CSS del modal (inyectado dinámicamente) ===
  var css = `
#blend-modal-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);z-index:99999;align-items:center;justify-content:center;padding:20px}
#blend-modal-overlay.active{display:flex}
@keyframes blendModalIn{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
#blend-modal-card{background:#1b0b07;border:1px solid #c9a84c;border-radius:16px;max-width:440px;width:100%;overflow:hidden;box-shadow:0 16px 64px rgba(0,0,0,.6);animation:blendModalIn .3s ease}
#blend-modal-img-wrap{position:relative;height:240px;overflow:hidden;background:#2d1a10}
#blend-modal-img{width:100%;height:100%;object-fit:cover}
#blend-modal-close{position:absolute;top:12px;right:12px;background:rgba(0,0,0,.7);color:#f0e6d3;border:none;width:36px;height:36px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}
#blend-modal-close:hover{background:rgba(0,0,0,.9)}
#blend-modal-body{padding:24px}
#blend-modal-category{color:#a08b6e;font-size:.75rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
#blend-modal-name{color:#c9a84c;font-size:1.5rem;font-weight:800;margin-bottom:8px;line-height:1.3}
#blend-modal-desc{color:#e8dcc4;font-size:.9rem;margin-bottom:20px;line-height:1.6}
#blend-modal-sizes{display:flex;gap:10px;margin-bottom:20px}
.blend-modal-size-btn{flex:1;background:#2d1a10;border:1px solid #3a2a1e;border-radius:10px;padding:14px;text-align:center;cursor:pointer;transition:all .2s}
.blend-modal-size-btn:hover{border-color:#c9a84c}
.blend-modal-size-btn.selected{border-color:#c9a84c;background:rgba(201,168,76,.1)}
.blend-modal-size-label{color:#a08b6e;font-size:.7rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.blend-modal-size-btn.selected .blend-modal-size-label{color:#c9a84c}
.blend-modal-size-price{color:#c9a84c;font-size:1.2rem;font-weight:700}
.blend-modal-size-stock{font-size:.7rem;margin-top:4px}
.blend-modal-size-instock{color:#4ade80}
.blend-modal-size-outstock{color:#f87171}
#blend-modal-actions{display:flex;gap:12px}
#blend-modal-add-cart{flex:1;background:#c9a84c;color:#1b0b07;border:none;padding:14px;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;transition:background .2s}
#blend-modal-add-cart:hover{background:#e8b84b}
#blend-modal-add-cart:disabled{background:#4a3a2e;color:#6b5a42;cursor:not-allowed}
#blend-modal-store-link{flex:1;background:transparent;color:#c9a84c;border:1px solid #c9a84c;padding:14px;border-radius:8px;font-weight:600;font-size:.95rem;text-decoration:none;text-align:center;transition:all .2s;display:flex;align-items:center;justify-content:center}
#blend-modal-store-link:hover{background:rgba(201,168,76,.1)}
@media(max-width:500px){#blend-modal-card{max-width:100%}#blend-modal-img-wrap{height:200px}}
  `;

  // === HTML del modal (inyectado dinámicamente) ===
  var modalHTML = `
<div id="blend-modal-overlay" onclick="if(event.target===this)window.BlogModal.close()">
  <div id="blend-modal-card">
    <div id="blend-modal-img-wrap">
      <img id="blend-modal-img" src="" alt="">
      <button id="blend-modal-close" onclick="window.BlogModal.close()">&times;</button>
    </div>
    <div id="blend-modal-body">
      <div id="blend-modal-category"></div>
      <h3 id="blend-modal-name"></h3>
      <p id="blend-modal-desc"></p>
      <div id="blend-modal-sizes"></div>
      <div id="blend-modal-actions">
        <button id="blend-modal-add-cart" onclick="window.BlogModal.addToCart()">Agregar al carrito 🛒</button>
        <a id="blend-modal-store-link" href="#">Ver en la tienda →</a>
      </div>
    </div>
  </div>
</div>`;

  // === API pública ===
  window.BlogModal = {
    init: function() {
      // Inyectar CSS
      if (!document.getElementById('blog-modal-css')) {
        var style = document.createElement('style');
        style.id = 'blog-modal-css';
        style.textContent = css;
        document.head.appendChild(style);
      }
      // Inyectar HTML del modal
      if (!document.getElementById('blend-modal-overlay')) {
        var div = document.createElement('div');
        div.innerHTML = modalHTML;
        document.body.appendChild(div.firstElementChild);
      }
      // Esperar a que tienda-data.js cargue
      var self = this;
      var checkTienda = setInterval(function() {
        if (typeof getStoreProducts === 'function' && typeof initTienda === 'function') {
          clearInterval(checkTienda);
          initTienda().then(function() {
            self.interceptLinks();
          }).catch(function() {
            self.interceptLinks();
          });
        }
      }, 500);
      setTimeout(function() { clearInterval(checkTienda); }, 10000);

      // Cerrar con ESC
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') self.close();
      });
    },

    interceptLinks: function() {
      var self = this;
      var links = document.querySelectorAll('.content a[href*="/blends/"]');
      links.forEach(function(link) {
        var href = link.getAttribute('href');
        if (href.indexOf('/blends-para/') >= 0) return;
        if (link.classList.contains('cta-btn')) return;
        if (link.classList.contains('back')) return;

        // Click → abrir modal
        link.addEventListener('click', function(e) {
          e.preventDefault();
          var slug = href.split('/blends/')[1].replace(/\/$/, '').replace(/\.html$/, '');
          self.show(slug, href);
        });

        // Hover → abrir modal después de 500ms
        link.addEventListener('mouseenter', function() {
          _hoverTimer = setTimeout(function() {
            var slug = href.split('/blends/')[1].replace(/\/$/, '').replace(/\.html$/, '');
            self.show(slug, href);
          }, 500);
        });
        link.addEventListener('mouseleave', function() {
          if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
        });
      });
    },

    show: function(slug, fallbackUrl) {
      var products = (typeof getStoreProducts === 'function') ? getStoreProducts() : [];
      var blend = null;
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        if (!p || !p.nombre) continue;
        if (slugify(p.nombre) === slug || String(p.id) === slug) {
          blend = p;
          break;
        }
      }
      if (!blend) {
        window.open(fallbackUrl, '_self');
        return;
      }
      _modalBlendData = blend;
      _selectedTalla = (blend.stockChico > 0) ? 'chico' : 'grande';

      // Imagen
      var img = document.getElementById('blend-modal-img');
      var imgSrc = blend.imagen || 'https://arcanoespecias.com/icons/logo.png';
      if (imgSrc.indexOf('data:image') === 0 || imgSrc.indexOf('http') === 0) {
        img.src = imgSrc;
      } else {
        img.src = 'https://arcanoespecias.com/icons/logo.png';
      }
      img.alt = blend.nombre || '';

      // Datos
      document.getElementById('blend-modal-name').textContent = blend.nombre || '';
      document.getElementById('blend-modal-category').textContent = (blend.categoria || '') + (blend.region ? ' · ' + blend.region : '');
      document.getElementById('blend-modal-desc').textContent = (blend.descripcion || '').substring(0, 160);

      // Sizes
      var sizesHtml = '';
      if (blend.tipo === 'pack') {
        var packStock = blend.stock || 0;
        sizesHtml = '<div class="blend-modal-size-btn selected" data-talla="pack" data-precio="' + (blend.precio || 0) + '">';
        sizesHtml += '<div class="blend-modal-size-label">Pack</div>';
        sizesHtml += '<div class="blend-modal-size-price">$' + (blend.precio || 0).toLocaleString('es-CO') + '</div>';
        sizesHtml += '<div class="blend-modal-size-' + (packStock > 0 ? 'instock' : 'outstock') + '">' + (packStock > 0 ? packStock + ' disponibles' : 'Agotado') + '</div>';
        sizesHtml += '</div>';
        _selectedTalla = 'pack';
      } else {
        // Frasco pequeño
        var pc = blend.precioChico || 0;
        var sc = blend.stockChico || 0;
        sizesHtml += '<div class="blend-modal-size-btn ' + (sc > 0 ? 'selected' : '') + '" data-talla="chico" data-precio="' + pc + '" style="' + (sc <= 0 ? 'opacity:.5;cursor:not-allowed' : '') + '">';
        sizesHtml += '<div class="blend-modal-size-label">Frasco pequeño</div>';
        sizesHtml += '<div class="blend-modal-size-price">$' + pc.toLocaleString('es-CO') + '</div>';
        sizesHtml += '<div class="blend-modal-size-' + (sc > 0 ? 'instock' : 'outstock') + '">' + (sc > 0 ? sc + ' disponibles' : 'Agotado') + '</div>';
        sizesHtml += '</div>';
        // Frasco grande
        var pg = blend.precioGrande || 0;
        var sg = blend.stockGrande || 0;
        if (pg > 0) {
          sizesHtml += '<div class="blend-modal-size-btn ' + (sc <= 0 && sg > 0 ? 'selected' : '') + '" data-talla="grande" data-precio="' + pg + '" style="' + (sg <= 0 ? 'opacity:.5;cursor:not-allowed' : '') + '">';
          sizesHtml += '<div class="blend-modal-size-label">Frasco grande</div>';
          sizesHtml += '<div class="blend-modal-size-price">$' + pg.toLocaleString('es-CO') + '</div>';
          sizesHtml += '<div class="blend-modal-size-' + (sg > 0 ? 'instock' : 'outstock') + '">' + (sg > 0 ? sg + ' disponibles' : 'Agotado') + '</div>';
          sizesHtml += '</div>';
        }
        _selectedTalla = (sc > 0) ? 'chico' : 'grande';
      }
      document.getElementById('blend-modal-sizes').innerHTML = sizesHtml;

      // Click en size buttons
      var sizeBtns = document.querySelectorAll('.blend-modal-size-btn');
      sizeBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var talla = this.getAttribute('data-talla');
          var precio = Number(this.getAttribute('data-precio'));
          // Verificar stock
          var stock = 0;
          if (talla === 'chico') stock = blend.stockChico || 0;
          else if (talla === 'grande') stock = blend.stockGrande || 0;
          else if (talla === 'pack') stock = blend.stock || 0;
          if (stock <= 0) return; // no seleccionar si no hay stock
          // Seleccionar
          sizeBtns.forEach(function(b) { b.classList.remove('selected'); });
          this.classList.add('selected');
          _selectedTalla = talla;
        });
      });

      // Link a tienda
      document.getElementById('blend-modal-store-link').href = 'https://arcanoespecias.com/?producto=' + slug;

      // Mostrar
      var overlay = document.getElementById('blend-modal-overlay');
      overlay.style.display = 'flex';
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    },

    close: function() {
      var overlay = document.getElementById('blend-modal-overlay');
      if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('active');
      }
      document.body.style.overflow = '';
      _modalBlendData = null;
    },

    addToCart: function() {
      if (!_modalBlendData) return;
      var blend = _modalBlendData;
      var talla = _selectedTalla;
      var precio = 0;
      if (talla === 'chico') precio = blend.precioChico || 0;
      else if (talla === 'grande') precio = blend.precioGrande || 0;
      else if (talla === 'pack') precio = blend.precio || 0;
      if (precio <= 0) return;

      var cart = JSON.parse(localStorage.getItem('arcano_cart') || '[]');
      var found = false;
      for (var i = 0; i < cart.length; i++) {
        if (cart[i].productId === blend.id && cart[i].talla === talla) {
          cart[i].qty++;
          found = true;
          break;
        }
      }
      if (!found) {
        cart.push({
          productId: blend.id,
          nombre: blend.nombre,
          tipo: blend.tipo || 'blend',
          talla: talla,
          precio: precio,
          qty: 1
        });
      }
      localStorage.setItem('arcano_cart', JSON.stringify(cart));

      // Feedback visual
      var btn = document.getElementById('blend-modal-add-cart');
      btn.textContent = '✓ Agregado! (' + cart.length + ' en carrito)';
      btn.style.background = '#4ade80';
      setTimeout(function() {
        btn.textContent = 'Agregar al carrito 🛒';
        btn.style.background = '#c9a84c';
        window.BlogModal.close();
      }, 1200);
    }
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { window.BlogModal.init(); });
  } else {
    window.BlogModal.init();
  }
})();
