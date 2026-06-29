const { db, uuidv4 } = require('../../config/database')

const getAll = (req, res) => {
  try {
    const { segmento, etapa } = req.query
    let sql = 'SELECT * FROM clientes WHERE activo = 1'
    const params = []
    if (segmento) { sql += ' AND segmento = ?'; params.push(segmento) }
    if (etapa) { sql += ' AND etapa_pipeline = ?'; params.push(etapa) }
    sql += ' ORDER BY razon_social'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ? AND activo = 1').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(c)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const { razon_social, rut, segmento, etapa_pipeline, contacto_nombre, contacto_cargo,
            telefono, whatsapp, email, direccion, comuna, giro,
            credito_activo, dias_credito, limite_credito, notas } = req.body
    const id = uuidv4()
    db.prepare(`INSERT INTO clientes
      (id,razon_social,rut,segmento,etapa_pipeline,contacto_nombre,contacto_cargo,
       telefono,whatsapp,email,direccion,comuna,giro,credito_activo,dias_credito,limite_credito,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, razon_social, rut || null, segmento, etapa_pipeline || 'prospecto',
      contacto_nombre || null, contacto_cargo || null,
      telefono || null, whatsapp || null, email || null,
      direccion || null, comuna || null, giro || null,
      credito_activo ? 1 : 0, dias_credito || 0, limite_credito || 0, notas || null)
    res.status(201).json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ? AND activo = 1').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' })
    const fields = Object.keys(req.body).filter(k => k !== 'id')
    if (!fields.length) return res.json(c)
    const set = fields.map(f => `${f} = ?`).join(', ')
    const vals = fields.map(f => req.body[f])
    db.prepare(`UPDATE clientes SET ${set}, updated_at = datetime('now') WHERE id = ?`).run(...vals, req.params.id)
    res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const remove = (req, res) => {
  try {
    db.prepare("UPDATE clientes SET activo = 0, updated_at = datetime('now') WHERE id = ?").run(req.params.id)
    res.json({ ok: true, id: req.params.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove }
