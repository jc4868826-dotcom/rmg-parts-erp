const router = require('express').Router()
const { db } = require('../../config/database')

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

// GET /api/track/open/:campana_id/:prospecto_id — tracking pixel, no auth
router.get('/open/:campana_id/:prospecto_id', (req, res) => {
  const { campana_id, prospecto_id } = req.params
  const ua = req.headers['user-agent'] || ''
  const ip = req.ip || req.connection?.remoteAddress || ''

  console.log(`[PIXEL] campana:${campana_id} prospecto:${prospecto_id} IP:${ip} UA:${ua.slice(0, 80)}`)

  try {
    const pc = db.prepare(
      'SELECT id FROM pipeline_contactos WHERE id = ? AND campana_id = ?'
    ).get(prospecto_id, campana_id)

    if (pc) {
      try {
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

        console.log(`[PIXEL] ✅ registrado — prospecto:${prospecto_id} abiertos_total:${totalAbiertos}`)
      } catch (updateErr) {
        console.error(`[PIXEL] ❌ UPDATE falló — prospecto:${prospecto_id}`, updateErr.message)
      }
    } else {
      console.log(`[PIXEL] ⚠️  prospecto no encontrado para campana:${campana_id} prospecto:${prospecto_id}`)
    }
  } catch (err) {
    console.error('[PIXEL] ❌ Error general:', err.message)
  }

  // Siempre devolver el pixel aunque falle el UPDATE
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.end(PIXEL)
})

module.exports = router
