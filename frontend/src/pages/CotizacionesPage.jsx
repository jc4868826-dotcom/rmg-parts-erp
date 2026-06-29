import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, FileText, Send, Check, X, Clock } from 'lucide-react'

const ESTADOS = [
  { key: '', label: 'Todos' },
  { key: 'borrador', label: 'Borrador' },
  { key: 'enviada', label: 'Enviadas' },
  { key: 'aprobada', label: 'Aprobadas' },
  { key: 'rechazada', label: 'Rechazadas' },
]

const ESTADO_STYLES = {
  borrador:  { label: 'Borrador',  icon: Clock,   bg: 'rgba(90,143,168,0.12)', color: 'rgba(90,143,168,0.9)' },
  enviada:   { label: 'Enviada',   icon: Send,    bg: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)' },
  aprobada:  { label: 'Aprobada', icon: Check,   bg: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' },
  rechazada: { label: 'Rechazada', icon: X,      bg: 'rgba(224,90,78,0.12)',  color: 'var(--rmg-red)' },
  vencida:   { label: 'Vencida',   icon: Clock,   bg: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)' },
}

export default function CotizacionesPage() {
  const [estadoFiltro, setFiltro] = useState('')
  const navigate = useNavigate()

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones', estadoFiltro],
    queryFn: () => api.get('/cotizaciones', { params: { estado: estadoFiltro || undefined } }).then(r => r.data),
  })

  const total = cotizaciones.reduce((s, c) => s + c.total, 0)
  const aprobadas = cotizaciones.filter(c => c.estado === 'aprobada')
  const totalAprobado = aprobadas.reduce((s, c) => s + c.total, 0)

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Cotizaciones</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Gestión de propuestas comerciales B2B</p>
        </div>
        <button onClick={() => navigate('/cotizaciones/nueva')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva cotización
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Total cotizaciones</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{cotizaciones.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(total)} en pipeline</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Aprobadas</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-teal)' }}>{aprobadas.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(totalAprobado)} confirmado</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Tasa de cierre</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>
            {cotizaciones.length ? Math.round((aprobadas.length / cotizaciones.length) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Filtros estado */}
      <div className="flex gap-1 flex-wrap">
        {ESTADOS.map(e => (
          <button key={e.key} onClick={() => setFiltro(e.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={estadoFiltro === e.key
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
            }>
            {e.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              {['N° Cotización', 'Cliente', 'Estado', 'Neto', 'IVA', 'Total', 'Fecha', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                    ))}
                  </tr>
                ))
              : cotizaciones.map((c, i) => {
                  const est = ESTADO_STYLES[c.estado] || ESTADO_STYLES.borrador
                  const EstIcon = est.icon
                  return (
                    <tr key={c.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => navigate(`/cotizaciones/${c.id}`)}>
                      <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{c.numero}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{c.cliente}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 w-fit text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: est.bg, color: est.color }}>
                          <EstIcon size={11} />
                          {est.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 precio-clp text-sm" style={{ color: 'var(--rmg-off)' }}>{formatCLP(c.neto)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(c.iva)}</td>
                      <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(c.total)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button className="btn-secondary text-xs px-2 py-1" onClick={e => { e.stopPropagation() }}>PDF</button>
                          <button className="btn-secondary text-xs px-2 py-1" onClick={e => { e.stopPropagation() }}>WA</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
