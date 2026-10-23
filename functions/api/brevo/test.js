// /api/brevo/test.js — Endpoint de diagnóstico para Brevo
// Verifica que la API key funcione y que se pueda crear un contacto de prueba.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'status';

  // status: verificar configuración
  if (action === 'status') {
    return new Response(JSON.stringify({
      hasBrevoKey: !!env?.BREVO_API_KEY,
      brevoKeyPrefix: env?.BREVO_API_KEY ? env.BREVO_API_KEY.substring(0, 6) + '...' : 'no configurada',
      message: 'Usa ?action=test-contact para probar crear un contacto'
    }), { headers: CORS_HEADERS });
  }

  // test-contact: crear un contacto de prueba
  if (action === 'test-contact') {
    if (!env?.BREVO_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'BREVO_API_KEY no configurada' }), { status: 500, headers: CORS_HEADERS });
    }

    try {
      const testEmail = 'brevo-test-' + Date.now() + '@arcanoespecias.com';
      const payload = {
        email: testEmail,
        attributes: {
          NOMBRE: 'Test Diagnóstico',
          TELEFONO: '3000000000',
          CIUDAD: 'Medellín'
        },
        listIds: [2],
        updateEnabled: true
      };

      const resp = await fetch('https://api.brevo.com/v3/contacts', {
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
        request: { email: testEmail, listIds: [2] },
        response: result,
        message: resp.ok ? 'Contacto creado. Revisá en Brevo → Contacts.' : 'Brevo rechazó el contacto'
      }), { headers: CORS_HEADERS });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS_HEADERS });
    }
  }

  return new Response(JSON.stringify({ error: 'Acción inválida' }), { status: 400, headers: CORS_HEADERS });
}
