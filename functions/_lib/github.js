// functions/_lib/github.js — Helpers server-side para subir archivos a GitHub
// Usado por la automatización (cron) cuando el admin no está logueado.
// Lee el token de env.GITHUB_TOKEN (configurado en Cloudflare Pages).

const GH_OWNER = 'arcanoespecias';
const GH_REPO = 'arcanoespecias.github.io';
const GH_BRANCH = 'main';
const GH_API = 'https://api.github.com';

// Sube (o actualiza) un archivo en el repo.
// path: 'blog/mi-post.html' o 'img/recetas/mi-receta.jpg'
// content: string (UTF-8 para HTML) o base64 (para imágenes)
// isBase64: si true, content ya está en base64; si false, se codifica desde UTF-8
// message: commit message
async function uploadToGitHub(env, path, content, message, isBase64) {
  if (!env?.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN no configurado en env vars de Cloudflare');
  }

  // Codificar contenido a base64 si no lo está
  let b64Content;
  if (isBase64) {
    // Limpiar data URI prefix si existe (data:image/jpeg;base64,...)
    b64Content = content.replace(/^data:[^;]+;base64,/, '');
  } else {
    // Codificar UTF-8 a base64
    b64Content = btoa(unescape(encodeURIComponent(content)));
  }

  // Verificar si el archivo ya existe (para obtener su sha y hacer update)
  let sha = null;
  try {
    const checkResp = await fetch(`${GH_API}/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`, {
      headers: {
        'Authorization': 'token ' + env.GITHUB_TOKEN,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Arcano-Automation'
      }
    });
    if (checkResp.ok) {
      const data = await checkResp.json();
      sha = data.sha;
    }
  } catch (e) {
    // Archivo no existe, está bien
  }

  // Subir/actualizar
  const resp = await fetch(`${GH_API}/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': 'token ' + env.GITHUB_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Arcano-Automation'
    },
    body: JSON.stringify({
      message: message || 'Arcano automation: ' + path,
      content: b64Content,
      sha: sha,
      branch: GH_BRANCH
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GitHub upload failed (${resp.status}): ${errText.substring(0, 300)}`);
  }

  const data = await resp.json();
  return data.content?.download_url || data.content?.html_url || `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${path}`;
}

// Convierte un data URI (data:image/jpeg;base64,...) en base64 puro + mime
function parseDataUri(dataUri) {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { mime: 'image/jpeg', base64: dataUri };
  return { mime: match[1], base64: match[2] };
}

// Sube una imagen a img/recetas/<slug>.jpg y devuelve la URL pública
async function uploadImage(env, slug, dataUri, subdir) {
  const parsed = parseDataUri(dataUri);
  const ext = parsed.mime === 'image/png' ? 'png' : 'jpg';
  const path = `img/${subdir || 'recetas'}/${slug}.${ext}`;
  const url = await uploadToGitHub(env, path, parsed.base64, `automation: imagen ${slug}`, true);
  return { url, path, mime: parsed.mime };
}

export { uploadToGitHub, uploadImage, parseDataUri };
