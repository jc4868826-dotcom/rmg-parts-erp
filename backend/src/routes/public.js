/**
 * RMG Auto Parts — Rutas públicas (sin autenticación)
 * Usadas por el landing para crear cotizaciones anónimas.
 */

const router = require('express').Router()
const { createDesdeLanding: createCotizacionLanding } = require('../controllers/cotizacionesController')
const { createDesdeLanding: createPedidoLanding }     = require('../controllers/pedidosController')

// POST /api/public/cotizaciones
router.post('/cotizaciones', createCotizacionLanding)

// POST /api/public/pedidos
// Body: { cliente: {nombre, telefono, email?, rut?}, lineas: [{codigo_sku, descripcion, cantidad, precio_venta_neto}] }
router.post('/pedidos', createPedidoLanding)

module.exports = router
