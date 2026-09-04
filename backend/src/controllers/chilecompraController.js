/**
 * RMG Parts — Asistente de oportunidades ChileCompra / Mercado Público
 * Flujo: detectada → analizando → descartada | preparando_postulacion →
 *        publicada → adjudicada | no_adjudicada
 *
 * "detectada"            → ingesta desde la API (Fase 1), solo metadata, sin leer anexos.
 * "analizando"           → dispara la lectura de anexos con IA + cruce con catálogo (Fase 2).
 * "descartada"           → no viable (sin cobertura, sin margen, fuera de plazo) — con motivo.
 * "preparando_postulacion" → entrega el checklist de documentos a subir (Fase 3).
 * "publicada"             → el usuario YA envió la cotización/oferta en el portal a mano.
 *                            Esta transición es SIEMPRE manual — el sistema nunca envía
 *                            una oferta por sí solo, solo prepara y el humano confirma.
 * "adjudicada"/"no_adjudicada" → se completa con el resultado real (API o carga manual).
 */
const { db, uuidv4 } = require('../../config/database')
const { cruzarItemsConCatalogo, calcularScoreRentabilidad, calcularScoreSeguridad, calcularScoreCompuesto } = require('../services/chilecompraScoring')
const { leerAnexos, leerFichaPublica } = require('../services/chilecompraDocReader')
const chilecompraApi = require('../services/chilecompraApiClient')

// Además de las transiciones "hacia adelante" del flujo, se permite volver un
// paso atrás para corregir un click equivocado (p.ej. entrar a "analizando" por
// error, o descartar algo que en realidad sí sirve) — sin eso, un error de clic
// dejaba la oportunidad atascada sin forma de corregirla desde la UI. "publicada"
// sigue siendo SIEMPRE una confirmación manual del usuario (nunca la dispara el
// sistema solo) — permitir volver de "publicada" a "preparando_postulacion" es
// igual de manual, solo corrige un click, no reemplaza esa regla.
const TRANSICIONES = {
  detectada:               ['analizando', 'descartada'],
  analizando:              ['detectada', 'preparando_postulacion', 'descartada'],
  descartada:              ['detectada'],
  preparando_postulacion:  ['analizando', 'publicada', 'descartada'],
  publicada:               ['preparando_postulacion', 'adjudicada', 'no_adjudicada'],
  adjudicada:              ['publicada'],
  no_adjudicada:           ['publicada'],
}

const TIPO_EVENTO = {
  detectada:              'vuelta_a_detectada',
  analizando:             'inicio_analisis',
  descartada:             'descarte',
  preparando_postulacion: 'inicio_postulacion',
  publicada:              'publicacion_confirmada',
  adjudicada:             'resultado_adjudicada',
  no_adjudicada:          'resultado_no_adjudicada',
}

function logEvento(oportunidad_id, tipo_evento, opts = {}) {
  const { usuario_id, usuario_nombre, estado_anterior, estado_nuevo, detalle } = opts
  try {
    db.prepare(`INSERT INTO oportunidad_chilecompra_historial
      (id, oportunidad_id, tipo_evento, usuario_id, usuario_nombre, estado_anterior, estado_nuevo, detalle)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuidv4(), oportunidad_id, tipo_evento, usuario_id || null, usuario_nombre || null,
        estado_anterior || null, estado_nuevo || null, detalle || null)
  } catch (_) {}
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

// ── Listado con filtros (fecha, región, días para el cierre, estado, texto) ──
const getOportunidades = (req, res) => {
  try {
    const { estado, region, fecha_desde, fecha_hasta, dias_vencimiento, q } = req.query
    let sql = 'SELECT * FROM oportunidades_chilecompra WHERE 1=1'
    const params = []
    if (estado)      { sql += ' AND estado = ?';              params.push(estado) }
    if (region)      { sql += ' AND region = ?';               params.push(region) }
    if (fecha_desde) { sql += ' AND fecha_publicacion >= ?';   params.push(fecha_desde) }
    if (fecha_hasta) { sql += ' AND fecha_publicacion <= ?';   params.push(fecha_hasta) }
    if (dias_vencimiento) {
      sql += " AND julianday(fecha_cierre) - julianday('now') <= ?"
      params.push(Number(dias_vencimiento))
    }
    if (q) {
      sql += ' AND (LOWER(nombre) LIKE LOWER(?) OR LOWER(organismo_nombre) LIKE LOWER(?))'
      params.push(`%${q}%`, `%${q}%`)
    }
    sql += ' ORDER BY score_total DESC NULLS LAST, fecha_cierre ASC'
    const rows = db.prepare(sql).all(...params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getOportunidad = (req, res) => {
  try {
    const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(req.params.id)
    if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada' })
    res.json(withDetails(op))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Fase 1 — ingesta manual ("hacer análisis ahora") ─────────────────────────
// El cron diario llama a esta misma función; ver src/jobs/chilecompraCron.js.
// Body opcional: { dias } (barre "hoy" y los N-1 días anteriores) o
// { fecha_desde, fecha_hasta } (rango explícito, formato YYYY-MM-DD) — si no se
// manda nada, usa CHILECOMPRA_DIAS_HACIA_ATRAS del .env (default: solo hoy).
const ejecutarAnalisisAhora = async (req, res) => {
  const { ejecutarIngesta } = require('../jobs/chilecompraCron')
  try {
    const { dias, fecha_desde, fecha_hasta } = req.body || {}
    const resultado = await ejecutarIngesta({
      disparadoPor: req.user?.email || 'manual',
      diasHaciaAtras: dias,
      fechaDesde: fecha_desde,
      fechaHasta: fecha_hasta,
    })
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Cambiar estado (con validación de transición) ────────────────────────────
const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params
    const { estado: nuevoEstado, motivo_descarte, adjudicado_a, adjudicado_monto } = req.body

    const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)
    if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada' })

    const permitidos = TRANSICIONES[op.estado] || []
    if (!permitidos.includes(nuevoEstado)) {
      return res.status(400).json({
        error: `No se puede pasar de "${op.estado}" a "${nuevoEstado}". Transiciones válidas: ${permitidos.join(', ') || 'ninguna (estado final)'}`,
      })
    }

    if (nuevoEstado === 'descartada' && !motivo_descarte) {
      return res.status(400).json({ error: 'Debes indicar motivo_descarte' })
    }

    const campos = { estado: nuevoEstado, updated_at: new Date().toISOString() }
    if (motivo_descarte) campos.motivo_descarte = motivo_descarte
    if (adjudicado_a) campos.adjudicado_a = adjudicado_a
    if (adjudicado_monto != null) campos.adjudicado_monto = adjudicado_monto

    const sets = Object.keys(campos).map(k => `${k} = ?`).join(', ')
    db.prepare(`UPDATE oportunidades_chilecompra SET ${sets} WHERE id = ?`)
      .run(...Object.values(campos), id)

    logEvento(id, TIPO_EVENTO[nuevoEstado] || 'cambio_estado', {
      usuario_id: req.user?.id, usuario_nombre: req.user?.email,
      estado_anterior: op.estado, estado_nuevo: nuevoEstado,
    })

    // Al entrar a "analizando" se dispara automáticamente el análisis: primero
    // intenta con anexos subidos a mano, y si no hay ninguno, lee la ficha pública
    // de Mercado Público directamente (no requiere que el usuario suba nada — ver
    // analizarOportunidadInterno). Si igual falla (p.ej. la ficha pública no cargó,
    // o es Compra Ágil sin ficha equivalente), no revierte el estado: queda
    // "analizando" con el error visible para reintentar vía POST /:id/analizar.
    if (nuevoEstado === 'analizando') {
      try {
        await analizarOportunidadInterno(id, req.user)
      } catch (e) {
        return res.json({
          ...withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)),
          advertencia: `Pasó a "analizando" pero el análisis automático falló: ${e.message}. Puedes subir anexos manualmente (POST /api/documentos/oportunidad_chilecompra/${id}) o reintentar con POST /api/chilecompra/${id}/analizar.`,
        })
      }
    }

    res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Fase 2 — lectura de anexos + cruce con catálogo + scoring ────────────────
// Fuente de la lectura, en orden de preferencia:
//  1. Anexos PDF subidos a mano (si el usuario subió algo, se usa eso — puede
//     traer detalle que la ficha pública no tiene, como planos o fichas técnicas).
//  2. Ficha pública de Mercado Público (fetchFichaPublicaTexto) — no requiere que
//     el usuario suba nada, porque las bases YA están públicas en el portal. Este
//     es el camino por defecto para licitaciones.
// Si ninguna de las dos está disponible, recién ahí se informa el error.
async function analizarOportunidadInterno(id, user) {
  const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)
  if (!op) throw new Error('Oportunidad no encontrada')

  const anexos = db.prepare(
    "SELECT * FROM documentos_adjuntos WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ?"
  ).all(id)

  let extraccion
  let fuenteAnalisis
  if (anexos.length) {
    const documentos = anexos.map(a => ({
      base64: a.contenido_base64,
      mediaType: a.mime_type,
      nombre: a.nombre_archivo,
    }))
    extraccion = await leerAnexos(documentos)
    fuenteAnalisis = 'anexos_subidos'
  } else if (op.fuente === 'licitacion' && op.codigo_externo) {
    const textoFicha = await chilecompraApi.fetchFichaPublicaTexto(op.codigo_externo)
    extraccion = await leerFichaPublica(textoFicha)
    fuenteAnalisis = 'ficha_publica'
  } else {
    throw new Error('No hay anexos subidos ni ficha pública disponible para analizar esta oportunidad')
  }

  db.transaction(() => {
    // Solo reemplaza los ítems si la IA trajo alguno — si no trajo nada, se
    // conservan los que ya venían de la ingesta directa de la API (Items.Listado),
    // en vez de dejar la oportunidad sin ítems visibles.
    if (extraccion.items?.length) {
      db.prepare('DELETE FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?').run(id)
      const insItem = db.prepare(`
        INSERT INTO oportunidad_chilecompra_items
          (id, oportunidad_id, descripcion_solicitada, cantidad, unidad, especificacion_tecnica, precio_unitario_referencial)
        VALUES (?,?,?,?,?,?,?)
      `)
      for (const it of extraccion.items) {
        insItem.run(uuidv4(), id, it.descripcion_solicitada, it.cantidad, it.unidad,
          it.especificacion_tecnica, it.precio_unitario_referencial)
      }
    }

    db.prepare(`
      UPDATE oportunidades_chilecompra SET
        resumen_ia = ?, direccion_entrega = COALESCE(?, direccion_entrega),
        comuna = COALESCE(?, comuna), region = COALESCE(?, region),
        fecha_cierre = COALESCE(?, fecha_cierre), plazo_entrega = ?,
        presupuesto_estimado = COALESCE(?, presupuesto_estimado),
        tiene_exigencia_garantia = ?, tiene_exigencia_sds = ?, updated_at = ?
      WHERE id = ?
    `).run(
      extraccion.resumen || null, extraccion.direccion_entrega || null,
      extraccion.comuna || null, extraccion.region || null,
      extraccion.fecha_cierre_cotizacion || null, extraccion.plazo_entrega || null,
      extraccion.presupuesto_estimado || null,
      extraccion.tiene_exigencia_garantia == null ? null : (extraccion.tiene_exigencia_garantia ? 1 : 0),
      extraccion.tiene_exigencia_sds_ficha_tecnica == null ? null : (extraccion.tiene_exigencia_sds_ficha_tecnica ? 1 : 0),
      new Date().toISOString(), id
    )
  })()

  const cruce = cruzarItemsConCatalogo(id)
  const opActualizada = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)
  const items = db.prepare('SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?').all(id)

  const scoreRentabilidad = calcularScoreRentabilidad({
    coberturaPct: cruce.coberturaPct, presupuestoEstimado: opActualizada.presupuesto_estimado, items,
  })
  const scoreSeguridad = calcularScoreSeguridad({
    organismoRut: opActualizada.organismo_rut,
    tieneExigenciaGarantia: !!opActualizada.tiene_exigencia_garantia,
    tieneDemandas: opActualizada.tiene_demandas == null ? null : !!opActualizada.tiene_demandas,
  })
  const scoreTotal = calcularScoreCompuesto(scoreRentabilidad, scoreSeguridad)

  db.prepare(`
    UPDATE oportunidades_chilecompra
    SET cobertura_catalogo_pct = ?, score_rentabilidad = ?, score_seguridad = ?, score_total = ?
    WHERE id = ?
  `).run(cruce.coberturaPct, scoreRentabilidad, scoreSeguridad, scoreTotal, id)

  logEvento(id, 'analisis_completado', {
    usuario_id: user?.id, usuario_nombre: user?.email,
    detalle: `Fuente: ${fuenteAnalisis === 'ficha_publica' ? 'ficha pública Mercado Público' : 'anexos subidos'} · Cobertura ${Math.round(cruce.coberturaPct * 100)}% · score rentabilidad ${scoreRentabilidad} · score seguridad ${scoreSeguridad}`,
  })
}

const analizarOportunidad = async (req, res) => {
  try {
    await analizarOportunidadInterno(req.params.id, req.user)
    res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Fase 3 — checklist de documentos para postular ───────────────────────────
const getChecklistPostulacion = (req, res) => {
  try {
    const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(req.params.id)
    if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada' })

    const checklist = [
      { item: 'Cotización con precio unitario y total por ítem, dentro del formato que pida la publicación', obligatorio: true },
      { item: 'Certificado de vigencia de la sociedad (Servicios Automotrices Integrales SpA)', obligatorio: true },
    ]
    if (op.fuente === 'licitacion') {
      checklist.push({ item: 'Anexos administrativos y técnicos exigidos en las bases', obligatorio: true })
    }
    if (op.tiene_exigencia_garantia) {
      checklist.push({ item: 'Boleta de garantía de seriedad de la oferta (o garantía electrónica)', obligatorio: true })
    }
    if (op.tiene_exigencia_sds) {
      checklist.push({ item: 'Ficha técnica y SDS de cada producto ofertado', obligatorio: true })
    } else {
      checklist.push({ item: 'Ficha técnica y SDS (no exigidas explícitamente, pero refuerzan la oferta si se adjuntan)', obligatorio: false })
    }
    checklist.push({ item: 'Certificado/carta de representación oficial Vistony (si aplica al producto ofertado)', obligatorio: false })

    res.json({ oportunidad_id: op.id, checklist })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getOportunidades,
  getOportunidad,
  ejecutarAnalisisAhora,
  cambiarEstado,
  analizarOportunidad,
  analizarOportunidadInterno,
  getChecklistPostulacion,
}
