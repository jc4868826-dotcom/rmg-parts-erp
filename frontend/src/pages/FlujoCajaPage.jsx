import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { TrendingUp, TrendingDown, Wallet, Plus, X, Pencil, Trash2, ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import toast from 'react-hot-toast'

const CUENTAS = [
  '1781310106 Banco de Chile',
  '000-0-00000 Banco BCI',
  '000-0-00000 Banco Santander',
  'Caja chica',
]

const FORM_INIT = {
  tipo: 'ingreso', categoria: '', descripcion: '', monto: '',
  fecha_pago: new Date().toISOString().split('T')[0], estado: 'proyectado',
  cuenta_bancaria: '',
}

function formatFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function semanaISO(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  const label = `Sem ${week} — ${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`
  const key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
  return { key, label }
}

const tooltipStyle = { background: '#0a1a2e', border: '1px solid rgba(56,182,255,0.2)', borderRadius: 8, color: '#fff', fontSize: 12 }

export default function FlujoCajaPage() {
  const [modo, setModo]         = useState('proyectado')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(FORM_INIT)
  const [editando, setEditando] = useState(null)
  const [showFiltros, setShowFiltros] = useState(false)
  const [filtros, setFiltros]   = useState({ desde: '', hasta: '', tipo: '', categoria: '', cuenta_bancaria: '', estado: '' })
  const [openSem, setOpenSem]   = useState({})
  const [openCat, setOpenCat]   = useState({})
  const qc = useQueryClient()

  const queryParams = { modo, ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) }

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['flujo-caja', queryParams],
    queryFn: () => api.get('/flujo-caja', { params: queryParams }).then(r => r.data),
  })

  const { data: resumen = {} } = useQuery({
    queryKey: ['flujo-caja-resumen'],
    queryFn: () => api.get('/flujo-caja/resumen').then(r => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['flujo-caja'] })
    qc.invalidateQueries({ queryKey: ['flujo-caja-resumen'] })
  }

  const crearMut = useMutation({
    mutationFn: (data) => api.post('/flujo-caja/manual', data).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Movimiento registrado'); setForm(FORM_INIT); setShowForm(false) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/flujo-caja/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Actualizado'); setEditando(null) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/flujo-caja/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Eliminado') },
    onError: (e) => toast.error(e.response?.data?.error || 'Solo se eliminan movimientos manuales'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) { toast.error('Monto inválido'); return }
    crearMut.mutate({ ...form, monto: Number(form.monto) })
  }

  const handleEdit = (m) => {
    setEditando({ ...m })
  }

  const handleEditSubmit = (e) => {
    e.preventDefault()
    editarMut.mutate({ id: editando.id, data: editando })
  }

  // Saldo acumulado corrido
  let saldoCorrido = 0
  const movsConSaldo = movimientos.map(m => {
    saldoCorrido += m.tipo === 'ingreso' ? m.monto : -m.monto
    return { ...m, saldo_acum: saldoCorrido }
  })

  // 7 cards resumen
  const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const totalEgresos  = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)
  const confirmados   = movimientos.filter(m => m.estado === 'confirmado')
  const ingConf       = confirmados.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const egConf        = confirmados.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)
  const proyectados   = movimientos.filter(m => m.estado === 'proyectado')
  const ingProy       = proyectados.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const saldoNet      = totalIngresos - totalEgresos

  const CARDS = [
    { label: 'Saldo actual (confirmado)', value: resumen.saldo_actual ?? 0, color: (resumen.saldo_actual ?? 0) >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' },
    { label: 'Ingresos periodo',          value: totalIngresos,              color: 'var(--rmg-teal)' },
    { label: 'Egresos periodo',           value: totalEgresos,               color: 'var(--rmg-red)'  },
    { label: 'Saldo neto periodo',        value: saldoNet,                   color: saldoNet >= 0 ? 'var(--rmg-blt)' : 'var(--rmg-red)' },
    { label: 'Ingresos confirmados',      value: ingConf,                    color: 'var(--rmg-teal)' },
    { label: 'Egresos confirmados',       value: egConf,                     color: 'var(--rmg-red)'  },
    { label: 'Ingresos proyectados',      value: ingProy,                    color: 'var(--rmg-blt)'  },
  ]

  // Accordion: semana → categoria → detalle
  const porSemana = useMemo(() => {
    const map = {}
    for (const m of movimientos) {
      if (!m.fecha_pago) continue
      const { key, label } = semanaISO(m.fecha_pago)
      if (!map[key]) map[key] = { key, label, items: [], ingresos: 0, egresos: 0 }
      map[key].items.push(m)
      if (m.tipo === 'ingreso') map[key].ingresos += m.monto
      else                      map[key].egresos  += m.monto
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [movimientos])

  const categoriasPorSem = (semKey) => {
    const sem = porSemana.find(s => s.key === semKey)
    if (!sem) return []
    const map = {}
    for (const m of sem.items) {
      const cat = m.categoria || m.origen_tabla || 'sin categoría'
      if (!map[cat]) map[cat] = { cat, items: [], ingresos: 0, egresos: 0 }
      map[cat].items.push(m)
      if (m.tipo === 'ingreso') map[cat].ingresos += m.monto
      else                      map[cat].egresos  += m.monto
    }
    return Object.values(map)
  }

  // BarChart data por semana
  const chartData = porSemana.map(s => ({
    semana: s.label.replace('Sem ', 'S').split(' — ')[0],
    Ingresos: s.ingresos,
    Egresos:  s.egresos,
    Saldo:    s.ingresos - s.egresos,
  }))

  const hayFiltros = Object.values(filtros).some(Boolean)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Flujo de Caja</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Ingresos y egresos · saldo acumulado corrido</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFiltros(v => !v)} className="btn-secondary flex items-center gap-2">
            <Filter size={14}/> Filtros {hayFiltros && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--rmg-blue)' }}/>}
          </button>
          <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
            {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nuevo</>}
          </button>
        </div>
      </div>

      {/* 7 KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {CARDS.map(k => (
          <div key={k.label} className="rmg-card p-3">
            <div className="text-xs mb-1 leading-tight" style={{ color: 'var(--rmg-muted)' }}>{k.label}</div>
            <div className="font-black text-base" style={{ color: k.color, fontFamily: 'Inter Tight, sans-serif' }}>
              {formatCLP(k.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      {showFiltros && (
        <div className="rmg-card p-4 animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Desde</label>
              <input type="date" className="rmg-input text-xs" value={filtros.desde}
                onChange={e => setFiltros(p => ({ ...p, desde: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Hasta</label>
              <input type="date" className="rmg-input text-xs" value={filtros.hasta}
                onChange={e => setFiltros(p => ({ ...p, hasta: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tipo</label>
              <select className="rmg-input text-xs" value={filtros.tipo} onChange={e => setFiltros(p => ({ ...p, tipo: e.target.value }))}>
                <option value="">Todos</option>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Categoría</label>
              <input className="rmg-input text-xs" placeholder="Filtrar..." value={filtros.categoria}
                onChange={e => setFiltros(p => ({ ...p, categoria: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cuenta</label>
              <select className="rmg-input text-xs" value={filtros.cuenta_bancaria} onChange={e => setFiltros(p => ({ ...p, cuenta_bancaria: e.target.value }))}>
                <option value="">Todas</option>
                {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
              <select className="rmg-input text-xs" value={filtros.estado} onChange={e => setFiltros(p => ({ ...p, estado: e.target.value }))}>
                <option value="">Todos</option>
                <option value="proyectado">Proyectado</option>
                <option value="confirmado">Confirmado</option>
              </select>
            </div>
          </div>
          {hayFiltros && (
            <button onClick={() => setFiltros({ desde: '', hasta: '', tipo: '', categoria: '', cuenta_bancaria: '', estado: '' })}
              className="mt-3 text-xs flex items-center gap-1" style={{ color: 'var(--rmg-muted)' }}>
              <X size={11}/> Limpiar filtros
            </button>
          )}
        </div>
      )}

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
              <input className="rmg-input" placeholder="venta / gasto / otro..." value={form.categoria}
                onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto CLP *</label>
              <input type="number" min="1" className="rmg-input" value={form.monto}
                onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Descripción *</label>
              <input className="rmg-input" placeholder="Detalle..." value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cuenta bancaria</label>
              <select className="rmg-input" value={form.cuenta_bancaria} onChange={e => setForm(p => ({ ...p, cuenta_bancaria: e.target.value }))}>
                <option value="">Sin especificar</option>
                {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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

      {/* Modal edición */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-lg animate-fade-in">
            <h2 className="font-bold mb-4">Editar movimiento</h2>
            <form onSubmit={handleEditSubmit} className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tipo</label>
                <select className="rmg-input" value={editando.tipo} onChange={e => setEditando(p => ({ ...p, tipo: e.target.value }))}>
                  <option value="ingreso">↑ Ingreso</option>
                  <option value="egreso">↓ Egreso</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Monto</label>
                <input type="number" className="rmg-input" value={editando.monto}
                  onChange={e => setEditando(p => ({ ...p, monto: Number(e.target.value) }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Descripción</label>
                <input className="rmg-input" value={editando.descripcion}
                  onChange={e => setEditando(p => ({ ...p, descripcion: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Categoría</label>
                <input className="rmg-input" value={editando.categoria || ''}
                  onChange={e => setEditando(p => ({ ...p, categoria: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cuenta</label>
                <select className="rmg-input" value={editando.cuenta_bancaria || ''} onChange={e => setEditando(p => ({ ...p, cuenta_bancaria: e.target.value }))}>
                  <option value="">Sin especificar</option>
                  {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha pago</label>
                <input type="date" className="rmg-input" value={editando.fecha_pago || ''}
                  onChange={e => setEditando(p => ({ ...p, fecha_pago: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={editando.estado} onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
                  <option value="proyectado">Proyectado</option>
                  <option value="confirmado">Confirmado</option>
                </select>
              </div>
              <div className="col-span-2 flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditando(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={editarMut.isPending} className="btn-primary disabled:opacity-50">
                  {editarMut.isPending ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
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

      {/* BarChart */}
      {chartData.length > 0 && (
        <div className="rmg-card p-5">
          <h2 className="font-bold mb-4 text-sm">Ingresos vs Egresos por semana</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="semana" tick={{ fill: 'rgba(90,143,168,0.7)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(90,143,168,0.7)', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCLP(v)} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(90,143,168,0.7)' }} />
              <Bar dataKey="Ingresos" fill="var(--rmg-teal)"  radius={[3,3,0,0]} />
              <Bar dataKey="Egresos"  fill="var(--rmg-red)"   radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Accordion semana → categoria → detalle */}
      {porSemana.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-bold text-sm px-1">Detalle por semana</h2>
          {porSemana.map(sem => {
            const semOpen = openSem[sem.key]
            return (
              <div key={sem.key} className="rmg-card overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setOpenSem(p => ({ ...p, [sem.key]: !p[sem.key] }))}>
                  <div className="flex items-center gap-3">
                    {semOpen ? <ChevronDown size={14} style={{ color: 'var(--rmg-muted)' }}/> : <ChevronRight size={14} style={{ color: 'var(--rmg-muted)' }}/>}
                    <span className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>{sem.label}</span>
                    <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{sem.items.length} movimientos</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--rmg-teal)' }}>+{formatCLP(sem.ingresos)}</span>
                    <span style={{ color: 'var(--rmg-red)' }}>-{formatCLP(sem.egresos)}</span>
                    <span className="font-bold" style={{ color: sem.ingresos - sem.egresos >= 0 ? 'var(--rmg-blt)' : 'var(--rmg-red)' }}>
                      {formatCLP(sem.ingresos - sem.egresos)}
                    </span>
                  </div>
                </button>
                {semOpen && (
                  <div className="border-t" style={{ borderColor: 'rgba(56,182,255,0.08)' }}>
                    {categoriasPorSem(sem.key).map(catObj => {
                      const catKey = `${sem.key}_${catObj.cat}`
                      const catOpen = openCat[catKey]
                      return (
                        <div key={catObj.cat}>
                          <button className="w-full flex items-center justify-between px-6 py-2 hover:bg-white/[0.01] transition-colors text-xs"
                            onClick={() => setOpenCat(p => ({ ...p, [catKey]: !p[catKey] }))}>
                            <div className="flex items-center gap-2">
                              {catOpen ? <ChevronDown size={12} style={{ color: 'var(--rmg-muted)' }}/> : <ChevronRight size={12} style={{ color: 'var(--rmg-muted)' }}/>}
                              <span className="capitalize font-medium" style={{ color: 'var(--rmg-off)' }}>{catObj.cat}</span>
                              <span style={{ color: 'var(--rmg-muted)' }}>({catObj.items.length})</span>
                            </div>
                            <div className="flex gap-3">
                              {catObj.ingresos > 0 && <span style={{ color: 'var(--rmg-teal)' }}>+{formatCLP(catObj.ingresos)}</span>}
                              {catObj.egresos  > 0 && <span style={{ color: 'var(--rmg-red)'  }}>-{formatCLP(catObj.egresos)}</span>}
                            </div>
                          </button>
                          {catOpen && catObj.items.map(m => (
                            <div key={m.id} className="flex items-center justify-between px-10 py-2 text-xs border-t"
                              style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span style={{ color: 'var(--rmg-muted)', flexShrink: 0 }}>{formatFecha(m.fecha_pago)}</span>
                                <span className="truncate" style={{ color: 'var(--rmg-off)' }}>{m.descripcion}</span>
                                {m.cuenta_bancaria && (
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)', flexShrink: 0 }}>
                                    {m.cuenta_bancaria.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                <span className="font-semibold" style={{ color: m.tipo === 'ingreso' ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                                  {m.tipo === 'ingreso' ? '+' : '-'}{formatCLP(m.monto)}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-xs"
                                  style={m.estado === 'confirmado'
                                    ? { background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }
                                    : { background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)' }}>
                                  {m.estado === 'confirmado' ? '✓' : '○'}
                                </span>
                                {m.origen_tabla === 'manual' && (
                                  <>
                                    <button onClick={() => handleEdit(m)} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }}>
                                      <Pencil size={11}/>
                                    </button>
                                    <button onClick={() => eliminarMut.mutate(m.id)} className="p-1 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}>
                                      <Trash2 size={11}/>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tabla plana */}
      <div className="rmg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(56,182,255,0.08)' }}>
          <span className="font-bold text-sm">Tabla de movimientos</span>
          <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{movimientos.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                {['Fecha pago', 'Tipo', 'Categoría', 'Descripción', 'Cuenta', 'Monto', 'Estado', 'Saldo acum.', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                      ))}
                    </tr>
                  ))
                : movsConSaldo.map((m, i) => {
                    const isIng = m.tipo === 'ingreso'
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(m.fecha_pago)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: isIng ? 'rgba(45,201,138,0.12)' : 'rgba(224,90,78,0.12)', color: isIng ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                            {isIng ? '↑' : '↓'} {isIng ? 'Ingreso' : 'Egreso'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs capitalize" style={{ color: 'var(--rmg-muted)' }}>{m.categoria || m.origen_tabla || '—'}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[200px] truncate" style={{ color: 'var(--rmg-off)' }} title={m.descripcion}>{m.descripcion}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)' }}>
                          {m.cuenta_bancaria ? m.cuenta_bancaria.split(' ')[0] : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-right whitespace-nowrap"
                          style={{ color: isIng ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                          {isIng ? '+' : '-'}{formatCLP(m.monto)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={m.estado === 'confirmado'
                              ? { background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }
                              : { background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
                            {m.estado === 'confirmado' ? '✓ Conf.' : '○ Proy.'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-black text-right whitespace-nowrap"
                          style={{ color: m.saldo_acum >= 0 ? 'var(--rmg-off)' : 'var(--rmg-red)', fontFamily: 'Inter Tight, sans-serif' }}>
                          {formatCLP(m.saldo_acum)}
                        </td>
                        <td className="px-4 py-2.5">
                          {m.origen_tabla === 'manual' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleEdit(m)} className="p-1.5 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }}>
                                <Pencil size={12}/>
                              </button>
                              <button onClick={() => eliminarMut.mutate(m.id)} className="p-1.5 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}>
                                <Trash2 size={12}/>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
        {!isLoading && movimientos.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Wallet size={28} className="mx-auto mb-2 opacity-20"/>
            <p className="text-sm">Sin movimientos</p>
          </div>
        )}
      </div>
    </div>
  )
}
