const router = require('express').Router()
const c = require('../controllers/comprasController')
const { authenticate } = require('../middleware/auth')

// Proveedores
router.get('/proveedores',         c.getProveedores)
router.get('/proveedores/:id',     c.getProveedor)
router.post('/proveedores',        c.createProveedor)
router.put('/proveedores/:id',     c.updateProveedor)

// Órdenes de compra — consultas
router.get('/oc-disponibles',                          c.getOcsDisponibles)
router.get('/ordenes/pendientes-workflow', authenticate, c.getPendientesWorkflow)
router.get('/ordenes',             c.getOrdenes)
router.get('/ordenes/:id',         c.getOrden)
router.post('/ordenes',            c.createOrden)
router.put('/ordenes/:id',         c.updateOrden)

// Flujo clásico (retrocompatibilidad)
router.post('/ordenes/:id/enviar', c.enviarOrden)
router.post('/ordenes/:id/recibir',c.recibirOrden)
router.post('/ordenes/:id/pagar',  c.pagarOrden)
router.delete('/ordenes/:id',      c.deleteOrden)

// Flujo de autorización (nuevos endpoints)
router.post('/ordenes/:id/enviar-autorizacion', authenticate, c.enviarAutorizacion)
router.post('/ordenes/:id/autorizar',           authenticate, c.autorizarOC)
router.post('/ordenes/:id/rechazar',            authenticate, c.rechazarOC)
router.post('/ordenes/:id/enviar-proveedor',    authenticate, c.enviarProveedor)
router.post('/ordenes/:id/recibir-bodega',      authenticate, c.recibirBodega)
router.post('/ordenes/:id/autorizar-pago',      authenticate, c.autorizarPago)

// CxP
router.get('/cxp',                 c.getCxP)
router.post('/cxp/:id/pagar',      c.pagarFactura)

// Compras ERP (tabla simple, separada de ordenes_compra)
router.get('/',           authenticate, c.getComprasList)
router.post('/',          authenticate, c.createCompra)
router.put('/:id/estado', authenticate, c.cambiarEstadoCompra)
router.put('/:id',        authenticate, c.updateCompra)
router.delete('/:id',     authenticate, c.deleteCompra)

module.exports = router
