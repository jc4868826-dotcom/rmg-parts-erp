const { db, uuidv4 } = require('../../config/database')

const getStock = (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        codigo_sku                         AS codigo,
        MAX(descripcion)                   AS descripcion,
        MAX(marca)                         AS marca,
        MAX(categoria)                     AS categoria,
        MAX(proveedor)                     AS proveedor,
        MAX(presentacion)                  AS presentacion,
        MAX(costo_unidad_neto)             AS precio_compra,
        MAX(precio_venta_neto)             AS precio_venta,
        MAX(COALESCE(stock_actual, 0))     AS stock_actual,
        MAX(COALESCE(stock_minimo, 5))     AS stock_minimo
      FROM lista_precios
      WHERE codigo_sku IS NOT NULL AND codigo_sku != ''
      GROUP BY codigo_sku
      ORDER BY categoria, descripcion
    `).all()
    const result = rows.map(p => ({
      codigo:       p.codigo,
      descripcion:  p.descripcion,
      marca:        p.marca,
      categoria:    p.categoria,
      proveedor:    p.proveedor,
      presentacion: p.presentacion,
      precio_compra: p.precio_compra,
      precio_venta:  p.precio_venta,
      unidad:       'unidad',
      stock_actual:  p.stock_actual  || 0,
      stock_minimo:  p.stock_minimo  || 5,
      alerta: (p.stock_actual || 0) <= (p.stock_minimo || 5)       ? 'critico'
            : (p.stock_actual || 0) <= (p.stock_minimo || 5) * 2   ? 'bajo' : 'ok',
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getAlertas = (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        codigo_sku                         AS codigo,
        MAX(descripcion)                   AS descripcion,
        MAX(marca)                         AS marca,
        MAX(categoria)                     AS categoria,
        MAX(COALESCE(stock_actual, 0))     AS stock_actual,
        MAX(COALESCE(stock_minimo, 5))     AS stock_minimo
      FROM lista_precios
      WHERE codigo_sku IS NOT NULL
      GROUP BY codigo_sku
      HAVING MAX(COALESCE(stock_actual, 0)) <= MAX(COALESCE(stock_minimo, 5)) * 1.5
      ORDER BY stock_actual ASC
    `).all()
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
    const p = db.prepare(
      'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
    ).get(codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado en maestro de precios' })

    const stock_anterior = p.stock_actual || 0
    const stock_nuevo    = stock_anterior + Number(cantidad)

    db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stock_nuevo, codigo)

    const movId = uuidv4()
    db.prepare(`INSERT INTO movimientos_stock
      (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
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

module.exports = { getStock, getAlertas, ajustarStock, getMovimientos }
