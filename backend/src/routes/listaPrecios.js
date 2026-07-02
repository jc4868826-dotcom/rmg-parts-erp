const router = require('express').Router()
const { db } = require('../../config/database')

router.get('/buscar', (req, res) => {
  try {
    const { q = '' } = req.query
    const term = q.trim()
    if (term.length < 2) return res.json([])

    const like = `%${term}%`
    const rows = db.prepare(`
      SELECT
        codigo_sku, descripcion, producto_generico, marca, proveedor,
        presentacion, tipo_envase, costo_unidad_neto, precio_venta_neto
      FROM lista_precios
      WHERE
        descripcion      LIKE ? COLLATE NOCASE OR
        producto_generico LIKE ? COLLATE NOCASE OR
        marca            LIKE ? COLLATE NOCASE OR
        codigo_sku       LIKE ? COLLATE NOCASE
      GROUP BY codigo_sku
      ORDER BY ranking_compra ASC, descripcion ASC
      LIMIT 20
    `).all(like, like, like, like)

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM lista_precios ORDER BY proveedor, categoria, ranking_compra').all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
