const router = require('express').Router()
const c = require('../controllers/plantillasEmailController')
const { authenticate, requireRole } = require('../middleware/auth')

const soloEdicion = [authenticate, requireRole(['gerente', 'administrador'])]

// Cualquier usuario autenticado puede listar/ver — las usa al enviar correo.
router.get('/',     authenticate, c.list)
router.get('/:id',  authenticate, c.getOne)

// Solo gerente/administrador edita el catálogo de plantillas.
router.post('/',    ...soloEdicion, c.create)
router.put('/:id',  ...soloEdicion, c.update)
router.delete('/:id', ...soloEdicion, c.remove)

module.exports = router
