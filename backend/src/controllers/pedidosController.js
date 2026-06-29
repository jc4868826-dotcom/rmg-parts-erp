const { db, uuidv4 } = require('../../config/database')

const getAll = (req, res) => {
  try {
    const { estado } = req.query
    let sql = 'SELECT * FROM pedidos'
    const params = []
    if (estado) { sql += ' WHERE estado = ?'; params.push(estado) }
    sql += ' ORDER BY created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ? OR numero = ?').get(req.params.id, req.params.id)
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' })
    res.json(p)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM pedidos').get().n
    const numero = req.body.numero || `PED-2026-${String(count + 1).padStart(3, '0')}`
    const id = uuidv4()
    const { cotizacion_id, cliente_id, cliente, neto, iva, total, condicion_pago,
            direccion_entrega, fecha_entrega_programada, notas } = req.body
    db.prepare(`INSERT INTO pedidos
      (id,numero,cotizacion_id,cliente_id,cliente,estado,neto,iva,total,
       condicion_pago,direccion_entrega,fecha_entrega_programada,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, numero, cotizacion_id || null, cliente_id || null, cliente || null,
      'pendiente', neto || 0, iva || 0, total || 0,
      condicion_pago || null, direccion_entrega || null,
      fecha_entrega_programada || null, notas || null)
    res.status(201).json(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' })
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'numero')
    if (!fields.length) return res.json(p)
    const set = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE pedidos SET ${set}, updated_at = datetime('now') WHERE id = ?`)
      .run(...fields.map(f => req.body[f]), req.params.id)
    res.json(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const cambiarEstado = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' })
    db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.body.estado, req.params.id)
    res.json(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, cambiarEstado }
