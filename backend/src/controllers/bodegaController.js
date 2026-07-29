const { db, uuidv4 } = require('../../config/database')

function getLp(codigo) {
  return db.prepare(
    'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
  ).get(codigo)
}

const getMovimientos = (req, res) => {
  try {
    const { tipo, codigo } = req.query
    let sql = 'SELECT * FROM movimientos_stock'
    const params = []
    const where  = []
    if (tipo)   { where.push('tipo = ?');   params.push(tipo) }
    if (codigo) { where.push('codigo = ?'); params.push(codigo) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const ajustarStock = (req, res) => {
  try {
    const { codigo, cantidad, motivo } = req.body
    if (!codigo || cantidad === undefined || !motivo) {
      return res.status(400).json({ error: 'codigo, cantidad y motivo son requeridos' })
    }
    const p = getLp(codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado en maestro de precios' })

    const stock_anterior = p.stock_actual
    const stock_nuevo    = stock_anterior + Number(cantidad)

    db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stock_nuevo, codigo)

    const movId = uuidv4()
    db.prepare(`INSERT INTO movimientos_stock
      (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
      VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(movId, codigo, codigo, p.descripcion, 'ajuste', Number(cantidad), stock_anterior, stock_nuevo, motivo)

    const movimiento = db.prepare('SELECT * FROM movimientos_stock WHERE id = ?').get(movId)
    res.status(201).json({ movimiento, stock_nuevo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const recibirOC = (req, res) => {
  try {
    const oc = db.prepare('SELECT * FROM ordenes_compra WHERE id = ?').get(req.params.id)
    if (!oc) return res.status(404).json({ error: 'Orden de compra no encontrada' })
    if (oc.estado === 'recibida') return res.status(400).json({ error: 'Esta OC ya fue recibida' })

    const items = db.prepare('SELECT * FROM oc_items WHERE oc_id = ?').all(oc.id)

    const movimientos = db.transaction(() => {
      const movs = []
      for (const item of items) {
        const p = getLp(item.codigo)
        const stock_anterior = p ? p.stock_actual : 0
        const stock_nuevo    = stock_anterior + item.cantidad

        if (p) {
          db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stock_nuevo, item.codigo)
        }

        const movId = uuidv4()
        db.prepare(`INSERT INTO movimientos_stock
          (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia)
          VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).run(movId, item.codigo, item.codigo, item.descripcion, 'entrada',
          item.cantidad, stock_anterior, stock_nuevo, `Recepción ${oc.numero}`, oc.id)

        movs.push(db.prepare('SELECT * FROM movimientos_stock WHERE id = ?').get(movId))
      }
      db.prepare("UPDATE ordenes_compra SET estado = 'recibida', fecha_entrega = ?, updated_at = datetime('now') WHERE id = ?")
        .run(new Date().toISOString().split('T')[0], oc.id)
      return movs
    })()

    res.json({ ok: true, oc_numero: oc.numero, movimientos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getStockConMovimientos = (req, res) => {
  try {
    const codigo = req.params.codigo
    const p = db.prepare(
      'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(marca) AS marca, MAX(categoria) AS categoria, MAX(costo_unidad_neto) AS precio_compra, MAX(precio_venta_neto) AS precio_venta, MAX(COALESCE(stock_actual,0)) AS stock_actual, MAX(COALESCE(stock_minimo,5)) AS stock_minimo FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
    ).get(codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado en maestro de precios' })
    const movimientos = db.prepare(
      'SELECT * FROM movimientos_stock WHERE codigo = ? ORDER BY created_at DESC'
    ).all(codigo)
    res.json({ producto: p, movimientos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getMovimientos, ajustarStock, recibirOC, getStockConMovimientos }
