function renderHeader() {
  const el = document.getElementById('header');
  if (!el) return;
  el.innerHTML = `
<div class="container nav">
  <a class="logo" href="#/">RMG PARTS</a>
  <nav>
    <a href="#categories">Productos</a>
    <a href="#featured-products">Destacados</a>
  </nav>
  <div class="nav-actions">
    ${STATE.user ? `<span class="user-badge">${STATE.user.name || STATE.user.nombre}</span>` : ''}
    <button class="btn btn-outline" id="cartButton">
      🛒 <span id="cartCount">${STATE.cart.length}</span>
    </button>
  </div>
</div>`;

  document.getElementById('cartButton').onclick = () => {
    STATE.cartOpen = !STATE.cartOpen;
    renderCartDrawer();
  };
}
