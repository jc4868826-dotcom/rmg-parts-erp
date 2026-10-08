import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { Tag, X, Package, Download, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

const CAMPOS_VACIOS = {
  codigo_sku: '', descripcion: '', marca: '', proveedor: '', categoria: '',
  segmento_negocio: '', presentacion: '', unidades_por_pack: '1',
  costo_unidad_neto: '', precio_venta_neto: '', stock_actual: '0', stock_minimo: '5',
}

// Modal "Nuevo producto" — pedido de JC 2026-10-08: no había forma de agregar
// un SKU suelto a la lista de precios (solo existía /import, que reemplaza
// TODA la tabla desde un Excel). Este modal crea una sola fila.
function NuevoProductoModal({ onClose, onCreated }) {
  const [form, setForm] = useState(CAMPOS_VACIOS)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const crearMut = useMutation({
    mutationFn: () => api.post('/lista-precios', {
      ...form,
      unidades_por_pack: Number(form.unidades_por_pack) || 1,
      costo_unidad_neto: Number(form.costo_unidad_neto) || 0,
      precio_venta_neto: Number(form.precio_venta_neto) || 0,
      stock_actual: Number(form.stock_actual) || 0,
      stock_minimo: Number(form.stock_minimo) || 5,
    }).then(r => r.data),
    onSuccess: (data) => {
      toast.success(`Producto ${data.codigo_sku} creado`)
      onCreated()
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear el producto'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,35,60,0.5)' }}>
      <div className="rmg-card w-full max-w-lg p-5 space-y-4" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nuevo producto</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5" style={{ color: 'var(--rmg-muted)' }}><X size={18}/></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); crearMut.mutate() }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Código SKU *</label>
              <input required className="rmg-input mt-1" value={form.codigo_sku} onChange={set('codigo_sku')} placeholder="Ej: 7000123" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Descripción *</label>
              <input required className="rmg-input mt-1" value={form.descripcion} onChange={set('descripcion')} placeholder="Ej: AUSTER MAXTECH PRO 5W30 1 LT" />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Marca</label>
              <input className="rmg-input mt-1" value={form.marca} onChange={set('marca')} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Proveedor</label>
              <input className="rmg-input mt-1" value={form.proveedor} onChange={set('proveedor')} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Categoría</label>
              <input className="rmg-input mt-1" value={form.categoria} onChange={set('categoria')} placeholder="lubricantes / baterias / neumaticos" />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Segmento</label>
              <input className="rmg-input mt-1" value={form.segmento_negocio} onChange={set('segmento_negocio')} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Presentación</label>
              <input className="rmg-input mt-1" value={form.presentacion} onChange={set('presentacion')} placeholder="Caja 4x5L" />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Unidades por pack</label>
              <input type="number" min="1" step="1" className="rmg-input mt-1" value={form.unidades_por_pack} onChange={set('unidades_por_pack')} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Costo neto por unidad *</label>
              <input required type="number" min="0" className="rmg-input mt-1" value={form.costo_unidad_neto} onChange={set('costo_unidad_neto')} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Precio venta neto *</label>
              <input required type="number" min="0" className="rmg-input mt-1" value={form.precio_venta_neto} onChange={set('precio_venta_neto')} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Stock actual</label>
              <input type="number" min="0" step="1" className="rmg-input mt-1" value={form.stock_actual} onChange={set('stock_actual')} />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--rmg-muted)' }}>Stock mínimo</label>
              <input type="number" min="0" step="1" className="rmg-input mt-1" value={form.stock_minimo} onChange={set('stock_minimo')} />
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>* Precios netos, sin IVA — igual que el resto de la lista.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={crearMut.isPending} className="btn-primary text-sm disabled:opacity-50">
              {crearMut.isPending ? 'Creando...' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatCLP(v) {
  if (v == null) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v)
}

function formatPct(v) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

export default function ListaPreciosPage() {
  const qc = useQueryClient()
  const [showNuevo, setShowNuevo] = useState(false)
  const [tab, setTab] = useState('lista')
  const [busqueda, setBusqueda] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroSegmento, setFiltroSegmento] = useState('')
  const [busquedaUnicos, setBusquedaUnicos] = useState('')

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['lista-precios'],
    queryFn: () => api.get('/lista-precios').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const proveedores = useMemo(() => [...new Set(filas.map(f => f.proveedor).filter(Boolean))].sort(), [filas])
  const categorias  = useMemo(() => [...new Set(filas.map(f => f.categoria).filter(Boolean))].sort(), [filas])
  const segmentos   = useMemo(() => [...new Set(filas.map(f => f.segmento_negocio).filter(Boolean))].sort(), [filas])

  const resultados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return filas.filter(f => {
      if (filtroProveedor && f.proveedor !== filtroProveedor) return false
      if (filtroCategoria && f.categoria !== filtroCategoria) return false
      if (filtroSegmento  && f.segmento_negocio !== filtroSegmento) return false
      if (!q) return true
      return (
        (f.descripcion      || '').toLowerCase().includes(q) ||
        (f.codigo_sku       || '').toLowerCase().includes(q) ||
        (f.producto_generico|| '').toLowerCase().includes(q) ||
        (f.marca            || '').toLowerCase().includes(q)
      )
    })
  }, [filas, busqueda, filtroProveedor, filtroCategoria, filtroSegmento])

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroProveedor('')
    setFiltroCategoria('')
    setFiltroSegmento('')
  }

  const hayFiltros = busqueda || filtroProveedor || filtroCategoria || filtroSegmento

  async function descargarExcel() {
    const token = localStorage.getItem('rmg_token')
    const res = await fetch(api.defaults.baseURL + '/lista-precios/descargar-excel', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Lista_Precios_RMG_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Artículos únicos: un registro por SKU, precio más bajo
  const articulosUnicos = useMemo(() => {
    const map = {}
    for (const f of filas) {
      if (!map[f.codigo_sku] || f.precio_venta_neto < map[f.codigo_sku].precio_venta_neto) {
        map[f.codigo_sku] = f
      }
    }
    const arr = Object.values(map)
    if (!busquedaUnicos) return arr
    const q = busquedaUnicos.toLowerCase()
    return arr.filter(f =>
      (f.descripcion || '').toLowerCase().includes(q) ||
      (f.codigo_sku || '').toLowerCase().includes(q) ||
      (f.producto_generico || '').toLowerCase().includes(q) ||
      (f.marca || '').toLowerCase().includes(q)
    )
  }, [filas, busquedaUnicos])

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Lista de Precios</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Precios RMG por producto · {filas.length} registros totales</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNuevo(true)} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus size={14}/> Nuevo producto
          </button>
          <button onClick={descargarExcel} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Download size={14}/> Descargar Excel
          </button>
          <Tag size={18} style={{ color: 'var(--rmg-blue)' }}/>
        </div>
      </div>

      {showNuevo && (
        <NuevoProductoModal
          onClose={() => setShowNuevo(false)}
          onCreated={() => { setShowNuevo(false); qc.invalidateQueries({ queryKey: ['lista-precios'] }) }}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {[
          { k: 'lista',   l: 'Lista completa', Icon: Tag     },
          { k: 'unicos',  l: 'Artículos únicos', Icon: Package },
        ].map(({ k, l, Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2"
            style={tab === k
              ? { borderColor: 'var(--rmg-blue)', color: 'var(--rmg-blt)' }
              : { borderColor: 'transparent', color: 'var(--rmg-muted)' }
            }>
            <Icon size={14}/>{l}
            {k === 'lista'  && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blt)' }}>{filas.length}</span>}
            {k === 'unicos' && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(45,201,138,0.1)', color: 'var(--rmg-teal)' }}>{articulosUnicos.length}</span>}
          </button>
        ))}
      </div>

      {/* TAB: Lista completa */}
      {tab === 'lista' && (<>

      {/* Filtros */}
      <div className="rmg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="rmg-input md:col-span-1"
            placeholder="Buscar descripción, SKU, producto, marca..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          <select className="rmg-input" value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="rmg-input" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="rmg-input" value={filtroSegmento} onChange={e => setFiltroSegmento(e.target.value)}>
            <option value="">Todos los segmentos</option>
            {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
            {resultados.length} resultado{resultados.length !== 1 ? 's' : ''} visibles
          </span>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="btn-secondary flex items-center gap-1.5 text-xs py-1">
              <X size={12}/> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                {[
                  'SKU', 'Proveedor', 'Categoría', 'Producto Genérico', 'Descripción',
                  'Presentación', 'Tipo Envase', 'Costo Neto',
                  'Precio Venta Neto RMG', 'Segmento', 'Margen %'
                ].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }}/>
                        </td>
                      ))}
                    </tr>
                  ))
                : resultados.map((f, i) => (
                    <tr key={f.id}
                      style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap" style={{ color: 'var(--rmg-blt)' }}>{f.codigo_sku}</td>
                      <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--rmg-off)' }}>{f.proveedor}</td>
                      <td className="px-4 py-3 text-xs capitalize" style={{ color: 'var(--rmg-muted)' }}>{f.categoria}</td>
                      <td className="px-4 py-3 text-xs max-w-[140px] truncate" style={{ color: 'var(--rmg-off)' }}>{f.producto_generico}</td>
                      <td className="px-4 py-3 text-xs max-w-[220px] truncate" style={{ color: 'var(--rmg-off)' }} title={f.descripcion}>{f.descripcion}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{f.presentacion}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{f.tipo_envase}</td>
                      <td className="px-4 py-3 text-xs text-right whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(f.costo_unidad_neto)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-black text-sm" style={{ color: 'var(--rmg-teal)', fontFamily: 'Inter Tight, sans-serif' }}>
                          {formatCLP(f.precio_venta_neto)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: 'rgba(56,182,255,0.1)', color: 'var(--rmg-blue)' }}>
                          {f.segmento_negocio}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-right font-semibold whitespace-nowrap"
                        style={{ color: f.margen_pct >= 0.2 ? 'var(--rmg-teal)' : f.margen_pct >= 0.1 ? 'var(--rmg-gold)' : 'var(--rmg-red)' }}>
                        {formatPct(f.margen_pct)}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
          {!isLoading && resultados.length === 0 && (
            <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
              <Tag size={28} className="mx-auto mb-2 opacity-20"/>
              <p className="text-sm">Sin resultados para los filtros aplicados</p>
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* TAB: Artículos únicos */}
      {tab === 'unicos' && (<>
      <div className="rmg-card p-4">
        <input
          className="rmg-input"
          placeholder="Buscar SKU, descripción, producto, marca..."
          value={busquedaUnicos}
          onChange={e => setBusquedaUnicos(e.target.value)}
        />
        <div className="mt-2 text-xs" style={{ color: 'var(--rmg-muted)' }}>
          {articulosUnicos.length} artículos únicos (un registro por SKU · precio más bajo entre segmentos)
        </div>
      </div>
      <div className="rmg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                {['SKU', 'Proveedor', 'Categoría', 'Producto Genérico', 'Descripción', 'Presentación', 'Costo Neto', 'Precio Venta Neto', 'Margen %'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }}/></td>
                      ))}
                    </tr>
                  ))
                : articulosUnicos.map((f, i) => (
                    <tr key={f.codigo_sku}
                      style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap" style={{ color: 'var(--rmg-blt)' }}>{f.codigo_sku}</td>
                      <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--rmg-off)' }}>{f.proveedor}</td>
                      <td className="px-4 py-3 text-xs capitalize" style={{ color: 'var(--rmg-muted)' }}>{f.categoria}</td>
                      <td className="px-4 py-3 text-xs max-w-[140px] truncate" style={{ color: 'var(--rmg-off)' }}>{f.producto_generico}</td>
                      <td className="px-4 py-3 text-xs max-w-[220px] truncate" style={{ color: 'var(--rmg-off)' }} title={f.descripcion}>{f.descripcion}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{f.presentacion}</td>
                      <td className="px-4 py-3 text-xs text-right whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(f.costo_unidad_neto)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-black text-sm" style={{ color: 'var(--rmg-teal)', fontFamily: 'Inter Tight, sans-serif' }}>
                          {formatCLP(f.precio_venta_neto)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-right font-semibold whitespace-nowrap"
                        style={{ color: f.margen_pct >= 0.2 ? 'var(--rmg-teal)' : f.margen_pct >= 0.1 ? 'var(--rmg-gold)' : 'var(--rmg-red)' }}>
                        {formatPct(f.margen_pct)}
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
          {!isLoading && articulosUnicos.length === 0 && (
            <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
              <Package size={28} className="mx-auto mb-2 opacity-20"/>
              <p className="text-sm">Sin resultados</p>
            </div>
          )}
        </div>
      </div>
      </>)}

    </div>
  )
}
