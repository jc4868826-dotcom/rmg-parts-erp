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
    const { estado, proveedor_id, proveedor } = req.query
    let sql = 'SELECT * FROM ordenes_compra'
    const params = []
    const where = []
    if (estado) { where.push('estado = ?'); params.push(estado) }
    if (proveedor_id) { where.push('proveedor_id = ?'); params.push(proveedor_id) }
    if (proveedor) { where.push('proveedor = ?'); params.push(proveedor) }
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
    const year = new Date().getFullYear()
    const prefix = `OC-${year}-`
    const row = db.prepare(
      `SELECT MAX(CAST(SUBSTR(numero, ?) AS INTEGER)) as maxn FROM ordenes_compra WHERE numero LIKE ?`
    ).get(prefix.length + 1, `${prefix}%`)
    const seq = (row?.maxn || 0) + 1
    const numero = `${prefix}${String(seq).padStart(3, '0')}`
    const id = uuidv4()
    const { proveedor_id, proveedor, items, fecha, medio_pago, numero_factura, fecha_vencimiento, notas } = req.body
    const itemsArr = items || []
    const neto = itemsArr.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0)
    const iva = Math.round(neto * 0.19)

    db.prepare(`INSERT INTO ordenes_compra
      (id,numero,proveedor_id,proveedor,estado,fecha_emision,neto,iva,total,pagada,medio_pago,numero_factura,fecha_vencimiento,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, numero, proveedor_id || null, proveedor || null, 'borrador',
      fecha || new Date().toISOString().split('T')[0], neto, iva, neto + iva, 0,
      medio_pago || 'Contado', numero_factura || null, fecha_vencimiento || null, notas || null)

    const ins = db.prepare('INSERT INTO oc_items (id,oc_id,codigo,descripcion,cantidad,precio_unitario,subtotal) VALUES (?,?,?,?,?,?,?)')
    for (const item of itemsArr) {
      ins.run(uuidv4(), id, item.codigo, item.descripcion || null, Number(item.cantidad) || 0, Number(item.precio_unitario) || 0, (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))
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
    if (['recibida', 'anulada', 'Recibida_Bodega', 'Pagada'].includes(o.estado) || o.pagada) {
      return res.status(400).json({ error: `La OC ya está en estado ${o.estado}` })
    }
    const advertencias = []
    const ejecutar = db.transaction(() => {
      db.prepare("UPDATE ordenes_compra SET estado = 'recibida', fecha_entrega = ?, updated_at = datetime('now') WHERE id = ?")
        .run(new Date().toISOString().split('T')[0], req.params.id)
      const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(req.params.id)
      for (const item of items) {
        if (!item.codigo) continue
        const prod = db.prepare('SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku').get(item.codigo)
        if (!prod) { advertencias.push(`SKU ${item.codigo} no encontrado en maestro de precios — stock no actualizado`); continue }
        const stockAnterior = prod.stock_actual ?? 0
        const stockNuevo = stockAnterior + Math.round(Number(item.cantidad))
        db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stockNuevo, item.codigo)
        try {
          db.prepare('INSERT INTO movimientos_stock (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(uuidv4(), item.codigo, item.codigo, item.descripcion || prod.descripcion, 'entrada', Math.round(Number(item.cantidad)), stockAnterior, stockNuevo, 'ingreso_oc', o.numero)
        } catch (_) {}
      }
    })
    ejecutar()
    res.json({ ...withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)), advertencias })
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

const deleteCxP = (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM facturas_cxp WHERE id = ?').get(req.params.id)
    if (!f) return res.status(404).json({ error: 'Factura CxP no encontrada' })
    if (f.estado === 'pagada') {
      return res.status(400).json({ error: 'No se puede eliminar una factura ya pagada' })
    }
    db.prepare('DELETE FROM caja_movimientos WHERE origen_tabla = ? AND origen_id = ?')
      .run('facturas_cxp', req.params.id)
    db.prepare('DELETE FROM facturas_cxp WHERE id = ?').run(req.params.id)
    res.json({ ok: true, eliminada: f })
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
    const { fecha, proveedor, proveedor_id, numero_oc, numero_factura, estado, fecha_vencimiento, notas, items = [],
            oc_id, forma_pago, cuenta_bancaria, fecha_pago, origen } = req.body
    if (!fecha || !proveedor) return res.status(400).json({ error: 'fecha y proveedor son requeridos' })

    let oc = null
    if (oc_id) {
      oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(oc_id)
      if (!oc) return res.status(400).json({ error: 'OC no encontrada' })
    }

    const total    = items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)
    const hoy      = new Date().toISOString().split('T')[0]
    const origenFinal = origen || (oc_id ? 'oc' : 'directa')

    const doCreate = db.transaction(() => {
      db.prepare(`INSERT INTO compras
        (fecha, proveedor, proveedor_id, numero_oc, numero_factura, total, estado,
         fecha_vencimiento, notas, oc_id, forma_pago, cuenta_bancaria, fecha_pago, origen)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(fecha, proveedor, proveedor_id || null, numero_oc || null, numero_factura || null,
          total, estado || 'Borrador', fecha_vencimiento || null, notas || null, oc_id || null,
          forma_pago || 'Transferencia', cuenta_bancaria || null, fecha_pago || null, origenFinal)
      const newId = db.prepare('SELECT last_insert_rowid() as id').get().id
      for (const item of items) {
        const sub = Number(item.costo_unitario || 0) * Number(item.cantidad || 0)
        db.prepare('INSERT INTO compra_items (compra_id, sku, descripcion, cantidad, costo_unitario, subtotal) VALUES (?,?,?,?,?,?)')
          .run(newId, item.sku || '', item.descripcion || '', Number(item.cantidad || 0), Number(item.costo_unitario || 0), sub)
      }
      if (oc) {
        // Link OC back to this compra (financial cycle begins)
        try { db.prepare("UPDATE ordenes_compra SET compra_id = ?, updated_at = datetime('now') WHERE id = ?").run(newId, oc_id) } catch (_) {}
      }
      // If compra is created directly in Pagada, register flujo_caja immediately
      const estadoFinal = estado || 'Borrador'
      if (estadoFinal === 'Pagada') {
        try {
          db.prepare('INSERT INTO caja_movimientos (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id, cuenta_bancaria) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run('egreso', 'Compra', oc ? `OC ${oc.numero} · ${oc.proveedor}` : `Compra · ${proveedor}`, total,
              hoy, fecha_pago || hoy, 'confirmado', 'compras', String(newId), cuenta_bancaria || null)
        } catch (_) {}
      }
      return newId
    })

    const newId = doCreate()
    const nueva = db.prepare('SELECT * FROM compras WHERE id = ?').get(newId)
    const itemsResult = db.prepare('SELECT * FROM compra_items WHERE compra_id = ?').all(newId)
    res.status(201).json({ ...nueva, items: itemsResult, oc_numero: oc ? oc.numero : null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const updateCompra = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Compra no encontrada' })
    const { fecha, proveedor, numero_oc, numero_factura, estado, fecha_vencimiento, notas,
            forma_pago, cuenta_bancaria, fecha_pago } = req.body
    db.prepare('UPDATE compras SET fecha=?, proveedor=?, numero_oc=?, numero_factura=?, estado=?, fecha_vencimiento=?, notas=?, forma_pago=?, cuenta_bancaria=?, fecha_pago=? WHERE id=?')
      .run(fecha ?? c.fecha, proveedor ?? c.proveedor, numero_oc ?? c.numero_oc, numero_factura ?? c.numero_factura,
           estado ?? c.estado, fecha_vencimiento ?? c.fecha_vencimiento, notas ?? c.notas,
           forma_pago ?? c.forma_pago, cuenta_bancaria ?? c.cuenta_bancaria, fecha_pago ?? c.fecha_pago, req.params.id)
    res.json(db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const deleteCompra = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM compras WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Compra no encontrada' })
    db.prepare("DELETE FROM caja_movimientos WHERE origen_tabla = 'compras' AND CAST(origen_id AS TEXT) = CAST(? AS TEXT)").run(req.params.id)
    db.prepare('DELETE FROM compras WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Flujo de autorización OC ──────────────────────────────────
const enviarAutorizacion = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    if (!['borrador', 'Rechazada'].includes(o.estado)) return res.status(400).json({ error: `Solo se puede enviar a autorización desde Borrador o Rechazada (estado actual: ${o.estado})` })
    db.prepare("UPDATE ordenes_compra SET estado = 'Pendiente_Autorizacion', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) { res.status(500).json({ error: err.message }) }
}

const autorizarOC = (req, res) => {
  try {
    const rolUser = req.user?.rol
    if (!['gerente', 'admin'].includes(rolUser)) return res.status(403).json({ error: 'Se requiere rol gerente o admin para autorizar OC' })
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    if (o.estado !== 'Pendiente_Autorizacion') return res.status(400).json({ error: `Solo se puede autorizar desde Pendiente_Autorizacion (estado actual: ${o.estado})` })
    const hoy = new Date().toISOString().split('T')[0]
    const autorizado_por = req.user?.nombre || req.user?.email || 'admin'
    db.prepare("UPDATE ordenes_compra SET estado = 'Autorizada', fecha_autorizacion = ?, autorizado_por = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hoy, autorizado_por, req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) { res.status(500).json({ error: err.message }) }
}

const rechazarOC = (req, res) => {
  try {
    const rolUser = req.user?.rol
    if (!['gerente', 'admin'].includes(rolUser)) return res.status(403).json({ error: 'Se requiere rol gerente o admin para rechazar OC' })
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    if (o.estado !== 'Pendiente_Autorizacion') return res.status(400).json({ error: `Solo se puede rechazar desde Pendiente_Autorizacion (estado actual: ${o.estado})` })
    const { motivo_rechazo } = req.body
    if (!motivo_rechazo) return res.status(400).json({ error: 'motivo_rechazo es requerido' })
    const hoy = new Date().toISOString().split('T')[0]
    db.prepare("UPDATE ordenes_compra SET estado = 'Rechazada', fecha_rechazo = ?, motivo_rechazo = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hoy, motivo_rechazo, req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) { res.status(500).json({ error: err.message }) }
}

const enviarProveedor = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    if (o.estado !== 'Autorizada') return res.status(400).json({ error: `Solo se puede enviar al proveedor desde Autorizada (estado actual: ${o.estado})` })
    db.prepare("UPDATE ordenes_compra SET estado = 'Enviada_Proveedor', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) { res.status(500).json({ error: err.message }) }
}

const recibirBodega = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    if (o.estado !== 'Enviada_Proveedor') return res.status(400).json({ error: `Solo se puede recibir en bodega desde Enviada_Proveedor (estado actual: ${o.estado})` })
    const { numero_factura, fecha_factura } = req.body
    const hoy = new Date().toISOString().split('T')[0]
    const advertencias = []
    const ejecutar = db.transaction(() => {
      db.prepare("UPDATE ordenes_compra SET estado = 'Recibida_Bodega', fecha_entrega = ?, numero_factura = ?, fecha_factura = ?, updated_at = datetime('now') WHERE id = ?")
        .run(hoy, numero_factura || o.numero_factura || null, fecha_factura || hoy, req.params.id)
      const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(req.params.id)
      for (const item of items) {
        if (!item.codigo) continue
        const prod = db.prepare('SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku').get(item.codigo)
        if (!prod) { advertencias.push(`SKU ${item.codigo} no encontrado en maestro de precios — stock no actualizado`); continue }
        const stockAnterior = prod.stock_actual ?? 0
        const stockNuevo = stockAnterior + Math.round(Number(item.cantidad))
        db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stockNuevo, item.codigo)
        try {
          db.prepare('INSERT INTO movimientos_stock (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(uuidv4(), item.codigo, item.codigo, item.descripcion || prod.descripcion, 'entrada', Math.round(Number(item.cantidad)), stockAnterior, stockNuevo, 'ingreso_oc', o.numero)
        } catch (_) {}
      }
      // Crear CxP pendiente
      try {
        db.prepare(`INSERT OR IGNORE INTO facturas_cxp (id, numero, proveedor_id, proveedor, oc_id, oc_numero, monto, fecha_emision, fecha_vencimiento, estado)
          VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(uuidv4(), `CXP-${o.numero}`, o.proveedor_id || null, o.proveedor, o.id, o.numero, o.total, hoy, o.fecha_vencimiento || null, 'pendiente')
      } catch (_) {}
    })
    ejecutar()
    res.json({ ...withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)), advertencias })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

const autorizarPago = (req, res) => {
  try {
    const rolUser = req.user?.rol
    if (!['gerente', 'admin'].includes(rolUser)) return res.status(403).json({ error: 'Se requiere rol gerente o admin para autorizar pago' })
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    if (o.estado !== 'Recibida_Bodega') return res.status(400).json({ error: `Solo se puede autorizar pago desde Recibida_Bodega (estado actual: ${o.estado})` })
    const { forma_pago, fecha_pago } = req.body
    if (!forma_pago) return res.status(400).json({ error: 'forma_pago es requerido' })
    const hoy = new Date().toISOString().split('T')[0]
    const fechaPago = fecha_pago || hoy
    const ejecutar = db.transaction(() => {
      db.prepare("UPDATE ordenes_compra SET estado = 'Pagada', pagada = 1, forma_pago_oc = ?, fecha_pago = ?, updated_at = datetime('now') WHERE id = ?")
        .run(forma_pago, fechaPago, req.params.id)
      // Registrar egreso en caja_movimientos
      try {
        db.prepare('INSERT INTO caja_movimientos (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id) VALUES (?,?,?,?,?,?,?,?,?)')
          .run('egreso', 'Compra proveedor', `OC ${o.numero} · ${o.proveedor}`, o.total, hoy, fechaPago, 'confirmado', 'ordenes_compra', o.id)
      } catch (_) {}
      // Marcar CxP como pagada
      try {
        db.prepare("UPDATE facturas_cxp SET estado = 'pagada', fecha_pago = ? WHERE oc_id = ?")
          .run(fechaPago, o.id)
      } catch (_) {}
    })
    ejecutar()
    res.json(withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)))
  } catch (err) { res.status(500).json({ error: err.message }) }
}

const getPendientesWorkflow = (req, res) => {
  try {
    const pendAuth = db.prepare("SELECT COUNT(*) as n FROM ordenes_compra WHERE estado = 'Pendiente_Autorizacion'").get().n
    const recibidasBodega = db.prepare("SELECT COUNT(*) as n FROM ordenes_compra WHERE estado = 'Recibida_Bodega'").get().n
    const autorizadas = db.prepare("SELECT COUNT(*) as n FROM ordenes_compra WHERE estado = 'Autorizada'").get().n
    const enviadasProv = db.prepare("SELECT COUNT(*) as n FROM ordenes_compra WHERE estado = 'Enviada_Proveedor'").get().n
    res.json({ pendAuth, recibidasBodega, autorizadas, enviadasProv })
  } catch (err) { res.status(500).json({ error: err.message }) }
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
    if (estado === 'Recibida' && compra.estado === 'Recibida') {
      return res.status(400).json({ error: 'La compra ya está en estado Recibida — stock ya fue actualizado' })
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
          const prod = db.prepare(
            'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
          ).get(item.sku)
          if (!prod) {
            advertencias.push(`SKU ${item.sku} no encontrado en lista de precios — stock no actualizado`)
            continue
          }
          const stockAnterior = prod.stock_actual ?? 0
          const stockNuevo = stockAnterior + Math.round(Number(item.cantidad))
          db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stockNuevo, item.sku)
          try {
            db.prepare(
              'INSERT INTO movimientos_stock (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo) VALUES (?,?,?,?,?,?,?,?,?)'
            ).run(uuidv4(), prod.codigo_sku, prod.codigo_sku, prod.descripcion, 'entrada', Math.round(Number(item.cantidad)), stockAnterior, stockNuevo, 'ingreso_compra')
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

const pagarOrden = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'OC no encontrada' })
    if (oc.pagada) return res.status(400).json({ error: 'La OC ya está pagada' })
    const hoy = new Date().toISOString().split('T')[0]
    const ejecutar = db.transaction(() => {
      db.prepare("UPDATE ordenes_compra SET pagada = 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id)
      // Create compra record (feeds flujo de caja / ComprasErpPage)
      db.prepare('INSERT INTO compras (fecha, proveedor, numero_oc, numero_factura, total, estado, fecha_vencimiento, notas) VALUES (?,?,?,?,?,?,?,?)')
        .run(hoy, oc.proveedor, oc.numero, oc.numero_factura || null, oc.total, 'Pagada', oc.fecha_vencimiento || null, oc.notas || null)
      const compraId = db.prepare('SELECT last_insert_rowid() as id').get().id
      const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(req.params.id)
      for (const item of items) {
        db.prepare('INSERT INTO compra_items (compra_id, sku, descripcion, cantidad, costo_unitario, subtotal) VALUES (?,?,?,?,?,?)')
          .run(compraId, item.codigo, item.descripcion, item.cantidad, item.precio_unitario, item.subtotal)
      }
      // Register egreso in caja_movimientos
      try {
        db.prepare('INSERT INTO caja_movimientos (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id) VALUES (?,?,?,?,?,?,?,?,?)')
          .run('egreso', 'Compra', `OC ${oc.numero} · ${oc.proveedor}`, oc.total, hoy, oc.fecha_vencimiento || hoy, 'confirmado', 'ordenes_compra', oc.id)
      } catch (_) {}
      // If Crédito, also insert CxP
      if (oc.medio_pago && oc.medio_pago.includes('Crédito')) {
        try {
          db.prepare(`INSERT INTO facturas_cxp (id, numero, proveedor_id, proveedor, oc_id, oc_numero, monto, fecha_emision, fecha_vencimiento, estado)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(uuidv4(), `CXP-${oc.numero}`, oc.proveedor_id || null, oc.proveedor, oc.id, oc.numero, oc.total, hoy, oc.fecha_vencimiento || null, 'pendiente')
        } catch (_) {}
      }
    })
    ejecutar()
    res.json({ ...withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)), ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const deleteOrden = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })

    const ejecutar = db.transaction(() => {
      // Recibida (not paid) — reverse stock
      if (o.estado === 'recibida' && !o.pagada) {
        const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(o.id)
        for (const item of items) {
          if (!item.codigo) continue
          db.prepare('UPDATE lista_precios SET stock_actual = MAX(0, stock_actual - ?) WHERE codigo_sku = ?')
            .run(Math.round(Number(item.cantidad)), item.codigo)
        }
      }

      // Pagada — reverse stock + payment records
      if (o.pagada) {
        const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(o.id)
        for (const item of items) {
          if (!item.codigo) continue
          db.prepare('UPDATE lista_precios SET stock_actual = MAX(0, stock_actual - ?) WHERE codigo_sku = ?')
            .run(Math.round(Number(item.cantidad)), item.codigo)
        }
        db.prepare("DELETE FROM caja_movimientos WHERE origen_tabla='ordenes_compra' AND origen_id=?").run(o.id)
        const comprasRecs = db.prepare('SELECT id FROM compras WHERE numero_oc = ?').all(o.numero)
        for (const c of comprasRecs) {
          db.prepare("DELETE FROM caja_movimientos WHERE origen_tabla='compras' AND CAST(origen_id AS TEXT)=CAST(? AS TEXT)").run(c.id)
          db.prepare('DELETE FROM compra_items WHERE compra_id = ?').run(c.id)
        }
        db.prepare('DELETE FROM compras WHERE numero_oc = ?').run(o.numero)
        try { db.prepare('DELETE FROM facturas_cxp WHERE oc_id = ?').run(o.id) } catch (_) {}
      }

      db.prepare('DELETE FROM oc_items WHERE oc_id = ?').run(o.id)
      db.prepare('DELETE FROM ordenes_compra WHERE id = ?').run(o.id)
    })

    ejecutar()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const ESTADOS_OC_ACTIVOS = [
  'Autorizada', 'Enviada_Proveedor', 'Recibida_Bodega',
  'Pendiente_Autorizacion', 'pendiente_autorizacion',
  'enviada', 'recibida',
]

const getOcsDisponibles = (req, res) => {
  try {
    const { proveedor, proveedor_id } = req.query
    const placeholders = ESTADOS_OC_ACTIVOS.map(() => '?').join(',')
    let sql = `SELECT id, numero, total, estado, proveedor_id, proveedor
               FROM ordenes_compra
               WHERE estado IN (${placeholders})`
    const params = [...ESTADOS_OC_ACTIVOS]
    if (proveedor_id) {
      sql += ' AND proveedor_id = ?'
      params.push(proveedor_id)
    } else if (proveedor) {
      sql += ' AND LOWER(proveedor) LIKE LOWER(?)'
      params.push(`%${proveedor}%`)
    }
    sql += ' ORDER BY created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Recepción parcial por línea ────────────────────────────────
const recepcionParcial = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    const estadosValidos = ['Enviada_Proveedor', 'Recibida_Parcial', 'enviada']
    if (!estadosValidos.includes(o.estado)) {
      return res.status(400).json({ error: `Solo se puede registrar recepción desde Enviada_Proveedor o Recibida_Parcial (estado actual: ${o.estado})` })
    }
    const { usuario_receptor_id, observacion, lineas } = req.body
    if (!lineas || !lineas.length) return res.status(400).json({ error: 'Se requiere al menos una línea con cantidad > 0' })

    const lineasFiltradas = lineas.filter(l => Number(l.cantidad_recibida) > 0)
    if (!lineasFiltradas.length) return res.status(400).json({ error: 'Ninguna línea tiene cantidad mayor a 0' })

    const advertencias = []
    const ejecutar = db.transaction(() => {
      const recepcionId = uuidv4()
      db.prepare('INSERT INTO recepciones_oc (id, oc_id, fecha_recepcion, usuario_receptor_id, observacion) VALUES (?,?,?,?,?)')
        .run(recepcionId, o.id, new Date().toISOString().split('T')[0], usuario_receptor_id || null, observacion || null)

      for (const linea of lineasFiltradas) {
        const item = db.prepare('SELECT * FROM oc_items WHERE id = ?').get(linea.linea_oc_id)
        if (!item) { advertencias.push(`Línea ${linea.linea_oc_id} no encontrada`); continue }

        const cantRecibida = Math.round(Number(linea.cantidad_recibida))
        const maxPendiente = item.cantidad - (item.cantidad_recibida_total || 0)
        const cantReal = Math.min(cantRecibida, maxPendiente)
        if (cantReal <= 0) { advertencias.push(`SKU ${item.codigo}: ya recibido al 100%`); continue }

        db.prepare('INSERT INTO recepciones_oc_lineas (id, recepcion_id, linea_oc_id, cantidad_recibida) VALUES (?,?,?,?)')
          .run(uuidv4(), recepcionId, item.id, cantReal)

        db.prepare('UPDATE oc_items SET cantidad_recibida_total = COALESCE(cantidad_recibida_total, 0) + ? WHERE id = ?')
          .run(cantReal, item.id)

        const prod = db.prepare(
          'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
        ).get(item.codigo)
        if (!prod) { advertencias.push(`SKU ${item.codigo} no encontrado en lista de precios — stock no actualizado`); continue }
        const stockAnterior = prod.stock_actual ?? 0
        const stockNuevo = stockAnterior + cantReal
        db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stockNuevo, item.codigo)
        try {
          db.prepare('INSERT INTO movimientos_stock (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(uuidv4(), prod.codigo_sku, prod.codigo_sku, prod.descripcion, 'entrada', cantReal, stockAnterior, stockNuevo, 'recepcion_parcial_oc', o.numero)
        } catch (_) {}
      }

      // Determinar si todas las líneas están completas
      const itemsActualizados = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(o.id)
      const todasCompletas = itemsActualizados.every(i => (i.cantidad_recibida_total || 0) >= i.cantidad)
      const nuevoEstado = todasCompletas ? 'Recibida_Bodega' : 'Recibida_Parcial'
      db.prepare("UPDATE ordenes_compra SET estado = ?, fecha_entrega = ?, updated_at = datetime('now') WHERE id = ?")
        .run(nuevoEstado, new Date().toISOString().split('T')[0], o.id)

      // Crear CxP si está completamente recibida
      if (todasCompletas) {
        try {
          db.prepare(`INSERT OR IGNORE INTO facturas_cxp (id, numero, proveedor_id, proveedor, oc_id, oc_numero, monto, fecha_emision, fecha_vencimiento, estado)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(uuidv4(), `CXP-${o.numero}`, o.proveedor_id || null, o.proveedor, o.id, o.numero, o.total,
              new Date().toISOString().split('T')[0], o.fecha_vencimiento || null, 'pendiente')
        } catch (_) {}
      }
    })

    ejecutar()
    const ocActualizada = withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id))
    const recepciones = db.prepare('SELECT * FROM recepciones_oc WHERE oc_id = ? ORDER BY created_at DESC').all(req.params.id)
    res.json({ ...ocActualizada, recepciones, advertencias })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getRecepciones = (req, res) => {
  try {
    const recepciones = db.prepare('SELECT * FROM recepciones_oc WHERE oc_id = ? ORDER BY created_at DESC').all(req.params.id)
    const result = recepciones.map(r => ({
      ...r,
      lineas: db.prepare('SELECT rol.*, oi.codigo, oi.descripcion, oi.cantidad FROM recepciones_oc_lineas rol JOIN oc_items oi ON oi.id = rol.linea_oc_id WHERE rol.recepcion_id = ?').all(r.id),
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Facturación de proveedor ───────────────────────────────────
const registrarFactura = (req, res) => {
  try {
    const rolUser = req.user?.rol
    if (!['gerente', 'admin', 'finanzas'].includes(rolUser)) {
      return res.status(403).json({ error: 'Se requiere rol finanzas, gerente o admin para registrar factura' })
    }
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    if (!['Recibida_Bodega', 'Recibida_Parcial', 'recibida'].includes(o.estado)) {
      return res.status(400).json({ error: `Solo se puede facturar desde Recibida_Bodega o Recibida_Parcial (estado actual: ${o.estado})` })
    }

    const { numero_factura, fecha_factura, fecha_vencimiento_pago, monto_total, modo_pago } = req.body
    if (!numero_factura || !fecha_factura || !fecha_vencimiento_pago || !monto_total || !modo_pago) {
      return res.status(400).json({ error: 'numero_factura, fecha_factura, fecha_vencimiento_pago, monto_total y modo_pago son requeridos' })
    }

    const hoy = new Date().toISOString().split('T')[0]
    const prov = o.proveedor_id ? db.prepare('SELECT razon_social FROM proveedores WHERE id = ?').get(o.proveedor_id) : null
    const provNombre = prov?.razon_social || o.proveedor || 'Proveedor'

    const ejecutar = db.transaction(() => {
      const factId = uuidv4()
      db.prepare(`INSERT INTO facturas_proveedor
        (id, oc_id, numero_factura, fecha_factura, fecha_vencimiento_pago, monto_total, modo_pago, estado_pago, usuario_registro_id)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(factId, o.id, numero_factura, fecha_factura, fecha_vencimiento_pago, Number(monto_total),
          modo_pago, 'pendiente', req.user?.id || null)

      db.prepare("UPDATE ordenes_compra SET estado = 'Facturada', numero_factura = ?, fecha_factura = ?, updated_at = datetime('now') WHERE id = ?")
        .run(numero_factura, fecha_factura, o.id)

      // Registrar en flujo de caja
      const esReal = fecha_vencimiento_pago <= hoy
      try {
        db.prepare(`INSERT INTO caja_movimientos
          (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id)
          VALUES (?,?,?,?,?,?,?,?,?)`)
          .run('egreso', 'Compra proveedor',
            `Fac. N° ${numero_factura} · ${provNombre}`,
            Number(monto_total), hoy, fecha_vencimiento_pago,
            esReal ? 'confirmado' : 'proyectado',
            'facturas_proveedor', factId)
      } catch (_) {}

      // Actualizar/crear CxP
      try {
        const cxpExiste = db.prepare('SELECT id FROM facturas_cxp WHERE oc_id = ?').get(o.id)
        if (cxpExiste) {
          db.prepare("UPDATE facturas_cxp SET numero = ?, monto = ?, fecha_emision = ?, fecha_vencimiento = ? WHERE oc_id = ?")
            .run(numero_factura, Number(monto_total), fecha_factura, fecha_vencimiento_pago, o.id)
        } else {
          db.prepare(`INSERT INTO facturas_cxp (id, numero, proveedor_id, proveedor, oc_id, oc_numero, monto, fecha_emision, fecha_vencimiento, estado)
            VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(uuidv4(), numero_factura, o.proveedor_id || null, o.proveedor, o.id, o.numero,
              Number(monto_total), fecha_factura, fecha_vencimiento_pago, 'pendiente')
        }
      } catch (_) {}

      return factId
    })

    const factId = ejecutar()
    res.status(201).json({
      ok: true,
      factura_id: factId,
      oc: withItems(db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── PDF de OC ──────────────────────────────────────────────────
const generarPdfOC = (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(o.id)
    const prov = o.proveedor_id ? db.prepare('SELECT * FROM proveedores WHERE id = ?').get(o.proveedor_id) : null

    const formatCLP = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
    const lineasHtml = items.map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.codigo || ''}</td>
        <td>${item.descripcion || ''}</td>
        <td style="text-align:center">${item.cantidad}</td>
        <td style="text-align:right">${formatCLP(item.precio_unitario)}</td>
        <td style="text-align:right">${formatCLP(item.subtotal)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>OC ${o.numero}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 20px; }
  h1 { font-size: 20px; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
  .logo { font-size: 22px; font-weight: 900; color: #1a365d; }
  .logo span { color: #e53e3e; }
  .datos { display: flex; gap: 40px; margin-bottom: 16px; }
  .datos div { flex: 1; }
  .datos label { font-weight: bold; display: block; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #1a365d; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f7fafc; }
  .totales { margin-top: 16px; text-align: right; }
  .totales table { width: 280px; margin-left: auto; }
  .totales td { border: none; padding: 3px 8px; }
  .totales .total-row { font-size: 14px; font-weight: bold; border-top: 2px solid #000; }
  .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; }
  @media print { body { margin: 0; } button { display: none !important; } }
</style>
</head>
<body>
<button onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 16px;background:#1a365d;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;">Imprimir / Guardar PDF</button>
<div class="header">
  <div>
    <div class="logo">RMG <span>Auto</span> Parts</div>
    <div style="font-size:11px;color:#666;margin-top:2px">Santiago RM · Chile</div>
  </div>
  <div style="text-align:right">
    <h1>ORDEN DE COMPRA</h1>
    <div style="font-size:16px;font-weight:bold;color:#e53e3e">${o.numero}</div>
    <div style="font-size:11px;color:#666">Fecha emisión: ${o.fecha_emision || ''}</div>
    ${o.fecha_requerida ? `<div style="font-size:11px;color:#666">Fecha requerida: ${o.fecha_requerida}</div>` : ''}
  </div>
</div>

<div class="datos">
  <div>
    <label>Proveedor:</label>
    <div>${prov?.razon_social || o.proveedor || ''}</div>
    ${prov?.rut ? `<div>RUT: ${prov.rut}</div>` : ''}
    ${prov?.direccion ? `<div>${prov.direccion}</div>` : ''}
    ${prov?.email ? `<div>Email: ${prov.email}</div>` : ''}
    ${prov?.telefono ? `<div>Tel: ${prov.telefono}</div>` : ''}
  </div>
  <div>
    <label>Condición de pago:</label>
    <div>${o.medio_pago || 'Contado'}</div>
    ${o.fecha_vencimiento ? `<div>Vencimiento: ${o.fecha_vencimiento}</div>` : ''}
    ${o.notas ? `<div style="margin-top:8px;font-style:italic">${o.notas}</div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr><th>N°</th><th>SKU</th><th>Descripción</th><th style="text-align:center">Cantidad</th><th style="text-align:right">P. Unit. Neto</th><th style="text-align:right">Subtotal</th></tr>
  </thead>
  <tbody>${lineasHtml}</tbody>
</table>

<div class="totales">
  <table>
    <tr><td>Subtotal Neto:</td><td style="text-align:right">${formatCLP(o.neto)}</td></tr>
    <tr><td>IVA 19%:</td><td style="text-align:right">${formatCLP(o.iva)}</td></tr>
    <tr class="total-row"><td>TOTAL CON IVA:</td><td style="text-align:right">${formatCLP(o.total)}</td></tr>
  </table>
</div>

<div class="footer">
  <div>
    <div style="font-weight:bold;margin-bottom:30px">Firma / Sello RMG Auto Parts</div>
    <div style="border-top:1px solid #000;width:180px;padding-top:4px">Autorizado por</div>
  </div>
  <div style="text-align:right;font-size:10px;color:#666">
    <div>Documento generado por RMG Auto Parts ERP</div>
    <div>Estado: ${o.estado}</div>
  </div>
</div>
</body>
</html>`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="${o.numero}.html"`)
    res.send(html)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Envío email de OC ──────────────────────────────────────────
const enviarEmailOC = async (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!o) return res.status(404).json({ error: 'OC no encontrada' })
    const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(o.id)
    const prov = o.proveedor_id ? db.prepare('SELECT * FROM proveedores WHERE id = ?').get(o.proveedor_id) : null

    const { email_destinatario, mensaje_adicional } = req.body
    if (!email_destinatario) return res.status(400).json({ error: 'email_destinatario es requerido' })

    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const formatCLP = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`
    const lineasHtml = items.map((item, i) => `
      <tr>
        <td>${i + 1}</td><td>${item.codigo || ''}</td><td>${item.descripcion || ''}</td>
        <td style="text-align:center">${item.cantidad}</td>
        <td style="text-align:right">${formatCLP(item.precio_unitario)}</td>
        <td style="text-align:right">${formatCLP(item.subtotal)}</td>
      </tr>`).join('')

    const html = `
<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
  <div style="background:#1a365d;color:white;padding:20px">
    <h2 style="margin:0">RMG Auto Parts — Orden de Compra ${o.numero}</h2>
  </div>
  ${mensaje_adicional ? `<div style="background:#fffbeb;padding:16px;border-left:4px solid #d69e2e">${mensaje_adicional}</div>` : ''}
  <div style="padding:20px">
    <p><strong>Proveedor:</strong> ${prov?.razon_social || o.proveedor || ''}</p>
    <p><strong>Fecha emisión:</strong> ${o.fecha_emision || ''} | <strong>Condición:</strong> ${o.medio_pago || 'Contado'}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead><tr style="background:#1a365d;color:white">
        <th style="padding:8px">N°</th><th style="padding:8px">SKU</th><th style="padding:8px">Descripción</th>
        <th style="padding:8px">Cant.</th><th style="padding:8px">P.Unit</th><th style="padding:8px">Subtotal</th>
      </tr></thead>
      <tbody>${lineasHtml}</tbody>
    </table>
    <div style="text-align:right">
      <p>Subtotal Neto: <strong>${formatCLP(o.neto)}</strong></p>
      <p>IVA 19%: <strong>${formatCLP(o.iva)}</strong></p>
      <p style="font-size:16px">TOTAL CON IVA: <strong style="color:#1a365d">${formatCLP(o.total)}</strong></p>
    </div>
    <hr/>
    <p style="font-size:11px;color:#666">Documento enviado desde RMG Auto Parts ERP</p>
  </div>
</div>`

    await transporter.sendMail({
      from: process.env.SMTP_USER || 'erp@rmgautoparts.cl',
      to: email_destinatario,
      subject: `Orden de Compra ${o.numero} — RMG Auto Parts`,
      html,
    })

    res.json({ ok: true, mensaje: `OC enviada por email a ${email_destinatario}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getProveedores, getProveedor, createProveedor, updateProveedor, getOrdenes, getOrden, createOrden, updateOrden, recibirOrden, enviarOrden, pagarOrden, deleteOrden, getCxP, pagarFactura, deleteCxP, getComprasList, createCompra, updateCompra, deleteCompra, cambiarEstadoCompra, enviarAutorizacion, autorizarOC, rechazarOC, enviarProveedor, recibirBodega, autorizarPago, getPendientesWorkflow, getOcsDisponibles, recepcionParcial, getRecepciones, registrarFactura, generarPdfOC, enviarEmailOC }
