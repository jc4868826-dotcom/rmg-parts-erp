const { db, uuidv4 } = require('../../config/database')

const hoy = () => new Date().toISOString().split('T')[0]

const withItems = (nv) => {
  if (!nv) return null
  const items = db.prepare('SELECT * FROM nota_venta_items WHERE nota_venta_id = ?').all(nv.id)
  return { ...nv, items }
}

const getAll = (req, res) => {
  try {
    const { estado } = req.query
    let sql = 'SELECT * FROM notas_venta'
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
    const nv = db.prepare('SELECT * FROM notas_venta WHERE id = ? OR numero = ?').get(req.params.id, req.params.id)
    if (!nv) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    res.json(withItems(nv))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createFromPedido = (req, res) => {
  try {
    const pedidoId = req.params.pedidoId
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId)
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })

    const existing = db.prepare('SELECT id FROM notas_venta WHERE pedido_id = ?').get(pedidoId)
    if (existing) return res.status(400).json({ error: 'El pedido ya tiene nota de venta' })

    const count = db.prepare('SELECT COUNT(*) as n FROM notas_venta').get().n
    const numero = `NV-2026-${String(count + 1).padStart(3, '0')}`
    const id = uuidv4()

    const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedidoId)

    db.prepare(`
      INSERT INTO notas_venta
        (id, numero, pedido_id, cotizacion_id, cliente_id, cliente, estado,
         neto, iva, total, condicion_pago, notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, numero, pedidoId,
      pedido.cotizacion_id || null,
      pedido.cliente_id || null,
      pedido.cliente || null,
      'pendiente',
      pedido.neto, pedido.iva, pedido.total,
      pedido.condicion_pago || 'Contado',
      req.body.notas || null)

    if (items.length) {
      const ins = db.prepare(`
        INSERT INTO nota_venta_items
          (id, nota_venta_id, codigo, descripcion, cantidad, precio_unitario, descuento_pct, subtotal)
        VALUES (?,?,?,?,?,?,?,?)
      `)
      for (const item of items) {
        ins.run(uuidv4(), id, item.codigo, item.descripcion,
          item.cantidad, item.precio_unitario, item.descuento_pct || 0, item.subtotal)
      }
    }

    res.status(201).json(withItems(db.prepare('SELECT * FROM notas_venta WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const registrarPago = (req, res) => {
  try {
    const nv = db.prepare('SELECT * FROM notas_venta WHERE id = ?').get(req.params.id)
    if (!nv) return res.status(404).json({ error: 'Nota de venta no encontrada' })
    if (nv.estado === 'pagada') return res.status(400).json({ error: 'La nota de venta ya está pagada' })

    const { metodo_pago, cuenta_bancaria, fecha_pago, notas_pago } = req.body

    db.prepare(`
      UPDATE notas_venta
        SET estado = 'pagada', metodo_pago = ?, cuenta_bancaria = ?,
            fecha_pago = ?, notas_pago = ?, updated_at = datetime('now')
        WHERE id = ?
    `).run(metodo_pago || 'Transferencia', cuenta_bancaria || null,
           fecha_pago || hoy(), notas_pago || null, nv.id)

    // Registrar ingreso CONFIRMADO en caja
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id, cuenta_bancaria)
      VALUES ('ingreso','venta',?,?,?,?,'confirmado','notas_venta',?,?)
    `).run(
      `Pago NV ${nv.numero} — ${nv.cliente || ''}`,
      nv.total,
      hoy(),
      fecha_pago || hoy(),
      nv.id,
      cuenta_bancaria || null
    )

    res.json(withItems(db.prepare('SELECT * FROM notas_venta WHERE id = ?').get(nv.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getOne, createFromPedido, registrarPago }
