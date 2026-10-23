// functions/_lib/brevo.js — Helper para Brevo API v3
// ETAPA Brevo — Sincronización de contactos + emails transaccionales
// Todas las funciones son fire-and-forget (no bloquean el pedido si fallan).

const BREVO_API_BASE = 'https://api.brevo.com/v3';
const BREVO_LIST_ID = 2; // Lista "Clientes Arcano" en Brevo
const BREVO_WELCOME_TEMPLATE = 2; // Plantilla de bienvenida
const BREVO_CONFIRMATION_TEMPLATE = 3; // Plantilla de confirmación de pedido
const BREVO_SENDER_EMAIL = 'hola@arcanoespecias.com';
const BREVO_SENDER_NAME = 'Arcano Especias';

// === Agregar o actualizar contacto en Brevo + agregarlo a la lista ===
// Si el contacto ya existe, lo actualiza (updateEnabled: true).
// Si no tiene email, no hace nada (Brevo requiere email).
async function syncContact(env, { email, nombre, telefono, ciudad }) {
  if (!email || !env?.BREVO_API_KEY) return;

  try {
    const payload = {
      email: email,
      attributes: {
        NOMBRE: nombre || '',
        TELEFONO: telefono || '',
        CIUDAD: ciudad || ''
      },
      listIds: [BREVO_LIST_ID],
      updateEnabled: true // Si ya existe, actualiza los atributos
    };

    const resp = await fetch(`${BREVO_API_BASE}/contacts`, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await resp.json().catch(() => ({}));
    if (resp.ok) {
      console.log('[brevo] Contacto sincronizado:', email);
    } else if (result.code === 'duplicate_parameter') {
      // El contacto ya existe y updateEnabled no funcionó — intentamos update
      console.log('[brevo] Contacto ya existe, actualizando:', email);
      await updateContact(env, { email, nombre, telefono, ciudad });
    } else {
      console.warn('[brevo] Error sincronizando contacto:', result.code || result.message || resp.status);
    }
  } catch (e) {
    console.warn('[brevo] syncContact error:', e.message);
  }
}

// === Actualizar contacto existente en Brevo ===
async function updateContact(env, { email, nombre, telefono, ciudad }) {
  try {
    const payload = {
      attributes: {
        NOMBRE: nombre || '',
        TELEFONO: telefono || '',
        CIUDAD: ciudad || ''
      }
    };
    const resp = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (resp.ok) {
      console.log('[brevo] Contacto actualizado:', email);
    }
  } catch (e) {
    console.warn('[brevo] updateContact error:', e.message);
  }
}

// === Enviar email transaccional con plantilla de Brevo ===
async function sendTransactionalEmail(env, { templateId, toEmail, params }) {
  if (!toEmail || !env?.BREVO_API_KEY) return;

  try {
    const payload = {
      templateId: templateId,
      to: [{ email: toEmail }],
      sender: {
        email: BREVO_SENDER_EMAIL,
        name: BREVO_SENDER_NAME
      },
      params: params || {}
    };

    const resp = await fetch(`${BREVO_API_BASE}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await resp.json().catch(() => ({}));
    if (resp.ok) {
      console.log('[brevo] Email transaccional enviado:', toEmail, 'template:', templateId);
    } else {
      console.warn('[brevo] Error enviando email:', result.code || result.message || resp.status);
    }
  } catch (e) {
    console.warn('[brevo] sendTransactionalEmail error:', e.message);
  }
}

// === Email de bienvenida (primer pedido) ===
async function sendWelcomeEmail(env, { email, nombre, pedidoResumen, total }) {
  await sendTransactionalEmail(env, {
    templateId: BREVO_WELCOME_TEMPLATE,
    toEmail: email,
    params: {
      NOMBRE: nombre || 'Cliente',
      PEDIDO: pedidoResumen || '',
      TOTAL: String(total || 0)
    }
  });
}

// === Email de confirmación de pedido ===
async function sendConfirmationEmail(env, { email, nombre, itemsResumen, envioResumen, total }) {
  await sendTransactionalEmail(env, {
    templateId: BREVO_CONFIRMATION_TEMPLATE,
    toEmail: email,
    params: {
      NOMBRE: nombre || 'Cliente',
      ITEMS: itemsResumen || '',
      ENVIO: envioResumen || '',
      TOTAL: String(total || 0)
    }
  });
}

export {
  syncContact,
  sendWelcomeEmail,
  sendConfirmationEmail
};
