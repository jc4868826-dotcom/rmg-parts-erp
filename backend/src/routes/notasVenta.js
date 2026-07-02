const router = require('express').Router()
const c = require('../controllers/notasVentaController')
const { authenticate } = require('../middleware/auth')

router.get('/',                          authenticate, c.getAll)
router.get('/:id',                       authenticate, c.getOne)
router.post('/from-pedido/:pedidoId',    authenticate, c.createFromPedido)
router.post('/:id/pago',                 authenticate, c.registrarPago)

module.exports = router
