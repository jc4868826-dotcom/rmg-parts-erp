import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@utils/api'
import { formatFecha, labelSegmento, colorSegmento } from '@utils/format'
import {
  Search, Plus, Users, X, Pencil, Trash2, FileText,
  Mail, MessageCircle, Send, ChevronRight, Building2,
  Phone, MapPin, Briefcase, Check, Megaphone,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const SEGMENTOS  = ['taller', 'flota', 'concesionario', 'construccion']
const ETAPAS     = ['prospecto', 'contactado', 'cotizado', 'negociando', 'cliente']
const TIPOS_NOTA = ['llamada', 'reunion', 'email', 'wsp_enviado', 'nota', 'otro']

const ETAPA_STYLES = {
  prospecto:  { label: 'Prospecto',  bg: 'rgba(90,143,168,0.15)',  color: 'rgba(90,143,168,0.9)' },
  contactado: { label: 'Contactado', bg: 'rgba(56,182,255,0.12)',  color: 'var(--rmg-blt)' },
  cotizado:   { label: 'Cotizado',   bg: 'rgba(244,162,60,0.12)',  color: 'var(--rmg-gold)' },
  negociando: { label: 'Negociando', bg: 'rgba(123,97,196,0.12)', color: 'var(--rmg-purple)' },
  cliente:    { label: 'Cliente',    bg: 'rgba(45,201,138,0.12)',  color: 'var(--rmg-teal)' },
}

const FORM_INIT = {
  rut: '', dv: '', razon_social: '', giro: '', rubro: '',
  direccion: '', comuna: '', ciudad: '', region: '',
  telefono: '', email: '', celular: '',
  segmento: 'taller', etapa_pipeline: 'prospecto',
  contacto_nombre: '', contacto_cargo: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function EtapaBadge({ etapa }) {
  const st = ETAPA_STYLES[etapa] || ETAPA_STYLES.prospecto
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: st.bg, color: st.color }}>
      {st.label}
    </span>
  )
}

function FieldLabel({ children }) {
  return (
    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
      style={{ color: 'var(--rmg-muted)' }}>
      {children}
    </label>
  )
}

function ModalBackdrop({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {children}
    </div>
  )
}

function cleanPhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

// ─── Modal: New / Edit Client ─────────────────────────────────────────────────

function ClienteModal({ cliente, onClose, onSaved }) {
  const [form, setForm] = useState(cliente ? {
    rut:            cliente.rut         || '',
    dv:             cliente.dv          || '',
    razon_social:   cliente.razon_social || '',
    giro:           cliente.giro        || '',
    rubro:          cliente.rubro       || '',
    direccion:      cliente.direccion   || '',
    comuna:         cliente.comuna      || '',
    ciudad:         cliente.ciudad      || '',
    region:         cliente.region      || '',
    telefono:       cliente.telefono    || '',
    email:          cliente.email       || '',
    celular:        cliente.celular     || '',
    segmento:       cliente.segmento    || 'taller',
    etapa_pipeline: cliente.etapa_pipeline || 'prospecto',
    contacto_nombre: cliente.contacto_nombre || '',
    contacto_cargo:  cliente.contacto_cargo  || '',
  } : { ...FORM_INIT })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const qc = useQueryClient()

  const saveMut = useMutation({
    mutationFn: (data) => cliente
      ? api.put(`/clientes/${cliente.id}`, data).then(r => r.data)
      : api.post('/clientes', data).then(r => r.data),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.success(cliente ? 'Cliente actualizado' : `Cliente "${saved.razon_social}" creado`)
      onSaved && onSaved(saved)
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al guardar cliente'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.razon_social.trim()) { toast.error('Razón social requerida'); return }
    saveMut.mutate(form)
  }

  const isEdit = !!cliente

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="rmg-card w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto animate-fade-in"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
          <h2 className="font-black text-lg" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {/* Identificación */}
          <p className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--rmg-muted)' }}>Identificación</p>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <FieldLabel>RUT</FieldLabel>
              <input className="rmg-input" placeholder="76543210" value={form.rut}
                onChange={e => set('rut', e.target.value)} />
            </div>
            <div>
              <FieldLabel>DV</FieldLabel>
              <input className="rmg-input" placeholder="K" maxLength={1} value={form.dv}
                onChange={e => set('dv', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Rubro</FieldLabel>
              <input className="rmg-input" placeholder="Ej: Minería, Agrícola..." value={form.rubro}
                onChange={e => set('rubro', e.target.value)} />
            </div>
            <div className="col-span-2">
              <FieldLabel>Razón Social *</FieldLabel>
              <input className="rmg-input" placeholder="Nombre empresa..." value={form.razon_social}
                onChange={e => set('razon_social', e.target.value)} required />
            </div>
            <div>
              <FieldLabel>Giro</FieldLabel>
              <input className="rmg-input" placeholder="Giro tributario..." value={form.giro}
                onChange={e => set('giro', e.target.value)} />
            </div>
          </div>

          {/* Dirección */}
          <p className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--rmg-muted)' }}>Dirección</p>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="col-span-3">
              <FieldLabel>Dirección</FieldLabel>
              <input className="rmg-input" placeholder="Av. Los Libertadores 1234" value={form.direccion}
                onChange={e => set('direccion', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Comuna</FieldLabel>
              <input className="rmg-input" placeholder="Santiago..." value={form.comuna}
                onChange={e => set('comuna', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Ciudad</FieldLabel>
              <input className="rmg-input" placeholder="Santiago..." value={form.ciudad}
                onChange={e => set('ciudad', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Región</FieldLabel>
              <input className="rmg-input" placeholder="Metropolitana..." value={form.region}
                onChange={e => set('region', e.target.value)} />
            </div>
          </div>

          {/* Contacto */}
          <p className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--rmg-muted)' }}>Contacto</p>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <FieldLabel>Teléfono</FieldLabel>
              <input className="rmg-input" placeholder="+56 2 2345 6789" value={form.telefono}
                onChange={e => set('telefono', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input type="email" className="rmg-input" placeholder="correo@empresa.cl" value={form.email}
                onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Celular / WhatsApp</FieldLabel>
              <input className="rmg-input" placeholder="+56 9 8765 4321" value={form.celular}
                onChange={e => set('celular', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Nombre contacto</FieldLabel>
              <input className="rmg-input" placeholder="Juan Pérez" value={form.contacto_nombre}
                onChange={e => set('contacto_nombre', e.target.value)} />
            </div>
            <div>
              <FieldLabel>Cargo contacto</FieldLabel>
              <input className="rmg-input" placeholder="Gerente de Compras" value={form.contacto_cargo}
                onChange={e => set('contacto_cargo', e.target.value)} />
            </div>
          </div>

          {/* Pipeline */}
          <p className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--rmg-muted)' }}>Pipeline</p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <FieldLabel>Segmento</FieldLabel>
              <select className="rmg-input" value={form.segmento} onChange={e => set('segmento', e.target.value)}>
                {SEGMENTOS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Etapa pipeline</FieldLabel>
              <select className="rmg-input" value={form.etapa_pipeline} onChange={e => set('etapa_pipeline', e.target.value)}>
                {ETAPAS.map(e => <option key={e} value={e}>{ETAPA_STYLES[e]?.label || e}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saveMut.isPending} className="btn-primary disabled:opacity-50">
              {saveMut.isPending ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear cliente')}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  )
}

// ─── Modal: Ficha de Cliente ──────────────────────────────────────────────────

function FichaModal({ cliente, onClose, onEdit }) {
  const [tab, setTab]       = useState('datos')
  const [nota, setNota]     = useState('')
  const [tipoNota, setTipo] = useState('nota')
  const qc                  = useQueryClient()

  const { data: bitacora = [], isLoading: loadingBit } = useQuery({
    queryKey: ['bitacora', cliente.id],
    queryFn: () => api.get(`/clientes/${cliente.id}/bitacora`).then(r => r.data),
    enabled: tab === 'bitacora',
  })

  const addNotaMut = useMutation({
    mutationFn: (payload) => api.post(`/clientes/${cliente.id}/bitacora`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bitacora', cliente.id] })
      setNota('')
      toast.success('Nota agregada')
    },
    onError: () => toast.error('Error al agregar nota'),
  })

  const etapaMut = useMutation({
    mutationFn: (etapa) => api.put(`/clientes/${cliente.id}`, { etapa_pipeline: etapa }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.success('Etapa actualizada')
    },
    onError: () => toast.error('Error al actualizar etapa'),
  })

  const handleAddNota = () => {
    if (!nota.trim()) { toast.error('Escribe un contenido'); return }
    addNotaMut.mutate({ contenido: nota, tipo: tipoNota, usuario: 'RMG' })
  }

  const tabs = [
    { id: 'datos', label: 'Datos' },
    { id: 'bitacora', label: 'Bitácora' },
    { id: 'pipeline', label: 'Pipeline' },
  ]

  const c = cliente

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="rmg-card w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col animate-fade-in"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
          <div>
            <h2 className="font-black text-lg" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{c.razon_social}</h2>
            <div className="flex items-center gap-2 mt-1">
              {c.rut && <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{c.rut}-{c.dv}</span>}
              <EtapaBadge etapa={c.etapa_pipeline} />
              {c.segmento && (
                <span className="text-xs font-semibold" style={{ color: colorSegmento(c.segmento) }}>
                  {labelSegmento(c.segmento)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { onClose(); onEdit(c) }}
              className="flex items-center gap-1.5 text-xs btn-secondary px-3 py-1.5">
              <Pencil size={13} /> Editar
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="text-sm font-semibold px-4 py-3 transition-colors border-b-2 -mb-px"
              style={{
                color: tab === t.id ? 'var(--rmg-blt)' : 'var(--rmg-muted)',
                borderColor: tab === t.id ? 'var(--rmg-blt)' : 'transparent',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* Tab: Datos */}
          {tab === 'datos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Razón Social', value: c.razon_social },
                  { label: 'RUT', value: c.rut ? `${c.rut}-${c.dv}` : '—' },
                  { label: 'Giro', value: c.giro || '—' },
                  { label: 'Rubro', value: c.rubro || '—' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>{f.label}</p>
                    <p className="text-sm" style={{ color: 'var(--rmg-off)' }}>{f.value}</p>
                  </div>
                ))}
              </div>
              <hr style={{ borderColor: 'rgba(15, 35, 60,0.06)' }} />
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Dirección', value: c.direccion || '—', icon: MapPin },
                  { label: 'Comuna', value: c.comuna || '—' },
                  { label: 'Ciudad', value: c.ciudad || '—' },
                  { label: 'Región', value: c.region || '—' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>{f.label}</p>
                    <p className="text-sm" style={{ color: 'var(--rmg-off)' }}>{f.value}</p>
                  </div>
                ))}
              </div>
              <hr style={{ borderColor: 'rgba(15, 35, 60,0.06)' }} />
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Email', value: c.email || '—' },
                  { label: 'Celular / WSP', value: c.celular || '—' },
                  { label: 'Teléfono', value: c.telefono || '—' },
                  { label: 'Contacto', value: c.contacto_nombre ? `${c.contacto_nombre}${c.contacto_cargo ? ` · ${c.contacto_cargo}` : ''}` : '—' },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>{f.label}</p>
                    <p className="text-sm" style={{ color: 'var(--rmg-off)' }}>{f.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Bitácora */}
          {tab === 'bitacora' && (
            <div className="space-y-4">
              {/* Add note */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: 'rgba(15, 35, 60,0.03)', border: '1px solid rgba(15, 35, 60,0.07)' }}>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <FieldLabel>Tipo de interacción</FieldLabel>
                    <select className="rmg-input" value={tipoNota} onChange={e => setTipo(e.target.value)}>
                      {TIPOS_NOTA.map(t => <option key={t} value={t}>{t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <textarea
                  className="rmg-input w-full resize-none"
                  rows={3}
                  placeholder="Escribe una nota sobre este cliente..."
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                />
                <div className="flex justify-end">
                  <button onClick={handleAddNota} disabled={addNotaMut.isPending}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50">
                    <Plus size={14} />
                    {addNotaMut.isPending ? 'Agregando...' : 'Agregar nota'}
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {loadingBit ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'rgba(15, 35, 60,0.04)' }} />
                  ))}
                </div>
              ) : bitacora.length === 0 ? (
                <div className="py-10 text-center" style={{ color: 'var(--rmg-muted)' }}>
                  <FileText size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin notas aún</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bitacora.map((n, i) => (
                    <div key={n.id || i} className="rounded-lg p-3" style={{ background: 'rgba(15, 35, 60,0.03)', border: '1px solid rgba(15, 35, 60,0.06)' }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)' }}>
                          {(n.tipo || 'nota').replace('_', ' ')}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(n.fecha_creacion || n.created_at)}</span>
                        {n.usuario && <span className="text-xs ml-auto" style={{ color: 'var(--rmg-muted)' }}>{n.usuario}</span>}
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--rmg-off)' }}>{n.contenido}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Pipeline */}
          {tab === 'pipeline' && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Selecciona la etapa actual del cliente en el pipeline de ventas.</p>
              <div className="space-y-2">
                {ETAPAS.map((etapa, idx) => {
                  const st = ETAPA_STYLES[etapa]
                  const isCurrent = c.etapa_pipeline === etapa
                  return (
                    <button key={etapa} onClick={() => etapaMut.mutate(etapa)}
                      disabled={etapaMut.isPending}
                      className="w-full flex items-center gap-3 rounded-lg px-4 py-3 transition-all disabled:opacity-50"
                      style={{
                        background: isCurrent ? st.bg : 'rgba(15, 35, 60,0.02)',
                        border: `1px solid ${isCurrent ? st.color + '60' : 'rgba(15, 35, 60,0.07)'}`,
                        cursor: 'pointer',
                      }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                        style={{ background: st.bg, color: st.color }}>
                        {idx + 1}
                      </div>
                      <span className="font-semibold flex-1 text-left" style={{ color: isCurrent ? st.color : 'var(--rmg-off)' }}>
                        {st.label}
                      </span>
                      {isCurrent && <Check size={16} style={{ color: st.color }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalBackdrop>
  )
}

// ─── Modal: Email ─────────────────────────────────────────────────────────────

function EmailModal({ cliente, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    from: 'ventas@rmgparts.cl',
    to: cliente.email || '',
    asunto: '',
    mensaje: '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const sendMut = useMutation({
    mutationFn: async (payload) => {
      await api.post('/clientes/send-email', { ...payload, cliente_id: cliente.id })
      await api.post(`/clientes/${cliente.id}/bitacora`, {
        contenido: `Email enviado: "${payload.asunto}"`,
        tipo: 'email',
        usuario: 'RMG',
      })
    },
    onSuccess: () => {
      toast.success('Email enviado y registrado en bitácora')
      qc.invalidateQueries({ queryKey: ['bitacora', cliente.id] })
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al enviar email'),
  })

  const handleSend = (e) => {
    e.preventDefault()
    if (!form.to) { toast.error('Destinatario requerido'); return }
    if (!form.asunto) { toast.error('Asunto requerido'); return }
    sendMut.mutate(form)
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="rmg-card w-full max-w-lg mx-4 animate-fade-in"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
          <div className="flex items-center gap-2">
            <Mail size={18} style={{ color: 'var(--rmg-blt)' }} />
            <h2 className="font-black text-base">Enviar Email</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSend} className="p-5 space-y-4">
          <div>
            <FieldLabel>De</FieldLabel>
            <input className="rmg-input" value={form.from} onChange={e => set('from', e.target.value)} />
          </div>
          <div>
            <FieldLabel>Para</FieldLabel>
            <input type="email" className="rmg-input" value={form.to} onChange={e => set('to', e.target.value)} required />
          </div>
          <div>
            <FieldLabel>Asunto</FieldLabel>
            <input className="rmg-input" placeholder="Asunto del email..." value={form.asunto}
              onChange={e => set('asunto', e.target.value)} required />
          </div>
          <div>
            <FieldLabel>Mensaje</FieldLabel>
            <textarea className="rmg-input w-full resize-none" rows={5}
              placeholder="Escribe el mensaje aquí..." value={form.mensaje}
              onChange={e => set('mensaje', e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={sendMut.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Send size={14} />
              {sendMut.isPending ? 'Enviando...' : 'Enviar email'}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  )
}

// ─── Modal: WhatsApp ──────────────────────────────────────────────────────────

function WspModal({ clientes, onClose }) {
  const qc  = useQueryClient()
  const isSingle = clientes.length === 1
  const c0  = clientes[0]

  const [myNum,  setMyNum]  = useState('+56 9')
  const [msg,    setMsg]    = useState(
    isSingle
      ? `Hola ${c0.contacto_nombre || c0.razon_social}, soy parte del equipo de RMG Parts. ¿Cómo podemos ayudarle hoy?`
      : 'Hola, soy parte del equipo de RMG Parts. ¿Cómo podemos ayudarle?'
  )

  const regMut = useMutation({
    mutationFn: (ids) =>
      Promise.all(ids.map(id =>
        api.post(`/clientes/${id}/bitacora`, {
          contenido: `WhatsApp enviado: "${msg.slice(0, 80)}..."`,
          tipo: 'wsp_enviado',
          usuario: 'RMG',
        })
      )),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
    },
  })

  const handleSend = () => {
    if (!msg.trim()) { toast.error('Escribe un mensaje'); return }
    const ids = clientes.map(c => c.id)
    regMut.mutate(ids)

    clientes.forEach(c => {
      const num = cleanPhone(c.celular || c.whatsapp || c.telefono)
      if (!num) {
        toast.error(`Sin número para ${c.razon_social}`)
        return
      }
      const encoded = encodeURIComponent(msg)
      window.open(`https://wa.me/${num}?text=${encoded}`, '_blank')
    })

    toast.success(`WhatsApp${clientes.length > 1 ? 's' : ''} abierto${clientes.length > 1 ? 's' : ''}`)
    onClose()
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="rmg-card w-full max-w-lg mx-4 animate-fade-in"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
          <div className="flex items-center gap-2">
            <MessageCircle size={18} style={{ color: 'var(--rmg-teal)' }} />
            <h2 className="font-black text-base">
              {isSingle ? `WhatsApp — ${c0.razon_social}` : `WhatsApp masivo (${clientes.length})`}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <FieldLabel>Tu número WhatsApp</FieldLabel>
            <input className="rmg-input" placeholder="+56 9 8765 4321" value={myNum}
              onChange={e => setMyNum(e.target.value)} />
          </div>
          {!isSingle && (
            <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(244,162,60,0.08)', border: '1px solid rgba(244,162,60,0.2)', color: 'var(--rmg-gold)' }}>
              Se abrirán {clientes.length} conversaciones en wa.me. Asegúrate de permitir ventanas emergentes.
            </div>
          )}
          <div>
            <FieldLabel>Mensaje</FieldLabel>
            <textarea className="rmg-input w-full resize-none" rows={5} value={msg}
              onChange={e => setMsg(e.target.value)} />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button onClick={handleSend} disabled={regMut.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
              style={{ background: 'rgba(45,201,138,0.15)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.3)' }}>
              <MessageCircle size={14} />
              {regMut.isPending ? 'Abriendo...' : 'Abrir WhatsApp'}
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientesPage() {
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  // Filters
  const [search,   setSearch]   = useState('')
  const [filtRubro, setFRubro]  = useState('')
  const [filtEtapa, setFEtapa]  = useState('')
  const [filtComuna, setFCom]   = useState('')

  // Selection
  const [selected, setSelected] = useState(new Set())

  // Modals
  const [showNew,   setShowNew]   = useState(false)
  const [editCliente, setEditC]   = useState(null)
  const [fichaCliente, setFicha]  = useState(null)
  const [emailClientes, setEmailC] = useState(null)
  const [wspClientes, setWspC]    = useState(null)
  const [showAsignarCampana, setShowAsignarCampana] = useState(false)

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
  })

  const { data: campanas = [] } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => api.get('/campanas').then(r => r.data),
  })

  const filtered = clientes.filter(c => {
    if (filtRubro  && (c.rubro   || '').toLowerCase() !== filtRubro.toLowerCase()) return false
    if (filtEtapa  && c.etapa_pipeline !== filtEtapa) return false
    if (filtComuna && !(c.comuna || '').toLowerCase().includes(filtComuna.toLowerCase())) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.razon_social || '').toLowerCase().includes(q) ||
      (c.contacto_nombre || '').toLowerCase().includes(q) ||
      (c.rut || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  })

  // ── Stats ────────────────────────────────────────────────────────────────────

  const rubros = [...new Set(clientes.map(c => c.rubro).filter(Boolean))]

  const stats = [
    { label: 'Total clientes', value: clientes.length, color: 'var(--rmg-blt)' },
    { label: 'Construcción',   value: clientes.filter(c => c.segmento === 'construccion').length, color: 'var(--seg-construccion, var(--rmg-gold))' },
    { label: 'Flotas',         value: clientes.filter(c => c.segmento === 'flota').length,        color: 'var(--seg-flota, var(--rmg-blt))' },
    { label: 'Talleres',       value: clientes.filter(c => c.segmento === 'taller').length,       color: 'var(--seg-taller, var(--rmg-teal))' },
    { label: 'Concesionarios', value: clientes.filter(c => c.segmento === 'concesionario').length,color: 'var(--seg-concesionario, rgba(123,97,196,0.9))' },
  ]

  // ── Delete ────────────────────────────────────────────────────────────────────

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/clientes/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.success('Cliente eliminado')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  })

  const asignarCampanaMut = useMutation({
    mutationFn: (d) => api.put('/clientes/asignar-campana', d).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.success(`Campaña asignada a ${res.actualizados} clientes`)
      setSelected(new Set())
      setShowAsignarCampana(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al asignar campaña'),
  })

  const handleDelete = (c) => {
    if (!window.confirm(`¿Eliminar "${c.razon_social}"?`)) return
    deleteMut.mutate(c.id)
  }

  const handleDeleteSelected = () => {
    if (!window.confirm(`¿Eliminar ${selected.size} cliente(s) seleccionado(s)?`)) return
    Promise.all([...selected].map(id => api.delete(`/clientes/${id}`))).then(() => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      setSelected(new Set())
      toast.success(`${selected.size} cliente(s) eliminados`)
    }).catch(() => toast.error('Error al eliminar algunos clientes'))
  }

  // ── Selection ─────────────────────────────────────────────────────────────────

  const toggleRow = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length

  const selectedClientes = clientes.filter(c => selected.has(c.id))

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Page header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Cartera activa B2B — {clientes.length} registros</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Nuevo cliente
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="rmg-card p-4 text-center">
            <div className="font-black text-2xl" style={{ color: s.color }}>
              {isLoading ? '—' : s.value}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top bar: search + filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }} />
          <input className="rmg-input pl-9 w-full" placeholder="Buscar por razón social, RUT, email..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }}>
              <X size={13} />
            </button>
          )}
        </div>
        <select className="rmg-input" value={filtRubro} onChange={e => setFRubro(e.target.value)}
          style={{ minWidth: 150 }}>
          <option value="">Todos los rubros</option>
          {rubros.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="rmg-input" value={filtEtapa} onChange={e => setFEtapa(e.target.value)}
          style={{ minWidth: 150 }}>
          <option value="">Todas las etapas</option>
          {ETAPAS.map(e => <option key={e} value={e}>{ETAPA_STYLES[e]?.label || e}</option>)}
        </select>
        <input className="rmg-input" placeholder="Filtrar comuna..." value={filtComuna}
          onChange={e => setFCom(e.target.value)} style={{ minWidth: 140 }} />
      </div>

      {/* Floating action bar when rows selected */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl px-5 py-3 animate-fade-in"
          style={{ background: 'var(--rmg-surface)', border: '1px solid rgba(56,182,255,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--rmg-blt)' }}>{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          <div className="w-px h-5" style={{ background: 'rgba(15, 35, 60,0.1)' }} />
          <button onClick={handleDeleteSelected}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--rmg-red)', background: 'rgba(224,90,78,0.1)' }}>
            <Trash2 size={14} /> Eliminar seleccionados
          </button>
          <button
            onClick={() => {
              const withEmail = selectedClientes.filter(c => c.email)
              if (withEmail.length === 0) { toast.error('Ningún cliente seleccionado tiene email'); return }
              setEmailC(withEmail[0])
            }}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--rmg-blt)', background: 'rgba(56,182,255,0.1)' }}>
            <Mail size={14} /> Enviar email
          </button>
          <button
            onClick={() => {
              const withWsp = selectedClientes.filter(c => c.celular || c.whatsapp)
              if (withWsp.length === 0) { toast.error('Ningún cliente seleccionado tiene celular'); return }
              setWspC(withWsp)
            }}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--rmg-teal)', background: 'rgba(45,201,138,0.1)' }}>
            <MessageCircle size={14} /> Enviar WSP
          </button>
          <button
            onClick={() => setShowAsignarCampana(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: '#a78bfa', background: 'rgba(167,139,250,0.1)' }}>
            <Megaphone size={14} /> Asignar campaña
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-1" style={{ color: 'var(--rmg-muted)' }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rmg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                {/* Checkbox all */}
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded cursor-pointer" style={{ accentColor: 'var(--rmg-blt)' }} />
                </th>
                {['RUT', 'Razón Social / Rubro', 'Comuna', 'Email', 'Celular', 'Etapa', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: 'var(--rmg-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((c, i) => {
                    const isChecked = selected.has(c.id)
                    return (
                      <tr key={c.id}
                        style={{
                          borderBottom: '1px solid rgba(15, 35, 60,0.04)',
                          background: isChecked
                            ? 'rgba(56,182,255,0.05)'
                            : i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)',
                        }}
                        className="hover:bg-white/[0.025] transition-colors group">

                        {/* Checkbox */}
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={isChecked}
                            onChange={() => toggleRow(c.id)}
                            className="rounded cursor-pointer"
                            style={{ accentColor: 'var(--rmg-blt)' }}
                            onClick={e => e.stopPropagation()} />
                        </td>

                        {/* RUT */}
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono" style={{ color: 'var(--rmg-muted)' }}>
                            {c.rut ? `${c.rut}-${c.dv || ''}` : '—'}
                          </span>
                        </td>

                        {/* Razón Social + Rubro */}
                        <td className="px-4 py-3">
                          <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{c.razon_social}</div>
                          {c.rubro && (
                            <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
                              <Briefcase size={10} className="inline mr-1 opacity-60" />{c.rubro}
                            </div>
                          )}
                        </td>

                        {/* Comuna */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>
                          {c.comuna || '—'}
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3">
                          {c.email
                            ? <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                className="text-xs hover:underline" style={{ color: 'var(--rmg-blt)' }}>
                                {c.email}
                              </a>
                            : <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>—</span>
                          }
                        </td>

                        {/* Celular */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-off)' }}>
                          {c.celular || c.telefono || '—'}
                        </td>

                        {/* Etapa */}
                        <td className="px-4 py-3">
                          <EtapaBadge etapa={c.etapa_pipeline} />
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditC(c) }}
                              title="Editar"
                              className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                              style={{ color: 'var(--rmg-blt)' }}>
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(c) }}
                              title="Eliminar"
                              className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                              style={{ color: 'var(--rmg-red)' }}>
                              <Trash2 size={13} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setFicha(c) }}
                              title="Ver ficha"
                              className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                              style={{ color: 'var(--rmg-muted)' }}>
                              <FileText size={13} />
                            </button>
                            {c.email && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEmailC(c) }}
                                title="Enviar email"
                                className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                                style={{ color: 'var(--rmg-blt)' }}>
                                <Mail size={13} />
                              </button>
                            )}
                            {(c.celular || c.whatsapp) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setWspC([c]) }}
                                title="WhatsApp"
                                className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                                style={{ color: 'var(--rmg-teal)' }}>
                                <MessageCircle size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Users size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No se encontraron clientes</p>
            {(search || filtRubro || filtEtapa || filtComuna) && (
              <button
                onClick={() => { setSearch(''); setFRubro(''); setFEtapa(''); setFCom('') }}
                className="mt-3 text-xs underline" style={{ color: 'var(--rmg-blt)' }}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t text-xs" style={{ borderColor: 'rgba(15, 35, 60,0.05)', color: 'var(--rmg-muted)' }}>
            Mostrando {filtered.length} de {clientes.length} clientes
            {selected.size > 0 && <span className="ml-2" style={{ color: 'var(--rmg-blt)' }}>· {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNew && (
        <ClienteModal onClose={() => setShowNew(false)} onSaved={() => {}} />
      )}
      {editCliente && (
        <ClienteModal cliente={editCliente} onClose={() => setEditC(null)} onSaved={() => {}} />
      )}
      {fichaCliente && (
        <FichaModal
          cliente={fichaCliente}
          onClose={() => setFicha(null)}
          onEdit={(c) => setEditC(c)}
        />
      )}
      {emailClientes && (
        <EmailModal cliente={emailClientes} onClose={() => setEmailC(null)} />
      )}
      {wspClientes && (
        <WspModal clientes={wspClientes} onClose={() => setWspC(null)} />
      )}

      {/* Modal: Asignar campaña */}
      {showAsignarCampana && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Asignar campaña</h2>
              <button onClick={() => setShowAsignarCampana(false)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--rmg-muted)' }}>
              Asignar campaña a <strong style={{ color: 'var(--rmg-off)' }}>{selected.size} clientes</strong>
            </p>
            <select className="rmg-input mb-4" id="cl-campana-select">
              <option value="">— Seleccionar campaña —</option>
              {campanas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} · {c.rubro}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAsignarCampana(false)} className="btn-secondary">Cancelar</button>
              <button
                className="btn-primary"
                disabled={asignarCampanaMut.isPending}
                onClick={() => {
                  const sel = document.getElementById('cl-campana-select')
                  const campana_id = sel.value
                  const campana_nombre = sel.options[sel.selectedIndex]?.text?.split(' · ')[0]
                  if (!campana_id) { toast.error('Selecciona una campaña'); return }
                  asignarCampanaMut.mutate({ ids: Array.from(selected), campana_id, campana_nombre })
                }}
              >
                {asignarCampanaMut.isPending ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
