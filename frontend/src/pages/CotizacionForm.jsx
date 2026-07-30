import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, calcularTotalesCotizacion } from '@utils/format'
import { ArrowLeft, Plus, Trash2, Send, Search, X } from 'lucide-react'
import toast from 'react-hot-toast'

function ProductoSearch({ item, onSelect, initialQuery = '' }) {
  const [query, setQuery]     = useState(initialQuery)
  const [open, setOpen]       = useState(false)
  const [debouncedQ, setDQ]   = useState('')
  const wrapRef               = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['lp-buscar', debouncedQ],
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
    onSelect({ codigo_sku: '', descripcion: '', precio_neto: 0, precio_venta_neto: 0, presentacion: '' })
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
                <span className="font-bold text-xs" style={{ color: 'var(--rmg-teal)' }}>{formatCLP(p.precio_neto || p.precio_venta_neto)}</span>
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

export default function CotizacionForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [clienteId, setClienteId]   = useState('')
  const [condicion, setCondicion]   = useState('Contado')
  const [plazoEntrega, setPlazo]    = useState('24-48 hrs · Santiago RM')
  const [validezDias, setValidez]   = useState(15)
  const [notas, setNotas]           = useState('')
  const [items, setItems]           = useState([
    { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0 }
  ])
  const [saving, setSaving]         = useState(false)
  const [loaded, setLoaded]         = useState(false)

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
  })

  const { data: cotizacion } = useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => api.get(`/cotizaciones/${id}`).then(r => r.data),
    enabled: isEdit,
    staleTime: 0,
  })

  useEffect(() => {
    if (cotizacion && !loaded) {
      setClienteId(cotizacion.cliente_id || '')
      setCondicion(cotizacion.condicion_pago || 'Contado')
      setPlazo(cotizacion.plazo_entrega || '24-48 hrs · Santiago RM')
      setValidez(cotizacion.validez_dias || 15)
      setNotas(cotizacion.notas || '')
      if (cotizacion.items?.length) {
        setItems(cotizacion.items.map(i => ({
          codigo:          i.codigo || '',
          descripcion:     i.descripcion || '',
          cantidad:        i.cantidad || 1,
          precio_unitario: i.precio_unitario || 0,
          descuento_pct:   i.descuento_pct || 0,
        })))
      }
      setLoaded(true)
    }
  }, [cotizacion, loaded])

  const totales = calcularTotalesCotizacion(items)

  const addItem = () => setItems(prev => [
    ...prev, { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0 }
  ])

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const updateItem = (i, field, value) => {
    setItems(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }

  const handleProductoSelect = (i, p) => {
    setItems(prev => {
      const next = [...prev]
      next[i] = {
        ...next[i],
        codigo: p.codigo_sku || '',
        descripcion: p.descripcion || '',
        precio_unitario: p.precio_neto || p.precio_venta_neto || 0,
      }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { cliente_id: clienteId, items, condicion_pago: condicion, plazo_entrega: plazoEntrega, validez_dias: validezDias, notas, ...totales }
      if (isEdit) {
        await api.put(`/cotizaciones/${id}`, payload)
        toast.success('Cotización actualizada')
      } else {
        await api.post('/cotizaciones', payload)
        toast.success('Cotización guardada')
      }
      navigate('/cotizaciones')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/cotizaciones')} className="p-2 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            {isEdit ? (cotizacion?.numero ? `Editar ${cotizacion.numero}` : 'Editar cotización') : 'Nueva cotización'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Precios mayoristas B2B · IVA 19%</p>
        </div>
      </div>

      {isEdit && !loaded && (
        <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>
          <div className="animate-pulse">Cargando cotización...</div>
        </div>
      )}

      {(!isEdit || loaded) && (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Cliente y condiciones */}
          <div className="rmg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cliente *</label>
              <select className="rmg-input" value={clienteId} onChange={e => setClienteId(e.target.value)} required>
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Condición de pago</label>
              <select className="rmg-input" value={condicion} onChange={e => setCondicion(e.target.value)}>
                <option>Contado</option>
                <option>Crédito 30 días</option>
                <option>Crédito 60 días</option>
                <option>Transferencia anticipada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tiempo de entrega</label>
              <input className="rmg-input" placeholder="24-48 hrs · Santiago RM"
                value={plazoEntrega} onChange={e => setPlazo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Validez (días)</label>
              <input className="rmg-input" type="number" min="1" max="90"
                value={validezDias} onChange={e => setValidez(Number(e.target.value))} />
            </div>
          </div>

          {/* Items */}
          <div className="rmg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
              <div>
                <span className="font-bold">Productos</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Busca en lista de precios o escribe manualmente</span>
              </div>
              <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1.5 text-xs">
                <Plus size={14} /> Agregar línea
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Buscar producto', 'Código', 'Descripción', 'Cant.', 'Precio neto', 'Desc %', 'Subtotal', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const subtotal = Math.round(item.cantidad * item.precio_unitario * (1 - item.descuento_pct / 100))
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-2 min-w-52">
                          <ProductoSearch item={item} initialQuery={item.codigo || ''} onSelect={(p) => handleProductoSelect(i, p)} />
                        </td>
                        <td className="px-4 py-2 w-28">
                          <input className="rmg-input text-xs font-mono" value={item.codigo}
                            onChange={e => updateItem(i, 'codigo', e.target.value)} placeholder="SKU" />
                        </td>
                        <td className="px-4 py-2 min-w-48">
                          <input className="rmg-input text-xs" value={item.descripcion}
                            onChange={e => updateItem(i, 'descripcion', e.target.value)} placeholder="Descripción" />
                        </td>
                        <td className="px-4 py-2 w-20">
                          <input className="rmg-input text-xs text-center" type="number" min="1"
                            value={item.cantidad} onChange={e => updateItem(i, 'cantidad', Number(e.target.value))} />
                        </td>
                        <td className="px-4 py-2 w-32">
                          <input className="rmg-input text-xs text-right" type="number" min="0"
                            value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', Number(e.target.value))} />
                        </td>
                        <td className="px-4 py-2 w-20">
                          <input className="rmg-input text-xs text-center" type="number" min="0" max="100"
                            value={item.descuento_pct} onChange={e => updateItem(i, 'descuento_pct', Number(e.target.value))} />
                        </td>
                        <td className="px-4 py-2 font-bold precio-clp text-right whitespace-nowrap" style={{ color: 'var(--rmg-off)' }}>
                          {formatCLP(subtotal)}
                        </td>
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => removeItem(i)}
                            className="p-1.5 rounded hover:bg-red-500/10 transition-colors" style={{ color: 'var(--rmg-red)' }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales */}
          <div className="flex justify-end">
            <div className="rmg-card p-5 min-w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--rmg-muted)' }}>Neto</span>
                <span className="font-semibold precio-clp">{formatCLP(totales.neto)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--rmg-muted)' }}>IVA (19%)</span>
                <span className="font-semibold precio-clp">{formatCLP(totales.iva)}</span>
              </div>
              <hr style={{ borderColor: 'rgba(56,182,255,0.1)' }} />
              <div className="flex justify-between">
                <span className="font-bold">Total</span>
                <span className="font-black text-lg precio-clp" style={{ color: 'var(--rmg-blt)' }}>{formatCLP(totales.total)}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="rmg-card p-5">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
            <textarea className="rmg-input resize-none" rows={3} placeholder="Observaciones, condiciones especiales..."
              value={notas} onChange={e => setNotas(e.target.value)} />
          </div>

          {/* Acciones */}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => navigate('/cotizaciones')} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Send size={15} /> {saving ? 'Guardando...' : (isEdit ? 'Actualizar cotización' : 'Guardar cotización')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
