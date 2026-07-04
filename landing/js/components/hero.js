function renderHero() {
  const el = document.getElementById('hero');
  if (!el) return;
  el.innerHTML = `
<div class="hero-content container">
  <h1>Repuestos<br><span style="color:var(--primary)">sin vueltas.</span></h1>
  <p style="font-size:20px;margin-top:16px;max-width:520px">
    Neumáticos, baterías, aceites y lubricantes al precio mayorista.
    Entrega express en todo Santiago.
  </p>
  <div style="display:flex;gap:14px;margin-top:32px;flex-wrap:wrap">
    <button class="btn btn-primary" onclick="document.getElementById('searchInput')?.focus()">
      Buscar producto
    </button>
    <button class="btn btn-outline" id="cartButton2">
      Ver carrito
    </button>
  </div>
</div>`;

  const b2 = document.getElementById('cartButton2');
  if (b2) b2.onclick = () => { STATE.cartOpen = true; renderCartDrawer(); };
}
