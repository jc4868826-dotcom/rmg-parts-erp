/**
 * RMG Landing — Multer upload middleware
 * Disk storage a /var/data/landing-uploads/{productos,banners}/
 * Tipos: jpg/jpeg/png/webp · Límite: 5 MB
 */

const multer = require('multer')
const path   = require('path')
const fs     = require('fs')

const UPLOADS_DIR = process.env.LANDING_UPLOADS_DIR || '/var/data/landing-uploads'

function makeUpload(subfolder) {
  const dest = path.join(UPLOADS_DIR, subfolder)
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename:    (_req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase()
      const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext
      cb(null, name)
    },
  })

  const fileFilter = (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp']
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten imágenes JPG, PNG o WebP'), false)
    }
  }

  return multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })
}

const uploadProducto = makeUpload('productos')
const uploadBanner   = makeUpload('banners')

module.exports = { uploadProducto, uploadBanner, UPLOADS_DIR }
