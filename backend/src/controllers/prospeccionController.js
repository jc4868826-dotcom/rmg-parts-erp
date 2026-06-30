const { db, uuidv4 } = require('../../config/database')

const ETAPAS_VALIDAS  = ['prospecto', 'contacto', 'visita', 'propuesta', 'cliente']
const ESTADOS_VALIDOS = ['activo', 'descartado']

// Mapea segmentos de pipeline_contactos al CHECK constraint de clientes
// clientes.segmento IN ('taller','flota','concesionario','construccion')
const SEGMENTO_MAP = {
  taller:        'taller',
  flota:         'flota',
  concesionario: 'concesionario',
  construccion:  'construccion',
  rentacar:      'flota',   // rentacar no existe en clientes → flota
}

// GET /api/prospeccion
// Query params: segmento, prioridad, region, etapa (default: 'prospecto'), estado (default: 'activo'), q
const list = (req, res) => {
  try {
    const {
      segmento,
      prioridad,
      region,
      etapa    = 'prospecto',
      estado   = 'activo',
      q,
    } = req.query

    const conditions = []
    const params     = []

    conditions.push('etapa = ?')
    params.push(etapa)

    conditions.push('estado = ?')
    params.push(estado)

    if (segmento) {
      conditions.push('segmento = ?')
      params.push(segmento)
    }

    if (prioridad) {
      conditions.push('prioridad = ?')
      params.push(prioridad)
    }

    if (region) {
      conditions.push('region = ?')
      params.push(region)
    }

    if (q) {
      const term = `%${q}%`
      conditions.push(
        '(empresa LIKE ? OR nombre_contacto LIKE ? OR notas LIKE ? OR rubro_especialidad LIKE ?)'
      )
      params.push(term, term, term, term)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = db.prepare(`
      SELECT *
      FROM pipeline_contactos
      ${where}
      ORDER BY
        CASE prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
        empresa ASC
    `).all(...params)

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/prospeccion/stats
// Returns { total_activos, por_segmento: [{segmento, count}] }
const getStats = (_req, res) => {
  try {
    const total_activos = db.prepare(
      "SELECT COUNT(*) as n FROM pipeline_contactos WHERE etapa = 'prospecto' AND estado = 'activo'"
    ).get().n

    const por_segmento = db.prepare(
      "SELECT segmento, COUNT(*) as count FROM pipeline_contactos WHERE etapa = 'prospecto' AND estado = 'activo' GROUP BY segmento ORDER BY segmento"
    ).all()

    res.json({ total_activos, por_segmento })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PATCH /api/prospeccion/:id/etapa
// Body: { etapa }
const cambiarEtapa = (req, res) => {
  try {
    const { etapa } = req.body
    if (!etapa || !ETAPAS_VALIDAS.includes(etapa)) {
      return res.status(400).json({
        error: `etapa inválida. Valores permitidos: ${ETAPAS_VALIDAS.join(', ')}`,
      })
    }

    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })

    db.prepare(`
      UPDATE pipeline_contactos
      SET etapa = ?, fecha_ultima_actualizacion = datetime('now')
      WHERE id = ?
    `).run(etapa, req.params.id)

    res.json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PATCH /api/prospeccion/:id/descartar
// Sets estado = 'descartado'
const descartar = (req, res) => {
  try {
    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })

    db.prepare(`
      UPDATE pipeline_contactos
      SET estado = 'descartado', fecha_ultima_actualizacion = datetime('now')
      WHERE id = ?
    `).run(req.params.id)

    res.json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/prospeccion/:id/mover-a-contacto
// 1. Actualiza pipeline_contactos.etapa = 'contacto'
// 2. Crea (o reutiliza) un registro en clientes con etapa_pipeline = 'contactado'
const moverAContacto = (req, res) => {
  try {
    const registro = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!registro) return res.status(404).json({ error: 'Prospecto no encontrado' })

    // Mapear segmento al valor válido para clientes
    const segmentoCliente = SEGMENTO_MAP[registro.segmento] || 'flota'

    let cliente_id

    const ejecutar = db.transaction(() => {
      // Actualizar etapa en pipeline_contactos
      db.prepare(`
        UPDATE pipeline_contactos
        SET etapa = 'contacto', fecha_ultima_actualizacion = datetime('now')
        WHERE id = ?
      `).run(registro.id)

      // Intentar insertar en clientes (INSERT OR IGNORE evita duplicados si se llama dos veces)
      cliente_id = uuidv4()
      db.prepare(`
        INSERT OR IGNORE INTO clientes
          (id, razon_social, segmento, etapa_pipeline,
           contacto_nombre, cargo, telefono, whatsapp, email,
           direccion, comuna, notas, activo)
        VALUES (?, ?, ?, 'contactado', ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        cliente_id,
        registro.empresa,
        segmentoCliente,
        registro.nombre_contacto || null,
        registro.cargo            || null,
        registro.telefono_contacto || registro.telefono_empresa || null,
        registro.telefono_contacto || null,
        registro.email            || null,
        registro.direccion        || null,
        registro.comuna           || null,
        registro.notas            || null,
      )

      // Si el INSERT fue ignorado (empresa ya existía), recuperar el id real
      const existente = db.prepare(
        "SELECT id FROM clientes WHERE razon_social = ? AND activo = 1 ORDER BY created_at ASC LIMIT 1"
      ).get(registro.empresa)
      if (existente) cliente_id = existente.id
    })

    ejecutar()

    res.status(201).json({ ok: true, cliente_id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { list, getStats, cambiarEtapa, descartar, moverAContacto }
