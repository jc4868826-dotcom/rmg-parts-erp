const InventoryService = {

async getStock(productId){

if(CONFIG.USE_MOCK_DATA){

const product = STATE.products.find(p => p.id === productId);

return product ? product.stock : 0;

}

return await api.get(`${CONFIG.ENDPOINTS.inventario}/${productId}`);

}

};
