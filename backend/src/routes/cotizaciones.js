/**
 * RMG Auto Parts — Rutas de Cotizaciones
 * Generación automática · PDF · Envío WhatsApp
 */

const express = require('express');
const router = express.Router();
const cotizacionesController = require('../controllers/cotizacionesController');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/cotizaciones — Listar cotizaciones (paginado)
router.get('/', authenticate, cotizacionesController.getAll);

// GET /api/cotizaciones/:id — Detalle cotización
router.get('/:id', authenticate, cotizacionesController.getOne);

// POST /api/cotizaciones — Crear cotización
// Acepta: { cliente_id, items: [{sku, cantidad, precio_override?}], condiciones }
router.post('/', authenticate, cotizacionesController.create);

// POST /api/cotizaciones/publica — Cotización sin login (bot WhatsApp)
router.post('/publica', cotizacionesController.createPublica);

// PUT /api/cotizaciones/:id — Actualizar cotización
router.put('/:id', authenticate, cotizacionesController.update);

// DELETE /api/cotizaciones/:id — Eliminar cotización y sus items
router.delete('/:id', authenticate, cotizacionesController.remove);

// POST /api/cotizaciones/:id/aprobar — Aprobar → generar pedido
router.post('/:id/aprobar', authenticate, cotizacionesController.aprobar);

// POST /api/cotizaciones/:id/pdf — Generar PDF con logo RMG
router.post('/:id/pdf', authenticate, cotizacionesController.generarPDF);

// POST /api/cotizaciones/:id/whatsapp — Enviar por WhatsApp
router.post('/:id/whatsapp', authenticate, cotizacionesController.enviarWhatsApp);

// POST /api/cotizaciones/:id/email — Enviar por email
router.post('/:id/email', authenticate, cotizacionesController.enviarEmail);

module.exports = router;
