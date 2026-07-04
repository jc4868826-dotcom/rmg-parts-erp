async function renderApp(){

document.getElementById("featured-products").innerHTML = `
<div class="container">
<h2>Productos</h2>
<div class="products">
<div class="skeleton"></div>
<div class="skeleton"></div>
<div class="skeleton"></div>
<div class="skeleton"></div>
</div>
</div>
`;

STATE.categories = await CategoryService.getAll();
STATE.products = await ProductService.getAll();

renderHeader();
renderHero();
renderSearchBar();
renderCategories();
renderProducts();
renderCart();

Events.on("cart:updated", renderHeader);

}

/* =========================
   RENDER PRODUCTS
========================= */

function renderProducts(products) {
  const list = products || STATE.products;
  const featured = list.filter(p => p.destacado !== false);
  document.getElementById('featured-products').innerHTML = `
<div class="container">
  <h2>Productos destacados</h2>
  <div class="products">
    ${featured.length
      ? featured.map(productCard).join('')
      : '<p class="muted">Cargando productos...</p>'}
  </div>
</div>`;
}

function renderCategories(){

document.getElementById("categories").innerHTML = `
<div class="container">
<h2>Categorías</h2>

<div class="categories">
${STATE.categories.map(categoryCard).join("")}
</div>

</div>
`;
}

/* INIT EXTENDIDO */
async function initB2B(){

const savedUser = localStorage.getItem("rmg_user");

if(savedUser){
STATE.user = JSON.parse(savedUser);
}

STATE.categories = await CategoryService.getAll();
STATE.products = await ProductService.getAll();

renderApp();

}

/* entry point único en app.js */

/* =========================
   RENDER ORDERS
========================= */

function renderOrdersSection(){

const el = document.getElementById("business");

if(!el) return;

el.innerHTML = renderOrders();

}
