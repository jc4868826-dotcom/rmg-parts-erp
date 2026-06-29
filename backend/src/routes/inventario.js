const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/inventarioController')
const { authenticate } = require('../middleware/auth')

router.get('/stock',           authenticate, ctrl.getStock)
router.get('/alertas',         authenticate, ctrl.getAlertas)
router.get('/movimientos',     authenticate, ctrl.getMovimientos)
router.patch('/:codigo/stock', authenticate, ctrl.ajustarStock)

module.exports = router
