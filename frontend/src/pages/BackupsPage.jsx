import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import toast from 'react-hot-toast'
import { Shield, Download, RefreshCw, Clock, HardDrive, Database, AlertTriangle, X } from 'lucide-react'

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div style={{ background: 'rgba(15, 35, 60,0.03)', border: '0.5px solid rgba(56,182,255,0.12)', borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={14} style={{ color: 'var(--rmg-blt)' }} />
        <span style={{ fontSize: 11, color: 'rgba(90,143,168,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'rgba(15, 35, 60,0.9)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(90,143,168,0.55)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function formatRelative(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)   return 'hace un momento'
  if (min < 60)  return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24)    return `hace ${h}h ${min % 60}m`
  return `hace ${Math.floor(h / 24)}d`
}

function formatNextIn(dateStr) {
  if (!dateStr) return '—'
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'próximamente'
  const min = Math.floor(diff / 60000)
  if (min < 60)  return `en ${min}m`
  return `en ${Math.floor(min / 60)}h ${min % 60}m`
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

async function downloadBlob(url, filename) {
  const resp = await api.get(url, { responseType: 'blob' })
  const objectUrl = URL.createObjectURL(resp.data)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}

export default function BackupsPage() {
  const qc = useQueryClient()
  const [restoreTarget, setRestoreTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get('/backup/list').then(r => r.data),
    refetchInterval: 60_000,
  })

  const backups     = data?.backups     || []
  const nextBackup  = data?.next_backup || null
  const diskUsage   = data?.disk_usage  || '—'
  const lastBackup  = backups[0]

  const crearMut = useMutation({
    mutationFn: () => api.post('/backup/create').then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      toast.success(`Backup creado: ${res.filename}`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear backup'),
  })

  const restaurarMut = useMutation({
    mutationFn: (filename) => api.post(`/backup/restore/${filename}`).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      setRestoreTarget(null)
      toast.success(`DB restaurada. Respaldo previo: ${res.backup_of_previous}`)
    },
    onError: (e) => {
      setRestoreTarget(null)
      toast.error(e.response?.data?.error || 'Error al restaurar')
    },
  })

  const handleDownloadCurrent = async () => {
    try {
      await downloadBlob('/backup/download-current', 'rmg_parts_live.db')
      toast.success('DB descargada')
    } catch { toast.error('Error al descargar DB') }
  }

  const handleDownload = async (filename) => {
    try {
      await downloadBlob(`/backup/download/${filename}`, filename)
    } catch { toast.error('Error al descargar backup') }
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            <Shield size={22} style={{ color: 'var(--rmg-blt)' }} /> Respaldos del sistema
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
            Backup automático cada 2 horas · últimos {backups.length} disponibles
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => crearMut.mutate()}
            disabled={crearMut.isPending}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={14} className={crearMut.isPending ? 'animate-spin' : ''} />
            {crearMut.isPending ? 'Respaldando…' : 'Respaldar ahora'}
          </button>
          <button
            onClick={handleDownloadCurrent}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Download size={14} /> Descargar DB actual
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <StatCard icon={Database}  label="Total backups"   value={isLoading ? '…' : data?.total ?? 0} />
        <StatCard icon={Clock}     label="Último backup"   value={lastBackup ? formatRelative(lastBackup.date) : '—'} sub={lastBackup?.filename} />
        <StatCard icon={RefreshCw} label="Próximo backup"  value={formatNextIn(nextBackup)} />
        <StatCard icon={HardDrive} label="Uso en disco"    value={isLoading ? '…' : diskUsage} />
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(15, 35, 60,0.02)', border: '0.5px solid rgba(56,182,255,0.12)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '0.5px solid rgba(56,182,255,0.08)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(90,143,168,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Historial de respaldos
          </span>
        </div>

        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(90,143,168,0.5)', fontSize: 13 }}>Cargando…</div>
        ) : backups.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(90,143,168,0.5)', fontSize: 13 }}>
            Sin backups disponibles. El primer respaldo se crea 10 segundos después del arranque del servidor.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 35, 60,0.02)' }}>
                {['Archivo', 'Tamaño', 'Fecha', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 11, fontWeight: 500, color: 'rgba(90,143,168,0.6)', textAlign: 'left', borderBottom: '0.5px solid rgba(56,182,255,0.08)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.filename} style={{ borderBottom: '0.5px solid rgba(56,182,255,0.05)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(15, 35, 60,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(15, 35, 60,0.75)', fontFamily: 'monospace' }}>
                    {i === 0 && <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(45,201,138,0.15)', color: '#2dc98a', padding: '1px 6px', borderRadius: 4, marginRight: 8 }}>ÚLTIMO</span>}
                    {b.filename}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(90,143,168,0.8)' }}>{b.size}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(90,143,168,0.8)', whiteSpace: 'nowrap' }}>
                    {formatDate(b.date)}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(90,143,168,0.45)' }}>{formatRelative(b.date)}</span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleDownload(b.filename)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)', border: '0.5px solid rgba(56,182,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Download size={10} /> Descargar
                      </button>
                      <button
                        onClick={() => setRestoreTarget(b)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(244,162,60,0.1)', color: '#f4a23c', border: '0.5px solid rgba(244,162,60,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <RefreshCw size={10} /> Restaurar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Warning */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: 'rgba(244,162,60,0.06)', border: '0.5px solid rgba(244,162,60,0.2)', borderRadius: 10, fontSize: 12, color: 'rgba(244,162,60,0.8)' }}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Restaurar reemplaza TODA la base de datos actual.</strong>
          {' '}Se crea un respaldo automático antes de restaurar. El servidor continúa activo durante la restauración.
        </div>
      </div>

      {/* Restore Modal */}
      {restoreTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#ffffff', border: '1px solid rgba(15,35,60,0.12)', borderRadius: 14, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 8px 32px rgba(15,35,60,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <AlertTriangle size={18} style={{ color: '#f4a23c' }} />
                <span style={{ fontWeight: 700, fontSize: 15 }}>Confirmar restauración</span>
              </div>
              <button onClick={() => setRestoreTarget(null)} style={{ background: 'none', border: 'none', color: 'rgba(90,143,168,0.6)', cursor: 'pointer' }}><X size={16}/></button>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(15, 35, 60,0.7)', marginBottom: 8 }}>
              ¿Restaurar la base de datos al estado del:
            </p>
            <p style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--rmg-blt)', background: 'rgba(56,182,255,0.06)', padding: '8px 12px', borderRadius: 8, marginBottom: 16 }}>
              {restoreTarget.filename}<br/>
              <span style={{ color: 'rgba(90,143,168,0.6)' }}>{formatDate(restoreTarget.date)}</span>
            </p>
            <p style={{ fontSize: 12, color: 'rgba(244,162,60,0.8)', marginBottom: 20 }}>
              Se creará un respaldo de la DB actual antes de restaurar.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setRestoreTarget(null)} className="btn-secondary text-sm">Cancelar</button>
              <button
                onClick={() => restaurarMut.mutate(restoreTarget.filename)}
                disabled={restaurarMut.isPending}
                style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: 'rgba(244,162,60,0.2)', color: '#f4a23c', border: '1px solid rgba(244,162,60,0.4)', cursor: restaurarMut.isPending ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {restaurarMut.isPending ? 'Restaurando…' : 'Confirmar restauración'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
