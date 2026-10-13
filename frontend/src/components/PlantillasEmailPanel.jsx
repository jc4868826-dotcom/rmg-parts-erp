import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { FileText, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Plantillas de correo para prospección (2026-10-13, pedido de JC).
 *
 * Se usan al enviar correo desde la ficha de un prospecto (selector de
 * plantilla → precarga asunto/cuerpo, editable antes de enviar). Acá se
 * crean, editan y borran. {{empresa}} y {{contacto}} se reemplazan al
 * elegir la plantilla en la ficha del prospecto.
 */
const SEGMENTOS = ['Industria', 'Construcción', 'Agrícola', 'Taller', 'Flotas', 'Minería']
const FORM_INIT = { nombre: '', segmento: '', asunto: '', cuerpo: '' }

function PlantillaForm({ inicial, onCancelar, onGuardar, isPending }) {
  const [form, setForm] = useState(inicial || FORM_INIT)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <form onSubmit={e => { e.preventDefault(); onGuardar(form) }} className="rmg-card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Nombre</label>
          <input required className="rmg-input mt-1" value={form.nombre} onChange={set('nombre')} placeholder="Ej: Industrias y fábricas" />
        </div>
        <div>
          <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Segmento (opcional)</label>
          <select className="rmg-input mt-1" value={form.segmento || ''} onChange={set('segmento')}>
            <option value="">— Sin asignar —</option>
            {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Asunto</label>
        <input required className="rmg-input mt-1" value={form.asunto} onChange={set('asunto')} />
      </div>
      <div>
        <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Cuerpo</label>
        <textarea required rows={10} className="rmg-input mt-1" value={form.cuerpo} onChange={set('cuerpo')} />
        <p className="text-[11px] mt-1" style={{ color: 'var(--rmg-muted)' }}>
          Usa <code>{'{{empresa}}'}</code> y <code>{'{{contacto}}'}</code> — se reemplazan automáticamente al elegir la plantilla.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button type="submit" disabled={isPending} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
          <Check size={14}/> {isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

export default function PlantillasEmailPanel() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)

  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['plantillas-email'],
    queryFn: () => api.get('/plantillas-email').then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['plantillas-email'] })

  const crearMut = useMutation({
    mutationFn: (d) => api.post('/plantillas-email', d).then(r => r.data),
    onSuccess: () => { toast.success('Plantilla creada'); setShowForm(false); invalidate() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear la plantilla'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/plantillas-email/${id}`, data).then(r => r.data),
    onSuccess: () => { toast.success('Plantilla actualizada'); setEditando(null); invalidate() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar'),
  })

  const borrarMut = useMutation({
    mutationFn: (id) => api.delete(`/plantillas-email/${id}`).then(r => r.data),
    onSuccess: () => { toast.success('Plantilla eliminada'); invalidate() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  })

  const handleEliminar = (p) => {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return
    borrarMut.mutate(p.id)
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileText size={18} style={{ color: 'var(--rmg-blue)', marginTop: 2 }} />
          <div>
            <h3 className="text-sm font-bold">Plantillas de correo</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
              Se eligen al enviar correo desde la ficha de un prospecto. Edítalas aquí para todos.
            </p>
          </div>
        </div>
        {!showForm && !editando && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-1.5 flex-shrink-0">
            <Plus size={14}/> Nueva plantilla
          </button>
        )}
      </div>

      {showForm && (
        <PlantillaForm
          onCancelar={() => setShowForm(false)}
          onGuardar={(d) => crearMut.mutate(d)}
          isPending={crearMut.isPending}
        />
      )}

      {editando && (
        <PlantillaForm
          inicial={editando}
          onCancelar={() => setEditando(null)}
          onGuardar={(d) => editarMut.mutate({ id: editando.id, data: d })}
          isPending={editarMut.isPending}
        />
      )}

      {isLoading ? (
        <div className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>
      ) : plantillas.length === 0 && !showForm ? (
        <div className="rmg-card p-8 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin plantillas todavía</div>
      ) : (
        <div className="space-y-2.5">
          {plantillas.map(p => (
            <div key={p.id} className="rmg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{p.nombre}</span>
                    {p.segmento && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(90,143,168,0.12)', color: 'rgba(90,143,168,0.9)' }}>
                        {p.segmento}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{p.asunto}</div>
                  <div className="text-xs mt-1.5 whitespace-pre-wrap line-clamp-2" style={{ color: 'var(--rmg-off)', maxHeight: 36, overflow: 'hidden' }}>
                    {p.cuerpo}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => { setEditando(p); setShowForm(false) }} title="Editar"
                    className="p-1.5 rounded hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}>
                    <Pencil size={14}/>
                  </button>
                  <button onClick={() => handleEliminar(p)} title="Eliminar"
                    className="p-1.5 rounded hover:bg-black/5" style={{ color: '#e05a4e' }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
