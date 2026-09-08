/**
 * RMG Parts — Benchmark de precios para Compra Ágil
 *
 * Los "dos botones de información" pedidos: dado un ítem (palabra clave, ej.
 * "aceite motor 5w30"), muestra
 *   (1) compras similares del MISMO organismo solicitante (¿ya compró esto
 *       antes y a qué precio?), y
 *   (2) compras similares en el mercado en general (cualquier organismo),
 * para fundamentar el precio de la cotización — el mismo ejercicio hecho a
 * mano en el chat para Quilpué/2428-1262-COT26, ahora repetible desde la UI.
 *
 * Se cachea cada búsqueda por 24h en compra_agil_benchmark_cache — la API de
 * Mercado Público es lenta e inestable (ver compraAgilApiClient.js), y el
 * usuario suele volver a abrir la misma oportunidad varias veces mientras
 * decide el precio.
 */
const { db, uuidv4 } = require('../../config/database')
const api = require('./compraAgilApiClient')

const TTL_HORAS = 24

function leerCache(tipo, clave) {
  const row = db.prepare(
    `SELECT * FROM compra_agil_benchmark_cache WHERE tipo = ? AND clave = ?
     AND datetime(fetched_at, '+${TTL_HORAS} hours') > datetime('now')`
  ).get(tipo, clave)
  if (!row) return null
  try {
    return { ...JSON.parse(row.payload_json), desdeCache: true, fetchedAt: row.fetched_at }
  } catch {
    return null
  }
}

function guardarCache(tipo, clave, payload) {
  try {
    const existente = db.prepare('SELECT id FROM compra_agil_benchmark_cache WHERE tipo = ? AND clave = ?').get(tipo, clave)
    if (existente) {
      db.prepare(`UPDATE compra_agil_benchmark_cache SET payload_json = ?, fetched_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(payload), existente.id)
    } else {
      db.prepare(`INSERT INTO compra_agil_benchmark_cache (id, tipo, clave, payload_json, fetched_at) VALUES (?,?,?,?,datetime('now'))`)
        .run(uuidv4(), tipo, clave, JSON.stringify(payload))
    }
  } catch (_) { /* el cache es solo optimización, nunca debe tumbar la respuesta */ }
}

function resumenEstadistico(ordenes) {
  const precios = ordenes.map(o => o.precio_unitario).filter(p => typeof p === 'number' && p > 0)
  if (!precios.length) return { min: null, max: null, promedio: null, n: 0 }
  const suma = precios.reduce((a, b) => a + b, 0)
  return {
    min: Math.min(...precios),
    max: Math.max(...precios),
    promedio: Math.round(suma / precios.length),
    n: precios.length,
  }
}

/**
 * Botón 1 — "¿Este organismo ya compró esto antes?"
 * @param {{organismoNombre: string, organismoRut?: string, keyword: string, forzar?: boolean}} args
 */
async function benchmarkPorSolicitante({ organismoNombre, organismoRut, keyword, forzar = false }) {
  if (!keyword) throw new Error('benchmarkPorSolicitante: falta la palabra clave (ej. "aceite motor")')
  if (!organismoNombre && !organismoRut) throw new Error('benchmarkPorSolicitante: falta organismoNombre u organismoRut')

  const clave = `${organismoRut || organismoNombre}::${keyword}`.toLowerCase()
  if (!forzar) {
    const cache = leerCache('solicitante', clave)
    if (cache) return cache
  }

  const resuelto = await api.resolverOrganismo(organismoRut || organismoNombre)
  if (!resuelto.buyerCode) {
    const resultado = {
      ordenes: [], estadisticas: resumenEstadistico([]),
      advertencia: `No se pudo resolver el organismo "${organismoNombre || organismoRut}" en el buscador de Mercado Público — puede que el nombre no calce exacto. Revisar manualmente en buscador.mercadopublico.cl/ordenes-de-compra.`,
    }
    guardarCache('solicitante', clave, resultado)
    return resultado
  }

  const hace6Meses = new Date()
  hace6Meses.setMonth(hace6Meses.getMonth() - 6)
  const { ordenes } = await api.buscarOrdenesDeCompra({
    keyword, buyerCode: resuelto.buyerCode, fechaDesde: hace6Meses, fechaHasta: new Date(),
  })

  const resultado = { ordenes, estadisticas: resumenEstadistico(ordenes), organismoResuelto: resuelto.nombre || organismoNombre }
  guardarCache('solicitante', clave, resultado)
  return resultado
}

/**
 * Botón 2 — "¿A qué precio se ha vendido esto en el mercado, sin importar el organismo?"
 * @param {{keyword: string, forzar?: boolean}} args
 */
async function benchmarkPorMercado({ keyword, forzar = false }) {
  if (!keyword) throw new Error('benchmarkPorMercado: falta la palabra clave (ej. "aceite motor 5w30")')

  const clave = keyword.toLowerCase()
  if (!forzar) {
    const cache = leerCache('mercado', clave)
    if (cache) return cache
  }

  const hace6Meses = new Date()
  hace6Meses.setMonth(hace6Meses.getMonth() - 6)
  const { ordenes } = await api.buscarOrdenesDeCompra({
    keyword, fechaDesde: hace6Meses, fechaHasta: new Date(), limite: 50,
  })

  const resultado = { ordenes, estadisticas: resumenEstadistico(ordenes) }
  guardarCache('mercado', clave, resultado)
  return resultado
}

module.exports = { benchmarkPorSolicitante, benchmarkPorMercado }
