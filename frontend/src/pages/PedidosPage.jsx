import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { ShoppingCart, Plus, X, ChevronDown, ChevronRight, CreditCard, FileText, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import DocumentosPanel from '@components/DocumentosPanel'

const CUENTAS = ['1781310106 Banco de Chile', '000-0-00000 Banco BCI', '000-0-00000 Banco Santander', 'Caja chica']

const ESTADOS = [
  { key: '', label: 'Todos' },
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'en_preparacion', label: 'En preparación' },
  { key: 'despachado', label: 'Despachado' },
  { key: 'entregado', label: 'Entregado' },
]

const ESTADO_STYLES = {
  pendiente:      { bg: 'rgba(90,143,168,0.12)',  color: 'rgba(90,143,168,0.9)' },
  confirmado:     { bg: 'rgba(56,182,255,0.12)',  color: 'var(--rmg-blt)' },
  en_preparacion: { bg: 'rgba(244,162,60,0.12)',  color: 'var(--rmg-gold)' },
  despachado:     { bg: 'rgba(123,97,196,0.12)',  color: 'var(--rmg-purple)' },
  entregado:      { bg: 'rgba(45,201,138,0.12)',  color: 'var(--rmg-teal)' },
  anulado:        { bg: 'rgba(224,90,78,0.12)',   color: 'var(--rmg-red)' },
}

const PAGO_INIT = { metodo_pago: 'transferencia', cuenta_bancaria: CUENTAS[0], fecha_pago: new Date().toISOString().split('T')[0], notas: '' }

export default function PedidosPage() {
  const [estadoFiltro, setFiltro] = useState('')
  const [showCotModal, setShowCotModal] = useState(false)
  const [clienteModal, setClienteModal] = useState(null)
  const [expandido, setExpandido] = useState({})
  const [pagoModal, setPagoModal] = useState(null)
  const [pago, setPago] = useState(PAGO_INIT)
  const [editando, setEditando] = useState(null)
  const qc = useQueryClient()

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos', estadoFiltro],
    queryFn: () => api.get('/pedidos', { params: { estado: estadoFiltro || undefined } }).then(r => r.data),
  })

  // Permite llegar a un pedido específico desde otra pantalla (ej: CxC → "ver
  // pedido de origen") enlazando a /pedidos?expand=<pedido_id> — expande esa
  // fila y hace scroll hacia ella en cuanto la lista termina de cargar.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const expandId = searchParams.get('expand')
    if (!expandId || isLoading) return
    setExpandido(prev => ({ ...prev, [expandId]: true }))
    setTimeout(() => {
      document.getElementById(`pedido-row-${expandId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
    enabled: showCotModal,
  })

  const { data: todasCots = [] } = useQuery({
    queryKey: ['cotizaciones-modal'],
    queryFn: () => api.get('/cotizaciones').then(r => r.data),
    enabled: showCotModal,
  })

  const crearDesdeCotMut = useMutation({
    mutationFn: (cotId) => api.post(`/pedidos/from-cotizacion/${cotId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      qc.invalidateQueries({ queryKey: ['cotizaciones-modal'] })
      toast.success('Pedido creado desde cotización')
      setShowCotModal(false)
      setClienteModal(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear pedido'),
  })

  const cambiarEstadoMut = useMutation({
    mutationFn: ({ id, estado }) => api.patch(`/pedidos/${id}/estado`, { estado }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('Error al actualizar estado'),
  })

  // Genera la Venta desde el pedido (destino único del flujo comercial — reemplaza
  // a la antigua "nota de venta"). El stock ya sale al crearse la venta.
  const crearVentaMut = useMutation({
    mutationFn: (pedidoId) => api.post(`/ventas/desde-pedido/${pedidoId}`).then(r => r.data),
    onSuccess: (venta) => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      toast.success(`Venta ${venta.numero_documento} creada`)
      setPagoModal(venta)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al generar la venta'),
  })

  const registrarPagoMut = useMutation({
    mutationFn: ({ ventaId, data }) => api.post(`/ventas/${ventaId}/pago`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['flujo-caja'] })
      toast.success('Pago registrado — ingreso confirmado en flujo de caja')
      setPagoModal(null)
      setPago(PAGO_INIT)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar pago'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/pedidos/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success('Pedido actualizado')
      setEditando(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar pedido'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/pedidos/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      toast.success('Pedido eliminado')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar pedido'),
  })

  const totalPedidos = pedidos.reduce((s, p) => s + p.total, 0)
  const netoPedidos = pedidos.reduce((s, p) => s + (p.neto || 0), 0)

  const availableCots = clienteModal
    ? todasCots.filter(c =>
        c.cliente_id === clienteModal.id &&
        !['rechazada', 'aprobada'].includes(c.estado)
      )
    : []

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Pedidos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>ERP · seguimiento de despachos y pagos</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)', border: '1px solid rgba(56,182,255,0.2)' }}>
            {formatCLP(totalPedidos)} en curso
            <span className="font-normal text-xs ml-1" style={{ color: 'var(--rmg-muted)' }}>(neto {formatCLP(netoPedidos)})</span>
          </div>
          <button onClick={() => setShowCotModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={15}/> Desde cotización
          </button>
        </div>
      </div>

      {/* Filtros estado */}
      <div className="flex gap-1 flex-wrap">
        {ESTADOS.map(e => (
          <button key={e.key} onClick={() => setFiltro(e.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={estadoFiltro === e.key
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(15, 35, 60,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(15, 35, 60,0.08)' }
            }>{e.label}</button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
              {['', 'N° Pedido', 'Cliente', 'Estado', 'Neto', 'Total c/IVA', 'Condición pago', 'Entrega', 'Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }} /></td>
                    ))}
                  </tr>
                ))
              : pedidos.map((p, i) => {
                  const est = ESTADO_STYLES[p.estado] || ESTADO_STYLES.pendiente
                  const expanded = expandido[p.id]
                  return [
                    <tr key={p.id} id={`pedido-row-${p.id}`} style={{ borderBottom: expanded ? 'none' : '1px solid rgba(15, 35, 60,0.04)', background: expandido[p.id] ? 'rgba(56,182,255,0.06)' : i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 w-8">
                        <button onClick={() => setExpandido(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                          style={{ color: 'var(--rmg-muted)' }}>
                          {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{p.numero}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{p.cliente}</td>
                      <td className="px-4 py-3">
                        <select className="text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer border-0 outline-none"
                          style={{ background: est.bg, color: est.color }}
                          value={p.estado}
                          onChange={e => cambiarEstadoMut.mutate({ id: p.id, estado: e.target.value })}>
                          {Object.keys(ESTADO_STYLES).map(s => (
                            <option key={s} value={s} style={{ background: '#ffffff', color: '#16233a' }}>
                              {s.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(p.neto)}</td>
                      <td className="px-4 py-3 font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>{formatCLP(p.total)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{p.condicion_pago}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: p.fecha_entrega_programada ? 'var(--rmg-off)' : 'var(--rmg-muted)' }}>
                        {p.fecha_entrega_programada ? formatFecha(p.fecha_entrega_programada) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 items-center">
                          {p.estado !== 'entregado' && (
                            <button
                              onClick={() => crearVentaMut.mutate(p.id)}
                              disabled={crearVentaMut.isPending}
                              className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 disabled:opacity-50"
                              title="Generar venta desde este pedido y registrar pago">
                              <FileText size={11}/> Venta + Pago
                            </button>
                          )}
                          <button
                            onClick={() => setEditando({ ...p })}
                            className="p-1.5 rounded hover:bg-black/5 transition-colors"
                            style={{ color: 'var(--rmg-muted)' }}
                            title="Editar pedido">
                            <Pencil size={13}/>
                          </button>
                          <button
                            onClick={() => { if (confirm('¿Eliminar pedido?')) eliminarMut.mutate(p.id) }}
                            className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                            style={{ color: 'var(--rmg-red)' }}
                            title="Eliminar pedido">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>,
                    expanded && (
                      <tr key={`${p.id}-items`} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                        <td colSpan={8} className="px-8 py-3 space-y-3" style={{ background: 'rgba(56,182,255,0.02)' }}>
                          <PedidoItems pedidoId={p.id} />
                          <DocumentosPanel entidad="pedido" entidadId={p.id} titulo="Documentos del pedido" />
                        </td>
                      </tr>
                    )
                  ]
                })
            }
          </tbody>
        </table>
        {!isLoading && pedidos.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <ShoppingCart size={32} className="mx-auto mb-3 opacity-30" />
            <p>No hay pedidos en este estado</p>
            <button onClick={() => setShowCotModal(true)} className="btn-secondary text-sm mt-3 flex items-center gap-2 mx-auto">
              <Plus size={13}/> Crear desde cotización
            </button>
          </div>
        )}
      </div>

      {/* Modal: editar pedido */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Editar pedido</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{editando.numero}</p>
              </div>
              <button onClick={() => setEditando(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); editarMut.mutate({ id: editando.id, data: { cliente: editando.cliente, estado: editando.estado, condicion_pago: editando.condicion_pago, fecha_entrega_programada: editando.fecha_entrega_programada, notas: editando.notas } }) }}
              className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cliente</label>
                <input className="rmg-input" value={editando.cliente || ''} onChange={e => setEditando(p => ({ ...p, cliente: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={editando.estado} onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
                  {Object.keys(ESTADO_STYLES).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Condición de pago</label>
                <input className="rmg-input" value={editando.condicion_pago || ''} onChange={e => setEditando(p => ({ ...p, condicion_pago: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha entrega programada</label>
                <input type="date" className="rmg-input" value={editando.fecha_entrega_programada || ''} onChange={e => setEditando(p => ({ ...p, fecha_entrega_programada: e.target.value }))} />
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

      {/* Modal: crear desde cotización — 2 pasos: cliente → cotizaciones */}
      {showCotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">
                {clienteModal ? `Cotizaciones · ${clienteModal.razon_social}` : 'Crear pedido desde cotización'}
              </h2>
              <button onClick={() => { setShowCotModal(false); setClienteModal(null) }} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>

            {!clienteModal ? (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Selecciona el cliente para ver sus cotizaciones activas:</p>
                <select className="rmg-input" defaultValue=""
                  onChange={e => {
                    const cl = clientes.find(c => c.id === e.target.value)
                    if (cl) setClienteModal(cl)
                  }}>
                  <option value="" disabled>Elegir cliente...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.razon_social}</option>
                  ))}
                </select>
                {clientes.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Cargando clientes...</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                <button onClick={() => setClienteModal(null)}
                  className="text-xs mb-3 flex items-center gap-1 w-fit"
                  style={{ color: 'var(--rmg-muted)' }}>
                  ← Cambiar cliente
                </button>
                <div className="overflow-y-auto flex-1">
                  {availableCots.length === 0 ? (
                    <p className="text-center py-8" style={{ color: 'var(--rmg-muted)' }}>
                      Este cliente no tiene cotizaciones activas disponibles
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)' }}>
                          {['N°', 'Estado', 'Total', ''].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-xs uppercase font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {availableCots.map(c => (
                          <tr key={c.id} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }} className="hover:bg-white/[0.02]">
                            <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{c.numero}</td>
                            <td className="px-3 py-2.5 text-xs capitalize" style={{ color: 'var(--rmg-muted)' }}>{c.estado}</td>
                            <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(c.total)}</td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => crearDesdeCotMut.mutate(c.id)}
                                disabled={crearDesdeCotMut.isPending}
                                className="btn-primary text-xs px-3 py-1 disabled:opacity-50">
                                Crear pedido
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: registrar pago */}
      {pagoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Registrar pago</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{pagoModal.numero_documento || pagoModal.numero} · Neto {formatCLP(pagoModal.neto)} · c/IVA {formatCLP(pagoModal.total)}</p>
              </div>
              <button onClick={() => { setPagoModal(null); setPago(PAGO_INIT) }} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Método de pago</label>
                <select className="rmg-input" value={pago.metodo_pago} onChange={e => setPago(p => ({ ...p, metodo_pago: e.target.value }))}>
                  <option>Transferencia</option>
                  <option>Cheque</option>
                  <option>Efectivo</option>
                  <option>Crédito 30 días</option>
                  <option>Crédito 60 días</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cuenta bancaria</label>
                <select className="rmg-input" value={pago.cuenta_bancaria} onChange={e => setPago(p => ({ ...p, cuenta_bancaria: e.target.value }))}>
                  {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="">Sin especificar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha de pago</label>
                <input type="date" className="rmg-input" value={pago.fecha_pago}
                  onChange={e => setPago(p => ({ ...p, fecha_pago: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
                <input className="rmg-input" placeholder="Referencia, número de operación..." value={pago.notas}
                  onChange={e => setPago(p => ({ ...p, notas: e.target.value }))} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button onClick={() => { setPagoModal(null); setPago(PAGO_INIT) }} className="btn-secondary">Cancelar</button>
                <button
                  onClick={() => registrarPagoMut.mutate({ ventaId: pagoModal.id, data: pago })}
                  disabled={registrarPagoMut.isPending}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50">
                  <CreditCard size={14}/>
                  {registrarPagoMut.isPending ? 'Registrando...' : 'Confirmar pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PedidoItems({ pedidoId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pedido-items', pedidoId],
    queryFn: () => api.get(`/pedidos/${pedidoId}`).then(r => r.data),
    staleTime: 60_000,
  })

  if (isLoading) return <div className="text-xs py-2" style={{ color: 'var(--rmg-muted)' }}>Cargando items…</div>
  if (!data?.items?.length) return <div className="text-xs py-2" style={{ color: 'var(--rmg-muted)' }}>Sin items</div>

  return (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(15, 35, 60,0.06)' }}>
          {['Código', 'Descripción', 'Cant.', 'P. Neto', 'Desc %', 'Subtotal'].map(h => (
            <th key={h} className="text-left px-2 py-1 uppercase font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.items.map(item => (
          <tr key={item.id} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.03)' }}>
            <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--rmg-blt)' }}>{item.codigo_sku || item.codigo || '—'}</td>
            <td className="px-2 py-1.5" style={{ color: 'var(--rmg-off)' }}>{item.descripcion}</td>
            <td className="px-2 py-1.5 text-center">{item.cantidad}</td>
            <td className="px-2 py-1.5 text-right">{formatCLP(item.precio_unitario)}</td>
            <td className="px-2 py-1.5 text-center">{item.descuento_pct ? `${item.descuento_pct}%` : '—'}</td>
            <td className="px-2 py-1.5 text-right font-bold" style={{ color: 'var(--rmg-teal)' }}>{formatCLP(item.subtotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
