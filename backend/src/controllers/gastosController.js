'use strict'
const { db, uuidv4 } = require('../../config/database')

const hoy = () => new Date().toISOString().split('T')[0]

function insertCaja(tipo, categoria, descripcion, monto, fecha_pago, origen_tabla, origen_id, estado, cuenta_bancaria) {
  try {
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id, cuenta_bancaria)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(tipo, categoria, descripcion, monto, hoy(), fecha_pago || hoy(), estado, origen_tabla, origen_id, cuenta_bancaria || null)
  } catch (_) {}
}

const getAll = (req, res) => {
  try {
    const { categoria, mes } = req.query
    let sql = 'SELECT * FROM gastos WHERE 1=1'
    const params = []
    if (categoria) { sql += ' AND categoria = ?'; params.push(categoria) }
    if (mes)       { sql += ' AND fecha LIKE ?';  params.push(`${mes}%`) }
    sql += ' ORDER BY fecha DESC, created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const { fecha, categoria, descripcion, monto, comprobante, fecha_pago, cuenta_bancaria } = req.body
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
    insertCaja('egreso', categoria, descripcion, Number(monto), fechaPago, 'gastos', id, estadoCaja, cuenta_bancaria)

    res.status(201).json(db.prepare('SELECT * FROM gastos WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const g = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id)
    if (!g) return res.status(404).json({ error: 'Gasto no encontrado' })
    const allowed = ['fecha', 'categoria', 'descripcion', 'monto', 'comprobante', 'fecha_pago', 'estado', 'subcategoria', 'forma_pago', 'proveedor', 'notas', 'categoria_erp']
    const toUpdate = allowed.filter(f => req.body[f] !== undefined)
    if (!toUpdate.length) return res.json(g)
    const set = toUpdate.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE gastos SET ${set} WHERE id = ?`).run(...toUpdate.map(f => req.body[f]), req.params.id)
    res.json(db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const remove = (req, res) => {
  try {
    const g = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id)
    if (!g) return res.status(404).json({ error: 'Gasto no encontrado' })
    db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, create, update, remove }
