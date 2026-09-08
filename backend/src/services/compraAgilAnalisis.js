/**
 * RMG Parts — Orquestador del flujo Compra Ágil
 *
 * Replica, paso a paso, el ejercicio manual hecho en el chat para
 * Quilpué/2428-1262-COT26: importar la publicación → cruzar con el catálogo
 * RMG (reutiliza chilecompraScoring, ya genérico para cualquier `fuente`) →
 * adjuntar fichas técnicas internas (reutiliza fichasTecnicasVistonyService)
 * → comparar cada ficha contra la exigencia técnica con IA → sugerir precio →
 * redactar observación → dejar todo listo para que el usuario solo revise y
 * genere la cotización real.
 *
 * Todas las oportunidades de Compra Ágil se guardan en las MISMAS tablas que
 * las licitaciones (oportunidades_chilecompra con fuente='compra_agil',
 * oportunidad_chilecompra_items) — esas tablas ya estaban diseñadas para
 * ambas fuentes, solo faltaba la ingesta de Compra Ágil.
 */
const { db, uuidv4 } = require('../../config/database')
const api = require('./compraAgilApiClient')
const {
  cruzarItemsConCatalogo, calcularScoreRentabilidad, calcularScoreSeguridad,
  calcularScoreLogistico, calcularScoreCompuesto, volumenTotalSolicitado,
} = require('./chilecompraScoring')
const { adjuntarFichasAOportunidad } = require('./fichasTecnicasVistonyService')
const { compararFichaTecnica } = require('./chilecompraDocReader')

function logEvento(oportunidad_id, tipo_evento, opts = {}) {
  const { usuario_id, usuario_nombre, detalle } = opts
  try {
    db.prepare(`INSERT INTO oportunidad_chilecompra_historial
      (id, oportunidad_id, tipo_evento, usuario_id, usuario_nombre, detalle)
      VALUES (?,?,?,?,?,?)`)
      .run(uuidv4(), oportunidad_id, tipo_evento, usuario_id || null, usuario_nombre || null, detalle || null)
  } catch (_) { /* el historial nunca debe tumbar el flujo principal */ }
}

/**
 * Scores de la oportunidad — antes de este fix (2026-09) Compra Ágil NUNCA
 * calculaba score_rentabilidad/score_seguridad/score_total (a diferencia de
 * licitaciones, ver chilecompraController.js), así que toda Compra Ágil
 * quedaba sin puntaje visible en el listado. Se agrega además el score
 * logístico (pedido explícito del usuario: "esta solicitud es más riesgosa
 * por el costo de envío, debería tener un puntaje ¿no?" — caso real
 * San Nicolás/1493-495-COT26, Ñuble) como tercer factor del compuesto.
 */
function calcularYGuardarScores(oportunidadId, cruce) {
  const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(oportunidadId)
  const items = db.prepare('SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?').all(oportunidadId)

  const scoreRentabilidad = calcularScoreRentabilidad({
    coberturaPct: cruce.coberturaPct, presupuestoEstimado: op.presupuesto_estimado, items,
  })
  const scoreSeguridad = calcularScoreSeguridad({
    organismoRut: op.organismo_rut, tieneExigenciaGarantia: false, tieneDemandas: null,
  })

  // Volumen total en litros de TODOS los ítems (suma) — señal para el recargo
  // por carga voluminosa dentro de calcularScoreLogistico (ver ahí).
  let volumenTotalLitros = null
  for (const item of items) {
    const texto = `${item.descripcion_solicitada || ''} ${item.especificacion_tecnica || ''}`
    const vol = volumenTotalSolicitado(item, texto)
    if (vol != null) volumenTotalLitros = (volumenTotalLitros || 0) + vol
  }

  const logistico = calcularScoreLogistico({
    region: op.region, presupuestoEstimado: op.presupuesto_estimado, volumenTotalLitros,
  })
  const scoreTotal = calcularScoreCompuesto(scoreRentabilidad, scoreSeguridad, logistico.score)

  db.prepare(`
    UPDATE oportunidades_chilecompra
    SET cobertura_catalogo_pct = ?, score_rentabilidad = ?, score_seguridad = ?, score_logistico = ?, score_total = ?
    WHERE id = ?
  `).run(cruce.coberturaPct, scoreRentabilidad, scoreSeguridad, logistico.score, scoreTotal, oportunidadId)

  if (logistico.motivo) {
    logEvento(oportunidadId, 'score_logistico_alerta', { detalle: logistico.motivo })
  }

  return { scoreRentabilidad, scoreSeguridad, scoreLogistico: logistico, scoreTotal }
}

/**
 * Paso 1 — Ingesta. Trae la publicación de Compra Ágil por su código externo
 * (ej. "2428-1262-COT26"), la guarda/actualiza como oportunidad y corre el
 * cruce con catálogo + adjunta fichas técnicas. Es seguro llamarla varias
 * veces con el mismo código (upsert por UNIQUE(fuente, codigo_externo)).
 */
async function importarCompraAgil(codigo, user) {
  const detalle = await api.buscarCompraAgil(codigo)

  const existente = db.prepare(
    `SELECT id FROM oportunidades_chilecompra WHERE fuente = 'compra_agil' AND codigo_externo = ?`
  ).get(codigo)

  const id = existente?.id || uuidv4()

  db.transaction(() => {
    if (existente) {
      db.prepare(`
        UPDATE oportunidades_chilecompra SET
          nombre = ?, descripcion = ?, organismo_nombre = ?, organismo_rut = ?,
          region = ?, comuna = ?, direccion_entrega = ?, fecha_publicacion = ?,
          fecha_cierre = ?, presupuesto_estimado = ?, url_portal = ?,
          detalle_raw_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        detalle.nombre, detalle.descripcion, detalle.organismo_nombre, detalle.organismo_rut,
        detalle.region, detalle.comuna, detalle.direccion_entrega, detalle.fecha_publicacion,
        detalle.fecha_cierre, detalle.presupuesto_estimado, detalle.url_portal,
        JSON.stringify(detalle.debugUltimaRespuesta || {}), id
      )
      db.prepare('DELETE FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?').run(id)
    } else {
      db.prepare(`
        INSERT INTO oportunidades_chilecompra
          (id, fuente, codigo_externo, nombre, descripcion, organismo_nombre, organismo_rut,
           region, comuna, direccion_entrega, fecha_publicacion, fecha_cierre,
           presupuesto_estimado, url_portal, estado, detectada_por, detalle_raw_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, 'compra_agil', codigo, detalle.nombre, detalle.descripcion,
        detalle.organismo_nombre, detalle.organismo_rut, detalle.region, detalle.comuna,
        detalle.direccion_entrega, detalle.fecha_publicacion, detalle.fecha_cierre,
        detalle.presupuesto_estimado, detalle.url_portal, 'detectada', user?.email || 'manual',
        JSON.stringify(detalle.debugUltimaRespuesta || {})
      )
    }

    const insItem = db.prepare(`
      INSERT INTO oportunidad_chilecompra_items
        (id, oportunidad_id, descripcion_solicitada, cantidad, unidad, especificacion_tecnica, precio_unitario_referencial)
      VALUES (?,?,?,?,?,?,?)
    `)
    for (const it of detalle.items) {
      insItem.run(uuidv4(), id, it.descripcion_solicitada, it.cantidad, it.unidad,
        it.especificacion_tecnica, it.precio_unitario_referencial)
    }
  })()

  logEvento(id, existente ? 'compra_agil_reimportada' : 'compra_agil_importada', {
    usuario_id: user?.id, usuario_nombre: user?.email,
    detalle: `Código ${codigo} · ${detalle.items.length} ítem(s)${detalle.advertencias?.length ? ' · ⚠️ ' + detalle.advertencias.join(' ') : ''}`,
  })

  // Cruce con catálogo (heurística, sin IA — barato y reutilizado tal cual de licitaciones).
  try {
    const cruce = cruzarItemsConCatalogo(id)
    calcularYGuardarScores(id, cruce)
  } catch (e) {
    logEvento(id, 'cruce_error', { usuario_id: user?.id, usuario_nombre: user?.email, detalle: e.message })
  }

  // Fichas técnicas internas RMG para los productos con match.
  try {
    const resultadoFichas = await adjuntarFichasAOportunidad(id, user)
    logEvento(id, 'fichas_tecnicas_adjuntadas', {
      usuario_id: user?.id, usuario_nombre: user?.email,
      detalle: `${resultadoFichas.adjuntadas}/${resultadoFichas.total} fichas técnicas adjuntadas automáticamente.`,
    })
  } catch (e) {
    logEvento(id, 'fichas_tecnicas_error', { usuario_id: user?.id, usuario_nombre: user?.email, detalle: e.message })
  }

  return db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(id)
}

/**
 * Paso 2 — Fundamento de la cotización. Para cada ítem con match de catálogo
 * y ficha técnica adjunta, compara la ficha vs. la exigencia técnica con IA
 * (compararFichaTecnica) y guarda el resultado + observación sugerida en el
 * propio ítem, lista para copiar/editar en la cotización real.
 */
async function generarFundamentoCotizacion(oportunidadId, user) {
  const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(oportunidadId)
  if (!op) throw new Error('Oportunidad no encontrada')

  const items = db.prepare(
    `SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ? AND sku_match IS NOT NULL`
  ).all(oportunidadId)
  if (!items.length) {
    throw new Error('No hay ítems con producto de catálogo asignado (sku_match) — revisa el cruce antes de generar el fundamento.')
  }

  const resultados = []
  for (const item of items) {
    try {
      const ficha = db.prepare(
        `SELECT * FROM catalogo_fichas_tecnicas WHERE producto_sku = ? ORDER BY updated_at DESC LIMIT 1`
      ).get(item.sku_match)

      if (!ficha) {
        resultados.push({ itemId: item.id, sku: item.sku_match, error: 'Sin ficha técnica en la librería interna — usa "Extraer fichas técnicas" primero o adjunta una a mano.' })
        continue
      }

      const producto = db.prepare('SELECT nombre FROM lista_precios WHERE codigo_sku = ?').get(item.sku_match)

      const comparacion = await compararFichaTecnica(
        item.especificacion_tecnica || item.descripcion_solicitada,
        { base64: ficha.contenido_base64, mediaType: ficha.mime_type, nombre: ficha.nombre_archivo },
        producto?.nombre || item.sku_match
      )

      db.prepare(`UPDATE oportunidad_chilecompra_items SET cumplimiento_json = ?, observacion_cotizacion = ? WHERE id = ?`)
        .run(JSON.stringify(comparacion), comparacion.redactar_observacion_sugerida || null, item.id)

      resultados.push({ itemId: item.id, sku: item.sku_match, ...comparacion })
    } catch (e) {
      resultados.push({ itemId: item.id, sku: item.sku_match, error: e.message })
    }
  }

  logEvento(oportunidadId, 'fundamento_cotizacion_generado', {
    usuario_id: user?.id, usuario_nombre: user?.email,
    detalle: `${resultados.filter(r => !r.error).length}/${items.length} ítem(s) comparados contra su ficha técnica.`,
  })

  return resultados
}

/**
 * Sugerencia de precio simple: usa el presupuesto de referencia del organismo
 * (si viene) y el costo del producto matcheado para proponer un rango — mismo
 * criterio usado a mano para Quilpué (cerca del presupuesto de referencia,
 * pero siempre sobre el costo con margen mínimo).
 */
function sugerirPrecio(oportunidadId) {
  const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(oportunidadId)
  if (!op) throw new Error('Oportunidad no encontrada')
  const items = db.prepare('SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?').all(oportunidadId)

  return items.map(item => {
    const costo = item.costo_unitario_rmg
    const cantidad = item.cantidad_ajustada || item.cantidad
    const refPorUnidad = (op.presupuesto_estimado && cantidad) ? Math.round(op.presupuesto_estimado / cantidad) : null

    if (!costo) {
      return { itemId: item.id, sugerido: null, motivo: 'Sin costo unitario (sin match de catálogo) — no se puede sugerir precio.' }
    }

    const margenMinimo = Math.round(costo * 1.12) // 12% piso, ajustable por el usuario en la UI
    let sugerido = margenMinimo
    let motivo = 'Costo + margen mínimo 12% (sin referencia de presupuesto del organismo).'

    if (refPorUnidad) {
      if (refPorUnidad >= margenMinimo) {
        // Deja algo de margen bajo el techo de referencia para verse competitivo sin regalar margen.
        sugerido = Math.round(refPorUnidad * 0.97)
        motivo = `97% del presupuesto de referencia ($${refPorUnidad.toLocaleString('es-CL')}/unidad) — sobre el costo con margen.`
      } else {
        motivo = `El presupuesto de referencia ($${refPorUnidad.toLocaleString('es-CL')}/unidad) queda bajo el costo + margen mínimo — evalúa si conviene postular igual.`
      }
    }

    return { itemId: item.id, costo, refPorUnidad, sugerido, motivo }
  })
}

module.exports = { importarCompraAgil, generarFundamentoCotizacion, sugerirPrecio, calcularYGuardarScores }
