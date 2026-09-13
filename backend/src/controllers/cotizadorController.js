/**
 * RMG Parts — Cotizador (2026-09-13)
 *
 * Pestaña nueva, deliberadamente simple, para reemplazar el uso de
 * Evaluador/ChileCompra en el flujo del día a día de cotizar un código de
 * Compra Ágil puntual. Nace de tres fallas reales, evidenciadas con casos
 * concretos (4042-130-COT26, 872-409-COT26, 3877-474-COT26):
 *
 *  1. "Ya estaba ingresada" bloqueaba códigos que el usuario SÍ quería volver
 *     a consultar — Evaluador deliberadamente no releía un código ya
 *     ingresado (por diseño explícito de una ronda anterior). Acá NO existe
 *     ese atajo: "Buscar" SIEMPRE vuelve a traer el código desde Mercado
 *     Público, sin importar si ya existe — importarCompraAgil() ya hace un
 *     UPSERT completo (borra y reinserta ítems) sobre la misma fila, así que
 *     repetir la búsqueda simplemente refresca todo, nunca duplica.
 *  2. El motor de matching (cruzarItemsConCatalogo, chilecompraScoring.js)
 *     puede devolver una "sugerencia genérica de categoría" con 25-37% de
 *     confianza — y esos matches de baja confianza estaban llegando al Excel
 *     como si fueran un SKU real. Acá se aplica un piso de confianza real
 *     DESPUÉS del cruce: cualquier ítem por debajo del umbral queda SIN SKU,
 *     marcado explícitamente "SIN MATCH — revisar manualmente", nunca se
 *     fuerza un producto solo porque fue "el menos malo".
 *  3. El Excel de cruce y el detalle en pantalla podían mostrar datos
 *     distintos porque el Excel se generaba una vez y quedaba guardado como
 *     archivo estático, mientras el detalle en pantalla leía la tabla en
 *     vivo — si los ítems se recalculaban después, el Excel viejo nunca se
 *     enteraba. Acá NO se guarda ningún Excel: /excel genera el archivo al
 *     vuelo, desde las mismas filas que ve la pantalla, en cada descarga.
 *
 * Reutiliza las tablas de ChileCompra/Compra Ágil (oportunidades_chilecompra,
 * oportunidad_chilecompra_items) bajo fuente='cotizador' — mismo motor de
 * ingesta (compraAgilAnalisis.importarCompraAgil, ya con el fix de
 * especificación técnica de compraAgilApiClient.js) y el mismo motor de
 * matching (chilecompraScoring.cruzarItemsConCatalogo, con Pasada 0 de
 * atributos técnicos exactos) — pero SIN nada del resto: sin Kanban de
 * estados, sin checklist de postulación, sin historial, sin scraping de
 * ficha pública. Solo: buscar (siempre fresco) → ver → descargar → eliminar.
 */
const { db } = require('../../config/database')
const { importarCompraAgil } = require('../services/compraAgilAnalisis')
const { generarExcelCruce } = require('../services/chilecompraExcelExport')

const FUENTE = 'cotizador'

// Piso de confianza real — por debajo de esto, NUNCA se entrega un SKU como
// si fuera una recomendación válida. 0.55 es deliberadamente exigente: mejor
// mostrar "sin match, revisar a mano" que un producto que no corresponde.
const UMBRAL_CONFIANZA = 0.55

const FORMATO_CODIGO = /^\d+-\d+-COT\d+$/i

function withItems(op) {
  if (!op) return null
  const items = db.prepare(
    'SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ? ORDER BY rowid'
  ).all(op.id)
  return { ...op, items }
}

// Después de cruzarItemsConCatalogo (que corre dentro de importarCompraAgil),
// limpia cualquier match que no alcance el piso de confianza real — lo deja
// visiblemente SIN SKU en vez de dejar pasar una "sugerencia genérica" como
// si fuera un producto encontrado. Corre siempre, en cada búsqueda/reingesta.
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

// ── Listado ──────────────────────────────────────────────────────────────
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

// ── Buscar — SIEMPRE trae fresco desde Mercado Público, exista o no ───────
const buscar = async (req, res) => {
  try {
    const codigoRaw = (req.body?.codigo || '').trim()
    if (!codigoRaw) return res.status(400).json({ error: 'Falta el código (ej. 4042-130-COT26)' })
    if (!FORMATO_CODIGO.test(codigoRaw)) {
      return res.status(400).json({ error: `"${codigoRaw}" no parece un código de Compra Ágil válido (formato esperado: 4042-130-COT26)` })
    }

    // Sin atajo de "ya existe, no releo" — cada clic en Buscar es una
    // relectura real desde la API oficial. importarCompraAgil hace el UPSERT
    // completo (misma fila, ítems borrados y reinsertados) por
    // UNIQUE(fuente, codigo_externo), así que nunca duplica.
    const op = await importarCompraAgil(codigoRaw, req.user, 'cotizador', FUENTE)
    const limpiados = limpiarMatchesDebiles(op.id)
    if (limpiados > 0) {
      console.log(`ℹ️ Cotizador ${codigoRaw}: ${limpiados} ítem(s) bajo el piso de confianza (${Math.round(UMBRAL_CONFIANZA * 100)}%) quedaron marcados SIN MATCH en vez de forzar un SKU.`)
    }

    res.json(withItems(db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(op.id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Excel — se genera al vuelo en cada descarga, nunca un archivo guardado ─
const descargarExcel = async (req, res) => {
  try {
    const op = db.prepare(`SELECT * FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })

    const buffer = await generarExcelCruce(op.id)
    const nombreArchivo = `Cotizacion_${op.codigo_externo}.xlsx`.replace(/[^\w.\-]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Eliminar — pedido explícito del usuario, sin confirmaciones a medias ──
const eliminar = (req, res) => {
  try {
    const op = db.prepare(`SELECT id FROM oportunidades_chilecompra WHERE id = ? AND fuente = ?`).get(req.params.id, FUENTE)
    if (!op) return res.status(404).json({ error: 'No encontrada' })
    // ON DELETE CASCADE en oportunidad_chilecompra_items y
    // oportunidad_chilecompra_historial se encarga de los ítems e historial.
    db.prepare(`DELETE FROM oportunidades_chilecompra WHERE id = ?`).run(op.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { listar, getDetalle, buscar, descargarExcel, eliminar }
