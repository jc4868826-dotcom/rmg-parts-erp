/**
 * RMG Landing — Multer upload middleware (memoria)
 * Las fotos se convierten a base64 en el handler y se guardan en la DB.
 * No se escribe nada a disco.
 */

const multer = require('multer')
const path   = require('path')

const fileFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
    cb(null, true)
  } else {
    const err = new Error('Formato no soportado. Usa JPG, PNG, WebP o GIF')
    err.statusCode = 400
    cb(err, false)
  }
}

const uploadLanding = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
})

module.exports = { uploadLanding }
