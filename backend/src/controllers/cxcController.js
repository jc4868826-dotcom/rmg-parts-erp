const { db, uuidv4 } = require('../../config/database')

const getFacturas = (req, res) => {
  try {
    const { estado, segmento } = req.query
    let sql = 'SELECT * FROM facturas_cxc'
    const params = []
    const where = []
    if (estado) { where.push('estado = ?'); params.push(estado) }
    if (segmento) { where.push('segmento = ?'); params.push(segmento) }
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY fecha_vencimiento ASC'

    const hoy = new Date()
    const rows = db.prepare(sql).all(...params).map(f => {
      const vence = new Date(f.fecha_vencimiento)
      const dias_vencida = Math.round((hoy - vence) / (1000 * 60 * 60 * 24))
      return { ...f, dias_vencida }
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getResumen = (_req, res) => {
  try {
    const hoy = new Date()
    const facturas = db.prepare('SELECT * FROM facturas_cxc').all().map(f => {
      const vence = new Date(f.fecha_vencimiento)
      return { ...f, dias_vencida: Math.round((hoy - vence) / (1000 * 60 * 60 * 24)) }
    })
    const total   = facturas.reduce((s, f) => s + f.monto, 0)
    const al_dia  = facturas.filter(f => f.dias_vencida <= 0).reduce((s, f) => s + f.monto, 0)
    const vencida = facturas.filter(f => f.dias_vencida > 0 && f.dias_vencida <= 30).reduce((s, f) => s + f.monto, 0)
    const critica = facturas.filter(f => f.dias_vencida > 30).reduce((s, f) => s + f.monto, 0)
    res.json({ total, al_dia, vencida, critica, count: facturas.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const marcarCobrada = (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM facturas_cxc WHERE id = ?').get(req.params.id)
    if (!f) return res.status(404).json({ error: 'Factura no encontrada' })
    const fecha_cobro = new Date().toISOString().split('T')[0]
    db.prepare("UPDATE facturas_cxc SET estado = 'cobrada', fecha_cobro = ? WHERE id = ?")
      .run(fecha_cobro, req.params.id)
    res.json(db.prepare('SELECT * FROM facturas_cxc WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const crearFactura = (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM facturas_cxc').get().n
    const numero = `F-${2000 + count + 1}`
    const id = uuidv4()
    const { pedido_id, cliente_id, cliente, segmento, monto, fecha_vencimiento, notas } = req.body
    const fecha_emision = new Date().toISOString().split('T')[0]
    db.prepare(`INSERT INTO facturas_cxc
      (id,numero,pedido_id,cliente_id,cliente,segmento,monto,fecha_emision,fecha_vencimiento,notas)
      VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(id, numero, pedido_id || null, cliente_id || null, cliente || null,
      segmento || null, monto, fecha_emision, fecha_vencimiento || null, notas || null)
    res.status(201).json(db.prepare('SELECT * FROM facturas_cxc WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getFacturas, getResumen, marcarCobrada, crearFactura }
