const router = require('express').Router()
const { db } = require('../../config/database')
const fs = require('fs')
const path = require('path')

let vistonyData = []
try {
  const raw = fs.readFileSync(path.join(__dirname, '../../../asistente/vistony_catalogo.json'), 'utf8')
  vistonyData = JSON.parse(raw)
  console.log(`[listaPrecios] Catálogo Vistony cargado: ${vistonyData.length} productos`)
} catch (e) {
  console.log('[listaPrecios] vistony_catalogo.json no disponible:', e.message)
}

function _norm(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

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

    // Enrich with Vistony catalog matches not already covered by ERP results
    const normTerms = terms.map(_norm)
    const erpDescriptions = new Set(rows.map(r => _norm(r.descripcion)))

    const vistonyMatches = vistonyData.filter(v => {
      const hay = _norm(v.nombre) + ' ' + _norm(v.aplicacion) + ' ' + _norm(v.sae_viscosidad)
      return normTerms.every(t => hay.includes(t))
    })

    const extraRows = []
    for (const v of vistonyMatches) {
      const normNombre = _norm(v.nombre)
      // Skip if an ERP row already covers this product
      const alreadyCovered = rows.some(r => _norm(r.descripcion).includes(normNombre) || normNombre.includes(_norm(r.descripcion).split(' ')[0]))
      if (alreadyCovered) continue
      // Try to find a loose ERP match by product name keyword
      const erpMatch = rows.find(r => _norm(r.descripcion).includes(normNombre.split(' ')[0]))
      if (!erpMatch) {
        extraRows.push({
          codigo_sku: null,
          descripcion: v.nombre,
          producto_generico: v.aplicacion,
          marca: 'VISTONY',
          proveedor: 'VISTONY',
          presentacion: v.presentaciones || null,
          tipo_envase: null,
          costo_unidad_neto: null,
          precio_venta_neto: null,
          categoria: null,
          segmento_negocio: null,
          nota: 'Consultar disponibilidad',
          sae_viscosidad: v.sae_viscosidad || null,
        })
      }
    }

    res.json([...rows, ...extraRows])
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
