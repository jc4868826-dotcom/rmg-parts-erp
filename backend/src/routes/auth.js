/**
 * RMG Auto Parts — Rutas de Autenticación
 * Login · Logout · Perfil · Roles
 */

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  authController.login
);

// POST /api/auth/logout
router.post('/logout', authenticate, authController.logout);

// GET /api/auth/me
router.get('/me', authenticate, authController.getMe);

// POST /api/auth/cambiar-password
router.post('/cambiar-password',
  authenticate,
  [body('nueva_password').isLength({ min: 8 })],
  authController.changePassword
);

module.exports = router;
