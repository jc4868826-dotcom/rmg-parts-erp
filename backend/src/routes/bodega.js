const router = require('express').Router()
const c = require('../controllers/bodegaController')

router.get('/movimientos',           c.getMovimientos)
router.post('/ajuste',               c.ajustarStock)
// La recepción de OC vive únicamente en /api/oc/:id/recepcion (ocController.js) —
// este endpoint no lo usa ningún frontend y quedaba como una tercera implementación
// de la misma recepción, con su propia forma de nombrar el estado.
router.get('/producto/:codigo',      c.getStockConMovimientos)

module.exports = router
