/**
 * RMG Parts — Rutas Cotizador Manual (2026-09-15, v2)
 *
 * GET    /api/cotizador-manual                pega el código y sale — solo fuente='cotizador_manual'
 * POST   /api/cotizador-manual/subir          multipart: { codigo, documentos[] (PDF/imagen/Word) }
 *                                              → analiza con IA, cruza con catálogo + tagging Vistony
 * GET    /api/cotizador-manual/:id            detalle + ítems
 * GET    /api/cotizador-manual/:id/excel      descarga el Excel de cruce (mismo formato de siempre)
 * DELETE /api/cotizador-manual/:id            elimina
 */
const router = require('express').Router()
const c = require('../controllers/cotizadorManualController')
const { authenticate } = require('../middleware/auth')
const { uploadDocumento } = require('../middleware/documentos')

router.get('/',            authenticate, c.listar)
router.post('/subir',      authenticate, uploadDocumento.array('documentos', 5), c.subir)
router.get('/:id',         authenticate, c.getDetalle)
router.get('/:id/excel',   authenticate, c.descargarExcel)
router.delete('/:id',      authenticate, c.eliminar)

module.exports = router
