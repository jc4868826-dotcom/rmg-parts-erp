const { db, uuidv4 } = require('../../config/database')

const withItems = (p) => {
  if (!p) return null
  const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(p.id)
  return { ...p, items }
}

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
    res.json(withItems(p))
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
            direccion_entrega, fecha_entrega_programada, notas, items } = req.body
    db.prepare(`INSERT INTO pedidos
      (id,numero,cotizacion_id,cliente_id,cliente,estado,neto,iva,total,
       condicion_pago,direccion_entrega,fecha_entrega_programada,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, numero, cotizacion_id || null, cliente_id || null, cliente || null,
      'pendiente', neto || 0, iva || 0, total || 0,
      condicion_pago || null, direccion_entrega || null,
      fecha_entrega_programada || null, notas || null)

    if (Array.isArray(items) && items.length) {
      const ins = db.prepare(`
        INSERT INTO pedido_items
          (pedido_id, codigo_sku, descripcion, cantidad, precio_unitario, descuento_pct, subtotal)
        VALUES (?,?,?,?,?,?,?)
      `)
      for (const item of items) {
        const sub = item.subtotal || Math.round(item.cantidad * item.precio_unitario * (1 - (item.descuento_pct || 0) / 100))
        ins.run(id, item.codigo_sku || item.codigo || null, item.descripcion || null,
          item.cantidad, item.precio_unitario, item.descuento_pct || 0, sub)
      }
    }

    res.status(201).json(withItems(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createFromCotizacion = (req, res) => {
  try {
    const cotId = req.params.cotizacionId
    const cot = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(cotId)
    if (!cot) return res.status(404).json({ error: 'Cotización no encontrada' })

    const existing = db.prepare('SELECT id FROM pedidos WHERE cotizacion_id = ?').get(cotId)
    if (existing) return res.status(400).json({ error: 'La cotización ya tiene pedido asociado' })

    const items = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?').all(cotId)
    const count = db.prepare('SELECT COUNT(*) as n FROM pedidos').get().n
    const numero = `PED-2026-${String(count + 1).padStart(3, '0')}`
    const id = uuidv4()

    db.prepare(`INSERT INTO pedidos
      (id,numero,cotizacion_id,cliente_id,cliente,estado,neto,iva,total,condicion_pago,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, numero, cotId,
      cot.cliente_id || null,
      cot.cliente || null,
      'pendiente',
      cot.neto, cot.iva, cot.total,
      cot.condicion_pago || 'Contado',
      req.body.notas || null)

    if (items.length) {
      const ins = db.prepare(`
        INSERT INTO pedido_items
          (pedido_id, codigo_sku, descripcion, cantidad, precio_unitario, descuento_pct, subtotal)
        VALUES (?,?,?,?,?,?,?)
      `)
      for (const item of items) {
        ins.run(id, item.codigo || null, item.descripcion,
          item.cantidad, item.precio_unitario, item.descuento_pct || 0, item.subtotal)
      }
    }

    db.prepare("UPDATE cotizaciones SET estado = 'aprobada', updated_at = datetime('now') WHERE id = ?").run(cotId)

    res.status(201).json(withItems(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' })
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'numero' && k !== 'items')
    if (!fields.length) return res.json(withItems(p))
    const set = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE pedidos SET ${set}, updated_at = datetime('now') WHERE id = ?`)
      .run(...fields.map(f => req.body[f]), req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)))
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
    res.json(withItems(db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createDesdeLanding = (req, res) => {
  try {
    const { cliente: clienteData, lineas } = req.body
    if (!clienteData || !clienteData.nombre) {
      return res.status(400).json({ error: 'Se requiere cliente.nombre' })
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una línea de producto' })
    }

    let clienteId = null
    let existente = null
    if (clienteData.rut) {
      existente = db.prepare('SELECT id FROM clientes WHERE rut = ?').get(clienteData.rut)
    }
    if (!existente && clienteData.email) {
      existente = db.prepare('SELECT id FROM clientes WHERE email = ? AND activo = 1').get(clienteData.email)
    }
    if (existente) {
      clienteId = existente.id
    } else {
      clienteId = uuidv4()
      db.prepare(`INSERT INTO clientes
        (id, razon_social, rut, segmento, etapa_pipeline, contacto_nombre, telefono, email)
        VALUES (?, ?, ?, 'taller', 'prospecto', ?, ?, ?)`)
        .run(clienteId, clienteData.nombre, clienteData.rut || null,
             clienteData.nombre, clienteData.telefono || null, clienteData.email || null)
    }

    const items = lineas.map(l => ({
      codigo_sku:      l.codigo_sku,
      descripcion:     l.descripcion || l.codigo_sku,
      cantidad:        Number(l.cantidad) || 1,
      precio_unitario: Number(l.precio_venta_neto) || 0,
      descuento_pct:   0,
      subtotal:        Math.round((Number(l.cantidad) || 1) * (Number(l.precio_venta_neto) || 0))
    }))
    const neto  = items.reduce((a, b) => a + b.subtotal, 0)
    const iva   = Math.round(neto * 0.19)
    const total = neto + iva

    const count = db.prepare('SELECT COUNT(*) as n FROM pedidos').get().n
    const numero = `PED-2026-L${String(count + 1).padStart(3, '0')}`
    const id = uuidv4()

    db.prepare(`INSERT INTO pedidos
      (id,numero,cliente_id,cliente,estado,neto,iva,total,condicion_pago,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, numero, clienteId, clienteData.nombre, 'pendiente',
           neto, iva, total, 'Contado',
           `Pedido landing — ${clienteData.telefono || clienteData.email || ''}`)

    const ins = db.prepare(`
      INSERT INTO pedido_items
        (pedido_id, codigo_sku, descripcion, cantidad, precio_unitario, descuento_pct, subtotal)
      VALUES (?,?,?,?,?,?,?)
    `)
    for (const item of items) {
      ins.run(id, item.codigo_sku || null, item.descripcion || null,
        item.cantidad, item.precio_unitario, item.descuento_pct, item.subtotal)
    }

    res.status(201).json({ pedido_id: id, numero, total })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const remove = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' })
    db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?').run(req.params.id)
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getOne, create, createFromCotizacion, update, cambiarEstado, createDesdeLanding, remove }
