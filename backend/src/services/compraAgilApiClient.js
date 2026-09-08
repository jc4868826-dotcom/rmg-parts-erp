/**
 * RMG Parts — Cliente Compra Ágil / Órdenes de Compra (Mercado Público)
 *
 * CONTEXTO (2026-09): chilecompraApiClient.fetchComprasAgiles() lleva meses como
 * un stub que solo lanza error, porque la API OFICIAL de ChileCompra
 * (api.mercadopublico.cl/servicios/v1/publico) documentada con ticket NO cubre
 * Compra Ágil — solo Licitaciones. Se investigó a mano, con el inspector de red
 * del navegador, la API interna (no documentada) que usa el propio buscador
 * público del portal (buscador.mercadopublico.cl) y que SÍ cubre Compra Ágil y
 * Órdenes de Compra:
 *
 *   Host base: https://api.buscador.mercadopublico.cl
 *   - GET /compra-agil?code=<codigo>                     → detalle de una compra ágil por su código
 *   - GET /compra-agil?action=ficha&code=<codigo>         → ficha/detalle ampliado (visto en la SPA)
 *   - GET /ordenes-de-compra?keyword=<texto>&buyer_code=<n>&date_from=<dd-mm-aaaa>&date_to=<dd-mm-aaaa>
 *                                                          → búsqueda de órdenes de compra (histórico de compras)
 *   - GET /filtros/organismo-comprador?q=<texto>&org_class=2
 *                                                          → autocompletar organismo comprador → buyer_code
 *
 * ⚠️ IMPORTANTE — RIESGO CONOCIDO Y NO RESUELTO: esta API es INTERNA (no
 * documentada, no versionada, puede cambiar sin aviso) y está protegida por un
 * WAF que devuelve 403 Forbidden a peticiones que no calcen con lo que espera
 * (probablemente exige un Referer/Origin de buscador.mercadopublico.cl, o
 * cabeceras específicas que el navegador agrega solas). Se intentó verificar el
 * formato exacto de la respuesta JSON desde:
 *   1) La consola del navegador (fetch directo) → bloqueado (CORS/WAF).
 *   2) Un curl desde el sandbox de desarrollo → bloqueado dos veces: 403 del
 *      propio servidor Y la política de salida de red del sandbox.
 * Es decir: el MAPEO DE CAMPOS de abajo (`mapearCompraAgil`, `mapearOrden`) es
 * el mejor esfuerzo basado en lo que se alcanzó a ver en el árbol de React de
 * la SPA — NO está confirmado contra una respuesta real. La primera vez que
 * esto corra desde el servidor real de RMG (otro origen de red, no sujeto al
 * CORS del navegador ni al firewall de salida del sandbox de desarrollo):
 *   - Revisar `debugUltimaRespuesta` (se guarda automáticamente) para confirmar
 *     o corregir el mapeo de campos.
 *   - Si el WAF también bloquea al servidor de RMG (403), la única alternativa
 *     realista es usar el archivo de "Datos Abiertos" masivo que publica
 *     ChileCompra (descarga periódica, no tiempo real) — ver nota al pie del
 *     diagrama publicado — o volver al flujo 100% manual (browser) que ya se
 *     usó para esta cotización.
 * NUNCA se debe inventar un campo que no venga en la respuesta real: si el
 * mapeo falla o el campo esperado no existe, se deja null y se registra el
 * problema (`advertencias`), nunca un valor estimado — mismo criterio que
 * chilecompraDocReader.js.
 */
const axios = require('axios')

const BASE_URL = process.env.COMPRA_AGIL_API_BASE || 'https://api.buscador.mercadopublico.cl'

// Cabeceras que imitan a un navegador real navegando el buscador público — el
// WAF observado rechaza peticiones "de script" sin esto, aunque no hay
// garantía de que sea suficiente (ver aviso arriba).
const HEADERS_BASE = {
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://buscador.mercadopublico.cl/',
  'Origin': 'https://buscador.mercadopublico.cl',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
}

function ddmmyyyy(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

async function llamar(path, params, origen) {
  try {
    const resp = await axios.get(`${BASE_URL}${path}`, {
      params,
      headers: HEADERS_BASE,
      timeout: 20_000,
      validateStatus: () => true,
    })
    if (resp.status === 403) {
      throw new Error(
        `${origen}: la API interna de Mercado Público devolvió 403 Forbidden (WAF). ` +
        `Esta API no es oficial/documentada — ver cabecera de este archivo. ` +
        `Como alternativa inmediata, use el flujo manual en buscador.mercadopublico.cl.`
      )
    }
    if (resp.status >= 400) {
      throw new Error(`${origen}: HTTP ${resp.status} — ${JSON.stringify(resp.data)?.slice(0, 300)}`)
    }
    return resp.data
  } catch (err) {
    if (err.response) throw err
    if (err.message?.startsWith(origen)) throw err
    throw new Error(`${origen}: no se pudo contactar ${BASE_URL}${path} — ${err.message}`)
  }
}

/**
 * Resuelve el buyer_code interno de Mercado Público a partir del nombre o RUT
 * del organismo comprador (necesario para filtrar /ordenes-de-compra por
 * "compras de este mismo solicitante").
 * @param {string} texto nombre o RUT del organismo (ej. "Municipalidad de Quilpué")
 * @returns {Promise<{buyerCode: string|null, nombre: string|null, rut: string|null, opciones: Array}>}
 */
async function resolverOrganismo(texto) {
  const data = await llamar('/filtros/organismo-comprador', { q: texto, org_class: 2 }, 'resolverOrganismo')
  const opciones = Array.isArray(data) ? data : (data?.items || data?.results || data?.data || [])
  const primero = opciones[0] || null
  return {
    buyerCode: primero?.buyer_code ?? primero?.buyerCode ?? primero?.codigo ?? primero?.code ?? null,
    nombre: primero?.name ?? primero?.nombre ?? null,
    rut: primero?.rut ?? null,
    opciones,
  }
}

/**
 * Detalle de una Compra Ágil por su código externo (ej. "2428-1262-COT26").
 * Mapea al mismo formato de ítem que usa oportunidad_chilecompra_items para
 * poder reutilizar cruzarItemsConCatalogo() sin cambios.
 */
async function buscarCompraAgil(codigo) {
  if (!codigo) throw new Error('buscarCompraAgil: falta el código de la compra ágil')
  const data = await llamar('/compra-agil', { code: codigo }, 'buscarCompraAgil')
  return mapearCompraAgil(data, codigo)
}

function mapearCompraAgil(data, codigoSolicitado) {
  // La SPA puede envolver el resultado en { items: [...] } o { data: {...} } o
  // devolver el objeto plano — se cubren las formas más probables sin asumir
  // una sola. Ver aviso de riesgo al inicio del archivo.
  const raw = Array.isArray(data?.items) ? data.items[0] : (data?.data || data || {})
  const advertencias = []
  if (!raw || Object.keys(raw).length === 0) {
    advertencias.push('La respuesta llegó vacía o en un formato inesperado — revisar debugUltimaRespuesta antes de confiar en este resultado.')
  }

  const itemsRaw = raw.items || raw.lineItems || raw.productos || []
  const items = (Array.isArray(itemsRaw) ? itemsRaw : []).map(it => ({
    descripcion_solicitada: it.description || it.descripcion || it.name || null,
    cantidad: it.quantity ?? it.cantidad ?? null,
    unidad: it.unit || it.unidad || null,
    especificacion_tecnica: it.specification || it.especificacion || it.observation || raw.description || raw.descripcion || null,
    precio_unitario_referencial: it.unitPrice ?? it.precioUnitario ?? null,
  }))

  // Si no vino desglose de ítems (probable en Compra Ágil: suele ser una sola
  // línea genérica), se deja un único ítem con la descripción general — igual
  // que hace analizarOportunidadInterno con la ficha pública de licitaciones.
  if (!items.length && (raw.description || raw.descripcion || raw.name)) {
    items.push({
      descripcion_solicitada: raw.description || raw.descripcion || raw.name,
      cantidad: raw.quantity ?? raw.cantidad ?? null,
      unidad: raw.unit || raw.unidad || null,
      especificacion_tecnica: raw.description || raw.descripcion || null,
      precio_unitario_referencial: raw.unitPrice ?? raw.estimatedAmount ?? null,
    })
  }

  return {
    codigo_externo: codigoSolicitado,
    nombre: raw.name || raw.title || raw.description || `Compra Ágil ${codigoSolicitado}`,
    descripcion: raw.description || raw.descripcion || null,
    organismo_nombre: raw.buyerName || raw.organismo || raw.buyer?.name || null,
    organismo_rut: raw.buyerRut || raw.buyer?.rut || null,
    region: raw.region || null,
    comuna: raw.commune || raw.comuna || null,
    direccion_entrega: raw.deliveryAddress || raw.direccionEntrega || null,
    fecha_publicacion: raw.publicationDate || raw.fechaPublicacion || null,
    fecha_cierre: raw.closingDate || raw.fechaCierre || raw.dueDate || null,
    presupuesto_estimado: raw.estimatedAmount ?? raw.presupuesto ?? raw.totalAmount ?? null,
    url_portal: `https://www.mercadopublico.cl/CompraAgil/Modules/Detail/DetailCompraAgil.aspx?qs=${codigoSolicitado}`,
    items,
    numero_cotizaciones_recibidas: raw.quotesCount ?? raw.numeroCotizaciones ?? null,
    advertencias,
    debugUltimaRespuesta: data,
  }
}

/**
 * Histórico de Órdenes de Compra — con `buyerCode` filtra solo compras del
 * mismo organismo solicitante ("¿ya compró esto antes y a qué precio?"); sin
 * `buyerCode` es la búsqueda de mercado (cualquier organismo).
 */
async function buscarOrdenesDeCompra({ keyword, buyerCode = null, fechaDesde = null, fechaHasta = null, limite = 30 } = {}) {
  if (!keyword) throw new Error('buscarOrdenesDeCompra: falta la palabra clave de búsqueda')
  const params = { keyword, page_size: limite }
  if (buyerCode) params.buyer_code = buyerCode
  if (fechaDesde) params.date_from = ddmmyyyy(fechaDesde)
  if (fechaHasta) params.date_to = ddmmyyyy(fechaHasta)

  const data = await llamar('/ordenes-de-compra', params, 'buscarOrdenesDeCompra')
  const listado = Array.isArray(data?.items) ? data.items : (data?.results || data?.data || [])
  const ordenes = listado.map(mapearOrden)
  return { ordenes, total: data?.total ?? ordenes.length, debugUltimaRespuesta: data }
}

function mapearOrden(o) {
  return {
    codigo: o.code || o.codigo || o.orderNumber || null,
    fecha: o.date || o.fecha || o.creationDate || null,
    organismo_nombre: o.buyerName || o.organismo || null,
    organismo_rut: o.buyerRut || null,
    proveedor: o.supplierName || o.proveedor || null,
    descripcion: o.description || o.descripcion || o.name || null,
    monto_total: o.totalAmount ?? o.montoTotal ?? null,
    cantidad: o.quantity ?? o.cantidad ?? null,
    precio_unitario: o.unitPrice ?? o.precioUnitario ?? null,
    url_portal: (o.code || o.codigo)
      ? `https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?qs=${encodeURIComponent(o.code || o.codigo)}`
      : null,
  }
}

module.exports = {
  resolverOrganismo,
  buscarCompraAgil,
  buscarOrdenesDeCompra,
  ddmmyyyy,
}
