/**
 * RMG Auto Parts — Rutas Pipeline CRM (FunnelOS)
 * 5 etapas: Prospecto → Contactado → Cotizado → Negociando → Cliente
 */

const express = require('express');
const router = express.Router();
const pipelineController = require('../controllers/pipelineController');
const { authenticate } = require('../middleware/auth');

// GET /api/pipeline — Tablero kanban completo
router.get('/', authenticate, pipelineController.getBoard);

// GET /api/pipeline/stats — KPIs del funnel
router.get('/stats', authenticate, pipelineController.getStats);

// GET /api/pipeline/vencimientos — Prospectos sin actividad +7 días
router.get('/vencimientos', authenticate, pipelineController.getVencimientos);

// POST /api/pipeline — Agregar prospecto
router.post('/', authenticate, pipelineController.create);

// PATCH /api/pipeline/:id/etapa — Mover entre etapas
// Body: { etapa: 'contactado' | 'cotizado' | 'negociando' | 'cliente' }
router.patch('/:id/etapa', authenticate, pipelineController.cambiarEtapa);

// POST /api/pipeline/:id/actividad — Registrar actividad (visita, llamada, etc.)
router.post('/:id/actividad', authenticate, pipelineController.registrarActividad);

// GET /api/pipeline/:id/actividades — Historial de actividades
router.get('/:id/actividades', authenticate, pipelineController.getActividades);

// POST /api/pipeline/:id/convertir — Convertir a cliente activo
router.post('/:id/convertir', authenticate, pipelineController.convertirACliente);

module.exports = router;
