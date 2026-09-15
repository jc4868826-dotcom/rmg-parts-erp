/**
 * RMG Parts — Cotizador Manual (2026-09-15)
 *
 * Flujo B2B privado: el usuario escribe a mano lo que el cliente pidió
 * (mesón, teléfono, WhatsApp) → Analizar propone SKU/precio/alertas por
 * línea, combinando el tagging técnico Vistony (30 fichas verificadas por
 * JC) con el mismo motor de matching que usan Cotizador/Evaluador/ChileCompra
 * → el usuario corrige a mano lo que haga falta y "Volver a analizar" →
 * Generar cotización crea una cotización real (misma tabla que todo el ERP).
 *
 * Deliberadamente simple: sin Kanban, sin historial de solicitudes — cada
 * visita a esta pantalla parte de una lista en blanco (ver notas en
 * cotizadorManualController.js).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '@utils/api'
import { Calculator, Plus, Trash2, RefreshCw, FileText, AlertTriangle, Search } from 'lucide-react'

const LINEA_VACIA = { descripcion: '', cantidad: 1 }

export default function CotizadorManualPage() {
  const navigate = useNavigate()
  const [lineas, setLineas] = useState([{ ...LINEA_VACIA }])
  const [resultado, setResultado] = useState(null) // items analizados, editables
  const [clienteId, setClienteId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [condicionPago, setCondicionPago] = useState('Contado')

  const { data: clientes } = useQuery({
    queryKey: ['clientes-cotizador-manual'],
    queryFn: () => api.get('/clientes').then(r => r.data),
    staleTime: 60_000,
  })

  const analizarMut = useMutation({
    mutationFn: (items) => api.post('/cotizador-manual/analizar', { items }).then(r => r.data),
    onSuccess: (data) => {
      setResultado(data.items)
      const alertas = data.items.filter(it => it.alerta_tipo_base || it.alerta_sku || it.sin_match).length
      if (alertas > 0) {
        toast(`${alertas} línea(s) con alerta — revisa antes de generar la cotización`, { icon: '⚠️' })
      } else {
        toast.success('Análisis listo')
      }
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al analizar'),
  })

  const generarMut = useMutation({
    mutationFn: (payload) => api.post('/cotizador-manual/generar', payload).then(r => r.data),
    onSuccess: (cot) => {
      toast.success(`Cotización ${cot.numero} generada`)
      navigate(`/cotizaciones/${cot.id}`)
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Error al generar la cotización'),
  })

  const agregarLinea = () => setLineas([...lineas, { ...LINEA_VACIA }])
  const quitarLinea = (idx) => setLineas(lineas.filter((_, i) => i !== idx))
  const actualizarLinea = (idx, campo, valor) => {
    const copia = [...lineas]
    copia[idx] = { ...copia[idx], [campo]: valor }
    setLineas(copia)
  }

  const analizar = () => {
    const items = lineas.filter(l => l.descripcion.trim())
    if (!items.length) return toast.error('Escribe al menos una línea con descripción')
    analizarMut.mutate(items)
  }

  const actualizarResultado = (idx, campo, valor) => {
    const copia = [...resultado]
    copia[idx] = { ...copia[idx], [campo]: valor }
    setResultado(copia)
  }

  const generar = () => {
    if (!resultado?.length) return
    if (!clienteId && !clienteNombre.trim()) {
      return toast.error('Selecciona un cliente o escribe su nombre')
    }
    const items = resultado.filter(it => it.sku_rmg || it.descripcion)
    generarMut.mutate({
      cliente_id: clienteId || null,
      cliente: clienteId ? null : clienteNombre.trim(),
      condicion_pago: condicionPago,
      items: items.map(it => ({
        descripcion: it.descripcion_sku || it.descripcion,
        codigo: it.sku_rmg,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario || 0,
        costo_unitario: it.costo_unitario || 0,
      })),
    })
  }

  const totalEstimado = resultado
    ? resultado.reduce((a, it) => a + (it.cantidad * (it.precio_unitario || 0)), 0)
    : 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(21,104,184,0.12)' }}>
          <Calculator size={20} style={{ color: 'var(--rmg-blue)' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--rmg-text)' }}>Cotizador Manual</h1>
          <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>
            Escribe lo que el cliente pidió — el sistema propone SKU, precio y alertas técnicas por línea.
          </p>
        </div>
      </div>

      {/* Paso 1 — lista de productos */}
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--rmg-border)', background: 'var(--rmg-surface)' }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--rmg-text)' }}>1. ¿Qué pidió el cliente?</div>
        {lineas.map((l, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Ej. Forza Plus 15W40 balde 20L"
              value={l.descripcion}
              onChange={e => actualizarLinea(idx, 'descripcion', e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--rmg-border)' }}
            />
            <input
              type="number"
              min={1}
              value={l.cantidad}
              onChange={e => actualizarLinea(idx, 'cantidad', e.target.value)}
              className="w-20 px-3 py-2 rounded-lg border text-sm text-center"
              style={{ borderColor: 'var(--rmg-border)' }}
            />
            <button onClick={() => quitarLinea(idx)} className="p-2 rounded-lg hover:bg-red-500/10" style={{ color: 'var(--rmg-red, #c00)' }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={agregarLinea} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--rmg-blue)' }}>
            <Plus size={14} /> Agregar línea
          </button>
          <button
            onClick={analizar}
            disabled={analizarMut.isPending}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg text-white ml-auto disabled:opacity-50"
            style={{ background: 'var(--rmg-blue)' }}
          >
            <Search size={14} /> {analizarMut.isPending ? 'Analizando…' : 'Analizar'}
          </button>
        </div>
      </div>

      {/* Paso 2 — resultado del cruce, editable */}
      {resultado && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--rmg-border)', background: 'var(--rmg-surface)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--rmg-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--rmg-text)' }}>2. Revisa el cruce — corrige lo que haga falta</div>
            <button onClick={analizar} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}>
              <RefreshCw size={12} /> Volver a analizar
            </button>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--rmg-border)' }}>
            {resultado.map((it, idx) => {
              const tieneAlerta = it.alerta_tipo_base || it.alerta_sku || it.sin_match
              return (
                <div key={idx} className="px-4 py-3 space-y-1.5" style={tieneAlerta ? { background: 'rgba(192,0,0,0.04)' } : undefined}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium flex-1 min-w-[200px]" style={{ color: 'var(--rmg-text)' }}>{it.descripcion}</span>
                    <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>x{it.cantidad}</span>
                    {tieneAlerta && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#FFC7CE', color: '#9C0006' }}>
                        <AlertTriangle size={11} /> {it.sin_match ? 'Sin match' : 'Revisar'}
                      </span>
                    )}
                  </div>
                  {it.tipo_base && (
                    <div className="text-xs" style={{ color: it.alerta_tipo_base ? '#9C0006' : 'var(--rmg-muted)' }}>
                      Tipo de base: {it.tipo_base}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="SKU RMG"
                      value={it.sku_rmg || ''}
                      onChange={e => actualizarResultado(idx, 'sku_rmg', e.target.value)}
                      className="w-32 px-2 py-1 rounded-lg border text-xs font-mono"
                      style={{ borderColor: 'var(--rmg-border)' }}
                    />
                    <input
                      type="number"
                      placeholder="Precio neto"
                      value={it.precio_unitario ?? ''}
                      onChange={e => actualizarResultado(idx, 'precio_unitario', Number(e.target.value))}
                      className="w-32 px-2 py-1 rounded-lg border text-xs"
                      style={{ borderColor: 'var(--rmg-border)' }}
                    />
                    {it.confianza != null && (
                      <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                        Confianza matching: {Math.round(it.confianza * 100)}%
                      </span>
                    )}
                  </div>
                  {it.observacion && (
                    <div className="text-xs italic" style={{ color: '#9C0006' }}>{it.observacion}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Paso 3 — cliente y generar */}
      {resultado && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--rmg-border)', background: 'var(--rmg-surface)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--rmg-text)' }}>3. Cliente y generar cotización</div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm flex-1 min-w-[200px]"
              style={{ borderColor: 'var(--rmg-border)' }}
            >
              <option value="">— Cliente nuevo (escribir nombre) —</option>
              {(clientes || []).map(c => (
                <option key={c.id} value={c.id}>{c.razon_social}</option>
              ))}
            </select>
            {!clienteId && (
              <input
                type="text"
                placeholder="Nombre del cliente nuevo"
                value={clienteNombre}
                onChange={e => setClienteNombre(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm flex-1 min-w-[200px]"
                style={{ borderColor: 'var(--rmg-border)' }}
              />
            )}
            <select
              value={condicionPago}
              onChange={e => setCondicionPago(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--rmg-border)' }}
            >
              <option>Contado</option>
              <option>Crédito 30 días</option>
              <option>Crédito 60 días</option>
            </select>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm" style={{ color: 'var(--rmg-muted)' }}>
              Total estimado (neto): <span className="font-bold" style={{ color: 'var(--rmg-text)' }}>${totalEstimado.toLocaleString('es-CL')}</span>
            </div>
            <button
              onClick={generar}
              disabled={generarMut.isPending}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ background: 'var(--rmg-teal)' }}
            >
              <FileText size={16} /> {generarMut.isPending ? 'Generando…' : 'Generar cotización'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
