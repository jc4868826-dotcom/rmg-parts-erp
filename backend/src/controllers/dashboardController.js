'use strict'
const { db } = require('../../config/database')

function getDateRange(periodo, desde, hasta) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  switch (periodo) {
    case 'hoy': return [today, today]
    case 'semana': {
      const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      return [d.toISOString().split('T')[0], today]
    }
    case 'mes': return [`${today.slice(0, 7)}-01`, today]
    case 'mes_anterior': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      return [first.toISOString().split('T')[0], last.toISOString().split('T')[0]]
    }
    case 'personalizado': return [desde || today, hasta || today]
    default: return [`${today.slice(0, 7)}-01`, today]
  }
}

const getResumen = (req, res) => {
  try {
    const { periodo = 'mes', segmento = 'todos', desde, hasta } = req.query
    const [dateFrom, dateTo] = getDateRange(periodo, desde, hasta)

    // ── Métricas de tabla ─────────────────────────────────
    const clientesActivos = db.prepare("SELECT COUNT(*) as n FROM clientes WHERE activo=1").get().n
    const pipelineActivo  = db.prepare("SELECT COUNT(*) as n FROM pipeline_contactos WHERE etapa NOT IN ('ganado','cliente')").get().n
    const cotPendientes   = db.prepare("SELECT COUNT(*) as n FROM cotizaciones WHERE estado IN ('borrador','enviada')").get().n

    // ── Meta desde configuracion_mensual ─────────────────
    const mesActual = new Date().toISOString().slice(0, 7)
    const cfg = db.prepare('SELECT * FROM configuracion_mensual WHERE mes = ?').get(mesActual) || {}
    const metaMap = {
      todos:          cfg.meta_venta_total            || 20000000,
      talleres:       cfg.meta_talleres               || 8000000,
      flotas:         cfg.meta_flotas                 || 6000000,
      concesionarios: cfg.meta_concesionarios         || 4000000,
      construccion:   cfg.meta_construccion           || 2000000,
    }
    const meta = metaMap[segmento] || metaMap.todos

    // ── Ventas reales (notas_venta pagadas) ──────────────
    let ventaSQL = `
      SELECT COALESCE(SUM(nv.total),0) as total_bruto,
             COALESCE(SUM(nv.neto),0)  as total_neto
      FROM notas_venta nv
      WHERE nv.estado_pago = 'pagado'
        AND nv.fecha_pago >= ? AND nv.fecha_pago <= ?`
    const ventaParams = [dateFrom, dateTo]

    if (segmento !== 'todos') {
      ventaSQL += ` AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = nv.cliente_id AND c.segmento = ?)`
      ventaParams.push(segmento)
    }
    const ventaData = db.prepare(ventaSQL).get(...ventaParams)
    const venta = ventaData.total_bruto
    const neto  = ventaData.total_neto

    // ── Saldo inicial (confirmados ANTES del rango) ──────
    const saldoInicial = db.prepare(`
      SELECT COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE -monto END),0) as saldo
      FROM caja_movimientos
      WHERE estado='confirmado' AND fecha_pago < ?
    `).get(dateFrom).saldo

    // ── Gastos reales (caja confirmados en rango) ────────
    const totalGastosConf = db.prepare(`
      SELECT COALESCE(SUM(monto),0) as total FROM caja_movimientos
      WHERE tipo='egreso' AND estado='confirmado' AND fecha_pago>=? AND fecha_pago<=?
    `).get(dateFrom, dateTo).total

    const totalIngresosConf = db.prepare(`
      SELECT COALESCE(SUM(monto),0) as total FROM caja_movimientos
      WHERE tipo='ingreso' AND estado='confirmado' AND fecha_pago>=? AND fecha_pago<=?
    `).get(dateFrom, dateTo).total

    const ingresosProy = db.prepare(`
      SELECT COALESCE(SUM(monto),0) as total FROM caja_movimientos
      WHERE tipo='ingreso' AND estado='proyectado' AND fecha_pago>=? AND fecha_pago<=?
    `).get(dateFrom, dateTo).total

    const egresosProy = db.prepare(`
      SELECT COALESCE(SUM(monto),0) as total FROM caja_movimientos
      WHERE tipo='egreso' AND estado='proyectado' AND fecha_pago>=? AND fecha_pago<=?
    `).get(dateFrom, dateTo).total

    const saldoPeriodo   = saldoInicial + totalIngresosConf - totalGastosConf
    const saldoProyectado = saldoPeriodo + ingresosProy - egresosProy

    // ── Margen bruto (notas_venta: neto vs costo) ───────
    // Calculamos desde nota_venta_items × lista_precios si existen
    const margenQuery = db.prepare(`
      SELECT COALESCE(SUM(nvi.subtotal),0) as venta_neto,
             COALESCE(SUM(nvi.cantidad * COALESCE(lp.costo_unidad_neto,0)),0) as costo_total
      FROM nota_venta_items nvi
      JOIN notas_venta nv ON nv.id = nvi.nota_venta_id
      LEFT JOIN lista_precios lp ON lp.codigo_sku = nvi.codigo
      WHERE nv.estado_pago='pagado' AND nv.fecha_pago>=? AND nv.fecha_pago<=?
    `).get(dateFrom, dateTo)
    const margenBrutoMonto = margenQuery.venta_neto - margenQuery.costo_total
    const margenBrutoPct   = neto > 0 ? (margenBrutoMonto / neto * 100) : 0

    // ── Ventas por segmento ──────────────────────────────
    const segs = ['talleres','flotas','concesionarios','construccion'].map(seg => {
      const r = db.prepare(`
        SELECT COALESCE(SUM(nv.total),0) as actual FROM notas_venta nv
        WHERE nv.estado_pago='pagado' AND nv.fecha_pago>=? AND nv.fecha_pago<=?
          AND EXISTS (SELECT 1 FROM clientes c WHERE c.id=nv.cliente_id AND c.segmento=?)
      `).get(dateFrom, dateTo, seg)
      return { segmento: seg, actual: r.actual, meta: metaMap[seg] }
    })

    // ── Ventas por semana (para gráfico) ────────────────
    const ventasSemana = db.prepare(`
      SELECT strftime('%Y-W%W', fecha_pago) as semana_key,
             MIN(fecha_pago) as fecha_ref,
             COALESCE(SUM(CASE tipo WHEN 'ingreso' THEN monto ELSE 0 END),0) as ingresos,
             COALESCE(SUM(CASE tipo WHEN 'egreso'  THEN monto ELSE 0 END),0) as egresos
      FROM caja_movimientos
      WHERE fecha_pago>=? AND fecha_pago<=?
      GROUP BY semana_key ORDER BY semana_key
    `).all(dateFrom, dateTo).map(r => ({
      semana: `S${r.semana_key.split('-W')[1]}`,
      Ingresos: r.ingresos,
      Egresos:  r.egresos,
    }))

    // ── Lista de clientes reales ─────────────────────────
    let clientesSQL = `
      SELECT c.razon_social as nombre, c.segmento,
             MAX(nv.fecha_pago) as ultima,
             COALESCE(SUM(nv.total),0) as monto
      FROM clientes c
      LEFT JOIN notas_venta nv ON nv.cliente_id=c.id AND nv.estado_pago='pagado'
        AND nv.fecha_pago>=? AND nv.fecha_pago<=?
      WHERE c.activo=1`
    const clParams = [dateFrom, dateTo]
    if (segmento !== 'todos') { clientesSQL += ' AND c.segmento=?'; clParams.push(segmento) }
    clientesSQL += ' GROUP BY c.id ORDER BY monto DESC LIMIT 8'
    const clientesList = db.prepare(clientesSQL).all(...clParams)

    // ── CxC real ─────────────────────────────────────────
    const cxcRows = db.prepare(`
      SELECT nv.cliente as nombre, nv.numero, nv.total as monto, nv.fecha_pago,
             CAST(julianday('now') - julianday(COALESCE(nv.fecha_pago, nv.created_at)) AS INTEGER) as dias_desde
      FROM notas_venta nv
      WHERE nv.estado_pago = 'pendiente'
      ORDER BY dias_desde DESC LIMIT 10
    `).all()

    res.json({
      dateFrom, dateTo,
      venta_total: venta, meta,
      pct_meta: meta > 0 ? Math.round((venta / meta) * 100) : 0,
      clientes_activos: clientesActivos,
      pipeline_activo:  pipelineActivo,
      cotizaciones_pendientes: cotPendientes,
      margen_bruto_pct:   parseFloat(margenBrutoPct.toFixed(1)),
      margen_bruto_monto: margenBrutoMonto,
      costo_mercaderia:   margenQuery.costo_total,
      total_gastos: totalGastosConf,
      utilidad_neta: margenBrutoMonto - totalGastosConf,
      saldo_inicial: saldoInicial,
      saldo_periodo: saldoPeriodo,
      ingresos_proyectados: ingresosProy,
      egresos_proyectados:  egresosProy,
      saldo_proyectado: saldoProyectado,
      ventas_por_segmento: segs,
      ventas_semana: ventasSemana,
      clientes_list: clientesList,
      cxc_rows: cxcRows,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getVentas = (_req, res) => res.json({ por_segmento: [], por_semana: [] })
const getProductos = (_req, res) => res.json([])
const getClientes = (_req, res) => res.json({ total: 0, activos: 0, pipeline: [] })
const getCaja = (_req, res) => res.json({ ingresos_mes: 0, cxc_pendiente: 0, cxc_vencida: 0, proyeccion_mes: 0 })
const getAlertas = (_req, res) => res.json([])
const exportExcel = (_req, res) => res.json({ ok: true })

module.exports = { getResumen, getVentas, getProductos, getClientes, getCaja, getAlertas, exportExcel }
