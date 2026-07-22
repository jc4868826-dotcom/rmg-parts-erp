const router = require('express').Router()
const { getEDR } = require('../controllers/edrController')
const { authenticate } = require('../middleware/auth')

router.get('/', authenticate, getEDR)

module.exports = router
