/* ============================================================
   Arcano — Generador de páginas SEO (JavaScript)
   Puerto del script Python scripts/seo/generate_seo_pages.py
   Corre 100% en el navegador del admin.
   ============================================================ */

var ArcanoSEO = (function() {

  var BASE_URL = 'https://arcanoespecias.com';

  /* === Slug rules === */
  function slugify(name) {
    if (!name) return '';
    var s = String(name).toLowerCase().trim();
    var replacements = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n',
                        'Á':'a','É':'e','Í':'i','Ó':'o','Ú':'u','Ü':'u','Ñ':'n'};
    for (var k in replacements) if (replacements.hasOwnProperty(k)) s = s.replace(k, replacements[k]);
    s = s.replace('&', '-');
    s = s.replace(/[^a-z0-9\s-]/g, '');
    s = s.replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
    return s;
  }

  /* === Heurísticas para categorías SEO === */
  var HEURISTICS = {
    'carnes': ['asado','parrilla','bbq','barbacoa','chimichurri','gaucho',
               'patagon','costela','brase','inca grill','korean','balkan',
               'bavarian','tandoori','tokyo','andean fire','cajun','berbere',
               'baharat','ras el hanout','smokehouse','bourbon','sichuan',
               'carne','res','cerdo','lomo','costilla','chorizo','parrill',
               'shawarma','taco','fajita','mole','montreal','pekín','pekin',
               'seoul','polish','memphis','toscana','merquén','merquen','mapuche'],
    'pollo': ['pollo','piri piri','tandoori','adobo'],
    'pescados-mariscos': ['pescado','marisco','ceviche','camaron','atun','salmon',
                          'caribe costeno','caribe costeño','za\'atar','zaatar','pimienta sichuan',
                          'nordic fish','portuguese seafood','mediterranean citrus'],
    'guisos': ['garam masala','curry','baharat','ras el hanout','adobo criollo',
               'sabor paisa','achiote','italiano','herbes de provence',
               'adobo colombiano','guiso','estofado','sopa','crema'],
    'infusiones': ['chai','dulces suenos','dulces sueños','noche serena','noche azul',
                   'energia andina','golden wellness','respirar','amazonia verde',
                   'sobremesa','manzanilla','toronjil','lavanda','eucalipto','infusion',
                   'mistica oriental','invierno nordico','nordico'],
    'cocteleria': ['gin','moscow mule','mojito','rum','whisky','vermu','vermu botanico',
                   'arcano signature','coctel','cocteleria','tragos','manzana ginger'],
    'arroces-pastas': ['italiano','pizza','pasta','risotto','arroz','paella','baharat'],
    'adobos-marinadas': ['adobo','marinada','sazon','rub','marinado']
  };

  var CATEGORIA_LABELS = {
    'carnes': 'Comprar Especias para Carnes y Asados',
    'pollo': 'Comprar Especias para Pollo',
    'pescados-mariscos': 'Comprar Especias para Pescados y Mariscos',
    'guisos': 'Comprar Especias para Guisos y Estofados',
    'infusiones': 'Comprar Infusiones Artesanales y Tés',
    'cocteleria': 'Comprar Botánicos para Coctelería',
    'arroces-pastas': 'Comprar Especias para Arroces y Pastas',
    'adobos-marinadas': 'Comprar Adobos y Marinadas Artesanales'
  };

  var CATEGORIA_INTROS = {
    'carnes': 'Descubre nuestra selección de especias artesanales para carnes y asados en Colombia. Sazonadores sin conservantes para parrilla, cortes premium y preparaciones a fuego lento. Compra online con envíos a todo el país y transforma cada corte en una experiencia gastronómica memorable. Ingredientes 100% naturales seleccionados de cada rincón del mundo.',
    'pollo': 'Especias artesanales para pollo sin conservantes. Marinados y adobos que penetran y realzan el sabor natural sin enmascararlo. Compra online en Colombia con envíos a todo el país. Mezclas pensadas para asados, grill y preparaciones de cocción lenta que elevan cada bocado.',
    'pescados-mariscos': 'Mezclas de especias artesanales para pescados, mariscos y ceviches. Notas cítricas y herbales que complementan sin dominar. Sin conservantes, ingredientes 100% naturales. Compra online en Colombia con envío a toda el país. Sazonadores gourmet para pescado al horno, a la plancha o crudo.',
    'guisos': 'Especias para guisos, estofados, sopas y preparaciones de cocción lenta. Mezclas artesanales que aportan profundidad, calidez y complejidad aromática. Sin conservantes, 100% naturales. Compra online en Colombia con envíos a todo el país. Sazonadores gourmet para elevar tus recetas tradicionales.',
    'infusiones': 'Infusiones artesanales y tés de especias para momentos de descanso y bienestar. Hierbas, flores y especias seleccionadas a mano, sin conservantes. Compra online en Colombia con envíos a todo el país. Mezclas relajantes, digestivas y energizantes que transforman tu rutina diaria.',
    'cocteleria': 'Botánicos para coctelería de autor. Mezclas artesanales para infundir ginebra, whisky, ron y crear cócteles únicos. Sin conservantes, ingredientes 100% naturales. Compra online en Colombia con envío a todo el país. Eleva tus tragos con especias seleccionadas de cada rincón del mundo.',
    'arroces-pastas': 'Especias artesanales para arroces, pastas, risottos y preparaciones mediterráneas. Mezclas que aportan carácter sin dominar el plato. Sin conservantes, ingredientes 100% naturales. Compra online en Colombia con envíos a todo el país. Sazonadores gourmet para la cocina de todos los días.',
    'adobos-marinadas': 'Adobos y marinadas artesanales sin conservantes. Sazonadores que penetran y realzan el sabor natural de carnes, pollo y pescados. Compra online en Colombia con envíos a todo el país. Mezclas 100% naturales listas para transformar tus preparaciones culinarias.'
  };

  function deriveCategoriasSEO(blend) {
    var cats = {};
    var uso = blend.uso || '';
    if (typeof uso === 'string' && uso.trim()) {
      var usos = uso.split(',').map(function(u){return u.trim();}).filter(function(u){return u;});
      for (var i = 0; i < usos.length; i++) {
        var u = usos[i].toLowerCase();
        if (u.indexOf('carne') >= 0 && u.indexOf('pescado') < 0) cats['carnes'] = true;
        if (u.indexOf('pollo') >= 0) cats['pollo'] = true;
        if (u.indexOf('pescado') >= 0 || u.indexOf('marisco') >= 0) cats['pescados-mariscos'] = true;
        if (u.indexOf('guiso') >= 0 || u.indexOf('estofado') >= 0) cats['guisos'] = true;
        if (u.indexOf('sopa') >= 0 || u.indexOf('crema') >= 0) cats['guisos'] = true;
        if (u.indexOf('adobo') >= 0 || u.indexOf('marinada') >= 0) cats['adobos-marinadas'] = true;
        if (u.indexOf('arroces') >= 0) cats['arroces-pastas'] = true;
        if (u.indexOf('pasta') >= 0) cats['arroces-pastas'] = true;
        if (u.indexOf('ensalada') >= 0) cats['guisos'] = true;
        if (u.indexOf('salsa') >= 0) cats['adobos-marinadas'] = true;
        if (u.indexOf('taco') >= 0 || u.indexOf('burrito') >= 0) cats['carnes'] = true;
        if (u.indexOf('hamburguesa') >= 0) cats['carnes'] = true;
        if (u.indexOf('pizza') >= 0) cats['arroces-pastas'] = true;
        if (u.indexOf('curry') >= 0) cats['guisos'] = true;
        if (u.indexOf('ceviche') >= 0) cats['pescados-mariscos'] = true;
        if (u.indexOf('postre') >= 0) cats['infusiones'] = true;
        if (u.indexOf('bebida') >= 0) cats['cocteleria'] = true;
        if (u.indexOf('panaderia') >= 0) cats['arroces-pastas'] = true;
        if (u.indexOf('vegetal') >= 0) cats['guisos'] = true;
      }
    }
    var nombre = (blend.nombre || '').toLowerCase();
    var descripcion = (blend.descripcion || '').toLowerCase();
    var texto = nombre + ' ' + descripcion;
    var categoriaPrincipal = (blend.categoria || '').toLowerCase();
    if (categoriaPrincipal.indexOf('infusion') >= 0 || categoriaPrincipal.indexOf('te') >= 0) cats['infusiones'] = true;
    if (categoriaPrincipal.indexOf('coctel') >= 0) cats['cocteleria'] = true;
    for (var cat in HEURISTICS) if (HEURISTICS.hasOwnProperty(cat)) {
      var kws = HEURISTICS[cat];
      for (var j = 0; j < kws.length; j++) {
        if (texto.indexOf(kws[j]) >= 0) { cats[cat] = true; break; }
      }
    }
    var catArr = Object.keys(cats);
    if (catArr.length === 0) {
      if (categoriaPrincipal.indexOf('infusion') >= 0) catArr = ['infusiones'];
      else if (categoriaPrincipal.indexOf('coctel') >= 0) catArr = ['cocteleria'];
      else catArr = ['carnes'];
    }
    return catArr.sort();
  }

  /* === Helpers === */
  function esc(s) {
    if (s === null || s === undefined) return '';
    s = String(s);
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function cleanDesc(s) {
    if (!s) return '';
    s = String(s).trim();
    while (s.charAt(0) === '"' && s.charAt(s.length-1) === '"' && s.length > 1) {
      s = s.substring(1, s.length-1).trim();
    }
    s = s.replace(/\\"/g, '"');
    return s;
  }

  function fixImageUrl(url) {
    if (!url) return BASE_URL + '/icons/logo.png';
    if (url.indexOf('arcanoespecias.github.io') >= 0) {
      url = url.replace('arcanoespecias.github.io', 'arcanoespecias.com');
    }
    return url;
  }

  /* Disponibilidad dinámica basada en stock real.
   * Google Merchant Center RECHAZA feeds que marcan productos sin stock como 'in stock'. */
  function isBlendInStock(b) {
    return (Number(b.stockChico) || 0) > 0 || (Number(b.stockGrande) || 0) > 0;
  }
  function availabilitySchema(b) {
    return isBlendInStock(b) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
  }
  function availabilityGmc(b) {
    return isBlendInStock(b) ? 'in stock' : 'out of stock';
  }

  /* Verifica si el producto tiene imagen real (no logo.png, no vacío).
   * Productos sin imagen real deben excluirse de Google Shopping. */
  function hasRealImage(b) {
    var img = b.imagen || '';
    if (!img) return false;
    if (img.indexOf('logo.png') >= 0) return false;
    if (img.indexOf('data:image') === 0) return true;  // base64 es válido
    return true;
  }

  function formatCOP(n) {
    n = Number(n) || 0;
    return '$' + n.toLocaleString('es-CO');
  }

  /* === Generar página de producto /blends/<slug>/index.html === */
  function blendPageHtml(blend, especiasById, allProducts) {
    var slug = blend._slug || slugify(blend.nombre);
    var nombre = blend.nombre || '';
    var descripcion = cleanDesc(blend.descripcion);
    var categoria = blend.categoria || '';
    var region = blend.region || '';
    var precioChico = Number(blend.precioChico) || 0;
    var precioGrande = Number(blend.precioGrande) || 0;
    var imagen = fixImageUrl(blend.imagen);
    var ingredientes = blend.ingredientes || [];
    var catsSEO = blend._categoriasSEO || [];

    var urlCanonical = BASE_URL + '/blends/' + slug + '/';
    var urlImagen = imagen;

    // Title variado según categoría (no todos dicen "Blend de Especias")
    var catLower = (categoria || '').toLowerCase();
    var titleSuffix;
    if (catLower.indexOf('coctel') >= 0) {
      titleSuffix = 'Botánicos para Coctelería';
    } else if (catLower.indexOf('infusion') >= 0) {
      titleSuffix = 'Infusión Artesanal';
    } else if (catLower.indexOf('comida') >= 0) {
      titleSuffix = 'Sazonador Artesanal';
    } else {
      titleSuffix = 'Mezcla de Especias';
    }
    var title = nombre + ' | ' + titleSuffix + ' | Arcano Colombia';
    var metaDesc = descripcion;
    if (metaDesc.length > 155) {
      metaDesc = metaDesc.substring(0, 155);
      var lastSpace = metaDesc.lastIndexOf(' ');
      if (lastSpace > 100) metaDesc = metaDesc.substring(0, lastSpace);
      metaDesc = metaDesc.replace(/[,\s]+$/, '') + '...';
    }
    if (!metaDesc) metaDesc = nombre + ' — mezcla de especias artesanal sin conservantes. Compra online con envíos a toda Colombia.';

    var h1 = nombre;
    var breadcrumbs = [
      ['Inicio', BASE_URL + '/'],
      ['Blends', BASE_URL + '/'],
      [nombre, urlCanonical]
    ];

    // JSON-LD Product
    var productJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: nombre,
      description: descripcion || metaDesc,
      image: urlImagen,
      sku: String(blend.id),
      mpn: String(blend.id),
      brand: {'@type':'Brand', name:'Arcano Especias'},
      category: categoria,
      offers: {
        '@type': 'Offer',
        url: urlCanonical,
        priceCurrency: 'COP',
        price: String(precioChico),
        availability: availabilitySchema(blend),
        itemCondition: 'https://schema.org/NewCondition'
      }
    };
    if (precioGrande > 0) {
      productJsonLd.offers.priceSpecification = [
        {'@type':'UnitPriceSpecification', price:String(precioChico), name:'Frasco pequeño'},
        {'@type':'UnitPriceSpecification', price:String(precioGrande), name:'Frasco grande'}
      ];
    }
    if (region) productJsonLd.brand.description = 'Origen: ' + region;

    // JSON-LD BreadcrumbList
    var bcJsonLd = {'@context':'https://schema.org','@type':'BreadcrumbList', itemListElement: []};
    for (var i = 0; i < breadcrumbs.length; i++) {
      bcJsonLd.itemListElement.push({
        '@type':'ListItem', position:i+1, name:breadcrumbs[i][0], item:breadcrumbs[i][1]
      });
    }

    // Productos relacionados
    var relacionados = [];
    for (var j = 0; j < allProducts.length && relacionados.length < 4; j++) {
      var b = allProducts[j];
      if (b.id === blend.id) continue;
      if ((b.categoria || '') === (blend.categoria || '')) relacionados.push(b);
    }

    // Construir HTML
    var html = [];
    html.push('<!DOCTYPE html><html lang="es"><head>');
    html.push('<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">');
    html.push('<title>' + esc(title) + '</title>');
    html.push('<meta name="description" content="' + esc(metaDesc) + '">');
    html.push('<link rel="canonical" href="' + esc(urlCanonical) + '">');
    html.push('<meta property="og:type" content="product">');
    html.push('<meta property="og:title" content="' + esc(nombre) + ' | Arcano Especias">');
    html.push('<meta property="og:description" content="' + esc(metaDesc) + '">');
    html.push('<meta property="og:url" content="' + esc(urlCanonical) + '">');
    html.push('<meta property="og:image" content="' + esc(urlImagen) + '">');
    html.push('<meta property="og:locale" content="es_CO">');
    html.push('<meta property="og:site_name" content="Arcano Especias">');
    html.push('<meta name="twitter:card" content="summary_large_image">');
    html.push('<meta name="twitter:title" content="' + esc(nombre) + ' | Arcano Especias">');
    html.push('<meta name="twitter:description" content="' + esc(metaDesc) + '">');
    html.push('<meta name="twitter:image" content="' + esc(urlImagen) + '">');
    html.push('<meta name="robots" content="index, follow, max-image-preview:large">');
    html.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    html.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    html.push('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">');
    html.push('<link rel="icon" type="image/png" href="' + BASE_URL + '/icons/favicon-32.png">');
    html.push('<style>');
    html.push('body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}');
    html.push('.c{max-width:760px;margin:0 auto;padding:24px 16px 48px}');
    html.push('a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}');
    html.push('.bc{font-size:.85rem;color:#a08b6e;margin-bottom:24px;padding:8px 0}');
    html.push('.bc a{color:#a08b6e}.bc a:hover{color:#c9a84c}.bc .sep{margin:0 8px;opacity:.5}');
    html.push('h1{font-size:2.2rem;color:#c9a84c;margin:0 0 8px;line-height:1.2}');
    html.push('.meta{color:#a08b6e;font-size:.9rem;margin-bottom:24px}.meta span{display:inline-block;margin-right:16px}');
    html.push('.hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}');
    html.push('@media(max-width:600px){.hero{grid-template-columns:1fr}}');
    html.push('img.h{width:100%;border-radius:12px;max-height:420px;object-fit:cover;box-shadow:0 8px 32px rgba(0,0,0,.4)}');
    html.push('.info{padding:8px 0}.desc{font-size:1.05rem;color:#e8dcc4;margin-bottom:24px}');
    html.push('.section{margin:32px 0;padding:20px;background:#2d1a10;border-radius:12px}');
    html.push('.section h2{color:#c9a84c;font-size:1.1rem;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em}');
    html.push('.section ul{margin:0;padding-left:20px;color:#e8dcc4}.section li{margin:4px 0}');
    html.push('.precio{background:linear-gradient(135deg,#2d1a10,#1b0b07);border:1px solid #c9a84c;border-radius:12px;padding:20px;margin:20px 0}');
    html.push('.precio .lab{color:#a08b6e;font-size:.8rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}');
    html.push('.precio .val{font-size:1.8rem;color:#c9a84c;font-weight:700}.precio .row{display:inline-block;margin-right:32px}');
    html.push('.cta{display:inline-block;background:#c9a84c;color:#1b0b07;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;margin-top:16px;transition:transform .2s}');
    html.push('.cta:hover{transform:translateY(-2px);text-decoration:none;background:#e8b84b}');
    html.push('.tags{margin:8px 0}.tag{display:inline-block;padding:4px 12px;border-radius:12px;font-size:.8rem;background:#2d1a10;border:1px solid #c9a84c;color:#c9a84c;margin:4px 4px 0 0;text-decoration:none}');
    html.push('.tag:hover{background:#c9a84c;color:#1b0b07;text-decoration:none}');
    html.push('.rel{margin-top:32px;padding-top:24px;border-top:1px solid #2d1a10}');
    html.push('.rel h2{color:#c9a84c;font-size:1.2rem;margin-bottom:16px}');
    html.push('.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}');
    html.push('.rel-card{display:block;background:#2d1a10;border-radius:8px;overflow:hidden;color:#f0e6d3;text-decoration:none;transition:transform .15s}');
    html.push('.rel-card:hover{transform:translateY(-3px);text-decoration:none}');
    html.push('.rel-card img{width:100%;height:90px;object-fit:cover}.rel-card .name{padding:8px 10px;font-size:.85rem;font-weight:600}');
    html.push('.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}');
    html.push('</style></head><body><div class="c">');

    // Breadcrumbs
    html.push('<nav class="bc">');
    for (var i = 0; i < breadcrumbs.length; i++) {
      if (i > 0) html.push('<span class="sep">›</span>');
      if (i < breadcrumbs.length - 1) {
        html.push('<a href="' + esc(breadcrumbs[i][1]) + '">' + esc(breadcrumbs[i][0]) + '</a>');
      } else {
        html.push('<span>' + esc(breadcrumbs[i][0]) + '</span>');
      }
    }
    html.push('</nav>');

    // Hero
    html.push('<div class="hero">');
    html.push('<img src="' + esc(urlImagen) + '" alt="Blend de especias ' + esc(nombre) + ' Arcano Especias" class="h" loading="eager" fetchpriority="high">');
    html.push('<div class="info">');
    html.push('<h1>' + esc(h1) + '</h1>');
    html.push('<div class="meta">');
    html.push('<span>Blend artesanal</span>');
    if (categoria) html.push('<span>' + esc(categoria) + '</span>');
    if (region) html.push('<span>Origen: ' + esc(region) + '</span>');
    html.push('</div>');
    if (descripcion) html.push('<p class="desc">' + esc(descripcion) + '</p>');
    html.push('</div></div>');

    // Tags de categorías SEO
    if (catsSEO.length) {
      html.push('<div class="tags">');
      for (var i = 0; i < catsSEO.length; i++) {
        var catLabel = CATEGORIA_LABELS[catsSEO[i]] || catsSEO[i];
        html.push('<a href="' + BASE_URL + '/blends-para/' + catsSEO[i] + '/" class="tag">' + esc(catLabel) + '</a>');
      }
      html.push('</div>');
    }

    // Ingredientes
    if (ingredientes.length) {
      html.push('<div class="section"><h2>Ingredientes</h2><ul>');
      for (var i = 0; i < ingredientes.length; i++) {
        var ing = ingredientes[i];
        var inombre = ing.especiaNombre || (especiasById[ing.especiaId] && especiasById[ing.especiaId].nombre) || '';
        if (inombre) html.push('<li>' + esc(inombre) + '</li>');
      }
      html.push('</ul></div>');
    }

    // Usos
    var uso = blend.uso || '';
    if (uso) {
      var usos = uso.split(',').map(function(u){return u.trim();}).filter(function(u){return u;});
      if (usos.length) {
        html.push('<div class="section"><h2>Ideal para</h2><ul>');
        for (var i = 0; i < usos.length; i++) {
          html.push('<li>' + esc(usos[i]) + '</li>');
        }
        html.push('</ul></div>');
      }
    }

    // Precio
    html.push('<div class="precio">');
    if (precioChico > 0) {
      html.push('<div class="row"><div class="lab">Frasco pequeño</div><div class="val">' + formatCOP(precioChico) + '</div></div>');
    }
    if (precioGrande > 0) {
      html.push('<div class="row"><div class="lab">Frasco grande</div><div class="val">' + formatCOP(precioGrande) + '</div></div>');
    }
    html.push('</div>');

    // CTA
    var tiendaUrl = BASE_URL + '/?producto=' + slug;
    html.push('<a href="' + esc(tiendaUrl) + '" class="cta">Comprar ' + esc(nombre) + ' →</a>');

    // Relacionados
    if (relacionados.length) {
      html.push('<div class="rel"><h2>Blends relacionados</h2><div class="rel-grid">');
      for (var i = 0; i < relacionados.length; i++) {
        var r = relacionados[i];
        var rSlug = r._slug || slugify(r.nombre);
        var rImg = fixImageUrl(r.imagen);
        html.push('<a href="' + BASE_URL + '/blends/' + rSlug + '/" class="rel-card">');
        html.push('<img src="' + esc(rImg) + '" alt="' + esc(r.nombre) + '" loading="lazy">');
        html.push('<div class="name">' + esc(r.nombre) + '</div></a>');
      }
      html.push('</div></div>');
    }

    // Footer
    html.push('<div class="footer">');
    html.push('<p><a href="' + BASE_URL + '/">← Volver a Arcano Especias</a></p>');
    html.push('<p style="margin-top:8px">Arcano Especias — Especias y Blends artesanales del mundo · Envíos a toda Colombia</p>');
    html.push('</div>');

    html.push('</div>');
    html.push('<script type="application/ld+json">' + JSON.stringify(productJsonLd) + '</script>');
    html.push('<script type="application/ld+json">' + JSON.stringify(bcJsonLd) + '</script>');
    html.push('</body></html>');

    return html.join('\n');
  }

  /* === Generar página de categoría /blends-para/<cat>/index.html === */
  function categoryPageHtml(catSlug, products, allProducts) {
    var label = CATEGORIA_LABELS[catSlug] || catSlug.replace(/-/g,' ').replace(/\b\w/g, function(c){return c.toUpperCase();});
    var intro = CATEGORIA_INTROS[catSlug] || 'Blends artesanales de Arcano Especias.';
    var urlCanonical = BASE_URL + '/blends-para/' + catSlug + '/';

    var breadcrumbs = [
      ['Inicio', BASE_URL + '/'],
      ['Blends para', BASE_URL + '/blends-para/'],
      [label, urlCanonical]
    ];

    var title = label + ' | Arcano Colombia';
    var metaDesc = intro;
    if (metaDesc.length > 155) {
      metaDesc = metaDesc.substring(0, 155);
      var ls = metaDesc.lastIndexOf(' ');
      if (ls > 100) metaDesc = metaDesc.substring(0, ls);
      metaDesc = metaDesc.replace(/[,\s]+$/, '') + '...';
    }
    if (intro.length < 130) metaDesc += ' Envíos a toda Colombia.';

    // JSON-LD ItemList
    var itemList = {'@context':'https://schema.org','@type':'ItemList', name:label, description:intro, numberOfItems:products.length, itemListElement: []};
    for (var i = 0; i < products.length; i++) {
      var b = products[i];
      var slug = b._slug || slugify(b.nombre);
      var precioChico = Number(b.precioChico) || 0;
      var precioGrande = Number(b.precioGrande) || 0;
      // Cada Product DEBE tener offers (Google requiere offers, review o aggregateRating)
      var productObj = {
        '@type': 'Product',
        name: b.nombre,
        url: BASE_URL + '/blends/' + slug + '/',
        image: fixImageUrl(b.imagen),
        brand: {'@type': 'Brand', name: 'Arcano Especias'}
      };
      // Agregar offers con precio si existe
      if (precioChico > 0 || precioGrande > 0) {
        productObj.offers = {
          '@type': 'Offer',
          priceCurrency: 'COP',
          price: String(precioChico > 0 ? precioChico : precioGrande),
          availability: availabilitySchema(b),
          url: BASE_URL + '/blends/' + slug + '/'
        };
      }
      itemList.itemListElement.push({
        '@type':'ListItem', position:i+1,
        item: productObj
      });
    }

    // BreadcrumbList
    var bcJsonLd = {'@context':'https://schema.org','@type':'BreadcrumbList', itemListElement: []};
    for (var i = 0; i < breadcrumbs.length; i++) {
      bcJsonLd.itemListElement.push({'@type':'ListItem', position:i+1, name:breadcrumbs[i][0], item:breadcrumbs[i][1]});
    }

    var html = [];
    html.push('<!DOCTYPE html><html lang="es"><head>');
    html.push('<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">');
    html.push('<title>' + esc(title) + '</title>');
    html.push('<meta name="description" content="' + esc(metaDesc) + '">');
    html.push('<link rel="canonical" href="' + esc(urlCanonical) + '">');
    html.push('<meta property="og:type" content="website">');
    html.push('<meta property="og:title" content="' + esc(title) + '">');
    html.push('<meta property="og:description" content="' + esc(metaDesc) + '">');
    html.push('<meta property="og:url" content="' + esc(urlCanonical) + '">');
    html.push('<meta property="og:image" content="' + BASE_URL + '/icons/arcano-logo.webp">');
    html.push('<meta property="og:locale" content="es_CO">');
    html.push('<meta property="og:site_name" content="Arcano Especias">');
    html.push('<meta name="robots" content="index, follow, max-image-preview:large">');
    html.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    html.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    html.push('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">');
    html.push('<link rel="icon" type="image/png" href="' + BASE_URL + '/icons/favicon-32.png">');
    html.push('<style>');
    html.push('body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}');
    html.push('.c{max-width:1100px;margin:0 auto;padding:24px 16px 48px}a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}');
    html.push('.bc{font-size:.85rem;color:#a08b6e;margin-bottom:24px}.bc a{color:#a08b6e}.bc a:hover{color:#c9a84c}.bc .sep{margin:0 8px;opacity:.5}');
    html.push('h1{font-size:2.2rem;color:#c9a84c;margin:0 0 12px;line-height:1.2}');
    html.push('.intro{font-size:1.05rem;color:#e8dcc4;margin-bottom:32px;max-width:680px}');
    html.push('.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}');
    html.push('.card{display:block;background:#2d1a10;border-radius:12px;overflow:hidden;color:#f0e6d3;text-decoration:none;transition:transform .15s}');
    html.push('.card:hover{transform:translateY(-3px);text-decoration:none;border-color:#c9a84c}');
    html.push('.card img{width:100%;height:180px;object-fit:cover}.card .info{padding:14px}.card .name{font-weight:700;font-size:1rem;margin-bottom:6px}');
    html.push('.card .meta{font-size:.8rem;color:#a08b6e}.card .precio{color:#c9a84c;font-weight:700;margin-top:6px}');
    html.push('.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}');
    html.push('</style></head><body><div class="c">');

    // Breadcrumbs
    html.push('<nav class="bc">');
    for (var i = 0; i < breadcrumbs.length; i++) {
      if (i > 0) html.push('<span class="sep">›</span>');
      if (i < breadcrumbs.length - 1) {
        html.push('<a href="' + esc(breadcrumbs[i][1]) + '">' + esc(breadcrumbs[i][0]) + '</a>');
      } else {
        html.push('<span>' + esc(breadcrumbs[i][0]) + '</span>');
      }
    }
    html.push('</nav>');

    html.push('<h1>' + esc(label) + '</h1>');
    html.push('<p class="intro">' + esc(intro) + '</p>');

    html.push('<div class="grid">');
    for (var i = 0; i < products.length; i++) {
      var b = products[i];
      var slug = b._slug || slugify(b.nombre);
      var nombre = b.nombre || '';
      var imagen = fixImageUrl(b.imagen);
      var precioChico = Number(b.precioChico) || 0;
      var categoria = b.categoria || '';

      html.push('<a href="' + BASE_URL + '/blends/' + slug + '/" class="card">');
      html.push('<img src="' + esc(imagen) + '" alt="Blend de especias ' + esc(nombre) + '" loading="lazy">');
      html.push('<div class="info">');
      html.push('<div class="name">' + esc(nombre) + '</div>');
      if (categoria) html.push('<div class="meta">' + esc(categoria) + '</div>');
      if (precioChico > 0) {
        html.push('<div class="precio">Desde ' + formatCOP(precioChico) + '</div>');
      }
      html.push('</div></a>');
    }
    html.push('</div>');

    html.push('<div class="footer">');
    html.push('<p><a href="' + BASE_URL + '/">← Volver a Arcano Especias</a> · <a href="' + BASE_URL + '/blends-para/">Ver todas las categorías</a></p>');
    html.push('<p style="margin-top:8px">Arcano Especias — Especias y Blends artesanales del mundo · Envíos a toda Colombia</p>');
    html.push('</div>');

    html.push('</div>');
    html.push('<script type="application/ld+json">' + JSON.stringify(itemList) + '</script>');
    html.push('<script type="application/ld+json">' + JSON.stringify(bcJsonLd) + '</script>');
    html.push('</body></html>');

    return html.join('\n');
  }

  /* === Página índice /blends-para/index.html === */
  function blendsParaIndexHtml(allCats) {
    var urlCanonical = BASE_URL + '/blends-para/';
    var title = 'Comprar Especias Artesanales según su Uso | Arcano Colombia';
    var metaDesc = 'Explora nuestros blends de especias según su uso: carnes, pollo, pescados, guisos, infusiones, coctelería y más. Envíos a toda Colombia.';

    var html = [];
    html.push('<!DOCTYPE html><html lang="es"><head>');
    html.push('<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">');
    html.push('<title>' + esc(title) + '</title>');
    html.push('<meta name="description" content="' + esc(metaDesc) + '">');
    html.push('<link rel="canonical" href="' + esc(urlCanonical) + '">');
    html.push('<meta property="og:type" content="website">');
    html.push('<meta property="og:title" content="' + esc(title) + '">');
    html.push('<meta property="og:description" content="' + esc(metaDesc) + '">');
    html.push('<meta property="og:url" content="' + esc(urlCanonical) + '">');
    html.push('<meta name="robots" content="index, follow, max-image-preview:large">');
    html.push('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">');
    html.push('<link rel="icon" type="image/png" href="' + BASE_URL + '/icons/favicon-32.png">');
    html.push('<style>');
    html.push('body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}');
    html.push('.c{max-width:1100px;margin:0 auto;padding:24px 16px 48px}a{color:#c9a84c;text-decoration:none}');
    html.push('.bc{font-size:.85rem;color:#a08b6e;margin-bottom:24px}h1{font-size:2.2rem;color:#c9a84c;margin:0 0 16px}');
    html.push('.intro{color:#e8dcc4;margin-bottom:32px;font-size:1.05rem;max-width:680px}');
    html.push('.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}');
    html.push('.card{display:block;background:#2d1a10;border-radius:12px;padding:20px;color:#f0e6d3;text-decoration:none;transition:transform .15s}');
    html.push('.card:hover{transform:translateY(-3px);text-decoration:none;border:1px solid #c9a84c}');
    html.push('.card h2{color:#c9a84c;font-size:1.2rem;margin:0 0 8px}.card p{color:#a08b6e;font-size:.9rem;margin:0}');
    html.push('.card .count{color:#c9a84c;font-weight:700;margin-top:8px;display:inline-block}');
    html.push('</style></head><body><div class="c">');
    html.push('<nav class="bc"><a href="' + BASE_URL + '/">Inicio</a> › <span>Blends para</span></nav>');
    html.push('<h1>Blends para cada uso</h1>');
    html.push('<p class="intro">Encontrá el blend perfecto según lo que vas a cocinar. Cada categoría agrupa mezclas pensadas para un uso específico.</p>');
    html.push('<div class="grid">');
    for (var i = 0; i < allCats.length; i++) {
      var cat = allCats[i];
      var label = CATEGORIA_LABELS[cat[0]] || cat[0];
      var intro = CATEGORIA_INTROS[cat[0]] || '';
      html.push('<a href="' + BASE_URL + '/blends-para/' + cat[0] + '/" class="card">');
      html.push('<h2>' + esc(label) + '</h2>');
      html.push('<p>' + esc(intro.substring(0, 100)) + '...</p>');
      html.push('<span class="count">' + cat[1] + ' blends →</span></a>');
    }
    html.push('</div>');
    html.push('<p style="margin-top:32px"><a href="' + BASE_URL + '/">← Volver a Arcano Especias</a></p>');
    html.push('</div></body></html>');
    return html.join('\n');
  }

  /* === Merchant feed XML === */
  function generateMerchantFeedXml(blends) {
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n<channel>\n';
    xml += '<title>Arcano Especias - Product Feed</title>\n';
    xml += '<link>' + BASE_URL + '/</link>\n';
    xml += '<description>Feed de productos de Arcano Especias para Google Merchant Center</description>\n';
    for (var i = 0; i < blends.length; i++) {
      var b = blends[i];
      if ((Number(b.precioChico) || 0) <= 0) continue;
      var slug = b._slug || slugify(b.nombre);
      var nombre = esc(b.nombre || '');
      var desc = esc(cleanDesc(b.descripcion));
      var imagen = esc(fixImageUrl(b.imagen));
      var precio = Number(b.precioChico) || 0;
      var cat = esc(b.categoria || '');
      var inStock = isBlendInStock(b);
      var realImg = hasRealImage(b);
      xml += '<item>\n';
      xml += '<g:id>' + slug + '</g:id>\n';
      xml += '<g:title>' + nombre + '</g:title>\n';
      xml += '<g:description>' + desc + '</g:description>\n';
      xml += '<g:link>' + BASE_URL + '/blends/' + slug + '/</g:link>\n';
      xml += '<g:image_link>' + imagen + '</g:image_link>\n';
      xml += '<g:availability>' + (inStock ? 'in stock' : 'out of stock') + '</g:availability>\n';
      xml += '<g:price>' + precio + ' COP</g:price>\n';
      xml += '<g:brand>Arcano Especias</g:brand>\n';
      xml += '<g:condition>new</g:condition>\n';
      xml += '<g:google_product_category>Food, Beverages &amp; Tobacco &gt; Food Items &gt; Cooking &amp; Baking Ingredients &gt; Seasonings &amp; Spices</g:google_product_category>\n';
      xml += '<g:product_type>' + cat + '</g:product_type>\n';
      xml += '<g:identifier_exists>FALSE</g:identifier_exists>\n';
      // IVA 19% incluido en el precio (Colombia)
      xml += '<g:tax><g:country>CO</g:country><g:rate>19</g:rate><g:tax_ship>1</g:tax_ship></g:tax>\n';
      // Peso estimado (frasco pequeño ~80g)
      xml += '<g:shipping_weight>80 g</g:shipping_weight>\n';
      // Política de devoluciones: 7 días solo por daño/error
      xml += '<g:return_policy><g:return_policy_label>damaged_or_incorrect_7_days</g:return_policy_label><g:return_policy_url>https://arcanoespecias.com/#politica-devoluciones</g:return_policy_url></g:return_policy>\n';
      // Envío variable por zona (Colombia)
      xml += '<g:shipping><g:country>CO</g:country><g:region>Bogotá D.C.</g:region><g:service>Standard</g:service><g:price>7000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>2</g:max_transit_time></g:shipping>\n';
      xml += '<g:shipping><g:country>CO</g:country><g:region>Antioquia</g:region><g:service>Standard</g:service><g:price>8000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>3</g:max_transit_time></g:shipping>\n';
      xml += '<g:shipping><g:country>CO</g:country><g:region>Valle del Cauca</g:region><g:service>Standard</g:service><g:price>9000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>3</g:max_transit_time></g:shipping>\n';
      xml += '<g:shipping><g:country>CO</g:country><g:region>CO-OTRAS</g:region><g:service>Standard</g:service><g:price>12000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>5</g:max_transit_time></g:shipping>\n';
      // Si el producto no tiene imagen real (usa logo.png), excluirlo de Google Shopping
      // para evitar rechazo del feed por 'image is brand logo'.
      if (!realImg) {
        xml += '<g:excluded_destination>Shopping</g:excluded_destination>\n';
      }
      xml += '</item>\n';
    }
    xml += '</channel>\n</rss>\n';
    return xml;
  }

  /* === Merchant feed TSV === */
  function generateMerchantFeedTsv(blends) {
    // TSV no soporta campos anidados como shipping o return_policy; mantenemos formato simple
    // con los campos básicos + availability dinámico + excluded_destination.
    var tsv = 'id\ttitle\tdescription\tlink\timage_link\tavailability\tprice\tbrand\tcondition\tgoogle_product_category\tproduct_type\tidentifier_exists\texcluded_destination\n';
    for (var i = 0; i < blends.length; i++) {
      var b = blends[i];
      if ((Number(b.precioChico) || 0) <= 0) continue;
      var slug = b._slug || slugify(b.nombre);
      var nombre = (b.nombre || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
      var desc = cleanDesc(b.descripcion).replace(/\t/g, ' ').replace(/\n/g, ' ');
      var imagen = fixImageUrl(b.imagen);
      var precio = Number(b.precioChico) || 0;
      var cat = (b.categoria || '').replace(/\t/g, ' ');
      var avail = isBlendInStock(b) ? 'in stock' : 'out of stock';
      var excluded = hasRealImage(b) ? '' : 'Shopping';
      tsv += slug + '\t' + nombre + '\t' + desc + '\t' + BASE_URL + '/blends/' + slug + '/\t' + imagen + '\t' + avail + '\t' + precio + ' COP\tArcano Especias\tnew\tFood, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Seasonings & Spices\t' + cat + '\tFALSE\t' + excluded + '\n';
    }
    return tsv;
  }

  /* === Sitemap XML === */
  function _lastmodForBlend(b) {
    // Prioriza imagenUpdatedAt > creado > hoy
    if (b.imagenUpdatedAt) {
      try {
        var d = new Date(Number(b.imagenUpdatedAt));
        if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
      } catch (e) {}
    }
    if (b.creado && typeof b.creado === 'string') {
      return b.creado.substring(0, 10);
    }
    return new Date().toISOString().substring(0, 10);
  }

  function generateSitemap(blends, catsWithCounts, extraUrls) {
    var today = new Date().toISOString().substring(0, 10);
    var urlsSeen = {};
    // Lista de tuplas [url, prio, freq, lastmod]
    var urls = [];
    function add(url, prio, freq, lastmod) {
      if (urlsSeen[url]) return;
      urlsSeen[url] = true;
      urls.push([url, prio, freq, lastmod || today]);
    }

    // Homepage: fecha de hoy
    add(BASE_URL + '/', '1.0', 'weekly', today);
    // Índice /blends-para/: fecha de hoy
    add(BASE_URL + '/blends-para/', '0.9', 'weekly', today);

    // Mapeo: cat_label → lista de blends (con sus lastmod)
    var catToBlends = {};
    for (var i = 0; i < blends.length; i++) {
      var b = blends[i];
      if ((Number(b.precioChico) || 0) <= 0 && (Number(b.precioGrande) || 0) <= 0) continue;
      var cat = b.categoria || '';
      if (cat) {
        if (!catToBlends[cat]) catToBlends[cat] = [];
        catToBlends[cat].push(b);
      }
    }

    // Categorías SEO: lastmod = max(lastmod) de los blends en esa categoría
    for (var i = 0; i < catsWithCounts.length; i++) {
      var catSlug = catsWithCounts[i][0];
      var catLastmod = today;
      for (var catName in catToBlends) {
        if (catToBlends.hasOwnProperty(catName) && slugify(catName) === catSlug) {
          var blendList = catToBlends[catName];
          var lastmods = blendList.map(function(b) { return _lastmodForBlend(b); });
          lastmods.sort();
          catLastmod = lastmods[lastmods.length - 1];
          break;
        }
      }
      add(BASE_URL + '/blends-para/' + catSlug + '/', '0.8', 'weekly', catLastmod);
    }

    // Productos /blends/ — lastmod dinámico desde Firebase
    for (var i = 0; i < blends.length; i++) {
      var b = blends[i];
      if ((Number(b.precioChico) || 0) <= 0 && (Number(b.precioGrande) || 0) <= 0) continue;
      var slug = b._slug || slugify(b.nombre);
      add(BASE_URL + '/blends/' + slug + '/', '0.8', 'monthly', _lastmodForBlend(b));
    }

    // Extra URLs (recetas, blog, etc.) - lastmod fallback = today
    if (extraUrls) {
      for (var i = 0; i < extraUrls.length; i++) {
        var u = extraUrls[i];
        if (u.indexOf(BASE_URL + '/p/') === 0) continue;
        if (u.indexOf(BASE_URL + '/blends/') === 0) continue;
        if (u.indexOf(BASE_URL + '/blends-para/') === 0) continue;
        if (u.replace(/\/$/, '') === BASE_URL) continue;  // skip homepage (already added)
        add(u, '0.6', 'monthly', today);
      }
    }

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (var i = 0; i < urls.length; i++) {
      xml += '<url><loc>' + esc(urls[i][0]) + '</loc><lastmod>' + urls[i][3] + '</lastmod><priority>' + urls[i][1] + '</priority><changefreq>' + urls[i][2] + '</changefreq></url>\n';
    }
    xml += '</urlset>\n';
    return xml;
  }

  /* === Modificar /p/*.html para agregar canonical + redirect === */
  function modifyPHtml(content, targetUrl) {
    var modified = content;
    // 1. Canonical
    if (modified.indexOf('<link rel="canonical"') >= 0) {
      modified = modified.replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="' + esc(targetUrl) + '">');
    } else {
      modified = modified.replace('</title>', '</title>\n<link rel="canonical" href="' + esc(targetUrl) + '">');
    }
    // 2. Redirect suave al inicio del body
    var redirectScript = '<script>if(window.location.pathname.indexOf("/p/")===0 && !window.location.search.includes("noRedirect")){var u="' + targetUrl + '";if(window.location.search){u+=window.location.search.replace("?","?")}window.location.replace(u);}</script>';
    if (modified.indexOf('window.location.replace') < 0) {
      var bodyMatch = modified.match(/<body[^>]*>/i);
      if (bodyMatch) {
        var pos = bodyMatch.index + bodyMatch[0].length;
        modified = modified.substring(0, pos) + redirectScript + modified.substring(pos);
      } else {
        modified = modified.replace('</html>', redirectScript + '</html>');
      }
    }
    return modified;
  }

  /* === Normalizar slug para matching con /p/*.html === */
  function normalizeSlug(s) {
    if (!s) return '';
    s = String(s).toLowerCase().trim();
    var repl = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n'};
    for (var k in repl) s = s.replace(k, repl[k]);
    s = s.replace(/['"\u2019\u2018]/g, '');
    s = s.replace(/[^a-z0-9]/g, '');
    return s;
  }

  /* === MAIN: genera todos los archivos ===
     Retorna: {
       blendsPages: [{path: 'blends/slug/index.html', content: '...'}],
       categoryPages: [{path: 'blends-para/cat/index.html', content: '...'}],
       blendsParaIndex: {path: 'blends-para/index.html', content: '...'},
       merchantFeedXml: {path: 'merchant_feed.xml', content: '...'},
       merchantFeedTsv: {path: 'merchant_feed.tsv', content: '...'},
       sitemap: {path: 'sitemap.xml', content: '...'},
       pHtmlUpdates: [{path: 'p/slug.html', content: '...', originalSha: '...'}],
       stats: {blends, categorias, pUpdates, incompletos}
     } */
  function generateAll(db, existingSitemapUrls, pHtmlFiles) {
    // db = ArcanoDB.getDB() — tiene blends, especias, packs como objetos keyed-by-id
    // (después del fix _normalizeToMap en db.js). Soportamos también arrays legacy.
    var blendsRaw = db.blends || {};
    var especiasRaw = db.especias || {};
    var especiasById = {};

    // Normalizar blendsRaw a array (puede ser objeto keyed-by-id o array legacy)
    var blendsArr = [];
    if (Array.isArray(blendsRaw)) {
      blendsArr = blendsRaw.slice();
    } else if (blendsRaw && typeof blendsRaw === 'object') {
      blendsArr = Object.keys(blendsRaw).map(function(k) { return blendsRaw[k]; });
    }

    // Filtrar blends con precio > 0
    var blends = [];
    for (var i = 0; i < blendsArr.length; i++) {
      var b = blendsArr[i];
      if (!b || typeof b !== 'object') continue;
      if (!b.nombre) continue;
      var pc = Number(b.precioChico) || 0;
      var pg = Number(b.precioGrande) || 0;
      if (pc <= 0 && pg <= 0) continue;
      b._slug = slugify(b.nombre);
      b._categoriasSEO = deriveCategoriasSEO(b);
      b._tipo = 'blend';
      blends.push(b);
    }

    // Filtrar especias con precio > 0 y enTienda (para /blends/ también)
    // Hoy las especias individuales no se venden, así que especiasList queda vacío
    // pero mantenemos la lógica por si en el futuro se habilitan
    var especiasArr = [];
    if (Array.isArray(especiasRaw)) {
      especiasArr = especiasRaw.slice();
    } else if (especiasRaw && typeof especiasRaw === 'object') {
      especiasArr = Object.keys(especiasRaw).map(function(k) { return especiasRaw[k]; });
    }
    for (var i = 0; i < especiasArr.length; i++) {
      var e = especiasArr[i];
      if (!e || typeof e !== 'object') continue;
      if (!e.nombre || !e.enTienda) continue;
      var pc = Number(e.precioTiendaChico || e.precioChico) || 0;
      var pg = Number(e.precioTiendaGrande || e.precioGrande) || 0;
      if (pc <= 0 && pg <= 0) continue;
      e._slug = slugify(e.nombre);
      e._categoriasSEO = deriveCategoriasSEO(e);
      e._tipo = 'especia';
      especiasById[String(e.id)] = e;
      blends.push(e);  // las especias en tienda se tratan como productos
    }

    // Si no se cargaron especias en tienda, igual mapearlas para los ingredientes
    if (Array.isArray(especiasRaw)) {
      for (var i = 0; i < especiasRaw.length; i++) {
        var e = especiasRaw[i];
        if (e && e.id && !especiasById[String(e.id)]) especiasById[String(e.id)] = e;
      }
    } else if (especiasRaw && typeof especiasRaw === 'object') {
      var espKeys = Object.keys(especiasRaw);
      for (var i = 0; i < espKeys.length; i++) {
        var e = especiasRaw[espKeys[i]];
        if (e && e.id && !especiasById[String(e.id)]) especiasById[String(e.id)] = e;
      }
    }

    var allProducts = blends;

    // 1. Generar páginas /blends/<slug>/index.html
    var blendsPages = [];
    var slugsSeen = {};
    var incompletos = [];
    for (var i = 0; i < allProducts.length; i++) {
      var b = allProducts[i];
      var slug = b._slug || slugify(b.nombre);
      if (!slug) continue;
      if (slugsSeen[slug]) continue;
      slugsSeen[slug] = true;

      // Verificar info incompleta
      var issues = [];
      if (!cleanDesc(b.descripcion)) issues.push('descripcion');
      if (b._tipo === 'blend' && (!b.ingredientes || !b.ingredientes.length)) issues.push('ingredientes');
      if (!b.imagen) issues.push('imagen');
      if (!b.uso) issues.push('uso');
      if (issues.length) incompletos.push({id: b.id, nombre: b.nombre, tipo: b._tipo, issues: issues});

      var html = blendPageHtml(b, especiasById, allProducts);
      blendsPages.push({path: 'blends/' + slug + '/index.html', content: html});
    }

    // 2. Generar /blends-para/<cat>/index.html
    var catToProducts = {};
    for (var i = 0; i < allProducts.length; i++) {
      var b = allProducts[i];
      var cats = b._categoriasSEO || [];
      for (var j = 0; j < cats.length; j++) {
        if (!catToProducts[cats[j]]) catToProducts[cats[j]] = [];
        catToProducts[cats[j]].push(b);
      }
    }
    var catsWithCounts = [];
    var categoryPages = [];
    for (var cat in catToProducts) if (catToProducts.hasOwnProperty(cat)) {
      var prods = catToProducts[cat];
      if (prods.length < 3) continue;
      prods.sort(function(a, b) { return (a.nombre||'').localeCompare(b.nombre||''); });
      catsWithCounts.push([cat, prods.length]);
      var html = categoryPageHtml(cat, prods, allProducts);
      categoryPages.push({path: 'blends-para/' + cat + '/index.html', content: html});
    }
    var blendsParaIndex = {path: 'blends-para/index.html', content: blendsParaIndexHtml(catsWithCounts)};

    // 3. Sitemap
    var sitemapContent = generateSitemap(allProducts, catsWithCounts, existingSitemapUrls);
    var sitemap = {path: 'sitemap.xml', content: sitemapContent};

    // 4. Merchant feed
    var merchantFeedXml = {path: 'merchant_feed.xml', content: generateMerchantFeedXml(allProducts)};
    var merchantFeedTsv = {path: 'merchant_feed.tsv', content: generateMerchantFeedTsv(allProducts)};

    // 5. /p/*.html updates
    // pHtmlFiles = [{path, content, sha}] — viene pre-cargado del caller
    var pUpdates = [];
    if (pHtmlFiles && pHtmlFiles.length) {
      // Map slug normalizado → blend
      var slugToBlend = {};
      for (var i = 0; i < allProducts.length; i++) {
        var b = allProducts[i];
        var slug = b._slug || slugify(b.nombre);
        slugToBlend[normalizeSlug(slug)] = b;
      }
      for (var i = 0; i < pHtmlFiles.length; i++) {
        var pf = pHtmlFiles[i];
        var oldSlug = pf.path.replace(/^p\//, '').replace(/\.html$/, '');
        var oldSlugNorm = normalizeSlug(oldSlug);
        var blend = slugToBlend[oldSlugNorm];
        if (!blend) continue;
        var newSlug = blend._slug || slugify(blend.nombre);
        var targetUrl = BASE_URL + '/blends/' + newSlug + '/';
        var newContent = modifyPHtml(pf.content, targetUrl);
        if (newContent !== pf.content) {
          pUpdates.push({path: pf.path, content: newContent, sha: pf.sha});
        }
      }
    }

    return {
      blendsPages: blendsPages,
      categoryPages: categoryPages,
      blendsParaIndex: blendsParaIndex,
      merchantFeedXml: merchantFeedXml,
      merchantFeedTsv: merchantFeedTsv,
      sitemap: sitemap,
      pHtmlUpdates: pUpdates,
      stats: {
        blends: allProducts.length,
        categorias: catsWithCounts.length,
        pUpdates: pUpdates.length,
        incompletos: incompletos
      }
    };
  }

  return {
    slugify: slugify,
    deriveCategoriasSEO: deriveCategoriasSEO,
    generateAll: generateAll,
    normalizeSlug: normalizeSlug
  };
})();
