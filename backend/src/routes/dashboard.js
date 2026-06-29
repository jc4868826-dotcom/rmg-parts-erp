/**
 * RMG Auto Parts — Rutas Dashboard Gerencial
 * KPIs tiempo real · Tablero $20M · Segmentos
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

// GET /api/dashboard/resumen — KPIs principales del mes
router.get('/resumen', authenticate, dashboardController.getResumen);

// GET /api/dashboard/ventas — Ventas por segmento (vs meta)
router.get('/ventas', authenticate, dashboardController.getVentas);

// GET /api/dashboard/productos — SKUs más vendidos + margen
router.get('/productos', authenticate, dashboardController.getProductos);

// GET /api/dashboard/clientes — Cartera activa + pipeline
router.get('/clientes', authenticate, dashboardController.getClientes);

// GET /api/dashboard/caja — Flujo de caja del mes
router.get('/caja', authenticate, dashboardController.getCaja);

// GET /api/dashboard/alertas — Stock bajo · CxC vencidas · Pipeline frío
router.get('/alertas', authenticate, dashboardController.getAlertas);

// GET /api/dashboard/export — Export Excel del mes
router.get('/export', authenticate, dashboardController.exportExcel);

module.exports = router;
