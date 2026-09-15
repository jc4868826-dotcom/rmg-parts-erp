/**
 * RMG Parts — Cotizador Manual (2026-09-15)
 *
 * Pestaña nueva para el flujo B2B privado del día a día: el usuario escribe
 * a mano una lista de productos que un cliente pidió (por teléfono, WhatsApp,
 * en el mesón), el sistema propone SKU/precio para cada línea combinando:
 *
 *  1. taggingTecnico.js — la base de conocimiento técnica de 30 fichas
 *     Vistony verificadas por JC (tipo_base real, alertas cuando la ficha no
 *     declara sintético/mineral, alertas de cruce SKU ya detectadas a mano).
 *  2. chilecompraScoring.buscarSkuCandidato — el MISMO motor de matching que
 *     usan Cotizador/Evaluador/ChileCompra contra lista_precios (filtrado a
 *     marca='vistony', decisión explícita y repetida de JC, 2026-09-13 — no
 *     se levanta ese filtro acá tampoco).
 *
 * Ninguna de las dos señales fuerza un match: si no hay confianza suficiente,
 * la línea vuelve "sin match — revisar manualmente" (mismo criterio que
 * cotizadorController.js, UMBRAL_CONFIANZA). El usuario corrige a mano en la
 * pantalla antes de generar la cotización real.
 *
 * v1 deliberadamente simple (alcance acordado con JC, 2026-09-15): SIN tabla
 * propia, SIN Kanban, SIN historial de solicitudes — "analizar" es un cálculo
 * puro (no guarda nada), y "generar" reutiliza tal cual _insertCotizacion de
 * cotizacionesController.js para crear una cotización real en la MISMA tabla
 * `cotizaciones`/`cotizacion_items` que usa todo el resto del ERP —
 * canal_origen='cotizador_manual' la distingue en reportes, sin tablas
 * nuevas ni migraciones en config/database.js.
 */
const { db } = require('../../config/database')
const { buscarProductoTagging } = require('../services/taggingTecnico')
const { buscarSkuCandidato } = require('../services/chilecompraScoring')
const { _insertCotizacion } = require('./cotizacionesController')

// Mismo piso de confianza que Cotizador (cotizadorController.js) — por
// debajo de esto, NUNCA se entrega un SKU como si fuera una recomendación
// válida.
const UMBRAL_CONFIANZA = 0.55

// ── Analizar — cálculo puro, no guarda nada en la base ────────────────────
// POST /api/cotizador-manual/analizar
// body: { items: [{ descripcion, cantidad }] }
const analizar = (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Se requiere al menos un ítem (descripcion, cantidad)' })
    }

    const resultado = items.map(it => {
      const descripcion = (it.descripcion || '').trim()
      const cantidad = Number(it.cantidad) || 1

      if (!descripcion) {
        return {
          descripcion: it.descripcion || '', cantidad,
          sin_match: true, alerta_sku: true,
          observacion: 'Descripción vacía — no se puede buscar un producto.',
        }
      }

      // 1. Señal técnica — tagging Vistony verificado por JC.
      const tag = buscarProductoTagging(descripcion)

      // 2. Señal de matching real contra lista_precios — mismo motor que el
      //    resto del ERP. Se le pasa el grado SAE/ISO del tagging como
      //    especificación técnica extra cuando existe, para ayudar a la
      //    Pasada 0 de atributo exacto (ver chilecompraScoring.js).
      const especTecnica = (tag?.producto?.grados_sae_iso || []).join(' ')
      const match = buscarSkuCandidato(descripcion, especTecnica)

      let sku_rmg = null, descripcion_sku = null, precio_venta_neto = null, costo_unidad_neto = null
      if (match?.sku) {
        const row = db.prepare(
          'SELECT codigo_sku, descripcion, precio_venta_neto, costo_unidad_neto FROM lista_precios WHERE codigo_sku = ?'
        ).get(match.sku)
        if (row) {
          sku_rmg = row.codigo_sku
          descripcion_sku = row.descripcion
          precio_venta_neto = row.precio_venta_neto
          costo_unidad_neto = row.costo_unidad_neto
        }
      }

      const confianzaBaja = match && (match.confianza == null || match.confianza < UMBRAL_CONFIANZA)
      const sinMatch = !sku_rmg || confianzaBaja
      const alertaTipoBase = !!tag?.producto?.alerta_tipo_base
      const alertaSkuTagging = !!tag?.producto?.alerta_sku

      let observacion = null
      if (sinMatch) {
        const pct = match?.confianza != null ? Math.round(match.confianza * 100) : 0
        observacion = match?.sku
          ? `SIN MATCH — revisar manualmente (el emparejador solo llegó a ${pct}% de confianza, bajo el piso mínimo de ${Math.round(UMBRAL_CONFIANZA * 100)}%).`
          : 'SIN MATCH — no se encontró ningún producto Vistony parecido en la lista de precios.'
      } else if (alertaSkuTagging) {
        observacion = tag.producto.nota_sku || 'Alerta de cruce SKU ya detectada en el tagging técnico — revisar antes de ofertar.'
      }

      return {
        descripcion,
        cantidad,
        producto_tagging_id: tag?.producto?.id || null,
        tipo_base: tag?.producto?.tipo_base || null,
        alerta_tipo_base: alertaTipoBase,
        sku_rmg: sinMatch ? null : sku_rmg,
        descripcion_sku: sinMatch ? null : descripcion_sku,
        precio_unitario: sinMatch ? null : precio_venta_neto,
        costo_unitario: sinMatch ? null : costo_unidad_neto,
        confianza: match?.confianza ?? null,
        sin_match: sinMatch,
        alerta_sku: alertaSkuTagging || (sinMatch && !!match?.sku),
        observacion,
      }
    })

    res.json({ items: resultado })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Generar cotización — reutiliza _insertCotizacion tal cual ────────────
// POST /api/cotizador-manual/generar
// body: { cliente_id?, cliente, condicion_pago?, notas?,
//         items: [{ descripcion, codigo?, cantidad, precio_unitario, costo_unitario?, descuento_pct? }] }
const generar = (req, res) => {
  try {
    const { cliente_id, cliente, condicion_pago, notas, items } = req.body
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Se requiere al menos un ítem para generar la cotización' })
    }
    if (!cliente_id && !cliente) {
      return res.status(400).json({ error: 'Se requiere cliente_id o el nombre del cliente' })
    }

    const itemsCot = items.map(it => {
      const cantidad = Number(it.cantidad) || 1
      const precio_unitario = Number(it.precio_unitario) || 0
      const descuento_pct = Number(it.descuento_pct) || 0
      return {
        codigo: it.codigo || it.sku_rmg || null,
        descripcion: it.descripcion,
        cantidad,
        precio_unitario,
        descuento_pct,
        subtotal: Math.round(cantidad * precio_unitario * (1 - descuento_pct / 100)),
        costo_unitario: Number(it.costo_unitario) || 0,
      }
    })
    const neto = itemsCot.reduce((a, b) => a + b.subtotal, 0)
    const iva = Math.round(neto * 0.19)
    const total = neto + iva

    const cot = _insertCotizacion({
      cliente_id: cliente_id || null,
      cliente: cliente || null,
      estado: 'borrador',
      condicion_pago: condicion_pago || 'Contado',
      canal_origen: 'cotizador_manual',
      notas: notas || null,
      neto, iva, total,
      items: itemsCot,
    })

    res.status(201).json(cot)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { analizar, generar }
