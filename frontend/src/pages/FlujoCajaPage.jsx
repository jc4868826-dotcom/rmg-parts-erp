import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { TrendingUp, TrendingDown, Wallet, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

const FORM_INIT = {
  tipo: 'ingreso', categoria: '', descripcion: '', monto: '',
  fecha_pago: new Date().toISOString().split('T')[0], estado: 'proyectado',
}

function formatFechaCaja(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FlujoCajaPage() {
  const [modo, setModo]         = useState('proyectado')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(FORM_INIT)
  const qc                      = useQueryClient()

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['flujo-caja', modo],
    queryFn: () => api.get('/flujo-caja', { params: { modo } }).then(r => r.data),
  })

  const { data: resumen = {} } = useQuery({
    queryKey: ['flujo-caja-resumen'],
    queryFn: () => api.get('/flujo-caja/resumen').then(r => r.data),
  })

  const crearMut = useMutation({
    mutationFn: (data) => api.post('/flujo-caja/manual', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['flujo-caja'])
      qc.invalidateQueries(['flujo-caja-resumen'])
      toast.success('Movimiento registrado')
      setForm(FORM_INIT)
      setShowForm(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar movimiento'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) { toast.error('Monto inválido'); return }
    crearMut.mutate({ ...form, monto: Number(form.monto) })
  }

  // Saldo acumulado corrido
  let saldoCorrido = 0
  const movsConSaldo = movimientos.map(m => {
    saldoCorrido += m.tipo === 'ingreso' ? m.monto : -m.monto
    return { ...m, saldo_acum: saldoCorrido }
  })

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Flujo de Caja</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Ingresos y egresos · saldo acumulado corrido</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nuevo movimiento</>}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Saldo actual (confirmado)', value: resumen.saldo_actual ?? 0, icon: Wallet, color: (resumen.saldo_actual ?? 0) >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' },
          { label: 'Ingresos proyectados 30 días', value: resumen.ingresos_prox30 ?? 0, icon: TrendingUp, color: 'var(--rmg-teal)' },
          { label: 'Egresos proyectados 30 días', value: resumen.egresos_prox30 ?? 0, icon: TrendingDown, color: 'var(--rmg-red)' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="rmg-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{k.label}</div>
                <div className="p-1.5 rounded-lg" style={{ background: `${k.color}15` }}>
                  <Icon size={14} style={{ color: k.color }}/>
                </div>
              </div>
              <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: k.color }}>
                {formatCLP(k.value)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Formulario nuevo movimiento */}
      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Nuevo movimiento manual</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tipo *</label>
              <select className="rmg-input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                <option value="ingreso">↑ Ingreso</option>
                <option value="egreso">↓ Egreso</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Categoría</label>
              <input className="rmg-input" placeholder="aporte_capital / prestamo / otro..." value={form.categoria}
                onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto CLP *</label>
              <input type="number" min="1" className="rmg-input" placeholder="0" value={form.monto}
                onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Descripción *</label>
              <input className="rmg-input" placeholder="Detalle del movimiento..." value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha pago</label>
              <input type="date" className="rmg-input" value={form.fecha_pago}
                onChange={e => setForm(p => ({ ...p, fecha_pago: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
              <select className="rmg-input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                <option value="proyectado">Proyectado</option>
                <option value="confirmado">Confirmado</option>
              </select>
            </div>
            <div className="md:col-span-3 flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">
                {crearMut.isPending ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toggle Real / Proyectado */}
      <div className="flex gap-1">
        {[{ k: 'proyectado', l: 'Proyectado (todo)' }, { k: 'real', l: 'Real (confirmado ≤ hoy)' }].map(t => (
          <button key={t.k} onClick={() => setModo(t.k)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={modo === t.k
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
            }>{t.l}</button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              {['Fecha pago', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Estado', 'Saldo acum.'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap"
                  style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                    ))}
                  </tr>
                ))
              : movsConSaldo.map((m, i) => {
                  const isIng = m.tipo === 'ingreso'
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{formatFechaCaja(m.fecha_pago)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"
                          style={{ background: isIng ? 'rgba(45,201,138,0.12)' : 'rgba(224,90,78,0.12)', color: isIng ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                          {isIng ? '↑' : '↓'} {isIng ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize" style={{ color: 'var(--rmg-muted)' }}>{m.categoria || m.origen_tabla || '—'}</td>
                      <td className="px-4 py-3 text-xs max-w-xs truncate" style={{ color: 'var(--rmg-off)' }} title={m.descripcion}>{m.descripcion}</td>
                      <td className="px-4 py-3 font-bold text-right whitespace-nowrap"
                        style={{ color: isIng ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                        {isIng ? '+' : '-'}{formatCLP(m.monto)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={m.estado === 'confirmado'
                            ? { background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }
                            : { background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
                          {m.estado === 'confirmado' ? '✓ Confirmado' : '○ Proyectado'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-black text-right whitespace-nowrap"
                        style={{ color: m.saldo_acum >= 0 ? 'var(--rmg-off)' : 'var(--rmg-red)', fontFamily: 'Inter Tight, sans-serif' }}>
                        {formatCLP(m.saldo_acum)}
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && movimientos.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Wallet size={28} className="mx-auto mb-2 opacity-20"/>
            <p className="text-sm">Sin movimientos registrados</p>
          </div>
        )}
      </div>
    </div>
  )
}
