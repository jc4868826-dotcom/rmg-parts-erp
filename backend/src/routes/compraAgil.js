/**
 * RMG Parts — Rutas Compra Ágil (submenú nuevo bajo ChileCompra)
 *
 * GET    /api/compra-agil                        listar (filtros: estado, q)
 * POST   /api/compra-agil/importar                { codigo } → importa/actualiza la publicación,
 *                                                  cruza con catálogo y adjunta fichas técnicas
 *                                                  ⚠️ WAF-bloqueado desde 2026-09 — usar importar-manual
 * POST   /api/compra-agil/importar-manual         { codigo, texto?, documentos? } → mismo resultado que
 *                                                  /importar pero SIN depender de la API bloqueada: el
 *                                                  usuario pega el texto de la publicación y/o sube el PDF,
 *                                                  y una IA extrae los ítems (mismo lector que licitaciones)
 * GET    /api/compra-agil/:id                     detalle + ítems + historial
 *                                                  (para cambiar estado, usar PATCH /api/chilecompra/:id/estado
 *                                                  — misma tabla, mismo endpoint, ya soporta fuente='compra_agil')
 * GET    /api/compra-agil/:id/benchmark-solicitante?keyword=...   botón 1: compras similares del MISMO organismo
 * GET    /api/compra-agil/benchmark-mercado?keyword=...           botón 2: compras similares en el mercado
 * POST   /api/compra-agil/:id/fundamento          compara cada ficha técnica RMG vs. exigencia (IA) y
 *                                                  guarda cumplimiento + observación sugerida por ítem
 * GET    /api/compra-agil/:id/precio-sugerido     sugerencia de precio por ítem (costo + margen vs. presupuesto ref.)
 * GET    /api/compra-agil/datos-abiertos/estado        qué meses de Datos Abiertos ya están sincronizados localmente
 * POST   /api/compra-agil/datos-abiertos/sincronizar   fuerza la sincronización de los últimos meses disponibles
 *                                                       (también corre solo, mensualmente — ver jobs/compraAgilDatosAbiertosCron.js)
 * POST   /api/compra-agil/scrapear-ahora                dispara el detector automático (navegador headless) YA MISMO
 *                                                        en vez de esperar al cron cada 2h — busca por cada keyword del
 *                                                        rubro RMG, importa solo, sin que el usuario pegue nada
 *                                                        (ver services/compraAgilScraper.js). Puede tardar 1-3 min.
 *
 * No se duplica nada de /api/chilecompra/:id (analizar, checklist, extraer-fichas-tecnicas,
 * limpiar-historial, items/:itemId/observacion, documentos) — esas rutas ya funcionan igual
 * para fuente='compra_agil' porque comparten tabla; usarlas también desde la ficha de Compra Ágil.
 */
const router = require('express').Router()
const c = require('../controllers/compraAgilController')
const { authenticate } = require('../middleware/auth')

router.get('/benchmark-mercado', authenticate, c.benchmarkMercado)
router.get('/datos-abiertos/estado', authenticate, c.datosAbiertosEstado)
router.post('/datos-abiertos/sincronizar', authenticate, c.datosAbiertosSincronizar)
router.post('/scrapear-ahora', authenticate, c.scrapearAhora)
router.get('/', authenticate, c.listar)
router.post('/importar', authenticate, c.importar)
router.post('/importar-manual', authenticate, c.importarManual)
router.get('/:id', authenticate, c.getDetalle)
router.get('/:id/benchmark-solicitante', authenticate, c.benchmarkSolicitante)
router.post('/:id/fundamento', authenticate, c.fundamento)
router.get('/:id/precio-sugerido', authenticate, c.precioSugerido)

module.exports = router
