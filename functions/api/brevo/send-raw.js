// /api/brevo/send-raw.js — Envía un email simple sin template para diagnosticar

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestGet({ request, env }) {
  if (!env?.BREVO_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'BREVO_API_KEY no configurada' }), { status: 500, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const toEmail = url.searchParams.get('email') || 'arcanoespecias@gmail.com';

  try {
    // Email simple sin template, con HTML directo
    const payload = {
      sender: {
        email: 'hola@arcanoespecias.com',
        name: 'Arcano Especias'
      },
      to: [{ email: toEmail }],
      subject: 'Test directo Arcano - sin template',
      htmlContent: '<html><body><h1>Test Arcano</h1><p>Si recibiste este email, Brevo está funcionando.</p><p>Enviado desde hola@arcanoespecias.com</p></body></html>'
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
      response: result,
      message: resp.ok ? 'Email simple enviado' : 'Brevo rechazó el envío'
    }), { headers: CORS_HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS_HEADERS });
  }
}
