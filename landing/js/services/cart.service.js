const STORAGE_KEY="rmg_cart";

const CartService={

    load(){
        STATE.cart = Storage.load(STORAGE_KEY);
    },

    save(){
        Storage.save(STORAGE_KEY,STATE.cart);
    },

    add(product){

        const item = STATE.cart.find(i=>i.id===product.id);

        if(item){
            item.qty++;
        } else {
            STATE.cart.push({...product, qty:1});
        }

        this.save();
        Events.emit("cart:updated", STATE.cart);
    },

    remove(id){
        STATE.cart = STATE.cart.filter(i=>i.id!==id);
        this.save();
        Events.emit("cart:updated", STATE.cart);
    },

    clear(){
        STATE.cart=[];
        this.save();
        Events.emit("cart:updated", STATE.cart);
    },

    subtotal(){
        return STATE.cart.reduce((a,b)=>a+b.precio*b.qty,0);
    },

    iva(){
        return this.subtotal()*CONFIG.IVA;
    },

    total(){
        return this.subtotal()+this.iva();
    }

};

CartService.load();
