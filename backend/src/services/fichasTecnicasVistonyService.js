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
 * ── Verificado contra el sitio real (2026-09) ──────────────────────────────
 * La v1 de este archivo se escribió sin poder alcanzar vistonylubricantes.cl
 * desde el entorno de desarrollo (egress bloqueado) y falló en producción:
 * 0 fichas encontradas. Se navegó el sitio real y se confirmó lo siguiente,
 * que cambia el enfoque de raíz:
 *
 *  1. NO es una URL de dominio con "www" — es `https://vistonylubricantes.cl`
 *     (sin www).
 *  2. NO existe una búsqueda `?s=` útil para encontrar productos — esa ruta
 *     devuelve contenido de blog/SEO (artículos), nunca la página de un
 *     producto. Por eso la v1 (que construía la URL así) nunca encontraba
 *     nada.
 *  3. Las páginas de producto SÍ son URLs reales y estables del tipo
 *     `/producto/<categoria>/<slug>/` (WordPress con permalinks, servidor,
 *     NO una SPA) — ej.
 *     `/producto/refrigerantes/ice-freeze-organico-50-50-green/`.
 *  4. El sitio no tiene un índice/listado único de productos: hay que
 *     recorrer las páginas de categoría (`/productos/<categoria>/`), que a
 *     veces listan productos directo y a veces tienen sub-categorías o
 *     sub-sub-categorías anidadas (ej. Lubricantes → Lubricantes
 *     Industriales → Compresores de Aire). Cada tarjeta de producto es un
 *     `<a href="/producto/.../">` que envuelve una `<img alt="NOMBRE DEL
 *     PRODUCTO">` — el nombre está en el atributo `alt`, no en un texto
 *     visible junto al link. Ver construirIndiceProductos().
 *  5. En la página de un producto, el link a la ficha técnica en PDF es un
 *     `<a href=".../wp-content/uploads/AAAA/MM/NOMBRE-ARCHIVO.pdf">` que
 *     también envuelve solo una imagen (el ícono de PDF) — SIN texto "ficha
 *     técnica" en el link ni en su href. El selector v1 que buscaba ese
 *     texto literal nunca podía matchear. La página puede tener OTROS PDF
 *     ajenos al producto (ej. banners promocionales en el header) — hay que
 *     excluirlos explícitamente. Ver encontrarLinkFichaTecnica().
 *  6. "Ficha de seguridad" (distinto de "Ficha Técnica") no es un PDF directo
 *     — abre un formulario de captura de datos (nombre/email) antes de
 *     entregarla. No se soporta acá (fuera del alcance acordado: solo ficha
 *     técnica).
 *
 * El resto del pipeline (descarga, hash, guardado en catalogo_fichas_
 * tecnicas, adjuntar a una oportunidad) ya estaba probado con un servidor
 * HTTP local y no cambió.
 */
const axios = require('axios')
const cheerio = require('cheerio')
const crypto = require('crypto')
const { db, uuidv4 } = require('../../config/database')

const BASE_URL = process.env.VISTONY_BASE_URL || 'https://vistonylubricantes.cl'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 RMG-AutoParts-Bot'

// Categorías raíz confirmadas en el menú "Productos" del sitio (2026-09).
// Si Vistony agrega/renombra una categoría, construirIndiceProductos igual
// va a encontrar sus productos SIEMPRE que esté enlazada desde alguna de
// estas raíces o desde una de sus sub-categorías (el crawler profundiza
// recursivamente dentro del propio árbol /productos/... — ver abajo). Solo
// hay que tocar esta lista si Vistony agrega una sección totalmente nueva
// que no cuelgue de ninguna de estas.
const CATEGORIAS_RAIZ = [
  '/productos/lubricantes/',
  '/productos/grasas-lubricantes/',
  '/productos/liquidos-de-frenos/',
  '/productos/refrigerantes/',
  '/productos/car-care/',
  '/productos/auxiliares-de-mantenimiento/',
  '/productos/aditivos/',
]

// PDFs que aparecen en páginas de producto pero NO son la ficha técnica
// (banners/promos del sitio, términos y condiciones, etc.) — se excluyen
// explícitamente al buscar el link de la ficha.
const PDF_BLACKLIST = /(terminos|t[ée]rminos|condiciones|promo|promoci[oó]n|politica|pol[ií]tica|bases-legales|panetones)/i

const INDICE_TTL_MS = 6 * 60 * 60 * 1000 // 6 horas — evita recorrer el sitio en cada llamada
let indiceCache = null // { productos: [{url, nombre}], builtAt }

const http = axios.create({
  timeout: 20000,
  headers: { 'User-Agent': USER_AGENT },
  maxRedirects: 5,
})

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function normalizarTexto(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Recorre el árbol de categorías de vistonylubricantes.cl (empezando en
 * CATEGORIAS_RAIZ) y arma un índice {url, nombre} de todos los productos
 * encontrados. Profundiza en sub-categorías automáticamente: desde la
 * página de una categoría, cualquier link a /productos/... que sea "más
 * profundo" que la página actual (ej. desde /productos/lubricantes/ hacia
 * /productos/lubricantes/lubricantes-industriales/) se encola también —
 * así cubre categorías anidadas (Lubricantes Industriales tiene a su vez
 * ~15 sub-sub-categorías: Compresores de Aire, Reductores Industriales,
 * etc.) sin tener que hardcodear cada una. Resultado cacheado en memoria
 * por INDICE_TTL_MS para no recorrer el sitio completo en cada consulta.
 */
async function construirIndiceProductos({ forzar = false } = {}) {
  if (!forzar && indiceCache && Date.now() - indiceCache.builtAt < INDICE_TTL_MS) {
    return indiceCache.productos
  }

  const visitadas = new Set()
  const productos = new Map() // url -> nombre
  const porVisitar = CATEGORIAS_RAIZ.map(p => new URL(p, BASE_URL).toString())
  const erroresCategoria = []

  while (porVisitar.length) {
    const url = porVisitar.shift()
    if (visitadas.has(url)) continue
    visitadas.add(url)
    if (visitadas.size > 100) break // límite de seguridad ante un ciclo inesperado

    let html
    try {
      const res = await http.get(url)
      html = res.data
    } catch (e) {
      erroresCategoria.push({ url, error: e.message })
      continue // una categoría caída no debe frenar el resto del crawl
    }
    const $ = cheerio.load(html)

    $('a[href*="/producto/"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const abs = new URL(href, url).toString().split('#')[0]
      const nombre = ($(el).find('img').attr('alt') || $(el).text() || '').trim()
      if (nombre && !productos.has(abs)) productos.set(abs, nombre)
    })

    // Sub-categorías: solo se profundiza dentro del propio árbol de la
    // categoría actual (abs.startsWith(url)) — evita que el menú de
    // navegación (presente en cada página, con links a TODAS las
    // categorías raíz) dispare un crawl del sitio completo desde cada nodo.
    $('a[href*="/productos/"]').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const abs = new URL(href, url).toString().split('#')[0]
      if (abs === url || visitadas.has(abs) || porVisitar.includes(abs)) return
      if (abs.startsWith(url) && /\/productos\/.+\/$/.test(abs)) {
        porVisitar.push(abs)
      }
    })
  }

  indiceCache = {
    productos: Array.from(productos, ([url, nombre]) => ({ url, nombre })),
    builtAt: Date.now(),
    erroresCategoria,
  }

  // Antes esto se guardaba en el caché pero nunca se leía en ningún lado: si
  // Vistony bloqueaba el bot (403/timeout) en las 7 categorías raíz, el índice
  // quedaba vacío y el único síntoma visible aguas abajo era "0/1 adjuntadas",
  // sin ninguna pista de por qué. Ahora queda al menos en el log del servidor.
  if (erroresCategoria.length) {
    console.warn(
      `⚠️ construirIndiceProductos: ${erroresCategoria.length}/${CATEGORIAS_RAIZ.length + erroresCategoria.length} categoría(s) fallaron al recorrer vistonylubricantes.cl —`,
      erroresCategoria.map(e => `${e.url}: ${e.error}`).join(' | ')
    )
  }
  if (!indiceCache.productos.length) {
    console.warn('⚠️ construirIndiceProductos: el índice quedó vacío (0 productos) — probable bloqueo del sitio o cambio de estructura HTML, ver errores arriba.')
  }

  return indiceCache.productos
}

/**
 * Igual que construirIndiceProductos, pero además del array de productos
 * expone los errores de crawl y si el índice quedó vacío — para que
 * extraerYGuardarFichaProducto pueda distinguir "no hay un producto Vistony
 * parecido" de "no se pudo ni siquiera leer el sitio de Vistony".
 */
async function construirIndiceProductosConDiagnostico(opts) {
  const productos = await construirIndiceProductos(opts)
  return { productos, erroresCategoria: indiceCache?.erroresCategoria || [] }
}

/**
 * Busca dentro del índice de productos Vistony el que mejor calza con un
 * texto (típicamente descripcion+producto_generico de un SKU RMG). Misma
 * heurística de solapamiento de palabras que buscarSkuCandidato en
 * chilecompraScoring.js — umbral más laxo (0.25) porque acá ya se está dentro
 * del universo real de productos Vistony, no del catálogo completo de RMG.
 *
 * Umbral de largo de palabra bajado de 3 a 2: con 3, códigos SAE/ACEA de dos
 * caracteres como "C3", "B4", "SN" quedaban descartados del match aunque son
 * justamente las palabras más distintivas de una descripción de lubricante
 * (p.ej. "ATTOM S320 SAE 5W-30 ACEA C3/API SN DE 5 L" perdía "c3" y "sn").
 */
function buscarProductoVistony(textoBusqueda, indice) {
  const palabras = normalizarTexto(textoBusqueda)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2)
  if (!palabras.length || !indice.length) return null

  let mejor = null
  let mejorScore = 0
  for (const p of indice) {
    const campo = normalizarTexto(p.nombre)
    const matches = palabras.filter(w => campo.includes(w)).length
    const score = matches / palabras.length
    if (score > mejorScore) { mejorScore = score; mejor = p }
  }
  return mejor && mejorScore >= 0.25 ? { ...mejor, score: mejorScore } : null
}

/**
 * Busca en una página HTML de producto el link a su ficha técnica en PDF.
 * Devuelve la URL absoluta encontrada, o null. Ver nota (5) al inicio del
 * archivo: el link de la ficha técnica envuelve solo un ícono (sin texto
 * "ficha técnica"), así que se identifica por ser un <a href="....pdf">
 * fuera del header/footer/nav (donde suelen vivir PDFs ajenos al producto,
 * como promociones) y que no matchea PDF_BLACKLIST.
 */
function encontrarLinkFichaTecnica(html, urlBase) {
  const $ = cheerio.load(html)
  $('header, footer, nav').remove()

  let encontrado = null
  $('a[href$=".pdf"], a[href*=".pdf?"]').each((_, el) => {
    if (encontrado) return
    const href = $(el).attr('href') || ''
    if (!href || PDF_BLACKLIST.test(href)) return
    encontrado = href
  })
  return encontrado ? new URL(encontrado, urlBase).toString() : null
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
 * librería. `urlProducto` puede venir explícita (si ya se conoce/mapeó) o,
 * si no, se busca la página real del producto dentro del índice del sitio
 * (construirIndiceProductos + buscarProductoVistony) — ya no se construye
 * una URL de búsqueda a ciegas (ver nota (2) al inicio del archivo).
 */
async function extraerYGuardarFichaProducto(skuLista, urlProductoOverride) {
  const sku = db.prepare('SELECT * FROM lista_precios WHERE codigo_sku = ? LIMIT 1').get(skuLista)
  if (!sku) throw new Error(`SKU ${skuLista} no encontrado en lista_precios`)

  let urlProducto = urlProductoOverride
  let matchInfo = null
  if (!urlProducto) {
    const { productos: indice, erroresCategoria } = await construirIndiceProductosConDiagnostico()
    if (!indice.length) {
      const detalleErrores = erroresCategoria.length
        ? ` (${erroresCategoria.length} categoría(s) fallaron al leer vistonylubricantes.cl, p.ej. "${erroresCategoria[0].error}")`
        : ' (el sitio no devolvió ningún producto, aunque respondió sin error)'
      return { sku: skuLista, encontrada: false, motivo: `no se pudo construir el índice de productos de Vistony${detalleErrores}` }
    }
    const textoBusqueda = `${sku.descripcion || ''} ${sku.producto_generico || ''}`
    matchInfo = buscarProductoVistony(textoBusqueda, indice)
    if (!matchInfo) {
      return { sku: skuLista, encontrada: false, motivo: `no se encontró un producto equivalente en vistonylubricantes.cl para "${textoBusqueda.trim()}"` }
    }
    urlProducto = matchInfo.url
  }

  const ficha = await extraerFichaDesdeUrlProducto(urlProducto)
  if (!ficha) {
    return { sku: skuLista, encontrada: false, motivo: `se encontró la página del producto (${urlProducto}) pero no un PDF de ficha técnica en ella`, urlProducto }
  }

  const resultado = guardarFichaEnLibreria({
    productoSku: sku.codigo_sku,
    productoNombre: sku.descripcion,
    urlOrigen: ficha.urlOrigen,
    buffer: ficha.buffer,
    mimeType: ficha.mimeType,
  })
  return { sku: skuLista, encontrada: true, urlProducto, matchScore: matchInfo?.score, ...resultado }
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
      // Guarda por marca — auditoría confirmó que buscarSkuCandidato() (en
      // chilecompraScoring.js) NO filtra por marca='Vistony' al elegir el
      // SKU: puede matchear legítimamente productos AUSTER u otra marca del
      // catálogo (de hecho AUSTER tiene mejor ranking_compra promedio que
      // Vistony). El problema real es que ESTE archivo solo sabe buscar
      // fichas en vistonylubricantes.cl — para un SKU de otra marca,
      // extraerYGuardarFichaProducto() siempre iba a fallar en silencio
      // ("no se encontró un producto equivalente"), sin dejar claro que la
      // causa es la marca y no un fallo del scraper. Se detecta antes de
      // intentar la búsqueda para dar un motivo preciso y no gastar una
      // llamada HTTP innecesaria al sitio de Vistony.
      const skuInfo = db.prepare('SELECT marca FROM lista_precios WHERE codigo_sku = ? LIMIT 1').get(sku_match)
      if (skuInfo && skuInfo.marca && skuInfo.marca.trim().toLowerCase() !== 'vistony') {
        resultado.sinFicha.push({
          sku: sku_match,
          motivo: `SKU de marca "${skuInfo.marca}" — la extracción automática de fichas técnicas solo cubre productos Vistony (vistonylubricantes.cl). Adjuntar esta ficha manualmente.`,
        })
        continue
      }

      let ficha = db.prepare('SELECT * FROM catalogo_fichas_tecnicas WHERE producto_sku = ?').get(sku_match)
      let extra = null
      if (!ficha) {
        extra = await extraerYGuardarFichaProducto(sku_match)
        if (extra.encontrada) {
          ficha = db.prepare('SELECT * FROM catalogo_fichas_tecnicas WHERE id = ?').get(extra.id)
        }
      }
      if (!ficha) {
        resultado.sinFicha.push({ sku: sku_match, motivo: extra?.motivo || 'sin motivo registrado' })
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
  construirIndiceProductos,
  buscarProductoVistony,
  encontrarLinkFichaTecnica,
  descargarPdf,
  extraerFichaDesdeUrlProducto,
  guardarFichaEnLibreria,
  extraerYGuardarFichaProducto,
  extraerCatalogoVistony,
  adjuntarFichasAOportunidad,
}
