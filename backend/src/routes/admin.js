/**
 * RUTA TEMPORAL — eliminar después de usarla en producción
 * POST /api/admin/reset-db  →  borra datos de prueba, conserva usuarios y productos
 */
const express = require('express')
const router = express.Router()
const { authenticate, requireRole } = require('../middleware/auth')
const { db } = require('../../config/database')

// Tablas a limpiar, en orden que respeta FK constraints
const RESET_TABLES = [
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
      for (const t of RESET_TABLES) {
        deleted[t] = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n
        db.prepare(`DELETE FROM ${t}`).run()
      }
      // Permite que catalog_223_v1 re-corra si fuera necesario
      db.prepare("DELETE FROM _migrations WHERE id != 'clean_test_data_v1'").run()
    })
    doReset()

    console.log('🗑️  reset-db ejecutado por:', req.user.email)
    return res.json({ ok: true, deleted })
  } catch (err) {
    console.error('reset-db error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router
