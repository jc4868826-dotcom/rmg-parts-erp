function renderSearchBar(){

return `
<div class="container search-wrapper">

<div class="search-box">

<input 
type="text" 
id="searchInput"
placeholder="Buscar por producto, marca, código o categoría..."
/>

</div>

<div id="searchResults" class="search-results"></div>

</div>
`;
}

/* =========================
   SEARCH ENGINE (DEBOUNCE)
========================= */

let searchTimeout;

document.addEventListener("input",(e)=>{

if(e.target.id !== "searchInput") return;

clearTimeout(searchTimeout);

searchTimeout = setTimeout(async ()=>{

const text = e.target.value.trim();

if(text.length < 2){
STATE.searchResults = [];
document.getElementById("searchResults").innerHTML = "";
return;
}

STATE.searchResults = await SearchService.search(text);

renderSearchResults();

},300);

});

/* =========================
   RENDER SEARCH RESULTS
========================= */

function renderSearchResults(){

const container = document.getElementById("searchResults");

if(!STATE.searchResults.length){
container.innerHTML = "<p class='muted'>Sin resultados</p>";
return;
}

container.innerHTML = `
<div class="products">
${STATE.searchResults.map(productCard).join("")}
</div>
`;

}
