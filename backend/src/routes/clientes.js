const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/clientesController')
const { authenticate } = require('../middleware/auth')

router.get('/',        authenticate, ctrl.getAll)
router.get('/:id',     authenticate, ctrl.getOne)
router.post('/',       authenticate, ctrl.create)
router.put('/:id',     authenticate, ctrl.update)
router.delete('/:id',  authenticate, ctrl.remove)

module.exports = router
