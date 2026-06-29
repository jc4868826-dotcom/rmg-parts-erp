import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { labelSegmento, colorSegmento, formatFecha } from '@utils/format'
import { Search, Plus, Users, ChevronRight } from 'lucide-react'

const ETAPA_STYLES = {
  prospecto:   { label: 'Prospecto',   bg: 'rgba(90,143,168,0.15)', color: 'rgba(90,143,168,0.9)' },
  contactado:  { label: 'Contactado',  bg: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)' },
  cotizado:    { label: 'Cotizado',    bg: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)' },
  negociando:  { label: 'Negociando',  bg: 'rgba(123,97,196,0.12)', color: 'var(--rmg-purple)' },
  cliente:     { label: 'Cliente',     bg: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' },
}

export default function ClientesPage() {
  const [search, setSearch]   = useState('')
  const [segFiltro, setFiltro] = useState('')
  const navigate              = useNavigate()

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes', segFiltro],
    queryFn: () => api.get('/clientes', { params: { segmento: segFiltro || undefined } }).then(r => r.data),
  })

  const filtered = clientes.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.razon_social.toLowerCase().includes(q) || c.contacto_nombre?.toLowerCase().includes(q) || c.rut?.includes(q)
  })

  const stats = {
    total: clientes.length,
    talleres: clientes.filter(c => c.segmento === 'taller').length,
    flotas: clientes.filter(c => c.segmento === 'flota').length,
    concesionarios: clientes.filter(c => c.segmento === 'concesionario').length,
    construccion: clientes.filter(c => c.segmento === 'construccion').length,
  }

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Cartera activa B2B — 4 segmentos</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'var(--rmg-blt)' },
          { label: 'Talleres', value: stats.talleres, color: 'var(--seg-taller)' },
          { label: 'Flotas', value: stats.flotas, color: 'var(--seg-flota)' },
          { label: 'Concesionarios', value: stats.concesionarios, color: 'var(--seg-concesionario)' },
          { label: 'Construcción', value: stats.construccion, color: 'var(--seg-construccion)' },
        ].map(s => (
          <div key={s.label} className="rmg-card p-4 text-center cursor-pointer hover:border-blue-500/30 transition-all"
            onClick={() => setFiltro(s.label === 'Total' ? '' : s.label.toLowerCase().replace('ó', 'o').replace('é', 'e'))}>
            <div className="font-black text-2xl" style={{ color: s.color }}>{isLoading ? '—' : s.value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }} />
        <input className="rmg-input pl-9" placeholder="Buscar por razón social, contacto o RUT..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              {['Razón social', 'Segmento', 'Etapa', 'Contacto', 'Comuna', 'Saldo CxC', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                    ))}
                  </tr>
                ))
              : filtered.map((c, i) => {
                  const etapa = ETAPA_STYLES[c.etapa_pipeline] || ETAPA_STYLES.prospecto
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                      onClick={() => navigate(`/clientes/${c.id}`)}>
                      <td className="px-4 py-3">
                        <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{c.razon_social}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{c.rut}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge-${c.segmento}`}>{labelSegmento(c.segmento)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: etapa.bg, color: etapa.color }}>
                          {etapa.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div style={{ color: 'var(--rmg-off)' }}>{c.contacto_nombre}</div>
                        <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{c.contacto_cargo}</div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{c.comuna}</td>
                      <td className="px-4 py-3">
                        {c.saldo_pendiente > 0
                          ? <span className="font-semibold precio-clp text-sm" style={{ color: 'var(--rmg-gold)' }}>
                              ${(c.saldo_pendiente / 1000).toFixed(0)}K
                            </span>
                          : <span style={{ color: 'var(--rmg-muted)' }}>—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight size={16} style={{ color: 'var(--rmg-muted)' }} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Users size={32} className="mx-auto mb-3 opacity-30" />
            <p>No se encontraron clientes</p>
          </div>
        )}
      </div>
    </div>
  )
}
