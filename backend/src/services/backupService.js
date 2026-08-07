const path = require('path')
const fs   = require('fs')

const IS_RENDER   = !!process.env.RENDER
const BACKUP_DIR  = IS_RENDER
  ? '/var/data/backups'
  : path.join(__dirname, '../../../data/backups')
const DB_PATH     = process.env.DB_PATH || '/var/data/rmg_parts.db'
const MAX_BACKUPS = 24
const BACKUP_INTERVAL = 2 * 60 * 60 * 1000   // 2 horas

let _db  = null   // SQLiteWrapper instance
let _SQL = null   // sql.js SQL constructor
let _nextBackupTime = null

// ─── helpers ─────────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

function formatSize(bytes) {
  if (bytes < 1024)            return `${bytes} B`
  if (bytes < 1024 * 1024)     return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getTimestamp() {
  const now = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}`
}

// ─── listBackups — sincrónico, usado también desde database.js durante arranque ──

function listBackups() {
  ensureDir()
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db') && !f.endsWith('.tmp'))
      .map(filename => {
        const filepath = path.join(BACKUP_DIR, filename)
        try {
          const stat = fs.statSync(filepath)
          return {
            filename,
            path: filepath,
            size: stat.size,
            sizeHuman: formatSize(stat.size),
            date: stat.mtime.toISOString(),
            mtime: stat.mtime.getTime(),
          }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
  } catch { return [] }
}

// ─── createBackup ─────────────────────────────────────────────────────────────

function createBackup(prefix = 'rmg_backup') {
  if (!_db || !_db._db) throw new Error('DB no inicializada')
  ensureDir()

  const filename = `${prefix}_${getTimestamp()}.db`
  const filepath = path.join(BACKUP_DIR, filename)

  const data   = _db._db.export()
  const buffer = Buffer.from(data)

  if (buffer.length < 100) throw new Error('Export inválido: buffer demasiado pequeño')

  // Escritura atómica: .tmp → rename
  const tmp = filepath + '.tmp'
  fs.writeFileSync(tmp, buffer)
  fs.renameSync(tmp, filepath)

  const sizeKB = Math.round(buffer.length / 1024)
  console.log(`✅ Backup creado: ${filename} (${sizeKB} KB)`)

  pruneOldBackups()
  _nextBackupTime = new Date(Date.now() + BACKUP_INTERVAL)

  return { filename, filepath, size: buffer.length, sizeHuman: formatSize(buffer.length), date: new Date().toISOString() }
}

// ─── pruneOldBackups ─────────────────────────────────────────────────────────

function pruneOldBackups() {
  const all = listBackups()
  for (const b of all.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(b.path)
      console.log(`🗑️ Backup antiguo eliminado: ${b.filename}`)
    } catch (_) {}
  }
}

// ─── restoreFromBackup ───────────────────────────────────────────────────────

function restoreFromBackup(filename) {
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Nombre de archivo inválido')
  }

  const filepath = path.join(BACKUP_DIR, filename)
  if (!fs.existsSync(filepath)) throw new Error(`Backup no encontrado: ${filename}`)
  if (!_db || !_SQL) throw new Error('Servicio de backup no inicializado')

  const buffer      = fs.readFileSync(filepath)
  const newSqlJsDb  = new _SQL.Database(buffer)

  const oldSqlJsDb = _db._db
  _db._db = newSqlJsDb
  try { oldSqlJsDb.close() } catch (_) {}

  // Guardar al disco con escritura atómica
  const data    = newSqlJsDb.export()
  const buf     = Buffer.from(data)
  const tmp     = DB_PATH + '.tmp'
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, DB_PATH)

  console.log(`⚠️ DB restaurada desde backup: ${filename}`)
}

// ─── init — llamado desde database.js después de initDB() ────────────────────

function init(dbInstance, sqlConstructor) {
  _db  = dbInstance
  _SQL = sqlConstructor

  ensureDir()

  // Backup inicial 10 segundos después de arrancar
  setTimeout(() => {
    try {
      createBackup()
    } catch (e) { console.warn('⚠️ Backup inicial falló:', e.message) }
  }, 10_000)

  _nextBackupTime = new Date(Date.now() + 10_000)

  // Backup cada 2 horas
  setInterval(() => {
    try {
      createBackup()
    } catch (e) { console.warn('⚠️ Backup automático falló:', e.message) }
    _nextBackupTime = new Date(Date.now() + BACKUP_INTERVAL)
  }, BACKUP_INTERVAL)

  console.log('🔄 Backup automático activado: cada 2 horas')
}

function getNextBackupTime() { return _nextBackupTime }

module.exports = {
  init, createBackup, listBackups, restoreFromBackup,
  formatSize, getNextBackupTime, BACKUP_DIR,
}
