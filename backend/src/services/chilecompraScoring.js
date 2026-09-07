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
 *
 * ── Auditoría 2026-09 — "la clasificación es pésima" ───────────────────────────
 * El usuario reportó, sobre un cruce real (licitación La Florida), tres fallas
 * graves del modelo de matching que esta versión corrige de raíz (root-cause,
 * verificado simulando el algoritmo contra la BD real antes de tocar código):
 *
 *  1. "si la especificación pide 200lt como presentamos 20lt es gravísimo" —
 *     cuando preferirFormatoMenor() sustituye un tambor grande por una
 *     presentación menor de catálogo, la cantidad NUNCA se reescalaba para
 *     cubrir el mismo volumen total. Fix: volumenTotalSolicitado() +
 *     recalculo de `cantidad` en cruzarItemsConCatalogo() (ver ahí).
 *  2. "solo usa productos Vistony en el match" — verificado que buscarSkuCandidato
 *     NO filtra por marca (AUSTER incluso tiene mejor ranking_compra promedio que
 *     Vistony: 6.46 vs 14.83 en la categoría Lubricante). El sesgo hacia Vistony
 *     era un EFECTO de los bugs #3 y #4 de abajo (contaminación de texto) más el
 *     hecho de que Vistony tiene 3.5x más SKU en catálogo (342 vs 98) — no una
 *     restricción de código. Al corregir #3 y #4, otras marcas con el producto
 *     correcto (ej. AUSTER hidráulico/AdBlue) vuelven a competir en igualdad de
 *     condiciones. (La limitación real de marca está en
 *     fichasTecnicasVistonyService.js, que SOLO sabe buscar fichas técnicas en
 *     vistonylubricantes.cl — ahí sí se agregó una guarda explícita.)
 *  3. "si la especificación dice BAL ¿por qué presentamos cajas de 12?" — no
 *     existía ninguna verificación de que el TIPO de envase ofrecido (balde,
 *     caja, tambor, tineta, bidón, IBC) calzara con el pedido, más allá del
 *     volumen. Fix: inferirTipoEnvaseSolicitado() + observación explícita
 *     cuando difieren.
 *  4. Dos causas de raíz a nivel de texto que producían matches directamente
 *     incorrectos (verificado con casos reales — aceite hidráulico terminaba
 *     matcheado contra un aceite de motor de 200L por pura coincidencia
 *     numérica; AdBlue terminaba matcheado contra refrigerante por la palabra
 *     "diesel" del NOMBRE de la categoría compuesta "Refrigerante/Aditivo
 *     Diesel"):
 *       a) tokens puramente numéricos+unidad (ej. "200l") entraban al arreglo
 *          de `palabras` comparadas por solapamiento — fix: filtrados en
 *          buscarSkuCandidato().
 *       b) la etiqueta de categoría (categoriaEfectiva) se concatenaba como
 *          texto libre comparable en mejorPorSolapamiento — fix: removida del
 *          campo comparado (categoriaEfectiva sigue usándose para FILTRAR el
 *          pool de candidatos, nunca como palabra de texto libre).
 *  5. Sin sub-tipificación dentro de categorías amplias ("Lubricante" mezclaba
 *     motor/hidráulico/engranajes/compresores; "Refrigerante/Aditivo Diesel"
 *     mezclaba refrigerante real con AdBlue/urea) — fix: SUBTIPOS_CATEGORIA +
 *     inferirSubtipo(), usado para acotar el pool del fallback por categoría
 *     antes de elegir por ranking_compra a ciegas.
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
 *
 * IMPORTANTE (fix 2026-09): sustituir por un formato menor cambia cuántas
 * unidades hacen falta para cubrir el mismo volumen — ver
 * volumenTotalSolicitado() y el recalculo de `cantidad` en
 * cruzarItemsConCatalogo(). Antes de este fix, esta función sustituía el
 * SKU pero la cantidad se quedaba igual, lo que producía el bug "pide 200lt,
 * presentamos 20lt" reportado por el usuario.
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

/**
 * Sub-tipos dentro de una categoria amplia — usados SOLO para acotar el pool
 * del fallback por categoría (buscarSkuCandidato, pasada 2) antes de elegir
 * por ranking_compra a ciegas. No reemplazan SINONIMOS_CATEGORIA, lo afinan.
 *
 * Bug real verificado contra la BD (licitación La Florida): RMG SÍ tiene en
 * catálogo aceite hidráulico bien etiquetado (SKU 1000738 "BAL DRAULA H 68
 * DE 5 GL", 1000008 "BAL HIDRAULAN 68 DE 5 GAL", línea AUSTER HYDRO ISO
 * 46/68) y AdBlue/urea bien etiquetado (SKU 1200195 "IBC AIRBLUE DEF DE
 * 1000LT", 1200212 "BAL AIRBLUE DEF DE 20 L", 1200120 "CIL AIRBLUE - UREA
 * AUTOMOTRIZ de 208 L") — pero la categoría amplia "Lubricante" (que también
 * cubre motor/engranaje/transmisión) y "Refrigerante/Aditivo Diesel" (que
 * también cubre refrigerante real) hacía que el fallback por ranking_compra
 * pudiera elegir cualquier producto de la categoría, no necesariamente el
 * hidráulico o el AdBlue que sí existía y era el correcto.
 */
const SUBTIPOS_CATEGORIA = {
  'Lubricante': [
    { subtipo: 'Hidraulico', terminos: ['hidraulico', 'hidraulica', 'draula', 'hydro'] },
    { subtipo: 'Engranajes/Transmision', terminos: ['engranaje', 'transmision', 'diferencial', 'caja de cambios', 'gear'] },
    { subtipo: 'Compresores', terminos: ['compresor'] },
    { subtipo: 'Motor', terminos: ['motor', 'diesel', 'gasolina', 'ck-4', 'sae', 'multigrado'] },
  ],
  'Refrigerante/Aditivo Diesel': [
    { subtipo: 'AdBlue/Urea', terminos: ['adblue', 'urea', 'def', 'scr'] },
    { subtipo: 'Refrigerante', terminos: ['refrigerante', 'anticongelante', 'radiador', 'coolant'] },
  ],
}

/**
 * Familias de TIPO de envase — independientes del volumen. Bug real
 * reportado: "si la especificación dice BAL ¿por qué presentamos cajas de
 * 12?" — un balde de 20L y una caja de 12 botellas de 1L pueden sumar un
 * volumen parecido, pero son operativamente distintos (a granel vs. unidades
 * empaquetadas) y el organismo puede exigir uno específico en las bases.
 */
const FAMILIAS_ENVASE = [
  { tipo: 'Tambor/Cilindro', re: /\b(tambor|cilindro|drum)\b/ },
  { tipo: 'Tineta', re: /\btineta\b/ },
  { tipo: 'Balde', re: /\bbal(de)?\b/ },
  { tipo: 'Bidón', re: /\bbidon\b/ },
  { tipo: 'IBC', re: /\bibc\b/ },
  { tipo: 'Caja', re: /\bcaja(s)?\b/ },
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
 * Infiere el sub-tipo (dentro de una categoria con entrada en
 * SUBTIPOS_CATEGORIA) a partir de un texto libre. Devuelve null si la
 * categoria no tiene sub-tipos definidos o si el texto no matchea ninguno —
 * en ese caso el llamador debe usar el pool completo de la categoria (nunca
 * se inventa un sub-tipo sin señal real).
 */
function inferirSubtipo(texto, categoria) {
  const subtipos = SUBTIPOS_CATEGORIA[categoria]
  if (!subtipos) return null
  const t = normalizarPalabra(texto)
  for (const { subtipo, terminos } of subtipos) {
    if (terminos.some(term => t.includes(normalizarPalabra(term)))) return subtipo
  }
  return null
}

/**
 * Familia de envase de un candidato de catálogo, a partir de su columna
 * `tipo_envase` — usa el mismo diccionario de familias que
 * inferirTipoEnvaseSolicitado() para que ambos lados sean comparables.
 */
function familiaEnvase(tipoEnvaseTexto) {
  const t = normalizarPalabra(tipoEnvaseTexto || '')
  for (const { tipo, re } of FAMILIAS_ENVASE) {
    if (re.test(t)) return tipo
  }
  return null
}

/**
 * Tipo de envase que pide el ÍTEM de la licitación, a partir de su propio
 * texto libre (descripcion_solicitada + especificacion_tecnica). null si no
 * hay ninguna palabra reconocible de tipo de envase (no se asume nada).
 */
function inferirTipoEnvaseSolicitado(texto) {
  return familiaEnvase(texto)
}

/**
 * Categoría "real" de un candidato de lista_precios, sin confiar ciegamente
 * en la columna `categoria` de la BD.
 *
 * Bug real detectado en auditoría (licitación La Florida, "SUMINISTRO DE
 * ACEITES Y LUBRICANTES PARA VEHICULOS"): el SKU 1300043 ("FRA LIQUIDO DE
 * FRENOS DOT-4 PARA MOTO DE 8 OZ") vino del import con categoria='Lubricante'
 * — un error de tageo, no un problema de matching. Este helper re-infiere la
 * categoría a partir del propio texto comercial del producto (descripcion +
 * producto_generico) usando el mismo diccionario de sinónimos; si esa
 * inferencia da un resultado, se usa en vez de la columna `categoria`
 * (potencialmente mal tageada) para decidir con qué categoría se
 * compara/filtra este candidato.
 *
 * IMPORTANTE (fix 2026-09): este valor se usa para FILTRAR el pool de
 * candidatos por categoría — NUNCA se debe volver a concatenar como texto
 * libre dentro de mejorPorSolapamiento() (ver comentario ahí). Ese fue
 * exactamente el bug que hacía que un ítem de AdBlue matcheara contra
 * refrigerante solo porque la etiqueta compuesta "Refrigerante/Aditivo
 * Diesel" contiene la palabra "diesel".
 */
function categoriaEfectiva(candidato) {
  const inferidaDeSuTexto = inferirCategoria(`${candidato.descripcion || ''} ${candidato.producto_generico || ''}`)
  return inferidaDeSuTexto || candidato.categoria || null
}

/**
 * Sub-tipo "real" de un candidato, dentro de una categoria dada — mismo
 * principio que categoriaEfectiva() pero un nivel más abajo.
 */
function subtipoEfectivo(candidato, categoria) {
  return inferirSubtipo(`${candidato.descripcion || ''} ${candidato.producto_generico || ''}`, categoria)
}

/**
 * Tokens puramente numéricos (con o sin sufijo de unidad de medida) — ej.
 * "200", "200l", "19lt", "5gal". Bug real verificado simulando el algoritmo
 * contra la BD real: el ítem "ACEITE HIDRAULICO NUTO H68 TAMBOR 200L
 * APROX." incluía el token "200l" en `palabras`, que coincidía por PURA
 * CASUALIDAD con el propio tamaño de envase de un producto totalmente
 * distinto (ej. "AUSTER 80W90 GL-5 200L", un aceite de motor/transmisión,
 * no hidráulico) — inflando su score de solapamiento y ganándole al
 * candidato hidráulico correcto que sí existe en catálogo. Estos tokens no
 * aportan señal sobre QUÉ PRODUCTO es, solo cuánto viene envasado — se
 * excluyen del cálculo de solapamiento (el volumen se trata aparte, ver
 * volumenTotalSolicitado()).
 */
const UNIDADES_MEDIDA = ['l', 'lt', 'lts', 'ml', 'gal', 'gl', 'kg', 'kgs', 'gr', 'grs', 'oz', 'cc']

function esTokenNumericoDeUnidad(palabra) {
  const m = palabra.match(/^(\d+(?:[.,]\d+)?)([a-z]*)$/)
  if (!m) return false
  const sufijo = m[2]
  return sufijo === '' || UNIDADES_MEDIDA.includes(sufijo)
}

/**
 * Conectores/preposiciones españoles de 4+ letras — el filtro de largo
 * (>=4) NO los descarta porque tienen 4+ letras, pero no aportan ninguna
 * señal sobre QUÉ PRODUCTO es. Bug real verificado simulando el algoritmo
 * ya con los dos fixes anteriores aplicados: el ítem "BIDONES 10LT ADBLUE
 * PARA VEHICULOS DIESEL" seguía matcheando (pasada 1, score 0.4) contra un
 * "ADITIVO ESPECIAL PARA DIESEL DE 300 ML" que no es AdBlue — el solape
 * real era solo 2 palabras ("para" y "diesel") de 5, y "para" no aporta
 * nada. Sin este filtro, "para"/"con"/"para vehiculos"-style words podían
 * empujar un match falso justo sobre el umbral 0.34 antes de llegar al
 * fallback por categoría/sub-tipo (que sí hubiera encontrado el AIRBLUE
 * DEF correcto).
 */
const CONECTORES = new Set(['para', 'con', 'sin', 'del', 'las', 'los', 'que', 'por', 'este', 'esta', 'esos', 'esas', 'cada', 'como', 'segun', 'según'])

function esConector(palabra) {
  return CONECTORES.has(palabra)
}

/**
 * Solapamiento de palabras (>=4 letras, sin tokens puramente numéricos+
 * unidad) del texto del ítem contra descripcion+producto_generico+marca de
 * cada candidato.
 *
 * IMPORTANTE (fix 2026-09): el campo comparado YA NO incluye
 * categoriaEfectiva(c) como texto libre — antes se concatenaba la etiqueta
 * de categoría (ej. "Refrigerante/Aditivo Diesel") al texto comparado, así
 * que cualquier ítem que mencionara "diesel" (ej. un pedido de AdBlue "PARA
 * VEHICULOS DIESEL") matcheaba por esa sola palabra contra CUALQUIER
 * producto de esa categoría compuesta, incluyendo refrigerantes reales sin
 * relación con AdBlue. categoriaEfectiva() se sigue usando, pero solo para
 * FILTRAR el pool de candidatos (ver buscarSkuCandidato), nunca como texto
 * libre comparable.
 *
 * Extraída como función propia porque el fallback por categoría (abajo) la
 * reutiliza — antes ese fallback elegía ciegamente el SKU de mejor
 * ranking_compra de la categoría, dando el MISMO resultado para cualquier
 * ítem de esa categoría sin importar sus detalles (bug real detectado en
 * producción: 9 ítems muy distintos —aceite de motor, grasa STABURAGS,
 * líquido de freno DOT 3, aceite para transformador— resolvieron los 9 al
 * mismo SKU "FORZA ULTRA D SAE 30" con 40% de confianza). Reutilizar el
 * mismo cálculo acotado a la categoría/sub-tipo permite diferenciarlos
 * cuando hay algo de señal textual aunque no alcance el umbral fuerte de la
 * pasada 1.
 */
function mejorPorSolapamiento(palabras, lista) {
  let mejor = null
  let mejorScore = 0
  if (!palabras.length) return { mejor, mejorScore }
  for (const c of lista) {
    const campo = `${c.descripcion || ''} ${c.producto_generico || ''} ${c.marca || ''}`.toLowerCase()
    const matches = palabras.filter(p => campo.includes(p)).length
    const score = matches / palabras.length
    if (score > mejorScore) { mejorScore = score; mejor = c }
  }
  return { mejor, mejorScore }
}

/**
 * Intenta emparejar la descripción de un ítem solicitado contra lista_precios.
 * Heurística de texto simple (v1) — no reemplaza el criterio humano, cada match
 * queda expuesto en el detalle de la oportunidad para revisión antes de cotizar.
 *
 * Dos pasadas:
 *  1. Texto libre contra descripcion+producto_generico+marca (calce fuerte —
 *     usado cuando el ítem trae detalle técnico específico, ej. "SAE 15W40
 *     CK-4"). No incluye la categoria como texto libre (ver mejorPorSolapamiento).
 *  2. Si la pasada 1 no encuentra nada con confianza suficiente, se infiere la
 *     categoria del ítem por sinónimos (ver SINONIMOS_CATEGORIA), y dentro de
 *     esa categoria se intenta acotar aún más por sub-tipo (ver
 *     SUBTIPOS_CATEGORIA) antes de elegir el SKU de mejor ranking de compra —
 *     así "aceite hidráulico" no termina compitiendo contra "aceite de motor"
 *     ni "AdBlue" contra "refrigerante" solo por compartir categoria amplia.
 */
function buscarSkuCandidato(descripcionSolicitada, especificacionTecnica) {
  const texto = `${descripcionSolicitada || ''} ${especificacionTecnica || ''}`.trim()
  if (!texto) return null

  const palabras = texto
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !esTokenNumericoDeUnidad(w) && !esConector(w)) // descarta conectores (cortos y largos, ej. "para") y tokens de pack-size (ej. "200l")

  const candidatos = db.prepare(`
    SELECT codigo_sku, descripcion, categoria, producto_generico, marca, tipo_envase, presentacion, precio_venta_neto,
           costo_unidad_neto, unidades_por_pack, ranking_compra
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
  // vende.
  const categoriaInferida = inferirCategoria(texto)
  if (categoriaInferida) {
    // categoriaEfectiva() en vez de c.categoria — evita que un SKU mal
    // tageado en lista_precios (ej. líquido de frenos marcado como
    // 'Lubricante') entre al pool de candidatos de una categoría a la que en
    // realidad no pertenece según su propia descripción comercial.
    const deLaCategoria = candidatos.filter(c => (categoriaEfectiva(c) || '').toLowerCase() === categoriaInferida.toLowerCase())
    if (deLaCategoria.length) {
      // Sub-tipificación (fix 2026-09): si el texto del ítem trae una señal
      // de sub-tipo (ej. "hidraulico", "adblue") y existen candidatos de ese
      // mismo sub-tipo dentro de la categoría, se acota el pool a esos ANTES
      // de buscar solapamiento o de elegir por ranking_compra — así un
      // pedido de aceite hidráulico ya no compite contra aceite de motor
      // dentro de "Lubricante", ni AdBlue contra refrigerante dentro de
      // "Refrigerante/Aditivo Diesel".
      const subtipoItem = inferirSubtipo(texto, categoriaInferida)
      let pool = deLaCategoria
      let acotadoPorSubtipo = false
      if (subtipoItem) {
        const delSubtipo = deLaCategoria.filter(c => subtipoEfectivo(c, categoriaInferida) === subtipoItem)
        if (delSubtipo.length) { pool = delSubtipo; acotadoPorSubtipo = true }
      }

      const { mejor: mejorCat, mejorScore: scoreCat } = mejorPorSolapamiento(palabras, pool)

      if (mejorCat && scoreCat > 0) {
        // Hay alguna señal textual (marca, término técnico) dentro de la
        // categoría/sub-tipo, aunque no alcance el umbral fuerte — confianza
        // intermedia, sigue quedando marcada para revisión antes de cotizar.
        const { sku, sustituido, skuOriginalTambor, formatoGrandeSinAlternativa } = preferirFormatoMenor(mejorCat, candidatos)
        return {
          sku, confianza: Math.min(0.3 + scoreCat * 0.3, 0.6), porCategoria: true, acotadoPorSubtipo,
          sustituido, skuOriginalTambor, formatoGrandeSinAlternativa,
        }
      }

      // Cero solapamiento textual contra CUALQUIER SKU del pool (categoría o
      // sub-tipo) — no hay forma de saber cuál producto específico es el
      // correcto. Se sigue sugiriendo uno —no se declara "sin cobertura" a
      // ciegas—, pero con confianza explícitamente baja y una marca clara de
      // que es una sugerencia genérica, no un match real. Se elige dentro
      // del pool ya acotado por sub-tipo cuando existe (así "AdBlue" nunca
      // cae en un producto refrigerante solo por tener mejor ranking_compra
      // dentro de la categoría amplia).
      //
      // Desempate por volumen antes que por ranking_compra: si el texto del
      // ítem menciona un volumen (ej. "BIDONES 10LT"), se prefiere el
      // candidato del pool cuya presentación esté más cerca de ese volumen
      // — evita sugerir, ej., un IBC de 1000L para un pedido que claramente
      // habla de bidones chicos, solo porque ese IBC tenía mejor
      // ranking_compra. Si ningún candidato del pool tiene un volumen
      // parseable, o el ítem no menciona volumen, se cae al ranking_compra
      // como antes.
      const volPedido = parseVolumenPresentacion(texto)
      let porRanking
      if (volPedido != null) {
        const conVolumen = pool
          .map(c => ({ c, vol: parseVolumenPresentacion(c.presentacion) }))
          .filter(x => x.vol != null)
        if (conVolumen.length) {
          conVolumen.sort((a, b) => Math.abs(a.vol - volPedido) - Math.abs(b.vol - volPedido) || (a.c.ranking_compra ?? 999) - (b.c.ranking_compra ?? 999))
          porRanking = conVolumen[0].c
        }
      }
      if (!porRanking) {
        porRanking = [...pool].sort((a, b) => (a.ranking_compra ?? 999) - (b.ranking_compra ?? 999))[0]
      }
      const { sku, sustituido, skuOriginalTambor, formatoGrandeSinAlternativa } = preferirFormatoMenor(porRanking, candidatos)
      return {
        sku, confianza: 0.25, porCategoria: true, sinSenalTextual: true, acotadoPorSubtipo,
        sustituido, skuOriginalTambor, formatoGrandeSinAlternativa,
      }
    }
  }

  return null
}

function esUnidadDeVolumen(unidad) {
  const u = normalizarPalabra(unidad || '').trim()
  return ['l', 'lt', 'lts', 'litro', 'litros', 'ml', 'gal', 'gl', 'galon', 'galones'].includes(u)
}

/**
 * Determina el volumen TOTAL solicitado por un ítem, en litros, cuando sea
 * posible calcularlo sin inventar nada (mismo principio de
 * chilecompraDocReader.js: si el dato no está, se devuelve null, nunca se
 * asume un valor):
 *
 *  - Si `unidad` YA es una unidad de volumen (L, LT, GAL...), `cantidad` ya
 *    ES el volumen total pedido (ej. cantidad=200, unidad='LT' → 200 L).
 *  - Si no, se busca un volumen mencionado dentro del propio texto del ítem
 *    (ej. "TAMBOR 200L APROX" → 200) y se interpreta como el volumen de CADA
 *    unidad pedida (cantidad=1 tambor de 200L → 200 L totales).
 *  - Si no hay ninguna señal de volumen en ningún lado, devuelve null.
 */
function volumenTotalSolicitado(item, texto) {
  if (item.unidad && esUnidadDeVolumen(item.unidad) && item.cantidad != null) {
    return parseVolumenPresentacion(`${item.cantidad} ${item.unidad}`)
  }
  const volPorUnidad = parseVolumenPresentacion(texto)
  if (volPorUnidad != null && item.cantidad != null) {
    return volPorUnidad * item.cantidad
  }
  return null
}

/**
 * Construye un "match" a partir de un SKU que el usuario fijó a mano (ver
 * sku_forzado_por_usuario) — mismo shape que devuelve buscarSkuCandidato,
 * pero SIN pasar por preferirFormatoMenor: si el usuario ya eligió el
 * producto, no se le "corrige" sustituyéndolo por otro formato — se respeta
 * tal cual. confianza=1 porque no es una sugerencia del heurístico, es una
 * decisión humana explícita.
 */
function matchDesdeSkuForzado(codigoSku) {
  const sku = db.prepare(`
    SELECT codigo_sku, descripcion, categoria, producto_generico, marca, tipo_envase, presentacion, precio_venta_neto,
           costo_unidad_neto, unidades_por_pack, ranking_compra
    FROM lista_precios WHERE codigo_sku = ? LIMIT 1
  `).get(codigoSku)
  if (!sku) return null
  return { sku, confianza: 1, forzadoPorUsuario: true }
}

/**
 * Enriquece cada ítem de la oportunidad con su match de catálogo, costo y margen
 * estimado. Escribe directo en oportunidad_chilecompra_items.
 *
 * Respeta las correcciones que el usuario haya dejado en cada ítem (ver
 * migración chilecompra_correccion_usuario_v1 — pedido real: "si el match
 * de excel salió mal, debemos agregar observaciones para que lo vuelva a
 * calcular"):
 *  - sku_forzado_por_usuario: si está presente, este ítem NO se vuelve a
 *    matchear — se usa ese SKU tal cual (ver matchDesdeSkuForzado). Sigue
 *    pasando por el ajuste de cantidad/volumen y el chequeo de envase, para
 *    que el usuario vea si SU elección también tiene una brecha.
 *  - correccion_usuario: si no hay SKU forzado, esta nota libre se agrega al
 *    texto de búsqueda (especificación técnica) antes de volver a
 *    matchear — le da al heurístico una pista que el documento original no
 *    traía (ej. "es un anticongelante concentrado, no diluido").
 */
function cruzarItemsConCatalogo(oportunidadId) {
  const items = db.prepare(
    'SELECT * FROM oportunidad_chilecompra_items WHERE oportunidad_id = ?'
  ).all(oportunidadId)

  const upd = db.prepare(`
    UPDATE oportunidad_chilecompra_items
    SET sku_match = ?, match_confianza = ?, costo_unitario_rmg = ?,
        precio_venta_sugerido = ?, margen_pct_estimado = ?, cubierto = ?,
        observacion = ?, sku_match_original_tambor = ?,
        cantidad = ?, cantidad_solicitada_original = ?, cantidad_ajustada = ?
    WHERE id = ?
  `)

  let cubiertos = 0
  for (const item of items) {
    const especTecnicaEfectiva = item.correccion_usuario && !item.sku_forzado_por_usuario
      ? [item.especificacion_tecnica, item.correccion_usuario].filter(Boolean).join(' — ')
      : item.especificacion_tecnica
    const texto = `${item.descripcion_solicitada || ''} ${especTecnicaEfectiva || ''}`.trim()
    const match = item.sku_forzado_por_usuario
      ? matchDesdeSkuForzado(item.sku_forzado_por_usuario)
      : buscarSkuCandidato(item.descripcion_solicitada, especTecnicaEfectiva)
    if (!match) {
      const motivoSinMatch = item.sku_forzado_por_usuario
        ? `SKU "${item.sku_forzado_por_usuario}" fijado por el usuario ya no existe en el catálogo — corregir o quitar la corrección.`
        : null
      upd.run(null, null, null, null, null, 0, motivoSinMatch, null, item.cantidad, null, 0, item.id)
      continue
    }
    const { sku, confianza, sustituido, skuOriginalTambor, formatoGrandeSinAlternativa, sinSenalTextual, forzadoPorUsuario } = match
    const costoUnitario = sku.unidades_por_pack > 1
      ? Math.round(sku.costo_unidad_neto / sku.unidades_por_pack)
      : sku.costo_unidad_neto
    const precioSugerido = sku.precio_venta_neto
    const margenPct = costoUnitario > 0 ? (precioSugerido - costoUnitario) / precioSugerido : null

    // ── Ajuste de cantidad por volumen (fix 2026-09 — bug "pide 200lt,
    // presentamos 20lt") ────────────────────────────────────────────────
    // Si el volumen TOTAL solicitado por el ítem es mayor al que cubre la
    // cantidad actual × el volumen unitario de la presentación RMG elegida,
    // se escala `cantidad` a las unidades realmente necesarias — el Excel
    // multiplica precio unitario × esta misma columna "Cant. Ref.", así que
    // sin este ajuste se factura y compromete solo una fracción del volumen
    // pedido cuando se sustituye un tambor por un formato menor (u ocurre
    // cualquier otra diferencia de volumen unitario en el match).
    const volTotalSolicitado = volumenTotalSolicitado(item, texto)
    const volUnitarioOfrecido = parseVolumenPresentacion(sku.presentacion)
    let cantidadFinal = item.cantidad
    let cantidadFueAjustada = false
    if (volTotalSolicitado != null && volUnitarioOfrecido != null && volUnitarioOfrecido > 0) {
      const unidadesNecesarias = Math.ceil(volTotalSolicitado / volUnitarioOfrecido)
      // Solo se sube la cantidad, nunca se baja a ciegas: si el cálculo da
      // MENOS unidades que las que ya traía el ítem, se deja la cantidad
      // original tal cual la extrajo la IA del documento — este fix existe
      // para prevenir UNDER-delivery, no para recortar cantidades por su
      // cuenta.
      if (item.cantidad == null || unidadesNecesarias > item.cantidad) {
        cantidadFinal = unidadesNecesarias
        cantidadFueAjustada = true
      }
    }

    // ── Tipo de envase distinto al solicitado (fix 2026-09 — "si la
    // especificación dice BAL ¿por qué presentamos cajas de 12?") ────────
    const tipoSolicitado = inferirTipoEnvaseSolicitado(texto)
    const tipoOfrecido = familiaEnvase(sku.tipo_envase)
    const envaseNoCoincide = tipoSolicitado && tipoOfrecido && tipoSolicitado !== tipoOfrecido

    const observaciones = []
    if (forzadoPorUsuario) {
      observaciones.push('✋ SKU fijado manualmente por el usuario — no se re-matchea automáticamente. Para volver al matching automático, borra la corrección en este ítem.')
    } else if (item.correccion_usuario) {
      observaciones.push(`📝 Nota del usuario aplicada al re-match: "${item.correccion_usuario}".`)
    }
    if (sinSenalTextual) {
      observaciones.push('Sugerencia genérica de categoría — el texto del ítem no coincidió con ningún producto específico del catálogo (marca/término técnico distinto al de RMG). Puede que RMG no tenga este producto exacto: verificar antes de cotizar.')
    }
    if (sustituido) {
      observaciones.push(`Presentación de menor formato (${sku.presentacion}) usada como unidad de compra proxy en lugar del tambor/cilindro ${skuOriginalTambor} — evita inflar el costo con un formato grande innecesario.`)
    } else if (formatoGrandeSinAlternativa) {
      observaciones.push(`No existe en catálogo una presentación de menor formato para este producto — se ofrece el tambor/cilindro (${sku.presentacion}) por ser la única opción disponible. Revisar antes de cotizar si conviene fraccionar o buscar proveedor alternativo.`)
    }
    if (cantidadFueAjustada) {
      observaciones.push(`⚠️ CANTIDAD AJUSTADA de ${item.cantidad ?? '—'} a ${cantidadFinal} unidad(es) de "${sku.presentacion}" para cubrir el volumen total solicitado (~${volTotalSolicitado} L) — sin este ajuste se estaría ofertando solo ${Math.round((volUnitarioOfrecido * (item.cantidad ?? 1)) * 100) / 100} L de los ${volTotalSolicitado} L pedidos. Verificar antes de cotizar.`)
    }
    if (envaseNoCoincide) {
      observaciones.push(`⚠️ TIPO DE ENVASE DISTINTO: la licitación pide "${tipoSolicitado}" y RMG ofrece "${tipoOfrecido}" (${sku.presentacion}). Confirmar con el organismo si este formato es aceptable antes de postular.`)
    }
    const observacion = observaciones.length ? observaciones.join(' ') : null

    upd.run(
      sku.codigo_sku, confianza, costoUnitario, precioSugerido, margenPct, 1, observacion, skuOriginalTambor || null,
      cantidadFinal, cantidadFueAjustada ? item.cantidad : null, cantidadFueAjustada ? 1 : 0,
      item.id
    )
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
  categoriaEfectiva,
  inferirCategoria,
  inferirSubtipo,
  familiaEnvase,
  inferirTipoEnvaseSolicitado,
  volumenTotalSolicitado,
}
