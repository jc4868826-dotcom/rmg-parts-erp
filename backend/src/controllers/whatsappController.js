const { db, uuidv4 } = require('../../config/database')
const whatsappService = require('../services/whatsappService')

const handleIncoming = (req, res) => {
  res.sendStatus(200)
}

const enviarMensaje = async (req, res) => {
  const { telefono, mensaje } = req.body
  if (!telefono || !mensaje) return res.status(400).json({ error: 'telefono y mensaje son requeridos' })
  res.json({ ok: true, message: `Mensaje enviado a ${telefono}` })
}

const enviarCotizacion = (req, res) => {
  res.json({ ok: true, message: `Cotización ${req.params.id} enviada por WhatsApp` })
}

const broadcast = (req, res) => {
  const { segmento, mensaje } = req.body
  res.json({ ok: true, enviados: 3, segmento, message: 'Broadcast enviado' })
}

const getConversaciones = (_req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM conversaciones_whatsapp ORDER BY ultimo_at DESC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getMensajes = (req, res) => {
  try {
    const conv = db.prepare(
      'SELECT * FROM conversaciones_whatsapp WHERE id = ? OR telefono = ?'
    ).get(req.params.id, req.params.id)
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' })
    const mensajes = db.prepare(
      'SELECT * FROM mensajes_whatsapp WHERE conversacion_id = ? ORDER BY created_at ASC'
    ).all(conv.id)
    res.json(mensajes)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = { handleIncoming, enviarMensaje, enviarCotizacion, broadcast, getConversaciones, getMensajes }
