const { db, uuidv4 } = require('../../config/database')

function insertCaja(tipo, categoria, descripcion, monto, fecha_pago, estado, origen_tabla, origen_id) {
  try {
    const hoy = new Date().toISOString().split('T')[0]
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, origen_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(tipo, categoria, descripcion, monto, hoy, fecha_pago || hoy, estado, origen_tabla, origen_id)
  } catch (_) {}
}

const getFacturas = (req, res) => {
  try {
    const { estado, segmento, cliente_id } = req.query
    let sql = 'SELECT * FROM facturas_cxc'
    const params = []
    const where = []
    if (estado) { where.push('estado = ?'); params.push(estado) }
    if (segmento) { where.push('segmento = ?'); params.push(segmento) }
    if (cliente_id) { where.push('cliente_id = ?'); params.push(cliente_id) }
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

// Cuentas corrientes de clientes — a diferencia de getFacturas (que lee de
// facturas_cxc, tabla que solo se llena vía crearFactura manual y en la
// práctica queda casi vacía), esto agrega directo desde `ventas`, que es el
// registro real de cada venta emitida. Solo devuelve clientes activos que
// tienen al menos un movimiento (venta no anulada) — nunca el listado
// completo de clientes — y admite filtro por nombre/rut, segmento y rango
// de fechas (aplicado sobre v.fecha, la fecha de la venta).
const getCuentasCorrientes = (req, res) => {
  try {
    const { q, segmento, desde, hasta } = req.query
    let sql = `
      SELECT c.id as cliente_id, c.razon_social as nombre, c.rut, c.dv, c.segmento,
             c.telefono, c.celular, c.email,
             COUNT(v.id) as num_compras,
             COALESCE(SUM(v.total),0) as total_comprado,
             COALESCE(SUM(CASE WHEN v.estado='Pagado' THEN v.total ELSE 0 END),0) as total_pagado,
             COALESCE(SUM(CASE WHEN v.estado='Pendiente' THEN v.total ELSE 0 END),0) as saldo_pendiente,
             MAX(v.fecha) as ultima_compra
      FROM clientes c
      JOIN ventas v ON v.cliente_id = c.id AND v.estado != 'Anulado'
      WHERE c.activo = 1`
    const params = []
    if (desde)     { sql += ' AND v.fecha >= ?';   params.push(desde) }
    if (hasta)     { sql += ' AND v.fecha <= ?';   params.push(hasta) }
    if (segmento)  { sql += ' AND c.segmento = ?'; params.push(segmento) }
    if (q)         { sql += ' AND (c.razon_social LIKE ? OR c.rut LIKE ?)'; params.push(`%${q}%`, `%${q}%`) }
    sql += ' GROUP BY c.id ORDER BY ultima_compra DESC'
    const rows = db.prepare(sql).all(...params).map(r => ({
      ...r,
      rut_formateado: r.rut ? (r.dv ? `${r.rut}-${r.dv}` : r.rut) : null,
    }))
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
    db.prepare(`
      UPDATE caja_movimientos SET estado = 'confirmado', fecha_pago = ?
      WHERE origen_tabla = 'facturas_cxc' AND origen_id = ?
    `).run(fecha_cobro, req.params.id)
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
    insertCaja('ingreso', 'venta', `CxC ${numero} — ${cliente || ''}`, monto,
      fecha_vencimiento || fecha_emision, 'proyectado', 'facturas_cxc', id)
    res.status(201).json(db.prepare('SELECT * FROM facturas_cxc WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// Ventas que requieren atención de CxC: las que están "en_validacion_pago"
// (comprobante subido, esperando que un gerente confirme que el depósito
// realmente llegó a la cuenta corriente — ver ventasController.validarPago) y
// las ventas a crédito aún no pagadas. A diferencia de getFacturas (que lee
// facturas_cxc, tabla que solo se llena manual y en la práctica queda casi
// vacía), esto lee directo de `ventas`, el registro real de cada venta.
const getVentasPendientes = (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, numero_documento, cliente_nombre, cliente_id, total, fecha, forma_pago, estado, motivo_rechazo_pago
      FROM ventas
      WHERE estado = 'en_validacion_pago'
         OR (estado = 'Pendiente' AND forma_pago LIKE 'Crédito%')
      ORDER BY CASE estado WHEN 'en_validacion_pago' THEN 0 ELSE 1 END, fecha ASC
    `).all()

    const getComprobante = db.prepare(`
      SELECT id, nombre_archivo FROM documentos_adjuntos
      WHERE entidad = 'venta' AND entidad_id = ? AND categoria = 'comprobante_pago'
      ORDER BY created_at DESC LIMIT 1
    `)

    const hoy = new Date()
    const out = rows.map(v => {
      const diasCredito = v.forma_pago === 'Crédito 30 días' ? 30
        : v.forma_pago === 'Crédito 60 días' ? 60
        : v.forma_pago === 'Crédito 90 días' ? 90
        : null
      let fecha_vencimiento = null, dias_vencida = null
      if (diasCredito) {
        const venc = new Date(v.fecha)
        venc.setDate(venc.getDate() + diasCredito)
        fecha_vencimiento = venc.toISOString().split('T')[0]
        dias_vencida = Math.round((hoy - venc) / (1000 * 60 * 60 * 24))
      }
      const tipo = v.estado === 'en_validacion_pago' ? 'validacion' : 'credito'
      const comprobante = tipo === 'validacion' ? getComprobante.get(v.id) : null
      return {
        ...v, tipo, fecha_vencimiento, dias_vencida,
        comprobante_id: comprobante?.id || null,
        comprobante_nombre: comprobante?.nombre_archivo || null,
      }
    })
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getFacturas, getResumen, marcarCobrada, crearFactura, getCuentasCorrientes, getVentasPendientes }
