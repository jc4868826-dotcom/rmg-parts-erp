const CATEGORY_ICONS = {
  tire:      '🛞',
  battery:   '🔋',
  oil:       '🛢️',
  lubricant: '🧴',
  grease:    '⚙️',
  coolant:   '❄️',
  filter:    '🔩',
  other:     '🔧'
};

function categoryCard(category) {
  const icon = CATEGORY_ICONS[category.icon] || '🔧';
  return `
<div class="card category-card" data-category="${category.name}" style="padding:24px;text-align:center;cursor:pointer">
  <div style="font-size:38px;margin-bottom:10px">${icon}</div>
  <h3 style="font-size:18px;margin-bottom:4px">${category.name}</h3>
  <p style="font-size:13px">Ver productos</p>
</div>`;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.category-card')) return;
  filterByCategory(e.target.closest('.category-card').dataset.category);
});

async function filterByCategory(category) {
  const container = document.getElementById('featured-products');
  if (!container) return;
  container.innerHTML = `<div class="container"><div class="products"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div>`;

  if (CONFIG.USE_MOCK_DATA) {
    STATE.searchResults = STATE.products.filter(p => p.categoria === category);
  } else {
    STATE.searchResults = await SearchService.search(category);
  }

  container.innerHTML = `
<div class="container">
  <h2>${category}</h2>
  <div class="products">
    ${STATE.searchResults.length
      ? STATE.searchResults.map(productCard).join('')
      : '<p class="muted">Sin productos en esta categoría</p>'}
  </div>
</div>`;
}
