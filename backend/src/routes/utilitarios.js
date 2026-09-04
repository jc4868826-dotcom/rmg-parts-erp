/**
 * RMG Parts — "Utilitarios": librería general de fichas técnicas (mantención).
 * GET  /api/utilitarios/fichas-tecnicas                 listar librería (?q= filtro)
 * GET  /api/utilitarios/fichas-tecnicas/:id/archivo      descargar el PDF
 * POST /api/utilitarios/fichas-tecnicas/extraer-catalogo scrape completo del catálogo Vistony
 * POST /api/utilitarios/fichas-tecnicas/:sku/extraer     (re)extraer un solo SKU
 *
 * Distinto del flujo por-postulación (POST /api/chilecompra/:id/extraer-fichas-tecnicas),
 * que solo adjunta lo que ya está o cae en esta librería a una oportunidad puntual.
 */
const router = require('express').Router()
const c = require('../controllers/utilitariosController')
const { authenticate, requireRole } = require('../middleware/auth')

router.get('/fichas-tecnicas',                    authenticate, c.listarFichas)
router.get('/fichas-tecnicas/:id/archivo',         authenticate, c.descargarFicha)
router.post('/fichas-tecnicas/extraer-catalogo',   authenticate, requireRole(['admin', 'administrador', 'gerente']), c.extraerCatalogoCompleto)
router.post('/fichas-tecnicas/:sku/extraer',       authenticate, requireRole(['admin', 'administrador', 'gerente']), c.extraerUnSku)

module.exports = router
