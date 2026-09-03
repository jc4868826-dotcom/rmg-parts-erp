/**
 * RMG Parts — Rutas del asistente de oportunidades ChileCompra
 * GET    /api/chilecompra                    listar (filtros: estado, region, fecha_desde,
 *                                             fecha_hasta, dias_vencimiento, q)
 * POST   /api/chilecompra/ejecutar-analisis  botón "hacer análisis ahora" (Fase 1, manual)
 * GET    /api/chilecompra/:id                detalle + ítems + historial
 * PATCH  /api/chilecompra/:id/estado         transición de estado
 * POST   /api/chilecompra/:id/analizar       re-disparar lectura de anexos + scoring
 * GET    /api/chilecompra/:id/checklist      documentos necesarios para postular
 *
 * Los anexos (PDF/Excel) se suben con el módulo genérico ya existente:
 *   POST /api/documentos/oportunidad_chilecompra/:id
 */
const router = require('express').Router()
const c = require('../controllers/chilecompraController')
const { authenticate } = require('../middleware/auth')

router.get('/',                  authenticate, c.getOportunidades)
router.post('/ejecutar-analisis', authenticate, c.ejecutarAnalisisAhora)
router.get('/:id',               authenticate, c.getOportunidad)
router.patch('/:id/estado',      authenticate, c.cambiarEstado)
router.post('/:id/analizar',     authenticate, c.analizarOportunidad)
router.get('/:id/checklist',     authenticate, c.getChecklistPostulacion)

module.exports = router
