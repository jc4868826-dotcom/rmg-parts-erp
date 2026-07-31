const router = require('express').Router()
const { db, uuidv4 } = require('../../config/database')
const { authenticate } = require('../middleware/auth')
const https = require('https')
const { RMG_KNOWLEDGE } = require('../knowledge/rmg_productos_knowledge')

// GET /api/campanas
router.get('/', authenticate, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM campanas ORDER BY fecha_creacion DESC').all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/campanas
router.post('/', authenticate, (req, res) => {
  try {
    const { nombre, tipo, segmento, rubro, canal, mensaje_editado, estado, creado_por } = req.body
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' })
    const id = uuidv4()
    db.prepare(`INSERT INTO campanas (id,nombre,tipo,segmento,rubro,canal,mensaje_editado,estado,creado_por)
      VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(id, nombre, tipo || 'prospección', segmento || null, rubro || null,
          canal || 'whatsapp', mensaje_editado || null, estado || 'borrador', creado_por || null)
    res.status(201).json(db.prepare('SELECT * FROM campanas WHERE id = ?').get(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/campanas/:id
router.put('/:id', authenticate, (req, res) => {
  try {
    const c = db.prepare('SELECT * FROM campanas WHERE id = ?').get(req.params.id)
    if (!c) return res.status(404).json({ error: 'Campaña no encontrada' })
    const fields = Object.keys(req.body).filter(k => k !== 'id')
    if (!fields.length) return res.json(c)
    const set = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE campanas SET ${set} WHERE id = ?`).run(...fields.map(f => req.body[f]), req.params.id)
    res.json(db.prepare('SELECT * FROM campanas WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/campanas/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    db.prepare('DELETE FROM campanas WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/campanas/:id/lanzar — envía emails a todos los prospectos con campana_estado = 'Sin enviar'
router.post('/:id/lanzar', authenticate, async (req, res) => {
  try {
    const campana = db.prepare('SELECT * FROM campanas WHERE id = ?').get(req.params.id)
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' })

    const prospectos = db.prepare(
      "SELECT * FROM pipeline_contactos WHERE campana_id = ? AND (campana_estado IS NULL OR campana_estado = 'Sin enviar')"
    ).all(req.params.id)

    if (!prospectos.length) {
      return res.json({ enviados: 0, errores: [], mensaje: 'No hay prospectos pendientes de envío' })
    }

    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host: 'mail.rmgautos.cl',
      port: 465,
      secure: true,
      auth: {
        user: 'juancarlos.contreras@rmgautos.cl',
        pass: process.env.SMTP_PASS,
      },
    })

    let enviados = 0
    const errores = []

    for (const p of prospectos) {
      if (!p.email) {
        errores.push({ empresa: p.empresa, error: 'Sin email registrado' })
        continue
      }
      try {
        const mensajeBase = campana.mensaje_editado || campana.mensaje_generado || ''
        const mensajePersonalizado = mensajeBase
          .replace(/\{\{empresa\}\}/g, p.empresa || '')
          .replace(/\{\{nombre\}\}/g,  p.nombre   || p.empresa || '')
          .replace(/\{\{rubro\}\}/g,   p.rubro    || '')
        const textoFinal = campana.firma
          ? mensajePersonalizado + '\n\n' + campana.firma
          : mensajePersonalizado
        const htmlBody = textoFinal
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')
        const pixelUrl = `https://rmg-parts-erp.onrender.com/api/track/open/${campana.id}/${p.id}`
        const htmlFinal = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;">${htmlBody}</div><img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`
        await transporter.sendMail({
          from: '"RMG Parts" <juancarlos.contreras@rmgautos.cl>',
          to: p.email,
          subject: campana.asunto || campana.nombre,
          text: textoFinal,
          html: htmlFinal,
        })
        db.prepare("UPDATE pipeline_contactos SET campana_estado = 'Enviado', campana_enviado_at = datetime('now') WHERE id = ?").run(p.id)
        enviados++
      } catch (e) {
        errores.push({ empresa: p.empresa, error: e.message })
      }
    }

    db.prepare("UPDATE campanas SET enviados = enviados + ?, estado = 'activa' WHERE id = ?").run(enviados, req.params.id)

    res.json({ ok: true, enviados, errores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/campanas/:id/resumen
router.get('/:id/resumen', authenticate, (req, res) => {
  try {
    const campana = db.prepare('SELECT * FROM campanas WHERE id = ?').get(req.params.id)
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' })

    const prospectos = db.prepare(
      'SELECT id, empresa, nombre, email, rubro, campana_estado, email_abierto, fecha_apertura, veces_abierto FROM pipeline_contactos WHERE campana_id = ?'
    ).all(req.params.id)

    const total_enviados  = prospectos.filter(p => p.campana_estado && p.campana_estado !== 'Sin enviar').length
    const total_abiertos  = prospectos.filter(p => p.email_abierto).length
    const total_respondidos = prospectos.filter(p => p.campana_estado === 'Respondió' || p.campana_estado === 'respondio').length

    const tasa_apertura  = total_enviados > 0 ? Math.round((total_abiertos  / total_enviados) * 100) : 0
    const tasa_respuesta = total_enviados > 0 ? Math.round((total_respondidos / total_enviados) * 100) : 0

    const ORDEN_ESTADO = { 'Abrió': 0, 'Respondió': 1, 'respondio': 1, 'sin_respuesta': 2, 'Sin respuesta': 2, 'Enviado': 3, 'Sin enviar': 4 }
    const ordenados = [...prospectos].sort((a, b) => {
      const oa = ORDEN_ESTADO[a.campana_estado] ?? 5
      const ob = ORDEN_ESTADO[b.campana_estado] ?? 5
      return oa - ob
    }).map(p => ({
      id:             p.id,
      empresa:        p.empresa,
      nombre:         p.nombre,
      email:          p.email,
      rubro:          p.rubro,
      estado_lead:    p.campana_estado || 'Sin enviar',
      email_abierto:  p.email_abierto || 0,
      fecha_apertura: p.fecha_apertura || null,
      veces_abierto:  p.veces_abierto || 0,
    }))

    res.json({
      id: campana.id, nombre: campana.nombre, estado: campana.estado,
      segmento: campana.segmento, rubro: campana.rubro, canal: campana.canal,
      total_enviados, total_abiertos, total_respondidos,
      tasa_apertura, tasa_respuesta,
      prospectos: ordenados,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/campanas/:id/prospecto/:pid/estado — cambio rápido de estado
router.patch('/:id/prospecto/:pid/estado', authenticate, (req, res) => {
  try {
    const { estado } = req.body
    if (!estado) return res.status(400).json({ error: 'estado requerido' })
    db.prepare("UPDATE pipeline_contactos SET campana_estado = ? WHERE id = ? AND campana_id = ?")
      .run(estado, req.params.pid, req.params.id)
    if (estado === 'Respondió' || estado === 'respondio') {
      const total_respondidos = db.prepare(
        "SELECT COUNT(*) as n FROM pipeline_contactos WHERE campana_id = ? AND (campana_estado = 'Respondió' OR campana_estado = 'respondio')"
      ).get(req.params.id)?.n || 0
      db.prepare('UPDATE campanas SET respondidos = ? WHERE id = ?').run(total_respondidos, req.params.id)
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/campanas/:id/prospecto/:pid/reenviar — reenvía email a un prospecto
router.post('/:id/prospecto/:pid/reenviar', authenticate, async (req, res) => {
  try {
    const campana = db.prepare('SELECT * FROM campanas WHERE id = ?').get(req.params.id)
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' })
    const p = db.prepare('SELECT * FROM pipeline_contactos WHERE id = ? AND campana_id = ?').get(req.params.pid, req.params.id)
    if (!p) return res.status(404).json({ error: 'Prospecto no encontrado' })
    if (!p.email) return res.status(400).json({ error: 'Prospecto sin email' })

    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host: 'mail.rmgautos.cl', port: 465, secure: true,
      auth: { user: 'juancarlos.contreras@rmgautos.cl', pass: process.env.SMTP_PASS },
    })
    const mensajeBase = campana.mensaje_editado || campana.mensaje_generado || ''
    const mensajePersonalizado = mensajeBase
      .replace(/\{\{empresa\}\}/g, p.empresa || '')
      .replace(/\{\{nombre\}\}/g,  p.nombre   || p.empresa || '')
      .replace(/\{\{rubro\}\}/g,   p.rubro    || '')
    const textoFinal = campana.firma ? mensajePersonalizado + '\n\n' + campana.firma : mensajePersonalizado
    const htmlBody = textoFinal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
    const pixelUrl = `https://rmg-parts-erp.onrender.com/api/track/open/${campana.id}/${p.id}`
    const htmlFinal = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;">${htmlBody}</div><img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`

    await transporter.sendMail({
      from: '"RMG Parts" <juancarlos.contreras@rmgautos.cl>',
      to: p.email, subject: campana.asunto || campana.nombre,
      text: textoFinal, html: htmlFinal,
    })
    db.prepare("UPDATE pipeline_contactos SET campana_estado = 'Enviado', campana_enviado_at = datetime('now') WHERE id = ?").run(p.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/campanas/generar — genera mensaje con IA (sin guardar)
router.post('/generar', authenticate, async (req, res) => {
  try {
    const { segmento = '', rubro = '', canal = 'whatsapp', tipo_campana = 'prospección', contexto_adicional = '' } = req.body
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY no configurada' })

    const guion = RMG_KNOWLEDGE.guiones_por_rubro[rubro.toUpperCase()] || ''
    const segData = RMG_KNOWLEDGE.por_segmento[segmento] || {}
    const productosStr = (segData.productos_clave || []).join(', ')

    const systemPrompt = `Eres ZARA, asistente de ventas de RMG Auto Parts Chile.
${RMG_KNOWLEDGE.empresa}

Guión base para rubro ${rubro}:
${guion}

Productos clave para ${segmento}: ${productosStr}
Argumento comercial: ${segData.argumento || ''}

Instrucción: Genera un mensaje de ${canal} para una campaña de ${tipo_campana} dirigida a empresas del rubro "${rubro}" en el segmento "${segmento}".
- Máximo 3 párrafos cortos
- Tono profesional pero directo
- Incluye 2-3 productos específicos de RMG con sus características
- Termina con una llamada a la acción clara
- Formato listo para copiar y enviar por ${canal}`

    const userMsg = contexto_adicional
      ? `Genera el mensaje de campaña. Contexto adicional: ${contexto_adicional}`
      : `Genera el mensaje de campaña para ${rubro} - ${segmento}.`

    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMsg }
      ],
      temperature: 0.7,
      max_tokens: 600,
    })

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      }
      let data = ''
      const reqHttp = https.request(options, (resp) => {
        resp.on('data', chunk => { data += chunk })
        resp.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch (e) { reject(new Error('Respuesta inválida de OpenAI')) }
        })
      })
      reqHttp.on('error', reject)
      reqHttp.write(body)
      reqHttp.end()
    })

    if (result.error) return res.status(502).json({ error: result.error.message })
    const mensaje = result.choices?.[0]?.message?.content || ''
    res.json({ mensaje })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
