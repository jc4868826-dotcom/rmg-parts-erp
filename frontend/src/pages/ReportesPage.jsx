import { useQuery } from '@tanstack/react-query'
import { api } from '@utils/api'
import { formatCLP } from '@utils/format'
import { useConfigStore } from '@stores/configStore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, ReferenceLine } from 'recharts'
import { Download } from 'lucide-react'

export default function ReportesPage() {
  const cfg = useConfigStore()

  const { data: ventas } = useQuery({
    queryKey: ['reportes-ventas'],
    queryFn: () => api.get('/reportes/ventas').then(r => r.data),
  })

  const meses = ventas?.por_mes || []

  const segmentosData = [
    { segmento: 'Talleres',       actual: 5200000, meta: cfg.meta_talleres       },
    { segmento: 'Flotas',         actual: 4100000, meta: cfg.meta_flotas         },
    { segmento: 'Concesionarios', actual: 2200000, meta: cfg.meta_concesionarios },
    { segmento: 'Construcción',   actual: 900000,  meta: cfg.meta_construccion   },
  ]

  const topSkus = [
    { sku: '7000049', descripcion: 'AUSTER 5W30 4LT', unidades: 42, ingresos: 651000 },
    { sku: '210016',  descripcion: 'DOUBLE STAR 185/65 R15', unidades: 38, ingresos: 1330000 },
    { sku: '352420',  descripcion: 'YOKO 55AMP 55559', unidades: 31, ingresos: 1984000 },
    { sku: '7000003', descripcion: 'AUSTER FE 5W30 1L', unidades: 28, ingresos: 117600 },
    { sku: '244374',  descripcion: 'KUMHO 275/60 R20 AT51', unidades: 22, ingresos: 4620000 },
  ]

  const tooltipStyle = { background: '#0a1a2e', border: '1px solid rgba(56,182,255,0.2)', borderRadius: 8, color: '#fff' }

  return (
    <div className="space-y-6 animate-fade-in">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Inter Tight, sans-serif' }}>Reportes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--rmg-muted)' }}>Análisis de ventas · Junio 2026</p>
        </div>
        <button className="btn-secondary flex items-center gap-2">
          <Download size={15} /> Exportar Excel
        </button>
      </div>

      {/* Ventas por mes vs meta */}
      <div className="rmg-card p-5">
        <h2 className="font-bold mb-4">Ventas mensuales vs meta — 2026</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={meses} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="mes" tick={{ fill: 'rgba(90,143,168,0.7)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(90,143,168,0.7)', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `$${(v / 1000000).toFixed(0)}M`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [formatCLP(v), name === 'venta' ? 'Venta' : 'Meta']} />
            <Bar dataKey="meta"  fill="rgba(56,182,255,0.12)" radius={[4,4,0,0]} name="Meta" />
            <Bar dataKey="venta" fill="var(--rmg-blue)"       radius={[4,4,0,0]} name="Venta" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Segmentos */}
        <div className="rmg-card p-5">
          <h2 className="font-bold mb-4">Ventas por segmento</h2>
          <div className="space-y-4">
            {segmentosData.map(s => {
              const pct = Math.min((s.actual / s.meta) * 100, 100)
              const colors = ['var(--seg-taller)', 'var(--seg-flota)', 'var(--seg-concesionario)', 'var(--seg-construccion)']
              const color = colors[segmentosData.indexOf(s)]
              return (
                <div key={s.segmento}>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: 'var(--rmg-off)' }}>{s.segmento}</span>
                    <span className="font-semibold" style={{ color }}>{formatCLP(s.actual)}</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-xs mt-1 text-right" style={{ color: 'var(--rmg-muted)' }}>{pct.toFixed(0)}% de {formatCLP(s.meta)}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top SKUs */}
        <div className="rmg-card p-5">
          <h2 className="font-bold mb-4">Top SKUs — unidades vendidas</h2>
          <div className="space-y-2">
            {topSkus.map((s, i) => (
              <div key={s.sku} className="flex items-center gap-3 py-2" style={{ borderBottom: i < topSkus.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div className="font-black text-lg w-6 text-center" style={{ color: 'rgba(90,143,168,0.4)', fontFamily: 'Inter Tight, sans-serif' }}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--rmg-off)' }}>{s.descripcion}</div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{s.sku}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm" style={{ color: 'var(--rmg-teal)' }}>{s.unidades} u</div>
                  <div className="text-xs" style={{ color: 'var(--rmg-muted)' }}>{formatCLP(s.ingresos)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
