const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/reportesController')
const { authenticate } = require('../middleware/auth')

router.get('/ventas',    authenticate, ctrl.getVentas)
router.get('/inventario', authenticate, ctrl.getInventario)
router.get('/pipeline',  authenticate, ctrl.getPipeline)
router.get('/export',    authenticate, ctrl.exportar)

module.exports = router
