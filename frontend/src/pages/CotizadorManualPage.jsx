/**
 * RMG Parts — Cotizador Manual (2026-09-15, v2)
 *
 * Sube el PDF (o imagen/Word) de una solicitud de Compra Ágil/ChileCompra que
 * ya tienes descargada — junto con su código — y el sistema lo lee con IA,
 * extrae el requerimiento, lo cruza con el catálogo RMG + el conocimiento
 * técnico Vistony ya tageado, y entrega el Excel con la propuesta. Fallback
 * directo cuando la API oficial no trae o no puede leer un código puntual
 * (ver Cotizador/Evaluador, que sí consultan la API sola).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '@utils/api'
import { Calculator, Upload, Download, Trash2, AlertTriangle, FileText } from 'lucide-react'

export default function CotizadorManualPage() {
  const queryClient = useQueryClient()
  const [codigo, setCodigo] = useState('')
  const [archivos, setArchivos] = useState([])
  const [seleccionada, setSeleccionada] = useState(null)

  const { data: lista } = useQuery({
    queryKey: ['cotizador-manual'],
    queryFn: () => api.get('/cotizador-manual').then(r => r.data),
  })

  const subirMut = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('codigo', codigo.trim())
      archivos.forEach(f => fd.append('documentos', f))
      return api.post('/cotizador-manual/subir', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
    onSuccess: (op) => {
      queryClient.invalidateQueries({ queryKey: ['cotizador-manual'] })
      setSeleccionada(op)
      setCodigo('')
      setArchivos([])
      const alertas = op.items.filter(it => it.observacion?.includes('⚠')).length
      toast.success(alertas > 0 ? `Analizado — ${alertas} ítem(s) con alerta técnica` : 'Analizado')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al analizar'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/cotizador-manual/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizador-manual'] })
      setSeleccionada(null)
      toast.success('Eliminado')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar'),
  })

  const descargarExcel = async (op) => {
    const res = await api.get(`/cotizador-manual/${op.id}/excel`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `CotizadorManual_${op.codigo_externo}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const analizar = () => {
    if (!codigo.trim()) return toast.error('Escribe el código de la Compra Ágil/ChileCompra')
    if (!archivos.length) return toast.error('Sube al menos un PDF/imagen/Word del requerimiento')
    subirMut.mutate()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(21,104,184,0.12)' }}>
          <Calculator size={20} style={{ color: 'var(--rmg-blue)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--rmg-text)' }}>Cotizador Manual</h1>
          <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Sube el código + el PDF de una solicitud de Compra Ágil/ChileCompra que ya tengas descargada — la IA extrae el requerimiento y lo cruza con el catálogo y el conocimiento técnico Vistony.
          </p>
        </div>
      </div>

      {/* Subir */}
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--rmg-border)', background: 'var(--rmg-surface)' }}>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Código (ej. 1493-495-COT26)"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm w-56"
            style={{ borderColor: 'var(--rmg-border)' }}
          />
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer flex-1 min-w-[240px]" style={{ borderColor: 'var(--rmg-border)', color: 'var(--rmg-muted)' }}>
            <Upload size={14} />
            {archivos.length ? `${archivos.length} archivo(s) seleccionado(s)` : 'Adjuntar PDF / imagen / Word'}
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,image/*"
              className="hidden"
              onChange={e => setArchivos(Array.from(e.target.files || []))}
            />
          </label>
          <button
            onClick={analizar}
            disabled={subirMut.isPending}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ background: 'var(--rmg-blue)' }}
          >
            {subirMut.isPending ? 'Analizando…' : 'Analizar'}
          </button>
        </div>
      </div>

      {/* Resultado recién analizado o seleccionado de la lista */}
      {seleccionada && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--rmg-border)', background: 'var(--rmg-surface)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--rmg-border)' }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--rmg-text)' }}>{seleccionada.codigo_externo} — {seleccionada.organismo_nombre || seleccionada.nombre}</div>
              <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{seleccionada.items?.length || 0} ítem(s)</div>
            </div>
            <button onClick={() => descargarExcel(seleccionada)} className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--rmg-teal)' }}>
              <Download size={14} /> Descargar Excel
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--rmg-border)' }}>
            {(seleccionada.items || []).map((it, idx) => {
              const tieneAlerta = it.observacion?.includes('⚠')
              return (
                <div key={idx} className="px-4 py-3 space-y-1" style={tieneAlerta ? { background: 'rgba(192,0,0,0.04)' } : undefined}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium flex-1 min-w-[200px]" style={{ color: 'var(--rmg-text)' }}>{it.descripcion_solicitada}</span>
                    <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>x{it.cantidad ?? '—'} {it.unidad || ''}</span>
                    {tieneAlerta && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#FFC7CE', color: '#9C0006' }}>
                        <AlertTriangle size={11} /> Alerta técnica
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                    SKU propuesto: {it.sku_match || 'sin coincidencia'} {it.precio_venta_sugerido ? `· $${Number(it.precio_venta_sugerido).toLocaleString('es-CL')}` : ''}
                  </div>
                  {it.observacion && (
                    <div className="text-xs italic" style={{ color: tieneAlerta ? '#9C0006' : 'var(--rmg-muted)' }}>{it.observacion}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lista de análisis anteriores */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--rmg-border)', background: 'var(--rmg-surface)' }}>
        <div className="px-4 py-3 border-b text-sm font-semibold" style={{ borderColor: 'var(--rmg-border)', color: 'var(--rmg-text)' }}>Analizados</div>
        <div className="divide-y" style={{ borderColor: 'var(--rmg-border)' }}>
          {(lista || []).length === 0 && (
            <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--rmg-muted)' }}>Nada analizado todavía</div>
          )}
          {(lista || []).map(op => (
            <div key={op.id} className="px-4 py-3 flex items-center justify-between">
              <button onClick={() => api.get(`/cotizador-manual/${op.id}`).then(r => setSeleccionada(r.data))} className="text-left flex items-center gap-2">
                <FileText size={14} style={{ color: 'var(--rmg-blue)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--rmg-text)' }}>{op.codigo_externo}</span>
                <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{op.organismo_nombre || op.nombre}</span>
              </button>
              <button onClick={() => eliminarMut.mutate(op.id)} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: 'var(--rmg-muted)' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
