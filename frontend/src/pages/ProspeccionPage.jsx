import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { UserCheck, Trash2, MessageCircle, Search, Upload, Download, Plus, Pencil, X, Check, Megaphone } from 'lucide-react'

// ─── constants ──────────────────────────────────────────────────────────────

const ORIGENES = ['Manual', 'Excel', 'WhatsApp', 'Web', 'Referido', 'Google Ads', 'Meta Ads', 'LinkedIn']
const PRIORIDADES = ['alta', 'media', 'baja']
const SEGMENTOS = ['taller', 'flota', 'concesionario', 'construccion', 'rentacar']

const ORIGEN_STYLE = {
  Manual:       { bg: 'rgba(90,143,168,0.12)',  color: 'rgba(90,143,168,0.9)' },
  Excel:        { bg: 'rgba(45,201,138,0.12)',  color: '#2dc98a' },
  WhatsApp:     { bg: 'rgba(45,201,138,0.15)',  color: '#25d366' },
  Web:          { bg: 'rgba(56,182,255,0.12)',  color: 'var(--rmg-blt)' },
  Referido:     { bg: 'rgba(244,162,60,0.12)',  color: '#f4a23c' },
  'Google Ads': { bg: 'rgba(234,67,53,0.12)',   color: '#ea4335' },
  'Meta Ads':   { bg: 'rgba(24,119,242,0.12)',  color: '#1877f2' },
  LinkedIn:     { bg: 'rgba(0,119,181,0.12)',   color: '#0077b5' },
}

// columnas de Excel → campos internos (case-insensitive, trim aplicado antes)
const EXCEL_MAP = {
  // Columnas del formato Excel RMG (Rut|Digito|RazonSocial|...)
  razonsocial: 'empresa',
  rut: 'rut',
  digito: 'dv',
  fono: 'telefono',
  celular: 'celular',
  email: 'email',
  direccion: 'direccion',
  dirección: 'direccion',
  comuna: 'comuna',
  ciudad: 'ciudad',
  region: 'region',
  región: 'region',
  'rubro negocio': 'rubro',
  // Columnas genéricas (retrocompatibilidad)
  empresa: 'empresa',
  'nombre empresa': 'empresa',
  contacto: 'nombre_contacto',
  'nombre contacto': 'nombre_contacto',
  telefono: 'telefono',
  teléfono: 'telefono',
  rubro: 'rubro',
  notas: 'notas',
  segmento: 'segmento',
  prioridad: 'prioridad',
  origen: 'origen',
  cargo: 'cargo',
}

function inferirSegmento(rubro = '') {
  const r = rubro.toUpperCase()
  if (r.includes('CONSTRUC')) return 'construccion'
  if (r.includes('TALLER') || r.includes('MECAN') || r.includes('AUTOMOTRIZ') || r.includes('LUBRI')) return 'taller'
  if (r.includes('TRANSP') || r.includes('FLOTA') || r.includes('BUSES') || r.includes('LOGIST')) return 'flota'
  if (r.includes('AGRICOL') || r.includes('AGRO') || r.includes('FRUTERA') || r.includes('VITIVI') || r.includes('GANADE')) return 'flota'
  if (r.includes('MINER')) return 'flota'
  return 'flota'
}

function limpiarTelefono(val = '') {
  return String(val).replace(/[/.\s]+/g, '').trim()
}

const FORM_INIT = {
  rut: '', dv: '', empresa: '', direccion: '', comuna: '', ciudad: '',
  telefono_contacto: '', telefono_empresa: '', email: '', celular: '',
  region: 'RM', rubro: '', segmento: 'flota',
  prioridad: 'media', origen: 'Manual',
}

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
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, textTransform: 'capitalize', ...style }}>{value || '—'}</span>
}

function OrigenBadge({ value }) {
  const st = ORIGEN_STYLE[value] || ORIGEN_STYLE.Manual
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{value || 'Manual'}</span>
}

function SegmentoBadge({ segmento }) {
  if (!segmento) return null
  if (segmento === 'rentacar') return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(45,201,138,0.15)', color: '#2dc98a' }}>Rent-a-Car</span>
  return <span className={`badge-${segmento}`}>{segmento}</span>
}

function NotasCell({ id, text, expanded, onToggle }) {
  if (!text) return <span style={{ color: 'rgba(90,143,168,0.4)', fontSize: 12 }}>—</span>
  const lines = text.split('\n')
  const isLong = text.length > 100 || lines.length > 2
  return (
    <div style={{ maxWidth: 200 }}>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0, whiteSpace: 'pre-wrap', overflow: expanded ? 'visible' : 'hidden', display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: expanded ? undefined : 2, WebkitBoxOrient: 'vertical', lineHeight: '1.5' }}>
        {text}
      </p>
      {isLong && <button onClick={() => onToggle(id)} style={{ fontSize: 11, color: 'var(--rmg-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginTop: 2 }}>{expanded ? 'Ver menos' : 'Ver más'}</button>}
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>{Array.from({ length: 9 }).map((_, i) => (
      <td key={i} style={{ padding: '12px 12px' }}>
        <div style={{ height: 14, borderRadius: 6, background: 'rgba(255,255,255,0.05)', width: i === 0 ? '80%' : '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}</tr>
  )
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(56,182,255,0.15)', borderRadius: 8, padding: '7px 12px', fontSize: 13, color: value === options[0] ? 'rgba(90,143,168,0.7)' : 'rgba(255,255,255,0.8)', outline: 'none', cursor: 'pointer', minWidth: 130 }}>
      {options.map(o => <option key={o} value={o} style={{ background: '#0a1a2e' }}>{o}</option>)}
    </select>
  )
}

// ─── plantilla Excel ────────────────────────────────────────────────────────

function descargarPlantilla() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Rut', 'Digito', 'RazonSocial', 'Direccion', 'Comuna', 'Ciudad', 'Fono', 'Email', 'Celular', 'Region', 'RUBRO NEGOCIO'],
    ['76461668', '5', 'SOLUCIONES INDUSTRIALES SPA', 'LAS ESTERAS NORTE 2610', 'QUILICURA', 'SANTIAGO', '976596238', 'contacto@ejemplo.cl', '976596238', 'METROPOLITANA', 'FABRICACION E INDUSTRIA'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Prospectos')
  XLSX.writeFile(wb, 'plantilla_prospectos_rmg.xlsx')
}

// ─── parse Excel file ────────────────────────────────────────────────────────

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        // Buscar la primera hoja que tenga datos reales (no siempre es SheetNames[0])
        let sheetName = wb.SheetNames[0]
        for (const name of wb.SheetNames) {
          const s = wb.Sheets[name]
          const preview = XLSX.utils.sheet_to_json(s, { header: 1 })
          if (preview.length > 1 && preview[0] && preview[0].length > 3) {
            sheetName = name
            break
          }
        }
        const ws = wb.Sheets[sheetName]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const registros = raw.map(row => {
          const mapped = {}
          for (const [key, val] of Object.entries(row)) {
            const fieldKey = EXCEL_MAP[(key || '').toLowerCase().trim()]
            if (fieldKey) mapped[fieldKey] = String(val).trim()
          }
          // Ignorar filas sin empresa
          if (!mapped.empresa) return null
          // defaults
          if (!mapped.prioridad || !PRIORIDADES.includes(mapped.prioridad.toLowerCase())) {
            mapped.prioridad = 'alta'
          } else {
            mapped.prioridad = mapped.prioridad.toLowerCase()
          }
          if (!mapped.origen || !ORIGENES.includes(mapped.origen)) mapped.origen = 'Excel'
          // Inferir segmento desde rubro si no viene explícito
          if (!mapped.segmento || !SEGMENTOS.includes(mapped.segmento)) {
            mapped.segmento = inferirSegmento(mapped.rubro || '')
          }
          if (!mapped.region) mapped.region = 'RM'
          // Limpiar teléfonos: quitar /, ., espacios extra
          if (mapped.telefono) {
            const t = limpiarTelefono(mapped.telefono)
            mapped.telefono_contacto = t
            mapped.telefono_empresa = t
            delete mapped.telefono
          }
          if (mapped.celular) mapped.celular = limpiarTelefono(mapped.celular)
          // Email inválido → vacío
          if (mapped.email && !mapped.email.includes('@')) delete mapped.email
          // nombre_contacto vacío si no viene
          if (!mapped.nombre_contacto) mapped.nombre_contacto = ''
          return mapped
        }).filter(Boolean)
        resolve(registros)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

// ─── main component ─────────────────────────────────────────────────────────

const TABLE_HEADERS = ['RUT', 'Razón Social', 'Rubro', 'Comuna', 'Email', 'Teléfono / Celular', 'Campaña', 'Acciones']

export default function ProspeccionPage() {
  const [busqueda, setBusqueda]           = useState('')
  const [segmentoFiltro, setSegmentoFiltro] = useState('Todos')
  const [prioridadFiltro, setPrioridadFiltro] = useState('Todas')
  const [regionFiltro, setRegionFiltro]   = useState('Todas')
  const [expandedNotas, setExpandedNotas] = useState({})
  const [showForm, setShowForm]           = useState(false)
  const [editando, setEditando]           = useState(null)
  const [form, setForm]                   = useState(FORM_INIT)
  const [preview, setPreview]             = useState(null) // { registros: [] }
  const [selectedIds, setSelectedIds]     = useState(new Set())
  const [showAsignarCampana, setShowAsignarCampana] = useState(false)
  const fileRef                           = useRef(null)
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['prospeccion'],
    queryFn: () => api.get('/prospeccion').then(r => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['prospeccion-stats'],
    queryFn: () => api.get('/prospeccion/stats').then(r => r.data),
  })

  const { data: campanas = [] } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => api.get('/campanas').then(r => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['prospeccion'] })
    qc.invalidateQueries({ queryKey: ['prospeccion-stats'] })
  }

  const crearMut = useMutation({
    mutationFn: (d) => api.post('/prospeccion', d).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Prospecto creado'); setShowForm(false); setForm(FORM_INIT) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear prospecto'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data: d }) => api.put(`/prospeccion/${id}`, d).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Prospecto actualizado'); setEditando(null) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar'),
  })

  const importarMut = useMutation({
    mutationFn: (registros) => api.post('/prospeccion/bulk', registros).then(r => r.data),
    onSuccess: (res) => {
      invalidate()
      toast.success(`${res.importados} prospectos importados${res.errores?.length ? ` · ${res.errores.length} errores` : ''}`)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error en importación'),
  })

  const asignarMut = useMutation({
    mutationFn: (d) => api.put('/prospeccion/asignar-campana', d).then(r => r.data),
    onSuccess: (res) => {
      invalidate()
      toast.success(`Campaña asignada a ${res.actualizados} prospectos`)
      setSelectedIds(new Set())
      setShowAsignarCampana(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al asignar campaña'),
  })

  const segmentos = useMemo(() => ['Todos', ...new Set(data.map(p => p.segmento).filter(Boolean))].sort((a, b) => a === 'Todos' ? -1 : a.localeCompare(b)), [data])
  const regiones  = useMemo(() => ['Todas', ...new Set(data.map(p => p.region).filter(Boolean))].sort((a, b) => a === 'Todas' ? -1 : a.localeCompare(b)), [data])

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return data.filter(p => {
      if (segmentoFiltro !== 'Todos' && p.segmento !== segmentoFiltro) return false
      if (prioridadFiltro !== 'Todas' && p.prioridad !== prioridadFiltro) return false
      if (regionFiltro !== 'Todas' && p.region !== regionFiltro) return false
      if (q) {
        const hay = [p.empresa, p.rut, p.rubro || p.rubro_especialidad, p.email, p.comuna, p.nombre_contacto].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, busqueda, segmentoFiltro, prioridadFiltro, regionFiltro])

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelectedIds(prev =>
    prev.size === filtrados.length ? new Set() : new Set(filtrados.map(p => p.id))
  )

  const handleMoverAContacto = async (id) => {
    try {
      await api.post(`/prospeccion/${id}/mover-a-contacto`)
      toast.success('Movido al Pipeline CRM → Contactado')
      invalidate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al mover el prospecto')
    }
  }

  const handleDescartar = async (id, empresa) => {
    if (!confirm(`¿Descartar "${empresa}"?`)) return
    try {
      await api.patch(`/prospeccion/${id}/descartar`)
      toast.success('Prospecto descartado')
      invalidate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al descartar')
    }
  }

  const toggleNota = (id) => setExpandedNotas(prev => ({ ...prev, [id]: !prev[id] }))
  const totalActivos = stats?.total_activos ?? data.length

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const registros = await parseExcel(file)
      if (!registros.length) { toast.error('No se detectaron filas válidas en el Excel'); return }
      setPreview({ registros })
    } catch {
      toast.error('Error al leer el archivo Excel')
    }
  }

  const FormularioProspecto = ({ titulo, datos, setDatos, onSubmit, isPending, onCancelar }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="rmg-card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg">{titulo}</h2>
          <button onClick={onCancelar} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          {/* RUT + DV */}
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>RUT</label>
            <input className="rmg-input" placeholder="76461668" value={datos.rut || ''} onChange={e => setDatos(p => ({ ...p, rut: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>DV</label>
            <input className="rmg-input" placeholder="5" maxLength={1} value={datos.dv || ''} onChange={e => setDatos(p => ({ ...p, dv: e.target.value }))} />
          </div>
          {/* Razón Social */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Razón Social *</label>
            <input className="rmg-input" required value={datos.empresa || ''} onChange={e => setDatos(p => ({ ...p, empresa: e.target.value }))} />
          </div>
          {/* Dirección + Comuna */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Dirección</label>
            <input className="rmg-input" value={datos.direccion || ''} onChange={e => setDatos(p => ({ ...p, direccion: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Comuna</label>
            <input className="rmg-input" value={datos.comuna || ''} onChange={e => setDatos(p => ({ ...p, comuna: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Ciudad</label>
            <input className="rmg-input" value={datos.ciudad || ''} onChange={e => setDatos(p => ({ ...p, ciudad: e.target.value }))} />
          </div>
          {/* Teléfono + Celular */}
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Teléfono</label>
            <input className="rmg-input" value={datos.telefono_contacto || ''} onChange={e => setDatos(p => ({ ...p, telefono_contacto: e.target.value, telefono_empresa: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Celular</label>
            <input className="rmg-input" value={datos.celular || ''} onChange={e => setDatos(p => ({ ...p, celular: e.target.value }))} />
          </div>
          {/* Email + Región */}
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Email</label>
            <input type="email" className="rmg-input" value={datos.email || ''} onChange={e => setDatos(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Región</label>
            <input className="rmg-input" value={datos.region || 'RM'} onChange={e => setDatos(p => ({ ...p, region: e.target.value }))} />
          </div>
          {/* Rubro + Segmento */}
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Rubro</label>
            <input className="rmg-input" placeholder="FABRICACION E INDUSTRIA"
              value={datos.rubro || ''}
              onChange={e => setDatos(p => ({ ...p, rubro: e.target.value, segmento: inferirSegmento(e.target.value) }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Segmento (inferido)</label>
            <select className="rmg-input" value={datos.segmento || 'flota'} onChange={e => setDatos(p => ({ ...p, segmento: e.target.value }))}>
              {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Botones */}
          <div className="col-span-2 flex gap-3 justify-end pt-2">
            <button type="button" onClick={onCancelar} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-50">
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Prospección</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Pipeline de prospectos activos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isLoading && (
            <span style={{ fontSize: 13, fontWeight: 700, padding: '5px 14px', borderRadius: 20, background: 'rgba(27,143,212,0.15)', color: 'var(--rmg-blue)', alignSelf: 'center' }}>
              {totalActivos} activos
            </span>
          )}
          <button onClick={() => descargarPlantilla()} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download size={13}/> Plantilla
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Upload size={13}/> Importar Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button onClick={() => { setForm(FORM_INIT); setShowForm(true) }} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={13}/> Nuevo prospecto
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="rmg-card p-3" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(90,143,168,0.6)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Buscar empresa, RUT, rubro, email, comuna…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ width: '100%', paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(56,182,255,0.15)', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.8)', outline: 'none' }} />
        </div>
        <FilterSelect value={segmentoFiltro} onChange={setSegmentoFiltro} options={segmentos} />
        <FilterSelect value={prioridadFiltro} onChange={setPrioridadFiltro} options={['Todas', 'alta', 'media', 'baja']} />
        <FilterSelect value={regionFiltro} onChange={setRegionFiltro} options={regiones} />
        {(busqueda || segmentoFiltro !== 'Todos' || prioridadFiltro !== 'Todas' || regionFiltro !== 'Todas') && (
          <button onClick={() => { setBusqueda(''); setSegmentoFiltro('Todos'); setPrioridadFiltro('Todas'); setRegionFiltro('Todas') }}
            style={{ fontSize: 12, color: 'rgba(90,143,168,0.7)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '0.5px solid rgba(56,182,255,0.15)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              <th className="px-3 py-3 w-8" style={{ borderBottom: '0.5px solid rgba(56,182,255,0.1)' }}>
                <input type="checkbox"
                  checked={selectedIds.size === filtrados.length && filtrados.length > 0}
                  onChange={toggleAll}
                  style={{ accentColor: 'var(--rmg-blt)', cursor: 'pointer' }}
                />
              </th>
              {TABLE_HEADERS.map(h => (
                <th key={h} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 500, color: 'rgba(90,143,168,0.7)', textAlign: 'left', borderBottom: '0.5px solid rgba(56,182,255,0.1)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : filtrados.length === 0
                ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '56px 24px', textAlign: 'center' }}>
                      <div style={{ color: 'rgba(90,143,168,0.5)', fontSize: 14 }}>Sin prospectos activos</div>
                      <div style={{ color: 'rgba(90,143,168,0.35)', fontSize: 12, marginTop: 6 }}>
                        {busqueda || segmentoFiltro !== 'Todos' || prioridadFiltro !== 'Todas' || regionFiltro !== 'Todas'
                          ? 'Intenta ajustar los filtros de búsqueda.'
                          : 'Agrega prospectos o importa desde Excel.'}
                      </div>
                    </td>
                  </tr>
                )
                : filtrados.map(p => (
                  <tr key={p.id} style={{ borderBottom: '0.5px solid rgba(56,182,255,0.07)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {/* Checkbox */}
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        style={{ accentColor: 'var(--rmg-blt)', cursor: 'pointer' }}
                      />
                    </td>
                    {/* RUT */}
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                      {p.rut ? `${p.rut}${p.dv ? `-${p.dv}` : ''}` : <span style={{ color: 'rgba(90,143,168,0.35)' }}>—</span>}
                    </td>
                    {/* Razón Social + segmento */}
                    <td style={{ padding: '11px 12px', minWidth: 160 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{p.empresa || '—'}</div>
                      <SegmentoBadge segmento={p.segmento} />
                    </td>
                    {/* Rubro */}
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'rgba(255,255,255,0.55)', minWidth: 120 }}>
                      {p.rubro || p.rubro_especialidad || <span style={{ color: 'rgba(90,143,168,0.35)' }}>—</span>}
                    </td>
                    {/* Comuna */}
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'rgba(255,255,255,0.65)', minWidth: 100 }}>
                      {p.comuna || <span style={{ color: 'rgba(90,143,168,0.35)' }}>—</span>}
                    </td>
                    {/* Email */}
                    <td style={{ padding: '11px 12px', fontSize: 12, minWidth: 160 }}>
                      {p.email
                        ? <a href={`mailto:${p.email}`} style={{ color: 'rgba(56,182,255,0.75)', textDecoration: 'none' }}>{p.email}</a>
                        : <span style={{ color: 'rgba(90,143,168,0.35)' }}>—</span>}
                    </td>
                    {/* Teléfono + Celular + WA */}
                    <td style={{ padding: '11px 12px', minWidth: 130 }}>
                      {(() => {
                        const phone = p.telefono_contacto || p.telefono_empresa
                        const cell  = p.celular
                        const waUrl = toWaLink(cell || phone)
                        if (!phone && !cell) return <span style={{ color: 'rgba(90,143,168,0.35)', fontSize: 12 }}>—</span>
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {phone && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{phone}</span>}
                            {cell && cell !== phone && <span style={{ fontSize: 11, color: 'rgba(90,143,168,0.7)' }}>{cell}</span>}
                            {waUrl && <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2dc98a', fontSize: 11, marginTop: 2 }}><MessageCircle size={12} /> WhatsApp</a>}
                          </div>
                        )
                      })()}
                    </td>
                    {/* Campaña */}
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      {p.campana_nombre
                        ? <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>{p.campana_nombre}</span>
                        : <span style={{ color: 'rgba(90,143,168,0.35)', fontSize: 12 }}>—</span>}
                    </td>
                    {/* Acciones */}
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button title="Editar" onClick={() => setEditando({ ...p })}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                          <Pencil size={13} />
                        </button>
                        <button title="Mover a Contacto" onClick={() => handleMoverAContacto(p.id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'rgba(27,143,212,0.12)', border: '0.5px solid rgba(27,143,212,0.25)', color: 'var(--rmg-blue)', cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,143,212,0.22)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(27,143,212,0.12)'}>
                          <UserCheck size={14} />
                        </button>
                        <button title="Descartar" onClick={() => handleDescartar(p.id, p.empresa)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'rgba(224,90,78,0.1)', border: '0.5px solid rgba(224,90,78,0.2)', color: '#e05a4e', cursor: 'pointer', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(224,90,78,0.2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(224,90,78,0.1)'}>
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

      {!isLoading && filtrados.length > 0 && (
        <div style={{ fontSize: 12, color: 'rgba(90,143,168,0.5)', textAlign: 'right' }}>
          {filtrados.length} prospecto{filtrados.length !== 1 ? 's' : ''}{filtrados.length !== data.length && ` de ${data.length}`}
        </div>
      )}

      {/* ── Modal: crear prospecto ── */}
      {showForm && (
        <FormularioProspecto
          titulo="Nuevo prospecto"
          datos={form}
          setDatos={setForm}
          onSubmit={e => { e.preventDefault(); crearMut.mutate(form) }}
          isPending={crearMut.isPending}
          onCancelar={() => { setShowForm(false); setForm(FORM_INIT) }}
        />
      )}

      {/* ── Modal: editar prospecto ── */}
      {editando && (
        <FormularioProspecto
          titulo={`Editar · ${editando.empresa}`}
          datos={editando}
          setDatos={setEditando}
          onSubmit={e => { e.preventDefault(); editarMut.mutate({ id: editando.id, data: editando }) }}
          isPending={editarMut.isPending}
          onCancelar={() => setEditando(null)}
        />
      )}

      {/* ── Floating action bar: multi-select ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl animate-fade-in"
          style={{ background: 'rgba(7,21,40,0.97)', border: '1px solid rgba(56,182,255,0.3)', backdropFilter: 'blur(8px)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--rmg-blt)' }}>
            {selectedIds.size} seleccionados
          </span>
          <button
            onClick={() => setShowAsignarCampana(true)}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <Megaphone size={13}/> Asignar campaña
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ color: 'var(--rmg-muted)' }}>
            <X size={16}/>
          </button>
        </div>
      )}

      {/* ── Modal: Asignar campaña ── */}
      {showAsignarCampana && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Asignar campaña</h2>
              <button onClick={() => setShowAsignarCampana(false)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--rmg-muted)' }}>
              Asignar campaña a <strong style={{ color: 'var(--rmg-off)' }}>{selectedIds.size} prospectos</strong>
            </p>
            <select className="rmg-input mb-4" id="campana-select">
              <option value="">— Seleccionar campaña —</option>
              {campanas.map(c => (
                <option key={c.id} value={c.id} data-nombre={c.nombre}>{c.nombre} · {c.rubro}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAsignarCampana(false)} className="btn-secondary">Cancelar</button>
              <button
                className="btn-primary"
                disabled={asignarMut.isPending}
                onClick={() => {
                  const sel = document.getElementById('campana-select')
                  const campana_id = sel.value
                  const campana_nombre = sel.options[sel.selectedIndex]?.text?.split(' · ')[0]
                  if (!campana_id) { toast.error('Selecciona una campaña'); return }
                  asignarMut.mutate({ ids: Array.from(selectedIds), campana_id, campana_nombre })
                }}
              >
                {asignarMut.isPending ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: preview Excel ── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rmg-card p-6 w-full max-w-4xl max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg">Preview de importación</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
                  <span className="font-bold" style={{ color: 'var(--rmg-teal)' }}>{preview.registros.length}</span> prospectos detectados — revisa antes de confirmar
                </p>
              </div>
              <button onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="overflow-auto flex-1 mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(56,182,255,0.1)' }}>
                    {['RUT', 'Razón Social', 'Rubro', 'Comuna', 'Teléfono', 'Celular', 'Email', 'Segmento'].map(h => (
                      <th key={h} className="text-left px-3 py-2 uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.registros.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{r.rut ? `${r.rut}-${r.dv || ''}` : '—'}</td>
                      <td className="px-3 py-2 font-semibold" style={{ color: 'var(--rmg-off)' }}>{r.empresa}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{r.rubro || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{r.comuna || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{r.telefono_contacto || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{r.celular || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{r.email || '—'}</td>
                      <td className="px-3 py-2"><SegmentoBadge segmento={r.segmento} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }} className="btn-secondary">Cancelar</button>
              <button
                onClick={() => importarMut.mutate(preview.registros)}
                disabled={importarMut.isPending}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <Check size={14}/>
                {importarMut.isPending ? 'Importando...' : `Confirmar importación (${preview.registros.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
