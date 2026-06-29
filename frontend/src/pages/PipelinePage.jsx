import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { labelSegmento } from '@utils/format'
import { GitBranch, Plus } from 'lucide-react'

const ETAPAS = [
  { key: 'prospecto',  label: 'Prospecto',  color: 'rgba(90,143,168,0.8)' },
  { key: 'contactado', label: 'Contactado', color: 'var(--rmg-blt)' },
  { key: 'cotizado',   label: 'Cotizado',   color: 'var(--rmg-gold)' },
  { key: 'negociando', label: 'Negociando', color: 'var(--rmg-purple)' },
  { key: 'cliente',    label: 'Cliente ✓',  color: 'var(--rmg-teal)' },
]

function ClienteCard({ cliente, navigate }) {
  return (
    <div
      className="rmg-card p-3.5 cursor-pointer hover:border-blue-500/30 transition-all"
      onClick={() => navigate(`/clientes/${cliente.id}`)}
    >
      <div className="font-semibold text-sm mb-2" style={{ color: 'var(--rmg-off)' }}>{cliente.razon_social}</div>
      <span className={`badge-${cliente.segmento}`}>{labelSegmento(cliente.segmento)}</span>
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

  const { data: board = {}, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.get('/pipeline').then(r => r.data),
  })

  return (
    <div className="space-y-5 animate-fade-in h-full flex flex-col">

      <div className="flex justify-between items-start flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Pipeline CRM</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>5 etapas · Prospecto → Cliente</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Agregar prospecto
        </button>
      </div>

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
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--rmg-muted)' }}>
                  {isLoading ? '—' : cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 flex-1 overflow-y-auto">
                {isLoading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="rmg-card p-3.5 animate-pulse">
                        <div className="h-4 rounded mb-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
                      </div>
                    ))
                  : cards.map(c => <ClienteCard key={c.id} cliente={c} navigate={navigate} />)
                }
                {!isLoading && cards.length === 0 && (
                  <div className="text-center py-8 text-xs rounded-xl border-2 border-dashed"
                    style={{ color: 'var(--rmg-muted)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    Sin clientes
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
