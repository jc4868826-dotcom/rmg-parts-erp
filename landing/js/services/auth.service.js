const AuthService = {

async login(email, password){

if(CONFIG.USE_MOCK_DATA){

const user = {
id: 1,
name: "Cliente Demo",
email,
type: "B2B",
priceList: "gold",
discount: 0.12
};

STATE.user = user;
localStorage.setItem("rmg_user", JSON.stringify(user));

return user;

}

const res = await api.post(CONFIG.ENDPOINTS.login, { email, password });

STATE.user = res.user;

return res;

},

logout(){

STATE.user = null;
localStorage.removeItem("rmg_user");

}

};

(function initUser(){

const saved = localStorage.getItem("rmg_user");

if(saved){
STATE.user = JSON.parse(saved);
}

})();
