import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'

// ── Helpers calendario ──────────────────────────────────────
const MESES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_S = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

const getDaysInMonth  = (y, m) => new Date(y, m + 1, 0).getDate()
const getFirstDayOfWeek = (y, m) => { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1 }
const toDateStr = (y, m, d) => `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

const TIPO_CONFIG = {
  visita:   { label: 'Visita',    color: 'var(--rmg-blt)',    bg: 'rgba(56,182,255,0.15)',  icon: '🚗' },
  entrega:  { label: 'Entrega',   color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.15)',  icon: '📦' },
  llamada:  { label: 'Llamada',   color: 'var(--rmg-purple)', bg: 'rgba(123,97,196,0.15)', icon: '📞' },
  reunion:  { label: 'Reunión',   color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.15)',  icon: '👥' },
}

const EVENTOS_INIT = [
  { id: 1, titulo: 'Visita Taller Hermanos Díaz',         tipo: 'visita',   cliente: 'Taller Hermanos Díaz',       fecha: '2026-06-27', hora: '10:00', notas: 'Negociación volumen mensual baterías' },
  { id: 2, titulo: 'Entrega MetroMov Buses',              tipo: 'entrega',  cliente: 'MetroMov Buses S.A.',        fecha: '2026-06-27', hora: '14:00', notas: 'PED-2026-003 — 8 neumáticos 11 R22.5' },
  { id: 3, titulo: 'Llamada Transportes Norte',           tipo: 'llamada',  cliente: 'Transportes Norte S.A.',     fecha: '2026-06-28', hora: '09:30', notas: 'Seguimiento COT-2026-002 estado aprobación' },
  { id: 4, titulo: 'Visita AutoCenter Bellavista',         tipo: 'visita',   cliente: 'AutoCenter Bellavista',      fecha: '2026-06-29', hora: '11:00', notas: 'Primera visita — presentar catálogo neumáticos' },
  { id: 5, titulo: 'Reunión interna — cierre de mes',     tipo: 'reunion',  cliente: '',                           fecha: '2026-06-30', hora: '16:00', notas: 'Revisión metas junio + planificación julio' },
  { id: 6, titulo: 'Llamada Constructora Mediterráneo',   tipo: 'llamada',  cliente: 'Constructora Mediterráneo',  fecha: '2026-07-01', hora: '15:30', notas: 'Seguimiento propuesta $750K aceites y baterías' },
  { id: 7, titulo: 'Visita Automotora San Antonio',        tipo: 'visita',   cliente: 'Automotora San Antonio',     fecha: '2026-07-02', hora: '11:00', notas: 'Segunda visita — condiciones de crédito' },
  { id: 8, titulo: 'Entrega Taller Hermanos Díaz',        tipo: 'entrega',  cliente: 'Taller Hermanos Díaz',       fecha: '2026-07-03', hora: '08:00', notas: 'Baterías YOKO + lubricantes AUSTER' },
  { id: 9, titulo: 'Llamada Lubricentro Express',          tipo: 'llamada',  cliente: 'Lubricentro Express',        fecha: '2026-07-04', hora: '10:00', notas: 'Primer contacto — cotizar aceite 15W40' },
  { id:10, titulo: 'Entrega Transportes Norte',            tipo: 'entrega',  cliente: 'Transportes Norte S.A.',     fecha: '2026-07-07', hora: '07:30', notas: 'PED-2026-002 — neumáticos camión' },
]

const FORM_INIT = {
  titulo: '', tipo: 'visita', cliente: '',
  fecha: new Date().toISOString().split('T')[0], hora: '09:00', notas: '',
}

const TODAY = '2026-06-27'

function EventChip({ evento }) {
  const cfg = TIPO_CONFIG[evento.tipo] || TIPO_CONFIG.visita
  return (
    <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
      style={{ background: cfg.bg, color: cfg.color }}>
      <span>{cfg.icon}</span>
      <span className="font-medium truncate">{evento.hora} {evento.titulo}</span>
    </div>
  )
}

export default function AgendaPage() {
  const now = new Date(TODAY)
  const [viewMonth, setViewMonth]   = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(now.getDate())
  const [eventos, setEventos]       = useState(EVENTOS_INIT)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(FORM_INIT)

  const year  = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const daysInMonth  = getDaysInMonth(year, month)
  const firstDayWeek = getFirstDayOfWeek(year, month)
  const totalCells   = Math.ceil((firstDayWeek + daysInMonth) / 7) * 7
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = i - firstDayWeek + 1
    return d >= 1 && d <= daysInMonth ? d : null
  })

  const getEventsForDay = (d) => eventos.filter(e => e.fecha === toDateStr(year, month, d))

  const todayStr    = TODAY
  const selectedStr = toDateStr(year, month, selectedDay)

  // Semana actual (lun–dom de la semana que contiene TODAY)
  const todayDate   = new Date(TODAY)
  const todayDow    = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1
  const weekStart   = new Date(todayDate); weekStart.setDate(todayDate.getDate() - todayDow)
  const weekDays    = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    return d.toISOString().split('T')[0]
  })
  const eventosSemana = eventos
    .filter(e => weekDays.includes(e.fecha))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.titulo || !form.fecha) { toast.error('Título y fecha son obligatorios'); return }
    setEventos(prev => [...prev, { ...form, id: Date.now() }])
    setForm(FORM_INIT)
    setShowForm(false)
    toast.success('Evento creado')
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Agenda</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Visitas · Entregas · Llamadas · Reuniones</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15} /> Cerrar</> : <><Plus size={15} /> Nuevo evento</>}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Crear evento</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Título *</label>
              <input className="rmg-input" placeholder="Ej: Visita Taller Central..." value={form.titulo}
                onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tipo *</label>
              <select className="rmg-input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cliente</label>
              <input className="rmg-input" placeholder="Razón social..." value={form.cliente}
                onChange={e => setForm(p => ({ ...p, cliente: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha *</label>
              <input type="date" className="rmg-input" value={form.fecha}
                onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Hora</label>
              <input type="time" className="rmg-input" value={form.hora}
                onChange={e => setForm(p => ({ ...p, hora: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
              <input className="rmg-input" placeholder="Objetivo, contexto, qué llevar..." value={form.notas}
                onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
            </div>
            <div className="md:col-span-3 flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary">Guardar evento</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Calendario mensual ──────────────────────────── */}
        <div className="lg:col-span-2 rmg-card p-5">

          {/* Navegación mes */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--rmg-muted)' }}>
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-black text-lg" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
              {MESES[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--rmg-muted)' }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Cabecera días semana */}
          <div className="grid grid-cols-7 mb-2">
            {DIAS_S.map(d => (
              <div key={d} className="text-center text-xs font-semibold uppercase tracking-wider py-1"
                style={{ color: 'var(--rmg-muted)' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid de días */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const dateStr = toDateStr(year, month, day)
              const dayEvents = getEventsForDay(day)
              const isToday    = dateStr === todayStr
              const isSelected = day === selectedDay && year === new Date(TODAY).getFullYear() && month === new Date(TODAY).getMonth()

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(day)}
                  className="relative rounded-lg p-1.5 text-sm transition-all min-h-[52px] flex flex-col items-start"
                  style={{
                    background: isSelected
                      ? 'rgba(27,143,212,0.15)'
                      : isToday
                        ? 'rgba(56,182,255,0.07)'
                        : 'transparent',
                    border: isToday
                      ? '1px solid rgba(56,182,255,0.3)'
                      : isSelected
                        ? '1px solid rgba(27,143,212,0.4)'
                        : '1px solid transparent',
                  }}
                >
                  <span className="font-semibold text-xs mb-1"
                    style={{ color: isToday ? 'var(--rmg-blt)' : 'var(--rmg-off)' }}>
                    {day}
                  </span>
                  <div className="flex flex-wrap gap-0.5 w-full">
                    {dayEvents.slice(0, 3).map(ev => {
                      const cfg = TIPO_CONFIG[ev.tipo] || TIPO_CONFIG.visita
                      return (
                        <div key={ev.id} className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: cfg.color }} title={ev.titulo} />
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-xs leading-none" style={{ color: 'var(--rmg-muted)' }}>
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Leyenda tipos */}
          <div className="flex flex-wrap gap-3 mt-4 pt-4" style={{ borderTop: '1px solid rgba(56,182,255,0.08)' }}>
            {Object.entries(TIPO_CONFIG).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--rmg-muted)' }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: v.color }} />
                {v.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Panel derecho ──────────────────────────────── */}
        <div className="space-y-4">

          {/* Eventos del día seleccionado */}
          <div className="rmg-card p-4">
            <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--rmg-off)' }}>
              {selectedStr === todayStr ? 'Hoy' : `${selectedDay} ${MESES[month]}`}
            </h3>
            {getEventsForDay(selectedDay).length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--rmg-muted)' }}>Sin eventos este día</p>
            ) : (
              <div className="space-y-2">
                {getEventsForDay(selectedDay)
                  .sort((a, b) => a.hora.localeCompare(b.hora))
                  .map(ev => {
                    const cfg = TIPO_CONFIG[ev.tipo] || TIPO_CONFIG.visita
                    return (
                      <div key={ev.id} className="p-3 rounded-lg"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.color}25` }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span>{cfg.icon}</span>
                            <span className="font-semibold text-sm" style={{ color: 'var(--rmg-off)' }}>{ev.titulo}</span>
                          </div>
                          <span className="text-xs font-bold whitespace-nowrap" style={{ color: cfg.color }}>{ev.hora}</span>
                        </div>
                        {ev.cliente && (
                          <div className="text-xs mt-1 ml-5" style={{ color: 'var(--rmg-muted)' }}>{ev.cliente}</div>
                        )}
                        {ev.notas && (
                          <div className="text-xs mt-1 ml-5" style={{ color: 'rgba(255,255,255,0.4)' }}>{ev.notas}</div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Semana actual */}
          <div className="rmg-card p-4">
            <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--rmg-off)' }}>Esta semana</h3>
            {eventosSemana.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--rmg-muted)' }}>Sin eventos esta semana</p>
            ) : (
              <div className="space-y-1.5">
                {eventosSemana.map(ev => {
                  const cfg = TIPO_CONFIG[ev.tipo] || TIPO_CONFIG.visita
                  const [, , d] = ev.fecha.split('-')
                  return (
                    <div key={ev.id} className="flex items-start gap-2.5 py-1.5"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="text-center flex-shrink-0 w-8">
                        <div className="text-xs font-bold" style={{ color: cfg.color }}>{String(Number(d))}</div>
                        <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{ev.hora.slice(0,5)}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{cfg.icon}</span>
                          <span className="text-xs font-medium truncate" style={{ color: 'var(--rmg-off)' }}>{ev.titulo}</span>
                        </div>
                        {ev.cliente && (
                          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--rmg-muted)' }}>{ev.cliente}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
