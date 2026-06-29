const { db, uuidv4 } = require('../../config/database')

const ETAPAS = ['prospecto', 'contactado', 'cotizado', 'negociando', 'cliente']

const getBoard = (_req, res) => {
  try {
    const board = {}
    for (const etapa of ETAPAS) {
      board[etapa] = db.prepare('SELECT * FROM clientes WHERE etapa_pipeline = ? AND activo = 1').all(etapa)
    }
    res.json(board)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getStats = (_req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as n FROM clientes WHERE activo = 1').get().n
    const por_etapa = ETAPAS.map(etapa => ({
      etapa,
      count: db.prepare('SELECT COUNT(*) as n FROM clientes WHERE etapa_pipeline = ? AND activo = 1').get(etapa).n,
    }))
    const clientes = db.prepare("SELECT COUNT(*) as n FROM clientes WHERE etapa_pipeline = 'cliente' AND activo = 1").get().n
    const tasa_conversion = total > 0 ? Math.round((clientes / total) * 1000) / 10 : 0
    res.json({ total, por_etapa, tasa_conversion })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getVencimientos = (_req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM clientes WHERE etapa_pipeline IN ('prospecto','contactado') AND activo = 1"
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const create = (req, res) => {
  try {
    const { razon_social, segmento, contacto_nombre, telefono, whatsapp, email,
            direccion, comuna, notas } = req.body
    const id = uuidv4()
    db.prepare(`INSERT INTO clientes
      (id,razon_social,segmento,etapa_pipeline,contacto_nombre,telefono,whatsapp,email,direccion,comuna,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, razon_social, segmento || 'taller', 'prospecto',
      contacto_nombre || null, telefono || null, whatsapp || null,
      email || null, direccion || null, comuna || null, notas || null)
    res.status(201).json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const cambiarEtapa = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' })
    db.prepare("UPDATE clientes SET etapa_pipeline = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.body.etapa, req.params.id)
    res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const registrarActividad = (req, res) => {
  try {
    const { tipo, descripcion, resultado, proxima_accion, fecha_proxima } = req.body
    const id = uuidv4()
    db.prepare(`INSERT INTO actividades_pipeline
      (id,cliente_id,tipo,descripcion,resultado,proxima_accion,fecha_proxima)
      VALUES (?,?,?,?,?,?,?)`
    ).run(id, req.params.id, tipo, descripcion || null, resultado || null,
      proxima_accion || null, fecha_proxima || null)
    res.status(201).json(db.prepare('SELECT * FROM actividades_pipeline WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getActividades = (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM actividades_pipeline WHERE cliente_id = ? ORDER BY created_at DESC'
    ).all(req.params.id)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const convertirACliente = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Cliente no encontrado' })
    db.prepare("UPDATE clientes SET etapa_pipeline = 'cliente', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id)
    res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getBoard, getStats, getVencimientos, create, cambiarEtapa, registrarActividad, getActividades, convertirACliente }
