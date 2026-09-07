const multer = require('multer')

// PDF, Excel, Word e imagen — los tipos de documento que el flujo comercial
// necesita adjuntar (guía de despacho, factura, comprobante, cotización de
// proveedor, etc.). Word (.docx) se agregó porque los "Anexos Ingresados"
// reales de una licitación en Mercado Público no son solo PDF — es común que
// alguno de los anexos técnicos/administrativos venga como Word editable
// (ej. "ANEXO 1,2 y 3 EDITABLES.docx", visto en la licitación de La Florida,
// 2378-105-LE26). Antes de esto ese archivo se rechazaba de plano al subirlo
// ("Formato no permitido"), así que ni siquiera llegaba a analizarse — ver
// chilecompraDocReader.js, que ahora extrae su texto con `mammoth`.
const MIME_A_TIPO = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/csv': 'excel',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
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
