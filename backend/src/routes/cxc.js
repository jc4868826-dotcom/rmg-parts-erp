const router = require('express').Router()
const c = require('../controllers/cxcController')
const { authenticate } = require('../middleware/auth')

router.get('/',           c.getFacturas)
router.get('/resumen',    c.getResumen)
router.get('/clientes',   c.getCuentasCorrientes)
router.get('/ventas',     c.getVentasPendientes)
router.post('/',          c.crearFactura)
router.post('/:id/cobrar', authenticate, c.marcarCobrada)

module.exports = router
