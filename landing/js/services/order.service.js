const OrderService = {

  async checkout(clienteData) {
    const lineas = STATE.cart.map(item => ({
      codigo_sku:       item.sku || String(item.id),
      descripcion:      item.nombre,
      cantidad:         item.qty,
      precio_venta_neto: item.precio
    }));

    if (CONFIG.USE_MOCK_DATA) {
      const order = {
        numero:    `DEMO-${Date.now()}`,
        total:     CartService.total(),
        items:     STATE.cart,
        createdAt: new Date().toISOString()
      };
      STATE.orders.push(order);
      localStorage.setItem('rmg_orders', JSON.stringify(STATE.orders));
      return order;
    }

    const res = await api.post(CONFIG.ENDPOINTS.carrito, {
      cliente: clienteData,
      lineas
    });
    return res;
  },

  loadOrders() {
    STATE.orders = JSON.parse(localStorage.getItem('rmg_orders') || '[]');
  }

};

OrderService.loadOrders();
