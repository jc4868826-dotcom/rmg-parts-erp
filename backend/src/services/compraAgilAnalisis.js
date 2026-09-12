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
const { compararFichaTecnica, leerAnexos, leerFichaPublica } = require('./chilecompraDocReader')
const { generarExcelCruce } = require('./chilecompraExcelExport')

// ── Detector automático (2026-09-08 noche) — API oficial, sin navegador ────
// Candado contra corridas solapadas, compartido entre el cron y el botón
// "Buscar ahora" — mismo patrón que tenía compraAgilScraper.js.
let _corriendo = false
let _ultimoResumen = null
const USER_AUTOMATICO = { email: 'api-automatico' }

// 2026-09-09 (corregido tras un caso real perdido: Quilpué/2428-1262-COT26,
// Región de Valparaíso — el detector nunca la vio porque este archivo
// restringía la búsqueda automática a solo Región Metropolitana) — pedido
// explícito del usuario: "debió traerlo, debió hacer match con los
// intereses...si lo hace en ChileCompras [Licitaciones], de hecho lo que
// debe hacer es traer lo que ve en Mercado Público, no inventar...luego en
// el dash se filtra".
//
// Corrección final (misma sesión, tras un segundo comentario del usuario):
// "debes traer lo que encuentra Mercado Público, yo agregué palabras...si tú
// restringes a palabras específicas, no conversa con lo que hago en el
// portal...tú solo extrae lo que sale en Mercado Público en mi búsqueda,
// luego filtramos en el sistema nuestro" — a diferencia de Licitaciones
// (chilecompraCron.js), que SÍ filtra por lista de palabras clave (KEYWORDS)
// porque el volumen nacional diario de licitaciones es demasiado alto para
// importar todo, Compra Ágil NO aplica ningún filtro de palabras clave al
// ingestar: se trae TODO lo publicado a nivel nacional (regiones=[]) y
// CUALQUIER código nuevo visto se importa. El filtrado real (búsqueda por
// texto, tipo, región) vive enteramente en el dashboard (GET /chilecompra?...),
// nunca antes de que el dato llegue a la base de datos. Esta asimetría entre
// Licitaciones y Compra Ágil fue confirmada explícitamente por el usuario vía
// pregunta directa ("Todo, sin filtro de palabras (Recomendado)"). La ventana
// de 24h se mantiene (el cron corre cada 15 min, así que no hace falta traer
// más que "cambios recientes"; ver listarPublicadasEnVentana para el detalle
// de qué es `ttl_cambio_ms`).
//
// 2026-09-09 (incidente #5, confirmado en producción con evidencia real): la
// primera versión de este fix pedía el listado nacional SIN `region` en una
// sola llamada — y esa consulta le da 504 "Endpoint request timed out" a la
// propia API de ChileCompra, incluso después del reintento a 60s
// (compraAgilApiClient.llamar). No era un problema de nuestro timeout: es que
// sin filtro de región, la consulta de ELLOS es demasiado pesada. La solución
// (en compraAgilApiClient.listarPublicadasEnVentana) fue partir la misma
// consulta nacional, sin ningún filtro de palabras ni exclusión de región, en
// 16 llamadas — una por región — en vez de una sola. Cobertura sigue siendo
// 100% nacional; solo cambió CÓMO se le pide a la API. Si una región puntual
// falla, se salta esa región (queda registrada en el resumen) y se sigue con
// las demás, en vez de perder la corrida completa por un solo timeout.
const VENTANA_DEFAULT_MS = Number(process.env.COMPRA_AGIL_API_VENTANA_MS || 24 * 3600_000) // 24h (ayer/hoy)
const REGIONES_DEFAULT = (process.env.COMPRA_AGIL_API_REGIONES || '').split(',').map(s => s.trim()).filter(Boolean).map(Number) // [] = todo el país
const ESTADOS_DEFAULT = (process.env.COMPRA_AGIL_API_ESTADOS || 'publicada').split(',').map(s => s.trim()).filter(Boolean)

function estado() {
  return { corriendo: _corriendo, ultimoResumen: _ultimoResumen }
}

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
 * Guarda/actualiza la oportunidad + sus ítems a partir de un `detalle` ya
 * normalizado (mismo shape sin importar si vino de la API bloqueada, ver
 * compraAgilApiClient.mapearCompraAgil, o de la extracción con IA, ver
 * mapearExtraccionAAgil abajo) y corre el resto del pipeline (cruce con
 * catálogo, scores, fichas técnicas) — extraído de importarCompraAgil para
 * que importarCompraAgilManual (2026-09, ver más abajo) reutilice EXACTAMENTE
 * la misma lógica de guardado, sin duplicar nada.
 */
async function guardarYProcesarOportunidad(codigo, detalle, user, tipoEventoBase, fuente = 'compra_agil') {
  const existente = db.prepare(
    `SELECT id FROM oportunidades_chilecompra WHERE fuente = ? AND codigo_externo = ?`
  ).get(fuente, codigo)

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
        id, fuente, codigo, detalle.nombre, detalle.descripcion,
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

  logEvento(id, existente ? `${tipoEventoBase}_reimportada` : `${tipoEventoBase}_importada`, {
    usuario_id: user?.id, usuario_nombre: user?.email,
    detalle: `Código ${codigo} · ${detalle.items.length} ítem(s)${detalle.advertencias?.length ? ' · ⚠️ ' + detalle.advertencias.join(' ') : ''}`,
  })

  // 2026-09-09 — persiste como anexo real (documentos_adjuntos) cada PDF/
  // imagen que enriquecerConDocumentosAdjuntos descargó de la API oficial,
  // para que "Leer ficha pública y calcular score" (chilecompraController.
  // analizarOportunidadInterno) los encuentre después — esa función ya lee
  // cualquier fila de documentos_adjuntos con categoria != 'cruce_auto', así
  // que basta con insertarlos acá, sin tocar esa lógica. Evita duplicar si ya
  // se guardó en una corrida anterior (mismo nombre de archivo).
  if (detalle._anexosDescargados?.length) {
    let nuevos = 0
    for (const doc of detalle._anexosDescargados) {
      const yaExiste = db.prepare(`
        SELECT id FROM documentos_adjuntos
        WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ? AND nombre_archivo = ?
      `).get(id, doc.nombre)
      if (yaExiste) continue
      db.prepare(`
        INSERT INTO documentos_adjuntos
          (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por, categoria)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        uuidv4(), 'oportunidad_chilecompra', id,
        doc.mediaType === 'application/pdf' ? 'pdf'
          : doc.mediaType?.startsWith('image/') ? 'imagen'
          : 'word',
        doc.nombre, doc.mediaType, doc.base64, user?.id || null, 'anexo_api_compra_agil'
      )
      nuevos++
    }
    if (nuevos) {
      logEvento(id, 'anexo_api_descargado', {
        usuario_id: user?.id, usuario_nombre: user?.email || 'api-automatico',
        detalle: `${nuevos} documento(s) adjunto(s) descargado(s) automáticamente desde la API de Compra Ágil y guardado(s) como anexo(s) de la postulación.`,
      })
    }
  }

  // Cruce con catálogo (heurística, sin IA — barato y reutilizado tal cual de licitaciones).
  try {
    const cruce = cruzarItemsConCatalogo(id)
    calcularYGuardarScores(id, cruce)
  } catch (e) {
    logEvento(id, 'cruce_error', { usuario_id: user?.id, usuario_nombre: user?.email, detalle: e.message })
  }

  // 2026-09-12 — BUG real reportado: la ficha quedaba "detectada" con el
  // cruce ya calculado en la base, pero SIN el Excel de cruce adjunto — ese
  // archivo (el que sirve para postular) solo se generaba cuando el usuario
  // pasaba manualmente a "analizando" (analizarOportunidadInterno) o corregía
  // un ítem (actualizarObservacionItem). Para Evaluador en particular no
  // tiene sentido esperar ese segundo paso: el cruce ya es válido apenas se
  // importa (los adjuntos, si los hay, ya se leyeron arriba). Se genera y
  // adjunta acá mismo, igual que en esos otros dos lugares — mismo nombre de
  // archivo/categoría 'cruce_auto', así que si más adelante el usuario sí
  // reanaliza o corrige un ítem, simplemente lo reemplaza.
  try {
    const excelBuffer = await generarExcelCruce(id)
    const nombreExcel = 'Cruce_Bases_vs_Catalogo_RMG.xlsx'
    const existenteExcel = db.prepare(`
      SELECT id FROM documentos_adjuntos
      WHERE entidad = 'oportunidad_chilecompra' AND entidad_id = ? AND nombre_archivo = ? AND categoria = 'cruce_auto'
    `).get(id, nombreExcel)
    if (existenteExcel) {
      db.prepare(`UPDATE documentos_adjuntos SET contenido_base64 = ?, created_at = datetime('now') WHERE id = ?`)
        .run(excelBuffer.toString('base64'), existenteExcel.id)
    } else {
      db.prepare(`
        INSERT INTO documentos_adjuntos
          (id, entidad, entidad_id, tipo, nombre_archivo, mime_type, contenido_base64, subido_por, categoria)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(
        uuidv4(), 'oportunidad_chilecompra', id, 'excel', nombreExcel,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        excelBuffer.toString('base64'), user?.id || null, 'cruce_auto'
      )
    }
  } catch (e) {
    logEvento(id, 'excel_cruce_error', { usuario_id: user?.id, usuario_nombre: user?.email, detalle: e.message })
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
 * 2026-09-09 — pedido real del usuario: "no veo que lea los adjuntos y
 * encuentre lo que se pide, por ende no veo que haga match con nuestro
 * catálogo". El detalle estructurado de la API (`productos_solicitados[]`)
 * muchas veces es solo una línea genérica — el requerimiento técnico real
 * vive en los PDF que la propia API referencia en `documentos[]`. Esta
 * función los descarga (compraAgilApiClient.descargarDocumentoAdjunto) y los
 * lee con la MISMA IA que ya lee anexos de licitaciones (leerAnexos) — si
 * encuentra ítems ahí, REEMPLAZAN a la línea genérica de la API (el anexo
 * manda). Si no hay documentos, si ninguno se pudo descargar, o si la IA no
 * encuentra ítems, se sigue con lo que ya trajo la API — nunca revienta el
 * import por esto, y cada motivo de fallo queda en el log (console.warn) en
 * vez de fallar en silencio, porque el shape exacto de `documentos[]` no
 * está confirmado contra un caso real todavía (ver aviso en
 * compraAgilApiClient.js).
 */
async function enriquecerConDocumentosAdjuntos(detalle) {
  if (!detalle.documentos?.length) return detalle

  const descargados = []
  const problemas = []
  for (const doc of detalle.documentos) {
    const r = await api.descargarDocumentoAdjunto(doc)
    if (r.ok) descargados.push(r.documento)
    else problemas.push(r.motivo)
  }

  if (!descargados.length) {
    console.warn(`⚠️ Compra Ágil ${detalle.codigo_externo}: ${detalle.documentos.length} documento(s) declarado(s) pero no se pudo descargar ninguno — ${problemas[0] || 'sin detalle'}`)
    return detalle
  }

  // 2026-09-12 — BUG real confirmado (3086-735-COT26): este filtro descartaba
  // Word (.docx/.doc) aunque leerAnexos() SÍ sabe leerlos (mammoth, ver
  // chilecompraDocReader.js) — es el mismo formato que ya se lee sin problema
  // para licitaciones. Un adjunto Word real quedaba silenciosamente fuera del
  // análisis, indistinguible de "no había nada que leer".
  const TIPOS_WORD = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  const legibles = descargados.filter(d => d.mediaType === 'application/pdf' || d.mediaType?.startsWith('image/') || TIPOS_WORD.includes(d.mediaType))
  if (!legibles.length) {
    console.warn(`⚠️ Compra Ágil ${detalle.codigo_externo}: ${descargados.length} documento(s) descargado(s) pero ninguno es PDF/imagen/Word legible (tipos: ${descargados.map(d => d.mediaType).join(', ')})`)
    return detalle
  }

  // 2026-09-09 (caso real: 654478-64-COT26, Subsecretaría de Prevención del
  // Delito — SÍ tenía un PDF real de adjunto en el portal) — se guardan los
  // PDF/imagen descargados como anexos reales de la oportunidad pase lo que
  // pase con la extracción de ítems de abajo. Antes se usaban una sola vez
  // acá mismo para intentar sacar ítems y se descartaban — si la IA no
  // encontraba ítems estructurados (o si el usuario quería reanalizar
  // después), el PDF ya descargado se perdía para siempre y "Leer ficha
  // pública y calcular score" no tenía nada que leer, aunque el adjunto
  // existiera de verdad en Mercado Público. guardarYProcesarOportunidad() los
  // inserta en documentos_adjuntos una vez que existe el id de la
  // oportunidad — desde ahí quedan disponibles exactamente igual que un
  // anexo subido a mano.
  detalle = { ...detalle, _anexosDescargados: legibles }

  try {
    const extraccion = await leerAnexos(legibles)
    if (extraccion?.items?.length) {
      return {
        ...detalle,
        items: extraccion.items,
        advertencias: [
          ...(detalle.advertencias || []),
          `Ítems extraídos del/los anexo(s) adjunto(s) (${legibles.length} documento(s)) — no de la línea genérica de la API.`,
          ...(extraccion.extraccion_posiblemente_incompleta ? ['⚠️ El modelo no está seguro de haber capturado el 100% de los ítems del anexo — revisar el PDF original antes de cotizar.'] : []),
        ],
      }
    }
    console.warn(`⚠️ Compra Ágil ${detalle.codigo_externo}: se leyeron ${legibles.length} anexo(s) pero la IA no encontró ítems — se usa la línea genérica de la API`)
  } catch (e) {
    console.warn(`⚠️ Compra Ágil ${detalle.codigo_externo}: falló la lectura IA de los anexos adjuntos — ${e.message}`)
  }
  return detalle
}

/**
 * Paso 1 — Ingesta. Trae la publicación de Compra Ágil por su código externo
 * (ej. "1057539-228-COT26") desde la API OFICIAL de Compra Ágil
 * (compraAgilApiClient.js, reescrito 2026-09-08 noche contra
 * api2.mercadopublico.cl/v2/compra-agil — ya no depende de la API interna
 * bloqueada por WAF), la guarda/actualiza como oportunidad y corre el cruce
 * con catálogo + adjunta fichas técnicas. Es seguro llamarla varias veces
 * con el mismo código (upsert por UNIQUE(fuente, codigo_externo)).
 */
async function importarCompraAgil(codigo, user, tipoEventoBase = 'compra_agil', fuente = 'compra_agil') {
  let detalle = await api.buscarCompraAgil(codigo)
  detalle = await enriquecerConDocumentosAdjuntos(detalle)
  return guardarYProcesarOportunidad(codigo, detalle, user, tipoEventoBase, fuente)
}

/**
 * Quita tildes/diacríticos para comparar palabras clave vs. nombres de la API
 * sin depender de que ambos lados estén acentuados igual (ej. keyword
 * "liquido de frenos" sin tilde vs. nombre real "Líquido de frenos DOT4").
 */
function normalizar(txt) {
  return (txt || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Detector automático — reemplaza a compraAgilScraper.detectarYImportarNuevas
 * (navegador headless, deshabilitado desde 2026-09-08 por saturar la memoria
 * de Render). Trae TODAS las Compra Ágil "publicada" con cambios recientes,
 * a nivel NACIONAL (una sola consulta paginada, ver listarPublicadasEnVentana)
 * — cero navegador, cero pasos manuales, cero riesgo de memoria.
 *
 * ⚠️ 2026-09-09 (caso real perdido: Quilpué/2428-1262-COT26) — ANTES esto
 * filtraba en memoria por una lista fija de palabras clave del rubro (la
 * misma de chilecompraCron.js). Pedido explícito del usuario tras perder ese
 * caso real: "debió traerlo, debió hacer match con los intereses...si lo
 * hace en Licitaciones, de hecho lo que debe hacer es traer lo que ve en
 * Mercado Público, no inventar...luego en el dash se filtra". Licitaciones
 * (chilecompraCron.js) SÍ sigue filtrando por keyword porque ahí el volumen
 * nacional diario es demasiado alto para traer todo — pero para Compra Ágil
 * el usuario decidió explícitamente (tras comparar las opciones) NO aplicar
 * ningún filtro de palabras en la ingesta: se trae TODO lo publicado a nivel
 * nacional tal cual, y el filtrado/relevancia se hace después en el
 * dashboard (buscador, filtro de tipo/región) — nunca se pierde un caso real
 * por un filtro de palabras mal calibrado. A cambio, hay más volumen en la
 * base de datos; es la contrapartida aceptada.
 *
 * ⚠️ 2026-09-08 (noche, incidente #2, contexto histórico): ANTES de todo esto
 * el sistema hacía 12 búsquedas separadas (`q=<palabra clave>`) contra la
 * API, y 5 de esas 12 palabras devolvían HTTP 500 en el 100% de las corridas
 * — otra razón más para no depender de una lista de palabras contra esta
 * API. Ver el aviso completo en compraAgilApiClient.listarPublicadasEnVentana().
 */
async function detectarYImportarAutomatico({
  ventanaMs = VENTANA_DEFAULT_MS, user = USER_AUTOMATICO,
  estados = ESTADOS_DEFAULT, regiones = REGIONES_DEFAULT,
} = {}) {
  if (_corriendo) {
    return { yaEnCurso: true, ...(_ultimoResumen || {}) }
  }
  _corriendo = true

  const resumen = {
    codigosVistos: 0, nuevas: 0,
    importadas: [], errores: [], iniciado: new Date().toISOString(),
    // 2026-09-09 — transparencia pedida por el usuario: "que esta buscando...
    // que estado? entre que fechas? regiones?" — antes esto era invisible,
    // fijo en el código (solo "publicada", ventana 6h, sin filtro de región).
    // Ahora queda en el propio resumen que ve la UI (y el log del cron).
    parametrosBusqueda: { ventanaMs, estados, regiones },
  }
  // 2026-09-09 — se publica el objeto `resumen` como "en curso" DESDE YA (no
  // solo al terminar): como es el mismo objeto por referencia, cada campo que
  // se va llenando abajo (codigosVistos, nuevas, importadas) queda visible de
  // inmediato para quien esté haciendo polling de GET /scraper-estado
  // mientras `corriendo` sigue en true — pedido del usuario tras quedarse sin
  // ninguna señal de avance ("dónde veo el progreso"), más relevante ahora
  // que la búsqueda es nacional y sin filtro de palabras (puede tardar más).
  _ultimoResumen = resumen
  try {
    const codigosVistos = new Set()

    try {
      // 2026-09-09 (incidente #5) — listarPublicadasEnVentana ahora pide una
      // región a la vez (16 llamadas chicas en vez de 1 pesada) porque el
      // listado nacional sin `region` respondía 504 del lado de ChileCompra.
      // Devuelve { items, erroresPorRegion } — una región que falle no tumba
      // las demás, así que se registra el detalle pero se sigue con lo que sí
      // llegó.
      const { items: publicadas, erroresPorRegion } = await api.listarPublicadasEnVentana({ ventanaMs, estados, regiones })
      for (const it of publicadas) {
        if (it.codigo) codigosVistos.add(it.codigo)
      }
      if (erroresPorRegion?.length) {
        resumen.errores.push(...erroresPorRegion.map(e => `Listado publicada — ${e}`))
      }
    } catch (e) {
      resumen.errores.push(`Listado publicada: ${e.message}`)
    }
    resumen.codigosVistos = codigosVistos.size

    if (codigosVistos.size) {
      const existentes = new Set(
        db.prepare(`SELECT codigo_externo FROM oportunidades_chilecompra WHERE fuente = 'compra_agil'`)
          .all().map(r => r.codigo_externo)
      )
      const nuevos = [...codigosVistos].filter(c => !existentes.has(c))
      resumen.nuevas = nuevos.length

      for (const codigo of nuevos) {
        try {
          const op = await importarCompraAgil(codigo, user, 'compra_agil_auto')
          resumen.importadas.push({ codigo, id: op.id, nombre: op.nombre })
        } catch (e) {
          resumen.errores.push(`Código ${codigo}: ${e.message}`)
        }
      }
    }
  } catch (e) {
    resumen.errores.push(`Detector: ${e.message}`)
  } finally {
    _corriendo = false
  }

  resumen.finalizado = new Date().toISOString()
  const horas = Math.round(resumen.parametrosBusqueda.ventanaMs / 3600_000)
  console.log(
    `ℹ️ Compra Ágil API — estado=[${resumen.parametrosBusqueda.estados.join(',')}] ` +
    `ventana=${horas}h región=[${resumen.parametrosBusqueda.regiones.join(',') || 'todas'}] — ` +
    `${resumen.codigosVistos} código(s) vistos, ` +
    `${resumen.nuevas} nueva(s), ${resumen.importadas.length} importada(s), ${resumen.errores.length} error(es)`
  )
  _ultimoResumen = resumen
  return resumen
}

/**
 * Convierte la extracción genérica de chilecompraDocReader (leerAnexos /
 * leerFichaPublica — mismo formato ya usado y probado para licitaciones) al
 * shape de `detalle` que espera guardarYProcesarOportunidad. Los ítems ya
 * vienen con el mismo nombre de campos (descripcion_solicitada, cantidad,
 * unidad, especificacion_tecnica, precio_unitario_referencial) — no hace
 * falta mapearlos.
 */
function mapearExtraccionAAgil(extraccion, codigo) {
  return {
    nombre: extraccion.organismo_nombre ? `Compra Ágil ${codigo} — ${extraccion.organismo_nombre}` : `Compra Ágil ${codigo}`,
    descripcion: extraccion.resumen || null,
    organismo_nombre: extraccion.organismo_nombre || null,
    organismo_rut: extraccion.organismo_rut || null,
    region: extraccion.region || null,
    comuna: extraccion.comuna || null,
    direccion_entrega: extraccion.direccion_entrega || null,
    fecha_publicacion: null,
    fecha_cierre: extraccion.fecha_cierre_cotizacion || null,
    presupuesto_estimado: extraccion.presupuesto_estimado || null,
    url_portal: `https://www.mercadopublico.cl/CompraAgil/Modules/Detail/DetailCompraAgil.aspx?qs=${codigo}`,
    items: extraccion.items || [],
    advertencias: extraccion.extraccion_posiblemente_incompleta
      ? ['⚠️ El modelo no está seguro de haber capturado el 100% de los ítems — revisar el documento/texto original antes de cotizar.']
      : [],
    debugUltimaRespuesta: extraccion,
  }
}

/**
 * Paso 1 (alternativo, 2026-09) — Ingesta MANUAL: en vez de traer la
 * publicación desde la API bloqueada, el usuario pega el texto de la
 * solicitud (ej. copiado de buscador.mercadopublico.cl/ficha?code=..., que sí
 * carga en un navegador normal — el WAF bloquea llamadas de servidor a
 * servidor, no la navegación normal) y/o sube el PDF/imagen/Word que
 * corresponda (a veces Compra Ágil trae anexo, a veces solo texto plano — ver
 * pedido explícito del usuario de "lectura inteligente" de ambos casos). La
 * misma IA que ya lee anexos de licitaciones (chilecompraDocReader) hace la
 * extracción — ítems, organismo, presupuesto, fechas — y de ahí en adelante
 * es EXACTAMENTE el mismo pipeline que importarCompraAgil (cruce, scores,
 * fichas técnicas).
 *
 * @param {{codigo: string, texto?: string, documentos?: Array<{base64:string,mediaType:string,nombre:string}>, user,
 *          tipoEventoBase?: string}} args tipoEventoBase por defecto queda como
 *          "compra_agil_manual" (pegado a mano en la UI); el scraper automático
 *          (ver compraAgilScraper.js) pasa "compra_agil_auto" para que el
 *          historial distinga "detectada sola" de "pegada por un usuario",
 *          sin duplicar nada del resto del pipeline (mismo guardado, mismo
 *          cruce, mismos scores).
 */
async function importarCompraAgilManual({ codigo, texto, documentos, user, tipoEventoBase = 'compra_agil_manual' }) {
  if (!codigo?.trim()) throw new Error('importarCompraAgilManual: falta el código de la Compra Ágil')
  if (!texto?.trim() && !documentos?.length) {
    throw new Error('importarCompraAgilManual: pega el texto de la publicación o sube al menos un documento (PDF/imagen/Word)')
  }

  const extraccion = documentos?.length
    ? await leerAnexos(documentos)
    : await leerFichaPublica(texto)

  const detalle = mapearExtraccionAAgil(extraccion, codigo.trim())
  if (!detalle.items.length) {
    throw new Error('La IA no encontró ningún ítem/producto solicitado en el texto o documento entregado — revisa que efectivamente sea una solicitud de cotización.')
  }

  return guardarYProcesarOportunidad(codigo.trim(), detalle, user, tipoEventoBase)
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

// ── Sincronización de estado REAL desde ChileCompra (2026-09-09) ───────────
// Pedido real del usuario: "no veo como recibir información del estado desde
// la api...si se adjudicó etc. no se a cuales postulo, cuales descarto,
// cuales estoy en proceso". Esto es DISTINTO del pipeline de gestión interno
// de RMG (columna `estado`, ver chilecompraController.TRANSICIONES — RMG lo
// mueve a mano: detectada → analizando → ... → publicada → adjudicada). Acá
// se trata del estado que le pertenece a ChileCompra y cambia solo en su
// portal (publicada → cerrada / desierta / cancelada / proveedor_seleccionado
// → eventualmente con una Orden de Compra emitida). El sistema importaba una
// vez y nunca volvía a preguntar qué pasó después — esto cierra ese hueco.
let _corriendoSync = false
let _ultimoResumenSync = null
// Terminal para efectos de esta sincronización: una vez que ChileCompra la
// cierra/anula, ya no puede volver a cambiar — se deja de re-consultar para
// no gastar cuota. "proveedor_seleccionado" NO se marca terminal porque
// después de eso normalmente se emite la Orden de Compra (orden_compra_codigo
// pasa de null a tener valor) — se sigue mirando hasta que la haya, o hasta
// que pase un máximo de intentos razonable (ver LIMITE_INTENTOS_SYNC abajo).
const ESTADOS_TERMINALES_CHILECOMPRA = ['cerrada', 'desierta', 'cancelada']

function estadoSync() {
  return { corriendo: _corriendoSync, ultimoResumen: _ultimoResumenSync }
}

// 2026-09-11 (Evaluador) — extraído del cuerpo del for de abajo para que
// tanto el barrido masivo (sincronizarEstadosReales, solo fuente='compra_agil')
// como la consulta puntual de UN código (Evaluador — "busca solo el id que se
// ingresó, no toda la data") reutilicen exactamente la misma lógica de
// comparación/guardado, sin duplicarla.
async function sincronizarEstadoDeUnaOportunidad(op, user = USER_AUTOMATICO) {
  const detalle = await api.buscarCompraAgil(op.codigo_externo)
  const estadoNuevo = detalle.estado_codigo || null
  const ocNueva = detalle.orden_compra_codigo || null
  const cambioEstado = estadoNuevo !== op.estado_real_chilecompra
  const cambioOc = ocNueva !== op.orden_compra_codigo
  if (cambioEstado || cambioOc) {
    db.prepare(`
      UPDATE oportunidades_chilecompra
      SET estado_real_chilecompra = ?, orden_compra_codigo = ?, estado_real_actualizado_at = datetime('now')
      WHERE id = ?
    `).run(estadoNuevo, ocNueva, op.id)

    const detalleEvento = `Estado real en ChileCompra: "${op.estado_real_chilecompra || 'sin dato'}" → "${estadoNuevo || 'sin dato'}"` +
      (cambioOc ? ` · Orden de Compra: ${ocNueva || 'sin emitir'}` : '')
    logEvento(op.id, 'estado_real_actualizado', {
      usuario_id: user?.id, usuario_nombre: user?.email || 'sync-automático', detalle: detalleEvento,
    })
  } else {
    // Igual deja registro de que se revisó, aunque no haya cambiado — así
    // "última vez revisado" siempre es confiable.
    db.prepare(`UPDATE oportunidades_chilecompra SET estado_real_actualizado_at = datetime('now') WHERE id = ?`).run(op.id)
  }
  return { cambio: !!(cambioEstado || cambioOc), estadoAnterior: op.estado_real_chilecompra, estadoNuevo, ordenCompra: ocNueva }
}

async function sincronizarEstadosReales({ user = USER_AUTOMATICO, fuente = 'compra_agil' } = {}) {
  if (_corriendoSync) {
    return { yaEnCurso: true, ...(_ultimoResumenSync || {}) }
  }
  _corriendoSync = true

  const resumen = {
    revisadas: 0, actualizadas: 0, cambiosDetectados: [], errores: [],
    iniciado: new Date().toISOString(),
  }
  // Mismo motivo que en detectarYImportarAutomatico: publicar el resumen "en
  // curso" desde ya para que el polling de GET /sincronizar-estado-estado
  // muestre avance real mientras corre, no solo el resultado final.
  _ultimoResumenSync = resumen
  try {
    // Solo las que todavía pueden cambiar: sin estado real guardado, o con uno
    // que no es terminal, Y que tampoco ya tienen Orden de Compra registrada
    // (una vez que hay OC, el desenlace ya se conoce — no hace falta seguir
    // preguntando).
    const activas = db.prepare(`
      SELECT id, codigo_externo, estado_real_chilecompra, orden_compra_codigo
      FROM oportunidades_chilecompra
      WHERE fuente = ?
        AND orden_compra_codigo IS NULL
        AND (estado_real_chilecompra IS NULL OR estado_real_chilecompra NOT IN (${ESTADOS_TERMINALES_CHILECOMPRA.map(() => '?').join(',')}))
    `).all(fuente, ...ESTADOS_TERMINALES_CHILECOMPRA)

    for (const op of activas) {
      resumen.revisadas++
      try {
        const r = await sincronizarEstadoDeUnaOportunidad(op, user)
        if (r.cambio) {
          resumen.actualizadas++
          resumen.cambiosDetectados.push({ id: op.id, codigo: op.codigo_externo, estadoAnterior: r.estadoAnterior, estadoNuevo: r.estadoNuevo, ordenCompra: r.ordenCompra })
        }
      } catch (e) {
        resumen.errores.push(`Código ${op.codigo_externo}: ${e.message}`)
      }
    }
  } catch (e) {
    resumen.errores.push(`Sincronización: ${e.message}`)
  } finally {
    _corriendoSync = false
  }

  resumen.finalizado = new Date().toISOString()
  console.log(
    `ℹ️ Compra Ágil — sincronización de estado real: ${resumen.revisadas} revisada(s), ` +
    `${resumen.actualizadas} actualizada(s), ${resumen.errores.length} error(es)`
  )
  if (resumen.cambiosDetectados.length) {
    for (const c of resumen.cambiosDetectados) {
      console.log(`  ↳ ${c.codigo}: "${c.estadoAnterior || 'sin dato'}" → "${c.estadoNuevo || 'sin dato'}"${c.ordenCompra ? ` · OC ${c.ordenCompra}` : ''}`)
    }
  }
  _ultimoResumenSync = resumen
  return resumen
}

module.exports = {
  importarCompraAgil, importarCompraAgilManual, generarFundamentoCotizacion, sugerirPrecio, calcularYGuardarScores,
  detectarYImportarAutomatico, estado, sincronizarEstadosReales, sincronizarEstadoDeUnaOportunidad, estadoSync,
  // Exportada también para tests offline (ver /tmp/test_compraagil_documentos.js) — no es
  // parte de la API pública del módulo, pero no hay razón para escondarla del todo.
  enriquecerConDocumentosAdjuntos,
}
