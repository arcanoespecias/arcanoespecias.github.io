# Arcano Automation Worker

Cloudflare Worker con **cron trigger** que dispara la generación automática de recetas (Lun/Mié/Vie 9am) y blog (Domingos 9am).

## Arquitectura

```
┌──────────────────────────────────────────────┐
│  Este Worker (cron trigger)                   │
│  - No contiene lógica de negocio              │
│  - Solo hace POST a /api/automation/run       │
└────────────────┬─────────────────────────────┘
                 │ HTTP POST + Bearer token
                 ▼
┌──────────────────────────────────────────────┐
│  Cloudflare Pages: /api/automation/run        │
│  (functions/api/automation/run.js)            │
│  - Genera receta/blog con Gemini              │
│  - Genera imagen con Workers AI               │
│  - Sube HTML+imagen a GitHub                  │
│  - Guarda en Firebase                         │
│  - Envía email con Brevo                      │
└──────────────────────────────────────────────┘
```

## Cron schedule

| Día (America/Bogota) | Hora | Tarea |
|---|---|---|
| Lunes | 09:00 | Generar 1 receta (categoría rotada) |
| Miércoles | 09:00 | Generar 1 receta (categoría rotada) |
| Viernes | 09:00 | Generar 1 receta (categoría rotada) |
| Domingo | 09:00 | Generar 1 artículo de blog (borrador + email) |

**Rotación recetas**: Comidas → Infusiones → Coctelería → Comidas → ...

## Deploy (una sola vez)

### 1. Instalar wrangler

```bash
cd worker/
npm install
```

### 2. Login a Cloudflare

```bash
npx wrangler login
```

### 3. Configurar Account ID

Edita `wrangler.toml` y reemplaza `TU_ACCOUNT_ID` con tu Account ID de Cloudflare (lo encuentras en https://dash.cloudflare.com → barra lateral).

### 4. Configurar el token de admin como secret

```bash
npx wrangler secret put ARCANO_ADMIN_TOKEN
```

Te pedirá el valor. Usa el mismo `ARCANO_ADMIN_TOKEN` que ya está configurado en Cloudflare Pages (Dashboard → Pages → arcanoespecias → Settings → Environment variables).

### 5. Deploy

```bash
npx wrangler deploy
```

Esto crea el Worker y registra los cron triggers. Verás algo como:
```
Published arcano-automation (1.23 sec)
  https://arcano-automation.<tu-subdomain>.workers.dev
  Scheduled:
  - 0 14 * * 1,3,5
  - 0 14 * * 0
```

## Variables de entorno requeridas en Cloudflare Pages

Antes de que la automatización funcione, verifica que estas env vars estén configuradas en **Cloudflare Pages → arcanoespecias → Settings → Environment variables**:

| Variable | Dónde | Propósito |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | ✅ ya existe | Leer/escribir Firebase (catálogo, recetas, blog, estado) |
| `ARCANO_ADMIN_TOKEN` | ✅ ya existe | Auth del endpoint `/api/automation/run` |
| `BREVO_API_KEY` | ✅ ya existe | Enviar emails |
| `GITHUB_TOKEN` | ⚠ **NUEVA** | Subir HTML SEO + imágenes a GitHub (Fine-grained PAT, permiso `contents:write` solo para este repo) |
| `CF_ACCOUNT_ID` | ⚠ verificar | Generar imágenes con Workers AI |
| `CF_API_TOKEN` | ⚠ verificar | Generar imágenes con Workers AI |
| `GEMINI_API_KEY` | opcional | Si no está, lee de Firebase (`arcano/db/config/gemini_key`) |

### Cómo obtener `GITHUB_TOKEN`

1. Ve a https://github.com/settings/personal-access-tokens/new (Fine-grained PAT)
2. **Token name**: `Arcano Automation`
3. **Repository access**: Only select repositories → `arcanoespecias/arcanoespecias.github.io`
4. **Permissions**:
   - Repository permissions → Contents: **Read and write**
5. Click "Generate token"
6. Copia el token (empieza con `github_pat_...`)
7. Agrégalo como env var `GITHUB_TOKEN` en Cloudflare Pages

## Probar sin afectar producción (dry-run)

### Probar receta (dry-run)

```bash
curl -X POST https://arcanoespecias.com/api/automation/run \
  -H "Authorization: Bearer $ARCANO_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task":"recetas","dryRun":true}'
```

Devuelve el JSON de la receta generada SIN subirla a GitHub ni guardarla en Firebase.

### Probar blog (dry-run)

```bash
curl -X POST https://arcanoespecias.com/api/automation/run \
  -H "Authorization: Bearer $ARCANO_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task":"blog","dryRun":true}'
```

### Probar receta real (sube a GitHub + Firebase + email)

```bash
curl -X POST https://arcanoespecias.com/api/automation/run \
  -H "Authorization: Bearer $ARCANO_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task":"recetas"}'
```

### Ver estado de automatización

```bash
curl https://arcanoespecias.com/api/automation/status
```

Devuelve:
- Última categoría de receta generada
- Próxima categoría que se generará
- Última fecha de receta y blog
- Total de recetas y blog existentes

### Probar el cron localmente

```bash
cd worker/
npx wrangler dev --test-scheduled
# En otra terminal:
curl "http://localhost:8787/__scheduled?cron=0+14+*+*+1,3,5"
```

## Logs y monitoreo

- **Worker logs**: Cloudflare Dashboard → Workers → arcano-automation → Logs (tiempo real)
- **Endpoint logs**: `console.log` en `functions/api/automation/run.js` aparecen en Pages Functions logs
- **Estado en Firebase**: nodo `arcano/db/automation` guarda `{ recetas: { ultimaCategoria, ultimaFecha, contadorSemana }, blog: { ultimaCategoria, ultimaFecha } }`

## Si algo falla

### Gemini da 429 (cuota agotada)

El endpoint devuelve error. El cron del Worker lo reintenta automáticamente en la próxima ejecución (24-48h después). No hay acción manual necesaria.

### Workers AI da 429

Cuota de 10,000 neuronas/día agotada. Se resetea a la medianoche UTC. El endpoint guarda el error en Firebase (`arcano/db/automation/lastError`).

### GitHub upload falla

Verifica que `GITHUB_TOKEN` no haya expirado. Los Fine-grained PATs expiran por defecto a los 90 días.

### Email no llega

Verifica `BREVO_API_KEY` en Cloudflare Pages. Los emails van a `hola@arcanoespecias.com` desde la misma dirección.

## Estructura de archivos

```
worker/
├── index.js           # Worker con cron trigger + handler HTTP
├── wrangler.toml      # Configuración (crons, account_id)
├── package.json       # Dependencias (wrangler)
└── README.md          # Este archivo

functions/
├── _lib/
│   ├── automation-helpers.js  # Lógica: generar receta, blog, imagen, email
│   ├── github.js              # Subir HTML+imagen a GitHub (server-side)
│   ├── firebase-admin.js      # Ya existía
│   └── brevo.js               # Ya existía
└── api/automation/
    ├── run.js                 # Endpoint orquestador (POST)
    └── status.js              # Estado actual (GET)
```
