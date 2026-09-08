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
const ESPERA_RENDER_MS = 2500
const USER_AUTOMATICO = { email: 'scraper-automatico' }

// ── Estado compartido (una sola corrida a la vez, sea por cron o por el botón
// "Buscar ahora") ────────────────────────────────────────────────────────────
// El endpoint /scrapear-ahora NO puede esperar a que esto termine (1-3 min):
// el proxy de Render corta conexiones HTTP largas antes de eso y el navegador
// del usuario muestra "Network Error" aunque el servidor siga trabajando bien
// de fondo — confirmado en producción (2026-09-08). Por eso el controlador
// dispara detectarYImportarNuevas() SIN esperarlo (fire-and-forget) y el
// frontend consulta este estado por separado (GET /scraper-estado) hasta que
// termine, en vez de mantener la conexión original abierta.
let _corriendo = false
let _ultimoResumen = null

function estado() {
  return { corriendo: _corriendo, ultimoResumen: _ultimoResumen }
}

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
 * Espera a que la SPA termine de pintar (no hay señal de red confiable — ver
 * nota en extraerCodigosDeListado) y devuelve el texto renderizado. Si el
 * texto sale sospechosamente corto (la SPA todavía en su spinner de carga),
 * reintenta UNA vez con más margen antes de darse por vencido — más barato y
 * más robusto que subir el timeout fijo para todos los casos.
 */
async function esperarTextoRenderizado(page, minCaracteres = 200) {
  await new Promise(r => setTimeout(r, ESPERA_RENDER_MS))
  let texto = await page.evaluate(() => document.body.innerText)
  if (texto.length < minCaracteres) {
    await new Promise(r => setTimeout(r, ESPERA_RENDER_MS * 2))
    texto = await page.evaluate(() => document.body.innerText)
  }
  return texto
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
    // 'domcontentloaded', NO 'networkidle2': el buscador mantiene conexiones
    // de fondo (analytics, etc.) que nunca quedan "quietas" — con
    // networkidle2 cada navegación esperaba el timeout completo (30s) sin
    // avanzar nunca, dejando la búsqueda entera en cero resultados sin que
    // se notara (quedaba como error silencioso por keyword). La espera fija
    // de ESPERA_RENDER_MS de abajo es la que realmente le da tiempo a la SPA
    // para pintar los resultados.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const texto = await esperarTextoRenderizado(page)

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
  await page.goto(`${BASE}/ficha?code=${encodeURIComponent(codigo)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  return esperarTextoRenderizado(page)
}

/**
 * Pasada completa: busca por cada keyword del rubro RMG, detecta códigos
 * nuevos (que no existan ya como oportunidad de Compra Ágil) y los importa
 * automáticamente con el mismo pipeline de siempre. Pensada para correr
 * seguido vía cron (ver compraAgilScraperCron.js) — sin ningún paso manual.
 */
// ── INTERRUPTOR DE EMERGENCIA (2026-09-08, tarde) ───────────────────────────
// Confirmado en los eventos de Render: lanzar Chromium (headless) tumbaba
// TODO el servidor con "Ran out of memory (used over 512MB)" — el plan
// actual de Render ("Starter", 512MB) no alcanza para el resto de la app
// (la base SQLite completa vive en memoria vía sql.js — el respaldo pesaba
// ~114MB solo esa) MÁS un Chromium real corriendo encima. El resultado fue
// un crash-loop cada pocos minutos (login fallando, dashboard en cero) desde
// que se activó este scraper — nada que ver con el login en sí.
//
// Mientras no se resuelva esto (subir el plan de Render, o mover el scraper
// a un servicio/worker aparte con su propia memoria), el detector queda
// apagado por defecto: no lanza Chromium, solo avisa por qué. Para
// reactivarlo cuando haya memoria de sobra, poner la variable de entorno
// COMPRA_AGIL_SCRAPER_ENABLED=true en Render. El código del scraper en sí
// (todo lo de abajo) NO se tocó — sigue listo para usarse tal cual.
const SCRAPER_HABILITADO = process.env.COMPRA_AGIL_SCRAPER_ENABLED === 'true'
const MOTIVO_DESHABILITADO =
  'Detector automático deshabilitado temporalmente: lanzar el navegador headless (Chromium) ' +
  'satura la memoria del plan actual de Render (512MB) y tumbaba todo el sistema (confirmado ' +
  'en los eventos de Render — "Ran out of memory"). Hay que subir el plan de Render (más RAM) o ' +
  'mover este scraper a un servicio aparte antes de reactivarlo — ver detalle en ' +
  'RMG_CompraAgil_Implementacion.md del proyecto.'

async function detectarYImportarNuevas({ user = USER_AUTOMATICO } = {}) {
  if (!SCRAPER_HABILITADO) {
    const resumen = {
      keywordsRevisadas: 0, codigosVistos: 0, nuevas: 0, importadas: [],
      errores: [MOTIVO_DESHABILITADO], deshabilitado: true,
      iniciado: new Date().toISOString(), finalizado: new Date().toISOString(),
    }
    _ultimoResumen = resumen
    return resumen
  }
  if (_corriendo) {
    // Ya hay una corrida en curso (cron o botón) — no se solapan, evita que
    // dos navegadores headless corran a la vez y agoten la memoria de Render.
    return { yaEnCurso: true, ...(_ultimoResumen || {}) }
  }
  _corriendo = true

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
    _corriendo = false
  }

  resumen.finalizado = new Date().toISOString()
  console.log(
    `ℹ️ Compra Ágil scraper — ${resumen.keywordsRevisadas} keyword(s), ` +
    `${resumen.codigosVistos} código(s) vistos, ${resumen.nuevas} nueva(s), ` +
    `${resumen.importadas.length} importada(s), ${resumen.errores.length} error(es)`
  )
  _ultimoResumen = resumen
  return resumen
}

module.exports = { detectarYImportarNuevas, extraerCodigosDeListado, extraerTextoFicha, estado }
