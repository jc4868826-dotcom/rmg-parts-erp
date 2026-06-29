import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, calcularTotalesCotizacion } from '@utils/format'
import { ArrowLeft, Plus, Trash2, Send } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CotizacionForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [clienteId, setClienteId]   = useState('')
  const [condicion, setCondicion]   = useState('Contado')
  const [notas, setNotas]           = useState('')
  const [items, setItems]           = useState([
    { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0 }
  ])
  const [saving, setSaving] = useState(false)

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
  })

  const { data: productos = [] } = useQuery({
    queryKey: ['productos'],
    queryFn: () => api.get('/productos').then(r => r.data),
  })

  const totales = calcularTotalesCotizacion(items)

  const addItem = () => setItems(prev => [...prev, { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0 }])

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const updateItem = (i, field, value) => {
    setItems(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      if (field === 'codigo') {
        const p = productos.find(x => x.codigo === value)
        if (p) next[i] = { ...next[i], descripcion: p.descripcion, precio_unitario: p.precio_b2b_base }
      }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/cotizaciones', { cliente_id: clienteId, items, condicion_pago: condicion, notas, ...totales })
      toast.success('Cotización guardada')
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
            {isEdit ? `Editar ${id}` : 'Nueva cotización'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Precios mayoristas B2B · IVA 19%</p>
        </div>
      </div>

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
        </div>

        {/* Items */}
        <div className="rmg-card overflow-hidden">
          <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
            <span className="font-bold">Productos</span>
            <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Plus size={14} /> Agregar línea
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  {['Código', 'Descripción', 'Cant.', 'Precio neto', 'Desc %', 'Subtotal', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const subtotal = Math.round(item.cantidad * item.precio_unitario * (1 - item.descuento_pct / 100))
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-2">
                        <select className="rmg-input text-xs" value={item.codigo} onChange={e => updateItem(i, 'codigo', e.target.value)}>
                          <option value="">SKU...</option>
                          {productos.map(p => <option key={p.codigo} value={p.codigo}>{p.codigo}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 min-w-48">
                        <input className="rmg-input text-xs" value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} placeholder="Descripción" />
                      </td>
                      <td className="px-4 py-2 w-20">
                        <input className="rmg-input text-xs text-center" type="number" min="1" value={item.cantidad} onChange={e => updateItem(i, 'cantidad', Number(e.target.value))} />
                      </td>
                      <td className="px-4 py-2 w-32">
                        <input className="rmg-input text-xs text-right" type="number" min="0" value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', Number(e.target.value))} />
                      </td>
                      <td className="px-4 py-2 w-20">
                        <input className="rmg-input text-xs text-center" type="number" min="0" max="100" value={item.descuento_pct} onChange={e => updateItem(i, 'descuento_pct', Number(e.target.value))} />
                      </td>
                      <td className="px-4 py-2 font-bold precio-clp text-right" style={{ color: 'var(--rmg-off)' }}>{formatCLP(subtotal)}</td>
                      <td className="px-4 py-2">
                        <button type="button" onClick={() => removeItem(i)} className="p-1.5 rounded hover:bg-red-500/10 transition-colors" style={{ color: 'var(--rmg-red)' }}>
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
            <Send size={15} /> {saving ? 'Guardando...' : 'Guardar cotización'}
          </button>
        </div>
      </form>
    </div>
  )
}
