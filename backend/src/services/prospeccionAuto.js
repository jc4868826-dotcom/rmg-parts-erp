/**
 * RMG Parts — Prospección automática (2026-10-13, pedido de JC)
 *
 * Secuencia por prospecto (días hábiles, hora Santiago):
 *   D0 hora_correo  correo desde la casilla de Abril (correoUsuario.remitenteDe)
 *   D1 hora_wsp1    plantilla WhatsApp rmgparts_seguimiento_correo_v1 (imagen + 3 botones)
 *   D2 hora_wsp2    plantilla rmgparts_pregunta_responsable_v1 (solo si no respondió)
 *   D3 hora_dormido pasa a dormido; reintento único a los 45 días
 *
 * Toda respuesta (botón, texto, correo marcado a mano) corta la secuencia y
 * deja al prospecto en la lista "Para llamar" de Abril (com_estado).
 *
 * Seguridad del canal: si en el último lote las bajas superan 5% o los datos
 * erróneos 3%, el sistema se apaga solo (activo=0) hasta que alguien revise.
 *
 * WhatsApp usa variables propias (PROSPECCION_WA_PHONE_ID / PROSPECCION_WA_TOKEN),
 * distintas de META_WHATSAPP_* (otro número). Sin ellas, o con wsp_activo=0,
 * los pasos WhatsApp se saltan y los prospectos esperan en correo_enviado.
 */
const crypto = require('crypto')
const axios = require('axios')
const { db, uuidv4 } = require('../../config/database')
const { remitenteDe } = require('./correoUsuario')
const TEMAS = require('./prospeccionTemas')

const FRONT = process.env.FRONTEND_URL || 'https://rmg-parts-frontend.onrender.com'
const API = process.env.API_PUBLIC_URL || 'https://rmg-parts-erp.onrender.com'
const WA_VERSION = process.env.PROSPECCION_WA_VERSION || 'v21.0'
const WA_BASE = process.env.PROSPECCION_WA_BASE || 'https://graph.facebook.com'
// Pausa entre correos: 20–45 s por defecto (no mandar en ráfaga desde una casilla nueva).
const PAUSA_MIN = Number(process.env.PROSPECCION_PAUSA_MS ?? 20000)
const DOMINIOS_REDIRECCION = ['wa.me', 'rmgautos.cl', 'www.rmgautos.cl', 'rmg-parts-frontend.onrender.com']
const CORREOS_PERSONALES = /@(gmail|hotmail|yahoo|outlook|live|icloud)\./i

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
const CAMPOS_CONFIG = ['activo', 'wsp_activo', 'lote_diario', 'hora_correo', 'hora_wsp1', 'hora_wsp2', 'hora_dormido',
  'usuario_remitente_id', 'tema_activo', 'wa_numero_bot', 'test_email', 'test_celular', 'notificar_emails', 'pausa_motivo']
function setConfig(cambios) {
  const campos = CAMPOS_CONFIG.filter(k => cambios[k] !== undefined)
  if (!campos.length) return getConfig()
  const valores = campos.map(k => {
    let v = cambios[k]
    if (k === 'activo' || k === 'wsp_activo') v = v ? 1 : 0
    if (k === 'lote_diario') v = Math.max(1, Math.min(100, Number(v) || 20))
    if (k === 'wa_numero_bot' || k === 'test_celular') v = v ? normalizarCelular(v) : null
    if (k === 'tema_activo' && !TEMAS[v]) throw new Error(`tema inválido: ${v}`)
    return v === '' ? null : v
  })
  if (cambios.activo) campos.push('pausa_motivo'), valores.push(null)
  db.prepare(`UPDATE prospeccion_auto_config SET ${campos.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = 1`)
    .run(...valores)
  return getConfig()
}
const waConfigurado = () => !!(process.env.PROSPECCION_WA_PHONE_ID && process.env.PROSPECCION_WA_TOKEN)

// ─── Temas ───────────────────────────────────────────────────────────────────
function textoBusqueda(p) {
  return sinTildes([p.empresa, p.rubro, p.rubro_especialidad, p.segmento, p.notas].filter(Boolean).join(' '))
}
function variante(tema, p) {
  const t = textoBusqueda(p)
  for (const v of tema.variantes || []) if (v.keywords.some(k => t.includes(k))) return { ...tema, ...v }
  return tema
}

// ─── Selección del lote ──────────────────────────────────────────────────────
const REVENDEDOR = ['REVENDEDOR', 'FERRETER', 'DISTRIBUID', 'COMERCIALIZ', 'REPUESTO', 'RETAIL', 'OUTLET']
const REGION_RM = /(^|\b)(RM|METROPOLITANA|SANTIAGO|R\.M\.?)(\b|$)/

function motivoExclusion(p, tema, hoy) {
  if (!emailValido(p.email)) return 'sin correo válido'
  if (!normalizarCelular(p.celular, p.telefono_contacto, p.telefono_empresa)) return 'sin celular'
  const reg = sinTildes(p.region)
  if (reg && !REGION_RM.test(reg)) return 'fuera de RM'
  const t = textoBusqueda(p)
  if (REVENDEDOR.some(k => t.includes(k))) return 'revendedor'
  if (!tema.keywords.some(k => t.includes(k))) return 'no calza con el tema'
  if (p.seq_estado === 'dormido') {
    if ((p.seq_reintentos || 0) >= 1) return 'ya tuvo reintento'
    if (!p.seq_reintento_at || p.seq_reintento_at > hoy) return 'dormido sin reintento vigente'
  }
  return null
}

function candidatos(temaId) {
  const tema = TEMAS[temaId]
  if (!tema) throw new Error(`Tema no definido: ${temaId}`)
  const { fecha: hoy } = ahoraSantiago()
  const filas = db.prepare(`
    SELECT id, empresa, segmento, rubro, rubro_especialidad, nombre_contacto, cargo, email, celular,
           telefono_contacto, telefono_empresa, region, comuna, prioridad, notas, seq_estado,
           seq_reintento_at, seq_reintentos, fecha_creacion
    FROM pipeline_contactos
    WHERE estado = 'activo'
      AND (
        (etapa = 'prospecto' AND (seq_estado IS NULL OR seq_estado = 'frio'))
        OR (seq_estado = 'dormido' AND com_estado IS NULL)
      )
  `).all()
  const recientes = new Set(db.prepare(`
    SELECT DISTINCT prospecto_id FROM prospecto_bitacora
    WHERE tipo IN ('email','whatsapp','llamada','visita') AND created_at >= datetime('now','-60 days')
  `).all().map(r => r.prospecto_id))
  const ok = []
  const descartes = {}
  for (const p of filas) {
    let m = motivoExclusion(p, tema, hoy)
    if (!m && p.seq_estado !== 'dormido' && recientes.has(p.id)) m = 'contactado en los últimos 60 días'
    if (m) { descartes[m] = (descartes[m] || 0) + 1; continue }
    ok.push(p)
  }
  const prio = { alta: 0, media: 1, baja: 2 }
  ok.sort((a, b) =>
    (prio[a.prioridad] ?? 3) - (prio[b.prioridad] ?? 3) ||
    (CORREOS_PERSONALES.test(a.email) ? 1 : 0) - (CORREOS_PERSONALES.test(b.email) ? 1 : 0) ||
    String(a.fecha_creacion || '').localeCompare(String(b.fecha_creacion || '')))
  return { tema, ok, descartes, total: filas.length }
}

function seleccionarLote(n, temaId) {
  const { ok, descartes, total } = candidatos(temaId)
  return { lote: ok.slice(0, n), disponibles: ok.length, descartes, revisados: total }
}

// ─── Correo D0 ───────────────────────────────────────────────────────────────
function tokenDe(p) {
  const fila = db.prepare('SELECT seq_token FROM pipeline_contactos WHERE id = ?').get(p.id)
  if (fila?.seq_token) return fila.seq_token
  const t = crypto.randomBytes(12).toString('hex')
  db.prepare('UPDATE pipeline_contactos SET seq_token = ? WHERE id = ?').run(t, p.id)
  return t
}
const clickUrl = (token, url) => `${API}/api/prospeccion-auto/c/${token}?u=${encodeURIComponent(url)}`

function armarCorreo(p, tema, config, token) {
  const v = variante(tema, p)
  const nombre = primerNombre(p.nombre_contacto)
  const empresa = titulo(p.empresa)
  const saludo = nombre ? `Hola ${nombre}:` : `Hola, equipo de ${empresa}:`
  const asunto = nombre
    ? v.asunto.replace('{nombre}', nombre)
    : v.asunto_sin_nombre.replace('{empresa}', empresa)
  const waLink = config.wa_numero_bot
    ? `https://wa.me/${config.wa_numero_bot}?text=${encodeURIComponent(`PLANTA - ${empresa}`)}` : null
  const parrafos = v.cuerpo.map(x => x.replace('{empresa}', empresa).replace('{rubro_texto}', v.rubro_plural))
  const lista = v.fallas.map(f => `<li style="margin:0 0 6px">${esc(f)}</li>`).join('')
  const P = (t) => `<p style="margin:0 0 14px;line-height:1.55">${esc(t)}</p>`
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9">
<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a2233;font-size:15px">
 <div style="padding:28px 28px 8px">
  ${P(saludo)}
  ${P(parrafos[0])}
  <ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${lista}</ul>
 </div>
 <a href="${esc(clickUrl(token, `${FRONT}/prospeccion/${v.imagen_correo_archivo}`))}"><img src="${esc(`${FRONT}/prospeccion/${v.imagen_correo_archivo}`)}" alt="${esc(v.alt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a>
 <div style="padding:20px 28px 8px">
  ${P(parrafos[1])}
  ${P(parrafos[2])}
  ${waLink ? `<p style="margin:4px 0 18px"><a href="${esc(clickUrl(token, waLink))}" style="display:inline-block;background:#1f9d55;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:6px">Escribir por WhatsApp</a></p>` : ''}
  <p style="margin:18px 0 4px;line-height:1.4"><strong>Abril Quiroga</strong><br>RMG Parts · Lubricantes Vistony para la industria<br>Av. Macul 3758, Macul, Santiago</p>
 </div>
 <div style="padding:14px 28px 24px;font-size:12px;color:#5c6577;border-top:1px solid #dee3ea">
  Si prefiere no recibir más correos de RMG Parts, puede <a href="${esc(`${API}/api/prospeccion-auto/baja/${token}`)}" style="color:#5c6577">darse de baja aquí</a>.
 </div>
 <img src="${esc(`${API}/api/prospeccion-auto/o/${token}.png`)}" width="1" height="1" alt="" style="display:block;border:0">
</div></body></html>`
  const texto = [saludo, '', parrafos[0], ...v.fallas.map(f => `• ${f}`), '', parrafos[1], parrafos[2],
    waLink ? `WhatsApp: ${waLink}` : '', '', 'Abril Quiroga', 'RMG Parts · Lubricantes Vistony para la industria',
    'Av. Macul 3758, Macul, Santiago', '', `Darse de baja: ${API}/api/prospeccion-auto/baja/${token}`].join('\n')
  return { asunto, html, texto, variante: v }
}

function remitenteConfigurado(config) {
  let uid = config.usuario_remitente_id
  if (!uid) {
    // Por defecto: la casilla de Abril.
    try {
      uid = db.prepare("SELECT id FROM usuarios WHERE lower(email) = 'aquiroga@rmgautos.cl' OR lower(smtp_email) = 'aquiroga@rmgautos.cl' LIMIT 1").get()?.id
      if (uid) db.prepare('UPDATE prospeccion_auto_config SET usuario_remitente_id = ? WHERE id = 1').run(uid)
    } catch (_) {}
  }
  if (!uid) return { ok: false, motivo: 'No hay usuario remitente: crea a Abril (aquiroga@rmgautos.cl) en Usuarios o elige uno en el panel' }
  const u = db.prepare('SELECT id, nombre, email FROM usuarios WHERE id = ?').get(uid)
  if (!u) return { ok: false, motivo: 'El usuario remitente no existe' }
  const r = remitenteDe(u)
  if (!r || !r.propio) return { ok: false, motivo: `La casilla de ${u.nombre || u.email} no está configurada en Usuarios (correo propio)` }
  return { ok: true, remitente: r, usuario: u }
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
  if (!config.activo && !forzar) return { ok: false, motivo: 'Sistema apagado' }
  const rem = remitenteConfigurado(config)
  if (!rem.ok) { evento(null, 'correo_error', rem.motivo); return { ok: false, motivo: rem.motivo } }
  const { lote } = seleccionarLote(config.lote_diario || 20, config.tema_activo)
  const tema = TEMAS[config.tema_activo]
  const { fecha: hoy } = ahoraSantiago()
  corriendo = true
  const res = { ok: true, enviados: 0, errores: 0, erroneos: 0, total: lote.length }
  try {
    for (let i = 0; i < lote.length; i++) {
      const p = lote[i]
      const token = tokenDe(p)
      const { asunto, html, texto } = armarCorreo(p, tema, config, token)
      try {
        await rem.remitente.transporter.sendMail({
          from: rem.remitente.from, replyTo: rem.remitente.replyTo, to: p.email.trim(),
          subject: asunto, html, text: texto,
          headers: { 'List-Unsubscribe': `<${API}/api/prospeccion-auto/baja/${token}>` },
        })
        const wa = normalizarCelular(p.celular, p.telefono_contacto, p.telefono_empresa)
        const reintento = p.seq_estado === 'dormido'
        db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'correo_enviado', seq_correo_at = datetime('now'),
            seq_lote = ?, seq_tema = ?, seq_wa_numero = ?, seq_wsp1_at = NULL, seq_wsp2_at = NULL, seq_dormido_at = NULL,
            seq_reintentos = COALESCE(seq_reintentos,0) + ?, etapa = CASE WHEN etapa = 'prospecto' THEN 'prospectado' ELSE etapa END,
            fecha_ultima_actualizacion = datetime('now') WHERE id = ?`)
          .run(hoy, config.tema_activo, wa, reintento ? 1 : 0, p.id)
        bitacora(p.id, 'email', `[Automático] Para: ${p.email}\nAsunto: ${asunto}\n\n${texto}`, rem.usuario.id)
        evento(p.id, 'correo_ok', asunto)
        res.enviados++
      } catch (e) {
        if (errorPermanente(e)) {
          db.prepare("UPDATE pipeline_contactos SET seq_estado = 'dato_erroneo', seq_lote = ?, seq_tema = ?, fecha_ultima_actualizacion = datetime('now') WHERE id = ?")
            .run(hoy, config.tema_activo, p.id)
          res.erroneos++
        } else res.errores++
        evento(p.id, 'correo_error', `${e.code || e.responseCode || ''} ${e.message}`)
      }
      if (i < lote.length - 1) await esperar(PAUSA_MIN + Math.floor(Math.random() * PAUSA_MIN * 1.25))
    }
  } finally { corriendo = false }
  revisarSalud(hoy)
  return res
}

async function enviarPrueba() {
  const config = getConfig()
  const out = {}
  const rem = remitenteConfigurado(config)
  const tema = TEMAS[config.tema_activo]
  const ejemplo = seleccionarLote(1, config.tema_activo).lote[0] ||
    { id: null, empresa: 'EMPRESA DE PRUEBA SPA', nombre_contacto: 'Juan Prueba', rubro: 'PLASTICOS' }
  if (config.test_email) {
    if (!rem.ok) out.correo = { ok: false, motivo: rem.motivo }
    else {
      const { asunto, html, texto } = armarCorreo(ejemplo, tema, config, 'prueba')
      try {
        await rem.remitente.transporter.sendMail({ from: rem.remitente.from, replyTo: rem.remitente.replyTo,
          to: config.test_email, subject: `[PRUEBA] ${asunto}`, html, text: texto })
        out.correo = { ok: true, a: config.test_email, basado_en: ejemplo.empresa }
      } catch (e) { out.correo = { ok: false, motivo: `${e.code || ''} ${e.message}` } }
    }
  } else out.correo = { ok: false, motivo: 'Falta correo de prueba en la configuración' }
  if (config.test_celular) {
    try {
      const r = await enviarPlantilla(config.test_celular, 1, ejemplo, tema)
      out.whatsapp = { ok: true, a: config.test_celular, id: r }
    } catch (e) { out.whatsapp = { ok: false, motivo: e.message } }
  } else out.whatsapp = { ok: false, motivo: 'Falta celular de prueba en la configuración' }
  return out
}

// ─── WhatsApp D1 / D2 ────────────────────────────────────────────────────────
async function enviarPlantilla(numero, paso, p, tema) {
  if (!waConfigurado()) throw new Error('Faltan PROSPECCION_WA_PHONE_ID / PROSPECCION_WA_TOKEN en Render')
  const v = variante(tema, p)
  const nombre = primerNombre(p.nombre_contacto) || `equipo de ${titulo(p.empresa)}`
  const template = paso === 1
    ? { name: tema.wa_plantilla_1, language: { code: 'es' }, components: [
        { type: 'header', parameters: [{ type: 'image', image: { link: `${FRONT}/prospeccion/${v.imagen_wa_archivo}` } }] },
        { type: 'body', parameters: [{ type: 'text', text: nombre }, { type: 'text', text: v.falla_wa }, { type: 'text', text: v.rubro_plural }] },
      ] }
    : { name: tema.wa_plantilla_2, language: { code: 'es' }, components: [
        { type: 'body', parameters: [{ type: 'text', text: nombre }] },
      ] }
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
  if (!config.activo && !forzar) return { ok: false, motivo: 'Sistema apagado' }
  if (!config.wsp_activo) return { ok: false, motivo: 'WhatsApp apagado en el panel' }
  if (!waConfigurado()) return { ok: false, motivo: 'Faltan PROSPECCION_WA_PHONE_ID / PROSPECCION_WA_TOKEN' }
  const { fecha: hoy } = ahoraSantiago()
  const filas = paso === 1
    ? db.prepare(`SELECT * FROM pipeline_contactos WHERE seq_estado = 'correo_enviado' AND seq_respuesta_at IS NULL
        AND estado = 'activo' AND com_estado IS NULL AND seq_lote < ? AND seq_lote >= ? AND seq_wa_numero IS NOT NULL`)
        .all(hoy, sumarDias(hoy, -4))
    : db.prepare(`SELECT * FROM pipeline_contactos WHERE seq_estado = 'wsp1_enviado' AND seq_respuesta_at IS NULL
        AND estado = 'activo' AND com_estado IS NULL AND date(seq_wsp1_at) < ?`).all(hoy)
  const res = { ok: true, enviados: 0, errores: 0, total: filas.length }
  for (const p of filas) {
    const tema = TEMAS[p.seq_tema] || TEMAS[config.tema_activo]
    try {
      const id = await enviarPlantilla(p.seq_wa_numero, paso, p, tema)
      db.prepare(`UPDATE pipeline_contactos SET seq_estado = ?, ${paso === 1 ? 'seq_wsp1_at' : 'seq_wsp2_at'} = datetime('now'),
          fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(paso === 1 ? 'wsp1_enviado' : 'wsp2_enviado', p.id)
      bitacora(p.id, 'whatsapp', `[Automático] Plantilla ${paso === 1 ? tema.wa_plantilla_1 : tema.wa_plantilla_2} a +${p.seq_wa_numero}`, config.usuario_remitente_id)
      evento(p.id, paso === 1 ? 'wsp1_ok' : 'wsp2_ok', id)
      res.enviados++
    } catch (e) {
      evento(p.id, 'wsp_error', e.message)
      if ([131026, 131021].includes(e.waCode)) {
        db.prepare("UPDATE pipeline_contactos SET seq_estado = 'dato_erroneo', fecha_ultima_actualizacion = datetime('now') WHERE id = ?").run(p.id)
      }
      res.errores++
    }
    await esperar(Math.min(1500, PAUSA_MIN))
  }
  revisarSalud(hoy)
  return res
}

function pasoDormido({ forzar = false } = {}) {
  const config = getConfig()
  if (!config.activo && !forzar) return { ok: false, motivo: 'Sistema apagado' }
  const { fecha: hoy } = ahoraSantiago()
  const filas = db.prepare(`SELECT id FROM pipeline_contactos WHERE seq_estado = 'wsp2_enviado' AND seq_respuesta_at IS NULL
      AND com_estado IS NULL AND date(seq_wsp2_at) < ?`).all(hoy)
  for (const p of filas) {
    db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'dormido', seq_dormido_at = datetime('now'), seq_reintento_at = ?,
        fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(sumarDias(hoy, 45), p.id)
    evento(p.id, 'dormido', null)
  }
  return { ok: true, dormidos: filas.length }
}

// ─── Salud del canal ─────────────────────────────────────────────────────────
function revisarSalud(hoy) {
  try {
    const lote = db.prepare("SELECT seq_lote FROM pipeline_contactos WHERE seq_lote IS NOT NULL ORDER BY seq_lote DESC LIMIT 1").get()?.seq_lote
    if (!lote) return
    const r = db.prepare(`SELECT COUNT(*) n, SUM(seq_estado='baja') bajas, SUM(seq_estado='dato_erroneo') err
      FROM pipeline_contactos WHERE seq_lote = ?`).get(lote)
    if (!r || r.n < 10) return
    const motivo = (r.bajas / r.n > 0.05) ? `Bajas ${r.bajas}/${r.n} en el lote ${lote} (>5%)`
      : (r.err / r.n > 0.03) ? `Datos erróneos ${r.err}/${r.n} en el lote ${lote} (>3%)` : null
    if (motivo && getConfig().activo) {
      db.prepare("UPDATE prospeccion_auto_config SET activo = 0, pausa_motivo = ?, updated_at = datetime('now') WHERE id = 1").run(motivo)
      evento(null, 'pausa_automatica', motivo)
      console.warn('[PROSP-AUTO] ⛔ pausa automática:', motivo)
    }
  } catch (e) { console.error('[PROSP-AUTO] salud:', e.message) }
}

// ─── Respuestas ──────────────────────────────────────────────────────────────
async function notificar(p, texto, canal) {
  try {
    const config = getConfig()
    const rem = remitenteConfigurado(config)
    if (!rem.ok || !config.notificar_emails) return
    await rem.remitente.transporter.sendMail({
      from: rem.remitente.from, to: config.notificar_emails,
      subject: `Respondió ${titulo(p.empresa)} — llamar`,
      text: `${titulo(p.empresa)}\nContacto: ${p.nombre_contacto || '-'} ${p.cargo ? `(${p.cargo})` : ''}\nCelular: +${p.seq_wa_numero || ''}\nCorreo: ${p.email || '-'}\nCanal: ${canal}\nMensaje: ${texto}\n\nVer en el ERP: ${FRONT}/prospeccion-auto`,
    })
  } catch (e) { console.error('[PROSP-AUTO] notificar:', e.message) }
}

/** Evento entrante (bot / webhook): { telefono, tipo: 'boton'|'texto', texto } */
async function registrarRespuesta({ telefono, tipo, texto }) {
  const numero = normalizarCelular(telefono)
  if (!numero) return { ok: false, motivo: 'teléfono inválido' }
  const p = db.prepare('SELECT * FROM pipeline_contactos WHERE seq_wa_numero = ? ORDER BY seq_correo_at DESC LIMIT 1').get(numero)
  if (!p) return { ok: false, motivo: 'no es un prospecto de la secuencia' }
  const t = String(texto || '').trim()
  const norm = sinTildes(t)
  evento(p.id, tipo === 'boton' ? 'boton' : 'respuesta', t)
  bitacora(p.id, 'whatsapp', `[Respuesta ${tipo}] ${t}`, null)
  db.prepare("UPDATE pipeline_contactos SET seq_ultimo_mensaje = ?, fecha_ultima_actualizacion = datetime('now') WHERE id = ?").run(t.slice(0, 500), p.id)

  if (norm.includes('NO VOLVER A CONTACTAR')) {
    db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'baja', estado = 'descartado', seq_respuesta_at = COALESCE(seq_respuesta_at, datetime('now')),
        fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(p.id)
    evento(p.id, 'baja', 'botón WhatsApp')
    revisarSalud(ahoraSantiago().fecha)
    return { ok: true, accion: 'baja', prospecto_id: p.id }
  }
  if (tipo === 'boton' && norm === 'AHORA NO') {
    db.prepare(`UPDATE pipeline_contactos SET com_estado = 'no_interesa', com_motivo = 'no_es_momento', com_actualizado_at = datetime('now'),
        seq_respuesta_at = COALESCE(seq_respuesta_at, datetime('now')), seq_canal_respuesta = 'wsp', seq_reintento_at = ?,
        fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(sumarDias(ahoraSantiago().fecha, 45), p.id)
    return { ok: true, accion: 'no_es_momento', prospecto_id: p.id }
  }
  const yaRespondio = !!p.com_estado
  db.prepare(`UPDATE pipeline_contactos SET com_estado = COALESCE(com_estado, 'respondio_wsp'), com_actualizado_at = datetime('now'),
      seq_respuesta_at = COALESCE(seq_respuesta_at, datetime('now')), seq_canal_respuesta = COALESCE(seq_canal_respuesta, 'wsp'),
      fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(p.id)
  if (!yaRespondio) await notificar({ ...p, seq_wa_numero: numero }, t, `WhatsApp (${tipo})`)
  return { ok: true, accion: 'respondio', prospecto_id: p.id }
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
  return db.prepare('SELECT id, seq_estado, estado FROM pipeline_contactos WHERE seq_token = ?').get(token)
}
function darDeBaja(token) {
  const p = porToken(token)
  if (!p) return false
  db.prepare(`UPDATE pipeline_contactos SET seq_estado = 'baja', estado = 'descartado', fecha_ultima_actualizacion = datetime('now') WHERE id = ?`).run(p.id)
  evento(p.id, 'baja', 'link del correo')
  revisarSalud(ahoraSantiago().fecha)
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
  const config = getConfig()
  const { fecha, hm, dow } = ahoraSantiago()
  if (!config.activo || !esHabil(dow)) return { ok: true, ejecutados: [] }
  const ejecutados = []
  for (const paso of PASOS) {
    const c = getConfig()
    if (hm < (c[paso.hora] || '23:59') || c[paso.ult] === fecha) continue
    if (paso.id.startsWith('wsp') && (!c.wsp_activo || !waConfigurado())) continue
    db.prepare(`UPDATE prospeccion_auto_config SET ${paso.ult} = ? WHERE id = 1`).run(fecha)
    try {
      const r = await paso.fn()
      evento(null, `paso_${paso.id}`, JSON.stringify(r))
      ejecutados.push({ paso: paso.id, ...r })
    } catch (e) {
      evento(null, `paso_${paso.id}_error`, e.message)
      ejecutados.push({ paso: paso.id, ok: false, motivo: e.message })
    }
  }
  return { ok: true, ejecutados }
}

async function ejecutarPaso(paso) {
  if (paso === 'correo') return enviarCorreos({ forzar: true })
  if (paso === 'wsp1') return pasoWhatsapp(1, { forzar: true })
  if (paso === 'wsp2') return pasoWhatsapp(2, { forzar: true })
  if (paso === 'dormido') return pasoDormido({ forzar: true })
  throw new Error('paso inválido')
}

// ─── Reportes ────────────────────────────────────────────────────────────────
function stats() {
  const config = getConfig()
  const seq = Object.fromEntries(db.prepare(`SELECT COALESCE(seq_estado,'frio') e, COUNT(*) n FROM pipeline_contactos
      WHERE seq_estado IS NOT NULL GROUP BY seq_estado`).all().map(r => [r.e, r.n]))
  const com = Object.fromEntries(db.prepare(`SELECT com_estado e, COUNT(*) n FROM pipeline_contactos
      WHERE com_estado IS NOT NULL AND seq_lote IS NOT NULL GROUP BY com_estado`).all().map(r => [r.e, r.n]))
  const ev = Object.fromEntries(db.prepare(`SELECT tipo, COUNT(DISTINCT prospecto_id) n FROM prospeccion_auto_eventos
      WHERE tipo IN ('apertura','click') GROUP BY tipo`).all().map(r => [r.tipo, r.n]))
  const lotes = db.prepare(`SELECT seq_lote lote, seq_tema tema, COUNT(*) total,
      SUM(seq_wsp1_at IS NOT NULL) wsp1, SUM(seq_wsp2_at IS NOT NULL) wsp2,
      SUM(com_estado IS NOT NULL AND com_estado <> 'no_interesa') respondieron,
      SUM(com_estado = 'no_interesa') no_interesa, SUM(seq_estado = 'baja') bajas,
      SUM(seq_estado = 'dato_erroneo') erroneos, SUM(seq_estado = 'dormido') dormidos,
      SUM(com_estado IN ('visita_agendada','visita_realizada')) visitas, SUM(com_estado IN ('pedido_tomado','cotizacion_enviada')) pedidos
      FROM pipeline_contactos WHERE seq_lote IS NOT NULL GROUP BY seq_lote, seq_tema ORDER BY seq_lote DESC LIMIT 30`).all()
  const atrasados = db.prepare(`SELECT COUNT(*) n FROM pipeline_contactos WHERE seq_estado = 'correo_enviado' AND seq_lote < ?`)
    .get(sumarDias(ahoraSantiago().fecha, -4)).n
  let disponibles = null, descartes = null
  try { const c = candidatos(config.tema_activo); disponibles = c.ok.length; descartes = c.descartes } catch (_) {}
  const rem = remitenteConfigurado(config)
  const ultimos = db.prepare(`SELECT e.tipo, e.detalle, e.created_at, p.empresa FROM prospeccion_auto_eventos e
      LEFT JOIN pipeline_contactos p ON p.id = e.prospecto_id ORDER BY e.created_at DESC LIMIT 40`).all()
  return {
    config: { ...config }, temas: Object.entries(TEMAS).map(([id, t]) => ({ id, nombre: t.nombre })),
    remitente: { ok: rem.ok, motivo: rem.motivo || null, usuario: rem.usuario || null },
    wa_configurado: waConfigurado(), envio_en_curso: corriendo,
    secuencia: seq, comercial: com, aperturas: ev.apertura || 0, clicks: ev.click || 0,
    disponibles, descartes, atrasados, lotes, ultimos, hoy: ahoraSantiago(),
  }
}

function paraLlamar() {
  return db.prepare(`SELECT id, empresa, nombre_contacto, cargo, email, seq_wa_numero, celular, comuna, seq_canal_respuesta,
      seq_respuesta_at, seq_ultimo_mensaje, com_estado, com_motivo, visita_fecha, seq_lote, seq_tema, responsable_visita
    FROM pipeline_contactos
    WHERE com_estado IS NOT NULL AND seq_lote IS NOT NULL
    ORDER BY CASE com_estado WHEN 'respondio_wsp' THEN 0 WHEN 'respondio_correo' THEN 0 WHEN 'abril_llamo' THEN 1
      WHEN 'coordinando_reunion' THEN 2 WHEN 'visita_agendada' THEN 3 WHEN 'pedido_tomado' THEN 4 ELSE 5 END,
      seq_respuesta_at ASC LIMIT 300`).all()
}

function enSecuencia() {
  return db.prepare(`SELECT id, empresa, nombre_contacto, email, seq_wa_numero, seq_estado, seq_lote, seq_tema,
      seq_correo_at, seq_wsp1_at, seq_wsp2_at, com_estado FROM pipeline_contactos
    WHERE seq_estado IN ('correo_enviado','wsp1_enviado','wsp2_enviado') AND com_estado IS NULL
    ORDER BY seq_lote DESC, empresa LIMIT 300`).all()
}

module.exports = {
  getConfig, setConfig, seleccionarLote, candidatos, armarCorreo, enviarCorreos, enviarPrueba, pasoWhatsapp,
  pasoDormido, tick, ejecutarPaso, registrarRespuesta, cambiarComEstado, darDeBaja, registrarApertura,
  registrarClick, stats, paraLlamar, enSecuencia, normalizarCelular, ahoraSantiago, COM_ESTADOS, MOTIVOS,
}
