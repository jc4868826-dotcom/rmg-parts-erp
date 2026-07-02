'use strict'
const { db, uuidv4 } = require('../../config/database')

const hoy = () => new Date().toISOString().split('T')[0]

const getMovimientos = (req, res) => {
  try {
    const { modo = 'proyectado' } = req.query
    let sql = 'SELECT * FROM caja_movimientos'
    if (modo === 'real') {
      sql += ` WHERE estado = 'confirmado' AND fecha_pago <= '${hoy()}'`
    }
    sql += ' ORDER BY fecha_pago ASC, created_at ASC'
    const rows = db.prepare(sql).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getResumen = (_req, res) => {
  try {
    const today = hoy()
    const en30 = new Date(); en30.setDate(en30.getDate() + 30); const en30str = en30.toISOString().split('T')[0]

    const saldoActual = db.prepare(`
      SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_movimientos WHERE estado = 'confirmado' AND fecha_pago <= ?
    `).get(today).saldo

    const ingresosProx30 = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total FROM caja_movimientos
      WHERE tipo = 'ingreso' AND fecha_pago > ? AND fecha_pago <= ?
    `).get(today, en30str).total

    const egresosProx30 = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total FROM caja_movimientos
      WHERE tipo = 'egreso' AND fecha_pago > ? AND fecha_pago <= ?
    `).get(today, en30str).total

    res.json({ saldo_actual: saldoActual, ingresos_prox30: ingresosProx30, egresos_prox30: egresosProx30 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const crearManual = (req, res) => {
  try {
    const { tipo, categoria, descripcion, monto, fecha_pago, estado } = req.body
    if (!tipo || !descripcion || !monto) {
      return res.status(400).json({ error: 'tipo, descripcion y monto son requeridos' })
    }
    if (!['ingreso', 'egreso'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo debe ser ingreso o egreso' })
    }
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla)
      VALUES (?,?,?,?,?,?,?,'manual')
    `).run(tipo, categoria || null, descripcion, Number(monto),
        hoy(), fecha_pago || hoy(), estado || 'proyectado')
    const nuevo = db.prepare('SELECT * FROM caja_movimientos ORDER BY id DESC LIMIT 1').get()
    res.status(201).json(nuevo)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getMovimientos, getResumen, crearManual }
