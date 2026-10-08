import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatFecha } from '@utils/format'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Phone, Mail, MapPin, MessageCircle, UserCheck,
  Plus, X, Send,
} from 'lucide-react'

// Mismo helper de wa.me que la lista de Prospección — número chileno a 9
// dígitos, prefijo 56, mensaje opcional precargado.
function toWaLink(phone, mensaje) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const num = digits.length > 9 ? digits.slice(-9) : digits
  const base = `https://wa.me/56${num}`
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base
}

const TIPO_ICON = { visita: '🚗', llamada: '📞', whatsapp: '💬', email: '📧', nota: '📝' }
const TIPOS = [
  { v: 'llamada', l: 'Llamada' },
  { v: 'visita',  l: 'Visita' },
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'email',   l: 'Email' },
  { v: 'nota',    l: 'Nota' },
]

// Modal "Enviar correo" — envía de verdad (SMTP vía backend) y queda en bitácora.
function EnviarEmailModal({ prospecto, onClose, onSent }) {
  const [asunto, setAsunto] = useState(`RMG Auto Parts — ${prospecto.empresa}`)
  const [mensaje, setMensaje] = useState('')

  const enviarMut = useMutation({
    mutationFn: () => api.post(`/prospeccion/${prospecto.id}/enviar-email`, { asunto, mensaje }).then(r => r.data),
    onSuccess: () => { toast.success('Correo enviado'); onSent() },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al enviar el correo'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,35,60,0.5)' }}>
      <div className="rmg-card w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Enviar correo a {prospecto.empresa}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); enviarMut.mutate() }} className="space-y-3">
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Para</label>
            <input disabled className="rmg-input mt-1" value={prospecto.email || ''} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Asunto</label>
            <input className="rmg-input mt-1" value={asunto} onChange={e => setAsunto(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Mensaje</label>
            <textarea required rows={6} className="rmg-input mt-1" value={mensaje} onChange={e => setMensaje(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={enviarMut.isPending} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
              <Send size={14}/> {enviarMut.isPending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Form de bitácora — tipo + descripción + próxima acción opcional.
function BitacoraForm({ prospectoId, onClose, tipoInicial = 'nota' }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState(tipoInicial)
  const [descripcion, setDescripcion] = useState('')
  const [proximaAccion, setProximaAccion] = useState('')
  const [fechaProxima, setFechaProxima] = useState('')

  const addMut = useMutation({
    mutationFn: () => api.post(`/prospeccion/${prospectoId}/bitacora`, {
      tipo, descripcion, proxima_accion: proximaAccion || null, fecha_proxima: fechaProxima || null,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Acción registrada')
      qc.invalidateQueries({ queryKey: ['prospecto-bitacora', prospectoId] })
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar'),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); addMut.mutate() }} className="rmg-card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select className="rmg-input" value={tipo} onChange={e => setTipo(e.target.value)}>
          {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <input type="date" className="rmg-input" value={fechaProxima} onChange={e => setFechaProxima(e.target.value)} title="Fecha próxima acción (opcional)" />
      </div>
      <textarea required rows={2} className="rmg-input" placeholder="¿Qué pasó?" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
      <input className="rmg-input" placeholder="Próxima acción (opcional)" value={proximaAccion} onChange={e => setProximaAccion(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button type="submit" disabled={addMut.isPending} className="btn-primary text-sm disabled:opacity-50">
          {addMut.isPending ? 'Guardando...' : 'Registrar'}
        </button>
      </div>
    </form>
  )
}

export default function ProspectoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showBitacoraForm, setShowBitacoraForm] = useState(false)
  const [showEmail, setShowEmail] = useState(false)

  const { data: prospecto, isLoading } = useQuery({
    queryKey: ['prospecto', id],
    queryFn: () => api.get(`/prospeccion/${id}`).then(r => r.data),
  })

  const { data: bitacora = [] } = useQuery({
    queryKey: ['prospecto-bitacora', id],
    queryFn: () => api.get(`/prospeccion/${id}/bitacora`).then(r => r.data),
  })

  const convertirMut = useMutation({
    mutationFn: () => api.post(`/prospeccion/${id}/mover-a-contacto`).then(r => r.data),
    onSuccess: (data) => {
      toast.success('Prospecto convertido en cliente')
      qc.invalidateQueries({ queryKey: ['prospectos'] })
      navigate(`/clientes/${data.cliente_id}`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al convertir en cliente'),
  })

  const registrarWsp = useMutation({
    mutationFn: () => api.post(`/prospeccion/${id}/bitacora`, { tipo: 'whatsapp', descripcion: 'WhatsApp abierto desde la ficha' }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospecto-bitacora', id] }),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--rmg-muted)' }}>Cargando...</div>
  )
  if (!prospecto) return (
    <div className="text-center py-16" style={{ color: 'var(--rmg-muted)' }}>Prospecto no encontrado</div>
  )

  const phone = prospecto.telefono_contacto || prospecto.telefono_empresa || prospecto.celular
  const waUrl = toWaLink(phone, `Hola ${prospecto.nombre_contacto || ''}, te contacto de RMG Auto Parts —`)

  const handleWhatsApp = () => {
    if (!waUrl) return
    window.open(waUrl, '_blank', 'noopener,noreferrer')
    registrarWsp.mutate()
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <button onClick={() => navigate('/prospeccion')} className="p-2 rounded-lg hover:bg-black/5 transition-colors mt-1" style={{ color: 'var(--rmg-muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{prospecto.empresa}</h1>
            {prospecto.segmento && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(90,143,168,0.12)', color: 'rgba(90,143,168,0.9)' }}>
                {prospecto.segmento}
              </span>
            )}
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(15, 35, 60,0.06)', color: 'var(--rmg-blt)' }}>
              {prospecto.etapa === 'prospecto' ? 'Prospecto' : prospecto.etapa}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--rmg-muted)' }}>
            {prospecto.rubro || prospecto.rubro_especialidad || 'Sin rubro'} · Prioridad {prospecto.prioridad}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {waUrl && (
            <button onClick={handleWhatsApp} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-semibold"
              style={{ background: 'rgba(45,201,138,0.12)', color: '#2dc98a', border: '1px solid rgba(45,201,138,0.25)' }}>
              <MessageCircle size={15} /> WhatsApp
            </button>
          )}
          {prospecto.email && (
            <button onClick={() => setShowEmail(true)} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-semibold"
              style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)', border: '1px solid rgba(56,182,255,0.25)' }}>
              <Mail size={15} /> Enviar correo
            </button>
          )}
          <button onClick={() => convertirMut.mutate()} disabled={convertirMut.isPending}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg font-semibold disabled:opacity-50"
            style={{ background: 'rgba(244,162,60,0.15)', color: 'var(--rmg-gold)', border: '1px solid rgba(244,162,60,0.3)' }}
            title="Crea el cliente en el ERP y abre su ficha">
            <UserCheck size={15} /> {convertirMut.isPending ? 'Creando...' : 'Crear como cliente'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Info de contacto */}
        <div className="rmg-card p-5 space-y-4">
          <h2 className="font-bold">Información de contacto</h2>
          <div className="space-y-3">
            {[
              { icon: Phone, label: 'Teléfono', value: phone },
              { icon: Mail,  label: 'Email',    value: prospecto.email },
              { icon: MapPin,label: 'Dirección', value: prospecto.direccion ? `${prospecto.direccion}${prospecto.comuna ? `, ${prospecto.comuna}` : ''}` : null },
            ].map(({ icon: Icon, label, value }) => value && (
              <div key={label} className="flex items-start gap-3">
                <Icon size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--rmg-muted)' }} />
                <div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{label}</div>
                  <div className="text-sm" style={{ color: 'var(--rmg-off)' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
          <hr style={{ borderColor: 'rgba(56,182,255,0.1)' }} />
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--rmg-muted)' }}>Contacto principal</div>
            <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{prospecto.nombre_contacto || '—'}</div>
            <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{prospecto.cargo}</div>
          </div>
          {prospecto.notas && (
            <>
              <hr style={{ borderColor: 'rgba(56,182,255,0.1)' }} />
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--rmg-muted)' }}>Notas</div>
                <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--rmg-off)' }}>{prospecto.notas}</div>
              </div>
            </>
          )}
        </div>

        {/* Bitácora */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Bitácora ({bitacora.length})</h2>
            {!showBitacoraForm && (
              <button onClick={() => setShowBitacoraForm(true)} className="btn-secondary text-xs flex items-center gap-1.5">
                <Plus size={13}/> Registrar acción
              </button>
            )}
          </div>

          {showBitacoraForm && (
            <BitacoraForm prospectoId={id} onClose={() => setShowBitacoraForm(false)} />
          )}

          <div className="space-y-2.5" style={{ maxHeight: 460, overflowY: 'auto' }}>
            {bitacora.length === 0 && !showBitacoraForm && (
              <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>Sin acciones registradas todavía</div>
            )}
            {bitacora.map(a => (
              <div key={a.id} className="rmg-card p-4 flex gap-3">
                <div className="text-xl">{TIPO_ICON[a.tipo] || '📌'}</div>
                <div className="flex-1">
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-medium text-sm whitespace-pre-wrap" style={{ color: 'var(--rmg-off)' }}>{a.descripcion}</div>
                    <div className="text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(a.created_at)}</div>
                  </div>
                  {a.proxima_accion && (
                    <div className="text-xs mt-1" style={{ color: 'var(--rmg-gold)' }}>
                      → {a.proxima_accion}{a.fecha_proxima ? ` (${formatFecha(a.fecha_proxima)})` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEmail && (
        <EnviarEmailModal
          prospecto={prospecto}
          onClose={() => setShowEmail(false)}
          onSent={() => { setShowEmail(false); qc.invalidateQueries({ queryKey: ['prospecto-bitacora', id] }) }}
        />
      )}
    </div>
  )
}
