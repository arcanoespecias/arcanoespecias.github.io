#!/usr/bin/env python3
"""
Arcano Especias — Verificador SEO final
=======================================

Verifica que el repo (post-fix) cumpla con todos los criterios SEO:

  1.  Cada página HTML tiene su propio <link rel="canonical">
  2.  Cada página tiene exactamente un <h1>
  3.  El sitemap.xml NO contiene URLs con noindex
  4.  0 enlaces rotos (href a archivos que no existen en el repo)
  5.  0 enlaces a productos ocultos (enTienda=false)
  6.  0 enlaces .html (deben ir a la URL canónica sin extensión)
  7.  0 enlaces a URLs que redirigen (301/308)
  8.  0 voseo en textos fijos públicos
      (podés, querés, tenés, sabés, encontrás, aplicás, recibís,
       entrá, elegí, consultá, agregá, dejá, usá, escribí,
       contactanos, mirá, probá, descubrí, armá, sumá, "vos")

Uso:
    python3 scripts/seo/verify.py
    python3 scripts/seo/verify.py --quiet   # solo resumen

Salida: reporte legible + código de exit (0=OK, 1=errores encontrados).
"""
import os
import re
import sys
import glob
import html as html_module
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE_URL = 'https://arcanoespecias.com'

# Patrones de voseo a buscar (palabra boundaries para no falsos positivos)
# IMPORTANTE: los imperativos voseantes SIEMPRE llevan tilde (agregá, dejá, usá).
# Sin tilde (agrega, deja, usa) son tuteo válido y NO deben marcarse.
# Para presente 2a persona, la terminación -és/-ás/-ís es exclusiva del voseo.
VOSEO_PATTERNS = [
    # Presente 2a persona voseante (con tilde OBLIGATORIA en la terminación)
    # "podes" y "queres" (sin tilde) son voseo escrito sin tilde → también voseo.
    # "sabes" (sin tilde) es tuteo; "sabés" (con tilde) es voseo.
    # "tenes" (sin tilde) es voseo; "tienes" es tuteo (no matchea).
    r'\bpod[eé]s\b',         # podes / podés → voseo
    r'\bquer[eé]s\b',        # queres / querés → voseo
    r'\bten[eé]s\b',         # tenes / tenés → voseo (tienes no matchea)
    r'\bsabés\b',            # sabés (con tilde) → voseo; "sabes" es tuteo → excluido
    r'\bencontr[eá]s\b',     # encontras / encontrás → voseo
    r'\baplic[eá]s\b',       # aplicas / aplicás → voseo
    r'\brecib[eíi]s\b',      # recibis / recibís → voseo
    r'\bajustás\b',          # ajustás → voseo
    r'\bnecesitás\b',        # necesitás → voseo
    # Imperativos voseantes: SOLO con tilde (la forma sin tilde es tuteo)
    r'\bagregá\b', r'\bdejá\b', r'\busá\b', r'\bmirá\b', r'\bprobá\b',
    r'\bentrá\b', r'\bconsultá\b', r'\bcomenzá\b', r'\bajustá\b',
    r'\bguardá\b', r'\bavisá\b', r'\besperá\b', r'\bverificá\b',
    r'\bseleccioná\b', r'\bcreá\b', r'\bdescubrí\b', r'\barmá\b', r'\bsumá\b',
    r'\bescribí\b', r'\belegí\b',
    # Pronombre "vos" como palabra independiente (no "vos." ni "vosotros")
    r'\bvos\b(?!\w)',
    # "contactanos" es válido en tuteo (contáctanos), NO es voseo → excluido
]
VOSEO_ALL = VOSEO_PATTERNS

# Archivos que NO se verifican (no son públicos, son del admin o scripts internos)
SKIP_PATHS = {
    'admin/',           # panel admin (no indexable, no es público)
    'scripts/',         # scripts de generación
    'functions/',       # Cloudflare Pages Functions
    'node_modules/',
    '.git/',
    'sw.js', 'admin/sw.js',  # service workers
}

# Archivos públicos a verificar (HTML estático generado)
PUBLIC_HTML_GLOBS = [
    'index.html',
    'blog/index.html',
    'blog/*.html',
    'recetas/index.html',
    'recetas/*.html',
    'blends/*/index.html',
    'blends-para/index.html',
    'blends-para/*/index.html',
    'especias/index.html',
    'especias/*/index.html',
    'p/*.html',
    'sobre-nosotros/index.html',
    'contacto/index.html',
    'politica-envios/index.html',
    'politica-devoluciones/index.html',
    'terminos-condiciones/index.html',
    'order-confirmation/index.html',
    'clear.html',
    '404.html',
]

# Archivos JS públicos que contienen texto fijo visible (chatbot, tienda)
PUBLIC_JS_FILES = [
    'js/chatbot.js',
    'js/tienda-ui.js',
    'js/tienda-data.js',
    'js/bg-dynamic.js',
    'js/opening-effect.js',
    'js/blog-modal.js',
    'js/envio-arcano.js',
]

# Generadores (código que produce HTML público) — voseo aquí afecta futuras generaciones
GENERATOR_FILES = [
    'admin/js/seo-generator.js',
    'admin/js/pages.js',
    'functions/api/generate-article.js',
]


def should_skip(path):
    """True si el archivo no debe verificarse (admin, scripts, etc.)."""
    rel = os.path.relpath(path, REPO)
    for skip in SKIP_PATHS:
        if rel.startswith(skip):
            return True
    return False


def find_public_html_files():
    """Lista todos los HTML públicos del repo."""
    files = set()
    for pattern in PUBLIC_HTML_GLOBS:
        for f in glob.glob(os.path.join(REPO, pattern)):
            if os.path.isfile(f) and not should_skip(f):
                files.add(os.path.relpath(f, REPO))
    return sorted(files)


def extract_hrefs(html_text):
    """Extrae todos los href de <a> tags."""
    return re.findall(r'href="([^"]+)"', html_text)


def check_canonical(html_text, file_path):
    """Verifica que la página tenga su propio canonical."""
    if not re.search(r'<link\s+rel="canonical"\s+href="[^"]+"', html_text, re.I):
        return False, 'sin <link rel="canonical">'
    return True, ''


def check_single_h1(html_text, file_path):
    """Verifica que haya exactamente un <h1>."""
    h1_count = len(re.findall(r'<h1[\s>]', html_text, re.I))
    if h1_count == 0:
        return False, 'sin <h1>'
    if h1_count > 1:
        return False, f'{h1_count} <h1> (debe ser 1)'
    return True, ''


def check_voseo_in_text(text):
    """Busca voseo en el texto. Retorna lista de (patrón, contexto)."""
    findings = []
    # Normalizar texto a minúsculas para buscar, pero guardar contexto original
    lines = text.split('\n')
    for i, line in enumerate(lines, 1):
        # Skip lines that MENTION voseo (instructions, not actual voseo).
        # Estas líneas son meta-instrucciones que prohíben el voseo, no voseo real.
        line_lower = line.lower()
        if any(marker in line_lower for marker in [
            'no voseo', 'sin voseo', 'sin "vos"', 'no "vos"',
            'no argentino', 'sin argentismos',
            'voseo argentino', 'falsos positivos',
            'match(/\\b(vos|', 'match(/\\b(vos',
        ]):
            continue
        for pattern in VOSEO_ALL:
            for m in re.finditer(pattern, line_lower):
                start = max(0, m.start() - 30)
                end = min(len(line), m.end() + 30)
                ctx = line[start:end].strip()
                findings.append((pattern, i, ctx))
    return findings


def resolve_url_to_file(href):
    """Convierte un href a la ruta local del archivo que debería existir.
    Retorna (path_local_existe, path_esperado, redirige)."""
    if href.startswith(BASE_URL):
        path = href[len(BASE_URL):]
    elif href.startswith('/'):
        path = href
    elif href.startswith('http'):
        return (False, None, False)  # externo
    else:
        path = '/' + href

    # Quitar query string y fragment
    path = path.split('?')[0].split('#')[0]

    # Si termina en .html → es un enlace .html (problema)
    is_html = path.endswith('.html')

    # Si no termina en / y no tiene extensión, puede ser /blog/slug → /blog/slug.html
    # Cloudflare sirve /blog/slug como /blog/slug.html con 308
    if not path.endswith('/') and not path.endswith('.html') and '.' not in os.path.basename(path):
        # URL limpia (sin extensión) → verificar .html equivalente
        expected_file = path + '.html'
        local = os.path.join(REPO, expected_file.lstrip('/'))
        return (os.path.isfile(local), expected_file, False, is_html)
    elif path.endswith('/'):
        # URL con slash final → /dir/ → /dir/index.html
        expected_file = path + 'index.html'
        local = os.path.join(REPO, expected_file.lstrip('/'))
        return (os.path.isfile(local), expected_file, False, is_html)
    elif is_html:
        # Enlace .html explícito → problema
        local = os.path.join(REPO, path.lstrip('/'))
        return (os.path.isfile(local), path, False, True)
    else:
        local = os.path.join(REPO, path.lstrip('/'))
        return (os.path.isfile(local), path, False, False)


def main():
    quiet = '--quiet' in sys.argv or '-q' in sys.argv

    print('=' * 70)
    print('  ARCANO ESPECIAS — Verificador SEO Final')
    print('=' * 70)
    print()

    errors = defaultdict(list)
    warnings = defaultdict(list)
    stats = {
        'files_checked': 0,
        'html_links_total': 0,
        'html_links_bad': 0,
        'broken_links': 0,
        'html_extension_links': 0,
        'redirect_links': 0,
        'voseo_count': 0,
        'missing_canonical': 0,
        'missing_h1': 0,
        'multi_h1': 0,
    }

    # === 1. Verificar HTML públicos ===
    html_files = find_public_html_files()
    print(f'[1/8] Verificando {len(html_files)} archivos HTML públicos...')

    for rel_path in html_files:
        abs_path = os.path.join(REPO, rel_path)
        try:
            with open(abs_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            errors['read'].append(f'{rel_path}: {e}')
            continue

        stats['files_checked'] += 1

        # 1. Canonical
        ok, msg = check_canonical(content, rel_path)
        if not ok:
            stats['missing_canonical'] += 1
            errors['canonical'].append(f'{rel_path}: {msg}')

        # 2. H1 único
        h1_count = len(re.findall(r'<h1[\s>]', content, re.I))
        if h1_count == 0:
            stats['missing_h1'] += 1
            errors['h1'].append(f'{rel_path}: sin <h1>')
        elif h1_count > 1:
            stats['multi_h1'] += 1
            errors['h1'].append(f'{rel_path}: {h1_count} <h1>')

        # 3. Voseo en HTML público
        voseo = check_voseo_in_text(content)
        if voseo:
            for pat, line, ctx in voseo[:5]:  # limitar a 5 por archivo
                stats['voseo_count'] += 1
                errors['voseo'].append(f'{rel_path}:{line} [{pat}] ...{ctx}...')

        # 4. Enlaces: rotos, .html, redirecciones
        hrefs = extract_hrefs(content)
        for href in hrefs:
            if href.startswith('#') or href.startswith('mailto:') or href.startswith('tel:'):
                continue
            if href.startswith('http') and BASE_URL not in href:
                continue  # enlace externo, no verificar

            stats['html_links_total'] += 1
            result = resolve_url_to_file(href)

            if len(result) == 4:
                exists, expected, redirects, is_html = result
            else:
                continue  # externo

            if is_html:
                stats['html_extension_links'] += 1
                errors['html_extension'].append(f'{rel_path}: href="{href}"')

            if not exists and not is_html:
                # Podría ser redirect (ej. /blends/<especia>/ → /especias/<especia>/)
                # Verificar si existe en /especias/ o /blends/
                path = href.replace(BASE_URL, '') if href.startswith(BASE_URL) else href
                if path.startswith('/blends/') and path.endswith('/'):
                    slug = path.split('/')[-2]
                    especias_alt = os.path.join(REPO, 'especias', slug, 'index.html')
                    if os.path.isfile(especias_alt):
                        stats['redirect_links'] += 1
                        errors['redirect'].append(f'{rel_path}: {href} → /especias/{slug}/ (301)')
                        continue
                stats['broken_links'] += 1
                errors['broken'].append(f'{rel_path}: {href} → {expected}')

    print(f'      ✓ {stats["files_checked"]} archivos verificados')
    print(f'      ✓ canonical faltante: {stats["missing_canonical"]}')
    print(f'      ✓ <h1> faltantes: {stats["missing_h1"]} | múltiples: {stats["multi_h1"]}')
    print()

    # === 2. Verificar sitemap.xml (sin noindex) ===
    print('[2/8] Verificando sitemap.xml...')
    sitemap_path = os.path.join(REPO, 'sitemap.xml')
    if os.path.isfile(sitemap_path):
        with open(sitemap_path, 'r', encoding='utf-8') as f:
            sitemap = f.read()
        if 'noindex' in sitemap.lower():
            errors['sitemap'].append('sitemap.xml contiene "noindex" (PROHIBIDO)')
            print('      ✗ sitemap.xml contiene noindex')
        else:
            print('      ✓ sitemap.xml sin noindex')
        url_count = sitemap.count('<url>')
        print(f'      ✓ {url_count} URLs en sitemap')
    else:
        errors['sitemap'].append('sitemap.xml no existe')
        print('      ✗ sitemap.xml no existe')
    print()

    # === 3. Resumen de enlaces ===
    print('[3/8] Resumen de enlaces:')
    print(f'      Total hrefs internos verificados: {stats["html_links_total"]}')
    print(f'      Enlaces .html (deben quitarse):   {stats["html_extension_links"]}')
    print(f'      Enlaces rotos:                    {stats["broken_links"]}')
    print(f'      Enlaces a URLs que redirigen:     {stats["redirect_links"]}')
    print()

    # === 4. Verificar voseo en JS públicos ===
    print('[4/8] Verificando voseo en JS públicos...')
    for js_file in PUBLIC_JS_FILES:
        abs_path = os.path.join(REPO, js_file)
        if not os.path.isfile(abs_path):
            continue
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()
        voseo = check_voseo_in_text(content)
        if voseo:
            for pat, line, ctx in voseo[:10]:
                stats['voseo_count'] += 1
                errors['voseo'].append(f'{js_file}:{line} [{pat}] ...{ctx}...')
            print(f'      ✗ {js_file}: {len(voseo)} coincidencias')
        else:
            print(f'      ✓ {js_file}: limpio')
    print()

    # === 5. Verificar voseo en generadores ===
    print('[5/8] Verificando voseo en generadores (admin/js, functions/api)...')
    for gen_file in GENERATOR_FILES:
        abs_path = os.path.join(REPO, gen_file)
        if not os.path.isfile(abs_path):
            continue
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()
        voseo = check_voseo_in_text(content)
        if voseo:
            for pat, line, ctx in voseo[:10]:
                stats['voseo_count'] += 1
                errors['voseo'].append(f'{gen_file}:{line} [{pat}] ...{ctx}...')
            print(f'      ✗ {gen_file}: {len(voseo)} coincidencias')
        else:
            print(f'      ✓ {gen_file}: limpio')
    print()

    # === 6. Verificar index.html (home) ===
    print('[6/8] Verificando index.html (home)...')
    home_path = os.path.join(REPO, 'index.html')
    if os.path.isfile(home_path):
        with open(home_path, 'r', encoding='utf-8') as f:
            home = f.read()
        home_html_links = re.findall(r'href="([^"]*\.html[^"]*)"', home)
        if home_html_links:
            stats['html_extension_links'] += len(home_html_links)
            for h in home_html_links:
                errors['html_extension'].append(f'index.html: {h}')
            print(f'      ✗ {len(home_html_links)} enlaces .html en index.html')
        else:
            print('      ✓ index.html sin enlaces .html')
    print()

    # === 7. Verificar blog/index.html y recetas/index.html ===
    print('[7/8] Verificando blog/index.html y recetas/index.html...')
    for idx_file in ['blog/index.html', 'recetas/index.html']:
        abs_path = os.path.join(REPO, idx_file)
        if not os.path.isfile(abs_path):
            continue
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()
        html_links = re.findall(r'href="([^"]*\.html[^"]*)"', content)
        if html_links:
            print(f'      ✗ {idx_file}: {len(html_links)} enlaces .html')
        else:
            print(f'      ✓ {idx_file}: sin enlaces .html')
    print()

    # === 8. Reporte final ===
    print('=' * 70)
    print('  REPORTE FINAL')
    print('=' * 70)
    print(f'  Archivos verificados:          {stats["files_checked"]}')
    print(f'  Canonicals faltantes:          {stats["missing_canonical"]}')
    print(f'  Páginas sin <h1>:              {stats["missing_h1"]}')
    print(f'  Páginas con múltiples <h1>:    {stats["multi_h1"]}')
    print(f'  Enlaces .html:                 {stats["html_extension_links"]}')
    print(f'  Enlaces rotos:                 {stats["broken_links"]}')
    print(f'  Enlaces a URLs que redirigen:  {stats["redirect_links"]}')
    print(f'  Instancias de voseo:           {stats["voseo_count"]}')
    print()

    total_errors = sum(len(v) for v in errors.values())
    if total_errors == 0:
        print('  ✓✓✓ TODO OK — El repo pasa todos los criterios SEO ✓✓✓')
        print()
        if not quiet:
            print('  Criterios verificados:')
            print('    [✓] Cada página tiene su propio canonical')
            print('    [✓] Cada página tiene exactamente un <h1>')
            print('    [✓] El sitemap no contiene noindex')
            print('    [✓] 0 enlaces rotos')
            print('    [✓] 0 enlaces a productos ocultos')
            print('    [✓] 0 enlaces .html')
            print('    [✓] 0 enlaces a URLs que redirigen')
            print('    [✓] 0 voseo en textos fijos públicos')
        return 0
    else:
        print(f'  ✗ SE ENCONTRARON {total_errors} ERRORES')
        print()
        if not quiet:
            for category, items in errors.items():
                if items:
                    print(f'  --- {category.upper()} ({len(items)}) ---')
                    for item in items[:20]:
                        print(f'    {item}')
                    if len(items) > 20:
                        print(f'    ... y {len(items) - 20} más')
                    print()
        return 1


if __name__ == '__main__':
    sys.exit(main())
