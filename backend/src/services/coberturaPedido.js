/**
 * Cobertura de una NOTA DE VENTA por sus OC al proveedor (2026-11-14, pedido de JC).
 *
 * Una venta puede abastecerse con MÁS de una OC (un proveedor por línea, o una
 * línea externa aparte). Este módulo responde, línea por línea de la nota de
 * venta, cuánto ya está pedido en OC vigentes y cuánto falta. Lo usan:
 *   - ocController: para emitir OC parciales sin duplicar ni exceder la venta.
 *   - pedidosController: para mostrar lo pendiente y validar la cobertura.
 *
 * OC vigente = cualquiera que no esté anulada ni rechazada (mismo criterio que
 * services/cruceOcCotizacion.js). El calce es por SKU.
 */
const { db } = require('../../config/database')

const ESTADOS_OC_NO_VIGENTES = ['anulada', 'rechazada']
const ocVigente = (oc) => !ESTADOS_OC_NO_VIGENTES.includes(oc.estado)
const norm = (codigo) => String(codigo || '').trim().toUpperCase()

function armar(items, enOcPorCodigo) {
  const porCodigo = new Map()
  for (const i of items) {
    const k = norm(i.codigo_sku)
    const prev = porCodigo.get(k)
    if (prev) prev.cantidad += Number(i.cantidad) || 0
    else porCodigo.set(k, {
      codigo: i.codigo_sku, descripcion: i.descripcion,
      cantidad: Number(i.cantidad) || 0, costo_unitario: Number(i.costo_unitario) || 0,
    })
  }
  const lineas = [...porCodigo.entries()].map(([k, l]) => {
    const en_oc = Number(enOcPorCodigo.get(k)) || 0
    return { ...l, en_oc, pendiente: Math.max(0, l.cantidad - en_oc) }
  })
  const lineas_pendientes = lineas.filter(l => l.pendiente > 0).length
  return { lineas, lineas_pendientes, completa: lineas.length > 0 && lineas_pendientes === 0 }
}

// Cobertura de una nota de venta. excluirOcId: no contar esa OC (al editarla).
function coberturaPedido(pedidoId, { excluirOcId = null } = {}) {
  const items = db.prepare(
    'SELECT codigo_sku, descripcion, cantidad, costo_unitario FROM pedido_items WHERE pedido_id = ?'
  ).all(pedidoId)
  const enOc = new Map()
  for (const r of db.prepare(
    `SELECT i.codigo, SUM(i.cantidad) AS cantidad
       FROM oc_items i JOIN ordenes_compra o ON o.id = i.oc_id
      WHERE o.pedido_id = ? AND o.estado NOT IN ('anulada','rechazada') AND o.id != ?
      GROUP BY i.codigo`
  ).all(pedidoId, excluirOcId || '')) {
    const k = norm(r.codigo)
    enOc.set(k, (enOc.get(k) || 0) + (Number(r.cantidad) || 0))
  }
  return armar(items, enOc)
}

// Versión por lote para listados: { pedidoId: lineas_pendientes }. 2 consultas en total.
function lineasPendientesPorPedido(pedidoIds) {
  const out = {}
  if (!pedidoIds.length) return out
  const ph = pedidoIds.map(() => '?').join(',')
  const itemsPor = {}
  for (const i of db.prepare(
    `SELECT pedido_id, codigo_sku, descripcion, cantidad, costo_unitario FROM pedido_items WHERE pedido_id IN (${ph})`
  ).all(...pedidoIds)) (itemsPor[i.pedido_id] = itemsPor[i.pedido_id] || []).push(i)
  const enOcPor = {}
  for (const r of db.prepare(
    `SELECT o.pedido_id, i.codigo, SUM(i.cantidad) AS cantidad
       FROM oc_items i JOIN ordenes_compra o ON o.id = i.oc_id
      WHERE o.pedido_id IN (${ph}) AND o.estado NOT IN ('anulada','rechazada')
      GROUP BY o.pedido_id, i.codigo`
  ).all(...pedidoIds)) {
    const m = (enOcPor[r.pedido_id] = enOcPor[r.pedido_id] || new Map())
    const k = norm(r.codigo)
    m.set(k, (m.get(k) || 0) + (Number(r.cantidad) || 0))
  }
  for (const id of pedidoIds) out[id] = armar(itemsPor[id] || [], enOcPor[id] || new Map()).lineas_pendientes
  return out
}

module.exports = { coberturaPedido, lineasPendientesPorPedido, ocVigente, norm }
