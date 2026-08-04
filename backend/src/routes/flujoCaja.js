const router = require('express').Router()
const c = require('../controllers/flujoCajaController')
const { authenticate } = require('../middleware/auth')
const { db } = require('../../config/database')

const ORIGEN_TABLAS = [
  { origen: 'compras',            tabla: 'compras',            pk: 'id' },
  { origen: 'gastos',             tabla: 'gastos',             pk: 'id' },
  { origen: 'ordenes_compra',     tabla: 'ordenes_compra',     pk: 'id' },
  { origen: 'facturas_cxc',       tabla: 'facturas_cxc',       pk: 'id' },
  { origen: 'facturas_cxp',       tabla: 'facturas_cxp',       pk: 'id' },
  { origen: 'facturas_proveedor', tabla: 'facturas_proveedor', pk: 'id' },
  { origen: 'notas_venta',        tabla: 'notas_venta',        pk: 'id' },
]

function detectarHuerfanos() {
  const huerfanos = []
  for (const { origen, tabla, pk } of ORIGEN_TABLAS) {
    try { db.prepare(`SELECT 1 FROM ${tabla} LIMIT 1`).get() } catch (_) { continue }
    const rows = db.prepare(`
      SELECT cm.id, cm.tipo, cm.monto, cm.fecha_pago, cm.origen_id, cm.descripcion, cm.origen_tabla
      FROM caja_movimientos cm
      LEFT JOIN ${tabla} t ON CAST(t.${pk} AS TEXT) = CAST(cm.origen_id AS TEXT)
      WHERE cm.origen_tabla = ? AND t.${pk} IS NULL
    `).all(origen)
    for (const row of rows) {
      huerfanos.push({ ...row, motivo_huerfano: `origen='${origen}' id='${row.origen_id}' no existe en '${tabla}'` })
    }
  }
  return huerfanos
}

// TEMP: diagnóstico de huérfanos (sin auth — endpoint temporal)
router.get('/diagnostico', (req, res) => {
  try {
    const total = db.prepare("SELECT COUNT(*) as n FROM caja_movimientos WHERE origen_tabla != 'manual'").get().n
    const huerfanos = detectarHuerfanos()
    res.json({ total_registros: total, total_huerfanos: huerfanos.length, huerfanos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// TEMP: limpieza de huérfanos (sin auth — endpoint temporal)
router.post('/limpiar-huerfanos', (req, res) => {
  try {
    const huerfanos = detectarHuerfanos()
    if (!huerfanos.length) return res.json({ eliminados: 0, ids: [] })
    const ids = huerfanos.map(h => h.id)
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`DELETE FROM caja_movimientos WHERE id IN (${placeholders})`).run(...ids)
    res.json({ eliminados: ids.length, ids })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/',          authenticate, c.getMovimientos)
router.get('/resumen',   authenticate, c.getResumen)
router.post('/manual',   authenticate, c.crearManual)
router.put('/:id',       authenticate, c.actualizar)
router.delete('/:id',    authenticate, c.eliminar)

module.exports = router
