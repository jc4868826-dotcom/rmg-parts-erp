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
 * Patrón de análisis acordado con el usuario (licitación La Florida 2026,
 * ítem 18): cuando el mejor candidato de catálogo para un ítem es un
 * Tambor/Cilindro (formato grande, 55 GAL o más), NUNCA se ofrece por
 * defecto como "unidad de compra proxy" multiplicada por la cantidad
 * solicitada — eso infla artificialmente el costo/precio si lo que la
 * licitación realmente pide es un balde o una caja chica. Antes de aceptar
 * un tambor como match, se busca si existe una presentación de MENOR
 * formato del mismo producto genérico (misma categoria+producto_generico)
 * que cubra razonablemente el volumen pedido — se prefiere esa.
 *
 * "NUNCA un tambor/cilindro grande" — regla explícita del usuario,
 * documentada también en RMG_Licitacion_LaFlorida_Cruce_2026.md.
 */
const TIPOS_ENVASE_GRANDE = ['tambor/cilindro', 'tambor', 'contenedor ibc']

function parseVolumenPresentacion(presentacion) {
  if (!presentacion) return null
  const s = presentacion.toUpperCase().replace(',', '.')
  // Galones: "5 GAL", "1 GL", "55 GAL", "1/4 GAL" (fracción)
  const fracGal = s.match(/(\d+)\s*\/\s*(\d+)\s*GA?L\b/)
  if (fracGal) {
    const val = parseInt(fracGal[1], 10) / parseInt(fracGal[2], 10)
    return Math.round(val * 3.785 * 100) / 100
  }
  const gal = s.match(/(\d+(?:\.\d+)?)\s*GA?L\b/)
  if (gal) return Math.round(parseFloat(gal[1]) * 3.785 * 100) / 100
  // Litros: "5 L", "4 LT", "200 L"
  const lit = s.match(/(\d+(?:\.\d+)?)\s*LTS?\b/) || s.match(/(\d+(?:\.\d+)?)\s*L\b/)
  if (lit) return parseFloat(lit[1])
  // Mililitros
  const ml = s.match(/(\d+(?:\.\d+)?)\s*ML\b/)
  if (ml) return Math.round((parseFloat(ml[1]) / 1000) * 1000) / 1000
  return null
}

function esFormatoGrande(tipoEnvase, presentacion) {
  const t = (tipoEnvase || '').toLowerCase()
  if (TIPOS_ENVASE_GRANDE.some(g => t.includes(g))) return true
  const vol = parseVolumenPresentacion(presentacion)
  return vol != null && vol >= 50 // 55 GAL ≈ 208 L, umbral conservador en 50 L
}

/**
 * Si el candidato elegido es un formato grande (tambor/cilindro), busca
 * dentro de la misma categoria+producto_generico una presentación menor
 * (balde, caja, bidón) que también esté en lista_precios. Si existe, la
 * prefiere — documentando el motivo para que quede visible en el detalle
 * del ítem. Si NO existe ninguna alternativa menor, se mantiene el tambor
 * (mejor tener cobertura con el formato grande que declarar "sin
 * cobertura"), pero queda marcado con `formatoGrandeSinAlternativa: true`
 * para que el usuario lo revise antes de cotizar.
 */
function preferirFormatoMenor(candidatoElegido, todosLosCandidatos) {
  if (!candidatoElegido || !esFormatoGrande(candidatoElegido.tipo_envase, candidatoElegido.presentacion)) {
    return { sku: candidatoElegido, sustituido: false }
  }

  const alternativas = todosLosCandidatos
    .filter(c =>
      c.codigo_sku !== candidatoElegido.codigo_sku &&
      (c.producto_generico || '').toLowerCase() === (candidatoElegido.producto_generico || '').toLowerCase() &&
      (c.categoria || '').toLowerCase() === (candidatoElegido.categoria || '').toLowerCase() &&
      !esFormatoGrande(c.tipo_envase, c.presentacion)
    )
    .map(c => ({ c, vol: parseVolumenPresentacion(c.presentacion) }))
    .filter(x => x.vol != null)
    .sort((a, b) => a.vol - b.vol) // el de menor formato adecuado primero

  if (alternativas.length === 0) {
    return { sku: candidatoElegido, sustituido: false, formatoGrandeSinAlternativa: true }
  }

  // Prefiere el de mayor volumen entre los "chicos" (para minimizar cuántas
  // unidades hay que multiplicar), pero nunca un tambor.
  const elegido = alternativas[alternativas.length - 1].c
  return { sku: elegido, sustituido: true, skuOriginalTambor: candidatoElegido.codigo_sku }
}

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
/**
 * Solapamiento de palabras (>=4 letras) del texto del ítem contra
 * descripcion+producto_generico+categoria+marca de cada candidato. Extraído
 * como función propia porque el fallback por categoría (abajo) la reutiliza
 * — antes ese fallback elegía ciegamente el SKU de mejor ranking_compra de la
 * categoría, dando el MISMO resultado para cualquier ítem de esa categoría
 * sin importar sus detalles (bug real detectado en producción: 9 ítems muy
 * distintos —aceite de motor, grasa STABURAGS, líquido de freno DOT 3,
 * aceite para transformador— resolvieron los 9 al mismo SKU "FORZA ULTRA D
 * SAE 30" con 40% de confianza). Reutilizar el mismo cálculo acotado a la
 * categoría permite diferenciarlos cuando hay algo de señal textual (marca,
 * término técnico) aunque no alcance el umbral fuerte de la pasada 1.
 */
function mejorPorSolapamiento(palabras, lista) {
  let mejor = null
  let mejorScore = 0
  if (!palabras.length) return { mejor, mejorScore }
  for (const c of lista) {
    const campo = `${c.descripcion || ''} ${c.producto_generico || ''} ${c.categoria || ''} ${c.marca || ''}`.toLowerCase()
    const matches = palabras.filter(p => campo.includes(p)).length
    const score = matches / palabras.length
    if (score > mejorScore) { mejorScore = score; mejor = c }
  }
  return { mejor, mejorScore }
}

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

  const { mejor, mejorScore } = mejorPorSolapamiento(palabras, candidatos)

  // Umbral conservador — mejor no-match que un match falso que termine en una
  // cotización con el producto equivocado.
  if (mejor && mejorScore >= 0.34) {
    const { sku, sustituido, skuOriginalTambor, formatoGrandeSinAlternativa } = preferirFormatoMenor(mejor, candidatos)
    return { sku, confianza: Math.min(mejorScore, 0.95), sustituido, skuOriginalTambor, formatoGrandeSinAlternativa }
  }

  // Fallback por categoria: el ítem no trajo texto que calzara literalmente
  // contra TODO el catálogo, pero sí es reconocible como un rubro que RMG
  // vende. Antes de elegir a ciegas el SKU de mejor ranking_compra de esa
  // categoría (ver comentario en mejorPorSolapamiento), se reintenta el
  // mismo cálculo de solapamiento acotado solo a los SKU de esa categoría —
  // así "grasa STABURAGS" y "líquido de freno DOT 3 BOSCH" pueden encontrar
  // cada uno su propio candidato dentro de "Grasa"/"Liquido de frenos" en
  // vez de terminar ambos en el mismo producto genérico top-ranking.
  const categoriaInferida = inferirCategoria(texto)
  if (categoriaInferida) {
    const deLaCategoria = candidatos.filter(c => (c.categoria || '').toLowerCase() === categoriaInferida.toLowerCase())
    if (deLaCategoria.length) {
      const { mejor: mejorCat, mejorScore: scoreCat } = mejorPorSolapamiento(palabras, deLaCategoria)

      if (mejorCat && scoreCat > 0) {
        // Hay alguna señal textual (marca, término técnico) dentro de la
        // categoría, aunque no alcance el umbral fuerte — confianza
        // intermedia, sigue quedando marcada para revisión antes de cotizar.
        const { sku, sustituido, skuOriginalTambor, formatoGrandeSinAlternativa } = preferirFormatoMenor(mejorCat, candidatos)
        return {
          sku, confianza: Math.min(0.3 + scoreCat * 0.3, 0.6), porCategoria: true,
          sustituido, skuOriginalTambor, formatoGrandeSinAlternativa,
        }
      }

      // Cero solapamiento textual contra CUALQUIER SKU de la categoría — no
      // hay forma de saber cuál producto específico es el correcto (puede
      // que RMG simplemente no tenga ese producto exacto, ej. aceite de
      // transformador o una marca que no vendemos). Se sigue sugiriendo el
      // de mejor ranking de compra —no se declara "sin cobertura" a
      // ciegas—, pero con confianza explícitamente baja y una marca clara
      // de que es una sugerencia genérica, no un match real.
      const porRanking = [...deLaCategoria].sort((a, b) => (a.ranking_compra ?? 999) - (b.ranking_compra ?? 999))[0]
      const { sku, sustituido, skuOriginalTambor, formatoGrandeSinAlternativa } = preferirFormatoMenor(porRanking, candidatos)
      return {
        sku, confianza: 0.25, porCategoria: true, sinSenalTextual: true,
        sustituido, skuOriginalTambor, formatoGrandeSinAlternativa,
      }
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
        precio_venta_sugerido = ?, margen_pct_estimado = ?, cubierto = ?,
        observacion = ?, sku_match_original_tambor = ?
    WHERE id = ?
  `)

  let cubiertos = 0
  for (const item of items) {
    const match = buscarSkuCandidato(item.descripcion_solicitada, item.especificacion_tecnica)
    if (!match) {
      upd.run(null, null, null, null, null, 0, null, null, item.id)
      continue
    }
    const { sku, confianza, sustituido, skuOriginalTambor, formatoGrandeSinAlternativa, sinSenalTextual } = match
    const costoUnitario = sku.unidades_por_pack > 1
      ? Math.round(sku.costo_unidad_neto / sku.unidades_por_pack)
      : sku.costo_unidad_neto
    const precioSugerido = sku.precio_venta_neto
    const margenPct = costoUnitario > 0 ? (precioSugerido - costoUnitario) / precioSugerido : null

    const observaciones = []
    if (sinSenalTextual) {
      observaciones.push('Sugerencia genérica de categoría — el texto del ítem no coincidió con ningún producto específico del catálogo (marca/término técnico distinto al de RMG). Puede que RMG no tenga este producto exacto: verificar antes de cotizar.')
    }
    if (sustituido) {
      observaciones.push(`Presentación de menor formato (${sku.presentacion}) usada como unidad de compra proxy en lugar del tambor/cilindro ${skuOriginalTambor} — evita inflar el costo con un formato grande innecesario. Verificar cantidad de unidades necesarias según el volumen solicitado.`)
    } else if (formatoGrandeSinAlternativa) {
      observaciones.push(`No existe en catálogo una presentación de menor formato para este producto — se ofrece el tambor/cilindro (${sku.presentacion}) por ser la única opción disponible. Revisar antes de cotizar si conviene fraccionar o buscar proveedor alternativo.`)
    }
    const observacion = observaciones.length ? observaciones.join(' ') : null

    upd.run(sku.codigo_sku, confianza, costoUnitario, precioSugerido, margenPct, 1, observacion, skuOriginalTambor || null, item.id)
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
  parseVolumenPresentacion,
  esFormatoGrande,
  preferirFormatoMenor,
}
