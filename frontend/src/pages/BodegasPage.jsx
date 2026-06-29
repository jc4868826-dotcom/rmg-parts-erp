import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { Warehouse, ArrowDown, ArrowUp, RefreshCw, Plus, X, AlertTriangle, Package } from 'lucide-react'
import toast from 'react-hot-toast'

const TIPO_STYLES = {
  entrada: { label: 'Entrada',  color: 'var(--rmg-teal)',   bg: 'rgba(45,201,138,0.12)',  icon: ArrowDown },
  salida:  { label: 'Salida',   color: 'var(--rmg-red)',    bg: 'rgba(224,90,78,0.12)',   icon: ArrowUp   },
  ajuste:  { label: 'Ajuste',   color: 'var(--rmg-gold)',   bg: 'rgba(244,162,60,0.12)',  icon: RefreshCw },
}

const AJUSTE_INIT = { codigo: '', cantidad: '', motivo: '' }

export default function BodegasPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('movimientos')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [showAjuste, setShowAjuste] = useState(false)
  const [ajuste, setAjuste] = useState(AJUSTE_INIT)

  const { data: movimientos = [], isLoading: loadingMovs } = useQuery({
    queryKey: ['movimientos-stock', tipoFiltro],
    queryFn: () => api.get('/bodega/movimientos', { params: { tipo: tipoFiltro || undefined } }).then(r => r.data),
  })

  const { data: stock = [], isLoading: loadingStock } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => api.get('/inventario/stock').then(r => r.data),
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

  const handleAjuste = (e) => {
    e.preventDefault()
    if (!ajuste.codigo) { toast.error('Ingresa el código del producto'); return }
    if (!ajuste.cantidad || ajuste.cantidad === '0') { toast.error('Ingresa una cantidad (positiva o negativa)'); return }
    if (!ajuste.motivo) { toast.error('Describe el motivo del ajuste'); return }
    ajustarMut.mutate({ ...ajuste, cantidad: Number(ajuste.cantidad) })
  }

  const criticos = stock.filter(p => p.alerta === 'critico').length
  const bajos    = stock.filter(p => p.alerta === 'bajo').length
  const entradas = movimientos.filter(m => m.tipo === 'entrada').length
  const salidas  = movimientos.filter(m => m.tipo === 'salida').length

  function formatHora(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Bodegas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Movimientos de stock · Ajustes · Alertas de inventario</p>
        </div>
        <button onClick={() => setShowAjuste(v => !v)} className="btn-primary flex items-center gap-2">
          {showAjuste ? <><X size={15}/> Cerrar</> : <><Plus size={15}/> Ajuste manual</>}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Stock crítico', value: criticos, color: 'var(--rmg-red)',    icon: AlertTriangle, sub: 'bajo mínimo' },
          { label: 'Stock bajo',    value: bajos,    color: 'var(--rmg-gold)',   icon: Warehouse,     sub: 'reordenar pronto' },
          { label: 'Entradas',      value: entradas, color: 'var(--rmg-teal)',   icon: ArrowDown,     sub: 'movimientos entrada' },
          { label: 'Salidas',       value: salidas,  color: 'var(--rmg-blt)',    icon: ArrowUp,       sub: 'movimientos salida' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="rmg-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{k.label}</div>
                <div className="p-1.5 rounded-lg" style={{ background: `${k.color}15` }}>
                  <Icon size={14} style={{ color: k.color }}/>
                </div>
              </div>
              <div className="font-black text-3xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: k.color }}>{k.value}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>{k.sub}</div>
            </div>
          )
        })}
      </div>

      {/* Formulario ajuste */}
      {showAjuste && (
        <div className="rmg-card p-5 animate-fade-in">
          <h2 className="font-bold mb-4">Ajuste manual de stock</h2>
          <form onSubmit={handleAjuste} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Código SKU *</label>
              <input className="rmg-input" placeholder="Ej: 352420" value={ajuste.codigo}
                onChange={e => setAjuste(a => ({ ...a, codigo: e.target.value }))} required/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>Cantidad *</label>
              <input type="number" className="rmg-input" placeholder="+10 entrada, -5 merma" value={ajuste.cantidad}
                onChange={e => setAjuste(a => ({ ...a, cantidad: e.target.value }))} required/>
            </div>
            <div className="md:col-span-2">
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
            Usa cantidad positiva para entradas y negativa para mermas/bajas.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(56,182,255,0.1)' }}>
        {[{ k: 'movimientos', l: `Movimientos (${movimientos.length})` }, { k: 'stock', l: 'Stock actual' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className="px-4 py-2.5 text-sm font-medium transition-all border-b-2"
            style={tab === t.k
              ? { borderColor: 'var(--rmg-blue)', color: 'var(--rmg-blt)' }
              : { borderColor: 'transparent', color: 'var(--rmg-muted)' }
            }>{t.l}</button>
        ))}
      </div>

      {tab === 'movimientos' && (
        <>
          {/* Filtro tipo */}
          <div className="flex gap-1">
            {[{ k: '', l: 'Todos' }, { k: 'entrada', l: 'Entradas' }, { k: 'salida', l: 'Salidas' }, { k: 'ajuste', l: 'Ajustes' }].map(f => (
              <button key={f.k} onClick={() => setTipoFiltro(f.k)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={tipoFiltro === f.k
                  ? { background: 'var(--rmg-blue)', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
                }>{f.l}</button>
            ))}
          </div>

          <div className="rmg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  {['Fecha','Tipo','Código','Descripción','Cantidad','Stock ant.','Stock nuevo','Motivo'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingMovs
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                        ))}
                      </tr>
                    ))
                  : movimientos.map((m, i) => {
                      const ts = TIPO_STYLES[m.tipo] || TIPO_STYLES.ajuste
                      const TIcon = ts.icon
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
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
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{m.motivo}</td>
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

      {tab === 'stock' && (
        <div className="rmg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                {['Código','Marca / Descripción','Cat.','Stock','Mínimo','Estado','Unidad'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingStock
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }}/></td>
                      ))}
                    </tr>
                  ))
                : stock.map((p, i) => {
                    const alertColor = p.alerta === 'critico' ? 'var(--rmg-red)' : p.alerta === 'bajo' ? 'var(--rmg-gold)' : 'var(--rmg-teal)'
                    const pct = Math.min((p.stock_actual / (p.stock_minimo * 4)) * 100, 100)
                    return (
                      <tr key={p.codigo} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: p.alerta === 'critico' ? 'rgba(224,90,78,0.03)' : i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                        className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--rmg-blt)' }}>{p.codigo}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs" style={{ color: 'var(--rmg-off)' }}>{p.marca}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{p.descripcion}</div>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize" style={{ color: 'var(--rmg-muted)' }}>{p.categoria}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', minWidth: 60 }}>
                              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: alertColor }}/>
                            </div>
                            <span className="font-bold w-10 text-right" style={{ color: alertColor }}>{p.stock_actual}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-center" style={{ color: 'var(--rmg-muted)' }}>{p.stock_minimo}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                            background: p.alerta === 'critico' ? 'rgba(224,90,78,0.15)' : p.alerta === 'bajo' ? 'rgba(244,162,60,0.15)' : 'rgba(45,201,138,0.15)',
                            color: alertColor,
                          }}>
                            {p.alerta === 'critico' ? '⚠ Crítico' : p.alerta === 'bajo' ? '↓ Bajo' : '✓ OK'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{p.unidad}</td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
