const router = require('express').Router()
const c = require('../controllers/cxcController')

router.get('/',           c.getFacturas)
router.get('/resumen',    c.getResumen)
router.post('/',          c.crearFactura)
router.post('/:id/cobrar', c.marcarCobrada)

module.exports = router
