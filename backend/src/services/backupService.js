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
// 2026-09-21: bajado a 3 — con la DB en ~530MB, 8 respaldos llenaban el disco (ENOSPC).
const MAX_BACKUPS = 3
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

// Si no hay espacio para guardar la DB (necesita una copia .tmp completa), borra
// respaldos del más antiguo al más nuevo, conservando siempre `conservar`.
function liberarEspacioConRespaldos(conservar = 1) {
  const dbSize = (() => { try { return fs.statSync(DB_PATH).size } catch { return 0 } })()
  const objetivo = dbSize * 2.5   // guardar (1x) + margen de crecimiento
  const eliminados = []
  const backups = listBackups()   // más nuevo primero
  for (const b of backups.slice(conservar).reverse()) {
    const libre = espacioLibre()
    if (libre === null || libre >= objetivo) break
    try {
      fs.unlinkSync(b.path)
      eliminados.push(`${b.filename} (${b.sizeHuman})`)
      console.log(`🗑️ Respaldo eliminado por falta de espacio: ${b.filename} (${b.sizeHuman})`)
    } catch (_) {}
  }
  return eliminados
}

// Peso aproximado por tabla (suma de LENGTH de todas sus columnas) — diagnóstico de crecimiento.
function reporteTamanos(top = 12) {
  if (!_db) return []
  const tablas = _db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name)
  const out = []
  for (const t of tablas) {
    try {
      const cols = _db.prepare(`PRAGMA table_info("${t}")`).all().map(c => `COALESCE(LENGTH("${c.name}"),0)`)
      if (!cols.length) continue
      const r = _db.prepare(`SELECT COUNT(*) AS n, SUM(${cols.join('+')}) AS bytes FROM "${t}"`).get()
      out.push({ tabla: t, filas: r.n, bytes: r.bytes || 0, peso: formatSize(r.bytes || 0) })
    } catch (_) {}
  }
  out.sort((a, b) => b.bytes - a.bytes)
  // desglose de adjuntos (sospechosos habituales del crecimiento)
  const detalle = []
  try {
    detalle.push(..._db.prepare(`SELECT 'documentos_adjuntos' AS tabla, entidad || '/' || tipo AS grupo, COUNT(*) AS n,
      SUM(LENGTH(contenido_base64)) AS bytes FROM documentos_adjuntos GROUP BY entidad, tipo ORDER BY bytes DESC`).all())
  } catch (_) {}
  return { tablas: out.slice(0, top), adjuntos: detalle.map(d => ({ ...d, peso: formatSize(d.bytes || 0) })) }
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
  // Sin espacio para guardar la DB = cada cambio se pierde al reiniciar. Los respaldos
  // antiguos son prescindibles frente a eso: se liberan automáticamente (queda el más nuevo).
  const pre = estadoDisco()
  if (pre.libre !== null && pre.libre < pre.db * 2.5) liberarEspacioConRespaldos(1)
  const disco = estadoDisco()
  console.log(`💾 Disco: libre ${disco.libreHuman} · DB ${disco.dbHuman}${liberado ? ` · liberado ${formatSize(liberado)} en temporales` : ''}`)
  if (disco.alerta) console.warn('⚠️ ESPACIO EN DISCO CRÍTICO — borrar respaldos antiguos o ampliar el disco en Render')
  // Si el arranque no pudo guardar (disco lleno) y la limpieza liberó espacio, persistir ya.
  if (_db?.errorGuardado) {
    try { _db._save(); } catch (e) { console.warn('⚠️ Sigue sin poder guardar la DB:', e.message) }
  }

  // Diagnóstico de tamaño (qué tablas pesan) — una vez por arranque, diferido para no frenar el boot.
  setTimeout(() => {
    try {
      const rep = reporteTamanos()
      console.log('📊 Peso por tabla:', rep.tablas.map(t => `${t.tabla}=${t.peso} (${t.filas})`).join(' · '))
      if (rep.adjuntos.length) console.log('📎 Adjuntos:', rep.adjuntos.map(a => `${a.grupo}=${a.peso} (${a.n})`).join(' · '))
    } catch (e) { console.warn('⚠️ Reporte de tamaños falló:', e.message) }
  }, 5_000)

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

  console.log(`🔄 Backup automático activado: cada 6 horas (4/día), últimos ${MAX_BACKUPS} respaldos`)
}

function getNextBackupTime() { return _nextBackupTime }

module.exports = {
  init, createBackup, listBackups, restoreFromBackup,
  formatSize, getNextBackupTime, BACKUP_DIR, estadoDisco, limpiarTemporales,
  liberarEspacioConRespaldos, reporteTamanos,
}
