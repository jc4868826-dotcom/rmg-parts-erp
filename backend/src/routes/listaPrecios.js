const router = require('express').Router()
const { db } = require('../../config/database')
const { authenticate, requireRole } = require('../middleware/auth')
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

let vistonyData = []
try {
  const raw = fs.readFileSync(path.join(__dirname, '../../../asistente/vistony_catalogo.json'), 'utf8')
  vistonyData = JSON.parse(raw)
  console.log(`[listaPrecios] Catálogo Vistony cargado: ${vistonyData.length} productos`)
} catch (e) {
  console.log('[listaPrecios] vistony_catalogo.json no disponible:', e.message)
}

function _norm(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

router.get('/buscar', (req, res) => {
  try {
    const { q = '' } = req.query
    const terms = q.trim().split(/\s+/).filter(t => t.length >= 2)
    if (terms.length === 0) return res.json([])

    const conditions = terms.map(() =>
      `(descripcion       LIKE ? COLLATE NOCASE OR
        producto_generico LIKE ? COLLATE NOCASE OR
        marca             LIKE ? COLLATE NOCASE OR
        codigo_sku        LIKE ? COLLATE NOCASE OR
        categoria         LIKE ? COLLATE NOCASE)`
    ).join(' AND ')

    const params = terms.flatMap(t => {
      const like = `%${t}%`
      return [like, like, like, like, like]
    })

    const rowsRaw = db.prepare(`
      SELECT
        codigo_sku, descripcion, producto_generico, marca, proveedor,
        presentacion, tipo_envase, unidades_por_pack, categoria, segmento_negocio,
        precio_neto, costo_neto,
        costo_unidad_neto, precio_venta_neto,
        costo_compra, precio_venta,
        stock_actual, stock_minimo
      FROM lista_precios
      WHERE ${conditions}
      GROUP BY codigo_sku
      ORDER BY ranking_compra ASC, descripcion ASC
      LIMIT 200
    `).all(...params)

    // Para un SKU en caja/pack, el costo y precio guardados son los de LA CAJA
    // completa (así viene del maestro del proveedor — el código CAJ12 trae el
    // precio del display de 12, no el de una unidad suelta). Todo el sistema
    // compra, cotiza y vende en unidades reales, así que acá se calcula el
    // costo/precio POR UNIDAD dividiendo por el pack antes de entregarlo — y se
    // conserva el valor de caja en los campos *_caja por si se necesita mostrar.
    const PRICE_FIELDS = ['precio_neto', 'costo_neto', 'costo_unidad_neto', 'precio_venta_neto', 'costo_compra', 'precio_venta']
    const rows = rowsRaw.map(r => {
      const pack = Number(r.unidades_por_pack) > 1 ? Number(r.unidades_por_pack) : null
      if (!pack) return r
      const ajustada = { ...r }
      for (const f of PRICE_FIELDS) {
        ajustada[`${f}_caja`] = r[f]
        ajustada[f] = (r[f] === null || r[f] === undefined) ? r[f] : r[f] / pack
      }
      return ajustada
    })

    const normTerms = terms.map(_norm)

    const vistonyMatches = vistonyData.filter(v => {
      const hay = _norm(v.nombre) + ' ' + _norm(v.aplicacion) + ' ' + _norm(v.sae_viscosidad)
      return normTerms.every(t => hay.includes(t))
    })

    const extraRows = []
    for (const v of vistonyMatches) {
      const normNombre = _norm(v.nombre)
      const alreadyCovered = rows.some(r => _norm(r.descripcion).includes(normNombre) || normNombre.includes(_norm(r.descripcion).split(' ')[0]))
      if (alreadyCovered) continue
      const erpMatch = rows.find(r => _norm(r.descripcion).includes(normNombre.split(' ')[0]))
      if (!erpMatch) {
        extraRows.push({
          codigo_sku: null,
          descripcion: v.nombre,
          producto_generico: v.aplicacion,
          marca: 'VISTONY',
          proveedor: 'VISTONY',
          presentacion: v.presentaciones || null,
          tipo_envase: null,
          costo_unidad_neto: null, precio_venta_neto: null,
          costo_compra: null, precio_venta: null,
          categoria: null, segmento_negocio: null,
          stock_actual: null, stock_minimo: null,
          nota: 'Consultar disponibilidad',
          sae_viscosidad: v.sae_viscosidad || null,
        })
      }
    }

    res.json([...rows, ...extraRows])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM lista_precios ORDER BY proveedor, categoria, ranking_compra').all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/lista-precios/import — reemplaza toda la lista preservando stock
// Body: { items: [{ segmento_negocio, prioridad_consumo, categoria, producto_generico,
//   proveedor, marca, ranking_compra, codigo_sku, descripcion, presentacion,
//   tipo_envase, unidades_por_pack, costo_compra, precio_venta, margen_clp }] }
router.post('/import', authenticate, requireRole(['gerente', 'administrador']), (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un array no vacío' })
    }

    const doImport = db.transaction(() => {
      // Preservar stock por codigo_sku (tomar el máximo si hay varias filas por SKU)
      const stockMap = {}
      for (const row of db.prepare('SELECT codigo_sku, stock_actual, stock_minimo FROM lista_precios').all()) {
        const prev = stockMap[row.codigo_sku]
        if (!prev || (row.stock_actual || 0) > (prev.stock_actual || 0)) {
          stockMap[row.codigo_sku] = { stock_actual: row.stock_actual || 0, stock_minimo: row.stock_minimo || 5 }
        }
      }

      db.prepare('DELETE FROM lista_precios').run()

      const stmt = db.prepare(`
        INSERT INTO lista_precios
          (segmento_negocio, prioridad_consumo, categoria, producto_generico,
           proveedor, marca, ranking_compra, codigo_sku, descripcion,
           presentacion, tipo_envase, unidades_por_pack,
           precio_neto, costo_neto,
           costo_compra, precio_venta,
           costo_unidad_neto, precio_venta_neto,
           costo_pack_neto, margen_clp, margen_pct,
           stock_actual, stock_minimo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `)

      let inserted = 0
      for (const it of items) {
        const sku       = String(it.codigo_sku || '').trim()
        const costoNeto = Number(it.costo_compra) || 0   // Excel COSTO COMPRA ya es neto
        const precioNeto = Number(it.precio_venta) || 0  // Excel PRECIO VTA ya es neto
        const unids     = Number(it.unidades_por_pack) || 1
        const margenClp = Math.round(precioNeto - costoNeto)
        const margenPct = costoNeto > 0 ? parseFloat(((precioNeto - costoNeto) / costoNeto).toFixed(4)) : 0
        const stock     = stockMap[sku] || { stock_actual: 0, stock_minimo: 5 }

        stmt.run(
          it.segmento_negocio || null,
          Number(it.prioridad_consumo) || null,
          it.categoria || null,
          it.producto_generico || null,
          it.proveedor || null,
          it.marca || null,
          Number(it.ranking_compra) || null,
          sku,
          it.descripcion || null,
          it.presentacion || null,
          it.tipo_envase || null,
          unids,
          precioNeto,
          costoNeto,
          costoNeto,   // costo_compra = costo_neto
          precioNeto,  // precio_venta = precio_neto
          costoNeto,   // costo_unidad_neto = costo_neto (sin IVA, el Excel ya es neto)
          precioNeto,  // precio_venta_neto = precio_neto
          costoNeto * unids,
          margenClp,
          margenPct,
          stock.stock_actual,
          stock.stock_minimo,
        )
        inserted++
      }
      return { inserted, stockPreserved: Object.keys(stockMap).length }
    })

    const result = doImport()
    console.log(`[lista-precios/import] ${result.inserted} filas, ${result.stockPreserved} SKUs con stock preservado`)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/lista-precios/descargar-excel — descarga toda la lista como xlsx
router.get('/descargar-excel', authenticate, (req, res) => {
  try {
    const filas = db.prepare('SELECT * FROM lista_precios ORDER BY categoria, descripcion').all()
    const fecha = new Date().toISOString().slice(0, 10)

    const filaEncabezado = [
      'Código SKU', 'Descripción', 'Familia / Categoría', 'Proveedor',
      'Presentación', 'Tipo Envase', 'Segmento',
      'Precio Neto Compra (sin IVA)', 'Precio Neto Venta (sin IVA)', 'Margen %',
    ]

    const datosFilas = filas.map(f => {
      const costo  = Math.round(f.costo_unidad_neto || 0)
      const precio = Math.round(f.precio_venta_neto || 0)
      const margen = precio > 0
        ? ((precio - costo) / precio * 100).toFixed(1) + '%'
        : '—'
      return [
        f.codigo_sku    || '',
        f.descripcion   || '',
        f.categoria     || '',
        f.proveedor     || '',
        f.presentacion  || '',
        f.tipo_envase   || '',
        f.segmento_negocio || '',
        costo,
        precio,
        margen,
      ]
    })

    const notaPie = [['* Todos los precios son NETOS SIN IVA']]

    const ws = XLSX.utils.aoa_to_sheet([filaEncabezado, ...datosFilas, [], ...notaPie])

    // Anchos de columna
    ws['!cols'] = [
      { wch: 12 }, { wch: 45 }, { wch: 28 }, { wch: 18 },
      { wch: 14 }, { wch: 12 }, { wch: 14 },
      { wch: 24 }, { wch: 24 }, { wch: 10 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Lista de Precios RMG')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Lista_Precios_RMG_${fecha}.xlsx"`,
      'Content-Length': buffer.length,
    })
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/lista-precios/upsert-vistony — actualiza precios Vistony sin tocar otros proveedores
// Body: { items: [{ codigo_sku, descripcion, presentacion, categoria,
//   costo_unidad_neto, precio_venta_neto }] }
router.post('/upsert-vistony', authenticate, requireRole(['gerente', 'administrador']), (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un array no vacío' })
    }

    const doUpsert = db.transaction(() => {
      const stmtUpdate = db.prepare(`
        UPDATE lista_precios SET
          costo_unidad_neto = ?, precio_venta_neto = ?,
          costo_compra = ?, precio_venta = ?,
          costo_neto = ?, precio_neto = ?,
          margen_clp = ?, margen_pct = ?,
          descripcion = ?, presentacion = ?, categoria = ?
        WHERE codigo_sku = ?
      `)

      const stmtInsert = db.prepare(`
        INSERT INTO lista_precios
          (codigo_sku, descripcion, presentacion, categoria,
           proveedor, marca,
           costo_unidad_neto, precio_venta_neto,
           costo_compra, precio_venta,
           costo_neto, precio_neto,
           margen_clp, margen_pct,
           stock_actual, stock_minimo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,5)
      `)

      const stmtExists = db.prepare('SELECT id FROM lista_precios WHERE codigo_sku = ? LIMIT 1')

      let updated = 0, inserted = 0, ignored = 0

      for (const it of items) {
        const sku    = String(it.codigo_sku || '').trim()
        const costo  = Number(it.costo_unidad_neto) || 0
        const precio = Number(it.precio_venta_neto) || 0

        if (!sku || (costo === 0 && precio === 0)) { ignored++; continue }

        const margenClp = Math.round(precio - costo)
        const margenPct = costo > 0 ? parseFloat(((precio - costo) / costo).toFixed(4)) : 0
        const desc = it.descripcion || null
        const pres = it.presentacion || null
        const cat  = it.categoria || null

        const exists = stmtExists.get(sku)
        if (exists) {
          stmtUpdate.run(costo, precio, costo, precio, costo, precio, margenClp, margenPct, desc, pres, cat, sku)
          updated++
        } else {
          stmtInsert.run(sku, desc, pres, cat, 'Vistony', 'Vistony', costo, precio, costo, precio, costo, precio, margenClp, margenPct)
          inserted++
        }
      }

      return { updated, inserted, ignored }
    })

    const result = doUpsert()
    console.log(`[lista-precios/upsert-vistony] updated=${result.updated} inserted=${result.inserted} ignored=${result.ignored}`)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
