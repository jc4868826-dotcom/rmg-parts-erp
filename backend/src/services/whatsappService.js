/**
 * RMG Auto Parts — Servicio WhatsApp Bot
 * Meta Cloud API · Cotización automática · Flujo conversacional
 *
 * Flujo del bot:
 * 1. Saludo → menú principal
 * 2. Segmento → taller / flota / concesionario / construcción
 * 3. Producto → buscar en catálogo
 * 4. Cantidad → calcular precio mayorista
 * 5. Cotización → enviar PDF o resumen
 * 6. Confirmar → crear pedido en ERP
 */

const axios = require('axios');

const WHATSAPP_URL = `https://graph.facebook.com/v19.0/${process.env.META_WHATSAPP_PHONE_ID}/messages`;
const HEADERS = {
  'Authorization': `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
};

// ─── Enviar mensaje de texto simple ─────────────────────────
const enviarTexto = async (telefono, texto) => {
  const payload = {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'text',
    text: { body: texto },
  };

  const res = await axios.post(WHATSAPP_URL, payload, { headers: HEADERS });
  return res.data;
};

// ─── Enviar menú con botones ─────────────────────────────────
const enviarMenu = async (telefono, titulo, cuerpo, botones) => {
  const payload = {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'text', text: titulo },
      body: { text: cuerpo },
      action: {
        buttons: botones.map((b, i) => ({
          type: 'reply',
          reply: { id: `btn_${i}`, title: b },
        })),
      },
    },
  };

  const res = await axios.post(WHATSAPP_URL, payload, { headers: HEADERS });
  return res.data;
};

// ─── Enviar lista de productos ────────────────────────────────
const enviarListaProductos = async (telefono, categoria, productos) => {
  const payload = {
    messaging_product: 'whatsapp',
    to: telefono,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: `🔩 RMG Auto Parts — ${categoria}` },
      body: { text: 'Selecciona el producto que necesitas:' },
      footer: { text: 'Precios mayoristas B2B · Neto sin IVA' },
      action: {
        button: 'Ver productos',
        sections: [{
          title: categoria,
          rows: productos.slice(0, 10).map(p => ({
            id: p.codigo,
            title: p.descripcion.substring(0, 24),
            description: `$${Number(p.neto).toLocaleString('es-CL')} neto`,
          })),
        }],
      },
    },
  };

  const res = await axios.post(WHATSAPP_URL, payload, { headers: HEADERS });
  return res.data;
};

// ─── Formatear cotización como mensaje ───────────────────────
const formatearCotizacion = (cotizacion) => {
  const lines = [
    `📋 *COTIZACIÓN RMG AUTO PARTS*`,
    `🔢 N° ${cotizacion.numero}`,
    `📅 ${new Date().toLocaleDateString('es-CL')}`,
    ``,
    `*Detalle:*`,
    ...cotizacion.items.map(i =>
      `• ${i.descripcion}\n  ${i.cantidad} u × $${Number(i.precio).toLocaleString('es-CL')} = $${Number(i.subtotal).toLocaleString('es-CL')}`
    ),
    ``,
    `*Neto:* $${Number(cotizacion.neto).toLocaleString('es-CL')}`,
    `*IVA (19%):* $${Number(cotizacion.iva).toLocaleString('es-CL')}`,
    `*TOTAL:* $${Number(cotizacion.total).toLocaleString('es-CL')}`,
    ``,
    `✅ Entrega en 4–24 hrs RM`,
    `💳 Crédito 30 días disponible`,
    ``,
    `Para confirmar pedido, responde: *CONFIRMAR*`,
    `Para modificar, responde: *MODIFICAR*`,
    ``,
    `RMG Auto Parts · ${process.env.RMG_TELEFONO}`,
  ];

  return lines.join('\n');
};

// ─── Procesar mensaje entrante (lógica del bot) ──────────────
const procesarMensaje = async (mensaje, sesion) => {
  const texto = (mensaje.text?.body || '').toLowerCase().trim();
  const telefono = mensaje.from;

  // Comandos directos
  if (texto === 'hola' || texto === 'inicio' || !sesion.etapa) {
    await enviarMenu(
      telefono,
      '🔩 RMG Auto Parts',
      '¡Hola! Somos distribuidores mayoristas de repuestos automotrices en Santiago RM.\n\n¿Qué tipo de cliente eres?',
      ['Taller mecánico', 'Flota / Empresa', 'Concesionario']
    );
    return { ...sesion, etapa: 'segmento' };
  }

  if (sesion.etapa === 'segmento') {
    const segmentoMap = {
      'taller mecánico': 'taller',
      'flota / empresa': 'flota',
      'concesionario': 'concesionario',
    };
    const segmento = segmentoMap[texto] || 'taller';

    await enviarMenu(
      telefono,
      '📦 Líneas de producto',
      `Perfecto. ¿Qué línea necesitas cotizar?`,
      ['Baterías', 'Lubricantes', 'Neumáticos']
    );
    return { ...sesion, etapa: 'categoria', segmento };
  }

  // Respuesta por defecto
  await enviarTexto(
    telefono,
    `Para hablar con un ejecutivo RMG, contáctanos directo:\n📞 ${process.env.RMG_WHATSAPP}`
  );
  return sesion;
};

module.exports = {
  enviarTexto,
  enviarMenu,
  enviarListaProductos,
  formatearCotizacion,
  procesarMensaje,
};
