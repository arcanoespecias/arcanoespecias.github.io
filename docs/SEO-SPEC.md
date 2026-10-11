# SEO-SPEC.md — Especificación de SEO para arcanoespecias.com

## Regla única

- **enTienda=true**: página publicada, en sitemap, en sitemap-images (si tiene imagen real), en ItemList de la home, en listas de categoría y en el feed. Disponibilidad siempre InStock. No se usa stock para decidir disponibilidad.
- **enTienda=false**: sin página (el generador la borra del repo), sin sitemap, feed ni listas. URL en 404. Datos permanecen en Firebase. Al pasar a enTienda=true, regenerar SEO la crea de nuevo.
- **Sin imagen real**: la página se publica pero queda fuera del feed y de sitemap-images hasta tener foto.
- **Despacho**: 1 día hábil. Línea visible en cada página de producto: "Lo preparamos al momento. Despacho en 1 día hábil." Sin schema de shippingDetails por ahora.

## Convenciones

- URLs de blog y recetas: SIN .html (Cloudflare Pages sirve /blog/slug → /blog/slug.html)
- Canonical, sitemap y og:url: SIN .html
- robots.txt: sin Disallow de /merchant_feed*, /p/, /tienda/
- _headers: X-Robots-Tag: noindex para /merchant_feed.xml y .tsv
- _redirects: solo 301 (sin 410; Cloudflare Pages no los soporta)
- 301 de /p/slug.html y /tienda/slug.html solo si el destino está enTienda=true
- 301 de /blends/slug/ a /especias/slug/ para 16 especias coladas como blends
- Productos eliminados (no en Firebase): 404 natural con noindex
- Sitemap: sin <priority> ni <changefreq>; <lastmod> con fecha real de modificación
- Imágenes: /img/blends/slug.jpg y /img/especias/slug.jpg (subidas en regeneración)
- Home: sección "Explora" visible en el footer con 9 categorías + /especias/ + /blog/ + /recetas/
- Un solo <h1> en toda la página: "Especias y blends artesanales en Colombia"
- Canonical = / incluso con ?producto=slug

## Pospuesto a Fase 2

- 4 estados (ACTIVO/AGOTADO/OCULTO/ELIMINADO) con cálculo de disponibilidad por stock
- Feed por variante (item_group_id, chico/grande por separado)
- Shipping details en schema (handlingTime)
- Dry run y validación automática de _redirects en el generador
- Aviso en el admin de cambios SEO pendientes
- Regeneración automática del feed (cron)
- BlogPosting y Recipe schema
- Links internos bidireccionales (blog↔productos, recetas↔blends)
- Páginas de confianza (/sobre-nosotros/, /contacto/, /envios/, etc.)
- Google Business Profile y SEO local
