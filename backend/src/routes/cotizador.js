/**
 * RMG Parts — Rutas Cotizador (2026-09-13)
 *
 * GET    /api/cotizador                pega el código y sale — solo fuente='cotizador'
 * POST   /api/cotizador/buscar         { codigo } → SIEMPRE trae fresco desde Mercado
 *                                       Público (sin atajo de "ya ingresada"; ver
 *                                       cotizadorController.js)
 * GET    /api/cotizador/:id            detalle + ítems
 * GET    /api/cotizador/:id/excel      descarga el Excel de cruce, generado al vuelo
 *                                       desde los mismos ítems que muestra la pantalla
 * DELETE /api/cotizador/:id            elimina la cotización (ítems e historial en cascada)
 */
const router = require('express').Router()
const c = require('../controllers/cotizadorController')
const { authenticate } = require('../middleware/auth')

router.get('/',            authenticate, c.listar)
router.post('/buscar',     authenticate, c.buscar)
router.get('/:id',         authenticate, c.getDetalle)
router.get('/:id/excel',   authenticate, c.descargarExcel)
router.delete('/:id',      authenticate, c.eliminar)

module.exports = router
