import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, FileText, Send, Check, X, Clock, Printer, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

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

const ESTADOS_COTIZACION = ['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida']

function imprimirCotizacion(c) {
  const win = window.open('', '_blank', 'width=800,height=600')
  win.document.write(`
    <html><head><title>Cotización ${c.numero}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a2e; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { text-align: left; padding: 8px; border-bottom: 2px solid #ddd; font-size: 12px; text-transform: uppercase; color: #666; }
      td { padding: 8px; border-bottom: 1px solid #eee; font-size: 13px; }
      .total-row td { font-weight: bold; font-size: 15px; border-top: 2px solid #ddd; }
      .right { text-align: right; }
      .footer { margin-top: 32px; font-size: 11px; color: #999; }
    </style></head><body>
    <h1>RMG Auto Parts</h1>
    <p class="sub">Cotización ${c.numero} · ${new Date().toLocaleDateString('es-CL')}</p>
    <p><strong>Cliente:</strong> ${c.cliente || '—'}</p>
    <p><strong>Condición de pago:</strong> ${c.condicion_pago || '—'}</p>
    ${c.notas ? `<p><strong>Notas:</strong> ${c.notas}</p>` : ''}
    <table>
      <thead><tr><th>Código</th><th>Descripción</th><th class="right">Cant.</th><th class="right">P. Neto</th><th class="right">Subtotal</th></tr></thead>
      <tbody>
        ${(c.items || []).map(i => `<tr>
          <td>${i.codigo || '—'}</td><td>${i.descripcion || '—'}</td>
          <td class="right">${i.cantidad}</td>
          <td class="right">$${i.precio_unitario?.toLocaleString('es-CL')}</td>
          <td class="right">$${i.subtotal?.toLocaleString('es-CL')}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="4" class="right">Neto</td><td class="right">$${c.neto?.toLocaleString('es-CL')}</td></tr>
        <tr><td colspan="4" class="right">IVA (19%)</td><td class="right">$${c.iva?.toLocaleString('es-CL')}</td></tr>
        <tr class="total-row"><td colspan="4" class="right">TOTAL</td><td class="right">$${c.total?.toLocaleString('es-CL')}</td></tr>
      </tfoot>
    </table>
    <div class="footer">RMG Auto Parts · ventas@rmgautoparts.cl · Santiago, Chile</div>
    </body></html>
  `)
  win.document.close()
  win.print()
}

function waLink(c) {
  const msg = encodeURIComponent(
    `Hola! Adjunto cotización *${c.numero}* de RMG Auto Parts.\n` +
    `Cliente: ${c.cliente || '—'}\n` +
    `Total: $${c.total?.toLocaleString('es-CL')} IVA incluido\n` +
    `Condición: ${c.condicion_pago || 'Contado'}\n\n` +
    `Para más información contactar a ventas@rmgautoparts.cl`
  )
  return `https://wa.me/?text=${msg}`
}

export default function CotizacionesPage() {
  const [estadoFiltro, setFiltro] = useState('')
  const [editando, setEditando] = useState(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones', estadoFiltro],
    queryFn: () => api.get('/cotizaciones', { params: { estado: estadoFiltro || undefined } }).then(r => r.data),
  })

  const aprobarMut = useMutation({
    mutationFn: (id) => api.post(`/cotizaciones/${id}/aprobar`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); toast.success('Cotización aprobada') },
    onError: () => toast.error('Error al aprobar'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/cotizaciones/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      toast.success('Cotización actualizada')
      setEditando(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar cotización'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/cotizaciones/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      toast.success('Cotización eliminada')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar cotización'),
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
              {['N° Cotización', 'Cliente', 'Estado', 'Neto', 'IVA', 'Total', 'Fecha', 'Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
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
                        <div className="flex gap-1.5 items-center" onClick={e => e.stopPropagation()}>
                          <button className="btn-secondary text-xs px-2 py-1 flex items-center gap-1" onClick={async e => {
                            e.stopPropagation()
                            const full = await api.get(`/cotizaciones/${c.id}`).then(r => r.data)
                            imprimirCotizacion(full)
                          }}>
                            <Printer size={11}/> PDF
                          </button>
                          <a href={waLink(c)} target="_blank" rel="noreferrer"
                            className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 no-underline"
                            onClick={e => e.stopPropagation()}>
                            <MessageCircle size={11}/> WA
                          </a>
                          <button
                            onClick={e => { e.stopPropagation(); setEditando({ ...c }) }}
                            className="p-1.5 rounded hover:bg-white/5 transition-colors"
                            style={{ color: 'var(--rmg-muted)' }}
                            title="Editar cotización">
                            <Pencil size={13}/>
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); if (confirm('¿Eliminar cotización?')) eliminarMut.mutate(c.id) }}
                            className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                            style={{ color: 'var(--rmg-red)' }}
                            title="Eliminar cotización">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && cotizaciones.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <FileText size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin cotizaciones{estadoFiltro ? ` en estado ${estadoFiltro}` : ''}</p>
          </div>
        )}
      </div>

      {/* Modal: editar cotización */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Editar cotización</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{editando.numero} · {editando.cliente}</p>
              </div>
              <button onClick={() => setEditando(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              editarMut.mutate({ id: editando.id, data: {
                estado: editando.estado,
                condicion_pago: editando.condicion_pago,
                plazo_entrega: editando.plazo_entrega,
                notas: editando.notas,
              }})
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={editando.estado || 'borrador'} onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
                  {ESTADOS_COTIZACION.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Condición de pago</label>
                <input className="rmg-input" value={editando.condicion_pago || ''} onChange={e => setEditando(p => ({ ...p, condicion_pago: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Plazo de entrega</label>
                <input className="rmg-input" placeholder="4-24 horas RM" value={editando.plazo_entrega || ''} onChange={e => setEditando(p => ({ ...p, plazo_entrega: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
                <input className="rmg-input" value={editando.notas || ''} onChange={e => setEditando(p => ({ ...p, notas: e.target.value }))} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditando(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={editarMut.isPending} className="btn-primary disabled:opacity-50">
                  {editarMut.isPending ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
