document.addEventListener('DOMContentLoaded', async () => {

  // ── Recuperar sesión persistida ─────────────────────────────────
  const savedUser = localStorage.getItem('rmg_user');
  if (savedUser) try { STATE.user = JSON.parse(savedUser); } catch (_) {}

  const savedFavs = localStorage.getItem('rmg_favorites');
  if (savedFavs) try { STATE.favorites = JSON.parse(savedFavs); } catch (_) {}

  // ── Categorías (estáticas) + renderizado inmediato ──────────────
  STATE.categories = await CategoryService.getAll();
  renderHeader();
  renderHero();
  renderSearch();
  renderCategories();
  renderCart();
  renderFooter();

  // ── Productos desde ERP (con fallback a mock) ───────────────────
  document.getElementById('featured-products').innerHTML = `
<div class="container">
  <div class="products">
    ${[1,2,3,4].map(() => '<div class="skeleton"></div>').join('')}
  </div>
</div>`;

  try {
    STATE.products = await ProductService.getAll();
  } catch (e) {
    console.warn('ERP falló, usando mock:', e.message);
    STATE.products = (typeof MOCK_PRODUCTS !== 'undefined') ? MOCK_PRODUCTS : [];
  }

  // ── Router hash-based ───────────────────────────────────────────
  Router
    .on('/', () => renderProducts())
    .on('/producto/:sku', ({ sku }) => renderProductoDetalle(sku))
    .on('/confirmacion/:numero', ({ numero }) => renderConfirmacion(numero))
    .init();

  // ── Sincronizar badge del carrito ───────────────────────────────
  Events.on('cart:updated', () => {
    _updateCartBadge();
    renderCartDrawer();
  });

});

function renderSearch() {
  const el = document.getElementById('search');
  if (!el) return;
  el.innerHTML = `
<div class="container search-wrapper">
  <div class="search-box">
    <input type="text" id="searchInput" autocomplete="off"
      placeholder="Buscar por producto, marca, código SKU..."
      style="width:100%;background:var(--panel);border:1px solid var(--border);color:#fff;
             padding:16px 22px;border-radius:14px;font-size:16px;outline:none">
  </div>
  <div id="searchResults" class="search-results"></div>
</div>`;
}
