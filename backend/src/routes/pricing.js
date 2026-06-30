const express = require('express')
const router = express.Router()
const c = require('../controllers/pricingController')
const { authenticate, requireRole } = require('../middleware/auth')

// GET /api/pricing/skus — catálogo completo con proveedor activo + benchmark
router.get('/skus', authenticate, c.getSkus)

// GET /api/pricing/clusters — todos los clusters de mercado
router.get('/clusters', authenticate, c.getClusters)

// POST /api/pricing/proveedores-sku — agregar / editar proveedor de un SKU
router.post('/proveedores-sku', authenticate, requireRole('admin'), c.upsertProveedorSku)

// PUT /api/pricing/proveedores-sku/:id/activar — cambiar proveedor activo
router.put('/proveedores-sku/:id/activar', authenticate, requireRole('admin'), c.activarProveedorSku)

// DELETE /api/pricing/proveedores-sku/:id — borrar proveedor inactivo
router.delete('/proveedores-sku/:id', authenticate, requireRole('admin'), c.deleteProveedorSku)

// POST /api/pricing/clusters — crear / actualizar precio de mercado de un cluster
router.post('/clusters', authenticate, requireRole('admin'), c.upsertCluster)

// POST /api/pricing/reindex — re-calcular cluster_key de todos los SKUs
router.post('/reindex', authenticate, requireRole('admin'), c.reindexClusters)

module.exports = router
