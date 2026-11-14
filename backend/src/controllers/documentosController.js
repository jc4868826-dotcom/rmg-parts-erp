/**
 * RMG Parts — Documentos adjuntos (PDF / Excel / imagen)
 * Módulo único reutilizado por cotización, pedido, venta y orden de compra.
 * Los archivos se guardan en base64 dentro de la BD (no hay disco persistente
 * de uploads en este despliegue — mismo criterio ya usado para imágenes de landing).
 */
const { db, uuidv4 } = require('../../config/database')
const { tipoDeDocumento } = require('../middleware/documentos')

const ENTIDADES = ['cotizacion', 'pedido', 'venta', 'orden_compra', 'oportunidad_chilecompra']
// Flujo v2 (2026-09-24): categorías con significado en el flujo. 'oc_cliente' es
// la compuerta para crear la nota de venta; 'respaldo_costos' decide si los
// costos vienen del proveedor o de la lista de precios.
const CATEGORIAS = ['oc_cliente', 'respaldo_costos', 'comprobante_pago', 'factura', 'guia_despacho', 'otro']

const publicRow = (d) => {
  if (!d) return d
  const { contenido_base64, ...rest } = d
  return rest
}

const listar = (req, res) => {
  try {
    const { entidad, entidadId } = req.params
    if (!ENTIDADES.includes(entidad)) return res.status(400).json({ error: 'Entidad inválida' })
    let sql = 'SELECT * FROM documentos_adjuntos WHERE entidad = ? AND entidad_id = ?'
    const params = [entidad, entidadId]
    if (req.query.categoria) { sql += ' AND categoria = ?'; params.push(req.query.categoria) }
    const rows = db.prepare(sql + ' ORDER BY created_at DESC').all(...params)
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

    const categoria = CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : null

    const id = uuidv4()
    db.prepare(`INSERT INTO documentos_adjuntos
      (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por, categoria)
      VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(id, entidad, entidadId, tipo, req.file.originalname, req.file.mimetype,
      req.file.buffer.toString('base64'), req.user?.id || null, categoria)

    res.status(201).json(publicRow(db.prepare('SELECT * FROM documentos_adjuntos WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * Alta de documento SIN multipart: el contenido viaja en base64 dentro del JSON.
 *
 * Existe para los clientes que no pueden armar un form-data — en concreto el
 * conector MCP, que recibe el archivo en la conversación y no tiene forma de
 * mandarlo como multipart. Guarda exactamente igual que subir(): la tabla ya
 * almacena el contenido en base64, así que esto no cambia el modelo de datos
 * ni crea una segunda forma de leer los documentos.
 *
 * Deliberadamente NO relaja ninguna compuerta del flujo: subir la OC del
 * cliente por acá satisface el requisito de createFromCotizacion igual que
 * subirla desde la UI, porque el lookup es por entidad + categoria.
 *
 * body: { nombre_archivo, mime_type, contenido_base64, categoria? }
 */
const subirJson = (req, res) => {
  try {
    const { entidad, entidadId } = req.params
    if (!ENTIDADES.includes(entidad)) return res.status(400).json({ error: 'Entidad inválida' })

    const { nombre_archivo, mime_type, contenido_base64 } = req.body || {}
    if (!nombre_archivo)   return res.status(400).json({ error: 'Falta nombre_archivo' })
    if (!contenido_base64) return res.status(400).json({ error: 'Falta contenido_base64' })

    const tipo = tipoDeDocumento(mime_type)
    if (!tipo) return res.status(400).json({ error: 'Formato no permitido — usa PDF, Excel, Word o imagen' })

    // Acepta data URL ("data:application/pdf;base64,AAA...") o base64 pelado.
    const limpio = String(contenido_base64).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '')

    // Buffer.from() no falla con basura: descarta lo que no pueda decodificar y
    // devuelve un buffer corto. Se valida con el round-trip, si no entrarían
    // documentos corruptos que recién fallan al descargarlos.
    const buf = Buffer.from(limpio, 'base64')
    const sinPad = (x) => x.replace(/=+$/, '')
    if (!buf.length || sinPad(buf.toString('base64')) !== sinPad(limpio)) {
      return res.status(400).json({ error: 'contenido_base64 no es base64 válido' })
    }
    if (buf.length > 20 * 1024 * 1024) {
      return res.status(400).json({ error: `El archivo pesa ${(buf.length / 1048576).toFixed(1)} MB y el máximo son 20 MB` })
    }

    const categoria = CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : null

    const id = uuidv4()
    db.prepare(`INSERT INTO documentos_adjuntos
      (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por, categoria)
      VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(id, entidad, entidadId, tipo, nombre_archivo, mime_type, limpio, req.user?.id || null, categoria)

    res.status(201).json({
      ...publicRow(db.prepare('SELECT * FROM documentos_adjuntos WHERE id = ?').get(id)),
      bytes: buf.length,
    })
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

module.exports = { listar, subir, subirJson, descargar, eliminar }
