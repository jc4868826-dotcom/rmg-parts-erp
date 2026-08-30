/**
 * DEPRECADO — Nota de Venta salió del flujo comercial (ver Venta, en ventasController.js).
 * Se deja solo lectura para no perder el historial de notas de venta ya emitidas;
 * no se pueden crear ni pagar notas de venta nuevas desde acá.
 */
const router = require('express').Router()
const c = require('../controllers/notasVentaController')
const { authenticate } = require('../middleware/auth')

router.get('/',                          authenticate, c.getAll)
router.get('/:id',                       authenticate, c.getOne)

module.exports = router
