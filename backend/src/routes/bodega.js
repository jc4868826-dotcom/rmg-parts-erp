const router = require('express').Router()
const c = require('../controllers/bodegaController')
const { authenticate, requireRole } = require('../middleware/auth')

router.get('/movimientos',           c.getMovimientos)
router.post('/ajuste',               c.ajustarStock)
// La recepción de OC vive únicamente en /api/oc/:id/recepcion (ocController.js) —
// este endpoint no lo usa ningún frontend y quedaba como una tercera implementación
// de la misma recepción, con su propia forma de nombrar el estado.
router.get('/producto/:codigo',      c.getStockConMovimientos)
router.delete('/movimientos/:id',    c.eliminarMovimiento)
// "Código de limpieza": pone en 0 el stock de TODA la bodega de una vez (antes
// de una toma de inventario física) — acción masiva e irreversible sobre datos
// reales, por eso es la única ruta de este archivo con auth + rol exigidos.
router.post('/limpieza',             authenticate, requireRole(['gerente', 'administrador']), c.limpiarStock)

module.exports = router
