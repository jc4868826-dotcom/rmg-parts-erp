import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import {
  Plus, X, Search, ChevronLeft, Send, CheckCircle, XCircle, Truck,
  PackageCheck, FileText, Mail, ClipboardList, History, RotateCcw,
  ExternalLink, Package, Trash2, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@context/AuthContext'
import DocumentosPanel from '@components/DocumentosPanel'

const HOY = new Date().toISOString().split('T')[0]
const MEDIO_PAGO = ['Contado', 'Crédito 30 días', 'Crédito 60 días', 'Crédito 90 días']
const ITEM_INIT = { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0 }
const FORM_INIT = {
  proveedor_id: '', proveedor: '', fecha_requerida: '', medio_pago: 'Contado',
  observaciones: '', items: [{ ...ITEM_INIT }],
}
const FACTURA_INIT = { numero_factura: '', fecha_factura: HOY, fecha_vencimiento_pago: '', monto_total: '', modo_pago: 'Transferencia' }

// Estados unificados (antes había dos convenciones de nombres — MAYUSCULAS en un
// módulo y Mixtas en otro — sobre la misma tabla; ahora hay una sola).
const ESTADO_CFG = {
  borrador:               { label: 'Borrador',              bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
  pendiente_autorizacion: { label: 'Por Autorizar',         bg: 'rgba(244,162,60,0.15)',  color: 'var(--rmg-gold)',  pulse: true },
  autorizada:             { label: 'Autorizada',            bg: 'rgba(56,182,255,0.15)',  color: 'var(--rmg-blue)' },
  rechazada:              { label: 'Rechazada',             bg: 'rgba(224,90,78,0.15)',   color: 'var(--rmg-red)' },
  enviada_proveedor:      { label: 'Enviada Proveedor',     bg: 'rgba(45,201,138,0.12)',  color: 'var(--rmg-teal)' },
  recibida_parcial:       { label: 'Recibida Parcial',      bg: 'rgba(244,162,60,0.12)',  color: 'var(--rmg-gold)' },
  recibida_total:         { label: 'Recibida',              bg: 'rgba(45,201,138,0.15)',  color: 'var(--rmg-teal)' },
  facturada:              { label: 'Facturada',             bg: 'rgba(56,182,255,0.15)',  color: 'var(--rmg-blue)' },
  pago_autorizado:        { label: 'Pago Autorizado',       bg: 'rgba(244,162,60,0.15)',  color: 'var(--rmg-gold)', pulse: true },
  pagada:                 { label: 'Pagada',                bg: 'rgba(45,201,138,0.18)',  color: 'var(--rmg-teal)' },
  anulada:                { label: 'Anulada',               bg: 'rgba(224,90,78,0.12)',   color: 'var(--rmg-red)' },
}

const TIPO_EVENTO_ICON = {
  creacion:            '🟢',
  modificacion:        '✏️',
  envio_autorizacion:  '🔵',
  autorizacion:        '✅',
  rechazo:             '🔴',
  envio_proveedor:     '📤',
  recepcion_parcial:   '📦',
  recepcion_total:     '📦',
  registro_factura:    '🧾',
  autorizacion_pago:   '✅',
  pago:                '💸',
  anulacion:           '🚫',
}

function EstadoBadge({ estado }) {
  const cfg = ESTADO_CFG[estado] || { label: estado, bg: 'rgba(255,255,255,0.08)', color: '#fff' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full${cfg.pulse ? ' animate-pulse' : ''}`}
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// SKU search row for the OC form
function SkuRow({ item, idx, onUpdate, onRemove, showRemove }) {
  const [query, setQuery]   = useState(item.codigo || '')
  const [open, setOpen]     = useState(false)
  const [dq, setDq]         = useState('')
  const wrapRef             = useRef(null)

  useEffect(() => { const t = setTimeout(() => setDq(query), 300); return () => clearTimeout(t) }, [query])

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['lp-oc', dq],
    queryFn: () => api.get('/lista-precios/buscar', { params: { q: dq } }).then(r => r.data),
    enabled: dq.length >= 2,
    staleTime: 60_000,
  })

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const handleSelect = (p) => {
    setQuery(p.codigo_sku); setOpen(false)
    onUpdate(idx, 'codigo', p.codigo_sku)
    onUpdate(idx, 'descripcion', p.descripcion)
    onUpdate(idx, 'precio_unitario', p.costo_unidad_neto || 0)
  }

  const sub = Number(item.precio_unitario || 0) * Number(item.cantidad || 0)

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <td className="px-3 py-2 min-w-52" ref={wrapRef} style={{ position: 'relative' }}>
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }} />
          <input className="rmg-input text-xs pl-6 pr-6" placeholder="Buscar SKU…" value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => query.length >= 2 && setOpen(true)} autoComplete="off" />
          {query && <button type="button" onClick={() => { setQuery(''); onUpdate(idx, 'codigo', ''); onUpdate(idx, 'descripcion', '') }} className="absolute right-1.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }}><X size={11}/></button>}
        </div>
        {open && dq.length >= 2 && (
          <div className="absolute z-50 left-0 mt-1 rounded-lg border overflow-hidden shadow-xl"
            style={{ background: 'var(--rmg-surface)', borderColor: 'rgba(56,182,255,0.25)', maxHeight: 200, overflowY: 'auto', minWidth: 280 }}>
            {isFetching && <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Buscando…</div>}
            {!isFetching && !resultados.length && <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Sin resultados</div>}
            {resultados.map(p => (
              <button key={p.codigo_sku} type="button" onMouseDown={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{p.codigo_sku}</span>
                  <span className="font-bold text-xs" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(p.costo_unidad_neto)}</span>
                </div>
                <div className="text-xs truncate" style={{ color: 'var(--rmg-off)' }}>{p.descripcion}</div>
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2 w-28">
        <input className="rmg-input text-xs font-mono" placeholder="SKU" value={item.codigo} onChange={e => onUpdate(idx, 'codigo', e.target.value)} />
      </td>
      <td className="px-3 py-2 min-w-40">
        <input className="rmg-input text-xs" placeholder="Descripción" value={item.descripcion} onChange={e => onUpdate(idx, 'descripcion', e.target.value)} />
      </td>
      <td className="px-3 py-2 w-20">
        <input type="number" min="0.01" step="any" className="rmg-input text-xs text-center" value={item.cantidad} onChange={e => onUpdate(idx, 'cantidad', e.target.value)} />
      </td>
      <td className="px-3 py-2 w-32">
        <input type="number" min="0" className="rmg-input text-xs text-right" value={item.precio_unitario} onChange={e => onUpdate(idx, 'precio_unitario', e.target.value)} />
      </td>
      <td className="px-3 py-2 font-bold text-right text-sm" style={{ color: 'var(--rmg-off)' }}>{formatCLP(sub)}</td>
      <td className="px-3 py-2">
        {showRemove && <button type="button" onClick={() => onRemove(idx)} className="p-1 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}><X size={13}/></button>}
      </td>
    </tr>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function OCPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const rol       = user?.rol || ''
  const esGerente = rol === 'gerente'

  const [vista, setVista]             = useState('lista')     // 'lista' | 'detalle' | 'nueva'
  const [ocId, setOcId]               = useState(null)
  const [detalleTab, setDetalleTab]   = useState('detalle')   // 'detalle' | 'recepciones' | 'historial'
  const [filtroEstado, setFiltroEstado] = useState('')
  const [busqueda, setBusqueda]       = useState('')
  const [form, setForm]               = useState(FORM_INIT)
  const [rechazarModal, setRechazarModal] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [emailModal, setEmailModal]   = useState(false)
  const [emailForm, setEmailForm]     = useState({ email_destino: '', mensaje_adicional: '' })
  const [recepcionActiva, setRecepcionActiva] = useState(false)
  const [recepcionLineas, setRecepcionLineas] = useState([])
  const [recepcionObs, setRecepcionObs] = useState('')
  const [ocAEliminar, setOcAEliminar]   = useState(null)   // { id, numero } para el modal
  const [facturaActiva, setFacturaActiva] = useState(false)
  const [facturaForm, setFacturaForm]     = useState(FACTURA_INIT)

  // Queries
  const { data: ocs = [], isLoading } = useQuery({
    queryKey: ['oc-list', filtroEstado],
    queryFn: () => api.get('/oc', { params: filtroEstado ? { estado: filtroEstado } : {} }).then(r => r.data),
    staleTime: 30_000,
  })

  const { data: ocDetalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ['oc-detalle', ocId],
    queryFn: () => api.get(`/oc/${ocId}`).then(r => r.data),
    enabled: !!ocId,
    staleTime: 10_000,
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/compras/proveedores').then(r => r.data),
    staleTime: 60_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['oc-list'] })
    qc.invalidateQueries({ queryKey: ['oc-detalle', ocId] })
    qc.invalidateQueries({ queryKey: ['oc-pendientes-workflow'] })
  }

  // Mutations
  const crearMut = useMutation({
    mutationFn: (d) => api.post('/oc', d).then(r => r.data),
    onSuccess: (data) => {
      invalidate(); toast.success(`OC ${data.numero} creada`)
      setVista('detalle'); setOcId(data.id); setForm(FORM_INIT)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear OC'),
  })

  const estadoMut = useMutation({
    mutationFn: ({ id, nuevo_estado, motivo_rechazo }) =>
      api.patch(`/oc/${id}/estado`, { nuevo_estado, motivo_rechazo, usuario_id: user?.id, usuario_nombre: user?.nombre, rol_usuario: rol }).then(r => r.data),
    onSuccess: (data) => {
      invalidate(); toast.success(`Estado → ${data.estado}`)
      setRechazarModal(false); setMotivoRechazo('')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al cambiar estado'),
  })

  const recepcionMut = useMutation({
    mutationFn: ({ id, body }) => api.post(`/oc/${id}/recepcion`, body).then(r => r.data),
    onSuccess: (data) => {
      invalidate()
      if (data.advertencias?.length) data.advertencias.forEach(w => toast(w, { icon: '⚠️' }))
      toast.success('Recepción registrada')
      setRecepcionActiva(false); setRecepcionLineas([]); setRecepcionObs('')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar recepción'),
  })

  const emailMut = useMutation({
    mutationFn: ({ id, body }) => api.post(`/oc/${id}/enviar-email`, body).then(r => r.data),
    onSuccess: () => { toast.success('OC enviada por email'); setEmailModal(false) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al enviar email'),
  })

  const facturaMut = useMutation({
    mutationFn: ({ id, body }) => api.post(`/oc/${id}/factura`, body).then(r => r.data),
    onSuccess: () => {
      invalidate(); toast.success('Factura registrada — OC lista para autorizar pago')
      setFacturaActiva(false); setFacturaForm(FACTURA_INIT)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar factura'),
  })

  const { data: impactoData, isLoading: loadingImpacto } = useQuery({
    queryKey: ['oc-impacto', ocAEliminar?.id],
    queryFn: () => api.get(`/oc/${ocAEliminar.id}/impacto-eliminacion`).then(r => r.data),
    enabled: !!ocAEliminar,
    staleTime: 0,
    retry: false,
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/oc/${id}`, { data: { confirmado: true } }).then(r => r.data),
    onSuccess: (data) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['oc-pendientes-facturar'] })
      toast.success(data.mensaje || 'OC eliminada')
      if (data.compra_desvinculada) toast('Compra desvinculada — revísala en Compras', { icon: '⚠️' })
      setOcAEliminar(null)
      if (vista === 'detalle') { setVista('lista'); setOcId(null) }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar OC'),
  })

  // Helpers
  const calcNeto  = (items) => items.reduce((s, i) => s + (Number(i.precio_unitario || 0) * Number(i.cantidad || 0)), 0)
  const addItem   = () => setForm(f => ({ ...f, items: [...f.items, { ...ITEM_INIT }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx, field, val) => setForm(f => {
    const items = [...f.items]; items[idx] = { ...items[idx], [field]: val }; return { ...f, items }
  })

  const abrirDetalle = (oc) => { setOcId(oc.id); setDetalleTab('detalle'); setVista('detalle') }

  const abrirRecepcion = (oc) => {
    setRecepcionLineas((oc.items || []).map(i => ({
      linea_oc_id: i.id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad_solicitada: i.cantidad,
      ya_recibido: i.cantidad_recibida_total || 0,
      cantidad_recibida: 0,
    })))
    setRecepcionActiva(true)
  }

  const handleSubmitOC = (e) => {
    e.preventDefault()
    if (!form.proveedor) { toast.error('Proveedor requerido'); return }
    const items = form.items.filter(i => i.codigo && Number(i.cantidad) > 0)
    if (!items.length) { toast.error('Al menos un ítem con SKU y cantidad > 0'); return }
    crearMut.mutate({ ...form, items, usuario_id: user?.id, usuario_nombre: user?.nombre })
  }

  // Filtered list
  const ocsFiltradas = useMemo(() => {
    if (!busqueda) return ocs
    const q = busqueda.toLowerCase()
    return ocs.filter(o => o.numero?.toLowerCase().includes(q) || o.proveedor?.toLowerCase().includes(q))
  }, [ocs, busqueda])

  const pendientesAuth = ocs.filter(o => o.estado === 'pendiente_autorizacion').length

  // ── VISTA LISTA ─────────────────────────────────────────────────────────────
  if (vista === 'lista') return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            Órdenes de Compra
            {pendientesAuth > 0 && (
              <span className="ml-3 text-sm font-bold px-2 py-0.5 rounded-full animate-pulse" style={{ background: 'rgba(244,162,60,0.2)', color: 'var(--rmg-gold)' }}>
                {pendientesAuth} por autorizar
              </span>
            )}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Ciclo logístico de compra · Creada → Recibida</p>
        </div>
        <button onClick={() => setVista('nueva')} className="btn-primary flex items-center gap-2">
          <Plus size={15}/> Nueva OC
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }} />
          <input className="rmg-input text-xs pl-8 w-60" placeholder="Buscar N°OC o proveedor…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <select className="rmg-input text-xs w-48" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {['borrador','pendiente_autorizacion','autorizada','rechazada','enviada_proveedor','recibida_parcial','recibida_total','facturada','pago_autorizado','pagada','anulada'].map(s => (
            <option key={s} value={s}>{ESTADO_CFG[s]?.label || s}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.015)' }}>
                {['N° OC','Proveedor','Fecha creación','Fecha requerida','Estado','Total','Ítems',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>)}
                </tr>
              )) : ocsFiltradas.map((oc, i) => (
                <tr key={oc.id} onClick={() => abrirDetalle(oc)} className="cursor-pointer hover:bg-white/[0.03] transition-colors"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td className="px-4 py-3 font-mono font-bold text-xs" style={{ color: 'var(--rmg-blt)' }}>{oc.numero}</td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{oc.proveedor}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(oc.fecha_emision || oc.created_at)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: oc.fecha_requerida ? 'var(--rmg-gold)' : 'var(--rmg-muted)' }}>{oc.fecha_requerida ? formatFecha(oc.fecha_requerida) : '—'}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={oc.estado} /></td>
                  <td className="px-4 py-3 font-bold" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(oc.total)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{(oc.items || []).length} líneas</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={e => { e.stopPropagation(); abrirDetalle(oc) }} className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blue)' }}>Ver →</button>
                      <button onClick={e => { e.stopPropagation(); setOcAEliminar({ id: oc.id, numero: oc.numero }) }} className="p-1.5 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }} title="Eliminar OC"><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && ocsFiltradas.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Package size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin OCs{filtroEstado ? ` en estado ${filtroEstado}` : ''}</p>
          </div>
        )}
      </div>
    </div>
  )

  // ── VISTA NUEVA OC ─────────────────────────────────────────────────────────
  if (vista === 'nueva') return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => setVista('lista')} className="p-2 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }}>
          <ChevronLeft size={18}/>
        </button>
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Nueva Orden de Compra</h1>
      </div>

      <div className="rmg-card p-6">
        <form onSubmit={handleSubmitOC} className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor *</label>
              <select className="rmg-input" value={form.proveedor_id}
                onChange={e => {
                  const prov = proveedores.find(p => p.id === e.target.value)
                  setForm(f => ({ ...f, proveedor_id: e.target.value, proveedor: prov?.razon_social || '' }))
                }}>
                <option value="">— Seleccionar proveedor —</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
              </select>
              {!form.proveedor_id && (
                <input className="rmg-input mt-1 text-xs" placeholder="O escribir nombre del proveedor"
                  value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha requerida</label>
              <input type="date" className="rmg-input" value={form.fecha_requerida} onChange={e => setForm(f => ({ ...f, fecha_requerida: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Medio de pago</label>
              <select className="rmg-input" value={form.medio_pago} onChange={e => setForm(f => ({ ...f, medio_pago: e.target.value }))}>
                {MEDIO_PAGO.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Observaciones</label>
              <input className="rmg-input" placeholder="Notas u observaciones para el proveedor…" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--rmg-muted)' }}>
              Líneas — <span style={{ color: 'var(--rmg-blue)' }}>escribe 2+ caracteres para buscar en lista de precios</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  {['Buscar','SKU','Descripción','Cant.','P. Unit. Neto','Subtotal',''].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, i) => (
                  <SkuRow key={i} item={item} idx={i} onUpdate={updateItem} onRemove={removeItem} showRemove={form.items.length > 1} />
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center mt-2">
              <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1 text-xs"><Plus size={13}/> Agregar línea</button>
              <div>
                <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Neto: <span className="font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(calcNeto(form.items))}</span></span>
                <span className="text-xs ml-3" style={{ color: 'var(--rmg-muted)' }}>IVA 19%: <span className="font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(Math.round(calcNeto(form.items) * 0.19))}</span></span>
                <span className="text-lg font-black ml-4" style={{ color: 'var(--rmg-gold)', fontFamily: 'Inter Tight, sans-serif' }}>
                  Total: {formatCLP(calcNeto(form.items) + Math.round(calcNeto(form.items) * 0.19))}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setVista('lista')} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">
              {crearMut.isPending ? 'Creando…' : 'Crear OC'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  // ── VISTA DETALLE ──────────────────────────────────────────────────────────
  const oc = ocDetalle
  const estado = oc?.estado || ''
  const neto   = oc?.neto  || (oc?.items || []).reduce((s, i) => s + (i.subtotal || 0), 0)
  const iva    = oc?.iva   || Math.round(neto * 0.19)
  const total  = oc?.total || neto + iva

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => { setVista('lista'); setOcId(null) }} className="p-2 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }}>
          <ChevronLeft size={18}/>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
              {cargandoDetalle ? '…' : oc?.numero || 'OC'}
            </h1>
            {oc && <EstadoBadge estado={oc.estado} />}
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{oc?.proveedor}</p>
        </div>
        {/* Action buttons per state */}
        <div className="flex gap-2 flex-wrap justify-end">
          {estado === 'borrador' && (
            <button onClick={() => estadoMut.mutate({ id: oc.id, nuevo_estado: 'pendiente_autorizacion' })} disabled={estadoMut.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50">
              <Send size={13}/> Enviar a autorización
            </button>
          )}
          {estado === 'pendiente_autorizacion' && esGerente && (<>
            <button onClick={() => estadoMut.mutate({ id: oc.id, nuevo_estado: 'autorizada' })} disabled={estadoMut.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: 'rgba(45,201,138,0.15)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.3)' }}>
              <CheckCircle size={13}/> Autorizar
            </button>
            <button onClick={() => setRechazarModal(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(224,90,78,0.12)', color: 'var(--rmg-red)', border: '1px solid rgba(224,90,78,0.3)' }}>
              <XCircle size={13}/> Rechazar
            </button>
          </>)}
          {estado === 'pendiente_autorizacion' && !esGerente && (
            <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(244,162,60,0.1)', color: 'var(--rmg-gold)' }}>
              En espera de autorización del gerente
            </span>
          )}
          {estado === 'rechazada' && (
            <button onClick={() => estadoMut.mutate({ id: oc.id, nuevo_estado: 'borrador' })} disabled={estadoMut.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' }}>
              <RotateCcw size={13}/> Volver a borrador
            </button>
          )}
          {estado === 'autorizada' && (<>
            <button onClick={() => window.open(`${api.defaults.baseURL}/oc/${oc.id}/pdf`, '_blank')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blue)', border: '1px solid rgba(56,182,255,0.2)' }}>
              <FileText size={13}/> PDF
            </button>
            <button onClick={() => setEmailModal(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blue)', border: '1px solid rgba(56,182,255,0.2)' }}>
              <Mail size={13}/> Enviar email
            </button>
            <button onClick={() => estadoMut.mutate({ id: oc.id, nuevo_estado: 'enviada_proveedor' })} disabled={estadoMut.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50">
              <Truck size={13}/> Marcar enviada a proveedor
            </button>
          </>)}
          {['enviada_proveedor', 'recibida_parcial'].includes(estado) && (
            <button onClick={() => { abrirRecepcion(oc); setDetalleTab('recepciones') }}
              className="btn-primary flex items-center gap-1.5 text-xs">
              <PackageCheck size={13}/> Registrar recepción
            </button>
          )}
          {estado === 'recibida_total' && (
            <button onClick={() => { setFacturaActiva(true); setDetalleTab('detalle') }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(45,201,138,0.15)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.3)' }}>
              <FileText size={13}/> Registrar factura
            </button>
          )}
          {estado === 'facturada' && esGerente && (
            <button onClick={() => estadoMut.mutate({ id: oc.id, nuevo_estado: 'pago_autorizado' })} disabled={estadoMut.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: 'rgba(244,162,60,0.15)', color: 'var(--rmg-gold)', border: '1px solid rgba(244,162,60,0.3)' }}>
              <CheckCircle size={13}/> Autorizar pago
            </button>
          )}
          {estado === 'facturada' && !esGerente && (
            <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(244,162,60,0.1)', color: 'var(--rmg-gold)' }}>
              Factura registrada — en espera de autorización de pago
            </span>
          )}
          {estado === 'pago_autorizado' && esGerente && (
            <button onClick={() => estadoMut.mutate({ id: oc.id, nuevo_estado: 'pagada' })} disabled={estadoMut.isPending}
              className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50">
              💸 Marcar pagada
            </button>
          )}
          {estado === 'pago_autorizado' && !esGerente && (
            <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(45,201,138,0.1)', color: 'var(--rmg-teal)' }}>
              Pago autorizado — pendiente de pagar
            </span>
          )}
          {/* Delete always visible */}
          {oc && (
            <button onClick={() => setOcAEliminar({ id: oc.id, numero: oc.numero })}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(224,90,78,0.1)', color: 'var(--rmg-red)', border: '1px solid rgba(224,90,78,0.25)' }}>
              <Trash2 size={13}/> Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {[
          { id: 'detalle', label: 'Detalle', icon: ClipboardList },
          { id: 'recepciones', label: 'Recepciones', icon: PackageCheck },
          { id: 'historial', label: 'Historial', icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setDetalleTab(id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors"
            style={{
              borderColor: detalleTab === id ? 'var(--rmg-blue)' : 'transparent',
              color: detalleTab === id ? 'var(--rmg-blue)' : 'var(--rmg-muted)',
            }}>
            <Icon size={14}/> {label}
            {id === 'historial' && oc?.historial?.length > 0 && (
              <span className="text-xs ml-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(56,182,255,0.15)', color: 'var(--rmg-blue)' }}>
                {oc.historial.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {cargandoDetalle && <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>}

      {/* Tab: Detalle */}
      {!cargandoDetalle && detalleTab === 'detalle' && oc && (
        <div className="space-y-4">
          {/* Info header */}
          <div className="rmg-card p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Proveedor', oc.proveedor],
              ['Fecha emisión', oc.fecha_emision ? formatFecha(oc.fecha_emision) : '—'],
              ['Fecha requerida', oc.fecha_requerida ? formatFecha(oc.fecha_requerida) : '—'],
              ['Medio de pago', oc.medio_pago || '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <div className="text-xs uppercase tracking-wider font-semibold mb-0.5" style={{ color: 'var(--rmg-muted)' }}>{label}</div>
                <div className="text-sm font-medium" style={{ color: 'var(--rmg-off)' }}>{val}</div>
              </div>
            ))}
            {oc.observaciones && (
              <div className="md:col-span-4">
                <div className="text-xs uppercase tracking-wider font-semibold mb-0.5" style={{ color: 'var(--rmg-muted)' }}>Observaciones</div>
                <div className="text-sm" style={{ color: 'var(--rmg-off)' }}>{oc.observaciones}</div>
              </div>
            )}
            {estado === 'rechazada' && oc.motivo_rechazo && (
              <div className="md:col-span-4 rounded-lg p-3" style={{ background: 'rgba(224,90,78,0.08)', border: '1px solid rgba(224,90,78,0.2)' }}>
                <div className="text-xs font-bold mb-0.5" style={{ color: 'var(--rmg-red)' }}>Motivo de rechazo</div>
                <div className="text-sm" style={{ color: 'var(--rmg-off)' }}>{oc.motivo_rechazo}</div>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="rmg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'rgba(56,182,255,0.1)', color: 'var(--rmg-muted)' }}>Líneas de producto</div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(56,182,255,0.08)' }}>
                  {['SKU','Descripción','Solicitado','Recibido','P. Unit. Neto','Subtotal'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(oc.items || []).map(item => {
                  const recibido = item.cantidad_recibida_total || 0
                  const completada = recibido >= item.cantidad
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{item.codigo}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--rmg-off)' }}>{item.descripcion}</td>
                      <td className="px-4 py-2.5 text-center">{item.cantidad}</td>
                      <td className="px-4 py-2.5 text-center font-semibold" style={{ color: completada ? 'var(--rmg-teal)' : recibido > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' }}>
                        {recibido} {recibido > 0 && !completada ? `/ ${item.cantidad}` : ''}
                        {completada && <CheckCircle size={13} className="inline ml-1" style={{ color: 'var(--rmg-teal)' }} />}
                      </td>
                      <td className="px-4 py-2.5 text-right" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(item.precio_unitario)}</td>
                      <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(item.subtotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 flex justify-end gap-6 border-t" style={{ borderColor: 'rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Neto: <span className="font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(neto)}</span></div>
              <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>IVA 19%: <span className="font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(iva)}</span></div>
              <div className="text-base font-black" style={{ color: 'var(--rmg-gold)', fontFamily: 'Inter Tight, sans-serif' }}>Total: {formatCLP(total)}</div>
            </div>
          </div>

          {/* recibida_total: stock ya actualizado, falta registrar la factura */}
          {estado === 'recibida_total' && !facturaActiva && (
            <div className="rmg-card p-4 flex items-center justify-between" style={{ border: '1px solid rgba(45,201,138,0.25)', background: 'rgba(45,201,138,0.06)' }}>
              <div>
                <div className="font-semibold" style={{ color: 'var(--rmg-teal)' }}>✅ OC recepcionada — stock actualizado</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Registra los datos de la factura del proveedor para enviarla a autorización de pago</div>
              </div>
              <button onClick={() => setFacturaActiva(true)} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold"
                style={{ background: 'rgba(45,201,138,0.15)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.3)' }}>
                <FileText size={14}/> Registrar factura
              </button>
            </div>
          )}

          {/* Formulario de registro de factura */}
          {estado === 'recibida_total' && facturaActiva && (
            <div className="rmg-card p-4 animate-fade-in">
              <h3 className="font-bold text-sm mb-3">Datos de la factura del proveedor</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Factura *</label>
                  <input className="rmg-input text-sm" value={facturaForm.numero_factura}
                    onChange={e => setFacturaForm(f => ({ ...f, numero_factura: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha factura *</label>
                  <input type="date" className="rmg-input text-sm" value={facturaForm.fecha_factura}
                    onChange={e => setFacturaForm(f => ({ ...f, fecha_factura: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Vencimiento pago *</label>
                  <input type="date" className="rmg-input text-sm" value={facturaForm.fecha_vencimiento_pago}
                    onChange={e => setFacturaForm(f => ({ ...f, fecha_vencimiento_pago: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto total *</label>
                  <input type="number" min="0" className="rmg-input text-sm" value={facturaForm.monto_total}
                    onChange={e => setFacturaForm(f => ({ ...f, monto_total: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Modo de pago</label>
                  <select className="rmg-input text-sm" value={facturaForm.modo_pago}
                    onChange={e => setFacturaForm(f => ({ ...f, modo_pago: e.target.value }))}>
                    {MEDIO_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-4">
                <button onClick={() => { setFacturaActiva(false); setFacturaForm(FACTURA_INIT) }} className="btn-secondary text-xs">Cancelar</button>
                <button
                  disabled={facturaMut.isPending || !facturaForm.numero_factura || !facturaForm.fecha_vencimiento_pago || !facturaForm.monto_total}
                  onClick={() => facturaMut.mutate({ id: oc.id, body: { ...facturaForm, usuario_id: user?.id } })}
                  className="btn-primary text-xs disabled:opacity-50">
                  {facturaMut.isPending ? 'Registrando…' : 'Registrar factura'}
                </button>
              </div>
            </div>
          )}

          {/* Datos de factura ya registrada */}
          {['facturada', 'pago_autorizado', 'pagada'].includes(estado) && oc.numero_factura && (
            <div className="rmg-card p-4 flex items-center gap-6" style={{ border: '1px solid rgba(56,182,255,0.2)', background: 'rgba(56,182,255,0.05)' }}>
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-0.5" style={{ color: 'var(--rmg-muted)' }}>N° Factura</div>
                <div className="text-sm font-bold" style={{ color: 'var(--rmg-off)' }}>{oc.numero_factura}</div>
              </div>
              {oc.fecha_factura && (
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold mb-0.5" style={{ color: 'var(--rmg-muted)' }}>Fecha factura</div>
                  <div className="text-sm font-medium" style={{ color: 'var(--rmg-off)' }}>{formatFecha(oc.fecha_factura)}</div>
                </div>
              )}
              <div className="ml-auto">
                <EstadoBadge estado={estado} />
              </div>
            </div>
          )}

          <DocumentosPanel entidad="orden_compra" entidadId={oc.id} titulo="Documentos de la OC" />
        </div>
      )}

      {/* Tab: Recepciones */}
      {!cargandoDetalle && detalleTab === 'recepciones' && oc && (
        <div className="space-y-4">
          {/* Reception form */}
          {recepcionActiva && (
            <div className="rmg-card p-4 animate-fade-in">
              <h3 className="font-bold text-sm mb-3">Registrar nueva recepción</h3>
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    {['SKU','Descripción','Solicitado','Ya recibido','Pendiente','A recibir ahora'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recepcionLineas.map((linea, i) => {
                    const pendiente = linea.cantidad_solicitada - linea.ya_recibido
                    return (
                      <tr key={linea.linea_oc_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--rmg-blt)' }}>{linea.codigo}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-off)' }}>{linea.descripcion}</td>
                        <td className="px-3 py-2 text-center text-xs">{linea.cantidad_solicitada}</td>
                        <td className="px-3 py-2 text-center text-xs" style={{ color: 'var(--rmg-teal)' }}>{linea.ya_recibido}</td>
                        <td className="px-3 py-2 text-center text-xs font-bold" style={{ color: pendiente > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' }}>{pendiente}</td>
                        <td className="px-3 py-2 w-28">
                          <input type="number" min="0" max={pendiente} className="rmg-input text-xs text-center"
                            value={recepcionLineas[i].cantidad_recibida}
                            onChange={e => setRecepcionLineas(ls => ls.map((l, j) => j === i ? { ...l, cantidad_recibida: Number(e.target.value) } : l))}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex items-center gap-3">
                <input className="rmg-input text-xs flex-1" placeholder="Observación de recepción…" value={recepcionObs} onChange={e => setRecepcionObs(e.target.value)} />
                <button onClick={() => setRecepcionActiva(false)} className="btn-secondary text-xs">Cancelar</button>
                <button
                  disabled={recepcionMut.isPending}
                  onClick={() => recepcionMut.mutate({ id: oc.id, body: {
                    usuario_receptor_id: user?.id,
                    usuario_nombre: user?.nombre,
                    observacion: recepcionObs,
                    lineas: recepcionLineas,
                  }})}
                  className="btn-primary text-xs disabled:opacity-50">
                  {recepcionMut.isPending ? 'Registrando…' : 'Confirmar recepción'}
                </button>
              </div>
            </div>
          )}

          {!recepcionActiva && ['enviada_proveedor', 'recibida_parcial'].includes(estado) && (
            <button onClick={() => abrirRecepcion(oc)} className="btn-primary flex items-center gap-2 text-sm">
              <PackageCheck size={15}/> Nueva recepción
            </button>
          )}

          {/* History of receptions */}
          {(oc.recepciones || []).length === 0 ? (
            <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>
              <PackageCheck size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin recepciones aún</p>
            </div>
          ) : (oc.recepciones || []).map(r => (
            <div key={r.id} className="rmg-card p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>Recepción del {formatFecha(r.fecha_recepcion)}</div>
                  {r.observacion && <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{r.observacion}</div>}
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                    {['SKU','Descripción','Cant. recibida','De'].map(h => (
                      <th key={h} className="text-left px-3 py-1.5 font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(r.lineas || []).map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--rmg-blt)' }}>{l.codigo}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-off)' }}>{l.descripcion}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: 'var(--rmg-teal)' }}>{l.cantidad_recibida}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>/ {l.cantidad} solicitadas</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Historial */}
      {!cargandoDetalle && detalleTab === 'historial' && oc && (
        <div className="rmg-card p-5">
          {(oc.historial || []).length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--rmg-muted)' }}>
              <History size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin eventos registrados</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[18px] top-0 bottom-0 w-0.5" style={{ background: 'rgba(56,182,255,0.15)' }} />
              <div className="space-y-5">
                {(oc.historial || []).map((ev, i) => (
                  <div key={ev.id} className="flex gap-4 items-start">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 text-base"
                      style={{ background: 'var(--rmg-surface)', border: '2px solid rgba(56,182,255,0.2)' }}>
                      {TIPO_EVENTO_ICON[ev.tipo_evento] || '⚡'}
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold text-sm capitalize" style={{ color: 'var(--rmg-off)' }}>
                          {ev.tipo_evento?.replace(/_/g, ' ') || 'Evento'}
                        </span>
                        {ev.estado_nuevo && (
                          <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                            {ev.estado_anterior && `${ev.estado_anterior} → `}<span style={{ color: 'var(--rmg-blue)' }}>{ev.estado_nuevo}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                          {new Date(ev.fecha_evento).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        {ev.usuario_nombre && <span className="text-xs font-medium" style={{ color: 'var(--rmg-muted)' }}>· {ev.usuario_nombre}</span>}
                      </div>
                      {ev.detalle && <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{ev.detalle}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Rechazar */}
      {rechazarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-sm animate-fade-in">
            <h2 className="font-bold mb-3" style={{ color: 'var(--rmg-red)' }}>Rechazar OC {oc?.numero}</h2>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Motivo de rechazo *</label>
            <textarea className="rmg-input w-full text-sm" rows={3} placeholder="Describe el motivo del rechazo…" value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} />
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => { setRechazarModal(false); setMotivoRechazo('') }} className="btn-secondary">Cancelar</button>
              <button
                disabled={!motivoRechazo.trim() || estadoMut.isPending}
                onClick={() => estadoMut.mutate({ id: oc.id, nuevo_estado: 'rechazada', motivo_rechazo: motivoRechazo })}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'rgba(224,90,78,0.15)', color: 'var(--rmg-red)', border: '1px solid rgba(224,90,78,0.3)' }}>
                <XCircle size={14}/> Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Email */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-sm animate-fade-in">
            <h2 className="font-bold mb-3">Enviar OC por email</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Email destino *</label>
                <input className="rmg-input" type="email" placeholder="proveedor@ejemplo.cl"
                  value={emailForm.email_destino} onChange={e => setEmailForm(f => ({ ...f, email_destino: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Mensaje adicional</label>
                <textarea className="rmg-input w-full text-sm" rows={3}
                  value={emailForm.mensaje_adicional} onChange={e => setEmailForm(f => ({ ...f, mensaje_adicional: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setEmailModal(false)} className="btn-secondary">Cancelar</button>
              <button
                disabled={!emailForm.email_destino || emailMut.isPending}
                onClick={() => emailMut.mutate({ id: oc.id, body: emailForm })}
                className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                <Mail size={14}/> {emailMut.isPending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar eliminación */}
      {ocAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} style={{ color: 'var(--rmg-red)' }} />
              <h2 className="font-bold text-base" style={{ color: 'var(--rmg-red)' }}>
                Eliminar {ocAEliminar.numero}
              </h2>
            </div>

            <p className="text-sm mb-4" style={{ color: 'var(--rmg-muted)' }}>
              Esta acción no se puede deshacer.
            </p>

            {loadingImpacto ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Calculando impacto…</div>
            ) : impactoData ? (
              <div className="space-y-3">
                {impactoData.movimientos_stock?.length > 0 && (
                  <div className="rounded-lg p-3" style={{ background: 'rgba(224,90,78,0.08)', border: '1px solid rgba(224,90,78,0.2)' }}>
                    <div className="flex items-center gap-1.5 font-semibold text-sm mb-2" style={{ color: 'var(--rmg-red)' }}>
                      <AlertTriangle size={14}/> STOCK SERÁ REVERTIDO
                    </div>
                    <div className="space-y-1">
                      {impactoData.movimientos_stock.map((m, i) => (
                        <div key={i} className="text-xs flex justify-between" style={{ color: 'var(--rmg-off)' }}>
                          <span className="font-mono" style={{ color: 'var(--rmg-blt)' }}>{m.codigo}</span>
                          <span className="truncate mx-2" style={{ color: 'var(--rmg-muted)' }}>{m.descripcion}</span>
                          <span className="font-bold flex-shrink-0" style={{ color: 'var(--rmg-red)' }}>−{m.cantidad} unid.</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {impactoData.tiene_compra_vinculada && (
                  <div className="rounded-lg p-3" style={{ background: 'rgba(244,162,60,0.08)', border: '1px solid rgba(244,162,60,0.2)' }}>
                    <div className="font-semibold text-sm mb-1" style={{ color: 'var(--rmg-gold)' }}>
                      ⚠ COMPRA VINCULADA
                    </div>
                    <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                      Existe una compra asociada a esta OC. La compra <strong>NO</strong> se eliminará, pero quedará desvinculada. Revísala en el módulo Compras.
                    </p>
                  </div>
                )}

                {impactoData.movimientos_stock?.length === 0 && !impactoData.tiene_compra_vinculada && (
                  <div className="rounded-lg p-3" style={{ background: 'rgba(45,201,138,0.06)', border: '1px solid rgba(45,201,138,0.15)' }}>
                    <div className="text-sm" style={{ color: 'var(--rmg-teal)' }}>
                      ✓ Sin impacto en stock ni compras vinculadas.
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setOcAEliminar(null)} className="btn-secondary" disabled={deleteMut.isPending}>Cancelar</button>
              <button
                disabled={loadingImpacto || deleteMut.isPending}
                onClick={() => deleteMut.mutate(ocAEliminar.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'rgba(224,90,78,0.15)', color: 'var(--rmg-red)', border: '1px solid rgba(224,90,78,0.3)' }}>
                <Trash2 size={14}/>
                {deleteMut.isPending ? 'Eliminando…' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
