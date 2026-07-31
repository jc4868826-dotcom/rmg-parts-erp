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

// POST /api/prospeccion/recalcular-segmentos
router.post('/recalcular-segmentos', authenticate, (req, res) => {
  try {
    const { db } = require('../../config/database')
    function inferSeg(rubro) {
      const r = (rubro || '').toUpperCase()
      if (r.includes('TALLER') || r.includes('MECAN') || r.includes('AUTOMOTRIZ') || r.includes('LUBRI')) return 'Taller'
      if (r.includes('CONSTRUC')) return 'Construcción'
      if (r.includes('TRANSP') || r.includes('FLOTA') || r.includes('BUSES') || r.includes('LOGIST')) return 'Flotas'
      if (r.includes('AGRICOL') || r.includes('AGRO') || r.includes('FRUTERA') || r.includes('VITIVI') || r.includes('GANADE')) return 'Agrícola'
      if (r.includes('MINER')) return 'Minería'
      return 'Industria'
    }
    const rows = db.prepare('SELECT id, rubro, rubro_especialidad FROM pipeline_contactos').all()
    const upd = db.prepare("UPDATE pipeline_contactos SET segmento = ? WHERE id = ?")
    const run = db.transaction(() => {
      let n = 0
      for (const r of rows) {
        const seg = inferSeg(r.rubro || r.rubro_especialidad || '')
        upd.run(seg, r.id)
        n++
      }
      return n
    })
    const actualizados = run()
    res.json({ ok: true, actualizados })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/prospeccion/:id/campana-estado — actualizar estado de campaña de un prospecto manualmente
router.put('/:id/campana-estado', authenticate, (req, res) => {
  try {
    const { db } = require('../../config/database')
    const ESTADOS = ['Sin enviar', 'Enviado', 'Abrió', 'Respondió', 'Sin respuesta']
    const { estado } = req.body
    if (!estado || !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `estado inválido. Valores: ${ESTADOS.join(', ')}` })
    }
    const reg = db.prepare('SELECT id FROM pipeline_contactos WHERE id = ?').get(req.params.id)
    if (!reg) return res.status(404).json({ error: 'Prospecto no encontrado' })
    db.prepare("UPDATE pipeline_contactos SET campana_estado = ?, fecha_ultima_actualizacion = datetime('now') WHERE id = ?").run(estado, req.params.id)
    res.json(db.prepare('SELECT * FROM pipeline_contactos WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/prospeccion/asignar-campana  — debe ir ANTES de /:id para evitar que Express lo capture como wildcard
router.put('/asignar-campana', authenticate, (req, res) => {
  try {
    const { db } = require('../../config/database')
    const { ids, campana_id, campana_nombre } = req.body
    if (!ids?.length || !campana_id) return res.status(400).json({ error: 'ids y campana_id requeridos' })
    const placeholders = ids.map(() => '?').join(',')
    // Resetear campana_estado y tracking para que el envío funcione correctamente en la nueva campaña
    const pcCols = db.prepare('PRAGMA table_info(pipeline_contactos)').all().map(c => c.name)
    const tieneTracking = pcCols.includes('email_abierto')
    const trackingReset = tieneTracking
      ? ", email_abierto = 0, fecha_apertura = NULL, veces_abierto = 0"
      : ""
    db.prepare(`UPDATE pipeline_contactos SET campana_id = ?, campana_nombre = ?, campana_estado = 'Sin enviar', campana_enviado_at = NULL${trackingReset}, fecha_ultima_actualizacion = datetime('now') WHERE id IN (${placeholders})`)
      .run(campana_id, campana_nombre || null, ...ids)
    const count = db.prepare(`SELECT COUNT(*) as n FROM pipeline_contactos WHERE campana_id = ?`).get(campana_id).n
    try { db.prepare(`UPDATE campanas SET total_prospectos = ? WHERE id = ?`).run(count, campana_id) } catch(_) {}
    res.json({ ok: true, actualizados: ids.length, total_campana: count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT  /api/prospeccion/:id      — actualizar prospecto
router.put('/:id',                   authenticate, c.update)

// PATCH /api/prospeccion/:id/etapa    — cambiar etapa del prospecto
router.patch('/:id/etapa',           authenticate, c.cambiarEtapa)

// PATCH /api/prospeccion/:id/descartar — marcar como descartado
router.patch('/:id/descartar',       authenticate, c.descartar)

// POST  /api/prospeccion/:id/mover-a-contacto — promover al Pipeline CRM
router.post('/:id/mover-a-contacto', authenticate, c.moverAContacto)

module.exports = router
