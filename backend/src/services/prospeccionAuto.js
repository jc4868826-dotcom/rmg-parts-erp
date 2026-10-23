/**
 * RMG Parts — Prospección automática (2026-10-13/14, pedido de JC)
 *
 * Secuencia por prospecto (días hábiles, hora Santiago):
 *   D0 hora_correo  correo desde la casilla fija de prospección (aquiroga@rmgautos.cl),
 *                   independiente de quién esté conectado: el envío es automático.
 *   D1 hora_wsp1    plantilla rmgparts_seguimiento_correo_v1 (imagen + 3 botones)
 *   D2 hora_wsp2    plantilla rmgparts_pregunta_responsable_v1 (solo si no respondió)
 *   D3 hora_dormido pasa a dormido; reintento único a los 45 días
 *
 * Segmentos: Industria (fábricas), Construcción, Agrícola. Cada uno con su
 * mensaje editable (tabla prospeccion_auto_mensajes). Un mensaje editado queda
 * sin validar y su segmento no envía hasta que se valide de nuevo.
 *
 * Base: solo prospectos con correo válido Y celular. Sin celular no entran.
 *
 * Activar / pausar: solo el dueño (PROSPECCION_OWNER_EMAIL, por defecto
 * juancarlos.contreras@rmgautos.cl). Pausa automática si en el último lote
 * las bajas superan 5% o los datos erróneos 3%.
 *
 * WhatsApp usa PROSPECCION_WA_PHONE_ID / PROSPECCION_WA_TOKEN (otro número que
 * META_WHATSAPP_*). Sin ellas, o con wsp_activo=0, los prospectos esperan en
 * correo_enviado.
 */
const crypto = require('crypto')
let dns = require('dns').promises
const axios = require('axios')
const nodemailer = require('nodemailer')
const { db, uuidv4 } = require('../../config/database')
const { cifrar, descifrar } = require('./correoUsuario')
const bot = require('./prospeccionBot')

const FRONT = process.env.FRONTEND_URL || 'https://rmg-parts-frontend.onrender.com'
const API = process.env.API_PUBLIC_URL || 'https://rmg-parts-erp.onrender.com'
const WA_VERSION = process.env.PROSPECCION_WA_VERSION || 'v21.0'
const WA_BASE = process.env.PROSPECCION_WA_BASE || 'https://graph.facebook.com'
const OWNER = (process.env.PROSPECCION_OWNER_EMAIL || 'juancarlos.contreras@rmgautos.cl').toLowerCase()
const PLANTILLA_1 = 'rmgparts_seguimiento_correo_v1'
const PLANTILLA_2 = 'rmgparts_pregunta_responsable_v1'
// Pausa entre correos: 20–45 s por defecto (no mandar en ráfaga desde una casilla nueva).
const PAUSA_MIN = Number(process.env.PROSPECCION_PAUSA_MS ?? 20000)
const DOMINIOS_REDIRECCION = ['wa.me', 'rmgautos.cl', 'www.rmgautos.cl', 'rmg-parts-frontend.onrender.com']
const CORREOS_PERSONALES = /@(gmail|hotmail|yahoo|outlook|live|icloud)\./i
const SEGMENTOS = ['Industria', 'Construcción', 'Agrícola']

// ─── Utilidades ──────────────────────────────────────────────────────────────
function ahoraSantiago() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date()).map(x => [x.type, x.value]))
  const hora = p.hour === '24' ? '00' : p.hour
  return { fecha: `${p.year}-${p.month}-${p.day}`, hm: `${hora}:${p.minute}`, dow: p.weekday }
}
const esHabil = (dow) => !['Sat', 'Sun'].includes(dow)
function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-/.(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()).trim()
const primerNombre = (s) => { const n = String(s || '').trim().split(/\s+/)[0]; return n && n.length > 1 ? titulo(n) : null }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const emailValido = (e) => /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(String(e || '').trim())
const esDueno = (u) => !!u && String(u.email || '').toLowerCase() === OWNER

/** Celular chileno → '569XXXXXXXX' o null (fijos y basura → null). */
function normalizarCelular(...valores) {
  for (const v of valores) {
    let d = String(v || '').replace(/\D/g, '')
    if (!d) continue
    if (d.startsWith('56')) d = d.slice(2)
    if (d.length === 8 && /^[5-9]/.test(d)) d = '9' + d   // celular antiguo de 8 dígitos (los fijos parten en 2)
    if (d.length === 9 && d.startsWith('9')) return '56' + d
  }
  return null
}

function evento(prospectoId, tipo, detalle) {
  try {
    db.prepare('INSERT INTO prospeccion_auto_eventos (id, prospecto_id, tipo, detalle) VALUES (?,?,?,?)')
      .run(uuidv4(), prospectoId || null, tipo, detalle ? String(detalle).slice(0, 2000) : null)
  } catch (e) { console.error('[PROSP-AUTO] evento:', e.message) }
}
function bitacora(prospectoId, tipo, descripcion, usuarioId) {
  try {
    db.prepare('INSERT INTO prospecto_bitacora (id, prospecto_id, tipo, descripcion, usuario_id) VALUES (?,?,?,?,?)')
      .run(uuidv4(), prospectoId, tipo, descripcion, usuarioId || null)
  } catch (e) { console.error('[PROSP-AUTO] bitácora:', e.message) }
}

// ─── Config ──────────────────────────────────────────────────────────────────
function getConfig() {
  return db.prepare('SELECT * FROM prospeccion_auto_config WHERE id = 1').get() || {}
}
function configPublica() {
  const c = getConfig()
  const { smtp_pass_enc, ...resto } = c
  return { ...resto, smtp_clave_cargada: !!smtp_pass_enc, owner_email: OWNER }
}
const CAMPOS_CONFIG = ['wsp_activo', 'bot_activo', 'lote_diario', 'hora_correo', 'hora_wsp1', 'hora_wsp2', 'hora_dormido',
  'wa_numero_bot', 'test_email', 'test_celular', 'notificar_emails', 'smtp_email', 'smtp_nombre', 'smtp_host',
  'smtp_port', 'segmentos_activos']
function setConfig(cambios, usuario) {
  if (!esDueno(usuario)) throw new Error('Solo el dueño de la campaña puede cambiar la configuración')
  const campos = CAMPOS_CONFIG.filter(k => cambios[k] !== undefined)
  const valores = campos.map(k => {
    let v = cambios[k]
    if (k === 'wsp_activo' || k === 'bot_activo') v = v ? 1 : 0
    if (k === 'lote_diario') v = Math.max(1, Math.min(100, Number(v) || 20))
    if (k === 'smtp_port') v = Number(v) || 465
    if (k === 'wa_numero_bot' || k === 'test_celular') v = v ? normalizarCelular(v) : null
    if (k === 'segmentos_activos') v = String(v).split(',').map(s => s.trim()).filter(s => SEGMENTOS.includes(s)).join(',')
    if (/^hora_/.test(k) && !/^\d{2}:\d{2}$/.test(String(v))) throw new Error(`${k} debe ser HH:MM`)
    return v === '' ? null : v
  })
  if (cambios.smtp_pass) { campos.push('smtp_pass_enc', 'smtp_verificado_at'); valores.push(cifrar(cambios.smtp_pass), null) }
  if (!cambios.smtp_pass && ['smtp_email', 'smtp_host', 'smtp_port'].some(k => cambios[k] !== undefined && String(cambios[k]) !== String(getConfig()[k]))) {
    campos.push('smtp_verificado_at'); valores.push(null)
  }
  if (campos.length) {
    db.prepare(`UPDATE prospeccion_auto_config SET ${campos.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = 1`)
      .run(...valores)
  }
  return configPublica()
}
const waConfigurado = () => !!(process.env.PROSPECCION_WA_PHONE_ID && process.env.PROSPECCION_WA_TOKEN)
const segmentosActivos = (c = getConfig()) => String(c.segmentos_activos || '').split(',').map(s => s.trim()).filter(s => SEGMENTOS.includes(s))

// ─── Casilla fija de envío ───────────────────────────────────────────────────
function casilla(config = getConfig()) {
  if (!config.smtp_email) return { ok: false, motivo: 'Falta la casilla de envío' }
  if (!config.smtp_pass_enc) return { ok: false, motivo: `Falta la clave de ${config.smtp_email} (Configuración → Casilla de envío)` }
  const pass = descifrar(config.smtp_pass_enc)
  if (!pass) return { ok: false, motivo: 'La clave guardada no se puede leer: vuelve a ingresarla' }
  const port = Number(config.smtp_port || 465)
  const transporter = nodemailer.createTransport({
    host: config.smtp_host || 'mail.rmgautos.cl', port, secure: port === 465,
    auth: { user: config.smtp_email, pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  })
  return { ok: true, transporter, from: `"${config.smtp_nombre || 'RMG Parts'}" <${config.smtp_email}>`, replyTo: config.smtp_email, email: config.smtp_email }
}
async function probarCasilla(usuario) {
  if (!esDueno(usuario)) throw new Error('Solo el dueño de la campaña puede probar la casilla')
  const c = casilla()
  if (!c.ok) return { ok: false, motivo: c.motivo }
  try {
    await c.transporter.verify()
    db.prepare("UPDATE prospeccion_auto_config SET smtp_verificado_at = datetime('now') WHERE id = 1").run()
    return { ok: true }
  } catch (e) {
    const cfg = getConfig()
    return { ok: false, motivo: `${e.message}${e.code ? ` [${e.code}]` : ''} (servidor ${cfg.smtp_host}:${cfg.smtp_port})` }
  }
}

// ─── Mensajes por segmento ───────────────────────────────────────────────────
const parsearMensaje = (m) => m ? { ...m, fallas: String(m.fallas || '').split('\n').filter(Boolean) } : null
function mensajes() {
  return db.prepare("SELECT * FROM prospeccion_auto_mensajes ORDER BY CASE segmento WHEN 'Industria' THEN 1 WHEN 'Construcción' THEN 2 ELSE 3 END").all().map(parsearMensaje)
}
const mensajeDe = (segmento) => parsearMensaje(db.prepare('SELECT * FROM prospeccion_auto_mensajes WHERE segmento = ?').get(segmento))
const CAMPOS_MENSAJE = ['asunto', 'asunto_sin_nombre', 'parrafo1', 'fallas', 'parrafo2', 'parrafo3', 'imagen_correo', 'imagen_wa', 'wa_falla', 'wa_rubro']
const listaFallas = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map(s => String(s).trim()).filter(Boolean)
function guardarMensaje(segmento, body, usuario) {
  if (!['gerente', 'administrador'].includes(usuario?.rol) && !esDueno(usuario)) throw new Error('Sin permiso para editar mensajes')
  if (!mensajeDe(segmento)) throw new Error('Segmento no existe')
  const campos = CAMPOS_MENSAJE.filter(k => body[k] !== undefined)
  if (!campos.length) return mensajeDe(segmento)
  for (const k of ['wa_falla', 'wa_rubro']) {
    if (body[k] !== undefined && /[\n\t]|\s{4,}/.test(body[k])) throw new Error('Los textos de WhatsApp no pueden tener saltos de línea')
  }
  const valores = campos.map(k => k === 'fallas' ? listaFallas(body.fallas).join('\n') : String(body[k] ?? '').trim())
  // Cualquier cambio deja el mensaje sin validar: el segmento no envía hasta revisarlo de nuevo.
  db.prepare(`UPDATE prospeccion_auto_mensajes SET ${campos.map(c => `${c} = ?`).join(', ')}, validado_at = NULL, validado_por = NULL,
      updated_at = datetime('now'), updated_por = ? WHERE segmento = ?`).run(...valores, usuario?.email || null, segmento)
  return mensajeDe(segmento)
}
function validarMensaje(segmento, usuario) {
  if (!esDueno(usuario)) throw new Error('Solo el dueño de la campaña valida los mensajes')
  const m = mensajeDe(segmento)
  if (!m) throw new Error('Segmento no existe')
  for (const k of ['asunto', 'asunto_sin_nombre', 'parrafo1', 'parrafo3', 'wa_falla', 'wa_rubro', 'imagen_wa']) if (!m[k]) throw new Error(`Falta "${k}"`)
  if (!m.fallas.length) throw new Error('Agrega al menos una falla')
  db.prepare("UPDATE prospeccion_auto_mensajes SET validado_at = datetime('now'), validado_por = ? WHERE segmento = ?").run(usuario.email, segmento)
  return mensajeDe(segmento)
}

// ─── Selección del lote ──────────────────────────────────────────────────────
const REVENDEDOR = ['REVENDEDOR', 'FERRETER', 'DISTRIBUID', 'COMERCIALIZ', 'REPUESTO', 'RETAIL', 'OUTLET']
const REGION_RM = /(^|\b)(RM|METROPOLITANA|SANTIAGO|R\.M\.?)(\b|$)/
// La columna region viene casi siempre en 'RM' por defecto: también se mira el
// nombre de la empresa, la ciudad y la comuna por ciudades de regiones (Vistony
// despacha bien en la RM; regiones queda fuera por ahora).
const CIUDADES_REGION = ['ARICA', 'IQUIQUE', 'ANTOFAGASTA', 'CALAMA', 'COPIAPO', 'LA SERENA', 'COQUIMBO', 'OVALLE',
  'VALPARAISO', 'VINA DEL MAR', 'QUILLOTA', 'SAN ANTONIO', 'LOS ANDES', 'SAN FELIPE', 'RANCAGUA', 'SAN FERNANDO',
  'CURICO', 'TALCA', 'LINARES', 'CHILLAN', 'CONCEPCION', 'TALCAHUANO', 'LOS ANGELES', 'CORONEL', 'TEMUCO',
  'VALDIVIA', 'OSORNO', 'PUERTO MONTT', 'CASTRO', 'COYHAIQUE', 'PUNTA ARENAS']

function motivoExclusion(p, hoy) {
  if (!SEGMENTOS.includes(p.segmento)) return 'otro segmento'
  if (!emailValido(p.email)) return 'sin correo válido'
  if (!normalizarCelular(p.celular, p.telefono_contacto, p.telefono_empresa)) return 'sin celular'
  const reg = sinTildes(p.region)
  if (reg && !REGION_RM.test(reg)) return 'fuera de RM'
  const lugar = sinTildes([p.empresa, p.ciudad, p.comuna].filter(Boolean).join(' '))
  if (CIUDADES_REGION.some(c => new RegExp(`\\b${c}\\b`).test(lugar))) return 'fuera de RM'
  const t = sinTildes([p.empresa, p.rubro, p.rubro_especialidad, p.notas].filter(Boolean).join(' '))
  if (REVENDEDOR.some(k => t.includes(k))) return 'revendedor'
  if (p.seq_estado === 'dormido') {
    if ((p.seq_reintentos || 0) >= 1) return 'ya tuvo reintento'
    if (!p.seq_reintento_at || p.seq_reintento_at > hoy) return 'dormido sin reintento vigente'
  }
  return null
}

function candidatos() {
  const { fecha: hoy } = ahoraSantiago()
  const filas = db.prepare(`
    SELECT id, empresa, segmento, rubro, rubro_especialidad, nombre_contacto, cargo, email, celular,
           telefono_contacto, telefono_empresa, region, comuna, ciudad, prioridad, notas, seq_estado,
           seq_reintento_at, seq_reintentos, fecha_creacion
    FROM pipeline_contactos
    WHERE estado = 'activo'
      AND ((etapa = 'prospecto' AND (seq_estado IS NULL OR seq_estado = 'frio'))
        OR (seq_estado = 'dormido' AND com_estado IS NULL))
  `).all()
  const recientes = new Set(db.prepare(`
    SELECT DISTINCT prospecto_id FROM prospecto_bitacora
    WHERE tipo IN ('email','whatsapp','llamada','visita') AND created_at >= datetime('now','-60 days')
  `).all().map(r => r.prospecto_id))
  const porSegmento = Object.fromEntries(SEGMENTOS.map(s => [s, []]))
  const descartes = {}
  for (const p of filas) {
    let m = motivoExclusion(p, hoy)
    if (!m && p.seq_estado !== 'dormido' && recientes.has(p.id)) m = 'contactado en los últimos 60 días'
    if (m) { descartes[m] = (descartes[m] || 0) + 1; continue }
    porSegmento[p.segmento].push(p)
  }
  const prio = { alta: 0, media: 1, baja: 2 }
  for (const s of SEGMENTOS) porSegmento[s].sort((a, b) =>
    (prio[a.prioridad] ?? 3) - (prio[b.prioridad] ?? 3) ||
    (CORREOS_PERSONALES.test(a.email) ? 1 : 0) - (CORREOS_PERSONALES.test(b.email) ? 1 : 0) ||
    String(a.fecha_creacion || '').localeCompare(String(b.fecha_creacion || '')))
  return { porSegmento, descartes, revisados: filas.length }
}

/** Lote del día: reparte en rotación entre los segmentos activos y validados. */
function seleccionarLote(n) {
  const config = getConfig()
  const { porSegmento, descartes, revisados } = candidatos()
  const validados = new Set(mensajes().filter(m => m.validado_at && m.activo).map(m => m.segmento))
  const activos = segmentosActivos(config)
  const colas = activos.filter(s => validados.has(s)).map(s => [...porSegmento[s]])
  const lote = []
  while (lote.length < n && colas.some(c => c.length)) {
    for (const c of colas) { if (c.length && lote.length < n) lote.push(c.shift()) }
  }
  return {
    lote, disponibles: Object.fromEntries(SEGMENTOS.map(s => [s, porSegmento[s].length])),
    total_disponibles: activos.reduce((a, s) => a + porSegmento[s].length, 0),
    descartes, revisados, segmentos_sin_validar: activos.filter(s => !validados.has(s)),
  }
}

// ─── Correo D0 ───────────────────────────────────────────────────────────────
function tokenDe(p) {
  if (!p.id) return 'prueba'
  const fila = db.prepare('SELECT seq_token FROM pipeline_contactos WHERE id = ?').get(p.id)
  if (fila?.seq_token) return fila.seq_token
  const t = crypto.randomBytes(12).toString('hex')
  db.prepare('UPDATE pipeline_contactos SET seq_token = ? WHERE id = ?').run(t, p.id)
  return t
}
const clickUrl = (token, url) => `${API}/api/prospeccion-auto/c/${token}?u=${encodeURIComponent(url)}`
const imagenUrl = (archivo) => !archivo ? null : /^https?:\/\//.test(archivo) ? archivo : `${FRONT}/prospeccion/${archivo}`

function armarCorreo(p, m, config, token) {
  const nombre = primerNombre(p.nombre_contacto)
  const empresa = titulo(p.empresa)
  const reemplazar = (s) => String(s || '').replace(/\{nombre\}/g, nombre || '').replace(/\{empresa\}/g, empresa)
  const saludo = nombre ? `Hola ${nombre}:` : `Hola, equipo de ${empresa}:`
  const asunto = reemplazar(nombre ? m.asunto : m.asunto_sin_nombre)
  const waLink = config.wa_numero_bot
    ? `https://wa.me/${config.wa_numero_bot}?text=${encodeURIComponent(`PLANTA - ${empresa}`)}` : null
  const p1 = reemplazar(m.parrafo1), p2 = reemplazar(m.parrafo2), p3 = reemplazar(m.parrafo3)
  const img = imagenUrl(m.imagen_correo)
  const firma = String(config.smtp_nombre || 'Abril Quiroga · RMG Parts').split('·')[0].trim()
  const P = (t) => t ? `<p style="margin:0 0 14px;line-height:1.55">${esc(t)}</p>` : ''
  const lista = m.fallas.map(f => `<li style="margin:0 0 6px">${esc(reemplazar(f))}</li>`).join('')
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9">
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a2233;font-size:15px">
 <div style="padding:28px 28px 8px">
  ${P(saludo)}
  ${P(p1)}
  ${lista ? `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${lista}</ul>` : ''}
 </div>
 ${img ? `<a href="${esc(clickUrl(token, img))}"><img src="${esc(img)}" alt="RMG Parts · Lubricantes Vistony" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a>` : ''}
 <div style="padding:20px 28px 8px">
  ${P(p2)}
  ${P(p3)}
  ${waLink ? `<p style="margin:4px 0 18px"><a href="${esc(clickUrl(token, waLink))}" style="display:inline-block;background:#1f9d55;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:6px">Escribir por WhatsApp</a></p>` : ''}
  <p style="margin:18px 0 4px;line-height:1.4"><strong>${esc(firma)}</strong><br>RMG Parts · Lubricantes Vistony para la industria<br>Av. Macul 3758, Macul, Santiago</p>
 </div>
 <div style="padding:14px 28px 24px;font-size:12px;color:#5c6577;border-top:1px solid #dee3ea">
  Si prefiere no recibir más correos de RMG Parts, puede <a href="${esc(`${API}/api/prospeccion-auto/baja/${token}`)}" style="color:#5c6577">darse de baja aquí</a>.
 </div>
 <img src="${esc(`${API}/api/prospeccion-auto/o/${token}.png`)}" width="1" height="1" alt="" style="display:block;border:0">
</div></body></html>`
  const texto = [saludo, '', p1, ...m.fallas.map(f => `• ${reemplazar(f)}`), '', p2, p3,
    waLink ? `WhatsApp: ${waLink}` : '', '', firma, 'RMG Parts · Lubricantes Vistony para la industria',
    'Av. Macul 3758, Macul, Santiago', '', `Darse de baja: ${API}/api/prospeccion-auto/baja/${token}`].join('\n')
  return { asunto, html, texto }
}

function ejemploDe(segmento) {
  const r = candidatos().porSegmento[segmento] || []
  return r[0] || {
    id: null, segmento, nombre_contacto: 'Juan Pérez',
    empresa: segmento === 'Construcción' ? 'CONSTRUCTORA EJEMPLO SPA' : segmento === 'Agrícola' ? 'AGRICOLA EJEMPLO LTDA' : 'INDUSTRIAS EJEMPLO SPA',
  }
}
/** Vista previa con los textos que se están editando (sin guardar). */
function previsualizar(segmento, borrador) {
  const base = mensajeDe(segmento)
  if (!base) throw new Error('Segmento no existe')
  const m = { ...base }
  for (const k of CAMPOS_MENSAJE) if (borrador?.[k] !== undefined) m[k] = k === 'fallas' ? listaFallas(borrador.fallas) : borrador[k]
  const p = ejemploDe(segmento)
  const { asunto, html } = armarCorreo(p, m, getConfig(), 'prueba')
  const nombre = primerNombre(p.nombre_contacto) || `equipo de ${titulo(p.empresa)}`
  return {
    asunto, html, empresa: p.empresa,
    whatsapp: {
      imagen: imagenUrl(m.imagen_wa),
      texto: `Hola ${nombre}, soy Abril de RMG Parts. Ayer le enviamos un correo sobre ${m.wa_falla}, una de las causas más comunes de detenciones no programadas en ${m.wa_rubro}.\n\n¿Le hago llegar la recomendación técnica para sus equipos? Es sin costo.`,
      botones: ['Sí, envíenmela', 'Ahora no', 'No volver a contactar'],
      texto2: `Hola ${nombre}, una pregunta rápida para no quitarle tiempo: ¿en su operación quién ve los lubricantes y la mantención de los equipos?\n\nCon ese dato le hacemos llegar la recomendación técnica a la persona correcta.`,
      botones2: ['Soy yo', 'Otra persona', 'No volver a contactar'],
    },
  }
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms))
const errorPermanente = (e) => {
  const c = Number(e.responseCode || 0)
  return (c >= 550 && c <= 554) || /user unknown|does not exist|mailbox unavailable|no such user|invalid recipient/i.test(e.message || '')
}

let corriendo = false

async function enviarCorreos({ forzar = false } = {}) {
  if (corriendo) return { ok: false, motivo: 'Ya hay un envío en curso' }
  const config = getConfig()
  if (!config.activo && !forzar) return { ok: false, motivo: 'Campaña pausada' }
  const rem = casilla(config)
  if (!rem.ok) { evento(null, 'correo_error', rem.motivo); return { ok: false, motivo: rem.motivo } }
  // Si el servidor de correo no responde, no se gasta el lote: se reintenta en el próximo ciclo (cada 5 min).
  try { await rem.transporter.verify() } catch (e) {
    const motivo = `Servidor de correo no responde: ${e.code || ''} ${e.message}`.trim()
    evento(null, 'correo_sin_conexion', motivo)
    return { ok: false, motivo, reintentar: true }
  }
  const { lote } = seleccionarLote(config.lote_diario || 20)
  const msgs = Object.fromEntries(mensajes().map(m => [m.segmento, m]))
  const { fecha: hoy } = ahoraSantiago()
  corriendo = true
  const res = { ok: true, enviados: 0, errores: 0, erroneos: 0, sin_mx: 0, total: lote.length }
  let fallasConexion = 0
  try {
    for (let i = 0; i < lote.length; i++) {
      if (!forzar && !getConfig().activo) { res.pausado = true; break }  // se pausó a mitad de envío
      const p = lote[i]
      // Dominio sin servidor de correo (ej. "constructotapetra.cl", ".conm"): no se envía —
      // un rebote más daña la reputación de la casilla— y se marca como dato erróneo.
      const sinMx = await dominioSinCorreo(p.email)
      if (sinMx) {
        db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'dato_erroneo', seq_lote = ?, seq_tema = ?, seq_segmento = ?,
            seq_correo_error = ?, fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(hoy, p.segmento, p.segmento, `Sin MX: ${sinMx}`, p.id)
        evento(p.id, 'correo_sin_mx', `${p.email} — ${sinMx}`)
        res.sin_mx++
        continue
      }
      const token = tokenDe(p)
      const { asunto, html, texto } = armarCorreo(p, msgs[p.segmento], config, token)
      try {
        await rem.transporter.sendMail({
          from: rem.from, replyTo: rem.replyTo, to: p.email.trim(), subject: asunto, html, text: texto,
          headers: { 'List-Unsubscribe': `<${API}/api/prospeccion-auto/baja/${token}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        })
        const wa = normalizarCelular(p.celular, p.telefono_contacto, p.telefono_empresa)
        db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'correo_enviado', seq_correo_at = datetime('now'),
            seq_lote = ?, seq_tema = ?, seq_segmento = ?, seq_wa_numero = ?, seq_wsp1_at = NULL, seq_wsp2_at = NULL,
            seq_wsp1_id = NULL, seq_wsp2_id = NULL, seq_wsp1_estado = NULL, seq_wsp2_estado = NULL, seq_dormido_at = NULL,
            seq_correo_error = NULL, seq_reintentos = COALESCE(seq_reintentos,0) + ?,
            etapa = CASE WHEN etapa = 'prospecto' THEN 'prospectado' ELSE etapa END,
            fecha_ultima_actualizacion = datetime('now') WHERE id = ?`)
          .run(hoy, p.segmento, p.segmento, wa, p.seq_estado === 'dormido' ? 1 : 0, p.id)
        bitacora(p.id, 'email', `[Automático] Para: ${p.email}\nAsunto: ${asunto}\n\n${texto}`, null)
        evento(p.id, 'correo_ok', asunto)
        res.enviados++
        fallasConexion = 0
      } catch (e) {
        const detalle = `${e.code || e.responseCode || ''} ${e.message}`.trim()
        if (errorPermanente(e)) {
          db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'dato_erroneo', seq_lote = ?, seq_tema = ?, seq_segmento = ?,
              seq_correo_error = ?, fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(hoy, p.segmento, p.segmento, detalle, p.id)
          res.erroneos++
        } else res.errores++
        evento(p.id, 'correo_error', detalle)
        if (errorConexion(e) && ++fallasConexion >= 3) {
          // El servidor dejó de responder a mitad del lote: se corta y se reintenta en el próximo ciclo.
          evento(null, 'correo_sin_conexion', `Corte tras 3 fallas de conexión seguidas (${detalle})`)
          res.cortado = true; res.reintentar = true
          break
        }
      }
      if (i < lote.length - 1) await esperar(PAUSA_MIN + Math.floor(Math.random() * PAUSA_MIN * 1.25))
    }
  } finally { corriendo = false }
  revisarSalud(hoy)
  return res
}

const errorConexion = (e) => ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKET', 'ECONNECTION', 'EDNS', 'EHOSTUNREACH'].includes(e.code)
  || /timeout|ECONN/i.test(e.message || '')
const mxCache = new Map()
/** Devuelve el motivo si el dominio del correo no puede recibir correo; null si sí puede o si no se pudo verificar. */
async function dominioSinCorreo(email) {
  if (process.env.PROSPECCION_VERIFICAR_MX === '0') return null
  const dominio = String(email || '').trim().split('@')[1]?.toLowerCase()
  if (!dominio) return 'correo sin dominio'
  if (mxCache.has(dominio)) return mxCache.get(dominio)
  let motivo = null
  try {
    const mx = await dns.resolveMx(dominio)
    if (!mx.length) motivo = 'el dominio no tiene servidor de correo'
  } catch (e) {
    if (['ENOTFOUND', 'ENODATA', 'ENONAME'].includes(e.code)) {
      // Sin MX puede igual recibir por el registro A (RFC 5321); solo se descarta si tampoco existe.
      try { await dns.resolve4(dominio) } catch (e2) { if (['ENOTFOUND', 'ENODATA', 'ENONAME'].includes(e2.code)) motivo = 'el dominio no existe' }
    }
    // Otros errores de DNS (timeout): no se descarta al prospecto por una falla nuestra.
  }
  mxCache.set(dominio, motivo)
  return motivo
}

async function enviarPrueba(segmento, usuario) {
  if (!esDueno(usuario) && !['gerente', 'administrador'].includes(usuario?.rol)) throw new Error('Sin permiso')
  const config = getConfig()
  const out = {}
  const m = mensajeDe(segmento || 'Industria')
  if (!m) throw new Error('Segmento no existe')
  const p = ejemploDe(m.segmento)
  if (config.test_email) {
    const rem = casilla(config)
    if (!rem.ok) out.correo = { ok: false, motivo: rem.motivo }
    else {
      const { asunto, html, texto } = armarCorreo(p, m, config, 'prueba')
      try {
        await rem.transporter.sendMail({ from: rem.from, replyTo: rem.replyTo, to: config.test_email, subject: `[PRUEBA] ${asunto}`, html, text: texto })
        out.correo = { ok: true, a: config.test_email, basado_en: p.empresa }
      } catch (e) { out.correo = { ok: false, motivo: `${e.code || ''} ${e.message}` } }
    }
  } else out.correo = { ok: false, motivo: 'Falta el correo de prueba en Configuración' }
  if (config.test_celular) {
    try { out.whatsapp = { ok: true, a: config.test_celular, id: await enviarPlantilla(config.test_celular, 1, p, m) } }
    catch (e) { out.whatsapp = { ok: false, motivo: e.message } }
  } else out.whatsapp = { ok: false, motivo: 'Falta el celular de prueba en Configuración' }
  return out
}

// ─── WhatsApp D1 / D2 ────────────────────────────────────────────────────────
async function enviarPlantilla(numero, paso, p, m) {
  if (!waConfigurado()) throw new Error('Faltan PROSPECCION_WA_PHONE_ID / PROSPECCION_WA_TOKEN en Render')
  const nombre = primerNombre(p.nombre_contacto) || `equipo de ${titulo(p.empresa)}`
  const template = paso === 1
    ? { name: PLANTILLA_1, language: { code: 'es' }, components: [
        { type: 'header', parameters: [{ type: 'image', image: { link: imagenUrl(m.imagen_wa) } }] },
        { type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: m.wa_falla }, { type: 'text', text: m.wa_rubro }] },
      ] }
    : { name: PLANTILLA_2, language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }] }
  try {
    const r = await axios.post(`${WA_BASE}/${WA_VERSION}/${process.env.PROSPECCION_WA_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', to: numero, type: 'template', template },
      { headers: { Authorization: `Bearer ${process.env.PROSPECCION_WA_TOKEN}` }, timeout: 15000 })
    return r.data?.messages?.[0]?.id || null
  } catch (e) {
    const err = e.response?.data?.error
    const ex = new Error(err ? `${err.code} ${err.error_data?.details || err.message}` : e.message)
    ex.waCode = err?.code
    throw ex
  }
}

async function pasoWhatsapp(paso, { forzar = false } = {}) {
  const config = getConfig()
  if (!config.activo && !forzar) return { ok: false, motivo: 'Campaña pausada' }
  if (!config.wsp_activo) return { ok: false, motivo: 'WhatsApp apagado en Configuración' }
  if (!waConfigurado()) return { ok: false, motivo: 'Faltan PROSPECCION_WA_PHONE_ID / PROSPECCION_WA_TOKEN' }
  const { fecha: hoy } = ahoraSantiago()
  const filas = paso === 1
    ? db.prepare(`SELECT * FROM pipeline_contactos WHERE seq_estado = 'correo_enviado' AND seq_respuesta_at IS NULL
        AND estado = 'activo' AND com_estado IS NULL AND seq_lote < ? AND seq_lote >= ? AND seq_wa_numero IS NOT NULL`)
        .all(hoy, sumarDias(hoy, -4))
    : db.prepare(`SELECT * FROM pipeline_contactos WHERE seq_estado = 'wsp1_enviado' AND seq_respuesta_at IS NULL
        AND estado = 'activo' AND com_estado IS NULL AND date(seq_wsp1_at, '-4 hours') < ?`).all(hoy)
  const msgs = Object.fromEntries(mensajes().map(m => [m.segmento, m]))
  const res = { ok: true, enviados: 0, errores: 0, total: filas.length }
  const col = paso === 1 ? 'seq_wsp1' : 'seq_wsp2'
  for (const p of filas) {
    if (!forzar && !getConfig().activo) { res.pausado = true; break }
    const m = msgs[p.seq_segmento || p.segmento] || msgs.Industria
    try {
      const id = await enviarPlantilla(p.seq_wa_numero, paso, p, m)
      db.prepare(`UPDATE pipeline_contactos SET seq_estado = ?, ${col}_at = datetime('now'), ${col}_id = ?, ${col}_estado = 'enviado',
          fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(paso === 1 ? 'wsp1_enviado' : 'wsp2_enviado', id, p.id)
      bitacora(p.id, 'whatsapp', `[Automático] Plantilla ${paso === 1 ? PLANTILLA_1 : PLANTILLA_2} a +${p.seq_wa_numero}`, null)
      evento(p.id, paso === 1 ? 'wsp1_ok' : 'wsp2_ok', id)
      res.enviados++
    } catch (e) {
      evento(p.id, 'wsp_error', e.message)
      if ([131026, 131021].includes(e.waCode)) {
        db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'dato_erroneo', ${col}_estado = 'fallido',
            fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(p.id)
      }
      res.errores++
    }
    await esperar(Math.min(1500, PAUSA_MIN))
  }
  return res
}

/** Estado de entrega que reporta Meta (vía el bot): sent / delivered / read / failed. */
function registrarEstadoWa({ wamid, estado }) {
  const mapa = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' }
  const e = mapa[estado] || estado
  if (!wamid || !['enviado', 'entregado', 'leido', 'fallido'].includes(e)) return { ok: false, motivo: 'estado inválido' }
  const orden = { enviado: 1, entregado: 2, leido: 3, fallido: 4 }
  for (const n of [1, 2]) {
    const p = db.prepare(`SELECT id, seq_wsp${n}_estado est FROM pipeline_contactos WHERE seq_wsp${n}_id = ?`).get(wamid)
    if (p) {
      if ((orden[e] || 0) > (orden[p.est] || 0)) db.prepare(`UPDATE pipeline_contactos SET seq_wsp${n}_estado = ? WHERE id = ?`).run(e, p.id)
      if (e === 'fallido') evento(p.id, 'wsp_error', `Meta no pudo entregar el WhatsApp ${n}`)
      return { ok: true }
    }
  }
  return { ok: false, motivo: 'mensaje no encontrado' }
}

function pasoDormido({ forzar = false } = {}) {
  const config = getConfig()
  if (!config.activo && !forzar) return { ok: false, motivo: 'Campaña pausada' }
  const { fecha: hoy } = ahoraSantiago()
  const filas = db.prepare(`SELECT id FROM pipeline_contactos WHERE seq_estado = 'wsp2_enviado' AND seq_respuesta_at IS NULL
      AND com_estado IS NULL AND date(seq_wsp2_at, '-4 hours') < ?`).all(hoy)
  for (const p of filas) {
    db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'dormido', seq_dormido_at = datetime('now'), seq_reintento_at = ?,
        fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(sumarDias(hoy, 45), p.id)
    evento(p.id, 'dormido', null)
  }
  return { ok: true, dormidos: filas.length }
}

// ─── Activación (solo el dueño) ──────────────────────────────────────────────
function activar(usuario) {
  if (!esDueno(usuario)) throw new Error('Solo el dueño de la campaña puede activarla')
  const c = getConfig()
  const rem = casilla(c)
  if (!rem.ok) throw new Error(rem.motivo)
  if (!c.smtp_verificado_at) throw new Error('Prueba la casilla de envío antes de activar (Configuración → Probar casilla)')
  const activos = segmentosActivos(c)
  if (!activos.length) throw new Error('No hay segmentos activos')
  const sinValidar = activos.filter(s => !mensajeDe(s)?.validado_at)
  if (sinValidar.length) throw new Error(`Falta validar el mensaje de: ${sinValidar.join(', ')}`)
  db.prepare("UPDATE prospeccion_auto_config SET activo = 1, pausa_motivo = NULL, activado_por = ?, activado_at = datetime('now'), updated_at = datetime('now') WHERE id = 1").run(usuario.email)
  evento(null, 'activada', usuario.email)
  return configPublica()
}
function pausar(usuario, motivo) {
  if (!esDueno(usuario)) throw new Error('Solo el dueño de la campaña puede pausarla')
  db.prepare("UPDATE prospeccion_auto_config SET activo = 0, pausa_motivo = ?, updated_at = datetime('now') WHERE id = 1").run(motivo || `Pausada por ${usuario.email}`)
  evento(null, 'pausada', usuario.email)
  return configPublica()
}

// ─── Salud del canal ─────────────────────────────────────────────────────────
function revisarSalud(lote) {
  // Mira SOLO el lote indicado (el que se acaba de enviar o el del prospecto que se dio de baja).
  // Antes miraba siempre el último lote existente: un lote viejo con 3 correos mal escritos
  // volvía a pausar la campaña en cada envío, aunque se reactivara.
  try {
    if (!lote) return
    const r = db.prepare(`SELECT
        SUM(seq_correo_at IS NOT NULL OR (seq_estado = 'dato_erroneo' AND seq_correo_error IS NOT NULL AND seq_correo_error NOT LIKE 'Sin MX:%')) enviados,
        SUM(seq_estado = 'baja') bajas,
        SUM(seq_estado = 'dato_erroneo' AND seq_correo_error IS NOT NULL AND seq_correo_error NOT LIKE 'Sin MX:%') rebotes
      FROM pipeline_contactos WHERE seq_lote = ?`).get(lote)
    const n = r?.enviados || 0
    if (n < 20) return   // con lotes chicos 2 o 3 casos no dicen nada
    const motivo = (r.bajas / n > 0.05) ? `Bajas ${r.bajas}/${n} en el lote ${lote} (>5%)`
      : (r.rebotes / n > 0.10) ? `Rebotes ${r.rebotes}/${n} en el lote ${lote} (>10%): revisar la calidad de la base` : null
    if (motivo && getConfig().activo) {
      db.prepare("UPDATE prospeccion_auto_config SET activo = 0, pausa_motivo = ?, updated_at = datetime('now') WHERE id = 1").run(`Pausa automática: ${motivo}`)
      evento(null, 'pausa_automatica', motivo)
      console.warn('[PROSP-AUTO] ⛔ pausa automática:', motivo)
    }
  } catch (e) { console.error('[PROSP-AUTO] salud:', e.message) }
}

// ─── Respuestas ──────────────────────────────────────────────────────────────
async function notificar(p, texto, canal) {
  try {
    const config = getConfig()
    const rem = casilla(config)
    if (!rem.ok || !config.notificar_emails) return
    await rem.transporter.sendMail({
      from: rem.from, to: config.notificar_emails, subject: `Respondió ${titulo(p.empresa)} — llamar`,
      text: `${titulo(p.empresa)} (${p.seq_segmento || p.segmento || ''})\nContacto: ${p.nombre_contacto || '-'} ${p.cargo ? `(${p.cargo})` : ''}\nCelular: +${p.seq_wa_numero || ''}\nCorreo: ${p.email || '-'}\nCanal: ${canal}\nMensaje: ${texto}\n\nVer en el ERP: ${FRONT}/prospeccion-auto`,
    })
  } catch (e) { console.error('[PROSP-AUTO] notificar:', e.message) }
}

/** Evento entrante (reenviado por el webhook de Cata): { telefono, tipo: 'boton'|'texto', texto, nombre?, wamid? }
 *  o { tipo: 'estado', wamid, estado }. Responde rápido: el bot contesta en segundo plano. */
async function registrarRespuesta(body) {
  if (body.tipo === 'estado') return registrarEstadoWa(body)
  const { telefono, tipo, texto, wamid } = body
  const numero = normalizarCelular(telefono)
  if (!numero) return { ok: false, motivo: 'teléfono inválido' }
  if (bot.yaRecibido(wamid)) return { ok: true, accion: 'duplicado' }
  const t = String(texto || '').trim()
  const norm = sinTildes(t)
  const config = getConfig()
  const p = db.prepare('SELECT * FROM pipeline_contactos WHERE seq_wa_numero = ? ORDER BY seq_correo_at DESC LIMIT 1').get(numero)

  // Celular de pruebas de Configuración: conversa con el bot como si fuera un prospecto de Industria.
  if (!p) {
    if (config.test_celular && numero === config.test_celular) {
      const ej = { ...ejemploDe('Industria'), id: `prueba:${numero}`, seq_segmento: 'Industria' }
      bot.guardar(ej.id, 'cliente', t, { wamid, tipo })
      segundoPlano(() => bot.responder({ p: ej, m: mensajeDe('Industria'), numero }), 'prueba')
      return { ok: true, accion: 'prueba_bot' }
    }
    return { ok: false, motivo: 'no es un prospecto de la campaña' }
  }

  bot.guardar(p.id, 'cliente', t, { wamid, tipo })
  evento(p.id, tipo === 'boton' ? 'boton' : 'respuesta', t)
  bitacora(p.id, 'whatsapp', `[WhatsApp ${tipo === 'boton' ? 'botón' : 'cliente'}] ${t}`, null)
  db.prepare("UPDATE pipeline_contactos SET seq_ultimo_mensaje = ?, fecha_ultima_actualizacion = datetime('now') WHERE id = ?").run(t.slice(0, 500), p.id)

  if (norm.includes('NO VOLVER A CONTACTAR') || norm === 'BAJA') {
    db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'baja', estado = 'descartado', seq_respuesta_at = COALESCE(seq_respuesta_at, datetime('now')),
        fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(p.id)
    evento(p.id, 'baja', 'WhatsApp')
    revisarSalud(p.seq_lote)
    segundoPlano(() => responderFijo(p, numero, 'Entendido, no le volveremos a escribir. Que tenga un buen día.'), 'baja')
    return { ok: true, accion: 'baja', prospecto_id: p.id }
  }
  if (tipo === 'boton' && norm === 'AHORA NO') {
    db.prepare(`UPDATE pipeline_contactos SET com_estado = 'no_interesa', com_motivo = 'no_es_momento', com_actualizado_at = datetime('now'),
        seq_respuesta_at = COALESCE(seq_respuesta_at, datetime('now')), seq_canal_respuesta = 'wsp', seq_reintento_at = ?,
        fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(sumarDias(ahoraSantiago().fecha, 45), p.id)
    segundoPlano(() => responderFijo(p, numero, 'Entendido, gracias por avisarnos. Si más adelante necesita apoyo con la lubricación de sus equipos, nos escribe por aquí.'), 'ahora_no')
    return { ok: true, accion: 'no_es_momento', prospecto_id: p.id }
  }

  // Respondió: pasa (o vuelve) a "Para llamar" de Abril.
  const primeraVez = !p.com_estado || p.com_estado === 'no_interesa'
  db.prepare(`UPDATE pipeline_contactos SET com_estado = CASE WHEN com_estado IS NULL OR com_estado = 'no_interesa' THEN 'respondio_wsp' ELSE com_estado END,
      com_motivo = CASE WHEN com_estado = 'no_interesa' THEN NULL ELSE com_motivo END, com_actualizado_at = datetime('now'),
      seq_respuesta_at = COALESCE(seq_respuesta_at, datetime('now')), seq_canal_respuesta = COALESCE(seq_canal_respuesta, 'wsp'),
      fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(p.id)

  const botActivo = !!config.bot_activo && !!process.env.OPENAI_API_KEY
  segundoPlano(async () => {
    let r = null
    if (botActivo) {
      const fila = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(p.id)
      r = await bot.responder({ p: fila, m: mensajeDe(fila.seq_segmento || fila.segmento), numero })
      if (r?.respuesta) bitacora(p.id, 'whatsapp', `[Bot] ${r.respuesta}`, null)
    }
    // Aviso a Abril: la primera vez que responde, y cuando el bot detecta que pide cotización o llamado.
    const ahora = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(p.id)
    const hito = r && (r.pidio_cotizacion || r.quiere_llamada || r.horario)
    if (primeraVez || hito) {
      const detalle = [t, ahora.seq_resumen_bot ? `\nResumen del bot: ${ahora.seq_resumen_bot}` : ''].join('')
      await notificar({ ...ahora, seq_wa_numero: numero }, detalle,
        `WhatsApp (${tipo})${r?.pidio_cotizacion ? ' — PIDE COTIZACIÓN' : r?.quiere_llamada ? ' — QUIERE LLAMADO' : ''}`)
    }
  }, 'respuesta')
  return { ok: true, accion: 'respondio', prospecto_id: p.id, bot: botActivo }
}

function segundoPlano(fn, etiqueta) {
  setImmediate(() => Promise.resolve().then(fn).catch(e => {
    console.error(`[PROSP-BOT] ${etiqueta}:`, e.response?.data?.error?.message || e.message)
    evento(null, 'bot_error', `${etiqueta}: ${e.response?.data?.error?.message || e.message}`)
  }))
}
async function responderFijo(p, numero, texto) {
  if (!process.env.PROSPECCION_WA_PHONE_ID) return
  await bot.enviarTexto(numero, texto)
  bot.guardar(p.id, 'bot', texto)
}

/** Conversación de un prospecto (para el panel). */
function conversacion(id) {
  return bot.historial(id, 200)
}
/** Simulador del panel: conversa con el bot sin enviar nada. */
async function simularBot({ segmento, mensajes }) {
  const seg = SEGMENTOS.includes(segmento) ? segmento : 'Industria'
  const p = { ...ejemploDe(seg), id: 'simulador', seq_segmento: seg }
  const r = await bot.simular({ p, m: mensajeDe(seg), mensajes })
  return { ...r, empresa: p.empresa, contacto: p.nombre_contacto }
}

const COM_ESTADOS = ['respondio_correo', 'respondio_wsp', 'abril_llamo', 'coordinando_reunion', 'visita_agendada',
  'visita_realizada', 'pedido_tomado', 'cotizacion_enviada', 'no_interesa']
const MOTIVOS = ['tiene_proveedor', 'no_consume', 'no_es_momento', 'otro']

function cambiarComEstado(id, { com_estado, com_motivo, visita_fecha, nota }, usuario) {
  if (!COM_ESTADOS.includes(com_estado)) throw new Error(`estado inválido: ${com_estado}`)
  if (com_estado === 'no_interesa' && !MOTIVOS.includes(com_motivo)) throw new Error('falta motivo')
  const p = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(id)
  if (!p) throw new Error('Prospecto no encontrado')
  const { fecha: hoy } = ahoraSantiago()
  db.prepare(`UPDATE pipeline_contactos SET com_estado = ?, com_motivo = ?, com_actualizado_at = datetime('now'),
      visita_fecha = COALESCE(?, visita_fecha),
      seq_respuesta_at = COALESCE(seq_respuesta_at, datetime('now')),
      seq_canal_respuesta = COALESCE(seq_canal_respuesta, ?),
      seq_reintento_at = CASE WHEN ? = 'no_es_momento' THEN ? ELSE seq_reintento_at END,
      fecha_ultima_actualizacion = datetime('now') WHERE id = ?`)
    .run(com_estado, com_estado === 'no_interesa' ? com_motivo : null, visita_fecha || null,
      com_estado === 'respondio_correo' ? 'correo' : null, com_motivo || '', sumarDias(hoy, 45), id)
  const etiqueta = { abril_llamo: 'llamada', visita_agendada: 'visita', visita_realizada: 'visita' }[com_estado] || 'nota'
  bitacora(id, etiqueta, `[Prospección automática] ${com_estado}${com_motivo ? ` (${com_motivo})` : ''}${visita_fecha ? ` — ${visita_fecha}` : ''}${nota ? `\n${nota}` : ''}`, usuario?.id)
  return db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(id)
}

// ─── Públicos: baja, apertura, click ─────────────────────────────────────────
function porToken(token) {
  if (!/^[a-f0-9]{24}$/.test(String(token || ''))) return null
  return db.prepare('SELECT id, seq_estado, estado, seq_lote FROM pipeline_contactos WHERE seq_token = ?').get(token)
}
function darDeBaja(token) {
  const p = porToken(token)
  if (!p) return false
  db.prepare("UPDATE pipeline_contactos SET seq_estado = 'baja', estado = 'descartado', fecha_ultima_actualizacion = datetime('now') WHERE id = ?").run(p.id)
  evento(p.id, 'baja', 'link del correo')
  revisarSalud(p.seq_lote)
  return true
}
function registrarApertura(token) { const p = porToken(token); if (p) evento(p.id, 'apertura', null) }
function registrarClick(token, url) {
  let destino = null
  try { const u = new URL(url); if (DOMINIOS_REDIRECCION.includes(u.hostname)) destino = u.toString() } catch (_) {}
  const p = porToken(token)
  if (p && destino) evento(p.id, 'click', destino)
  return destino
}

// ─── Orquestación ────────────────────────────────────────────────────────────
const PASOS = [
  { id: 'correo', hora: 'hora_correo', ult: 'ult_correo', fn: () => enviarCorreos() },
  { id: 'wsp1', hora: 'hora_wsp1', ult: 'ult_wsp1', fn: () => pasoWhatsapp(1) },
  { id: 'wsp2', hora: 'hora_wsp2', ult: 'ult_wsp2', fn: () => pasoWhatsapp(2) },
  { id: 'dormido', hora: 'hora_dormido', ult: 'ult_dormido', fn: () => pasoDormido() },
]
async function tick() {
  const { fecha, hm, dow } = ahoraSantiago()
  if (!getConfig().activo || !esHabil(dow)) return { ok: true, ejecutados: [] }
  const ejecutados = []
  for (const paso of PASOS) {
    const c = getConfig()
    if (!c.activo) break
    if (hm < (c[paso.hora] || '23:59') || c[paso.ult] === fecha) continue
    if (paso.id.startsWith('wsp') && (!c.wsp_activo || !waConfigurado())) continue
    db.prepare(`UPDATE prospeccion_auto_config SET ${paso.ult} = ? WHERE id = 1`).run(fecha)
    try {
      const r = await paso.fn()
      // Servidor de correo caído: se libera el paso para reintentarlo en el próximo ciclo (cada 5 min, hasta las 13:59).
      if (r?.reintentar) db.prepare(`UPDATE prospeccion_auto_config SET ${paso.ult} = NULL WHERE id = 1`).run()
      evento(null, `paso_${paso.id}`, JSON.stringify(r))
      ejecutados.push({ paso: paso.id, ...r })
    } catch (e) {
      evento(null, `paso_${paso.id}_error`, e.message)
      ejecutados.push({ paso: paso.id, ok: false, motivo: e.message })
    }
  }
  return { ok: true, ejecutados }
}
async function ejecutarPaso(paso, usuario) {
  if (!esDueno(usuario)) throw new Error('Solo el dueño de la campaña puede ejecutar pasos a mano')
  if (paso === 'correo') return enviarCorreos({ forzar: true })
  if (paso === 'wsp1') return pasoWhatsapp(1, { forzar: true })
  if (paso === 'wsp2') return pasoWhatsapp(2, { forzar: true })
  if (paso === 'dormido') return pasoDormido({ forzar: true })
  throw new Error('paso inválido')
}

// ─── Reportes (modelo Campañas de Cruzeiro) ──────────────────────────────────
const FILTROS = {
  pendientes: "seq_estado = 'correo_enviado' AND seq_wsp1_at IS NULL AND com_estado IS NULL",
  correo: 'seq_correo_at IS NOT NULL',
  rebote: "seq_estado = 'dato_erroneo' AND seq_correo_error IS NOT NULL",
  wsp1: 'seq_wsp1_at IS NOT NULL',
  wsp1_entregado: "seq_wsp1_estado IN ('entregado','leido')",
  wsp1_leido: "seq_wsp1_estado = 'leido'",
  wsp2: 'seq_wsp2_at IS NOT NULL',
  contestados: "com_estado IS NOT NULL AND com_estado <> 'no_interesa'",
  llamar: "com_estado IN ('respondio_wsp','respondio_correo')",
  no_interesa: "com_estado = 'no_interesa'",
  bajas: "seq_estado = 'baja'",
  sin_respuesta: "seq_estado = 'dormido'",
  fallidos: "seq_estado = 'dato_erroneo'",
  todos: '1 = 1',
}
function stats() {
  const config = configPublica()
  const tarjetas = {}
  for (const [k, w] of Object.entries(FILTROS)) tarjetas[k] = db.prepare(`SELECT COUNT(*) n FROM pipeline_contactos WHERE seq_lote IS NOT NULL AND (${w})`).get().n
  let sel = null
  try { sel = seleccionarLote(config.lote_diario || 20) } catch (_) {}
  tarjetas.base = sel?.total_disponibles ?? null
  const ev = Object.fromEntries(db.prepare(`SELECT tipo, COUNT(DISTINCT prospecto_id) n FROM prospeccion_auto_eventos
      WHERE tipo IN ('apertura','click') GROUP BY tipo`).all().map(r => [r.tipo, r.n]))
  const lotes = db.prepare(`SELECT seq_lote lote, GROUP_CONCAT(DISTINCT seq_segmento) segmentos, COUNT(*) total,
      SUM(seq_correo_at IS NOT NULL) correos, SUM(seq_wsp1_at IS NOT NULL) wsp1, SUM(seq_wsp1_estado IN ('entregado','leido')) wsp1_entregados,
      SUM(seq_wsp1_estado = 'leido') wsp1_leidos, SUM(seq_wsp2_at IS NOT NULL) wsp2,
      SUM(com_estado IS NOT NULL AND com_estado <> 'no_interesa') contestados, SUM(seq_estado = 'baja') bajas,
      SUM(seq_estado = 'dato_erroneo') fallidos, SUM(seq_estado = 'dormido') dormidos,
      SUM(seq_estado = 'correo_enviado' AND seq_wsp1_at IS NULL AND com_estado IS NULL) pendientes_wsp,
      SUM(com_estado IN ('visita_agendada','visita_realizada')) visitas, SUM(com_estado IN ('pedido_tomado','cotizacion_enviada')) pedidos
      FROM pipeline_contactos WHERE seq_lote IS NOT NULL GROUP BY seq_lote ORDER BY seq_lote DESC LIMIT 60`).all()
  const atrasados = db.prepare("SELECT COUNT(*) n FROM pipeline_contactos WHERE seq_estado = 'correo_enviado' AND seq_lote < ?")
    .get(sumarDias(ahoraSantiago().fecha, -4)).n
  const ultimos = db.prepare(`SELECT e.tipo, e.detalle, e.created_at, p.empresa FROM prospeccion_auto_eventos e
      LEFT JOIN pipeline_contactos p ON p.id = e.prospecto_id ORDER BY e.created_at DESC LIMIT 40`).all()
  const cfg = getConfig()
  const rem = casilla(cfg)
  return {
    config, tarjetas, aperturas: ev.apertura || 0, clicks: ev.click || 0,
    disponibles: sel?.disponibles || {}, descartes: sel?.descartes || {}, revisados: sel?.revisados || 0,
    lote_hoy: sel?.lote?.length || 0, segmentos_sin_validar: sel?.segmentos_sin_validar || [],
    casilla: { ok: rem.ok, motivo: rem.motivo || null, email: cfg.smtp_email, verificada: !!cfg.smtp_verificado_at },
    wa_configurado: waConfigurado(), envio_en_curso: corriendo,
    bot: { activo: !!cfg.bot_activo, openai: !!process.env.OPENAI_API_KEY, modelo: bot.MODELO, fichas: bot.CONOCIMIENTO.fichas, productos: bot.CONOCIMIENTO.productos }, lotes, atrasados, ultimos,
    mensajes: mensajes().map(m => ({ segmento: m.segmento, nombre: m.nombre, validado_at: m.validado_at, validado_por: m.validado_por })),
    hoy: ahoraSantiago(),
  }
}
function detalle({ filtro, lote, segmento } = {}) {
  const where = ['seq_lote IS NOT NULL', `(${FILTROS[filtro] || '1 = 1'})`]
  const params = []
  if (lote) { where.push('seq_lote = ?'); params.push(lote) }
  if (segmento) { where.push('seq_segmento = ?'); params.push(segmento) }
  return db.prepare(`SELECT id, empresa, nombre_contacto, cargo, email, seq_wa_numero, seq_segmento, seq_lote, seq_estado,
      seq_correo_at, seq_correo_error, seq_wsp1_at, seq_wsp1_estado, seq_wsp2_at, seq_wsp2_estado, seq_respuesta_at,
      seq_canal_respuesta, seq_ultimo_mensaje, seq_resumen_bot, seq_bot_pidio_cotizacion, seq_bot_quiere_llamada, com_estado, com_motivo, visita_fecha, comuna
    FROM pipeline_contactos WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(seq_respuesta_at, seq_wsp2_at, seq_wsp1_at, seq_correo_at) DESC LIMIT 500`).all(...params)
}
function previewLote() {
  const c = getConfig()
  const r = seleccionarLote(c.lote_diario || 20)
  return {
    ...r,
    lote: r.lote.map(p => ({
      id: p.id, empresa: p.empresa, nombre_contacto: p.nombre_contacto, email: p.email, segmento: p.segmento,
      rubro: p.rubro || p.rubro_especialidad, prioridad: p.prioridad, comuna: p.comuna,
      celular: normalizarCelular(p.celular, p.telefono_contacto, p.telefono_empresa), reintento: p.seq_estado === 'dormido',
    })),
  }
}

module.exports = {
  getConfig, configPublica, setConfig, casilla, probarCasilla, mensajes, mensajeDe, guardarMensaje, validarMensaje,
  previsualizar, seleccionarLote, previewLote, candidatos, armarCorreo, enviarCorreos, enviarPrueba, pasoWhatsapp,
  pasoDormido, activar, pausar, tick, ejecutarPaso, registrarRespuesta, registrarEstadoWa, cambiarComEstado, darDeBaja,
  registrarApertura, registrarClick, revisarSalud, dominioSinCorreo, _setDns: (d) => { dns = d; mxCache.clear() }, stats, detalle, conversacion, simularBot, normalizarCelular, ahoraSantiago, esDueno, COM_ESTADOS, MOTIVOS, SEGMENTOS,
}
