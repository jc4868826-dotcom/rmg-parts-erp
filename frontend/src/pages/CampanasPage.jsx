/**
 * RMG Parts — Campañas
 * Gestión de campañas de marketing con generación IA (ZARA)
 * + tracking de apertura de email + panel de detalle + acciones por prospecto
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import toast from 'react-hot-toast'
import { Plus, Sparkles, Save, Eye, Pencil, Trash2, X, Megaphone, Loader2, Rocket, ChevronRight, RefreshCw, CheckCircle2, XCircle, ExternalLink, Mail } from 'lucide-react'

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
  activa:     { color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.12)' },
  pausada:    { color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)' },
  borrador:   { color: 'rgba(90,143,168,0.9)', bg: 'rgba(90,143,168,0.12)' },
  finalizada: { color: 'var(--rmg-muted)', bg: 'rgba(90,143,168,0.08)' },
}

const CANAL_STYLE = {
  WhatsApp: { color: '#25d366', bg: 'rgba(45,201,138,0.12)' },
  Email:    { color: 'var(--rmg-blt)',    bg: 'rgba(56,182,255,0.12)' },
  Llamada:  { color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)' },
  Visita:   { color: '#a78bfa',           bg: 'rgba(167,139,250,0.12)' },
}

const LEAD_ESTADO_STYLE = {
  'Sin enviar':   { color: 'rgba(90,143,168,0.7)',  bg: 'rgba(90,143,168,0.1)'  },
  'Enviado':      { color: 'var(--rmg-blt)',         bg: 'rgba(56,182,255,0.1)'  },
  'Abrió':        { color: '#29AAE1',                bg: 'rgba(41,170,225,0.15)' },
  'Respondió':    { color: 'var(--rmg-teal)',        bg: 'rgba(45,201,138,0.15)' },
  'respondio':    { color: 'var(--rmg-teal)',        bg: 'rgba(45,201,138,0.15)' },
  'Sin respuesta': { color: '#e05a4e',               bg: 'rgba(224,90,78,0.1)'  },
  'sin_respuesta': { color: '#e05a4e',               bg: 'rgba(224,90,78,0.1)'  },
}

const FILTROS_LEAD = ['Todos', 'Abrieron', 'Respondieron', 'Sin respuesta', 'Sin enviar']

const FORM_INIT = {
  nombre: '', tipo: 'Prospección', segmento: 'Talleres',
  rubro: 'CONSTRUCCION', canal: 'WhatsApp',
  contexto_adicional: '', asunto: '', firma: '',
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

function LeadEstadoBadge({ value }) {
  const st = LEAD_ESTADO_STYLE[value] || LEAD_ESTADO_STYLE['Sin enviar']
  const label = value === 'respondio' ? 'Respondió' : value === 'sin_respuesta' ? 'Sin respuesta' : (value || 'Sin enviar')
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, color: st.color, background: st.bg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, minWidth: 100, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(56,182,255,0.1)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'rgba(255,255,255,0.9)', fontFamily: 'Inter Tight, sans-serif', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--rmg-muted)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: color || 'var(--rmg-muted)', fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ─── Panel Detalle de Campaña ─────────────────────────────────────────────────

function PanelDetalle({ campana, onClose }) {
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState('Todos')

  const { data: resumen, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['campana-resumen', campana.id],
    queryFn: () => api.get(`/campanas/${campana.id}/resumen`).then(r => r.data),
    staleTime: 30000,
    retry: 1,
  })

  const estadoMut = useMutation({
    mutationFn: ({ pid, estado }) => api.patch(`/campanas/${campana.id}/prospecto/${pid}/estado`, { estado }).then(r => r.data),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['campanas'] }) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar estado'),
  })

  const reenviarMut = useMutation({
    mutationFn: (pid) => api.post(`/campanas/${campana.id}/prospecto/${pid}/reenviar`).then(r => r.data),
    onSuccess: () => { toast.success('Email reenviado'); refetch() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al reenviar'),
  })

  const prospectos = resumen?.prospectos || []
  const prospectosFiltrados = prospectos.filter(p => {
    if (filtro === 'Todos') return true
    if (filtro === 'Abrieron') return p.email_abierto
    if (filtro === 'Respondieron') return p.estado_lead === 'Respondió' || p.estado_lead === 'respondio'
    if (filtro === 'Sin respuesta') return p.estado_lead === 'Sin respuesta' || p.estado_lead === 'sin_respuesta'
    if (filtro === 'Sin enviar') return !p.estado_lead || p.estado_lead === 'Sin enviar'
    return true
  })

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(780px, 100vw)', zIndex: 60,
      background: 'var(--rmg-card, #0f1923)', borderLeft: '0.5px solid rgba(56,182,255,0.15)',
      display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '0.5px solid rgba(56,182,255,0.1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Megaphone size={16} style={{ color: 'var(--rmg-blt)' }} />
              <span style={{ fontWeight: 700, fontSize: 16, color: 'rgba(255,255,255,0.92)' }}>{campana.nombre}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <EstadoBadge value={campana.estado} />
              <CanalBadge value={campana.canal} />
              {campana.segmento && <span style={{ fontSize: 11, color: 'var(--rmg-muted)' }}>{campana.segmento}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--rmg-muted)', cursor: 'pointer', padding: 4, background: 'none', border: 'none', marginTop: -2 }}>
            <X size={18} />
          </button>
        </div>

        {/* KPI Cards */}
        {resumen && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <KpiCard label="Enviados" value={resumen.total_enviados} color="#435664" />
            <KpiCard label="Abrieron" value={resumen.total_abiertos} sub={`${resumen.tasa_apertura}% apertura`} color="#29AAE1" />
            <KpiCard label="Respondieron" value={resumen.total_respondidos} sub={`${resumen.tasa_respuesta}% respuesta`} color="var(--rmg-teal)" />
            <KpiCard label="Sin respuesta" value={resumen.total_enviados - resumen.total_respondidos - resumen.total_abiertos < 0 ? 0 : resumen.total_enviados - resumen.total_respondidos} color="#e05a4e" />
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ padding: '10px 24px', borderBottom: '0.5px solid rgba(56,182,255,0.07)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        {FILTROS_LEAD.map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
              background: filtro === f ? 'rgba(41,170,225,0.2)' : 'rgba(255,255,255,0.04)',
              border: filtro === f ? '0.5px solid #29AAE1' : '0.5px solid rgba(255,255,255,0.1)',
              color: filtro === f ? '#29AAE1' : 'var(--rmg-muted)',
            }}
          >
            {f}
            {f !== 'Todos' && prospectos.length > 0 && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                ({prospectos.filter(p => {
                  if (f === 'Abrieron') return p.email_abierto
                  if (f === 'Respondieron') return p.estado_lead === 'Respondió' || p.estado_lead === 'respondio'
                  if (f === 'Sin respuesta') return p.estado_lead === 'Sin respuesta' || p.estado_lead === 'sin_respuesta'
                  if (f === 'Sin enviar') return !p.estado_lead || p.estado_lead === 'Sin enviar'
                  return true
                }).length})
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => refetch()}
          style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: 'var(--rmg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <RefreshCw size={10} /> Actualizar
        </button>
      </div>

      {/* Tabla prospectos */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--rmg-muted)' }}>
            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13 }}>Cargando prospectos...</div>
          </div>
        ) : isError ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#e05a4e', marginBottom: 8 }}>Error al cargar prospectos</div>
            <div style={{ fontSize: 11, color: 'var(--rmg-muted)', marginBottom: 16 }}>{error?.response?.data?.error || error?.message || 'Error desconocido'}</div>
            <button onClick={() => refetch()} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 7, background: 'rgba(56,182,255,0.1)', border: '0.5px solid rgba(56,182,255,0.3)', color: 'var(--rmg-blt)', cursor: 'pointer' }}>
              Reintentar
            </button>
          </div>
        ) : prospectosFiltrados.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--rmg-muted)', fontSize: 13 }}>
            Sin prospectos en este filtro
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--rmg-card, #0f1923)', zIndex: 1 }}>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['Empresa', 'Email', 'Estado', 'Aperturas', 'Fecha apertura', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'rgba(90,143,168,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid rgba(56,182,255,0.1)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prospectosFiltrados.map(p => (
                <tr key={p.id}
                  style={{ borderBottom: '0.5px solid rgba(56,182,255,0.05)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', minWidth: 140 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{p.empresa || '—'}</div>
                    {p.nombre && <div style={{ fontSize: 11, color: 'var(--rmg-muted)', marginTop: 1 }}>{p.nombre}</div>}
                    {p.rubro && <div style={{ fontSize: 10, color: 'rgba(90,143,168,0.5)', marginTop: 1 }}>{p.rubro}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,0.55)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.email || <span style={{ color: 'rgba(224,90,78,0.6)' }}>Sin email</span>}
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <LeadEstadoBadge value={p.estado_lead} />
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12 }}>
                    {p.veces_abierto > 0
                      ? <span style={{ color: '#29AAE1', fontWeight: 700 }}>{p.veces_abierto}×</span>
                      : <span style={{ color: 'rgba(90,143,168,0.4)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--rmg-muted)', whiteSpace: 'nowrap' }}>
                    {p.fecha_apertura
                      ? new Date(p.fecha_apertura).toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
                      : '—'
                    }
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {/* Reenviar */}
                      <button
                        title="Reenviar email"
                        disabled={reenviarMut.isPending || !p.email}
                        onClick={() => reenviarMut.mutate(p.id)}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:6, background:'rgba(56,182,255,0.1)', border:'0.5px solid rgba(56,182,255,0.2)', color:'var(--rmg-blt)', cursor: p.email ? 'pointer' : 'not-allowed', opacity: p.email ? 1 : 0.4 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,182,255,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(56,182,255,0.1)'}
                      >
                        <Mail size={12} />
                      </button>
                      {/* Marcar respondió */}
                      <button
                        title="Marcar como Respondió"
                        onClick={() => estadoMut.mutate({ pid: p.id, estado: 'Respondió' })}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:6, background:'rgba(45,201,138,0.1)', border:'0.5px solid rgba(45,201,138,0.2)', color:'var(--rmg-teal)', cursor:'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(45,201,138,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(45,201,138,0.1)'}
                      >
                        <CheckCircle2 size={12} />
                      </button>
                      {/* Sin respuesta */}
                      <button
                        title="Marcar Sin respuesta"
                        onClick={() => estadoMut.mutate({ pid: p.id, estado: 'Sin respuesta' })}
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:6, background:'rgba(224,90,78,0.1)', border:'0.5px solid rgba(224,90,78,0.2)', color:'#e05a4e', cursor:'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(224,90,78,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(224,90,78,0.1)'}
                      >
                        <XCircle size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CampanasPage() {
  const qc = useQueryClient()

  const [form, setForm]                   = useState(FORM_INIT)
  const [mensajeGenerado, setMensajeGenerado] = useState('')
  const [generando, setGenerando]         = useState(false)
  const [verMensaje, setVerMensaje]       = useState(null)
  const [editModal, setEditModal]         = useState(null)
  const [lanzarResult, setLanzarResult]   = useState({})
  const [panelDetalle, setPanelDetalle]   = useState(null)  // campana seleccionada

  const { data: campanas = [], isLoading } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => api.get('/campanas').then(r => r.data),
  })

  const crearMut = useMutation({
    mutationFn: (d) => api.post('/campanas', d).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Campaña guardada correctamente')
      setForm(FORM_INIT); setMensajeGenerado('')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al guardar campaña'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/campanas/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas'] }); toast.success('Campaña eliminada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar campaña'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data: d }) => api.put(`/campanas/${id}`, d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas'] }); toast.success('Campaña actualizada'); setEditModal(null) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar campaña'),
  })

  const lanzarMut = useMutation({
    mutationFn: (id) => api.post(`/campanas/${id}/lanzar`).then(r => r.data),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      qc.invalidateQueries({ queryKey: ['prospeccion'] })
      setLanzarResult(prev => ({ ...prev, [id]: res }))
      if (res.enviados > 0) toast.success(`${res.enviados} emails enviados correctamente`)
      else toast(res.mensaje || 'Sin prospectos pendientes de envío')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al lanzar campaña'),
  })

  const handleGenerar = async () => {
    if (!form.segmento || !form.rubro || !form.canal || !form.tipo) {
      toast.error('Completa Tipo, Segmento, Rubro y Canal antes de generar'); return
    }
    setGenerando(true)
    try {
      const res = await api.post('/campanas/generar', {
        segmento: form.segmento, rubro: form.rubro, canal: form.canal,
        tipo_campana: form.tipo, contexto_adicional: form.contexto_adicional,
      })
      setMensajeGenerado(res.data?.mensaje || '')
      toast.success('Mensaje generado por ZARA')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al generar mensaje')
    } finally { setGenerando(false) }
  }

  const handleGuardar = () => {
    if (!form.nombre.trim()) { toast.error('El nombre de la campaña es requerido'); return }
    if (!mensajeGenerado.trim()) { toast.error('Genera o escribe un mensaje antes de guardar'); return }
    crearMut.mutate({ nombre: form.nombre, tipo: form.tipo, segmento: form.segmento, rubro: form.rubro, canal: form.canal, mensaje_editado: mensajeGenerado, asunto: form.asunto || null, firma: form.firma || null })
  }

  const handleEliminar = (c) => {
    if (!confirm(`¿Eliminar la campaña "${c.nombre}"?`)) return
    eliminarMut.mutate(c.id)
  }

  const fld = (key) => (val) => setForm(p => ({ ...p, [key]: val }))

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Overlay oscuro cuando panel está abierto */}
      {panelDetalle && (
        <div
          onClick={() => setPanelDetalle(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 59 }}
        />
      )}

      {/* Panel detalle */}
      {panelDetalle && (
        <PanelDetalle campana={panelDetalle} onClose={() => setPanelDetalle(null)} />
      )}

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Nombre *</label>
            <input className="rmg-input" placeholder="Ej. Campaña Talleres RM Julio" value={form.nombre} onChange={e => fld('nombre')(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tipo</label>
            <select className="rmg-input" value={form.tipo} onChange={e => fld('tipo')(e.target.value)}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Segmento</label>
            <select className="rmg-input" value={form.segmento} onChange={e => fld('segmento')(e.target.value)}>
              {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Rubro</label>
            <select className="rmg-input" value={form.rubro} onChange={e => fld('rubro')(e.target.value)}>
              {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Canal</label>
            <select className="rmg-input" value={form.canal} onChange={e => fld('canal')(e.target.value)}>
              {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
            Contexto adicional <span style={{ color: 'rgba(90,143,168,0.5)', fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
          </label>
          <textarea className="rmg-input" rows={2} placeholder="Ej. Enfocarse en oferta de fin de mes, descuento del 10%..." value={form.contexto_adicional} onChange={e => fld('contexto_adicional')(e.target.value)} />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleGenerar} disabled={generando} className="btn-primary flex items-center gap-2"
            style={{ background: generando ? 'rgba(167,139,250,0.2)' : 'rgba(167,139,250,0.25)', border: '1px solid rgba(167,139,250,0.4)', color: '#a78bfa' }}>
            {generando ? <><Loader2 size={14} className="animate-spin" /> ZARA está generando...</> : <><Sparkles size={14} /> Generar con ZARA</>}
          </button>
          {mensajeGenerado && <span className="text-xs" style={{ color: 'var(--rmg-teal)' }}>✓ Mensaje generado — puedes editarlo abajo</span>}
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
            Asunto del email <span style={{ color: 'rgba(90,143,168,0.5)', fontWeight: 400, textTransform: 'none' }}>(para canal Email)</span>
          </label>
          <input className="rmg-input" placeholder="Ej: Soluciones de lubricación para su flota" value={form.asunto} onChange={e => fld('asunto')(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
            Mensaje generado <span style={{ color: 'rgba(90,143,168,0.5)', fontWeight: 400, textTransform: 'none' }}>(editable)</span>
          </label>
          <textarea className="rmg-input" rows={5} placeholder="El mensaje generado por ZARA aparecerá aquí. Puedes editarlo antes de guardar." value={mensajeGenerado} onChange={e => setMensajeGenerado(e.target.value)} />
          <p style={{ fontSize: 11, color: 'rgba(90,143,168,0.6)', marginTop: 5 }}>
            Usa <code style={{ background: 'rgba(56,182,255,0.1)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{'{{empresa}}'}</code>{' '}
            <code style={{ background: 'rgba(56,182,255,0.1)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{'{{nombre}}'}</code>{' '}
            <code style={{ background: 'rgba(56,182,255,0.1)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{'{{rubro}}'}</code>{' '}
            para personalizar por prospecto al enviar.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
            Firma <span style={{ color: 'rgba(90,143,168,0.5)', fontWeight: 400, textTransform: 'none' }}>(se agrega al final del mensaje)</span>
          </label>
          <textarea className="rmg-input" rows={3} placeholder={'Juan Carlos Contreras\nGerente Comercial\nRMG Parts\n+56 9 XXXX XXXX\nwww.rmgparts.cl'} value={form.firma} onChange={e => fld('firma')(e.target.value)} style={{ whiteSpace: 'pre-wrap' }} />
        </div>

        <div className="flex justify-end">
          <button onClick={handleGuardar} disabled={crearMut.isPending} className="btn-primary flex items-center gap-2">
            {crearMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Save size={14} /> Guardar campaña</>}
          </button>
        </div>
      </div>

      {/* ── Lista de campañas ── */}
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
          <span className="font-bold text-sm" style={{ color: 'var(--rmg-off)' }}>
            Campañas activas
            {!isLoading && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--rmg-muted)' }}>({campanas.length})</span>}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Nombre', 'Segmento / Rubro', 'Canal', 'Estado', 'Métricas', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left" style={{ fontSize: 11, fontWeight: 500, color: 'rgba(90,143,168,0.7)', borderBottom: '0.5px solid rgba(56,182,255,0.1)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div style={{ height: 13, borderRadius: 6, background: 'rgba(255,255,255,0.05)', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    </td>
                  ))}</tr>
                ))
                : campanas.length === 0
                  ? (
                    <tr><td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                      <Megaphone size={28} style={{ color: 'rgba(90,143,168,0.25)', margin: '0 auto 10px' }} />
                      <div style={{ color: 'rgba(90,143,168,0.5)', fontSize: 14 }}>Sin campañas aún</div>
                      <div style={{ color: 'rgba(90,143,168,0.35)', fontSize: 12, marginTop: 4 }}>Crea tu primera campaña usando el formulario superior</div>
                    </td></tr>
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
                        <div style={{ fontSize: 11, color: 'var(--rmg-muted)', marginTop: 1 }}>{c.tipo || '—'}</div>
                      </td>
                      {/* Segmento / Rubro */}
                      <td className="px-4 py-3">
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{c.segmento || '—'}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{c.rubro || '—'}</div>
                      </td>
                      {/* Canal */}
                      <td className="px-4 py-3 whitespace-nowrap"><CanalBadge value={c.canal} /></td>
                      {/* Estado */}
                      <td className="px-4 py-3 whitespace-nowrap"><EstadoBadge value={c.estado} /></td>
                      {/* Métricas inline */}
                      <td className="px-4 py-3" style={{ minWidth: 200 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#435664', background: 'rgba(67,86,100,0.15)', padding: '2px 7px', borderRadius: 12 }}>
                            Env: {c.enviados ?? 0}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#29AAE1', background: 'rgba(41,170,225,0.12)', padding: '2px 7px', borderRadius: 12 }}>
                            👁 {c.abiertos ?? 0}
                            {(c.enviados ?? 0) > 0 && ` (${Math.round(((c.abiertos ?? 0) / (c.enviados ?? 1)) * 100)}%)`}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--rmg-teal)', background: 'rgba(45,201,138,0.12)', padding: '2px 7px', borderRadius: 12 }}>
                            ✉ {c.respondidos ?? 0}
                          </span>
                          {lanzarResult[c.id] && (
                            <span style={{ color: 'var(--rmg-teal)', fontSize: 10 }}>✓ {lanzarResult[c.id].enviados} enviados</span>
                          )}
                        </div>
                      </td>
                      {/* Acciones */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div style={{ display: 'flex', gap: 5 }}>
                          {/* Ver detalle */}
                          <button
                            title="Ver detalle de campaña"
                            onClick={() => setPanelDetalle(c)}
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:7, background:'rgba(41,170,225,0.12)', border:'0.5px solid rgba(41,170,225,0.3)', color:'#29AAE1', cursor:'pointer', fontSize:11, fontWeight:600 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(41,170,225,0.22)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(41,170,225,0.12)'}
                          >
                            Ver detalle <ChevronRight size={11} />
                          </button>
                          {/* Lanzar */}
                          <button
                            title="Lanzar campaña (enviar emails)"
                            disabled={lanzarMut.isPending}
                            onClick={() => lanzarMut.mutate(c.id)}
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:7, background:'rgba(45,201,138,0.12)', border:'0.5px solid rgba(45,201,138,0.3)', color:'var(--rmg-teal)', cursor:'pointer', opacity: lanzarMut.isPending ? 0.5 : 1 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(45,201,138,0.25)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(45,201,138,0.12)'}
                          >
                            {lanzarMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                          </button>
                          {/* Ver mensaje */}
                          <button
                            title="Ver mensaje"
                            onClick={() => setVerMensaje(c)}
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:7, background:'rgba(56,182,255,0.1)', border:'0.5px solid rgba(56,182,255,0.2)', color:'var(--rmg-blt)', cursor:'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,182,255,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(56,182,255,0.1)'}
                          >
                            <Eye size={13} />
                          </button>
                          {/* Editar */}
                          <button
                            title="Editar"
                            onClick={() => setEditModal({ ...c })}
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:7, background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.5)', cursor:'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                          >
                            <Pencil size={13} />
                          </button>
                          {/* Eliminar */}
                          <button
                            title="Eliminar"
                            onClick={() => handleEliminar(c)}
                            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:7, background:'rgba(224,90,78,0.1)', border:'0.5px solid rgba(224,90,78,0.2)', color:'#e05a4e', cursor:'pointer' }}
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
                  <CanalBadge value={verMensaje.canal} /><EstadoBadge value={verMensaje.estado} />
                </div>
              </div>
              <button onClick={() => setVerMensaje(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            {verMensaje.asunto && (
              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--rmg-muted)' }}>Asunto</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{verMensaje.asunto}</div>
              </div>
            )}
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--rmg-muted)' }}>Mensaje</div>
              <div className="p-4 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(56,182,255,0.1)', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 80 }}>
                {verMensaje.mensaje_editado || <span style={{ color: 'var(--rmg-muted)' }}>Sin mensaje guardado</span>}
              </div>
            </div>
            {verMensaje.firma && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--rmg-muted)' }}>Firma</div>
                <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(56,182,255,0.07)', color: 'rgba(255,255,255,0.5)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {verMensaje.firma}
                </div>
              </div>
            )}
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
                <input className="rmg-input" value={editModal.nombre || ''} onChange={e => setEditModal(p => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={editModal.estado || 'borrador'} onChange={e => setEditModal(p => ({ ...p, estado: e.target.value }))}>
                  {['borrador', 'activa', 'pausada', 'finalizada'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Asunto del email</label>
                <input className="rmg-input" placeholder="Ej: Soluciones de lubricación para su flota" value={editModal.asunto || ''} onChange={e => setEditModal(p => ({ ...p, asunto: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Mensaje</label>
                <textarea className="rmg-input" rows={5} value={editModal.mensaje_editado || ''} onChange={e => setEditModal(p => ({ ...p, mensaje_editado: e.target.value }))} />
                <p style={{ fontSize: 11, color: 'rgba(90,143,168,0.6)', marginTop: 5 }}>
                  Usa <code style={{ background: 'rgba(56,182,255,0.1)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{'{{empresa}}'}</code>{' '}
                  <code style={{ background: 'rgba(56,182,255,0.1)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{'{{nombre}}'}</code>{' '}
                  <code style={{ background: 'rgba(56,182,255,0.1)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{'{{rubro}}'}</code>{' '}
                  para personalizar por prospecto.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Firma</label>
                <textarea className="rmg-input" rows={3} placeholder={'Juan Carlos Contreras\nGerente Comercial\nRMG Parts'} value={editModal.firma || ''} onChange={e => setEditModal(p => ({ ...p, firma: e.target.value }))} style={{ whiteSpace: 'pre-wrap' }} />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setEditModal(null)} className="btn-secondary">Cancelar</button>
              <button
                disabled={editarMut.isPending}
                className="btn-primary flex items-center gap-2"
                onClick={() => editarMut.mutate({ id: editModal.id, data: { nombre: editModal.nombre, estado: editModal.estado, mensaje_editado: editModal.mensaje_editado, asunto: editModal.asunto || null, firma: editModal.firma || null } })}
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
