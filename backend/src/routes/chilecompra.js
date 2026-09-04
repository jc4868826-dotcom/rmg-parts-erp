/**
 * RMG Parts — Rutas del asistente de oportunidades ChileCompra
 * GET    /api/chilecompra                    listar (filtros: estado, region, fecha_desde,
 *                                             fecha_hasta, dias_vencimiento, q)
 * POST   /api/chilecompra/ejecutar-analisis  botón "hacer análisis ahora" (Fase 1, manual)
 * GET    /api/chilecompra/:id                detalle + ítems + historial
 * PATCH  /api/chilecompra/:id/estado         transición de estado
 * POST   /api/chilecompra/:id/analizar       re-disparar lectura de anexos + scoring
 *                                             (genera y adjunta también el Excel de cruce
 *                                             + intenta adjuntar fichas técnicas)
 * GET    /api/chilecompra/:id/checklist      documentos necesarios para postular
 * POST   /api/chilecompra/:id/extraer-fichas-tecnicas   botón "Extraer fichas técnicas":
 *                                             adjunta a la ficha de la postulación la ficha
 *                                             técnica de cada producto emparejado (usa la
 *                                             librería catalogo_fichas_tecnicas; si falta
 *                                             alguna, la extrae de Vistony al vuelo)
 *
 * Los anexos (PDF/Excel) se suben con el módulo genérico ya existente:
 *   POST /api/documentos/oportunidad_chilecompra/:id
 * (ahí también quedan el Excel de cruce y las fichas técnicas generados
 * automáticamente — se listan y descargan igual que cualquier otro adjunto)
 *
 * La librería general de fichas técnicas ("utilitarios", scrape completo del
 * catálogo Vistony) vive en /api/utilitarios — ver routes/utilitarios.js.
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
router.post('/:id/extraer-fichas-tecnicas', authenticate, c.extraerFichasTecnicas)

module.exports = router
