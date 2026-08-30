import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { Warehouse, ArrowDown, ArrowUp, RefreshCw, Plus, X, AlertTriangle, Package, Search, Download, ChevronRight, Wallet, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import ProductoSearch from '@components/ProductoSearch'
import CantidadPresentacion from '@components/CantidadPresentacion'

const TIPO_STYLES = {
  entrada: { label: 'Entrada',  color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.12)',  icon: ArrowDown },
  salida:  { label: 'Salida',   color: 'var(--rmg-red)',    bg: 'rgba(224,90,78,0.12)',   icon: ArrowUp   },
  ajuste:  { label: 'Ajuste',   color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)',  icon: RefreshCw },
}

const AJUSTE_INIT = { codigo: '', cantidad: 0, motivo: '', presentacion: '', unidades_por_pack: null, modo: 'entrada' }

// critico: no se vende hace >60 días (capital inmovilizado). bajo: se vende pero
// queda poco stock (<5 und). agotado: no queda nada. ok: rota bien, stock sano.
const ALERTAS_LABEL = {
  agotado: { label: '✕ Agotado', color: '#94243a',        bg: 'rgba(148,36,58,0.15)' },
  critico: { label: '⚠ Crítico', color: 'var(--rmg-red)',  bg: 'rgba(224,90,78,0.15)' },
  bajo:    { label: '↓ Bajo',    color: 'var(--rmg-gold)', bg: 'rgba(244,162,60,0.15)' },
  ok:      { label: '✓ OK',      color: 'var(--rmg-teal)', bg: 'rgba(45,201,138,0.15)' },
}

export default function BodegasPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('stock')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [showAjuste, setShowAjuste] = useState(false)
  const [ajuste, setAjuste] = useState(AJUSTE_INIT)
  const [search, setSearch] = useState('')
  const [catFiltro, setCatFiltro] = useState('')
  const [alertaFiltro, setAlertaFiltro] = useState('')
  const [verAgotados, setVerAgotados] = useState(false) // por defecto: bodega = lo que tengo, no el catálogo completo
  const [productoSeleccionado, setProductoSeleccionado] = useState(null)

  const { data: movimientos = [], isLoading: loadingMovs } = useQuery({
    queryKey: ['movimientos-stock', tipoFiltro],
    queryFn: () => api.get('/bodega/movimientos', { params: { tipo: tipoFiltro || undefined } }).then(r => r.data),
  })

  const { data: stock = [], isLoading: loadingStock } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => api.get('/inventario/stock').then(r => r.data),
  })

  const { data: movsProd = [] } = useQuery({
    queryKey: ['movimientos-producto', productoSeleccionado?.codigo],
    queryFn: () => api.get(`/bodega/producto/${productoSeleccionado.codigo}`).then(r => r.data.movimientos),
    enabled: !!productoSeleccionado,
  })

  const ajustarMut = useMutation({
    mutationFn: (data) => api.post('/bodega/ajuste', data).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries(['movimientos-stock'])
      qc.invalidateQueries(['inventario'])
      toast.success(`Stock ajustado — nuevo stock: ${data.stock_nuevo}`)
      setAjuste(AJUSTE_INIT)
      setShowAjuste(false)
    },
    onError: () => toast.error('Error al ajustar stock'),
  })

  // Stock real (unidades) por SKU, según el sistema — se usa para calcular la
  // diferencia cuando el ajuste es "fijar stock exacto" (conteo físico).
  const stockPorCodigo = useMemo(() => new Map(stock.map(p => [p.codigo, p.stock_actual])), [stock])
  const stockActualDelAjuste = stockPorCodigo.get(ajuste.codigo) || 0

  const handleAjuste = (e) => {
    e.preventDefault()
    if (!ajuste.codigo) { toast.error('Ingresa o busca el código del producto'); return }
    if (!ajuste.motivo) { toast.error('Describe el motivo del ajuste'); return }

    let cantidadDelta
    if (ajuste.modo === 'fijar') {
      cantidadDelta = Number(ajuste.cantidad) - stockActualDelAjuste
      if (cantidadDelta === 0) { toast.error('El stock real ingresado es igual al actual — no hay nada que ajustar'); return }
    } else {
      if (!ajuste.cantidad) { toast.error('Ingresa una cantidad'); return }
      cantidadDelta = (ajuste.modo === 'salida' ? -1 : 1) * Number(ajuste.cantidad)
    }
    ajustarMut.mutate({ codigo: ajuste.codigo, motivo: ajuste.motivo, cantidad: cantidadDelta })
  }

  const categorias = useMemo(() => [...new Set(stock.map(p => p.categoria).filter(Boolean))].sort(), [stock])

  // "Bodega" es lo que efectivamente tengo — no el catálogo completo de precios.
  const enBodega = useMemo(() => stock.filter(p => p.alerta !== 'agotado'), [stock])
  const valorTotalCosto = useMemo(() => enBodega.reduce((s, p) => s + (p.valor_costo || 0), 0), [enBodega])
  const valorTotalVenta = useMemo(() => enBodega.reduce((s, p) => s + (p.valor_venta || 0), 0), [enBodega])

  const stockFiltrado = useMemo(() => {
    // Por defecto solo se ve lo que hay físicamente (stock > 0). Los SKU agotados
    // solo aparecen si se activa "ver agotados" o si se filtra explícitamente por ese estado.
    let data = (verAgotados || alertaFiltro === 'agotado') ? stock : enBodega
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(p => p.codigo?.toLowerCase().includes(q) || p.descripcion?.toLowerCase().includes(q) || p.marca?.toLowerCase().includes(q))
    }
    if (catFiltro) data = data.filter(p => p.categoria === catFiltro)
    if (alertaFiltro) data = data.filter(p => p.alerta === alertaFiltro)
    return data
  }, [stock, enBodega, search, catFiltro, alertaFiltro, verAgotados])

  const agotados = stock.filter(p => p.alerta === 'agotado').length
  const criticos = stock.filter(p => p.alerta === 'critico').length
  const bajos    = stock.filter(p => p.alerta === 'bajo').length

  function formatHora(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const exportarExcel = () => {
    const datos = stockFiltrado.map(p => ({
      'SKU': p.codigo,
      'Marca': p.marca,
      'Descripción': p.descripcion,
      'Categoría': p.categoria,
      'Presentación': p.presentacion || '',
      'Und. por caja': p.unidades_por_pack || '',
      'Stock actual (und)': p.stock_actual,
      'Cajas completas': p.cajas_completas ?? '',
      'Unidades sueltas': p.unidades_sueltas ?? '',
      'Stock mínimo': p.stock_minimo,
      'Costo x unidad': p.precio_compra || 0,
      'Costo x caja': p.unidades_por_pack > 1 ? (p.precio_compra || 0) * p.unidades_por_pack : '',
      'Venta x unidad': p.precio_venta || 0,
      'Venta x caja': p.unidades_por_pack > 1 ? (p.precio_venta || 0) * p.unidades_por_pack : '',
      'Valor a costo (stock total)': p.valor_costo || 0,
      'Valor a venta (stock total)': p.valor_venta || 0,
      'Días sin venta': p.dias_sin_venta ?? 'Nunca vendido',
      'Estado': p.alerta === 'agotado' ? 'AGOTADO' : p.alerta === 'critico' ? 'CRÍTICO' : p.alerta === 'bajo' ? 'BAJO' : 'OK',
    }))
    const ws = XLSX.utils.json_to_sheet(datos)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
    XLSX.writeFile(wb, `inventario_rmg_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('Excel exportado')
  }

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
            Bodegas
            {criticos > 0 && (
              <span className="ml-2 text-sm font-bold px-2 py-0.5 rounded-full align-middle"
                style={{ background: 'rgba(224,90,78,0.2)', color: 'var(--rmg-red)' }}>
                {criticos} crítico{criticos > 1 ? 's' : ''}
              </span>
            )}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Inventario actual · Movimientos de stock · Ajustes</p>
        </div>
        <button onClick={() => setShowAjuste(v => !v)} className="btn-primary flex items-center gap-2">
          {showAjuste ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Ajuste manual</>}
        </button>
      </div>

      {/* Resumen compacto — un vistazo, sin tapar la lista de abajo */}
      <div className="rmg-card px-5 py-3 flex flex-wrap items-center gap-x-7 gap-y-3">
        {[
          { label: 'Productos en bodega', value: enBodega.length, color: 'var(--rmg-blt)', icon: Package, onClick: () => { setTab('stock'); setAlertaFiltro(''); setVerAgotados(false) } },
          { label: 'Agotado',       value: agotados,      color: '#94243a',        icon: AlertTriangle, onClick: () => { setTab('stock'); setAlertaFiltro('agotado') } },
          { label: 'Crítico',       value: criticos,      color: 'var(--rmg-red)', icon: AlertTriangle, onClick: () => { setTab('stock'); setAlertaFiltro('critico') } },
          { label: 'Bajo',          value: bajos,         color: 'var(--rmg-gold)', icon: Warehouse,    onClick: () => { setTab('stock'); setAlertaFiltro('bajo') } },
        ].map(k => {
          const Icon = k.icon
          return (
            <button key={k.label} type="button" onClick={k.onClick} className="flex items-center gap-2 text-left hover:opacity-75 transition-opacity">
              <Icon size={15} style={{ color: k.color }}/>
              <div>
                <div className="font-black text-lg leading-none" style={{ fontFamily: 'Inter Tight, sans-serif', color: k.color }}>{k.value}</div>
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{k.label}</div>
              </div>
            </button>
          )
        })}
        <div className="hidden md:block flex-1" />
        <div className="flex items-center gap-2">
          <Wallet size={15} style={{ color: 'var(--rmg-blt)' }}/>
          <div>
            <div className="font-black text-lg leading-none" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{formatCLP(valorTotalCosto)}</div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>valor a costo</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp size={15} style={{ color: 'var(--rmg-teal)' }}/>
          <div>
            <div className="font-black text-lg leading-none" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-teal)' }}>{formatCLP(valorTotalVenta)}</div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>valor a venta</div>
          </div>
        </div>
      </div>

      {/* Formulario ajuste */}
      {showAjuste && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Ajuste manual de stock</h2>
          <form onSubmit={handleAjuste} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Buscar producto</label>
              <ProductoSearch
                initialQuery={ajuste.codigo}
                onSelect={p => setAjuste(a => {
                  const codigo = p.codigo_sku || ''
                  const stockSku = stockPorCodigo.get(codigo) || 0
                  return {
                    ...a, codigo,
                    presentacion: p.presentacion || '', unidades_por_pack: p.unidades_por_pack || null,
                    cantidad: a.modo === 'fijar' ? stockSku : a.cantidad,
                  }
                })}
              />
              {ajuste.unidades_por_pack > 1 && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--rmg-muted)' }}>
                  Este SKU viene en cajas de {ajuste.unidades_por_pack} unidades{ajuste.presentacion ? ` (${ajuste.presentacion})` : ''}.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Código SKU *</label>
              <input className="rmg-input font-mono" placeholder="Ej: 352420" value={ajuste.codigo}
                onChange={e => setAjuste(a => ({ ...a, codigo: e.target.value }))} required/>
              {ajuste.codigo && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--rmg-muted)' }}>Stock actual en el sistema: <strong>{stockActualDelAjuste} und</strong></p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Tipo de ajuste *</label>
              <select className="rmg-input" value={ajuste.modo} onChange={e => {
                const modo = e.target.value
                setAjuste(a => ({ ...a, modo, cantidad: modo === 'fijar' ? (stockPorCodigo.get(a.codigo) || 0) : 0 }))
              }}>
                <option value="entrada">+ Entrada (suma stock)</option>
                <option value="salida">− Merma / baja (resta stock)</option>
                <option value="fijar">= Fijar stock exacto (conteo físico)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
                {ajuste.modo === 'fijar' ? 'Stock real contado *' : 'Cantidad *'}
              </label>
              <CantidadPresentacion
                unidadesPorPack={ajuste.unidades_por_pack}
                presentacion={ajuste.presentacion}
                cantidad={ajuste.cantidad}
                onChange={v => setAjuste(a => ({ ...a, cantidad: v }))}
              />
              {ajuste.modo === 'fijar' && ajuste.codigo && (
                <p className="text-[10px] mt-1 font-semibold" style={{ color: Number(ajuste.cantidad) - stockActualDelAjuste === 0 ? 'var(--rmg-muted)' : (Number(ajuste.cantidad) - stockActualDelAjuste > 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)') }}>
                  {stockActualDelAjuste} und → {Number(ajuste.cantidad) || 0} und
                  {' '}({Number(ajuste.cantidad) - stockActualDelAjuste > 0 ? '+' : ''}{Number(ajuste.cantidad) - stockActualDelAjuste} und)
                </p>
              )}
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Motivo *</label>
              <input className="rmg-input" placeholder="Ej: Merma por daño, inventario físico..." value={ajuste.motivo}
                onChange={e => setAjuste(a => ({ ...a, motivo: e.target.value }))} required/>
            </div>
            <div className="md:col-span-4 flex gap-3 justify-end pt-1">
              <button type="button" onClick={() => { setShowAjuste(false); setAjuste(AJUSTE_INIT) }} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={ajustarMut.isPending} className="btn-primary disabled:opacity-50">
                {ajustarMut.isPending ? 'Guardando...' : 'Aplicar ajuste'}
              </button>
            </div>
          </form>
          <p className="text-xs mt-3" style={{ color: 'var(--rmg-muted)' }}>
            Busca el producto para ver su presentación (si viene en cajas, ingresa cajas + sueltas). "Fijar stock exacto" es para cuando cuentas físicamente la bodega: ingresas el total real y el sistema calcula la diferencia solo — útil para corregir SKU cuyo stock quedó mal registrado antes de que la conversión caja→unidad existiera.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {[
          { k: 'stock',        l: `Stock actual (${enBodega.length})` },
          { k: 'movimientos',  l: `Movimientos (${movimientos.length})` },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className="px-4 py-2.5 text-sm font-medium transition-all border-b-2"
            style={tab === t.k
              ? { borderColor: 'var(--rmg-blue)', color: 'var(--rmg-blt)' }
              : { borderColor: 'transparent', color: 'var(--rmg-muted)' }
            }>{t.l}</button>
        ))}
      </div>

      {/* ── TAB STOCK ── */}
      {tab === 'stock' && (
        <>
          {/* Barra búsqueda + filtros + exportar */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--rmg-muted)' }}/>
              <input className="rmg-input pl-8" placeholder="Buscar SKU, producto, marca..." value={search}
                onChange={e => setSearch(e.target.value)}/>
            </div>
            <select className="rmg-input w-auto" value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="rmg-input w-auto" value={alertaFiltro} onChange={e => setAlertaFiltro(e.target.value)}>
              <option value="">Todo el stock disponible</option>
              <option value="agotado">✕ Agotado</option>
              <option value="critico">⚠ Crítico</option>
              <option value="bajo">↓ Bajo</option>
              <option value="ok">✓ OK</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs px-1 cursor-pointer select-none" style={{ color: 'var(--rmg-muted)' }}>
              <input type="checkbox" checked={verAgotados} onChange={e => setVerAgotados(e.target.checked)} />
              Incluir SKU sin stock (catálogo completo)
            </label>
            {(search || catFiltro || alertaFiltro || verAgotados) && (
              <button onClick={() => { setSearch(''); setCatFiltro(''); setAlertaFiltro(''); setVerAgotados(false) }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(15, 35, 60,0.06)', color: 'var(--rmg-muted)' }}>
                Limpiar
              </button>
            )}
            <button onClick={exportarExcel}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'rgba(45,201,138,0.12)', color: 'var(--rmg-teal)', border: '1px solid rgba(45,201,138,0.25)' }}>
              <Download size={12}/> Exportar Excel
            </button>
          </div>
          {(catFiltro || alertaFiltro || search) ? (
            <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
              Mostrando {stockFiltrado.length} de {(verAgotados || alertaFiltro === 'agotado') ? stock.length : enBodega.length} productos
            </p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--rmg-muted)' }}>
              {enBodega.length} productos con stock · {agotados} sin stock ocultos{stock.length ? ` de ${stock.length} SKU en el catálogo` : ''}
            </p>
          )}

          <div className="rmg-card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                  {[
                    ['SKU', undefined],
                    ['Producto', undefined],
                    ['Stock', 'Unidades reales en bodega (fuente única de verdad). Debajo, cómo se arma con la presentación del SKU.'],
                    ['Precio (costo / venta)', 'Precio unitario — el que usa el sistema para vender. Debajo, el equivalente por caja/pack.'],
                    ['Valorización', 'Valor total del stock actual a precio de costo y de venta'],
                    ['Últ. venta', undefined],
                    ['Estado', undefined],
                    ['', undefined],
                  ].map(([h, tip]) => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }} title={tip}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingStock
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }}/></td>
                        ))}
                      </tr>
                    ))
                  : stockFiltrado.map((p, i) => {
                      const alertInfo = ALERTAS_LABEL[p.alerta] || ALERTAS_LABEL.ok
                      const pct = Math.min((p.stock_actual / (p.stock_minimo * 4)) * 100, 100)
                      const isSelected = productoSeleccionado?.codigo === p.codigo
                      return (
                        <tr key={p.codigo}
                          onClick={() => setProductoSeleccionado(isSelected ? null : p)}
                          style={{
                            borderBottom: '1px solid rgba(15, 35, 60,0.04)',
                            background: isSelected ? 'rgba(56,182,255,0.06)' : (p.alerta === 'critico' || p.alerta === 'agotado') ? 'rgba(224,90,78,0.03)' : i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)',
                            cursor: 'pointer',
                          }}
                          className="hover:bg-black/[0.02] transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap" style={{ color: 'var(--rmg-blt)' }}>{p.codigo}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-xs" style={{ color: 'var(--rmg-off)' }}>{p.marca}</div>
                            <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: 'var(--rmg-muted)' }}>{p.descripcion}</div>
                            <div className="text-[10px] mt-0.5 capitalize" style={{ color: 'var(--rmg-muted)' }}>{p.categoria}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(15, 35, 60,0.06)', minWidth: 60 }}>
                                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: alertInfo.color }}/>
                              </div>
                              <span className="font-bold whitespace-nowrap" style={{ color: alertInfo.color }}>{p.stock_actual} und</span>
                            </div>
                            <div className="text-[10px] mt-0.5 whitespace-nowrap" style={{ color: 'var(--rmg-muted)' }}>
                              {p.unidades_por_pack > 1
                                ? `= ${p.cajas_completas} caja(s) de ${p.unidades_por_pack}${p.unidades_sueltas > 0 ? ` + ${p.unidades_sueltas} suelta(s)` : ''}`
                                : `mín. ${p.stock_minimo}`}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <div style={{ color: 'var(--rmg-blt)' }}>
                              costo {formatCLP(p.precio_compra || 0)}
                              {p.unidades_por_pack > 1 && <span style={{ color: 'var(--rmg-muted)' }}> ({formatCLP((p.precio_compra || 0) * p.unidades_por_pack)}/caja)</span>}
                            </div>
                            <div style={{ color: 'var(--rmg-teal)' }}>
                              venta {formatCLP(p.precio_venta || 0)}
                              {p.unidades_por_pack > 1 && <span style={{ color: 'var(--rmg-muted)' }}> ({formatCLP((p.precio_venta || 0) * p.unidades_por_pack)}/caja)</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            <div style={{ color: 'var(--rmg-blt)' }}>costo {formatCLP(p.valor_costo || 0)}</div>
                            <div style={{ color: 'var(--rmg-teal)' }}>venta {formatCLP(p.valor_venta || 0)}</div>
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: p.dias_sin_venta === null ? 'var(--rmg-muted)' : p.dias_sin_venta > 60 ? 'var(--rmg-red)' : 'var(--rmg-off)' }}>
                            {p.dias_sin_venta === null ? 'nunca' : `hace ${p.dias_sin_venta} d.`}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={{ background: alertInfo.bg, color: alertInfo.color }}>
                              {alertInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <ChevronRight size={14} style={{ color: isSelected ? 'var(--rmg-blue)' : 'var(--rmg-muted)', transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}/>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
            </div>
            {!loadingStock && stockFiltrado.length === 0 && (
              <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
                <Package size={28} className="mx-auto mb-2 opacity-20"/>
                <p className="text-sm">Sin productos con esos filtros</p>
              </div>
            )}
          </div>

          {/* Panel lateral: movimientos del producto seleccionado */}
          {productoSeleccionado && (
            <div className="rmg-card p-5 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold">Movimientos — <span style={{ color: 'var(--rmg-blt)' }}>{productoSeleccionado.codigo}</span></h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{productoSeleccionado.marca} · {productoSeleccionado.descripcion}</p>
                </div>
                <button onClick={() => setProductoSeleccionado(null)} style={{ color: 'var(--rmg-muted)' }}><X size={16}/></button>
              </div>

              {movsProd.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--rmg-muted)' }}>Sin movimientos registrados para este SKU.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)' }}>
                      {['Fecha','Tipo','Cantidad','Stock ant.','Stock nuevo','Motivo/Referencia'].map(h => (
                        <th key={h} className="text-left px-3 py-2 uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movsProd.slice(0, 30).map((m, i) => {
                      const ts = TIPO_STYLES[m.tipo] || TIPO_STYLES.ajuste
                      const TIcon = ts.icon
                      return (
                        <tr key={m.id || i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                          <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{formatHora(m.created_at)}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: ts.bg, color: ts.color }}>
                              <TIcon size={10}/>{ts.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-bold text-center" style={{ color: m.cantidad > 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                            {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                          </td>
                          <td className="px-3 py-2 text-center" style={{ color: 'var(--rmg-muted)' }}>{m.stock_anterior}</td>
                          <td className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--rmg-off)' }}>{m.stock_nuevo}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--rmg-muted)' }}>{m.motivo}{m.referencia ? ` · ${m.referencia}` : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ── TAB MOVIMIENTOS ── */}
      {tab === 'movimientos' && (
        <>
          <div className="flex gap-1">
            {[{ k: '', l: 'Todos' }, { k: 'entrada', l: 'Entradas' }, { k: 'salida', l: 'Salidas' }, { k: 'ajuste', l: 'Ajustes' }].map(f => (
              <button key={f.k} onClick={() => setTipoFiltro(f.k)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={tipoFiltro === f.k
                  ? { background: 'var(--rmg-blue)', color: '#fff' }
                  : { background: 'rgba(15, 35, 60,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(15, 35, 60,0.08)' }
                }>{f.l}</button>
            ))}
          </div>

          <div className="rmg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(15, 35, 60,0.02)' }}>
                  {['Fecha','Tipo','Código','Descripción','Cantidad','Stock ant.','Stock nuevo','Motivo'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingMovs
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)' }}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(15, 35, 60,0.06)' }}/></td>
                        ))}
                      </tr>
                    ))
                  : movimientos.map((m, i) => {
                      const ts = TIPO_STYLES[m.tipo] || TIPO_STYLES.ajuste
                      const TIcon = ts.icon
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(15, 35, 60,0.04)', background: i % 2 ? 'transparent' : 'rgba(15, 35, 60,0.01)' }}>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatHora(m.created_at)}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 w-fit text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: ts.bg, color: ts.color }}>
                              <TIcon size={11}/>{ts.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{m.codigo}</td>
                          <td className="px-4 py-3 text-xs max-w-xs truncate" style={{ color: 'var(--rmg-off)' }}>{m.descripcion}</td>
                          <td className="px-4 py-3 font-bold text-center"
                            style={{ color: m.cantidad > 0 ? 'var(--rmg-teal)' : 'var(--rmg-red)' }}>
                            {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                          </td>
                          <td className="px-4 py-3 text-xs text-center" style={{ color: 'var(--rmg-muted)' }}>{m.stock_anterior}</td>
                          <td className="px-4 py-3 text-xs text-center font-semibold" style={{ color: 'var(--rmg-off)' }}>{m.stock_nuevo}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{m.motivo}{m.referencia ? ` · ${m.referencia}` : ''}</td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
            {!loadingMovs && movimientos.length === 0 && (
              <div className="py-12 text-center" style={{ color: 'var(--rmg-muted)' }}>
                <RefreshCw size={28} className="mx-auto mb-2 opacity-20"/>
                <p className="text-sm">Sin movimientos de stock</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
