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

module.exports = router
