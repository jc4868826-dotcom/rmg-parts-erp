import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { CreditCard, Check, Clock, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const ESTADO_STYLES = {
  pendiente: { label: 'Pendiente', color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.12)',  icon: Clock      },
  pagada:    { label: 'Pagada',    color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.12)',  icon: Check      },
  vencida:   { label: 'Vencida',   color: 'var(--rmg-red)',  bg: 'rgba(224,90,78,0.12)',   icon: AlertTriangle },
}

export default function CxPPage() {
  const qc = useQueryClient()
  const [filtroEstado, setFiltroEstado] = useState('')

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ['cxp', filtroEstado],
    queryFn: () => api.get('/compras/cxp', { params: { estado: filtroEstado || undefined } }).then(r => r.data),
  })

  const pagarMut = useMutation({
    mutationFn: (id) => api.post(`/compras/cxp/${id}/pagar`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['cxp'])
      toast.success(`${data.numero} marcada como pagada`)
    },
    onError: () => toast.error('Error al registrar pago'),
  })

  const hoy = new Date()
  const facturasConDias = facturas.map(f => {
    const dias = Math.round((hoy - new Date(f.fecha_vencimiento)) / (1000 * 60 * 60 * 24))
    let estado = f.estado
    if (estado === 'pendiente' && dias > 0) estado = 'vencida'
    return { ...f, dias_vencida: dias, estado_calc: estado }
  })

  const totalPendiente = facturasConDias.filter(f => f.estado !== 'pagada').reduce((s, f) => s + f.monto, 0)
  const totalPagada    = facturasConDias.filter(f => f.estado === 'pagada').reduce((s, f) => s + f.monto, 0)

  const FILTROS = [{ k: '', l: 'Todas' }, { k: 'pendiente', l: 'Pendientes' }, { k: 'pagada', l: 'Pagadas' }]

  return (
    <div className="space-y-5 animate-fade-in">

      <div>
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Cuentas por Pagar</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>CxP · Facturas de proveedores · Control de pagos</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Por pagar</div>
          <div className="font-black text-2xl precio-clp" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>
            {formatCLP(totalPendiente)}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{facturasConDias.filter(f => f.estado !== 'pagada').length} facturas pendientes</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Pagado período</div>
          <div className="font-black text-2xl precio-clp" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-teal)' }}>
            {formatCLP(totalPagada)}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{facturasConDias.filter(f => f.estado === 'pagada').length} facturas pagadas</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Total facturas</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>
            {facturas.length}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(totalPendiente + totalPagada)} acumulado</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1">
        {FILTROS.map(f => (
          <button key={f.k} onClick={() => setFiltroEstado(f.k)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={filtroEstado === f.k
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(15, 35, 60,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(15, 35, 60,0.08)' }
            }>{f.l}</button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
              {['N° Factura','Proveedor','OC Ref.','Monto','Emisión','Vencimiento','Días','Estado','Fecha pago',''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }}/></td>
                    ))}
                  </tr>
                ))
              : facturasConDias.map((f, i) => {
                  const est = ESTADO_STYLES[f.estado_calc] || ESTADO_STYLES.pendiente
                  const EstIcon = est.icon
                  return (
                    <tr key={f.id}
                      style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}>
                      <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{f.numero}</td>
                      <td className="px-4 py-3 font-medium text-sm" style={{ color: 'var(--rmg-off)' }}>{f.proveedor}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--rmg-muted)' }}>{f.oc_numero}</td>
                      <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(f.monto)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(f.fecha_emision)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(f.fecha_vencimiento)}</td>
                      <td className="px-4 py-3 text-xs font-bold"
                        style={{ color: f.estado === 'pagada' ? 'var(--rmg-teal)' : f.dias_vencida > 0 ? 'var(--rmg-red)' : 'var(--rmg-gold)' }}>
                        {f.estado === 'pagada' ? '✓' : f.dias_vencida > 0 ? `+${f.dias_vencida}d` : `${Math.abs(f.dias_vencida)}d`}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 w-fit text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: est.bg, color: est.color }}>
                          <EstIcon size={11}/>{est.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>
                        {f.fecha_pago ? formatFecha(f.fecha_pago) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {f.estado !== 'pagada' && (
                          <button onClick={() => pagarMut.mutate(f.id)}
                            className="text-xs px-2 py-1 rounded-lg font-medium transition-all"
                            style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>
                            Pagar
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
            <CreditCard size={32} className="mx-auto mb-3 opacity-30"/>
            <p>No hay facturas de proveedores</p>
          </div>
        )}
      </div>
    </div>
  )
}
