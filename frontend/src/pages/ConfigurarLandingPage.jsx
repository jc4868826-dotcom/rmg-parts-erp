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
    nombre: '', subtitulo: '', contenido: '', hasFoto: false, orden: 0, activo: true,
    sae: '', tipo: '', aplicaciones: '', beneficios: '', presentaciones: '', ficha_tecnica_url: '', compatibilidad: '',
  }
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(FORM_INIT)
  const [imgVer, setImgVer] = useState(Date.now())

  const setF = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

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
    onSuccess: () => { invalidate(); resetForm(); toast.success('Bloque creado') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al crear bloque'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, fd }) => api.put(`/admin/landing/productos/${id}`, fd).then(r => r.data),
    onSuccess: () => { invalidate(); setImgVer(Date.now()); resetForm(); toast.success('Bloque actualizado') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al actualizar bloque'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/landing/productos/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Bloque eliminado') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar bloque'),
  })

  const resetForm = () => { setForm(FORM_INIT); setEditId(null); setShowForm(false); if (fotoRef.current) fotoRef.current.value = '' }

  const handleEdit = (p) => {
    setForm({
      familia: p.familia || 'NEUMATICOS',
      subfamilia_id: p.subfamilia_id ?? '',
      subfamilia: p.subfamilia || '',
      nombre: p.nombre || '',
      subtitulo: p.subtitulo || '',
      contenido: p.contenido || '',
      hasFoto: !!p.foto_mimetype,
      orden: p.orden ?? 0,
      activo: !!p.activo,
      sae: p.sae || '',
      tipo: p.tipo || '',
      aplicaciones: p.aplicaciones || '',
      beneficios: p.beneficios || '',
      presentaciones: p.presentaciones || '',
      ficha_tecnica_url: p.ficha_tecnica_url || '',
      compatibilidad: p.compatibilidad || '',
    })
    setEditId(p.id)
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    const fd = new FormData()
    fd.append('familia', form.familia)
    fd.append('subfamilia_id', form.subfamilia_id)
    fd.append('subfamilia', form.subfamilia)
    fd.append('nombre', form.nombre)
    fd.append('subtitulo', form.subtitulo)
    fd.append('contenido', form.contenido)
    fd.append('sae', form.sae)
    fd.append('tipo', form.tipo)
    fd.append('aplicaciones', form.aplicaciones)
    fd.append('beneficios', form.beneficios)
    fd.append('presentaciones', form.presentaciones)
    fd.append('ficha_tecnica_url', form.ficha_tecnica_url)
    fd.append('compatibilidad', form.compatibilidad)
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
            <span className="font-bold">Bloques de contenido</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
              {productos.length}
            </span>
          </div>
          <button onClick={() => { resetForm(); setShowForm(v => !v) }}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {showForm && !editId ? <X size={13} /> : <Plus size={13} />}
            {showForm && !editId ? 'Cancelar' : 'Nuevo bloque'}
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b space-y-3"
            style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(56,182,255,0.04)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold" style={{ color: 'var(--rmg-blt)' }}>
                {editId ? 'Editar bloque' : 'Nuevo bloque de contenido'}
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
              <Field label="Nombre *">
                <input className="rmg-input" placeholder="Título del bloque" value={form.nombre} onChange={setF('nombre')} />
              </Field>
              <Field label="Subtítulo">
                <input className="rmg-input" placeholder="Subtítulo breve (opcional)" value={form.subtitulo} onChange={setF('subtitulo')} />
              </Field>
              <Field label="Orden">
                <input type="number" className="rmg-input" value={form.orden} onChange={setF('orden')} />
              </Field>
              <div className="space-y-3">
                {editId && form.hasFoto && (
                  <div>
                    <Thumbnail src={`${FOTO_URL('productos', editId)}?t=${imgVer}`} size={56} />
                  </div>
                )}
                <Field label="Foto (JPG/PNG/WebP, máx 50MB)">
                  <input type="file" className="rmg-input" accept="image/jpeg,image/png,image/webp" ref={fotoRef} />
                </Field>
              </div>
            </div>
            <Field label="Descripción / Specs (una línea por ítem, ✓ para beneficios)">
              <textarea className="rmg-input" rows={5}
                placeholder="Cada línea aparece como una fila en la tarjeta. Líneas con ✓ aparecen como pills."
                value={form.contenido} onChange={setF('contenido')} />
            </Field>
            <Field label="SAE (solo lubricantes)">
              <input className="rmg-input" placeholder="5W-30 / 5W-40" value={form.sae} onChange={setF('sae')} />
            </Field>
            <Field label="Tipo">
              <select className="rmg-input" value={form.tipo} onChange={setF('tipo')}>
                <option value="">— Sin especificar —</option>
                <option value="100% Sintético">100% Sintético</option>
                <option value="Sintético">Sintético</option>
                <option value="Semisintético">Semisintético</option>
                <option value="Mineral">Mineral</option>
                <option value="Premium">Premium</option>
              </select>
            </Field>
            <Field label="Presentaciones">
              <input className="rmg-input" placeholder="1L, 1 Gal, 5 Gal, 55 Gal" value={form.presentaciones} onChange={setF('presentaciones')} />
            </Field>
            <Field label="URL Ficha Técnica (PDF)">
              <input className="rmg-input" placeholder="https://..." value={form.ficha_tecnica_url} onChange={setF('ficha_tecnica_url')} />
            </Field>
            <Field label="Aplicaciones">
              <textarea className="rmg-input" rows={2}
                placeholder="Motores gasolina con inyección electrónica..."
                value={form.aplicaciones} onChange={setF('aplicaciones')} />
            </Field>
            <Field label="Beneficios (uno por línea — aparecen con ✓ en la ficha)">
              <textarea className="rmg-input" rows={3}
                placeholder="Mayor vida útil del motor&#10;Protección en arranques en frío&#10;Reduce el consumo de combustible"
                value={form.beneficios} onChange={setF('beneficios')} />
            </Field>
            <Field label="Compatibilidad">
              <textarea className="rmg-input" rows={2}
                placeholder="Toyota, Nissan, Hyundai..."
                value={form.compatibilidad} onChange={setF('compatibilidad')} />
            </Field>
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
                  <TH>ID</TH><TH>Familia</TH><TH>Subfamilia</TH><TH>Nombre</TH><TH>Foto</TH><TH>Descripción</TH><TH>Activo</TH><TH></TH>
                </tr>
              </thead>
              <tbody>
                {productos.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin registros</td></tr>
                ) : productos.map(p => (
                  <TR key={p.id}>
                    <TD><span style={{ color: 'var(--rmg-muted)' }}>#{p.id}</span></TD>
                    <TD><span className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)' }}>{p.familia}</span></TD>
                    <TD><span style={{ color: 'var(--rmg-muted)' }}>{p.subfamilia || '—'}</span></TD>
                    <TD style={{ color: 'var(--rmg-off)', fontWeight: 600 }}>{p.nombre || '—'}</TD>
                    <TD><Thumbnail src={p.foto_mimetype ? `${FOTO_URL('productos', p.id)}?t=${imgVer}` : null} size={40} /></TD>
                    <TD style={{ color: 'var(--rmg-muted)', maxWidth: 200 }}>
                      <span title={p.contenido || p.subtitulo}>
                        {(p.contenido || p.subtitulo || '').length > 50
                          ? (p.contenido || p.subtitulo || '').slice(0, 50) + '…'
                          : (p.contenido || p.subtitulo || '—')}
                      </span>
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
function TabFamilias({ familias = [], isLoading }) {
  const qc = useQueryClient()
  const fotoRef = useRef(null)

  const FORM_INIT = { familia: '', descripcion: '' }
  const [showForm, setShowForm] = useState(false)
  const [editKey, setEditKey] = useState(null)
  const [form, setForm] = useState(FORM_INIT)
  const [imgVer, setImgVer] = useState(Date.now())

  const setF = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const invalidate = () => qc.invalidateQueries(['landing-familias'])

  const createMut = useMutation({
    mutationFn: (fd) => api.post('/admin/landing/familias', fd).then(r => r.data),
    onSuccess: () => { invalidate(); resetForm(); toast.success('Familia creada') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al crear familia'),
  })

  const updateMut = useMutation({
    mutationFn: ({ key, fd }) => api.put(`/admin/landing/familias/${key}`, fd).then(r => r.data),
    onSuccess: () => { invalidate(); setImgVer(Date.now()); resetForm(); toast.success('Familia actualizada') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al actualizar familia'),
  })

  const deleteMut = useMutation({
    mutationFn: (key) => api.delete(`/admin/landing/familias/${key}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Familia eliminada') },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al eliminar familia'),
  })

  const resetForm = () => { setForm(FORM_INIT); setEditKey(null); setShowForm(false); if (fotoRef.current) fotoRef.current.value = '' }

  const handleEdit = (fam) => {
    setForm({ familia: fam.familia || '', descripcion: fam.descripcion || '' })
    setEditKey(fam.familia)
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!form.familia.trim()) { toast.error('El nombre de familia es obligatorio'); return }
    const fd = new FormData()
    if (!editKey) fd.append('familia', form.familia)
    fd.append('descripcion', form.descripcion)
    if (fotoRef.current?.files[0]) fd.append('foto', fotoRef.current.files[0])
    if (editKey) updateMut.mutate({ key: editKey, fd })
    else createMut.mutate(fd)
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-4">
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex justify-between items-center"
          style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
          <div className="flex items-center gap-2">
            <span className="font-bold">Familias</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>
              {familias.length}
            </span>
          </div>
          <button onClick={() => { resetForm(); setShowForm(v => !v) }}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {showForm && !editKey ? <X size={13} /> : <Plus size={13} />}
            {showForm && !editKey ? 'Cancelar' : 'Nueva familia'}
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b space-y-3"
            style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(56,182,255,0.04)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold" style={{ color: 'var(--rmg-blt)' }}>
                {editKey ? 'Editar familia' : 'Nueva familia'}
              </span>
              {editKey && (
                <button onClick={resetForm} className="p-1 rounded hover:bg-white/5"
                  style={{ color: 'var(--rmg-muted)' }}><X size={14} /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre (clave) *">
                <input className="rmg-input" placeholder="Ej. ACCESORIOS" value={form.familia}
                  onChange={setF('familia')} disabled={!!editKey}
                  style={editKey ? { opacity: 0.5 } : {}} />
              </Field>
              <Field label="Descripción">
                <textarea className="rmg-input" rows={2} placeholder="Descripción breve"
                  value={form.descripcion} onChange={setF('descripcion')} />
              </Field>
              <Field label="Foto (JPG/PNG/WebP, máx 50MB)">
                <input type="file" className="rmg-input" accept="image/*" ref={fotoRef} />
              </Field>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSubmit} disabled={isPending}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <Check size={14} />{isPending ? 'Guardando...' : editKey ? 'Actualizar' : 'Crear'}
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
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                <TH>Familia</TH><TH>Descripción</TH><TH>Foto</TH><TH></TH>
              </tr>
            </thead>
            <tbody>
              {familias.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin registros</td></tr>
              ) : familias.map(fam => (
                <TR key={fam.familia}>
                  <TD><span className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)' }}>{fam.familia}</span></TD>
                  <TD><span style={{ color: 'var(--rmg-off)' }}>{fam.descripcion || '—'}</span></TD>
                  <TD><Thumbnail src={fam.foto_mimetype ? `${FOTO_URL('familias', fam.familia)}?t=${imgVer}` : null} size={40} /></TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <ActionBtn onClick={() => handleEdit(fam)} icon={Pencil} color="var(--rmg-blt)" title="Editar" />
                      <ActionBtn onClick={() => { if (!confirm('¿Eliminar familia? Las subfamilias asociadas quedarán sin familia padre.')) return; deleteMut.mutate(fam.familia) }}
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
