const router = require('express').Router()
const c = require('../controllers/ventasController')
const { authenticate } = require('../middleware/auth')

router.get('/',                              authenticate, c.getAll)
router.post('/',                             authenticate, c.create)
router.post('/desde-cotizacion/:cotizacionId', authenticate, c.createFromCotizacion)
router.post('/desde-pedido/:pedidoId',        authenticate, c.createFromPedido)
router.get('/:id',                            authenticate, c.getOne)
router.put('/:id',                            authenticate, c.update)
router.patch('/:id/estado',                   authenticate, c.cambiarEstadoLogistico)
router.post('/:id/pago',                      authenticate, c.registrarPago)
router.delete('/:id',                         authenticate, c.remove)

module.exports = router
