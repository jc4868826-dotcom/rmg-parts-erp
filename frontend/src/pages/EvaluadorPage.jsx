/**
 * RMG Parts — Evaluador (2026-09-11)
 *
 * Pedido del usuario: "crearemos otra pestaña bajo chilecompras, la
 * llamaremos evaluador [...] no buscara oportunidades, sino que el humano
 * ingresara la solicitud, y hay recien ira a buscar la data a mercado
 * publico, pero no de todo, sino solamente de la id que se ingreso [...]
 * la busqueda no es a toda la data solo a las solicitudes nuevas, o las que
 * ya se ingresarion". El humano pega el código de una Compra Ágil puntual
 * (ej. "1493-495-COT26") y recién ahí el sistema va a Mercado Público — a
 * diferencia de ChileCompra/Compra Ágil, que barren el sitio solos.
 *
 * Reutiliza tal cual (mismo pipeline, misma tabla, mismo Kanban):
 *  - Backend: /api/evaluador/* (evaluadorController.js) — oportunidades_chilecompra
 *    con fuente='evaluador', mismos estados que ChileCompra/Compra Ágil.
 *  - Frontend: <DetalleModal> de ChileCompraPage.jsx (ítems + campo libre de
 *    corrección + "Extraer fichas" + botones de cambio de estado manual) —
 *    montado acá con basePath="evaluador" para que pegue contra
 *    /api/evaluador/:id/* en vez de /api/chilecompra/:id/* (ese último está
 *    apagado de emergencia — ver nota en app.js).
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, formatRelativo } from '@utils/format'
import { DetalleModal, ESTADO_MAP } from './ChileCompraPage'
import { Search, Loader2, ClipboardCheck, MapPin, Clock, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const diasParaCierre = (fecha) => {
  if (!fecha) return null
  return Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24))
}

export default function EvaluadorPage() {
  const qc = useQueryClient()
  const [codigo, setCodigo] = useState('')
  const [seleccionId, setSeleccionId] = useState(null)

  const { data: oportunidades, isLoading } = useQuery({
    queryKey: ['evaluador'],
    queryFn: () => api.get('/evaluador').then(r => r.data),
  })

  const buscarMut = useMutation({
    mutationFn: (codigo) => api.post('/evaluador/buscar', { codigo }).then(r => r.data),
    onSuccess: (op) => {
      qc.invalidateQueries({ queryKey: ['evaluador'] })
      setCodigo('')
      setSeleccionId(op.id)
      if (op.advertencia) toast.error(op.advertencia, { duration: 7000 })
      // 2026-09-13 — antes esto miraba op.historial?.length, pero una
      // importación fresca TAMBIÉN crea historial, así que el mensaje decía
      // "ya estaba ingresada" incluso para códigos recién borrados y
      // reingresados de cero. Ahora usa el flag explícito _yaExistia que
      // devuelve el backend (ver evaluadorController.js → buscar).
      else toast.success(`Solicitud ${op.codigo_externo} lista — ${op.items?.length || 0} ítem(s), ${op._yaExistia ? 'ya estaba ingresada' : 'ingesta completa desde Mercado Público'}`)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'No se pudo procesar el código'),
  })

  // 2026-09-13 — botón "Eliminar" pedido explícitamente por el usuario, ya
  // existía en Cotizador y quedó pendiente en Evaluador.
  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/evaluador/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['evaluador'] })
      if (seleccionId === id) setSeleccionId(null)
      toast.success('Solicitud eliminada')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  })

  const handleEliminar = (op) => {
    if (window.confirm(`¿Eliminar la solicitud ${op.codigo_externo}? Esta acción no se puede deshacer.`)) {
      eliminarMut.mutate(op.id)
    }
  }

  const handleBuscar = (e) => {
    e.preventDefault()
    const limpio = codigo.trim()
    if (!limpio) return toast.error('Ingresa el código de la solicitud (ej. 1493-495-COT26)')
    buscarMut.mutate(limpio)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--rmg-off)' }}>
          <ClipboardCheck size={22} style={{ color: 'var(--rmg-blue)' }} /> Evaluador
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--rmg-muted)' }}>
          Ingresa el código de una solicitud de Compra Ágil puntual (ej. <code>1493-495-COT26</code>) — recién ahí el
          sistema va a buscarla a Mercado Público, lee sus adjuntos, la cruza con el catálogo RMG y adjunta las
          fichas técnicas. No barre todo el sitio: solo la solicitud que ingreses, o revisa el estado de las que ya
          están acá.
        </p>
      </div>

      <form onSubmit={handleBuscar} className="rmg-card p-4 flex flex-col sm:flex-row gap-2">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Ej: 1493-495-COT26"
          className="flex-1 px-3 py-2.5 rounded-lg text-sm border font-mono"
          style={{ borderColor: 'var(--rmg-border)' }}
        />
        <button
          type="submit"
          disabled={buscarMut.isPending}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--rmg-blue)', color: 'white' }}
        >
          {buscarMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {buscarMut.isPending ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--rmg-muted)' }}>
          Solicitudes evaluadas ({oportunidades?.length || 0})
        </div>
        {isLoading ? (
          <div className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Cargando…</div>
        ) : !oportunidades?.length ? (
          <div className="rmg-card p-6 text-center text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Aún no ingresas ninguna solicitud. Pega un código arriba para empezar.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {oportunidades.map(op => (
              <EvaluadorCard key={op.id} op={op} onClick={() => setSeleccionId(op.id)} onEliminar={() => handleEliminar(op)} />
            ))}
          </div>
        )}
      </div>

      {seleccionId && (
        <DetalleModal id={seleccionId} basePath="evaluador" onClose={() => setSeleccionId(null)} />
      )}
    </div>
  )
}

function EvaluadorCard({ op, onClick, onEliminar }) {
  const est = ESTADO_MAP[op.estado]
  const dias = diasParaCierre(op.fecha_cierre)
  return (
    <button onClick={onClick} type="button" className="rmg-card p-3 w-full text-left transition-all hover:shadow-md relative group">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onEliminar() }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onEliminar() } }}
        title="Eliminar solicitud"
        className="absolute top-2 right-2 p-1 rounded opacity-60 hover:opacity-100 hover:bg-red-50 transition-opacity"
        style={{ color: 'var(--rmg-red)' }}
      >
        <Trash2 size={14} />
      </span>
      <div className="flex items-start justify-between gap-2 mb-1.5 pr-6">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: est?.bg, color: est?.color }}>
          {est?.label || op.estado}
        </span>
        {op.estado_real_chilecompra && (
          <span className="text-[10px] font-medium" style={{ color: 'var(--rmg-muted)' }}>{op.estado_real_chilecompra}</span>
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
          <span className="flex items-center gap-1 font-semibold" style={{ color: dias <= 3 ? 'var(--rmg-red)' : 'var(--rmg-muted)' }}>
            <Clock size={11} />{dias >= 0 ? `${dias}d` : 'vencida'}
          </span>
        )}
      </div>
      {op.presupuesto_estimado != null && (
        <div className="text-xs font-bold mt-1.5 precio-clp" style={{ color: 'var(--rmg-blt)' }}>{formatCLP(op.presupuesto_estimado)}</div>
      )}
      {op.updated_at && (
        <div className="text-[10px] mt-1" style={{ color: 'var(--rmg-muted)' }}>Actualizado {formatRelativo(op.updated_at)}</div>
      )}
    </button>
  )
}
