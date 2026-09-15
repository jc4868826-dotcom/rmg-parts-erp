const router = require('express').Router()
const c = require('../controllers/ventasController')
const { authenticate } = require('../middleware/auth')
const { uploadDocumento } = require('../middleware/documentos')

router.get('/',                              authenticate, c.getAll)
router.post('/',                             authenticate, c.create)
router.post('/desde-cotizacion/:cotizacionId', authenticate, c.createFromCotizacion)
router.post('/desde-pedido/:pedidoId',        authenticate, c.createFromPedido)
router.get('/:id',                            authenticate, c.getOne)
router.put('/:id',                            authenticate, c.update)
router.patch('/:id/estado',                   authenticate, c.cambiarEstadoLogistico)
router.post('/:id/pago',                      authenticate, c.registrarPago)
router.post('/:id/comprobante',               authenticate, uploadDocumento.single('archivo'), c.subirComprobantePago)
router.post('/:id/validar-pago',              authenticate, c.validarPago)
// Trazabilidad cotización↔OC (2026-09-15): recalcula el costo de las líneas
// de esta venta desde la OC vinculada en la cotización de origen — para
// cuando la vinculación se hizo (o se corrigió) después de convertir.
router.post('/:id/recalcular-costo-oc',       authenticate, c.recalcularCostoOC)
router.delete('/:id',                         authenticate, c.remove)

module.exports = router
