function renderProductoDetalle(sku) {
  const product = STATE.products.find(p => String(p.id) === String(sku) || String(p.sku) === String(sku));
  const container = document.getElementById('featured-products');
  if (!container) return;

  if (!product) {
    container.innerHTML = `
<div class="container" style="padding:80px 0;text-align:center">
  <p class="muted">Producto no encontrado.</p>
  <button class="btn btn-outline" style="margin-top:20px" onclick="Router.navigate('/')">← Volver</button>
</div>`;
    return;
  }

  const precio = Number(product.precio) || 0;
  container.innerHTML = `
<div class="container" style="padding:60px 0">
  <button class="btn btn-outline" onclick="Router.navigate('/')" style="margin-bottom:32px;font-size:14px">← Volver al catálogo</button>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start">
    <div>
      <img src="${product.imagen}" alt="${product.nombre}"
        style="width:100%;border-radius:16px;background:var(--panel-light);max-height:360px;object-fit:contain;padding:24px">
    </div>
    <div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">SKU: ${product.sku || product.id}</p>
      <h1 style="font-size:32px;line-height:1.2;margin-bottom:12px">${product.nombre}</h1>
      <p style="font-size:16px;margin-bottom:8px">${product.marca}</p>
      <p style="font-size:14px;color:var(--text-muted);margin-bottom:24px">${product.descripcion || ''}</p>
      <div style="margin-bottom:24px">
        <div style="font-size:38px;font-weight:800;color:var(--primary)">$${precio.toLocaleString('es-CL')}</div>
        <p style="font-size:13px;color:var(--text-muted)">Precio neto + IVA 19%</p>
      </div>
      <button class="btn btn-primary add-to-cart" data-id="${product.id}"
        style="width:100%;font-size:16px;padding:18px">
        Agregar al carrito
      </button>
    </div>
  </div>
</div>`;
}
