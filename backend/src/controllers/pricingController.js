const { db, uuidv4, extractClusterKey, parseVolumenLitros } = require('../../config/database')

const CATEGORIA_LINEA = {
  neumatico:  'NEUMATICOS',
  bateria:    'BATERIAS',
  lubricante: 'LUBRICANTES',
}

// GET /api/pricing/skus
const getSkus = (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.codigo, p.marca, p.descripcion, p.categoria, p.cluster_key,
             p.precio_costo, p.precio_b2b_base, p.margen_objetivo, p.stock_actual,
             p.volumen_litros,
             ps.id   AS proveedor_id,
             ps.proveedor_nombre,
             ps.costo_neto,
             ps.condicion_pago,
             crm.id                  AS cluster_id,
             crm.precio_mercado_min  AS mercado_min,
             crm.precio_mercado_max  AS mercado_max,
             crm.fuente              AS mercado_fuente
      FROM productos p
      LEFT JOIN proveedores_sku ps  ON ps.sku_codigo = p.codigo AND ps.es_activo = 1
      LEFT JOIN cluster_referencia_mercado crm ON crm.cluster_key = p.cluster_key
      WHERE p.activo = 1
      ORDER BY p.categoria, p.marca, p.descripcion
    `).all()

    const allProvs = db.prepare(
      'SELECT * FROM proveedores_sku ORDER BY sku_codigo, es_activo DESC, fecha_actualizacion DESC'
    ).all()

    const provByCodigo = {}
    for (const pv of allProvs) {
      if (!provByCodigo[pv.sku_codigo]) provByCodigo[pv.sku_codigo] = []
      provByCodigo[pv.sku_codigo].push(pv)
    }

    const result = rows.map(r => {
      const costo = r.costo_neto ?? r.precio_costo
      const volumen = r.volumen_litros || null
      return {
        codigo:         r.codigo,
        marca:          r.marca,
        descripcion:    r.descripcion,
        categoria:      r.categoria,
        linea:          CATEGORIA_LINEA[r.categoria] || r.categoria.toUpperCase(),
        cluster_key:    r.cluster_key || null,
        costo,
        precio_b2b:     r.precio_b2b_base,
        stock:          r.stock_actual,
        margen_pct:     r.margen_objetivo,
        proveedor_activo: r.proveedor_nombre || null,
        condicion_pago:   r.condicion_pago  || null,
        mercado_min:    r.mercado_min  || null,
        mercado_max:    r.mercado_max  || null,
        mercado_fuente: r.mercado_fuente || null,
        proveedores:    provByCodigo[r.codigo] || [],
        volumen_litros: volumen,
        costo_por_litro: (volumen && volumen > 0) ? costo / volumen : null,
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/pricing/clusters
const getClusters = (req, res) => {
  try {
    res.json(db.prepare(
      'SELECT * FROM cluster_referencia_mercado ORDER BY linea, cluster_key'
    ).all())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/pricing/proveedores-sku  — crea o actualiza un proveedor para un SKU
const upsertProveedorSku = (req, res) => {
  try {
    const { sku_codigo, proveedor_nombre, costo_neto, condicion_pago, es_activo } = req.body
    if (!sku_codigo || !proveedor_nombre || costo_neto == null)
      return res.status(400).json({ error: 'sku_codigo, proveedor_nombre y costo_neto son requeridos' })

    const existing = db.prepare(
      'SELECT id FROM proveedores_sku WHERE sku_codigo = ? AND proveedor_nombre = ?'
    ).get(sku_codigo, proveedor_nombre)

    let id
    if (existing) {
      id = existing.id
      db.prepare(`
        UPDATE proveedores_sku
        SET costo_neto = ?, condicion_pago = ?, fecha_actualizacion = datetime('now')
        WHERE id = ?
      `).run(costo_neto, condicion_pago || 'credito', id)
    } else {
      id = uuidv4()
      db.prepare(`
        INSERT INTO proveedores_sku (id, sku_codigo, proveedor_nombre, costo_neto, condicion_pago, es_activo)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(id, sku_codigo, proveedor_nombre, costo_neto, condicion_pago || 'credito')
    }

    if (es_activo) _activateProvider(sku_codigo, id)

    res.json({ ok: true, action: existing ? 'updated' : 'created', id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PUT /api/pricing/proveedores-sku/:id/activar
const activarProveedorSku = (req, res) => {
  try {
    const pv = db.prepare('SELECT * FROM proveedores_sku WHERE id = ?').get(req.params.id)
    if (!pv) return res.status(404).json({ error: 'Proveedor no encontrado' })
    _activateProvider(pv.sku_codigo, pv.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

function _activateProvider(sku_codigo, provider_id) {
  const pv = db.prepare('SELECT costo_neto FROM proveedores_sku WHERE id = ?').get(provider_id)
  if (!pv) return
  const prod = db.prepare('SELECT margen_objetivo FROM productos WHERE codigo = ?').get(sku_codigo)
  const margen = prod?.margen_objetivo || 30
  const newB2b = Math.round(pv.costo_neto * (1 + margen / 100))
  db.prepare('UPDATE proveedores_sku SET es_activo = 0 WHERE sku_codigo = ?').run(sku_codigo)
  db.prepare('UPDATE proveedores_sku SET es_activo = 1 WHERE id = ?').run(provider_id)
  db.prepare(`
    UPDATE productos SET precio_costo = ?, precio_b2b_base = ?, updated_at = datetime('now')
    WHERE codigo = ?
  `).run(pv.costo_neto, newB2b, sku_codigo)
}

// DELETE /api/pricing/proveedores-sku/:id  — solo si no es el activo
const deleteProveedorSku = (req, res) => {
  try {
    const pv = db.prepare('SELECT * FROM proveedores_sku WHERE id = ?').get(req.params.id)
    if (!pv) return res.status(404).json({ error: 'Proveedor no encontrado' })
    if (pv.es_activo) return res.status(409).json({ error: 'No se puede eliminar el proveedor activo' })
    db.prepare('DELETE FROM proveedores_sku WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/pricing/clusters  — crea o actualiza un cluster de precio mercado
const upsertCluster = (req, res) => {
  try {
    const { linea, cluster_key, precio_mercado_min, precio_mercado_max, fuente } = req.body
    if (!cluster_key || !linea)
      return res.status(400).json({ error: 'linea y cluster_key son requeridos' })

    const existing = db.prepare(
      'SELECT id FROM cluster_referencia_mercado WHERE cluster_key = ?'
    ).get(cluster_key)

    if (existing) {
      db.prepare(`
        UPDATE cluster_referencia_mercado
        SET linea = ?, precio_mercado_min = ?, precio_mercado_max = ?, fuente = ?,
            fecha_actualizacion = datetime('now')
        WHERE id = ?
      `).run(linea, precio_mercado_min ?? null, precio_mercado_max ?? null, fuente || null, existing.id)
      res.json({ ok: true, action: 'updated', id: existing.id })
    } else {
      const id = uuidv4()
      db.prepare(`
        INSERT INTO cluster_referencia_mercado (id, linea, cluster_key, precio_mercado_min, precio_mercado_max, fuente)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, linea, cluster_key, precio_mercado_min ?? null, precio_mercado_max ?? null, fuente || null)
      res.json({ ok: true, action: 'created', id })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/pricing/reindex  — re-ejecuta cluster_key + volumen_litros en todos los SKUs activos
const reindexClusters = (req, res) => {
  try {
    const prods = db.prepare('SELECT id, codigo, categoria, descripcion FROM productos WHERE activo = 1').all()
    const upd = db.transaction(() => {
      for (const p of prods) {
        const ck  = extractClusterKey(p.categoria, p.descripcion)
        const vol = p.categoria === 'lubricante' ? parseVolumenLitros(p.descripcion) : null
        db.prepare('UPDATE productos SET cluster_key = ?, volumen_litros = ? WHERE id = ?')
          .run(ck, vol, p.id)
      }
    })
    upd()
    res.json({ ok: true, updated: prods.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getSkus, getClusters,
  upsertProveedorSku, activarProveedorSku, deleteProveedorSku,
  upsertCluster, reindexClusters,
}
