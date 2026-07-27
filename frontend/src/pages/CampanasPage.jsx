/**
 * RMG Auto Parts — Campañas
 * Gestión de campañas de marketing con generación IA (ZARA)
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import toast from 'react-hot-toast'
import { Plus, Sparkles, Save, Eye, Pencil, Trash2, X, Megaphone, Loader2 } from 'lucide-react'

// ─── constants ────────────────────────────────────────────────────────────────

const TIPOS = ['Prospección', 'Seguimiento', 'Reactivación']
const SEGMENTOS = ['Talleres', 'Flotas', 'Construcción', 'Industria', 'Minería', 'Agrícola', 'Concesionarios']
const RUBROS = [
  'CONSTRUCCION', 'FABRICACION E INDUSTRIA', 'MINERA', 'AGRICOLA',
  'TRANSPORTE', 'FLOTA BUSES', 'AGROINDUSTRIA', 'MAQUINAS AGRICOLAS',
  'IMPORTADORES', 'RENTAL EQUIPOS',
]
const CANALES = ['WhatsApp', 'Email', 'Llamada', 'Visita']

const ESTADO_STYLE = {
  activa:   { color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.12)' },
  pausada:  { color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)' },
  borrador: { color: 'rgba(90,143,168,0.9)', bg: 'rgba(90,143,168,0.12)' },
  finalizada: { color: 'var(--rmg-muted)', bg: 'rgba(90,143,168,0.08)' },
}

const CANAL_STYLE = {
  WhatsApp: { color: '#25d366', bg: 'rgba(45,201,138,0.12)' },
  Email:    { color: 'var(--rmg-blt)',    bg: 'rgba(56,182,255,0.12)' },
  Llamada:  { color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)' },
  Visita:   { color: '#a78bfa',           bg: 'rgba(167,139,250,0.12)' },
}

const FORM_INIT = {
  nombre: '',
  tipo: 'Prospección',
  segmento: 'Talleres',
  rubro: 'CONSTRUCCION',
  canal: 'WhatsApp',
  contexto_adicional: '',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function EstadoBadge({ value }) {
  const st = ESTADO_STYLE[value] || ESTADO_STYLE.borrador
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, textTransform: 'capitalize', color: st.color, background: st.bg }}>
      {value || 'borrador'}
    </span>
  )
}

function CanalBadge({ value }) {
  const st = CANAL_STYLE[value] || { color: 'var(--rmg-muted)', bg: 'rgba(90,143,168,0.1)' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, color: st.color, background: st.bg }}>
      {value}
    </span>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CampanasPage() {
  const qc = useQueryClient()

  // form state
  const [form, setForm]                   = useState(FORM_INIT)
  const [mensajeGenerado, setMensajeGenerado] = useState('')
  const [generando, setGenerando]         = useState(false)

  // modal state
  const [verMensaje, setVerMensaje]       = useState(null)  // { nombre, mensaje_editado }
  const [editModal, setEditModal]         = useState(null)  // campana object

  // ── data ────────────────────────────────────────────────────────────────────
  const { data: campanas = [], isLoading } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => api.get('/campanas').then(r => r.data),
  })

  // ── mutations ────────────────────────────────────────────────────────────────
  const crearMut = useMutation({
    mutationFn: (d) => api.post('/campanas', d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Campaña guardada correctamente')
      setForm(FORM_INIT)
      setMensajeGenerado('')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al guardar campaña'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/campanas/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Campaña eliminada')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar campaña'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data: d }) => api.put(`/campanas/${id}`, d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Campaña actualizada')
      setEditModal(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar campaña'),
  })

  // ── handlers ─────────────────────────────────────────────────────────────────
  const handleGenerar = async () => {
    if (!form.segmento || !form.rubro || !form.canal || !form.tipo) {
      toast.error('Completa Tipo, Segmento, Rubro y Canal antes de generar')
      return
    }
    setGenerando(true)
    try {
      const res = await api.post('/campanas/generar', {
        segmento: form.segmento,
        rubro: form.rubro,
        canal: form.canal,
        tipo_campana: form.tipo,
        contexto_adicional: form.contexto_adicional,
      })
      setMensajeGenerado(res.data?.mensaje || '')
      toast.success('Mensaje generado por ZARA')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al generar mensaje')
    } finally {
      setGenerando(false)
    }
  }

  const handleGuardar = () => {
    if (!form.nombre.trim()) { toast.error('El nombre de la campaña es requerido'); return }
    if (!mensajeGenerado.trim()) { toast.error('Genera o escribe un mensaje antes de guardar'); return }
    crearMut.mutate({
      nombre: form.nombre,
      tipo: form.tipo,
      segmento: form.segmento,
      rubro: form.rubro,
      canal: form.canal,
      mensaje_editado: mensajeGenerado,
    })
  }

  const handleEliminar = (c) => {
    if (!confirm(`¿Eliminar la campaña "${c.nombre}"?`)) return
    eliminarMut.mutate(c.id)
  }

  const fld = (key) => (val) => setForm(p => ({ ...p, [key]: val }))

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-black flex items-center gap-2" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
          <Megaphone size={22} style={{ color: 'var(--rmg-blt)' }} />
          Campañas
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
          Crea campañas de prospección y seguimiento asistidas por ZARA
        </p>
      </div>

      {/* ── Nueva campaña ── */}
      <div className="rmg-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Plus size={15} style={{ color: 'var(--rmg-blt)' }} />
          <span className="font-bold text-sm" style={{ color: 'var(--rmg-off)' }}>Nueva campaña</span>
        </div>

        {/* Row 1: Nombre + Tipo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
              Nombre *
            </label>
            <input
              className="rmg-input"
              placeholder="Ej. Campaña Talleres RM Julio"
              value={form.nombre}
              onChange={e => fld('nombre')(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
              Tipo
            </label>
            <select className="rmg-input" value={form.tipo} onChange={e => fld('tipo')(e.target.value)}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: Segmento + Rubro + Canal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
              Segmento
            </label>
            <select className="rmg-input" value={form.segmento} onChange={e => fld('segmento')(e.target.value)}>
              {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
              Rubro
            </label>
            <select className="rmg-input" value={form.rubro} onChange={e => fld('rubro')(e.target.value)}>
              {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
              Canal
            </label>
            <select className="rmg-input" value={form.canal} onChange={e => fld('canal')(e.target.value)}>
              {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Contexto adicional */}
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
            Contexto adicional <span style={{ color: 'rgba(90,143,168,0.5)', fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
          </label>
          <textarea
            className="rmg-input"
            rows={2}
            placeholder="Ej. Enfocarse en oferta de fin de mes, descuento del 10%..."
            value={form.contexto_adicional}
            onChange={e => fld('contexto_adicional')(e.target.value)}
          />
        </div>

        {/* Generar button */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleGenerar}
            disabled={generando}
            className="btn-primary flex items-center gap-2"
            style={{ background: generando ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.25)', border: '1px solid rgba(167,139,250,0.4)', color: '#a78bfa' }}
          >
            {generando
              ? <><Loader2 size={14} className="animate-spin" /> ZARA está generando...</>
              : <><Sparkles size={14} /> Generar con ZARA</>
            }
          </button>
          {mensajeGenerado && (
            <span className="text-xs" style={{ color: 'var(--rmg-teal)' }}>
              ✓ Mensaje generado — puedes editarlo abajo
            </span>
          )}
        </div>

        {/* Generated message textarea */}
        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
            Mensaje generado <span style={{ color: 'rgba(90,143,168,0.5)', fontWeight: 400, textTransform: 'none' }}>(editable)</span>
          </label>
          <textarea
            className="rmg-input"
            rows={5}
            placeholder="El mensaje generado por ZARA aparecerá aquí. Puedes editarlo antes de guardar."
            value={mensajeGenerado}
            onChange={e => setMensajeGenerado(e.target.value)}
          />
        </div>

        {/* Guardar button */}
        <div className="flex justify-end">
          <button
            onClick={handleGuardar}
            disabled={crearMut.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {crearMut.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
              : <><Save size={14} /> Guardar campaña</>
            }
          </button>
        </div>
      </div>

      {/* ── Lista de campañas ── */}
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
          <span className="font-bold text-sm" style={{ color: 'var(--rmg-off)' }}>
            Campañas activas
            {!isLoading && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--rmg-muted)' }}>
                ({campanas.length})
              </span>
            )}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Nombre', 'Tipo', 'Segmento', 'Rubro', 'Canal', 'Estado', 'Prospectos', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left" style={{ fontSize: 11, fontWeight: 500, color: 'rgba(90,143,168,0.7)', borderBottom: '0.5px solid rgba(56,182,255,0.1)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div style={{ height: 13, borderRadius: 6, background: 'rgba(255,255,255,0.05)', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
                : campanas.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <Megaphone size={28} style={{ color: 'rgba(90,143,168,0.25)', margin: '0 auto 10px' }} />
                        <div style={{ color: 'rgba(90,143,168,0.5)', fontSize: 14 }}>Sin campañas aún</div>
                        <div style={{ color: 'rgba(90,143,168,0.35)', fontSize: 12, marginTop: 4 }}>
                          Crea tu primera campaña usando el formulario superior
                        </div>
                      </td>
                    </tr>
                  )
                  : campanas.map(c => (
                    <tr key={c.id}
                      style={{ borderBottom: '0.5px solid rgba(56,182,255,0.07)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Nombre */}
                      <td className="px-4 py-3" style={{ minWidth: 160 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{c.nombre}</div>
                      </td>
                      {/* Tipo */}
                      <td className="px-4 py-3" style={{ fontSize: 12, color: 'var(--rmg-muted)' }}>{c.tipo || '—'}</td>
                      {/* Segmento */}
                      <td className="px-4 py-3" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{c.segmento || '—'}</td>
                      {/* Rubro */}
                      <td className="px-4 py-3" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', maxWidth: 140 }}>{c.rubro || '—'}</td>
                      {/* Canal */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <CanalBadge value={c.canal} />
                      </td>
                      {/* Estado */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <EstadoBadge value={c.estado} />
                      </td>
                      {/* Prospectos */}
                      <td className="px-4 py-3 text-center" style={{ fontSize: 13, color: 'var(--rmg-blt)', fontWeight: 600 }}>
                        {c.total_prospectos ?? 0}
                      </td>
                      {/* Acciones */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div style={{ display: 'flex', gap: 5 }}>
                          {/* Ver mensaje */}
                          <button
                            title="Ver mensaje"
                            onClick={() => setVerMensaje(c)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'rgba(56,182,255,0.1)', border: '0.5px solid rgba(56,182,255,0.2)', color: 'var(--rmg-blt)', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,182,255,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(56,182,255,0.1)'}
                          >
                            <Eye size={13} />
                          </button>
                          {/* Editar */}
                          <button
                            title="Editar"
                            onClick={() => setEditModal({ ...c })}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                          >
                            <Pencil size={13} />
                          </button>
                          {/* Eliminar */}
                          <button
                            title="Eliminar"
                            onClick={() => handleEliminar(c)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'rgba(224,90,78,0.1)', border: '0.5px solid rgba(224,90,78,0.2)', color: '#e05a4e', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(224,90,78,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(224,90,78,0.1)'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Ver mensaje ── */}
      {verMensaje && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rmg-card p-6 w-full max-w-lg animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">{verMensaje.nombre}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <CanalBadge value={verMensaje.canal} />
                  <EstadoBadge value={verMensaje.estado} />
                </div>
              </div>
              <button onClick={() => setVerMensaje(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="p-4 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(56,182,255,0.1)', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 80 }}>
              {verMensaje.mensaje_editado || <span style={{ color: 'var(--rmg-muted)' }}>Sin mensaje guardado</span>}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setVerMensaje(null)} className="btn-secondary">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar campaña ── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Editar campaña</h2>
              <button onClick={() => setEditModal(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Nombre</label>
                <input
                  className="rmg-input"
                  value={editModal.nombre || ''}
                  onChange={e => setEditModal(p => ({ ...p, nombre: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select
                  className="rmg-input"
                  value={editModal.estado || 'borrador'}
                  onChange={e => setEditModal(p => ({ ...p, estado: e.target.value }))}
                >
                  {['borrador', 'activa', 'pausada', 'finalizada'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Mensaje</label>
                <textarea
                  className="rmg-input"
                  rows={5}
                  value={editModal.mensaje_editado || ''}
                  onChange={e => setEditModal(p => ({ ...p, mensaje_editado: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setEditModal(null)} className="btn-secondary">Cancelar</button>
              <button
                disabled={editarMut.isPending}
                className="btn-primary flex items-center gap-2"
                onClick={() => editarMut.mutate({ id: editModal.id, data: { nombre: editModal.nombre, estado: editModal.estado, mensaje_editado: editModal.mensaje_editado } })}
              >
                {editarMut.isPending ? <><Loader2 size={13} className="animate-spin" /> Guardando...</> : <><Save size={13} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
