const router = require('express').Router()
const c = require('../controllers/flujoCajaController')
const { authenticate, requireRole } = require('../middleware/auth')

router.get('/',          authenticate, c.getMovimientos)
router.get('/resumen',   authenticate, c.getResumen)
router.get('/raw',       authenticate, c.getRaw) // TEMP: diagnóstico saldo — quitar después
router.post('/reconciliar-090926', authenticate, requireRole(['gerente', 'administrador']), c.reconciliar090926) // TEMP: corrección puntual — quitar después de correrla
router.post('/manual',   authenticate, c.crearManual)
// Editar/eliminar cualquier movimiento (no solo manuales) ahora requiere
// gerente/administrador — antes de este cambio "eliminar" solo dejaba
// tocar movimientos manuales, sin restricción de rol; al abrirlo a
// cualquier fila (venta/gasto/OC/compra) se sube la valla a rol para
// no dejar que cualquier usuario borre un pago real por error.
router.put('/:id',       authenticate, requireRole(['gerente', 'administrador']), c.actualizar)
router.delete('/:id',    authenticate, requireRole(['gerente', 'administrador']), c.eliminar)

module.exports = router
