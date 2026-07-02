import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { Plus, X, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'

const CATEGORIAS = [
  { key: 'combustible',    label: 'Combustible',    color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)',  icon: '⛽' },
  { key: 'bodega',         label: 'Bodega',          color: 'var(--rmg-blt)',    bg: 'rgba(56,182,255,0.12)',  icon: '🏭' },
  { key: 'logistica',      label: 'Logística',       color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.12)',  icon: '🚛' },
  { key: 'marketing',      label: 'Marketing',       color: 'var(--rmg-purple)', bg: 'rgba(123,97,196,0.12)', icon: '📢' },
  { key: 'administrativo', label: 'Administrativo',  color: 'var(--rmg-blue)',   bg: 'rgba(27,143,212,0.12)', icon: '📋' },
  { key: 'otros',          label: 'Otros',           color: 'rgba(90,143,168,0.8)', bg: 'rgba(90,143,168,0.1)', icon: '📦' },
]

const CUENTAS = ['1781310106 Banco de Chile', '000-0-00000 Banco BCI', '000-0-00000 Banco Santander', 'Caja chica']
const PRESUPUESTO = 2_500_000
const FORM_INIT = { fecha: new Date().toISOString().split('T')[0], categoria: 'combustible', monto: '', descripcion: '', comprobante: '', cuenta_bancaria: '' }

export default function GastosPage() {
  const [filtro, setFiltro]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(FORM_INIT)
  const qc                      = useQueryClient()

  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['gastos'],
    queryFn: () => api.get('/gastos').then(r => r.data),
  })

  const crearMut = useMutation({
    mutationFn: (data) => api.post('/gastos', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['gastos'])
      toast.success('Gasto registrado')
      setForm(FORM_INIT)
      setShowForm(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar gasto'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) { toast.error('Ingresa un monto válido'); return }
    crearMut.mutate({ ...form, monto: Number(form.monto) })
  }

  const total          = gastos.reduce((s, g) => s + g.monto, 0)
  const pctPresupuesto = Math.min((total / PRESUPUESTO) * 100, 100)
  const restante       = PRESUPUESTO - total
  const gastosFiltrados = filtro ? gastos.filter(g => g.categoria === filtro) : gastos

  const resumen = CATEGORIAS.map(cat => {
    const catGastos = gastos.filter(g => g.categoria === cat.key)
    const catTotal  = catGastos.reduce((s, g) => s + g.monto, 0)
    return { ...cat, total: catTotal, count: catGastos.length, pct: total ? (catTotal / total) * 100 : 0 }
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  const getCat = (key) => CATEGORIAS.find(c => c.key === key) || CATEGORIAS[5]

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Gastos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Control de egresos operacionales</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nuevo gasto</>}
        </button>
      </div>

      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Registrar gasto</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha *</label>
              <input type="date" className="rmg-input" value={form.fecha}
                onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Categoría *</label>
              <select className="rmg-input" value={form.categoria}
                onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto CLP *</label>
              <input type="number" min="1" placeholder="0" className="rmg-input" value={form.monto}
                onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Descripción *</label>
              <input className="rmg-input" placeholder="Detalle del gasto..." value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Comprobante</label>
              <input className="rmg-input" placeholder="N° boleta / factura..." value={form.comprobante}
                onChange={e => setForm(p => ({ ...p, comprobante: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cuenta bancaria</label>
              <select className="rmg-input" value={form.cuenta_bancaria} onChange={e => setForm(p => ({ ...p, cuenta_bancaria: e.target.value }))}>
                <option value="">Sin especificar</option>
                {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="md:col-span-3 flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">
                {crearMut.isPending ? 'Guardando...' : 'Guardar gasto'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rmg-card p-5">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Gasto total mes</div>
            <div className="font-black text-3xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: pctPresupuesto > 90 ? 'var(--rmg-red)' : 'var(--rmg-off)' }}>
              {formatCLP(total)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs mb-1" style={{ color: 'var(--rmg-muted)' }}>Presupuesto: {formatCLP(PRESUPUESTO)}</div>
            <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: restante >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
              {pctPresupuesto.toFixed(0)}%
            </div>
            <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
              {restante >= 0 ? `${formatCLP(restante)} disponible` : `${formatCLP(Math.abs(restante))} sobre presupuesto`}
            </div>
          </div>
        </div>
        <div className="h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-3 rounded-full transition-all duration-700"
            style={{
              width: `${pctPresupuesto}%`,
              background: pctPresupuesto > 90 ? 'var(--rmg-red)' : pctPresupuesto > 75 ? 'var(--rmg-gold)' : 'linear-gradient(90deg, var(--rmg-blue), var(--rmg-teal))',
            }} />
        </div>
      </div>

      {resumen.length > 0 && (
        <div>
          <h2 className="font-bold text-sm uppercase tracking-wider mb-3" style={{ color: 'var(--rmg-muted)' }}>Por categoría</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {resumen.map(cat => (
              <button key={cat.key} onClick={() => setFiltro(filtro === cat.key ? '' : cat.key)}
                className="rmg-card p-4 text-left transition-all hover:border-blue-500/30"
                style={filtro === cat.key ? { borderColor: cat.color, background: cat.bg } : {}}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xl">{cat.icon}</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: cat.bg, color: cat.color }}>{cat.pct.toFixed(0)}%</span>
                </div>
                <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--rmg-off)' }}>{cat.label}</div>
                <div className="font-black precio-clp" style={{ color: cat.color, fontFamily: 'Inter Tight, sans-serif' }}>{formatCLP(cat.total)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{cat.count} registro{cat.count !== 1 ? 's' : ''}</div>
                <div className="h-1 rounded-full mt-2" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-1 rounded-full" style={{ width: `${cat.pct}%`, background: cat.color }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex justify-between items-center"
          style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
          <span className="font-bold text-sm">
            {filtro ? `${getCat(filtro).icon} ${getCat(filtro).label} — ${gastosFiltrados.length} registros` : `Todos los gastos — ${gastos.length} registros`}
          </span>
          {filtro && (
            <button onClick={() => setFiltro('')} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
              <X size={12}/> Limpiar filtro
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(255,255,255,0.015)' }}>
              {['Fecha', 'Categoría', 'Descripción', 'Comprobante', 'Monto'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                    ))}
                  </tr>
                ))
              : gastosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map((g, i) => {
                  const cat = getCat(g.categoria)
                  return (
                    <tr key={g.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(g.fecha)}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 w-fit text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cat.bg, color: cat.color }}>
                          {cat.icon} {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--rmg-off)' }}>{g.descripcion}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--rmg-muted)' }}>{g.comprobante || '—'}</td>
                      <td className="px-4 py-3 font-bold precio-clp text-right" style={{ color: 'var(--rmg-off)' }}>{formatCLP(g.monto)}</td>
                    </tr>
                  )
                })
            }
          </tbody>
          {!isLoading && gastosFiltrados.length > 0 && (
            <tfoot>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(56,182,255,0.1)' }}>
                <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
                  Subtotal {filtro ? getCat(filtro).label : 'mes'}
                </td>
                <td className="px-4 py-3 font-black precio-clp text-right text-base" style={{ color: 'var(--rmg-blt)', fontFamily: 'Inter Tight, sans-serif' }}>
                  {formatCLP(gastosFiltrados.reduce((s, g) => s + g.monto, 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        {!isLoading && gastosFiltrados.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <TrendingDown size={28} className="mx-auto mb-2 opacity-30"/>
            <p className="text-sm">Sin gastos registrados{filtro ? ' en esta categoría' : ''}</p>
          </div>
        )}
      </div>
    </div>
  )
}
