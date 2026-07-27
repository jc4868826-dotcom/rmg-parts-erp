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
