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
//
// ETAPA Colección Arcano — Se sincronizan dos atributos nuevos:
//   COLECCION_ARCANO     → número de blends pequeños acumulados (0-10)
//   COLECCION_ARCANO_PCT → porcentaje de progreso (0-100) para la barra del email
// Si no se pasan, se omiten (no sobreescriben el valor existente en Brevo).
async function syncContact(env, { email, nombre, telefono, ciudad, ultimoPedido, coleccionArcano, coleccionArcanoPct }) {
  console.log('[brevo] syncContact called:', { email, hasKey: !!env?.BREVO_API_KEY, coleccionArcano });
  if (!email || !env?.BREVO_API_KEY) {
    console.warn('[brevo] syncContact SKIP:', { email: !!email, hasKey: !!env?.BREVO_API_KEY });
    return;
  }

  try {
    const attributes = {
      NOMBRE: nombre || '',
      TELEFONO: telefono || '',
      CIUDAD: ciudad || '',
      ULTIMO_PEDIDO: ultimoPedido || new Date().toISOString()
    };
    // Solo agregar atributos de Colección Arcano si vienen definidos
    // (evita sobreescribir con undefined y borrar el valor existente en Brevo)
    if (coleccionArcano !== undefined && coleccionArcano !== null) {
      attributes.COLECCION_ARCANO = Number(coleccionArcano) || 0;
    }
    if (coleccionArcanoPct !== undefined && coleccionArcanoPct !== null) {
      attributes.COLECCION_ARCANO_PCT = Number(coleccionArcanoPct) || 0;
    }

    const payload = {
      email: email,
      attributes: attributes,
      listIds: [BREVO_LIST_ID],
      updateEnabled: true
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
      console.log('[brevo] Contacto sincronizado:', email, 'Colección:', coleccionArcano, '/10');
    } else if (result.code === 'duplicate_parameter') {
      // El contacto ya existe y updateEnabled no funcionó — intentamos update
      console.log('[brevo] Contacto ya existe, actualizando:', email);
      await updateContact(env, { email, nombre, telefono, ciudad, ultimoPedido, coleccionArcano, coleccionArcanoPct });
    } else {
      console.warn('[brevo] Error sincronizando contacto:', result.code || result.message || resp.status);
    }
  } catch (e) {
    console.warn('[brevo] syncContact error:', e.message);
  }
}

// === Actualizar contacto existente en Brevo ===
async function updateContact(env, { email, nombre, telefono, ciudad, ultimoPedido, coleccionArcano, coleccionArcanoPct }) {
  try {
    const attributes = {
      NOMBRE: nombre || '',
      TELEFONO: telefono || '',
      CIUDAD: ciudad || '',
      ULTIMO_PEDIDO: ultimoPedido || new Date().toISOString()
    };
    if (coleccionArcano !== undefined && coleccionArcano !== null) {
      attributes.COLECCION_ARCANO = Number(coleccionArcano) || 0;
    }
    if (coleccionArcanoPct !== undefined && coleccionArcanoPct !== null) {
      attributes.COLECCION_ARCANO_PCT = Number(coleccionArcanoPct) || 0;
    }

    const payload = { attributes: attributes };
    const resp = await fetch(`${BREVO_API_BASE}/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (resp.ok) {
      console.log('[brevo] Contacto actualizado:', email, 'Colección:', coleccionArcano, '/10');
    }
  } catch (e) {
    console.warn('[brevo] updateContact error:', e.message);
  }
}

// === Enviar email transaccional con plantilla de Brevo ===
async function sendTransactionalEmail(env, { templateId, toEmail, params }) {
  console.log('[brevo] sendTransactionalEmail called:', { templateId, toEmail, hasKey: !!env?.BREVO_API_KEY });
  if (!toEmail || !env?.BREVO_API_KEY) {
    console.warn('[brevo] sendTransactionalEmail SKIP:', { toEmail: !!toEmail, hasKey: !!env?.BREVO_API_KEY });
    return;
  }

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
      console.log('[brevo] Email transaccional enviado:', toEmail, 'template:', templateId, 'messageId:', result.messageId);
    } else {
      console.warn('[brevo] Error enviando email:', result.code || result.message || resp.status, JSON.stringify(result));
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
