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
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import {
  Zap, Package, TrendingUp, Building2, Globe2, Sparkles,
  ExternalLink, CheckCircle2, XCircle, HelpCircle, Loader2, ChevronDown, RefreshCw,
  ClipboardPaste, Paperclip, X, AlertTriangle, Radar,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Lee un File del navegador como base64 puro (sin el prefijo "data:...;base64,")
// — mismo formato que espera chilecompraDocReader.leerAnexos en el backend.
function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const ESTADO_ICONO = {
  cumple: { icon: CheckCircle2, color: 'var(--rmg-teal)' },
  no_cumple: { icon: XCircle, color: 'var(--rmg-red)' },
  no_confirmado: { icon: HelpCircle, color: 'var(--rmg-gold)' },
}

export default function CompraAgilPage() {
  const qc = useQueryClient()
  const [seleccionId, setSeleccionId] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [panelBenchmark, setPanelBenchmark] = useState(null) // 'solicitante' | 'mercado' | null

  // Importación manual (2026-09) — la API que usa /importar está bloqueada
  // por Mercado Público (WAF) desde el servidor real, así que este es el
  // camino que SÍ funciona: pegar el texto de la publicación y/o subir el
  // PDF/imagen/Word, y una IA extrae los ítems (mismo lector que licitaciones).
  const [codigoManual, setCodigoManual] = useState('')
  const [textoManual, setTextoManual] = useState('')
  const [archivosManual, setArchivosManual] = useState([]) // File[]
  const [mostrarManual, setMostrarManual] = useState(false) // fallback: casos fuera de las keywords del scraper

  const { data: lista = [], isLoading: cargandoLista } = useQuery({
    queryKey: ['compra-agil'],
    queryFn: () => api.get('/compra-agil').then(r => r.data),
  })

  const { data: detalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ['compra-agil', seleccionId],
    queryFn: () => api.get(`/compra-agil/${seleccionId}`).then(r => r.data),
    enabled: !!seleccionId,
  })

  // Detección 100% automática (2026-09) — navega el buscador público con un
  // navegador real (headless) y detecta/importa solo, sin que nadie pegue
  // texto ni código. Corre sola cada 2h vía cron; este botón la dispara YA.
  //
  // OJO: la búsqueda tarda 1-3 min (recorre cada rubro + cada ficha nueva) y
  // el proxy de Render corta conexiones HTTP así de largas antes de que
  // terminen — se confirmó en producción que eso mostraba "Network Error" en
  // el navegador aunque el servidor seguía trabajando bien de fondo. Por eso
  // el POST solo AVISA que empezó (responde al toque) y el progreso real se
  // sigue con polling a GET /scraper-estado hasta que `corriendo` sea false.
  const [buscando, setBuscando] = useState(false)
  const ultimoResumenVisto = useRef(null)

  const { data: scraperEstado } = useQuery({
    queryKey: ['compra-agil', 'scraper-estado'],
    queryFn: () => api.get('/compra-agil/scraper-estado').then(r => r.data),
    refetchInterval: buscando ? 4000 : false,
  })

  useEffect(() => {
    if (!scraperEstado) return
    if (scraperEstado.corriendo) { setBuscando(true); return }
    if (!buscando) return // no era nuestra corrida (ej. la del cron) — no avisar nada
    setBuscando(false)
    const resumen = scraperEstado.ultimoResumen
    if (!resumen || resumen === ultimoResumenVisto.current) return
    ultimoResumenVisto.current = resumen
    qc.invalidateQueries({ queryKey: ['compra-agil'] })
    if (resumen.importadas?.length) {
      toast.success(`${resumen.importadas.length} oportunidad(es) nueva(s) detectada(s) e importada(s) automáticamente.`)
    } else {
      toast(`Sin oportunidades nuevas por ahora (${resumen.codigosVistos ?? 0} revisadas).`, { icon: '🔎' })
    }
    if (resumen.errores?.length) {
      toast.error(`${resumen.errores.length} error(es) durante la búsqueda: ${resumen.errores[0]}`, { duration: 12000 })
    }
  }, [scraperEstado, buscando, qc])

  const scrapearMut = useMutation({
    mutationFn: () => api.post('/compra-agil/scrapear-ahora', {}).then(r => r.data),
    onSuccess: (r) => {
      if (r.iniciado === false) {
        toast(r.mensaje || 'Ya hay una búsqueda en curso.', { icon: '⏳' })
      } else {
        toast('Búsqueda iniciada — puede tardar 1-3 minutos, avisamos cuando termine.', { icon: '🔎' })
      }
      setBuscando(true)
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  })

  const importarManualMut = useMutation({
    mutationFn: async ({ codigo: cod, texto, archivos }) => {
      const documentos = await Promise.all(archivos.map(async (f) => ({
        base64: await archivoABase64(f), mediaType: f.type, nombre: f.name,
      })))
      return api.post('/compra-agil/importar-manual', { codigo: cod, texto, documentos }).then(r => r.data)
    },
    onSuccess: (op) => {
      toast.success(`Importada: ${op.nombre || op.codigo_externo}`)
      qc.invalidateQueries({ queryKey: ['compra-agil'] })
      setSeleccionId(op.id)
      setCodigoManual(''); setTextoManual(''); setArchivosManual([])
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

      {/* Detección 100% automática (2026-09) — navegador headless que busca y
          lee cada oportunidad sola, sin que nadie pegue código ni texto.
          Corre sola cada 2h; este botón la dispara ahora mismo. */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(45,201,138,0.35)' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Radar size={16} style={{ color: 'var(--rmg-teal)' }} /> Detección automática
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>
              Corre sola cada 2 horas: busca en Mercado Público por los rubros de RMG (lubricantes, baterías,
              neumáticos, grasas, etc.), detecta publicaciones nuevas y las importa — cruce con catálogo, scores
              y fichas técnicas incluidos. Cero código o texto que pegar.
            </p>
          </div>
          <button
            disabled={scrapearMut.isPending || buscando}
            onClick={() => scrapearMut.mutate()}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-white disabled:opacity-50 shrink-0"
            style={{ background: 'var(--rmg-teal)' }}
          >
            {(scrapearMut.isPending || buscando) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {buscando ? 'Buscando… (1-3 min)' : 'Buscar ahora'}
          </button>
        </div>
      </div>

      {/* Fallback manual — solo para casos puntuales fuera de las palabras clave
          del rubro (ej. algo que RMG quiera cotizar igual aunque no calce con
          el filtro automático). La detección automática de arriba es el
          camino normal — esto queda colapsado a propósito. */}
      <div className="rounded-xl" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(15,35,60,0.08)' }}>
        <button
          onClick={() => setMostrarManual(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <ClipboardPaste size={15} style={{ color: 'var(--rmg-muted)' }} /> Agregar una puntual a mano (código fuera del rubro automático)
          </span>
          <ChevronDown size={16} style={{ transform: mostrarManual ? 'rotate(180deg)' : 'none', color: 'var(--rmg-muted)' }} />
        </button>
        {mostrarManual && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
              Abre la publicación en <a href="https://buscador.mercadopublico.cl" target="_blank" rel="noreferrer" style={{ color: 'var(--rmg-teal)' }}>buscador.mercadopublico.cl</a>,
              copia el código y el texto de lo que piden (o descarga el PDF si trae anexo) y pégalo/súbelo acá — una IA lee lo que sea (texto plano o PDF) y extrae los ítems.
            </p>
            <input
              value={codigoManual}
              onChange={e => setCodigoManual(e.target.value)}
              placeholder="Código de la publicación (ej. 1493-495-COT26)"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: '1px solid rgba(15,35,60,0.15)' }}
            />
            <textarea
              value={textoManual}
              onChange={e => setTextoManual(e.target.value)}
              placeholder="Pega acá el texto de lo que piden (opcional si subes un PDF)…"
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: '1px solid rgba(15,35,60,0.15)' }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer" style={{ border: '1px solid rgba(15,35,60,0.15)' }}>
                <Paperclip size={14} /> Adjuntar PDF/imagen/Word
                <input
                  type="file" multiple hidden accept=".pdf,.doc,.docx,image/*"
                  onChange={e => setArchivosManual(prev => [...prev, ...Array.from(e.target.files || [])])}
                />
              </label>
              {archivosManual.map((f, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1" style={{ background: 'rgba(15,35,60,0.04)' }}>
                  {f.name}
                  <button onClick={() => setArchivosManual(prev => prev.filter((_, j) => j !== i))}><X size={12} /></button>
                </span>
              ))}
            </div>
            <button
              disabled={!codigoManual.trim() || (!textoManual.trim() && !archivosManual.length) || importarManualMut.isPending}
              onClick={() => importarManualMut.mutate({ codigo: codigoManual.trim(), texto: textoManual.trim(), archivos: archivosManual })}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-white disabled:opacity-50"
              style={{ background: 'var(--rmg-teal)' }}
            >
              {importarManualMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Leer con IA e importar
            </button>
          </div>
        )}
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
