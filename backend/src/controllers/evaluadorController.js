/**
 * RMG Parts — Controlador Evaluador (2026-09-11)
 *
 * Pedido del usuario: una pestaña bajo ChileCompra donde el humano ingresa a
 * mano el código de una solicitud puntual (Compra Ágil, formato
 * "1493-495-COT26") y RECIÉN AHÍ el sistema va a buscar la data a Mercado
 * Público — nunca barre todo el sitio. Reutiliza EXACTAMENTE la misma tabla
 * (oportunidades_chilecompra, fuente='evaluador'), el mismo pipeline de
 * ingesta (services/compraAgilAnalisis — ya generalizado con un parámetro
 * `fuente`) y el mismo Kanban/estados que ChileCompra y Compra Ágil.
 *
 * IMPORTANTE (2026-09-11) — este módulo NO depende de /api/chilecompra: ese
 * router está apagado de emergencia en app.js por un OOM en Render (ver nota
 * ahí). Por eso este controlador REQUIERE directamente las funciones de
 * chilecompraController.js (getOportunidad, cambiarEstado, actualizarObservacionItem,
 * extraerFichasTecnicas, getChecklistPostulacion) y las monta acá, bajo
 * /api/evaluador — son handlers agnósticos de fuente, ninguno chequea el
 * interruptor chilecompra_enabled, así que funcionan aunque ese módulo siga
 * apagado. Si en algún momento se reactiva /api/chilecompra, nada de esto
 * cambia — ambos caminos seguirían funcionando en paralelo.
 *
 * Dos casos al ingresar un código en "Buscar":
 *  1. Código NUEVO (no existe con fuente='evaluador') → ingesta completa:
 *     trae la publicación de la API oficial de Compra Ágil, lee los adjuntos
 *     reales de la solicitud con IA, extrae los ítems, hace el cruce con el
 *     catálogo RMG y adjunta las fichas técnicas — todo en un solo paso
 *     (importarCompraAgil, ya genérico por fuente).
 *  2. Código YA ingresado → NO se vuelve a leer nada ni a re-cruzar: solo se
 *     consulta el estado real en ChileCompra (adjudicada/OC emitida/etc.),
 *     igual que el botón "Actualizar estado real" de Compra Ágil pero
 *     acotado a este único código (sincronizarEstadoDeUnaOportunidad).
 *
 * El campo libre + "Volver a generar" (corregir un ítem mal emparejado) y el
 * botón "Extraer fichas" NUNCA vuelven a Mercado Público — reutilizan tal
 * cual actualizarObservacionItem / extraerFichasTecnicas de chilecompraController
 * (cruce heurístico contra catálogo local, sin llamada externa).
 */
const { db } = require('../../config/database')
const {
  importarCompraAgil, sincronizarEstadoDeUnaOportunidad,
} = require('../services/compraAgilAnalisis')
const cc = require('../controllers/chilecompraController')

const FUENTE = 'evaluador'

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

// Formato real de un código de Compra Ágil, ej. "1493-495-COT26" —
// validación suave, solo para dar un error entendible antes de llamar a la
// API (la API igual es la validación final de si el código existe).
const FORMATO_CODIGO = /^\d+-\d+-COT\d+$/i

// ── Listado (solo fuente = evaluador) ───────────────────────────────────────
const listar = (req, res) => {
  try {
    const { estado, q } = req.query
    let sql = `SELECT * FROM oportunidades_chilecompra WHERE fuente = ?`
    const params = [FUENTE]
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

const getDetalle = (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    res.json(withDetails(op))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Botón "Buscar" — el único punto de entrada a Mercado Público ───────────
const buscar = async (req, res) => {
  try {
    const codigoRaw = (req.body?.codigo || '').trim()
    if (!codigoRaw) return res.status(400).json({ error: 'Falta el código de la solicitud (ej. 1493-495-COT26)' })
    if (!FORMATO_CODIGO.test(codigoRaw)) {
      return res.status(400).json({ error: `"${codigoRaw}" no parece un código de Compra Ágil válido (formato esperado: 1493-495-COT26)` })
    }

    const existente = db.prepare(
      `SELECT * FROM oportunidades_chilecompra WHERE fuente = ? AND codigo_externo = ?`
    ).get(FUENTE, codigoRaw)

    if (existente) {
      // Ya ingresada — SOLO se revisa el cambio de estado real en
      // ChileCompra, no se vuelve a leer nada ni a re-cruzar (pedido
      // explícito: "no busca a toda la data, solo busca los id nuevos o los
      // que ya estan ingresados para ver su cambio de estado").
      try {
        await sincronizarEstadoDeUnaOportunidad(existente, req.user)
      } catch (e) {
        // No bloquea — igual se devuelve la ficha tal como está.
        return res.json({ ...withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(existente.id)),
          advertencia: `No se pudo revisar el estado real en ChileCompra: ${e.message}` })
      }
      return res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(existente.id)))
    }

    // Código nuevo — ingesta completa (API oficial + lectura de adjuntos +
    // cruce con catálogo + fichas técnicas), igual que Compra Ágil.
    const op = await importarCompraAgil(codigoRaw, req.user, 'evaluador', FUENTE)
    res.json(withDetails(op))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 2026-09-12 — BUG real reportado: el botón "Leer ficha pública y calcular
// score" (estado 'analizando') usaba cc.analizarOportunidad tal cual, que en
// chilecompraController SÍ está bloqueado por el interruptor
// chilecompra_enabled (apagado por defecto, ver nota al principio de este
// archivo) — devolvía "Módulo ChileCompra desactivado temporalmente" aunque
// Evaluador es un módulo aparte, sin nada pesado corriendo en segundo plano.
// Se llama directo a analizarOportunidadInterno (la función real, sin el
// gate) en vez del handler HTTP gateado.
const analizarOportunidad = async (req, res) => {
  try {
    await cc.analizarOportunidadInterno(req.params.id, req.user)
    res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(req.params.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// 2026-09-13 — BUG real reportado (código 3877-474-COT26, I. Municipalidad
// de Lampa): esta solicitud NO tiene adjuntos — el texto técnico completo del
// ítem ("GRASA LUBRICANTE DE COMPLEJO DE LITIO... MoS2 3-5%... BALDES DE 16 KG
// O SUPERIOR") vive directamente en "Listado de productos solicitados" de la
// página pública, no en un documento. `mapearDetalle` (compraAgilApiClient.js)
// solo leía `it.descripcion`, y para este caso ese campo no traía el texto
// largo — el cruce quedó con el nombre corto "Grasa" a secas y matcheó contra
// un aceite de motor 5W-30 al 25% de confianza (evidencia: Excel real subido
// por el usuario). Ya se corrigió `mapearDetalle` para no apostar a un solo
// nombre de campo (ver extraerEspecificacionCompleta en compraAgilApiClient.js),
// pero la oportunidad 3877-474-COT26 YA quedó guardada en la base con el dato
// viejo — `buscar` (arriba) deliberadamente NO relee códigos ya ingresados,
// así que sin esta acción el fix nuevo nunca se aplicaría a este caso ya
// existente. `reingestar` vuelve a llamar `importarCompraAgil` para el MISMO
// código YA guardado (mismo `fuente='evaluador'`), lo que — al ser un UPSERT
// completo por (fuente, codigo_externo) en guardarYProcesarOportunidad — borra
// y reinserta los ítems, recalcula el cruce contra el catálogo y regenera el
// Excel, todo sobre la misma fila (no crea una oportunidad duplicada).
//
// OJO: a diferencia del botón equivalente de Compra Ágil (que pega contra
// POST /api/compra-agil/importar, cuyo controlador llama a importarCompraAgil
// SIN pasar `fuente` — por lo que asume el default 'compra_agil'), acá no se
// puede reusar ese mismo endpoint genérico: si se llamara para una
// oportunidad de Evaluador, el UPSERT buscaría una fila con fuente='compra_agil'
// para ese código, no la encontraría (la real tiene fuente='evaluador'), e
// insertaría una fila NUEVA duplicada en vez de actualizar la existente. Por
// eso esta acción vive acá, pasando explícitamente FUENTE='evaluador'.
const reingestar = async (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    await importarCompraAgil(op.codigo_externo, req.user, 'evaluador_reingesta', FUENTE)
    res.json(withDetails(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(op.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  listar,
  getDetalle,
  buscar,
  analizarOportunidad,
  reingestar,
  // Reutilizados tal cual de chilecompraController — agnósticos de fuente,
  // ninguno depende de que /api/chilecompra esté montado ni del interruptor
  // chilecompra_enabled.
  cambiarEstado: cc.cambiarEstado,
  actualizarObservacionItem: cc.actualizarObservacionItem,
  extraerFichasTecnicas: cc.extraerFichasTecnicas,
  getChecklistPostulacion: cc.getChecklistPostulacion,
  limpiarHistorial: cc.limpiarHistorial,
}
