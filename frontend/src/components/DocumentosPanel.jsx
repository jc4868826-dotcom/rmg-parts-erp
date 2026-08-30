import { useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { Paperclip, Upload, Trash2, FileText, Image as ImageIcon, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'

const ICONO = { pdf: FileText, excel: FileSpreadsheet, imagen: ImageIcon }

// Panel reutilizable de documentos adjuntos (PDF / Excel / imagen).
// Se usa en cotización, pedido, venta y orden de compra — cualquier punto
// donde se crea o recibe un documento debe poder adjuntar el respaldo.
export default function DocumentosPanel({ entidad, entidadId, titulo = 'Documentos' }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const habilitado = Boolean(entidadId)

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documentos', entidad, entidadId],
    queryFn: () => api.get(`/documentos/${entidad}/${entidadId}`).then(r => r.data),
    enabled: habilitado,
  })

  const subirMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('archivo', file)
      // No fijamos Content-Type a mano: el navegador debe generar el boundary del multipart.
      return api.post(`/documentos/${entidad}/${entidadId}`, fd).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documentos', entidad, entidadId] })
      toast.success('Documento adjuntado')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al subir documento'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/documentos/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documentos', entidad, entidadId] })
      toast.success('Documento eliminado')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar documento'),
  })

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (file) subirMut.mutate(file)
    e.target.value = ''
  }

  if (!habilitado) return null

  return (
    <div className="rmg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
          <Paperclip size={13}/> {titulo} {docs.length > 0 && `(${docs.length})`}
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={subirMut.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blue)', border: '1px solid rgba(56,182,255,0.2)' }}>
          <Upload size={13}/> {subirMut.isPending ? 'Subiendo…' : 'Adjuntar PDF, Excel o imagen'}
        </button>
        <input ref={fileRef} type="file" hidden accept=".pdf,.xls,.xlsx,.csv,image/*" onChange={handleFile} />
      </div>

      {isLoading && <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>}

      {!isLoading && docs.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Sin documentos adjuntos aún</div>
      )}

      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map(d => {
            const Icon = ICONO[d.tipo] || FileText
            return (
              <div key={d.id} className="flex items-center justify-between text-xs rounded-lg px-3 py-2"
                style={{ background: 'rgba(15, 35, 60,0.02)', border: '1px solid rgba(15, 35, 60,0.05)' }}>
                <a href={`${api.defaults.baseURL}/documentos/archivo/${d.id}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 flex-1 min-w-0" style={{ color: 'var(--rmg-off)' }}>
                  <Icon size={14} style={{ color: 'var(--rmg-blue)', flexShrink: 0 }}/>
                  <span className="truncate">{d.nombre_archivo}</span>
                </a>
                <button type="button" onClick={() => { if (confirm('¿Eliminar este documento?')) eliminarMut.mutate(d.id) }}
                  className="p-1 rounded hover:bg-red-500/10 flex-shrink-0" style={{ color: 'var(--rmg-red)' }}>
                  <Trash2 size={12}/>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
