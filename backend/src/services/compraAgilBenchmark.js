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
 * ── Cambio 2026-09 — "no encuentra nada" ────────────────────────────────────
 * Antes, estos dos botones llamaban a compraAgilApiClient.buscarOrdenesDeCompra,
 * que golpea una API interna de Mercado Público bloqueada por WAF — confirmado
 * en producción (caso real 1493-495-COT26) que devuelve 403 incluso desde el
 * servidor real de RMG, no solo desde el navegador. Por eso los botones no
 * encontraban nada.
 *
 * Reemplazado por compraAgilDatosAbiertos.js: una cache LOCAL, sincronizada
 * mensualmente, de las cotizaciones de Compra Ágil que ChileCompra publica
 * públicamente (sin WAF, sin autenticación) en su portal de Datos Abiertos.
 * Es retrospectivo (~2 meses de rezago), correcto para benchmark de precios
 * históricos — que es exactamente lo que estos dos botones necesitan.
 *
 * Se sigue cacheando 24h en compra_agil_benchmark_cache — aunque ahora la
 * consulta es sobre una tabla local (rápida), evita recalcular el mismo
 * resumen estadístico cada vez que el usuario reabre la misma oportunidad.
 */
const { db, uuidv4 } = require('../../config/database')
const datosAbiertos = require('./compraAgilDatosAbiertos')

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

/**
 * Sin datos sincronizados todavía, se avisa explícitamente en vez de devolver
 * un array vacío sin explicación — mismo principio de "nunca hacer parecer
 * que buscamos y no encontramos nada" que causó la queja original.
 */
function sinDatosSincronizados() {
  const meses = datosAbiertos.estadoSincronizacion()
  return !meses.length
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

  if (!organismoRut) {
    const resultado = {
      ordenes: [], estadisticas: { min: null, max: null, promedio: null, n: 0 },
      advertencia: `Falta el RUT del organismo ("${organismoNombre}") para buscar en el histórico local — Datos Abiertos indexa por RUT, no por nombre.`,
    }
    guardarCache('solicitante', clave, resultado)
    return resultado
  }

  const resultado = datosAbiertos.benchmarkLocalPorSolicitante({ organismoRut, keyword })
  if (sinDatosSincronizados()) {
    resultado.advertencia = 'Todavía no se ha sincronizado ningún mes de Datos Abiertos de Compra Ágil — usa "Sincronizar histórico" en el módulo, o espera a la sincronización mensual automática.'
  } else if (!resultado.ordenes.length) {
    resultado.advertencia = `Sin cotizaciones históricas de "${organismoNombre || organismoRut}" para "${keyword}" en los meses sincronizados. Los datos de Compra Ágil se publican con ~2 meses de rezago — puede que este organismo simplemente no haya comprado esto antes, o que aún no se haya sincronizado el mes relevante.`
  }
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

  const resultado = datosAbiertos.benchmarkLocalPorMercado({ keyword, limite: 50 })
  if (sinDatosSincronizados()) {
    resultado.advertencia = 'Todavía no se ha sincronizado ningún mes de Datos Abiertos de Compra Ágil — usa "Sincronizar histórico" en el módulo, o espera a la sincronización mensual automática.'
  } else if (!resultado.ordenes.length) {
    resultado.advertencia = `Sin cotizaciones históricas para "${keyword}" en los meses sincronizados. Los datos de Compra Ágil se publican con ~2 meses de rezago.`
  }
  guardarCache('mercado', clave, resultado)
  return resultado
}

module.exports = { benchmarkPorSolicitante, benchmarkPorMercado }
