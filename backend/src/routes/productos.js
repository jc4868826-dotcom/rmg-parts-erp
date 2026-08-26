/**
 * RMG Auto Parts — Rutas de Productos
 * Catálogo · SKUs · Precios mayoristas B2B
 */

const express = require('express');
const router = express.Router();
const productosController = require('../controllers/productosController');
const { authenticate, requireRole } = require('../middleware/auth');

// GET /api/productos — Catálogo completo (público para cotización)
router.get('/', productosController.getAll);

// GET /api/productos/categorias — Líneas: baterias, lubricantes, neumaticos, etc.
router.get('/categorias', productosController.getCategorias);

// GET /api/productos/search?q=5W30 — Búsqueda por nombre/código
router.get('/search', productosController.search);

// GET /api/productos/:codigo — Detalle de un SKU
router.get('/:codigo', productosController.getOne);

// GET /api/productos/:codigo/precio/:segmento — Precio según segmento cliente
router.get('/:codigo/precio/:segmento', authenticate, productosController.getPrecioSegmento);

// POST /api/productos — Crear producto (gerente/administrador)
router.post('/', authenticate, requireRole(['gerente', 'administrador']), productosController.create);

// PUT /api/productos/:codigo — Actualizar producto (gerente/administrador)
router.put('/:codigo', authenticate, requireRole(['gerente', 'administrador']), productosController.update);

// PATCH /api/productos/:codigo/stock — Ajuste de stock (cualquier usuario autenticado)
router.patch('/:codigo/stock', authenticate, productosController.updateStock);

module.exports = router;
