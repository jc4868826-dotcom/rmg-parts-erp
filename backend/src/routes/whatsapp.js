/**
 * RMG Auto Parts — Bot WhatsApp (Meta Cloud API)
 * Webhook · Cotización automática · Pedidos
 */

const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// ─── Webhook de verificación (Meta requiere GET) ─────────────
// GET /api/whatsapp/webhook
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ WhatsApp Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Webhook de mensajes entrantes ──────────────────────────
// POST /api/whatsapp/webhook
router.post('/webhook', whatsappController.handleIncoming);

// ─── Envío manual desde el sistema ──────────────────────────
// POST /api/whatsapp/enviar
router.post('/enviar', whatsappController.enviarMensaje);

// POST /api/whatsapp/cotizacion/:id
// Envía cotización formateada al número del cliente
router.post('/cotizacion/:id', whatsappController.enviarCotizacion);

// POST /api/whatsapp/broadcast
// Difusión segmentada (talleres | flotas | concesionarios | construccion)
router.post('/broadcast', whatsappController.broadcast);

// GET /api/whatsapp/conversaciones — Historial de chats
router.get('/conversaciones', whatsappController.getConversaciones);

module.exports = router;
