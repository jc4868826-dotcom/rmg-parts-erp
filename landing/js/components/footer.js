function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.innerHTML = `
<div class="container" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
  <div>
    <div style="font-weight:800;font-size:18px;color:#fff">RMG Auto Parts</div>
    <p style="margin-top:4px">Distribuidores mayoristas · Santiago, Chile</p>
  </div>
  <p style="color:var(--text-muted)">© ${new Date().getFullYear()} RMG Parts · Todos los derechos reservados</p>
</div>`;
}
