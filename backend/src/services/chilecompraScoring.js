/**
 * RMG Parts — Cruce con catálogo (lista_precios) y scoring de oportunidades ChileCompra
 *
 * Dos scores, calculados por separado a propósito (ver análisis acordado con el
 * usuario): rentabilidad (cuánto conviene) y seguridad (qué tan confiable es el
 * organismo). No se deben mezclar en un solo número sin que el usuario decida la
 * ponderación — ver calcularScoreCompuesto().
 *
 * IMPORTANTE — límite honesto del score de seguridad v1: no existe en Chile un dato
 * público confiable y en tiempo real de "riesgo de no pago" por organismo. Esta v1
 * usa únicamente señales que el propio Mercado Público expone (historial de compras
 * de este organismo dentro de nuestra propia base + demandas ante el Tribunal de
 * Contratación Pública, si el anexo lo menciona). Fuentes externas más ricas (SINIM
 * para municipios, Transparencia Activa) quedaron deliberadamente para una fase
 * posterior — ver RMG_ChileCompras_Seguimiento.md, Fase 3 del asistente.
 */
const { db } = require('../../config/database')

const MARGEN_OBJETIVO_MINIMO = 0.15 // 15% — por debajo de esto, rentabilidad cae fuerte

/**
 * Mapa de sinónimos genéricos (español "de la calle") → categoria real en
 * lista_precios. CRÍTICO: los ítems que licitaciones/IA extraen usan términos
 * genéricos ("aceite de motor", "neumáticos", "batería para camioneta"), pero
 * la columna `descripcion` de lista_precios trae el nombre COMERCIAL del
 * producto (p.ej. "CAJ04 ATTOM S320 SAE 5W-30 ACEA C3/API SN DE 5 L") — un
 * nombre de marca Vistony que NUNCA contiene la palabra "aceite" ni "motor".
 * Antes de este fix, buscarSkuCandidato solo comparaba contra
 * descripcion+categoria+marca, así que "Aceite de motor" nunca calzaba con
 * nada y toda licitación de aceites/lubricantes quedaba en "Sin cobertura"
 * 0% pese a que RMG vende justamente eso — este era el bug real detrás de
 * "la ficha técnica no devuelve productos que hacen match".
 */
const SINONIMOS_CATEGORIA = [
  { categoria: 'Lubricante', terminos: ['aceite', 'lubricante', 'motor', 'hidraulico', 'engranaje', 'sintetico', 'transmision'] },
  { categoria: 'Grasa', terminos: ['grasa', 'lubricante solido', 'rodamiento'] },
  { categoria: 'Neumatico', terminos: ['neumatico', 'llanta', 'goma', 'rueda'] },
  { categoria: 'Bateria', terminos: ['bateria', 'acumulador', 'pila'] },
  { categoria: 'Refrigerante/Aditivo Diesel', terminos: ['refrigerante', 'anticongelante', 'radiador', 'coolant', 'adblue', 'urea'] },
  { categoria: 'Liquido de frenos', terminos: ['liquido de freno', 'freno'] },
]

function normalizarPalabra(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function inferirCategoria(texto) {
  const t = normalizarPalabra(texto)
  for (const { categoria, terminos } of SINONIMOS_CATEGORIA) {
    if (terminos.some(term => t.includes(normalizarPalabra(term)))) return categoria
  }
  return null
}

/**
 * Intenta emparejar la descripción de un ítem solicitado contra lista_precios.
 * Heurística de texto simple (v1) — no reemplaza el criterio humano, cada match
 * queda expuesto en el detalle de la oportunidad para revisión antes de cotizar.
 *
 * Dos pasadas:
 *  1. Texto libre contra descripcion+producto_generico+categoria+marca (calce
 *     fuerte — usado cuando el ítem trae detalle técnico específico, ej. "SAE
 *     15W40 CK-4").
 *  2. Si la pasada 1 no encuentra nada con confianza suficiente, se infiere la
 *     categoria del ítem por sinónimos (ver SINONIMOS_CATEGORIA) y se elige el
 *     SKU de mejor ranking de compra dentro de esa categoria — así "aceite de
 *     motor" sí encuentra un candidato real de la línea Lubricante de RMG en
 *     vez de quedar "Sin cobertura" solo porque el nombre comercial no
 *     contiene la palabra "aceite".
 */
function buscarSkuCandidato(descripcionSolicitada, especificacionTecnica) {
  const texto = `${descripcionSolicitada || ''} ${especificacionTecnica || ''}`.trim()
  if (!texto) return null

  const palabras = texto
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4) // descarta conectores cortos

  const candidatos = db.prepare(`
    SELECT codigo_sku, descripcion, categoria, producto_generico, marca, precio_venta_neto,
           costo_unidad_neto, unidades_por_pack, presentacion, ranking_compra
    FROM lista_precios
    WHERE codigo_sku IS NOT NULL
  `).all()

  let mejor = null
  let mejorScore = 0
  if (palabras.length) {
    for (const c of candidatos) {
      const campo = `${c.descripcion || ''} ${c.producto_generico || ''} ${c.categoria || ''} ${c.marca || ''}`.toLowerCase()
      const matches = palabras.filter(p => campo.includes(p)).length
      const score = matches / palabras.length
      if (score > mejorScore) { mejorScore = score; mejor = c }
    }
  }

  // Umbral conservador — mejor no-match que un match falso que termine en una
  // cotización con el producto equivocado.
  if (mejor && mejorScore >= 0.34) {
    return { sku: mejor, confianza: Math.min(mejorScore, 0.95) }
  }

  // Fallback por categoria: el ítem no trajo texto que calzara literalmente,
  // pero sí es reconocible como un rubro que RMG vende. Confianza baja y
  // explícita — se marca para revisión humana antes de cotizar, no se oferta
  // a ciegas.
  const categoriaInferida = inferirCategoria(texto)
  if (categoriaInferida) {
    const deLaCategoria = candidatos
      .filter(c => (c.categoria || '').toLowerCase() === categoriaInferida.toLowerCase())
      .sort((a, b) => (a.ranking_compra ?? 999) - (b.ranking_compra ?? 999))
    if (deLaCategoria.length) {
      return { sku: deLaCategoria[0], confianza: 0.4, porCategoria: true }
    }
  }

  return null
}

/**
 * Enriquece cada ítem de la oportunidad con su match de catálogo, costo y margen
 * estimado. Escribe directo en oportunidad_chilecompra_items.
 */
function cruzarItemsConCatalogo(oportunidadId) {
  const items = db.prepare(
    'SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?'
  ).all(oportunidadId)

  const upd = db.prepare(`
    UPDATE oportunidad_chilecompra_items
    SET sku_match = ?, match_confianza = ?, costo_unitario_rmg = ?,
        precio_venta_sugerido = ?, margen_pct_estimado = ?, cubierto = ?
    WHERE id = ?
  `)

  let cubiertos = 0
  for (const item of items) {
    const match = buscarSkuCandidato(item.descripcion_solicitada, item.especificacion_tecnica)
    if (!match) {
      upd.run(null, null, null, null, null, 0, item.id)
      continue
    }
    const { sku, confianza } = match
    const costoUnitario = sku.unidades_por_pack > 1
      ? Math.round(sku.costo_unidad_neto / sku.unidades_por_pack)
      : sku.costo_unidad_neto
    const precioSugerido = sku.precio_venta_neto
    const margenPct = costoUnitario > 0 ? (precioSugerido - costoUnitario) / precioSugerido : null

    upd.run(sku.codigo_sku, confianza, costoUnitario, precioSugerido, margenPct, 1, item.id)
    cubiertos++
  }

  return { totalItems: items.length, cubiertos, coberturaPct: items.length ? cubiertos / items.length : 0 }
}

/**
 * Score de rentabilidad (0-100): cobertura de catálogo × margen estimado × tamaño
 * de la oportunidad. Los tres factores son necesarios — una oportunidad grande
 * pero que no podemos cubrir, o cubierta pero sin margen, no debería puntuar alto.
 */
function calcularScoreRentabilidad({ coberturaPct, presupuestoEstimado, items }) {
  const itemsConMargen = items.filter(i => i.margen_pct_estimado != null)
  const margenPromedio = itemsConMargen.length
    ? itemsConMargen.reduce((s, i) => s + i.margen_pct_estimado, 0) / itemsConMargen.length
    : 0

  const factorCobertura = coberturaPct // 0-1
  const factorMargen = Math.max(0, Math.min(1, margenPromedio / (MARGEN_OBJETIVO_MINIMO * 2))) // 0-1
  // Tamaño: normaliza contra un monto de referencia (ajustable) — no premia infinito,
  // una Compra Ágil chica bien cubierta y con margen puede seguir puntuando alto.
  const REFERENCIA_MONTO = 5_000_000
  const factorTamano = Math.max(0.4, Math.min(1, (presupuestoEstimado || 0) / REFERENCIA_MONTO))

  return Math.round(factorCobertura * factorMargen * factorTamano * 100)
}

/**
 * Score de seguridad (0-100) — v1, proxy simple y declarado como tal. Ver nota al
 * inicio del archivo sobre sus límites.
 */
function calcularScoreSeguridad({ organismoRut, tieneExigenciaGarantia, tieneDemandas }) {
  let score = 60 // base neutra — "sin información" no debería leerse como "riesgoso"

  const historial = db.prepare(`
    SELECT estado, COUNT(*) as n FROM oportunidades_chilecompra
    WHERE organismo_rut = ? GROUP BY estado
  `).all(organismoRut)

  const totalPrevias = historial.reduce((s, h) => s + h.n, 0)
  const adjudicadasPrevias = historial.find(h => h.estado === 'adjudicada')?.n || 0

  if (totalPrevias > 0) score += 10 // organismo recurrente para RMG, no uno nuevo
  if (adjudicadasPrevias > 0) score += 15 // ya nos adjudicó al menos una vez

  if (tieneDemandas === true) score -= 30
  if (tieneExigenciaGarantia === true) score -= 5 // no es "inseguro", pero sube el costo/complejidad de participar

  return Math.max(0, Math.min(100, score))
}

/**
 * Score compuesto — la ponderación (60/40 por defecto) es un parámetro de negocio,
 * no una constante técnica. Configurable vía CHILECOMPRA_PESO_RENTABILIDAD.
 */
function calcularScoreCompuesto(scoreRentabilidad, scoreSeguridad) {
  const pesoRentabilidad = Number(process.env.CHILECOMPRA_PESO_RENTABILIDAD || 0.6)
  const pesoSeguridad = 1 - pesoRentabilidad
  return Math.round(scoreRentabilidad * pesoRentabilidad + scoreSeguridad * pesoSeguridad)
}

module.exports = {
  buscarSkuCandidato,
  cruzarItemsConCatalogo,
  calcularScoreRentabilidad,
  calcularScoreSeguridad,
  calcularScoreCompuesto,
}
