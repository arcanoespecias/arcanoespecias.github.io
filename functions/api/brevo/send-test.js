// /api/brevo/send-test.js — Envía un email de prueba a un contacto existente

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestGet({ request, env }) {
  if (!env?.BREVO_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'BREVO_API_KEY no configurada' }), { status: 500, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const toEmail = url.searchParams.get('email') || 'hola@arcanoespecias.com';
  const template = url.searchParams.get('template') || '3'; // default: confirmación

  try {
    const payload = {
      templateId: Number(template),
      to: [{ email: toEmail }],
      sender: {
        email: 'hola@arcanoespecias.com',
        name: 'Arcano Especias'
      },
      params: {
        NOMBRE: 'Alejandro',
        ITEMS: '2x Chimichurri Argentino (pequeño), 1x Asado Pampeano (grande)',
        ENVIO: 'Gratis',
        TOTAL: '55000',
        PEDIDO: '2x Chimichurri Argentino (pequeño), 1x Asado Pampeano (grande) | Envío: Gratis'
      }
    };

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await resp.json().catch(() => ({}));

    return new Response(JSON.stringify({
      ok: resp.ok,
      status: resp.status,
      to: toEmail,
      template: template,
      response: result,
      message: resp.ok ? 'Email enviado a ' + toEmail : 'Brevo rechazó el envío'
    }), { headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS_HEADERS });
  }
}
