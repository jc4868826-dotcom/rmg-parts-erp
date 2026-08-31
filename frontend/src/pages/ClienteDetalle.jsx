import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, labelSegmento, formatFecha } from '@utils/format'
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, FileText, MessageCircle, TrendingUp, Pencil } from 'lucide-react'
import { ClienteModal } from './ClientesPage'

const ESTADO_FACTURA = {
  al_dia:   { label: 'Al día',    bg: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' },
  vencida:  { label: 'Vencida',   bg: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)' },
  critica:  { label: 'Crítica',   bg: 'rgba(224,90,78,0.12)',  color: 'var(--rmg-red)' },
  cobrada:  { label: 'Cobrada',   bg: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blt)' },
}

const ETAPA_STYLES = {
  prospecto: { label: 'Prospecto', color: 'rgba(90,143,168,0.9)' },
  contactado: { label: 'Contactado', color: 'var(--rmg-blt)' },
  cotizado: { label: 'Cotizado', color: 'var(--rmg-gold)' },
  negociando: { label: 'Negociando', color: 'var(--rmg-purple)' },
  cliente: { label: 'Cliente ✓', color: 'var(--rmg-teal)' },
}

const TIPO_ICON = { visita: '🚗', llamada: '📞', whatsapp: '💬', email: '📧', cotizacion: '📋' }

export default function ClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState('resumen')
  const [showEdit, setShowEdit] = useState(false)

  const { data: cliente, isLoading } = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => api.get(`/clientes/${id}`).then(r => r.data),
  })

  const { data: actividades = [] } = useQuery({
    queryKey: ['actividades', id],
    queryFn: () => api.get(`/pipeline/${id}/actividades`).then(r => r.data),
  })

  const { data: facturas = [], isLoading: loadingFacturas } = useQuery({
    queryKey: ['cxc-cliente', id],
    queryFn: () => api.get('/cxc', { params: { cliente_id: id } }).then(r => r.data),
    enabled: tab === 'cuenta-corriente',
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--rmg-muted)' }}>Cargando...</div>
  )
  if (!cliente) return (
    <div className="text-center py-16" style={{ color: 'var(--rmg-muted)' }}>Cliente no encontrado</div>
  )

  const etapa = ETAPA_STYLES[cliente.etapa_pipeline] || ETAPA_STYLES.prospecto

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/clientes')} className="p-2 rounded-lg hover:bg-black/5 transition-colors mt-1" style={{ color: 'var(--rmg-muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{cliente.razon_social}</h1>
            <span className={`badge-${cliente.segmento}`}>{labelSegmento(cliente.segmento)}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(15, 35, 60,0.06)', color: etapa.color }}>
              {etapa.label}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--rmg-muted)' }}>RUT: {cliente.rut} · Cliente desde {formatFecha(cliente.created_at)}</p>
        </div>
        <button onClick={() => setShowEdit(true)} className="btn-secondary flex items-center gap-2 text-sm">
          <Pencil size={14} /> Editar
        </button>
        <button className="btn-primary flex items-center gap-2 text-sm">
          <FileText size={15} /> Nueva cotización
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {[
          { k: 'resumen', l: 'Resumen' },
          { k: 'cuenta-corriente', l: 'Cuenta corriente' },
          { k: 'actividades', l: `Actividades (${actividades.length})` },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className="px-4 py-2.5 text-sm font-medium transition-all border-b-2"
            style={tab === t.k
              ? { borderColor: 'var(--rmg-blue)', color: 'var(--rmg-blt)' }
              : { borderColor: 'transparent', color: 'var(--rmg-muted)' }
            }>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Info */}
          <div className="rmg-card p-5 space-y-4">
            <h2 className="font-bold">Información de contacto</h2>
            <div className="space-y-3">
              {[
                { icon: Phone, label: 'Teléfono', value: cliente.telefono },
                { icon: Mail,  label: 'Email',    value: cliente.email },
                { icon: MapPin,label: 'Dirección', value: `${cliente.direccion}, ${cliente.comuna}` },
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
              <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{cliente.contacto_nombre}</div>
              <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{cliente.contacto_cargo}</div>
            </div>
          </div>

          {/* Crédito y estado comercial */}
          <div className="space-y-4">
            <div className="rmg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={16} style={{ color: 'var(--rmg-blt)' }} />
                <h2 className="font-bold">Cuenta corriente</h2>
              </div>
              {cliente.credito_activo ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--rmg-muted)' }}>Saldo pendiente</span>
                    <span className="font-bold" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(cliente.saldo_pendiente)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--rmg-muted)' }}>Límite de crédito</span>
                    <span style={{ color: 'var(--rmg-off)' }}>{formatCLP(cliente.limite_credito)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--rmg-muted)' }}>Plazo</span>
                    <span style={{ color: 'var(--rmg-teal)' }}>{cliente.dias_credito} días</span>
                  </div>
                  <div className="h-2 rounded-full mt-2" style={{ background: 'rgba(15, 35, 60,0.06)' }}>
                    <div className="h-2 rounded-full" style={{
                      width: `${Math.min((cliente.saldo_pendiente / cliente.limite_credito) * 100, 100)}%`,
                      background: 'var(--rmg-gold)',
                    }} />
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Cliente al contado</p>
              )}
            </div>

            <div className="rmg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} style={{ color: 'var(--rmg-teal)' }} />
                <h2 className="font-bold">Pipeline</h2>
              </div>
              <div className="text-3xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif', color: etapa.color }}>
                {etapa.label}
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>Etapa actual en el funnel de ventas</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'cuenta-corriente' && (
        <div className="space-y-4">
          {/* Resumen rápido — igual que antes, ahora respaldado por el detalle abajo */}
          <div className="rmg-card p-5">
            {cliente.credito_activo ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Saldo pendiente</div>
                  <div className="font-bold text-lg" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(cliente.saldo_pendiente)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Límite de crédito</div>
                  <div className="font-bold text-lg" style={{ color: 'var(--rmg-off)' }}>{formatCLP(cliente.limite_credito)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Plazo</div>
                  <div className="font-bold text-lg" style={{ color: 'var(--rmg-teal)' }}>{cliente.dias_credito} días</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Facturas</div>
                  <div className="font-bold text-lg" style={{ color: 'var(--rmg-blt)' }}>{facturas.length}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Cliente al contado — sin línea de crédito activa.</p>
            )}
          </div>

          {/* Ledger de facturas CxC de este cliente */}
          <div className="rmg-card overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
              <span className="text-sm font-bold">Facturas por cobrar</span>
              <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{facturas.length} factura{facturas.length !== 1 ? 's' : ''}</span>
            </div>
            {loadingFacturas ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.05)' }} />)}
              </div>
            ) : facturas.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin facturas registradas para este cliente</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(15, 35, 60,0.02)' }}>
                    {['N° Factura', 'Emisión', 'Vencimiento', 'Monto', 'Estado', 'Días'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {facturas.map(f => {
                    const est = ESTADO_FACTURA[f.estado] || ESTADO_FACTURA.al_dia
                    return (
                      <tr key={f.id} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                        <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{f.numero}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)' }}>{f.fecha_emision || '—'}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--rmg-muted)' }}>{f.fecha_vencimiento || '—'}</td>
                        <td className="px-4 py-2.5 font-bold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(f.monto)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{est.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: f.dias_vencida > 0 && f.estado !== 'cobrada' ? 'var(--rmg-red)' : 'var(--rmg-muted)' }}>
                          {f.estado === 'cobrada' ? '—' : (f.dias_vencida > 0 ? `${f.dias_vencida} d. vencida` : `faltan ${-f.dias_vencida} d.`)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'actividades' && (
        <div className="space-y-3">
          {actividades.length === 0 && (
            <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>Sin actividades registradas</div>
          )}
          {actividades.map(a => (
            <div key={a.id} className="rmg-card p-4 flex gap-4">
              <div className="text-2xl">{TIPO_ICON[a.tipo] || '📌'}</div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div className="font-medium text-sm" style={{ color: 'var(--rmg-off)' }}>{a.descripcion}</div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFecha(a.created_at)}</div>
                </div>
                {a.resultado && (
                  <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>Resultado: {a.resultado}</div>
                )}
                {a.proxima_accion && (
                  <div className="text-xs mt-1" style={{ color: 'var(--rmg-gold)' }}>→ {a.proxima_accion} ({formatFecha(a.fecha_proxima)})</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showEdit && (
        <ClienteModal
          cliente={cliente}
          onClose={() => setShowEdit(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['cliente', id] })}
        />
      )}
    </div>
  )
}
