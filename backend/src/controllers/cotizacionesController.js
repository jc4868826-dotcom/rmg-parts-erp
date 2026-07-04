const { db, uuidv4 } = require('../../config/database')

const withItems = (cot) => {
  if (!cot) return null
  const items = db.prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ?').all(cot.id)
  return { ...cot, items }
}

const getAll = (req, res) => {
  try {
    const { estado } = req.query
    let sql = 'SELECT * FROM cotizaciones'
    const params = []
    if (estado) { sql += ' WHERE estado = ?'; params.push(estado) }
    sql += ' ORDER BY created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOne = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM cotizaciones WHERE id = ? OR numero = ?').get(req.params.id, req.params.id)
    if (!c) return res.status(404).json({ error: 'Cotización no encontrada' })
    res.json(withItems(c))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const _insertCotizacion = (body, extra = {}) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM cotizaciones').get().n
  const numero = extra.numero || `COT-2026-${String(count + 1).padStart(3, '0')}`
  const id = uuidv4()
  const { cliente_id, cliente, estado, condicion_pago, canal_origen, notas,
          neto, iva, total, items } = { ...body, ...extra }

  db.prepare(`INSERT INTO cotizaciones
    (id,numero,cliente_id,cliente,estado,neto,iva,total,condicion_pago,canal_origen,notas)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, numero, cliente_id || null, cliente || null, estado || 'borrador',
    neto || 0, iva || 0, total || 0,
    condicion_pago || 'Contado', canal_origen || null, notas || null)

  if (Array.isArray(items)) {
    const ins = db.prepare(`INSERT INTO cotizacion_items
      (id,cotizacion_id,codigo,descripcion,cantidad,precio_unitario,descuento_pct,subtotal)
      VALUES (?,?,?,?,?,?,?,?)`)
    for (const item of items) {
      const sub = item.subtotal || Math.round(item.cantidad * item.precio_unitario * (1 - (item.descuento_pct || 0) / 100))
      ins.run(uuidv4(), id, item.codigo || null, item.descripcion || null,
        item.cantidad, item.precio_unitario, item.descuento_pct || 0, sub)
    }
  }
  return db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(id)
}

const create = (req, res) => {
  try {
    const cot = _insertCotizacion(req.body)
    res.status(201).json(withItems(cot))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const createPublica = (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM cotizaciones').get().n
    const cot = _insertCotizacion(req.body, { numero: `COT-2026-PUB-${count + 1}` })
    res.status(201).json(withItems(cot))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const update = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Cotización no encontrada' })
    const fields = Object.keys(req.body).filter(k => k !== 'id' && k !== 'numero' && k !== 'items')
    if (fields.length) {
      const set = fields.map(f => `${f} = ?`).join(', ')
      db.prepare(`UPDATE cotizaciones SET ${set}, updated_at = datetime('now') WHERE id = ?`)
        .run(...fields.map(f => req.body[f]), req.params.id)
    }
    if (Array.isArray(req.body.items)) {
      db.prepare('DELETE FROM cotizacion_items WHERE cotizacion_id = ?').run(req.params.id)
      const ins = db.prepare(`INSERT INTO cotizacion_items
        (id,cotizacion_id,codigo,descripcion,cantidad,precio_unitario,descuento_pct,subtotal)
        VALUES (?,?,?,?,?,?,?,?)`)
      for (const item of req.body.items) {
        const sub = item.subtotal || Math.round(item.cantidad * item.precio_unitario * (1 - (item.descuento_pct || 0) / 100))
        ins.run(uuidv4(), req.params.id, item.codigo || null, item.descripcion || null,
          item.cantidad, item.precio_unitario, item.descuento_pct || 0, sub)
      }
    }
    res.json(withItems(db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const aprobar = (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Cotización no encontrada' })
    db.prepare("UPDATE cotizaciones SET estado = 'aprobada', aprobada_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id)
    res.json(withItems(db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const generarPDF = (req, res) => res.json({ ok: true, pdf_url: `/pdfs/${req.params.id}.pdf` })
const enviarWhatsApp = (_req, res) => res.json({ ok: true, message: 'Mensaje enviado' })
const enviarEmail = (_req, res) => res.json({ ok: true, message: 'Email enviado' })

const createDesdeLanding = (req, res) => {
  try {
    const { cliente: clienteData, lineas } = req.body

    if (!clienteData || !clienteData.nombre) {
      return res.status(400).json({ error: 'Se requiere cliente.nombre' })
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una línea de producto' })
    }

    // 1. Upsert cliente
    let clienteId = null
    let existente = null
    if (clienteData.rut) {
      existente = db.prepare('SELECT id FROM clientes WHERE rut = ?').get(clienteData.rut)
    }
    if (!existente && clienteData.email) {
      existente = db.prepare('SELECT id FROM clientes WHERE email = ? AND activo = 1').get(clienteData.email)
    }
    if (existente) {
      clienteId = existente.id
    } else {
      clienteId = uuidv4()
      db.prepare(`INSERT INTO clientes
        (id, razon_social, rut, segmento, etapa_pipeline, contacto_nombre, telefono, email)
        VALUES (?, ?, ?, 'taller', 'prospecto', ?, ?, ?)`)
        .run(clienteId, clienteData.nombre, clienteData.rut || null,
             clienteData.nombre, clienteData.telefono || null, clienteData.email || null)
    }

    // 2. Calcular totales desde las líneas
    const items = lineas.map(l => ({
      codigo:          l.codigo_sku,
      descripcion:     l.descripcion || l.codigo_sku,
      cantidad:        Number(l.cantidad) || 1,
      precio_unitario: Number(l.precio_venta_neto) || 0,
      descuento_pct:   0,
      subtotal:        Math.round((Number(l.cantidad) || 1) * (Number(l.precio_venta_neto) || 0))
    }))
    const neto  = items.reduce((a, b) => a + b.subtotal, 0)
    const iva   = Math.round(neto * 0.19)
    const total = neto + iva

    // 3. Número único para landing
    const count = db.prepare('SELECT COUNT(*) as n FROM cotizaciones').get().n
    const numero = `COT-2026-L${String(count + 1).padStart(3, '0')}`

    // 4. Crear cotización (canal_origen = 'landing')
    const cot = _insertCotizacion({
      cliente_id:   clienteId,
      cliente:      clienteData.nombre,
      estado:       'enviada',
      canal_origen: 'landing',
      neto, iva, total, items
    }, { numero })

    res.status(201).json({
      cotizacion_id: cot.id,
      numero:        cot.numero,
      total:         cot.total
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getAll, getOne, create, createPublica, createDesdeLanding, update, aprobar, generarPDF, enviarWhatsApp, enviarEmail }
