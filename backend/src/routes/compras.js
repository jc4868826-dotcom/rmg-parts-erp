/**
 * Proveedores y Cuentas por Pagar. La Orden de Compra vive en /api/oc (ocController.js) —
 * antes también se manejaba acá bajo /compras/ordenes*, duplicado y con estados
 * inconsistentes; se retiró para que exista un solo camino.
 */
const router = require('express').Router()
const c = require('../controllers/comprasController')
const { authenticate } = require('../middleware/auth')

// Proveedores
router.get('/proveedores',         c.getProveedores)
router.get('/proveedores/:id',     c.getProveedor)
router.post('/proveedores',        c.createProveedor)
router.put('/proveedores/:id',     c.updateProveedor)

// CxP
router.get('/cxp',                 c.getCxP)
router.post('/cxp/:id/pagar',      authenticate, c.pagarFactura)
router.delete('/cxp/:id',          authenticate, c.deleteCxP)

module.exports = router
