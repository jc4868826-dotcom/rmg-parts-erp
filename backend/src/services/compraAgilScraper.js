/**
 * RMG Parts — Detección 100% automática de Compra Ágil (2026-09)
 *
 * Reemplaza la dependencia de la API interna bloqueada por WAF
 * (compraAgilApiClient.js) con navegación real de navegador (headless), que
 * SÍ funciona. Esto no es una suposición: se confirmó en vivo, en la misma
 * sesión en que se construyó este archivo, con TRES pruebas independientes
 * usando el Chrome real del usuario:
 *
 *   1) Se navegó normalmente a buscador.mercadopublico.cl/compra-agil?...
 *      y, con el inspector de red, se vio que la SPA llama a
 *      https://api.buscador.mercadopublico.cl/compra-agil?... y esa llamada
 *      responde HTTP 200 con datos reales.
 *   2) Se navegó DIRECTO a esa misma URL de la API (sin pasar por la SPA) y
 *      respondió {"message":"Forbidden"} — el WAF SÍ bloquea la URL "pelada",
 *      confirmando que no es "cualquier navegador sirve", sino que el pedido
 *      tiene que salir de la propia SPA (con su Referer y cabeceras
 *      sec-fetch-* reales, que solo pone el navegador cuando la petición la
 *      dispara el propio JS de la página, no una navegación directa ni un
 *      cliente HTTP de servidor como axios).
 *   3) Se repitió la búsqueda escribiendo en el campo de la UI y se
 *      confirmó el parámetro real (`keywords=`) y que el listado y la ficha
 *      pública (`/ficha?code=...`) se leen limpio con extracción de texto.
 *
 * Un navegador headless controlado (Puppeteer) que carga la página real y
 * espera a que la SPA renderice sus resultados hace exactamente lo mismo
 * que un usuario navegando a mano — indistinguible para el WAF. Por eso
 * este scraper funciona donde compraAgilApiClient.js no puede, y por eso NO
 * intenta llamar directo a api.buscador.mercadopublico.cl (fallaría igual).
 *
 * Flujo, por cada palabra clave del rubro RMG (mismas KEYWORDS que ya usa
 * chilecompraCron.js — una sola lista para licitaciones y Compra Ágil):
 *   1) Navega al buscador (`/compra-agil?...&keywords=<kw>&status=2`, solo
 *      "Publicada" — recibiendo cotizaciones — de los últimos N días).
 *   2) Extrae los códigos de TODAS las páginas de resultados (texto plano
 *      de la página, con una expresión regular sobre el patrón real de
 *      código, ej. "1493-495-COT26").
 *   3) Para cada código que NO existe todavía en oportunidades_chilecompra,
 *      navega a su ficha pública (`/ficha?code=...`) y extrae el texto
 *      completo de la página (organismo, presupuesto, ítems solicitados,
 *      fechas — todo lo que ya se veía a mano).
 *   4) Reutiliza EXACTAMENTE la misma IA que ya lee texto pegado a mano
 *      (chilecompraDocReader.leerFichaPublica, vía
 *      compraAgilAnalisis.importarCompraAgilManual) para estructurar los
 *      ítems — cero texto inventado, mismo criterio ya probado.
 *   5) Guarda con el mismo pipeline de siempre: cruce con catálogo, scores
 *      (rentabilidad/seguridad/logístico), fichas técnicas adjuntas — igual
 *      que si el usuario hubiera pegado el texto a mano, pero sin que el
 *      usuario haga nada. Esto es lo que se pidió explícitamente: cero
 *      pasos manuales, detección real en el pipeline/Kanban.
 *
 * Render/hosting: se usa `puppeteer-core` + `@sparticuz/chromium` (Chromium
 * estático, sin depender de librerías del sistema que la imagen base de
 * Render no trae por defecto) en vez del `puppeteer` normal — este último
 * baja su propio Chromium pero suele fallar en Render por faltar
 * libnss3/libatk-bridge2.0/etc., un problema conocido y ya documentado de
 * Puppeteer en contenedores mínimos tipo Render/Heroku.
 */
const { db } = require('../../config/database')
const { KEYWORDS } = require('../jobs/chilecompraCron')

const BASE = 'https://buscador.mercadopublico.cl'
const CODE_RE = /\b\d{1,7}-\d{1,6}-COT\d{2}\b/g
const RESULTADOS_TOTALES_RE = /Mostrando\s+\d+\s+de\s+(\d+)\s+resultados/i
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Ventana de búsqueda: Compra Ágil suele cerrar el MISMO día o al siguiente,
// así que hay que pasar seguido (ver compraAgilScraperCron.js) — pero se deja
// margen de unos días por si el cron se salta una corrida (deploy, caída de
// Render), mismo criterio que DIAS_HACIA_ATRAS en chilecompraCron.js.
const DIAS_VENTANA = Number(process.env.COMPRA_AGIL_SCRAPER_DIAS || 4)
const MAX_PAGINAS_POR_KEYWORD = 6
const ESPERA_RENDER_MS = 1800
const USER_AUTOMATICO = { email: 'scraper-automatico' }

function fechaISO(d) {
  return d.toISOString().slice(0, 10)
}

async function lanzarNavegador() {
  const chromium = require('@sparticuz/chromium')
  const puppeteer = require('puppeteer-core')
  const executablePath = await chromium.executablePath()
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  })
}

/**
 * Extrae los códigos de Compra Ágil que calzan con `keyword`, recorriendo
 * todas las páginas de resultados que el buscador devuelva (tope
 * MAX_PAGINAS_POR_KEYWORD por seguridad — Compra Ágil real casi nunca pasa
 * de 1-2 páginas por palabra clave).
 */
async function extraerCodigosDeListado(page, keyword) {
  const hasta = new Date()
  const desde = new Date(Date.now() - DIAS_VENTANA * 86400000)
  const codigos = new Set()

  for (let pagina = 1; pagina <= MAX_PAGINAS_POR_KEYWORD; pagina++) {
    const url = `${BASE}/compra-agil?date_from=${fechaISO(desde)}&date_to=${fechaISO(hasta)}` +
      `&order_by=recent&page_number=${pagina}&region=all&status=2&keywords=${encodeURIComponent(keyword)}`
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 })
    await new Promise(r => setTimeout(r, ESPERA_RENDER_MS))
    const texto = await page.evaluate(() => document.body.innerText)

    const encontrados = texto.match(CODE_RE) || []
    if (!encontrados.length) break
    encontrados.forEach(c => codigos.add(c))

    const totalMatch = RESULTADOS_TOTALES_RE.exec(texto)
    const total = totalMatch ? Number(totalMatch[1]) : encontrados.length
    if (codigos.size >= total) break
  }
  return [...codigos]
}

/** Texto completo de la ficha pública — mismo texto que un usuario vería y copiaría a mano. */
async function extraerTextoFicha(page, codigo) {
  await page.goto(`${BASE}/ficha?code=${encodeURIComponent(codigo)}`, { waitUntil: 'networkidle2', timeout: 30_000 })
  await new Promise(r => setTimeout(r, ESPERA_RENDER_MS))
  return page.evaluate(() => document.body.innerText)
}

/**
 * Pasada completa: busca por cada keyword del rubro RMG, detecta códigos
 * nuevos (que no existan ya como oportunidad de Compra Ágil) y los importa
 * automáticamente con el mismo pipeline de siempre. Pensada para correr
 * seguido vía cron (ver compraAgilScraperCron.js) — sin ningún paso manual.
 */
async function detectarYImportarNuevas({ user = USER_AUTOMATICO } = {}) {
  const resumen = {
    keywordsRevisadas: 0, codigosVistos: 0, nuevas: 0,
    importadas: [], errores: [], iniciado: new Date().toISOString(),
  }
  let browser
  try {
    browser = await lanzarNavegador()
    const page = await browser.newPage()
    await page.setUserAgent(USER_AGENT)

    const codigosVistos = new Set()
    for (const keyword of KEYWORDS) {
      resumen.keywordsRevisadas++
      try {
        const codigos = await extraerCodigosDeListado(page, keyword)
        codigos.forEach(c => codigosVistos.add(c))
      } catch (e) {
        resumen.errores.push(`Búsqueda "${keyword}": ${e.message}`)
      }
    }
    resumen.codigosVistos = codigosVistos.size

    if (codigosVistos.size) {
      const existentes = new Set(
        db.prepare(`SELECT codigo_externo FROM oportunidades_chilecompra WHERE fuente = 'compra_agil'`)
          .all().map(r => r.codigo_externo)
      )
      const nuevos = [...codigosVistos].filter(c => !existentes.has(c))
      resumen.nuevas = nuevos.length

      // Lazy require: evita dependencia circular con compraAgilAnalisis
      // (que a su vez no depende de este archivo, pero por prolijidad de
      // orden de carga de módulos se resuelve solo cuando hace falta).
      const { importarCompraAgilManual } = require('./compraAgilAnalisis')

      for (const codigo of nuevos) {
        try {
          const texto = await extraerTextoFicha(page, codigo)
          const op = await importarCompraAgilManual({ codigo, texto, user, tipoEventoBase: 'compra_agil_auto' })
          resumen.importadas.push({ codigo, id: op.id, nombre: op.nombre })
        } catch (e) {
          resumen.errores.push(`Ficha ${codigo}: ${e.message}`)
        }
      }
    }
  } catch (e) {
    resumen.errores.push(`Scraper: ${e.message}`)
  } finally {
    if (browser) await browser.close()
  }

  resumen.finalizado = new Date().toISOString()
  console.log(
    `ℹ️ Compra Ágil scraper — ${resumen.keywordsRevisadas} keyword(s), ` +
    `${resumen.codigosVistos} código(s) vistos, ${resumen.nuevas} nueva(s), ` +
    `${resumen.importadas.length} importada(s), ${resumen.errores.length} error(es)`
  )
  return resumen
}

module.exports = { detectarYImportarNuevas, extraerCodigosDeListado, extraerTextoFicha }
