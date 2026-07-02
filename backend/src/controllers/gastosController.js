'use strict'
const { db, uuidv4 } = require('../../config/database')

const hoy = () => new Date().toISOString().split('T')[0]

function insertCaja(tipo, categoria, descripcion, monto, fecha_pago, origen_tabla, origen_id, estado) {
  try {
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(tipo, categoria, descripcion, monto, hoy(), fecha_pago || hoy(), estado, origen_tabla, origen_id)
  } catch (_) {}
}

const getAll = (req, res) => {
  try {
    const { categoria } = req.query
    let sql = 'SELECT * FROM gastos'
    const params = []
    if (categoria) { sql += ' WHERE categoria = ?'; params.push(categoria) }
    sql += ' ORDER BY fecha DESC, created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const { fecha, categoria, descripcion, monto, comprobante, fecha_pago } = req.body
    if (!fecha || !categoria || !descripcion || !monto) {
      return res.status(400).json({ error: 'fecha, categoria, descripcion y monto son requeridos' })
    }
    const id = uuidv4()
    const fechaPago = fecha_pago || fecha
    const estadoGasto = fechaPago > hoy() ? 'pendiente' : 'pagado'

    db.prepare(`
      INSERT INTO gastos (id, fecha, categoria, descripcion, monto, comprobante, fecha_pago, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, fecha, categoria, descripcion, Number(monto), comprobante || null, fechaPago, estadoGasto)

    const estadoCaja = fechaPago > hoy() ? 'proyectado' : 'confirmado'
    insertCaja('egreso', categoria, descripcion, Number(monto), fechaPago, 'gastos', id, estadoCaja)

    res.status(201).json(db.prepare('SELECT * FROM gastos WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, create }
