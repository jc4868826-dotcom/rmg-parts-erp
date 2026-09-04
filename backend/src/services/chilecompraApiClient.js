/**
 * RMG Parts — Cliente de la API pública de Mercado Público (ChileCompra)
 *
 * Documentado y estable: API de Licitaciones (api.mercadopublico.cl), autenticada
 * con un "ticket" que se obtiene en el portal con ClaveÚnica del representante legal.
 * Ver: https://api.mercadopublico.cl/documentos/Documentaci%C3%B3n%20API%20Mercado%20Publico%20-%20Licitaciones.pdf
 *
 * IMPORTANTE — Compra Ágil: ChileCompra lanzó en beta (mayo 2026) una API para Compra
 * Ágil, pero al momento de escribir este módulo no había documentación pública estable
 * del contrato exacto (endpoint/parámetros). fetchComprasAgiles() queda con la forma
 * esperada y un TODO explícito — hay que confirmar el endpoint real contra el portal de
 * desarrolladores de ChileCompra apenas se gestione el ticket, y ajustar el mapeo en
 * mapCompraAgil(). No inventar el contrato es intencional: mejor fallar visible que
 * traer datos mal mapeados a producción.
 */
const axios = require('axios')

const BASE_URL = 'https://api.mercadopublico.cl/servicios/v1/publico'
const TICKET = process.env.CHILECOMPRA_API_TICKET

function assertTicket() {
  if (!TICKET) {
    throw new Error('CHILECOMPRA_API_TICKET no configurado — obtenerlo en mercadopublico.cl con la ClaveÚnica del representante legal')
  }
}

function ddmmyyyy(date) {
  const d = date instanceof Date ? date : new Date(date)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * La API pública de ChileCompra aplica rate-limit por ticket (no documentado con
 * exactitud, pero se confirmó empíricamente: barrer 7 días dispara cientos de
 * solicitudes seguidas y la API empieza a responder 429 Too Many Requests a partir
 * de las primeras — eso es lo que causaba que "hacer análisis" pareciera traer
 * solo una oportunidad a la vez, no un bug del rango de fechas). Esta función
 * envuelve cualquier llamada a la API con reintento y backoff exponencial cuando
 * la respuesta es 429 (o 500/502/503, transitorios en la API pública).
 */
async function conReintento(fn, { maxIntentos = 5, delayBaseMs = 1500 } = {}) {
  let intento = 0
  while (true) {
    try {
      return await fn()
    } catch (e) {
      const status = e.response?.status
      const reintentable = status === 429 || status === 500 || status === 502 || status === 503
      intento++
      if (reintentable && intento < maxIntentos) {
        const retryAfterHeader = Number(e.response?.headers?.['retry-after'])
        const espera = (retryAfterHeader ? retryAfterHeader * 1000 : null) || delayBaseMs * Math.pow(2, intento - 1)
        console.warn(`⏳ ChileCompra API respondió ${status} — reintento ${intento}/${maxIntentos - 1} en ${espera}ms`)
        await sleep(espera)
        continue
      }
      throw e
    }
  }
}

/**
 * Licitaciones publicadas en una fecha dada (la API solo permite consultar por día,
 * no por rango — para barrer varios días hay que llamar una vez por fecha).
 * @param {Date|string} fecha
 */
async function fetchLicitacionesPorFecha(fecha) {
  assertTicket()
  return conReintento(async () => {
    const { data } = await axios.get(`${BASE_URL}/licitaciones.json`, {
      params: { ticket: TICKET, fecha: ddmmyyyy(fecha) },
      timeout: 20_000,
    })
    return Array.isArray(data?.Listado) ? data.Listado : []
  })
}

/** Detalle completo de una licitación (ítems, organismo, fechas de cierre, etc.) */
async function fetchLicitacionDetalle(codigo) {
  assertTicket()
  return conReintento(async () => {
    const { data } = await axios.get(`${BASE_URL}/licitaciones.json`, {
      params: { ticket: TICKET, codigo },
      timeout: 20_000,
    })
    return Array.isArray(data?.Listado) ? data.Listado[0] : null
  })
}

/**
 * TODO(confirmar-endpoint): Compra Ágil — beta, sin contrato público confirmado.
 * Placeholder honesto: lanza para que el fallo sea explícito en vez de devolver
 * datos silenciosamente vacíos o mal mapeados. Reemplazar la URL/params cuando
 * ChileCompra confirme el endpoint definitivo.
 */
async function fetchComprasAgiles(/* { region, fechaDesde, fechaHasta, rubro } */) {
  assertTicket()
  throw new Error(
    'fetchComprasAgiles: endpoint de la API de Compra Ágil (beta) aún no confirmado. ' +
    'Revisar el portal de desarrolladores de ChileCompra con el ticket ya gestionado y completar este cliente.'
  )
}

/** Filtra un listado de licitaciones por palabras clave en Nombre/RubroN */
function filtrarPorRubro(listado, keywords = []) {
  if (!keywords.length) return listado
  const kws = keywords.map(k => k.toLowerCase())
  return listado.filter(l => {
    const texto = `${l.Nombre || ''} ${l.RubroN1 || ''} ${l.RubroN2 || ''} ${l.RubroN3 || ''}`.toLowerCase()
    return kws.some(k => texto.includes(k))
  })
}

module.exports = {
  fetchLicitacionesPorFecha,
  fetchLicitacionDetalle,
  fetchComprasAgiles,
  filtrarPorRubro,
  ddmmyyyy,
  sleep,
}
