const router = require('express').Router()
const { db } = require('../../config/database')

router.get('/buscar', (req, res) => {
  try {
    const { q = '' } = req.query
    const terms = q.trim().split(/\s+/).filter(t => t.length >= 2)
    if (terms.length === 0) return res.json([])

    // Each term must match at least one field (AND between terms, OR between fields)
    const conditions = terms.map(() =>
      `(descripcion       LIKE ? COLLATE NOCASE OR
        producto_generico LIKE ? COLLATE NOCASE OR
        marca             LIKE ? COLLATE NOCASE OR
        codigo_sku        LIKE ? COLLATE NOCASE OR
        categoria         LIKE ? COLLATE NOCASE)`
    ).join(' AND ')

    const params = terms.flatMap(t => {
      const like = `%${t}%`
      return [like, like, like, like, like]
    })

    const rows = db.prepare(`
      SELECT
        codigo_sku, descripcion, producto_generico, marca, proveedor,
        presentacion, tipo_envase, costo_unidad_neto, precio_venta_neto,
        categoria, segmento_negocio
      FROM lista_precios
      WHERE ${conditions}
      GROUP BY codigo_sku
      ORDER BY ranking_compra ASC, descripcion ASC
      LIMIT 200
    `).all(...params)

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
