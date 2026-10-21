
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function respuesta(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return respuesta({ error: "Método no permitido." }, 405);
  }

  if (!env.BREVO_API_KEY || !env.ARCANO_ADMIN_TOKEN) {
    return respuesta({ error: "Integración no configurada." }, 503);
  }

  const authorization = request.headers.get("Authorization") || "";
  if (authorization !== `Bearer ${env.ARCANO_ADMIN_TOKEN}`) {
    return respuesta({ error: "No autorizado." }, 401);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return respuesta({ error: "JSON inválido." }, 400);
  }

  const {
    name,
    subject,
    htmlContent,
    senderEmail,
    senderName,
    listIds,
    previewText
  } = data || {};

  if (
    typeof name !== "string" || !name.trim() ||
    typeof subject !== "string" || !subject.trim() ||
    typeof htmlContent !== "string" ||
    htmlContent.length < 11 || htmlContent.length > 900000 ||
    typeof senderEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail) ||
    !Array.isArray(listIds) || listIds.length === 0 ||
    listIds.length > 100 ||
    listIds.some(id => !Number.isInteger(id) || id <= 0)
  ) {
    return respuesta({
      error: "Datos inválidos. Revisa nombre, asunto, HTML, remitente y listas."
    }, 400);
  }

  const payload = {
    name: name.trim(),
    subject: subject.trim(),
    sender: {
      name: typeof senderName === "string" && senderName.trim()
        ? senderName.trim()
        : "ARCANO",
      email: senderEmail.trim()
    },
    recipients: { listIds },
    htmlContent,
    ...(typeof previewText === "string" && previewText.trim()
      ? { previewText: previewText.trim() }
      : {})
  };

  try {
    const apiResponse = await fetch(
      "https://api.brevo.com/v3/emailCampaigns",
      {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await apiResponse.json().catch(() => ({}));

    if (!apiResponse.ok) {
      console.error("[brevo] Error HTTP:", apiResponse.status);
      return respuesta({
        error: "Brevo rechazó la creación del borrador.",
        status: apiResponse.status,
        code: result.code || "BREVO_API_ERROR"
      }, 502);
    }

    return respuesta({
      success: true,
      campaignId: result.id,
      status: "draft",
      message: "Borrador creado. Revisa la campaña en Brevo antes de enviarla."
    }, 201);

  } catch {
    return respuesta({
      error: "No se pudo conectar con Brevo."
    }, 502);
  }
}
