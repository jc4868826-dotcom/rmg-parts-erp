const router = require('express').Router()
const c = require('../controllers/ventasController')
const { authenticate } = require('../middleware/auth')

router.get('/',      authenticate, c.getAll)
router.post('/',     authenticate, c.create)
router.get('/:id',   authenticate, c.getOne)
router.put('/:id',   authenticate, c.update)
router.delete('/:id',authenticate, c.remove)

module.exports = router
