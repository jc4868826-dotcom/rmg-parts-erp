import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { DollarSign, AlertTriangle, Check, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

const SEG_COLOR = { taller: 'var(--rmg-blt)', flota: 'var(--rmg-teal)', concesionario: 'var(--rmg-purple)', construccion: 'var(--rmg-gold)' }
const SEG_NAME  = { taller: 'Taller', flota: 'Flota', concesionario: 'Concesionario', construccion: 'Construcción' }

const ESTADO_STYLES = {
  al_dia:  { label: 'Al día',   color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.12)',  icon: Check },
  vencida: { label: 'Vencida',  color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.12)',  icon: Clock },
  critica: { label: 'Crítica',  color: 'var(--rmg-red)',  bg: 'rgba(224,90,78,0.12)',   icon: AlertTriangle },
  cobrada: { label: 'Cobrada',  color: 'rgba(90,143,168,0.8)', bg: 'rgba(90,143,168,0.1)', icon: Check },
}

export default function CxCPage() {
  const qc = useQueryClient()
  const [filtroEstado, setFiltroEstado] = useState('')

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ['cxc', filtroEstado],
    queryFn: () => api.get('/cxc', { params: { estado: filtroEstado || undefined } }).then(r => r.data),
  })

  const { data: resumen = {} } = useQuery({
    queryKey: ['cxc-resumen'],
    queryFn: () => api.get('/cxc/resumen').then(r => r.data),
  })

  const cobrarMut = useMutation({
    mutationFn: (id) => api.post(`/cxc/${id}/cobrar`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['cxc'])
      qc.invalidateQueries(['cxc-resumen'])
      toast.success(`${data.numero} marcada como cobrada`)
    },
    onError: () => toast.error('Error al marcar como cobrada'),
  })

  const hoy = new Date()
  const facturasConDias = facturas.map(f => {
    const dias = Math.round((hoy - new Date(f.fecha_vencimiento)) / (1000 * 60 * 60 * 24))
    return { ...f, dias_vencida: dias }
  })

  const FILTROS = [
    { k: '', l: 'Todas' }, { k: 'al_dia', l: 'Al día' }, { k: 'vencida', l: 'Vencidas' }, { k: 'critica', l: 'Críticas' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      <div>
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Cuentas por Cobrar</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>CxC · Facturas emitidas · Estado de cobro</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total CxC',     value: resumen.total,   color: 'var(--rmg-blt)',  sub: `${resumen.count || 0} facturas` },
          { label: 'Al día',         value: resumen.al_dia,  color: 'var(--rmg-teal)', sub: 'dentro del plazo' },
          { label: 'Vencidas',       value: resumen.vencida, color: 'var(--rmg-gold)', sub: '+0 días' },
          { label: 'Críticas +30d',  value: resumen.critica, color: 'var(--rmg-red)',  sub: 'riesgo de incobrabilidad' },
        ].map(k => (
          <div key={k.label} className="rmg-card p-4">
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>{k.label}</div>
            <div className="font-black text-2xl precio-clp" style={{ fontFamily: 'Inter Tight, sans-serif', color: k.color }}>
              {k.value !== undefined ? formatCLP(k.value) : '—'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Barra de riesgo */}
      {resumen.total > 0 && (
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--rmg-muted)' }}>Composición de la cartera</div>
          <div className="flex h-4 rounded-full overflow-hidden gap-px">
            {[
              { val: resumen.al_dia,  color: 'var(--rmg-teal)' },
              { val: resumen.vencida, color: 'var(--rmg-gold)' },
              { val: resumen.critica, color: 'var(--rmg-red)'  },
            ].map((seg, i) => {
              const pct = resumen.total ? (seg.val / resumen.total) * 100 : 0
              return pct > 0 ? (
                <div key={i} style={{ width: `${pct}%`, background: seg.color }} title={`${pct.toFixed(0)}%`}/>
              ) : null
            })}
          </div>
          <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>
            {[
              { label: 'Al día', val: resumen.al_dia, color: 'var(--rmg-teal)' },
              { label: 'Vencida', val: resumen.vencida, color: 'var(--rmg-gold)' },
              { label: 'Crítica', val: resumen.critica, color: 'var(--rmg-red)' },
            ].map(seg => (
              <span key={seg.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: seg.color }}/>
                {seg.label}: {formatCLP(seg.val || 0)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap">
        {FILTROS.map(f => (
          <button key={f.k} onClick={() => setFiltroEstado(f.k)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={filtroEstado === f.k
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(15, 35, 60,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(15, 35, 60,0.08)' }
            }>{f.l}</button>
        ))}
      </div>

      {/* Tabla facturas */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
              {['N° Factura','Cliente','Segmento','Monto','Emisión','Vencimiento','Días','Estado',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }}/></td>
                    ))}
                  </tr>
                ))
              : facturasConDias.map((f, i) => {
                  const est = ESTADO_STYLES[f.estado] || ESTADO_STYLES.al_dia
                  const EstIcon = est.icon
                  const segColor = SEG_COLOR[f.segmento] || 'var(--rmg-muted)'
                  return (
                    <tr key={f.id}
                      style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: f.estado === 'critica' ? 'rgba(224,90,78,0.02)' : i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}>
                      <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{f.numero}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{f.cliente}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${segColor}18`, color: segColor }}>
                          {SEG_NAME[f.segmento] || f.segmento}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(f.monto)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(f.fecha_emision)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(f.fecha_vencimiento)}</td>
                      <td className="px-4 py-3 text-xs font-bold"
                        style={{ color: f.dias_vencida > 30 ? 'var(--rmg-red)' : f.dias_vencida > 0 ? 'var(--rmg-gold)' : 'var(--rmg-teal)' }}>
                        {f.dias_vencida > 0 ? `+${f.dias_vencida}d` : `${Math.abs(f.dias_vencida)}d`}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 w-fit text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: est.bg, color: est.color }}>
                          <EstIcon size={11}/>{est.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {f.estado !== 'cobrada' && (
                          <button onClick={() => cobrarMut.mutate(f.id)}
                            className="text-xs px-2 py-1 rounded-lg font-medium transition-all"
                            style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>
                            Cobrar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && facturasConDias.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <DollarSign size={32} className="mx-auto mb-3 opacity-30"/>
            <p>No hay facturas en esta categoría</p>
          </div>
        )}
      </div>
    </div>
  )
}
