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
const { generarExcelCruce } = require('../services/chilecompraExcelExport')
const { adjuntarFichasAOportunidad } = require('../services/fichasTecnicasVistonyService')

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
    const { estado, region, fecha_desde, fecha_hasta, dias_vencimiento, q, fuente } = req.query
    let sql = 'SELECT * FROM oportunidades_chilecompra WHERE 1=1'
    const params = []
    // 2026-09-09 — pedido explícito del usuario: filtro por tipo (Licitación /
    // Compra Ágil) directamente en el Kanban de /chilecompra, que YA carga
    // sin problemas (a diferencia de la página separada de Compra Ágil, que
    // dependía de una llamada EN VIVO a la API de ChileCompra y podía
    // demorar/fallar con 504 — este filtro solo lee de la base local, cero
    // riesgo de timeout).
    if (fuente)      { sql += ' AND fuente = ?';                params.push(fuente) }
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
//
// CONCEPTO — "leer anexos" acá significa leer los "Anexos Ingresados" REALES
// de la licitación: los documentos que el organismo publicó en Mercado
// Público (Bases de Licitación, Anexos técnicos/administrativos, Ordinario
// Proceder, etc. — visibles en el botón "Ver adjuntos" de la ficha del
// portal). Ahí es donde vive el requerimiento técnico real de los productos
// solicitados. Esto es DISTINTO de "fichas técnicas de productos" (las de
// Vistony, ver fichasTecnicasVistonyService.js) — esas son la especificación
// del producto que RMG ofrece, no lo que el organismo pidió. Se nombran
// distinto a propósito para no confundirlas: acá se "leen anexos" (lo que
// pide el organismo), después se "extraen fichas técnicas" (lo que RMG
// ofrece, para adjuntar a la postulación).
//
// Fuente de la lectura, en orden de preferencia:
//  1. Anexos PDF/Word/imagen subidos a mano por el usuario — descargados por
//     él mismo desde "Ver adjuntos" en el portal. Es el ÚNICO camino que hoy
//     llega al detalle técnico real, porque Mercado Público no expone esos
//     archivos para descarga automática (requieren captcha) ni una API
//     pública en tiempo real — ver el aviso "Análisis genérico" que se deja
//     en la oportunidad cuando no hay anexos subidos.
//  2. Ficha pública de Mercado Público (fetchFichaPublicaTexto) — fallback
//     automático cuando no hay anexos subidos. Solo trae la ficha general
//     (organismo, fechas, ítem genérico) — NUNCA el detalle técnico real,
//     que vive en los anexos de la opción 1.
// Si ninguna de las dos está disponible, recién ahí se informa el error.
// Después de leer (por cualquiera de las dos vías), sigue el mismo flujo:
// cruzarItemsConCatalogo() empareja cada ítem con el catálogo RMG, y
// generarExcelCruce() arma el Excel de cruce — ver más abajo en esta misma
// función.
async function analizarOportunidadInterno(id, user) {
  const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)
  if (!op) throw new Error('Oportunidad no encontrada')

  // PDFs, imágenes y Word subidos por el usuario — estos son los "Anexos
  // Ingresados" reales de la licitación (Bases de Licitación, Anexos
  // técnicos/administrativos, etc. — ver "Ver adjuntos" en la ficha de
  // Mercado Público), que es donde vive el requerimiento técnico real. Nunca
  // el Excel de cruce ni otros archivos que el propio sistema genera y
  // adjunta a esta misma oportunidad (categoria 'cruce_auto'), porque
  // Anthropic no acepta Excel/CSV en un bloque de documento y esos archivos
  // son SALIDA del análisis, no un anexo a leer.
  const anexos = db.prepare(
    `SELECT * FROM documentos_adjuntos
     WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ?
       AND tipo IN ('pdf', 'imagen', 'word')
       AND (categoria IS NULL OR categoria != 'cruce_auto')`
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
        tiene_exigencia_garantia = ?, tiene_exigencia_sds = ?, analisis_fuente = ?, updated_at = ?
      WHERE id = ?
    `).run(
      extraccion.resumen || null, extraccion.direccion_entrega || null,
      extraccion.comuna || null, extraccion.region || null,
      extraccion.fecha_cierre_cotizacion || null, extraccion.plazo_entrega || null,
      extraccion.presupuesto_estimado || null,
      extraccion.tiene_exigencia_garantia == null ? null : (extraccion.tiene_exigencia_garantia ? 1 : 0),
      extraccion.tiene_exigencia_sds_ficha_tecnica == null ? null : (extraccion.tiene_exigencia_sds_ficha_tecnica ? 1 : 0),
      fuenteAnalisis, new Date().toISOString(), id
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

  // La ficha pública de Mercado Público trae SOLO la línea genérica del ítem
  // (ej. "Aceite de motor 1 Global") — el requerimiento técnico real vive en
  // un documento aparte ("Bases Administrativas Especiales" / Anexo Técnico)
  // que el organismo publica y que Mercado Público NO expone como texto ni
  // como link de descarga en la ficha (verificado contra la página real).
  // Cuando el análisis usó esta fuente, se deja explícito en el historial —
  // antes quedaba "analizado" sin ninguna señal de que el detalle real seguía
  // sin leerse, lo que hacía parecer que el match usó el requerimiento
  // técnico completo cuando en realidad solo tuvo la línea genérica.
  const avisoFuenteGenerica = fuenteAnalisis === 'ficha_publica'
    ? ' ⚠️ Fuente solo genérica — la ficha pública no trae el detalle técnico real (viscosidad, norma, marca, etc.), que vive en los Anexos Ingresados reales de la licitación (botón "Ver adjuntos" en la ficha de Mercado Público — Bases de Licitación, Anexos técnicos, etc.). Descárgalos y súbelos en "Anexos de la licitación" para un análisis con el requerimiento real, luego reintenta el análisis.'
    : ''
  // Auto-reporte del modelo (ver EXTRACTION_PROMPT / fix "leyó solo 3
  // requerimientos") — si el propio modelo no está seguro de haber cubierto
  // todos los ítems de los documentos, se deja bien visible en el historial
  // en vez de que la oportunidad quede viéndose "completa" con menos ítems
  // de los reales.
  const avisoExtraccionIncompleta = extraccion.extraccion_posiblemente_incompleta
    ? ` ⚠️ EXTRACCIÓN POSIBLEMENTE INCOMPLETA — el modelo indicó no estar seguro de haber capturado todos los ítems de los documentos (${items?.length ?? extraccion.items?.length ?? 0} extraído(s)). Revisa manualmente los anexos y usa "Limpiar historial y reintentar" o corrige/agrega ítems a mano si faltó alguno.`
    : ''
  logEvento(id, 'analisis_completado', {
    usuario_id: user?.id, usuario_nombre: user?.email,
    detalle: `Fuente: ${fuenteAnalisis === 'ficha_publica' ? 'ficha pública Mercado Público' : 'anexos subidos'} · Cobertura ${Math.round(cruce.coberturaPct * 100)}% · score rentabilidad ${scoreRentabilidad} · score seguridad ${scoreSeguridad}${avisoFuenteGenerica}${avisoExtraccionIncompleta}`,
  })

  // Genera y adjunta el Excel de cruce (formato estándar acordado con el
  // usuario) a la ficha de la postulación. Se reemplaza el generado en un
  // análisis anterior (si lo hay) para no acumular versiones viejas cada vez
  // que se reanaliza la misma oportunidad.
  try {
    const excelBuffer = await generarExcelCruce(id)
    const nombreExcel = 'Cruce_Bases_vs_Catalogo_RMG.xlsx'
    const existente = db.prepare(`
      SELECT id FROM documentos_adjuntos
      WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ? AND nombre_archivo = ? AND categoria = 'cruce_auto'
    `).get(id, nombreExcel)
    if (existente) {
      db.prepare(`UPDATE documentos_adjuntos SET contenido_base64 = ?, created_at = datetime('now') WHERE id = ?`)
        .run(excelBuffer.toString('base64'), existente.id)
    } else {
      db.prepare(`
        INSERT INTO documentos_adjuntos
          (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por, categoria)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(uuidv4(), 'oportunidad_chilecompra', id, 'excel', nombreExcel,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        excelBuffer.toString('base64'), user?.id || null, 'cruce_auto')
    }
    logEvento(id, 'excel_cruce_generado', { usuario_id: user?.id, usuario_nombre: user?.email,
      detalle: 'Excel de cruce generado y adjuntado automáticamente a la ficha de la postulación.' })
  } catch (e) {
    // No hace fallar el análisis completo si la generación del Excel falla —
    // los ítems y scores ya quedaron guardados, que es lo esencial.
    logEvento(id, 'excel_cruce_error', { usuario_id: user?.id, usuario_nombre: user?.email, detalle: e.message })
  }

  // Adjunta las fichas técnicas de los productos con match (mejor esfuerzo:
  // si Vistony no responde o un producto no tiene ficha en la librería, no
  // interrumpe el análisis — el usuario puede reintentar con el botón
  // "Extraer fichas técnicas" en la ficha de la oportunidad).
  try {
    const resultadoFichas = await adjuntarFichasAOportunidad(id, user)
    logEvento(id, 'fichas_tecnicas_adjuntadas', { usuario_id: user?.id, usuario_nombre: user?.email,
      detalle: `${resultadoFichas.adjuntadas}/${resultadoFichas.total} fichas técnicas adjuntadas automáticamente.${detalleFichasFaltantes(resultadoFichas)}` })
  } catch (e) {
    logEvento(id, 'fichas_tecnicas_error', { usuario_id: user?.id, usuario_nombre: user?.email, detalle: e.message })
  }
}

// Construye el detalle legible de por qué faltó una ficha (sinFicha) o falló su
// adjunción (errores), para que el historial de la oportunidad no se quede solo
// con el conteo "0/1" sin explicación — antes era imposible saber, sin mirar los
// logs del servidor, si la causa fue que Vistony bloqueó el scraping, que no hubo
// match de producto, o que el producto no tiene PDF de ficha publicado.
function detalleFichasFaltantes(resultado) {
  const partes = []
  if (resultado.sinFicha?.length) {
    partes.push(' Sin ficha: ' + resultado.sinFicha.map(s => `${s.sku} (${s.motivo})`).join('; ') + '.')
  }
  if (resultado.errores?.length) {
    partes.push(' Errores: ' + resultado.errores.map(e => `${e.sku} (${e.error})`).join('; ') + '.')
  }
  return partes.join('')
}

const analizarOportunidad = async (req, res) => {
  try {
    await analizarOportunidadInterno(req.params.id, req.user)
    res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Botón "Extraer fichas técnicas" ───────────────────────────────────────────
// Se puede llamar en cualquier momento (no solo durante el análisis automático)
// para reintentar o refrescar las fichas de los productos actualmente
// emparejados en la oportunidad — por ejemplo si el usuario cambió manualmente
// el SKU ofertado en algún ítem después del análisis inicial.
const extraerFichasTecnicas = async (req, res) => {
  try {
    const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(req.params.id)
    if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada' })

    const resultado = await adjuntarFichasAOportunidad(req.params.id, req.user)
    logEvento(req.params.id, 'fichas_tecnicas_adjuntadas', {
      usuario_id: req.user?.id, usuario_nombre: req.user?.email,
      detalle: `${resultado.adjuntadas}/${resultado.total} fichas técnicas adjuntadas (botón manual).${detalleFichasFaltantes(resultado)}`,
    })
    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── "Limpiar historial y reintentar" ──────────────────────────────────────────
// Pedido real del usuario: cuando la lectura de anexos falla repetidamente o
// deja el análisis en un estado confuso ("esto es una joda"), no había forma
// de volver a un estado limpio salvo mirar la BD a mano — el historial se
// llenaba de eventos de errores viejos, mezclados con el intento nuevo, y los
// ítems/Excel de un análisis fallido o a medias seguían visibles como si
// fueran válidos. Este botón borra SOLO lo derivado del análisis (ítems,
// historial de eventos, resumen IA, scores, Excel de cruce auto-generado) —
// los anexos que el usuario subió a mano NUNCA se tocan, así no hay que
// volver a subir los 4 documentos para reintentar.
const limpiarHistorial = async (req, res) => {
  try {
    const { id } = req.params
    const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)
    if (!op) return res.status(404).json({ error: 'Oportunidad no encontrada' })

    db.transaction(() => {
      db.prepare('DELETE FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?').run(id)
      db.prepare('DELETE FROM oportunidad_chilecompra_historial WHERE oportunidad_id = ?').run(id)
      // Excel y fichas técnicas generados automáticamente en el análisis
      // anterior — quedarían mostrando el resultado de un cruce que ya no
      // existe, lo que es más confuso que no tener nada.
      db.prepare(`
        DELETE FROM documentos_adjuntos
        WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ? AND categoria = 'cruce_auto'
      `).run(id)
      db.prepare(`
        UPDATE oportunidades_chilecompra SET
          resumen_ia = NULL, analisis_fuente = NULL,
          cobertura_catalogo_pct = NULL, score_rentabilidad = NULL,
          score_seguridad = NULL, score_total = NULL, updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), id)
    })()

    logEvento(id, 'historial_limpiado', {
      usuario_id: req.user?.id, usuario_nombre: req.user?.email,
      detalle: 'Ítems, historial y Excel de cruce anteriores eliminados a pedido del usuario para reintentar desde cero. Los anexos subidos se conservan — no hace falta volver a subirlos.',
    })

    res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Corregir un ítem manualmente y recalcular ─────────────────────────────────
// Pedido real: "si el match de excel salió mal, debemos agregar
// observaciones para que lo vuelva a calcular". Guarda la corrección del
// usuario en el ítem (ver migración chilecompra_correccion_usuario_v1) y
// vuelve a correr el cruce completo (barato — no llama a la IA, solo la
// heurística contra el catálogo) + regenera el Excel adjunto, para que el
// usuario vea el resultado corregido sin tener que re-analizar toda la
// oportunidad desde los anexos.
//
// Convención de UI (un solo campo de texto, sin necesidad de un selector de
// SKU): si la nota empieza con "SKU:<codigo>", se interpreta como que el
// usuario ya sabe cuál es el producto correcto — ese ítem deja de
// re-matchearse automáticamente (ver cruzarItemsConCatalogo). Cualquier otro
// texto se usa como pista adicional para la búsqueda automática.
const actualizarObservacionItem = async (req, res) => {
  try {
    const { id, itemId } = req.params
    const { correccion_usuario } = req.body

    const item = db.prepare(
      'SELECT * FROM oportunidad_chilecompra_items WHERE id = ? AND oportunidad_id = ?'
    ).get(itemId, id)
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })

    const notaLimpia = (correccion_usuario || '').trim()
    const matchSkuForzado = notaLimpia.match(/^SKU:\s*(\S+)/i)
    const skuForzado = matchSkuForzado ? matchSkuForzado[1] : null

    if (skuForzado) {
      const existeSku = db.prepare('SELECT codigo_sku FROM lista_precios WHERE codigo_sku = ? LIMIT 1').get(skuForzado)
      if (!existeSku) return res.status(400).json({ error: `El SKU "${skuForzado}" no existe en lista_precios — revisa el código.` })
    }

    db.prepare(`
      UPDATE oportunidad_chilecompra_items
      SET correccion_usuario = ?, sku_forzado_por_usuario = ?
      WHERE id = ?
    `).run(notaLimpia || null, skuForzado, itemId)

    const cruce = cruzarItemsConCatalogo(id)

    // Regenera el Excel de cruce para que refleje la corrección de inmediato
    // — mismo patrón que analizarOportunidadInterno, mejor esfuerzo (no
    // bloquea la respuesta si falla).
    try {
      const excelBuffer = await generarExcelCruce(id)
      const nombreExcel = 'Cruce_Bases_vs_Catalogo_RMG.xlsx'
      const existente = db.prepare(`
        SELECT id FROM documentos_adjuntos
        WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ? AND nombre_archivo = ? AND categoria = 'cruce_auto'
      `).get(id, nombreExcel)
      if (existente) {
        db.prepare(`UPDATE documentos_adjuntos SET contenido_base64 = ?, created_at = datetime('now') WHERE id = ?`)
          .run(excelBuffer.toString('base64'), existente.id)
      } else {
        db.prepare(`
          INSERT INTO documentos_adjuntos
            (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por, categoria)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(uuidv4(), 'oportunidad_chilecompra', id, 'excel', nombreExcel,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          excelBuffer.toString('base64'), req.user?.id || null, 'cruce_auto')
      }
    } catch (_) { /* no bloquea — el cruce ya quedó guardado en BD */ }

    logEvento(id, 'item_corregido_manualmente', {
      usuario_id: req.user?.id, usuario_nombre: req.user?.email,
      detalle: `Ítem "${item.descripcion_solicitada}" — ${skuForzado ? `SKU fijado a ${skuForzado}` : notaLimpia ? `nota agregada: "${notaLimpia}"` : 'corrección eliminada'}. Cruce recalculado (cobertura ${Math.round(cruce.coberturaPct * 100)}%).`,
    })

    res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)))
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
  extraerFichasTecnicas,
  limpiarHistorial,
  actualizarObservacionItem,
}
