/**
 * RMG Landing — Rutas admin (protegidas con JWT + rol admin)
 * GET/POST/PUT/DELETE /api/admin/landing/productos
 * GET/POST/PUT/DELETE /api/admin/landing/banners
 */

const express = require('express')
const path    = require('path')
const fs      = require('fs')
const router  = express.Router()
const { db }  = require('../../config/database')
const { authenticate, requireRole } = require('../middleware/auth')
const { uploadProducto, uploadBanner, uploadSubfamilia, UPLOADS_DIR } = require('../middleware/upload')

const guard = [authenticate, requireRole('admin')]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deleteFile(relPath) {
  if (!relPath) return
  try {
    const abs = path.join(UPLOADS_DIR, relPath)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch (_) {}
}

function lastInsertedProducto() {
  return db.prepare('SELECT * FROM landing_productos ORDER BY rowid DESC LIMIT 1').get()
}

function lastInsertedBanner() {
  return db.prepare('SELECT * FROM landing_banners ORDER BY rowid DESC LIMIT 1').get()
}

function lastInsertedSubfamilia() {
  return db.prepare('SELECT * FROM landing_subfamilias ORDER BY rowid DESC LIMIT 1').get()
}

// ─── SUBFAMILIAS ──────────────────────────────────────────────────────────────

// GET /api/admin/landing/subfamilias
router.get('/subfamilias', guard, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM landing_subfamilias ORDER BY familia ASC, orden ASC, id ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/subfamilias
router.post('/subfamilias', [...guard, uploadSubfamilia.single('foto')], (req, res) => {
  try {
    const { familia, nombre, descripcion, orden = 0, activo = 1 } = req.body
    if (!familia) return res.status(400).json({ error: 'familia es requerida' })
    if (!nombre)  return res.status(400).json({ error: 'nombre es requerido' })

    const foto_path = req.file ? 'subfamilias/' + req.file.filename : null

    db.prepare(`
      INSERT INTO landing_subfamilias (familia, nombre, foto_path, descripcion, orden, activo)
      VALUES (?,?,?,?,?,?)
    `).run(familia, nombre, foto_path, descripcion || null, parseInt(orden), parseInt(activo))

    res.status(201).json(lastInsertedSubfamilia())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/subfamilias/:id
router.put('/subfamilias/:id', [...guard, uploadSubfamilia.single('foto')], (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT * FROM landing_subfamilias WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Subfamilia no encontrada' })

    const { familia, nombre, descripcion, orden, activo } = req.body

    let foto_path = existing.foto_path
    if (req.file) {
      deleteFile(existing.foto_path)
      foto_path = 'subfamilias/' + req.file.filename
    }

    db.prepare(`
      UPDATE landing_subfamilias SET
        familia     = COALESCE(?, familia),
        nombre      = COALESCE(?, nombre),
        descripcion = COALESCE(?, descripcion),
        foto_path   = ?,
        orden       = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        activo      = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END,
        updated_at  = datetime('now')
      WHERE id = ?
    `).run(
      familia || null, nombre || null, descripcion || null,
      foto_path,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      parseInt(id)
    )

    res.json(db.prepare('SELECT * FROM landing_subfamilias WHERE id = ?').get(parseInt(id)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/landing/subfamilias/:id
router.delete('/subfamilias/:id', guard, (req, res) => {
  try {
    const row = db.prepare('SELECT foto_path FROM landing_subfamilias WHERE id = ?').get(parseInt(req.params.id))
    if (!row) return res.status(404).json({ error: 'Subfamilia no encontrada' })
    deleteFile(row.foto_path)
    db.prepare('DELETE FROM landing_subfamilias WHERE id = ?').run(parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── PRODUCTOS ────────────────────────────────────────────────────────────────

// GET /api/admin/landing/productos
router.get('/productos', guard, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM landing_productos ORDER BY orden ASC, id ASC'
    ).all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/productos
router.post('/productos', [...guard, uploadProducto.single('foto')], (req, res) => {
  try {
    const { familia, subfamilia, descripcion, um, presentacion,
            precio, detalles_tecnicos, activo = 1, orden = 0 } = req.body
    if (!descripcion) return res.status(400).json({ error: 'descripcion es requerida' })

    const foto_path = req.file ? 'productos/' + req.file.filename : null

    db.prepare(`
      INSERT INTO landing_productos
        (familia, subfamilia, descripcion, um, presentacion,
         precio, detalles_tecnicos, foto_path, activo, orden)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      familia || null, subfamilia || null, descripcion,
      um || null, presentacion || null,
      precio != null ? parseFloat(precio) : null,
      detalles_tecnicos || null,
      foto_path, parseInt(activo), parseInt(orden)
    )

    const newRow = lastInsertedProducto()
    res.status(201).json(newRow)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/productos/:id
router.put('/productos/:id', [...guard, uploadProducto.single('foto')], (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT * FROM landing_productos WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' })

    const { familia, subfamilia, descripcion, um, presentacion,
            precio, detalles_tecnicos, activo, orden } = req.body

    let foto_path = existing.foto_path
    if (req.file) {
      deleteFile(existing.foto_path)
      foto_path = 'productos/' + req.file.filename
    }

    db.prepare(`
      UPDATE landing_productos SET
        familia           = COALESCE(?, familia),
        subfamilia        = COALESCE(?, subfamilia),
        descripcion       = COALESCE(?, descripcion),
        um                = COALESCE(?, um),
        presentacion      = COALESCE(?, presentacion),
        precio            = CASE WHEN ? IS NOT NULL THEN CAST(? AS REAL) ELSE precio END,
        detalles_tecnicos = COALESCE(?, detalles_tecnicos),
        foto_path         = ?,
        activo            = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END,
        orden             = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        updated_at        = datetime('now')
      WHERE id = ?
    `).run(
      familia || null, subfamilia || null, descripcion || null,
      um || null, presentacion || null,
      precio != null ? precio : null, precio != null ? parseFloat(precio) : null,
      detalles_tecnicos || null,
      foto_path,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      parseInt(id)
    )

    const updated = db.prepare('SELECT * FROM landing_productos WHERE id = ?').get(parseInt(id))
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/landing/productos/:id
router.delete('/productos/:id', guard, (req, res) => {
  try {
    const row = db.prepare('SELECT foto_path FROM landing_productos WHERE id = ?').get(parseInt(req.params.id))
    if (!row) return res.status(404).json({ error: 'Producto no encontrado' })
    deleteFile(row.foto_path)
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
    const rows = db.prepare('SELECT * FROM landing_banners ORDER BY orden ASC, id ASC').all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/landing/banners
router.post('/banners', [...guard, uploadBanner.single('foto')], (req, res) => {
  try {
    const { orden = 0, activo = 1 } = req.body
    if (!req.file) return res.status(400).json({ error: 'Se requiere un archivo de imagen (campo: foto)' })

    const foto_path = 'banners/' + req.file.filename

    db.prepare(`
      INSERT INTO landing_banners (foto_path, orden, activo)
      VALUES (?,?,?)
    `).run(foto_path, parseInt(orden), parseInt(activo))

    const newRow = lastInsertedBanner()
    res.status(201).json(newRow)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/admin/landing/banners/:id
router.put('/banners/:id', [...guard, uploadBanner.single('foto')], (req, res) => {
  try {
    const { id } = req.params
    const existing = db.prepare('SELECT * FROM landing_banners WHERE id = ?').get(parseInt(id))
    if (!existing) return res.status(404).json({ error: 'Banner no encontrado' })

    const { orden, activo } = req.body

    let foto_path = existing.foto_path
    if (req.file) {
      deleteFile(existing.foto_path)
      foto_path = 'banners/' + req.file.filename
    }

    db.prepare(`
      UPDATE landing_banners SET
        foto_path = ?,
        orden     = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE orden END,
        activo    = CASE WHEN ? IS NOT NULL THEN CAST(? AS INTEGER) ELSE activo END
      WHERE id = ?
    `).run(
      foto_path,
      orden  != null ? orden  : null, orden  != null ? parseInt(orden)  : null,
      activo != null ? activo : null, activo != null ? parseInt(activo) : null,
      parseInt(id)
    )

    const updated = db.prepare('SELECT * FROM landing_banners WHERE id = ?').get(parseInt(id))
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/admin/landing/banners/:id
router.delete('/banners/:id', guard, (req, res) => {
  try {
    const row = db.prepare('SELECT foto_path FROM landing_banners WHERE id = ?').get(parseInt(req.params.id))
    if (!row) return res.status(404).json({ error: 'Banner no encontrado' })
    deleteFile(row.foto_path)
    db.prepare('DELETE FROM landing_banners WHERE id = ?').run(parseInt(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
