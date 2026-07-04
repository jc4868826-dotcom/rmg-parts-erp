const FavoritesService = {

toggle(productId){

const exists = STATE.favorites.includes(productId);

if(exists){
STATE.favorites = STATE.favorites.filter(id => id !== productId);
} else {
STATE.favorites.push(productId);
}

localStorage.setItem("rmg_favorites", JSON.stringify(STATE.favorites));

Events.emit("favorites:updated", STATE.favorites);

},

load(){

STATE.favorites = JSON.parse(localStorage.getItem("rmg_favorites") || "[]");

}

};

FavoritesService.load();
