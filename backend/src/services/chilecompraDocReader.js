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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

const EXTRACTION_PROMPT = `Eres un asistente experto en compras públicas chilenas (Mercado Público / ChileCompra).
Te adjunto uno o más documentos (memo, especificaciones técnicas, bases administrativas) de una
oportunidad de venta al Estado. Extrae SOLO lo que el documento diga explícitamente — si un dato no
aparece, usa null. Nunca inventes ni estimes cifras, fechas o direcciones.

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
  "resumen": string
}`

/**
 * @param {Array<{base64: string, mediaType: string, nombre: string}>} documentos
 * @returns {Promise<object>} extracción estructurada (ver EXTRACTION_PROMPT)
 */
async function leerAnexos(documentos) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurado — requerido para leer anexos con IA')
  }
  if (!documentos?.length) {
    throw new Error('leerAnexos: no se recibieron documentos')
  }

  const content = [
    { type: 'text', text: EXTRACTION_PROMPT },
    ...documentos.map(doc => ({
      type: 'document',
      source: { type: 'base64', media_type: doc.mediaType || 'application/pdf', data: doc.base64 },
    })),
  ]

  const { data } = await axios.post(
    ANTHROPIC_URL,
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 60_000,
    }
  )

  const textBlock = (data.content || []).find(b => b.type === 'text')
  if (!textBlock) throw new Error('leerAnexos: la respuesta del modelo no trajo texto')

  let parsed
  try {
    // El modelo puede envolver el JSON en ```json — se limpia por si acaso.
    const clean = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')
    parsed = JSON.parse(clean)
  } catch (e) {
    throw new Error(`leerAnexos: no se pudo parsear la respuesta como JSON — revisar manualmente. Detalle: ${e.message}`)
  }

  return parsed
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
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurado — requerido para leer anexos con IA')
  }
  if (!textoFicha?.trim()) {
    throw new Error('leerFichaPublica: no se recibió texto de la ficha')
  }

  const content = [
    { type: 'text', text: `${EXTRACTION_PROMPT}\n\nEste es el texto de la ficha pública de la licitación (extraído del portal Mercado Público):\n\n${textoFicha.slice(0, 60_000)}` },
  ]

  const { data } = await axios.post(
    ANTHROPIC_URL,
    {
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 60_000,
    }
  )

  const textBlock = (data.content || []).find(b => b.type === 'text')
  if (!textBlock) throw new Error('leerFichaPublica: la respuesta del modelo no trajo texto')

  try {
    const clean = textBlock.text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')
    return JSON.parse(clean)
  } catch (e) {
    throw new Error(`leerFichaPublica: no se pudo parsear la respuesta como JSON — revisar manualmente. Detalle: ${e.message}`)
  }
}

module.exports = { leerAnexos, leerFichaPublica }
