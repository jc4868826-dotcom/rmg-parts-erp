import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { Wallet, Plus, X, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
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

const ORIGEN_STYLE = {
  Venta:  { background: 'rgba(45,201,138,0.12)',  color: 'var(--rmg-teal)'   },
  Gasto:  { background: 'rgba(255,185,0,0.12)',   color: 'var(--rmg-gold)'   },
  Compra: { background: 'rgba(224,90,78,0.12)',   color: 'var(--rmg-red)'    },
  OC:     { background: 'rgba(130,90,224,0.12)',  color: 'var(--rmg-purple)' },
  Manual: { background: 'rgba(56,182,255,0.1)',   color: 'var(--rmg-blt)'    },
}

const mesActualStr = () => new Date().toISOString().slice(0, 7)

function formatFecha(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function semanaKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return {
    key:   `${d.getFullYear()}-W${String(week).padStart(2, '0')}`,
    label: `S${week} · ${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`,
  }
}

const TT = { background: '#0a1a2e', border: '1px solid rgba(56,182,255,0.2)', borderRadius: 8, color: '#fff', fontSize: 12 }
const AX = { fill: 'rgba(90,143,168,0.7)', fontSize: 11 }

export default function FlujoCajaPage() {
  const [mes, setMes]           = useState(mesActualStr())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(FORM_INIT)
  const [editando, setEditando] = useState(null)
  const [cardFilter, setCardFilter] = useState(null)
  const [openSem, setOpenSem]   = useState({})
  const [openCat, setOpenCat]   = useState({})
  const qc = useQueryClient()

  const { data: fcData = {}, isLoading } = useQuery({
    queryKey: ['flujo-caja', mes],
    queryFn: () => api.get('/flujo-caja', { params: { mes } }).then(r => r.data),
  })

  const movimientos = fcData.movimientos ?? []
  const resumen     = fcData.resumen     ?? {}

  const invalidate = () => qc.invalidateQueries({ queryKey: ['flujo-caja'] })

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
    onError: () => toast.error('Solo se eliminan movimientos manuales'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) { toast.error('Monto inválido'); return }
    crearMut.mutate({ ...form, monto: Number(form.monto) })
  }

  const handleEditSubmit = (e) => {
    e.preventDefault()
    editarMut.mutate({ id: editando.id, data: editando })
  }

  // ── 4 KPI cards ────────────────────────────────────────────────────────────
  const CARDS = [
    {
      key: 'saldo_real',
      label: 'Saldo Real',
      value: resumen.saldo_real ?? 0,
      sub: `+${formatCLP(resumen.ingresos_confirmados ?? 0)} · -${formatCLP(resumen.egresos_confirmados ?? 0)}`,
      color: (resumen.saldo_real ?? 0) >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)',
      filter: (m) => m.estado === 'confirmado',
    },
    {
      key: 'ing_proy',
      label: 'Ingresos Proyectados',
      value: resumen.ingresos_proyectados ?? 0,
      sub: `${movimientos.filter(m => m.tipo === 'ingreso' && m.estado === 'proyectado').length} mov. pendientes`,
      color: 'var(--rmg-teal)',
      filter: (m) => m.tipo === 'ingreso' && m.estado === 'proyectado',
    },
    {
      key: 'egr_proy',
      label: 'Egresos Proyectados',
      value: resumen.egresos_proyectados ?? 0,
      sub: `${movimientos.filter(m => m.tipo === 'egreso' && m.estado === 'proyectado').length} mov. pendientes`,
      color: 'var(--rmg-red)',
      filter: (m) => m.tipo === 'egreso' && m.estado === 'proyectado',
    },
    {
      key: 'saldo_proy',
      label: 'Saldo Proyectado',
      value: resumen.saldo_proyectado ?? 0,
      sub: 'Real + proyectados del período',
      color: (resumen.saldo_proyectado ?? 0) >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)',
      filter: () => true,
    },
  ]

  const activeCard = CARDS.find(c => c.key === cardFilter)

  const movsVisible = useMemo(() => {
    if (!activeCard) return movimientos
    return movimientos.filter(activeCard.filter)
  }, [movimientos, activeCard])

  const porSemana = useMemo(() => {
    const map = {}
    for (const m of movsVisible) {
      if (!m.fecha_pago) continue
      const { key, label } = semanaKey(m.fecha_pago)
      if (!map[key]) map[key] = { key, label, items: [], ingresos: 0, egresos: 0 }
      map[key].items.push(m)
      if (m.tipo === 'ingreso') map[key].ingresos += m.monto
      else                      map[key].egresos  += m.monto
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [movsVisible])

  const categoriasPorSem = (semKey) => {
    const sem = porSemana.find(s => s.key === semKey)
    if (!sem) return []
    const map = {}
    for (const m of sem.items) {
      const cat = m.categoria || m.origen_label || 'sin categoría'
      if (!map[cat]) map[cat] = { cat, items: [], ingresos: 0, egresos: 0 }
      map[cat].items.push(m)
      if (m.tipo === 'ingreso') map[cat].ingresos += m.monto
      else                      map[cat].egresos  += m.monto
    }
    return Object.values(map)
  }

  const chartData = useMemo(() => {
    const map = {}
    for (const m of movimientos) {
      if (!m.fecha_pago) continue
      const { key, label } = semanaKey(m.fecha_pago)
      if (!map[key]) map[key] = { key, semana: label, Ingresos: 0, Egresos: 0 }
      if (m.tipo === 'ingreso') map[key].Ingresos += m.monto
      else                      map[key].Egresos  += m.monto
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [movimientos])

  let saldoCorrido = 0
  const movsConSaldo = movsVisible.map(m => {
    saldoCorrido += m.tipo === 'ingreso' ? m.monto : -m.monto
    return { ...m, saldo_acum: saldoCorrido }
  })

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Flujo de Caja</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Consolidado ERP · ventas, gastos, compras y movimientos manuales</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nuevo</>}
        </button>
      </div>

      {/* Filtro mes */}
      <div className="rmg-card p-4 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Período</span>
        <input type="month" className="rmg-input text-xs py-1.5 w-40" value={mes}
          onChange={e => { setMes(e.target.value); setCardFilter(null) }} />
        <button onClick={() => { setMes(mesActualStr()); setCardFilter(null) }}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
          Mes actual
        </button>
        {isLoading && <span className="text-xs animate-pulse" style={{ color: 'var(--rmg-muted)' }}>Cargando…</span>}
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CARDS.map(c => {
          const isActive = cardFilter === c.key
          return (
            <button key={c.key} onClick={() => setCardFilter(isActive ? null : c.key)}
              className="rmg-card p-4 text-left transition-all"
              style={isActive ? { outline: `2px solid ${c.color}`, outlineOffset: 2 } : {}}>
              <div className="text-xs uppercase tracking-wider font-semibold mb-2 leading-tight" style={{ color: 'var(--rmg-muted)' }}>
                {c.label}
              </div>
              <div className="font-black text-xl leading-none" style={{ fontFamily: 'Inter Tight, sans-serif', color: c.color }}>
                {formatCLP(c.value)}
              </div>
              <div className="text-xs mt-1.5 leading-snug" style={{ color: 'var(--rmg-muted)' }}>{c.sub}</div>
              {isActive && <div className="mt-2 text-xs font-semibold" style={{ color: c.color }}>▼ filtrado</div>}
            </button>
          )
        })}
      </div>

      {/* Gráfico */}
      <div className="rmg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-sm">Ingresos vs Egresos por semana</h2>
          <div className="flex gap-4 text-xs" style={{ color: 'var(--rmg-muted)' }}>
            <span className="flex items-center gap-1.5"><div className="w-4 h-2 rounded" style={{ background: 'var(--rmg-teal)' }}/>Ingresos</span>
            <span className="flex items-center gap-1.5"><div className="w-4 h-2 rounded" style={{ background: 'var(--rmg-red)' }}/>Egresos</span>
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="semana" tick={AX} axisLine={false} tickLine={false} />
              <YAxis tick={AX} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} />
              <Tooltip contentStyle={TT} formatter={v => formatCLP(v)} />
              <Bar dataKey="Ingresos" fill="var(--rmg-teal)" radius={[3,3,0,0]} />
              <Bar dataKey="Egresos"  fill="var(--rmg-red)"  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Sin movimientos en este período
          </div>
        )}
      </div>

      {/* Formulario nuevo movimiento manual */}
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

      {/* Accordion semana → categoría → detalle */}
      {porSemana.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm">
              Detalle por semana
              {activeCard && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--rmg-muted)' }}>· filtrado: {activeCard.label}</span>}
            </h2>
            {activeCard && (
              <button onClick={() => setCardFilter(null)} className="text-xs flex items-center gap-1" style={{ color: 'var(--rmg-muted)' }}>
                <X size={11}/> Limpiar filtro
              </button>
            )}
          </div>
          {porSemana.map(sem => {
            const semOpen = openSem[sem.key]
            return (
              <div key={sem.key} className="rmg-card overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setOpenSem(p => ({ ...p, [sem.key]: !p[sem.key] }))}>
                  <div className="flex items-center gap-3">
                    {semOpen ? <ChevronDown size={14} style={{ color: 'var(--rmg-muted)' }}/> : <ChevronRight size={14} style={{ color: 'var(--rmg-muted)' }}/>}
                    <span className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>{sem.label}</span>
                    <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{sem.items.length} mov.</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {sem.ingresos > 0 && <span style={{ color: 'var(--rmg-teal)' }}>+{formatCLP(sem.ingresos)}</span>}
                    {sem.egresos  > 0 && <span style={{ color: 'var(--rmg-red)'  }}>-{formatCLP(sem.egresos)}</span>}
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
                            <div key={`${m.origen_tabla}_${m.origen_id}`}
                              className="flex items-center justify-between px-10 py-2 text-xs border-t"
                              style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span style={{ color: 'var(--rmg-muted)', flexShrink: 0 }}>{formatFecha(m.fecha_pago)}</span>
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={ORIGEN_STYLE[m.origen_label] ?? {}}>
                                  {m.origen_label}
                                </span>
                                <span className="truncate" style={{ color: 'var(--rmg-off)' }}>{m.descripcion}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                <span className="font-semibold" style={{ color: m.tipo === 'ingreso' ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                                  {m.tipo === 'ingreso' ? '+' : '-'}{formatCLP(m.monto)}
                                </span>
                                <span className="px-1.5 py-0.5 rounded"
                                  style={m.estado === 'confirmado'
                                    ? { background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }
                                    : { background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)' }}>
                                  {m.estado === 'confirmado' ? '✓' : '○'}
                                </span>
                                {m.origen_tabla === 'manual' && (
                                  <>
                                    <button onClick={() => setEditando({ ...m })} className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }}>
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
          <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{movsVisible.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                {['Fecha pago','Tipo','Origen','Categoría','Descripción','Cuenta','Monto','Estado','Saldo acum.',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                      ))}
                    </tr>
                  ))
                : movsConSaldo.map((m, i) => {
                    const isIng = m.tipo === 'ingreso'
                    return (
                      <tr key={`${m.origen_tabla}_${m.origen_id}`}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(m.fecha_pago)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: isIng ? 'rgba(45,201,138,0.12)' : 'rgba(224,90,78,0.12)', color: isIng ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                            {isIng ? '↑ Ingreso' : '↓ Egreso'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={ORIGEN_STYLE[m.origen_label] ?? {}}>
                            {m.origen_label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs capitalize" style={{ color: 'var(--rmg-muted)' }}>{m.categoria || '—'}</td>
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
                              <button onClick={() => setEditando({ ...m })} className="p-1.5 rounded hover:bg-white/5" style={{ color: 'var(--rmg-muted)' }}>
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
        {!isLoading && movsVisible.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Wallet size={28} className="mx-auto mb-2 opacity-20"/>
            <p className="text-sm">Sin movimientos para este período</p>
          </div>
        )}
      </div>
    </div>
  )
}
