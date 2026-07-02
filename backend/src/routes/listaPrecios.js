const router = require('express').Router()
const { db } = require('../../config/database')

router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM lista_precios ORDER BY proveedor, categoria, ranking_compra').all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
