import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { useAuth } from '@context/AuthContext'
import { formatCLP, formatFecha, calcularIVA, totalConIVA, formatCantidad } from '@utils/format'
import { Plus, X, Pencil, Trash2, ShoppingCart, Paperclip, FileText, ClipboardList, DollarSign, CreditCard, User, Upload, Check, ShieldAlert, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

// La fecha de venta (v.fecha) es solo día. La hora real de emisión viene de
// created_at (datetime completo) — se muestran juntas para responder "cuándo
// exactamente se emitió", no solo qué día.
function formatFechaHora(createdAt, fechaFallback) {
  if (!createdAt) return formatFecha(fechaFallback)
  const d = new Date(createdAt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return formatFecha(fechaFallback)
  const fecha = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  const hora  = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  return `${fecha} · ${hora}`
}
import DocumentosPanel from '@components/DocumentosPanel'
import ProductoSearch from '@components/ProductoSearch'
import CantidadPresentacion from '@components/CantidadPresentacion'

const MES_ACTUAL = new Date().toISOString().slice(0, 7)
const HOY = new Date().toISOString().split('T')[0]
const ESTADOS = ['Pendiente', 'Pagado', 'Anulado']
// Solo para el modal Editar — incluye el intermedio de validación, ya que el
// gerente puede necesitar corregir el estado a mano (además de vía "Adjuntar
// comprobante" / Aprobar-Rechazar en la fila). Al crear una venta nueva no
// tiene sentido partir ya "en validación", por eso ESTADOS arriba no lo incluye.
const ESTADOS_EDITABLES = ['Pendiente', 'en_validacion_pago', 'Pagado', 'Anulado']
const ESTADOS_LOGISTICOS = ['en_proceso', 'despachada', 'recibida_cliente']
const FORMAS_PAGO = ['Contado', 'Transferencia', 'Crédito 30 días', 'Crédito 60 días', 'Cheque']
const TIPOS_DOC = ['Nota de Venta', 'Factura', 'Boleta']
const ITEM_INIT = { sku: '', descripcion: '', cantidad: 1, precio_unitario: 0, costo_unitario: 0, descuento_pct: 0, presentacion: '', unidades_por_pack: null }
const FORM_INIT = { fecha: HOY, cliente_nombre: '', numero_documento: '', tipo_documento: 'Nota de Venta', estado: 'Pendiente', forma_pago: 'Contado', notas: '', items: [{ ...ITEM_INIT }] }
const CUENTAS = ['1781310106 Banco de Chile', '000-0-00000 Banco BCI', '000-0-00000 Banco Santander', 'Caja chica']
const PAGO_INIT = { metodo_pago: 'Transferencia', cuenta_bancaria: CUENTAS[0], fecha_pago: HOY, notas: '' }

const ESTADO_STYLE = {
  Pagado:  { color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.12)' },
  Pendiente:{ color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)' },
  Anulado: { color: 'var(--rmg-red)',    bg: 'rgba(224,90,78,0.12)'  },
  en_validacion_pago: { color: 'var(--rmg-blue)', bg: 'rgba(56,182,255,0.12)' },
}

// El comprobante deja la venta "en_validacion_pago" — normalmente se llega vía
// "Adjuntar comprobante" y solo un gerente lo saca de ahí (Aprobar/Rechazar),
// pero también es seleccionable a mano desde el modal Editar (ESTADOS_EDITABLES).
const ESTADO_LABEL = {
  Pendiente: 'Pendiente', Pagado: 'Pagado', Anulado: 'Anulado',
  en_validacion_pago: 'En validación de pago',
}

const LOGISTICO_STYLE = {
  en_proceso:       { label: 'En proceso',       color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.12)' },
  despachada:       { label: 'Despachada',       color: 'var(--rmg-blue)', bg: 'rgba(56,182,255,0.12)' },
  recibida_cliente: { label: 'Recibida cliente', color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.12)' },
}

export default function VentasPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const esGerente = user?.rol === 'gerente'
  // Facturación (2026-09-22): el facturador registra el N° de factura SII (gerente/administrador también pueden).
  const puedeFacturar = ['facturador', 'gerente', 'administrador'].includes(user?.rol)
  const [verPorFacturar, setVerPorFacturar] = useState(false)
  const [facturarModal, setFacturarModal] = useState(null)   // venta a facturar, o null
  const [factura, setFactura] = useState({ numero_factura: '', fecha_factura: HOY })
  const [mes, setMes]             = useState(MES_ACTUAL)
  const [showForm, setShowForm]   = useState(false)
  const [editando, setEditando]   = useState(null)
  const [form, setForm]           = useState(FORM_INIT)
  const [detalleVenta, setDetalleVenta] = useState(null)
  const qc = useQueryClient()

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas', verPorFacturar ? 'por_facturar' : mes],
    queryFn: () => api.get('/ventas', { params: verPorFacturar ? { estado_facturacion: 'por_facturar' } : { mes } }).then(r => r.data),
  })
  // Bandeja del facturador: ventas enviadas a facturación, de cualquier mes.
  const { data: porFacturar = [] } = useQuery({
    queryKey: ['ventas', 'por_facturar', 'conteo'],
    queryFn: () => api.get('/ventas', { params: { estado_facturacion: 'por_facturar' } }).then(r => r.data),
    staleTime: 30_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ventas'] })

  const crearMut = useMutation({
    mutationFn: (d) => api.post('/ventas', d).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Venta registrada'); setForm(FORM_INIT); setShowForm(false) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear venta'),
  })

  const editarMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/ventas/${id}`, data).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Venta actualizada'); setEditando(null) },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  })

  const eliminarMut = useMutation({
    mutationFn: (id) => api.delete(`/ventas/${id}`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Venta eliminada') },
  })

  const [docsVenta, setDocsVenta] = useState(null)

  const estadoLogMut = useMutation({
    mutationFn: ({ id, estado_logistico }) => api.patch(`/ventas/${id}/estado`, { estado_logistico }).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success('Estado logístico actualizado') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al cambiar estado'),
  })

  const [pagoModal, setPagoModal] = useState(null)   // venta seleccionada, o null
  const [pago, setPago] = useState(PAGO_INIT)

  const facturarMut = useMutation({
    mutationFn: ({ id, data }) => api.post(`/ventas/${id}/facturar`, data).then(r => r.data),
    onSuccess: (v) => {
      invalidate(); qc.invalidateQueries({ queryKey: ['cxc-ventas'] }); qc.invalidateQueries({ queryKey: ['cxc-pendientes-badge'] })
      toast.success(`Factura N° ${v.numero_factura} registrada — venta facturada`)
      setFacturarModal(null)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar la factura'),
  })

  const pagoMut = useMutation({
    mutationFn: ({ id, data }) => api.post(`/ventas/${id}/pago`, data).then(r => r.data),
    onSuccess: () => {
      invalidate(); toast.success('Pago registrado — ingreso confirmado en flujo de caja')
      setPagoModal(null); setPago(PAGO_INIT)
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al registrar pago'),
  })

  // Comprobante de depósito/transferencia — deja la venta "en_validacion_pago",
  // NO la marca Pagado directo (a diferencia de pagoMut arriba). Un input file
  // oculto compartido, disparado por venta vía subiendoParaId.
  const fileInputRef = useRef(null)
  const [subiendoParaId, setSubiendoParaId] = useState(null)

  const comprobanteMut = useMutation({
    mutationFn: ({ id, file }) => {
      const fd = new FormData()
      fd.append('archivo', file)
      return api.post(`/ventas/${id}/comprobante`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
    },
    onSuccess: () => { invalidate(); toast.success('Comprobante subido — venta en validación de pago') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al subir comprobante'),
  })

  const abrirSelectorComprobante = (id) => { setSubiendoParaId(id); fileInputRef.current?.click() }
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !subiendoParaId) return
    comprobanteMut.mutate({ id: subiendoParaId, file })
  }

  // Solo gerente: confirma que el depósito realmente llegó (genera el ingreso
  // en caja) o rechaza (la venta vuelve a Pendiente para reintentar).
  const validarMut = useMutation({
    mutationFn: ({ id, aprobado, motivo }) => api.post(`/ventas/${id}/validar-pago`, { aprobado, motivo }).then(r => r.data),
    onSuccess: (_, vars) => { invalidate(); toast.success(vars.aprobado ? 'Pago validado — ingreso confirmado en flujo de caja' : 'Pago rechazado') },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al validar el pago'),
  })

  // Trazabilidad cotización↔OC (2026-09-15): si la línea de la cotización se
  // vinculó a su OC DESPUÉS de convertir a venta, el costo quedó con el valor
  // genérico de lista_precios — este botón trae el costo negociado de la OC.
  const recalcularCostoMut = useMutation({
    mutationFn: (id) => api.post(`/ventas/${id}/recalcular-costo-oc`).then(r => r.data),
    onSuccess: (data) => {
      invalidate()
      toast.success(data.lineas_actualizadas > 0
        ? `Costo recalculado — ${data.lineas_actualizadas} línea(s) actualizada(s) desde la OC`
        : 'Sin cambios — ninguna línea de esta venta tiene una línea de OC vinculada')
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al recalcular el costo'),
  })

  const handleRechazarPago = (id) => {
    const motivo = window.prompt('Motivo del rechazo (ej: el depósito no aparece en la cuenta corriente):')
    if (motivo === null) return
    if (!motivo.trim()) { toast.error('Indica un motivo'); return }
    validarMut.mutate({ id, aprobado: false, motivo: motivo.trim() })
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...ITEM_INIT }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx, field, val) => setForm(f => {
    const items = [...f.items]; items[idx] = { ...items[idx], [field]: val }; return { ...f, items }
  })
  const handleProductoSelect = (idx, p) => setForm(f => {
    const items = [...f.items]
    items[idx] = {
      ...items[idx],
      sku: p.codigo_sku || '',
      descripcion: p.descripcion || '',
      precio_unitario: p.precio_neto || p.precio_venta_neto || 0,
      costo_unitario: p.costo_neto || p.costo_unidad_neto || 0,
      presentacion: p.presentacion || '',
      unidades_por_pack: p.unidades_por_pack || null,
    }
    return { ...f, items }
  })

  const calcTotal = (items) => items.reduce((s, i) => s + (Number(i.precio_unitario || 0) * Number(i.cantidad || 0) * (1 - (Number(i.descuento_pct) || 0) / 100)), 0)
  const calcCosto = (items) => items.reduce((s, i) => s + (Number(i.costo_unitario || 0) * Number(i.cantidad || 0)), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.fecha) { toast.error('Fecha requerida'); return }
    crearMut.mutate(form)
  }

  const handleEdit = (e) => {
    e.preventDefault()
    editarMut.mutate({ id: editando.id, data: editando })
  }

  const totalMes = ventas.reduce((s, v) => s + v.total, 0)
  const costoMes = ventas.reduce((s, v) => s + v.costo_total, 0)
  const margenMes = totalMes - costoMes

  return (
    <div className="space-y-5 animate-fade-in">
      <input ref={fileInputRef} type="file" accept="application/pdf,image/*,.xls,.xlsx,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Ventas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Registro de ventas · Notas de Venta · Facturas</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Nueva venta</>}
        </button>
      </div>

      {/* Filtro mes */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Mes</label>
        <input type="month" className="rmg-input text-xs py-1.5 w-36" value={mes} onChange={e => setMes(e.target.value)} />
      </div>

      {/* Cards resumen — total/ventas.total se guarda NETO en todo el sistema;
          acá se muestra el neto y, al lado, el IVA y el total con IVA, para
          que no haya que adivinar cuál es cuál. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Ingresos (Neto)', value: totalMes, color: 'var(--rmg-blt)' },
          { label: 'IVA (19%)', value: calcularIVA(totalMes), color: 'var(--rmg-muted)' },
          { label: 'Ingresos c/IVA', value: totalConIVA(totalMes), color: 'var(--rmg-blt)' },
          { label: 'Costo Mercadería', value: costoMes, color: 'var(--rmg-gold)' },
          { label: 'Margen Bruto (Neto)', value: margenMes, color: margenMes >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' },
        ].map(c => (
          <div key={c.label} className="rmg-card p-4">
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--rmg-muted)' }}>{c.label}</div>
            <div className="font-black text-2xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: c.color }}>{formatCLP(c.value)}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{ventas.length} ventas · {mes}</div>
          </div>
        ))}
      </div>

      {/* Formulario nueva venta */}
      {showForm && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Registrar venta</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha *</label>
                <input type="date" className="rmg-input" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cliente</label>
                <input className="rmg-input" placeholder="Nombre cliente..." value={form.cliente_nombre} onChange={e => setForm(p => ({ ...p, cliente_nombre: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tipo Doc.</label>
                <select className="rmg-input" value={form.tipo_documento} onChange={e => setForm(p => ({ ...p, tipo_documento: e.target.value }))}>
                  {TIPOS_DOC.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Documento</label>
                <input className="rmg-input" placeholder="NV-001..." value={form.numero_documento} onChange={e => setForm(p => ({ ...p, numero_documento: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                  {ESTADOS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Forma de pago</label>
                <select className="rmg-input" value={form.forma_pago} onChange={e => setForm(p => ({ ...p, forma_pago: e.target.value }))}>
                  {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
                <input className="rmg-input" placeholder="Observaciones..." value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--rmg-muted)' }}>Ítems</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                      {['Buscar producto', 'SKU', 'Descripción', 'Cant.', 'P.Unit.', 'Costo', 'Desc %', 'Subtotal', ''].map(h => (
                        <th key={h} className={`${h === 'Subtotal' ? 'text-right num-celda' : ['P.Unit.', 'Costo'].includes(h) ? 'text-right' : 'text-left'} px-3 py-2 font-semibold uppercase tracking-wider whitespace-nowrap`} style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, i) => {
                      const sub = Number(item.precio_unitario || 0) * Number(item.cantidad || 0) * (1 - (Number(item.descuento_pct) || 0) / 100)
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                          <td className="px-3 py-2 min-w-44"><ProductoSearch initialQuery={item.sku || ''} onSelect={p => handleProductoSelect(i, p)} /></td>
                          <td className="px-3 py-2 w-24"><input className="rmg-input text-xs font-mono" placeholder="SKU" value={item.sku} onChange={e => updateItem(i, 'sku', e.target.value)} /></td>
                          <td className="px-3 py-2 min-w-40"><input className="rmg-input text-xs" placeholder="Descripción" value={item.descripcion} onChange={e => updateItem(i, 'descripcion', e.target.value)} /></td>
                          <td className="px-3 py-2 w-24">
                            <CantidadPresentacion
                              unidadesPorPack={item.unidades_por_pack}
                              presentacion={item.presentacion}
                              cantidad={item.cantidad}
                              onChange={v => updateItem(i, 'cantidad', v)}
                            />
                          </td>
                          <td className="px-3 py-2 w-36"><input type="number" min="0" step="any" className="rmg-input precio text-xs text-right" value={item.precio_unitario} onChange={e => updateItem(i, 'precio_unitario', e.target.value)} /></td>
                          <td className="px-3 py-2 w-36"><input type="number" min="0" step="any" className="rmg-input precio text-xs text-right" value={item.costo_unitario} onChange={e => updateItem(i, 'costo_unitario', e.target.value)} /></td>
                          <td className="px-3 py-2 w-20"><input type="number" min="0" max="100" step="any" className="rmg-input text-xs text-center" value={item.descuento_pct} onChange={e => updateItem(i, 'descuento_pct', e.target.value)} /></td>
                          <td className="px-3 py-2 font-bold text-right num-celda whitespace-nowrap" style={{ color: 'var(--rmg-off)' }}>{formatCLP(sub)}</td>
                          <td className="px-3 py-2">
                            {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="p-1 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}><X size={13}/></button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-end mt-2">
                <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-1 text-xs"><Plus size={13}/> Agregar ítem</button>
                <div className="text-right">
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Costo: {formatCLP(calcCosto(form.items))}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-off)' }}>Neto: {formatCLP(calcTotal(form.items))}</div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>IVA (19%): {formatCLP(calcularIVA(calcTotal(form.items)))}</div>
                  <div className="font-black text-lg" style={{ color: 'var(--rmg-blt)', fontFamily: 'Inter Tight, sans-serif' }}>Total c/IVA: {formatCLP(totalConIVA(calcTotal(form.items)))}</div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={crearMut.isPending} className="btn-primary disabled:opacity-50">{crearMut.isPending ? 'Guardando...' : 'Guardar venta'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal edición */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <h2 className="font-bold mb-4">Editar venta #{editando.id}</h2>
            <form onSubmit={handleEdit} className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha</label>
                <input type="date" className="rmg-input" value={editando.fecha} onChange={e => setEditando(p => ({ ...p, fecha: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Estado</label>
                <select className="rmg-input" value={editando.estado} onChange={e => setEditando(p => ({ ...p, estado: e.target.value }))}>
                  {ESTADOS_EDITABLES.map(s => <option key={s} value={s}>{ESTADO_LABEL[s] || s}</option>)}
                </select></div>
              <div className="col-span-2"><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cliente</label>
                <input className="rmg-input" value={editando.cliente_nombre || ''} onChange={e => setEditando(p => ({ ...p, cliente_nombre: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Forma pago</label>
                <select className="rmg-input" value={editando.forma_pago || 'Contado'} onChange={e => setEditando(p => ({ ...p, forma_pago: e.target.value }))}>
                  {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                </select></div>
              <div><label className="block text-xs font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° Doc.</label>
                <input className="rmg-input" value={editando.numero_documento || ''} onChange={e => setEditando(p => ({ ...p, numero_documento: e.target.value }))} /></div>
              <div className="col-span-2 flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditando(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={editarMut.isPending} className="btn-primary disabled:opacity-50">{editarMut.isPending ? 'Guardando...' : 'Actualizar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal documentos */}
      {docsVenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md animate-fade-in">
            <div className="flex justify-between items-center mb-2 px-1">
              <h2 className="font-bold text-sm" style={{ color: '#fff' }}>Documentos — {docsVenta.numero_documento || `Venta #${docsVenta.id}`}</h2>
              <button onClick={() => setDocsVenta(null)} className="p-1 rounded hover:bg-black/10" style={{ color: '#fff' }}><X size={16}/></button>
            </div>
            <DocumentosPanel entidad="venta" entidadId={docsVenta.id} />
          </div>
        </div>
      )}

      {/* Modal registrar pago */}
      {facturarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Registrar factura SII</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>
                  {facturarModal.numero_documento || `Venta #${facturarModal.id}`} · {facturarModal.cliente_nombre || '—'} · Neto {formatCLP(facturarModal.total)} · c/IVA {formatCLP(totalConIVA(facturarModal.total))}
                </p>
              </div>
              <button onClick={() => setFacturarModal(null)} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>N° de factura (SII)</label>
                <input className="rmg-input" autoFocus placeholder="Ej: 1543" value={factura.numero_factura}
                  onChange={e => setFactura(f => ({ ...f, numero_factura: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha de emisión</label>
                <input type="date" className="rmg-input" value={factura.fecha_factura}
                  onChange={e => setFactura(f => ({ ...f, fecha_factura: e.target.value }))} />
              </div>
              <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
                Al guardar la venta queda <strong>Facturada</strong>. Si aún no hay pago, aparece en Cuentas por Cobrar.
              </p>
              <div className="flex gap-3 justify-end pt-2">
                <button onClick={() => setFacturarModal(null)} className="btn-secondary">Cancelar</button>
                <button onClick={() => facturarMut.mutate({ id: facturarModal.id, data: factura })}
                  disabled={facturarMut.isPending || !factura.numero_factura.trim()}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50">
                  <FileText size={14}/> {facturarMut.isPending ? 'Guardando...' : 'Marcar facturada'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pagoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rmg-card p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold">Registrar pago</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{pagoModal.numero_documento || `Venta #${pagoModal.id}`} · Neto {formatCLP(pagoModal.total)} · c/IVA {formatCLP(totalConIVA(pagoModal.total))}</p>
              </div>
              <button onClick={() => { setPagoModal(null); setPago(PAGO_INIT) }} style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Método de pago</label>
                <select className="rmg-input" value={pago.metodo_pago} onChange={e => setPago(p => ({ ...p, metodo_pago: e.target.value }))}>
                  <option>Transferencia</option>
                  <option>Cheque</option>
                  <option>Efectivo</option>
                  <option>Crédito 30 días</option>
                  <option>Crédito 60 días</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cuenta bancaria</label>
                <select className="rmg-input" value={pago.cuenta_bancaria} onChange={e => setPago(p => ({ ...p, cuenta_bancaria: e.target.value }))}>
                  {CUENTAS.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="">Sin especificar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Fecha de pago</label>
                <input type="date" className="rmg-input" value={pago.fecha_pago}
                  onChange={e => setPago(p => ({ ...p, fecha_pago: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Notas</label>
                <input className="rmg-input" placeholder="Referencia, número de operación..." value={pago.notas}
                  onChange={e => setPago(p => ({ ...p, notas: e.target.value }))} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button onClick={() => { setPagoModal(null); setPago(PAGO_INIT) }} className="btn-secondary">Cancelar</button>
                <button
                  onClick={() => pagoMut.mutate({ id: pagoModal.id, data: pago })}
                  disabled={pagoMut.isPending}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50">
                  <CreditCard size={14}/>
                  {pagoMut.isPending ? 'Registrando...' : 'Confirmar pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle de venta — se abre al hacer click en cualquier fila */}
      {detalleVenta && (() => {
        const v = detalleVenta
        const est = ESTADO_STYLE[v.estado] || ESTADO_STYLE.Pendiente
        const margen = v.total > 0 ? ((v.total - v.costo_total) / v.total) * 100 : 0
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onMouseDown={e => { if (e.target === e.currentTarget) setDetalleVenta(null) }}>
            <div className="rmg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in" style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
              <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
                <div>
                  <h2 className="font-black text-lg" style={{ fontFamily: 'Inter Tight, sans-serif' }}>{v.numero_documento || `Venta #${v.id}`}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{ESTADO_LABEL[v.estado] || v.estado}</span>
                    <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{v.tipo_documento}</span>
                    {v.estado_facturacion === 'por_facturar' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(244,162,60,0.14)', color: 'var(--rmg-gold)' }}>Enviada a facturación</span>
                    )}
                    {v.estado_facturacion === 'facturada' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)' }}>
                        Factura N° {v.numero_factura}{v.fecha_factura ? ` · ${formatFecha(v.fecha_factura)}` : ''}
                      </span>
                    )}
                    {(v.cotizacion_id || v.pedido_id) && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blue)' }}>
                        {v.cotizacion_id ? 'desde cotización' : 'desde pedido'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {v.cotizacion_id && (
                    <button onClick={() => recalcularCostoMut.mutate(v.id)} disabled={recalcularCostoMut.isPending}
                      title="Recalcular costo desde la OC vinculada a la cotización"
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ background: 'rgba(244,162,60,0.12)', color: 'var(--rmg-gold)' }}>
                      <RefreshCw size={13}/> {recalcularCostoMut.isPending ? 'Recalculando...' : 'Recalcular costo desde OC'}
                    </button>
                  )}
                  <button onClick={() => setDetalleVenta(null)} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Cliente</div>
                    {v.cliente_id
                      ? <button type="button" onClick={() => { setDetalleVenta(null); navigate(`/clientes/${v.cliente_id}`) }}
                          className="font-semibold hover:underline text-left" style={{ color: 'var(--rmg-blt)' }}>
                          {v.cliente_nombre || '—'}
                        </button>
                      : <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{v.cliente_nombre || '—'}</div>
                    }
                    {v.cliente_rut && <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{v.cliente_rut}</div>}
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Fecha y hora</div>
                    <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{formatFechaHora(v.created_at, v.fecha)}</div>
                  </div>
                  <div>
                    <div className="text-xs flex items-center gap-1" style={{ color: 'var(--rmg-muted)' }}><User size={11}/> Emitido por</div>
                    <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{v.vendedor_nombre || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Forma de pago</div>
                    <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{v.forma_pago || '—'}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--rmg-muted)' }}>Ítems</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)' }}>
                          {['SKU', 'Descripción', 'Cant.', 'P.Unit.', 'Desc %', 'Subtotal'].map(h => (
                            <th key={h} className={`${['Cant.', 'P.Unit.', 'Desc %', 'Subtotal'].includes(h) ? 'text-right num-celda' : 'text-left'} px-2 py-2 font-semibold uppercase tracking-wider whitespace-nowrap`} style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(v.items || []).map((it, idx) => (
                          <tr key={it.id || idx} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                            <td className="px-2 py-2 font-mono" style={{ color: 'var(--rmg-blt)' }}>{it.sku}</td>
                            <td className="px-2 py-2" style={{ color: 'var(--rmg-off)' }}>{it.descripcion}</td>
                            <td className="px-2 py-2 text-right num-celda" style={{ color: 'var(--rmg-muted)' }}>{formatCantidad(it.cantidad)}</td>
                            <td className="px-2 py-2 text-right num-celda whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(it.precio_unitario)}</td>
                            <td className="px-2 py-2 text-right num-celda" style={{ color: it.descuento_pct > 0 ? 'var(--rmg-gold)' : 'var(--rmg-muted)' }}>{it.descuento_pct > 0 ? `${it.descuento_pct}%` : '—'}</td>
                            <td className="px-2 py-2 text-right num-celda font-bold whitespace-nowrap" style={{ color: 'var(--rmg-off)' }}>{formatCLP(it.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-x-5 gap-y-2 pt-2 border-t text-sm" style={{ borderColor: 'rgba(15, 35, 60,0.07)' }}>
                  <div className="text-right">
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Costo</div>
                    <div className="font-semibold" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(v.costo_total)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Margen</div>
                    <div className="font-semibold" style={{ color: margen >= 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>{margen.toFixed(1)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Neto</div>
                    <div className="font-semibold" style={{ color: 'var(--rmg-off)' }}>{formatCLP(v.total)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>IVA (19%)</div>
                    <div className="font-semibold" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(calcularIVA(v.total))}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>Total c/IVA</div>
                    <div className="font-black text-lg" style={{ color: 'var(--rmg-blt)', fontFamily: 'Inter Tight, sans-serif' }}>{formatCLP(totalConIVA(v.total))}</div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-1">
                  <button onClick={() => setDocsVenta(v)} className="btn-secondary flex items-center gap-1.5 text-xs"><Paperclip size={13}/> Documentos</button>
                  <button onClick={() => { setDetalleVenta(null); setEditando({ ...v }) }} className="btn-secondary flex items-center gap-1.5 text-xs"><Pencil size={13}/> Editar</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex justify-between items-center" style={{ borderColor: 'rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
          <span className="font-bold text-sm">{ventas.length} ventas · {verPorFacturar ? 'enviadas a facturación (todos los meses)' : mes}</span>
          <button onClick={() => setVerPorFacturar(x => !x)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={verPorFacturar
              ? { background: 'var(--rmg-gold)', color: '#fff' }
              : { background: 'rgba(244,162,60,0.14)', color: 'var(--rmg-gold)' }}>
            <FileText size={13}/> {verPorFacturar ? 'Ver todas' : `Por facturar (${porFacturar.length})`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.08)', background: 'rgba(15, 35, 60,0.015)' }}>
                {['Fecha y hora', 'Cliente', 'Doc.', 'Emitido por', 'Neto', 'c/IVA', 'Costo', 'Estado', 'Logística', 'Forma Pago', 'Acciones'].map(h => (
                  <th key={h} className={`${['Neto', 'c/IVA', 'Costo'].includes(h) ? 'text-right num-celda' : 'text-left'} px-4 py-3 text-xs uppercase tracking-wider font-semibold`} style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }} /></td>
                      ))}
                    </tr>
                  ))
                : ventas.map((v, i) => {
                    const est = ESTADO_STYLE[v.estado] || ESTADO_STYLE.Pendiente
                    return (
                      <tr key={v.id} onClick={() => setDetalleVenta(v)}
                        style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)', cursor: 'pointer' }}
                        className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatFechaHora(v.created_at, v.fecha)}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--rmg-off)' }}>
                          {v.cliente_id
                            ? <button type="button" onClick={e => { e.stopPropagation(); navigate(`/clientes/${v.cliente_id}`) }}
                                className="hover:underline text-left" title="Ver ficha / cuenta corriente del cliente">
                                {v.cliente_nombre || '—'}
                              </button>
                            : (v.cliente_nombre || '—')
                          }
                          {v.cliente_rut && <div className="text-[10px]" style={{ color: 'var(--rmg-muted)' }}>{v.cliente_rut}</div>}
                          {(v.cotizacion_id || v.pedido_id) && (
                            <span className="mt-0.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full align-middle"
                              style={{ background: 'rgba(56,182,255,0.12)', color: 'var(--rmg-blue)' }}>
                              {v.cotizacion_id ? 'desde cotización' : 'desde pedido'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--rmg-muted)' }}>{v.numero_documento || '—'}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{v.vendedor_nombre || '—'}</td>
                        <td className="px-4 py-3 font-bold text-right num-celda" style={{ color: 'var(--rmg-blt)' }}>{formatCLP(v.total)}</td>
                        <td className="px-4 py-3 text-xs text-right num-celda" style={{ color: 'var(--rmg-off)' }}>{formatCLP(totalConIVA(v.total))}</td>
                        <td className="px-4 py-3 text-xs text-right num-celda" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(v.costo_total)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: est.bg, color: est.color }}>{ESTADO_LABEL[v.estado] || v.estado}</span>
                          {v.estado_facturacion === 'por_facturar' && (
                            <div className="mt-1"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(244,162,60,0.14)', color: 'var(--rmg-gold)' }}>Enviada a facturación</span></div>
                          )}
                          {v.estado_facturacion === 'facturada' && (
                            <div className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--rmg-teal)' }}>Facturada · N° {v.numero_factura}</div>
                          )}
                          {v.motivo_rechazo_pago && v.estado === 'Pendiente' && (
                            <div className="text-[10px] mt-1" style={{ color: 'var(--rmg-red)' }} title={v.motivo_rechazo_pago}>Pago rechazado: {v.motivo_rechazo_pago}</div>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <select className="rmg-input text-xs py-1"
                            value={v.estado_logistico || 'en_proceso'}
                            disabled={estadoLogMut.isPending}
                            onChange={e => estadoLogMut.mutate({ id: v.id, estado_logistico: e.target.value })}
                            style={{ color: (LOGISTICO_STYLE[v.estado_logistico] || LOGISTICO_STYLE.en_proceso).color }}>
                            {ESTADOS_LOGISTICOS.map(s => <option key={s} value={s}>{LOGISTICO_STYLE[s].label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{v.forma_pago}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 items-center">
                            {v.estado_facturacion === 'por_facturar' && v.estado !== 'Anulado' && puedeFacturar && (
                              <button onClick={() => { setFacturarModal(v); setFactura({ numero_factura: '', fecha_factura: HOY }) }}
                                title="Registrar N° de factura SII" className="text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1"
                                style={{ background: 'rgba(244,162,60,0.14)', color: 'var(--rmg-gold)' }}>
                                <FileText size={12}/> Facturar
                              </button>
                            )}
                            {/* Pago directo solo desde Cuentas por Cobrar (gerente). Acá solo datos de pago → validación. */}
                            {v.estado === 'Pendiente' && v.estado_facturacion !== 'por_facturar' && (
                              <button onClick={() => abrirSelectorComprobante(v.id)} disabled={comprobanteMut.isPending} title="Adjuntar comprobante de pago — pasa a validación del gerente" className="p-1.5 rounded hover:bg-black/5 disabled:opacity-50" style={{ color: 'var(--rmg-blue)' }}><Upload size={13}/></button>
                            )}
                            {v.estado === 'en_validacion_pago' && (
                              esGerente ? (
                                <>
                                  <button onClick={() => validarMut.mutate({ id: v.id, aprobado: true })} disabled={validarMut.isPending} title="Aprobar — confirmar que el depósito llegó" className="p-1.5 rounded hover:bg-black/5 disabled:opacity-50" style={{ color: 'var(--rmg-teal)' }}><Check size={13}/></button>
                                  <button onClick={() => handleRechazarPago(v.id)} disabled={validarMut.isPending} title="Rechazar pago" className="p-1.5 rounded hover:bg-red-500/10 disabled:opacity-50" style={{ color: 'var(--rmg-red)' }}><X size={13}/></button>
                                </>
                              ) : (
                                <span title="Esperando validación de gerente" className="p-1.5" style={{ color: 'var(--rmg-blue)' }}><ShieldAlert size={13}/></span>
                              )
                            )}
                            {v.cotizacion_id && (
                              <button onClick={() => recalcularCostoMut.mutate(v.id)} disabled={recalcularCostoMut.isPending}
                                title="Recalcular costo desde la OC vinculada a la cotización" className="p-1.5 rounded hover:bg-black/5 disabled:opacity-50" style={{ color: 'var(--rmg-gold)' }}>
                                <RefreshCw size={13}/>
                              </button>
                            )}
                            <button onClick={() => setDocsVenta(v)} title="Documentos" className="p-1.5 rounded hover:bg-black/5" style={{ color: 'var(--rmg-blue)' }}><Paperclip size={13}/></button>
                            <button onClick={() => setEditando({ ...v })} className="p-1.5 rounded hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}><Pencil size={13}/></button>
                            <button onClick={() => { if (confirm('¿Eliminar esta venta?')) eliminarMut.mutate(v.id) }} className="p-1.5 rounded hover:bg-red-500/10" style={{ color: 'var(--rmg-red)' }}><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
            {!isLoading && ventas.length > 0 && (
              <tfoot>
                <tr style={{ background: 'rgba(15, 35, 60,0.03)', borderTop: '1px solid rgba(56,182,255,0.1)' }}>
                  <td colSpan={4} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Total mes</td>
                  <td className="px-4 py-3 font-black text-base text-right num-celda" style={{ color: 'var(--rmg-blt)', fontFamily: 'Inter Tight, sans-serif' }}>{formatCLP(totalMes)}</td>
                  <td className="px-4 py-3 font-bold text-sm text-right num-celda" style={{ color: 'var(--rmg-off)' }}>{formatCLP(totalConIVA(totalMes))}</td>
                  <td className="px-4 py-3 font-bold text-sm text-right num-celda" style={{ color: 'var(--rmg-gold)' }}>{formatCLP(costoMes)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!isLoading && ventas.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <ShoppingCart size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin ventas en {mes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
