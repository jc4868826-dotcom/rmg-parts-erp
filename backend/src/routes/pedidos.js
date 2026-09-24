const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/pedidosController')
const { authenticate } = require('../middleware/auth')

router.get('/',                               authenticate, ctrl.getAll)
// /preview antes que /:id — si no, Express lo captura como un id.
router.get('/preview/:cotizacionId',          authenticate, ctrl.previewDesdeCotizacion)
router.get('/:id',                            authenticate, ctrl.getOne)
router.post('/',                              authenticate, ctrl.create)
router.post('/from-cotizacion/:cotizacionId', authenticate, ctrl.createFromCotizacion)
router.put('/:id',                            authenticate, ctrl.update)
router.patch('/:id/estado',                   authenticate, ctrl.cambiarEstado)
// Flujo comercial v2: validar la OC del proveedor → autorización → venta.
router.post('/:id/validar-oc',                authenticate, ctrl.validarOC)
router.post('/:id/enviar-autorizacion',       authenticate, ctrl.enviarAutorizacion)
router.post('/:id/autorizar',                 authenticate, ctrl.autorizar)
router.post('/:id/rechazar',                  authenticate, ctrl.rechazar)
// Venta con stock propio: autorizada y sin OC al proveedor.
router.post('/:id/cerrar-sin-oc',             authenticate, ctrl.cerrarSinOC)
router.delete('/:id',                         authenticate, ctrl.remove)

module.exports = router
