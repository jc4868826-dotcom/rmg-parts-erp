/**
 * RMG Parts — Rutas de documentos adjuntos
 * GET    /api/documentos/:entidad/:entidadId   listar
 * POST   /api/documentos/:entidad/:entidadId   subir (multipart, campo "archivo")
 * GET    /api/documentos/archivo/:id           descargar/ver
 * DELETE /api/documentos/:id                   eliminar
 */
const router = require('express').Router()
const c = require('../controllers/documentosController')
const { authenticate } = require('../middleware/auth')
const { uploadDocumento } = require('../middleware/documentos')

// Sin authenticate — igual que /oc/:id/pdf: se abre desde un <a>/window.open() directo
// del navegador, que no reenvía el header Authorization.
router.get('/archivo/:id', c.descargar)
router.get('/:entidad/:entidadId', authenticate, c.listar)
router.post('/:entidad/:entidadId', authenticate, uploadDocumento.single('archivo'), c.subir)
router.delete('/:id', authenticate, c.eliminar)

module.exports = router
