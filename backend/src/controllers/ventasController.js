'use strict'
const { db } = require('../../config/database')

const getAll = (req, res) => {
  try {
    const { mes } = req.query
    let sql = `
      SELECT v.*,
        (SELECT json_group_array(json_object(
          'id', i.id, 'sku', i.sku, 'descripcion', i.descripcion,
          'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario,
          'costo_unitario', i.costo_unitario, 'subtotal', i.subtotal
        )) FROM venta_items i WHERE i.venta_id = v.id) as items
      FROM ventas v`
    const params = []
    if (mes) { sql += ' WHERE v.fecha LIKE ?'; params.push(`${mes}%`) }
    sql += ' ORDER BY v.fecha DESC, v.created_at DESC'
    const rows = db.prepare(sql).all(...params)
    res.json(rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    const items = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(req.params.id)
    res.json({ ...venta, items })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const { fecha, cliente_nombre, numero_documento, tipo_documento, estado, forma_pago, notas, items = [] } = req.body
    if (!fecha) return res.status(400).json({ error: 'fecha es requerida' })

    const total = items.reduce((s, i) => s + (Number(i.precio_unitario || 0) * Number(i.cantidad || 0)), 0)
    const costo_total = items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)

    const doCreate = db.transaction(() => {
      db.prepare(`
        INSERT INTO ventas (fecha, cliente_nombre, numero_documento, tipo_documento, total, costo_total, estado, forma_pago, notas)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(fecha, cliente_nombre || '', numero_documento || '', tipo_documento || 'Nota de Venta',
             total, costo_total, estado || 'Pendiente', forma_pago || 'Contado', notas || '')
      const newId = db.prepare('SELECT last_insert_rowid() as id').get().id
      for (const item of items) {
        const sub = Number(item.precio_unitario || 0) * Number(item.cantidad || 0)
        db.prepare(`INSERT INTO venta_items (venta_id, sku, descripcion, cantidad, precio_unitario, costo_unitario, subtotal) VALUES (?,?,?,?,?,?,?)`)
          .run(newId, item.sku || '', item.descripcion || '', Number(item.cantidad || 0),
               Number(item.precio_unitario || 0), Number(item.costo_unitario || 0), sub)
      }
      return newId
    })

    const newId = doCreate()
    const nueva = db.prepare('SELECT * FROM ventas WHERE id = ?').get(newId)
    const itemsResult = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(newId)
    res.status(201).json({ ...nueva, items: itemsResult })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })

    const { fecha, cliente_nombre, numero_documento, tipo_documento, estado, forma_pago, notas, items } = req.body

    const doUpdate = db.transaction(() => {
      let total = venta.total
      let costo_total = venta.costo_total
      if (items && items.length > 0) {
        total = items.reduce((s, i) => s + (Number(i.precio_unitario || 0) * Number(i.cantidad || 0)), 0)
        costo_total = items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)
        db.prepare('DELETE FROM venta_items WHERE venta_id = ?').run(req.params.id)
        for (const item of items) {
          const sub = Number(item.precio_unitario || 0) * Number(item.cantidad || 0)
          db.prepare(`INSERT INTO venta_items (venta_id, sku, descripcion, cantidad, precio_unitario, costo_unitario, subtotal) VALUES (?,?,?,?,?,?,?)`)
            .run(req.params.id, item.sku || '', item.descripcion || '', Number(item.cantidad || 0),
                 Number(item.precio_unitario || 0), Number(item.costo_unitario || 0), sub)
        }
      }
      db.prepare(`UPDATE ventas SET fecha=?, cliente_nombre=?, numero_documento=?, tipo_documento=?, total=?, costo_total=?, estado=?, forma_pago=?, notas=? WHERE id=?`)
        .run(fecha ?? venta.fecha, cliente_nombre ?? venta.cliente_nombre, numero_documento ?? venta.numero_documento,
             tipo_documento ?? venta.tipo_documento, total, costo_total,
             estado ?? venta.estado, forma_pago ?? venta.forma_pago, notas ?? venta.notas, req.params.id)
    })
    doUpdate()

    const updated = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    const itemsResult = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?').all(req.params.id)
    res.json({ ...updated, items: itemsResult })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const remove = (req, res) => {
  try {
    const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' })
    db.prepare('DELETE FROM ventas WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove }
