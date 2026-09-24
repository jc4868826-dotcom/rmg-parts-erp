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


// ── Cartera real por cobrar (2026-09-24) ─────────────────────────────────────
// Antes los KPIs y la tabla de facturas leían `facturas_cxc`, una tabla que solo
// se llena con crearFactura manual y que en la práctica está vacía: por eso el
// tablero mostraba $0 aunque hubiera ventas por cobrar. Ahora la cartera se
// arma desde `ventas`, que es el registro real: toda venta no pagada que ya
// está facturada, o que es a crédito, es cuenta por cobrar.
const DIAS_CREDITO = { 'Crédito 30 días': 30, 'Crédito 60 días': 60, 'Crédito 90 días': 90 }

function carteraPorCobrar() {
  const rows = db.prepare(`
    SELECT v.id, v.numero_documento, v.numero_factura, v.fecha, v.fecha_factura, v.total,
           v.forma_pago, v.estado, v.estado_facturacion, v.cliente_id,
           COALESCE(NULLIF(TRIM(v.cliente_nombre), ''), c.razon_social, c.contacto_nombre, '—') AS cliente,
           c.segmento
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE v.estado IN ('Pendiente', 'en_validacion_pago')
       AND COALESCE(v.estado_facturacion, '') != 'por_facturar'
       AND (COALESCE(v.estado_facturacion, '') = 'facturada' OR v.forma_pago LIKE 'Crédito%')
  `).all()

  const hoy = new Date()
  return rows.map(v => {
    const dias = DIAS_CREDITO[v.forma_pago] || 0
    const base = v.fecha_factura || v.fecha
    const venc = new Date(base)
    venc.setDate(venc.getDate() + dias)
    const fecha_vencimiento = venc.toISOString().split('T')[0]
    const dias_vencida = Math.round((hoy - venc) / (1000 * 60 * 60 * 24))
    const estado = dias_vencida > 30 ? 'critica' : dias_vencida > 0 ? 'vencida' : 'al_dia'
    return {
      id: v.id,
      venta_id: v.id,
      numero: v.numero_factura ? `F-${v.numero_factura}` : v.numero_documento,
      numero_factura: v.numero_factura,
      cliente: v.cliente,
      cliente_id: v.cliente_id,
      segmento: v.segmento,
      neto: v.total,
      monto: Math.round(Number(v.total) * 1.19),  // la cartera se sigue en monto con IVA
      fecha_emision: v.fecha_factura || v.fecha,
      fecha_vencimiento,
      dias_vencida,
      estado,
      en_validacion: v.estado === 'en_validacion_pago',
      origen: 'venta',
    }
  })
}

const getFacturas = (req, res) => {
  try {
    const { estado, segmento, cliente_id } = req.query
    const hoy = new Date()

    // Facturas cargadas a mano (histórico), si las hay.
    const manuales = db.prepare('SELECT * FROM facturas_cxc').all().map(f => ({
      ...f, origen: 'factura',
      dias_vencida: Math.round((hoy - new Date(f.fecha_vencimiento)) / (1000 * 60 * 60 * 24)),
    })).filter(f => f.estado !== 'cobrada')

    let rows = [...carteraPorCobrar(), ...manuales]
    if (estado)     rows = rows.filter(r => r.estado === estado)
    if (segmento)   rows = rows.filter(r => r.segmento === segmento)
    if (cliente_id) rows = rows.filter(r => String(r.cliente_id) === String(cliente_id))
    rows.sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)))
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
    const manuales = db.prepare('SELECT * FROM facturas_cxc').all()
      .filter(f => f.estado !== 'cobrada')
      .map(f => ({ ...f, dias_vencida: Math.round((hoy - new Date(f.fecha_vencimiento)) / (1000 * 60 * 60 * 24)) }))
    const cartera = [...carteraPorCobrar(), ...manuales]

    const suma = (fn) => cartera.filter(fn).reduce((s, f) => s + (Number(f.monto) || 0), 0)
    res.json({
      total:   suma(() => true),
      al_dia:  suma(f => f.dias_vencida <= 0),
      vencida: suma(f => f.dias_vencida > 0 && f.dias_vencida <= 30),
      critica: suma(f => f.dias_vencida > 30),
      count:   cartera.length,
      neto:    cartera.reduce((s, f) => s + (Number(f.neto ?? Math.round((f.monto || 0) / 1.19)) || 0), 0),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const marcarCobrada = (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM facturas_cxc WHERE id = ?').get(req.params.id)
    // La cartera se arma desde `ventas`, así que el id puede ser el de una venta.
    // Marcar cobrada es del gerente (2026-09-22).
    if (!f) {
      const venta = db.prepare('SELECT * FROM ventas WHERE id = ?').get(req.params.id)
      if (!venta) return res.status(404).json({ error: 'Documento no encontrado' })
      if (req.user?.rol !== 'gerente') {
        return res.status(403).json({ error: 'Solo el gerente puede marcar una venta como cobrada' })
      }
      const fechaCobro = new Date().toISOString().split('T')[0]
      const doCobrar = db.transaction(() => {
        db.prepare("UPDATE ventas SET estado = 'Pagado', fecha_pago = ?, motivo_rechazo_pago = NULL WHERE id = ?")
          .run(fechaCobro, venta.id)
        insertCaja('ingreso', 'venta', `Cobro ${venta.numero_documento} — ${venta.cliente_nombre || ''}`,
          Math.round(Number(venta.total) * 1.19), fechaCobro, 'confirmado', 'ventas', venta.id)
      })
      doCobrar()
      return res.json(db.prepare('SELECT * FROM ventas WHERE id = ?').get(venta.id))
    }
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
      SELECT id, numero_documento, cliente_nombre, cliente_id, total, fecha, forma_pago, estado, motivo_rechazo_pago,
             estado_facturacion, numero_factura, fecha_factura
      FROM ventas
      WHERE estado = 'en_validacion_pago'
         OR (estado = 'Pendiente' AND COALESCE(estado_facturacion, '') != 'por_facturar'
             AND (forma_pago LIKE 'Crédito%' OR estado_facturacion = 'facturada'))
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
      // 'facturada': facturada sin datos de pago aún (2026-09-22) — cae acá hasta que se pague.
      const tipo = v.estado === 'en_validacion_pago' ? 'validacion'
        : (String(v.forma_pago || '').startsWith('Crédito') ? 'credito' : 'facturada')
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
