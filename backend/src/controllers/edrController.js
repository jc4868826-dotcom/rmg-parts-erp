'use strict'
const { db } = require('../../config/database')

const getEDR = (req, res) => {
  try {
    const { mes } = req.query
    if (!mes) return res.status(400).json({ error: 'Parámetro mes (YYYY-MM) requerido' })
    const filtro = `${mes}%`

    const ingresos = db.prepare("SELECT COALESCE(SUM(total),0) as v FROM ventas WHERE fecha LIKE ?").get(filtro).v
    const costo_mercaderia = db.prepare("SELECT COALESCE(SUM(costo_total),0) as v FROM ventas WHERE fecha LIKE ?").get(filtro).v
    const margen_bruto = ingresos - costo_mercaderia

    const gastos_fijos         = db.prepare("SELECT COALESCE(SUM(monto),0) as v FROM gastos WHERE fecha LIKE ? AND categoria_erp='Fijo'").get(filtro).v
    const gastos_variables      = db.prepare("SELECT COALESCE(SUM(monto),0) as v FROM gastos WHERE fecha LIKE ? AND categoria_erp='Variable'").get(filtro).v
    const gastos_extraordinarios= db.prepare("SELECT COALESCE(SUM(monto),0) as v FROM gastos WHERE fecha LIKE ? AND categoria_erp='Extraordinario'").get(filtro).v
    const total_gastos = gastos_fijos + gastos_variables + gastos_extraordinarios
    const resultado_operacional = margen_bruto - total_gastos

    const cxc_pendiente = db.prepare("SELECT COALESCE(SUM(total),0) as v FROM ventas WHERE fecha LIKE ? AND estado='Pendiente'").get(filtro).v
    const cxp_pendiente = db.prepare("SELECT COALESCE(SUM(total),0) as v FROM compras WHERE fecha LIKE ? AND estado IN ('Pendiente','Recibido')").get(filtro).v

    res.json({
      mes,
      ingresos, costo_mercaderia, margen_bruto,
      gastos_fijos, gastos_variables, gastos_extraordinarios, total_gastos,
      resultado_operacional, cxc_pendiente, cxp_pendiente,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getEDR }
