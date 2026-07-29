import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, X, ShoppingBag, Pencil, Trash2, Send, PackageCheck, CreditCard, Search, ChevronDown, ChevronUp, CheckCircle, XCircle, Truck, Copy, FileText, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@context/AuthContext'

const HOY = new Date().toISOString().split('T')[0]
const MEDIO_PAGO = ['Contado', 'Crédito 30 días', 'Crédito 60 días', 'Crédito 90 días']
const ITEM_INIT = { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0 }
const FORM_INIT = {
  fecha: HOY, proveedor_id: '', medio_pago: 'Contado',
  numero_factura: '', fecha_vencimiento: '', notas: '',
  items: [{ ...ITEM_INIT }],
}

// Estado → display y colores
const ESTADO_CONFIG = {
  borrador:              { label: 'Borrador',              cls: 'bg-gray-100 text-gray-800' },
  Pendiente_Autorizacion:{ label: 'Pend. Autorización',   cls: 'bg-yellow-100 text-yellow-800 animate-pulse' },
  Autorizada:            { label: 'Autorizada',            cls: 'bg-blue-100 text-blue-800' },
  Enviada_Proveedor:     { label: 'Enviada Proveedor',     cls: 'bg-cyan-100 text-cyan-800' },
  Recibida_Parcial:      { label: 'Recibida Parcial',      cls: 'bg-amber-100 text-amber-800' },
  Recibida_Bodega:       { label: 'Recibida Bodega',       cls: 'bg-orange-100 text-orange-800' },
  Facturada:             { label: 'Facturada',             cls: 'bg-purple-100 text-purple-800' },
  Pagada:                { label: 'Pagada',                cls: 'bg-green-100 text-green-800' },
  Rechazada:             { label: 'Rechazada',             cls: 'bg-red-100 text-red-800' },
  // estados heredados
  enviada:               { label: 'Enviada',               cls: 'bg-cyan-100 text-cyan-800' },
  recibida:              { label: 'Recibida',              cls: 'bg-orange-100 text-orange-800' },
  anulada:               { label: 'Anulada',               cls: 'bg-red-100 text-red-800' },
}

function EstadoBadge({ estado, pagada }) {
  if (pagada) {
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Pagada</span>
  }
  const cfg = ESTADO_CONFIG[estado] || { label: estado, cls: 'bg-gray-100 text-gray-700' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
}

function ProductoSearch({ onSelect, initialQuery = '' }) {
  const [query, setQuery]   = useState(initialQuery)
  const [open, setOpen]     = useState(false)
  const [debouncedQ, setDQ] = useState('')
  const wrapRef             = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['lp-buscar-oc-new', debouncedQ],
    queryFn: () => api.get('/lista-precios/buscar', { params: { q: debouncedQ } }).then(r => r.data),
    enabled: debouncedQ.length >= 2,
    staleTime: 60_000,
  })

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (p) => { onSelect(p); setQuery(p.codigo_sku); setOpen(false) }
  const handleClear  = () => { setQuery(''); setOpen(false); onSelect({ codigo_sku: '', descripcion: '', costo_unidad_neto: 0 }) }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }} />
        <input className="rmg-input text-xs pl-6 pr-6" placeholder="Buscar SKU, producto…" value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query.length >= 2 && setOpen(true)} autoComplete="off" />
        {query && <button type="button" onClick={handleClear} className="absolute right-1.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }}><X size={11}/></button>}
      </div>
      {open && debouncedQ.length >= 2 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border overflow-hidden shadow-xl"
          style={{ background: 'var(--rmg-surface)', borderColor: 'rgba(56,182,255,0.25)', maxHeight: 260, overflowY: 'auto' }}>
          {isFetching && <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Buscando…</div>}
          {!isFetching && resultados.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Sin resultados</div>}
          {resultados.map(p => (
            <button key={p.codigo_sku} type="button" onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors border-b"
              style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{p.codigo_sku}</span>
                <span className="font-bold text-xs" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(p.costo_unidad_neto)}</span>
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--rmg-off)' }}>{p.descripcion}</div>
              <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{p.marca} · {p.presentacion}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Modal genérico con campos
function Modal({ title, subtitle, fields, onConfirm, onClose, isPending }) {
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map(f => [f.key, f.default || ''])))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold">{title}</h2>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
        </div>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{f.label}{f.required && ' *'}</label>
              {f.type === 'select' ? (
                <select className="rmg-input" value={vals[f.key]} onChange={e => setVals(p => ({ ...p, [f.key]: e.target.value }))}>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type || 'text'} className="rmg-input" value={vals[f.key]}
                  onChange={e => setVals(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder || ''} />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-end pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="button" disabled={isPending} onClick={() => onConfirm(vals)} className="btn-primary disabled:opacity-50">
            {isPending ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ComprasPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const rol = user?.rol || 'admin'

  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [expandida, setExpandida] = useState(null)
  const [form, setForm] = useState(FORM_INIT)
  const [modal, setModal] = useState(null) // { type, oc }
  const [recepcionData, setRecepcionData] = useState(null) // { oc, lineas: [{linea_oc_id, cantidad_recibida}] }
  const [facturaData, setFacturaData] = useState(null) // { oc }
  const [facturaForm, setFacturaForm] = useState({ numero_factura: '', fecha_factura: '', fecha_vencimiento_pago: '', monto_total: '', modo_pago: 'transferencia' })
  const [emailModal, setEmailModal] = useState(null) // { oc }
  const [emailForm, setEmailForm] = useState({ email_destinatario: '', mensaje_adicional: '' })

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes-compra'],
    queryFn: () => api.get('/compras/ordenes').then(r => r.data),
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/compras/proveedores').then(r => r.data),
  })

  const { data: pendientes } = useQuery({
    queryKey: ['oc-pendientes-workflow'],
    queryFn: () => api.get('/compras/ordenes/pendientes-workflow').then(r => r.data),
    staleTime: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
    qc.invalidateQueries({ queryKey: ['oc-pendientes-workflow'] })
  }

  const onWfSuccess = (msg) => (res) => {
    invalidate()
    if (res?.advertencias?.length) res.advertencias.forEach(w => toast(w, { icon: '⚠️' }))
    toast.success(msg)
    setModal(null)
  }
  const onWfError = (e) => toast.error(e.response?.data?.error || 'Error')

  const crearMut = useMutation({
    mutationFn: (d) => api.post('/compras/ordenes', d).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('OC creada'); setForm(FORM_INIT); setShowForm(false) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear OC'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/compras/ordenes/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('OC actualizada'); setEditando(null) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const enviarAuthMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/enviar-autorizacion`).then(r => r.data),
    onSuccess: onWfSuccess('Enviada a autorización'), onError: onWfError,
  })
  const autorizarMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/autorizar`).then(r => r.data),
    onSuccess: onWfSuccess('OC autorizada'), onError: onWfError,
  })
  const enviarProvMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/enviar-proveedor`).then(r => r.data),
    onSuccess: onWfSuccess('Enviada al proveedor'), onError: onWfError,
  })
  const rechazarMut = useMutation({
    mutationFn: ({ id, motivo_rechazo }) => api.post(`/compras/ordenes/${id}/rechazar`, { motivo_rechazo }).then(r => r.data),
    onSuccess: onWfSuccess('OC rechazada'), onError: onWfError,
  })
  const recibirBodMut = useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/compras/ordenes/${id}/recibir-bodega`, body).then(r => r.data),
    onSuccess: onWfSuccess('Recibida en bodega — stock actualizado'), onError: onWfError,
  })
  const autPagoMut = useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/compras/ordenes/${id}/autorizar-pago`, body).then(r => r.data),
    onSuccess: onWfSuccess('Pago autorizado — egreso registrado'), onError: onWfError,
  })

  // Flujo legado
  const enviarMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/enviar`).then(r => r.data),
    onSuccess: onWfSuccess('OC enviada al proveedor'), onError: onWfError,
  })
  const recibirMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/recibir`).then(r => r.data),
    onSuccess: onWfSuccess('OC recibida — stock actualizado'), onError: onWfError,
  })
  const pagarMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/pagar`).then(r => r.data),
    onSuccess: onWfSuccess('Pago registrado — egreso en flujo de caja'), onError: onWfError,
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/compras/ordenes/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('OC eliminada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  })

  const recepcionMut = useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/compras/ordenes/${id}/recepcion`, body).then(r => r.data),
    onSuccess: (res) => {
      invalidate()
      if (res?.advertencias?.length) res.advertencias.forEach(w => toast(w, { icon: '⚠️' }))
      toast.success('Recepción registrada — stock actualizado')
      setRecepcionData(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar recepción'),
  })

  const facturaMut = useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/compras/ordenes/${id}/factura`, body).then(r => r.data),
    onSuccess: () => {
      invalidate()
      toast.success('Factura registrada — egreso en flujo de caja')
      setFacturaData(null)
      setFacturaForm({ numero_factura: '', fecha_factura: '', fecha_vencimiento_pago: '', monto_total: '', modo_pago: 'transferencia' })
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar factura'),
  })

  const emailMut = useMutation({
    mutationFn: ({ id, ...body }) => api.post(`/compras/ordenes/${id}/enviar-email`, body).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res.mensaje || 'Email enviado')
      setEmailModal(null)
      setEmailForm({ email_destinatario: '', mensaje_adicional: '' })
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al enviar email'),
  })

  const abrirRecepcion = (oc) => {
    const lineas = (oc.items || []).map(i => ({
      linea_oc_id: i.id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad_oc: i.cantidad,
      cantidad_recibida_total: i.cantidad_recibida_total || 0,
      cantidad_recibida: 0,
    }))
    setRecepcionData({ oc, lineas, observacion: '' })
  }

  const abrirFactura = (oc) => {
    setFacturaData({ oc })
    setFacturaForm({ numero_factura: oc.numero_factura || '', fecha_factura: HOY, fecha_vencimiento_pago: oc.fecha_vencimiento || '', monto_total: oc.total || '', modo_pago: 'transferencia' })
  }

  const submitRecepcion = () => {
    const lineasFiltradas = recepcionData.lineas.filter(l => Number(l.cantidad_recibida) > 0)
    if (!lineasFiltradas.length) { toast.error('Ingresa al menos una cantidad > 0'); return }
    recepcionMut.mutate({
      id: recepcionData.oc.id,
      lineas: lineasFiltradas.map(l => ({ linea_oc_id: l.linea_oc_id, cantidad_recibida: Number(l.cantidad_recibida) })),
      observacion: recepcionData.observacion,
    })
  }

  const submitFactura = () => {
    const { numero_factura, fecha_factura, fecha_vencimiento_pago, monto_total, modo_pago } = facturaForm
    if (!numero_factura || !fecha_factura || !fecha_vencimiento_pago || !monto_total || !modo_pago) {
      toast.error('Completa todos los campos de facturación'); return
    }
    facturaMut.mutate({ id: facturaData.oc.id, ...facturaForm, monto_total: Number(monto_total) })
  }

  const abrirPdf = (oc) => {
    window.open(`${api.defaults.baseURL}/compras/ordenes/${oc.id}/pdf`, '_blank')
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...ITEM_INIT }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx, field, val) => setForm(f => {
    const items = [...f.items]; items[idx] = { ...items[idx], [field]: val }; return { ...f, items }
  })
  const handleProductoSelect = (idx, p) => setForm(f => {
    const items = [...f.items]
    items[idx] = { ...items[idx], codigo: p.codigo_sku || '', descripcion: p.descripcion || '', precio_unitario: p.costo_unidad_neto || 0 }
    return { ...f, items }
  })

  const calcTotal = (items) => items.reduce((s, i) => s + (Number(i.precio_unitario || 0) * Number(i.cantidad || 0)), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.proveedor_id) { toast.error('Selecciona un proveedor'); return }
    const prov = proveedores.find(p => p.id === form.proveedor_id)
    const validItems = form.items.filter(i => i.codigo && Number(i.cantidad) > 0)
    if (!validItems.length) { toast.error('Agrega al menos un ítem con SKU y cantidad'); return }
    crearMut.mutate({ ...form, proveedor: prov?.razon_social || '', items: validItems })
  }

  const duplicarComoBorrador = (oc) => {
    setForm({
      fecha: HOY, proveedor_id: oc.proveedor_id || '',
      medio_pago: oc.medio_pago || 'Contado',
      numero_factura: '', fecha_vencimiento: '', notas: oc.notas || '',
      items: (oc.items || []).map(i => ({ codigo: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario })),
    })
    setShowForm(true)
    toast('Formulario cargado con los datos de la OC anterior', { icon: '📋' })
  }

  const totalOCs   = ordenes.reduce((s, o) => s + (o.total || 0), 0)
  const pendPago   = ordenes.filter(o => o.estado === 'Recibida_Bodega' || (o.estado === 'recibida' && !o.pagada)).reduce((s, o) => s + (o.total || 0), 0)
  const enTransito = ordenes.filter(o => ['enviada', 'Enviada_Proveedor'].includes(o.estado)).length
  const pendAuth   = pendientes?.pendAuth || 0

  const renderAcciones = (oc) => {
    const botones = []
    const esAdmin   = rol === 'admin'
    const esGerente = rol === 'admin' || rol === 'gerente' || rol === 'finanzas'

    // Flujo NUEVO
    if (oc.estado === 'borrador' && !oc.pagada) {
      if (esAdmin) {
        botones.push(
          <button key="edit" onClick={() => setEditando({ ...oc })} className="p-1.5 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }} title="Editar"><Pencil size={13}/></button>,
          <button key="send-auth" onClick={() => enviarAuthMut.mutate(oc.id)} disabled={enviarAuthMut.isPending}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
            style={{ background: 'rgba(234,179,8,0.15)', color: '#854d0e', border: '1px solid rgba(234,179,8,0.4)' }}>
            <Send size={11}/> Env. Autorización
          </button>
        )
      }
    }
    if (oc.estado === 'Pendiente_Autorizacion') {
      if (esGerente) {
        botones.push(
          <button key="autorizar" onClick={() => autorizarMut.mutate(oc.id)} disabled={autorizarMut.isPending}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#1d4ed8', border: '1px solid rgba(59,130,246,0.4)' }}>
            <CheckCircle size={11}/> Autorizar
          </button>,
          <button key="rechazar" onClick={() => setModal({ type: 'rechazar', oc })}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.3)' }}>
            <XCircle size={11}/> Rechazar
          </button>
        )
      }
    }
    if (oc.estado === 'Autorizada') {
      if (esAdmin) {
        botones.push(
          <button key="env-prov" onClick={() => enviarProvMut.mutate(oc.id)} disabled={enviarProvMut.isPending}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
            style={{ background: 'rgba(6,182,212,0.15)', color: '#0e7490', border: '1px solid rgba(6,182,212,0.4)' }}>
            <Truck size={11}/> Enviar Proveedor
          </button>,
          <button key="pdf-aut" onClick={() => abrirPdf(oc)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(99,102,241,0.12)', color: '#4338ca', border: '1px solid rgba(99,102,241,0.3)' }}>
            <FileText size={11}/> PDF
          </button>,
          <button key="email-aut" onClick={() => { setEmailModal({ oc }); setEmailForm({ email_destinatario: '', mensaje_adicional: '' }) }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(20,184,166,0.12)', color: '#0f766e', border: '1px solid rgba(20,184,166,0.3)' }}>
            <Mail size={11}/> Email
          </button>
        )
      }
    }
    if (oc.estado === 'Enviada_Proveedor' || oc.estado === 'Recibida_Parcial') {
      if (esAdmin) {
        botones.push(
          <button key="recibir-parcial" onClick={() => abrirRecepcion(oc)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(249,115,22,0.15)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.4)' }}>
            <PackageCheck size={11}/> {oc.estado === 'Recibida_Parcial' ? 'Recepción adicional' : 'Registrar Recepción'}
          </button>
        )
      }
    }
    if (oc.estado === 'Recibida_Bodega' || oc.estado === 'Recibida_Parcial') {
      if (esGerente) {
        botones.push(
          <button key="facturar" onClick={() => abrirFactura(oc)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(168,85,247,0.15)', color: '#7c3aed', border: '1px solid rgba(168,85,247,0.4)' }}>
            <FileText size={11}/> Registrar Factura
          </button>
        )
        botones.push(
          <button key="aut-pago" onClick={() => setModal({ type: 'autorizar-pago', oc })}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#15803d', border: '1px solid rgba(34,197,94,0.4)' }}>
            <CreditCard size={11}/> Autorizar Pago
          </button>
        )
      }
    }
    if (oc.estado === 'Facturada') {
      if (esGerente) {
        botones.push(
          <button key="pagar-fact" onClick={() => setModal({ type: 'autorizar-pago', oc })}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#15803d', border: '1px solid rgba(34,197,94,0.4)' }}>
            <CreditCard size={11}/> Autorizar Pago
          </button>
        )
      }
    }
    if (oc.estado === 'Rechazada') {
      if (esAdmin) {
        botones.push(
          <button key="duplicar" onClick={() => duplicarComoBorrador(oc)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(148,163,184,0.15)', color: '#475569', border: '1px solid rgba(148,163,184,0.3)' }}>
            <Copy size={11}/> Duplicar
          </button>
        )
      }
    }
    // Flujo legado
    if (oc.estado === 'borrador' && !oc.pagada && esAdmin) {
      botones.push(
        <button key="enviar-leg" onClick={() => enviarMut.mutate(oc.id)} disabled={enviarMut.isPending}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
          style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)', border: '1px solid rgba(56,182,255,0.25)' }}>
          <Send size={11}/> Enviar
        </button>
      )
    }
    if (oc.estado === 'enviada' && !oc.pagada && esAdmin) {
      botones.push(
        <button key="recibir-leg" onClick={() => recibirMut.mutate(oc.id)} disabled={recibirMut.isPending}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
          style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.25)' }}>
          <PackageCheck size={11}/> Recibida
        </button>
      )
    }
    if (oc.estado === 'recibida' && !oc.pagada && esGerente) {
      botones.push(
        <button key="pagar-leg" onClick={() => { if (confirm(`¿Registrar pago de ${oc.numero}?`)) pagarMut.mutate(oc.id) }} disabled={pagarMut.isPending}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
          style={{ background: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)', border: '1px solid rgba(244,162,60,0.25)' }}>
          <CreditCard size={11}/> Pagar
        </button>
      )
    }
    // Eliminar siempre disponible para admin
    if (esAdmin && !['Pagada'].includes(oc.estado) && !oc.pagada) {
      botones.push(
        <button key="delete" onClick={() => {
          const msg = oc.estado === 'recibida' || oc.estado === 'Recibida_Bodega'
            ? `¿Eliminar OC ${oc.numero}?\nSe revertirá el stock agregado al inventario.`
            : `¿Eliminar OC ${oc.numero}?`
          if (confirm(msg)) eliminarMut.mutate(oc.id)
        }} className="p-1.5 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }} title="Eliminar">
          <Trash2 size={13}/>
        </button>
      )
    }
    return botones
  }

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Órdenes de Compra</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Borrador → Autorización → Enviada → Bodega → Pago</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nueva OC</>}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>OCs totales</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{ordenes.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(totalOCs)} comprado</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Por pagar</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>{formatCLP(pendPago)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>recibidas sin pagar</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>En tránsito</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-purple)' }}>{enTransito}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>enviadas al proveedor</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Pend. autorización</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: pendAuth > 0 ? '#ca8a04' : 'var(--rmg-muted)' }}>{pendAuth}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>esperando aprobación</div>
        </div>
      </div>

      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Nueva orden de compra</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha *</label>
                <input type="date" className="rmg-input" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor *</label>
                <select className="rmg-input" value={form.proveedor_id} onChange={e => setForm(p => ({ ...p, proveedor_id: e.target.value }))} required>
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Medio de pago</label>
                <select className="rmg-input" value={form.medio_pago} onChange={e => setForm(p => ({ ...p, medio_pago: e.target.value }))}>
                  {MEDIO_PAGO.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Factura</label>
                <input className="rmg-input" placeholder="F-12345" value={form.numero_factura} onChange={e => setForm(p => ({ ...p, numero_factura: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Vencimiento</label>
                <input type="date" className="rmg-input" value={form.fecha_vencimiento} onChange={e => setForm(p => ({ ...p, fecha_vencimiento: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
                <input className="rmg-input" placeholder="Observaciones..." value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--rmg-muted)' }}>
                Ítems — <span style={{ color: 'var(--rmg-blue)' }}>escribe 2+ caracteres para buscar en lista de precios</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                      {['Buscar producto', 'Código', 'Descripción', 'Cant.', 'Costo unit.', 'Subtotal', ''].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, i) => {
                      const sub = Number(item.precio_unitario || 0) * Number(item.cantidad || 0)
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-3 py-2 min-w-52">
                            <ProductoSearch initialQuery={item.codigo || ''} onSelect={(p) => handleProductoSelect(i, p)} />
                          </td>
                          <td className="px-3 py-2 w-28">
                            <input className="rmg-input text-xs font-mono" placeholder="SKU" value={item.codigo} onChange={e => updateItem(i, 'codigo', e.target.value)} />
                          </td>
                          <td className="px-3 py-2 min-w-40">
                            <input className="rmg-input text-xs" placeholder="Descripción" value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} />
                          </td>
                          <td className="px-3 py-2 w-20">
                            <input type="number" min="0.01" step="any" className="rmg-input text-xs text-center" value={item.cantidad} onChange={e => updateItem(i, 'cantidad', e.target.value)} />
                          </td>
                          <td className="px-3 py-2 w-32">
                            <input type="number" min="0" className="rmg-input text-xs text-right" value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', e.target.value)} />
                          </td>
                          <td className="px-3 py-2 font-bold text-right text-sm" style={{ color: 'var(--rmg-off)', whiteSpace: 'nowrap' }}>{formatCLP(sub)}</td>
                          <td className="px-3 py-2">
                            {form.items.length > 1 && (
                              <button type="button" onClick={() => removeItem(i)} className="p-1 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}><X size={13}/></button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center mt-2">
                <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1 text-xs"><Plus size={13}/> Agregar ítem</button>
                <div className="font-black text-lg" style={{ color: 'var(--rmg-gold)', fontFamily: 'Inter Tight, sans-serif' }}>Total: {formatCLP(calcTotal(form.items))}</div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">
                {crearMut.isPending ? 'Guardando...' : 'Crear OC'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Editar OC</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{editando.numero}</p>
              </div>
              <button onClick={() => setEditando(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              editarMut.mutate({ id: editando.id, data: { medio_pago: editando.medio_pago, numero_factura: editando.numero_factura, fecha_vencimiento: editando.fecha_vencimiento, notas: editando.notas } })
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Medio de pago</label>
                <select className="rmg-input" value={editando.medio_pago || 'Contado'} onChange={e => setEditando(p => ({ ...p, medio_pago: e.target.value }))}>
                  {MEDIO_PAGO.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Factura</label>
                <input className="rmg-input" value={editando.numero_factura || ''} onChange={e => setEditando(p => ({ ...p, numero_factura: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Vencimiento</label>
                <input type="date" className="rmg-input" value={editando.fecha_vencimiento || ''} onChange={e => setEditando(p => ({ ...p, fecha_vencimiento: e.target.value }))} />
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

      {/* Modales de acciones */}
      {modal?.type === 'rechazar' && (
        <Modal
          title="Rechazar OC" subtitle={modal.oc.numero}
          fields={[{ key: 'motivo_rechazo', label: 'Motivo de rechazo', required: true, placeholder: 'Indica el motivo...' }]}
          onConfirm={(vals) => rechazarMut.mutate({ id: modal.oc.id, ...vals })}
          onClose={() => setModal(null)} isPending={rechazarMut.isPending}
        />
      )}
      {modal?.type === 'recibir-bodega' && (
        <Modal
          title="Registrar Recepción en Bodega" subtitle={modal.oc.numero}
          fields={[
            { key: 'numero_factura', label: 'N° Factura proveedor', placeholder: 'F-12345' },
            { key: 'fecha_factura', label: 'Fecha factura', type: 'date', default: HOY },
          ]}
          onConfirm={(vals) => recibirBodMut.mutate({ id: modal.oc.id, ...vals })}
          onClose={() => setModal(null)} isPending={recibirBodMut.isPending}
        />
      )}
      {modal?.type === 'autorizar-pago' && (
        <Modal
          title="Autorizar Pago OC" subtitle={`${modal.oc.numero} · ${formatCLP(modal.oc.total)}`}
          fields={[
            { key: 'forma_pago', label: 'Forma de pago', required: true, type: 'select', options: ['Transferencia bancaria', 'Cheque', 'Efectivo', 'Crédito'], default: 'Transferencia bancaria' },
            { key: 'fecha_pago', label: 'Fecha de pago', type: 'date', default: HOY },
          ]}
          onConfirm={(vals) => autPagoMut.mutate({ id: modal.oc.id, ...vals })}
          onClose={() => setModal(null)} isPending={autPagoMut.isPending}
        />
      )}

      {/* ── Modal recepción parcial por línea ── */}
      {recepcionData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rmg-card p-6 w-full max-w-2xl animate-fade-in" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Registrar Recepción</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{recepcionData.oc.numero} · {recepcionData.oc.proveedor}</p>
              </div>
              <button onClick={() => setRecepcionData(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--rmg-muted)' }}>
              Ingresa la cantidad recibida para cada línea. Deja en 0 lo que no llegó. Si no llega el 100%, el estado quedará como "Recibida Parcial".
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs mb-4">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Código','Descripción','Cant. OC','Recibido ant.','Pendiente','A recibir ahora'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recepcionData.lineas.map((linea, i) => {
                    const pendiente = Math.max(0, linea.cantidad_oc - linea.cantidad_recibida_total)
                    return (
                      <tr key={linea.linea_oc_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--rmg-blt)' }}>{linea.codigo}</td>
                        <td className="px-3 py-2 max-w-xs truncate" style={{ color: 'var(--rmg-off)' }}>{linea.descripcion}</td>
                        <td className="px-3 py-2 text-center">{linea.cantidad_oc}</td>
                        <td className="px-3 py-2 text-center" style={{ color: 'var(--rmg-teal)' }}>{linea.cantidad_recibida_total}</td>
                        <td className="px-3 py-2 text-center" style={{ color: pendiente > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' }}>{pendiente}</td>
                        <td className="px-3 py-2 w-28">
                          {pendiente > 0 ? (
                            <input type="number" min="0" max={pendiente} step="any" className="rmg-input text-xs text-center"
                              value={linea.cantidad_recibida}
                              onChange={e => setRecepcionData(prev => ({
                                ...prev,
                                lineas: prev.lineas.map((l, j) => j === i ? { ...l, cantidad_recibida: e.target.value } : l)
                              }))} />
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>✓ Completo</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Observación</label>
              <input className="rmg-input" placeholder="Ej: Llegó sin guía de despacho, falta 1 ítem..." value={recepcionData.observacion}
                onChange={e => setRecepcionData(p => ({ ...p, observacion: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRecepcionData(null)} className="btn-secondary">Cancelar</button>
              <button onClick={submitRecepcion} disabled={recepcionMut.isPending} className="btn-primary disabled:opacity-50">
                {recepcionMut.isPending ? 'Registrando...' : 'Registrar recepción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal registro de factura proveedor ── */}
      {facturaData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rmg-card p-6 w-full max-w-lg animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Registrar Factura Proveedor</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{facturaData.oc.numero} · {facturaData.oc.proveedor}</p>
              </div>
              <button onClick={() => setFacturaData(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Factura Proveedor *</label>
                <input className="rmg-input" placeholder="F-12345" value={facturaForm.numero_factura}
                  onChange={e => setFacturaForm(p => ({ ...p, numero_factura: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha Factura *</label>
                  <input type="date" className="rmg-input" value={facturaForm.fecha_factura}
                    onChange={e => setFacturaForm(p => ({ ...p, fecha_factura: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha Vencimiento Pago *</label>
                  <input type="date" className="rmg-input" value={facturaForm.fecha_vencimiento_pago}
                    onChange={e => setFacturaForm(p => ({ ...p, fecha_vencimiento_pago: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto Total Factura *</label>
                <input type="number" min="0" className="rmg-input" placeholder={facturaData.oc.total} value={facturaForm.monto_total}
                  onChange={e => setFacturaForm(p => ({ ...p, monto_total: e.target.value }))} required />
                <p className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>Pre-relleno con total OC. Editable si hay diferencia.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Modo de Pago *</label>
                <select className="rmg-input" value={facturaForm.modo_pago} onChange={e => setFacturaForm(p => ({ ...p, modo_pago: e.target.value }))}>
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="cheque">Cheque</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="credito_proveedor">Crédito proveedor</option>
                </select>
              </div>
              <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(168,85,247,0.08)', color: 'var(--rmg-muted)', border: '1px solid rgba(168,85,247,0.2)' }}>
                Se registrará automáticamente un egreso en el flujo de caja con fecha de vencimiento del pago.
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <button onClick={() => setFacturaData(null)} className="btn-secondary">Cancelar</button>
              <button onClick={submitFactura} disabled={facturaMut.isPending} className="btn-primary disabled:opacity-50">
                {facturaMut.isPending ? 'Registrando...' : 'Registrar factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal enviar OC por email ── */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Enviar OC por Email</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{emailModal.oc.numero} · {emailModal.oc.proveedor}</p>
              </div>
              <button onClick={() => setEmailModal(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Email destinatario *</label>
                <input type="email" className="rmg-input" placeholder="proveedor@empresa.cl" value={emailForm.email_destinatario}
                  onChange={e => setEmailForm(p => ({ ...p, email_destinatario: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Mensaje adicional</label>
                <textarea className="rmg-input min-h-20" placeholder="Estimado proveedor, adjuntamos la OC para su confirmación..."
                  value={emailForm.mensaje_adicional} onChange={e => setEmailForm(p => ({ ...p, mensaje_adicional: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <button onClick={() => setEmailModal(null)} className="btn-secondary">Cancelar</button>
              <button onClick={() => emailMut.mutate({ id: emailModal.oc.id, ...emailForm })} disabled={emailMut.isPending} className="btn-primary disabled:opacity-50">
                {emailMut.isPending ? 'Enviando...' : 'Enviar email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel de alertas role-based */}
      {pendientes && (rol === 'gerente' || rol === 'admin') && (
        <div className="flex gap-3 flex-wrap">
          {(rol === 'gerente' || rol === 'admin') && pendientes.pendAuth > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg flex-1 min-w-48"
              style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm"
                style={{ background: 'rgba(234,179,8,0.25)', color: '#92400e' }}>{pendientes.pendAuth}</div>
              <div>
                <div className="text-xs font-bold" style={{ color: '#92400e' }}>OC esperando autorización</div>
                <div className="text-xs" style={{ color: '#a16207' }}>Requieren revisión y aprobación del gerente</div>
              </div>
            </div>
          )}
          {(rol === 'gerente' || rol === 'admin') && pendientes.recibidasBodega > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg flex-1 min-w-48"
              style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.35)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm"
                style={{ background: 'rgba(249,115,22,0.25)', color: '#9a3412' }}>{pendientes.recibidasBodega}</div>
              <div>
                <div className="text-xs font-bold" style={{ color: '#9a3412' }}>OC esperando aprobación de pago</div>
                <div className="text-xs" style={{ color: '#c2410c' }}>Recibidas en bodega — pendientes de pago</div>
              </div>
            </div>
          )}
          {rol === 'admin' && pendientes.autorizadas > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg flex-1 min-w-48"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.35)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm"
                style={{ background: 'rgba(59,130,246,0.25)', color: '#1e3a8a' }}>{pendientes.autorizadas}</div>
              <div>
                <div className="text-xs font-bold" style={{ color: '#1e3a8a' }}>OC autorizadas listas para enviar</div>
                <div className="text-xs" style={{ color: '#1d4ed8' }}>Listas para enviar al proveedor</div>
              </div>
            </div>
          )}
          {rol === 'admin' && pendientes.enviadasProv > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg flex-1 min-w-48"
              style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.35)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm"
                style={{ background: 'rgba(6,182,212,0.25)', color: '#164e63' }}>{pendientes.enviadasProv}</div>
              <div>
                <div className="text-xs font-bold" style={{ color: '#164e63' }}>OC enviadas sin recibir</div>
                <div className="text-xs" style={{ color: '#0e7490' }}>Pendientes de recepción en bodega</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
          <span className="font-bold text-sm">{ordenes.length} órdenes de compra</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.015)' }}>
                {['N° OC', 'Proveedor', 'Fecha', 'Total', 'Estado', 'Factura', 'Acciones', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                      ))}
                    </tr>
                  ))
                : ordenes.map((oc, idx) => {
                    const isExp = expandida === oc.id
                    const acciones = renderAcciones(oc)
                    return (
                      <>
                        <tr key={oc.id}
                          style={{ borderBottom: isExp ? 'none' : '1px solid rgba(255,255,255,0.04)', background: idx % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                          className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{oc.numero}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{oc.proveedor}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(oc.fecha_emision)}</td>
                          <td className="px-4 py-3 font-bold" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(oc.total)}</td>
                          <td className="px-4 py-3">
                            <EstadoBadge estado={oc.estado} pagada={oc.pagada} />
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{oc.numero_factura || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 items-center flex-wrap">{acciones}</div>
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setExpandida(isExp ? null : oc.id)} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }}>
                              {isExp ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </button>
                          </td>
                        </tr>
                        {isExp && (
                          <tr key={`${oc.id}-detail`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td colSpan={8} className="px-6 pb-4 pt-2">
                              {oc.motivo_rechazo && (
                                <div className="mb-2 text-xs px-3 py-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)' }}>
                                  Motivo rechazo: {oc.motivo_rechazo}
                                </div>
                              )}
                              {oc.autorizado_por && (
                                <div className="mb-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>
                                  Autorizado por: <span style={{ color: 'var(--rmg-teal)' }}>{oc.autorizado_por}</span> · {oc.fecha_autorizacion}
                                </div>
                              )}
                              <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--rmg-muted)' }}>
                                Ítems{oc.medio_pago ? ` · ${oc.medio_pago}` : ''}{oc.notas ? ` · ${oc.notas}` : ''}
                              </div>
                              <div className="flex justify-end mb-2">
                                <button onClick={() => abrirPdf(oc)}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                                  style={{ background: 'rgba(99,102,241,0.12)', color: '#4338ca', border: '1px solid rgba(99,102,241,0.25)' }}>
                                  <FileText size={11}/> Ver PDF
                                </button>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    {['Código', 'Descripción', 'Cantidad OC', 'Recibido', 'Costo unit.', 'Subtotal'].map(h => (
                                      <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(oc.items || []).map((item, ii) => {
                                    const recibido = item.cantidad_recibida_total || 0
                                    const completo = recibido >= item.cantidad
                                    return (
                                      <tr key={ii} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--rmg-blt)' }}>{item.codigo}</td>
                                        <td className="px-3 py-2" style={{ color: 'var(--rmg-off)' }}>{item.descripcion}</td>
                                        <td className="px-3 py-2 text-center">{item.cantidad}</td>
                                        <td className="px-3 py-2 text-center">
                                          <span className="font-semibold" style={{ color: completo ? 'var(--rmg-teal)' : recibido > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' }}>
                                            {recibido}{completo ? ' ✓' : ''}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(item.precio_unitario)}</td>
                                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(item.subtotal)}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
        {!isLoading && ordenes.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <ShoppingBag size={32} className="mx-auto mb-3 opacity-30"/>
            <p className="text-sm">No hay órdenes de compra</p>
          </div>
        )}
      </div>
    </div>
  )
}
