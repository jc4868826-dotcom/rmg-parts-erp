const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/clientesController')
const { authenticate } = require('../middleware/auth')

router.get('/',        authenticate, ctrl.getAll)
router.post('/send-email',      authenticate, ctrl.sendEmail)
router.get('/:id',     authenticate, ctrl.getOne)
router.post('/',       authenticate, ctrl.create)
router.put('/:id',     authenticate, ctrl.update)
router.delete('/:id',  authenticate, ctrl.remove)
router.get('/:id/bitacora',     authenticate, ctrl.getBitacora)
router.post('/:id/bitacora',    authenticate, ctrl.addBitacora)

module.exports = router
