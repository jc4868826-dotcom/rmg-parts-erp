/**
 * RMG Landing — Rutas admin (protegidas con JWT + rol admin)
 * Fotos guardadas como base64 en la DB (/var/data/rmg_parts.db — disco persistente).
 */

const express = require('express')
const router  = express.Router()
const { db }  = require('../../config/database')
const { authenticate, requireRole } = require('../middleware/auth')
const { uploadLanding } = require('../middleware/upload')

const guard = [authenticate, requireRole('admin')]

// Excluye foto_base64 de las respuestas de lista (puede pesar MBs), pero las mantiene
// en GET individuales para que el admin pueda mostrar preview.
function strip(row) {
  if (!row) return row
  const { foto_base64, ...rest } = row
  return rest
}
function stripAll(rows) { return rows.map(strip) }

// ─── FAMILIAS ─────────────────────────────────────────────────────────────────

const VALID_FAMILIAS = ['NEUMATICOS', 'BATERIAS', 'LUBRICANTES']

// GET /api/admin/landing/familias
router.get('/familias', guard, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT familia, foto_path, foto_mimetype, descripcion, updated_at FROM landing_familias ORDER BY familia ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/familias/:familia
router.put('/familias/:familia', [...guard, uploadLanding.single('foto')], (req, res) => {
  try {
    const { familia } = req.params
    if (!VALID_FAMILIAS.includes(familia)) return res.status(400).json({ error: 'Familia inválida' })

    const existing = db.prepare('SELECT familia FROM landing_familias WHERE familia = ?').get(familia)
    if (!existing) return res.status(404).json({ error: 'Familia no encontrada' })
    if (!req.file && req.body.descripcion === undefined) {
      return res.status(400).json({ error: 'Se requiere foto o descripción' })
    }

    if (req.file) {
      const foto_base64   = req.file.buffer.toString('base64')
      const foto_mimetype = req.file.mimetype
      db.prepare(`
        UPDATE landing_familias
        SET foto_base64 = ?, foto_mimetype = ?, updated_at = datetime('now')
        WHERE familia = ?
      `).run(foto_base64, foto_mimetype, familia)
    }

    if (req.body.descripcion !== undefined) {
      db.prepare(`
        UPDATE landing_familias
        SET descripcion = ?, updated_at = datetime('now')
        WHERE familia = ?
      `).run(req.body.descripcion || null, familia)
    }

    res.json({ familia, updated_at: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── SUBFAMILIAS ──────────────────────────────────────────────────────────────

// GET /api/admin/landing/subfamilias
router.get('/subfamilias', guard, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, familia, nombre, descripcion, foto_mimetype, orden, activo, created_at, updated_at FROM landing_subfamilias ORDER BY familia ASC, orden ASC, id ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/subfamilias
router.post('/subfamilias', [...guard, uploadLanding.single('foto')], (req, res) => {
  try {
    const { familia, nombre, descripcion, orden = 0, activo = 1 } = req.body
    if (!familia) return res.status(400).json({ error: 'familia es requerida' })
    if (!nombre)  return res.status(400).json({ error: 'nombre es requerido' })

    const foto_base64   = req.file ? req.file.buffer.toString('base64') : null
    const foto_mimetype = req.file ? req.file.mimetype : null

    db.prepare(`
      INSERT INTO landing_subfamilias (familia, nombre, foto_base64, foto_mimetype, descripcion, orden, activo)
      VALUES (?,?,?,?,?,?,?)
    `).run(familia, nombre, foto_base64, foto_mimetype, descripcion || null, parseInt(orden), parseInt(activo))

    const newRow = db.prepare(
      'SELECT id, familia, nombre, descripcion, foto_mimetype, orden, activo, created_at, updated_at FROM landing_subfamilias ORDER BY rowid DESC LIMIT 1'
    ).get()
    res.status(201).json(newRow)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/subfamilias/:id
router.put('/subfamilias/:id', [...guard, uploadLanding.single('foto')], (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT id, foto_base64, foto_mimetype FROM landing_subfamilias WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Subfamilia no encontrada' })

    const { familia, nombre, descripcion, orden, activo } = req.body

    const foto_base64   = req.file ? req.file.buffer.toString('base64') : existing.foto_base64
    const foto_mimetype = req.file ? req.file.mimetype : existing.foto_mimetype

    db.prepare(`
      UPDATE landing_subfamilias SET
        familia       = COALESCE(?, familia),
        nombre        = COALESCE(?, nombre),
        descripcion   = COALESCE(?, descripcion),
        foto_base64   = ?,
        foto_mimetype = ?,
        orden         = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        activo        = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END,
        updated_at    = datetime('now')
      WHERE id = ?
    `).run(
      familia || null, nombre || null, descripcion || null,
      foto_base64, foto_mimetype,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      parseInt(id)
    )

    res.json(db.prepare(
      'SELECT id, familia, nombre, descripcion, foto_mimetype, orden, activo, created_at, updated_at FROM landing_subfamilias WHERE id = ?'
    ).get(parseInt(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/landing/subfamilias/:id
router.delete('/subfamilias/:id', guard, (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM landing_subfamilias WHERE id = ?').get(parseInt(req.params.id))
    if (!row) return res.status(404).json({ error: 'Subfamilia no encontrada' })
    db.prepare('DELETE FROM landing_subfamilias WHERE id = ?').run(parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

const PROD_COLS = 'id, familia, subfamilia, subfamilia_id, codigo, marca, descripcion, um, presentacion, precio, detalles_tecnicos, foto_mimetype, activo, orden, created_at, updated_at'

// GET /api/admin/landing/productos
router.get('/productos', guard, (req, res) => {
  try {
    const rows = db.prepare(`SELECT ${PROD_COLS} FROM landing_productos ORDER BY orden ASC, id ASC`).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/productos
router.post('/productos', [...guard, uploadLanding.single('foto')], (req, res) => {
  try {
    const { familia, subfamilia, subfamilia_id, codigo, marca,
            descripcion, um, presentacion,
            precio, detalles_tecnicos, activo = 1, orden = 0 } = req.body
    if (!descripcion) return res.status(400).json({ error: 'descripcion es requerida' })

    const foto_base64   = req.file ? req.file.buffer.toString('base64') : null
    const foto_mimetype = req.file ? req.file.mimetype : null

    db.prepare(`
      INSERT INTO landing_productos
        (familia, subfamilia, subfamilia_id, codigo, marca, descripcion, um, presentacion,
         precio, detalles_tecnicos, foto_base64, foto_mimetype, activo, orden)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      familia || null, subfamilia || null,
      subfamilia_id ? parseInt(subfamilia_id) : null,
      codigo || null, marca || null, descripcion, um || null, presentacion || null,
      precio != null && precio !== '' ? parseFloat(precio) : null,
      detalles_tecnicos || null, foto_base64, foto_mimetype,
      parseInt(activo), parseInt(orden)
    )

    const newRow = db.prepare(`SELECT ${PROD_COLS} FROM landing_productos ORDER BY rowid DESC LIMIT 1`).get()
    res.status(201).json(newRow)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/productos/:id
router.put('/productos/:id', [...guard, uploadLanding.single('foto')], (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT id, foto_base64, foto_mimetype FROM landing_productos WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' })

    const { familia, subfamilia, subfamilia_id, codigo, marca,
            descripcion, um, presentacion,
            precio, detalles_tecnicos, activo, orden } = req.body

    const foto_base64   = req.file ? req.file.buffer.toString('base64') : existing.foto_base64
    const foto_mimetype = req.file ? req.file.mimetype : existing.foto_mimetype

    db.prepare(`
      UPDATE landing_productos SET
        familia           = COALESCE(?, familia),
        subfamilia        = COALESCE(?, subfamilia),
        subfamilia_id     = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE subfamilia_id END,
        codigo            = COALESCE(?, codigo),
        marca             = COALESCE(?, marca),
        descripcion       = COALESCE(?, descripcion),
        um                = COALESCE(?, um),
        presentacion      = COALESCE(?, presentacion),
        precio            = CASE WHEN ? IS NOT NULL THEN CAST(? AS REAL) ELSE precio END,
        detalles_tecnicos = COALESCE(?, detalles_tecnicos),
        foto_base64       = ?,
        foto_mimetype     = ?,
        activo            = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END,
        orden             = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        updated_at        = datetime('now')
      WHERE id = ?
    `).run(
      familia || null, subfamilia || null,
      subfamilia_id != null ? subfamilia_id : null, subfamilia_id != null ? parseInt(subfamilia_id) : null,
      codigo || null, marca || null, descripcion || null, um || null, presentacion || null,
      precio != null && precio !== '' ? precio : null, precio != null && precio !== '' ? parseFloat(precio) : null,
      detalles_tecnicos || null, foto_base64, foto_mimetype,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      parseInt(id)
    )

    res.json(db.prepare(`SELECT ${PROD_COLS} FROM landing_productos WHERE id = ?`).get(parseInt(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/landing/productos/:id
router.delete('/productos/:id', guard, (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM landing_productos WHERE id = ?').get(parseInt(req.params.id))
    if (!row) return res.status(404).json({ error: 'Producto no encontrado' })
    db.prepare('DELETE FROM landing_productos WHERE id = ?').run(parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── BANNERS ──────────────────────────────────────────────────────────────────

// GET /api/admin/landing/banners
router.get('/banners', guard, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, foto_mimetype, orden, activo, created_at FROM landing_banners ORDER BY orden ASC, id ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/banners
router.post('/banners', [...guard, uploadLanding.single('foto')], (req, res) => {
  try {
    const { orden = 0, activo = 1 } = req.body
    if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo de imagen (campo: foto)' })

    const foto_base64   = req.file.buffer.toString('base64')
    const foto_mimetype = req.file.mimetype

    db.prepare(`
      INSERT INTO landing_banners (foto_base64, foto_mimetype, orden, activo)
      VALUES (?,?,?,?)
    `).run(foto_base64, foto_mimetype, parseInt(orden), parseInt(activo))

    const newRow = db.prepare(
      'SELECT id, foto_mimetype, orden, activo, created_at FROM landing_banners ORDER BY rowid DESC LIMIT 1'
    ).get()
    res.status(201).json(newRow)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/banners/:id
router.put('/banners/:id', [...guard, uploadLanding.single('foto')], (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT id, foto_base64, foto_mimetype FROM landing_banners WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Banner no encontrado' })

    const { orden, activo } = req.body

    const foto_base64   = req.file ? req.file.buffer.toString('base64') : existing.foto_base64
    const foto_mimetype = req.file ? req.file.mimetype : existing.foto_mimetype

    db.prepare(`
      UPDATE landing_banners SET
        foto_base64   = ?,
        foto_mimetype = ?,
        orden         = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        activo        = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END
      WHERE id = ?
    `).run(
      foto_base64, foto_mimetype,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      parseInt(id)
    )

    res.json(db.prepare(
      'SELECT id, foto_mimetype, orden, activo, created_at FROM landing_banners WHERE id = ?'
    ).get(parseInt(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/landing/banners/:id
router.delete('/banners/:id', guard, (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM landing_banners WHERE id = ?').get(parseInt(req.params.id))
    if (!row) return res.status(404).json({ error: 'Banner no encontrado' })
    db.prepare('DELETE FROM landing_banners WHERE id = ?').run(parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
