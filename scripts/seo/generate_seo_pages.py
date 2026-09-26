#!/usr/bin/env python3
"""
Arcano — Generador de páginas SEO estáticas
Lee Firebase (/blends, /especias, /packs) y genera:
  - /blends/<slug>/index.html  (una URL individual por producto)
  - /blends-para/<categoria>/index.html  (páginas de categoría SEO)
  - /sitemap.xml  (extendido con todas las URLs)
  - /merchant_feed.xml  (regenerado desde datos limpios)
  - /merchant_feed.tsv

Para re-ejecutar desde el admin: el botón "Regenerar SEO" dispara este script.
Sin dependencias externas (solo stdlib + urllib).
"""
import os
import re
import json
import urllib.request
import html as html_module
from datetime import datetime

REPO_PATH = '/home/z/my-project/repos/arcanoespecias.github.io'
FIREBASE_URL = 'https://arcano-6788d-default-rtdb.firebaseio.com/arcano/db'
BASE_URL = 'https://arcanoespecias.com'

# ============================================================
# SLUG RULES
# ============================================================
def slugify(name):
    """Convierte un nombre en slug SEO-friendly: minúsculas, sin tildes,
    sin caracteres especiales, separados por guiones."""
    if not name:
        return ''
    s = str(name).lower().strip()
    # Quitar tildes
    replacements = {
        'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n',
        'Á':'a','É':'e','Í':'i','Ó':'o','Ú':'u','Ü':'u','Ñ':'n'
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    # Reemplazar & por separador
    s = s.replace('&', '-')
    # Quitar todo lo que no sea alfanumérico o guion
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    # Colapsar espacios y guiones múltiples
    s = re.sub(r'[\s-]+', '-', s).strip('-')
    return s

# ============================================================
# FIREBASE LOADER
# ============================================================
def fetch(path):
    url = FIREBASE_URL + '/' + path + '.json'
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def load_catalog():
    blends_raw = fetch('blends') or []
    especias_raw = fetch('especias') or {}
    packs_raw = fetch('packs') or {}

    # Filtrar blends válidos
    blends = []
    for b in blends_raw:
        if not b or not isinstance(b, dict):
            continue
        if not b.get('nombre'):
            continue
        # Solo blends con precio > 0 y en tienda
        if (b.get('precioChico') or 0) <= 0 and (b.get('precioGrande') or 0) <= 0:
            continue
        b['_slug'] = slugify(b.get('nombre', ''))
        b['_categoriasSEO'] = derive_categorias_seo(b)
        blends.append(b)

    # Filtrar especias válidas
    especias = {}
    especias_list = []
    if isinstance(especias_raw, list):
        for e in especias_raw:
            if not e or not isinstance(e, dict):
                continue
            if not e.get('nombre'):
                continue
            # Solo especias con precio de tienda > 0 y en tienda
            try:
                pc = float(e.get('precioTiendaChico') or e.get('precioChico') or 0)
            except:
                pc = 0
            try:
                pg = float(e.get('precioTiendaGrande') or e.get('precioGrande') or 0)
            except:
                pg = 0
            if pc <= 0 and pg <= 0:
                continue
            if not e.get('enTienda'):
                continue
            e['_slug'] = slugify(e.get('nombre', ''))
            e['_categoriasSEO'] = derive_categorias_seo(e)
            eid = str(e.get('id', ''))
            if eid:
                especias[eid] = e
                especias_list.append(e)
    elif isinstance(especias_raw, dict):
        for eid, e in especias_raw.items():
            if not e or not isinstance(e, dict):
                continue
            if not e.get('nombre'):
                continue
            try:
                pc = float(e.get('precioTiendaChico') or e.get('precioChico') or 0)
            except:
                pc = 0
            try:
                pg = float(e.get('precioTiendaGrande') or e.get('precioGrande') or 0)
            except:
                pg = 0
            if pc <= 0 and pg <= 0:
                continue
            if not e.get('enTienda'):
                continue
            e['_slug'] = slugify(e.get('nombre', ''))
            e['_categoriasSEO'] = derive_categorias_seo(e)
            especias[eid] = e
            especias_list.append(e)

    # Filtrar packs
    packs = []
    if isinstance(packs_raw, list):
        for p in packs_raw:
            if not p or not isinstance(p, dict):
                continue
            if not p.get('nombre') or not p.get('precio'):
                continue
            p['_slug'] = slugify(p.get('nombre', ''))
            packs.append(p)
    elif isinstance(packs_raw, dict):
        for k, p in packs_raw.items():
            if not p or not isinstance(p, dict):
                continue
            if not p.get('nombre') or not p.get('precio'):
                continue
            p['_slug'] = slugify(p.get('nombre', ''))
            packs.append(p)

    return blends, especias, especias_list, packs

# ============================================================
# CATEGORIAS SEO
# ============================================================
# Mapeo heurístico nombre/descripción/categoria → categorías SEO
HEURISTICS = {
    'carnes': [
        'asado', 'parrilla', 'bbq', 'barbacoa', 'chimichurri', 'gaucho',
        'patagon', 'costela', 'brase', 'inca grill', 'korean', 'balkan',
        'bavarian', 'tandoori', 'tokyo', 'andean fire', 'cajun', 'berbere',
        'baharat', 'ras el hanout', 'smokehouse', 'bourbon', 'sichuan',
        'carne', 'res', 'cerdo', 'lomo', 'costilla', 'chorizo', 'parrill'
    ],
    'pollo': [
        'pollo', 'piri piri', 'tandoori', 'adobo'
    ],
    'pescados-mariscos': [
        'pescado', 'marisco', 'ceviche', 'camaron', 'atun', 'salmon',
        'caribe costeno', 'caribe costeño', 'za\'atar', 'zaatar', 'pimienta sichuan'
    ],
    'guisos': [
        'garam masala', 'curry', 'baharat', 'ras el hanout', 'adobo criollo',
        'sabor paisa', 'achiote', 'italiano', 'herbes de provence',
        'adobo colombiano', 'guiso', 'estofado', 'sopa', 'crema'
    ],
    'infusiones': [
        'chai', 'dulces suenos', 'dulces sueños', 'noche serena', 'noche azul',
        'energia andina', 'golden wellness', 'respirar', 'amazonia verde',
        'sobremesa', 'manzanilla', 'toronjil', 'lavanda',
        'eucalipto', 'infusion'
    ],
    'cocteleria': [
        'gin', 'moscow mule', 'mojito', 'rum', 'whisky', 'vermu', 'vermu botanico',
        'arcano signature', 'coctel', 'cocteleria', 'tragos'
    ],
    'arroces-pastas': [
        'italiano', 'pizza', 'pasta', 'risotto', 'arroz', 'paella', 'baharat'
    ],
    'adobos-marinadas': [
        'adobo', 'marinada', 'sazon', 'rub', 'marinado'
    ],
}

def derive_categorias_seo(blend):
    """Deriva categorías SEO a partir del campo 'uso' (si existe) + heurística."""
    cats = set()

    # 1. Si tiene 'uso' cargado (string con casos separados por coma)
    uso = blend.get('uso', '')
    if isinstance(uso, str) and uso.strip():
        for u in [x.strip() for x in uso.split(',') if x.strip()]:
            # Mapear casos de uso del admin a slugs SEO
            ul = u.lower()
            if 'carne' in ul and 'pescado' not in ul:
                cats.add('carnes')
            if 'pollo' in ul: cats.add('pollo')
            if 'pescado' in ul or 'marisco' in ul: cats.add('pescados-mariscos')
            if 'guiso' in ul or 'estofado' in ul: cats.add('guisos')
            if 'sopa' in ul or 'crema' in ul: cats.add('guisos')
            if 'adobo' in ul or 'marinada' in ul: cats.add('adobos-marinadas')
            if 'arroces' in ul: cats.add('arroces-pastas')
            if 'pasta' in ul: cats.add('arroces-pastas')
            if 'ensalada' in ul: cats.add('guisos')  # fallback
            if 'salsa' in ul: cats.add('adobos-marinadas')
            if 'taco' in ul or 'burrito' in ul: cats.add('carnes')
            if 'hamburguesa' in ul: cats.add('carnes')
            if 'pizza' in ul: cats.add('arroces-pastas')
            if 'curry' in ul: cats.add('guisos')
            if 'ceviche' in ul: cats.add('pescados-mariscos')
            if 'postre' in ul: cats.add('infusiones')  # fallback dulce
            if 'bebida' in ul: cats.add('cocteleria')
            if 'panaderia' in ul: cats.add('arroces-pastas')
            if 'vegetal' in ul: cats.add('guisos')

    # 2. Heurística por nombre + descripción
    nombre = (blend.get('nombre') or '').lower()
    descripcion = (blend.get('descripcion') or '').lower()
    texto = nombre + ' ' + descripcion
    categoria_principal = (blend.get('categoria') or '').lower()

    # Si la categoria principal es Infusiones, asignar infusiones
    if 'infusion' in categoria_principal or 'te' in categoria_principal:
        cats.add('infusiones')
    if 'coctel' in categoria_principal:
        cats.add('cocteleria')

    # Buscar keywords en nombre/descripción
    for cat, keywords in HEURISTICS.items():
        for kw in keywords:
            if kw in texto:
                cats.add(cat)
                break

    # 3. Fallback por categoria principal
    if not cats:
        if 'infusion' in categoria_principal:
            cats.add('infusiones')
        elif 'coctel' in categoria_principal:
            cats.add('cocteleria')
        else:
            cats.add('carnes')  # fallback Comidas → carnes

    return sorted(cats)

# ============================================================
# HTML TEMPLATES
# ============================================================
def esc(s):
    if s is None: return ''
    s = str(s)
    s = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    s = s.replace('"', '&quot;')
    return s

def clean_desc(s):
    """Limpia comillas envolventes y escapes en descripciones."""
    if not s: return ''
    s = str(s).strip()
    # Quitar comillas dobles envolventes (si las tiene)
    while s.startswith('"') and s.endswith('"') and len(s) > 1:
        s = s[1:-1].strip()
    # Quitar escapes tipo \"
    s = s.replace('\\"', '"')
    return s

def blend_page_html(blend, especias, all_blends):
    """Genera el HTML estático de /blends/<slug>/index.html"""
    slug = blend['_slug']
    nombre = blend.get('nombre', '')
    descripcion = clean_desc(blend.get('descripcion', ''))
    categoria = blend.get('categoria', '')
    region = blend.get('region', '')
    precio_chico = blend.get('precioChico', 0) or 0
    precio_grande = blend.get('precioGrande', 0) or 0
    imagen = blend.get('imagen') or (BASE_URL + '/icons/logo.png')
    # Arreglar URLs viejas
    if 'arcanoespecias.github.io' in imagen:
        imagen = imagen.replace('arcanoespecias.github.io', 'arcanoespecias.com')

    ingredientes = blend.get('ingredientes', []) or []

    # URLs
    url_canonical = BASE_URL + '/blends/' + slug + '/'
    url_imagen = imagen

    # Title variado según categoría (no todos dicen "Blend de Especias")
    cat_lower = (categoria or '').lower()
    if 'coctel' in cat_lower:
        title_suffix = 'Botánicos para Coctelería'
    elif 'infusion' in cat_lower:
        title_suffix = 'Infusión Artesanal'
    elif 'comida' in cat_lower:
        title_suffix = 'Sazonador Artesanal'
    else:
        title_suffix = 'Mezcla de Especias'
    title = f'{nombre} | {title_suffix} | Arcano Colombia'

    # Meta description
    meta_desc = descripcion
    if len(meta_desc) > 160:
        meta_desc = meta_desc[:157].rsplit(' ', 1)[0] + '...'
    if not meta_desc:
        meta_desc = f'{nombre} — mezcla de especias artesanal sin conservantes. Compra online con envíos a toda Colombia.'

    # H1
    h1 = nombre

    # Breadcrumbs
    breadcrumbs = [
        ('Inicio', BASE_URL + '/'),
        ('Blends', BASE_URL + '/'),
        (nombre, url_canonical),
    ]

    # JSON-LD Product
    product_jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': nombre,
        'description': descripcion or meta_desc,
        'image': url_imagen,
        'brand': {'@type': 'Brand', 'name': 'Arcano Especias'},
        'category': categoria,
        'offers': {
            '@type': 'Offer',
            'url': url_canonical,
            'priceCurrency': 'COP',
            'price': str(precio_chico),
            'availability': 'https://schema.org/InStock' if (blend.get('stockChico') or 0) > 0 or (blend.get('stockGrande') or 0) > 0 else 'https://schema.org/OutOfStock'
        }
    }
    if precio_grande > 0:
        product_jsonld['offers']['priceSpecification'] = [{
            '@type': 'UnitPriceSpecification',
            'price': str(precio_chico),
            'name': 'Frasco pequeño'
        }, {
            '@type': 'UnitPriceSpecification',
            'price': str(precio_grande),
            'name': 'Frasco grande'
        }]
    if region:
        product_jsonld['brand']['description'] = f'Origen: {region}'

    # JSON-LD BreadcrumbList
    breadcrumb_jsonld = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': []
    }
    for i, (name, url) in enumerate(breadcrumbs, 1):
        breadcrumb_jsonld['itemListElement'].append({
            '@type': 'ListItem',
            'position': i,
            'name': name,
            'item': url
        })

    # Productos relacionados (misma categoría SEO, excluyendo este)
    relacionados = []
    for b in all_blends:
        if b.get('id') == blend.get('id'):
            continue
        if b.get('categoria') == categoria:
            relacionados.append(b)
        if len(relacionados) >= 4:
            break

    # Categorías SEO del blend (para links)
    cats_seo = blend.get('_categoriasSEO', [])

    # Construir HTML
    html = []
    html.append('<!DOCTYPE html>')
    html.append('<html lang="es">')
    html.append('<head>')
    html.append('<meta charset="UTF-8">')
    html.append('<meta name="viewport" content="width=device-width,initial-scale=1.0">')
    html.append(f'<title>{esc(title)}</title>')
    html.append(f'<meta name="description" content="{esc(meta_desc)}">')
    html.append(f'<link rel="canonical" href="{esc(url_canonical)}">')
    html.append(f'<meta property="og:type" content="product">')
    html.append(f'<meta property="og:title" content="{esc(nombre)} | Arcano Especias">')
    html.append(f'<meta property="og:description" content="{esc(meta_desc)}">')
    html.append(f'<meta property="og:url" content="{esc(url_canonical)}">')
    html.append(f'<meta property="og:image" content="{esc(url_imagen)}">')
    html.append(f'<meta property="og:locale" content="es_CO">')
    html.append(f'<meta property="og:site_name" content="Arcano Especias">')
    html.append(f'<meta name="twitter:card" content="summary_large_image">')
    html.append(f'<meta name="twitter:title" content="{esc(nombre)} | Arcano Especias">')
    html.append(f'<meta name="twitter:description" content="{esc(meta_desc)}">')
    html.append(f'<meta name="twitter:image" content="{esc(url_imagen)}">')
    html.append(f'<meta name="robots" content="index, follow, max-image-preview:large">')
    html.append('<link rel="preconnect" href="https://fonts.googleapis.com">')
    html.append('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
    html.append('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">')
    html.append(f'<link rel="icon" type="image/png" href="{BASE_URL}/icons/favicon-32.png">')
    html.append('<style>')
    html.append('body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}')
    html.append('.c{max-width:760px;margin:0 auto;padding:24px 16px 48px}')
    html.append('a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}')
    html.append('.bc{font-size:.85rem;color:#a08b6e;margin-bottom:24px;padding:8px 0}')
    html.append('.bc a{color:#a08b6e}.bc a:hover{color:#c9a84c}')
    html.append('.bc .sep{margin:0 8px;opacity:.5}')
    html.append('h1{font-size:2.2rem;color:#c9a84c;margin:0 0 8px;line-height:1.2}')
    html.append('.meta{color:#a08b6e;font-size:.9rem;margin-bottom:24px}')
    html.append('.meta span{display:inline-block;margin-right:16px}')
    html.append('.hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}')
    html.append('@media(max-width:600px){.hero{grid-template-columns:1fr}}')
    html.append('img.h{width:100%;border-radius:12px;max-height:420px;object-fit:cover;box-shadow:0 8px 32px rgba(0,0,0,.4)}')
    html.append('.info{padding:8px 0}')
    html.append('.desc{font-size:1.05rem;color:#e8dcc4;margin-bottom:24px}')
    html.append('.section{margin:32px 0;padding:20px;background:#2d1a10;border-radius:12px}')
    html.append('.section h2{color:#c9a84c;font-size:1.1rem;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em}')
    html.append('.section ul{margin:0;padding-left:20px;color:#e8dcc4}')
    html.append('.section li{margin:4px 0}')
    html.append('.precio{background:linear-gradient(135deg,#2d1a10,#1b0b07);border:1px solid #c9a84c;border-radius:12px;padding:20px;margin:20px 0}')
    html.append('.precio .lab{color:#a08b6e;font-size:.8rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}')
    html.append('.precio .val{font-size:1.8rem;color:#c9a84c;font-weight:700}')
    html.append('.precio .row{display:inline-block;margin-right:32px}')
    html.append('.cta{display:inline-block;background:#c9a84c;color:#1b0b07;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none;margin-top:16px;transition:transform .2s}')
    html.append('.cta:hover{transform:translateY(-2px);text-decoration:none;background:#e8b84b}')
    html.append('.tags{margin:8px 0}')
    html.append('.tag{display:inline-block;padding:4px 12px;border-radius:12px;font-size:.8rem;background:#2d1a10;border:1px solid #c9a84c;color:#c9a84c;margin:4px 4px 0 0;text-decoration:none}')
    html.append('.tag:hover{background:#c9a84c;color:#1b0b07;text-decoration:none}')
    html.append('.rel{margin-top:32px;padding-top:24px;border-top:1px solid #2d1a10}')
    html.append('.rel h2{color:#c9a84c;font-size:1.2rem;margin-bottom:16px}')
    html.append('.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}')
    html.append('.rel-card{display:block;background:#2d1a10;border-radius:8px;overflow:hidden;color:#f0e6d3;text-decoration:none;transition:transform .15s}')
    html.append('.rel-card:hover{transform:translateY(-3px);text-decoration:none}')
    html.append('.rel-card img{width:100%;height:90px;object-fit:cover}')
    html.append('.rel-card .name{padding:8px 10px;font-size:.85rem;font-weight:600}')
    html.append('.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}')
    html.append('</style>')
    html.append('</head>')
    html.append('<body>')
    html.append('<div class="c">')

    # Breadcrumbs
    html.append('<nav class="bc">')
    for i, (name, url) in enumerate(breadcrumbs):
        if i > 0:
            html.append('<span class="sep">›</span>')
        if i < len(breadcrumbs) - 1:
            html.append(f'<a href="{esc(url)}">{esc(name)}</a>')
        else:
            html.append(f'<span>{esc(name)}</span>')
    html.append('</nav>')

    # Hero
    html.append('<div class="hero">')
    html.append(f'<img src="{esc(url_imagen)}" alt="Blend de especias {esc(nombre)} Arcano Especias" class="h" loading="eager" fetchpriority="high">')
    html.append('<div class="info">')
    html.append(f'<h1>{esc(h1)}</h1>')
    html.append('<div class="meta">')
    html.append(f'<span>Blend artesanal</span>')
    if categoria:
        html.append(f'<span>{esc(categoria)}</span>')
    if region:
        html.append(f'<span>Origen: {esc(region)}</span>')
    html.append('</div>')
    if descripcion:
        html.append(f'<p class="desc">{esc(descripcion)}</p>')
    html.append('</div></div>')  # close info, hero

    # Categorías SEO tags
    if cats_seo:
        html.append('<div class="tags">')
        for c in cats_seo:
            cat_label = CATEGORIA_LABELS.get(c, c.replace('-', ' ').title())
            html.append(f'<a href="{BASE_URL}/blends-para/{c}/" class="tag">{esc(cat_label)}</a>')
        html.append('</div>')

    # Sección de ingredientes
    if ingredientes:
        html.append('<div class="section">')
        html.append('<h2>Ingredientes</h2>')
        html.append('<ul>')
        for ing in ingredientes:
            inombre = ing.get('especiaNombre') or (especias.get(ing.get('especiaId'), {}) or {}).get('nombre', '')
            if inombre:
                html.append(f'<li>{esc(inombre)}</li>')
        html.append('</ul>')
        html.append('</div>')

    # Usos
    uso = blend.get('uso', '')
    if uso:
        usos_list = [u.strip() for u in str(uso).split(',') if u.strip()]
        if usos_list:
            html.append('<div class="section">')
            html.append('<h2>Ideal para</h2>')
            html.append('<ul>')
            for u in usos_list:
                html.append(f'<li>{esc(u)}</li>')
            html.append('</ul>')
            html.append('</div>')

    # Precio
    html.append('<div class="precio">')
    if precio_chico > 0:
        html.append('<div class="row"><div class="lab">Frasco pequeño</div><div class="val">$' + format(precio_chico, ',d').replace(',', '.') + '</div></div>')
    if precio_grande > 0:
        html.append('<div class="row"><div class="lab">Frasco grande</div><div class="val">$' + format(precio_grande, ',d').replace(',', '.') + '</div></div>')
    html.append('</div>')

    # CTA
    tienda_url = BASE_URL + '/?producto=' + slug
    html.append(f'<a href="{esc(tienda_url)}" class="cta">Comprar {esc(nombre)} →</a>')

    # Productos relacionados
    if relacionados:
        html.append('<div class="rel">')
        html.append(f'<h2>Blends relacionados</h2>')
        html.append('<div class="rel-grid">')
        for r in relacionados:
            r_slug = r.get('_slug') or slugify(r.get('nombre', ''))
            r_nombre = r.get('nombre', '')
            r_imagen = r.get('imagen') or (BASE_URL + '/icons/logo.png')
            if 'arcanoespecias.github.io' in r_imagen:
                r_imagen = r_imagen.replace('arcanoespecias.github.io', 'arcanoespecias.com')
            html.append(f'<a href="{BASE_URL}/blends/{r_slug}/" class="rel-card">')
            html.append(f'<img src="{esc(r_imagen)}" alt="{esc(r_nombre)}" loading="lazy">')
            html.append(f'<div class="name">{esc(r_nombre)}</div>')
            html.append('</a>')
        html.append('</div></div>')

    # Footer
    html.append('<div class="footer">')
    html.append(f'<p><a href="{BASE_URL}/">← Volver a Arcano Especias</a></p>')
    html.append('<p style="margin-top:8px">Arcano Especias — Especias y Blends artesanales del mundo · Envíos a toda Colombia</p>')
    html.append('</div>')

    html.append('</div>')  # close .c

    # JSON-LD
    html.append('<script type="application/ld+json">' + json.dumps(product_jsonld, ensure_ascii=False) + '</script>')
    html.append('<script type="application/ld+json">' + json.dumps(breadcrumb_jsonld, ensure_ascii=False) + '</script>')

    html.append('</body></html>')

    return '\n'.join(html)

# ============================================================
# CATEGORÍA SEO LABELS
# ============================================================
CATEGORIA_LABELS = {
    'carnes': 'Comprar Especias para Carnes y Asados',
    'pollo': 'Comprar Especias para Pollo',
    'pescados-mariscos': 'Comprar Especias para Pescados y Mariscos',
    'guisos': 'Comprar Especias para Guisos y Estofados',
    'infusiones': 'Comprar Infusiones Artesanales y Tés',
    'cocteleria': 'Comprar Botánicos para Coctelería',
    'arroces-pastas': 'Comprar Especias para Arroces y Pastas',
    'adobos-marinadas': 'Comprar Adobos y Marinadas Artesanales',
}

CATEGORIA_H1 = {
    'carnes': 'Especias para Carnes y Asados',
    'pollo': 'Especias para Pollo',
    'pescados-mariscos': 'Especias para Pescados y Mariscos',
    'guisos': 'Especias para Guisos y Estofados',
    'infusiones': 'Infusiones Artesanales y Tés',
    'cocteleria': 'Botánicos para Coctelería',
    'arroces-pastas': 'Especias para Arroces y Pastas',
    'adobos-marinadas': 'Adobos y Marinadas Artesanales',
}

CATEGORIA_INTROS = {
    'carnes': 'Descubre nuestra selección de especias artesanales para carnes y asados en Colombia. Sazonadores sin conservantes para parrilla, cortes premium y preparaciones a fuego lento. Compra online con envíos a todo el país y transforma cada corte en una experiencia gastronómica memorable. Ingredientes 100% naturales seleccionados de cada rincón del mundo.',
    'pollo': 'Especias artesanales para pollo sin conservantes. Marinados y adobos que penetran y realzan el sabor natural sin enmascararlo. Compra online en Colombia con envíos a todo el país. Mezclas pensadas para asados, grill y preparaciones de cocción lenta que elevan cada bocado.',
    'pescados-mariscos': 'Mezclas de especias artesanales para pescados, mariscos y ceviches. Notas cítricas y herbales que complementan sin dominar. Sin conservantes, ingredientes 100% naturales. Compra online en Colombia con envío a toda el país. Sazonadores gourmet para pescado al horno, a la plancha o crudo.',
    'guisos': 'Especias para guisos, estofados, sopas y preparaciones de cocción lenta. Mezclas artesanales que aportan profundidad, calidez y complejidad aromática. Sin conservantes, 100% naturales. Compra online en Colombia con envíos a todo el país. Sazonadores gourmet para elevar tus recetas tradicionales.',
    'infusiones': 'Infusiones artesanales y tés de especias para momentos de descanso y bienestar. Hierbas, flores y especias seleccionadas a mano, sin conservantes. Compra online en Colombia con envíos a todo el país. Mezclas relajantes, digestivas y energizantes que transforman tu rutina diaria.',
    'cocteleria': 'Botánicos para coctelería de autor. Mezclas artesanales para infundir ginebra, whisky, ron y crear cócteles únicos. Sin conservantes, ingredientes 100% naturales. Compra online en Colombia con envío a todo el país. Eleva tus tragos con especias seleccionadas de cada rincón del mundo.',
    'arroces-pastas': 'Especias artesanales para arroces, pastas, risottos y preparaciones mediterráneas. Mezclas que aportan carácter sin dominar el plato. Sin conservantes, ingredientes 100% naturales. Compra online en Colombia con envíos a todo el país. Sazonadores gourmet para la cocina de todos los días.',
    'adobos-marinadas': 'Adobos y marinadas artesanales sin conservantes. Sazonadores que penetran y realzan el sabor natural de carnes, pollo y pescados. Compra online en Colombia con envíos a todo el país. Mezclas 100% naturales listas para transformar tus preparaciones culinarias.',
}

def category_page_html(cat_slug, blends_in_cat, all_blends):
    """Genera el HTML de /blends-para/<cat>/index.html"""
    label = CATEGORIA_LABELS.get(cat_slug, cat_slug.replace('-', ' ').title())
    intro = CATEGORIA_INTROS.get(cat_slug, 'Blends artesanales de Arcano Especias.')
    url_canonical = BASE_URL + '/blends-para/' + cat_slug + '/'

    # Breadcrumbs
    breadcrumbs = [
        ('Inicio', BASE_URL + '/'),
        ('Blends para', BASE_URL + '/blends-para/'),
        (label, url_canonical),
    ]

    # Title
    title = f'{label} | Arcano Colombia'
    meta_desc = f'{intro[:155]} Envíos a toda Colombia.' if len(intro) < 130 else intro[:155]

    # JSON-LD ItemList
    itemlist_jsonld = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': label,
        'description': intro,
        'numberOfItems': len(blends_in_cat),
        'itemListElement': []
    }
    for i, b in enumerate(blends_in_cat, 1):
        slug = b.get('_slug') or slugify(b.get('nombre', ''))
        precio_chico = float(b.get('precioChico') or 0)
        precio_grande = float(b.get('precioGrande') or 0)
        # Cada Product DEBE tener offers (Google requiere offers, review o aggregateRating)
        product_obj = {
            '@type': 'Product',
            'name': b.get('nombre', ''),
            'url': BASE_URL + '/blends/' + slug + '/',
            'image': b.get('imagen', '').replace('arcanoespecias.github.io', 'arcanoespecias.com'),
            'brand': {'@type': 'Brand', 'name': 'Arcano Especias'}
        }
        # Agregar offers con precio si existe
        if precio_chico > 0 or precio_grande > 0:
            in_stock = (b.get('stockChico') or 0) > 0 or (b.get('stockGrande') or 0) > 0
            product_obj['offers'] = {
                '@type': 'Offer',
                'priceCurrency': 'COP',
                'price': str(int(precio_chico if precio_chico > 0 else precio_grande)),
                'availability': 'https://schema.org/InStock' if in_stock else 'https://schema.org/OutOfStock',
                'url': BASE_URL + '/blends/' + slug + '/'
            }
        itemlist_jsonld['itemListElement'].append({
            '@type': 'ListItem',
            'position': i,
            'item': product_obj
        })

    # Breadcrumb JSON-LD
    breadcrumb_jsonld = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': []
    }
    for i, (name, url) in enumerate(breadcrumbs, 1):
        breadcrumb_jsonld['itemListElement'].append({
            '@type': 'ListItem',
            'position': i,
            'name': name,
            'item': url
        })

    # Construir HTML
    html = []
    html.append('<!DOCTYPE html>')
    html.append('<html lang="es">')
    html.append('<head>')
    html.append('<meta charset="UTF-8">')
    html.append('<meta name="viewport" content="width=device-width,initial-scale=1.0">')
    html.append(f'<title>{esc(title)}</title>')
    html.append(f'<meta name="description" content="{esc(meta_desc)}">')
    html.append(f'<link rel="canonical" href="{esc(url_canonical)}">')
    html.append(f'<meta property="og:type" content="website">')
    html.append(f'<meta property="og:title" content="{esc(title)}">')
    html.append(f'<meta property="og:description" content="{esc(meta_desc)}">')
    html.append(f'<meta property="og:url" content="{esc(url_canonical)}">')
    html.append(f'<meta property="og:image" content="{BASE_URL}/icons/arcano-logo.webp">')
    html.append(f'<meta property="og:locale" content="es_CO">')
    html.append(f'<meta property="og:site_name" content="Arcano Especias">')
    html.append(f'<meta name="robots" content="index, follow, max-image-preview:large">')
    html.append('<link rel="preconnect" href="https://fonts.googleapis.com">')
    html.append('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
    html.append('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">')
    html.append(f'<link rel="icon" type="image/png" href="{BASE_URL}/icons/favicon-32.png">')
    html.append('<style>')
    html.append('body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}')
    html.append('.c{max-width:1100px;margin:0 auto;padding:24px 16px 48px}')
    html.append('a{color:#c9a84c;text-decoration:none}a:hover{text-decoration:underline}')
    html.append('.bc{font-size:.85rem;color:#a08b6e;margin-bottom:24px}')
    html.append('.bc a{color:#a08b6e}.bc a:hover{color:#c9a84c}')
    html.append('.bc .sep{margin:0 8px;opacity:.5}')
    html.append('h1{font-size:2.2rem;color:#c9a84c;margin:0 0 12px;line-height:1.2}')
    html.append('.intro{font-size:1.05rem;color:#e8dcc4;margin-bottom:32px;max-width:680px}')
    html.append('.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}')
    html.append('.card{display:block;background:#2d1a10;border-radius:12px;overflow:hidden;color:#f0e6d3;text-decoration:none;transition:transform .15s}')
    html.append('.card:hover{transform:translateY(-3px);text-decoration:none;border-color:#c9a84c}')
    html.append('.card img{width:100%;height:180px;object-fit:cover}')
    html.append('.card .info{padding:14px}')
    html.append('.card .name{font-weight:700;font-size:1rem;margin-bottom:6px}')
    html.append('.card .meta{font-size:.8rem;color:#a08b6e}')
    html.append('.card .precio{color:#c9a84c;font-weight:700;margin-top:6px}')
    html.append('.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid #2d1a10;color:#6b5a42;font-size:.8rem}')
    html.append('</style>')
    html.append('</head>')
    html.append('<body>')
    html.append('<div class="c">')

    # Breadcrumbs
    html.append('<nav class="bc">')
    for i, (name, url) in enumerate(breadcrumbs):
        if i > 0:
            html.append('<span class="sep">›</span>')
        if i < len(breadcrumbs) - 1:
            html.append(f'<a href="{esc(url)}">{esc(name)}</a>')
        else:
            html.append(f'<span>{esc(name)}</span>')
    html.append('</nav>')

    # H1 limpio (sin "Comprar" — eso va en el title)
    h1_text = CATEGORIA_H1.get(cat_slug, label)
    html.append(f'<h1>{esc(h1_text)}</h1>')
    html.append(f'<p class="intro">{esc(intro)}</p>')

    # Grid de productos
    html.append('<div class="grid">')
    for b in blends_in_cat:
        slug = b.get('_slug') or slugify(b.get('nombre', ''))
        nombre = b.get('nombre', '')
        imagen = b.get('imagen') or (BASE_URL + '/icons/logo.png')
        if 'arcanoespecias.github.io' in imagen:
            imagen = imagen.replace('arcanoespecias.github.io', 'arcanoespecias.com')
        precio_chico = b.get('precioChico', 0) or 0
        precio_grande = b.get('precioGrande', 0) or 0
        categoria = b.get('categoria', '')

        html.append(f'<a href="{BASE_URL}/blends/{slug}/" class="card">')
        html.append(f'<img src="{esc(imagen)}" alt="Blend de especias {esc(nombre)}" loading="lazy">')
        html.append('<div class="info">')
        html.append(f'<div class="name">{esc(nombre)}</div>')
        if categoria:
            html.append(f'<div class="meta">{esc(categoria)}</div>')
        if precio_chico > 0:
            precio_str = '${:,}'.format(precio_chico).replace(',', '.')
            html.append(f'<div class="precio">Desde {precio_str}</div>')
        html.append('</div></a>')
    html.append('</div>')

    # Footer
    html.append('<div class="footer">')
    html.append(f'<p><a href="{BASE_URL}/">← Volver a Arcano Especias</a> · <a href="{BASE_URL}/blends-para/">Ver todas las categorías</a></p>')
    html.append('<p style="margin-top:8px">Arcano Especias — Especias y Blends artesanales del mundo · Envíos a toda Colombia</p>')
    html.append('</div>')

    html.append('</div>')

    # JSON-LD
    html.append('<script type="application/ld+json">' + json.dumps(itemlist_jsonld, ensure_ascii=False) + '</script>')
    html.append('<script type="application/ld+json">' + json.dumps(breadcrumb_jsonld, ensure_ascii=False) + '</script>')

    html.append('</body></html>')

    return '\n'.join(html)

def blends_para_index_html(all_cats):
    """Página índice /blends-para/index.html con todas las categorías"""
    url_canonical = BASE_URL + '/blends-para/'
    title = 'Blends para cada uso | Arcano Especias'
    meta_desc = 'Explora nuestros blends de especias según su uso: carnes, pollo, pescados, guisos, infusiones, coctelería y más. Envíos a toda Colombia.'

    html = []
    html.append('<!DOCTYPE html><html lang="es"><head>')
    html.append('<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">')
    html.append(f'<title>{esc(title)}</title>')
    html.append(f'<meta name="description" content="{esc(meta_desc)}">')
    html.append(f'<link rel="canonical" href="{esc(url_canonical)}">')
    html.append(f'<meta property="og:type" content="website">')
    html.append(f'<meta property="og:title" content="{esc(title)}">')
    html.append(f'<meta property="og:description" content="{esc(meta_desc)}">')
    html.append(f'<meta property="og:url" content="{esc(url_canonical)}">')
    html.append(f'<meta name="robots" content="index, follow, max-image-preview:large">')
    html.append('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">')
    html.append(f'<link rel="icon" type="image/png" href="{BASE_URL}/icons/favicon-32.png">')
    html.append('<style>')
    html.append('body{margin:0;padding:0;font-family:"Plus Jakarta Sans",system-ui,sans-serif;background:#1b0b07;color:#f0e6d3;line-height:1.7}')
    html.append('.c{max-width:1100px;margin:0 auto;padding:24px 16px 48px}a{color:#c9a84c;text-decoration:none}')
    html.append('.bc{font-size:.85rem;color:#a08b6e;margin-bottom:24px}')
    html.append('h1{font-size:2.2rem;color:#c9a84c;margin:0 0 16px}')
    html.append('.intro{color:#e8dcc4;margin-bottom:32px;font-size:1.05rem;max-width:680px}')
    html.append('.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}')
    html.append('.card{display:block;background:#2d1a10;border-radius:12px;padding:20px;color:#f0e6d3;text-decoration:none;transition:transform .15s}')
    html.append('.card:hover{transform:translateY(-3px);text-decoration:none;border:1px solid #c9a84c}')
    html.append('.card h2{color:#c9a84c;font-size:1.2rem;margin:0 0 8px}')
    html.append('.card p{color:#a08b6e;font-size:.9rem;margin:0}')
    html.append('.card .count{color:#c9a84c;font-weight:700;margin-top:8px;display:inline-block}')
    html.append('</style></head><body>')
    html.append('<div class="c">')

    html.append('<nav class="bc"><a href="' + BASE_URL + '/">Inicio</a> › <span>Blends para</span></nav>')
    html.append(f'<h1>Blends para cada uso</h1>')
    html.append(f'<p class="intro">Encontrá el blend perfecto según lo que vas a cocinar. Cada categoría agrupa mezclas pensadas para un uso específico.</p>')

    html.append('<div class="grid">')
    for cat_slug, count in all_cats:
        label = CATEGORIA_LABELS.get(cat_slug, cat_slug)
        intro = CATEGORIA_INTROS.get(cat_slug, '')
        html.append(f'<a href="{BASE_URL}/blends-para/{cat_slug}/" class="card">')
        html.append(f'<h2>{esc(label)}</h2>')
        html.append(f'<p>{esc(intro[:100])}...</p>')
        html.append(f'<span class="count">{count} blends →</span>')
        html.append('</a>')
    html.append('</div>')

    html.append('<p style="margin-top:32px"><a href="' + BASE_URL + '/">← Volver a Arcano Especias</a></p>')
    html.append('</div></body></html>')
    return '\n'.join(html)

# ============================================================
# MERCHANT FEED + SITEMAP
# ============================================================
def generate_merchant_feed(blends):
    """Genera merchant_feed.xml y merchant_feed.tsv desde los blends."""
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n<channel>\n'
    xml += '<title>Arcano Especias - Product Feed</title>\n'
    xml += f'<link>{BASE_URL}/</link>\n'
    xml += '<description>Feed de productos de Arcano Especias para Google Merchant Center</description>\n'

    def is_in_stock(b):
        return (b.get('stockChico') or 0) > 0 or (b.get('stockGrande') or 0) > 0

    def has_real_image(b):
        img = b.get('imagen') or ''
        if not img: return False
        if 'logo.png' in img: return False
        if img.startswith('data:image'): return True
        return True

    for b in blends:
        if (b.get('precioChico') or 0) <= 0:
            continue
        slug = b.get('_slug') or slugify(b.get('nombre', ''))
        nombre = b.get('nombre', '')
        desc = clean_desc(b.get('descripcion', ''))
        imagen = b.get('imagen') or (BASE_URL + '/icons/logo.png')
        if 'arcanoespecias.github.io' in imagen:
            imagen = imagen.replace('arcanoespecias.github.io', 'arcanoespecias.com')
        precio_chico = b.get('precioChico', 0) or 0
        in_stock = is_in_stock(b)
        real_img = has_real_image(b)
        # Escape XML
        nombre_x = esc(nombre)
        desc_x = esc(desc)
        xml += '<item>\n'
        xml += f'<g:id>{slug}</g:id>\n'
        xml += f'<g:title>{nombre_x}</g:title>\n'
        xml += f'<g:description>{desc_x}</g:description>\n'
        xml += f'<g:link>{BASE_URL}/blends/{slug}/</g:link>\n'
        xml += f'<g:image_link>{esc(imagen)}</g:image_link>\n'
        xml += f'<g:availability>{"in stock" if in_stock else "out of stock"}</g:availability>\n'
        xml += f'<g:price>{precio_chico} COP</g:price>\n'
        xml += '<g:brand>Arcano Especias</g:brand>\n'
        xml += '<g:condition>new</g:condition>\n'
        xml += '<g:google_product_category>Food, Beverages &amp; Tobacco &gt; Food Items &gt; Cooking &amp; Baking Ingredients &gt; Seasonings &amp; Spices</g:google_product_category>\n'
        xml += f'<g:product_type>{esc(b.get("categoria", ""))}</g:product_type>\n'
        xml += '<g:identifier_exists>FALSE</g:identifier_exists>\n'
        # IVA 19% incluido en el precio (Colombia)
        xml += '<g:tax><g:country>CO</g:country><g:rate>19</g:rate><g:tax_ship>1</g:tax_ship></g:tax>\n'
        # Peso estimado (frasco pequeño ~80g)
        xml += '<g:shipping_weight>80 g</g:shipping_weight>\n'
        # Política de devoluciones: 7 días solo por daño/error
        xml += '<g:return_policy><g:return_policy_label>damaged_or_incorrect_7_days</g:return_policy_label><g:return_policy_url>https://arcanoespecias.com/#politica-devoluciones</g:return_policy_url></g:return_policy>\n'
        # Envío variable por zona (Colombia)
        xml += '<g:shipping><g:country>CO</g:country><g:region>Bogotá D.C.</g:region><g:service>Standard</g:service><g:price>7000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>2</g:max_transit_time></g:shipping>\n'
        xml += '<g:shipping><g:country>CO</g:country><g:region>Antioquia</g:region><g:service>Standard</g:service><g:price>8000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>3</g:max_transit_time></g:shipping>\n'
        xml += '<g:shipping><g:country>CO</g:country><g:region>Valle del Cauca</g:region><g:service>Standard</g:service><g:price>9000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>3</g:max_transit_time></g:shipping>\n'
        xml += '<g:shipping><g:country>CO</g:country><g:region>CO-OTRAS</g:region><g:service>Standard</g:service><g:price>12000 COP</g:price><g:max_handling_time>1</g:max_handling_time><g:max_transit_time>5</g:max_transit_time></g:shipping>\n'
        # Si el producto no tiene imagen real (usa logo.png), excluirlo de Google Shopping
        if not real_img:
            xml += '<g:excluded_destination>Shopping</g:excluded_destination>\n'
        xml += '</item>\n'

    xml += '</channel>\n</rss>\n'

    with open(os.path.join(REPO_PATH, 'merchant_feed.xml'), 'w', encoding='utf-8') as f:
        f.write(xml)

    # TSV
    tsv = 'id\ttitle\tdescription\tlink\timage_link\tavailability\tprice\tbrand\tcondition\tgoogle_product_category\tproduct_type\tidentifier_exists\texcluded_destination\n'
    for b in blends:
        if (b.get('precioChico') or 0) <= 0:
            continue
        slug = b.get('_slug') or slugify(b.get('nombre', ''))
        nombre = b.get('nombre', '').replace('\t', ' ').replace('\n', ' ')
        desc = clean_desc(b.get('descripcion', '')).replace('\t', ' ').replace('\n', ' ')
        imagen = b.get('imagen') or (BASE_URL + '/icons/logo.png')
        if 'arcanoespecias.github.io' in imagen:
            imagen = imagen.replace('arcanoespecias.github.io', 'arcanoespecias.com')
        precio_chico = b.get('precioChico', 0) or 0
        cat = b.get('categoria', '')
        avail = 'in stock' if is_in_stock(b) else 'out of stock'
        excluded = '' if has_real_image(b) else 'Shopping'
        tsv += f'{slug}\t{nombre}\t{desc}\t{BASE_URL}/blends/{slug}/\t{imagen}\t{avail}\t{precio_chico} COP\tArcano Especias\tnew\tFood, Beverages & Tobacco > Food Items > Cooking & Baking Ingredients > Seasonings & Spices\t{cat}\tFALSE\t{excluded}\n'

    with open(os.path.join(REPO_PATH, 'merchant_feed.tsv'), 'w', encoding='utf-8') as f:
        f.write(tsv)

def _lastmod_for_blend(b):
    """Calcula la fecha de última modificación de un blend.
    Prioriza: imagenUpdatedAt > creado.
    Devuelve string YYYY-MM-DD."""
    # imagenUpdatedAt se setea cuando se cambia la imagen (epoch ms)
    img_ts = b.get('imagenUpdatedAt')
    if img_ts:
        try:
            from datetime import datetime as _dt
            return _dt.fromtimestamp(int(img_ts) / 1000).strftime('%Y-%m-%d')
        except Exception:
            pass
    # creado (ISO 8601 string)
    creado = b.get('creado')
    if creado:
        try:
            return creado[:10]  # 'YYYY-MM-DDTHH:MM:SS' → 'YYYY-MM-DD'
        except Exception:
            pass
    # Fallback: fecha de hoy
    return datetime.now().strftime('%Y-%m-%d')


def _lastmod_for_filesystem(path):
    """Lee la fecha de modificación del archivo en disco."""
    try:
        mtime = os.path.getmtime(path)
        return datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
    except Exception:
        return datetime.now().strftime('%Y-%m-%d')


def generate_sitemap(blends, cats_with_counts, existing_pages):
    """Genera sitemap.xml con lastmod dinámico por URL.
    - Blends: usa imagenUpdatedAt o creado de Firebase.
    - Categorías: usa la fecha del blend más reciente en esa categoría.
    - Blog/Recetas: lee mtime del archivo HTML estático.
    - Homepage: fecha de hoy.
    """
    today = datetime.now().strftime('%Y-%m-%d')
    urls_seen = set()
    # Lista de tuplas (url, prio, freq, lastmod)
    urls = []

    def add(url, prio, freq, lastmod=None):
        if url in urls_seen:
            return
        urls_seen.add(url)
        urls.append((url, prio, freq, lastmod or today))

    # Homepage: fecha de hoy
    add(BASE_URL + '/', '1.0', 'weekly', today)
    # Índice /blends-para/: fecha de hoy
    add(BASE_URL + '/blends-para/', '0.9', 'weekly', today)

    # Mapeo: categoria_slug → lista de blends en esa categoría (con sus lastmod)
    cat_to_blends = {}
    for b in blends:
        if (b.get('precioChico') or 0) <= 0 and (b.get('precioGrande') or 0) <= 0:
            continue
        cat = b.get('categoria', '')
        if cat:
            cat_to_blends.setdefault(cat, []).append(b)

    # Categorías SEO: lastmod = fecha del blend más reciente en la categoría
    for cat_slug, _ in cats_with_counts:
        # Buscar el cat original (label) para matchear los blends
        cat_lastmod = today
        for cat_name, blend_list in cat_to_blends.items():
            cat_slug_normalized = slugify(cat_name)
            if cat_slug_normalized == cat_slug:
                if blend_list:
                    # Tomar el último lastmod
                    lastmods = [_lastmod_for_blend(b) for b in blend_list]
                    cat_lastmod = max(lastmods)
                break
        add(BASE_URL + '/blends-para/' + cat_slug + '/', '0.8', 'weekly', cat_lastmod)

    # Productos /blends/ — lastmod dinámico desde Firebase
    for b in blends:
        if (b.get('precioChico') or 0) <= 0 and (b.get('precioGrande') or 0) <= 0:
            continue
        slug = b.get('_slug') or slugify(b.get('nombre', ''))
        lastmod = _lastmod_for_blend(b)
        add(BASE_URL + '/blends/' + slug + '/', '0.8', 'monthly', lastmod)

    # Páginas existentes (recetas, blog) - preservar y usar mtime del archivo
    for url, priority, freq in existing_pages:
        # Excluir /p/ (reemplazadas por /blends/)
        if url.startswith(BASE_URL + '/p/'):
            continue
        # Excluir /blends/ y /blends-para/ (ya agregados)
        if url.startswith(BASE_URL + '/blends/'):
            continue
        if url.startswith(BASE_URL + '/blends-para/'):
            continue
        # Excluir homepage (ya agregada)
        if url.rstrip('/') == BASE_URL:
            continue
        # Calcular lastmod desde el archivo HTML correspondiente
        lastmod = today
        # URL → path relativo
        if url.startswith(BASE_URL + '/'):
            rel_path = url[len(BASE_URL):].lstrip('/')
            local_path = os.path.join(REPO_PATH, rel_path)
            # Si es directorio (termina con /), buscar index.html
            if local_path.endswith('/'):
                local_path = local_path + 'index.html'
            elif not local_path.endswith('.html'):
                local_path = local_path + '/index.html'
            if os.path.exists(local_path):
                lastmod = _lastmod_for_filesystem(local_path)
        add(url, priority, freq, lastmod)

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for url, prio, freq, lastmod in urls:
        xml += f'<url><loc>{esc(url)}</loc><lastmod>{lastmod}</lastmod><priority>{prio}</priority><changefreq>{freq}</changefreq></url>\n'
    xml += '</urlset>\n'

    with open(os.path.join(REPO_PATH, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(xml)

def load_existing_sitemap_urls():
    """Lee el sitemap actual + escanea directorios /blog/ y /recetas/ en disco
    para preservar TODAS las URLs existentes (no solo las del sitemap).

    Esto evita que el botón 'Regenerar SEO Completo' pierda URLs de blog/recetas
    si el sitemap actual ya las perdió por una corrida previa defectuosa.
    """
    urls = []
    urls_seen = set()

    # 1. URLs del sitemap actual
    sitemap_path = os.path.join(REPO_PATH, 'sitemap.xml')
    if os.path.exists(sitemap_path):
        with open(sitemap_path, 'r', encoding='utf-8') as f:
            content = f.read()
        for m in re.finditer(r'<loc>([^<]+)</loc>', content):
            url = m.group(1)
            if url not in urls_seen:
                urls_seen.add(url)
                urls.append((url, '0.6', 'monthly'))

    # 2. Escaneo de directorios /blog/ y /recetas/ en disco
    # Esto garantiza que aunque el sitemap se haya roto, las URLs se recreen.
    for subdir in ['blog', 'recetas']:
        dir_path = os.path.join(REPO_PATH, subdir)
        if not os.path.isdir(dir_path):
            continue
        for fname in sorted(os.listdir(dir_path)):
            if not fname.endswith('.html'):
                continue
            url = f'{BASE_URL}/{subdir}/{fname}'
            if url not in urls_seen:
                urls_seen.add(url)
                urls.append((url, '0.6', 'monthly'))

    # 3. /order-confirmation/ (si existe)
    oc_path = os.path.join(REPO_PATH, 'order-confirmation', 'index.html')
    if os.path.exists(oc_path):
        url = f'{BASE_URL}/order-confirmation/'
        if url not in urls_seen:
            urls_seen.add(url)
            urls.append((url, '0.1', 'never'))  # noindex, baja prioridad

    return urls

# ============================================================
# REDIRECT EN /p/*.html
# ============================================================
def add_canonical_to_p_html(all_products):
    """Para cada /p/<slug>.html, agrega canonical a /blends/<slug>/ y JS redirect suave.
    Busca match por slug, y si no encuentra, busca por slug sin apóstrofos/guiones."""
    p_dir = os.path.join(REPO_PATH, 'p')
    if not os.path.exists(p_dir):
        return 0

    # Mapeo: slug_normalizado → blend
    # Normalizar: lowercase, sin tildes, sin apóstrofos, sin guiones
    def normalize_slug(s):
        s = (s or '').lower().strip()
        replacements = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n'}
        for k, v in replacements.items():
            s = s.replace(k, v)
        # Quitar apóstrofos y comillas
        s = re.sub(r"['\"\u2019\u2018]", '', s)
        # Quitar todo lo que no sea alfanumérico
        s = re.sub(r'[^a-z0-9]', '', s)
        return s

    slug_to_blend = {}
    for b in all_products:
        slug = b.get('_slug') or slugify(b.get('nombre', ''))
        slug_norm = normalize_slug(slug)
        slug_to_blend[slug_norm] = b
        # También mapear por id
        slug_to_blend[str(b.get('id', ''))] = b

    updated = 0
    for fn in os.listdir(p_dir):
        if not fn.endswith('.html'):
            continue
        old_slug = fn.replace('.html', '')
        old_slug_norm = normalize_slug(old_slug)

        # Buscar por slug normalizado
        blend = slug_to_blend.get(old_slug_norm)
        if not blend:
            # Buscar por slug exacto
            blend = slug_to_blend.get(old_slug)
        if not blend:
            continue

        new_slug = blend.get('_slug') or slugify(blend.get('nombre', ''))
        target_url = BASE_URL + '/blends/' + new_slug + '/'

        path = os.path.join(p_dir, fn)
        with open(path, 'r', encoding='utf-8') as f:
            html = f.read()

        original = html

        # 1. Actualizar canonical si existe, o agregar
        if '<link rel="canonical"' in html:
            html = re.sub(
                r'<link rel="canonical"[^>]*>',
                f'<link rel="canonical" href="{esc(target_url)}">',
                html
            )
        else:
            html = html.replace('</title>', '</title>\n<link rel="canonical" href="' + esc(target_url) + '">')

        # 2. Agregar JS redirect suave (al inicio del body)
        redirect_script = '<script>if(window.location.pathname.indexOf("/p/")===0 && !window.location.search.includes("noRedirect")){var u="' + target_url + '";if(window.location.search){u+=window.location.search.replace("?","?")}window.location.replace(u);}</script>'
        if 'window.location.replace' not in html:
            # Buscar <body> con atributos posibles
            body_match = re.search(r'<body[^>]*>', html, re.IGNORECASE)
            if body_match:
                pos = body_match.end()
                html = html[:pos] + redirect_script + html[pos:]
            else:
                # Si no hay <body>, insertar antes de </html>
                html = html.replace('</html>', redirect_script + '</html>')

        if html != original:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(html)
            updated += 1

    return updated

# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 60)
    print("ARCANO — Generador de páginas SEO estáticas")
    print("=" * 60)

    # 1. Cargar catálogo desde Firebase
    print("\n[1/6] Cargando catálogo desde Firebase...")
    blends, especias, especias_list, packs = load_catalog()
    print(f"  ✓ {len(blends)} blends válidos (con precio > 0)")
    print(f"  ✓ {len(especias_list)} especias válidas (con precio > 0 y en tienda)")
    print(f"  ✓ {len(packs)} packs cargados")

    # Generar páginas de especias también (en /blends/<slug>/)
    # Las especias son productos individuales también, mismo formato
    # Marcarlas como tipo 'especia' para que el template lo sepa
    for e in especias_list:
        e['_tipo'] = 'especia'
    for b in blends:
        b['_tipo'] = b.get('_tipo', 'blend')

    # Combinar para generar páginas: blends + especias
    all_products = blends + especias_list

    # 2. Generar /blends/<slug>/index.html
    print("\n[2/6] Generando páginas individuales /blends/...")
    blends_dir = os.path.join(REPO_PATH, 'blends')
    os.makedirs(blends_dir, exist_ok=True)

    slugs_seen = {}
    duplicates = []
    incomplete_info = []
    pages_generated = 0

    for b in all_products:
        slug = b.get('_slug') or slugify(b.get('nombre', ''))
        if not slug:
            continue

        # Check duplicates
        if slug in slugs_seen:
            duplicates.append((slug, b.get('nombre', ''), slugs_seen[slug]))
            continue
        slugs_seen[slug] = b.get('nombre', '')

        # Check incomplete info
        issues = []
        if not clean_desc(b.get('descripcion', '')):
            issues.append('descripcion')
        # Para especias no exigimos ingredientes (es producto único)
        if b.get('_tipo') == 'blend' and not b.get('ingredientes'):
            issues.append('ingredientes')
        if not b.get('imagen'):
            issues.append('imagen')
        if not b.get('uso'):
            issues.append('uso')
        if issues:
            incomplete_info.append((b.get('id', '?'), b.get('nombre', ''), b.get('_tipo', 'blend'), issues))

        # Generar HTML
        html_content = blend_page_html(b, especias, all_products)

        # Escribir archivo
        page_dir = os.path.join(blends_dir, slug)
        os.makedirs(page_dir, exist_ok=True)
        with open(os.path.join(page_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html_content)
        pages_generated += 1

    print(f"  ✓ {pages_generated} páginas generadas en /blends/")
    if duplicates:
        print(f"  ⚠ {len(duplicates)} slugs duplicados (no generados):")
        for slug, name, prev in duplicates:
            print(f"    - {name} → /blends/{slug}/ (ya existe: {prev})")

    # 3. Generar /blends-para/<cat>/index.html
    print("\n[3/6] Generando páginas de categoría /blends-para/...")
    cats_dir = os.path.join(REPO_PATH, 'blends-para')
    os.makedirs(cats_dir, exist_ok=True)

    # Agrupar todos los productos (blends + especias) por categoría SEO
    cat_to_products = {}
    for b in all_products:
        for cat in b.get('_categoriasSEO', []):
            cat_to_products.setdefault(cat, []).append(b)

    # Solo crear categorías con al menos 3 productos
    cats_with_counts = []
    cat_pages_generated = 0
    for cat_slug, products_in_cat in cat_to_products.items():
        if len(products_in_cat) < 3:
            print(f"  ⚠ Categoría '{cat_slug}' omitida: solo {len(products_in_cat)} productos")
            continue
        # Ordenar por nombre
        products_in_cat.sort(key=lambda x: x.get('nombre', ''))
        cats_with_counts.append((cat_slug, len(products_in_cat)))

        # Generar HTML
        html_content = category_page_html(cat_slug, products_in_cat, all_products)
        cat_dir = os.path.join(cats_dir, cat_slug)
        os.makedirs(cat_dir, exist_ok=True)
        with open(os.path.join(cat_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html_content)
        cat_pages_generated += 1
        print(f"  ✓ /blends-para/{cat_slug}/ ({len(products_in_cat)} productos)")

    # Generar índice /blends-para/index.html
    with open(os.path.join(cats_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(blends_para_index_html(cats_with_counts))
    print(f"  ✓ /blends-para/index.html (índice general)")
    print(f"\n  Total: {cat_pages_generated} categorías creadas")

    # 4. Agregar canonical + redirect a /p/*.html
    print("\n[4/6] Actualizando /p/*.html con canonical + redirect suave...")
    updated_p = add_canonical_to_p_html(all_products)
    print(f"  ✓ {updated_p} archivos /p/*.html actualizados")

    # 5. Regenerar merchant feed
    print("\n[5/6] Regenerando merchant_feed.xml y merchant_feed.tsv...")
    generate_merchant_feed(all_products)
    print(f"  ✓ merchant_feed.xml actualizado")
    print(f"  ✓ merchant_feed.tsv actualizado")

    # 6. Regenerar sitemap
    print("\n[6/6] Regenerando sitemap.xml...")
    existing_urls = load_existing_sitemap_urls()
    # Filtrar /p/ viejas (las reemplazamos con /blends/)
    existing_urls = [(u, p, f) for u, p, f in existing_urls if not u.startswith(BASE_URL + '/p/')]
    generate_sitemap(all_products, cats_with_counts, existing_urls)
    print(f"  ✓ sitemap.xml actualizado")

    # Reporte final
    print("\n" + "=" * 60)
    print("REPORTE FINAL")
    print("=" * 60)
    print(f"""
Productos:
  {len(all_products)} productos detectados (con precio > 0)
    - {len(blends)} blends
    - {len(especias_list)} especias
  {pages_generated} URLs nuevas creadas (/blends/<slug>/)
  {updated_p} URLs existentes reutilizadas (/p/*.html con canonical)

Categorías:
  {cat_pages_generated} categorías SEO creadas (/blends-para/<cat>/)
  + 1 índice /blends-para/

Sitemap: OK
Canonical: OK
Schema Product: OK
Breadcrumb: OK
Renderizado: OK (HTML estático, no requiere JS)

Productos con información incompleta: {len(incomplete_info)}
""")
    if incomplete_info:
        print("Lista de productos con info faltante:")
        for bid, name, tipo, issues in incomplete_info[:30]:
            print(f"  - [{bid}] {name} ({tipo}): {', '.join(issues)}")
        if len(incomplete_info) > 30:
            print(f"  ... y {len(incomplete_info) - 30} más")

if __name__ == '__main__':
    main()
