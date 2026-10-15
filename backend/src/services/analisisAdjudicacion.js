/**
 * RMG Parts — Análisis de Adjudicación (Cotizador Manual, 2026-09-28)
 *
 * Pedido real de JC, a partir del caso real de Cerrillos (Compra Ágil
 * 324-521-COT26, perdida contra Velora — ver
 * `docs/RMG_Analisis_Perdida_Cerrillos_324-521-COT26.md` en el proyecto de
 * Claude, hecho a mano): cuando un proceso ya cruzado en Cotizador Manual se
 * resuelve (ganado/perdido/desierto), automatizar el mismo análisis que se
 * hizo a mano — comparación línea por línea contra la oferta rival,
 * verificación de que el SKU ofertado realmente declara la norma exigida
 * (API/ACEA/ISO), alternativas más baratas cuando no la declara, y una
 * "oferta óptima" recalculada.
 *
 * No reinventa nada del cruce ya existente: lee los ítems que
 * `chilecompraScoring.cruzarItemsConCatalogo` (vía `compraAgilAnalisis`) ya
 * dejó en `oportunidad_chilecompra_items`, y reutiliza
 * `extraerAtributosTecnicos`/`normalizarAtributo`/`mejorPorSolapamiento` de
 * `chilecompraScoring.js` (mismas funciones que usa el cruce automático,
 * ahora también exportadas) y `llamarAnthropicYParsear` de
 * `chilecompraDocReader.js` (misma llamada a Anthropic que ya usa
 * `leerAnexos`).
 *
 * IMPORTANTE — la "oferta óptima" busca alternativas en TODA `lista_precios`,
 * sin restringir a Vistony: el cruce automático normal sí se restringe a
 * Vistony (pedido explícito de JC, 2026-09-13, ver
 * `RMG_Cotizador_Resumen_Sesion_2026-09-13.md`), pero acá el objetivo es
 * distinto — encontrar la alternativa real más barata que cumpla la norma
 * exigida cuando la ya ofertada no la cumple, igual que hizo a mano el
 * análisis de Cerrillos (que terminó sugiriendo SKU AUSTER, no Vistony).
 */
const { db, uuidv4 } = require('../../config/database')
const { llamarAnthropicYParsear } = require('./chilecompraDocReader')
const { extraerAtributosTecnicos, normalizarAtributo, mejorPorSolapamiento } = require('./chilecompraScoring')
const mammoth = require('mammoth')

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const TIPOS_WORD = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

const COMPETIDOR_PROMPT = `Eres un asistente experto en compras públicas chilenas (Mercado Público / ChileCompra).
Te adjunto la cotización/oferta de un COMPETIDOR (no de RMG) para un proceso de Compra Ágil o licitación.
Extrae SOLO lo que el documento diga explícitamente — si un dato no aparece, usa null. Nunca inventes cifras.

Devuelve EXCLUSIVAMENTE un JSON válido (sin texto antes ni después) con esta forma exacta:
{
  "monto_neto": number|null,
  "iva": number|null,
  "monto_civa": number|null,
  "items": [
    { "descripcion": string, "cantidad": number|null, "precio_unitario": number|null, "precio_total": number|null }
  ]
}
Si el documento no desglosa precio por línea (solo trae un total), devuelve "items": [] — no inventes un reparto.`

async function extraerTextoWordCompetidor(doc) {
  try {
    const buffer = Buffer.from(doc.base64, 'base64')
    const { value } = await mammoth.extractRawText({ buffer })
    return value?.trim() || null
  } catch (e) {
    console.warn(`⚠️ analisisAdjudicacion: no se pudo extraer texto de "${doc.nombre || 'documento Word'}": ${e.message}`)
    return null
  }
}

/**
 * @param {{base64:string, mediaType:string, nombre:string}} doc PDF/imagen/Word de la oferta rival
 * @returns {Promise<{monto_neto:number|null, iva:number|null, monto_civa:number|null, items:Array}>}
 */
async function extraerOfertaCompetidor(doc) {
  if (!doc?.base64) throw new Error('extraerOfertaCompetidor: no se recibió documento')

  if (TIPOS_WORD.includes(doc.mediaType)) {
    const texto = await extraerTextoWordCompetidor(doc)
    if (!texto) throw new Error('No se pudo extraer texto del Word de la oferta rival')
    return llamarAnthropicYParsear(
      [{ type: 'text', text: `${COMPETIDOR_PROMPT}\n\nTexto extraído del documento:\n\n${texto.slice(0, 30_000)}` }],
      'extraerOfertaCompetidor'
    )
  }

  const bloque = TIPOS_IMAGEN.includes(doc.mediaType)
    ? { type: 'image', source: { type: 'base64', media_type: doc.mediaType, data: doc.base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 } }

  return llamarAnthropicYParsear([{ type: 'text', text: COMPETIDOR_PROMPT }, bloque], 'extraerOfertaCompetidor')
}

// Palabras (>=4 letras) de un texto, para el emparejamiento por solapamiento.
function palabrasDe(texto) {
  return (texto || '')
    .toLowerCase()
    .split(/[^a-záéíóúñ0-9]+/i)
    .filter(p => p.length >= 4)
}

/**
 * Empareja cada ítem RMG ya cruzado con la línea del competidor más parecida
 * por texto. Si ambas listas tienen el mismo largo, se prioriza el orden
 * (en la práctica, una cotización Compra Ágil lista los ítems exigidos en el
 * mismo orden que la del rival) y solo se usa el solapamiento de palabras
 * como respaldo/():contexto — nunca al revés, para no barajar líneas que en
 * realidad ya vienen alineadas 1 a 1.
 */
function emparejarLineas(itemsRmg, itemsCompetidor) {
  if (!itemsCompetidor?.length) {
    return itemsRmg.map(it => ({ item: it, competidor: null }))
  }

  if (itemsRmg.length === itemsCompetidor.length) {
    return itemsRmg.map((it, idx) => ({ item: it, competidor: itemsCompetidor[idx] }))
  }

  // Largos distintos: emparejamiento voraz por mejor solapamiento de palabras,
  // sin repetir línea del competidor ya usada.
  const disponibles = itemsCompetidor.map((c, idx) => ({ ...c, _idx: idx }))
  return itemsRmg.map(it => {
    const texto = `${it.descripcion_solicitada || ''} ${it.especificacion_tecnica || ''}`
    const palabras = palabrasDe(texto)
    const candidatos = disponibles.map(c => ({ descripcion: c.descripcion, producto_generico: '', marca: '', _ref: c }))
    const { mejor, mejorScore } = mejorPorSolapamiento(palabras, candidatos)
    if (!mejor || mejorScore === 0) return { item: it, competidor: null }
    const idx = disponibles.findIndex(c => c === mejor._ref)
    const [elegido] = disponibles.splice(idx, 1)
    return { item: it, competidor: elegido }
  })
}

/**
 * Verifica si el SKU ya ofertado (lista_precios) declara, en su propia
 * descripción comercial, la misma norma (SAE/ISO/API-ACEA) que exige el
 * ítem — mismas funciones que usa el cruce automático para matchear por
 * atributo exacto (chilecompraScoring.candidatosPorAtributoExacto), aplicadas
 * acá para AUDITAR un match ya hecho en vez de para proponerlo.
 */
function verificarNormativa(item, productoOfertado) {
  const exigido = extraerAtributosTecnicos(`${item.descripcion_solicitada || ''} ${item.especificacion_tecnica || ''}`)
  const ofrecido = extraerAtributosTecnicos(productoOfertado?.descripcion || '')

  for (const clave of ['norma', 'iso', 'sae']) {
    if (!exigido[clave]) continue
    if (ofrecido[clave] !== exigido[clave]) {
      const etiqueta = { norma: 'norma API/ACEA', iso: 'grado ISO', sae: 'grado SAE' }[clave]
      return {
        alerta: true,
        detalle: `Exige ${etiqueta} "${exigido[clave]}" y el producto ofertado (${productoOfertado?.codigo_sku || 'sin SKU'}) ` +
          (ofrecido[clave] ? `declara "${ofrecido[clave]}".` : 'no lo declara en su descripción.'),
        claveFallida: clave,
        valorExigido: exigido[clave],
      }
    }
  }
  return { alerta: false }
}

/**
 * Hasta 3 alternativas en TODA `lista_precios` (sin filtrar por marca) que sí
 * declaren el valor exigido en `clave`, ordenadas por costo ascendente,
 * excluyendo el SKU ya ofertado.
 */
function buscarAlternativasConformes(clave, valorExigido, skuExcluir) {
  const candidatos = db.prepare(
    `SELECT codigo_sku, descripcion, marca, costo_unidad_neto, precio_venta_neto
     FROM lista_precios WHERE codigo_sku IS NOT NULL AND codigo_sku != ?`
  ).all(skuExcluir || '')

  const conformes = candidatos.filter(c => {
    const atributos = extraerAtributosTecnicos(c.descripcion || '')
    return atributos[clave] === valorExigido
  })

  conformes.sort((a, b) => (a.costo_unidad_neto ?? Infinity) - (b.costo_unidad_neto ?? Infinity))
  return conformes.slice(0, 3).map(c => ({
    sku: c.codigo_sku, descripcion: c.descripcion, marca: c.marca,
    costo: c.costo_unidad_neto, precio_lista: c.precio_venta_neto,
  }))
}

/**
 * Núcleo del análisis. `resultado`/`competidorNombre`/montos vienen del
 * formulario; `ofertaCompetidor` es lo que devolvió `extraerOfertaCompetidor`
 * (o null si no se subió documento — en ese caso solo se compara contra los
 * montos totales informados a mano).
 */
function compararOferta({ oportunidadId, resultado, competidorNombre, montoCompetidorNeto, montoCompetidorCiva, ofertaCompetidor }) {
  const op = db.prepare('SELECT * FROM oportunidades_chilecompra WHERE id = ?').get(oportunidadId)
  if (!op) throw new Error('Oportunidad no encontrada')

  const itemsRmg = db.prepare(
    `SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ? ORDER BY rowid`
  ).all(oportunidadId)

  const montoNeto = montoCompetidorNeto ?? ofertaCompetidor?.monto_neto ?? null
  const montoCiva = montoCompetidorCiva ?? ofertaCompetidor?.monto_civa ??
    (montoNeto != null ? Math.round(montoNeto * 1.19) : null)
  const itemsCompetidor = ofertaCompetidor?.items?.length ? ofertaCompetidor.items : []

  const emparejadas = emparejarLineas(itemsRmg, itemsCompetidor)

  let netoRmg = 0
  let civaRmg = 0
  const lineas = emparejadas.map(({ item, competidor }) => {
    const producto = item.sku_match
      ? db.prepare('SELECT * FROM lista_precios WHERE codigo_sku = ?').get(item.sku_match)
      : null

    const precioNetoUnit = producto
      ? (producto.precio_venta_neto != null && producto.unidades_por_pack
          ? producto.precio_venta_neto / producto.unidades_por_pack
          : producto.precio_venta_neto)
      : (item.precio_venta_sugerido || null)
    const precioCivaUnit = precioNetoUnit != null ? precioNetoUnit * 1.19 : null
    const cantidad = item.cantidad || 1
    const precioCivaLinea = precioCivaUnit != null ? precioCivaUnit * cantidad : null

    if (precioNetoUnit != null) netoRmg += precioNetoUnit * cantidad
    if (precioCivaLinea != null) civaRmg += precioCivaLinea

    const precioCompetidorLinea = competidor?.precio_total ??
      (competidor?.precio_unitario != null ? competidor.precio_unitario * cantidad : null)

    const verificacion = item.sku_match ? verificarNormativa(item, producto) : { alerta: false }
    const alternativas = verificacion.alerta
      ? buscarAlternativasConformes(verificacion.claveFallida, verificacion.valorExigido, item.sku_match)
      : []

    return {
      descripcion_solicitada: item.descripcion_solicitada,
      especificacion_tecnica: item.especificacion_tecnica,
      sku_rmg: item.sku_match,
      costo_rmg: producto?.costo_unidad_neto ?? null,
      precio_rmg_civa: precioCivaLinea,
      descripcion_competidor: competidor?.descripcion ?? null,
      precio_competidor_civa: precioCompetidorLinea,
      diferencia_civa: (precioCivaLinea != null && precioCompetidorLinea != null)
        ? Math.round(precioCivaLinea - precioCompetidorLinea) : null,
      alerta_normativa: verificacion.alerta,
      detalle_alerta: verificacion.detalle || null,
      alternativas,
    }
  })

  civaRmg = Math.round(civaRmg)
  netoRmg = Math.round(netoRmg)
  const presupuestoCiva = op.presupuesto_estimado || null
  const brechaCiva = montoCiva != null ? civaRmg - montoCiva : null

  // Causas — construidas por reglas sobre las diferencias ya calculadas,
  // nunca por texto libre de IA (mismo criterio que el análisis manual de
  // referencia: cada afirmación debe poder auditarse contra un número).
  const causas = []
  if (brechaCiva != null && brechaCiva > 0) {
    const conDiferencia = lineas
      .filter(l => l.diferencia_civa != null && l.diferencia_civa > 0)
      .sort((a, b) => b.diferencia_civa - a.diferencia_civa)
    if (conDiferencia.length) {
      const principal = conDiferencia[0]
      const pctBrecha = Math.round((principal.diferencia_civa / brechaCiva) * 100)
      if (pctBrecha >= 40) {
        causas.push(`Una sola línea explica ${pctBrecha}% de la brecha: "${principal.descripcion_solicitada}" se ofertó $${principal.diferencia_civa.toLocaleString('es-CL')} por sobre el rival.`)
      }
    }
  } else if (brechaCiva != null && brechaCiva < 0) {
    causas.push(`La oferta RMG quedó $${Math.abs(brechaCiva).toLocaleString('es-CL')} por debajo del rival — ${resultado === 'ganado' ? 'consistente con la adjudicación' : 'la causa de la pérdida no es el precio total'}.`)
  }
  for (const l of lineas) {
    if (l.alerta_normativa) {
      causas.push(`"${l.descripcion_solicitada}": ${l.detalle_alerta}`)
    }
  }
  if (!causas.length) {
    causas.push('No se detectaron alertas normativas ni una línea individual que explique una brecha relevante — revisar manualmente.')
  }

  // Oferta óptima: reemplaza cada línea con alerta normativa por la
  // alternativa conforme más barata (si existe); el resto queda igual.
  let optimaNeto = 0
  const optimaLineas = lineas.map((l, idx) => {
    if (l.alerta_normativa && l.alternativas.length) {
      const mejor = l.alternativas[0]
      const cantidad = itemsRmg[idx]?.cantidad || 1
      optimaNeto += (mejor.precio_lista || 0) * cantidad
      return { sku: mejor.sku, descripcion: mejor.descripcion, costo: mejor.costo, precio_lista: mejor.precio_lista, reemplazado: true }
    }
    const cantidad = itemsRmg[idx]?.cantidad || 1
    const precioNeto = l.precio_rmg_civa != null ? l.precio_rmg_civa / 1.19 / cantidad : 0
    optimaNeto += precioNeto * cantidad
    return { sku: l.sku_rmg, descripcion: l.descripcion_solicitada, costo: l.costo_rmg, precio_lista: precioNeto, reemplazado: false }
  })
  const optimaCiva = Math.round(optimaNeto * 1.19)

  return {
    oportunidad: { codigo_externo: op.codigo_externo, organismo_nombre: op.organismo_nombre, presupuesto_civa: presupuestoCiva },
    resultado, competidor_nombre: competidorNombre || null,
    resumen: {
      neto_rmg: netoRmg, civa_rmg: civaRmg,
      neto_competidor: montoNeto, civa_competidor: montoCiva,
      presupuesto_civa: presupuestoCiva,
      brecha_civa: brechaCiva,
      brecha_pct: (brechaCiva != null && montoCiva) ? brechaCiva / montoCiva : null,
    },
    lineas,
    causas,
    oferta_optima: {
      lineas: optimaLineas,
      total_neto: Math.round(optimaNeto),
      total_civa: optimaCiva,
      vs_competidor: montoCiva != null ? optimaCiva - montoCiva : null,
      vs_presupuesto_pct: presupuestoCiva ? optimaCiva / presupuestoCiva : null,
    },
  }
}

/**
 * Orquesta todo el flujo: extrae (si hay documento), compara, guarda y
 * devuelve la fila lista para responder al frontend.
 */
async function registrarYAnalizar({ oportunidadId, resultado, competidorNombre, montoCompetidorNeto, montoCompetidorCiva, documento, user }) {
  let ofertaCompetidor = null
  if (documento) {
    ofertaCompetidor = await extraerOfertaCompetidor(documento)
  }

  const analisis = compararOferta({
    oportunidadId, resultado, competidorNombre,
    montoCompetidorNeto, montoCompetidorCiva, ofertaCompetidor,
  })

  const id = uuidv4()
  db.prepare(`
    INSERT INTO analisis_adjudicacion
      (id, oportunidad_id, resultado, competidor_nombre, competidor_monto_neto, competidor_monto_civa,
       competidor_doc_nombre, competidor_doc_mime, competidor_doc_base64, items_competidor, analisis, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, oportunidadId, resultado, competidorNombre || null,
    analisis.resumen.neto_competidor, analisis.resumen.civa_competidor,
    documento?.nombre || null, documento?.mediaType || null, documento?.base64 || null,
    ofertaCompetidor ? JSON.stringify(ofertaCompetidor.items || []) : null,
    JSON.stringify(analisis), user?.email || null,
  )

  return { id, ...analisis }
}

function obtenerUltimoAnalisis(oportunidadId) {
  const row = db.prepare(
    `SELECT * FROM analisis_adjudicacion WHERE oportunidad_id = ? ORDER BY generado_at DESC LIMIT 1`
  ).get(oportunidadId)
  if (!row) return null
  return { id: row.id, generado_at: row.generado_at, ...JSON.parse(row.analisis) }
}

module.exports = { extraerOfertaCompetidor, compararOferta, registrarYAnalizar, obtenerUltimoAnalisis }
