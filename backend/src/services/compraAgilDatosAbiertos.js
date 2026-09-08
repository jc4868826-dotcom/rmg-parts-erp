/**
 * RMG Parts — Cache local de Compra Ágil vía "Datos Abiertos" de ChileCompra
 *
 * ── Por qué existe este archivo (2026-09) ───────────────────────────────────
 * Los dos botones de benchmark de Compra Ágil ("¿este organismo ya compró
 * esto antes?" / "¿a qué precio se vende en el mercado?", ver
 * compraAgilBenchmark.js) dependían de compraAgilApiClient.js, que llama a
 * una API INTERNA no documentada de Mercado Público
 * (api.buscador.mercadopublico.cl). Confirmado en producción (2026-09-07,
 * caso real 1493-495-COT26): esa API devuelve 403 Forbidden (WAF) incluso
 * desde el servidor real de RMG en Render, no solo desde el navegador o un
 * sandbox de desarrollo — el riesgo que el propio compraAgilApiClient.js ya
 * advertía en su cabecera se confirmó tal cual.
 *
 * La alternativa real, verificada a mano navegando
 * https://datos-abiertos.chilecompra.cl/descargas/compra-agil (2026-09-08):
 * ChileCompra publica, un archivo por mes, TODAS las cotizaciones de Compra
 * Ágil de Chile completo, en:
 *
 *   https://transparenciachc.blob.core.windows.net/trnspchc/COT_{YYYY}-{MM}.zip
 *
 * Verificado con una descarga real (COT_2026-06.zip, 78MB comprimido):
 *   - Es un archivo público en Azure Blob Storage — SIN WAF, SIN ticket, SIN
 *     autenticación de ningún tipo. Un GET simple basta.
 *   - Contiene 2 CSV (COT1_<mes>.csv, COT2_<mes>.csv, ~650-700MB cada uno sin
 *     comprimir — Chile completo, todos los rubros, no solo el de RMG).
 *   - Columnas reales del CSV (separador ";", con comillas), confirmadas
 *     leyendo el archivo real, NO inventadas:
 *       NombreOOPP;RazonSocialUnidaddeCompra;NombreUnidaddeCompra;
 *       RUTUnidaddeCompra;CodigoUnidaddeCompra;CodigoCotizacion;
 *       NombreCotizacion;DescripcionCotizacion;DireccionEntrega;Region;
 *       FechaPublicacionParaCotizar;FechaCierreParaCotizar;PlazoEntrega;
 *       MontoTotalDisponble;ProductoCotizado;CodigoProducto;
 *       NombreProductoGenerico;CantidadSolicitada;Estado;NOMBRECONTACTO;
 *       RazonSocialProveedor;RUTProveedor;Tamano;DetalleCotizacion;
 *       ProveedorSeleccionado;moneda;MontoTotal;NombreCriterio;CodigoOC;
 *       EstadoOC;FechaAceptacionOCProveedor;MotivoCancelacion;
 *       ConsideraRequisitosMedioambientales;
 *       ConsideraRequisitosImpactoSocialEconomico
 *   - Publicación con ~2 meses de rezago (al probar en septiembre 2026,
 *     julio y agosto aún no existían — solo hasta junio). Por eso este
 *     archivo sirve para BENCHMARK DE PRECIOS HISTÓRICOS, nunca para
 *     detectar oportunidades nuevas en tiempo real (ver nota al final).
 *
 * ── Cómo se usa acá ──────────────────────────────────────────────────────
 * Se descarga el ZIP a un archivo temporal (streaming, nunca a memoria) y se
 * parsean sus 2 CSV también en streaming (nunca se carga el archivo completo
 * en RAM — son ~1.3GB sin comprimir por mes). Se descartan todas las filas
 * que no calcen con el rubro de RMG (mismas KEYWORDS que ya usa
 * chilecompraCron.js para licitaciones — una sola fuente de verdad) y solo
 * esas pocas filas relevantes (normalmente unos cientos, no millones) se
 * guardan en la tabla local `compra_agil_cotizaciones_historicas` — desde
 * ahí, compraAgilBenchmark.js consulta con SQL normal, instantáneo, sin
 * volver a tocar la red.
 *
 * ── Sobre la detección de oportunidades NUEVAS en tiempo real (pendiente) ──
 * Este archivo NO resuelve eso — es retrospectivo por diseño (ChileCompra lo
 * publica así). Para eso existe una API OFICIAL nueva, con ticket (mismo
 * mecanismo que ya usa chilecompraApiClient.js para licitaciones), lanzada en
 * beta el 25 de mayo de 2026 (ver https://www.chilecompra.cl/api/ y los PDF
 * "Documentacion_API_Compra_Agil.pdf" ahí publicados) que SÍ está pensada
 * para "detectar nuevas Compras Ágiles publicadas en tiempo real". El
 * endpoint exacto de esa API todavía no se confirmó contra una respuesta
 * real (falta obtener un ticket y probarlo) — NO se debe inventar su forma
 * acá. Ver compraAgilApiOficialClient.js (pendiente de implementar) y
 * RMG_CompraAgil_Implementacion.md para el estado de esa pieza.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const unzipper = require('unzipper')
const { parse: csvParse } = require('csv-parse')
const { db, uuidv4 } = require('../../config/database')
const { KEYWORDS } = require('../jobs/chilecompraCron')

const BASE_URL = 'https://transparenciachc.blob.core.windows.net/trnspchc'

// Directorio de trabajo — mismo patrón que otros cachés de archivos del
// proyecto (Render monta disco persistente en /var/data); se usa solo como
// scratch temporal (el ZIP se borra apenas se termina de procesar), así que
// cae a os.tmpdir() sin problema si /var/data no está disponible (dev local).
function dirTemporal() {
  const candidato = process.env.DATOS_ABIERTOS_TMP_DIR || '/var/data/tmp-datos-abiertos'
  try {
    if (!fs.existsSync(candidato)) fs.mkdirSync(candidato, { recursive: true })
    return candidato
  } catch (_) {
    return os.tmpdir()
  }
}

function normalizar(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Falsos positivos reales verificados contra el archivo real (COT_2026-06,
 * 1.2M filas): la keyword "bateria" (necesaria para pillas/baterías de
 * vehículo) calza con MUCHÍSIMA frecuencia contra baterías/pilas de
 * electrónica de consumo (power bank, pilas AA/AAA, controles remotos) que
 * no tienen nada que ver con el rubro automotriz de RMG — de 25.754 filas
 * que pasaban el filtro simple, la gran mayoría eran justamente esto. Se
 * excluyen esos términos SALVO que el texto también traiga contexto
 * automotriz/industrial explícito (auto/camión/vehículo/motor/etc.), en cuyo
 * caso el contexto automotriz prevalece sobre la exclusión.
 */
const EXCLUSIONES_FALSOS_POSITIVOS = [
  'power bank', 'pila aa', 'pila aaa', 'pilas aa', 'pilas aaa', 'pilas alcalinas',
  'notebook', 'camara', 'control remoto', 'mouse', 'teclado', 'linterna', 'reloj',
  'audifono', 'parlante', 'bateria externa', 'cargador portatil',
]
const CONTEXTO_AUTOMOTRIZ = [
  'vehiculo', 'automotriz', 'camion', 'camioneta', 'auto ', 'automovil', 'motor',
  'maquinaria', 'bus ', 'furgon', 'tractor', 'moto ', 'flota', 'generador',
]

function filaEsRelevante(fila) {
  const texto = normalizar([
    fila.ProductoCotizado, fila.NombreProductoGenerico, fila.DescripcionCotizacion, fila.NombreCotizacion,
  ].filter(Boolean).join(' '))
  if (!KEYWORDS.some(k => texto.includes(normalizar(k)))) return false

  const esExcluible = EXCLUSIONES_FALSOS_POSITIVOS.some(e => texto.includes(normalizar(e)))
  if (!esExcluible) return true
  return CONTEXTO_AUTOMOTRIZ.some(c => texto.includes(normalizar(c)))
}

function limpiarNumero(v) {
  if (v == null || v === '' || v === 'NA') return null
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Descarga el ZIP mensual (streaming a disco) y devuelve la ruta local.
 * Lanza un error con `status` cuando el mes todavía no está publicado (404) —
 * el llamador lo trata como "aún no disponible", no como una falla real.
 */
async function descargarZipMes(anio, mes) {
  const nombreArchivo = `COT_${anio}-${String(mes).padStart(2, '0')}.zip`
  const url = `${BASE_URL}/${nombreArchivo}`
  const destino = path.join(dirTemporal(), nombreArchivo)

  const resp = await axios.get(url, {
    responseType: 'stream',
    timeout: 120_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: () => true,
  })

  if (resp.status === 404) {
    const err = new Error(`Datos Abiertos: el mes ${anio}-${mes} todavía no está publicado (404).`)
    err.status = 404
    throw err
  }
  if (resp.status >= 400) {
    throw new Error(`Datos Abiertos: HTTP ${resp.status} descargando ${url}`)
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destino)
    resp.data.pipe(out)
    out.on('finish', resolve)
    out.on('error', reject)
    resp.data.on('error', reject)
  })

  return destino
}

/**
 * Recorre en streaming un CSV dentro del ZIP (nunca carga el archivo
 * completo en memoria) y va acumulando SOLO las filas relevantes para el
 * rubro de RMG. `onFila` se llama por cada fila leída (para contar el total
 * escaneado); devuelve las filas relevantes encontradas en esa entrada.
 */
function procesarEntradaCsv(entryStream) {
  return new Promise((resolve, reject) => {
    const relevantes = []
    let totalFilas = 0
    const parser = csvParse({
      delimiter: ';', columns: true, quote: '"', relax_quotes: true,
      skip_empty_lines: true, relax_column_count: true, bom: true,
      // El CSV real (verificado contra el archivo, no asumido) viene en
      // Latin-1/Windows-1252, NO en UTF-8 — sin esto, todos los acentos
      // (organismo, región, producto) se corrompen ("Bater�a").
      encoding: 'latin1',
    })
    entryStream.pipe(parser)
    parser.on('data', (fila) => {
      totalFilas++
      if (filaEsRelevante(fila)) relevantes.push(fila)
    })
    parser.on('end', () => resolve({ relevantes, totalFilas }))
    parser.on('error', reject)
    entryStream.on('error', reject)
  })
}

/**
 * Descarga + filtra + guarda un mes completo. Idempotente: si el mes ya
 * estaba sincronizado, borra e inserta de nuevo (permite re-sincronizar si
 * ChileCompra corrige el archivo).
 */
async function sincronizarMes(anio, mes) {
  const mesRef = `${anio}-${String(mes).padStart(2, '0')}`
  const zipPath = await descargarZipMes(anio, mes)

  try {
    const directory = await unzipper.Open.file(zipPath)
    let totalFilas = 0
    const relevantesTotal = []

    for (const entry of directory.files) {
      if (!/\.csv$/i.test(entry.path)) continue
      const { relevantes, totalFilas: n } = await procesarEntradaCsv(entry.stream())
      totalFilas += n
      relevantesTotal.push(...relevantes)
    }

    db.transaction(() => {
      db.prepare('DELETE FROM compra_agil_cotizaciones_historicas WHERE mes_referencia = ?').run(mesRef)
      const ins = db.prepare(`
        INSERT INTO compra_agil_cotizaciones_historicas
          (id, mes_referencia, codigo_cotizacion, nombre_cotizacion, descripcion_cotizacion,
           organismo_nombre, organismo_rut, region, direccion_entrega, fecha_publicacion,
           fecha_cierre, monto_total_disponible, producto_cotizado, codigo_producto,
           nombre_producto_generico, cantidad_solicitada, estado, proveedor_nombre,
           proveedor_rut, monto_total, moneda, proveedor_seleccionado, codigo_oc)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `)
      for (const f of relevantesTotal) {
        ins.run(
          uuidv4(), mesRef, f.CodigoCotizacion || null, f.NombreCotizacion || null, f.DescripcionCotizacion || null,
          f.NombreOOPP || f.RazonSocialUnidaddeCompra || null, f.RUTUnidaddeCompra || null, f.Region || null,
          f.DireccionEntrega || null, f.FechaPublicacionParaCotizar || null, f.FechaCierreParaCotizar || null,
          limpiarNumero(f.MontoTotalDisponble), f.ProductoCotizado || null, f.CodigoProducto || null,
          f.NombreProductoGenerico || null, limpiarNumero(f.CantidadSolicitada), f.Estado || null,
          f.RazonSocialProveedor || null, f.RUTProveedor || null, limpiarNumero(f.MontoTotal),
          f.moneda || null, f.ProveedorSeleccionado || null, f.CodigoOC || null
        )
      }
      db.prepare(`
        INSERT INTO compra_agil_datos_abiertos_meses (mes_referencia, filas_totales, filas_relevantes, sincronizado_at)
        VALUES (?,?,?,datetime('now'))
        ON CONFLICT(mes_referencia) DO UPDATE SET
          filas_totales = excluded.filas_totales, filas_relevantes = excluded.filas_relevantes,
          sincronizado_at = datetime('now')
      `).run(mesRef, totalFilas, relevantesTotal.length)
    })()

    console.log(`✅ Datos Abiertos Compra Ágil ${mesRef}: ${totalFilas} filas escaneadas, ${relevantesTotal.length} relevantes para RMG guardadas`)
    return { mesRef, totalFilas, relevantes: relevantesTotal.length }
  } finally {
    // El ZIP y sus CSV solo se necesitan durante el procesamiento — nunca se
    // conservan en disco (serían ~1.3GB sin comprimir por mes acumulado).
    try { fs.unlinkSync(zipPath) } catch (_) { /* best-effort */ }
  }
}

/**
 * Sincroniza los meses recientes que aún no estén en
 * compra_agil_datos_abiertos_meses, probando desde el mes actual hacia
 * atrás. Se detiene tras `maxIntentos` meses sin éxito para no golpear el
 * servidor indefinidamente (la publicación real tiene ~2 meses de rezago,
 * así que los primeros 1-2 intentos fallarán con 404 en un mes normal — eso
 * es esperado, no un error).
 */
/**
 * Purga meses más viejos que `mesesRetencion` — evita que la base de datos
 * (sql.js: TODO el archivo se reescribe a disco en cada escritura fuera de
 * una transacción, ver config/database.js) crezca indefinidamente con
 * historial de Compra Ágil que ya es demasiado viejo para servir de
 * benchmark de precios útil.
 */
function purgarMesesAntiguos(mesesRetencion = 24) {
  const limite = new Date()
  limite.setMonth(limite.getMonth() - mesesRetencion)
  const mesLimite = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}`
  db.transaction(() => {
    db.prepare('DELETE FROM compra_agil_cotizaciones_historicas WHERE mes_referencia < ?').run(mesLimite)
    db.prepare('DELETE FROM compra_agil_datos_abiertos_meses WHERE mes_referencia < ?').run(mesLimite)
  })()
}

async function sincronizarMesesRecientes({ maxIntentos = 5 } = {}) {
  const resultados = []
  const hoy = new Date()
  for (let i = 0; i < maxIntentos; i++) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const anio = fecha.getFullYear()
    const mes = fecha.getMonth() + 1
    const mesRef = `${anio}-${String(mes).padStart(2, '0')}`

    const yaSincronizado = db.prepare(
      'SELECT mes_referencia FROM compra_agil_datos_abiertos_meses WHERE mes_referencia = ?'
    ).get(mesRef)
    if (yaSincronizado) continue

    try {
      const r = await sincronizarMes(anio, mes)
      resultados.push({ ...r, ok: true })
    } catch (e) {
      resultados.push({ mesRef, ok: false, motivo: e.status === 404 ? 'aun_no_publicado' : e.message })
    }
  }
  try { purgarMesesAntiguos(24) } catch (_) { /* la purga nunca debe tumbar la sincronización */ }
  return resultados
}

function resumenEstadistico(filas, campoMonto) {
  const montos = filas.map(f => f[campoMonto]).filter(m => typeof m === 'number' && m > 0)
  if (!montos.length) return { min: null, max: null, promedio: null, n: 0 }
  return {
    min: Math.min(...montos),
    max: Math.max(...montos),
    promedio: Math.round(montos.reduce((a, b) => a + b, 0) / montos.length),
    n: montos.length,
  }
}

/** Benchmark local — reemplaza compraAgilApiClient.buscarOrdenesDeCompra (WAF-bloqueado). */
function benchmarkLocalPorSolicitante({ organismoRut, keyword, mesesAtras = 12 }) {
  if (!organismoRut) return { ordenes: [], estadisticas: resumenEstadistico([], 'monto_total') }
  const like = `%${keyword.toLowerCase()}%`
  const filas = db.prepare(`
    SELECT * FROM compra_agil_cotizaciones_historicas
    WHERE organismo_rut = ?
      AND (LOWER(producto_cotizado) LIKE ? OR LOWER(nombre_producto_generico) LIKE ? OR LOWER(descripcion_cotizacion) LIKE ?)
    ORDER BY fecha_cierre DESC LIMIT 100
  `).all(organismoRut, like, like, like)
  return { ordenes: mapearFilas(filas), estadisticas: resumenEstadistico(filas, 'monto_total') }
}

function benchmarkLocalPorMercado({ keyword, limite = 50 }) {
  const like = `%${keyword.toLowerCase()}%`
  const filas = db.prepare(`
    SELECT * FROM compra_agil_cotizaciones_historicas
    WHERE (LOWER(producto_cotizado) LIKE ? OR LOWER(nombre_producto_generico) LIKE ? OR LOWER(descripcion_cotizacion) LIKE ?)
    ORDER BY fecha_cierre DESC LIMIT ?
  `).all(like, like, like, limite)
  return { ordenes: mapearFilas(filas), estadisticas: resumenEstadistico(filas, 'monto_total') }
}

function mapearFilas(filas) {
  return filas.map(f => ({
    codigo: f.codigo_cotizacion,
    fecha: f.fecha_cierre,
    organismo_nombre: f.organismo_nombre,
    organismo_rut: f.organismo_rut,
    proveedor: f.proveedor_nombre,
    descripcion: f.producto_cotizado || f.nombre_producto_generico,
    monto_total: f.monto_total,
    cantidad: f.cantidad_solicitada,
    seleccionado: f.proveedor_seleccionado === 'si',
    mes_referencia: f.mes_referencia,
  }))
}

function estadoSincronizacion() {
  return db.prepare('SELECT * FROM compra_agil_datos_abiertos_meses ORDER BY mes_referencia DESC').all()
}

module.exports = {
  sincronizarMes,
  sincronizarMesesRecientes,
  benchmarkLocalPorSolicitante,
  benchmarkLocalPorMercado,
  estadoSincronizacion,
}
