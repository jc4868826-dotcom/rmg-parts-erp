/**
 * RMG Auto Parts — Rutas públicas (sin autenticación)
 * Usadas por el landing para crear cotizaciones anónimas.
 */

const router = require('express').Router()
const { createDesdeLanding } = require('../controllers/cotizacionesController')

// POST /api/public/cotizaciones
// Body: { cliente: {nombre, telefono, email?, rut?}, lineas: [{codigo_sku, cantidad, precio_venta_neto}] }
router.post('/cotizaciones', createDesdeLanding)

module.exports = router
