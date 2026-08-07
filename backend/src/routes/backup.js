const router   = require('express').Router()
const { authenticate, requireRole } = require('../middleware/auth')
const svc      = require('../services/backupService')
const { db }   = require('../../config/database')

const admin = [authenticate, requireRole('admin')]

// GET /api/backup/list
router.get('/list', ...admin, (req, res) => {
  try {
    const backups   = svc.listBackups()
    const diskBytes = backups.reduce((s, b) => s + b.size, 0)
    res.json({
      backups: backups.map(b => ({
        filename: b.filename,
        size:     b.sizeHuman,
        sizeBytes:b.size,
        date:     b.date,
      })),
      total:       backups.length,
      next_backup: svc.getNextBackupTime(),
      disk_usage:  svc.formatSize(diskBytes),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/backup/create
router.post('/create', ...admin, (req, res) => {
  try {
    const result = svc.createBackup('rmg_manual')
    res.json({ ok: true, filename: result.filename, size: result.sizeHuman, date: result.date })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/backup/download-current
router.get('/download-current', ...admin, (req, res) => {
  try {
    const data   = db._db.export()
    const buffer = Buffer.from(data)
    res.set({
      'Content-Type':        'application/x-sqlite3',
      'Content-Disposition': 'attachment; filename="rmg_parts_live.db"',
      'Content-Length':      buffer.length,
    })
    res.send(buffer)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/backup/download/:filename
router.get('/download/:filename', ...admin, (req, res) => {
  try {
    const { filename } = req.params
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' })
    }
    const backups = svc.listBackups()
    const found   = backups.find(b => b.filename === filename)
    if (!found) return res.status(404).json({ error: 'Backup no encontrado' })

    res.setHeader('Content-Type', 'application/x-sqlite3')
    res.download(found.path, filename)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/backup/restore/:filename
router.post('/restore/:filename', ...admin, (req, res) => {
  try {
    const { filename } = req.params
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Nombre de archivo inválido' })
    }

    // Crear backup de la DB actual ANTES de restaurar
    const preRestore = svc.createBackup('pre_restore')

    svc.restoreFromBackup(filename)

    res.json({
      ok: true,
      restored_from:       filename,
      backup_of_previous:  preRestore.filename,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
