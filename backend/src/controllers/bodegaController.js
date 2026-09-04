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

// Elimina un movimiento del historial y revierte su efecto neto sobre el
// stock actual del SKU (stock_nuevo - stock_anterior de ESE movimiento),
// sin importar el orden en que haya ocurrido respecto a otros movimientos
// posteriores. Pensado para limpiar movimientos de prueba / error cargados
// antes de que existiera la conversión caja→unidad, sin tener que recalcular
// manualmente el stock desde cero.
const eliminarMovimiento = (req, res) => {
  try {
    const mov = db.prepare('SELECT * FROM movimientos_stock WHERE id = ?').get(req.params.id)
    if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' })

    const delta = (mov.stock_nuevo ?? 0) - (mov.stock_anterior ?? 0)
    const p = getLp(mov.codigo)
    let stock_actual = null

    db.transaction(() => {
      if (p) {
        stock_actual = p.stock_actual - delta
        db.prepare('UPDATE lista_precios SET stock_actual = ? WHERE codigo_sku = ?').run(stock_actual, mov.codigo)
      }
      db.prepare('DELETE FROM movimientos_stock WHERE id = ?').run(mov.id)
    })()

    res.json({ ok: true, id: mov.id, codigo: mov.codigo, stock_actual })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// "Código de limpieza" — pone en 0 el stock_actual de TODOS los SKU de la
// bodega de una sola vez. Pensado para usar antes de una toma de inventario
// física completa (se limpia todo, y después se va cargando el conteo real
// SKU por SKU con /bodega/ajuste). Acción masiva e irreversible sobre datos
// reales — por eso queda gateada a gerente/administrador en la ruta y deja
// UN movimiento 'ajuste' por cada SKU que tenía stock distinto de 0, con su
// stock_anterior guardado, para poder auditar o revertir uno por uno desde
// el historial si hace falta (igual que cualquier otro ajuste manual).
const limpiarStock = (req, res) => {
  try {
    const motivo = (req.body?.motivo || '').trim() || 'Limpieza de bodega — toma de inventario'

    const skus = db.prepare(`
      SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(COALESCE(stock_actual,0)) AS stock_actual
      FROM lista_precios
      WHERE codigo_sku IS NOT NULL AND codigo_sku != ''
      GROUP BY codigo_sku
      HAVING MAX(COALESCE(stock_actual,0)) != 0
    `).all()

    const resumen = db.transaction(() => {
      const afectados = []
      for (const s of skus) {
        db.prepare('UPDATE lista_precios SET stock_actual = 0 WHERE codigo_sku = ?').run(s.codigo_sku)

        const movId = uuidv4()
        db.prepare(`INSERT INTO movimientos_stock
          (id, producto_id, codigo, descripcion, tipo, cantidad, stock_anterior, stock_nuevo, motivo)
          VALUES (?,?,?,?,?,?,?,?,?)`
        ).run(movId, s.codigo_sku, s.codigo_sku, s.descripcion, 'ajuste',
          -s.stock_actual, s.stock_actual, 0, motivo)

        afectados.push({ codigo: s.codigo_sku, descripcion: s.descripcion, stock_anterior: s.stock_actual })
      }
      return afectados
    })()

    res.json({
      ok: true,
      skus_afectados: resumen.length,
      stock_total_previo: resumen.reduce((s, r) => s + r.stock_anterior, 0),
      detalle: resumen,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getStockConMovimientos = (req, res) => {
  try {
    const codigo = req.params.codigo
    const raw = db.prepare(
      'SELECT codigo_sku, MAX(descripcion) AS descripcion, MAX(marca) AS marca, MAX(categoria) AS categoria, MAX(costo_unidad_neto) AS precio_compra, MAX(precio_venta_neto) AS precio_venta, MAX(unidades_por_pack) AS unidades_por_pack, MAX(COALESCE(stock_actual,0)) AS stock_actual, MAX(COALESCE(stock_minimo,5)) AS stock_minimo FROM lista_precios WHERE codigo_sku = ? GROUP BY codigo_sku'
    ).get(codigo)
    if (!raw) return res.status(404).json({ error: 'Producto no encontrado en maestro de precios' })
    // costo_unidad_neto/precio_venta_neto guardan el precio de LA CAJA completa
    // cuando el SKU viene en pack — se divide acá igual que en inventarioController
    // y listaPrecios.js /buscar, para no mostrar el costo de caja como si fuera
    // costo unitario.
    const pack = raw.unidades_por_pack > 1 ? raw.unidades_por_pack : null
    const p = {
      ...raw,
      precio_compra: pack ? raw.precio_compra / pack : raw.precio_compra,
      precio_venta:  pack ? raw.precio_venta / pack : raw.precio_venta,
    }
    const movimientos = db.prepare(
      'SELECT * FROM movimientos_stock WHERE codigo = ? ORDER BY created_at DESC'
    ).all(codigo)
    res.json({ producto: p, movimientos })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getMovimientos, ajustarStock, recibirOC, getStockConMovimientos, eliminarMovimiento, limpiarStock }
