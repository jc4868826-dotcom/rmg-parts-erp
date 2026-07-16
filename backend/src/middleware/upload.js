const multer = require('multer')

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const fileFilter = (_req, file, cb) => {
  cb(null, ALLOWED_TYPES.includes(file.mimetype))
}

const uploadLanding = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
})

module.exports = { uploadLanding }
