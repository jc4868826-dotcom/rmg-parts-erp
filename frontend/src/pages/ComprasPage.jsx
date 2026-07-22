import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, X, ShoppingBag, Pencil, Trash2, Send, PackageCheck, CreditCard, Search, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'

const HOY = new Date().toISOString().split('T')[0]
const MEDIO_PAGO = ['Contado', 'Crédito 30 días', 'Crédito 60 días', 'Crédito 90 días']
const ITEM_INIT = { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0 }
const FORM_INIT = {
  fecha: HOY, proveedor_id: '', medio_pago: 'Contado',
  numero_factura: '', fecha_vencimiento: '', notas: '',
  items: [{ ...ITEM_INIT }],
}

function getEstadoDisplay(oc) {
  if (oc.pagada) return 'Pagada'
  if (oc.estado === 'borrador') return 'Creada'
  if (oc.estado === 'enviada') return 'Enviada'
  if (oc.estado === 'recibida') return 'Recibida'
  if (oc.estado === 'anulada') return 'Anulada'
  return oc.estado
}

const ESTADO_STYLE = {
  Creada:   { color: 'rgba(90,143,168,0.9)', bg: 'rgba(90,143,168,0.12)' },
  Enviada:  { color: 'var(--rmg-blt)',       bg: 'rgba(56,182,255,0.12)' },
  Recibida: { color: 'var(--rmg-teal)',      bg: 'rgba(45,201,138,0.12)' },
  Pagada:   { color: 'var(--rmg-teal)',      bg: 'rgba(45,201,138,0.22)' },
  Anulada:  { color: 'var(--rmg-red)',       bg: 'rgba(224,90,78,0.12)'  },
}

// ── Exact copy of CotizacionForm ProductoSearch — costo_unidad_neto instead of precio_venta_neto
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

  const handleSelect = (p) => {
    onSelect(p)
    setQuery(p.codigo_sku)
    setOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    setOpen(false)
    onSelect({ codigo_sku: '', descripcion: '', costo_unidad_neto: 0 })
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }} />
        <input
          className="rmg-input text-xs pl-6 pr-6"
          placeholder="Buscar SKU, producto…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={handleClear} className="absolute right-1.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }}>
            <X size={11}/>
          </button>
        )}
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

export default function ComprasPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [expandida, setExpandida] = useState(null)
  const [form, setForm] = useState(FORM_INIT)

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes-compra'],
    queryFn: () => api.get('/compras/ordenes').then(r => r.data),
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/compras/proveedores').then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ordenes-compra'] })

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

  const enviarMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/enviar`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('OC enviada al proveedor') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const recibirMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/recibir`).then(r => r.data),
    onSuccess: (res) => {
      invalidate()
      if (res.advertencias?.length) res.advertencias.forEach(w => toast(w, { icon: '⚠️' }))
      toast.success('OC recibida — stock actualizado')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const pagarMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/pagar`).then(r => r.data),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['compras-erp'] })
      toast.success('Pago registrado — egreso en flujo de caja')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar pago'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/compras/ordenes/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('OC eliminada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  })

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

  const totalOCs  = ordenes.reduce((s, o) => s + (o.total || 0), 0)
  const pendPago  = ordenes.filter(o => o.estado === 'recibida' && !o.pagada).reduce((s, o) => s + (o.total || 0), 0)
  const enTransito = ordenes.filter(o => o.estado === 'enviada').length

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Órdenes de Compra</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Creada → Enviada → Recibida → Pagada</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nueva OC</>}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
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

      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
          <span className="font-bold text-sm">{ordenes.length} órdenes de compra</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.015)' }}>
                {['N° OC', 'Proveedor', 'Fecha', 'Total', 'Estado', 'Vencimiento', 'Acciones', ''].map(h => (
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
                    const estDisplay = getEstadoDisplay(oc)
                    const est = ESTADO_STYLE[estDisplay] || ESTADO_STYLE.Creada
                    const isExp = expandida === oc.id
                    const canDelete = ['borrador', 'enviada'].includes(oc.estado) && !oc.pagada
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
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{estDisplay}</span>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{oc.fecha_vencimiento ? formatFecha(oc.fecha_vencimiento) : '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 items-center flex-wrap">
                              {oc.estado === 'borrador' && !oc.pagada && (
                                <button onClick={() => enviarMut.mutate(oc.id)} disabled={enviarMut.isPending}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
                                  style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)', border: '1px solid rgba(56,182,255,0.25)' }}>
                                  <Send size={11}/> Enviar
                                </button>
                              )}
                              {oc.estado === 'enviada' && !oc.pagada && (
                                <button onClick={() => recibirMut.mutate(oc.id)} disabled={recibirMut.isPending}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
                                  style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.25)' }}>
                                  <PackageCheck size={11}/> Recibida
                                </button>
                              )}
                              {oc.estado === 'recibida' && !oc.pagada && (
                                <button onClick={() => { if (confirm(`¿Registrar pago de ${oc.numero}?\nEsto creará un egreso en el flujo de caja.`)) pagarMut.mutate(oc.id) }} disabled={pagarMut.isPending}
                                  className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50"
                                  style={{ background: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)', border: '1px solid rgba(244,162,60,0.25)' }}>
                                  <CreditCard size={11}/> Pagar
                                </button>
                              )}
                              <button onClick={() => setEditando({ ...oc })} className="p-1.5 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }} title="Editar"><Pencil size={13}/></button>
                              {canDelete && (
                                <button onClick={() => { if (confirm('¿Eliminar esta OC?')) eliminarMut.mutate(oc.id) }} className="p-1.5 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }} title="Eliminar"><Trash2 size={13}/></button>
                              )}
                            </div>
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
                              <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--rmg-muted)' }}>
                                Ítems{oc.medio_pago ? ` · ${oc.medio_pago}` : ''}{oc.notas ? ` · ${oc.notas}` : ''}
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    {['Código', 'Descripción', 'Cantidad', 'Costo unit.', 'Subtotal'].map(h => (
                                      <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(oc.items || []).map((item, ii) => (
                                    <tr key={ii} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                                      <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--rmg-blt)' }}>{item.codigo}</td>
                                      <td className="px-3 py-2" style={{ color: 'var(--rmg-off)' }}>{item.descripcion}</td>
                                      <td className="px-3 py-2 text-center">{item.cantidad}</td>
                                      <td className="px-3 py-2 text-right" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(item.precio_unitario)}</td>
                                      <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(item.subtotal)}</td>
                                    </tr>
                                  ))}
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
