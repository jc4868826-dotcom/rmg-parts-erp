import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, X, Pencil, Trash2, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'

const MES_ACTUAL = new Date().toISOString().slice(0, 7)
const HOY = new Date().toISOString().split('T')[0]

const CATEGORIAS_ERP = ['Fijo', 'Variable', 'Extraordinario']
const CAT_ERP_STYLE = {
  Fijo:           { color: 'var(--rmg-blue)',   bg: 'rgba(27,143,212,0.12)',  icon: '🏢' },
  Variable:       { color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)', icon: '📊' },
  Extraordinario: { color: 'var(--rmg-purple)', bg: 'rgba(123,97,196,0.12)', icon: '⚡' },
}

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Crédito']
const FORM_INIT = {
  fecha: HOY, categoria: 'otros', categoria_erp: 'Variable', subcategoria: '',
  descripcion: '', monto: '', forma_pago: 'Efectivo', proveedor: '', notas: '',
}

export default function GastosPage() {
  const [mes, setMes]             = useState(MES_ACTUAL)
  const [filtroErp, setFiltroErp] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [editando, setEditando]   = useState(null)
  const [form, setForm]           = useState(FORM_INIT)
  const qc                        = useQueryClient()

  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['gastos', mes],
    queryFn: () => api.get('/gastos', { params: { mes } }).then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['gastos'] })

  const crearMut = useMutation({
    mutationFn: (d) => api.post('/gastos', d).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Gasto registrado'); setForm(FORM_INIT); setShowForm(false) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar gasto'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/gastos/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Gasto actualizado'); setEditando(null) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/gastos/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Gasto eliminado') },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) { toast.error('Ingresa un monto válido'); return }
    crearMut.mutate({ ...form, monto: Number(form.monto) })
  }

  const gastosFiltrados = filtroErp ? gastos.filter(g => (g.categoria_erp || 'Variable') === filtroErp) : gastos
  const total = gastos.reduce((s, g) => s + g.monto, 0)
  const totalFijo = gastos.filter(g => g.categoria_erp === 'Fijo').reduce((s, g) => s + g.monto, 0)
  const totalVariable = gastos.filter(g => g.categoria_erp === 'Variable' || !g.categoria_erp).reduce((s, g) => s + g.monto, 0)
  const totalExt = gastos.filter(g => g.categoria_erp === 'Extraordinario').reduce((s, g) => s + g.monto, 0)

  const getCatErp = (g) => {
    const key = g.categoria_erp || 'Variable'
    return CAT_ERP_STYLE[key] || CAT_ERP_STYLE.Variable
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Gastos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Control de egresos · Fijos · Variables · Extraordinarios</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nuevo gasto</>}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Mes</label>
        <input type="month" className="rmg-input text-xs py-1.5 w-36" value={mes} onChange={e => setMes(e.target.value)} />
      </div>

      {/* Cards por tipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Total mes</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-off)' }}>{formatCLP(total)}</div>
        </div>
        {CATEGORIAS_ERP.map(cat => {
          const st = CAT_ERP_STYLE[cat]
          const val = cat === 'Fijo' ? totalFijo : cat === 'Variable' ? totalVariable : totalExt
          const isActive = filtroErp === cat
          return (
            <button key={cat} onClick={() => setFiltroErp(isActive ? '' : cat)}
              className="rmg-card p-4 text-left transition-all hover:border-blue-500/30"
              style={isActive ? { borderColor: st.color, background: st.bg } : {}}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{st.icon}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{cat}</span>
              </div>
              <div className="font-black text-xl" style={{ color: st.color, fontFamily: 'Inter Tight, sans-serif' }}>{formatCLP(val)}</div>
              {total > 0 && <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{((val / total) * 100).toFixed(0)}% del total</div>}
            </button>
          )
        })}
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Registrar gasto</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha *</label>
              <input type="date" className="rmg-input" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Categoría *</label>
              <select className="rmg-input" value={form.categoria_erp} onChange={e => setForm(p => ({ ...p, categoria_erp: e.target.value }))}>
                {CATEGORIAS_ERP.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Subcategoría</label>
              <input className="rmg-input" placeholder="Arriendo, Combustible..." value={form.subcategoria} onChange={e => setForm(p => ({ ...p, subcategoria: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto CLP *</label>
              <input type="number" min="1" placeholder="0" className="rmg-input" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Descripción *</label>
              <input className="rmg-input" placeholder="Detalle del gasto..." value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Forma de pago</label>
              <select className="rmg-input" value={form.forma_pago} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}>
                {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor</label>
              <input className="rmg-input" placeholder="Proveedor..." value={form.proveedor} onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))} />
            </div>
            <div className="md:col-span-4 flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">{crearMut.isPending ? 'Guardando...' : 'Guardar gasto'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal edición */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <h2 className="font-bold mb-4">Editar gasto</h2>
            <form onSubmit={e => { e.preventDefault(); editarMut.mutate({ id: editando.id, data: editando }) }} className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha</label>
                <input type="date" className="rmg-input" value={editando.fecha} onChange={e => setEditando(p => ({ ...p, fecha: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Categoría</label>
                <select className="rmg-input" value={editando.categoria_erp || 'Variable'} onChange={e => setEditando(p => ({ ...p, categoria_erp: e.target.value }))}>
                  {CATEGORIAS_ERP.map(c => <option key={c}>{c}</option>)}
                </select></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Subcategoría</label>
                <input className="rmg-input" value={editando.subcategoria || ''} onChange={e => setEditando(p => ({ ...p, subcategoria: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto</label>
                <input type="number" className="rmg-input" value={editando.monto} onChange={e => setEditando(p => ({ ...p, monto: Number(e.target.value) }))} /></div>
              <div className="col-span-2"><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Descripción</label>
                <input className="rmg-input" value={editando.descripcion || ''} onChange={e => setEditando(p => ({ ...p, descripcion: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Forma pago</label>
                <select className="rmg-input" value={editando.forma_pago || 'Efectivo'} onChange={e => setEditando(p => ({ ...p, forma_pago: e.target.value }))}>
                  {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                </select></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor</label>
                <input className="rmg-input" value={editando.proveedor || ''} onChange={e => setEditando(p => ({ ...p, proveedor: e.target.value }))} /></div>
              <div className="col-span-2 flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditando(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={editarMut.isPending} className="btn-primary disabled:opacity-50">{editarMut.isPending ? 'Guardando...' : 'Actualizar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filtros ERP */}
      <div className="flex gap-1 flex-wrap">
        {['', ...CATEGORIAS_ERP].map(cat => (
          <button key={cat || 'all'} onClick={() => setFiltroErp(cat)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={filtroErp === cat
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(15, 35, 60,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(15, 35, 60,0.08)' }
            }>{cat || 'Todos'}</button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
          <span className="font-bold text-sm">{gastosFiltrados.length} gastos · {mes}{filtroErp ? ` · ${filtroErp}` : ''}</span>
          {filtroErp && <button onClick={() => setFiltroErp('')} className="text-xs flex items-center gap-1" style={{ color: 'var(--rmg-muted)' }}><X size={12}/> Limpiar</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(15, 35, 60,0.015)' }}>
                {['Fecha', 'Categoría', 'Subcategoría', 'Descripción', 'Monto', 'Forma Pago', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }} /></td>
                      ))}
                    </tr>
                  ))
                : gastosFiltrados.map((g, i) => {
                    const cat = getCatErp(g)
                    return (
                      <tr key={g.id} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}
                        className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(g.fecha)}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 w-fit text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cat.bg, color: cat.color }}>
                            {cat.icon} {g.categoria_erp || 'Variable'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{g.subcategoria || '—'}</td>
                        <td className="px-4 py-3" style={{ color: 'var(--rmg-off)' }}>{g.descripcion}</td>
                        <td className="px-4 py-3 font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(g.monto)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{g.forma_pago || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => setEditando({ ...g })} className="p-1.5 rounded hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}><Pencil size={13}/></button>
                            <button onClick={() => { if (confirm('¿Eliminar este gasto?')) eliminarMut.mutate(g.id) }} className="p-1.5 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
            {!isLoading && gastosFiltrados.length > 0 && (
              <tfoot>
                <tr style={{ background: 'rgba(15, 35, 60,0.03)', borderTop: '1px solid rgba(56,182,255,0.1)' }}>
                  <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Total</td>
                  <td className="px-4 py-3 font-black text-base" style={{ color: 'var(--rmg-blt)', fontFamily: 'Inter Tight, sans-serif' }}>
                    {formatCLP(gastosFiltrados.reduce((s, g) => s + g.monto, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!isLoading && gastosFiltrados.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <TrendingDown size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin gastos{filtroErp ? ` ${filtroErp}` : ''} en {mes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
