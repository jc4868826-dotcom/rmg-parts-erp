/**
 * RMG Parts — Asistente de Oportunidades ChileCompra / Mercado Público
 * Kanban por estado · Análisis diario 9AM (cron) + botón manual ·
 * Lectura IA de anexos · Cruce con catálogo · Score rentabilidad/seguridad
 *
 * Flujo: detectada → analizando → descartada | preparando_postulacion →
 *        publicada → adjudicada | no_adjudicada
 * "publicada" es SIEMPRE una confirmación manual — el sistema nunca envía
 * una oferta por sí solo, solo prepara y el humano confirma que ya la subió.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha, formatRelativo, formatPct } from '@utils/format'
import DocumentosPanel from '@components/DocumentosPanel'
import {
  Landmark, Search, RefreshCw, X, AlertTriangle, CheckCircle2,
  XCircle, Clock, FileSearch, ClipboardCheck, Send, Trophy, Ban,
  MapPin, Calendar, Package, TrendingUp, ShieldCheck, ExternalLink,
  History, ChevronDown, Sparkles, ListChecks, Truck
} from 'lucide-react'
import toast from 'react-hot-toast'

const REGIONES = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana de Santiago', "Libertador General Bernardo O'Higgins",
  'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo', 'Magallanes y de la Antártica Chilena',
]

const ESTADOS = [
  { k: 'detectada',               label: 'Detectada',              color: 'var(--rmg-blue)', bg: 'rgba(56,182,255,0.1)',   icon: FileSearch },
  { k: 'analizando',              label: 'Analizando',             color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.12)',  icon: RefreshCw },
  { k: 'preparando_postulacion',  label: 'Preparando postulación', color: '#a78bfa',         bg: 'rgba(167,139,250,0.12)', icon: ClipboardCheck },
  { k: 'publicada',               label: 'Publicada',              color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.12)',  icon: Send },
  { k: 'adjudicada',              label: 'Adjudicada',             color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.18)',  icon: Trophy },
  { k: 'no_adjudicada',           label: 'No adjudicada',          color: 'var(--rmg-muted)', bg: 'rgba(15,35,60,0.05)',   icon: XCircle },
  { k: 'descartada',              label: 'Descartada',             color: 'var(--rmg-red)',  bg: 'rgba(224,90,78,0.1)',    icon: Ban },
]
const ESTADO_MAP = Object.fromEntries(ESTADOS.map(e => [e.k, e]))
const KANBAN_ESTADOS = ['detectada', 'analizando', 'preparando_postulacion', 'publicada']

const scoreColor = (s) => s == null ? 'var(--rmg-muted)' : s >= 70 ? 'var(--rmg-teal)' : s >= 40 ? 'var(--rmg-gold)' : 'var(--rmg-red)'

const diasParaCierre = (fecha) => {
  if (!fecha) return null
  return Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24))
}

export default function ChileCompraPage() {
  const qc = useQueryClient()
  const [filtros, setFiltros] = useState({ region: '', dias_vencimiento: '', q: '' })
  const [seleccionId, setSeleccionId] = useState(null)

  const params = {
    region: filtros.region || undefined,
    dias_vencimiento: filtros.dias_vencimiento || undefined,
    q: filtros.q || undefined,
  }

  const { data: oportunidades = [], isLoading } = useQuery({
    queryKey: ['chilecompra', params],
    queryFn: () => api.get('/chilecompra', { params }).then(r => r.data),
    staleTime: 60_000,
  })

  const analisisMut = useMutation({
    mutationFn: () => api.post('/chilecompra/ejecutar-analisis').then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chilecompra'] })
      const n = data?.nuevas ?? data?.total ?? 0
      toast.success(n > 0 ? `Análisis completo: ${n} oportunidad(es) nueva(s)` : 'Análisis completo: sin oportunidades nuevas')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al ejecutar el análisis'),
  })

  const porEstado = (estado) => oportunidades.filter(o => o.estado === estado)
  const totalAbierto = oportunidades.filter(o => !['descartada', 'adjudicada', 'no_adjudicada'].includes(o.estado))
  const totalAdjudicado = oportunidades.filter(o => o.estado === 'adjudicada').reduce((s, o) => s + (o.adjudicado_monto || 0), 0)
  const urgentes = oportunidades.filter(o => {
    const d = diasParaCierre(o.fecha_cierre)
    return d != null && d >= 0 && d <= 3 && !['descartada', 'adjudicada', 'no_adjudicada'].includes(o.estado)
  })

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            <Landmark size={22} style={{ color: 'var(--rmg-blue)' }} /> ChileCompra
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
            Mercado Público · Oportunidades detectadas, analizadas y en postulación
          </p>
        </div>
        <button onClick={() => analisisMut.mutate()} disabled={analisisMut.isPending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
          style={{ background: 'var(--rmg-blue)', color: '#fff' }}>
          <RefreshCw size={15} className={analisisMut.isPending ? 'animate-spin' : ''} />
          {analisisMut.isPending ? 'Analizando…' : 'Hacer análisis ahora'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>En proceso</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{totalAbierto.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>oportunidades activas</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Por vencer (≤3 días)</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: urgentes.length ? 'var(--rmg-red)' : 'var(--rmg-blt)' }}>{urgentes.length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>requieren acción pronto</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Publicadas</div>
          <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-teal)' }}>{porEstado('publicada').length}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>esperando resultado</div>
        </div>
        <div className="rmg-card p-4">
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>Adjudicado</div>
          <div className="font-black text-2xl precio-clp" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-teal)' }}>{formatCLP(totalAdjudicado)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{porEstado('adjudicada').length} proceso(s) ganado(s)</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rmg-card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }} />
          <input value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
            placeholder="Buscar por nombre u organismo…"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)' }} />
        </div>
        <select value={filtros.region} onChange={e => setFiltros(f => ({ ...f, region: e.target.value }))}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }}>
          <option value="">Todas las regiones</option>
          {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filtros.dias_vencimiento} onChange={e => setFiltros(f => ({ ...f, dias_vencimiento: e.target.value }))}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }}>
          <option value="">Cualquier plazo</option>
          <option value="1">Cierra en 1 día</option>
          <option value="3">Cierra en 3 días</option>
          <option value="7">Cierra en 7 días</option>
          <option value="15">Cierra en 15 días</option>
        </select>
        {(filtros.region || filtros.dias_vencimiento || filtros.q) && (
          <button onClick={() => setFiltros({ region: '', dias_vencimiento: '', q: '' })}
            className="text-xs px-2.5 py-2 rounded-lg font-medium" style={{ color: 'var(--rmg-muted)' }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Kanban */}
      {isLoading ? (
        <div className="rmg-card p-16 text-center" style={{ color: 'var(--rmg-muted)' }}>Cargando oportunidades…</div>
      ) : (
        <div className="grid grid-cols-4 gap-4 items-start">
          {KANBAN_ESTADOS.map(estKey => {
            const est = ESTADO_MAP[estKey]
            const Icon = est.icon
            const items = porEstado(estKey)
            return (
              <div key={estKey} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Icon size={14} style={{ color: est.color }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{est.label}</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: est.bg, color: est.color }}>{items.length}</span>
                </div>
                <div className="space-y-2 min-h-[80px]">
                  {items.map(op => <OportunidadCard key={op.id} op={op} onClick={() => setSeleccionId(op.id)} />)}
                  {items.length === 0 && (
                    <div className="rmg-card p-4 text-center text-xs" style={{ color: 'var(--rmg-muted)', opacity: 0.6 }}>Sin oportunidades</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cerradas: adjudicada / no adjudicada / descartada — resumen colapsado */}
      <ResultadosCerrados oportunidades={oportunidades} onSelect={setSeleccionId} />

      {seleccionId && (
        <DetalleModal id={seleccionId} onClose={() => setSeleccionId(null)} />
      )}
    </div>
  )
}

// ── Card de kanban ──────────────────────────────────────────────────────────
function OportunidadCard({ op, onClick }) {
  const dias = diasParaCierre(op.fecha_cierre)
  const urgente = dias != null && dias >= 0 && dias <= 3

  return (
    <button onClick={onClick} type="button" className="rmg-card p-3 w-full text-left transition-all hover:shadow-md"
      style={urgente ? { border: '1px solid rgba(224,90,78,0.3)' } : undefined}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: op.fuente === 'licitacion' ? 'rgba(56,182,255,0.12)' : 'rgba(167,139,250,0.12)', color: op.fuente === 'licitacion' ? 'var(--rmg-blue)' : '#a78bfa' }}>
          {op.fuente === 'licitacion' ? 'Licitación' : 'Compra Ágil'}
        </span>
        {op.score_total != null && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${scoreColor(op.score_total)}22`, color: scoreColor(op.score_total) }}>
            {Math.round(op.score_total)}
          </span>
        )}
      </div>
      <div className="text-sm font-semibold line-clamp-2 mb-1" style={{ color: 'var(--rmg-off)' }}>{op.nombre || op.codigo_externo}</div>
      <div className="text-xs truncate mb-2" style={{ color: 'var(--rmg-muted)' }}>{op.organismo_nombre || '—'}</div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1" style={{ color: 'var(--rmg-muted)' }}>
          <MapPin size={11} />{op.comuna || op.region || '—'}
        </span>
        {dias != null && (
          <span className="flex items-center gap-1 font-semibold" style={{ color: urgente ? 'var(--rmg-red)' : 'var(--rmg-muted)' }}>
            <Clock size={11} />{dias >= 0 ? `${dias}d` : 'vencida'}
          </span>
        )}
      </div>
      {op.presupuesto_estimado != null && (
        <div className="text-xs font-bold mt-1.5 precio-clp" style={{ color: 'var(--rmg-blt)' }}>{formatCLP(op.presupuesto_estimado)}</div>
      )}
    </button>
  )
}

// ── Resultados cerrados (adjudicada / no adjudicada / descartada) ──────────
function ResultadosCerrados({ oportunidades, onSelect }) {
  const [abierto, setAbierto] = useState(false)
  const cerradas = oportunidades.filter(o => ['adjudicada', 'no_adjudicada', 'descartada'].includes(o.estado))
  if (!cerradas.length) return null

  return (
    <div className="rmg-card p-4">
      <button onClick={() => setAbierto(!abierto)} className="flex items-center gap-2 w-full text-left">
        <History size={14} style={{ color: 'var(--rmg-muted)' }} />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
          Resultados y descartes ({cerradas.length})
        </span>
        <ChevronDown size={14} className={`ml-auto transition-transform ${abierto ? 'rotate-180' : ''}`} style={{ color: 'var(--rmg-muted)' }} />
      </button>
      {abierto && (
        <div className="mt-3 space-y-1.5">
          {cerradas.map(op => {
            const est = ESTADO_MAP[op.estado]
            const Icon = est.icon
            return (
              <button key={op.id} onClick={() => onSelect(op.id)} type="button"
                className="flex items-center justify-between w-full text-left text-xs rounded-lg px-3 py-2 transition-colors hover:bg-black/[0.03]"
                style={{ background: 'rgba(15,35,60,0.015)', border: '1px solid rgba(15,35,60,0.05)' }}>
                <span className="flex items-center gap-2 min-w-0">
                  <Icon size={12} style={{ color: est.color, flexShrink: 0 }} />
                  <span className="truncate font-medium" style={{ color: 'var(--rmg-off)' }}>{op.nombre || op.codigo_externo}</span>
                </span>
                <span className="flex items-center gap-3 flex-shrink-0">
                  {op.estado === 'adjudicada' && op.adjudicado_monto && (
                    <span className="font-bold precio-clp" style={{ color: 'var(--rmg-teal)' }}>{formatCLP(op.adjudicado_monto)}</span>
                  )}
                  <span className="font-semibold px-1.5 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{est.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Modal de detalle ─────────────────────────────────────────────────────────
function DetalleModal({ id, onClose }) {
  const qc = useQueryClient()
  const [verChecklist, setVerChecklist] = useState(false)

  const { data: op, isLoading } = useQuery({
    queryKey: ['chilecompra-detalle', id],
    queryFn: () => api.get(`/chilecompra/${id}`).then(r => r.data),
  })

  const { data: checklistData } = useQuery({
    queryKey: ['chilecompra-checklist', id],
    queryFn: () => api.get(`/chilecompra/${id}/checklist`).then(r => r.data),
    enabled: verChecklist || op?.estado === 'preparando_postulacion',
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['chilecompra'] })
    qc.invalidateQueries({ queryKey: ['chilecompra-detalle', id] })
  }

  const cambiarEstadoMut = useMutation({
    mutationFn: (body) => api.patch(`/chilecompra/${id}/estado`, body).then(r => r.data),
    onSuccess: (data) => {
      invalidar()
      if (data?.advertencia) toast.error(data.advertencia, { duration: 7000 })
      else toast.success('Estado actualizado')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al cambiar estado'),
  })

  const analizarMut = useMutation({
    mutationFn: () => api.post(`/chilecompra/${id}/analizar`).then(r => r.data),
    onSuccess: () => { invalidar(); toast.success('Anexos leídos y oportunidad re-analizada') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al analizar. ¿Subiste los anexos PDF?'),
  })

  const handleDescartar = () => {
    const motivo = window.prompt('Motivo del descarte (obligatorio):')
    if (motivo === null) return
    if (!motivo.trim()) { toast.error('Debes indicar un motivo'); return }
    cambiarEstadoMut.mutate({ estado: 'descartada', motivo_descarte: motivo.trim() })
  }

  const handlePublicar = () => {
    if (!window.confirm('Confirma que YA subiste la cotización/oferta manualmente en el portal de Mercado Público. RMG OS nunca envía ofertas por sí solo — esta acción solo registra que la publicación ya fue hecha por ti. ¿Confirmar?')) return
    cambiarEstadoMut.mutate({ estado: 'publicada' })
  }

  const handleResultado = (resultado) => {
    if (resultado === 'adjudicada') {
      const monto = window.prompt('Monto adjudicado (CLP):')
      if (monto === null) return
      const adjudicado_a = window.prompt('Adjudicado a (nombre proveedor ganador, o "RMG" si fuimos nosotros):') || undefined
      cambiarEstadoMut.mutate({ estado: 'adjudicada', adjudicado_monto: Number(monto) || null, adjudicado_a })
    } else {
      cambiarEstadoMut.mutate({ estado: 'no_adjudicada' })
    }
  }

  if (isLoading || !op) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,35,60,0.4)' }}>
        <div className="rmg-card p-8" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>
      </div>
    )
  }

  const est = ESTADO_MAP[op.estado]
  const EstIcon = est.icon
  const dias = diasParaCierre(op.fecha_cierre)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 px-4" style={{ background: 'rgba(15,35,60,0.4)' }} onClick={onClose}>
      <div className="rmg-card w-full max-w-3xl p-0 overflow-hidden" style={{ background: 'var(--rmg-surface)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b" style={{ borderColor: 'var(--rmg-border)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: op.fuente === 'licitacion' ? 'rgba(56,182,255,0.12)' : 'rgba(167,139,250,0.12)', color: op.fuente === 'licitacion' ? 'var(--rmg-blue)' : '#a78bfa' }}>
                {op.fuente === 'licitacion' ? 'Licitación' : 'Compra Ágil'}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>
                <EstIcon size={11} />{est.label}
              </span>
              <span className="text-xs font-mono" style={{ color: 'var(--rmg-muted)' }}>{op.codigo_externo}</span>
            </div>
            <h2 className="text-lg font-black leading-tight" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-off)' }}>{op.nombre || op.codigo_externo}</h2>
            <div className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{op.organismo_nombre}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 flex-shrink-0" style={{ color: 'var(--rmg-muted)' }}><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {op.motivo_descarte && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(224,90,78,0.08)', color: 'var(--rmg-red)' }}>
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span><strong>Descartada:</strong> {op.motivo_descarte}</span>
            </div>
          )}

          {op.estado === 'adjudicada' && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(45,201,138,0.1)', color: 'var(--rmg-teal)' }}>
              <Trophy size={15} className="flex-shrink-0 mt-0.5" />
              <span><strong>Adjudicada</strong>{op.adjudicado_a ? ` a ${op.adjudicado_a}` : ''}{op.adjudicado_monto ? ` · ${formatCLP(op.adjudicado_monto)}` : ''}</span>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow icon={MapPin} label="Ubicación" value={[op.direccion_entrega, op.comuna, op.region].filter(Boolean).join(', ') || '—'} />
            <InfoRow icon={Calendar} label="Cierre" value={op.fecha_cierre ? `${formatFecha(op.fecha_cierre)}${dias != null ? ` (${dias >= 0 ? `${dias}d` : 'vencida'})` : ''}` : '—'} />
            <InfoRow icon={Truck} label="Plazo de entrega" value={op.plazo_entrega || 'No especificado'} />
            <InfoRow icon={Package} label="Presupuesto estimado" value={op.presupuesto_estimado ? formatCLP(op.presupuesto_estimado) : 'No informado'} />
          </div>

          {op.url_portal && (
            <a href={op.url_portal} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-medium w-fit" style={{ color: 'var(--rmg-blue)' }}>
              <ExternalLink size={13} /> Ver publicación en Mercado Público
            </a>
          )}

          {/* Scores */}
          {(op.score_total != null || op.cobertura_catalogo_pct != null) && (
            <div className="rmg-card p-3 space-y-2.5" style={{ background: 'rgba(15,35,60,0.02)' }}>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Análisis</div>
              <ScoreBar label="Score total" value={op.score_total} />
              <ScoreBar label="Rentabilidad" value={op.score_rentabilidad} />
              <ScoreBar label="Seguridad" value={op.score_seguridad} />
              {op.cobertura_catalogo_pct != null && (
                <div className="flex items-center justify-between text-xs pt-1" style={{ color: 'var(--rmg-muted)' }}>
                  <span>Cobertura de catálogo</span>
                  <span className="font-bold" style={{ color: 'var(--rmg-off)' }}>{Math.round(op.cobertura_catalogo_pct * 100)}%</span>
                </div>
              )}
              {op.tiene_exigencia_garantia != null && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Chip on={!!op.tiene_exigencia_garantia} label="Exige garantía" />
                  <Chip on={!!op.tiene_exigencia_sds} label="Exige SDS/ficha técnica" />
                  {op.tiene_demandas != null && <Chip on={!!op.tiene_demandas} label="Demandas registradas" negative />}
                </div>
              )}
            </div>
          )}

          {op.resumen_ia && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--rmg-muted)' }}>
                <Sparkles size={12} /> Resumen IA
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--rmg-off)' }}>{op.resumen_ia}</p>
            </div>
          )}

          {/* Ítems */}
          {op.items?.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--rmg-muted)' }}>
                Ítems solicitados ({op.items.length})
              </div>
              <div className="rmg-card overflow-hidden p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'rgba(15,35,60,0.03)' }}>
                      {['Descripción', 'Cant.', 'SKU RMG', 'Margen', ''].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {op.items.map(it => (
                      <tr key={it.id} style={{ borderTop: '1px solid rgba(15,35,60,0.04)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--rmg-off)' }}>{it.descripcion_solicitada}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{it.cantidad} {it.unidad || ''}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: it.cubierto ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>{it.sku_match || 'Sin cobertura'}</td>
                        <td className="px-3 py-2 font-semibold" style={{ color: 'var(--rmg-off)' }}>{it.margen_pct_estimado != null ? formatPct(it.margen_pct_estimado) : '—'}</td>
                        <td className="px-3 py-2">{it.cubierto ? <CheckCircle2 size={13} style={{ color: 'var(--rmg-teal)' }} /> : <XCircle size={13} style={{ color: 'var(--rmg-red)' }} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Checklist */}
          {(verChecklist || op.estado === 'preparando_postulacion') && checklistData?.checklist && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--rmg-muted)' }}>
                <ListChecks size={12} /> Checklist para postular
              </div>
              <div className="space-y-1">
                {checklistData.checklist.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg" style={{ background: 'rgba(15,35,60,0.02)' }}>
                    {c.obligatorio ? <AlertTriangle size={13} style={{ color: 'var(--rmg-gold)', flexShrink: 0 }} /> : <CheckCircle2 size={13} style={{ color: 'var(--rmg-muted)', flexShrink: 0 }} />}
                    <span style={{ color: 'var(--rmg-off)' }}>{c.item}</span>
                    {!c.obligatorio && <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--rmg-muted)' }}>opcional</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!verChecklist && op.estado !== 'preparando_postulacion' && (
            <button onClick={() => setVerChecklist(true)} className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--rmg-blue)' }}>
              <ListChecks size={13} /> Ver checklist de documentos para postular
            </button>
          )}

          {/* Anexos */}
          <DocumentosPanel entidad="oportunidad_chilecompra" entidadId={op.id} titulo="Anexos / Bases" />

          {/* Historial */}
          {op.historial?.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--rmg-muted)' }}>
                <History size={12} /> Historial
              </div>
              <div className="space-y-1.5">
                {op.historial.map(h => (
                  <div key={h.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--rmg-blue)' }} />
                    <span style={{ color: 'var(--rmg-off)' }}>{h.tipo_evento.replace(/_/g, ' ')}</span>
                    {h.detalle && <span>· {h.detalle}</span>}
                    <span className="ml-auto flex-shrink-0">{formatRelativo(h.fecha_evento)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-t" style={{ borderColor: 'var(--rmg-border)', background: 'rgba(15,35,60,0.015)' }}>
          {op.estado === 'detectada' && (
            <>
              <ActionBtn onClick={() => cambiarEstadoMut.mutate({ estado: 'analizando' })} busy={cambiarEstadoMut.isPending}
                icon={RefreshCw} label="Analizar con IA" color="var(--rmg-blue)" bg="rgba(56,182,255,0.1)" />
              <ActionBtn onClick={handleDescartar} busy={cambiarEstadoMut.isPending} icon={Ban} label="Descartar" color="var(--rmg-red)" bg="rgba(224,90,78,0.08)" />
            </>
          )}
          {op.estado === 'analizando' && (
            <>
              <ActionBtn onClick={() => analizarMut.mutate()} busy={analizarMut.isPending}
                icon={Sparkles} label={analizarMut.isPending ? 'Leyendo anexos…' : 'Leer anexos y calcular score'} color="var(--rmg-blue)" bg="rgba(56,182,255,0.1)" />
              <ActionBtn onClick={() => cambiarEstadoMut.mutate({ estado: 'preparando_postulacion' })} busy={cambiarEstadoMut.isPending}
                icon={ClipboardCheck} label="Preparar postulación" color="#a78bfa" bg="rgba(167,139,250,0.12)" />
              <ActionBtn onClick={handleDescartar} busy={cambiarEstadoMut.isPending} icon={Ban} label="Descartar" color="var(--rmg-red)" bg="rgba(224,90,78,0.08)" />
            </>
          )}
          {op.estado === 'preparando_postulacion' && (
            <>
              <ActionBtn onClick={handlePublicar} busy={cambiarEstadoMut.isPending}
                icon={Send} label="Ya la publiqué en el portal" color="var(--rmg-teal)" bg="rgba(45,201,138,0.12)" />
              <ActionBtn onClick={handleDescartar} busy={cambiarEstadoMut.isPending} icon={Ban} label="Descartar" color="var(--rmg-red)" bg="rgba(224,90,78,0.08)" />
            </>
          )}
          {op.estado === 'publicada' && (
            <>
              <ActionBtn onClick={() => handleResultado('adjudicada')} busy={cambiarEstadoMut.isPending}
                icon={Trophy} label="Marcar adjudicada" color="var(--rmg-teal)" bg="rgba(45,201,138,0.12)" />
              <ActionBtn onClick={() => handleResultado('no_adjudicada')} busy={cambiarEstadoMut.isPending}
                icon={XCircle} label="Marcar no adjudicada" color="var(--rmg-muted)" bg="rgba(15,35,60,0.05)" />
            </>
          )}
          {['descartada', 'adjudicada', 'no_adjudicada'].includes(op.estado) && (
            <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Estado final · sin más acciones</span>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--rmg-muted)' }} />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{label}</div>
        <div className="text-sm font-medium" style={{ color: 'var(--rmg-off)' }}>{value}</div>
      </div>
    </div>
  )
}

function ScoreBar({ label, value }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  const color = scoreColor(value)
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span style={{ color: 'var(--rmg-muted)' }}>{label}</span>
        <span className="font-bold" style={{ color }}>{value != null ? Math.round(value) : '—'}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15,35,60,0.06)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function Chip({ on, label, negative }) {
  const activo = negative ? on : on
  const color = on ? (negative ? 'var(--rmg-red)' : 'var(--rmg-gold)') : 'var(--rmg-muted)'
  const bg = on ? (negative ? 'rgba(224,90,78,0.1)' : 'rgba(244,162,60,0.12)') : 'rgba(15,35,60,0.04)'
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color, background: bg }}>
      {on ? '✓ ' : '— '}{label}
    </span>
  )
}

function ActionBtn({ onClick, busy, icon: Icon, label, color, bg }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-all disabled:opacity-50"
      style={{ background: bg, color }}>
      <Icon size={13} className={busy ? 'animate-spin' : ''} /> {label}
    </button>
  )
}
