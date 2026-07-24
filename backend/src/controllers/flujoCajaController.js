'use strict'
const { db, uuidv4 } = require('../../config/database')

const hoy = () => new Date().toISOString().split('T')[0]

// Construye movimientos consolidados para un rango de fechas (o un mes YYYY-MM)
function buildMovimientos(filtroDesde, filtroHasta) {
  const movs = []

  // 1. Ventas
  try {
    const vDate = `CASE forma_pago
      WHEN 'Crédito 30 días' THEN date(fecha,'+30 days')
      WHEN 'Crédito 60 días' THEN date(fecha,'+60 days')
      WHEN 'Crédito 90 días' THEN date(fecha,'+90 days')
      ELSE fecha END`
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'ventas' AS origen_tabla, 'Venta' AS origen_label,
        'ingreso' AS tipo, 'Venta' AS categoria,
        COALESCE(cliente,'Cliente') || ' · ' || COALESCE(numero,'') AS descripcion,
        total AS monto,
        (${vDate}) AS fecha_pago,
        CASE WHEN estado='Pagado' THEN 'confirmado' ELSE 'proyectado' END AS estado,
        NULL AS cuenta_bancaria
      FROM ventas WHERE (${vDate}) >= ? AND (${vDate}) <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 2. Gastos
  try {
    const gcols = db.prepare('PRAGMA table_info(gastos)').all().map(c => c.name)
    const gDate = gcols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha)' : 'fecha'
    const gDesc = gcols.includes('descripcion') ? 'descripcion' : gcols.includes('concepto') ? 'concepto' : "'Gasto'"
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'gastos' AS origen_tabla, 'Gasto' AS origen_label,
        'egreso' AS tipo, COALESCE(categoria,'Gasto') AS categoria,
        ${gDesc} AS descripcion, monto,
        ${gDate} AS fecha_pago,
        CASE WHEN estado='pagado' THEN 'confirmado' ELSE 'proyectado' END AS estado,
        NULL AS cuenta_bancaria
      FROM gastos WHERE ${gDate} >= ? AND ${gDate} <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 3. Compras ERP
  try {
    const ccols = db.prepare('PRAGMA table_info(compras)').all().map(c => c.name)
    const cDate = ccols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha)' : 'fecha'
    const cFac  = ccols.includes('numero_factura') ? "COALESCE(' · Fac.'||numero_factura,'')" : "''"
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'compras' AS origen_tabla, 'Compra' AS origen_label,
        'egreso' AS tipo, 'Compra' AS categoria,
        COALESCE(proveedor,'Proveedor') || ${cFac} AS descripcion,
        total AS monto,
        ${cDate} AS fecha_pago,
        CASE WHEN estado IN ('Pagada','Pagado') THEN 'confirmado' ELSE 'proyectado' END AS estado,
        NULL AS cuenta_bancaria
      FROM compras WHERE ${cDate} >= ? AND ${cDate} <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 4. OC pendientes de pago (pagada=0, estados activos)
  try {
    const occols = db.prepare('PRAGMA table_info(ordenes_compra)').all().map(c => c.name)
    const ocDate = occols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha_emision)' : 'fecha_emision'
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'ordenes_compra' AS origen_tabla, 'OC' AS origen_label,
        'egreso' AS tipo, 'Compra proveedor' AS categoria,
        'OC '||numero||' · '||COALESCE(proveedor,'') AS descripcion,
        total AS monto,
        ${ocDate} AS fecha_pago,
        'proyectado' AS estado,
        NULL AS cuenta_bancaria
      FROM ordenes_compra
      WHERE pagada=0 AND estado NOT IN ('anulada','Rechazada','Pagada')
        AND ${ocDate} >= ? AND ${ocDate} <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  // 5. Movimientos manuales de caja
  try {
    movs.push(...db.prepare(`
      SELECT id AS origen_id, id,
        'manual' AS origen_tabla, 'Manual' AS origen_label,
        tipo, categoria, descripcion, monto, fecha_pago, estado, cuenta_bancaria
      FROM caja_movimientos
      WHERE origen_tabla='manual' AND fecha_pago >= ? AND fecha_pago <= ?
    `).all(filtroDesde, filtroHasta))
  } catch (_) {}

  movs.sort((a, b) => (a.fecha_pago || '').localeCompare(b.fecha_pago || ''))
  return movs
}

// Calcula saldo acumulado desde el inicio de los datos hasta fecha_corte
function calcSaldoAlCorte(fechaCorte) {
  let saldo = 0
  // Ventas confirmadas hasta el corte
  try {
    const vDate = `CASE forma_pago WHEN 'Crédito 30 días' THEN date(fecha,'+30 days') WHEN 'Crédito 60 días' THEN date(fecha,'+60 days') WHEN 'Crédito 90 días' THEN date(fecha,'+90 days') ELSE fecha END`
    const r = db.prepare(`SELECT COALESCE(SUM(total),0) as s FROM ventas WHERE estado='Pagado' AND (${vDate}) <= ?`).get(fechaCorte)
    saldo += r.s
  } catch (_) {}
  // Egresos confirmados hasta el corte (caja_movimientos confirmados)
  try {
    const r = db.prepare(`SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END),0) as s FROM caja_movimientos WHERE estado='confirmado' AND fecha_pago <= ?`).get(fechaCorte)
    saldo += r.s
  } catch (_) {}
  // Gastos pagados hasta el corte
  try {
    const gcols = db.prepare('PRAGMA table_info(gastos)').all().map(c => c.name)
    const gDate = gcols.includes('fecha_vencimiento') ? 'COALESCE(fecha_vencimiento,fecha)' : 'fecha'
    const r = db.prepare(`SELECT COALESCE(SUM(monto),0) as s FROM gastos WHERE estado='pagado' AND ${gDate} <= ?`).get(fechaCorte)
    saldo -= r.s
  } catch (_) {}
  return saldo
}

const getMovimientos = (req, res) => {
  try {
    const today = hoy()

    // Soporte para ?mes=YYYY-MM (retrocompatibilidad) y ?fecha_inicio + ?fecha_fin
    let filtroDesde, filtroHasta
    if (req.query.mes) {
      filtroDesde = `${req.query.mes}-01`
      // último día del mes
      const [y, m] = req.query.mes.split('-').map(Number)
      const last = new Date(y, m, 0)
      filtroHasta = last.toISOString().split('T')[0]
    } else if (req.query.fecha_inicio || req.query.fecha_fin) {
      filtroDesde = req.query.fecha_inicio || '2000-01-01'
      filtroHasta = req.query.fecha_fin    || today
    } else {
      // Sin filtro de fecha: usar mes actual
      const mesActual = today.slice(0, 7)
      filtroDesde = `${mesActual}-01`
      const [y, m] = mesActual.split('-').map(Number)
      const last = new Date(y, m, 0)
      filtroHasta = last.toISOString().split('T')[0]
    }

    const movs = buildMovimientos(filtroDesde, filtroHasta)

    const sum = (fn) => movs.filter(fn).reduce((s, m) => s + (m.monto || 0), 0)
    const ic = sum(m => m.tipo === 'ingreso' && m.estado === 'confirmado')
    const ip = sum(m => m.tipo === 'ingreso' && m.estado === 'proyectado')
    const ec = sum(m => m.tipo === 'egreso'  && m.estado === 'confirmado')
    const ep = sum(m => m.tipo === 'egreso'  && m.estado === 'proyectado')

    const saldo_al_corte = calcSaldoAlCorte(filtroHasta)
    const saldo_actual   = calcSaldoAlCorte(today)

    return res.json({
      movimientos: movs,
      saldo_al_corte,
      saldo_actual,
      total_ingresos_periodo: ic + ip,
      total_egresos_periodo:  ec + ep,
      resumen: {
        ingresos_confirmados: ic, ingresos_proyectados: ip,
        egresos_confirmados:  ec, egresos_proyectados:  ep,
        saldo_real:       ic - ec,
        saldo_proyectado: (ic - ec) + ip - ep,
      },
      periodo: { desde: filtroDesde, hasta: filtroHasta },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getResumen = (_req, res) => {
  try {
    const today = hoy()
    const en30 = new Date(); en30.setDate(en30.getDate() + 30)
    const en30str = en30.toISOString().split('T')[0]

    const saldoActual = db.prepare(`
      SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END), 0) as saldo
      FROM caja_movimientos WHERE estado = 'confirmado' AND fecha_pago <= ?
    `).get(today).saldo

    const ingresosProx30 = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total FROM caja_movimientos
      WHERE tipo = 'ingreso' AND fecha_pago > ? AND fecha_pago <= ?
    `).get(today, en30str).total

    const egresosProx30 = db.prepare(`
      SELECT COALESCE(SUM(monto), 0) as total FROM caja_movimientos
      WHERE tipo = 'egreso' AND fecha_pago > ? AND fecha_pago <= ?
    `).get(today, en30str).total

    res.json({ saldo_actual: saldoActual, ingresos_prox30: ingresosProx30, egresos_prox30: egresosProx30 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const crearManual = (req, res) => {
  try {
    const { tipo, categoria, descripcion, monto, fecha_pago, estado, cuenta_bancaria } = req.body
    if (!tipo || !descripcion || !monto) {
      return res.status(400).json({ error: 'tipo, descripcion y monto son requeridos' })
    }
    if (!['ingreso', 'egreso'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo debe ser ingreso o egreso' })
    }
    db.prepare(`
      INSERT INTO caja_movimientos
        (tipo, categoria, descripcion, monto, fecha_registro, fecha_pago, estado, origen_tabla, cuenta_bancaria)
      VALUES (?,?,?,?,?,?,?,'manual',?)
    `).run(tipo, categoria || null, descripcion, Number(monto),
        hoy(), fecha_pago || hoy(), estado || 'proyectado', cuenta_bancaria || null)
    const nuevo = db.prepare('SELECT * FROM caja_movimientos ORDER BY id DESC LIMIT 1').get()
    res.status(201).json(nuevo)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const actualizar = (req, res) => {
  try {
    const m = db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id)
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' })
    const allowed = ['tipo', 'categoria', 'descripcion', 'monto', 'fecha_pago', 'estado', 'cuenta_bancaria']
    const toUpdate = allowed.filter(f => req.body[f] !== undefined)
    if (!toUpdate.length) return res.json(m)
    const set = toUpdate.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE caja_movimientos SET ${set} WHERE id = ?`)
      .run(...toUpdate.map(f => req.body[f]), req.params.id)
    res.json(db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const eliminar = (req, res) => {
  try {
    const m = db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(req.params.id)
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado' })
    if (m.origen_tabla !== 'manual') {
      return res.status(400).json({ error: 'Solo se pueden eliminar movimientos manuales' })
    }
    db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getMovimientos, getResumen, crearManual, actualizar, eliminar }
