function productCard(product) {
  const isFav = STATE.favorites && STATE.favorites.includes(product.id);
  const precio = Number(product.precio) || 0;
  const stock = Number(product.stock);
  const stockHtml = (!isNaN(stock) && stock <= 5 && stock > 0)
    ? `<p style="color:var(--warning);font-size:12px">⚠️ Últimas ${stock} unidades</p>`
    : '';

  return `
<div class="card product-card" style="padding:20px">
  <img src="${product.imagen}" alt="${product.nombre}" style="height:140px;object-fit:contain;width:100%;border-radius:8px;background:var(--panel-light)">
  <button class="fav-btn" data-id="${product.id}">${isFav ? '♥' : '♡'}</button>
  <div style="padding:4px 0">
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:2px">${product.sku || product.id}</p>
    <h3 style="font-size:15px;line-height:1.3;margin-bottom:4px">${product.nombre}</h3>
    <p style="font-size:13px;margin-bottom:6px">${product.marca}</p>
    ${stockHtml}
    <strong style="font-size:20px;color:var(--primary)">$${precio.toLocaleString('es-CL')}</strong>
    <p style="font-size:11px;color:var(--text-muted)">+ IVA</p>
  </div>
  <button class="btn btn-primary add-to-cart" data-id="${product.id}" style="width:100%;margin-top:10px">
    Agregar al carrito
  </button>
</div>`;
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('add-to-cart')) {
    const id = e.target.dataset.id;
    const product = (STATE.searchResults.length ? STATE.searchResults : STATE.products)
      .find(p => String(p.id) === String(id));
    if (product) {
      CartService.add(product);
      _updateCartBadge && _updateCartBadge();
      STATE.cartOpen = true;
      renderCartDrawer && renderCartDrawer();
    }
  }

  if (e.target.classList.contains('fav-btn')) {
    const id = e.target.dataset.id;
    FavoritesService.toggle(id);
    e.target.textContent = STATE.favorites.includes(id) ? '♥' : '♡';
  }
});
