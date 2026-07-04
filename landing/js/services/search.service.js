/*
==========================================================
SEARCH SERVICE
==========================================================
*/

const SearchService={

    async search(text){

        return await ProductService.search(text);

    }

};

console.log("SearchService OK");

