const router = require('express').Router()
const c = require('../controllers/comprasController')

// Proveedores
router.get('/proveedores',         c.getProveedores)
router.get('/proveedores/:id',     c.getProveedor)
router.post('/proveedores',        c.createProveedor)
router.put('/proveedores/:id',     c.updateProveedor)

// Órdenes de compra
router.get('/ordenes',             c.getOrdenes)
router.get('/ordenes/:id',         c.getOrden)
router.post('/ordenes',            c.createOrden)
router.put('/ordenes/:id',         c.updateOrden)
router.post('/ordenes/:id/enviar', c.enviarOrden)
router.post('/ordenes/:id/recibir',c.recibirOrden)

// CxP
router.get('/cxp',                 c.getCxP)
router.post('/cxp/:id/pagar',      c.pagarFactura)

// Compras ERP (tabla simple, separada de ordenes_compra)
const { authenticate } = require('../middleware/auth')
router.get('/',      authenticate, c.getComprasList)
router.post('/',     authenticate, c.createCompra)
router.put('/:id',   authenticate, c.updateCompra)
router.delete('/:id',authenticate, c.deleteCompra)

module.exports = router
