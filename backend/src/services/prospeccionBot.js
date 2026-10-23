/**
 * RMG Parts — Bot de WhatsApp de la prospección automática (número +56 9 7286 4315).
 * Pedido de JC (2026-10-21): que responda a los prospectos con el mismo conocimiento
 * técnico del cotizador (fichas Vistony), SIN precios, orientando y respondiendo
 * preguntas técnicas, y siempre dejando al prospecto en "Para llamar" de Abril.
 *
 * Flujo: Meta → webhook de Cata (rmg-autos-bot) → reenvía al ERP (/evento) →
 * prospeccionAuto.registrarRespuesta → este módulo genera la respuesta y la manda
 * por WhatsApp (texto libre: el prospecto escribió, así que la ventana de 24 h está abierta).
 *
 * Conocimiento (se arma una vez al cargar el módulo, como el resto de catálogos):
 *   - src/data/productos_tagging.json    30 fichas técnicas verificadas (base, grados, normas, ensayos)
 *   - data/conocimiento_vistony.json     80 productos del sitio oficial Vistony
 *   - src/data/catalogoVistony.js        catálogo nombre · tipo · especificación
 * Nunca se le pasan precios ni stock: el bot no tiene cómo inventarlos.
 */
const axios = require('axios')
const { db, uuidv4 } = require('../../config/database')

const MODELO = process.env.PROSPECCION_BOT_MODEL || 'gpt-4o'
const MAX_TURNOS = Number(process.env.PROSPECCION_BOT_MAX_TURNOS || 12)
const WA_VERSION = process.env.PROSPECCION_WA_VERSION || 'v21.0'
const WA_BASE = process.env.PROSPECCION_WA_BASE || 'https://graph.facebook.com'
const OPENAI_URL = process.env.PROSPECCION_OPENAI_URL || 'https://api.openai.com/v1/chat/completions'

// ─── Base de conocimiento ────────────────────────────────────────────────────
function cargar(ruta, campo) {
  try { const d = require(ruta); return campo ? d[campo] : d } catch (e) {
    console.warn(`[PROSP-BOT] no se pudo cargar ${ruta}: ${e.message}`); return []
  }
}
const plano = (o) => !o ? [] : Array.isArray(o) ? o.flatMap(plano) : typeof o === 'object' ? Object.values(o).flatMap(plano) : [String(o)]

function armarConocimiento() {
  const fichas = cargar('../data/productos_tagging.json', 'productos') || []
  const web = cargar('../../data/conocimiento_vistony.json') || []
  const catalogo = cargar('../data/catalogoVistony', 'CATALOGO_VISTONY') || []
  const f = fichas.map(p => {
    const val = (v) => v && typeof v === 'object' ? `{${Object.entries(v).map(([g, x]) => `${g}: ${x}`).join('; ')}}` : v
    const ens = Object.entries(p.ensayos_fisicoquimicos || {}).map(([k, v]) => `${k}=${val(v)}`).join(', ')
    return `- ${p.nombre_ficha} | ${p.categoria} | base: ${p.tipo_base} | grados: ${(p.grados_sae_iso || []).join(', ')} | uso: ${p.uso_principal}` +
      ` | normas: ${plano(p.normas_cumplidas).join(', ')} | ensayos: ${ens} | presentaciones: ${(p.presentaciones || []).join(', ')}`
  }).join('\n')
  const w = web.map(e => `- ${e.nombre}: ${String(e.descripcion || '').replace(/\s+/g, ' ').slice(0, 350)}${e.presentaciones ? ` (${e.presentaciones})` : ''}`).join('\n')
  const c = catalogo.map(x => `- ${x.n} · ${x.t} · ${x.s}`).join('\n')
  return { texto: `## FICHAS TÉCNICAS VERIFICADAS (fuente principal)\n${f}\n\n## PRODUCTOS DEL SITIO OFICIAL VISTONY\n${w}\n\n## CATÁLOGO (nombre · tipo · especificación)\n${c}`,
    fichas: fichas.length, productos: web.length, catalogo: catalogo.length }
}
const CONOCIMIENTO = armarConocimiento()

const SISTEMA = `Eres Abril, ejecutiva comercial de RMG Parts (distribuidor de lubricantes Vistony para la industria, Santiago de Chile). Conversas por WhatsApp con empresas (fábricas, constructoras, agrícolas, flotas) que recibieron un correo y un WhatsApp de RMG Parts sobre fallas de lubricación en sus equipos.

OBJETIVO: ser útil de verdad en lo técnico y dejar agendado un llamado o una visita de Abril. Cada conversación termina en el pipeline de Abril, que llama a quien responde.

CÓMO RESPONDES
- Orienta con criterio técnico usando SOLO la base de conocimiento de abajo: qué producto Vistony corresponde a cada equipo, grado SAE/ISO, tipo de base (mineral/sintético), normas API/ACEA/OEM, intervalos, compatibilidades, diferencias entre productos. Si la ficha da un dato (viscosidad, índice de viscosidad, TBN, punto de inflamación, NLGI, etc.), puedes citarlo.
- Si algo NO está en la base de conocimiento (un producto que no aparece, un dato que la ficha no trae, una aprobación OEM no listada), dilo con honestidad: "eso lo confirmo con el área técnica" — jamás lo inventes.
- Para recomendar bien, pregunta lo que falta: tipo de equipo, marca/modelo, condición de trabajo (carga, temperatura, polvo, agua), qué usan hoy. Una sola pregunta por mensaje.
- NUNCA des precios, descuentos, stock ni plazos de entrega, aunque insistan. Responde: "los valores se los envía Abril en la cotización formal" y ofrece el llamado.
- Si piden cotización, toma el pedido: productos, presentación (balde, tambor, etc.), cantidad aproximada y a quién enviarla. Confirma que Abril se la envía.
- En cuanto haya interés, propone el llamado o una visita técnica sin costo a la planta/obra y pregunta día y horario que le acomoden.
- Si la persona no es la indicada, pide nombre y contacto de quien ve mantención o lubricantes.
- Los botones de la plantilla significan: "Sí, envíenmela" = quiere la RECOMENDACIÓN TÉCNICA para sus equipos (no una cotización): agradece y pregunta qué equipos quiere revisar primero. "Soy yo" = es quien ve mantención/lubricantes. "Otra persona" = pide el contacto de esa persona.
- Cuando la ficha trae datos por grado (ej. índice de viscosidad por ISO 32/46/68), usa el valor del grado que pregunta el cliente.
- Si pide no ser contactada, despídete en una línea, sin insistir.

ESTILO
- Español de Chile, trato de "usted", profesional y cercano, sin frases de call center ni diminutivos.
- Mensajes cortos de WhatsApp: 1 a 3 líneas (máximo unas 60 palabras), sin markdown, sin listas, máximo un emoji (idealmente ninguno). Si la respuesta técnica es larga, da lo esencial y ofrece el detalle.
- No repitas el saludo ni la presentación si ya conversaron. No menciones que eres un bot o una IA salvo que pregunten directamente; si preguntan, di que eres el asistente de Abril y que ella sigue la conversación.
- No hables de autos ni de RMG Autos.

FORMATO: responde SOLO un JSON válido:
{"respuesta":"<mensaje para WhatsApp>","resumen":"<2-3 líneas para Abril: qué necesita, equipos, productos sugeridos, datos de contacto/horario si los dio>","quiere_llamada":true|false,"pidio_cotizacion":true|false,"horario":"<día/hora que propuso o null>","contacto_alternativo":"<nombre/teléfono/correo de otra persona o null>"}

BASE DE CONOCIMIENTO (no contiene precios a propósito):
${CONOCIMIENTO.texto}`

// ─── Conversación ────────────────────────────────────────────────────────────
function historial(prospectoId, limite = 20) {
  return db.prepare(`SELECT rol, texto, created_at, autor FROM prospeccion_auto_conversacion WHERE prospecto_id = ?
      ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(prospectoId, limite).reverse()
}
function guardar(prospectoId, rol, texto, extra = {}) {
  try {
    db.prepare(`INSERT INTO prospeccion_auto_conversacion (id, prospecto_id, rol, texto, wamid, tipo, autor) VALUES (?,?,?,?,?,?,?)`)
      .run(uuidv4(), prospectoId, rol, String(texto || '').slice(0, 4000), extra.wamid || null, extra.tipo || null, extra.autor || null)
    return true
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return false   // Meta reenvió el mismo mensaje: no responder dos veces
    throw e
  }
}
const botPausado = (prospectoId) => !!db.prepare('SELECT 1 FROM prospeccion_auto_bot_pausa WHERE prospecto_id = ?').get(prospectoId)
function pausarBot(prospectoId, pausado, por) {
  if (pausado) db.prepare('INSERT OR REPLACE INTO prospeccion_auto_bot_pausa (prospecto_id, pausado_por) VALUES (?, ?)').run(prospectoId, por || null)
  else db.prepare('DELETE FROM prospeccion_auto_bot_pausa WHERE prospecto_id = ?').run(prospectoId)
  return { pausado: botPausado(prospectoId) }
}
const yaRecibido = (wamid) => !!wamid && !!db.prepare('SELECT 1 FROM prospeccion_auto_conversacion WHERE wamid = ?').get(wamid)

function contextoProspecto(p, m) {
  const mensajePlantilla = m ? `Ya recibió: correo "${m.asunto}" sobre ${m.wa_falla} en ${m.wa_rubro}, y un WhatsApp de seguimiento con 3 botones (Sí, envíenmela / Ahora no / No volver a contactar).` : ''
  return [`PROSPECTO: ${p.empresa || '—'}`, `Segmento: ${p.seq_segmento || p.segmento || '—'}`, p.rubro ? `Rubro: ${p.rubro}` : null,
    `Contacto: ${p.nombre_contacto || 'sin nombre'}${p.cargo ? ` (${p.cargo})` : ''}`, p.comuna ? `Comuna: ${p.comuna}` : null, mensajePlantilla,
    p.seq_resumen_bot ? `Resumen de lo conversado antes: ${p.seq_resumen_bot}` : null].filter(Boolean).join('\n')
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────
async function generar(p, m, mensajes) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('Falta OPENAI_API_KEY en Render')
  const msgs = [
    { role: 'system', content: SISTEMA },
    { role: 'system', content: contextoProspecto(p, m) },
    ...mensajes.map(x => ({ role: x.rol === 'cliente' ? 'user' : 'assistant', content: x.rol === 'cliente' ? x.texto : JSON.stringify({ respuesta: x.texto }) })),
  ]
  const r = await axios.post(OPENAI_URL, {
    model: MODELO, temperature: 0.3, max_tokens: 600, response_format: { type: 'json_object' }, messages: msgs,
  }, { headers: { Authorization: `Bearer ${key}` }, timeout: 45000 })
  const txt = r.data?.choices?.[0]?.message?.content || '{}'
  let j
  try { j = JSON.parse(txt) } catch (_) { j = { respuesta: txt } }
  const respuesta = String(j.respuesta || '').replace(/\*\*/g, '').trim()
  if (!respuesta) throw new Error('respuesta vacía del modelo')
  return { ...j, respuesta: respuesta.slice(0, 1500) }
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────
async function enviarTexto(numero, texto) {
  if (!process.env.PROSPECCION_WA_PHONE_ID || !process.env.PROSPECCION_WA_TOKEN) throw new Error('WhatsApp de prospección sin configurar')
  const r = await axios.post(`${WA_BASE}/${WA_VERSION}/${process.env.PROSPECCION_WA_PHONE_ID}/messages`,
    { messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texto, preview_url: false } },
    { headers: { Authorization: `Bearer ${process.env.PROSPECCION_WA_TOKEN}` }, timeout: 15000 })
  return r.data?.messages?.[0]?.id || null
}

// Un prospecto a la vez: si escribe 3 mensajes seguidos, se responden en orden.
const colas = new Map()
function enCola(clave, fn) {
  const previa = colas.get(clave) || Promise.resolve()
  const sig = previa.catch(() => {}).then(fn)
  colas.set(clave, sig)
  sig.finally(() => { if (colas.get(clave) === sig) colas.delete(clave) })
  return sig
}

/**
 * Responde un mensaje entrante. p = fila de pipeline_contactos (o prospecto de prueba con id 'prueba:<num>').
 * Devuelve { ok, respuesta, resumen, ... } o { ok:false, motivo }.
 */
async function responder({ p, m, numero, enviar = true }) {
  return enCola(p.id, async () => {
    const hist = historial(p.id)
    const turnos = hist.filter(x => x.rol === 'bot').length
    if (turnos >= MAX_TURNOS) {
      const cierre = 'Le dejo con Abril, que lo llama para seguir con el detalle. Gracias por su tiempo.'
      if (turnos === MAX_TURNOS) {
        guardar(p.id, 'bot', cierre)
        if (enviar) await enviarTexto(numero, cierre)
      }
      return { ok: true, respuesta: cierre, limite: true }
    }
    const j = await generar(p, m, hist)
    guardar(p.id, 'bot', j.respuesta)
    let wamid = null
    if (enviar) wamid = await enviarTexto(numero, j.respuesta)
    if (!String(p.id).startsWith('prueba:')) {
      const resumen = [j.resumen, j.horario ? `Horario propuesto: ${j.horario}` : null, j.contacto_alternativo ? `Otro contacto: ${j.contacto_alternativo}` : null,
        j.pidio_cotizacion ? 'PIDIÓ COTIZACIÓN' : null].filter(Boolean).join(' · ').slice(0, 1200)
      db.prepare(`UPDATE pipeline_contactos SET seq_resumen_bot = ?, seq_bot_pidio_cotizacion = MAX(COALESCE(seq_bot_pidio_cotizacion,0), ?),
          seq_bot_quiere_llamada = MAX(COALESCE(seq_bot_quiere_llamada,0), ?), fecha_ultima_actualizacion = datetime('now') WHERE id = ?`)
        .run(resumen || null, j.pidio_cotizacion ? 1 : 0, j.quiere_llamada ? 1 : 0, p.id)
    }
    return { ok: true, ...j, wamid }
  })
}

/** Simulador del panel: no envía nada ni guarda; conversa con un prospecto de ejemplo. */
async function simular({ p, m, mensajes }) {
  const hist = (mensajes || []).map(x => ({ rol: x.rol === 'bot' ? 'bot' : 'cliente', texto: String(x.texto || '') })).slice(-20)
  return generar(p, m, hist)
}

module.exports = { responder, simular, enviarTexto, historial, guardar, yaRecibido, botPausado, pausarBot, CONOCIMIENTO, MODELO, MAX_TURNOS }
