import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { labelSegmento } from '@utils/format'
import { UserPlus, Megaphone, X } from 'lucide-react'
import toast from 'react-hot-toast'

const ETAPAS = [
  { key: 'prospecto',  label: 'Prospecto',  color: 'rgba(90,143,168,0.8)' },
  { key: 'contactado', label: 'Contactado', color: 'var(--rmg-blt)' },
  { key: 'cotizado',   label: 'Cotizado',   color: 'var(--rmg-gold)' },
  { key: 'negociando', label: 'Negociando', color: 'var(--rmg-purple)' },
  { key: 'cliente',    label: 'Cliente ✓',  color: 'var(--rmg-teal)' },
]

function ClienteCard({ cliente, navigate, isSelected, onToggle }) {
  return (
    <div
      className="rmg-card p-3.5 cursor-pointer hover:border-blue-500/30 transition-all"
      style={{ border: isSelected ? '1px solid rgba(56,182,255,0.45)' : undefined, background: isSelected ? 'rgba(56,182,255,0.05)' : undefined }}
      onClick={() => navigate(`/clientes/${cliente.id}`)}
    >
      <div className="flex items-start gap-2 mb-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(cliente.id)}
          onClick={e => e.stopPropagation()}
          style={{ accentColor: 'var(--rmg-blt)', cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
        />
        <div className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>{cliente.razon_social}</div>
      </div>
      <span className={`badge-${cliente.segmento}`}>{labelSegmento(cliente.segmento)}</span>
      {cliente.campana_nombre && (
        <div className="text-xs mt-2 px-2 py-0.5 rounded inline-block" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
          {cliente.campana_nombre}
        </div>
      )}
      {cliente.contacto_nombre && (
        <div className="text-xs mt-2" style={{ color: 'var(--rmg-muted)' }}>{cliente.contacto_nombre} · {cliente.comuna}</div>
      )}
      {cliente.saldo_pendiente > 0 && (
        <div className="text-xs mt-1 font-semibold" style={{ color: 'var(--rmg-gold)' }}>
          CxC: ${(cliente.saldo_pendiente / 1000).toFixed(0)}K
        </div>
      )}
    </div>
  )
}

export default function PipelinePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showAsignarCampana, setShowAsignarCampana] = useState(false)

  const { data: board = {}, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.get('/pipeline').then(r => r.data),
  })

  const { data: campanas = [] } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => api.get('/campanas').then(r => r.data),
  })

  const asignarMut = useMutation({
    mutationFn: (d) => api.put('/clientes/asignar-campana', d).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success(`Campaña asignada a ${res.actualizados} contactos`)
      setSelectedIds(new Set())
      setShowAsignarCampana(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al asignar campaña'),
  })

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">

      <div className="flex justify-between items-start flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Pipeline CRM</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>5 etapas · Prospecto → Cliente</p>
        </div>
        <button onClick={() => navigate('/prospeccion')} className="btn-primary flex items-center gap-2">
          <UserPlus size={16} /> Agregar prospecto
        </button>
      </div>

      {/* Floating action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 flex-shrink-0 animate-fade-in"
          style={{ background: '#ffffff', border: '1px solid rgba(21,104,184,0.35)', boxShadow: 'var(--rmg-shadow)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--rmg-blt)' }}>
            ✓ {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowAsignarCampana(true)}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <Megaphone size={12}/> Asignar campaña
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <X size={12}/> Deseleccionar
          </button>
        </div>
      )}

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1" style={{ minHeight: 0 }}>
        {ETAPAS.map(etapa => {
          const cards = board[etapa.key] || []
          return (
            <div key={etapa.key} className="flex-shrink-0 flex flex-col" style={{ width: 240 }}>
              {/* Cabecera columna */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: etapa.color }} />
                  <span className="text-sm font-semibold" style={{ color: etapa.color }}>{etapa.label}</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(15, 35, 60,0.06)', color: 'var(--rmg-muted)' }}>
                  {isLoading ? '—' : cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 flex-1 overflow-y-auto">
                {isLoading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="rmg-card p-3.5 animate-pulse">
                        <div className="h-4 rounded mb-2" style={{ background: 'rgba(15, 35, 60,0.06)' }} />
                        <div className="h-3 rounded w-2/3" style={{ background: 'rgba(15, 35, 60,0.04)' }} />
                      </div>
                    ))
                  : cards.map(c => (
                      <ClienteCard
                        key={c.id}
                        cliente={c}
                        navigate={navigate}
                        isSelected={selectedIds.has(c.id)}
                        onToggle={toggleSelect}
                      />
                    ))
                }
                {!isLoading && cards.length === 0 && (
                  <div className="text-center py-8 text-xs rounded-xl border-2 border-dashed"
                    style={{ color: 'var(--rmg-muted)', borderColor: 'rgba(15, 35, 60,0.06)' }}>
                    Sin clientes
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: Asignar campaña */}
      {showAsignarCampana && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Asignar campaña</h2>
              <button onClick={() => setShowAsignarCampana(false)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--rmg-muted)' }}>
              Asignar campaña a <strong style={{ color: 'var(--rmg-off)' }}>{selectedIds.size} contactos</strong>
            </p>
            <select className="rmg-input mb-4" id="pl-campana-select">
              <option value="">— Seleccionar campaña —</option>
              {campanas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} · {c.rubro}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAsignarCampana(false)} className="btn-secondary">Cancelar</button>
              <button
                className="btn-primary"
                disabled={asignarMut.isPending}
                onClick={() => {
                  const sel = document.getElementById('pl-campana-select')
                  const campana_id = sel.value
                  const campana_nombre = sel.options[sel.selectedIndex]?.text?.split(' · ')[0]
                  if (!campana_id) { toast.error('Selecciona una campaña'); return }
                  asignarMut.mutate({ ids: Array.from(selectedIds), campana_id, campana_nombre })
                }}
              >
                {asignarMut.isPending ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
