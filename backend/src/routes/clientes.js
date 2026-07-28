const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/clientesController')
const { authenticate } = require('../middleware/auth')

router.get('/',        authenticate, ctrl.getAll)
router.post('/send-email',      authenticate, ctrl.sendEmail)
router.put('/asignar-campana',  authenticate, (req, res) => {
  try {
    const { db } = require('../../config/database')
    const { ids, campana_id, campana_nombre } = req.body
    if (!ids?.length || !campana_id) return res.status(400).json({ error: 'ids y campana_id requeridos' })
    const ph = ids.map(() => '?').join(',')
    db.prepare(`UPDATE clientes SET campana_id = ?, campana_nombre = ? WHERE id IN (${ph})`)
      .run(campana_id, campana_nombre || null, ...ids)
    try { db.prepare(`UPDATE campanas SET total_prospectos = (SELECT COUNT(*) FROM clientes WHERE campana_id = ?) WHERE id = ?`).run(campana_id, campana_id) } catch(_) {}
    res.json({ ok: true, actualizados: ids.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
router.get('/:id',     authenticate, ctrl.getOne)
router.post('/',       authenticate, ctrl.create)
router.put('/:id',     authenticate, ctrl.update)
router.delete('/:id',  authenticate, ctrl.remove)
router.get('/:id/bitacora',     authenticate, ctrl.getBitacora)
router.post('/:id/bitacora',    authenticate, ctrl.addBitacora)

module.exports = router
