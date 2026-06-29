import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { AlertTriangle, Package, Warehouse } from 'lucide-react'

const CATS = [
  { key: '', label: 'Todos' },
  { key: 'bateria', label: 'Baterías' },
  { key: 'lubricante', label: 'Lubricantes' },
  { key: 'neumatico', label: 'Neumáticos' },
]

export default function InventarioPage() {
  const [cat, setCat] = useState('')

  const { data: stock = [], isLoading } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => api.get('/inventario/stock').then(r => r.data),
  })

  const filtered = cat ? stock.filter(p => p.categoria === cat) : stock

  const criticos = stock.filter(p => p.alerta === 'critico').length
  const bajos    = stock.filter(p => p.alerta === 'bajo').length
  const totalSkus = stock.length

  return (
    <div className="space-y-5 animate-fade-in">

      <div>
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Inventario</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Stock actual · alertas · movimientos</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rmg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} style={{ color: 'var(--rmg-blt)' }} />
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Total SKUs</span>
          </div>
          <div className="font-black text-3xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-blt)' }}>{totalSkus}</div>
        </div>
        <div className="rmg-card p-4" style={{ borderColor: criticos > 0 ? 'rgba(224,90,78,0.3)' : undefined }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} style={{ color: 'var(--rmg-red)' }} />
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Stock crítico</span>
          </div>
          <div className="font-black text-3xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-red)' }}>{criticos}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>bajo mínimo</div>
        </div>
        <div className="rmg-card p-4" style={{ borderColor: bajos > 0 ? 'rgba(244,162,60,0.3)' : undefined }}>
          <div className="flex items-center gap-2 mb-2">
            <Warehouse size={16} style={{ color: 'var(--rmg-gold)' }} />
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Stock bajo</span>
          </div>
          <div className="font-black text-3xl" style={{ fontFamily: 'Inter Tight, sans-serif', color: 'var(--rmg-gold)' }}>{bajos}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--rmg-muted)' }}>reordenar pronto</div>
        </div>
      </div>

      {/* Filtro categoría */}
      <div className="flex gap-1">
        {CATS.map(c => (
          <button key={c.key} onClick={() => setCat(c.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={cat === c.key
              ? { background: 'var(--rmg-blue)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
            }>
            {c.label}
          </button>
        ))}
      </div>

      {/* Tabla stock */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              {['Código', 'Marca / Descripción', 'Categoría', 'Stock actual', 'Mínimo', 'Estado', 'Unidad'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} /></td>
                    ))}
                  </tr>
                ))
              : filtered.map((p, i) => {
                  const pct = Math.min((p.stock_actual / (p.stock_minimo * 4)) * 100, 100)
                  const alertColor = p.alerta === 'critico' ? 'var(--rmg-red)' : p.alerta === 'bajo' ? 'var(--rmg-gold)' : 'var(--rmg-teal)'
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
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: alertColor }} />
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
    </div>
  )
}
