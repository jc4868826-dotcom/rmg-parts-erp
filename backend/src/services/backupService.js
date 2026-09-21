const path = require('path')
const fs   = require('fs')

const IS_RENDER   = !!process.env.RENDER
const BACKUP_DIR  = IS_RENDER
  ? '/var/data/backups'
  : path.join(__dirname, '../../../data/backups')
const DB_PATH     = process.env.DB_PATH || '/var/data/rmg_parts.db'
// Bajado de cada 2h/24 respaldos (12/día, ~2.7GB en disco) a 4/día — pedido
// explícito del usuario para liberar espacio en el disco de Render (2026-09-08).
// MAX_BACKUPS=8 mantiene la misma cobertura de 48h de antes (8 × 6h = 48h),
// pero con 8 archivos en vez de 24 → ~900MB en vez de ~2.7GB para una base de
// ~114MB. Si crece la base de datos, este disco vuelve a ajustarse en la
// misma proporción — avisar si hace falta más historial (subir MAX_BACKUPS)
// o menos disco todavía (bajar más el intervalo).
const MAX_BACKUPS = 8
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000   // 6 horas → 4 respaldos/día

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
  ensureDir()

  // El archivo en disco está siempre sincronizado: _save() se llama tras cada write.
  // copyFileSync copia a nivel de OS sin cargar nada en RAM — evita OOM.
  if (!fs.existsSync(DB_PATH)) throw new Error('Archivo DB no encontrado en disco')

  const stat = fs.statSync(DB_PATH)
  if (stat.size < 100) throw new Error('Export inválido: archivo DB demasiado pequeño')

  // 2026-09-21 (incidente ENOSPC): no respaldar si no queda espacio para la copia
  // + margen para que la DB se siga guardando. Antes el intento fallido dejaba un
  // .db.tmp parcial que listBackups ignora y pruneOldBackups nunca borraba: cada
  // reinicio/intervalo sumaba basura hasta llenar el disco.
  const libre = espacioLibre()
  if (libre !== null && libre < stat.size * 3) {
    throw new Error(`Espacio insuficiente para respaldar: libre ${formatSize(libre)}, DB ${formatSize(stat.size)}`)
  }

  const filename = `${prefix}_${getTimestamp()}.db`
  const filepath = path.join(BACKUP_DIR, filename)

  const tmp = filepath + '.tmp'
  try {
    fs.copyFileSync(DB_PATH, tmp)
    fs.renameSync(tmp, filepath)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch (_) {}
    throw e
  }

  const sizeKB = Math.round(stat.size / 1024)
  console.log(`✅ Backup creado: ${filename} (${sizeKB} KB)`)

  pruneOldBackups()
  _nextBackupTime = new Date(Date.now() + BACKUP_INTERVAL)

  return { filename, filepath, size: stat.size, sizeHuman: formatSize(stat.size), date: new Date().toISOString() }
}

// ─── espacio en disco / limpieza de temporales ───────────────────────────────

function espacioLibre() {
  try {
    const st = fs.statfsSync(path.dirname(DB_PATH))   // Node >= 18.15
    return st.bavail * st.bsize
  } catch { return null }
}

// Borra .tmp huérfanos de copias/guardados fallidos (backups y DB).
function limpiarTemporales() {
  let liberado = 0
  const candidatos = []
  try { fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.tmp')).forEach(f => candidatos.push(path.join(BACKUP_DIR, f))) } catch (_) {}
  candidatos.push(DB_PATH + '.tmp')
  for (const f of candidatos) {
    try {
      const size = fs.statSync(f).size
      fs.unlinkSync(f)
      liberado += size
      console.log(`🧹 Temporal huérfano eliminado: ${path.basename(f)} (${formatSize(size)})`)
    } catch (_) {}
  }
  return liberado
}

function estadoDisco() {
  const libre = espacioLibre()
  const dbSize = (() => { try { return fs.statSync(DB_PATH).size } catch { return 0 } })()
  return {
    libre, libreHuman: libre === null ? 'desconocido' : formatSize(libre),
    db: dbSize, dbHuman: formatSize(dbSize),
    alerta: libre !== null && libre < dbSize * 3,
    errorGuardado: _db?.errorGuardado || null,
  }
}

// ─── pruneOldBackups ─────────────────────────────────────────────────────────

function pruneOldBackups() {
  limpiarTemporales()
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

  const buffer     = fs.readFileSync(filepath)
  const newSqlJsDb = new _SQL.Database(buffer)

  const oldSqlJsDb = _db._db
  _db._db = newSqlJsDb
  try { oldSqlJsDb.close() } catch (_) {}

  // Copiar el archivo de backup al DB_PATH — sin export() extra en RAM
  const tmp = DB_PATH + '.tmp'
  fs.copyFileSync(filepath, tmp)
  fs.renameSync(tmp, DB_PATH)

  console.log(`⚠️ DB restaurada desde backup: ${filename}`)
}

// ─── init — llamado desde database.js después de initDB() ────────────────────

function init(dbInstance, sqlConstructor) {
  _db  = dbInstance
  _SQL = sqlConstructor

  ensureDir()

  // Libera temporales huérfanos antes de cualquier otra escritura y avisa si el disco está al límite.
  const liberado = limpiarTemporales()
  const disco = estadoDisco()
  console.log(`💾 Disco: libre ${disco.libreHuman} · DB ${disco.dbHuman}${liberado ? ` · liberado ${formatSize(liberado)} en temporales` : ''}`)
  if (disco.alerta) console.warn('⚠️ ESPACIO EN DISCO CRÍTICO — borrar respaldos antiguos o ampliar el disco en Render')
  // Si el arranque no pudo guardar (disco lleno) y la limpieza liberó espacio, persistir ya.
  if (_db?.errorGuardado) {
    try { _db._save(); } catch (e) { console.warn('⚠️ Sigue sin poder guardar la DB:', e.message) }
  }

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

  console.log('🔄 Backup automático activado: cada 6 horas (4/día), últimos 8 respaldos')
}

function getNextBackupTime() { return _nextBackupTime }

module.exports = {
  init, createBackup, listBackups, restoreFromBackup,
  formatSize, getNextBackupTime, BACKUP_DIR, estadoDisco, limpiarTemporales,
}
