const router = require('express').Router()
const c = require('../controllers/ocController')
const { authenticate } = require('../middleware/auth')

router.get('/pendientes-facturar', c.getPendientesFacturar)
router.get('/',                    c.getOCs)
router.post('/',      authenticate, c.createOC)
router.get('/:id',                 c.getOC)
router.put('/:id',    authenticate, c.updateOC)
router.patch('/:id/estado', authenticate, c.patchEstadoOC)
router.get('/:id/recepciones',     c.getRecepcionesOC)
router.post('/:id/recepcion', authenticate, c.registrarRecepcionOC)
router.post('/:id/factura',   authenticate, c.registrarFactura)
router.get('/:id/pdf',             c.generarPdfOC)
router.post('/:id/enviar-email',   c.enviarEmailOC)
router.get('/:id/impacto-eliminacion', c.getImpactoEliminacion)
router.delete('/:id',  authenticate, c.deleteOC)

// Trazabilidad cotización↔OC (2026-09-13, ventas calzadas) — crear una OC
// prellenada desde una cotización ganada, con cliente_id/cotizacion_id en el
// encabezado y los ítems copiados (precio de compra sugerido = costo
// negociado en la cotización si existe).
router.post('/desde-cotizacion/:cotizacionId', authenticate, c.createOCDesdeCotizacion)

// Flujo v2 (2026-09-24): la OC al proveedor se emite desde la NOTA DE VENTA.
router.post('/desde-pedido/:pedidoId', authenticate, c.createOCDesdePedido)

module.exports = router
