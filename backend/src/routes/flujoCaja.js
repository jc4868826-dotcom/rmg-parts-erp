const router = require('express').Router()
const c = require('../controllers/flujoCajaController')
const { authenticate, requireRole } = require('../middleware/auth')

router.get('/',          authenticate, c.getMovimientos)
router.get('/resumen',   authenticate, c.getResumen)
router.get('/raw',       authenticate, c.getRaw) // TEMP: diagnóstico saldo — quitar después
router.post('/reconciliar-090926', authenticate, requireRole(['gerente', 'administrador']), c.reconciliar090926) // TEMP: corrección puntual — quitar después de correrla
router.post('/manual',   authenticate, c.crearManual)
router.put('/:id',       authenticate, c.actualizar)
router.delete('/:id',    authenticate, c.eliminar)

module.exports = router
