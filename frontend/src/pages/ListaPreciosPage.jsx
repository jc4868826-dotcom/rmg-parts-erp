import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { Tag, X, Package, Download } from 'lucide-react'

function formatCLP(v) {
  if (v == null) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v)
}

function formatPct(v) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

export default function ListaPreciosPage() {
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
          <button onClick={descargarExcel} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Download size={14}/> Descargar Excel
          </button>
          <Tag size={18} style={{ color: 'var(--rmg-blue)' }}/>
        </div>
      </div>

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
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
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
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/>
                        </td>
                      ))}
                    </tr>
                  ))
                : resultados.map((f, i) => (
                    <tr key={f.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
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
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                {['SKU', 'Proveedor', 'Categoría', 'Producto Genérico', 'Descripción', 'Presentación', 'Costo Neto', 'Precio Venta Neto', 'Margen %'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                      ))}
                    </tr>
                  ))
                : articulosUnicos.map((f, i) => (
                    <tr key={f.codigo_sku}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
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
