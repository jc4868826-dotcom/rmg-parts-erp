/**
 * RMG Parts — Compra Ágil (submenú bajo ChileCompra)
 *
 * Replica el flujo completo trabajado a mano en el chat para
 * Quilpué/2428-1262-COT26: importar por código → cruce automático con
 * catálogo → fichas técnicas internas → los dos botones de benchmark
 * (compras del mismo solicitante / del mercado en general) → fundamento de
 * cotización con IA (cumple/no cumple + observación sugerida) → precio
 * sugerido. Los cambios de estado (analizando → preparando_postulación →
 * publicada, etc.) y la subida de anexos siguen viviendo en la ficha
 * completa de ChileCompra (/chilecompra) — esta página es la puerta de
 * entrada rápida para el caso Compra Ágil específicamente.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import {
  Zap, Search, Package, TrendingUp, Building2, Globe2, Sparkles,
  ExternalLink, CheckCircle2, XCircle, HelpCircle, Loader2, ChevronDown, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'

const ESTADO_ICONO = {
  cumple: { icon: CheckCircle2, color: 'var(--rmg-teal)' },
  no_cumple: { icon: XCircle, color: 'var(--rmg-red)' },
  no_confirmado: { icon: HelpCircle, color: 'var(--rmg-gold)' },
}

export default function CompraAgilPage() {
  const qc = useQueryClient()
  const [codigo, setCodigo] = useState('')
  const [seleccionId, setSeleccionId] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [panelBenchmark, setPanelBenchmark] = useState(null) // 'solicitante' | 'mercado' | null

  const { data: lista = [], isLoading: cargandoLista } = useQuery({
    queryKey: ['compra-agil'],
    queryFn: () => api.get('/compra-agil').then(r => r.data),
  })

  const { data: detalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ['compra-agil', seleccionId],
    queryFn: () => api.get(`/compra-agil/${seleccionId}`).then(r => r.data),
    enabled: !!seleccionId,
  })

  const importarMut = useMutation({
    mutationFn: (cod) => api.post('/compra-agil/importar', { codigo: cod }).then(r => r.data),
    onSuccess: (op) => {
      toast.success(`Importada: ${op.nombre || op.codigo_externo}`)
      qc.invalidateQueries({ queryKey: ['compra-agil'] })
      setSeleccionId(op.id)
      setCodigo('')
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  })

  const fundamentoMut = useMutation({
    mutationFn: (id) => api.post(`/compra-agil/${id}/fundamento`).then(r => r.data),
    onSuccess: () => {
      toast.success('Fundamento de cotización generado')
      qc.invalidateQueries({ queryKey: ['compra-agil', seleccionId] })
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  })

  const { data: benchmarkSolicitante, isFetching: cargandoBenchSol, refetch: refetchBenchSol } = useQuery({
    queryKey: ['compra-agil', seleccionId, 'benchmark-solicitante', keyword],
    queryFn: () => api.get(`/compra-agil/${seleccionId}/benchmark-solicitante`, { params: { keyword } }).then(r => r.data),
    enabled: false,
  })
  const { data: benchmarkMercado, isFetching: cargandoBenchMer, refetch: refetchBenchMer } = useQuery({
    queryKey: ['compra-agil', 'benchmark-mercado', keyword],
    queryFn: () => api.get('/compra-agil/benchmark-mercado', { params: { keyword } }).then(r => r.data),
    enabled: false,
  })

  const { data: preciosSugeridos } = useQuery({
    queryKey: ['compra-agil', seleccionId, 'precio-sugerido'],
    queryFn: () => api.get(`/compra-agil/${seleccionId}/precio-sugerido`).then(r => r.data),
    enabled: !!seleccionId,
  })

  const dispararBenchmark = (tipo) => {
    if (!keyword.trim()) return toast.error('Escribe una palabra clave (ej. "aceite motor 5w30")')
    setPanelBenchmark(tipo)
    if (tipo === 'solicitante') refetchBenchSol()
    else refetchBenchMer()
  }

  return (
    <div className="p-6 space-y-6" style={{ color: 'var(--rmg-text)' }}>
      <header className="flex items-center gap-3">
        <Zap size={28} style={{ color: 'var(--rmg-gold)' }} />
        <div>
          <h1 className="text-2xl font-bold">Compra Ágil</h1>
          <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Importa una publicación por su código, cruza con el catálogo RMG, compara fichas técnicas y funda el precio — el mismo flujo de siempre, ahora en un clic.
          </p>
        </div>
      </header>

      {/* Importar por código */}
      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(15,35,60,0.08)' }}>
        <input
          value={codigo}
          onChange={e => setCodigo(e.target.value)}
          placeholder="Código de la publicación (ej. 2428-1262-COT26)"
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ border: '1px solid rgba(15,35,60,0.15)' }}
          onKeyDown={e => e.key === 'Enter' && codigo.trim() && importarMut.mutate(codigo.trim())}
        />
        <button
          disabled={!codigo.trim() || importarMut.isPending}
          onClick={() => importarMut.mutate(codigo.trim())}
          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-white disabled:opacity-50"
          style={{ background: 'var(--rmg-teal)' }}
        >
          {importarMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Importar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Listado */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(15,35,60,0.08)' }}>
          <div className="px-4 py-3 text-xs font-semibold uppercase" style={{ color: 'var(--rmg-muted)', borderBottom: '1px solid rgba(15,35,60,0.08)' }}>
            Importadas ({lista.length})
          </div>
          {cargandoLista && <div className="p-4 text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>}
          {!cargandoLista && !lista.length && (
            <div className="p-4 text-sm" style={{ color: 'var(--rmg-muted)' }}>Ninguna todavía — importa una por su código arriba.</div>
          )}
          {lista.map(op => (
            <button
              key={op.id}
              onClick={() => setSeleccionId(op.id)}
              className="w-full text-left px-4 py-3 text-sm"
              style={{
                borderBottom: '1px solid rgba(15,35,60,0.06)',
                background: seleccionId === op.id ? 'rgba(45,201,138,0.08)' : 'transparent',
              }}
            >
              <div className="font-medium truncate">{op.nombre || op.codigo_externo}</div>
              <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{op.organismo_nombre || '—'}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{op.codigo_externo} · {op.estado}</div>
            </button>
          ))}
        </div>

        {/* Detalle */}
        <div className="space-y-4">
          {!seleccionId && (
            <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--rmg-card)', color: 'var(--rmg-muted)', border: '1px dashed rgba(15,35,60,0.15)' }}>
              Selecciona o importa una Compra Ágil para ver el detalle.
            </div>
          )}

          {seleccionId && cargandoDetalle && <div className="p-4 text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando detalle…</div>}

          {seleccionId && detalle && (
            <>
              <div className="rounded-xl p-4" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(15,35,60,0.08)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{detalle.nombre}</h2>
                    <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>
                      {detalle.organismo_nombre} · {detalle.comuna}{detalle.region ? `, ${detalle.region}` : ''}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>
                      Código {detalle.codigo_externo} · Cierre {formatFecha ? formatFecha(detalle.fecha_cierre) : detalle.fecha_cierre}
                      {detalle.presupuesto_estimado ? ` · Presupuesto ref. ${formatCLP(detalle.presupuesto_estimado)}` : ''}
                    </p>
                  </div>
                  {detalle.url_portal && (
                    <a href={detalle.url_portal} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1" style={{ color: 'var(--rmg-teal)' }}>
                      Ver en el portal <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>

              {/* Ítems + cruce con catálogo */}
              <div className="rounded-xl p-4" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(15,35,60,0.08)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Package size={16} /> Ítems y cruce con catálogo</h3>
                  <button
                    onClick={() => fundamentoMut.mutate(seleccionId)}
                    disabled={fundamentoMut.isPending}
                    className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-white disabled:opacity-50"
                    style={{ background: 'var(--rmg-gold)' }}
                  >
                    {fundamentoMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Generar fundamento de cotización
                  </button>
                </div>

                {detalle.items?.map(item => {
                  const precio = preciosSugeridos?.find(p => p.itemId === item.id)
                  let cumplimiento = null
                  try { cumplimiento = item.cumplimiento_json ? JSON.parse(item.cumplimiento_json) : null } catch {}

                  return (
                    <div key={item.id} className="py-3" style={{ borderTop: '1px solid rgba(15,35,60,0.06)' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{item.descripcion_solicitada}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{item.especificacion_tecnica}</div>
                        </div>
                        <div className="text-right text-xs shrink-0">
                          {item.sku_match ? (
                            <>
                              <div className="font-mono font-medium">{item.sku_match}</div>
                              <div style={{ color: 'var(--rmg-muted)' }}>Match {Math.round((item.match_confianza || 0) * 100)}%</div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--rmg-red)' }}>Sin match</span>
                          )}
                        </div>
                      </div>

                      {precio?.sugerido && (
                        <div className="mt-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(45,201,138,0.08)' }}>
                          <TrendingUp size={12} className="inline mr-1" style={{ color: 'var(--rmg-teal)' }} />
                          Precio sugerido: <strong>{formatCLP(precio.sugerido)}</strong> — {precio.motivo}
                          {precio.refPorUnidad ? ` (costo ${formatCLP(precio.costo)})` : ''}
                        </div>
                      )}

                      {cumplimiento && (
                        <div className="mt-2 space-y-1">
                          {cumplimiento.puntos?.map((p, i) => {
                            const est = ESTADO_ICONO[p.estado] || ESTADO_ICONO.no_confirmado
                            const Icon = est.icon
                            return (
                              <div key={i} className="text-xs flex items-start gap-1.5">
                                <Icon size={13} style={{ color: est.color, marginTop: 1 }} />
                                <span><strong>{p.exigencia}:</strong> {p.detalle}</span>
                              </div>
                            )
                          })}
                          {item.observacion_cotizacion && (
                            <div className="mt-2 text-xs italic p-2 rounded-lg" style={{ background: 'rgba(15,35,60,0.04)' }}>
                              "{item.observacion_cotizacion}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Los dos botones de benchmark */}
              <div className="rounded-xl p-4" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(15,35,60,0.08)' }}>
                <h3 className="text-sm font-semibold mb-3">Benchmark de precios</h3>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    placeholder='Palabra clave (ej. "aceite motor 5w30")'
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid rgba(15,35,60,0.15)' }}
                  />
                </div>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => dispararBenchmark('solicitante')}
                    className="flex-1 text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5"
                    style={{ border: '1px solid rgba(15,35,60,0.15)' }}
                  >
                    {cargandoBenchSol ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
                    ¿Este organismo ya lo compró?
                  </button>
                  <button
                    onClick={() => dispararBenchmark('mercado')}
                    className="flex-1 text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5"
                    style={{ border: '1px solid rgba(15,35,60,0.15)' }}
                  >
                    {cargandoBenchMer ? <Loader2 size={14} className="animate-spin" /> : <Globe2 size={14} />}
                    Precio de mercado (cualquier organismo)
                  </button>
                </div>

                {panelBenchmark && (
                  <BenchmarkResultado
                    resultado={panelBenchmark === 'solicitante' ? benchmarkSolicitante : benchmarkMercado}
                    tipo={panelBenchmark}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function BenchmarkResultado({ resultado, tipo }) {
  if (!resultado) return null
  if (resultado.advertencia) {
    return <div className="text-xs p-3 rounded-lg" style={{ background: 'rgba(224,90,78,0.08)', color: 'var(--rmg-red)' }}>{resultado.advertencia}</div>
  }
  const ordenes = resultado.ordenes || []
  const est = resultado.estadisticas || {}
  return (
    <div className="text-xs space-y-2">
      {est.n > 0 ? (
        <div className="p-2 rounded-lg" style={{ background: 'rgba(45,201,138,0.08)' }}>
          {est.n} orden(es) últimos 6 meses · min {formatCLP(est.min)} · promedio {formatCLP(est.promedio)} · max {formatCLP(est.max)}
          {resultado.desdeCache ? ' · (cache)' : ''}
        </div>
      ) : (
        <div className="p-2 rounded-lg" style={{ background: 'rgba(15,35,60,0.04)' }}>Sin resultados para esa palabra clave en los últimos 6 meses.</div>
      )}
      {ordenes.slice(0, 8).map((o, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1.5" style={{ borderTop: '1px solid rgba(15,35,60,0.06)' }}>
          <div className="truncate flex-1">
            <span className="font-medium">{o.descripcion}</span>
            {tipo === 'mercado' && <span style={{ color: 'var(--rmg-muted)' }}> — {o.organismo_nombre}</span>}
          </div>
          <div className="shrink-0 ml-2 text-right">
            {o.precio_unitario ? formatCLP(o.precio_unitario) : '—'}
            {o.url_portal && <a href={o.url_portal} target="_blank" rel="noreferrer" className="ml-1" style={{ color: 'var(--rmg-teal)' }}><ExternalLink size={11} className="inline" /></a>}
          </div>
        </div>
      ))}
    </div>
  )
}
