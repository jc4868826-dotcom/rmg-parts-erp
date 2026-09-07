/**
 * RMG Parts — Lectura de anexos (Compra Ágil / Licitación) con IA
 *
 * Recibe el PDF (o imagen) de un anexo tal como lo publica el organismo — memo,
 * especificaciones técnicas, bases — y devuelve una extracción estructurada:
 * ítems solicitados, dónde es, cuándo cierra, presupuesto, etc.
 *
 * Igual que se hizo a mano con el memo de Palmilla: nunca inventar un número que
 * el documento no respalde — si algo no aparece, se devuelve null, no un valor
 * inventado. La extracción SIEMPRE debe quedar disponible para revisión humana
 * antes de usarse para cotizar (ver chilecompraController.getOportunidad, que
 * expone resumen_ia + los ítems crudos).
 *
 * Requiere ANTHROPIC_API_KEY. Modelo configurable vía ANTHROPIC_MODEL (verificar
 * el identificador vigente en la documentación de Anthropic al desplegar — los
 * nombres de modelo cambian con el tiempo).
 */
const axios = require('axios')
const mammoth = require('mammoth')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// IMPORTANTE (fix 2026-09 — "leyó solo 3 requerimientos"): el usuario reportó
// que, con 4 documentos adjuntos a una licitación real, la extracción solo
// devolvió 3 ítems — sospecha fundada de que el modelo se detuvo antes de
// terminar de revisar todos los documentos, o resumió/fusionó ítems
// distintos en uno solo. El prompt ahora es explícito sobre EXHAUSTIVIDAD
// (revisar cada documento completo, no detenerse en los primeros ítems que
// encuentre, nunca fusionar productos distintos aunque sean del mismo rubro)
// y se agregó un campo de auto-reporte (extraccion_posiblemente_incompleta)
// para que, si el propio modelo no está seguro de haber cubierto todo, quede
// una señal visible en vez de un silencio que parece éxito. Ver también el
// aumento de max_tokens en llamarAnthropicYParsear — con pocos tokens de
// salida, una licitación con muchos ítems puede truncar el JSON a mitad de
// camino (eso SÍ rompe el parseo, con un error claro; el caso más peligroso
// es cuando el modelo, sin espacio suficiente, decide resumir en vez de
// truncar — por eso el pedido explícito de exhaustividad además del límite
// más alto).
const EXTRACTION_PROMPT = `Eres un asistente experto en compras públicas chilenas (Mercado Público / ChileCompra).
Te adjunto uno o más documentos (memo, especificaciones técnicas, bases administrativas, anexos) de una
oportunidad de venta al Estado. Extrae SOLO lo que el documento diga explícitamente — si un dato no
aparece, usa null. Nunca inventes ni estimes cifras, fechas o direcciones.

REGLAS DE EXHAUSTIVIDAD (crítico — un ítem omitido puede costarle dinero real a la empresa que usa
esta extracción para cotizar):
- Revisa TODOS los documentos adjuntos completos, de principio a fin, incluyendo tablas, anexos y
  cualquier listado de productos/ítems — no te detengas después de encontrar los primeros ítems.
- Lista CADA ítem/producto solicitado como una entrada separada en "items", aunque haya muchos (10,
  20 o más) y aunque varios sean del mismo rubro (ej. "aceite de motor 15W40" y "aceite hidráulico
  ISO 68" son DOS ítems distintos, nunca los fusiones en uno ni los resumas como "varios lubricantes").
- Si una tabla de la licitación lista N líneas de producto, "items" debe tener N entradas — nunca
  menos porque parezcan repetitivas o similares entre sí.
- Si tras revisar todo no estás seguro de haber capturado el 100% de los ítems (documento muy largo,
  tabla cortada, texto poco legible), dilo explícitamente en "extraccion_posiblemente_incompleta" y
  explica por qué en "resumen" — NUNCA te quedes callado sobre esa incertidumbre.

Devuelve EXCLUSIVAMENTE un JSON válido (sin texto antes ni después) con esta forma exacta:
{
  "organismo_nombre": string|null,
  "direccion_entrega": string|null,
  "comuna": string|null,
  "region": string|null,
  "fecha_cierre_cotizacion": string|null,
  "plazo_entrega": string|null,
  "presupuesto_estimado": number|null,
  "tiene_exigencia_garantia": boolean|null,
  "tiene_exigencia_sds_ficha_tecnica": boolean|null,
  "items": [
    {
      "descripcion_solicitada": string,
      "cantidad": number|null,
      "unidad": string|null,
      "especificacion_tecnica": string|null,
      "precio_unitario_referencial": number|null
    }
  ],
  "extraccion_posiblemente_incompleta": boolean,
  "resumen": string
}`

/**
 * Llama a la API de Anthropic y devuelve el bloque de texto ya parseado como JSON.
 * Si la llamada falla, el error incluye el detalle real que devuelve Anthropic
 * (data.error.message) en vez del genérico "Request failed with status code 400"
 * de axios — sin eso es imposible saber si falló por modelo inválido, key
 * inválida, contenido rechazado, etc. sin mirar los logs del servidor.
 */
async function llamarAnthropicYParsear(content, origen) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurado — requerido para leer anexos con IA')
  }

  let data
  try {
    const resp = await axios.post(
      ANTHROPIC_URL,
      // max_tokens subido de 4096 a 8192 (fix 2026-09 — "leyó solo 3
      // requerimientos"): con licitaciones de varios documentos y muchos
      // ítems, 4096 tokens de salida podían no alcanzar para el JSON
      // completo — el riesgo no es solo un error de parseo (JSON cortado a
      // mitad), sino que el modelo, al notar que se queda sin espacio,
      // puede resumir/fusionar ítems en vez de listarlos todos. Ver también
      // las reglas de exhaustividad agregadas a EXTRACTION_PROMPT.
      { model: ANTHROPIC_MODEL, max_tokens: 8192, messages: [{ role: 'user', content }] },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 60_000,
      }
    )
    data = resp.data
  } catch (e) {
    const detalleApi = e.response?.data?.error?.message || e.response?.data?.error?.type
    throw new Error(`${origen}: falló la llamada a Anthropic (HTTP ${e.response?.status || '?'})${detalleApi ? ` — ${detalleApi}` : `: ${e.message}`}`)
  }

  const textBlock = (data.content || []).find(b => b.type === 'text')
  if (!textBlock) throw new Error(`${origen}: la respuesta del modelo no trajo texto`)

  try {
    const clean = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')
    return JSON.parse(clean)
  } catch (e) {
    throw new Error(`${origen}: no se pudo parsear la respuesta como JSON — revisar manualmente. Detalle: ${e.message}`)
  }
}

// Anthropic solo acepta PDF en bloques "document" y estos formatos en bloques
// "image" — Excel, CSV, etc. no se pueden mandar tal cual (por eso el filtro
// también existe en chilecompraController antes de llegar hasta acá; esto es
// la segunda barrera, para que un llamador futuro nunca reintroduzca el mismo
// error "Input should be 'application/pdf'").
//
// Word (.docx/.doc) es un caso aparte: no calza en ningún bloque que Anthropic
// acepte, pero SÍ es un formato real y frecuente de los "Anexos Ingresados"
// que un organismo publica en una licitación (ej. "ANEXO 1,2 y 3
// EDITABLES.docx" en la licitación 2378-105-LE26, La Florida — uno de los
// documentos que trae el detalle real de lo solicitado). En vez de
// descartarlo como antes, se extrae su texto con `mammoth` (librería pura
// JS, sin dependencias nativas) y se agrega como texto plano al mismo prompt
// — así el modelo lee su contenido igual que si fuera un PDF, solo que por
// otro camino.
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const TIPOS_WORD = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

async function extraerTextoWord(doc) {
  try {
    const buffer = Buffer.from(doc.base64, 'base64')
    const { value } = await mammoth.extractRawText({ buffer })
    return value?.trim() || null
  } catch (e) {
    console.warn(`⚠️ No se pudo extraer texto de "${doc.nombre || 'documento Word'}": ${e.message}`)
    return null
  }
}

/**
 * @param {Array<{base64: string, mediaType: string, nombre: string}>} documentos
 * @returns {Promise<object>} extracción estructurada (ver EXTRACTION_PROMPT)
 */
async function leerAnexos(documentos) {
  if (!documentos?.length) {
    throw new Error('leerAnexos: no se recibieron documentos')
  }

  const legiblesDirecto = documentos.filter(doc => doc.mediaType === 'application/pdf' || TIPOS_IMAGEN.includes(doc.mediaType))
  const wordDocs = documentos.filter(doc => TIPOS_WORD.includes(doc.mediaType))

  // Los Word se procesan aparte (extracción de texto, puede fallar
  // individualmente sin tumbar el análisis completo si el archivo viene
  // corrupto o con un formato que mammoth no soporta).
  const textosWord = []
  for (const doc of wordDocs) {
    const texto = await extraerTextoWord(doc)
    if (texto) textosWord.push({ nombre: doc.nombre || 'documento Word', texto })
  }
  const wordConTextoOk = new Set(textosWord.map(t => t.nombre))
  const wordFallidos = wordDocs.filter(d => !wordConTextoOk.has(d.nombre || 'documento Word'))

  const descartados = documentos.filter(doc => !legiblesDirecto.includes(doc) && !wordDocs.includes(doc))

  if (!legiblesDirecto.length && !textosWord.length) {
    const todosDescartados = [...descartados, ...wordFallidos]
    const detalle = todosDescartados.map(d => `${d.nombre || 'sin nombre'} (${d.mediaType || 'sin tipo'})`).join(', ')
    throw new Error(`leerAnexos: ninguno de los ${documentos.length} documento(s) es legible por IA — Excel/CSV no son compatibles con la lectura automática, y ningún Word pudo procesarse. Archivo(s) descartado(s): ${detalle}`)
  }

  const promptConWord = textosWord.length
    ? `${EXTRACTION_PROMPT}\n\nAdemás, este es el texto extraído de ${textosWord.length} documento(s) Word adjunto(s):\n\n` +
      textosWord.map(t => `--- ${t.nombre} ---\n${t.texto.slice(0, 30_000)}`).join('\n\n')
    : EXTRACTION_PROMPT

  const content = [
    { type: 'text', text: promptConWord },
    ...legiblesDirecto.map(doc => (
      TIPOS_IMAGEN.includes(doc.mediaType)
        ? { type: 'image', source: { type: 'base64', media_type: doc.mediaType, data: doc.base64 } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 } }
    )),
  ]

  return llamarAnthropicYParsear(content, 'leerAnexos')
}

/**
 * Igual que leerAnexos, pero a partir del TEXTO PLANO de la ficha pública de
 * Mercado Público (ver chilecompraApiClient.fetchFichaPublicaTexto) en vez de un
 * PDF subido a mano. La ficha pública ya trae bases administrativas, técnicas,
 * criterios de evaluación y garantías — no hace falta que el usuario descargue y
 * suba nada para tener un primer análisis; subir anexos PDF adicionales (planos,
 * fichas técnicas específicas) sigue siendo útil pero deja de ser obligatorio.
 * @param {string} textoFicha
 */
async function leerFichaPublica(textoFicha) {
  if (!textoFicha?.trim()) {
    throw new Error('leerFichaPublica: no se recibió texto de la ficha')
  }

  const content = [
    { type: 'text', text: `${EXTRACTION_PROMPT}\n\nEste es el texto de la ficha pública de la licitación (extraído del portal Mercado Público):\n\n${textoFicha.slice(0, 60_000)}` },
  ]

  return llamarAnthropicYParsear(content, 'leerFichaPublica')
}

module.exports = { leerAnexos, leerFichaPublica }
