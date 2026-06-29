import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { Search, Package } from 'lucide-react'

const CATS = [
  { key: '', label: 'Todos' },
  { key: 'bateria', label: 'Baterías' },
  { key: 'lubricante', label: 'Lubricantes' },
  { key: 'neumatico', label: 'Neumáticos' },
]

const CAT_COLOR = {
  bateria:   { bg: 'rgba(56,182,255,0.12)',  text: 'var(--rmg-blt)',    label: 'Batería' },
  lubricante:{ bg: 'rgba(45,201,138,0.12)',  text: 'var(--rmg-teal)',   label: 'Lubricante' },
  neumatico: { bg: 'rgba(244,162,60,0.12)',  text: 'var(--rmg-gold)',   label: 'Neumático' },
  grasa:     { bg: 'rgba(123,97,196,0.12)',  text: 'var(--rmg-purple)', label: 'Grasa' },
}

export default function CatalogPage() {
  const [cat, setCat]         = useState('')
  const [search, setSearch]   = useState('')

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['productos', cat],
    queryFn: () => api.get('/productos', { params: { categoria: cat || undefined } }).then(r => r.data),
  })

  const filtered = productos.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.descripcion.toLowerCase().includes(q) || p.codigo.includes(q) || p.marca.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Catálogo de productos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>KUMHO · AUSTER · YOKO G&B · DOUBLE STAR — precios mayoristas B2B neto sin IVA</p>
        </div>
        <div className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(56,182,255,0.08)', color: 'var(--rmg-blt)', border: '1px solid rgba(56,182,255,0.2)' }}>
          {filtered.length} SKUs
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--rmg-muted)' }} />
          <input
            className="rmg-input pl-9"
            placeholder="Buscar por descripción, código o marca..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {CATS.map(c => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={cat === c.key
                ? { background: 'var(--rmg-blue)', color: '#fff' }
                : { background: 'rgba(255,255,255,0.04)', color: 'var(--rmg-muted)', border: '1px solid rgba(255,255,255,0.08)' }
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="rmg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(56,182,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Código</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Descripción</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Categoría</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>P. B2B Base</th>
              <th className="text-right px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Stock</th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--rmg-muted)' }}>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: `${60 + j * 10}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.map((p, i) => {
                  const style = CAT_COLOR[p.categoria] || CAT_COLOR.grasa
                  const stockOk = p.stock_actual > p.stock_minimo * 1.5
                  const stockBajo = p.stock_actual <= p.stock_minimo
                  return (
                    <tr
                      key={p.codigo}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--rmg-blt)' }}>{p.codigo}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: 'var(--rmg-off)' }}>{p.marca}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--rmg-muted)' }}>{p.descripcion}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: style.bg, color: style.text }}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold precio-clp" style={{ color: 'var(--rmg-off)' }}>
                        {formatCLP(p.precio_b2b_base)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold" style={{ color: stockBajo ? 'var(--rmg-red)' : stockOk ? 'var(--rmg-teal)' : 'var(--rmg-gold)' }}>
                          {p.stock_actual}
                        </span>
                        <span className="text-xs ml-1" style={{ color: 'var(--rmg-muted)' }}>/ mín {p.stock_minimo}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--rmg-muted)' }}>{p.unidad}</td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <div className="py-16 text-center" style={{ color: 'var(--rmg-muted)' }}>
            <Package size={32} className="mx-auto mb-3 opacity-30" />
            <p>No se encontraron productos para "{search}"</p>
          </div>
        )}
      </div>
    </div>
  )
}
