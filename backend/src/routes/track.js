const router = require('express').Router()
const { db } = require('../../config/database')

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

// GET /api/track/open/:campana_id/:prospecto_id — tracking pixel, no auth
router.get('/open/:campana_id/:prospecto_id', (req, res) => {
  const { campana_id, prospecto_id } = req.params
  try {
    const pc = db.prepare(
      'SELECT id FROM pipeline_contactos WHERE id = ? AND campana_id = ?'
    ).get(prospecto_id, campana_id)

    if (pc) {
      db.prepare(`
        UPDATE pipeline_contactos
        SET email_abierto = 1,
            fecha_apertura = COALESCE(fecha_apertura, datetime('now')),
            veces_abierto  = COALESCE(veces_abierto, 0) + 1,
            campana_estado = CASE WHEN campana_estado = 'Enviado' THEN 'Abrió' ELSE campana_estado END
        WHERE id = ?
      `).run(prospecto_id)

      const totalAbiertos = db.prepare(
        "SELECT COUNT(*) as n FROM pipeline_contactos WHERE campana_id = ? AND email_abierto = 1"
      ).get(campana_id)?.n || 0
      db.prepare('UPDATE campanas SET abiertos = ? WHERE id = ?').run(totalAbiertos, campana_id)
    }
  } catch (_) {}

  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.end(PIXEL)
})

module.exports = router
