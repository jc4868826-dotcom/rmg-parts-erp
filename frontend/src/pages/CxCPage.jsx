import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { useAuth } from '@context/AuthContext'
import { formatCLP, formatFecha } from '@utils/format'
import { DollarSign, AlertTriangle, Check, Clock, X, Paperclip, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'

const SEG_COLOR = { taller: 'var(--rmg-blt)', flota: 'var(--rmg-teal)', concesionario: 'var(--rmg-purple)', construccion: 'var(--rmg-gold)' }
const SEG_NAME  = { taller: 'Taller', flota: 'Flota', concesionario: 'Concesionario', construccion: 'Construcción' }

const ESTADO_STYLES = {
  al_dia:  { label: 'Al día',   color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.12)',  icon: Check },
  vencida: { label: 'Vencida',  color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.12)',  icon: Clock },
  critica: { label: 'Crítica',  color: 'var(--rmg-red)',  bg: 'rgba(224,90,78,0.12)',   icon: AlertTriangle },
  cobrada: { label: 'Cobrada',  color: 'rgba(90,143,168,0.8)', bg: 'rgba(90,143,168,0.1)', icon: Check },
}

const TIPO_VENTA_STYLES = {
  validacion: { label: 'En validación de pago', color: 'var(--rmg-blue)', bg: 'rgba(56,182,255,0.12)' },
  credito:    { label: 'Venta a crédito',       color: 'var(--rmg-purple)', bg: 'rgba(130,90,224,0.12)' },
}

export default function CxCPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const esGerente = user?.rol === 'gerente'
  const [filtroEstado, setFiltroEstado] = useState('')

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ['cxc', filtroEstado],
    queryFn: () => api.get('/cxc', { params: { estado: filtroEstado || undefined } }).then(r => r.data),
  })

  const { data: resumen = {} } = useQuery({
    queryKey: ['cxc-resumen'],
    queryFn: () => api.get('/cxc/resumen').then(r => r.data),
  })

  // Ventas en validación de pago (comprobante subido, esperando confirmación de
  // gerente) + ventas a crédito aún no pagadas — el "por gestionar" real de CxC,
  // a diferencia de la tabla de facturas manuales de más abajo.
  const { data: ventasPendientes = [], isLoading: isLoadingVentas } = useQuery({
    queryKey: ['cxc-ventas'],
    queryFn: () => api.get('/cxc/ventas').then(r => r.data),
  })

  const invalidateVentas = () => {
    qc.invalidateQueries({ queryKey: ['cxc-ventas'] })
    qc.invalidateQueries({ queryKey: ['cxc-pendientes-badge'] })
    qc.invalidateQueries({ queryKey: ['ventas'] })
  }

  const aprobarMut = useMutation({
    mutationFn: (id) => api.post(`/ventas/${id}/validar-pago`, { aprobado: true }).then(r => r.data),
    onSuccess: () => { invalidateVentas(); toast.success('Pago validado — ingreso confirmado en flujo de caja') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al validar el pago'),
  })

  const rechazarMut = useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/ventas/${id}/validar-pago`, { aprobado: false, motivo }).then(r => r.data),
    onSuccess: () => { invalidateVentas(); toast.success('Pago rechazado — la venta vuelve a Pendiente') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al rechazar el pago'),
  })

  const cobrarCreditoMut = useMutation({
    mutationFn: (id) => api.post(`/ventas/${id}/pago`, {}).then(r => r.data),
    onSuccess: () => { invalidateVentas(); toast.success('Venta a crédito marcada como pagada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar el pago'),
  })

  const handleRechazar = (id) => {
    const motivo = window.prompt('Motivo del rechazo (ej: el depósito no aparece en la cuenta corriente):')
    if (motivo === null) return
    if (!motivo.trim()) { toast.error('Indica un motivo'); return }
    rechazarMut.mutate({ id, motivo: motivo.trim() })
  }

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

      {/* Ventas por gestionar — validación de pago + créditos pendientes */}
      <div className="rmg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(56,182,255,0.08)' }}>
          <span className="font-bold text-sm flex items-center gap-1.5"><ShieldCheck size={14} style={{ color: 'var(--rmg-blue)' }}/> Ventas por gestionar</span>
          <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{ventasPendientes.length} pendientes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                {['Doc.', 'Cliente', 'Tipo', 'Monto', 'Fecha', 'Vencimiento', 'Comprobante', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoadingVentas
                ? Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }}/></td>
                      ))}
                    </tr>
                  ))
                : ventasPendientes.map((v, i) => {
                    const tipoStyle = TIPO_VENTA_STYLES[v.tipo] || TIPO_VENTA_STYLES.credito
                    return (
                      <tr key={v.id}
                        style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}>
                        <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{v.numero_documento || `#${v.id}`}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{v.cliente_nombre || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: tipoStyle.bg, color: tipoStyle.color }}>
                            {tipoStyle.label}
                          </span>
                          {v.motivo_rechazo_pago && (
                            <div className="text-[10px] mt-1" style={{ color: 'var(--rmg-red)' }} title={v.motivo_rechazo_pago}>
                              Último rechazo: {v.motivo_rechazo_pago}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(v.total)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(v.fecha)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: v.dias_vencida > 0 ? 'var(--rmg-red)' : 'var(--rmg-muted)' }}>
                          {v.fecha_vencimiento ? `${formatFecha(v.fecha_vencimiento)}${v.dias_vencida > 0 ? ` (+${v.dias_vencida}d)` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {v.comprobante_id ? (
                            <a href={`${api.defaults.baseURL}/documentos/archivo/${v.comprobante_id}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--rmg-blue)' }}>
                              <Paperclip size={11}/> Ver
                            </a>
                          ) : <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {v.tipo === 'validacion' ? (
                            esGerente ? (
                              <div className="flex gap-1">
                                <button onClick={() => aprobarMut.mutate(v.id)} disabled={aprobarMut.isPending}
                                  className="text-xs px-2 py-1 rounded-lg font-medium transition-all flex items-center gap-1 disabled:opacity-50"
                                  style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>
                                  <Check size={12}/> Aprobar
                                </button>
                                <button onClick={() => handleRechazar(v.id)} disabled={rechazarMut.isPending}
                                  className="text-xs px-2 py-1 rounded-lg font-medium transition-all flex items-center gap-1 disabled:opacity-50"
                                  style={{ background: 'rgba(224,90,78,0.12)', color: 'var(--rmg-red)' }}>
                                  <X size={12}/> Rechazar
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Esperando gerente</span>
                            )
                          ) : (
                            <button onClick={() => cobrarCreditoMut.mutate(v.id)} disabled={cobrarCreditoMut.isPending}
                              className="text-xs px-2 py-1 rounded-lg font-medium transition-all"
                              style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>
                              Marcar cobrada
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
        {!isLoadingVentas && ventasPendientes.length === 0 && (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Sin ventas en validación de pago ni créditos pendientes
          </div>
        )}
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
                      <td className="px-4 py-3 font-mono text-xs font-bold">
                        {f.pedido_id
                          ? <button type="button" onClick={() => navigate(`/pedidos?expand=${f.pedido_id}`)}
                              className="hover:underline" style={{ color: 'var(--rmg-blt)' }} title="Ver pedido de origen">
                              {f.numero}
                            </button>
                          : <span style={{ color: 'var(--rmg-blt)' }}>{f.numero}</span>
                        }
                      </td>
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
