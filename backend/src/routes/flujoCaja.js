const router = require('express').Router()
const c = require('../controllers/flujoCajaController')
const { authenticate } = require('../middleware/auth')
const { db } = require('../../config/database')

// TEMP: desglose del saldo_actual para diagnóstico (sin auth)
router.get('/debug-saldo', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const vDate = `CASE forma_pago WHEN 'Crédito 30 días' THEN date(fecha,'+30 days') WHEN 'Crédito 60 días' THEN date(fecha,'+60 days') WHEN 'Crédito 90 días' THEN date(fecha,'+90 days') ELSE fecha END`

    const ventas = db.prepare(`SELECT COALESCE(SUM(total),0) as s FROM ventas WHERE estado='Pagado' AND (${vDate}) <= ?`).get(today).s
    const cajaNeta = db.prepare(`SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END),0) as s FROM caja_movimientos WHERE estado='confirmado' AND fecha_pago <= ?`).get(today).s
    const gcols = db.prepare('PRAGMA table_info(gastos)').all().map(col => col.name)
    const gDate = gcols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha)' : 'fecha'
    const gastosPagados = db.prepare(`SELECT COALESCE(SUM(monto),0) as s FROM gastos WHERE estado='pagado' AND ${gDate} <= ?`).get(today).s

    const cajaDetalle = db.prepare(`SELECT id, tipo, monto, fecha_pago, descripcion, origen_tabla, estado FROM caja_movimientos WHERE estado='confirmado' AND fecha_pago <= ? ORDER BY fecha_pago`).all(today)
    const gastosDetalle = db.prepare(`SELECT id, descripcion, monto, ${gDate} AS fecha_pago, estado FROM gastos WHERE estado='pagado' AND ${gDate} <= ? ORDER BY fecha_pago`).all(today)

    res.json({
      hoy: today,
      step1_ventas_pagadas: ventas,
      step2_caja_neta_confirmada: cajaNeta,
      step3_gastos_pagados_tabla: gastosPagados,
      saldo_actual_calculado: ventas + cajaNeta - gastosPagados,
      caja_detalle: cajaDetalle,
      gastos_detalle: gastosDetalle,
    })
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
