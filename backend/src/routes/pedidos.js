const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/pedidosController')
const { authenticate } = require('../middleware/auth')

router.get('/',                               authenticate, ctrl.getAll)
router.get('/:id',                            authenticate, ctrl.getOne)
router.post('/',                              authenticate, ctrl.create)
router.post('/from-cotizacion/:cotizacionId', authenticate, ctrl.createFromCotizacion)
router.put('/:id',                            authenticate, ctrl.update)
router.patch('/:id/estado',                   authenticate, ctrl.cambiarEstado)

module.exports = router
