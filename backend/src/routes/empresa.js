/**
 * RMG Parts — Datos de la empresa (membrete de todos los documentos).
 * GET  /api/empresa   lectura (cualquier usuario autenticado)
 * PUT  /api/empresa   solo gerente / administrador
 */
const router = require('express').Router()
const c = require('../controllers/empresaController')
const { authenticate } = require('../middleware/auth')

router.get('/', authenticate, c.get)
router.put('/', authenticate, c.update)

module.exports = router
