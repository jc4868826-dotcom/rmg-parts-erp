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

router.post('/reset-db', authenticate, requireRole('gerente'), (req, res) => {
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

// POST /api/admin/limpiar-chilecompra — borra SOLO las oportunidades nativas
// de ChileCompra (fuente='licitacion', el cron viejo ya desactivado desde
// 2026-09-11) y sus documentos adjuntos. NO toca compra_agil / evaluador /
// cotizador / cotizador_manual — comparten la misma tabla, diferenciados por
// `fuente`, y siguen intactos. Pedido de JC 2026-09-15: el motor (sql.js)
// carga toda la DB en RAM en cada ciclo, y los anexos en base64 de estas
// oportunidades viejas son lo que más pesa ahí. Hace backup automático
// (vía backupService, mismo que usa /api/backup) ANTES de borrar.
router.post('/limpiar-chilecompra', authenticate, requireRole('gerente'), (req, res) => {
  const { confirm } = req.body
  if (confirm !== 'LIMPIAR_CHILECOMPRA') {
    return res.status(400).json({
      error: 'Falta confirmación. Envía {"confirm":"LIMPIAR_CHILECOMPRA"} en el body.',
    })
  }

  try {
    const backupSvc = require('../services/backupService')
    const backup = backupSvc.createBackup('pre_limpieza_chilecompra')

    const oportunidades = db.prepare(
      "SELECT COUNT(*) as n FROM oportunidades_chilecompra WHERE fuente = 'licitacion'"
    ).get().n
    const documentos = db.prepare(`
      SELECT COUNT(*) as n FROM documentos_adjuntos
      WHERE entidad = 'oportunidad_chilecompra'
      AND entidad_id IN (SELECT id FROM oportunidades_chilecompra WHERE fuente = 'licitacion')
    `).get().n

    const doDelete = db.transaction(() => {
      db.prepare(`
        DELETE FROM documentos_adjuntos
        WHERE entidad = 'oportunidad_chilecompra'
        AND entidad_id IN (SELECT id FROM oportunidades_chilecompra WHERE fuente = 'licitacion')
      `).run()
      // items e historial se van solos: ON DELETE CASCADE + foreign_keys = ON
      db.prepare("DELETE FROM oportunidades_chilecompra WHERE fuente = 'licitacion'").run()
    })
    doDelete()
    db.exec('VACUUM')

    console.log('🧹 limpiar-chilecompra ejecutado por:', req.user.email,
      '— oportunidades:', oportunidades, 'documentos:', documentos, 'backup:', backup.filename)

    return res.json({
      ok: true,
      backup_previo: backup.filename,
      oportunidades_borradas: oportunidades,
      documentos_borrados: documentos,
    })
  } catch (err) {
    console.error('limpiar-chilecompra error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

module.exports = router
