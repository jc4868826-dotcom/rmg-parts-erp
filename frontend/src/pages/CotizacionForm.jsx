import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP, calcularTotalesCotizacion } from '@utils/format'
import { ArrowLeft, Plus, Trash2, Send, ShoppingCart, Link2, Truck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import DocumentosPanel from '@components/DocumentosPanel'
import ProductoSearch from '@components/ProductoSearch'
import CantidadPresentacion from '@components/CantidadPresentacion'

export default function CotizacionForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [clienteId, setClienteId]   = useState('')
  const [condicion, setCondicion]   = useState('Contado')
  const [plazoEntrega, setPlazo]    = useState('24-48 hrs · Santiago RM')
  const [validezDias, setValidez]   = useState(15)
  const [notas, setNotas]           = useState('')
  const [items, setItems]           = useState([
    { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0, presentacion: '', unidades_por_pack: null, costo_unitario: 0, oc_item_id: null }
  ])
  const [saving, setSaving]         = useState(false)
  const [loaded, setLoaded]         = useState(false)
  const [showCrearOC, setShowCrearOC] = useState(false)
  const queryClient = useQueryClient()

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => api.get('/clientes').then(r => r.data),
  })

  const { data: cotizacion } = useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => api.get(`/cotizaciones/${id}`).then(r => r.data),
    enabled: isEdit,
    staleTime: 0,
  })

  // Trazabilidad cotización↔OC (2026-09-13, "ventas calzadas"): OCs ya
  // ligadas a esta cotización, para poder elegir línea por línea de cuál
  // salió el costo negociado con el proveedor.
  const { data: ocsLigadas = [] } = useQuery({
    queryKey: ['oc-por-cotizacion', id],
    queryFn: () => api.get('/oc', { params: { cotizacion_id: id } }).then(r => r.data),
    enabled: isEdit,
  })
  const ocItemsDisponibles = ocsLigadas.flatMap(oc =>
    (oc.items || []).map(it => ({ ...it, oc_numero: oc.numero, oc_id: oc.id }))
  )

  useEffect(() => {
    if (cotizacion && !loaded) {
      setClienteId(cotizacion.cliente_id || '')
      setCondicion(cotizacion.condicion_pago || 'Contado')
      setPlazo(cotizacion.plazo_entrega || '24-48 hrs · Santiago RM')
      setValidez(cotizacion.validez_dias || 15)
      setNotas(cotizacion.notas || '')
      if (cotizacion.items?.length) {
        setItems(cotizacion.items.map(i => ({
          id:                 i.id,
          codigo:             i.codigo || '',
          descripcion:        i.descripcion || '',
          cantidad:           i.cantidad || 1,
          precio_unitario:    i.precio_unitario || 0,
          descuento_pct:      i.descuento_pct || 0,
          presentacion:       i.presentacion || '',
          unidades_por_pack:  i.unidades_por_pack || null,
          costo_unitario:     i.costo_unitario || 0,
          oc_item_id:         i.oc_item_id || null,
        })))
      }
      setLoaded(true)
    }
  }, [cotizacion, loaded])

  const totales = calcularTotalesCotizacion(items)

  const addItem = () => setItems(prev => [
    ...prev, { codigo: '', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0, presentacion: '', unidades_por_pack: null, costo_unitario: 0, oc_item_id: null }
  ])

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const updateItem = (i, field, value) => {
    setItems(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }

  // Vincula (o desvincula, ocItemId=null) la línea i con una línea de OC ya
  // creada. Solo aplica a líneas ya guardadas (con id real) — una línea nueva
  // sin guardar todavía no existe en cotizacion_items para poder ligarla.
  const handleVincularOC = async (i, ocItemId) => {
    const item = items[i]
    if (!item.id) { toast.error('Guarda la cotización primero para poder vincular esta línea a una OC'); return }
    try {
      const { data } = await api.patch(`/cotizaciones/items/${item.id}/vincular-oc`, { oc_item_id: ocItemId || null })
      setItems(prev => {
        const next = [...prev]
        next[i] = { ...next[i], oc_item_id: data.oc_item_id, costo_unitario: data.costo_unitario }
        return next
      })
      toast.success(ocItemId ? 'Línea vinculada a la OC' : 'Vínculo con OC quitado')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al vincular con la OC')
    }
  }

  const handleProductoSelect = (i, p) => {
    setItems(prev => {
      const next = [...prev]
      next[i] = {
        ...next[i],
        codigo: p.codigo_sku || '',
        descripcion: p.descripcion || '',
        precio_unitario: p.precio_neto || p.precio_venta_neto || 0,
        presentacion: p.presentacion || '',
        unidades_por_pack: p.unidades_por_pack || null,
      }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { cliente_id: clienteId, items, condicion_pago: condicion, plazo_entrega: plazoEntrega, validez_dias: validezDias, notas, ...totales }
      if (isEdit) {
        await api.put(`/cotizaciones/${id}`, payload)
        toast.success('Cotización actualizada')
      } else {
        await api.post('/cotizaciones', payload)
        toast.success('Cotización guardada')
      }
      navigate('/cotizaciones')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const [convirtiendo, setConvirtiendo] = useState(false)
  const handleConvertirVenta = async () => {
    setConvirtiendo(true)
    try {
      await api.post(`/ventas/desde-cotizacion/${id}`)
      toast.success('Venta generada desde esta cotización')
      navigate('/ventas')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al generar la venta')
    } finally {
      setConvirtiendo(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/cotizaciones')} className="p-2 rounded-lg hover:bg-black/5 transition-colors" style={{ color: 'var(--rmg-muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            {isEdit ? (cotizacion?.numero ? `Editar ${cotizacion.numero}` : 'Editar cotización') : 'Nueva cotización'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Precios mayoristas B2B · IVA 19%</p>
        </div>
      </div>

      {isEdit && !loaded && (
        <div className="rmg-card p-8 text-center" style={{ color: 'var(--rmg-muted)' }}>
          <div className="animate-pulse">Cargando cotización...</div>
        </div>
      )}

      {(!isEdit || loaded) && (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Cliente y condiciones */}
          <div className="rmg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cliente *</label>
              <select className="rmg-input" value={clienteId} onChange={e => setClienteId(e.target.value)} required>
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Condición de pago</label>
              <select className="rmg-input" value={condicion} onChange={e => setCondicion(e.target.value)}>
                <option>Contado</option>
                <option>Crédito 30 días</option>
                <option>Crédito 60 días</option>
                <option>Transferencia anticipada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tiempo de entrega</label>
              <input className="rmg-input" placeholder="24-48 hrs · Santiago RM"
                value={plazoEntrega} onChange={e => setPlazo(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Validez (días)</label>
              <input className="rmg-input" type="number" min="1" max="90"
                value={validezDias} onChange={e => setValidez(Number(e.target.value))} />
            </div>
          </div>

          {/* Items */}
          <div className="rmg-card overflow-hidden">
            <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
              <div>
                <span className="font-bold">Productos</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>Busca en lista de precios o escribe manualmente</span>
              </div>
              <div className="flex items-center gap-2">
                {isEdit && (
                  <button type="button" onClick={() => setShowCrearOC(true)} className="btn-secondary flex items-center gap-1.5 text-xs">
                    <Truck size={14} /> Crear OC desde esta cotización
                  </button>
                )}
                <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <Plus size={14} /> Agregar línea
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                    {['Buscar producto', 'Código', 'Descripción', 'Cant.', 'Precio neto', 'Desc %', 'Subtotal', 'OC vinculada', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const subtotal = Math.round(item.cantidad * item.precio_unitario * (1 - item.descuento_pct / 100))
                    const ocItemLigado = item.oc_item_id ? ocItemsDisponibles.find(o => o.id === item.oc_item_id) : null
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                        <td className="px-4 py-2 min-w-52">
                          <ProductoSearch initialQuery={item.codigo || ''} onSelect={(p) => handleProductoSelect(i, p)} />
                        </td>
                        <td className="px-4 py-2 w-28">
                          <input className="rmg-input text-xs font-mono" value={item.codigo}
                            onChange={e => updateItem(i, 'codigo', e.target.value)} placeholder="SKU" />
                        </td>
                        <td className="px-4 py-2 min-w-48">
                          <input className="rmg-input text-xs" value={item.descripcion}
                            onChange={e => updateItem(i, 'descripcion', e.target.value)} placeholder="Descripción" />
                        </td>
                        <td className="px-4 py-2 w-24">
                          <CantidadPresentacion
                            unidadesPorPack={item.unidades_por_pack}
                            presentacion={item.presentacion}
                            cantidad={item.cantidad}
                            onChange={v => updateItem(i, 'cantidad', v)}
                          />
                        </td>
                        <td className="px-4 py-2 w-32">
                          <input className="rmg-input text-xs text-right" type="number" min="0"
                            value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', Number(e.target.value))} />
                        </td>
                        <td className="px-4 py-2 w-20">
                          <input className="rmg-input text-xs text-center" type="number" min="0" max="100"
                            value={item.descuento_pct} onChange={e => updateItem(i, 'descuento_pct', Number(e.target.value))} />
                        </td>
                        <td className="px-4 py-2 font-bold precio-clp text-right whitespace-nowrap" style={{ color: 'var(--rmg-off)' }}>
                          {formatCLP(subtotal)}
                        </td>
                        <td className="px-4 py-2 min-w-44">
                          {/* Trazabilidad cotización↔OC, línea por línea (2026-09-13).
                              Solo tiene sentido una vez que la cotización ya está
                              guardada (necesita el id real de la línea) y existe al
                              menos una OC ligada a esta cotización. */}
                          {isEdit ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                className="rmg-input text-xs"
                                value={item.oc_item_id || ''}
                                onChange={e => handleVincularOC(i, e.target.value || null)}
                                disabled={!item.id || !ocItemsDisponibles.length}
                              >
                                <option value="">
                                  {ocItemsDisponibles.length ? 'Sin vincular' : 'Sin OC ligadas aún'}
                                </option>
                                {ocItemsDisponibles.map(o => (
                                  <option key={o.id} value={o.id}>
                                    {o.oc_numero} · {o.codigo} · {formatCLP(o.precio_unitario)}
                                  </option>
                                ))}
                              </select>
                              {ocItemLigado && (
                                <button type="button" onClick={() => navigate(`/compras?id=${ocItemLigado.oc_id}`)}
                                  title={`Ver ${ocItemLigado.oc_numero} — costo negociado: ${formatCLP(ocItemLigado.precio_unitario)}`}
                                  className="hover:opacity-70 transition-opacity" style={{ color: 'var(--rmg-teal)' }}>
                                  <Link2 size={14} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Guarda para vincular</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => removeItem(i)}
                            className="p-1.5 rounded hover:bg-red-500/10 transition-colors" style={{ color: 'var(--rmg-red)' }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales */}
          <div className="flex justify-end">
            <div className="rmg-card p-5 min-w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--rmg-muted)' }}>Neto</span>
                <span className="font-semibold precio-clp">{formatCLP(totales.neto)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--rmg-muted)' }}>IVA (19%)</span>
                <span className="font-semibold precio-clp">{formatCLP(totales.iva)}</span>
              </div>
              <hr style={{ borderColor: 'rgba(56,182,255,0.1)' }} />
              <div className="flex justify-between">
                <span className="font-bold">Total</span>
                <span className="font-black text-lg precio-clp" style={{ color: 'var(--rmg-blt)' }}>{formatCLP(totales.total)}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="rmg-card p-5">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
            <textarea className="rmg-input resize-none" rows={3} placeholder="Observaciones, condiciones especiales..."
              value={notas} onChange={e => setNotas(e.target.value)} />
          </div>

          {/* Documentos adjuntos — solo disponible una vez guardada la cotización */}
          {isEdit && <DocumentosPanel entidad="cotizacion" entidadId={id} titulo="Documentos de la cotización" />}

          {/* Acciones */}
          <div className="flex gap-3 justify-end items-center">
            {isEdit && cotizacion?.estado !== 'rechazada' && (
              <button type="button" onClick={handleConvertirVenta} disabled={convirtiendo}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
                style={{ background: 'rgba(45,201,138,0.15)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.3)' }}>
                <ShoppingCart size={15}/> {convirtiendo ? 'Generando…' : 'Convertir a venta'}
              </button>
            )}
            <button type="button" onClick={() => navigate('/cotizaciones')} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Send size={15} /> {saving ? 'Guardando...' : (isEdit ? 'Actualizar cotización' : 'Guardar cotización')}
            </button>
          </div>
        </form>
      )}

      {showCrearOC && (
        <CrearOCModal
          cotizacionId={id}
          onClose={() => setShowCrearOC(false)}
          onCreated={(ocId) => {
            setShowCrearOC(false)
            queryClient.invalidateQueries({ queryKey: ['oc-por-cotizacion', id] })
            // Va directo a la OC recién creada para negociar los precios de
            // compra con el proveedor — de vuelta acá con el botón "Editar".
            navigate(`/compras?id=${ocId}`)
          }}
        />
      )}
    </div>
  )
}

// Modal simple: crea una OC prellenada con los ítems de esta cotización,
// pidiendo solo el proveedor. Los precios de compra quedan editables en
// OCPage (Compras) una vez creada — ahí se negocia el costo real con el
// proveedor, línea por línea, antes de vincularla desde acá.
function CrearOCModal({ cotizacionId, onClose, onCreated }) {
  const [proveedorId, setProveedorId] = useState('')
  const [creando, setCreando] = useState(false)

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/compras/proveedores').then(r => r.data),
  })

  const handleCrear = async () => {
    const prov = proveedores.find(p => String(p.id) === String(proveedorId))
    if (!prov) { toast.error('Selecciona un proveedor'); return }
    setCreando(true)
    try {
      const { data } = await api.post(`/oc/desde-cotizacion/${cotizacionId}`, {
        proveedor_id: prov.id,
        proveedor: prov.razon_social || prov.nombre,
      })
      toast.success(`OC ${data.numero} creada — ajusta los precios de compra`)
      onCreated(data.id)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al crear la OC')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,35,60,0.45)' }}>
      <div className="rmg-card p-5 w-full max-w-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold">Crear OC desde esta cotización</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}>
            <X size={16} />
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
          Se copian todas las líneas de la cotización a una OC nueva en borrador, con el proveedor que elijas.
        </p>
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Proveedor *</label>
          <select className="rmg-input" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
            <option value="">Seleccionar proveedor...</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social || p.nombre}</option>)}
          </select>
        </div>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={handleCrear} disabled={creando} className="btn-primary disabled:opacity-50">
            {creando ? 'Creando...' : 'Crear OC'}
          </button>
        </div>
      </div>
    </div>
  )
}
