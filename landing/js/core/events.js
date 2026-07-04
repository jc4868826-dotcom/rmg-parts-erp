const Events = {

    listeners: {},

    on(event, callback){

        if(!this.listeners[event]) this.listeners[event]=[];

        this.listeners[event].push(callback);

    },

    emit(event, data){

        (this.listeners[event]||[]).forEach(cb=>cb(data));

    }

};
