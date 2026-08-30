const multer = require('multer')

// PDF, Excel e imagen — los 3 tipos de documento que el flujo comercial necesita
// adjuntar (guía de despacho, factura, comprobante, cotización de proveedor, etc.)
const MIME_A_TIPO = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/csv': 'excel',
  'image/jpeg': 'imagen',
  'image/png': 'imagen',
  'image/webp': 'imagen',
  'image/gif': 'imagen',
}

const fileFilter = (_req, file, cb) => {
  cb(null, Object.prototype.hasOwnProperty.call(MIME_A_TIPO, file.mimetype))
}

const uploadDocumento = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
})

const tipoDeDocumento = (mimetype) => MIME_A_TIPO[mimetype] || null

module.exports = { uploadDocumento, tipoDeDocumento }
