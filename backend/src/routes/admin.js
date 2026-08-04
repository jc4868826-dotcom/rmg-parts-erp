/**
 * POST /api/admin/reset-db  — limpieza marcha blanca
 * Vacía datos de prueba; conserva: usuarios, productos, lista_precios,
 * cluster_referencia_mercado, proveedores_sku, _migrations,
 * y pipeline_contactos donde fuente = 'Prospección jun-2026'.
 */
const express = require('express')
const router = express.Router()
const { authenticate, requireRole } = require('../middleware/auth')
const { db } = require('../../config/database')

// Tablas a vaciar completamente (en orden FK)
const RESET_TABLES = [
  'caja_movimientos',
  'gastos',
  'mensajes_whatsapp',
  'conversaciones_whatsapp',
  'facturas_cxp',
  'facturas_cxc',
  'oc_items',
  'ordenes_compra',
  'proveedores',
  'actividades_pipeline',
  'movimientos_stock',
  'cotizacion_items',
  'pedidos',
  'cotizaciones',
  'clientes',
]

router.post('/reset-db', authenticate, requireRole('admin'), (req, res) => {
  const { confirm } = req.body
  if (confirm !== 'RESET_RMG_DB') {
    return res.status(400).json({
      error: 'Falta confirmación. Envía {"confirm":"RESET_RMG_DB"} en el body.',
    })
  }

  const deleted = {}
  try {
    const doReset = db.transaction(() => {
      // Tablas de borrado total
      for (const t of RESET_TABLES) {
        try {
          deleted[t] = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n
          db.prepare(`DELETE FROM ${t}`).run()
        } catch (_) {
          deleted[t] = 0
        }
      }

      // pipeline_contactos: solo borrar los que NO son de 'Prospección jun-2026'
      try {
        const noReales = db.prepare(
          "SELECT COUNT(*) as n FROM pipeline_contactos WHERE fuente != 'Prospección jun-2026' OR fuente IS NULL"
        ).get().n
        db.prepare(
          "DELETE FROM pipeline_contactos WHERE fuente != 'Prospección jun-2026' OR fuente IS NULL"
        ).run()
        deleted['pipeline_contactos (no-reales)'] = noReales
        deleted['pipeline_contactos (conservados)'] = db.prepare(
          'SELECT COUNT(*) as n FROM pipeline_contactos'
        ).get().n
      } catch (_) {}
    })

    doReset()
    console.log('🗑️  reset-db marcha blanca ejecutado por:', req.user.email)
    return res.json({ ok: true, deleted })
  } catch (err) {
    console.error('reset-db error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── Diagnóstico de huérfanos en caja_movimientos ─────────────────────────────
// Tablas con registros reales (origen_tabla → tabla_real, columna PK)
const ORIGEN_TABLAS = [
  { origen: 'compras',           tabla: 'compras',           pk: 'id' },
  { origen: 'gastos',            tabla: 'gastos',            pk: 'id' },
  { origen: 'ordenes_compra',    tabla: 'ordenes_compra',    pk: 'id' },
  { origen: 'facturas_cxc',      tabla: 'facturas_cxc',      pk: 'id' },
  { origen: 'facturas_cxp',      tabla: 'facturas_cxp',      pk: 'id' },
  { origen: 'facturas_proveedor',tabla: 'facturas_proveedor',pk: 'id' },
  { origen: 'notas_venta',       tabla: 'notas_venta',       pk: 'id' },
]

router.get('/flujo-caja-huerfanos', authenticate, requireRole('admin'), (req, res) => {
  try {
    const total = db.prepare("SELECT COUNT(*) as n FROM caja_movimientos WHERE origen_tabla != 'manual'").get().n
    const huerfanos = []

    for (const { origen, tabla, pk } of ORIGEN_TABLAS) {
      // Verificar que la tabla existe antes de hacer el join
      let tablaExiste = false
      try {
        db.prepare(`SELECT 1 FROM ${tabla} LIMIT 1`).get()
        tablaExiste = true
      } catch (_) {}

      if (!tablaExiste) continue

      const rows = db.prepare(`
        SELECT cm.id, cm.tipo, cm.monto, cm.fecha_pago, cm.origen_id, cm.descripcion
        FROM caja_movimientos cm
        LEFT JOIN ${tabla} t ON CAST(t.${pk} AS TEXT) = CAST(cm.origen_id AS TEXT)
        WHERE cm.origen_tabla = ? AND t.${pk} IS NULL
      `).all(origen)

      for (const row of rows) {
        huerfanos.push({ ...row, motivo_huerfano: `origen_tabla='${origen}' pero id='${row.origen_id}' no existe en tabla '${tabla}'` })
      }
    }

    res.json({
      total_registros: total,
      total_huerfanos: huerfanos.length,
      huerfanos,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
