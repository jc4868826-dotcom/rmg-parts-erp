const router = require('express').Router()
const c = require('../controllers/cxcController')

router.get('/',           c.getFacturas)
router.get('/resumen',    c.getResumen)
router.get('/clientes',   c.getCuentasCorrientes)
router.get('/ventas',     c.getVentasPendientes)
router.post('/',          c.crearFactura)
router.post('/:id/cobrar', c.marcarCobrada)

module.exports = router
