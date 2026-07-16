/**
 * RMG Landing — Rutas admin (protegidas con JWT + rol admin)
 * Fotos 100% estáticas servidas desde el repo (landing/assets/img/).
 * No se gestiona ninguna foto desde el admin.
 */

const express = require('express')
const router  = express.Router()
const { db }  = require('../../config/database')
const { authenticate, requireRole } = require('../middleware/auth')

const guard = [authenticate, requireRole('admin')]

// ─── FAMILIAS ─────────────────────────────────────────────────────────────────

const VALID_FAMILIAS = ['NEUMATICOS', 'BATERIAS', 'LUBRICANTES']

// GET /api/admin/landing/familias
router.get('/familias', guard, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT familia, foto_path, updated_at FROM landing_familias ORDER BY familia ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── SUBFAMILIAS ──────────────────────────────────────────────────────────────

// GET /api/admin/landing/subfamilias
router.get('/subfamilias', guard, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, familia, nombre, descripcion, orden, activo, created_at, updated_at FROM landing_subfamilias ORDER BY familia ASC, orden ASC, id ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/subfamilias
router.post('/subfamilias', guard, (req, res) => {
  try {
    const { familia, nombre, descripcion, orden = 0, activo = 1 } = req.body
    if (!familia) return res.status(400).json({ error: 'familia es requerida' })
    if (!nombre)  return res.status(400).json({ error: 'nombre es requerido' })

    db.prepare(`
      INSERT INTO landing_subfamilias (familia, nombre, descripcion, orden, activo)
      VALUES (?,?,?,?,?)
    `).run(familia, nombre, descripcion || null, parseInt(orden), parseInt(activo))

    const newRow = db.prepare(
      'SELECT id, familia, nombre, descripcion, orden, activo, created_at, updated_at FROM landing_subfamilias ORDER BY rowid DESC LIMIT 1'
    ).get()
    res.status(201).json(newRow)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/subfamilias/:id
router.put('/subfamilias/:id', guard, (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT id FROM landing_subfamilias WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Subfamilia no encontrada' })

    const { familia, nombre, descripcion, orden, activo } = req.body

    db.prepare(`
      UPDATE landing_subfamilias SET
        familia      = COALESCE(?, familia),
        nombre       = COALESCE(?, nombre),
        descripcion  = COALESCE(?, descripcion),
        orden        = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        activo       = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END,
        updated_at   = datetime('now')
      WHERE id = ?
    `).run(
      familia || null, nombre || null, descripcion || null,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      parseInt(id)
    )

    res.json(db.prepare(
      'SELECT id, familia, nombre, descripcion, orden, activo, created_at, updated_at FROM landing_subfamilias WHERE id = ?'
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

const PRODUCTO_COLS = 'id, familia, subfamilia, subfamilia_id, codigo, marca, descripcion, um, presentacion, precio, detalles_tecnicos, activo, orden, created_at, updated_at'

// GET /api/admin/landing/productos
router.get('/productos', guard, (req, res) => {
  try {
    const rows = db.prepare(`SELECT ${PRODUCTO_COLS} FROM landing_productos ORDER BY orden ASC, id ASC`).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/productos
router.post('/productos', guard, (req, res) => {
  try {
    const { familia, subfamilia, subfamilia_id, codigo, marca,
            descripcion, um, presentacion,
            precio, detalles_tecnicos, activo = 1, orden = 0 } = req.body
    if (!descripcion) return res.status(400).json({ error: 'descripcion es requerida' })

    db.prepare(`
      INSERT INTO landing_productos
        (familia, subfamilia, subfamilia_id, codigo, marca, descripcion, um, presentacion,
         precio, detalles_tecnicos, activo, orden)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      familia || null,
      subfamilia || null,
      subfamilia_id ? parseInt(subfamilia_id) : null,
      codigo || null,
      marca || null,
      descripcion,
      um || null,
      presentacion || null,
      precio != null && precio !== '' ? parseFloat(precio) : null,
      detalles_tecnicos || null,
      parseInt(activo), parseInt(orden)
    )

    const newRow = db.prepare(`SELECT ${PRODUCTO_COLS} FROM landing_productos ORDER BY rowid DESC LIMIT 1`).get()
    res.status(201).json(newRow)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/productos/:id
router.put('/productos/:id', guard, (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT id FROM landing_productos WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' })

    const { familia, subfamilia, subfamilia_id, codigo, marca,
            descripcion, um, presentacion,
            precio, detalles_tecnicos, activo, orden } = req.body

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
        activo            = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END,
        orden             = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        updated_at        = datetime('now')
      WHERE id = ?
    `).run(
      familia || null,
      subfamilia || null,
      subfamilia_id != null ? subfamilia_id : null, subfamilia_id != null ? parseInt(subfamilia_id) : null,
      codigo || null,
      marca || null,
      descripcion || null,
      um || null,
      presentacion || null,
      precio != null && precio !== '' ? precio : null, precio != null && precio !== '' ? parseFloat(precio) : null,
      detalles_tecnicos || null,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      parseInt(id)
    )

    res.json(db.prepare(`SELECT ${PRODUCTO_COLS} FROM landing_productos WHERE id = ?`).get(parseInt(id)))
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
      'SELECT id, orden, activo, created_at FROM landing_banners ORDER BY orden ASC, id ASC'
    ).all()
    res.json(rows)
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
