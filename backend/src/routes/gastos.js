const router = require('express').Router()
const c = require('../controllers/gastosController')
const { authenticate } = require('../middleware/auth')

router.get('/',  authenticate, c.getAll)
router.post('/', authenticate, c.create)

module.exports = router
