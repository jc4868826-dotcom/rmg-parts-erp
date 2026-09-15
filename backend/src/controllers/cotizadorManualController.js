/**
 * RMG Parts — Cotizador Manual (2026-09-15, v2)
 *
 * Pedido real de JC: subir el PDF de una solicitud de Compra Ágil/ChileCompra
 * (uno que ya tiene descargado, o que la API oficial no logró traer), que el
 * sistema lo lea con IA, extraiga el requerimiento, lo cruce con el catálogo
 * RMG (+ el conocimiento técnico Vistony ya tageado) y entregue el Excel con
 * la propuesta — igual que Evaluador/Cotizador, pero subiendo el documento a
 * mano en vez de esperar a que la API lo traiga sola.
 *
 * v1 (esta misma fecha) intentó algo distinto — un formulario de líneas
 * escritas a mano — y no era lo pedido. Se descartó por completo.
 *
 * No reinventa nada: reutiliza tal cual `importarCompraAgilManual`
 * (compraAgilAnalisis.js), que YA hace exactamente esto para Compra Ágil
 * (lee anexos con IA vía chilecompraDocReader.leerAnexos, guarda la
 * oportunidad, corre chilecompraScoring.cruzarItemsConCatalogo) — acá solo
 * se le pasa fuente='cotizador_manual' para que quede en su propia lista,
 * separada de las oportunidades que detecta solo el scraper de Compra Ágil.
 * El Excel se genera con el mismo exportador de siempre
 * (chilecompraExcelExport.generarExcelCruce), sin tocarlo.
 *
 * Encima de ese cruce real, se agrega una alerta técnica extra (tagging
 * Vistony verificado por JC — 30 fichas, ver taggingTecnico.js): si el SKU
 * que el cruce asignó es uno que el tagging marcó con alerta_tipo_base
 * (la ficha no declara sintético/mineral) o alerta_sku (cruce SKU↔ficha ya
 * detectado como ambiguo, ej. Veltron EP vs Synth), esa alerta se agrega a
 * la observación del ítem — visible en la misma columna "Observación" que ya
 * exporta el Excel.
 *
 * FIX 2026-09-15 (mismo día, tras revisión de JC — "mira los P×Q"): el
 * primer Excel real mostró costo/precio/P×Q completos en ítems con solo
 * 36-37% de confianza de match — matches de respaldo por categoría
 * (cruzarItemsConCatalogo, "sin señal textual", ver chilecompraScoring.js),
 * no coincidencias reales. Cotizador (cotizadorController.js) YA resuelve
 * esto con un piso de confianza real (UMBRAL_CONFIANZA=0.55): por debajo de
 * eso, limpia el sku_match y deja el ítem "SIN MATCH — revisar
 * manualmente" en vez de mostrar números que parecen confiables sin serlo.
 * Se me había olvidado copiar ese mismo piso acá — corregido: limpiarMatchesDebiles
 * corre SIEMPRE después del cruce, idéntico criterio y mensaje que Cotizador.
 */
const { db } = require('../../config/database')
const { importarCompraAgilManual } = require('../services/compraAgilAnalisis')
const { generarExcelCruce } = require('../services/chilecompraExcelExport')
const { alertaParaSku } = require('../services/taggingTecnico')

const FUENTE = 'cotizador_manual'

// Mismo piso de confianza y mismo criterio que cotizadorController.js — por
// debajo de esto, NUNCA se entrega un SKU/costo/precio como si fuera una
// recomendación válida.
const UMBRAL_CONFIANZA = 0.55

function limpiarMatchesDebiles(oportunidadId) {
  const items = db.prepare(
    'SELECT id, sku_match, match_confianza, observacion FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?'
  ).all(oportunidadId)

  const upd = db.prepare(`
    UPDATE oportunidad_chilecompra_items
    SET sku_match = NULL, costo_unitario_rmg = NULL, precio_venta_sugerido = NULL,
        margen_pct_estimado = NULL, cubierto = 0, observacion = ?
    WHERE id = ?
  `)

  let limpiados = 0
  for (const it of items) {
    const confianza = it.match_confianza != null ? Number(it.match_confianza) : null
    if (it.sku_match && (confianza == null || confianza < UMBRAL_CONFIANZA)) {
      const pct = confianza != null ? Math.round(confianza * 100) : 0
      upd.run(`SIN MATCH — revisar manualmente (el emparejador solo llegó a ${pct}% de confianza, bajo el piso mínimo de ${Math.round(UMBRAL_CONFIANZA * 100)}%)`, it.id)
      limpiados++
    }
  }
  return limpiados
}

function withItems(op) {
  if (!op) return null
  const items = db.prepare(
    'SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ? ORDER BY rowid'
  ).all(op.id)
  return { ...op, items }
}

// Agrega la alerta técnica del tagging a la observación de cada ítem cuyo
// sku_match esté tageado — corre después del cruce real, nunca antes ni en
// su reemplazo. Solo modifica `observacion`, nunca sku_match/costo/precio.
function agregarAlertasTagging(oportunidadId) {
  const items = db.prepare(
    'SELECT id, sku_match, observacion FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?'
  ).all(oportunidadId)

  const upd = db.prepare('UPDATE oportunidad_chilecompra_items SET observacion = ? WHERE id = ?')
  let marcados = 0
  for (const it of items) {
    if (!it.sku_match) continue
    const alerta = alertaParaSku(it.sku_match)
    if (!alerta) continue

    const partes = []
    if (alerta.alerta_tipo_base) {
      partes.push(`⚠ TIPO DE BASE — la ficha Vistony de "${alerta.nombre_ficha}" no declara sintético ni mineral: consultar ficha antes de ofertar.`)
    }
    if (alerta.alerta_sku) {
      partes.push(`⚠ CRUCE SKU — ${alerta.nota_sku || 'este SKU ya fue detectado como ambiguo en el tagging técnico; confirmar a mano antes de ofertar.'}`)
    }
    const textoAlerta = partes.join(' ')
    const yaLaTiene = it.observacion && it.observacion.includes(textoAlerta)
    if (!yaLaTiene) {
      const nuevaObs = it.observacion ? `${it.observacion} ${textoAlerta}` : textoAlerta
      upd.run(nuevaObs, it.id)
      marcados++
    }
  }
  return marcados
}

// ── Listado (solo fuente = cotizador_manual) ──────────────────────────────
const listar = (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT * FROM oportunidades_chilecompra WHERE fuente = ? ORDER BY created_at DESC`
    ).all(FUENTE)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getDetalle = (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    res.json(withItems(op))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Subir — código + PDF/imagen/Word del anexo, análisis con IA ──────────
// multipart/form-data: campo "codigo" (texto) + campo "documentos" (uno o
// más archivos — mismo filtro de tipo que middleware/documentos.js).
const subir = async (req, res) => {
  try {
    const codigo = (req.body?.codigo || '').trim()
    if (!codigo) return res.status(400).json({ error: 'Falta el código de la Compra Ágil/ChileCompra (ej. 1493-495-COT26)' })
    if (!req.files?.length) return res.status(400).json({ error: 'Sube al menos un PDF, imagen o Word del requerimiento' })

    const documentos = req.files.map(f => ({
      base64: f.buffer.toString('base64'),
      mediaType: f.mimetype,
      nombre: f.originalname,
    }))

    const op = await importarCompraAgilManual({
      codigo, documentos, user: req.user,
      tipoEventoBase: 'cotizador_manual', fuente: FUENTE,
    })

    const limpiados = limpiarMatchesDebiles(op.id)
    if (limpiados > 0) {
      console.log(`ℹ️ Cotizador Manual ${codigo}: ${limpiados} ítem(s) bajo el piso de confianza (${Math.round(UMBRAL_CONFIANZA * 100)}%) quedaron marcados SIN MATCH en vez de forzar un SKU.`)
    }

    const marcados = agregarAlertasTagging(op.id)
    if (marcados > 0) {
      console.log(`ℹ️ Cotizador Manual ${codigo}: ${marcados} ítem(s) con alerta técnica del tagging Vistony.`)
    }

    res.json(withItems(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(op.id)))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

// ── Excel — el mismo exportador de Cotizador/Evaluador, sin cambios ───────
const descargarExcel = async (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })

    const buffer = await generarExcelCruce(op.id)
    const nombreArchivo = `CotizadorManual_${op.codigo_externo}.xlsx`.replace(/[^\w.\-]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Eliminar ───────────────────────────────────────────────────────────────
const eliminar = (req, res) => {
  try {
    const op = db.prepare(`SELECT id FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    db.prepare(`DELETE FROM oportunidades_chilecompra WHERE id = ?`).run(op.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { listar, getDetalle, subir, descargarExcel, eliminar }
