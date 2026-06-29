const { db, uuidv4 } = require('../../config/database')

const getStock = (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY marca, descripcion').all()
    const result = rows.map(p => ({
      codigo: p.codigo,
      marca: p.marca,
      descripcion: p.descripcion,
      categoria: p.categoria,
      unidad: p.unidad,
      stock_actual: p.stock_actual,
      stock_minimo: p.stock_minimo,
      alerta: p.stock_actual <= p.stock_minimo ? 'critico'
             : p.stock_actual <= p.stock_minimo * 2 ? 'bajo' : 'ok',
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getAlertas = (_req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM productos WHERE activo = 1 AND stock_actual <= stock_minimo * 1.5 ORDER BY stock_actual ASC'
    ).all()
    res.json(rows)
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
    const p = db.prepare('SELECT * FROM productos WHERE codigo = ?').get(codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' })

    const stock_anterior = p.stock_actual
    const stock_nuevo = stock_anterior + Number(cantidad)

    db.prepare("UPDATE productos SET stock_actual = ?, updated_at = datetime('now') WHERE codigo = ?")
      .run(stock_nuevo, codigo)

    const movId = uuidv4()
    db.prepare(`INSERT INTO movimientos_stock
      (id,producto_id,codigo,descripcion,tipo,cantidad,stock_anterior,stock_nuevo,motivo)
      VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(movId, codigo, codigo, p.descripcion, 'ajuste', Number(cantidad), stock_anterior, stock_nuevo, motivo)

    res.json({ ok: true, codigo, stock_nuevo })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getMovimientos = (req, res) => {
  try {
    const { tipo, codigo } = req.query
    let sql = 'SELECT * FROM movimientos_stock'
    const params = []
    const where = []
    if (tipo) { where.push('tipo = ?'); params.push(tipo) }
    if (codigo) { where.push('codigo = ?'); params.push(codigo) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getStock, getAlertas, ajustarStock, getMovimientos }
