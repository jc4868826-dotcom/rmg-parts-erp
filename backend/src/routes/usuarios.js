/**
 * RMG Parts — Rutas de Usuarios y Perfiles
 * Solo gerente/administrador administran usuarios (acceso total).
 */
const router = require('express').Router()
const { body } = require('express-validator')
const c = require('../controllers/usuariosController')
const { authenticate, requireRole } = require('../middleware/auth')

const gestionUsuarios = [authenticate, requireRole(['gerente', 'administrador', 'facturador'])]

// Casilla de correo del propio usuario. Va ANTES de '/:id' para que Express no
// capture "me" como un id, y solo exige estar autenticado: cada quien
// configura la suya, incluidos los vendedores.
router.get('/me/correo',          authenticate, c.getMiCorreo)
router.put('/me/correo',          authenticate, c.setMiCorreo)
router.delete('/me/correo',       authenticate, c.borrarMiCorreo)
router.post('/me/correo/probar',  authenticate, c.probarMiCorreo)

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
