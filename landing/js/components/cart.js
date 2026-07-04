/* ─── CART DRAWER ─── */

function _cartItemsHtml() {
  return STATE.cart.map(item => `
<div class="cart-item">
  <div style="flex:1">
    <strong style="font-size:14px">${item.nombre}</strong>
    <p style="font-size:12px;margin:2px 0">${item.marca || ''}</p>
    <p style="font-size:13px;color:var(--primary)">$${item.precio.toLocaleString('es-CL')}</p>
  </div>
  <div style="display:flex;align-items:center;gap:8px">
    <span style="font-size:13px">×${item.qty}</span>
    <button class="remove-item" data-id="${item.id}" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);border-radius:6px;padding:2px 8px;font-size:12px;cursor:pointer">✕</button>
  </div>
</div>`).join('');
}

function _cartDefaultView() {
  const items = STATE.cart;
  return `
<div class="cart-header">
  <h2 style="font-size:20px">🛒 Carrito</h2>
  <button id="closeCart" style="background:transparent;border:none;color:var(--text-muted);font-size:20px;cursor:pointer">✕</button>
</div>
<div class="cart-body">
  ${items.length === 0
    ? '<p class="muted" style="padding:20px 0">El carrito está vacío</p>'
    : _cartItemsHtml()}
</div>
<div class="cart-footer">
  <p style="margin-bottom:4px">Neto: $${CartService.subtotal().toLocaleString('es-CL')}</p>
  <p style="margin-bottom:8px">IVA: $${CartService.iva().toLocaleString('es-CL')}</p>
  <h3 style="font-size:22px;margin-bottom:16px">Total: $${CartService.total().toLocaleString('es-CL')}</h3>
  ${items.length > 0 ? `
  <button class="btn btn-primary" id="checkoutBtn" style="width:100%;margin-bottom:8px">Generar Cotización</button>
  <button class="btn btn-outline" id="downloadQuote" style="width:100%">Descargar borrador</button>
  ` : ''}
</div>`;
}

function _cartCheckoutView() {
  return `
<div class="cart-header">
  <h2 style="font-size:18px">Datos de contacto</h2>
  <button id="closeCart" style="background:transparent;border:none;color:var(--text-muted);font-size:20px;cursor:pointer">✕</button>
</div>
<div class="cart-body" style="padding:24px">
  <p class="muted" style="margin-bottom:20px">Completá tus datos y te enviamos la cotización.</p>
  <form id="checkoutForm">
    <div style="margin-bottom:14px">
      <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px">Nombre *</label>
      <input id="cf-nombre" type="text" required placeholder="Tu nombre o empresa"
        style="width:100%;background:var(--panel-light);border:1px solid var(--border);color:#fff;padding:10px 14px;border-radius:8px;font-size:14px">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px">Teléfono *</label>
      <input id="cf-telefono" type="tel" required placeholder="+56 9 XXXX XXXX"
        style="width:100%;background:var(--panel-light);border:1px solid var(--border);color:#fff;padding:10px 14px;border-radius:8px;font-size:14px">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px">Email</label>
      <input id="cf-email" type="email" placeholder="tu@empresa.cl"
        style="width:100%;background:var(--panel-light);border:1px solid var(--border);color:#fff;padding:10px 14px;border-radius:8px;font-size:14px">
    </div>
    <div style="margin-bottom:20px">
      <label style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:6px">RUT (opcional)</label>
      <input id="cf-rut" type="text" placeholder="12.345.678-9"
        style="width:100%;background:var(--panel-light);border:1px solid var(--border);color:#fff;padding:10px 14px;border-radius:8px;font-size:14px">
    </div>
    <p id="checkoutError" style="color:var(--danger);font-size:13px;margin-bottom:12px;display:none"></p>
    <button type="submit" class="btn btn-primary" id="submitCheckout" style="width:100%;margin-bottom:8px">
      Enviar cotización →
    </button>
    <button type="button" id="backToCart" class="btn btn-outline" style="width:100%">Volver</button>
  </form>
</div>`;
}

function _cartConfirmedView(cotizacion) {
  const whatsappHtml = CONFIG.WHATSAPP
    ? `<a class="btn btn-outline" style="width:100%;margin-top:8px;text-decoration:none;display:block;text-align:center"
         href="https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(`Hola, acabo de enviar la cotización N° ${cotizacion.numero}`)}"
         target="_blank">
         Enviar resumen por WhatsApp
       </a>`
    : '';
  return `
<div class="cart-header">
  <h2 style="font-size:18px;color:var(--success)">✓ ¡Cotización enviada!</h2>
  <button id="closeCart" style="background:transparent;border:none;color:var(--text-muted);font-size:20px;cursor:pointer">✕</button>
</div>
<div class="cart-body" style="padding:24px;text-align:center">
  <div style="font-size:48px;margin-bottom:16px">🎉</div>
  <h3 style="margin-bottom:8px">N° ${cotizacion.numero}</h3>
  <p style="margin-bottom:4px">Total: <strong style="color:var(--primary)">$${Number(cotizacion.total).toLocaleString('es-CL')}</strong></p>
  <p class="muted" style="margin-top:12px">Nos pondremos en contacto contigo a la brevedad.</p>
</div>
<div class="cart-footer">
  <button class="btn btn-primary" id="downloadQuoteFinal" style="width:100%;margin-bottom:8px">
    Descargar PDF
  </button>
  ${whatsappHtml}
  <button class="btn btn-outline" id="newOrderBtn" style="width:100%;margin-top:8px">Nuevo pedido</button>
</div>`;
}

function renderCartDrawer(view, cotizacion) {
  const el = document.getElementById('drawer-cart');
  if (!el) return;

  el.innerHTML = `<div class="cart-drawer${STATE.cartOpen ? ' open' : ''}" id="cartDrawerInner">
    ${view === 'checkout' ? _cartCheckoutView()
    : view === 'confirmed' ? _cartConfirmedView(cotizacion)
    : _cartDefaultView()}
  </div>`;

  _attachCartEvents(view, cotizacion);
}

function _attachCartEvents(view, cotizacion) {
  const closeBtn = document.getElementById('closeCart');
  if (closeBtn) closeBtn.onclick = () => { STATE.cartOpen = false; renderCartDrawer(); };

  if (!view || view === 'default') {
    // remove items
    document.querySelectorAll('.remove-item').forEach(btn => {
      btn.onclick = () => {
        CartService.remove(btn.dataset.id);
        renderCartDrawer();
        _updateCartBadge();
      };
    });
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.onclick = () => renderCartDrawer('checkout');

    const dlBtn = document.getElementById('downloadQuote');
    if (dlBtn) dlBtn.onclick = () => PdfService.generateQuote({});
  }

  if (view === 'checkout') {
    const backBtn = document.getElementById('backToCart');
    if (backBtn) backBtn.onclick = () => renderCartDrawer();

    const form = document.getElementById('checkoutForm');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('submitCheckout');
      const errEl = document.getElementById('checkoutError');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      errEl.style.display = 'none';

      const clienteData = {
        nombre:   document.getElementById('cf-nombre').value.trim(),
        telefono: document.getElementById('cf-telefono').value.trim(),
        email:    document.getElementById('cf-email').value.trim() || null,
        rut:      document.getElementById('cf-rut').value.trim() || null
      };

      try {
        const result = await OrderService.checkout(clienteData);
        CartService.clear();
        _updateCartBadge();
        renderCartDrawer('confirmed', result);
      } catch (err) {
        errEl.textContent = 'Error al enviar. Verificá tu conexión e intentá de nuevo.';
        errEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar cotización →';
      }
    };
  }

  if (view === 'confirmed') {
    const dlFinal = document.getElementById('downloadQuoteFinal');
    if (dlFinal) dlFinal.onclick = () => PdfService.generateQuote(cotizacion);

    const newOrder = document.getElementById('newOrderBtn');
    if (newOrder) newOrder.onclick = () => { STATE.cartOpen = false; renderCartDrawer(); };
  }
}

function _updateCartBadge() {
  const badge = document.getElementById('cartCount');
  if (badge) badge.textContent = STATE.cart.length;
}

// Alias para compatibilidad con app.js
function renderCart() { renderCartDrawer(); }
