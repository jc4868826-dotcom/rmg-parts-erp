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
import { useState, useEffect, useRef, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatFecha, formatRelativo, formatPct } from '@utils/format'
import DocumentosPanel from '@components/DocumentosPanel'
import {
  Landmark, Search, RefreshCw, X, AlertTriangle, CheckCircle2,
  XCircle, Clock, FileSearch, ClipboardCheck, Send, Trophy, Ban,
  MapPin, Calendar, Package, TrendingUp, ShieldCheck, ExternalLink,
  History, ChevronDown, Sparkles, ListChecks, Truck, Undo2, FileStack, Eraser, Zap, Loader2,
  Building2, Globe2, ClipboardPaste, Paperclip,
} from 'lucide-react'
import toast from 'react-hot-toast'

// 2026-09-09 — caso real que expuso el hueco: "2428-1262-COT26" (Quilpué)
// nunca quedó guardado como registro real en este sistema — solo existía como
// referencia en comentarios del código de un ejercicio manual anterior. Esta
// función (traída de la página separada "/compra-agil", ya sacada del
// sidebar) es la única forma de meter a mano una Compra Ágil que el detector
// automático no encontró — lee un File del navegador como base64 puro (sin el
// prefijo "data:...;base64,"), mismo formato que espera
// chilecompraDocReader.leerAnexos en el backend.
function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const REGIONES = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana de Santiago', "Libertador General Bernardo O'Higgins",
  'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo', 'Magallanes y de la Antártica Chilena',
]

// 2026-09-09 — botón "Extraer" (rubro RMG). Pedido del usuario: usar las
// mismas palabras clave que ya están definidas para Licitaciones (ver
// chilecompraCron.js KEYWORDS), no inventar una lista nueva. IMPORTANTE: esto
// filtra EN EL NAVEGADOR sobre lo que ya se importó — a propósito NO se manda
// como parámetro `q` a la API de Compra Ágil, porque ya se probó (incidente
// #2, ver compraAgilApiClient.js) que varias de estas mismas palabras
// genéricas ("lubricante", "aceite", "grasa", "refrigerante",
// "anticongelante") le dan error 500 a esa API. Cero riesgo de romper nada —
// solo resalta/filtra lo que el sistema ya trajo, igual que un Ctrl+F sobre
// varias palabras a la vez en vez de una por una en el buscador de texto.
const KEYWORDS_RUBRO_RMG = [
  'lubricante', 'aceite', 'hidraulico', 'grasa', 'refrigerante', 'anticongelante',
  'liquido de frenos', 'bateria', 'acumulador', 'neumatico', 'llanta', 'adblue',
]
const normalizarTexto = (txt) => (txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const calzaRubroRMG = (o) => {
  const texto = normalizarTexto(`${o.nombre || ''} ${o.descripcion || ''}`)
  return KEYWORDS_RUBRO_RMG.some(k => texto.includes(k))
}

// Exportadas (2026-09-09, pieza 3) para que CompraAgilPage.jsx pueda mostrar
// una franja de conteo por estado sin duplicar esta lista.
export const ESTADOS = [
  { k: 'detectada',               label: 'Detectada',              color: 'var(--rmg-blue)', bg: 'rgba(56,182,255,0.1)',   icon: FileSearch },
  { k: 'analizando',              label: 'Analizando',             color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.12)',  icon: RefreshCw },
  { k: 'preparando_postulacion',  label: 'Preparando postulación', color: '#a78bfa',         bg: 'rgba(167,139,250,0.12)', icon: ClipboardCheck },
  { k: 'publicada',               label: 'Publicada',              color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.12)',  icon: Send },
  { k: 'adjudicada',              label: 'Adjudicada',             color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.18)',  icon: Trophy },
  { k: 'no_adjudicada',           label: 'No adjudicada',          color: 'var(--rmg-muted)', bg: 'rgba(15,35,60,0.05)',   icon: XCircle },
  { k: 'descartada',              label: 'Descartada',             color: 'var(--rmg-red)',  bg: 'rgba(224,90,78,0.1)',    icon: Ban },
]
export const ESTADO_MAP = Object.fromEntries(ESTADOS.map(e => [e.k, e]))
const KANBAN_ESTADOS = ['detectada', 'analizando', 'preparando_postulacion', 'publicada']

const scoreColor = (s) => s == null ? 'var(--rmg-muted)' : s >= 70 ? 'var(--rmg-teal)' : s >= 40 ? 'var(--rmg-gold)' : 'var(--rmg-red)'

const diasParaCierre = (fecha) => {
  if (!fecha) return null
  return Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24))
}

// YYYY-MM-DD en hora local (no toISOString, que se corre a UTC y puede cambiar el día)
const isoLocal = (d) => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Por qué 30 días es el default y no 7: la API de ChileCompra solo permite
// consultar por "actividad en un día puntual" (fecha=), no por licitaciones
// vigentes — así que si una licitación se publicó hace más de N días y sigue
// abierta, un barrido de N días JAMÁS la encuentra (no es un problema de
// palabras clave, es que ni siquiera se llega a evaluar esa licitación).
// Verificado en producción el 04/09/2026: un barrido de 30 días encontró 2
// oportunidades reales que un barrido de 7 días no veía. 30 días cubre el
// plazo típico de apertura de una licitación pública (10-30 días corridos)
// con margen. El cron diario (1 día) sigue siendo suficiente para mantenerse
// al día una vez que la base ya está nivelada — este selector es para
// nivelarla y para auditorías manuales cuando algo no calza con el portal.
const RANGOS_ANALISIS = [
  { k: 'hoy',        label: 'Hoy' },
  { k: 'ayer',       label: 'Ayer' },
  { k: '7dias',      label: 'Últimos 7 días' },
  { k: '30dias',     label: 'Últimos 30 días (recomendado)' },
  { k: 'custom',     label: 'Rango personalizado' },
]

export default function ChileCompraPage() {
  const qc = useQueryClient()
  // 2026-09-09 — pedido explícito del usuario: "agrégale un filtro donde
  // aparezca el tipo (compra ágil)" en ESTE menú (ChileCompra), que actualiza
  // sin problemas (lee solo de la base local) — a diferencia de la página
  // separada de Compra Ágil, que dependía de una llamada en vivo a la API y
  // podía demorar/fallar. fuente: '' = todos, 'licitacion' | 'compra_agil'.
  //
  // 2026-09-09 (rediseño de filtros, pedido explícito) — "región" pasa de
  // string único a arreglo (acumulable — más de una región a la vez). Se
  // agrega `soloRecientes`: el filtro POR DEFECTO ("solo traiga 7 días, por
  // vencer") que combina recientes + por vencer en un solo interruptor — ON
  // al entrar a la página, pero es un filtro que se puede sacar (no un límite
  // fijo), justo para no perder de vista las que ya cerraron o en las que RMG
  // ya se postuló. `soloRubroRMG` es el botón "extraer": filtra EN EL
  // NAVEGADOR (no le pregunta nada nuevo a la API — ver aviso en
  // KEYWORDS_RUBRO_RMG más abajo) sobre lo que ya se trajo.
  const [filtros, setFiltros] = useState({ regiones: [], dias_vencimiento: '', q: '', fuente: '' })
  const [soloRecientes, setSoloRecientes] = useState(true)
  const [soloRubroRMG, setSoloRubroRMG] = useState(false)
  const [regionesAbierto, setRegionesAbierto] = useState(false)
  const [seleccionId, setSeleccionId] = useState(null)
  // 2026-09-09 — deep link ?abrir=<id> (pieza 3 del esquema aprobado): permite
  // que CompraAgilPage enlace directo al modal de gestión/pipeline de una
  // oportunidad puntual sin duplicar la UI de cambio de estado acá.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const abrir = searchParams.get('abrir')
    if (abrir) setSeleccionId(abrir)
  }, [searchParams])
  const [rango, setRango] = useState('30dias')
  const [rangoCustom, setRangoCustom] = useState({ desde: isoLocal(new Date()), hasta: isoLocal(new Date()) })

  const params = {
    region: filtros.regiones.length ? filtros.regiones.join(',') : undefined,
    dias_vencimiento: filtros.dias_vencimiento || undefined,
    q: filtros.q || undefined,
    fuente: filtros.fuente || undefined,
    // Filtro por defecto (ON al entrar): últimos 7 días de publicación O por
    // vencer en 7 días — se saca solo si el usuario apaga el interruptor
    // "Recientes y por vencer" o aprieta "Limpiar filtros".
    relevancia_dias: soloRecientes ? 7 : undefined,
  }

  const { data: oportunidades = [], isLoading } = useQuery({
    queryKey: ['chilecompra', params],
    queryFn: () => api.get('/chilecompra', { params }).then(r => r.data),
    staleTime: 60_000,
  })

  // ── Interruptor de módulo (mitigación OOM Render, 2026-09-11) ──────────────
  // Apaga la ingesta (cron + botón manual) y el análisis (lectura de anexos +
  // scoring) — las operaciones pesadas. El Kanban de abajo sigue mostrando lo
  // que ya está cargado, esté prendido o apagado.
  const { data: moduloConfig } = useQuery({
    queryKey: ['chilecompra', 'modulo-config'],
    queryFn: () => api.get('/chilecompra/config/modulo').then(r => r.data),
    staleTime: 30_000,
  })
  const moduloHabilitado = moduloConfig?.enabled !== false

  const moduloMut = useMutation({
    mutationFn: (enabled) => api.patch('/chilecompra/config/modulo', { enabled }).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['chilecompra', 'modulo-config'], data)
      toast.success(data.enabled ? 'Módulo ChileCompra activado' : 'Módulo ChileCompra desactivado')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al cambiar el interruptor'),
  })

  const bodyAnalisis = () => {
    if (rango === 'hoy') return { dias: 1 }
    if (rango === '7dias') return { dias: 7 }
    if (rango === '30dias') return { dias: 30 }
    if (rango === 'ayer') {
      const ayer = new Date(); ayer.setDate(ayer.getDate() - 1)
      return { fecha_desde: isoLocal(ayer), fecha_hasta: isoLocal(ayer) }
    }
    return { fecha_desde: rangoCustom.desde, fecha_hasta: rangoCustom.hasta }
  }

  const analisisMut = useMutation({
    mutationFn: () => api.post('/chilecompra/ejecutar-analisis', bodyAnalisis()).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chilecompra'] })
      const n = data?.nuevas ?? 0
      const dias = data?.dias_barridos ? ` (${data.dias_barridos} día${data.dias_barridos > 1 ? 's' : ''} revisado${data.dias_barridos > 1 ? 's' : ''})` : ''
      toast.success(n > 0 ? `Análisis completo: ${n} oportunidad(es) nueva(s)${dias}` : `Análisis completo: sin oportunidades nuevas${dias}`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al ejecutar el análisis'),
  })

  // 2026-09-09 — el detector de Compra Ágil (API oficial) y la sincronización
  // de estado real de ChileCompra ya corren solas (cron cada 15 min / cada
  // 2h). Estos dos botones las disparan ya mismo, sin depender de la página
  // separada "/compra-agil" que el usuario pidió sacar del sidebar — todo el
  // flujo de gestión vive en este único menú.
  //
  // 2026-09-09 (corregido) — el usuario preguntó "¿dónde veo el progreso?"
  // tras quedarse con el toast de "ya hay una búsqueda en curso" sin ninguna
  // señal de avance ni de cuándo termina. La versión anterior era
  // fire-and-forget puro (un toast y un invalidate a ciegas a los 8s), lo que
  // dejaba al usuario sin saber si seguía corriendo, si terminó, o si se
  // trabó — más grave ahora que el detector trae TODO el país sin filtro de
  // palabras (puede tardar bastante más que antes). Portado de la página
  // separada CompraAgilPage.jsx (que ya tenía este polling resuelto):
  // GET /scraper-estado y /sincronizar-estado-estado cada 4s mientras la
  // corrida está activa, hasta que `corriendo` vuelva a false.
  const [buscandoCompraAgil, setBuscandoCompraAgil] = useState(false)
  const ultimoResumenBuscarVisto = useRef(null)

  const { data: scraperEstado } = useQuery({
    queryKey: ['chilecompra', 'compra-agil-scraper-estado'],
    queryFn: () => api.get('/compra-agil/scraper-estado').then(r => r.data),
    refetchInterval: buscandoCompraAgil ? 4000 : false,
  })

  useEffect(() => {
    if (!scraperEstado) return
    if (scraperEstado.corriendo) { setBuscandoCompraAgil(true); return }
    if (!buscandoCompraAgil) return // no era nuestra corrida (ej. la del cron) — no avisar nada
    setBuscandoCompraAgil(false)
    const resumen = scraperEstado.ultimoResumen
    if (!resumen || resumen === ultimoResumenBuscarVisto.current) return
    ultimoResumenBuscarVisto.current = resumen
    qc.invalidateQueries({ queryKey: ['chilecompra'] })
    if (resumen.importadas?.length) {
      toast.success(`${resumen.importadas.length} oportunidad(es) nueva(s) de Compra Ágil detectada(s) e importada(s).`)
    } else {
      toast(`Sin oportunidades nuevas por ahora (${resumen.codigosVistos ?? 0} código(s) revisado(s) a nivel nacional).`, { icon: '🔎' })
    }
    if (resumen.errores?.length) {
      toast.error(`${resumen.errores.length} error(es) durante la búsqueda: ${resumen.errores[0]}`, { duration: 12000 })
    }
  }, [scraperEstado, buscandoCompraAgil, qc])

  const compraAgilBuscarMut = useMutation({
    mutationFn: () => api.post('/compra-agil/scrapear-ahora').then(r => r.data),
    onSuccess: (r) => {
      toast(r.iniciado === false ? (r.mensaje || 'Ya hay una búsqueda en curso.') : 'Buscando Compra Ágil (todo el país, últimas 24h)…', { icon: '⚡' })
      setBuscandoCompraAgil(true)
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  })

  const [sincronizandoEstadoReal, setSincronizandoEstadoReal] = useState(false)
  const ultimoResumenSyncVisto = useRef(null)

  const { data: syncEstadoData } = useQuery({
    queryKey: ['chilecompra', 'compra-agil-sync-estado-estado'],
    queryFn: () => api.get('/compra-agil/sincronizar-estado-estado').then(r => r.data),
    refetchInterval: sincronizandoEstadoReal ? 4000 : false,
  })

  useEffect(() => {
    if (!syncEstadoData) return
    if (syncEstadoData.corriendo) { setSincronizandoEstadoReal(true); return }
    if (!sincronizandoEstadoReal) return
    setSincronizandoEstadoReal(false)
    const resumen = syncEstadoData.ultimoResumen
    if (!resumen || resumen === ultimoResumenSyncVisto.current) return
    ultimoResumenSyncVisto.current = resumen
    qc.invalidateQueries({ queryKey: ['chilecompra'] })
    if (resumen.cambiosDetectados?.length) {
      toast.success(`${resumen.cambiosDetectados.length} oportunidad(es) cambiaron de estado en ChileCompra.`, { duration: 8000 })
    } else {
      toast(`Sin cambios de estado (${resumen.revisadas ?? 0} revisada(s)).`, { icon: '🔄' })
    }
    if (resumen.errores?.length) {
      toast.error(`${resumen.errores.length} error(es) sincronizando estado: ${resumen.errores[0]}`, { duration: 10000 })
    }
  }, [syncEstadoData, sincronizandoEstadoReal, qc])

  const compraAgilSyncMut = useMutation({
    mutationFn: () => api.post('/compra-agil/sincronizar-estado-ahora').then(r => r.data),
    onSuccess: (r) => {
      toast(r.iniciado === false ? (r.mensaje || 'Ya hay una sincronización en curso.') : 'Actualizando estado real desde ChileCompra…', { icon: '🔄' })
      setSincronizandoEstadoReal(true)
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  })

  // ── Agregar una puntual a mano (2026-09-09, traído de la página separada)
  // Caso real: "2428-1262-COT26" (Quilpué) nunca quedó guardada — el detector
  // automático solo cubre RM y palabras clave del rubro; esto es lo único que
  // permite meter a mano una que se escapó (otra región, ya cerrada, etc.).
  const [mostrarManual, setMostrarManual] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')
  const [textoManual, setTextoManual] = useState('')
  const [archivosManual, setArchivosManual] = useState([]) // File[]

  const importarManualMut = useMutation({
    mutationFn: async ({ codigo: cod, texto, archivos }) => {
      const documentos = await Promise.all(archivos.map(async (f) => ({
        base64: await archivoABase64(f), mediaType: f.type, nombre: f.name,
      })))
      return api.post('/compra-agil/importar-manual', { codigo: cod, texto, documentos }).then(r => r.data)
    },
    onSuccess: (op) => {
      toast.success(`Importada: ${op.nombre || op.codigo_externo}`)
      qc.invalidateQueries({ queryKey: ['chilecompra'] })
      setSeleccionId(op.id)
      setCodigoManual(''); setTextoManual(''); setArchivosManual([]); setMostrarManual(false)
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  })

  // 2026-09-09 — botón "Extraer rubro RMG": filtro EN EL NAVEGADOR sobre lo
  // que la API ya devolvió (ver aviso de KEYWORDS_RUBRO_RMG arriba) — se
  // aplica acá, antes de repartir por estado, para que afecte tanto al
  // Kanban como a la sección de cerradas/historial de abajo.
  const oportunidadesFiltradas = soloRubroRMG ? oportunidades.filter(calzaRubroRMG) : oportunidades

  const porEstado = (estado) => oportunidadesFiltradas.filter(o => o.estado === estado)
  const totalAbierto = oportunidadesFiltradas.filter(o => !['descartada', 'adjudicada', 'no_adjudicada'].includes(o.estado))
  const totalAdjudicado = oportunidadesFiltradas.filter(o => o.estado === 'adjudicada').reduce((s, o) => s + (o.adjudicado_monto || 0), 0)
  const urgentes = oportunidadesFiltradas.filter(o => {
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => moduloMut.mutate(!moduloHabilitado)}
            disabled={moduloMut.isPending}
            title={moduloHabilitado
              ? 'Módulo activo — clic para apagar (detiene el análisis diario y el botón "Hacer análisis ahora", para bajar el consumo de memoria)'
              : 'Módulo desactivado — clic para prender de nuevo'}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
            style={{
              background: moduloHabilitado ? 'rgba(45,201,138,0.12)' : 'rgba(200,40,40,0.10)',
              color: moduloHabilitado ? 'var(--rmg-teal)' : '#C0392B',
            }}>
            <span
              className="inline-block rounded-full transition-all"
              style={{
                width: 30, height: 16, position: 'relative',
                background: moduloHabilitado ? 'var(--rmg-teal)' : 'rgba(15,35,60,0.2)',
              }}>
              <span className="inline-block rounded-full bg-white transition-all"
                style={{ width: 12, height: 12, position: 'absolute', top: 2, left: moduloHabilitado ? 16 : 2 }} />
            </span>
            {moduloHabilitado ? 'Módulo activo' : 'Módulo apagado'}
          </button>
          <select value={rango} onChange={e => setRango(e.target.value)}
            className="px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }}>
            {RANGOS_ANALISIS.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}
          </select>
          {rango === 'custom' && (
            <>
              <input type="date" value={rangoCustom.desde} max={rangoCustom.hasta}
                onChange={e => setRangoCustom(r => ({ ...r, desde: e.target.value }))}
                className="px-2.5 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }} />
              <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>a</span>
              <input type="date" value={rangoCustom.hasta} min={rangoCustom.desde} max={isoLocal(new Date())}
                onChange={e => setRangoCustom(r => ({ ...r, hasta: e.target.value }))}
                className="px-2.5 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }} />
            </>
          )}
          <button onClick={() => analisisMut.mutate()} disabled={analisisMut.isPending || !moduloHabilitado}
            title={!moduloHabilitado ? 'Módulo apagado — prende el interruptor para analizar' : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: 'var(--rmg-blue)', color: '#fff' }}>
            <RefreshCw size={15} className={analisisMut.isPending ? 'animate-spin' : ''} />
            {analisisMut.isPending ? 'Analizando…' : 'Hacer análisis ahora'}
          </button>
          {/* 2026-09-09 — acciones de Compra Ágil movidas acá (ver nota arriba) */}
          <button onClick={() => compraAgilBuscarMut.mutate()} disabled={buscandoCompraAgil || compraAgilBuscarMut.isPending}
            title="Trae TODAS las Compra Ágil publicadas en todo el país (últimas 24h), sin filtro de palabras — filtra después con los filtros de esta página"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
            style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>
            {(buscandoCompraAgil || compraAgilBuscarMut.isPending) ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {buscandoCompraAgil
              ? `Buscando… (${scraperEstado?.ultimoResumen?.codigosVistos ?? 0} vistos)`
              : 'Compra Ágil ahora'}
          </button>
          <button onClick={() => compraAgilSyncMut.mutate()} disabled={sincronizandoEstadoReal || compraAgilSyncMut.isPending}
            title="Consulta si alguna Compra Ágil ya importada se adjudicó/cerró en ChileCompra"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
            style={{ background: 'rgba(15,35,60,0.05)', color: 'var(--rmg-off)' }}>
            {(sincronizandoEstadoReal || compraAgilSyncMut.isPending) ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {sincronizandoEstadoReal ? 'Actualizando…' : 'Estado real'}
          </button>
        </div>
      </div>

      {/* 2026-09-09 — línea de progreso: antes el único indicador era un toast
          que desaparecía a los pocos segundos, dejando al usuario sin forma
          de saber si la búsqueda (ahora nacional, sin filtro) seguía corriendo
          o ya terminó. Esta línea vive mientras cualquiera de las dos corridas
          esté activa y se actualiza sola cada 4s con el polling de arriba. */}
      {(buscandoCompraAgil || sincronizandoEstadoReal) && (
        <div className="flex items-center gap-2 -mt-2 px-1 text-xs" style={{ color: 'var(--rmg-muted)' }}>
          <Loader2 size={12} className="animate-spin" />
          {buscandoCompraAgil && (
            <span>
              Buscando Compra Ágil en todo el país… {scraperEstado?.ultimoResumen?.codigosVistos ?? 0} código(s) revisado(s),{' '}
              {scraperEstado?.ultimoResumen?.importadas?.length ?? 0} nueva(s) importada(s) hasta ahora.
            </span>
          )}
          {sincronizandoEstadoReal && (
            <span>Sincronizando estado real desde ChileCompra…</span>
          )}
        </div>
      )}

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
        <select value={filtros.fuente} onChange={e => setFiltros(f => ({ ...f, fuente: e.target.value }))}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }}>
          <option value="">Todos los tipos</option>
          <option value="licitacion">Licitación</option>
          <option value="compra_agil">Compra Ágil</option>
        </select>
        {/* 2026-09-09 — región pasa a ser acumulable (pedido explícito: "mas
            de una"). Un <select multiple> nativo es incómodo (hay que
            Ctrl+clic) — se arma un desplegable propio con casilleros. */}
        <div className="relative">
          <button type="button" onClick={() => setRegionesAbierto(v => !v)}
            className="px-3 py-2 rounded-lg text-sm outline-none flex items-center gap-1.5"
            style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }}>
            <MapPin size={13} style={{ color: 'var(--rmg-muted)' }} />
            {filtros.regiones.length === 0 ? 'Todas las regiones' : `${filtros.regiones.length} región(es)`}
            <ChevronDown size={13} style={{ color: 'var(--rmg-muted)' }} />
          </button>
          {regionesAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setRegionesAbierto(false)} />
              <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg shadow-lg p-2"
                style={{ background: 'var(--rmg-bg, #fff)', border: '1px solid rgba(15,35,60,0.1)' }}>
                {filtros.regiones.length > 0 && (
                  <button type="button" onClick={() => setFiltros(f => ({ ...f, regiones: [] }))}
                    className="w-full text-left text-xs px-2 py-1.5 rounded font-medium mb-1" style={{ color: 'var(--rmg-blue)' }}>
                    Limpiar selección de regiones
                  </button>
                )}
                {REGIONES.map(r => (
                  <label key={r} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-black/5">
                    <input type="checkbox" checked={filtros.regiones.includes(r)}
                      onChange={() => setFiltros(f => ({
                        ...f,
                        regiones: f.regiones.includes(r) ? f.regiones.filter(x => x !== r) : [...f.regiones, r],
                      }))} />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <select value={filtros.dias_vencimiento} onChange={e => setFiltros(f => ({ ...f, dias_vencimiento: e.target.value }))}
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }}>
          <option value="">Cualquier plazo</option>
          <option value="1">Cierra en 1 día</option>
          <option value="3">Cierra en 3 días</option>
          <option value="7">Cierra en 7 días</option>
          <option value="15">Cierra en 15 días</option>
        </select>
        {/* 2026-09-09 — botón "Extraer" (pedido explícito): filtra EN EL
            NAVEGADOR, sobre lo ya importado, por las palabras clave del rubro
            RMG (mismas que Licitaciones) — no le pregunta nada nuevo a la API
            de Compra Ágil (ver aviso en KEYWORDS_RUBRO_RMG arriba). */}
        <button type="button" onClick={() => setSoloRubroRMG(v => !v)}
          title="Filtra (en el navegador, sin llamar a ChileCompra de nuevo) por las mismas palabras clave del rubro RMG que usa Licitaciones"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={soloRubroRMG
            ? { background: 'var(--rmg-blue)', color: '#fff' }
            : { background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-off)' }}>
          <FileStack size={14} /> Extraer rubro RMG
        </button>
        {/* 2026-09-09 — interruptor del filtro por defecto ("solo 7 días,
            por vencer"). ON al entrar; apagarlo (o "Limpiar filtros") muestra
            TODO, incluidas las cerradas/adjudicadas y las más antiguas —
            pedido explícito para no perder de vista el resultado final de lo
            ya postulado. */}
        <button type="button" onClick={() => setSoloRecientes(v => !v)}
          title="Publicadas en los últimos 7 días O por vencer en los próximos 7 — apágalo para ver todo, incluidas cerradas/adjudicadas y más antiguas"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={soloRecientes
            ? { background: 'rgba(45,201,138,0.14)', color: 'var(--rmg-teal)' }
            : { background: 'rgba(15,35,60,0.03)', border: '1px solid rgba(15,35,60,0.08)', color: 'var(--rmg-muted)' }}>
          <Clock size={14} /> Recientes y por vencer (7 días)
        </button>
        {(filtros.regiones.length || filtros.dias_vencimiento || filtros.q || filtros.fuente || soloRecientes || soloRubroRMG) && (
          <button onClick={() => {
            setFiltros({ regiones: [], dias_vencimiento: '', q: '', fuente: '' })
            setSoloRecientes(false)
            setSoloRubroRMG(false)
          }} className="text-xs px-2.5 py-2 rounded-lg font-medium" style={{ color: 'var(--rmg-muted)' }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Agregar una puntual a mano — para lo que el detector automático no
          encuentra (otra región, ya cerrada, fuera de las palabras clave del
          rubro, etc.). Colapsado por defecto. */}
      <div className="rmg-card p-0 overflow-hidden">
        <button
          onClick={() => setMostrarManual(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <ClipboardPaste size={15} style={{ color: 'var(--rmg-muted)' }} /> Agregar una puntual a mano (no la encontró el detector automático)
          </span>
          <ChevronDown size={16} style={{ transform: mostrarManual ? 'rotate(180deg)' : 'none', color: 'var(--rmg-muted)' }} />
        </button>
        {mostrarManual && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
              Abre la publicación en <a href="https://buscador.mercadopublico.cl" target="_blank" rel="noreferrer" style={{ color: 'var(--rmg-teal)' }}>buscador.mercadopublico.cl</a> o
              en el portal de Compra Ágil, copia el código y el texto de lo que piden (o descarga el PDF si trae anexo) y pégalo/súbelo acá — una IA lee lo que sea (texto plano o PDF) y extrae los ítems.
            </p>
            <input
              value={codigoManual}
              onChange={e => setCodigoManual(e.target.value)}
              placeholder="Código de la publicación (ej. 2428-1262-COT26)"
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

      {/* Cerradas: adjudicada / no adjudicada / descartada — resumen colapsado.
          2026-09-09 — usa oportunidadesFiltradas (respeta "Extraer rubro RMG")
          y ya no depende de "Recientes y por vencer" porque el backend deja
          pasar los estados terminales siempre, sin importar ese filtro (ver
          chilecompraController.getOportunidades). */}
      <ResultadosCerrados oportunidades={oportunidadesFiltradas} onSelect={setSeleccionId} />

      {seleccionId && (
        <DetalleModal id={seleccionId} onClose={() => {
          setSeleccionId(null)
          if (searchParams.get('abrir')) {
            const next = new URLSearchParams(searchParams)
            next.delete('abrir')
            setSearchParams(next, { replace: true })
          }
        }} />
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
      <div className="text-[10px] font-mono font-semibold mb-0.5" style={{ color: 'var(--rmg-blue)' }}>{op.codigo_externo}</div>
      <div className="text-sm font-semibold line-clamp-2 mb-1" style={{ color: 'var(--rmg-off)' }}>{op.nombre || op.codigo_externo}</div>
      <div className="text-xs truncate mb-2" style={{ color: 'var(--rmg-muted)' }}>{op.organismo_nombre || 'Organismo no informado aún'}</div>
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
  // Texto en edición por ítem para la corrección manual ("match salió mal") —
  // keyed por item.id, solo mientras el usuario edita antes de guardar.
  const [notaEdit, setNotaEdit] = useState({})
  const [itemAbierto, setItemAbierto] = useState(null)
  // 2026-09-09 — "y la parte de benchmark??? se perdió?": vivía solo en la
  // página separada "/compra-agil" (ya sacada del sidebar); se trae acá para
  // que quede en el único menú que el usuario usa. Los endpoints no dependen
  // de la fuente (licitación o Compra Ágil) — funcionan igual para ambas.
  const [keywordBenchmark, setKeywordBenchmark] = useState('')
  const [panelBenchmark, setPanelBenchmark] = useState(null) // 'solicitante' | 'mercado' | null

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
    onError: (e) => toast.error(e.response?.data?.error || 'Error al analizar la ficha pública. Puedes subir anexos manualmente e intentar de nuevo.'),
  })

  const extraerFichasMut = useMutation({
    mutationFn: () => api.post(`/chilecompra/${id}/extraer-fichas-tecnicas`).then(r => r.data),
    onSuccess: (data) => {
      invalidar()
      if (data?.sinFicha?.length) {
        toast(`${data.adjuntadas} ficha(s) adjuntada(s). Sin ficha disponible para: ${data.sinFicha.join(', ')}`, { icon: '⚠️' })
      } else {
        toast.success(`${data.adjuntadas} ficha(s) técnica(s) adjuntada(s) a la postulación`)
      }
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al extraer las fichas técnicas'),
  })

  // "Limpiar historial y reintentar" — pedido real del usuario: cuando la
  // lectura de anexos falla repetido, el historial se llena de eventos
  // viejos y confusos ("evitando mareos"). Borra ítems/historial/scores/
  // Excel derivados; los anexos subidos NO se tocan (ver backend).
  const limpiarHistorialMut = useMutation({
    mutationFn: () => api.post(`/chilecompra/${id}/limpiar-historial`).then(r => r.data),
    onSuccess: () => { invalidar(); toast.success('Historial limpio — los anexos subidos se conservan. Vuelve a analizar cuando quieras.') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al limpiar el historial'),
  })

  const handleLimpiarHistorial = () => {
    if (!window.confirm('Esto borra los ítems, el historial de eventos, el resumen IA, los scores y el Excel de cruce generados en el análisis anterior — para dejar la oportunidad lista para reanalizar desde cero. Los documentos que subiste (Anexos de la licitación) NO se borran. ¿Continuar?')) return
    limpiarHistorialMut.mutate()
  }

  // 2026-09-09 — caso real: 654478-64-COT26 (Subsecretaría de Prevención del
  // Delito) tenía un PDF real de adjunto en el portal, pero como se importó
  // ANTES de que compraAgilAnalisis guardara los documentos descargados como
  // anexo real (ver backend), "Leer ficha pública y calcular score" no tenía
  // nada que leer. "Compra Ágil ahora" tampoco lo re-procesa porque el
  // detector solo trae códigos NUEVOS (este ya existe en la base). Este botón
  // vuelve a pedirle el detalle a la API oficial de Compra Ágil para ESTE
  // código puntual — con la descarga de adjuntos ya corregida, esta vez sí
  // queda guardado el PDF como anexo real.
  const reimportarApiMut = useMutation({
    mutationFn: () => api.post('/compra-agil/importar', { codigo: op.codigo_externo }).then(r => r.data),
    onSuccess: () => { invalidar(); toast.success('Vuelto a traer desde ChileCompra — revisa "Anexos de la licitación" y reintenta el análisis.') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al volver a traer desde ChileCompra'),
  })

  // Corregir un ítem cuyo match salió mal — pedido real: "si el match de
  // excel salió mal, debemos agregar observaciones para que lo vuelva a
  // calcular". Un solo campo de texto: "SKU:<codigo>" fija el producto
  // correcto a mano, cualquier otro texto es una pista para el re-match
  // automático. Recalcula el cruce completo al guardar (ver backend).
  const corregirItemMut = useMutation({
    mutationFn: ({ itemId, correccion_usuario }) =>
      api.put(`/chilecompra/${id}/items/${itemId}/observacion`, { correccion_usuario }).then(r => r.data),
    onSuccess: () => { invalidar(); toast.success('Corrección guardada — cruce recalculado') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al guardar la corrección'),
  })

  const { data: benchmarkSolicitante, isFetching: cargandoBenchSol, refetch: refetchBenchSol } = useQuery({
    queryKey: ['chilecompra', id, 'benchmark-solicitante', keywordBenchmark],
    queryFn: () => api.get(`/compra-agil/${id}/benchmark-solicitante`, { params: { keyword: keywordBenchmark } }).then(r => r.data),
    enabled: false,
  })
  const { data: benchmarkMercado, isFetching: cargandoBenchMer, refetch: refetchBenchMer } = useQuery({
    queryKey: ['chilecompra', 'benchmark-mercado', keywordBenchmark],
    queryFn: () => api.get('/compra-agil/benchmark-mercado', { params: { keyword: keywordBenchmark } }).then(r => r.data),
    enabled: false,
  })

  const dispararBenchmark = (tipo) => {
    if (!keywordBenchmark.trim()) return toast.error('Escribe una palabra clave (ej. "aceite motor 5w30")')
    setPanelBenchmark(tipo)
    if (tipo === 'solicitante') refetchBenchSol()
    else refetchBenchMer()
  }

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

  const handleVolver = (estadoAnterior) => {
    if (!window.confirm(`¿Volver esta oportunidad a "${ESTADO_MAP[estadoAnterior]?.label || estadoAnterior}"? Esto corrige un cambio de estado hecho por error.`)) return
    cambiarEstadoMut.mutate({ estado: estadoAnterior })
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

          {/* Aviso: el análisis usó solo la ficha pública genérica (sin detalle
              técnico real) — Mercado Público no expone las Bases/Anexo Técnico
              como texto ni link de descarga en la ficha pública, así que sin un
              PDF subido a mano el sistema solo tiene la línea genérica del ítem
              (ej. "Aceite de motor 1 Global"), no el requerimiento real. */}
          {op.analisis_fuente === 'ficha_publica' && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(230,168,49,0.1)', color: 'var(--rmg-gold)' }}>
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>Análisis genérico:</strong> se usó solo la ficha pública de Mercado Público, que no trae el detalle técnico real (viscosidad, norma, marca, cantidad). Descarga los documentos reales desde "Ver adjuntos" en la ficha de la licitación y súbelos abajo en "Anexos de la licitación", luego reintenta el análisis para un match confiable.
              </span>
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
                      {['Descripción', 'Cant.', 'SKU RMG', 'Margen', '', ''].map((h, i) => (
                        <th key={`${h}-${i}`} className="text-left px-3 py-2 font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {op.items.map(it => (
                      <Fragment key={it.id}>
                        <tr style={{ borderTop: '1px solid rgba(15,35,60,0.04)' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--rmg-off)' }}>{it.descripcion_solicitada}</td>
                          <td className="px-3 py-2" style={{ color: it.cantidad_ajustada ? 'var(--rmg-red)' : 'var(--rmg-muted)', fontWeight: it.cantidad_ajustada ? 700 : 400 }}>
                            {it.cantidad} {it.unidad || ''}
                            {it.cantidad_ajustada ? <span title={`Cantidad ajustada automáticamente desde ${it.cantidad_solicitada_original} para cubrir el volumen real solicitado — ver Observación en el Excel de cruce.`}> ⚠️</span> : null}
                          </td>
                          <td className="px-3 py-2 font-mono" style={{ color: it.cubierto ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                            {it.sku_match || 'Sin cobertura'}
                            {it.sku_forzado_por_usuario ? <span title="SKU fijado manualmente"> ✋</span> : null}
                          </td>
                          <td className="px-3 py-2 font-semibold" style={{ color: 'var(--rmg-off)' }}>{it.margen_pct_estimado != null ? formatPct(it.margen_pct_estimado) : '—'}</td>
                          <td className="px-3 py-2">{it.cubierto ? <CheckCircle2 size={13} style={{ color: 'var(--rmg-teal)' }} /> : <XCircle size={13} style={{ color: 'var(--rmg-red)' }} />}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => {
                                setItemAbierto(itemAbierto === it.id ? null : it.id)
                                setNotaEdit(prev => ({ ...prev, [it.id]: prev[it.id] ?? (it.correccion_usuario || (it.sku_forzado_por_usuario ? `SKU:${it.sku_forzado_por_usuario}` : '')) }))
                              }}
                              className="text-xs font-medium"
                              style={{ color: 'var(--rmg-blue)' }}
                            >
                              {itemAbierto === it.id ? 'Cerrar' : 'Corregir'}
                            </button>
                          </td>
                        </tr>
                        {itemAbierto === it.id && (
                          <tr style={{ background: 'rgba(56,182,255,0.04)' }}>
                            <td colSpan={6} className="px-3 py-3">
                              <div className="text-xs mb-1.5" style={{ color: 'var(--rmg-muted)' }}>
                                Si el match salió mal, escribe una pista (ej. "es un anticongelante concentrado, no diluido") para que el sistema
                                lo vuelva a buscar en el catálogo — o si ya sabes el SKU correcto, escribe <code>SKU:1200212</code> para fijarlo directo.
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={notaEdit[it.id] ?? ''}
                                  onChange={(e) => setNotaEdit(prev => ({ ...prev, [it.id]: e.target.value }))}
                                  placeholder='Ej: "es hidráulico ISO 46, no aceite de motor" o "SKU:1200212"'
                                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border"
                                  style={{ borderColor: 'var(--rmg-border)' }}
                                />
                                <button
                                  type="button"
                                  disabled={corregirItemMut.isPending}
                                  onClick={() => corregirItemMut.mutate({ itemId: it.id, correccion_usuario: notaEdit[it.id] || '' })}
                                  className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                                  style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blue)', border: '1px solid rgba(56,182,255,0.2)' }}
                                >
                                  {corregirItemMut.isPending ? 'Recalculando…' : 'Guardar y recalcular'}
                                </button>
                                {(it.correccion_usuario || it.sku_forzado_por_usuario) && (
                                  <button
                                    type="button"
                                    disabled={corregirItemMut.isPending}
                                    onClick={() => { setNotaEdit(prev => ({ ...prev, [it.id]: '' })); corregirItemMut.mutate({ itemId: it.id, correccion_usuario: '' }) }}
                                    className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                                    style={{ color: 'var(--rmg-red)' }}
                                  >
                                    Quitar corrección
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {op.items.some(it => it.observacion) && (
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>
                          {op.items.filter(it => it.observacion).map(it => (
                            <div key={`obs-${it.id}`} className="mb-1">
                              <span className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{it.sku_match || it.descripcion_solicitada?.slice(0, 30)}:</span> {it.observacion}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Benchmark de precios — de vuelta acá (ver nota arriba) */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--rmg-muted)' }}>
              Benchmark de precios
            </div>
            <div className="rmg-card p-3 space-y-2">
              <input
                value={keywordBenchmark}
                onChange={e => setKeywordBenchmark(e.target.value)}
                placeholder='Palabra clave (ej. "aceite motor 5w30")'
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ borderColor: 'var(--rmg-border)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => dispararBenchmark('solicitante')}
                  className="flex-1 text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 border"
                  style={{ borderColor: 'var(--rmg-border)' }}
                >
                  {cargandoBenchSol ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
                  ¿Este organismo ya lo compró?
                </button>
                <button
                  onClick={() => dispararBenchmark('mercado')}
                  className="flex-1 text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 border"
                  style={{ borderColor: 'var(--rmg-border)' }}
                >
                  {cargandoBenchMer ? <Loader2 size={14} className="animate-spin" /> : <Globe2 size={14} />}
                  Precio de mercado
                </button>
              </div>
              {panelBenchmark && (
                <BenchmarkResultado
                  resultado={panelBenchmark === 'solicitante' ? benchmarkSolicitante : benchmarkMercado}
                  tipo={panelBenchmark}
                />
              )}
            </div>
          </div>

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

          {/* Anexos de la licitación — los documentos REALES que el organismo
              publicó (Bases de Licitación, Anexos técnicos/administrativos,
              etc. — los mismos que "Ver adjuntos" muestra en la ficha de
              Mercado Público). Van primero y con copy explícito porque son la
              fuente del requerimiento técnico real: sin subir esto, el
              análisis solo tiene la ficha pública genérica (ver el aviso
              "Análisis genérico" más arriba si aplica). No confundir con
              "Fichas técnicas de productos RMG" más abajo — eso es lo que
              nosotros ofrecemos, no lo que el organismo pidió. */}
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--rmg-muted)' }}>
              Sube acá los documentos reales que el organismo publicó (Bases de Licitación, Anexos técnicos/administrativos, especificaciones) — los mismos que ves en "Ver adjuntos" dentro de la ficha de la licitación en Mercado Público. Ahí está el requerimiento técnico real; la ficha pública sola solo trae un resumen genérico. Después de subirlos, vuelve a analizar para que el sistema los lea y haga el cruce con el catálogo.
            </p>
            <DocumentosPanel entidad="oportunidad_chilecompra" entidadId={op.id} titulo="Anexos de la licitación" />
          </div>

          {/* Fichas técnicas de productos RMG — lo que RMG ofrece (hojas de
              datos Vistony), para adjuntar al paquete de postulación. No leen
              el requerimiento del organismo — eso son los Anexos de arriba. */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--rmg-muted)' }}>
              <FileStack size={12} /> Fichas técnicas de productos RMG
            </div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--rmg-muted)' }}>
              Esto es distinto de los Anexos de arriba: son las hojas de datos de los productos que RMG ofrece (Vistony), para adjuntar al paquete de postulación. El análisis ya intenta adjuntar automáticamente la de cada producto emparejado. Usa este botón para reintentar o refrescarlas — por ejemplo si cambiaste manualmente el SKU ofertado en algún ítem.
            </p>
            <button
              onClick={() => extraerFichasMut.mutate()}
              disabled={extraerFichasMut.isPending || !op.items?.length}
              className="text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ color: 'var(--rmg-blue)', background: 'rgba(15,35,60,0.03)' }}
            >
              <FileStack size={13} className={extraerFichasMut.isPending ? 'animate-pulse' : ''} />
              {extraerFichasMut.isPending ? 'Extrayendo fichas técnicas…' : 'Extraer fichas técnicas de productos RMG'}
            </button>
          </div>

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
                icon={Sparkles} label={analizarMut.isPending ? 'Leyendo…' : 'Leer ficha pública y calcular score'} color="var(--rmg-blue)" bg="rgba(56,182,255,0.1)" />
              <ActionBtn onClick={() => cambiarEstadoMut.mutate({ estado: 'preparando_postulacion' })} busy={cambiarEstadoMut.isPending}
                icon={ClipboardCheck} label="Preparar postulación" color="#a78bfa" bg="rgba(167,139,250,0.12)" />
              <ActionBtn onClick={handleDescartar} busy={cambiarEstadoMut.isPending} icon={Ban} label="Descartar" color="var(--rmg-red)" bg="rgba(224,90,78,0.08)" />
              <ActionBtn onClick={() => handleVolver('detectada')} busy={cambiarEstadoMut.isPending} icon={Undo2} label="Volver a detectada" color="var(--rmg-muted)" bg="rgba(15,35,60,0.05)" />
              <ActionBtn onClick={handleLimpiarHistorial} busy={limpiarHistorialMut.isPending} icon={Eraser} label="Limpiar historial y reintentar" color="var(--rmg-red)" bg="rgba(224,90,78,0.08)" />
              {op.fuente === 'compra_agil' && (
                <ActionBtn onClick={() => reimportarApiMut.mutate()} busy={reimportarApiMut.isPending}
                  icon={Zap} label="Volver a traer desde ChileCompra (incluye adjuntos)" color="var(--rmg-teal)" bg="rgba(45,201,138,0.12)" />
              )}
            </>
          )}
          {op.estado === 'preparando_postulacion' && (
            <>
              <ActionBtn onClick={handlePublicar} busy={cambiarEstadoMut.isPending}
                icon={Send} label="Ya la publiqué en el portal" color="var(--rmg-teal)" bg="rgba(45,201,138,0.12)" />
              <ActionBtn onClick={handleDescartar} busy={cambiarEstadoMut.isPending} icon={Ban} label="Descartar" color="var(--rmg-red)" bg="rgba(224,90,78,0.08)" />
              <ActionBtn onClick={() => handleVolver('analizando')} busy={cambiarEstadoMut.isPending} icon={Undo2} label="Volver a analizando" color="var(--rmg-muted)" bg="rgba(15,35,60,0.05)" />
            </>
          )}
          {op.estado === 'publicada' && (
            <>
              <ActionBtn onClick={() => handleResultado('adjudicada')} busy={cambiarEstadoMut.isPending}
                icon={Trophy} label="Marcar adjudicada" color="var(--rmg-teal)" bg="rgba(45,201,138,0.12)" />
              <ActionBtn onClick={() => handleResultado('no_adjudicada')} busy={cambiarEstadoMut.isPending}
                icon={XCircle} label="Marcar no adjudicada" color="var(--rmg-muted)" bg="rgba(15,35,60,0.05)" />
              <ActionBtn onClick={() => handleVolver('preparando_postulacion')} busy={cambiarEstadoMut.isPending} icon={Undo2} label="Corregir: aún no la publiqué" color="var(--rmg-muted)" bg="rgba(15,35,60,0.05)" />
            </>
          )}
          {op.estado === 'descartada' && (
            <ActionBtn onClick={() => handleVolver('detectada')} busy={cambiarEstadoMut.isPending} icon={Undo2} label="Reactivar (no debí descartarla)" color="var(--rmg-muted)" bg="rgba(15,35,60,0.05)" />
          )}
          {['adjudicada', 'no_adjudicada'].includes(op.estado) && (
            <ActionBtn onClick={() => handleVolver('publicada')} busy={cambiarEstadoMut.isPending} icon={Undo2} label="Corregir resultado" color="var(--rmg-muted)" bg="rgba(15,35,60,0.05)" />
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

// 2026-09-09 — traído de la página separada "/compra-agil" (ver nota en
// DetalleModal): mismos dos botones de benchmark, mismo componente de
// resultado, sin cambios de lógica — solo cambia dónde vive.
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
