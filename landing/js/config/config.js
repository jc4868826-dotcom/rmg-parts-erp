const CONFIG = {

  USE_MOCK_DATA: false,

  BASE_URL: 'https://rmg-parts-erp.onrender.com',

  ENDPOINTS: {
    productos:  '/api/lista-precios',
    buscar:     '/api/lista-precios/buscar',
    categorias: 'mock',
    login:      '/api/auth/login',
    carrito:    '/api/public/cotizaciones',
    inventario: '/api/inventario'
  },

  WHATSAPP: '', // TODO: numero real

  IVA: 0.19

};
