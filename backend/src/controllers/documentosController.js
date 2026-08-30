/**
 * RMG Parts — Documentos adjuntos (PDF / Excel / imagen)
 * Módulo único reutilizado por cotización, pedido, venta y orden de compra.
 * Los archivos se guardan en base64 dentro de la BD (no hay disco persistente
 * de uploads en este despliegue — mismo criterio ya usado para imágenes de landing).
 */
const { db, uuidv4 } = require('../../config/database')
const { tipoDeDocumento } = require('../middleware/documentos')

const ENTIDADES = ['cotizacion', 'pedido', 'venta', 'orden_compra']

const publicRow = (d) => {
  if (!d) return d
  const { contenido_base64, ...rest } = d
  return rest
}

const listar = (req, res) => {
  try {
    const { entidad, entidadId } = req.params
    if (!ENTIDADES.includes(entidad)) return res.status(400).json({ error: 'Entidad inválida' })
    const rows = db.prepare(
      'SELECT * FROM documentos_adjuntos WHERE entidad = ? AND entidad_id = ? ORDER BY created_at DESC'
    ).all(entidad, entidadId)
    res.json(rows.map(publicRow))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const subir = (req, res) => {
  try {
    const { entidad, entidadId } = req.params
    if (!ENTIDADES.includes(entidad)) return res.status(400).json({ error: 'Entidad inválida' })
    if (!req.file) return res.status(400).json({ error: 'Adjunta un PDF, Excel o imagen' })

    const tipo = tipoDeDocumento(req.file.mimetype)
    if (!tipo) return res.status(400).json({ error: 'Formato no permitido — usa PDF, Excel o imagen' })

    const id = uuidv4()
    db.prepare(`INSERT INTO documentos_adjuntos
      (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por)
      VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, entidad, entidadId, tipo, req.file.originalname, req.file.mimetype,
      req.file.buffer.toString('base64'), req.user?.id || null)

    res.status(201).json(publicRow(db.prepare('SELECT * FROM documentos_adjuntos WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const descargar = (req, res) => {
  try {
    const d = db.prepare('SELECT * FROM documentos_adjuntos WHERE id = ?').get(req.params.id)
    if (!d) return res.status(404).json({ error: 'Documento no encontrado' })
    res.setHeader('Content-Type', d.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${(d.nombre_archivo || 'documento').replace(/"/g, '')}"`)
    res.send(Buffer.from(d.contenido_base64, 'base64'))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const eliminar = (req, res) => {
  try {
    const d = db.prepare('SELECT id FROM documentos_adjuntos WHERE id = ?').get(req.params.id)
    if (!d) return res.status(404).json({ error: 'Documento no encontrado' })
    db.prepare('DELETE FROM documentos_adjuntos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { listar, subir, descargar, eliminar }
