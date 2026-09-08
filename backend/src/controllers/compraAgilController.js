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
const { importarCompraAgil, generarFundamentoCotizacion, sugerirPrecio } = require('../services/compraAgilAnalisis')
const { benchmarkPorSolicitante, benchmarkPorMercado } = require('../services/compraAgilBenchmark')

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

module.exports = { listar, importar, getDetalle, benchmarkSolicitante, benchmarkMercado, fundamento, precioSugerido }
