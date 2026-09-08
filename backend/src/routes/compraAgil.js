/**
 * RMG Parts — Rutas Compra Ágil (submenú nuevo bajo ChileCompra)
 *
 * GET    /api/compra-agil                        listar (filtros: estado, q)
 * POST   /api/compra-agil/importar                { codigo } → importa/actualiza la publicación,
 *                                                  cruza con catálogo y adjunta fichas técnicas
 * GET    /api/compra-agil/:id                     detalle + ítems + historial
 *                                                  (para cambiar estado, usar PATCH /api/chilecompra/:id/estado
 *                                                  — misma tabla, mismo endpoint, ya soporta fuente='compra_agil')
 * GET    /api/compra-agil/:id/benchmark-solicitante?keyword=...   botón 1: compras similares del MISMO organismo
 * GET    /api/compra-agil/benchmark-mercado?keyword=...           botón 2: compras similares en el mercado
 * POST   /api/compra-agil/:id/fundamento          compara cada ficha técnica RMG vs. exigencia (IA) y
 *                                                  guarda cumplimiento + observación sugerida por ítem
 * GET    /api/compra-agil/:id/precio-sugerido     sugerencia de precio por ítem (costo + margen vs. presupuesto ref.)
 *
 * No se duplica nada de /api/chilecompra/:id (analizar, checklist, extraer-fichas-tecnicas,
 * limpiar-historial, items/:itemId/observacion, documentos) — esas rutas ya funcionan igual
 * para fuente='compra_agil' porque comparten tabla; usarlas también desde la ficha de Compra Ágil.
 */
const router = require('express').Router()
const c = require('../controllers/compraAgilController')
const { authenticate } = require('../middleware/auth')

router.get('/benchmark-mercado', authenticate, c.benchmarkMercado)
router.get('/', authenticate, c.listar)
router.post('/importar', authenticate, c.importar)
router.get('/:id', authenticate, c.getDetalle)
router.get('/:id/benchmark-solicitante', authenticate, c.benchmarkSolicitante)
router.post('/:id/fundamento', authenticate, c.fundamento)
router.get('/:id/precio-sugerido', authenticate, c.precioSugerido)

module.exports = router
