const { db, uuidv4 } = require('../../config/database')

// Umbral de "sin movimiento" — más allá de esto un SKU con stock se considera
// estancado (capital de trabajo inmovilizado), independiente de cuánto stock tenga.
const DIAS_SIN_MOVIMIENTO_CRITICO = 60
const STOCK_BAJO_UMBRAL = 5

function diasDesde(fechaSqlite) {
  if (!fechaSqlite) return null
  const iso = fechaSqlite.includes('T') ? fechaSqlite : fechaSqlite.replace(' ', 'T') + 'Z'
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / 86400000)
}

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
        MAX(unidades_por_pack)             AS unidades_por_pack,
        MAX(costo_unidad_neto)             AS precio_compra,
        MAX(precio_venta_neto)             AS precio_venta,
        MAX(COALESCE(stock_actual, 0))     AS stock_actual,
        MAX(COALESCE(stock_minimo, 5))     AS stock_minimo
      FROM lista_precios
      WHERE codigo_sku IS NOT NULL AND codigo_sku != ''
      GROUP BY codigo_sku
      ORDER BY categoria, descripcion
    `).all()

    // Última salida (venta) por SKU — es la señal de si el producto "se mueve".
    // Las entradas (compras) y ajustes no cuentan: lo que importa acá es si se vende.
    const ultimasSalidas = db.prepare(`
      SELECT codigo, MAX(created_at) AS fecha
      FROM movimientos_stock
      WHERE tipo = 'salida'
      GROUP BY codigo
    `).all()
    const mapaUltimaSalida = new Map(ultimasSalidas.map(r => [r.codigo, r.fecha]))

    const result = rows.map(p => {
      const pack         = p.unidades_por_pack > 1 ? p.unidades_por_pack : null
      const stockActual  = p.stock_actual || 0
      const costo        = p.precio_compra || 0
      const ventaUnit    = p.precio_venta || 0
      const fechaUltimaVenta = mapaUltimaSalida.get(p.codigo) || null
      const diasSinVenta = diasDesde(fechaUltimaVenta)

      // agotado: no hay nada que vender — la urgencia máxima, independiente de rotación.
      // critico: hay stock pero no se ha vendido en el umbral (o nunca) — capital inmovilizado.
      // bajo:    se vende activamente pero queda poco — riesgo de quiebre pronto.
      // ok:      rota bien y con stock suficiente.
      let alerta = 'ok'
      if (stockActual <= 0) alerta = 'agotado'
      else if (diasSinVenta === null || diasSinVenta > DIAS_SIN_MOVIMIENTO_CRITICO) alerta = 'critico'
      else if (stockActual < STOCK_BAJO_UMBRAL) alerta = 'bajo'

      return {
        codigo:             p.codigo,
        descripcion:        p.descripcion,
        marca:              p.marca,
        categoria:          p.categoria,
        proveedor:          p.proveedor,
        presentacion:       p.presentacion,
        unidades_por_pack:  pack,
        precio_compra:      costo,
        precio_venta:       ventaUnit,
        unidad:             'unidad',
        stock_actual:       stockActual,
        stock_minimo:       p.stock_minimo || 5,
        cajas_completas:    pack ? Math.floor(stockActual / pack) : null,
        unidades_sueltas:   pack ? stockActual % pack : null,
        valor_costo:        Math.round(stockActual * costo),
        valor_venta:        Math.round(stockActual * ventaUnit),
        fecha_ultima_venta: fechaUltimaVenta,
        dias_sin_venta:     diasSinVenta,
        alerta,
      }
    })
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
