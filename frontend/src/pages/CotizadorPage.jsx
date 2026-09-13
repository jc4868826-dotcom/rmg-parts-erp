/**
 * RMG Parts — Cotizador (2026-09-13)
 *
 * Pestaña nueva y deliberadamente simple. Nace de tres fallas reales en
 * Evaluador (ver cotizadorController.js para el detalle de cada una):
 * códigos que decían "ya estaba ingresada" y no se releían, el Excel de
 * cruce mostrando datos distintos a los de la pantalla, y matches de 25-37%
 * de confianza entregados como si fueran un producto real encontrado.
 *
 * Por diseño, esta página NO tiene: estados/Kanban, checklist de
 * postulación, historial de eventos, ni fichas técnicas automáticas — nada
 * de la maquinaria de Evaluador/ChileCompra. Es solo: pegar código → Buscar
 * (siempre trae fresco, nunca dice "ya ingresada" y se detiene ahí) → ver
 * los ítems → descargar el Excel (se genera al vuelo, siempre igual a lo que
 * se ve en pantalla) → eliminar si ya no sirve.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatRelativo } from '@utils/format'
import { Search, Loader2, Calculator, MapPin, Trash2, Download, X, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const UMBRAL_CONFIANZA_LABEL = '55%'

export default function CotizadorPage() {
  const qc = useQueryClient()
  const [codigo, setCodigo] = useState('')
  const [seleccionId, setSeleccionId] = useState(null)

  const { data: cotizaciones, isLoading } = useQuery({
    queryKey: ['cotizador'],
    queryFn: () => api.get('/cotizador').then(r => r.data),
  })

  const buscarMut = useMutation({
    mutationFn: (codigo) => api.post('/cotizador/buscar', { codigo }).then(r => r.data),
    onSuccess: (op) => {
      qc.invalidateQueries({ queryKey: ['cotizador'] })
      setCodigo('')
      setSeleccionId(op.id)
      const sinMatch = (op.items || []).filter(it => !it.sku_match).length
      if (sinMatch > 0) {
        toast(`${op.codigo_externo}: ${op.items.length} ítem(s), ${sinMatch} sin match confiable — revisar a mano`, { icon: '⚠️', duration: 6000 })
      } else {
        toast.success(`${op.codigo_externo}: ${op.items?.length || 0} ítem(s) traídos y cruzados contra el catálogo`)
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'No se pudo traer el código desde Mercado Público'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/cotizador/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizador'] })
      toast.success('Cotización eliminada')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  })

  const handleBuscar = (e) => {
    e.preventDefault()
    const limpio = codigo.trim()
    if (!limpio) return toast.error('Ingresa el código (ej. 4042-130-COT26)')
    buscarMut.mutate(limpio)
  }

  const handleEliminar = (op) => {
    if (!window.confirm(`¿Eliminar la cotización ${op.codigo_externo} (${op.nombre || 'sin nombre'})? Esto no se puede deshacer.`)) return
    eliminarMut.mutate(op.id)
    if (seleccionId === op.id) setSeleccionId(null)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--rmg-off)' }}>
          <Calculator size={22} style={{ color: 'var(--rmg-blue)' }} /> Cotizador
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--rmg-muted)' }}>
          Pega el código de una Compra Ágil (ej. <code>4042-130-COT26</code>) y "Buscar" siempre trae la versión
          más reciente desde Mercado Público — no importa si ya lo habías consultado antes. Un ítem sin un match de
          al menos {UMBRAL_CONFIANZA_LABEL} de confianza queda marcado "sin match" en vez de forzar un producto
          cualquiera, y el Excel que descargas es siempre exactamente lo que ves acá abajo.
        </p>
      </div>

      <form onSubmit={handleBuscar} className="rmg-card p-4 flex flex-col sm:flex-row gap-2">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Ej: 4042-130-COT26"
          className="flex-1 px-3 py-2.5 rounded-lg text-sm border font-mono"
          style={{ borderColor: 'var(--rmg-border)' }}
        />
        <button
          type="submit"
          disabled={buscarMut.isPending}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--rmg-blue)', color: 'white' }}
        >
          {buscarMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {buscarMut.isPending ? 'Trayendo desde Mercado Público…' : 'Buscar'}
        </button>
      </form>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--rmg-muted)' }}>
          Cotizaciones ({cotizaciones?.length || 0})
        </div>
        {isLoading ? (
          <div className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>
        ) : !cotizaciones?.length ? (
          <div className="rmg-card p-6 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Aún no traes ninguna cotización. Pega un código arriba para empezar.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cotizaciones.map(op => (
              <CotizacionCard key={op.id} op={op} onClick={() => setSeleccionId(op.id)} onEliminar={() => handleEliminar(op)} />
            ))}
          </div>
        )}
      </div>

      {seleccionId && (
        <DetalleCotizacion id={seleccionId} onClose={() => setSeleccionId(null)} onEliminar={handleEliminar} />
      )}
    </div>
  )
}

function CotizacionCard({ op, onClick, onEliminar }) {
  return (
    <div className="rmg-card p-3 w-full text-left transition-all hover:shadow-md relative group">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEliminar() }}
        title="Eliminar cotización"
        className="absolute top-2 right-2 p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--rmg-red)', background: 'rgba(224,90,78,0.08)' }}
      >
        <Trash2 size={13} />
      </button>
      <button onClick={onClick} type="button" className="w-full text-left">
        <div className="text-[10px] font-mono font-semibold mb-0.5 pr-6" style={{ color: 'var(--rmg-blue)' }}>{op.codigo_externo}</div>
        <div className="text-sm font-semibold line-clamp-2 mb-1 pr-6" style={{ color: 'var(--rmg-off)' }}>{op.nombre || op.codigo_externo}</div>
        <div className="text-xs truncate mb-2" style={{ color: 'var(--rmg-muted)' }}>{op.organismo_nombre || 'Organismo no informado aún'}</div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1" style={{ color: 'var(--rmg-muted)' }}>
            <MapPin size={11} />{op.comuna || op.region || '—'}
          </span>
          {op.presupuesto_estimado != null && (
            <span className="font-bold precio-clp" style={{ color: 'var(--rmg-blt)' }}>{formatCLP(op.presupuesto_estimado)}</span>
          )}
        </div>
        {op.updated_at && (
          <div className="text-[10px] mt-1" style={{ color: 'var(--rmg-muted)' }}>Actualizado {formatRelativo(op.updated_at)}</div>
        )}
      </button>
    </div>
  )
}

function DetalleCotizacion({ id, onClose, onEliminar }) {
  const { data: op, isLoading } = useQuery({
    queryKey: ['cotizador', id],
    queryFn: () => api.get(`/cotizador/${id}`).then(r => r.data),
  })
  const [descargando, setDescargando] = useState(false)

  const handleDescargar = async () => {
    setDescargando(true)
    try {
      const res = await api.get(`/cotizador/${id}/excel`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `Cotizacion_${op?.codigo_externo || id}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      toast.error('No se pudo generar el Excel')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)' }} onClick={onClose}>
      <div className="rmg-card w-full max-w-5xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-xs font-mono font-semibold" style={{ color: 'var(--rmg-blue)' }}>{op?.codigo_externo || '…'}</div>
            <div className="text-lg font-bold" style={{ color: 'var(--rmg-off)' }}>{op?.nombre || 'Cargando…'}</div>
            <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{op?.organismo_nombre}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={handleDescargar} disabled={descargando || !op}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: 'var(--rmg-teal)', color: '#fff' }}>
              {descargando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar Excel
            </button>
            {op && (
              <button type="button" onClick={() => { onEliminar(op); onClose() }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(224,90,78,0.1)', color: 'var(--rmg-red)' }}>
                <Trash2 size={13} /> Eliminar
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--rmg-muted)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm py-8 text-center" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--rmg-blue)', color: '#fff' }}>
                  <th className="p-2 text-left">Ítem solicitado</th>
                  <th className="p-2 text-right">Cant.</th>
                  <th className="p-2 text-left">SKU RMG</th>
                  <th className="p-2 text-right">Confianza</th>
                  <th className="p-2 text-right">Costo neto</th>
                  <th className="p-2 text-right">Precio neto</th>
                  <th className="p-2 text-left">Observación</th>
                </tr>
              </thead>
              <tbody>
                {(op?.items || []).map(it => {
                  const sinMatch = !it.sku_match
                  return (
                    <tr key={it.id} style={{ background: sinMatch ? 'rgba(224,90,78,0.06)' : undefined, borderBottom: '1px solid var(--rmg-border)' }}>
                      <td className="p-2">
                        <div className="font-medium">{it.descripcion_solicitada}</div>
                        {it.especificacion_tecnica && it.especificacion_tecnica !== it.descripcion_solicitada && (
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{it.especificacion_tecnica}</div>
                        )}
                      </td>
                      <td className="p-2 text-right">{it.cantidad} {it.unidad || ''}</td>
                      <td className="p-2 font-mono">
                        {sinMatch ? (
                          <span className="flex items-center gap-1" style={{ color: 'var(--rmg-red)' }}><AlertTriangle size={11} /> sin match</span>
                        ) : it.sku_match}
                      </td>
                      <td className="p-2 text-right">{it.match_confianza != null ? `${Math.round(it.match_confianza * 100)}%` : '—'}</td>
                      <td className="p-2 text-right precio-clp">{it.costo_unitario_rmg != null ? formatCLP(it.costo_unitario_rmg) : '—'}</td>
                      <td className="p-2 text-right precio-clp">{it.precio_venta_sugerido != null ? formatCLP(it.precio_venta_sugerido) : '—'}</td>
                      <td className="p-2 text-[10px]" style={{ color: 'var(--rmg-muted)' }}>{it.observacion}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!op?.items?.length && (
              <div className="text-sm py-8 text-center" style={{ color: 'var(--rmg-muted)' }}>Esta cotización no trajo ítems.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
