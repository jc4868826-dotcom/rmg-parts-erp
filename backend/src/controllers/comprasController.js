const { db, uuidv4 } = require('../../config/database')

function insertCaja(tipo, categoria, descripcion, monto, fecha_pago, estado, origen_tabla, origen_id) {
  try {
    const hoy = new Date().toISOString().split('T')[0]
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(tipo, categoria, descripcion, monto, hoy, fecha_pago || hoy, estado, origen_tabla, origen_id)
  } catch (_) {}
}

const withItems = (oc) => {
  if (!oc) return null
  const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(oc.id)
  return { ...oc, items, pagada: oc.pagada === 1 }
}

// ── Proveedores ────────────────────────────────────────────────
const getProveedores = (req, res) => {
  try {
    const { activo } = req.query
    let sql = 'SELECT * FROM proveedores'
    const params = []
    if (activo !== undefined) { sql += ' WHERE activo = ?'; params.push(activo === 'true' ? 1 : 0) }
    sql += ' ORDER BY razon_social'
    const rows = db.prepare(sql).all(...params)
    res.json(rows.map(p => ({ ...p, categorias: JSON.parse(p.categorias || '[]') })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getProveedor = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' })
    const ocs = db.prepare('SELECT * FROM ordenes_compra WHERE proveedor_id = ? ORDER BY created_at DESC').all(p.id)
    res.json({ ...p, categorias: JSON.parse(p.categorias || '[]'), ordenes_compra: ocs.map(withItems) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createProveedor = (req, res) => {
  try {
    const id = uuidv4()
    const { razon_social, rut, contacto, cargo, telefono, email, categorias,
            plazo_pago, condicion, banco, cuenta } = req.body
    db.prepare(`INSERT INTO proveedores
      (id,razon_social,rut,contacto,cargo,telefono,email,categorias,plazo_pago,condicion,banco,cuenta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, razon_social, rut || null, contacto || null, cargo || null,
      telefono || null, email || null,
      JSON.stringify(categorias || []),
      plazo_pago || 30, condicion || null, banco || null, cuenta || null)
    const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(id)
    res.status(201).json({ ...p, categorias: JSON.parse(p.categorias || '[]') })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const updateProveedor = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' })
    const body = { ...req.body }
    if (body.categorias) body.categorias = JSON.stringify(body.categorias)
    const fields = Object.keys(body).filter(k => k !== 'id')
    if (!fields.length) return res.json(p)
    const set = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE proveedores SET ${set}, updated_at = datetime('now') WHERE id = ?`)
      .run(...fields.map(f => body[f]), req.params.id)
    const updated = db.prepare('SELECT * FROM proveedores WHERE id = ?').get(req.params.id)
    res.json({ ...updated, categorias: JSON.parse(updated.categorias || '[]') })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Órdenes de compra ──────────────────────────────────────────
const getOrdenes = (req, res) => {
  try {
    const { estado, proveedor_id } = req.query
    let sql = 'SELECT * FROM ordenes_compra'
    const params = []
    const where = []
    if (estado) { where.push('estado = ?'); params.push(estado) }
    if (proveedor_id) { where.push('proveedor_id = ?'); params.push(proveedor_id) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY created_at DESC'
    res.json(db.prepare(sql).all(...params).map(withItems))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOrden = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ? OR numero = ?').get(req.params.id, req.params.id)
    if (!o) return res.status(404).json({ error: 'Orden de compra no encontrada' })
    res.json(withItems(o))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createOrden = (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM ordenes_compra').get().n
    const numero = `OC-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`
    const id = uuidv4()
    const { proveedor_id, proveedor, items } = req.body
    const itemsArr = items || []
    const neto = itemsArr.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    const iva = Math.round(neto * 0.19)

    db.prepare(`INSERT INTO ordenes_compra
      (id,numero,proveedor_id,proveedor,estado,fecha_emision,neto,iva,total,pagada)
      VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(id, numero, proveedor_id || null, proveedor || null, 'borrador',
      new Date().toISOString().split('T')[0], neto, iva, neto + iva, 0)

    const ins = db.prepare('INSERT INTO oc_items (id,oc_id,codigo,descripcion,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)')
    for (const item of itemsArr) {
      ins.run(uuidv4(), id, item.codigo, item.descripcion || null, item.cantidad, item.precio_unitario, item.cantidad * item.precio_unitario)
    }
    res.status(201).json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const updateOrden = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'Orden no encontrada' })
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'numero' && k !== 'items')
    if (fields.length) {
      const set = fields.map(f => `${f} = ?`).join(', ')
      db.prepare(`UPDATE ordenes_compra SET ${set}, updated_at = datetime('now') WHERE id = ?`)
        .run(...fields.map(f => req.body[f]), req.params.id)
    }
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const recibirOrden = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'Orden no encontrada' })
    db.prepare("UPDATE ordenes_compra SET estado = 'recibida', fecha_entrega = ?, updated_at = datetime('now') WHERE id = ?")
      .run(new Date().toISOString().split('T')[0], req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const enviarOrden = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'Orden no encontrada' })
    db.prepare("UPDATE ordenes_compra SET estado = 'enviada', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── CxP ────────────────────────────────────────────────────────
const getCxP = (req, res) => {
  try {
    const { estado } = req.query
    let sql = 'SELECT * FROM facturas_cxp'
    const params = []
    if (estado) { sql += ' WHERE estado = ?'; params.push(estado) }
    sql += ' ORDER BY fecha_vencimiento ASC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const pagarFactura = (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM facturas_cxp WHERE id = ?').get(req.params.id)
    if (!f) return res.status(404).json({ error: 'Factura no encontrada' })
    const fecha_pago = new Date().toISOString().split('T')[0]
    db.prepare("UPDATE facturas_cxp SET estado = 'pagada', fecha_pago = ? WHERE id = ?")
      .run(fecha_pago, req.params.id)
    db.prepare(`
      UPDATE caja_movimientos SET estado = 'confirmado', fecha_pago = ?
      WHERE origen_tabla = 'facturas_cxp' AND origen_id = ?
    `).run(fecha_pago, req.params.id)
    res.json(db.prepare('SELECT * FROM facturas_cxp WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Compras ERP (tabla simple, distinta de ordenes_compra) ─────────────────
const getComprasList = (req, res) => {
  try {
    const { mes } = req.query
    let sql = `
      SELECT c.*,
        (SELECT json_group_array(json_object(
          'id', i.id, 'sku', i.sku, 'descripcion', i.descripcion,
          'cantidad', i.cantidad, 'costo_unitario', i.costo_unitario, 'subtotal', i.subtotal
        )) FROM compra_items i WHERE i.compra_id = c.id) as items
      FROM compras c`
    const params = []
    if (mes) { sql += ' WHERE c.fecha LIKE ?'; params.push(`${mes}%`) }
    sql += ' ORDER BY c.fecha DESC, c.created_at DESC'
    const rows = db.prepare(sql).all(...params)
    res.json(rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createCompra = (req, res) => {
  try {
    const { fecha, proveedor, numero_oc, numero_factura, estado, fecha_vencimiento, notas, items = [] } = req.body
    if (!fecha || !proveedor) return res.status(400).json({ error: 'fecha y proveedor son requeridos' })
    const total = items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)
    const doCreate = db.transaction(() => {
      db.prepare('INSERT INTO compras (fecha, proveedor, numero_oc, numero_factura, total, estado, fecha_vencimiento, notas) VALUES (?,?,?,?,?,?,?,?)')
        .run(fecha, proveedor, numero_oc || null, numero_factura || null, total, estado || 'Pendiente', fecha_vencimiento || null, notas || null)
      const newId = db.prepare('SELECT last_insert_rowid() as id').get().id
      for (const item of items) {
        const sub = Number(item.costo_unitario || 0) * Number(item.cantidad || 0)
        db.prepare('INSERT INTO compra_items (compra_id, sku, descripcion, cantidad, costo_unitario, subtotal) VALUES (?,?,?,?,?,?)')
          .run(newId, item.sku || '', item.descripcion || '', Number(item.cantidad || 0), Number(item.costo_unitario || 0), sub)
      }
      return newId
    })
    const newId = doCreate()
    const nueva = db.prepare('SELECT * FROM compras WHERE id = ?').get(newId)
    const itemsResult = db.prepare('SELECT * FROM compra_items WHERE compra_id = ?').all(newId)
    res.status(201).json({ ...nueva, items: itemsResult })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const updateCompra = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Compra no encontrada' })
    const { fecha, proveedor, numero_oc, numero_factura, estado, fecha_vencimiento, notas } = req.body
    db.prepare('UPDATE compras SET fecha=?, proveedor=?, numero_oc=?, numero_factura=?, estado=?, fecha_vencimiento=?, notas=? WHERE id=?')
      .run(fecha ?? c.fecha, proveedor ?? c.proveedor, numero_oc ?? c.numero_oc, numero_factura ?? c.numero_factura,
           estado ?? c.estado, fecha_vencimiento ?? c.fecha_vencimiento, notas ?? c.notas, req.params.id)
    res.json(db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const deleteCompra = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Compra no encontrada' })
    db.prepare('DELETE FROM compras WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const { uuidv4: _uuidv4 } = require('../../config/database')

const ESTADOS_OC = ['Borrador', 'Enviada', 'Recibida', 'Pagada', 'Anulada']

const cambiarEstadoCompra = (req, res) => {
  try {
    const { estado } = req.body
    if (!ESTADOS_OC.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Valores: ${ESTADOS_OC.join(', ')}` })
    }

    const compra = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id)
    if (!compra) return res.status(404).json({ error: 'Compra no encontrada' })
    if (compra.estado === 'Pagada') {
      return res.status(400).json({ error: 'La compra ya está Pagada y no puede cambiarse de estado' })
    }
    if (estado === 'Recibida' && compra.estado === 'Pagada') {
      return res.status(400).json({ error: 'No se puede retroceder a Recibida una compra Pagada' })
    }

    const hoy = new Date().toISOString().split('T')[0]
    const advertencias = []

    const ejecutar = db.transaction(() => {
      db.prepare('UPDATE compras SET estado = ? WHERE id = ?').run(estado, req.params.id)

      if (estado === 'Recibida') {
        const items = db.prepare('SELECT * FROM compra_items WHERE compra_id = ?').all(req.params.id)
        for (const item of items) {
          if (!item.sku) continue
          const prod = db.prepare('SELECT * FROM productos WHERE codigo = ? AND activo = 1').get(item.sku)
          if (!prod) {
            advertencias.push(`SKU ${item.sku} no encontrado en catálogo — stock no actualizado`)
            continue
          }
          const stockAnterior = prod.stock_actual
          const stockNuevo = stockAnterior + Math.round(Number(item.cantidad))
          db.prepare('UPDATE productos SET stock_actual = ? WHERE codigo = ?').run(stockNuevo, item.sku)
          try {
            db.prepare(
              'INSERT INTO movimientos_stock (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo) VALUES (?,?,?,?,?,?,?,?)'
            ).run(uuidv4(), prod.id, prod.codigo, prod.descripcion, 'entrada', Math.round(Number(item.cantidad)), stockAnterior, stockNuevo)
          } catch (_) {}
        }
      }

      if (estado === 'Pagada') {
        const desc = `OC ${compra.numero_oc || `#${compra.id}`} · ${compra.proveedor}`
        try {
          db.prepare(
            'INSERT INTO caja_movimientos (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id) VALUES (?,?,?,?,?,?,?,?,?)'
          ).run('egreso', 'Compra', desc, compra.total, hoy, hoy, 'confirmado', 'compras', String(compra.id))
        } catch (_) {}
      }
    })

    ejecutar()

    const updated = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id)
    const items = db.prepare('SELECT * FROM compra_items WHERE compra_id = ?').all(req.params.id)
    res.json({ ...updated, items, advertencias })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getProveedores, getProveedor, createProveedor, updateProveedor, getOrdenes, getOrden, createOrden, updateOrden, recibirOrden, enviarOrden, getCxP, pagarFactura, getComprasList, createCompra, updateCompra, deleteCompra, cambiarEstadoCompra }
