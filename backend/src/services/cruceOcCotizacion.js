/**
 * Cruce OC ↔ Cotización (ventas calzadas) — totales de venta vs compra y margen.
 *
 * Una cotización puede tener N OCs (cotizacion_id en ordenes_compra). El margen
 * siempre se calcula a nivel cotización: neto venta − Σ neto de sus OCs vigentes
 * (se excluyen anuladas/rechazadas). Lo usan GET /oc/:id y GET /cotizaciones/:id,
 * así ambas pantallas muestran exactamente el mismo número.
 * Todo sobre NETO; IVA solo de referencia.
 */
const { db } = require('../../config/database')

const ESTADOS_OC_EXCLUIDOS = ['anulada', 'rechazada']
const IVA = 0.19

const conIva = (neto) => {
  const n = Math.round(Number(neto) || 0)
  const iva = Math.round(n * IVA)
  return { neto: n, iva, total: n + iva }
}

// Usa el neto guardado; si viene en 0 (documentos antiguos) lo recalcula desde las líneas.
function netoCotizacion(cot) {
  if (Number(cot.neto) > 0) return Number(cot.neto)
  const r = db.prepare('SELECT COALESCE(SUM(subtotal), 0) AS s FROM cotizacion_items WHERE cotizacion_id = ?').get(cot.id)
  return Number(r?.s) || 0
}

function netoOC(oc) {
  if (Number(oc.neto) > 0) return Number(oc.neto)
  const r = db.prepare(
    'SELECT COALESCE(SUM(COALESCE(subtotal, cantidad * precio_unitario)), 0) AS s FROM oc_items WHERE oc_id = ?'
  ).get(oc.id)
  return Number(r?.s) || 0
}

function cruceParaCotizacion(cotizacionId) {
  if (!cotizacionId) return null
  const cot = db.prepare('SELECT id, numero, neto FROM cotizaciones WHERE id = ?').get(cotizacionId)
  if (!cot) return null
  const ocs = db.prepare(
    'SELECT id, numero, estado, neto FROM ordenes_compra WHERE cotizacion_id = ? ORDER BY created_at ASC'
  ).all(cot.id)
  if (!ocs.length) return null

  const ocsDetalle = ocs.map(oc => ({
    id: oc.id, numero: oc.numero, estado: oc.estado,
    excluida: ESTADOS_OC_EXCLUIDOS.includes(oc.estado),
    ...conIva(netoOC(oc)),
  }))
  const venta = { id: cot.id, numero: cot.numero, ...conIva(netoCotizacion(cot)) }
  const compra = conIva(ocsDetalle.filter(o => !o.excluida).reduce((a, o) => a + o.neto, 0))
  const monto = venta.neto - compra.neto

  return {
    venta,
    compra,
    ocs: ocsDetalle,
    margen: {
      monto,
      pct: venta.neto ? monto / venta.neto : null,     // margen sobre la venta
      markup: compra.neto ? monto / compra.neto : null, // sobre el costo
    },
  }
}

module.exports = { cruceParaCotizacion }
