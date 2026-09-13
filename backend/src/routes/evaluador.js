/**
 * RMG Parts — Rutas Evaluador (2026-09-11)
 *
 * GET    /api/evaluador                       listar (filtros: estado, q) — solo fuente='evaluador'
 * POST   /api/evaluador/buscar                { codigo } → si es nuevo, ingesta completa desde
 *                                              Mercado Público (adjuntos + cruce + fichas); si ya
 *                                              existe, solo revisa el estado real en ChileCompra.
 * GET    /api/evaluador/:id                   detalle + ítems + historial
 * PATCH  /api/evaluador/:id/estado            cambio de estado manual (mismas transiciones/Kanban
 *                                              que ChileCompra/Compra Ágil)
 * GET    /api/evaluador/:id/checklist         documentos necesarios para postular
 * POST   /api/evaluador/:id/extraer-fichas-tecnicas   botón "Extraer fichas" (usa el link/match ya
 *                                              guardado, no vuelve a Mercado Público)
 * PUT    /api/evaluador/:id/items/:itemId/observacion  campo libre + "Volver a generar": SOLO
 *                                              recalcula el match contra el catálogo local — NUNCA
 *                                              vuelve a buscar en Mercado Público ni relee adjuntos.
 * POST   /api/evaluador/:id/reingestar        (2026-09-13) fuerza una ingesta completa nueva desde
 *                                              Mercado Público para un código YA ingresado — a
 *                                              diferencia de /buscar (que para códigos existentes
 *                                              solo revisa el estado real), esto vuelve a traer los
 *                                              ítems, re-cruza contra el catálogo y regenera el Excel.
 *                                              Para cuando una corrección de matching (ver
 *                                              compraAgilApiClient.js) debe aplicarse a un caso ya
 *                                              guardado con el dato viejo.
 * DELETE /api/evaluador/:id                   (2026-09-13) elimina la solicitud — pedido explícito
 *                                              del usuario, ya existía en Cotizador y quedó pendiente
 *                                              acá. Cascada sobre ítems/historial.
 *
 * Deliberadamente NO montado bajo /api/chilecompra (ese router está apagado
 * de emergencia — ver nota en app.js y en evaluadorController.js): este
 * módulo requiere directamente las funciones agnósticas de fuente de
 * chilecompraController.js y las expone acá, sin depender de que ese router
 * esté activo.
 */
const router = require('express').Router()
const c = require('../controllers/evaluadorController')
const { authenticate } = require('../middleware/auth')

router.get('/',                             authenticate, c.listar)
router.post('/buscar',                      authenticate, c.buscar)
router.get('/:id',                          authenticate, c.getDetalle)
router.patch('/:id/estado',                 authenticate, c.cambiarEstado)
router.get('/:id/checklist',                authenticate, c.getChecklistPostulacion)
router.post('/:id/analizar',                authenticate, c.analizarOportunidad)
router.post('/:id/extraer-fichas-tecnicas', authenticate, c.extraerFichasTecnicas)
router.post('/:id/limpiar-historial',       authenticate, c.limpiarHistorial)
router.post('/:id/reingestar',              authenticate, c.reingestar)
router.delete('/:id',                       authenticate, c.eliminar)
router.put('/:id/items/:itemId/observacion', authenticate, c.actualizarObservacionItem)

module.exports = router
