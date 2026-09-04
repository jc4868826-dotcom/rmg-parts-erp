/**
 * RMG Parts — Librería de fichas técnicas ("utilitarios").
 *
 * Extrae fichas técnicas (PDF) del sitio de Vistony para los productos del
 * catálogo RMG (lista_precios, proveedor='Vistony') y las guarda en la tabla
 * catalogo_fichas_tecnicas — una librería reutilizable indexada por SKU y por
 * nombre de producto, consultable en cualquier momento por el sistema (no un
 * directorio en disco: esta app no tiene disco persistente de uploads, ver
 * comentario en database.js sobre documentos_adjuntos). Desde ahí se pueden
 * adjuntar a la ficha de cualquier postulación ChileCompra según los
 * productos que se estén ofertando — ver adjuntarFichasAOportunidad().
 *
 * ⚠️ IMPORTANTE — selectores pendientes de verificación en vivo:
 * Este entorno de desarrollo no tiene salida de red hacia
 * vistonylubricantes.cl (allowlist de egress bloquea el dominio), así que
 * los selectores CSS de abajo (SELECTORES) son la mejor estimación basada en
 * patrones típicos de sitios de fichas técnicas (Elementor/WordPress, que es
 * lo que corre vistonylubricantes.cl), pero NO se pudieron probar contra el
 * HTML real. Antes de usar este scraper en producción:
 *   1. Correr `node scripts/debug-scrape-vistony.js "<url de un producto>"`
 *      (ver más abajo) contra una URL real de producto y revisar qué trae.
 *   2. Ajustar SELECTORES según lo que se encuentre.
 * El resto del pipeline (descarga, hash, guardado en catalogo_fichas_tecnicas,
 * adjuntar a una oportunidad) está probado con un servidor HTTP local y no
 * depende de que los selectores sean exactos — solo la etapa de "encontrar el
 * link a la ficha técnica en la página del producto" necesita ese ajuste.
 */
const axios = require('axios')
const cheerio = require('cheerio')
const crypto = require('crypto')
const { db, uuidv4 } = require('../../config/database')

const BASE_URL = process.env.VISTONY_BASE_URL || 'https://www.vistonylubricantes.cl'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 RMG-AutoParts-Bot'

// Selectores/heurísticas para encontrar la ficha técnica en la página de un
// producto Vistony — ajustar tras verificar contra el sitio real (ver nota
// arriba). Se intentan en orden hasta encontrar un link.
const SELECTORES = {
  // Links con texto o clase que sugiera "ficha técnica" / "datasheet" / "TDS"
  linksFichaTexto: /ficha\s*t[ée]cnica|hoja\s*t[ée]cnica|datasheet|technical\s*data\s*sheet|\bTDS\b/i,
  // Cualquier <a href="...pdf"> dentro de la página de producto, como fallback
  linksPdfGenerico: /\.pdf(\?|$)/i,
  // Contenedor típico de producto (Elementor/WooCommerce) donde buscar los links
  contenedoresProducto: ['.product-summary', '.elementor-widget-container', '.woocommerce-product-details', 'main', 'body'],
}

const http = axios.create({
  timeout: 20000,
  headers: { 'User-Agent': USER_AGENT },
  maxRedirects: 5,
})

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Busca en una página HTML de producto el link a su ficha técnica en PDF.
 * Devuelve la URL absoluta encontrada, o null.
 */
function encontrarLinkFichaTecnica(html, urlBase) {
  const $ = cheerio.load(html)

  for (const selector of SELECTORES.contenedoresProducto) {
    const contenedor = $(selector).first()
    if (!contenedor.length) continue

    let encontrado = null
    contenedor.find('a[href]').each((_, el) => {
      if (encontrado) return
      const href = $(el).attr('href') || ''
      const texto = $(el).text() || ''
      if (SELECTORES.linksFichaTexto.test(texto) || SELECTORES.linksFichaTexto.test(href)) {
        encontrado = href
      }
    })
    if (encontrado) return new URL(encontrado, urlBase).toString()
  }

  // Fallback: cualquier link a .pdf en toda la página
  let pdfGenerico = null
  $('a[href]').each((_, el) => {
    if (pdfGenerico) return
    const href = $(el).attr('href') || ''
    if (SELECTORES.linksPdfGenerico.test(href)) pdfGenerico = href
  })
  return pdfGenerico ? new URL(pdfGenerico, urlBase).toString() : null
}

/**
 * Descarga un PDF desde una URL y devuelve { buffer, mimeType }.
 */
async function descargarPdf(url) {
  const res = await http.get(url, { responseType: 'arraybuffer' })
  const mimeType = res.headers['content-type'] || 'application/pdf'
  return { buffer: Buffer.from(res.data), mimeType }
}

/**
 * Intenta ubicar y descargar la ficha técnica de un producto a partir de la
 * URL de su página en vistonylubricantes.cl.
 */
async function extraerFichaDesdeUrlProducto(urlProducto) {
  const { data: html } = await http.get(urlProducto)
  const linkFicha = encontrarLinkFichaTecnica(html, urlProducto)
  if (!linkFicha) return null
  const { buffer, mimeType } = await descargarPdf(linkFicha)
  return { buffer, mimeType, urlOrigen: linkFicha }
}

/**
 * Guarda (o actualiza si el contenido cambió) una ficha técnica en la
 * librería catalogo_fichas_tecnicas.
 */
function guardarFichaEnLibreria({ productoSku, productoNombre, urlOrigen, buffer, mimeType, fuente = 'vistony' }) {
  const hash = sha256(buffer)
  const existente = productoSku
    ? db.prepare('SELECT * FROM catalogo_fichas_tecnicas WHERE producto_sku = ?').get(productoSku)
    : db.prepare('SELECT * FROM catalogo_fichas_tecnicas WHERE producto_nombre = ? AND producto_sku IS NULL').get(productoNombre)

  if (existente && existente.hash_contenido === hash) {
    return { id: existente.id, actualizado: false }
  }

  const nombreArchivo = `${(productoNombre || productoSku || 'ficha').replace(/[^\w.\- ]/g, '_')}.pdf`
  if (existente) {
    db.prepare(`
      UPDATE catalogo_fichas_tecnicas
      SET url_origen = ?, nombre_archivo = ?, mime_type = ?, contenido_base64 = ?, hash_contenido = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(urlOrigen, nombreArchivo, mimeType, buffer.toString('base64'), hash, existente.id)
    return { id: existente.id, actualizado: true }
  }

  const id = uuidv4()
  db.prepare(`
    INSERT INTO catalogo_fichas_tecnicas
      (id, producto_sku, producto_nombre, fuente, url_origen, nombre_archivo, mime_type, contenido_base64, hash_contenido)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, productoSku || null, productoNombre, fuente, urlOrigen, nombreArchivo, mimeType, buffer.toString('base64'), hash)
  return { id, actualizado: false, creado: true }
}

/**
 * Extrae la ficha técnica de UN producto de lista_precios y la guarda en la
 * librería. `urlProducto` puede venir explícita (si ya se conoce/mapeó) o
 * se puede intentar construir a partir del sitio de búsqueda de Vistony.
 */
async function extraerYGuardarFichaProducto(skuLista, urlProductoOverride) {
  const sku = db.prepare('SELECT * FROM lista_precios WHERE codigo_sku = ? LIMIT 1').get(skuLista)
  if (!sku) throw new Error(`SKU ${skuLista} no encontrado en lista_precios`)

  const urlProducto = urlProductoOverride || `${BASE_URL}/?s=${encodeURIComponent(sku.descripcion)}`
  const ficha = await extraerFichaDesdeUrlProducto(urlProducto)
  if (!ficha) return { sku: skuLista, encontrada: false }

  const resultado = guardarFichaEnLibreria({
    productoSku: sku.codigo_sku,
    productoNombre: sku.descripcion,
    urlOrigen: ficha.urlOrigen,
    buffer: ficha.buffer,
    mimeType: ficha.mimeType,
  })
  return { sku: skuLista, encontrada: true, ...resultado }
}

/**
 * Scrape masivo: recorre TODO el catálogo RMG de productos Vistony (no todo
 * el sitio de Vistony — alcance acordado con el usuario) y extrae/actualiza
 * la ficha técnica de cada uno en la librería. Pensado para correr como
 * mantención periódica (botón/endpoint de "utilitarios"), no en el flujo de
 * cada postulación individual.
 */
async function extraerCatalogoVistony({ limite = null, onProgreso } = {}) {
  const skus = db.prepare(`
    SELECT DISTINCT codigo_sku, descripcion FROM lista_precios
    WHERE proveedor = 'Vistony' AND codigo_sku IS NOT NULL
    ORDER BY codigo_sku
  `).all()

  const aProcesar = limite ? skus.slice(0, limite) : skus
  const resultados = { total: aProcesar.length, encontradas: 0, sinFicha: 0, errores: [] }

  for (const s of aProcesar) {
    try {
      const r = await extraerYGuardarFichaProducto(s.codigo_sku)
      if (r.encontrada) resultados.encontradas++
      else resultados.sinFicha++
    } catch (e) {
      resultados.errores.push({ sku: s.codigo_sku, error: e.message })
    }
    if (onProgreso) onProgreso({ sku: s.codigo_sku, ...resultados })
  }
  return resultados
}

/**
 * Botón "Extraer fichas técnicas" de una oportunidad ChileCompra: para cada
 * ítem con SKU emparejado, busca su ficha en la librería (catalogo_fichas_
 * tecnicas); si no está, la extrae de Vistony al vuelo y la guarda ahí antes
 * de adjuntarla. Adjunta cada ficha encontrada a la ficha de la postulación
 * (documentos_adjuntos, entidad='oportunidad_chilecompra').
 */
async function adjuntarFichasAOportunidad(oportunidadId, usuario) {
  const items = db.prepare(`
    SELECT DISTINCT sku_match FROM oportunidad_chilecompra_items
    WHERE oportunidad_id = ? AND sku_match IS NOT NULL AND sku_match != '—'
  `).all(oportunidadId)

  const resultado = { total: items.length, adjuntadas: 0, sinFicha: [], errores: [] }

  for (const { sku_match } of items) {
    try {
      let ficha = db.prepare('SELECT * FROM catalogo_fichas_tecnicas WHERE producto_sku = ?').get(sku_match)
      if (!ficha) {
        const extra = await extraerYGuardarFichaProducto(sku_match)
        if (extra.encontrada) {
          ficha = db.prepare('SELECT * FROM catalogo_fichas_tecnicas WHERE id = ?').get(extra.id)
        }
      }
      if (!ficha) {
        resultado.sinFicha.push(sku_match)
        continue
      }

      // Evitar duplicar el mismo adjunto si el botón se presiona más de una vez.
      const yaAdjunta = db.prepare(`
        SELECT id FROM documentos_adjuntos
        WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ? AND nombre_archivo = ?
      `).get(oportunidadId, ficha.nombre_archivo)
      if (yaAdjunta) { resultado.adjuntadas++; continue }

      db.prepare(`
        INSERT INTO documentos_adjuntos
          (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(uuidv4(), 'oportunidad_chilecompra', oportunidadId, 'pdf', ficha.nombre_archivo, ficha.mime_type, ficha.contenido_base64, usuario?.id || null)
      resultado.adjuntadas++
    } catch (e) {
      resultado.errores.push({ sku: sku_match, error: e.message })
    }
  }
  return resultado
}

module.exports = {
  encontrarLinkFichaTecnica,
  descargarPdf,
  extraerFichaDesdeUrlProducto,
  guardarFichaEnLibreria,
  extraerYGuardarFichaProducto,
  extraerCatalogoVistony,
  adjuntarFichasAOportunidad,
}
