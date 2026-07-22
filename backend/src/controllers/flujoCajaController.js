'use strict'
const { db, uuidv4 } = require('../../config/database')

const hoy = () => new Date().toISOString().split('T')[0]

const getMovimientos = (req, res) => {
  try {
    // Si se pasa ?mes=YYYY-MM devuelve resumen ERP (ventas + gastos + compras)
    if (req.query.mes) {
      const filtro = `${req.query.mes}%`
      const entradas = db.prepare("SELECT COALESCE(SUM(total),0) as v FROM ventas WHERE fecha LIKE ? AND estado='Pagado'").get(filtro).v
      const salidas_gastos = db.prepare("SELECT COALESCE(SUM(monto),0) as v FROM gastos WHERE fecha LIKE ?").get(filtro).v
      const salidas_compras = db.prepare("SELECT COALESCE(SUM(total),0) as v FROM compras WHERE fecha LIKE ? AND estado='Pagado'").get(filtro).v
      return res.json({
        mes: req.query.mes,
        entradas, salidas_gastos, salidas_compras,
        saldo_final: entradas - salidas_gastos - salidas_compras,
      })
    }

    const { modo = 'proyectado', desde, hasta, tipo, categoria, cuenta_bancaria, estado } = req.query
    let sql = 'SELECT * FROM caja_movimientos WHERE 1=1'
    const params = []

    if (modo === 'real') {
      sql += ` AND estado = 'confirmado' AND fecha_pago <= ?`
      params.push(hoy())
    } else if (estado) {
      sql += ' AND estado = ?'
      params.push(estado)
    }

    if (desde)           { sql += ' AND fecha_pago >= ?';          params.push(desde) }
    if (hasta)           { sql += ' AND fecha_pago <= ?';          params.push(hasta) }
    if (tipo)            { sql += ' AND tipo = ?';                 params.push(tipo) }
    if (categoria)       { sql += ' AND categoria LIKE ?';         params.push(`%${categoria}%`) }
    if (cuenta_bancaria) { sql += ' AND cuenta_bancaria = ?';      params.push(cuenta_bancaria) }

    sql += ' ORDER BY fecha_pago ASC, created_at ASC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getResumen = (_req, res) => {
  try {
    const today = hoy()
    const en30 = new Date(); en30.setDate(en30.getDate() + 30)
    const en30str = en30.toISOString().split('T')[0]

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
    const { tipo, categoria, descripcion, monto, fecha_pago, estado, cuenta_bancaria } = req.body
    if (!tipo || !descripcion || !monto) {
      return res.status(400).json({ error: 'tipo, descripcion y monto son requeridos' })
    }
    if (!['ingreso', 'egreso'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo debe ser ingreso o egreso' })
    }
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, cuenta_bancaria)
      VALUES (?,?,?,?,?,?,?,'manual',?)
    `).run(tipo, categoria || null, descripcion, Number(monto),
        hoy(), fecha_pago || hoy(), estado || 'proyectado', cuenta_bancaria || null)
    const nuevo = db.prepare('SELECT * FROM caja_movimientos ORDER BY id DESC LIMIT 1').get()
    res.status(201).json(nuevo)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const actualizar = (req, res) => {
  try {
    const m = db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id)
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' })
    const allowed = ['tipo', 'categoria', 'descripcion', 'monto', 'fecha_pago', 'estado', 'cuenta_bancaria']
    const toUpdate = allowed.filter(f => req.body[f] !== undefined)
    if (!toUpdate.length) return res.json(m)
    const set = toUpdate.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE caja_movimientos SET ${set} WHERE id = ?`)
      .run(...toUpdate.map(f => req.body[f]), req.params.id)
    res.json(db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const eliminar = (req, res) => {
  try {
    const m = db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id)
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' })
    if (m.origen_tabla !== 'manual') {
      return res.status(400).json({ error: 'Solo se pueden eliminar movimientos manuales' })
    }
    db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getMovimientos, getResumen, crearManual, actualizar, eliminar }
