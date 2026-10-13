const { db, uuidv4 } = require('../../config/database')

// Plantillas de correo para prospección (2026-10-13, pedido de JC).
// Cualquier usuario autenticado puede listarlas y usarlas al enviar un
// correo; solo gerente/administrador puede crear, editar o borrar (se
// gestiona a nivel de rutas con requireRole).

// GET /api/plantillas-email
const list = (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM email_plantillas WHERE activa = 1 ORDER BY nombre ASC').all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/plantillas-email/:id
const getOne = (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM email_plantillas WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: 'Plantilla no encontrada' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/plantillas-email
const create = (req, res) => {
  try {
    const { nombre, segmento, asunto, cuerpo } = req.body
    if (!nombre || !nombre.trim())   return res.status(400).json({ error: 'nombre es requerido' })
    if (!asunto || !asunto.trim())   return res.status(400).json({ error: 'asunto es requerido' })
    if (!cuerpo || !cuerpo.trim())   return res.status(400).json({ error: 'cuerpo es requerido' })

    const id = uuidv4()
    db.prepare(`
      INSERT INTO email_plantillas (id, nombre, segmento, asunto, cuerpo, usuario_id)
      VALUES (?,?,?,?,?,?)
    `).run(id, nombre.trim(), segmento || null, asunto, cuerpo, req.user?.id || null)

    res.status(201).json(db.prepare('SELECT * FROM email_plantillas WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PUT /api/plantillas-email/:id
const update = (req, res) => {
  try {
    const existente = db.prepare('SELECT * FROM email_plantillas WHERE id = ?').get(req.params.id)
    if (!existente) return res.status(404).json({ error: 'Plantilla no encontrada' })

    const { nombre, segmento, asunto, cuerpo, activa } = req.body
    db.prepare(`
      UPDATE email_plantillas SET
        nombre = COALESCE(?, nombre),
        segmento = ?,
        asunto = COALESCE(?, asunto),
        cuerpo = COALESCE(?, cuerpo),
        activa = COALESCE(?, activa),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nombre?.trim() ?? null,
      segmento !== undefined ? (segmento || null) : existente.segmento,
      asunto ?? null,
      cuerpo ?? null,
      activa !== undefined ? (activa ? 1 : 0) : null,
      req.params.id
    )

    res.json(db.prepare('SELECT * FROM email_plantillas WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// DELETE /api/plantillas-email/:id
const remove = (req, res) => {
  try {
    const existente = db.prepare('SELECT id FROM email_plantillas WHERE id = ?').get(req.params.id)
    if (!existente) return res.status(404).json({ error: 'Plantilla no encontrada' })
    db.prepare('DELETE FROM email_plantillas WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { list, getOne, create, update, remove }
