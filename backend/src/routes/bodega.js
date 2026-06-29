const router = require('express').Router()
const c = require('../controllers/bodegaController')

router.get('/movimientos',           c.getMovimientos)
router.post('/ajuste',               c.ajustarStock)
router.post('/recibir-oc/:id',       c.recibirOC)
router.get('/producto/:codigo',      c.getStockConMovimientos)

module.exports = router
