/**
 * RMG Parts — Rutas Cotizador Manual (2026-09-15)
 *
 * POST /api/cotizador-manual/analizar   { items: [{descripcion, cantidad}] }
 *                                       → propone SKU/precio/alertas por línea
 *                                       (cálculo puro, no guarda nada)
 * POST /api/cotizador-manual/generar    { cliente_id?, cliente, items: [...] }
 *                                       → crea una cotización real (misma
 *                                       tabla `cotizaciones` de todo el ERP,
 *                                       canal_origen='cotizador_manual')
 */
const router = require('express').Router()
const c = require('../controllers/cotizadorManualController')
const { authenticate } = require('../middleware/auth')

router.post('/analizar', authenticate, c.analizar)
router.post('/generar',  authenticate, c.generar)

module.exports = router
