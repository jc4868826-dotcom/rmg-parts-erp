/**
 * RMG Parts — "Utilitarios": librería general de fichas técnicas.
 *
 * No es un directorio en disco (esta app no tiene disco persistente de
 * uploads — ver database.js), sino la tabla catalogo_fichas_tecnicas:
 * guarda una ficha técnica por producto, indexada por SKU/nombre, para que
 * el sistema pueda consultarla siempre y adjuntarla a cualquier postulación
 * ChileCompra según los productos que se estén ofertando.
 */
const { db } = require('../../config/database')
const { extraerCatalogoVistony, extraerYGuardarFichaProducto } = require('../services/fichasTecnicasVistonyService')

// GET /api/utilitarios/fichas-tecnicas — listado de la librería (sin el contenido base64)
const listarFichas = (req, res) => {
  try {
    const { q } = req.query
    let sql = `SELECT id, producto_sku, producto_nombre, fuente, url_origen, nombre_archivo,
                      mime_type, created_at, updated_at FROM catalogo_fichas_tecnicas WHERE 1=1`
    const params = []
    if (q) { sql += ' AND (LOWER(producto_nombre) LIKE LOWER(?) OR LOWER(producto_sku) LIKE LOWER(?))'; params.push(`%${q}%`, `%${q}%`) }
    sql += ' ORDER BY producto_nombre ASC'
    res.json(db.prepare(sql).all(...params))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET /api/utilitarios/fichas-tecnicas/:id/archivo — descarga directa del PDF
const descargarFicha = (req, res) => {
  try {
    const f = db.prepare('SELECT * FROM catalogo_fichas_tecnicas WHERE id = ?').get(req.params.id)
    if (!f) return res.status(404).json({ error: 'Ficha no encontrada' })
    const buf = Buffer.from(f.contenido_base64, 'base64')
    res.setHeader('Content-Type', f.mime_type || 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${f.nombre_archivo || 'ficha.pdf'}"`)
    res.send(buf)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/utilitarios/fichas-tecnicas/extraer-catalogo — scrape completo del
// catálogo RMG de productos Vistony (mantención, no por-postulación). Puede
// tomar varios minutos con catálogos grandes — se corre en background y el
// resultado queda visible en la respuesta cuando termina; para catálogos muy
// grandes conviene invocarlo con { limite } o ejecutarlo desde un cron/manual.
const extraerCatalogoCompleto = async (req, res) => {
  try {
    const { limite } = req.body || {}
    const resultado = await extraerCatalogoVistony({ limite: limite ? Number(limite) : null })
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/utilitarios/fichas-tecnicas/:sku/extraer — (re)extraer un solo SKU
const extraerUnSku = async (req, res) => {
  try {
    const resultado = await extraerYGuardarFichaProducto(req.params.sku)
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { listarFichas, descargarFicha, extraerCatalogoCompleto, extraerUnSku }
