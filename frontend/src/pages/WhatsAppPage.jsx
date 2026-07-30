import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { MessageCircle, Send } from 'lucide-react'

function formatHour(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

export default function WhatsAppPage() {
  const [convSeleccionada, setConvSeleccionada] = useState(null)
  const [mensaje, setMensaje] = useState('')

  const { data: conversaciones = [], isLoading } = useQuery({
    queryKey: ['conversaciones'],
    queryFn: () => api.get('/whatsapp/conversaciones').then(r => r.data),
  })

  const conv = conversaciones.find(c => c.id === convSeleccionada)

  // Mensajes mock locales (el endpoint de mensajes va por id)
  const mensajesMock = {
    wa001: [
      { id: 'm1', direccion: 'entrante', contenido: 'hola', created_at: '2026-06-27T09:00:00Z' },
      { id: 'm2', direccion: 'saliente', contenido: '🔩 RMG Parts\n¡Hola! Somos distribuidores mayoristas de repuestos en Santiago RM.\n\n¿Qué tipo de cliente eres?\n• Taller mecánico\n• Flota / Empresa\n• Concesionario', created_at: '2026-06-27T09:00:05Z' },
      { id: 'm3', direccion: 'entrante', contenido: 'Taller mecánico', created_at: '2026-06-27T09:01:00Z' },
      { id: 'm4', direccion: 'saliente', contenido: '📦 Perfecto. ¿Qué línea necesitas cotizar?\n• Baterías\n• Lubricantes\n• Neumáticos', created_at: '2026-06-27T09:01:05Z' },
      { id: 'm5', direccion: 'entrante', contenido: 'Baterías', created_at: '2026-06-27T09:02:00Z' },
      { id: 'm6', direccion: 'saliente', contenido: '📋 *COTIZACIÓN RMG PARTS*\n🔢 N° COT-2026-001\n\n• BATERIA YOKO 55AMP (x4) = $256.000\n• AUSTER 5W30 4LT (x10) = $155.000\n\nNeto: $411.000 · IVA: $78.090\n*TOTAL: $489.090*\n\n✅ Entrega 4–24 hrs RM\n💳 Crédito 30 días disponible\n\nResponde *CONFIRMAR* para generar pedido', created_at: '2026-06-27T09:05:00Z' },
      { id: 'm7', direccion: 'entrante', contenido: 'CONFIRMAR', created_at: '2026-06-27T09:15:00Z' },
      { id: 'm8', direccion: 'saliente', contenido: '✅ ¡Pedido confirmado!\n📦 PED-2026-001 generado en sistema.\nDespacho en 4–24 hrs a Av. Matta 1234.\n\nGracias por tu preferencia, Carlos 🙌', created_at: '2026-06-27T09:15:10Z' },
    ],
    wa002: [
      { id: 'm9', direccion: 'entrante', contenido: 'Buenos días, Rodrigo de Transportes Norte', created_at: '2026-06-27T08:25:00Z' },
      { id: 'm10', direccion: 'saliente', contenido: '¡Buenos días Rodrigo! ¿En qué te podemos ayudar hoy?', created_at: '2026-06-27T08:26:00Z' },
      { id: 'm11', direccion: 'entrante', contenido: 'Necesito cotizar neumáticos de camión', created_at: '2026-06-27T08:30:00Z' },
    ],
    wa003: [
      { id: 'm12', direccion: 'entrante', contenido: '¿Tienen el 10W40 en bidón 20L?', created_at: '2026-06-26T17:45:00Z' },
    ],
  }

  const mensajes = convSeleccionada ? (mensajesMock[convSeleccionada] || []) : []

  const handleSend = (e) => {
    e.preventDefault()
    if (!mensaje.trim()) return
    setMensaje('')
  }

  return (
    <div className="animate-fade-in h-full flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>

      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Bot WhatsApp</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Conversaciones activas · Meta Cloud API</p>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">

        {/* Lista conversaciones */}
        <div className="rmg-card flex flex-col flex-shrink-0 overflow-hidden" style={{ width: 280 }}>
          <div className="px-4 py-3 border-b text-xs uppercase tracking-wider font-semibold" style={{ borderColor: 'rgba(56,182,255,0.1)', color: 'var(--rmg-muted)' }}>
            Conversaciones
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-3 border-b animate-pulse" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                    <div className="h-4 rounded mb-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    <div className="h-3 rounded w-3/4" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                ))
              : conversaciones.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setConvSeleccionada(c.id)}
                    className="p-3 cursor-pointer transition-all border-b"
                    style={{
                      borderColor: 'rgba(255,255,255,0.04)',
                      background: convSeleccionada === c.id ? 'rgba(27,143,212,0.12)' : 'transparent',
                      borderLeft: convSeleccionada === c.id ? '2px solid var(--rmg-blue)' : '2px solid transparent',
                    }}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--rmg-off)' }}>{c.nombre}</span>
                      {c.sin_leer > 0 && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2" style={{ background: 'var(--rmg-blue)', color: '#fff' }}>
                          {c.sin_leer}
                        </span>
                      )}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--rmg-muted)' }}>{c.ultimo_mensaje}</div>
                    <div className="text-xs mt-1" style={{ color: 'rgba(90,143,168,0.5)' }}>{formatHour(c.ultimo_at)}</div>
                  </div>
                ))
            }
          </div>
        </div>

        {/* Chat */}
        <div className="rmg-card flex-1 flex flex-col overflow-hidden">
          {!convSeleccionada
            ? (
              <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--rmg-muted)' }}>
                <MessageCircle size={48} className="mb-4 opacity-20" />
                <p className="text-sm">Selecciona una conversación</p>
              </div>
            )
            : (
              <>
                {/* Header */}
                <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{conv?.nombre}</div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{conv?.telefono}</div>
                </div>

                {/* Mensajes */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {mensajes.map(m => (
                    <div key={m.id} className={`flex ${m.direccion === 'saliente' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className="max-w-xs px-3 py-2 rounded-xl text-sm whitespace-pre-wrap"
                        style={m.direccion === 'saliente'
                          ? { background: 'var(--rmg-blue)', color: '#fff', borderRadius: '16px 16px 4px 16px' }
                          : { background: 'rgba(255,255,255,0.07)', color: 'var(--rmg-off)', borderRadius: '16px 16px 16px 4px' }
                        }
                      >
                        {m.contenido}
                        <div className="text-xs mt-1 opacity-60 text-right">{formatHour(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input */}
                <form onSubmit={handleSend} className="p-3 border-t flex gap-2 flex-shrink-0" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
                  <input
                    className="rmg-input flex-1"
                    placeholder="Escribir mensaje..."
                    value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                  />
                  <button type="submit" className="btn-primary px-3">
                    <Send size={16} />
                  </button>
                </form>
              </>
            )
          }
        </div>
      </div>
    </div>
  )
}
