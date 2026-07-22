const express = require('express')
const router = express.Router()
const c = require('../controllers/prospeccionController')
const { authenticate } = require('../middleware/auth')

// GET  /api/prospeccion          — lista con filtros opcionales
router.get('/',                      authenticate, c.list)

// GET  /api/prospeccion/stats    — conteo de activos en etapa='prospecto'
router.get('/stats',                 authenticate, c.getStats)

// POST /api/prospeccion          — crear un prospecto
router.post('/',                     authenticate, c.create)

// POST /api/prospeccion/bulk     — importación masiva desde Excel
router.post('/bulk',                 authenticate, c.bulkImport)

// PUT  /api/prospeccion/:id      — actualizar prospecto
router.put('/:id',                   authenticate, c.update)

// PATCH /api/prospeccion/:id/etapa    — cambiar etapa del prospecto
router.patch('/:id/etapa',           authenticate, c.cambiarEtapa)

// PATCH /api/prospeccion/:id/descartar — marcar como descartado
router.patch('/:id/descartar',       authenticate, c.descartar)

// POST  /api/prospeccion/:id/mover-a-contacto — promover al Pipeline CRM
router.post('/:id/mover-a-contacto', authenticate, c.moverAContacto)

module.exports = router
