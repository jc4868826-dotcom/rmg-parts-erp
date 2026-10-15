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
 *
 * FIX 2 2026-09-15 (mismo día, tras un segundo comentario de JC): limpiar el
 * match débil a secas dejaba el Excel en blanco total (categoría "SIN
 * COBERTURA", costo/precio "S/C", $0) — técnicamente honesto, pero inútil
 * para trabajar: no hay ningún punto de partida. Se agrega el candidato de
 * baja confianza como REFERENCIA explícita en la observación (SKU,
 * descripción, costo/precio de ESE candidato) — nunca como un match
 * confirmado (sku_match/costo/precio de la fila siguen en NULL/S/C, el
 * P×Q sigue en $0, "cobertura" sigue contando esta línea como no cubierta),
 * solo como dato para que JC decida a mano si sirve o no. Ningún número de
 * la fila cambia — solo el texto de Observación gana información útil.
 *
 * FIX 3 2026-09-15 (mismo día, tras audit de auditor senior pedido por JC):
 * el candidato de referencia (FIX 2) seguía sin resolver el problema de
 * fondo — RMG SÍ tenía equivalentes reales para los ítems que fallaban
 * ("Grasa para rodamientos" para una grasa Molykote BR2; "Lubricatodo" —
 * ficha declara uso en armas/bisagras/herramientas — para "lubricante
 * limpieza de armamento"), pero el cruce heurístico (solapamiento literal de
 * palabras) nunca los iba a encontrar por vocabulario distinto entre la
 * licitación y la ficha RMG. JC fue explícito: NO quiere un "match
 * semántico" genérico, quiere razonamiento real sobre el archivo de
 * conocimientos ya tageado y recién ahí buscar el SKU correspondiente — si
 * no se puede, dejarlo hasta ahí (nunca forzar). Ver
 * chilecompraMatchIA.sugerirMatchPorConocimiento: corre SOLO sobre los
 * ítems que quedaron sin match tras limpiarMatchesDebiles (cubierto=0),
 * nunca antes ni en reemplazo del cruce real. Cuando encuentra un
 * producto+SKU con confianza razonable, SÍ completa costo/precio/P×Q (a
 * diferencia del FIX 2, que solo dejaba una nota) — pero la Observación deja
 * explícito que es una sugerencia de IA sobre fichas técnicas, no un match
 * del cruce automático, y pide confirmar antes de ofertar. Si la IA no
 * encuentra nada razonable, el ítem queda exactamente como lo dejó
 * limpiarMatchesDebiles — sin forzar nada.
 */
const { db } = require('../../config/database')
const { importarCompraAgilManual } = require('../services/compraAgilAnalisis')
const { generarExcelCruce, generarExcelAdjudicacion } = require('../services/chilecompraExcelExport')
const { alertaParaSku } = require('../services/taggingTecnico')
const { sugerirMatchPorConocimiento } = require('../services/chilecompraMatchIA')
const { registrarYAnalizar, obtenerUltimoAnalisis } = require('../services/analisisAdjudicacion')

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
  const buscarCandidato = db.prepare(
    'SELECT codigo_sku, descripcion, precio_venta_neto, costo_unidad_neto FROM lista_precios WHERE codigo_sku = ?'
  )

  let limpiados = 0
  for (const it of items) {
    const confianza = it.match_confianza != null ? Number(it.match_confianza) : null
    if (it.sku_match && (confianza == null || confianza < UMBRAL_CONFIANZA)) {
      const pct = confianza != null ? Math.round(confianza * 100) : 0
      const candidato = buscarCandidato.get(it.sku_match)
      const refCandidato = candidato
        ? ` Candidato de referencia (NO confirmado, no ofertar sin revisar): SKU ${candidato.codigo_sku} — ${candidato.descripcion} — costo neto $${Math.round(candidato.costo_unidad_neto || 0).toLocaleString('es-CL')} / precio neto $${Math.round(candidato.precio_venta_neto || 0).toLocaleString('es-CL')}.`
        : ''
      upd.run(`SIN MATCH — revisar manualmente (el emparejador solo llegó a ${pct}% de confianza, bajo el piso mínimo de ${Math.round(UMBRAL_CONFIANZA * 100)}%).${refCandidato}`, it.id)
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

// Último rescate — SOLO sobre ítems que siguen sin match tras
// limpiarMatchesDebiles (cubierto=0). Razona sobre el archivo de
// conocimientos (productos_tagging.json) y, si encuentra un producto que
// realmente sirve para el uso pedido, completa sku_match/costo/precio/P×Q
// reales (no solo una nota) — pero SIEMPRE marcado en la Observación como
// sugerencia de IA a confirmar, nunca como el match automático normal. Si
// la IA no encuentra nada razonable, no toca el ítem (se deja "SIN MATCH"
// tal como quedó).
async function aplicarMatchIAConocimiento(oportunidadId) {
  const items = db.prepare(
    `SELECT id, descripcion_solicitada, especificacion_tecnica, observacion
     FROM oportunidad_chilecompra_items WHERE oportunidad_id = ? AND cubierto = 0`
  ).all(oportunidadId)

  const upd = db.prepare(`
    UPDATE oportunidad_chilecompra_items
    SET sku_match = ?, costo_unitario_rmg = ?, precio_venta_sugerido = ?,
        margen_pct_estimado = ?, cubierto = 1, observacion = ?
    WHERE id = ?
  `)

  let sugeridos = 0
  for (const item of items) {
    let sugerencia
    try {
      sugerencia = await sugerirMatchPorConocimiento({
        descripcionSolicitada: item.descripcion_solicitada,
        especificacionTecnica: item.especificacion_tecnica,
      })
    } catch (e) {
      console.warn(`⚠️ Cotizador Manual — match IA falló para ítem ${item.id}, se deja sin match: ${e.message}`)
      continue
    }
    if (!sugerencia) continue // la IA no encontró nada que sirva de verdad — se deja tal cual pidió JC

    const costoUnitario = sugerencia.unidades_por_pack > 1
      ? Math.round(sugerencia.costo_unidad_neto / sugerencia.unidades_por_pack)
      : sugerencia.costo_unidad_neto
    const margenPct = costoUnitario > 0
      ? (sugerencia.precio_venta_neto - costoUnitario) / sugerencia.precio_venta_neto
      : null

    const notaIA = `🤖 SUGERIDO POR IA (razonamiento sobre fichas técnicas RMG, confianza ${sugerencia.confianza}) — SKU ${sugerencia.sku}: ${sugerencia.nombre_ficha}. Justificación: ${sugerencia.justificacion} — CONFIRMAR ANTES DE OFERTAR, no es un match del cruce automático normal.`
    const nuevaObs = item.observacion ? `${item.observacion} ${notaIA}` : notaIA

    upd.run(sugerencia.sku, costoUnitario, sugerencia.precio_venta_neto, margenPct, nuevaObs, item.id)
    sugeridos++
  }
  return sugeridos
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

    const sugeridos = await aplicarMatchIAConocimiento(op.id)
    if (sugeridos > 0) {
      console.log(`ℹ️ Cotizador Manual ${codigo}: ${sugeridos} ítem(s) resueltos por razonamiento IA sobre el archivo de conocimientos (sin match heurístico previo) — marcados para revisar antes de ofertar.`)
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

// ── Resultado del proceso — Análisis de Adjudicación (2026-09-28) ─────────
// multipart/form-data: resultado ('ganado'|'perdido'|'desierto'),
// competidor_nombre, competidor_monto_neto, competidor_monto_civa, y un
// documento opcional (PDF/imagen/Word) con la oferta rival — mismo filtro
// de tipo que uploadDocumento (middleware/documentos.js).
const registrarResultado = async (req, res) => {
  try {
    const op = db.prepare(`SELECT id FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })

    const resultado = (req.body?.resultado || '').trim()
    if (!['ganado', 'perdido', 'desierto'].includes(resultado)) {
      return res.status(400).json({ error: "resultado debe ser 'ganado', 'perdido' o 'desierto'" })
    }

    const documento = req.file
      ? { base64: req.file.buffer.toString('base64'), mediaType: req.file.mimetype, nombre: req.file.originalname }
      : null

    const analisis = await registrarYAnalizar({
      oportunidadId: op.id,
      resultado,
      competidorNombre: req.body?.competidor_nombre?.trim() || null,
      montoCompetidorNeto: req.body?.competidor_monto_neto ? Number(req.body.competidor_monto_neto) : null,
      montoCompetidorCiva: req.body?.competidor_monto_civa ? Number(req.body.competidor_monto_civa) : null,
      documento,
      user: req.user,
    })

    res.json(analisis)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

const getResultado = (req, res) => {
  try {
    const op = db.prepare(`SELECT id FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    const analisis = obtenerUltimoAnalisis(op.id)
    if (!analisis) return res.status(404).json({ error: 'Este proceso todavía no tiene un Análisis de Adjudicación' })
    res.json(analisis)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const descargarExcelResultado = async (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    const analisis = obtenerUltimoAnalisis(op.id)
    if (!analisis) return res.status(404).json({ error: 'Este proceso todavía no tiene un Análisis de Adjudicación' })

    const buffer = await generarExcelAdjudicacion(analisis)
    const nombreArchivo = `Adjudicacion_${op.codigo_externo}.xlsx`.replace(/[^\w.\-]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { listar, getDetalle, subir, descargarExcel, eliminar, registrarResultado, getResultado, descargarExcelResultado }
