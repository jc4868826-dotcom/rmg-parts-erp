/**
 * RMG Parts — Rutas de Usuarios y Perfiles
 * Solo gerente/administrador administran usuarios (acceso total).
 */
const router = require('express').Router()
const { body } = require('express-validator')
const c = require('../controllers/usuariosController')
const { authenticate, requireRole } = require('../middleware/auth')

const gestionUsuarios = [authenticate, requireRole(['gerente', 'administrador'])]

router.get('/',      ...gestionUsuarios, c.getAll)
router.get('/:id',   ...gestionUsuarios, c.getOne)

router.post('/',
  ...gestionUsuarios,
  [
    body('nombre').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('rol').isIn(c.ROLES),
  ],
  c.create
)

router.put('/:id', ...gestionUsuarios, c.update)

router.put('/:id/password',
  ...gestionUsuarios,
  [body('password').isLength({ min: 8 })],
  c.setPassword
)

router.delete('/:id', ...gestionUsuarios, c.remove)

module.exports = router
