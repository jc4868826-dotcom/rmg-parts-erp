const router = require('express').Router()
const c = require('../controllers/flujoCajaController')
const { authenticate } = require('../middleware/auth')

router.get('/',          authenticate, c.getMovimientos)
router.get('/resumen',   authenticate, c.getResumen)
router.post('/manual',   authenticate, c.crearManual)
router.put('/:id',       authenticate, c.actualizar)
router.delete('/:id',    authenticate, c.eliminar)

module.exports = router
