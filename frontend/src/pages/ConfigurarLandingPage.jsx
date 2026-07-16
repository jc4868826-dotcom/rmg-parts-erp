import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { LayoutTemplate, Plus, X, Check, Pencil, Trash2, Image } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Constantes ───────────────────────────────────────────
const FAMILIAS = ['NEUMATICOS', 'BATERIAS', 'LUBRICANTES']

const API_BASE = import.meta.env.VITE_API_URL || 'https://rmg-parts-erp.onrender.com'

// foto_path ya no se usa — las fotos sirven desde la DB vía este endpoint
const FOTO_URL = (tabla, id) =>
  id != null ? `${API_BASE}/api/public/landing/foto/${tabla}/${id}` : null

// ─── Componentes auxiliares ───────────────────────────────
const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
      style={{ color: 'var(--rmg-muted)' }}>{label}</label>
    {children}
  </div>
)

const ActiveBadge = ({ activo }) => (
  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
    style={activo
      ? { background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }
      : { background: 'rgba(255,255,255,0.06)', color: 'var(--rmg-muted)' }}>
    {activo ? 'Sí' : 'No'}
  </span>
)

const Thumbnail = ({ src, size = 40 }) => src
  ? <img src={src} alt="foto" className="rounded object-cover flex-shrink-0"
      style={{ width: size, height: size }} />
  : <div className="rounded flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: 'rgba(255,255,255,0.06)' }}>
      <Image size={size * 0.45} style={{ color: 'var(--rmg-muted)' }} />
    </div>

const TH = ({ children }) => (
  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold"
    style={{ color: 'var(--rmg-muted)' }}>{children}</th>
)

const TR = ({ children }) => (
  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{children}</tr>
)

const TD = ({ children, className = '' }) => (
  <td className={`px-4 py-3 text-sm ${className}`}>{children}</td>
)

const ActionBtn = ({ onClick, icon: Icon, color, title }) => (
  <button onClick={onClick} title={title}
    className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
    style={{ color }}>
    <Icon size={14} />
  </button>
)

// ─── Tab Subfamilias ──────────────────────────────────────
function TabSubfamilias({ subfamilias = [], isLoading }) {
  const qc = useQueryClient()
  const fotoRef = useRef(null)

  const FORM_INIT = { familia: 'NEUMATICOS', nombre: '', descripcion: '', orden: 0, activo: true }
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(FORM_INIT)
  const [imgVer, setImgVer] = useState(Date.now())

  const setF = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const invalidate = () => qc.invalidateQueries(['landing-subfamilias'])

  const createMut = useMutation({
    mutationFn: (fd) => api.post('/admin/landing/subfamilias', fd).then(r => r.data),
    onSuccess: () => { invalidate(); resetForm(); toast.success('Subfamilia creada') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al crear subfamilia'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, fd }) => api.put(`/admin/landing/subfamilias/${id}`, fd).then(r => r.data),
    onSuccess: () => { invalidate(); setImgVer(Date.now()); resetForm(); toast.success('Subfamilia actualizada') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al actualizar subfamilia'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/landing/subfamilias/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Subfamilia eliminada') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar subfamilia'),
  })

  const resetForm = () => { setForm(FORM_INIT); setEditId(null); setShowForm(false); if (fotoRef.current) fotoRef.current.value = '' }

  const handleEdit = (sf) => {
    setForm({ familia: sf.familia || 'NEUMATICOS', nombre: sf.nombre || '', descripcion: sf.descripcion || '', orden: sf.orden ?? 0, activo: !!sf.activo })
    setEditId(sf.id)
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    const fd = new FormData()
    fd.append('familia', form.familia)
    fd.append('nombre', form.nombre)
    fd.append('descripcion', form.descripcion)
    fd.append('orden', form.orden)
    fd.append('activo', form.activo ? '1' : '0')
    if (fotoRef.current?.files[0]) fd.append('foto', fotoRef.current.files[0])
    if (editId) updateMut.mutate({ id: editId, fd })
    else createMut.mutate(fd)
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <div className="rmg-card overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex justify-between items-center"
          style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
          <div className="flex items-center gap-2">
            <span className="font-bold">Subfamilias</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
              {subfamilias.length}
            </span>
          </div>
          <button onClick={() => { resetForm(); setShowForm(v => !v) }}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {showForm && !editId ? <X size={13} /> : <Plus size={13} />}
            {showForm && !editId ? 'Cancelar' : 'Nueva subfamilia'}
          </button>
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="px-5 py-4 border-b space-y-3"
            style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(56,182,255,0.04)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold" style={{ color: 'var(--rmg-blt)' }}>
                {editId ? 'Editar subfamilia' : 'Nueva subfamilia'}
              </span>
              {editId && (
                <button onClick={resetForm} className="p-1 rounded hover:bg-white/5"
                  style={{ color: 'var(--rmg-muted)' }}><X size={14} /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Familia">
                <select className="rmg-input" value={form.familia} onChange={setF('familia')}>
                  {FAMILIAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Nombre *">
                <input className="rmg-input" placeholder="Ej. Neumáticos 4x4" value={form.nombre} onChange={setF('nombre')} />
              </Field>
              <Field label="Descripción">
                <textarea className="rmg-input" rows={2} placeholder="Descripción breve" value={form.descripcion} onChange={setF('descripcion')} />
              </Field>
              <div className="space-y-3">
                <Field label="Orden">
                  <input type="number" className="rmg-input" value={form.orden} onChange={setF('orden')} />
                </Field>
                <Field label="Foto (JPG/PNG/WebP, máx 50MB)">
                  <input type="file" className="rmg-input" accept="image/*" ref={fotoRef} />
                </Field>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--rmg-off)' }}>
              <input type="checkbox" checked={form.activo} onChange={setF('activo')} className="w-4 h-4 rounded" />
              Activo
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSubmit} disabled={isPending}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <Check size={14} />{isPending ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
              </button>
              <button onClick={resetForm} className="btn-secondary flex items-center gap-2">
                <X size={14} />Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tabla */}
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                <TH>ID</TH><TH>Familia</TH><TH>Nombre</TH><TH>Foto</TH><TH>Orden</TH><TH>Activo</TH><TH></TH>
              </tr>
            </thead>
            <tbody>
              {subfamilias.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin registros</td></tr>
              ) : subfamilias.map(sf => (
                <TR key={sf.id}>
                  <TD><span style={{ color: 'var(--rmg-muted)' }}>#{sf.id}</span></TD>
                  <TD><span className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)' }}>{sf.familia}</span></TD>
                  <TD><span style={{ color: 'var(--rmg-off)' }}>{sf.nombre}</span></TD>
                  <TD><Thumbnail src={sf.foto_mimetype ? `${FOTO_URL('subfamilias', sf.id)}?t=${imgVer}` : null} size={40} /></TD>
                  <TD style={{ color: 'var(--rmg-muted)' }}>{sf.orden}</TD>
                  <TD><ActiveBadge activo={sf.activo} /></TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <ActionBtn onClick={() => handleEdit(sf)} icon={Pencil} color="var(--rmg-blt)" title="Editar" />
                      <ActionBtn onClick={() => { if (!confirm('¿Eliminar?')) return; deleteMut.mutate(sf.id) }}
                        icon={Trash2} color="var(--rmg-red, #ef4444)" title="Eliminar" />
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Tab Productos ────────────────────────────────────────
function TabProductos({ productos = [], subfamilias = [], isLoading }) {
  const qc = useQueryClient()
  const fotoRef = useRef(null)

  const FORM_INIT = {
    familia: 'NEUMATICOS', subfamilia_id: '', subfamilia: '',
    codigo: '', marca: '', descripcion: '', um: '', presentacion: '',
    precio: '', detalles_tecnicos: '', orden: 0, activo: true,
  }
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(FORM_INIT)

  const setF = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // Subfamilias filtradas por familia seleccionada
  const sfFiltradas = subfamilias.filter(sf => sf.familia === form.familia)

  const handleSubfamiliaIdChange = (e) => {
    const id = e.target.value
    const sf = subfamilias.find(s => String(s.id) === String(id))
    setForm(p => ({ ...p, subfamilia_id: id, subfamilia: sf ? sf.nombre : p.subfamilia }))
  }

  const handleFamiliaChange = (e) => {
    setForm(p => ({ ...p, familia: e.target.value, subfamilia_id: '', subfamilia: '' }))
  }

  const invalidate = () => qc.invalidateQueries(['landing-productos'])

  const createMut = useMutation({
    mutationFn: (fd) => api.post('/admin/landing/productos', fd).then(r => r.data),
    onSuccess: () => { invalidate(); resetForm(); toast.success('Producto creado') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al crear producto'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, fd }) => api.put(`/admin/landing/productos/${id}`, fd).then(r => r.data),
    onSuccess: () => { invalidate(); resetForm(); toast.success('Producto actualizado') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al actualizar producto'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/landing/productos/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Producto eliminado') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar producto'),
  })

  const resetForm = () => { setForm(FORM_INIT); setEditId(null); setShowForm(false); if (fotoRef.current) fotoRef.current.value = '' }

  const handleEdit = (p) => {
    setForm({
      familia: p.familia || 'NEUMATICOS',
      subfamilia_id: p.subfamilia_id ?? '',
      subfamilia: p.subfamilia || '',
      codigo: p.codigo || '',
      marca: p.marca || '',
      descripcion: p.descripcion || '',
      um: p.um || '',
      presentacion: p.presentacion || '',
      precio: p.precio ?? '',
      detalles_tecnicos: p.detalles_tecnicos || '',
      orden: p.orden ?? 0,
      activo: !!p.activo,
    })
    setEditId(p.id)
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!form.descripcion.trim()) { toast.error('La descripción es obligatoria'); return }
    const fd = new FormData()
    fd.append('familia', form.familia)
    fd.append('subfamilia_id', form.subfamilia_id)
    fd.append('subfamilia', form.subfamilia)
    fd.append('codigo', form.codigo)
    fd.append('marca', form.marca)
    fd.append('descripcion', form.descripcion)
    fd.append('um', form.um)
    fd.append('presentacion', form.presentacion)
    fd.append('precio', form.precio)
    fd.append('detalles_tecnicos', form.detalles_tecnicos)
    fd.append('orden', form.orden)
    fd.append('activo', form.activo ? '1' : '0')
    if (fotoRef.current?.files[0]) fd.append('foto', fotoRef.current.files[0])
    if (editId) updateMut.mutate({ id: editId, fd })
    else createMut.mutate(fd)
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex justify-between items-center"
          style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
          <div className="flex items-center gap-2">
            <span className="font-bold">Productos</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
              {productos.length}
            </span>
          </div>
          <button onClick={() => { resetForm(); setShowForm(v => !v) }}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {showForm && !editId ? <X size={13} /> : <Plus size={13} />}
            {showForm && !editId ? 'Cancelar' : 'Nuevo producto'}
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b space-y-3"
            style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(56,182,255,0.04)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold" style={{ color: 'var(--rmg-blt)' }}>
                {editId ? 'Editar producto' : 'Nuevo producto'}
              </span>
              {editId && (
                <button onClick={resetForm} className="p-1 rounded hover:bg-white/5"
                  style={{ color: 'var(--rmg-muted)' }}><X size={14} /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Familia">
                <select className="rmg-input" value={form.familia} onChange={handleFamiliaChange}>
                  {FAMILIAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Subfamilia">
                <select className="rmg-input" value={form.subfamilia_id} onChange={handleSubfamiliaIdChange}>
                  <option value="">— Seleccionar —</option>
                  {sfFiltradas.map(sf => <option key={sf.id} value={sf.id}>{sf.nombre}</option>)}
                </select>
              </Field>
              <Field label="Subfamilia (texto)">
                <input className="rmg-input" placeholder="Nombre de subfamilia" value={form.subfamilia}
                  onChange={setF('subfamilia')} />
              </Field>
              <Field label="Código">
                <input className="rmg-input" placeholder="Ej. NEU-001" value={form.codigo} onChange={setF('codigo')} />
              </Field>
              <Field label="Marca">
                <input className="rmg-input" placeholder="Ej. Bridgestone" value={form.marca} onChange={setF('marca')} />
              </Field>
              <Field label="Descripción *">
                <input className="rmg-input" placeholder="Descripción del producto" value={form.descripcion} onChange={setF('descripcion')} />
              </Field>
              <Field label="UM">
                <input className="rmg-input" placeholder="Ej. unidad, litro" value={form.um} onChange={setF('um')} />
              </Field>
              <Field label="Presentación">
                <input className="rmg-input" placeholder="Ej. 4 unidades" value={form.presentacion} onChange={setF('presentacion')} />
              </Field>
              <Field label="Precio">
                <input type="number" className="rmg-input" placeholder="0" value={form.precio} onChange={setF('precio')} />
              </Field>
              <Field label="Orden">
                <input type="number" className="rmg-input" value={form.orden} onChange={setF('orden')} />
              </Field>
              <Field label="Detalles técnicos">
                <textarea className="rmg-input" rows={2} value={form.detalles_tecnicos} onChange={setF('detalles_tecnicos')} />
              </Field>
              <Field label="Foto (JPG/PNG/WebP, máx 50MB)">
                <input type="file" className="rmg-input" accept="image/*" ref={fotoRef} />
              </Field>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--rmg-off)' }}>
              <input type="checkbox" checked={form.activo} onChange={setF('activo')} className="w-4 h-4 rounded" />
              Activo
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSubmit} disabled={isPending}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <Check size={14} />{isPending ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
              </button>
              <button onClick={resetForm} className="btn-secondary flex items-center gap-2">
                <X size={14} />Cancelar
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <TH>ID</TH><TH>Familia</TH><TH>Subfamilia</TH><TH>Código</TH>
                  <TH>Marca</TH><TH>Descripción</TH><TH>Precio</TH><TH>Activo</TH><TH></TH>
                </tr>
              </thead>
              <tbody>
                {productos.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin registros</td></tr>
                ) : productos.map(p => (
                  <TR key={p.id}>
                    <TD><span style={{ color: 'var(--rmg-muted)' }}>#{p.id}</span></TD>
                    <TD><span className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)' }}>{p.familia}</span></TD>
                    <TD><span style={{ color: 'var(--rmg-muted)' }}>{p.subfamilia || '—'}</span></TD>
                    <TD><span className="font-mono text-xs" style={{ color: 'var(--rmg-off)' }}>{p.codigo || '—'}</span></TD>
                    <TD style={{ color: 'var(--rmg-off)' }}>{p.marca || '—'}</TD>
                    <TD style={{ color: 'var(--rmg-off)', maxWidth: 200 }}>
                      <span title={p.descripcion}>
                        {p.descripcion?.length > 40 ? p.descripcion.slice(0, 40) + '…' : p.descripcion}
                      </span>
                    </TD>
                    <TD style={{ color: 'var(--rmg-teal)' }}>
                      {p.precio != null ? `$${Number(p.precio).toLocaleString('es-CL')}` : '—'}
                    </TD>
                    <TD><ActiveBadge activo={p.activo} /></TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        <ActionBtn onClick={() => handleEdit(p)} icon={Pencil} color="var(--rmg-blt)" title="Editar" />
                        <ActionBtn onClick={() => { if (!confirm('¿Eliminar?')) return; deleteMut.mutate(p.id) }}
                          icon={Trash2} color="var(--rmg-red, #ef4444)" title="Eliminar" />
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab Familias ─────────────────────────────────────────
const FAM_META = {
  NEUMATICOS:  { label: 'Neumáticos',  icon: '🛞' },
  BATERIAS:    { label: 'Baterías',    icon: '🔋' },
  LUBRICANTES: { label: 'Lubricantes', icon: '🛢️' },
}
const FAM_KEYS = ['NEUMATICOS', 'BATERIAS', 'LUBRICANTES']

function TabFamilias({ familias = [], isLoading }) {
  const qc = useQueryClient()
  const refNeu = useRef(null)
  const refBat = useRef(null)
  const refLub = useRef(null)
  const fotoRefs = { NEUMATICOS: refNeu, BATERIAS: refBat, LUBRICANTES: refLub }

  const [state, setState] = useState({})
  const [imgVer, setImgVer] = useState(Date.now())

  const uploadFoto = async (famKey) => {
    const file = fotoRefs[famKey].current?.files[0]
    if (!file) { toast.error('Selecciona una imagen primero'); return }
    setState(p => ({ ...p, [famKey]: 'loading' }))
    try {
      const fd = new FormData()
      fd.append('foto', file)
      await api.put(`/admin/landing/familias/${famKey}`, fd)
      qc.invalidateQueries(['landing-familias'])
      setImgVer(Date.now())
      setState(p => ({ ...p, [famKey]: 'ok' }))
      toast.success(`Foto de ${FAM_META[famKey].label} guardada`)
      setTimeout(() => setState(p => ({ ...p, [famKey]: null })), 3000)
    } catch (err) {
      setState(p => ({ ...p, [famKey]: 'error' }))
      toast.error(err.response?.data?.error || 'Error al guardar foto')
    }
    if (fotoRefs[famKey].current) fotoRefs[famKey].current.value = ''
  }

  if (isLoading) return <div className="py-12 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {FAM_KEYS.map(famKey => {
        const meta    = FAM_META[famKey]
        const fam     = familias.find(f => f.familia === famKey)
        const hasFoto = !!fam?.foto_mimetype
        const s       = state[famKey]
        return (
          <div key={famKey} className="rmg-card rounded-xl overflow-hidden">
            <div className="flex items-center justify-center"
              style={{ height: 140, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', position: 'relative' }}>
              {hasFoto
                ? <img src={`${FOTO_URL('familias', famKey)}?t=${imgVer}`} alt={meta.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                : <span style={{ fontSize: 52 }}>{meta.icon}</span>
              }
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="font-bold">{meta.icon} {meta.label}</div>
              <input type="file" accept="image/*" ref={fotoRefs[famKey]} className="rmg-input text-xs" />
              <button onClick={() => uploadFoto(famKey)} disabled={s === 'loading'}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                <Check size={13} />
                {s === 'loading' ? 'Guardando...' : s === 'ok' ? 'Foto guardada ✓' : 'Guardar foto'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab Banners ──────────────────────────────────────────
function TabBanners({ banners = [], isLoading }) {
  const qc       = useQueryClient()
  const newRef   = useRef(null)
  const [adding, setAdding] = useState(false)

  const createMut = useMutation({
    mutationFn: (fd) => api.post('/admin/landing/banners', fd).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['landing-banners']); if (newRef.current) newRef.current.value = ''; setAdding(false); toast.success('Banner añadido') },
    onError: (err) => { setAdding(false); toast.error(err.response?.data?.error || 'Error al crear banner') },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/landing/banners/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['landing-banners']); toast.success('Banner eliminado') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar banner'),
  })

  const handleAdd = () => {
    const file = newRef.current?.files[0]
    if (!file) { toast.error('Selecciona una imagen'); return }
    setAdding(true)
    const fd = new FormData()
    fd.append('foto', file)
    fd.append('orden', banners.length)
    fd.append('activo', '1')
    createMut.mutate(fd)
  }

  return (
    <div className="space-y-4">
      {/* Upload nuevo banner */}
      <div className="rmg-card px-5 py-4 space-y-3">
        <div className="text-sm font-semibold" style={{ color: 'var(--rmg-off)' }}>Añadir nuevo banner</div>
        <div className="flex gap-3 items-center">
          <input type="file" accept="image/*" ref={newRef} className="rmg-input text-xs flex-1" />
          <button onClick={handleAdd} disabled={adding}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 whitespace-nowrap">
            <Plus size={13} />{adding ? 'Subiendo...' : 'Subir banner'}
          </button>
        </div>
      </div>

      {/* Lista de banners */}
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-2"
          style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
          <span className="font-bold text-sm">Banners activos</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
            {banners.length}
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando...</div>
        ) : banners.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Sin banners en la DB — la landing usa las fotos estáticas del repo como fallback
          </div>
        ) : (
          <div className="grid gap-3 p-4 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', maxHeight: 560 }}>
            {banners.map((b, i) => (
              <div key={b.id} className="rounded-xl overflow-hidden border"
                style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
                <div style={{ height: 120, background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={FOTO_URL('banners', b.id)} alt={`Banner ${i + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                </div>
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>#{b.id} · orden {b.orden}</span>
                  <ActionBtn onClick={() => { if (!confirm('¿Eliminar banner?')) return; deleteMut.mutate(b.id) }}
                    icon={Trash2} color="var(--rmg-red, #ef4444)" title="Eliminar" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────
export default function ConfigurarLandingPage() {
  const [tab, setTab] = useState('familias')

  const TABS = [
    { k: 'familias',    l: 'Familias',    Icon: LayoutTemplate },
    { k: 'subfamilias', l: 'Subfamilias', Icon: LayoutTemplate },
    { k: 'productos',   l: 'Productos',   Icon: LayoutTemplate },
    { k: 'banners',     l: 'Banners',     Icon: LayoutTemplate },
  ]

  const { data: familias = [], isLoading: loadingFam } = useQuery({
    queryKey: ['landing-familias'],
    queryFn: () => api.get('/admin/landing/familias').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: subfamilias = [], isLoading: loadingSF } = useQuery({
    queryKey: ['landing-subfamilias'],
    queryFn: () => api.get('/admin/landing/subfamilias').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: productos = [], isLoading: loadingProd } = useQuery({
    queryKey: ['landing-productos'],
    queryFn: () => api.get('/admin/landing/productos').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: banners = [], isLoading: loadingBanners } = useQuery({
    queryKey: ['landing-banners'],
    queryFn: () => api.get('/admin/landing/banners').then(r => r.data),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-5 animate-fade-in max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
          Configurar Landing
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
          Gestiona subfamilias, productos y banners del sitio web
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {TABS.map(({ k, l, Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2"
            style={tab === k
              ? { borderColor: 'var(--rmg-blue)', color: 'var(--rmg-blt)' }
              : { borderColor: 'transparent', color: 'var(--rmg-muted)' }
            }>
            <Icon size={15} />{l}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'familias'    && <TabFamilias familias={familias} isLoading={loadingFam} />}
      {tab === 'subfamilias' && <TabSubfamilias subfamilias={subfamilias} isLoading={loadingSF} />}
      {tab === 'productos'   && <TabProductos productos={productos} subfamilias={subfamilias} isLoading={loadingProd} />}
      {tab === 'banners'     && <TabBanners banners={banners} isLoading={loadingBanners} />}
    </div>
  )
}
