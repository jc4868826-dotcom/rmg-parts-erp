/**
 * RMG Parts — Controlador Compra Ágil
 *
 * Endpoints propios (montados en /api/compra-agil, NO anidados bajo
 * /api/chilecompra/:id para no chocar con su catch-all genérico). Reutiliza
 * las mismas tablas oportunidades_chilecompra / oportunidad_chilecompra_items
 * (fuente='compra_agil') y las mismas rutas de detalle/cambio de estado ya
 * expuestas en /api/chilecompra/:id — este controlador solo agrega lo nuevo:
 * importar por código, los dos botones de benchmark, y el fundamento de
 * cotización con IA.
 */
const { db } = require('../../config/database')
const {
  importarCompraAgil, importarCompraAgilManual, generarFundamentoCotizacion, sugerirPrecio,
  detectarYImportarAutomatico, estado: estadoDetector,
} = require('../services/compraAgilAnalisis')
const { benchmarkPorSolicitante, benchmarkPorMercado } = require('../services/compraAgilBenchmark')
const datosAbiertos = require('../services/compraAgilDatosAbiertos')
const { REGIONES } = require('../services/compraAgilApiClient')

// ── Regiones disponibles para el filtro de "Buscar ahora" (2026-09-09) ─────
const regionesDisponibles = (req, res) => {
  res.json(Object.entries(REGIONES).map(([codigo, nombre]) => ({ codigo: Number(codigo), nombre })))
}

function withDetails(op) {
  if (!op) return null
  const items = db.prepare(
    'SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ? ORDER BY rowid'
  ).all(op.id)
  const historial = db.prepare(
    'SELECT * FROM oportunidad_chilecompra_historial WHERE oportunidad_id = ? ORDER BY fecha_evento ASC'
  ).all(op.id)
  return { ...op, items, historial }
}

// ── Listado (solo fuente = compra_agil) ──────────────────────────────────────
const listar = (req, res) => {
  try {
    const { estado, q } = req.query
    let sql = `SELECT * FROM oportunidades_chilecompra WHERE fuente = 'compra_agil'`
    const params = []
    if (estado) { sql += ' AND estado = ?'; params.push(estado) }
    if (q) {
      sql += ' AND (LOWER(nombre) LIKE LOWER(?) OR LOWER(organismo_nombre) LIKE LOWER(?) OR LOWER(codigo_externo) LIKE LOWER(?))'
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    sql += ' ORDER BY created_at DESC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Paso 1: importar por código publicado (ej. "2428-1262-COT26") ──────────
// ⚠️ Depende de la API interna de Mercado Público, bloqueada por WAF desde
// el servidor real de RMG (confirmado 2026-09) — HOY este endpoint falla
// para cualquier código real. Se deja funcionando por si ChileCompra
// habilita su nueva API oficial de Compra Ágil más adelante. Mientras tanto,
// usar POST /api/compra-agil/importar-manual (ver abajo).
const importar = async (req, res) => {
  try {
    const { codigo } = req.body
    if (!codigo?.trim()) return res.status(400).json({ error: 'Falta el código de la Compra Ágil (ej. 2428-1262-COT26)' })
    const op = await importarCompraAgil(codigo.trim(), req.user)
    res.json(withDetails(op))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Paso 1 (alternativo) — importar pegando texto y/o subiendo documento(s) ──
// La API interna que usa `importar` está bloqueada por WAF desde el servidor
// real (confirmado 2026-09) — este es el camino que SÍ funciona hoy: el
// usuario copia el texto de la publicación (ej. desde
// buscador.mercadopublico.cl/ficha?code=..., que sí carga en un navegador
// normal) y/o sube el PDF/imagen/Word, y la misma IA que ya lee anexos de
// licitaciones extrae los ítems, organismo, presupuesto, etc.
const importarManual = async (req, res) => {
  try {
    const { codigo, texto, documentos } = req.body
    const op = await importarCompraAgilManual({ codigo, texto, documentos, user: req.user })
    res.json(withDetails(op))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

const getDetalle = (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ? AND fuente = 'compra_agil'`).get(req.params.id)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    res.json(withDetails(op))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Botón 1: compras similares del MISMO solicitante ────────────────────────
const benchmarkSolicitante = async (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ?`).get(req.params.id)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    const keyword = req.query.keyword || req.body?.keyword
    if (!keyword) return res.status(400).json({ error: 'Falta "keyword" (ej. "aceite motor 5w30")' })
    const resultado = await benchmarkPorSolicitante({
      organismoNombre: op.organismo_nombre, organismoRut: op.organismo_rut, keyword,
      forzar: req.query.forzar === '1' || req.body?.forzar === true,
    })
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Botón 2: compras similares en el mercado, cualquier organismo ──────────
const benchmarkMercado = async (req, res) => {
  try {
    const keyword = req.query.keyword || req.body?.keyword
    if (!keyword) return res.status(400).json({ error: 'Falta "keyword" (ej. "aceite motor 5w30")' })
    const resultado = await benchmarkPorMercado({
      keyword, forzar: req.query.forzar === '1' || req.body?.forzar === true,
    })
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Fundamento de la cotización: cumple/no cumple + observación sugerida ───
const fundamento = async (req, res) => {
  try {
    const resultados = await generarFundamentoCotizacion(req.params.id, req.user)
    res.json({ resultados, oportunidad: withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(req.params.id)) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Sugerencia de precio por ítem ───────────────────────────────────────────
const precioSugerido = (req, res) => {
  try {
    res.json(sugerirPrecio(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Datos Abiertos — estado + sincronización manual (además de la mensual automática) ──
const datosAbiertosEstado = (req, res) => {
  try {
    res.json({ meses: datosAbiertos.estadoSincronizacion() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const datosAbiertosSincronizar = async (req, res) => {
  try {
    const resultados = await datosAbiertos.sincronizarMesesRecientes({ maxIntentos: 5 })
    res.json({ resultados })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Detector automático — API oficial de Compra Ágil, sin navegador ────────
// Corre bajo demanda (botón "Buscar ahora" en la UI); además corre sola cada
// 15 min vía cron (ver jobs/compraAgilApiPollerCron.js). Es una llamada de
// API normal (segundos, no minutos) — se deja el mismo patrón
// fire-and-forget + polling que ya tenía el scraper por prolijidad (cero
// cambios de contrato con el frontend), aunque ya no hace falta por lentitud.
// 2026-09-09 — antes esto siempre corría con los mismos parámetros fijos en
// el código (estado=publicada, ventana=6h, sin filtro de región) sin que el
// usuario pudiera verlos ni cambiarlos. Ahora "Buscar ahora" puede mandar
// {ventanaMs, estados, regiones} desde la UI (ver CompraAgilPage.jsx) — si
// no manda nada, detectarYImportarAutomatico sigue usando los valores por
// defecto de siempre (igual que el cron, que nunca manda body).
const scrapearAhora = (req, res) => {
  const estadoActual = estadoDetector()
  if (estadoActual.corriendo) {
    return res.status(202).json({ iniciado: false, mensaje: 'Ya hay una búsqueda en curso — espera a que termine.' })
  }
  const { ventanaMs, estados, regiones } = req.body || {}
  detectarYImportarAutomatico({ user: req.user, ventanaMs, estados, regiones })
    .catch(e => console.error('❌ Compra Ágil "Buscar ahora" falló:', e.message))
  res.status(202).json({ iniciado: true, mensaje: 'Búsqueda iniciada.' })
}

const scraperEstado = (req, res) => {
  res.json(estadoDetector())
}

module.exports = {
  listar, importar, importarManual, getDetalle, benchmarkSolicitante, benchmarkMercado, fundamento, precioSugerido,
  datosAbiertosEstado, datosAbiertosSincronizar, scrapearAhora, scraperEstado, regionesDisponibles,
}
