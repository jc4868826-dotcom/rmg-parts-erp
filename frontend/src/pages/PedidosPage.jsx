/**
 * RMG Parts — Notas de Venta (flujo v2, 2026-09-24)
 *
 * La nota de venta es el paso obligatorio del flujo comercial:
 *   cotización aprobada + OC del cliente → NOTA DE VENTA → OC al proveedor
 *   → OC validada → autorización de gerencia → venta "por facturar"
 *
 * Se crea desde Cotizaciones (ahí se adjunta la OC del cliente, que es la
 * compuerta). Acá se trabaja: se emite la OC al proveedor, se valida, se manda
 * a autorización y, autorizada, nace la venta.
 */
import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { useAuth } from '@context/AuthContext'
import { formatCLP, formatCantidad, formatFecha, formatPct } from '@utils/format'
import { ShoppingCart, X, ChevronDown, ChevronRight, FileText, Pencil, Trash2,
         Truck, ShieldCheck, Check, AlertTriangle, Paperclip, Link2, Ban } from 'lucide-react'
import toast from 'react-hot-toast'
import DocumentosPanel from '@components/DocumentosPanel'

// Estados comerciales (los mueve el flujo) y logísticos (los mueve el usuario).
const ESTADO_STYLES = {
  pendiente:       { label: 'Nota de venta creada',      bg: 'rgba(90,143,168,0.12)',  color: 'rgba(90,143,168,0.95)' },
  oc_emitida:      { label: 'OC emitida',       bg: 'rgba(244,162,60,0.12)',  color: 'var(--rmg-gold)' },
  oc_validada:     { label: 'OC validada',      bg: 'rgba(56,182,255,0.12)',  color: 'var(--rmg-blt)' },
  en_autorizacion: { label: 'En autorización',  bg: 'rgba(123,97,196,0.14)',  color: 'var(--rmg-purple)' },
  autorizado:      { label: 'Autorizada',       bg: 'rgba(45,201,138,0.14)',  color: 'var(--rmg-teal)' },
  rechazado:       { label: 'Rechazada',        bg: 'rgba(224,90,78,0.12)',   color: 'var(--rmg-red)' },
  confirmado:      { label: 'Confirmado',       bg: 'rgba(56,182,255,0.12)',  color: 'var(--rmg-blt)' },
  en_preparacion:  { label: 'En preparación',   bg: 'rgba(244,162,60,0.12)',  color: 'var(--rmg-gold)' },
  despachado:      { label: 'Despachado',       bg: 'rgba(123,97,196,0.12)',  color: 'var(--rmg-purple)' },
  entregado:       { label: 'Entregado',        bg: 'rgba(45,201,138,0.12)',  color: 'var(--rmg-teal)' },
  anulado:         { label: 'Anulado',          bg: 'rgba(224,90,78,0.12)',   color: 'var(--rmg-red)' },
}

const COMERCIALES = ['pendiente', 'oc_emitida', 'oc_validada', 'en_autorizacion', 'autorizado', 'rechazado']
const LOGISTICOS = ['confirmado', 'en_preparacion', 'despachado', 'entregado', 'anulado']

const FILTROS = [
  { key: '', label: 'Todas' },
  { key: 'pendiente', label: 'Sin OC proveedor' },
  { key: 'oc_emitida', label: 'OC emitida' },
  { key: 'oc_validada', label: 'OC validada' },
  { key: 'en_autorizacion', label: 'En autorización' },
  { key: 'autorizado', label: 'Autorizadas' },
]

const OC_INIT = { proveedor: '', proveedor_id: '', fecha_requerida: '', medio_pago: 'Contado', notas: '' }

export default function PedidosPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const puedeAutorizar = ['gerente', 'administrador'].includes(user?.rol)

  const [estadoFiltro, setFiltro] = useState('')
  const [expandido, setExpandido] = useState({})
  const [editando, setEditando] = useState(null)
  const [ocModal, setOcModal] = useState(null)      // pedido al que se le emite la OC
  const [ocForm, setOcForm] = useState(OC_INIT)
  const [rechazoModal, setRechazoModal] = useState(null)
  const [motivo, setMotivo] = useState('')

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos', estadoFiltro],
    queryFn: () => api.get('/pedidos', { params: { estado: estadoFiltro || undefined } }).then(r => r.data),
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/compras/proveedores').then(r => r.data),
    enabled: Boolean(ocModal),
  })

  // Permite llegar a una nota específica desde otra pantalla: /pedidos?expand=<id>
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

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['pedidos'] })
    qc.invalidateQueries({ queryKey: ['pedido-detalle'] })
  }

  const cambiarEstadoMut = useMutation({
    mutationFn: ({ id, estado }) => api.patch(`/pedidos/${id}/estado`, { estado }).then(r => r.data),
    onSuccess: () => { refrescar(); toast.success('Estado logístico actualizado') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar el estado'),
  })

  // Paso 6 — OC al proveedor. Solo existe desde acá, nunca desde la cotización.
  const emitirOcMut = useMutation({
    mutationFn: ({ pedidoId, data }) => api.post(`/oc/desde-pedido/${pedidoId}`, data).then(r => r.data),
    onSuccess: (oc) => {
      refrescar()
      qc.invalidateQueries({ queryKey: ['ocs'] })
      setOcModal(null); setOcForm(OC_INIT)
      toast.success(`OC ${oc.numero} emitida al proveedor`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al emitir la OC'),
  })

  // Paso 7 — el proveedor confirmó precio y plazo.
  const validarMut = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/validar-oc`).then(r => r.data),
    onSuccess: () => { refrescar(); toast.success('OC validada — lista para autorización') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al validar la OC'),
  })

  const enviarAutorizacionMut = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/enviar-autorizacion`).then(r => r.data),
    onSuccess: () => { refrescar(); toast.success('Enviada a autorización de gerencia') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al enviar a autorización'),
  })

  // Paso 8 — gerencia aprueba el margen: nace la venta "por facturar".
  const autorizarMut = useMutation({
    mutationFn: (id) => api.post(`/pedidos/${id}/autorizar`).then(r => r.data),
    onSuccess: (data) => {
      refrescar()
      qc.invalidateQueries({ queryKey: ['ventas'] })
      toast.success(`Autorizada — venta ${data.venta?.numero_documento || ''} enviada a facturación`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al autorizar'),
  })

  const rechazarMut = useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/pedidos/${id}/rechazar`, { motivo }).then(r => r.data),
    onSuccess: () => { refrescar(); setRechazoModal(null); setMotivo(''); toast.success('Nota de venta rechazada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al rechazar'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/pedidos/${id}`, data).then(r => r.data),
    onSuccess: () => { refrescar(); setEditando(null); toast.success('Nota de venta actualizada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/pedidos/${id}`).then(r => r.data),
    onSuccess: () => { refrescar(); toast.success('Nota de venta eliminada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  })

  const totalPedidos = pedidos.reduce((s, p) => s + (p.total || 0), 0)
  const netoPedidos = pedidos.reduce((s, p) => s + (p.neto || 0), 0)
  const porAutorizar = pedidos.filter(p => p.estado === 'en_autorizacion').length

  // Acción principal según el punto del flujo en que está la nota.
  const AccionFlujo = ({ p }) => {
    if (p.estado === 'rechazado') {
      return <span className="text-xs" style={{ color: 'var(--rmg-red)' }}>Rechazada</span>
    }
    if (p.venta_id || p.estado === 'autorizado') {
      return (
        <button onClick={() => navigate('/ventas')}
          className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-semibold"
          style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}
          title="Ver la venta generada">
          <Link2 size={11}/> Ver venta
        </button>
      )
    }
    if (['pendiente', 'confirmado'].includes(p.estado)) {
      return (
        <button onClick={() => { setOcModal(p); setOcForm(OC_INIT) }}
          className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
          title="Emitir la orden de compra al proveedor">
          <Truck size={11}/> OC proveedor
        </button>
      )
    }
    if (p.estado === 'oc_emitida') {
      return (
        <button onClick={() => validarMut.mutate(p.id)} disabled={validarMut.isPending}
          className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-semibold disabled:opacity-50"
          style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blue)' }}
          title="El proveedor confirmó precio y plazo">
          <Check size={11}/> Validar OC
        </button>
      )
    }
    if (p.estado === 'oc_validada') {
      return puedeAutorizar ? (
        <button onClick={() => autorizarMut.mutate(p.id)} disabled={autorizarMut.isPending}
          className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-semibold disabled:opacity-50"
          style={{ background: 'rgba(45,201,138,0.14)', color: 'var(--rmg-teal)' }}
          title="Autorizar el negocio y generar la venta">
          <ShieldCheck size={11}/> Autorizar
        </button>
      ) : (
        <button onClick={() => enviarAutorizacionMut.mutate(p.id)} disabled={enviarAutorizacionMut.isPending}
          className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 disabled:opacity-50">
          <ShieldCheck size={11}/> A autorización
        </button>
      )
    }
    if (p.estado === 'en_autorizacion') {
      return puedeAutorizar ? (
        <div className="flex gap-1.5">
          <button onClick={() => autorizarMut.mutate(p.id)} disabled={autorizarMut.isPending}
            className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-semibold disabled:opacity-50"
            style={{ background: 'rgba(45,201,138,0.14)', color: 'var(--rmg-teal)' }}>
            <ShieldCheck size={11}/> Autorizar
          </button>
          <button onClick={() => { setRechazoModal(p); setMotivo('') }}
            className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-semibold"
            style={{ background: 'rgba(224,90,78,0.1)', color: 'var(--rmg-red)' }}>
            <Ban size={11}/> Rechazar
          </button>
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--rmg-purple)' }}>Esperando gerencia</span>
      )
    }
    return null
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Notas de Venta</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
            Cotización aprobada + OC del cliente → OC al proveedor → autorización → venta
          </p>
        </div>
        <div className="flex items-center gap-3">
          {porAutorizar > 0 && (
            <div className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(123,97,196,0.1)', color: 'var(--rmg-purple)', border: '1px solid rgba(123,97,196,0.25)' }}>
              {porAutorizar} por autorizar
            </div>
          )}
          <div className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)', border: '1px solid rgba(56,182,255,0.2)' }}>
            {formatCLP(totalPedidos)} en curso
            <span className="font-normal text-xs ml-1" style={{ color: 'var(--rmg-muted)' }}>(neto {formatCLP(netoPedidos)})</span>
          </div>
          <button onClick={() => navigate('/cotizaciones')} className="btn-primary flex items-center gap-2">
            <FileText size={15}/> Desde cotización
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1 flex-wrap">
        {FILTROS.map(e => (
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
              {['', 'N° Nota', 'Cliente', 'Estado', 'OC proveedor', 'Neto', 'Total c/IVA', 'Entrega', 'Acciones'].map((h, i) => (
                <th key={h + i} className={`px-4 py-3 text-xs uppercase tracking-wider font-semibold ${['Neto', 'Total c/IVA'].includes(h) ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--rmg-muted)' }}>{h}</th>
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
                  const esComercial = COMERCIALES.includes(p.estado)
                  return [
                    <tr key={p.id} id={`pedido-row-${p.id}`}
                      style={{ borderBottom: expanded ? 'none' : '1px solid rgba(15, 35, 60,0.04)',
                               background: expanded ? 'rgba(56,182,255,0.06)' : i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 w-8">
                        <button onClick={() => setExpandido(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                          style={{ color: 'var(--rmg-muted)' }}>
                          {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap" style={{ color: 'var(--rmg-blt)' }}>
                        {p.numero}
                        {p.cotizacion_numero && (
                          <div className="font-sans font-normal mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{p.cotizacion_numero}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{p.cliente}</td>
                      <td className="px-4 py-3">
                        {esComercial ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ background: est.bg, color: est.color }}>{est.label}</span>
                        ) : (
                          <select className="text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer border-0 outline-none"
                            style={{ background: est.bg, color: est.color }}
                            value={p.estado}
                            onChange={e => cambiarEstadoMut.mutate({ id: p.id, estado: e.target.value })}>
                            {LOGISTICOS.map(s => (
                              <option key={s} value={s} style={{ background: '#ffffff', color: '#16233a' }}>
                                {ESTADO_STYLES[s]?.label || s}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.ocs?.length
                          ? p.ocs.map(o => (
                              <span key={o.id} className="font-mono mr-1.5 whitespace-nowrap" style={{ color: 'var(--rmg-gold)' }}>{o.numero}</span>
                            ))
                          : <span style={{ color: 'var(--rmg-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-right num-celda" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(p.neto)}</td>
                      <td className="px-4 py-3 font-bold precio-clp text-right num-celda" style={{ color: 'var(--rmg-off)' }}>{formatCLP(p.total)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: p.fecha_entrega_programada ? 'var(--rmg-off)' : 'var(--rmg-muted)' }}>
                        {p.fecha_entrega_programada ? formatFecha(p.fecha_entrega_programada) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 items-center">
                          <AccionFlujo p={p} />
                          <button onClick={() => setEditando({ ...p })}
                            className="p-1.5 rounded hover:bg-black/5 transition-colors"
                            style={{ color: 'var(--rmg-muted)' }} title="Editar">
                            <Pencil size={13}/>
                          </button>
                          <button onClick={() => { if (confirm('¿Eliminar la nota de venta?')) eliminarMut.mutate(p.id) }}
                            className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                            style={{ color: 'var(--rmg-red)' }} title="Eliminar">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>,
                    expanded && (
                      <tr key={`${p.id}-items`} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                        <td colSpan={9} className="px-8 py-3 space-y-3" style={{ background: 'rgba(56,182,255,0.02)' }}>
                          <PedidoDetalle pedidoId={p.id} />
                          <DocumentosPanel entidad="pedido" entidadId={p.id} titulo="Documentos de la nota de venta" />
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
            <p>No hay notas de venta en este estado</p>
            <p className="text-xs mt-2">Se crean desde una cotización, adjuntando la OC del cliente.</p>
            <button onClick={() => navigate('/cotizaciones')} className="btn-secondary text-sm mt-3 flex items-center gap-2 mx-auto">
              <FileText size={13}/> Ir a cotizaciones
            </button>
          </div>
        )}
      </div>

      {/* Modal: emitir OC al proveedor */}
      {ocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,35,60,0.45)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">OC al proveedor</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
                  {ocModal.numero} · {ocModal.cliente}
                </p>
              </div>
              <button onClick={() => { setOcModal(null); setOcForm(OC_INIT) }} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>

            <div className="flex gap-2 items-start text-xs rounded-lg px-3 py-2"
              style={{ background: 'rgba(56,182,255,0.06)', border: '1px solid rgba(56,182,255,0.2)' }}>
              <AlertTriangle size={13} style={{ color: 'var(--rmg-blue)', flexShrink: 0, marginTop: 1 }}/>
              <span style={{ color: 'var(--rmg-off)' }}>
                Las líneas se copian de la nota de venta con el costo
                {ocModal.origen_costos === 'respaldo' ? ' del respaldo del proveedor' : ' de la lista de precios'}.
                Los precios se ajustan después en la OC.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor</label>
              <select className="rmg-input" value={ocForm.proveedor_id}
                onChange={e => {
                  const pr = proveedores.find(x => x.id === e.target.value)
                  setOcForm(f => ({ ...f, proveedor_id: e.target.value, proveedor: pr?.razon_social || pr?.nombre || '' }))
                }}>
                <option value="">Elegir proveedor…</option>
                {proveedores.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.razon_social || pr.nombre}</option>
                ))}
              </select>
              <input className="rmg-input mt-2" placeholder="…o escribir el proveedor"
                value={ocForm.proveedor}
                onChange={e => setOcForm(f => ({ ...f, proveedor: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha requerida</label>
                <input type="date" className="rmg-input" value={ocForm.fecha_requerida}
                  onChange={e => setOcForm(f => ({ ...f, fecha_requerida: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Medio de pago</label>
                <select className="rmg-input" value={ocForm.medio_pago}
                  onChange={e => setOcForm(f => ({ ...f, medio_pago: e.target.value }))}>
                  <option>Contado</option><option>Crédito 30 días</option><option>Crédito 60 días</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
              <input className="rmg-input" value={ocForm.notas}
                onChange={e => setOcForm(f => ({ ...f, notas: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => { setOcModal(null); setOcForm(OC_INIT) }} className="btn-secondary">Cancelar</button>
              <button disabled={!ocForm.proveedor || emitirOcMut.isPending}
                onClick={() => emitirOcMut.mutate({ pedidoId: ocModal.id, data: ocForm })}
                className="btn-primary disabled:opacity-40 flex items-center gap-2">
                <Truck size={14}/> {emitirOcMut.isPending ? 'Emitiendo…' : 'Emitir OC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: rechazo */}
      {rechazoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,35,60,0.45)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in space-y-3">
            <h2 className="font-bold">Rechazar {rechazoModal.numero}</h2>
            <textarea className="rmg-input" rows={3} placeholder="Motivo del rechazo"
              value={motivo} onChange={e => setMotivo(e.target.value)} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setRechazoModal(null); setMotivo('') }} className="btn-secondary">Cancelar</button>
              <button disabled={!motivo.trim() || rechazarMut.isPending}
                onClick={() => rechazarMut.mutate({ id: rechazoModal.id, motivo })}
                className="btn-primary disabled:opacity-40">Rechazar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: editar */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,35,60,0.45)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Editar nota de venta</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{editando.numero}</p>
              </div>
              <button onClick={() => setEditando(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              editarMut.mutate({ id: editando.id, data: {
                cliente: editando.cliente, condicion_pago: editando.condicion_pago,
                direccion_entrega: editando.direccion_entrega,
                fecha_entrega_programada: editando.fecha_entrega_programada, notas: editando.notas,
              } })
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cliente</label>
                <input className="rmg-input" value={editando.cliente || ''} onChange={e => setEditando(p => ({ ...p, cliente: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Condición de pago</label>
                <input className="rmg-input" value={editando.condicion_pago || ''} onChange={e => setEditando(p => ({ ...p, condicion_pago: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Dirección de entrega</label>
                <input className="rmg-input" value={editando.direccion_entrega || ''} onChange={e => setEditando(p => ({ ...p, direccion_entrega: e.target.value }))} />
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
                  {editarMut.isPending ? 'Guardando…' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Detalle expandido: líneas (mismo detalle que la cotización y la OC), margen,
// OC del cliente y OCs al proveedor.
function PedidoDetalle({ pedidoId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pedido-detalle', pedidoId],
    queryFn: () => api.get(`/pedidos/${pedidoId}`).then(r => r.data),
    staleTime: 30_000,
  })

  if (isLoading) return <div className="text-xs py-2" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>
  if (!data) return null

  const m = data.margen || {}
  const positivo = (m.monto || 0) >= 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        {data.oc_cliente ? (
          <a href={`${api.defaults.baseURL}/documentos/archivo/${data.oc_cliente.id}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full no-underline"
            style={{ background: 'rgba(45,201,138,0.1)', color: 'var(--rmg-teal)' }}>
            <Paperclip size={11}/> OC del cliente: {data.oc_cliente.nombre_archivo}
          </a>
        ) : (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(224,90,78,0.1)', color: 'var(--rmg-red)' }}>
            <AlertTriangle size={11}/> Sin OC del cliente
          </span>
        )}
        <span className="px-2.5 py-1 rounded-full"
          style={data.origen_costos === 'respaldo'
            ? { background: 'rgba(45,201,138,0.1)', color: 'var(--rmg-teal)' }
            : { background: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)' }}>
          Costos: {data.origen_costos === 'respaldo' ? 'respaldo del proveedor' : 'precios de lista (referencial)'}
        </span>
        {data.ocs?.map(o => (
          <span key={o.id} className="px-2.5 py-1 rounded-full font-mono"
            style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blue)' }}>
            {o.numero} · {o.estado} · {formatCLP(o.neto)}
          </span>
        ))}
        {data.motivo_rechazo && (
          <span className="px-2.5 py-1 rounded-full" style={{ background: 'rgba(224,90,78,0.1)', color: 'var(--rmg-red)' }}>
            Rechazo: {data.motivo_rechazo}
          </span>
        )}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(15, 35, 60,0.06)' }}>
            {['Código', 'Descripción', 'Cant.', 'Costo', 'P. Neto', 'Desc %', 'Subtotal'].map((h, i) => (
              <th key={h} className={`px-2 py-1 uppercase font-semibold ${i >= 2 ? 'text-right' : 'text-left'}`}
                style={{ color: 'var(--rmg-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.items || []).map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.03)' }}>
              <td className="px-2 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--rmg-blt)' }}>{item.codigo_sku || '—'}</td>
              <td className="px-2 py-1.5" style={{ color: 'var(--rmg-off)' }}>{item.descripcion}</td>
              <td className="px-2 py-1.5 text-right num-celda">{formatCantidad(item.cantidad)}</td>
              <td className="px-2 py-1.5 text-right num-celda" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(item.costo_unitario)}</td>
              <td className="px-2 py-1.5 text-right num-celda">{formatCLP(item.precio_unitario)}</td>
              <td className="px-2 py-1.5 text-right num-celda">{item.descuento_pct ? `${item.descuento_pct}%` : '—'}</td>
              <td className="px-2 py-1.5 text-right num-celda font-bold" style={{ color: 'var(--rmg-teal)' }}>{formatCLP(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap justify-end gap-6 text-xs pt-1">
        <span style={{ color: 'var(--rmg-muted)' }}>Neto venta <b style={{ color: 'var(--rmg-off)' }}>{formatCLP(m.neto_venta)}</b></span>
        <span style={{ color: 'var(--rmg-muted)' }}>
          Costo {m.desde_oc ? '(OC)' : '(lista)'} <b style={{ color: 'var(--rmg-off)' }}>{formatCLP(m.neto_compra)}</b>
        </span>
        <span style={{ color: 'var(--rmg-muted)' }}>
          Margen <b style={{ color: positivo ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
            {formatCLP(m.monto)} {m.pct != null && `· ${formatPct(m.pct * 100)}`}
          </b>
        </span>
      </div>
    </div>
  )
}
