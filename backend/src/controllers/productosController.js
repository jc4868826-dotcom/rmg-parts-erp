const { db, uuidv4 } = require('../../config/database')

const getAll = (req, res) => {
  try {
    const { categoria, marca } = req.query
    let sql = 'SELECT * FROM productos WHERE activo = 1'
    const params = []
    if (categoria) { sql += ' AND categoria = ?'; params.push(categoria) }
    if (marca) { sql += ' AND LOWER(marca) LIKE ?'; params.push(`%${marca.toLowerCase()}%`) }
    sql += ' ORDER BY marca, descripcion'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getCategorias = (_req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT categoria FROM productos WHERE activo = 1 ORDER BY categoria').all()
    res.json(rows.map(r => r.categoria))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const search = (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase()
    if (!q) return res.json(db.prepare('SELECT * FROM productos WHERE activo = 1').all())
    const like = `%${q}%`
    const rows = db.prepare(
      'SELECT * FROM productos WHERE activo = 1 AND (LOWER(descripcion) LIKE ? OR codigo LIKE ? OR LOWER(marca) LIKE ?)'
    ).all(like, like, like)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM productos WHERE codigo = ? AND activo = 1').get(req.params.codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' })
    res.json(p)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getPrecioSegmento = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM productos WHERE codigo = ? AND activo = 1').get(req.params.codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' })
    const campo = `precio_${req.params.segmento}`
    const precio = p[campo] || p.precio_b2b_base
    res.json({ codigo: p.codigo, segmento: req.params.segmento, precio })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const { codigo, marca, descripcion, categoria, unidad, precio_costo, precio_b2b_base,
            precio_taller, precio_flota, precio_concesionario, precio_construccion,
            stock_actual, stock_minimo, notas } = req.body
    const id = uuidv4()
    db.prepare(`INSERT INTO productos
      (id,codigo,marca,descripcion,categoria,unidad,precio_costo,precio_b2b_base,
       precio_taller,precio_flota,precio_concesionario,precio_construccion,
       stock_actual,stock_minimo,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, codigo, marca, descripcion, categoria, unidad || 'unidad',
      precio_costo, precio_b2b_base,
      precio_taller || null, precio_flota || null,
      precio_concesionario || null, precio_construccion || null,
      stock_actual || 0, stock_minimo || 5, notas || null)
    res.status(201).json(db.prepare('SELECT * FROM productos WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM productos WHERE codigo = ?').get(req.params.codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' })
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'codigo')
    if (!fields.length) return res.json(p)
    const set = fields.map(f => `${f} = ?`).join(', ')
    const vals = fields.map(f => req.body[f])
    db.prepare(`UPDATE productos SET ${set}, updated_at = datetime('now') WHERE codigo = ?`).run(...vals, req.params.codigo)
    res.json(db.prepare('SELECT * FROM productos WHERE codigo = ?').get(req.params.codigo))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const updateStock = (req, res) => {
  try {
    const p = db.prepare('SELECT * FROM productos WHERE codigo = ?').get(req.params.codigo)
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' })
    db.prepare("UPDATE productos SET stock_actual = ?, updated_at = datetime('now') WHERE codigo = ?")
      .run(req.body.stock, req.params.codigo)
    res.json({ ok: true, codigo: req.params.codigo, stock_nuevo: req.body.stock })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getCategorias, search, getOne, getPrecioSegmento, create, update, updateStock }
