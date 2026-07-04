function renderConfirmacion(numero) {
  const order = STATE.orders.find(o => o.numero === numero) || { numero, total: 0 };
  const container = document.getElementById('featured-products');
  if (!container) return;

  const whatsappBtn = CONFIG.WHATSAPP
    ? `<a class="btn btn-outline" style="margin-top:12px;text-decoration:none;display:inline-block"
         href="https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(`Hola, mi cotización N° ${numero}`)}"
         target="_blank">Enviar por WhatsApp</a>`
    : '';

  container.innerHTML = `
<div class="container" style="padding:80px 0;text-align:center;max-width:600px;margin:auto">
  <div style="font-size:64px;margin-bottom:24px">🎉</div>
  <h2 style="margin-bottom:12px">¡Cotización enviada!</h2>
  <p style="font-size:18px;margin-bottom:8px">N° <strong>${numero}</strong></p>
  <p style="font-size:16px;margin-bottom:32px">
    Total: <strong style="color:var(--primary)">$${Number(order.total).toLocaleString('es-CL')}</strong>
  </p>
  <p class="muted" style="margin-bottom:32px">Nos pondremos en contacto a la brevedad para coordinar el despacho.</p>
  <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
    <button class="btn btn-primary" onclick="PdfService.generateQuote({numero:'${numero}',total:${order.total}})">
      Descargar PDF
    </button>
    ${whatsappBtn}
    <button class="btn btn-outline" onclick="Router.navigate('/')">Seguir comprando</button>
  </div>
</div>`;
}
