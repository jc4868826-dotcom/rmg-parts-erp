/*
==========================================================
RMG PARTS
API LAYER
==========================================================
*/

class Api{

    constructor(){

        this.baseURL=CONFIG.BASE_URL;

    }

    async get(endpoint){

        const response=await fetch(this.baseURL+endpoint);

        if(!response.ok){

            throw new Error("API Error");

        }

        return await response.json();

    }

    async post(endpoint,data){

        const response=await fetch(this.baseURL+endpoint,{

            method:"POST",

            headers:{
                "Content-Type":"application/json"
            },

            body:JSON.stringify(data)

        });

        if(!response.ok){

            throw new Error("API Error");

        }

        return await response.json();

    }

}

const api=new Api();

console.log("API Layer OK");

