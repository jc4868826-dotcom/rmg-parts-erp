import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, X, ShoppingBag, ChevronDown, ChevronUp, Send, PackageCheck } from 'lucide-react'
import toast from 'react-hot-toast'

const ESTADO_STYLES = {
  borrador: { label: 'Borrador',  color: 'rgba(90,143,168,0.8)',  bg: 'rgba(90,143,168,0.12)'  },
  enviada:  { label: 'Enviada',   color: 'var(--rmg-blt)',        bg: 'rgba(56,182,255,0.12)'  },
  recibida: { label: 'Recibida',  color: 'var(--rmg-teal)',       bg: 'rgba(45,201,138,0.12)'  },
  anulada:  { label: 'Anulada',   color: 'var(--rmg-red)',        bg: 'rgba(224,90,78,0.12)'   },
}

const FORM_INIT = { proveedor_id: '', items: [{ codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0 }] }

export default function ComprasPage() {
  const qc = useQueryClient()
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [expandida, setExpandida] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes-compra', estadoFiltro],
    queryFn: () => api.get('/compras/ordenes', { params: { estado: estadoFiltro || undefined } }).then(r => r.data),
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/compras/proveedores').then(r => r.data),
  })

  const crearMut = useMutation({
    mutationFn: (data) => api.post('/compras/ordenes', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['ordenes-compra'])
      toast.success('Orden de compra creada')
      setShowForm(false)
      setForm(FORM_INIT)
    },
    onError: () => toast.error('Error al crear OC'),
  })

  const enviarMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/enviar`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['ordenes-compra']); toast.success('OC enviada al proveedor') },
  })

  const recibirMut = useMutation({
    mutationFn: (id) => api.post(`/compras/ordenes/${id}/recibir`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['ordenes-compra'])
      toast.success(`${data.oc_numero} recibida — stock actualizado`)
    },
  })

  const totales = form.items.reduce((s, i) => {
    const sub = (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0)
    return s + sub
  }, 0)

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0 }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx, field, val) => setForm(f => {
    const items = [...f.items]
    items[idx] = { ...items[idx], [field]: val }
    return { ...f, items }
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.proveedor_id) { toast.error('Selecciona un proveedor'); return }
    const prov = proveedores.find(p => p.id === form.proveedor_id)
    crearMut.mutate({ ...form, proveedor: prov?.razon_social || '' })
  }

  const totalOCs  = ordenes.reduce((s, o) => s + o.total, 0)
  const pendPago  = ordenes.filter(o => o.estado === 'recibida' && !o.pagada).reduce((s, o) => s + o.total, 0)

  const ESTADOS_FILTRO = [
    { key: '', label: 'Todas' }, { key: 'borrador', label: 'Borrador' },
    { key: 'enviada', label: 'Enviadas' }, { key: 'recibida', label: 'Recibidas' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Compras</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Órdenes de compra · Recepción de mercadería</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nueva OC</>}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>OCs en período</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{ordenes.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(totalOCs)} total comprado</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Pendiente pago</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>
            {formatCLP(pendPago)}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>OCs recibidas sin pagar</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>En tránsito</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-purple)' }}>
            {ordenes.filter(o => o.estado === 'enviada').length}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>enviadas a proveedor</div>
        </div>
      </div>

      {/* Formulario nueva OC */}
      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Nueva orden de compra</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor *</label>
                <select className="rmg-input" value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))} required>
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
                </select>
              </div>
            </div>

            {/* Items */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Código SKU', 'Descripción', 'Cantidad', 'Precio costo', 'Subtotal', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, i) => {
                    const sub = (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-3 py-2 w-28">
                          <input className="rmg-input text-xs" placeholder="SKU..." value={item.codigo}
                            onChange={e => updateItem(i, 'codigo', e.target.value)}/>
                        </td>
                        <td className="px-3 py-2 min-w-48">
                          <input className="rmg-input text-xs" placeholder="Descripción del producto" value={item.descripcion}
                            onChange={e => updateItem(i, 'descripcion', e.target.value)}/>
                        </td>
                        <td className="px-3 py-2 w-20">
                          <input type="number" min="1" className="rmg-input text-xs text-center" value={item.cantidad}
                            onChange={e => updateItem(i, 'cantidad', e.target.value)}/>
                        </td>
                        <td className="px-3 py-2 w-32">
                          <input type="number" min="0" className="rmg-input text-xs text-right" value={item.precio_unitario}
                            onChange={e => updateItem(i, 'precio_unitario', e.target.value)}/>
                        </td>
                        <td className="px-3 py-2 font-bold text-right" style={{ color: 'var(--rmg-off)' }}>{formatCLP(sub)}</td>
                        <td className="px-3 py-2">
                          {form.items.length > 1 && (
                            <button type="button" onClick={() => removeItem(i)} className="p-1 rounded hover:bg-red-500/10 transition-colors" style={{ color: 'var(--rmg-red)' }}>
                              <X size={13}/>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center">
              <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1.5 text-xs">
                <Plus size={13}/> Agregar línea
              </button>
              <div className="text-right">
                <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Neto: {formatCLP(totales)} · IVA: {formatCLP(Math.round(totales * 0.19))}</div>
                <div className="font-black text-lg" style={{ color: 'var(--rmg-blt)', fontFamily: 'Inter Tight, sans-serif' }}>
                  Total: {formatCLP(totales + Math.round(totales * 0.19))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">
                {crearMut.isPending ? 'Guardando...' : 'Crear OC'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-1">
        {ESTADOS_FILTRO.map(e => (
          <button key={e.key} onClick={() => setEstadoFiltro(e.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={estadoFiltro === e.key
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
            }>{e.label}</button>
        ))}
      </div>

      {/* Tabla OCs con detalle expandible */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              {['N° OC','Proveedor','Estado','Neto','IVA','Total','Entrega','Pago','Acciones'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                    ))}
                  </tr>
                ))
              : ordenes.map((oc, idx) => {
                  const est = ESTADO_STYLES[oc.estado] || ESTADO_STYLES.borrador
                  const isExp = expandida === oc.id
                  return (
                    <>
                      <tr key={oc.id}
                        style={{ borderBottom: isExp ? 'none' : '1px solid rgba(255,255,255,0.04)', background: idx % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{oc.numero}</td>
                        <td className="px-4 py-3 font-medium text-sm" style={{ color: 'var(--rmg-off)' }}>{oc.proveedor}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{est.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(oc.neto)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(oc.iva)}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(oc.total)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{oc.fecha_entrega || '—'}</td>
                        <td className="px-4 py-3">
                          {oc.pagada
                            ? <span className="text-xs font-semibold" style={{ color: 'var(--rmg-teal)' }}>✓ Pagada</span>
                            : <span className="text-xs font-semibold" style={{ color: 'var(--rmg-gold)' }}>Pendiente</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 items-center">
                            {oc.estado === 'borrador' && (
                              <button onClick={() => enviarMut.mutate(oc.id)}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-all"
                                style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)' }}
                                title="Enviar al proveedor">
                                <Send size={12}/> Enviar
                              </button>
                            )}
                            {oc.estado === 'enviada' && (
                              <button onClick={() => recibirMut.mutate(oc.id)}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-all"
                                style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}
                                title="Marcar como recibida">
                                <PackageCheck size={12}/> Recibir
                              </button>
                            )}
                            <button onClick={() => setExpandida(isExp ? null : oc.id)}
                              className="p-1 rounded hover:bg-white/5 transition-colors"
                              style={{ color: 'var(--rmg-muted)' }}>
                              {isExp ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExp && (
                        <tr key={`${oc.id}-detail`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td colSpan={9} className="px-6 pb-4 pt-2">
                            <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--rmg-muted)' }}>Detalle de ítems</div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                  {['Código','Descripción','Cantidad','Precio unit.','Subtotal'].map(h => (
                                    <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(oc.items || []).map((item, ii) => (
                                  <tr key={ii} style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--rmg-blt)' }}>{item.codigo}</td>
                                    <td className="px-3 py-2" style={{ color: 'var(--rmg-off)' }}>{item.descripcion}</td>
                                    <td className="px-3 py-2 text-center" style={{ color: 'var(--rmg-off)' }}>{item.cantidad}</td>
                                    <td className="px-3 py-2 text-right" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(item.precio_unitario)}</td>
                                    <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(item.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {oc.factura_proveedor && (
                              <div className="mt-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>
                                Factura proveedor: <span className="font-mono font-semibold" style={{ color: 'var(--rmg-off)' }}>{oc.factura_proveedor}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && ordenes.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <ShoppingBag size={32} className="mx-auto mb-3 opacity-30"/>
            <p>No hay órdenes de compra</p>
          </div>
        )}
      </div>
    </div>
  )
}
