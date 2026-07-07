// ──────────────────────────────────────────────────────────────
//  RMG Parts — App principal (arquitectura HTML estático + JS)
// ──────────────────────────────────────────────────────────────

let _lastCartItems = []; // snapshot para PDF post-clear

document.addEventListener('DOMContentLoaded', async () => {

  // ── WhatsApp ─────────────────────────────────────────────────
  const WA = CONFIG.WHATSAPP;
  const waUrl = WA
    ? `https://wa.me/${WA}?text=${encodeURIComponent('Hola, me interesa cotizar en RMG Parts')}`
    : null;

  const waFloatEl = document.getElementById('waFloat');
  if (waFloatEl && waUrl) {
    waFloatEl.addEventListener('click', () => window.open(waUrl, '_blank', 'noopener'));
  }

  ['heroWaBtn', 'bulkWaBtn', 'bulkWaBtnSec'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (waUrl) {
      el.addEventListener('click', () => window.open(waUrl, '_blank', 'noopener'));
    } else {
      if (id === 'heroWaBtn') {
        el.addEventListener('click', () => {
          document.querySelector('.finder-section')?.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }
  });

  const footerWa = document.getElementById('footerWa');
  if (footerWa) {
    if (waUrl) { footerWa.href = waUrl; footerWa.target = '_blank'; footerWa.rel = 'noopener'; }
    else footerWa.style.display = 'none';
  }

  // ── Carousel ──────────────────────────────────────────────────
  _initCarousel();

  // ── Category strip ────────────────────────────────────────────
  document.querySelectorAll('.cat-strip-item[data-q]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.cat-strip-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      _categoryFilter(item.dataset.q);
    });
  });

  // ── Badge carrito ─────────────────────────────────────────────
  _updateCartBadge();
  Events.on('cart:updated', () => {
    _updateCartBadge();
    _renderDrawerItems();
  });

  // ── Segment pills ─────────────────────────────────────────────
  document.querySelectorAll('.seg-pill[data-segmento]').forEach(pill => {
    pill.style.cursor = 'pointer';
    pill.addEventListener('click', () => {
      document.querySelectorAll('.seg-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _segmentFilter(pill.dataset.segmento);
    });
  });

  // ── Chips del finder / por-marca ──────────────────────────────
  document.querySelectorAll('.chip[data-q]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _categoryFilter(chip.dataset.q);
    });
  });

  // ── BNL Level 1 cards ─────────────────────────────────────────
  document.querySelectorAll('.bnl-card[data-search]').forEach(card => {
    card.addEventListener('click', () => _categoryFilter(card.dataset.search));
  });

  // ── BNL Level 2 cards ─────────────────────────────────────────
  document.querySelectorAll('.bnl-card-sm[data-search]').forEach(card => {
    card.addEventListener('click', () => _categoryFilter(card.dataset.search));
  });

  // ── Buscador ──────────────────────────────────────────────────
  const input = document.getElementById('buscadorInput');
  const btn   = document.getElementById('buscadorBtn');

  btn?.addEventListener('click', () => {
    const q = input?.value.trim();
    if (q) _searchAndRender(q);
  });

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) _searchAndRender(input.value.trim());
  });

  // ── Cargar productos ──────────────────────────────────────────
  _showSkeletons();
  try {
    STATE.products = await ProductService.getAll();
    _renderProducts(_dedup(STATE.products));
  } catch (e) {
    console.error('Error cargando productos del ERP:', e.message);
    _showProductError();
  }

  // ── Refine input ──────────────────────────────────────────────
  document.getElementById('refineInput')?.addEventListener('input', function () {
    if (!STATE.activeResults) return;
    const q = this.value.trim().toLowerCase();
    if (!q) { _renderProducts(STATE.activeResults); return; }
    _renderProducts(STATE.activeResults.filter(p =>
      [p.nombre, p.marca, p.sku, p.tipo, p.presentacion].join(' ').toLowerCase().includes(q)
    ));
  });

  // ── Router: detalle de producto ───────────────────────────────
  Router.on('/producto/:sku', ({ sku }) => _showProductDetail(decodeURIComponent(sku)));
  Router.init();
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#/producto/')) {
      document.getElementById('productModal')?.classList.remove('open');
    }
  });

  // ── Pagar btn ─────────────────────────────────────────────────
  document.getElementById('pagarBtn')?.addEventListener('click', _showCheckoutForm);

});

// ══ GLOBALES ══════════════════════════════════════════════════

function openCart() {
  _renderDrawerItems();
  document.getElementById('overlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}

function closeCart() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
  _resetDrawer();
}

function switchFinder(i, el) {
  document.querySelectorAll('.finder-tab').forEach((t, idx) =>
    t.classList.toggle('active', idx === i)
  );
  document.getElementById('finder-0').style.display = i === 0 ? '' : 'none';
  document.getElementById('finder-1').style.display = i === 1 ? '' : 'none';
}

function clearSearch() {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.seg-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.cat-strip-item').forEach(i => i.classList.remove('active'));
  const input = document.getElementById('buscadorInput');
  if (input) input.value = '';
  document.getElementById('prodSectionTitle').textContent = 'Productos destacados';
  document.getElementById('prodSectionSub').textContent = 'Los más pedidos por talleres y flotas.';
  document.getElementById('clearSearchBtn').style.display = 'none';
  STATE.activeResults = null;
  const refineRow = document.getElementById('refineRow');
  if (refineRow) refineRow.style.display = 'none';
  _renderProducts(_dedup(STATE.products));
}

function addToCart(id) {
  const product = STATE.products.find(p => String(p.id) === String(id))
               || (STATE.searchResults || []).find(p => String(p.id) === String(id));
  if (!product) return;
  CartService.add(product);
  _showToast('Agregado al carrito');
  const badge = document.getElementById('cartCount');
  if (badge) { badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
}

function changeQty(id, delta) {
  const item = STATE.cart.find(i => String(i.id) === String(id));
  if (!item) return;
  const next = item.qty + delta;
  if (next <= 0) {
    CartService.remove(item.id);
  } else {
    item.qty = next;
    CartService.save();
    Events.emit('cart:updated', STATE.cart);
  }
}

function removeItem(id) {
  CartService.remove(id);
}

function goToPage(n) {
  _renderPage(n);
  document.getElementById('destacados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ══ CAROUSEL ═════════════════════════════════════════════════

function _initCarousel() {
  const track = document.getElementById('carouselTrack');
  if (!track) return;
  const dots = document.querySelectorAll('.carousel-dot');
  let current = 0;
  let timer = null;

  function go(n) {
    current = (n + dots.length) % dots.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { clearInterval(timer); go(i); timer = setInterval(() => go(current + 1), 3000); });
  });

  timer = setInterval(() => go(current + 1), 3000);
}

// ══ PRIVADOS ═════════════════════════════════════════════════

function _fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-CL');
}

function _updateCartBadge() {
  const total = STATE.cart.reduce((a, b) => a + b.qty, 0);
  const badge = document.getElementById('cartCount');
  if (badge) badge.textContent = total;
}

function _showProductError() {
  const grid = document.getElementById('prodGrid');
  if (grid) grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
      <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
      <div style="font-weight:600;margin-bottom:8px;color:var(--text-dark);">Error cargando productos</div>
      <div style="font-size:13px;">No se pudo conectar al catálogo. Intenta recargar la página o contáctanos.</div>
      <button class="btn" style="margin-top:20px;" onclick="location.reload()">Reintentar</button>
    </div>
  `;
}

function _showSkeletons() {
  const grid = document.getElementById('prodGrid');
  if (!grid) return;
  grid.className = 'prod-grid';
  grid.innerHTML = Array(8).fill('<div class="prod-skeleton"></div>').join('');
}

// ── Pagination helpers ─────────────────────────────────────────

const PAGE_SIZE = 12;

function _renderProducts(products) {
  if (!products || !products.length) {
    const grid = document.getElementById('prodGrid');
    if (grid) {
      grid.className = 'prod-cards';
      grid.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--text-muted);">Sin resultados para esta búsqueda.</div>';
    }
    _renderPagination(0, 0);
    return;
  }

  STATE.currentPageData = [...products].sort((a, b) => {
    const ca = (a.categoria || '').localeCompare(b.categoria || '', 'es');
    if (ca !== 0) return ca;
    const ma = (a.marca || '').localeCompare(b.marca || '', 'es');
    if (ma !== 0) return ma;
    return (a.presentacion || '').localeCompare(b.presentacion || '', 'es');
  });

  _renderPage(1);
}

function _renderPage(page) {
  const grid = document.getElementById('prodGrid');
  if (!grid) return;

  const all = STATE.currentPageData || [];
  const totalPages = Math.ceil(all.length / PAGE_SIZE);
  const clampedPage = Math.max(1, Math.min(page, totalPages || 1));
  STATE.currentPage = clampedPage;

  const start = (clampedPage - 1) * PAGE_SIZE;
  const pageItems = all.slice(start, start + PAGE_SIZE);

  grid.className = 'prod-cards';
  grid.innerHTML = pageItems.map(p => `
    <div class="prod-card" onclick="showProductDetail('${p.sku}')">
      <div class="prod-card-marca">${p.marca || '—'}</div>
      <div class="prod-card-desc">
        <span class="prod-card-name">${p.nombre}</span>
        <span class="prod-card-sku mono">${p.sku || p.id || ''}</span>
      </div>
      <div class="prod-card-pres">${p.presentacion || ''}</div>
      <div class="prod-card-price mono">${_fmt(p.precio)}</div>
      <button class="prod-card-add" onclick="event.stopPropagation();addToCart('${p.id}')" title="Agregar al carrito">+</button>
    </div>
  `).join('');

  _renderPagination(clampedPage, totalPages);
}

function _renderPagination(page, total) {
  let pag = document.getElementById('paginacionRow');
  if (!pag) {
    pag = document.createElement('div');
    pag.id = 'paginacionRow';
    pag.className = 'paginacion-row';
    const container = document.querySelector('#destacados .container');
    if (container) container.appendChild(pag);
  }

  if (total <= 1) { pag.innerHTML = ''; return; }

  const max = 5;
  let s = Math.max(1, page - Math.floor(max / 2));
  let e = Math.min(total, s + max - 1);
  if (e - s + 1 < max) s = Math.max(1, e - max + 1);

  let html = '';
  if (page > 1) html += `<button class="pag-btn" onclick="goToPage(${page - 1})">‹</button>`;
  for (let i = s; i <= e; i++) {
    html += `<button class="pag-btn${i === page ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  if (page < total) html += `<button class="pag-btn" onclick="goToPage(${page + 1})">›</button>`;

  pag.innerHTML = html;
}

function showProductDetail(sku) {
  location.hash = '#/producto/' + encodeURIComponent(sku);
}

function closeProductModal() {
  document.getElementById('productModal')?.classList.remove('open');
  if (location.hash.startsWith('#/producto/')) history.back();
}

function _showProductDetail(sku) {
  const product = STATE.products.find(p => String(p.sku) === String(sku))
               || (STATE.searchResults || []).find(p => String(p.sku) === String(sku));
  const modal = document.getElementById('productModal');
  if (!modal) return;
  if (!product) { history.back(); return; }

  document.getElementById('productModalContent').innerHTML = `
    <div class="pd-marca">${product.marca || ''}</div>
    <h2 class="pd-nombre">${product.nombre}</h2>
    <div class="pd-sku mono">${product.sku}</div>
    <div class="pd-rows">
      <div class="pd-row"><span>Precio neto</span><span class="mono pd-precio">${_fmt(product.precio)}</span></div>
      <div class="pd-row"><span>Presentación</span><span>${product.presentacion || '—'}</span></div>
      <div class="pd-row"><span>Categoría</span><span>${product.categoria || '—'}</span></div>
      <div class="pd-row"><span>Proveedor</span><span>${product.proveedor || '—'}</span></div>
    </div>
    <button class="btn pd-add-btn" onclick="addToCart('${product.id}');closeProductModal()">Agregar al carrito +</button>
  `;
  modal.classList.add('open');
}

function _showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2000);
}

function _dedup(products) {
  const seen = new Set();
  return products.filter(p => {
    const key = p.sku || p.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function _norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _categoryFilter(q) {
  document.getElementById('prodSectionTitle').textContent = `Resultados: "${q}"`;
  document.getElementById('prodSectionSub').textContent = '';
  document.getElementById('clearSearchBtn').style.display = '';
  document.getElementById('destacados')?.scrollIntoView({ behavior: 'smooth' });
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = p => [p.categoria, p.tipo, p.nombre, p.marca, p.segmento].join(' ').toLowerCase();
  let filtered = STATE.products.filter(p => terms.every(t => hay(p).includes(t)));
  if (!filtered.length && terms.length > 1) filtered = STATE.products.filter(p => hay(p).includes(terms[0]));
  STATE.activeResults = _dedup(filtered);
  const refineRow = document.getElementById('refineRow');
  if (refineRow) { refineRow.style.display = ''; document.getElementById('refineInput').value = ''; }
  _renderProducts(STATE.activeResults);
}

function _segmentFilter(segmento) {
  document.getElementById('prodSectionTitle').textContent = `Segmento: ${segmento}`;
  document.getElementById('prodSectionSub').textContent = '';
  document.getElementById('clearSearchBtn').style.display = '';
  document.getElementById('destacados')?.scrollIntoView({ behavior: 'smooth' });
  const seg = _norm(segmento);
  const filtered = STATE.products.filter(p => _norm(p.segmento) === seg);
  STATE.activeResults = _dedup(filtered);
  const refineRow = document.getElementById('refineRow');
  if (refineRow) { refineRow.style.display = ''; document.getElementById('refineInput').value = ''; }
  _renderProducts(STATE.activeResults);
}

async function _searchAndRender(q) {
  document.getElementById('prodSectionTitle').textContent = `Resultados: "${q}"`;
  document.getElementById('prodSectionSub').textContent = '';
  document.getElementById('clearSearchBtn').style.display = '';
  document.getElementById('destacados')?.scrollIntoView({ behavior: 'smooth' });
  STATE.activeResults = null;
  const refineRow = document.getElementById('refineRow');
  if (refineRow) refineRow.style.display = 'none';
  _showSkeletons();
  try {
    const results = await ProductService.search(q);
    STATE.searchResults = results;
    _renderProducts(results);
  } catch (e) {
    _renderProducts([]);
  }
}

function _renderDrawerItems() {
  const items = document.getElementById('drawerItems');
  const foot  = document.getElementById('drawerFoot');
  const sub   = document.getElementById('subtotal');
  if (!items) return;

  if (!STATE.cart.length) {
    items.innerHTML = '<div class="empty-cart">Tu pedido está vacío.<br>Agrega productos desde el catálogo.</div>';
    if (foot) foot.style.display = 'none';
    return;
  }

  if (foot) foot.style.display = '';
  if (sub) sub.textContent = _fmt(CartService.subtotal());

  items.innerHTML = STATE.cart.map(item => `
    <div class="cart-line">
      <div class="cart-line-body">
        <div class="cart-line-name">${item.nombre}</div>
        <div class="cart-line-meta">${item.sku || item.id}</div>
        <div class="qty-row">
          <button class="qty-btn" onclick="changeQty('${item.id}', -1)">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.id}', 1)">+</button>
          <span class="remove-x" onclick="removeItem('${item.id}')">Quitar</span>
        </div>
      </div>
      <div class="cart-line-price">${_fmt(item.precio * item.qty)}</div>
    </div>
  `).join('');
}

function _resetDrawer() {
  const head = document.querySelector('.drawer-head h3');
  const foot  = document.getElementById('drawerFoot');
  if (head) head.textContent = 'Tu pedido';
  if (foot) {
    foot.style.display = '';
    foot.innerHTML = `
      <div class="subtotal-row">
        <span>Subtotal neto</span>
        <span class="amt mono" id="subtotal">${_fmt(CartService.subtotal())}</span>
      </div>
      <button class="btn" id="pagarBtn" style="width:100%;justify-content:center;">Confirmar pedido →</button>
      <div class="drawer-note">Precios netos, sin IVA. Te contactaremos por WhatsApp para coordinar el pago.</div>
    `;
    foot.querySelector('#pagarBtn')?.addEventListener('click', _showCheckoutForm);
  }
  _renderDrawerItems();
}

function _showCheckoutForm() {
  if (!STATE.cart.length) return;
  const items = document.getElementById('drawerItems');
  const foot  = document.getElementById('drawerFoot');
  const head  = document.querySelector('.drawer-head h3');
  if (head) head.textContent = 'Datos de contacto';

  items.innerHTML = `
    <form class="checkout-form" id="checkoutForm" onsubmit="return false;">
      <div class="cf-field">
        <label>Nombre completo *</label>
        <input type="text" name="nombre" required placeholder="Juan Pérez">
      </div>
      <div class="cf-field">
        <label>Teléfono *</label>
        <input type="tel" name="telefono" required placeholder="+56 9 1234 5678">
      </div>
      <div class="cf-field">
        <label>Email *</label>
        <input type="email" name="email" required placeholder="juan@empresa.cl">
      </div>
      <div class="cf-field">
        <label>RUT empresa (opcional)</label>
        <input type="text" name="rut" placeholder="12.345.678-9">
      </div>
    </form>
  `;

  if (foot) {
    foot.style.display = '';
    foot.innerHTML = `
      <button class="btn" id="confirmarBtn" style="width:100%;justify-content:center;">
        Confirmar y enviar pedido →
      </button>
      <button onclick="_resetDrawer()"
        style="background:none;border:none;color:var(--text-muted);font-size:13px;cursor:pointer;margin-top:10px;width:100%;">
        ← Volver al carrito
      </button>
    `;
    foot.querySelector('#confirmarBtn')?.addEventListener('click', _submitCheckout);
  }
}

async function _submitCheckout() {
  const form = document.getElementById('checkoutForm');
  if (!form?.checkValidity()) { form?.reportValidity(); return; }

  const btn = document.getElementById('confirmarBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

  const fd = new FormData(form);
  const clienteData = {
    nombre:   fd.get('nombre'),
    telefono: fd.get('telefono'),
    email:    fd.get('email'),
    rut:      fd.get('rut') || undefined,
  };

  _lastCartItems = STATE.cart.map(i => ({ ...i }));

  try {
    const res    = await OrderService.checkout(clienteData);
    const numero = res?.numero || res?.numero_pedido || 'N/A';
    CartService.clear();
    _showConfirmedView(numero, clienteData);
  } catch (e) {
    console.error('Checkout error:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar y enviar pedido →'; }
    alert('Error al enviar el pedido. Por favor intenta nuevamente o contáctanos por WhatsApp.');
  }
}

function _showConfirmedView(numero, cliente) {
  const items = document.getElementById('drawerItems');
  const foot  = document.getElementById('drawerFoot');
  const head  = document.querySelector('.drawer-head h3');
  if (head) head.textContent = '¡Pedido recibido!';

  items.innerHTML = `
    <div style="text-align:center;padding:32px 16px;">
      <div style="font-size:52px;margin-bottom:14px;">✅</div>
      <div class="mono" style="font-size:20px;font-weight:700;color:var(--blue);margin-bottom:8px;">${numero}</div>
      <div style="color:var(--text-mid);font-size:14px;line-height:1.7;margin-bottom:20px;">
        Pago coordinado por transferencia o contraentrega —<br>
        te contactaremos por <strong style="color:var(--text-dark);">WhatsApp</strong> para confirmar el pago.
      </div>
      <div style="background:var(--section-alt);border:1.5px solid var(--card-border);border-radius:10px;padding:14px;font-size:13px;color:var(--text-mid);">
        Confirmación enviada a<br><strong style="color:var(--text-dark);">${cliente.email || cliente.telefono}</strong>
      </div>
    </div>
  `;

  if (foot) {
    foot.style.display = '';
    foot.innerHTML = `
      <button class="btn" onclick="closeCart()"
        style="width:100%;justify-content:center;">
        Cerrar
      </button>
    `;
  }
}

function _downloadPdf(numero) {
  const saved = STATE.cart;
  STATE.cart = _lastCartItems;
  PdfService.generateQuote({ numero });
  STATE.cart = saved;
}
