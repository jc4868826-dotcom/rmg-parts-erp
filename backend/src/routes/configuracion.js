const router = require('express').Router()
const c = require('../controllers/configuracionController')
const { authenticate } = require('../middleware/auth')

router.get('/actual', authenticate, c.getActual)
router.get('/',       authenticate, c.getByMes)
router.post('/',      authenticate, c.upsert)

module.exports = router
