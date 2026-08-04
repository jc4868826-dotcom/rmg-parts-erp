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

module.exports = router
