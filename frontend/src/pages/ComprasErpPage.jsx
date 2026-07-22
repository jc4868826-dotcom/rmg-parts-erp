import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, X, Pencil, Trash2, ShoppingBag, Send, PackageCheck, CreditCard, ChevronRight, Search } from 'lucide-react'
import toast from 'react-hot-toast'

const MES_ACTUAL = new Date().toISOString().slice(0, 7)
const HOY = new Date().toISOString().split('T')[0]
const PROVEEDORES = ['Cristian Hughes', 'Vistony', 'SalfaSur', 'Otro']

// Estado machine del spec
const ESTADO_NEXT = {
  Borrador:  { label: 'Enviar',          next: 'Enviada',  icon: Send,         color: 'var(--rmg-blue)' },
  Enviada:   { label: 'Marcar Recibida', next: 'Recibida', icon: PackageCheck,  color: 'var(--rmg-teal)' },
  Recibida:  { label: 'Marcar Pagada',   next: 'Pagada',   icon: CreditCard,    color: 'var(--rmg-gold)' },
  Pagada:    null,
  Anulada:   null,
  // legacy compat
  Pendiente: { label: 'Enviar',          next: 'Enviada',  icon: Send,         color: 'var(--rmg-blue)' },
  Recibido:  { label: 'Marcar Pagada',   next: 'Pagada',   icon: CreditCard,    color: 'var(--rmg-gold)' },
  Pagado:    null,
  Anulado:   null,
}

const ESTADO_STYLE = {
  Borrador:  { color: 'rgba(90,143,168,0.9)', bg: 'rgba(90,143,168,0.12)' },
  Enviada:   { color: 'var(--rmg-blue)',      bg: 'rgba(56,182,255,0.12)' },
  Recibida:  { color: 'var(--rmg-blt)',       bg: 'rgba(56,182,255,0.15)' },
  Pagada:    { color: 'var(--rmg-teal)',      bg: 'rgba(45,201,138,0.12)' },
  Anulada:   { color: 'var(--rmg-red)',       bg: 'rgba(224,90,78,0.12)'  },
  Pendiente: { color: 'var(--rmg-gold)',      bg: 'rgba(244,162,60,0.12)' },
  Recibido:  { color: 'var(--rmg-blt)',       bg: 'rgba(56,182,255,0.12)' },
  Pagado:    { color: 'var(--rmg-teal)',      bg: 'rgba(45,201,138,0.12)' },
  Anulado:   { color: 'var(--rmg-red)',       bg: 'rgba(224,90,78,0.12)'  },
}

const ESTADOS_EDIT = ['Borrador', 'Enviada', 'Recibida', 'Pagada', 'Anulada']
const ITEM_INIT = { sku: '', descripcion: '', cantidad: 1, costo_unitario: 0 }
const FORM_INIT = {
  fecha: HOY, proveedor: 'Cristian Hughes', numero_oc: '', numero_factura: '',
  estado: 'Borrador', fecha_vencimiento: '', notas: '', items: [{ ...ITEM_INIT }],
}

// ── SKU item row — same search pattern as CotizacionForm ────────────────────
function SkuItemRow({ item, idx, onUpdate, onRemove, showRemove }) {
  const [query, setQuery]   = useState(item.sku || '')
  const [open, setOpen]     = useState(false)
  const [debouncedQ, setDQ] = useState('')
  const wrapRef             = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['lp-buscar-oc', debouncedQ],
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
    setQuery(p.codigo_sku)
    setOpen(false)
    onUpdate(idx, 'sku', p.codigo_sku)
    onUpdate(idx, 'descripcion', p.descripcion)
    onUpdate(idx, 'costo_unitario', p.costo_unidad_neto)
  }

  const handleClear = () => {
    setQuery('')
    setOpen(false)
    onUpdate(idx, 'sku', '')
    onUpdate(idx, 'descripcion', '')
    onUpdate(idx, 'costo_unitario', 0)
  }

  const sub = Number(item.costo_unitario || 0) * Number(item.cantidad || 0)

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Buscar producto */}
      <td className="px-3 py-2 min-w-52" ref={wrapRef} style={{ position: 'relative' }}>
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
          <div className="absolute z-50 left-0 mt-1 rounded-lg border overflow-hidden shadow-xl"
            style={{ background: 'var(--rmg-surface)', borderColor: 'rgba(56,182,255,0.25)', maxHeight: 260, overflowY: 'auto', minWidth: 300 }}>
            {isFetching && (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Buscando…</div>
            )}
            {!isFetching && resultados.length === 0 && (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Sin resultados</div>
            )}
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
      </td>
      {/* SKU (editable, prefilled from búsqueda) */}
      <td className="px-3 py-2 w-28">
        <input className="rmg-input text-xs font-mono" placeholder="SKU" value={item.sku} onChange={e => onUpdate(idx, 'sku', e.target.value)} />
      </td>
      {/* Descripción (editable, prefilled from búsqueda) */}
      <td className="px-3 py-2 min-w-40">
        <input className="rmg-input text-xs" placeholder="Descripción" value={item.descripcion} onChange={e => onUpdate(idx, 'descripcion', e.target.value)} />
      </td>
      {/* Cantidad */}
      <td className="px-3 py-2 w-20">
        <input type="number" min="0.01" step="any" className="rmg-input text-xs text-center" value={item.cantidad} onChange={e => onUpdate(idx, 'cantidad', e.target.value)} />
      </td>
      {/* Costo unit (editable, prefilled from búsqueda) */}
      <td className="px-3 py-2 w-32">
        <input type="number" min="0" className="rmg-input text-xs text-right" value={item.costo_unitario} onChange={e => onUpdate(idx, 'costo_unitario', e.target.value)} />
      </td>
      {/* Subtotal */}
      <td className="px-3 py-2 font-bold text-right text-sm" style={{ color: 'var(--rmg-off)', whiteSpace: 'nowrap' }}>{formatCLP(sub)}</td>
      {/* Remove */}
      <td className="px-3 py-2">
        {showRemove && <button type="button" onClick={() => onRemove(idx)} className="p-1 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}><X size={13}/></button>}
      </td>
    </tr>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ComprasErpPage() {
  const [mes, setMes]           = useState(MES_ACTUAL)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm]         = useState(FORM_INIT)
  const qc = useQueryClient()

  const { data: compras = [], isLoading } = useQuery({
    queryKey: ['compras-erp', mes],
    queryFn: () => api.get('/compras', { params: { mes } }).then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['compras-erp'] })

  const crearMut = useMutation({
    mutationFn: (d) => api.post('/compras', d).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Compra registrada'); setForm(FORM_INIT); setShowForm(false) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear compra'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/compras/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Compra actualizada'); setEditando(null) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }) => api.put(`/compras/${id}/estado`, { estado }).then(r => r.data),
    onSuccess: (res) => {
      invalidate()
      if (res.advertencias?.length) {
        res.advertencias.forEach(w => toast(w, { icon: '⚠️' }))
      }
      toast.success(`Estado actualizado → ${res.estado}`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al cambiar estado'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/compras/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Compra eliminada') },
  })

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...ITEM_INIT }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx, field, val) => setForm(f => {
    const items = [...f.items]
    items[idx] = { ...items[idx], [field]: val }
    return { ...f, items }
  })

  const calcTotal = (items) => items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.proveedor) { toast.error('Proveedor requerido'); return }
    const validItems = form.items.filter(i => i.sku && Number(i.cantidad) > 0)
    if (!validItems.length) { toast.error('Agrega al menos un ítem con SKU y cantidad > 0'); return }
    crearMut.mutate({ ...form, items: validItems })
  }

  const totalMes   = compras.reduce((s, c) => s + c.total, 0)
  const pendiente  = compras.filter(c => !['Pagada', 'Pagado', 'Anulada', 'Anulado'].includes(c.estado)).reduce((s, c) => s + c.total, 0)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Compras</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Registro de compras a proveedores · CxP</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nueva compra</>}
        </button>
      </div>

      {/* Mes filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Mes</label>
        <input type="month" className="rmg-input text-xs py-1.5 w-36" value={mes} onChange={e => setMes(e.target.value)} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Total comprado</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{formatCLP(totalMes)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{compras.length} compras</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Por pagar</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>{formatCLP(pendiente)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>CxP pendiente</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Pagadas</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-teal)' }}>{formatCLP(totalMes - pendiente)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>efectivamente pagado</div>
        </div>
      </div>

      {/* ── Formulario nueva compra ── */}
      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Registrar compra</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha *</label>
                <input type="date" className="rmg-input" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor *</label>
                <select className="rmg-input" value={form.proveedor} onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))}>
                  {PROVEEDORES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° OC</label>
                <input className="rmg-input" placeholder="OC-001" value={form.numero_oc} onChange={e => setForm(p => ({ ...p, numero_oc: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Factura</label>
                <input className="rmg-input" placeholder="F-12345" value={form.numero_factura} onChange={e => setForm(p => ({ ...p, numero_factura: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Vencimiento</label>
                <input type="date" className="rmg-input" value={form.fecha_vencimiento} onChange={e => setForm(p => ({ ...p, fecha_vencimiento: e.target.value }))} />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
                <input className="rmg-input" placeholder="Observaciones..." value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
              </div>
            </div>

            {/* Items con autocomplete */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--rmg-muted)' }}>
                Ítems — <span style={{ color: 'var(--rmg-blue)' }}>escribe 3+ caracteres en SKU para buscar del catálogo</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Buscar producto', 'SKU', 'Descripción', 'Cant.', 'Costo Unit.', 'Subtotal', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, i) => (
                    <SkuItemRow
                      key={i}
                      item={item}
                      idx={i}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      showRemove={form.items.length > 1}
                    />
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between items-center mt-2">
                <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1 text-xs"><Plus size={13}/> Agregar ítem</button>
                <div className="font-black text-lg" style={{ color: 'var(--rmg-gold)', fontFamily: 'Inter Tight, sans-serif' }}>Total: {formatCLP(calcTotal(form.items))}</div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">
                {crearMut.isPending ? 'Guardando...' : 'Guardar como Borrador'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal editar ── */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <h2 className="font-bold mb-4">Editar compra #{editando.id}</h2>
            <form onSubmit={e => { e.preventDefault(); editarMut.mutate({ id: editando.id, data: editando }) }} className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha</label>
                <input type="date" className="rmg-input" value={editando.fecha} onChange={e => setEditando(p => ({ ...p, fecha: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={editando.estado} onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
                  {ESTADOS_EDIT.map(s => <option key={s}>{s}</option>)}
                </select></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor</label>
                <select className="rmg-input" value={editando.proveedor} onChange={e => setEditando(p => ({ ...p, proveedor: e.target.value }))}>
                  {PROVEEDORES.map(p => <option key={p}>{p}</option>)}
                </select></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Vencimiento</label>
                <input type="date" className="rmg-input" value={editando.fecha_vencimiento || ''} onChange={e => setEditando(p => ({ ...p, fecha_vencimiento: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° OC</label>
                <input className="rmg-input" value={editando.numero_oc || ''} onChange={e => setEditando(p => ({ ...p, numero_oc: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Factura</label>
                <input className="rmg-input" value={editando.numero_factura || ''} onChange={e => setEditando(p => ({ ...p, numero_factura: e.target.value }))} /></div>
              <div className="col-span-2 flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditando(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={editarMut.isPending} className="btn-primary disabled:opacity-50">{editarMut.isPending ? 'Guardando...' : 'Actualizar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Tabla de compras ── */}
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
          <span className="font-bold text-sm">{compras.length} compras · {mes}</span>
          <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Borrador → Enviada → Recibida → Pagada</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.015)' }}>
                {['Fecha', 'Proveedor', 'N°OC', 'N°Factura', 'Total', 'Estado', 'Vencimiento', 'Acciones'].map(h => (
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
                : compras.map((c, i) => {
                    const est = ESTADO_STYLE[c.estado] || ESTADO_STYLE.Borrador
                    const nextInfo = ESTADO_NEXT[c.estado]
                    const NextIcon = nextInfo?.icon
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(c.fecha)}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>{c.proveedor}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--rmg-muted)' }}>{c.numero_oc || '—'}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--rmg-muted)' }}>{c.numero_factura || '—'}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(c.total)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{c.estado}</span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{c.fecha_vencimiento ? formatFecha(c.fecha_vencimiento) : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 items-center flex-wrap">
                            {nextInfo && (
                              <button
                                onClick={() => estadoMut.mutate({ id: c.id, estado: nextInfo.next })}
                                disabled={estadoMut.isPending}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded disabled:opacity-50 transition-colors"
                                style={{ background: `${nextInfo.color}1a`, color: nextInfo.color, border: `1px solid ${nextInfo.color}40` }}
                                title={nextInfo.label}>
                                <NextIcon size={11}/>
                                <span className="hidden md:inline">{nextInfo.label}</span>
                                <ChevronRight size={10}/>
                              </button>
                            )}
                            <button onClick={() => setEditando({ ...c })} className="p-1.5 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }} title="Editar"><Pencil size={13}/></button>
                            <button onClick={() => { if (confirm('¿Eliminar esta compra?')) eliminarMut.mutate(c.id) }} className="p-1.5 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }} title="Eliminar"><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
            {!isLoading && compras.length > 0 && (
              <tfoot>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(56,182,255,0.1)' }}>
                  <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Total mes</td>
                  <td className="px-4 py-3 font-black text-base" style={{ color: 'var(--rmg-gold)', fontFamily: 'Inter Tight, sans-serif' }}>{formatCLP(totalMes)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!isLoading && compras.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <ShoppingBag size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin compras en {mes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
