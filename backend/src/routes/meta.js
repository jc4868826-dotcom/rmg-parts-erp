const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/metaController')

router.get('/webhook',  ctrl.verifyWebhook)
router.post('/webhook', ctrl.handleEvent)

module.exports = router
