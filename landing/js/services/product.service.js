const _erpToProduct = r => ({
  id:          r.codigo_sku,
  sku:         r.codigo_sku,
  nombre:      r.descripcion,
  marca:       r.marca || '',
  categoria:   r.producto_generico || '',
  precio:      Number(r.precio_venta_neto) || 0,
  stock:       Number(r.stock_actual) || 0,
  imagen:      'assets/img/mock/placeholder.jpg',
  destacado:   true,
  descripcion: r.descripcion
});

const ProductService = {

  async getAll() {
    if (CONFIG.USE_MOCK_DATA) {
      return (MOCK_PRODUCTS || []).map(p => ({ ...p, imagen: 'assets/img/mock/placeholder.jpg' }));
    }
    const rows = await api.get(CONFIG.ENDPOINTS.productos);
    return (rows || []).map(_erpToProduct);
  },

  async search(text) {
    if (CONFIG.USE_MOCK_DATA || text.length < 2) {
      return (MOCK_PRODUCTS || [])
        .filter(p => p.nombre.toLowerCase().includes(text.toLowerCase()))
        .map(p => ({ ...p, imagen: 'assets/img/mock/placeholder.jpg' }));
    }
    try {
      const rows = await api.get(`${CONFIG.ENDPOINTS.buscar}?q=${encodeURIComponent(text)}`);
      return (rows || []).map(_erpToProduct);
    } catch (e) {
      return [];
    }
  }

};
