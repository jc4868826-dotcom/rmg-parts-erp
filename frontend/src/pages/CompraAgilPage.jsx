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
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha } from '@utils/format'
import { ESTADOS as ESTADOS_PIPELINE } from './ChileCompraPage'
import {
  Zap, Package, TrendingUp, Building2, Globe2, Sparkles,
  ExternalLink, CheckCircle2, XCircle, HelpCircle, Loader2, ChevronDown, RefreshCw,
  ClipboardPaste, Paperclip, X, AlertTriangle, Radar, KanbanSquare, FileCheck2, Trophy,
} from 'lucide-react'
import toast from 'react-hot-toast'

// 2026-09-09 — mismo criterio que compraAgilAnalisis.ESTADOS_TERMINALES_CHILECOMPRA
// en el backend: una vez que ChileCompra cierra/anula, ese estado ya no cambia.
const ESTADO_REAL_LABEL = {
  publicada: 'Publicada', cerrada: 'Cerrada', desierta: 'Desierta',
  cancelada: 'Cancelada', proveedor_seleccionado: 'Proveedor seleccionado',
}
const ESTADO_REAL_COLOR = {
  publicada: 'var(--rmg-teal)', cerrada: 'var(--rmg-muted)', desierta: 'var(--rmg-red)',
  cancelada: 'var(--rmg-red)', proveedor_seleccionado: 'var(--rmg-gold)',
}

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

// 2026-09-09 — filtros de búsqueda que el usuario pidió explícitamente
// ("entre que fechas ayer/7/15/30 días? regiones?"), mismo criterio que ya
// existe para Licitaciones. RANGOS son horas (para armar ventanaMs); "todo"
// no existe — 30 días es el techo razonable dado que Compra Ágil se cierra
// rápido y datos más viejos ya no sirven para postular.
const RANGOS_FECHA = [
  { id: '1d', etiqueta: 'Ayer/hoy', horas: 24 },
  { id: '7d', etiqueta: '7 días', horas: 7 * 24 },
  { id: '15d', etiqueta: '15 días', horas: 15 * 24 },
  { id: '30d', etiqueta: '30 días', horas: 30 * 24 },
]

export default function CompraAgilPage() {
  const qc = useQueryClient()
  const [seleccionId, setSeleccionId] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [panelBenchmark, setPanelBenchmark] = useState(null) // 'solicitante' | 'mercado' | null

  // Filtros del detector manual — colapsado por defecto, no molesta a quien
  // solo quiere apretar "Buscar ahora" con los valores de siempre (6h, todas
  // las regiones, estado publicada).
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  // 2026-09-09 — alcance inicial ACOTADO, pedido explícito del usuario en el
  // esquema aprobado ("debe partir por región metropolitana parámetro inicial
  // ayer/hoy...eso es más pequeño...luego se puede amplificar"): mismo default
  // que ahora usa el backend (VENTANA_DEFAULT_MS/REGIONES_DEFAULT en
  // compraAgilAnalisis.js) — antes el botón "Buscar ahora" mandaba 7 días/
  // todas las regiones por su cuenta, sin calzar con lo que el cron ya hacía.
  const [rangoFecha, setRangoFecha] = useState('1d')
  const [regionesSel, setRegionesSel] = useState([13]) // Metropolitana por defecto — [] = todas
  const [ultimosParametros, setUltimosParametros] = useState(null)

  const { data: regionesDisponibles = [] } = useQuery({
    queryKey: ['compra-agil', 'regiones'],
    queryFn: () => api.get('/compra-agil/regiones').then(r => r.data),
    staleTime: Infinity, // lista fija (16 regiones de Chile), no cambia en runtime
  })

  const toggleRegion = (codigo) => {
    setRegionesSel(prev => prev.includes(codigo) ? prev.filter(c => c !== codigo) : [...prev, codigo])
  }

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

  // Detección 100% automática (2026-09-08 noche) — consulta la API OFICIAL
  // de Compra Ágil de Mercado Público (sin navegador) y detecta/importa
  // solo, sin que nadie pegue texto ni código. Corre sola cada 15 min vía
  // cron; este botón la dispara YA. El POST avisa que empezó (responde al
  // toque) y el progreso real se sigue con polling a GET /scraper-estado
  // hasta que `corriendo` sea false — toma segundos, no minutos.
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
    // 2026-09-09 — guarda qué se buscó realmente (estado/ventana/regiones) para
    // mostrarlo debajo del botón; antes esto era invisible.
    if (resumen.parametrosBusqueda) setUltimosParametros(resumen.parametrosBusqueda)
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

  // ── Sincronización de estado REAL desde ChileCompra (2026-09-09, pieza 4) ──
  // Mismo patrón fire-and-forget + polling que la detección automática de
  // arriba. Corre sola cada 2h (compraAgilSyncEstadoCron.js); este botón la
  // dispara ya mismo. Pedido explícito del usuario: "no veo como recibir
  // información del estado desde la api...si se adjudicó etc."
  const [sincronizandoEstado, setSincronizandoEstado] = useState(false)
  const ultimoResumenSyncVisto = useRef(null)

  const { data: syncEstadoData } = useQuery({
    queryKey: ['compra-agil', 'sincronizar-estado-estado'],
    queryFn: () => api.get('/compra-agil/sincronizar-estado-estado').then(r => r.data),
    refetchInterval: sincronizandoEstado ? 4000 : false,
  })

  useEffect(() => {
    if (!syncEstadoData) return
    if (syncEstadoData.corriendo) { setSincronizandoEstado(true); return }
    if (!sincronizandoEstado) return
    setSincronizandoEstado(false)
    const resumen = syncEstadoData.ultimoResumen
    if (!resumen || resumen === ultimoResumenSyncVisto.current) return
    ultimoResumenSyncVisto.current = resumen
    qc.invalidateQueries({ queryKey: ['compra-agil'] })
    if (resumen.cambiosDetectados?.length) {
      toast.success(`${resumen.cambiosDetectados.length} oportunidad(es) cambiaron de estado en ChileCompra.`, { duration: 8000 })
    } else {
      toast(`Sin cambios de estado (${resumen.revisadas ?? 0} revisada(s)).`, { icon: '🔄' })
    }
    if (resumen.errores?.length) {
      toast.error(`${resumen.errores.length} error(es) sincronizando estado: ${resumen.errores[0]}`, { duration: 10000 })
    }
  }, [syncEstadoData, sincronizandoEstado, qc])

  const sincronizarEstadoMut = useMutation({
    mutationFn: () => api.post('/compra-agil/sincronizar-estado-ahora').then(r => r.data),
    onSuccess: (r) => {
      if (r.iniciado === false) {
        toast(r.mensaje || 'Ya hay una sincronización en curso.', { icon: '⏳' })
      } else {
        toast('Actualizando estado real desde ChileCompra…', { icon: '🔄' })
      }
      setSincronizandoEstado(true)
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  })

  const scrapearMut = useMutation({
    mutationFn: () => {
      const horas = RANGOS_FECHA.find(r => r.id === rangoFecha)?.horas || 24 * 7
      return api.post('/compra-agil/scrapear-ahora', {
        ventanaMs: horas * 3600_000,
        regiones: regionesSel,
      }).then(r => r.data)
    },
    onSuccess: (r) => {
      if (r.iniciado === false) {
        toast(r.mensaje || 'Ya hay una búsqueda en curso.', { icon: '⏳' })
      } else {
        toast('Búsqueda iniciada — avisamos cuando termine.', { icon: '🔎' })
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
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Zap size={28} style={{ color: 'var(--rmg-gold)' }} />
          <div>
            <h1 className="text-2xl font-bold">Compra Ágil</h1>
            <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>
              Importa una publicación por su código, cruza con el catálogo RMG, compara fichas técnicas y funda el precio — el mismo flujo de siempre, ahora en un clic.
            </p>
          </div>
        </div>
        {/* 2026-09-09 (pieza 4) — botón manual para forzar la sincronización de
            estado real ChileCompra (adjudicada/cerrada/OC) ya mismo, sin
            esperar el cron cada 2h. */}
        <button
          disabled={sincronizarEstadoMut.isPending || sincronizandoEstado}
          onClick={() => sincronizarEstadoMut.mutate()}
          className="text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          style={{ border: '1px solid rgba(15,35,60,0.15)' }}
        >
          {(sincronizarEstadoMut.isPending || sincronizandoEstado)
            ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Actualizar estado real (ChileCompra)
        </button>
      </header>

      {/* 2026-09-09 (pieza 3) — franja de conteo por estado interno de gestión
          RMG (mismo pipeline que /chilecompra) + acceso directo al Kanban
          completo. Antes esto era invisible desde acá: "tampoco aparece
          pipeline y como cambiar de estado una solicitud". */}
      <div className="rounded-xl p-3 flex items-center gap-2 flex-wrap" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(15,35,60,0.08)' }}>
        <span className="text-xs font-semibold flex items-center gap-1.5 shrink-0" style={{ color: 'var(--rmg-muted)' }}>
          <KanbanSquare size={14} /> Pipeline de gestión:
        </span>
        {ESTADOS_PIPELINE.map(e => {
          const n = lista.filter(op => op.estado === e.k).length
          if (!n) return null
          return (
            <span key={e.k} className="text-xs px-2 py-1 rounded-lg" style={{ background: e.bg, color: e.color }}>
              {e.label} <strong>{n}</strong>
            </span>
          )
        })}
        <Link to="/chilecompra" className="text-xs ml-auto flex items-center gap-1 shrink-0" style={{ color: 'var(--rmg-teal)' }}>
          Ver Kanban completo / cambiar estado <ExternalLink size={11} />
        </Link>
      </div>

      {/* Detección 100% automática (2026-09-08 noche) — API oficial de Compra
          Ágil, sin navegador, que busca e importa cada oportunidad sola, sin
          que nadie pegue código ni texto. Corre sola cada 15 min; este botón
          la dispara ahora mismo. */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--rmg-card)', border: '1px solid rgba(45,201,138,0.35)' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Radar size={16} style={{ color: 'var(--rmg-teal)' }} /> Detección automática
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>
              Corre sola cada 15 minutos: consulta la API oficial de Compra Ágil de Mercado Público por los rubros
              de RMG (lubricantes, baterías, neumáticos, grasas, etc.), detecta publicaciones nuevas y las importa —
              cruce con catálogo, scores y fichas técnicas incluidos. Cero código o texto que pegar.
            </p>
          </div>
          <button
            disabled={scrapearMut.isPending || buscando}
            onClick={() => scrapearMut.mutate()}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-white disabled:opacity-50 shrink-0"
            style={{ background: 'var(--rmg-teal)' }}
          >
            {(scrapearMut.isPending || buscando) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {buscando ? 'Buscando…' : 'Buscar ahora'}
          </button>
        </div>

        {/* 2026-09-09 — filtros pedidos explícitamente: "que estado? entre que
            fechas ayer/7/15/30 días? regiones?". Colapsado por defecto — el
            botón de arriba sigue funcionando solo con "Buscar ahora" usando
            7 días / todas las regiones si nadie toca esto. */}
        <button
          onClick={() => setMostrarFiltros(v => !v)}
          className="text-xs flex items-center gap-1"
          style={{ color: 'var(--rmg-muted)' }}
        >
          Filtros de búsqueda (fecha, región)
          <ChevronDown size={13} style={{ transform: mostrarFiltros ? 'rotate(180deg)' : 'none' }} />
        </button>

        {mostrarFiltros && (
          <div className="pt-2 space-y-3" style={{ borderTop: '1px solid rgba(15,35,60,0.06)' }}>
            <div>
              <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--rmg-muted)' }}>Publicadas en los últimos…</div>
              <div className="flex flex-wrap gap-1.5">
                {RANGOS_FECHA.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setRangoFecha(r.id)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{
                      border: '1px solid rgba(15,35,60,0.15)',
                      background: rangoFecha === r.id ? 'var(--rmg-teal)' : 'transparent',
                      color: rangoFecha === r.id ? '#fff' : 'inherit',
                    }}
                  >
                    {r.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--rmg-muted)' }}>
                Regiones {regionesSel.length ? `(${regionesSel.length} seleccionada(s))` : '(todas)'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {regionesDisponibles.map(r => (
                  <button
                    key={r.codigo}
                    onClick={() => toggleRegion(r.codigo)}
                    className="text-xs px-2.5 py-1 rounded-lg"
                    style={{
                      border: '1px solid rgba(15,35,60,0.15)',
                      background: regionesSel.includes(r.codigo) ? 'var(--rmg-teal)' : 'transparent',
                      color: regionesSel.includes(r.codigo) ? '#fff' : 'inherit',
                    }}
                  >
                    {r.nombre}
                  </button>
                ))}
              </div>
              {!!regionesSel.length && (
                <button onClick={() => setRegionesSel([])} className="text-xs mt-1.5 underline" style={{ color: 'var(--rmg-muted)' }}>
                  Quitar filtro de región (volver a "todas")
                </button>
              )}
            </div>
          </div>
        )}

        {/* Transparencia: qué buscó realmente la última corrida (propia o del
            cron) — antes era invisible, fijo en el código. */}
        {ultimosParametros && (
          <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
            Última búsqueda: estado <strong>{ultimosParametros.estados?.join(', ') || 'publicada'}</strong> ·
            últimas <strong>{Math.round(ultimosParametros.ventanaMs / 3600_000)}h</strong> ·
            región <strong>{ultimosParametros.regiones?.length ? ultimosParametros.regiones.join(', ') : 'todas'}</strong>
          </p>
        )}
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
              {/* 2026-09-09 — antes la lista no mostraba fecha de publicación,
                  región ni presupuesto: había que abrir cada una para saber si
                  vale la pena mirarla. */}
              <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
                {op.region || '—'}{op.fecha_publicacion ? ` · Publicada ${formatFecha ? formatFecha(op.fecha_publicacion) : op.fecha_publicacion}` : ''}
                {op.presupuesto_estimado ? ` · ${formatCLP(op.presupuesto_estimado)}` : ''}
              </div>
              {/* 2026-09-09 (pieza 4) — estado REAL de ChileCompra, distinto del
                  estado de gestión interno de arriba: "no se a cuales postulo,
                  cuales descarto... si se adjudicó etc." */}
              {op.estado_real_chilecompra && (
                <div className="text-xs mt-1 flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded" style={{
                    background: 'rgba(15,35,60,0.05)',
                    color: ESTADO_REAL_COLOR[op.estado_real_chilecompra] || 'var(--rmg-muted)',
                  }}>
                    ChileCompra: {ESTADO_REAL_LABEL[op.estado_real_chilecompra] || op.estado_real_chilecompra}
                  </span>
                  {op.orden_compra_codigo && (
                    <span className="flex items-center gap-0.5" style={{ color: 'var(--rmg-teal)' }}>
                      <Trophy size={11} /> OC {op.orden_compra_codigo}
                    </span>
                  )}
                </div>
              )}
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
                      Código {detalle.codigo_externo} · Estado <strong>{detalle.estado}</strong>
                      {detalle.fecha_publicacion ? ` · Publicada ${formatFecha ? formatFecha(detalle.fecha_publicacion) : detalle.fecha_publicacion}` : ''}
                      {' · '}Cierre {formatFecha ? formatFecha(detalle.fecha_cierre) : detalle.fecha_cierre}
                      {detalle.presupuesto_estimado ? ` · Presupuesto ref. ${formatCLP(detalle.presupuesto_estimado)}` : ''}
                    </p>
                    {/* 2026-09-09 (pieza 4) — estado real ChileCompra + Orden de
                        Compra, cuando ya se conoce (pieza 3) — link directo al
                        Kanban para cambiar el estado de gestión interno. */}
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      {detalle.estado_real_chilecompra && (
                        <span className="text-xs px-2 py-1 rounded-lg font-medium" style={{
                          background: 'rgba(15,35,60,0.05)',
                          color: ESTADO_REAL_COLOR[detalle.estado_real_chilecompra] || 'var(--rmg-muted)',
                        }}>
                          Estado real ChileCompra: {ESTADO_REAL_LABEL[detalle.estado_real_chilecompra] || detalle.estado_real_chilecompra}
                          {detalle.estado_real_actualizado_at ? ` (rev. ${formatFecha ? formatFecha(detalle.estado_real_actualizado_at) : detalle.estado_real_actualizado_at})` : ''}
                        </span>
                      )}
                      {detalle.orden_compra_codigo && (
                        <span className="text-xs px-2 py-1 rounded-lg font-medium flex items-center gap-1" style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>
                          <Trophy size={12} /> Orden de Compra {detalle.orden_compra_codigo}
                        </span>
                      )}
                      <Link to={`/chilecompra?abrir=${detalle.id}`} className="text-xs flex items-center gap-1" style={{ color: 'var(--rmg-teal)' }}>
                        <KanbanSquare size={12} /> Cambiar estado de gestión / ver pipeline
                      </Link>
                    </div>
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

                {/* 2026-09-09 (pieza 2) — avisos de la lectura de anexos/fichas
                    (enriquecerConDocumentosAdjuntos en el backend): de dónde
                    salieron realmente los ítems (línea genérica API vs. anexo
                    leído por IA) y cualquier advertencia de incertidumbre. */}
                {!!detalle.advertencias?.length && (
                  <div className="mb-3 space-y-1">
                    {detalle.advertencias.map((a, i) => (
                      <div key={i} className="text-xs px-3 py-2 rounded-lg flex items-start gap-1.5" style={{ background: 'rgba(244,162,60,0.1)', color: 'var(--rmg-gold)' }}>
                        <AlertTriangle size={13} style={{ marginTop: 1 }} className="shrink-0" /> <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}

                {detalle.items?.map(item => {
                  const precio = preciosSugeridos?.find(p => p.itemId === item.id)
                  let cumplimiento = null
                  try { cumplimiento = item.cumplimiento_json ? JSON.parse(item.cumplimiento_json) : null } catch {}

                  return (
                    <div key={item.id} className="py-3" style={{ borderTop: '1px solid rgba(15,35,60,0.06)' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--rmg-muted)' }}>Nos piden</div>
                          <div className="text-sm font-medium">
                            {item.descripcion_solicitada}
                            {item.cantidad ? ` · ${item.cantidad} ${item.unidad || ''}` : ''}
                          </div>
                          <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{item.especificacion_tecnica}</div>
                        </div>
                        <div className="text-right text-xs shrink-0">
                          <div className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--rmg-muted)' }}>Ofrecemos</div>
                          {item.sku_match ? (
                            <>
                              <div className="font-mono font-medium">{item.sku_match}</div>
                              <div style={{ color: 'var(--rmg-muted)' }}>Match {Math.round((item.match_confianza || 0) * 100)}%</div>
                              {/* 2026-09-09 (pieza 2) — "no esta la parte de fichas
                                  técnicas": ahora se ve si ya hay una adjunta o si
                                  falta (adjuntarFichasAOportunidad la intenta sola
                                  al importar; puede fallar por marca no-Vistony). */}
                              <div className="flex items-center gap-1 justify-end mt-0.5" style={{ color: item.tiene_ficha_tecnica ? 'var(--rmg-teal)' : 'var(--rmg-muted)' }}>
                                <FileCheck2 size={11} /> {item.tiene_ficha_tecnica ? 'Ficha técnica adjunta' : 'Sin ficha técnica'}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--rmg-red)' }}>Sin match en catálogo</span>
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
