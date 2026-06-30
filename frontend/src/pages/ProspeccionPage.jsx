import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import toast from 'react-hot-toast'
import { UserCheck, Trash2, MessageCircle, Search } from 'lucide-react'

// ─── helpers ───────────────────────────────────────────────────────────────

function toWaLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const num = digits.length > 9 ? digits.slice(-9) : digits
  return `https://wa.me/56${num}`
}

const PRIORITY_STYLE = {
  alta:  { background: 'rgba(224,90,78,0.15)',  color: '#e05a4e' },
  media: { background: 'rgba(244,162,60,0.15)', color: '#f4a23c' },
  baja:  { background: 'rgba(90,143,168,0.12)', color: 'rgba(90,143,168,0.8)' },
}

function PrioridadBadge({ value }) {
  const style = PRIORITY_STYLE[value] || PRIORITY_STYLE.baja
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 9px',
      borderRadius: 20, textTransform: 'capitalize', ...style,
    }}>
      {value || '—'}
    </span>
  )
}

function SegmentoBadge({ segmento }) {
  if (!segmento) return null
  if (segmento === 'rentacar') {
    return (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px',
        borderRadius: 20, background: 'rgba(45,201,138,0.15)', color: '#2dc98a',
      }}>
        Rent-a-Car
      </span>
    )
  }
  return <span className={`badge-${segmento}`}>{segmento}</span>
}

function NotasCell({ id, text, expanded, onToggle }) {
  if (!text) return <span style={{ color: 'rgba(90,143,168,0.4)', fontSize: 12 }}>—</span>

  const lines = text.split('\n')
  const isLong = text.length > 100 || lines.length > 2

  return (
    <div style={{ maxWidth: 220 }}>
      <p style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.55)',
        margin: 0,
        whiteSpace: 'pre-wrap',
        overflow: expanded ? 'visible' : 'hidden',
        display: expanded ? 'block' : '-webkit-box',
        WebkitLineClamp: expanded ? undefined : 2,
        WebkitBoxOrient: 'vertical',
        lineHeight: '1.5',
      }}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={() => onToggle(id)}
          style={{
            fontSize: 11, color: 'var(--rmg-blue)', background: 'none',
            border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2,
          }}
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  )
}

// ─── skeleton rows ──────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} style={{ padding: '12px 12px' }}>
          <div style={{
            height: 14, borderRadius: 6,
            background: 'rgba(255,255,255,0.05)',
            width: i === 0 ? '80%' : i === 6 ? '50%' : '70%',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  )
}

// ─── filter select ──────────────────────────────────────────────────────────

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '0.5px solid rgba(56,182,255,0.15)',
        borderRadius: 8,
        padding: '7px 12px',
        fontSize: 13,
        color: value === options[0] ? 'rgba(90,143,168,0.7)' : 'rgba(255,255,255,0.8)',
        outline: 'none',
        cursor: 'pointer',
        minWidth: 140,
      }}
    >
      {options.map(o => (
        <option key={o} value={o} style={{ background: '#0a1a2e' }}>{o}</option>
      ))}
    </select>
  )
}

// ─── main component ─────────────────────────────────────────────────────────

const TABLE_HEADERS = [
  'Empresa / Segmento',
  'Rubro',
  'Contacto',
  'Región / Comuna',
  'Teléfono',
  'Notas',
  'Prioridad',
  'Acciones',
]

export default function ProspeccionPage() {
  const [busqueda, setBusqueda]           = useState('')
  const [segmentoFiltro, setSegmentoFiltro] = useState('Todos')
  const [prioridadFiltro, setPrioridadFiltro] = useState('Todas')
  const [regionFiltro, setRegionFiltro]   = useState('Todas')
  const [expandedNotas, setExpandedNotas] = useState({})

  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['prospeccion'],
    queryFn: () => api.get('/prospeccion').then(r => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['prospeccion-stats'],
    queryFn: () => api.get('/prospeccion/stats').then(r => r.data),
  })

  // derive unique filter options from data
  const segmentos = useMemo(() => {
    const vals = [...new Set(data.map(p => p.segmento).filter(Boolean))]
    return ['Todos', ...vals.sort()]
  }, [data])

  const regiones = useMemo(() => {
    const vals = [...new Set(data.map(p => p.region).filter(Boolean))]
    return ['Todas', ...vals.sort()]
  }, [data])

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return data.filter(p => {
      if (segmentoFiltro !== 'Todos' && p.segmento !== segmentoFiltro) return false
      if (prioridadFiltro !== 'Todas' && p.prioridad !== prioridadFiltro) return false
      if (regionFiltro !== 'Todas' && p.region !== regionFiltro) return false
      if (q) {
        const hay = [p.empresa, p.nombre_contacto, p.notas].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, busqueda, segmentoFiltro, prioridadFiltro, regionFiltro])

  const handleMoverAContacto = async (id) => {
    try {
      await api.post(`/prospeccion/${id}/mover-a-contacto`)
      toast.success('Movido al Pipeline CRM → Contactado')
      qc.invalidateQueries({ queryKey: ['prospeccion'] })
      qc.invalidateQueries({ queryKey: ['prospeccion-stats'] })
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al mover el prospecto')
    }
  }

  const handleDescartar = async (id, empresa) => {
    if (!confirm(`¿Descartar "${empresa}"?`)) return
    try {
      await api.patch(`/prospeccion/${id}/descartar`)
      toast.success('Prospecto descartado')
      qc.invalidateQueries({ queryKey: ['prospeccion'] })
      qc.invalidateQueries({ queryKey: ['prospeccion-stats'] })
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al descartar')
    }
  }

  const toggleNota = (id) =>
    setExpandedNotas(prev => ({ ...prev, [id]: !prev[id] }))

  const totalActivos = stats?.total_activos ?? data.length

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-black"
            style={{ fontFamily: 'Inter Tight, sans-serif' }}
          >
            Prospección
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
            Pipeline de prospectos activos
          </p>
        </div>
        {!isLoading && (
          <span style={{
            fontSize: 13, fontWeight: 700,
            padding: '5px 14px', borderRadius: 20,
            background: 'rgba(27,143,212,0.15)', color: 'var(--rmg-blue)',
            alignSelf: 'center',
          }}>
            {totalActivos} activos
          </span>
        )}
      </div>

      {/* ── Filters ── */}
      <div
        className="rmg-card p-3"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}
      >
        {/* search */}
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(90,143,168,0.6)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Buscar empresa, contacto, notas…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
              background: 'rgba(255,255,255,0.04)',
              border: '0.5px solid rgba(56,182,255,0.15)',
              borderRadius: 8,
              fontSize: 13,
              color: 'rgba(255,255,255,0.8)',
              outline: 'none',
            }}
          />
        </div>

        <FilterSelect
          value={segmentoFiltro}
          onChange={setSegmentoFiltro}
          options={segmentos}
        />
        <FilterSelect
          value={prioridadFiltro}
          onChange={setPrioridadFiltro}
          options={['Todas', 'alta', 'media', 'baja']}
        />
        <FilterSelect
          value={regionFiltro}
          onChange={setRegionFiltro}
          options={regiones}
        />

        {(busqueda || segmentoFiltro !== 'Todos' || prioridadFiltro !== 'Todas' || regionFiltro !== 'Todas') && (
          <button
            onClick={() => {
              setBusqueda('')
              setSegmentoFiltro('Todos')
              setPrioridadFiltro('Todas')
              setRegionFiltro('Todas')
            }}
            style={{
              fontSize: 12, color: 'rgba(90,143,168,0.7)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '0.5px solid rgba(56,182,255,0.15)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {TABLE_HEADERS.map(h => (
                <th
                  key={h}
                  style={{
                    padding: '9px 12px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'rgba(90,143,168,0.7)',
                    textAlign: 'left',
                    borderBottom: '0.5px solid rgba(56,182,255,0.1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : filtrados.length === 0
                ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '56px 24px', textAlign: 'center' }}>
                      <div style={{ color: 'rgba(90,143,168,0.5)', fontSize: 14 }}>
                        Sin prospectos activos
                      </div>
                      <div style={{ color: 'rgba(90,143,168,0.35)', fontSize: 12, marginTop: 6 }}>
                        {busqueda || segmentoFiltro !== 'Todos' || prioridadFiltro !== 'Todas' || regionFiltro !== 'Todas'
                          ? 'Intenta ajustar los filtros de búsqueda.'
                          : 'Agrega prospectos para comenzar a llenar el pipeline.'}
                      </div>
                    </td>
                  </tr>
                )
                : filtrados.map(p => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: '0.5px solid rgba(56,182,255,0.07)' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Empresa + segmento */}
                    <td style={{ padding: '11px 12px', minWidth: 160 }}>
                      <div
                        style={{
                          fontWeight: 600, fontSize: 13,
                          color: 'rgba(255,255,255,0.85)',
                          marginBottom: 4,
                        }}
                      >
                        {p.empresa || '—'}
                      </div>
                      <SegmentoBadge segmento={p.segmento} />
                    </td>

                    {/* Rubro */}
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'rgba(255,255,255,0.55)', minWidth: 120 }}>
                      {p.rubro_especialidad || '—'}
                    </td>

                    {/* Contacto */}
                    <td style={{ padding: '11px 12px', minWidth: 140 }}>
                      {p.nombre_contacto
                        ? (
                          <>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                              {p.nombre_contacto}
                            </div>
                            {p.cargo && (
                              <div style={{ fontSize: 11, color: 'rgba(90,143,168,0.7)', marginTop: 2 }}>
                                {p.cargo}
                              </div>
                            )}
                          </>
                        )
                        : <span style={{ color: 'rgba(90,143,168,0.4)', fontSize: 12 }}>—</span>
                      }
                    </td>

                    {/* Región / Comuna */}
                    <td style={{ padding: '11px 12px', minWidth: 130 }}>
                      {p.region
                        ? (
                          <>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{p.region}</div>
                            {p.comuna && (
                              <div style={{ fontSize: 11, color: 'rgba(90,143,168,0.6)', marginTop: 2 }}>{p.comuna}</div>
                            )}
                          </>
                        )
                        : <span style={{ color: 'rgba(90,143,168,0.4)', fontSize: 12 }}>—</span>
                      }
                    </td>

                    {/* Teléfono + WA */}
                    <td style={{ padding: '11px 12px', minWidth: 130 }}>
                      {(() => {
                        const phone = p.telefono_contacto || p.telefono_empresa
                        const waUrl  = toWaLink(phone)
                        if (!phone) return <span style={{ color: 'rgba(90,143,168,0.4)', fontSize: 12 }}>—</span>
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{phone}</span>
                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir en WhatsApp"
                                style={{
                                  display: 'flex', alignItems: 'center',
                                  color: '#2dc98a', flexShrink: 0,
                                }}
                              >
                                <MessageCircle size={14} />
                              </a>
                            )}
                          </div>
                        )
                      })()}
                    </td>

                    {/* Notas */}
                    <td style={{ padding: '11px 12px', minWidth: 160, maxWidth: 240 }}>
                      <NotasCell
                        id={p.id}
                        text={p.notas}
                        expanded={!!expandedNotas[p.id]}
                        onToggle={toggleNota}
                      />
                    </td>

                    {/* Prioridad */}
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      <PrioridadBadge value={p.prioridad} />
                    </td>

                    {/* Acciones */}
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          title="Mover a Contacto"
                          onClick={() => handleMoverAContacto(p.id)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 30, height: 30, borderRadius: 7,
                            background: 'rgba(27,143,212,0.12)',
                            border: '0.5px solid rgba(27,143,212,0.25)',
                            color: 'var(--rmg-blue)',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,143,212,0.22)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(27,143,212,0.12)'}
                        >
                          <UserCheck size={14} />
                        </button>

                        <button
                          title="Descartar prospecto"
                          onClick={() => handleDescartar(p.id, p.empresa)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 30, height: 30, borderRadius: 7,
                            background: 'rgba(224,90,78,0.1)',
                            border: '0.5px solid rgba(224,90,78,0.2)',
                            color: '#e05a4e',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(224,90,78,0.2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(224,90,78,0.1)'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {/* row count footer */}
      {!isLoading && filtrados.length > 0 && (
        <div style={{ fontSize: 12, color: 'rgba(90,143,168,0.5)', textAlign: 'right' }}>
          {filtrados.length} prospecto{filtrados.length !== 1 ? 's' : ''}
          {filtrados.length !== data.length && ` de ${data.length}`}
        </div>
      )}
    </div>
  )
}
